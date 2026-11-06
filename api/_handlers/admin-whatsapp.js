import { requireAdmin } from "../_lib/auth.js";
import { db, ensureSchema } from "../_lib/db.js";
import { graphRequest, sendTemplate, sendText, whatsappConfigured } from "../_lib/whatsapp.js";

const cleanPhone = value => String(value || "").replace(/\D/g, "");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = requireAdmin(req, res);
  if (!session) return;

  let body = {};
  if (req.method === "POST") {
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
    catch { return res.status(400).json({ error: "Invalid JSON body." }); }
  }

  try {
    const sql = db();
    await ensureSchema(sql);
    if (req.method === "GET") {
      const [contacts, messages] = await Promise.all([
        sql`SELECT c.id,c.phone,c.name,c.lead_status,c.opted_in,c.last_message_at,c.created_at,
          (SELECT m.body FROM whatsapp_messages m WHERE m.contact_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
          FROM whatsapp_contacts c ORDER BY COALESCE(c.last_message_at,c.created_at) DESC LIMIT 200`,
        sql`SELECT m.id,m.contact_id,m.direction,m.message_type,m.body,m.status,m.created_at,c.phone,c.name
          FROM whatsapp_messages m LEFT JOIN whatsapp_contacts c ON c.id=m.contact_id
          ORDER BY m.created_at DESC LIMIT 100`,
      ]);
      let templates = [];
      let templateError = null;
      if (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
        try {
          const data = await graphRequest(`${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status,language,category&limit=100`);
          templates = (data.data || []).filter(x => x.status === "APPROVED");
        } catch (error) { templateError = error.message; }
      }
      return res.status(200).json({
        configured: whatsappConfigured(),
        phoneNumberConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
        contacts, messages, templates, templateError,
      });
    }

    const action = String(body.action || "");
    if (action === "update_contact") {
      const id = Number(body.id);
      const status = String(body.leadStatus || "");
      if (!Number.isSafeInteger(id) || id < 1 || !["new","contacted","qualified","converted","lost"].includes(status)) {
        return res.status(400).json({ error: "Invalid lead update." });
      }
      const optedIn = body.optedIn === true;
      const rows = await sql`UPDATE whatsapp_contacts SET lead_status=${status},opted_in=${optedIn},updated_at=NOW()
        WHERE id=${id} RETURNING id,lead_status,opted_in`;
      if (!rows.length) return res.status(404).json({ error: "Lead not found." });
      await sql`INSERT INTO admin_audit (action,actor,entity_type,entity_id)
        VALUES ('whatsapp.lead.updated',${session.email},'whatsapp_contact',${id})`;
      return res.status(200).json({ ok: true, contact: rows[0] });
    }

    if (action === "send_text") {
      const id = Number(body.contactId);
      const rows = await sql`SELECT id,phone FROM whatsapp_contacts WHERE id=${id} LIMIT 1`;
      if (!rows.length) return res.status(404).json({ error: "Contact not found." });
      const text = String(body.text || "").trim().slice(0, 4096);
      if (!text) return res.status(400).json({ error: "Message is required." });
      const result = await sendText(rows[0].phone, text);
      const wamid = result.messages?.[0]?.id || null;
      await sql`INSERT INTO whatsapp_messages (contact_id,wamid,direction,message_type,body,status)
        VALUES (${id},${wamid},'outbound','text',${text},'sent') ON CONFLICT (wamid) DO NOTHING`;
      return res.status(200).json({ ok: true, wamid });
    }

    if (action === "campaign") {
      const templateName = String(body.templateName || "").trim();
      const language = String(body.language || "en").trim();
      const ids = [...new Set((Array.isArray(body.contactIds) ? body.contactIds : []).map(Number).filter(x => Number.isSafeInteger(x) && x > 0))].slice(0, 100);
      if (!templateName || !ids.length) return res.status(400).json({ error: "Select an approved template and opted-in recipients." });
      const approved = await graphRequest(`${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status,language&limit=100`);
      const match = (approved.data || []).find(x => x.name === templateName && x.status === "APPROVED" && x.language === language);
      if (!match) return res.status(400).json({ error: "Only Meta-approved templates can be used for campaigns." });
      const recipients = await sql`SELECT id,phone FROM whatsapp_contacts WHERE id = ANY(${ids}) AND opted_in=TRUE`;
      if (!recipients.length) return res.status(400).json({ error: "No selected contacts have WhatsApp marketing opt-in." });
      const campaignRows = await sql`INSERT INTO whatsapp_campaigns (name,template_name,language,status,recipient_count,created_by)
        VALUES (${String(body.name || templateName).slice(0,120)},${templateName},${language},'sending',${recipients.length},${session.email}) RETURNING id`;
      const campaignId = campaignRows[0].id;
      let sent = 0, failed = 0;
      for (const contact of recipients) {
        try {
          const result = await sendTemplate(contact.phone, templateName, language, Array.isArray(body.components) ? body.components : []);
          const wamid = result.messages?.[0]?.id || null;
          await sql`INSERT INTO whatsapp_campaign_recipients (campaign_id,contact_id,phone,status,wamid)
            VALUES (${campaignId},${contact.id},${contact.phone},'sent',${wamid})`;
          await sql`INSERT INTO whatsapp_messages (contact_id,wamid,direction,message_type,body,status)
            VALUES (${contact.id},${wamid},'outbound','template',${templateName},'sent') ON CONFLICT (wamid) DO NOTHING`;
          sent++;
        } catch (error) {
          await sql`INSERT INTO whatsapp_campaign_recipients (campaign_id,contact_id,phone,status,error)
            VALUES (${campaignId},${contact.id},${contact.phone},'failed',${String(error.message).slice(0,500)})`;
          failed++;
        }
      }
      await sql`UPDATE whatsapp_campaigns SET status='completed',sent_count=${sent},failed_count=${failed} WHERE id=${campaignId}`;
      await sql`INSERT INTO admin_audit (action,actor,entity_type,entity_id)
        VALUES ('whatsapp.campaign.sent',${session.email},'whatsapp_campaign',${campaignId})`;
      return res.status(200).json({ ok: true, campaignId, sent, failed, skipped: ids.length - recipients.length });
    }

    return res.status(400).json({ error: "Unknown WhatsApp action." });
  } catch (error) {
    console.error("Admin WhatsApp request failed:", error.message);
    return res.status(503).json({ error: error.message || "WhatsApp service is temporarily unavailable." });
  }
}
