import { createHmac, timingSafeEqual } from "node:crypto";
import { db, ensureSchema } from "../_lib/db.js";
import { sendText } from "../_lib/whatsapp.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validSignature(raw, signature) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(raw).digest("hex"));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function getSmartReply(message, profileName) {
  const text = String(message || "").toLowerCase().trim();
  const name = profileName ? ` ${String(profileName).trim().split(/\\s+/)[0]}` : "";
  const menu = `Welcome to AI SOFT STUDIO${name}! 👋

We build digital products for businesses.

Reply with a keyword:
1. PRICING – service price list
2. WEBSITE – business website
3. ECOMMERCE – online store
4. APP – Android app
5. ADMIN – admin panel / web app
6. AUTOMATION – WhatsApp / Instagram automation
7. SUPPORT – talk to our team

You can also describe your project in your own words.`;

  if (/^(hi|hello|hey|hii|namaste|नमस्ते|start|menu)\\b/.test(text) || /\\b(menu|services|service list)\\b/.test(text)) {
    return menu;
  }
  if (/\\b(price|pricing|cost|rate|charges|budget|quotation|quote|price list)\\b/.test(text) || /कितना|कीमत|प्राइस/.test(text)) {
    return `AI SOFT STUDIO – Starting prices (INR):

• 5-Page Business Website: ₹9,999
• Premium Website: ₹30,999
• Finance Website: ₹35,999
• Gaming Website: ₹50,000
• Admin Panel: ₹99,999
• E-commerce Website: ₹99,999
• Android App: ₹79,999
• Business Web App: ₹90,000
• WhatsApp Automation SaaS: ₹25,000
• Instagram Automation SaaS: ₹20,999

Final quote depends on features and requirements. Reply with the service name and your requirements for a tailored quotation.`;
  }
  if (/\\b(ecommerce|e-commerce|online store|shopping website|store)\\b/.test(text)) {
    return `Our E-commerce Website development starts at ₹99,999.

Includes a tailored online store experience. Final scope can include product catalogue, cart, checkout, order management and admin tools.

Please share your product type, approximate number of products and required payment methods.`;
  }
  if (/\\b(android app|mobile app|app development|application)\\b/.test(text)) {
    return `Android App Development starts at ₹79,999.

Tell us your app idea, key features and whether you need customer login, payments or an admin panel. Our team can prepare a suitable scope and quotation.`;
  }
  if (/\\b(admin panel|dashboard|crm|business web app|web application)\\b/.test(text)) {
    return `Admin Panel development starts at ₹99,999. Business Web Apps start at ₹90,000.

Share the workflow you want to manage, user roles and the reports or features you need. We will review the scope and suggest the right solution.`;
  }
  if (/\\b(whatsapp|instagram|automation|chatbot|auto.?reply|saas)\\b/.test(text)) {
    return `Automation solutions from AI SOFT STUDIO:

• WhatsApp Automation SaaS: starts at ₹25,000
• Instagram Automation SaaS: starts at ₹20,999

Tell us which platform you need and what you want to automate (enquiries, FAQs, lead capture or follow-ups).`;
  }
  if (/\\b(finance|trading|investment)\\b/.test(text)) {
    return `Finance Website development starts at ₹35,999.

Please share the type of finance platform, required pages, user features and admin requirements so we can prepare an accurate quotation.`;
  }
  if (/\\b(website|web design|web development|business site|portfolio)\\b/.test(text)) {
    return `Website development options:

• 5-Page Business Website: starts at ₹9,999
• Premium Website: starts at ₹30,999
• Finance Website: starts at ₹35,999
• Gaming Website: starts at ₹50,000

Tell us your business type, pages needed and any reference website you like.`;
  }
  if (/\\b(support|human|agent|person|team|call|contact|talk|representative)\\b/.test(text) || /बात|कॉल|संपर्क/.test(text)) {
    return `Sure! Our team can assist you. Please send your name, project requirement and a suitable time to contact you. We will get back to you as soon as possible.`;
  }
  return `Thanks for contacting AI SOFT STUDIO! We have received your message. 😊

For a quick response, reply with:
PRICING – service prices
WEBSITE – website development
ECOMMERCE – online store
APP – Android app
ADMIN – admin panel / web app
AUTOMATION – WhatsApp / Instagram automation
SUPPORT – talk to our team

Or send your project details and our team will follow up.`;
}

async function sendAndStore(sql, contactId, phone, body) {
  const result = await sendText(phone, body);
  const wamid = result.messages?.[0]?.id || null;
  await sql`INSERT INTO whatsapp_messages (contact_id,wamid,direction,message_type,body,status)
    VALUES (${contactId},${wamid},'outbound','text',${body},'sent') ON CONFLICT (wamid) DO NOTHING`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const url = new URL(req.url, "https://localhost");
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Webhook verification failed");
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method not allowed");
  }

  let raw;
  try { raw = await readRawBody(req); } catch { return res.status(400).send("Invalid body"); }
  if (!validSignature(raw, req.headers["x-hub-signature-256"])) return res.status(401).send("Invalid signature");

  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).send("Invalid JSON"); }
  if (payload.object !== "whatsapp_business_account") return res.status(200).send("Ignored");

  try {
    const sql = db();
    await ensureSchema(sql);
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const message of value.messages || []) {
          const phone = String(message.from || "").replace(/\\D/g, "");
          if (!phone || !message.id) continue;
          const profile = (value.contacts || []).find(x => x.wa_id === message.from)?.profile?.name || null;
          const body = message.text?.body || (message.type === "button" ? message.button?.text : null) || (message.type === "interactive" ? message.interactive?.button_reply?.title || message.interactive?.list_reply?.title : null) || `[${message.type || "message"} message]`;
          const contactRows = await sql`INSERT INTO whatsapp_contacts (phone,name,last_message_at,updated_at)
            VALUES (${phone},${profile},NOW(),NOW())
            ON CONFLICT (phone) DO UPDATE SET name=COALESCE(EXCLUDED.name,whatsapp_contacts.name),last_message_at=NOW(),updated_at=NOW()
            RETURNING id,phone`;
          const contact = contactRows[0];
          const inserted = await sql`INSERT INTO whatsapp_messages (contact_id,wamid,direction,message_type,body,raw_payload)
            VALUES (${contact.id},${message.id},'inbound',${message.type || "unknown"},${body},${JSON.stringify(message)}::jsonb)
            ON CONFLICT (wamid) DO NOTHING RETURNING id`;
          if (!inserted.length) continue;

          if (process.env.WHATSAPP_AUTO_REPLY !== "false") {
            const reply = getSmartReply(body, profile) || process.env.WHATSAPP_AUTO_REPLY_TEXT || "Thanks for contacting AI SOFT STUDIO. Our team will get back to you shortly.";
            try { await sendAndStore(sql, contact.id, phone, reply); }
            catch (error) { console.error("WhatsApp auto-reply failed:", error.message); }
          }
          const adminPhone = String(process.env.WHATSAPP_ADMIN_PHONE || "").replace(/\\D/g, "");
          if (adminPhone) {
            const alert = `New WhatsApp enquiry from ${profile || phone}: ${String(body).slice(0, 500)}`;
            try { await sendText(adminPhone, alert); }
            catch (error) { console.error("WhatsApp admin alert failed:", error.message); }
          }
        }
        for (const status of value.statuses || []) {
          await sql`UPDATE whatsapp_messages SET status=${status.status || "updated"}
            WHERE wamid=${status.id} AND direction='outbound'`;
        }
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  } catch (error) {
    console.error("WhatsApp webhook processing failed:", error.message);
    return res.status(500).send("Webhook processing failed");
  }
}
