import { db, ensureSchema } from "../_lib/db.js";
import { sendText, sendTemplate } from "../_lib/whatsapp.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid request body." });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 180);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const service = String(body.service || "").trim().slice(0, 160);
  const budget = String(body.budget || "").trim().slice(0, 80);
  const message = String(body.message || "").trim().slice(0, 4000);
  const whatsappOptIn = body.whatsappOptIn === true || body.whatsappOptIn === "true";

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10 || (whatsappOptIn && phone.replace(/\D/g, "").length < 8)) {
    return res.status(400).json({ error: "Please enter your name, valid email and a message of at least 10 characters." });
  }

  try {
    const sql = db();
    await ensureSchema(sql);
    const rows = await sql`INSERT INTO enquiries (name,email,phone,service,budget,message,whatsapp_opt_in)
      VALUES (${name},${email},${phone},${service},${budget},${message},${whatsappOptIn}) RETURNING id`;
    const adminPhone = String(process.env.WHATSAPP_ADMIN_PHONE || "").replace(/\\D/g, "");
    if (adminPhone) {
      try {
        if (process.env.WHATSAPP_ADMIN_ALERT_TEMPLATE) {
          await sendTemplate(adminPhone, process.env.WHATSAPP_ADMIN_ALERT_TEMPLATE, process.env.WHATSAPP_ENQUIRY_ACK_LANGUAGE || "en");
        } else {
          await sendText(adminPhone, `New website enquiry from ${name} (${phone || email}): ${service || "General"} — ${message.slice(0, 350)}`);
        }
      } catch (error) { console.error("Website enquiry WhatsApp alert failed:", error.message); }
    }
    if (whatsappOptIn && phone) {
      if (process.env.WHATSAPP_ENQUIRY_ACK_TEMPLATE) {
        try { await sendTemplate(phone, process.env.WHATSAPP_ENQUIRY_ACK_TEMPLATE, process.env.WHATSAPP_ENQUIRY_ACK_LANGUAGE || "en"); }
        catch (error) { console.error("Website enquiry WhatsApp acknowledgement failed:", error.message); }
      } else {
        console.warn("Website enquiry WhatsApp consent recorded; configure an approved WHATSAPP_ENQUIRY_ACK_TEMPLATE to initiate the conversation.");
      }
    }
    return res.status(201).json({ ok: true, id: rows[0].id, message: "Your enquiry has been received." });
  } catch (error) {
    console.error("Enquiry submission failed:", error.message);
    return res.status(503).json({ error: "We could not submit your enquiry right now. Please try again or email hello@aisoftautomation.com." });
  }
}
