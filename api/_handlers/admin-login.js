import { createHash, timingSafeEqual } from "node:crypto";
import { issueSession, setSession } from "../_lib/auth.js";
import { db, ensureSchema } from "../_lib/db.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function requestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = req.headers["x-real-ip"] || (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0]) || "unknown";
  return createHash("sha256").update(String(raw).trim()).digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const expectedPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!expectedEmail || !expectedPassword || expectedPassword.length < 12 || !sessionSecret || sessionSecret.length < 32) {
    return res.status(503).json({ error: "Admin login is not configured yet." });
  }

  try {
    const sql = db();
    await ensureSchema(sql);
    const ipHash = requestIp(req);
    const rows = await sql`SELECT attempts, window_started_at, blocked_until FROM admin_login_attempts WHERE ip_hash = ${ipHash} LIMIT 1`;
    const attempt = rows[0];
    const now = Date.now();

    if (attempt?.blocked_until && new Date(attempt.blocked_until).getTime() > now) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((new Date(attempt.blocked_until).getTime() - now) / 1000))));
      return res.status(429).json({ error: "Too many login attempts. Please wait 15 minutes and try again." });
    }

    const supplied = Buffer.from(password, "utf8");
    const configured = Buffer.from(expectedPassword, "utf8");
    const validPassword = supplied.length === configured.length && timingSafeEqual(supplied, configured);
    const validLogin = email === expectedEmail && validPassword;

    if (!validLogin) {
      const windowExpired = !attempt || now - new Date(attempt.window_started_at).getTime() >= WINDOW_MS;
      const nextAttempts = windowExpired ? 1 : Number(attempt.attempts || 0) + 1;
      const blockedUntil = nextAttempts >= MAX_ATTEMPTS ? new Date(now + WINDOW_MS) : null;

      await sql`INSERT INTO admin_login_attempts (ip_hash, attempts, window_started_at, blocked_until)
        VALUES (${ipHash}, ${nextAttempts}, ${new Date(now)}, ${blockedUntil})
        ON CONFLICT (ip_hash) DO UPDATE SET
          attempts = EXCLUDED.attempts,
          window_started_at = EXCLUDED.window_started_at,
          blocked_until = EXCLUDED.blocked_until`;

      if (blockedUntil) {
        res.setHeader("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
        return res.status(429).json({ error: "Too many login attempts. Please wait 15 minutes and try again." });
      }
      return res.status(401).json({ error: "Invalid email or password." });
    }

    await sql`DELETE FROM admin_login_attempts WHERE ip_hash = ${ipHash}`;
    setSession(res, issueSession(email));
    return res.status(200).json({ ok: true, email });
  } catch (error) {
    console.error("Admin login failed:", error.message);
    return res.status(503).json({ error: "Admin login is temporarily unavailable. Check the preview database configuration." });
  }
}
