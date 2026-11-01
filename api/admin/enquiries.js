import { db, ensureSchema } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const session = requireAdmin(req,res); if (!session) return;
  try {
    const sql = db(); await ensureSchema(sql);
    if (req.method === "GET") {
      const rows = await sql`SELECT id,name,email,phone,service,budget,message,status,created_at FROM enquiries ORDER BY created_at DESC LIMIT 250`;
      return res.status(200).json({ enquiries: rows });
    }
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const id = Number(body.id), status = String(body.status || "");
      if (!Number.isSafeInteger(id) || id < 1 || !["new","contacted","qualified","closed","spam"].includes(status)) return res.status(400).json({ error: "Invalid enquiry update." });
      const rows = await sql`UPDATE enquiries SET status=${status},updated_at=NOW() WHERE id=${id} RETURNING id,status`;
      if (!rows.length) return res.status(404).json({ error: "Enquiry not found." });
      await sql`INSERT INTO admin_audit (action,actor,entity_type,entity_id) VALUES ('enquiry.status.updated',${session.email},'enquiry',${id})`;
      return res.status(200).json({ ok: true, enquiry: rows[0] });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Admin enquiries failed:", error.message);
    return res.status(503).json({ error: "Database is not ready. Check DATABASE_URL and try again." });
  }
}
