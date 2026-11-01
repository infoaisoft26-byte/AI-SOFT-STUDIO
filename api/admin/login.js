import { timingSafeEqual } from "node:crypto";
import { issueSession, setSession } from "../_lib/auth.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const expectedEmail = (process.env.ADMIN_EMAIL || "admin@aisoft.in").toLowerCase();
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  if (!expectedPassword || expectedPassword.length < 12 || !process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) return res.status(503).json({ error: "Admin login is not configured yet." });
  const a = Buffer.from(password), b = Buffer.from(expectedPassword);
  const validPassword = a.length === b.length && timingSafeEqual(a,b);
  if (email !== expectedEmail || !validPassword) return res.status(401).json({ error: "Invalid email or password." });
  try { setSession(res, issueSession(email)); return res.status(200).json({ ok: true, email }); }
  catch { return res.status(503).json({ error: "Admin session is not configured." }); }
}
