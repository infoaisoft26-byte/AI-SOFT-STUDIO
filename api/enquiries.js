import { db, ensureSchema } from "./_lib/db.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const name = String(body.name || "").trim().slice(0,120);
    const email = String(body.email || "").trim().toLowerCase().slice(0,180);
    const phone = String(body.phone || "").trim().slice(0,40);
    const service = String(body.service || "").trim().slice(0,160);
    const budget = String(body.budget || "").trim().slice(0,80);
    const message = String(body.message || "").trim().slice(0,4000);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) return res.status(400).json({ error: "Please enter your name, valid email and a message of at least 10 characters." });
    const sql = db(); await ensureSchema(sql);
    const rows = await sql`INSERT INTO enquiries (name,email,phone,service,budget,message) VALUES (${name},${email},${phone},${service},${budget},${message}) RETURNING id`;
    return res.status(201).json({ ok: true, id: rows[0].id, message: "Your enquiry has been received." });
  } catch (error) {
    console.error("Enquiry submission failed:", error.message);
    return res.status(503).json({ error: "We could not submit your enquiry right now. Please try again or email hello@aisoftautomation.com." });
  }
}
