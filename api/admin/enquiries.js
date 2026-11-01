import { db, ensureSchema } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

const VALID_STATUSES = ["new", "contacted", "qualified", "closed", "spam"];

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  let body = {};
  if (req.method === "PATCH") {
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch {
      return res.status(400).json({ error: "Invalid request body." });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Invalid request body." });
    }
  }

  try {
    const sql = db();
    await ensureSchema(sql);

    if (req.method === "GET") {
      const rows = await sql`SELECT id,name,email,phone,service,budget,message,status,created_at,updated_at
        FROM enquiries ORDER BY created_at DESC LIMIT 250`;
      return res.status(200).json({ enquiries: rows });
    }

    const id = Number(body.id);
    const status = String(body.status || "");
    if (!Number.isSafeInteger(id) || id < 1 || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid enquiry update." });
    }

    const rows = await sql`UPDATE enquiries SET status=${status},updated_at=NOW()
      WHERE id=${id} RETURNING id,status,updated_at`;
    if (!rows.length) return res.status(404).json({ error: "Enquiry not found." });

    await sql`INSERT INTO admin_audit (action,actor,entity_type,entity_id)
      VALUES ('enquiry.status.updated',${session.email},'enquiry',${id})`;
    return res.status(200).json({ ok: true, enquiry: rows[0] });
  } catch (error) {
    console.error("Admin enquiries failed:", error.message);
    return res.status(503).json({ error: "Customer records are temporarily unavailable. Check the preview database configuration." });
  }
}
