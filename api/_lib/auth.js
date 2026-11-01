import { createHmac, timingSafeEqual } from "node:crypto";
const COOKIE = "aisoft_admin_session";
const b64 = (value) => Buffer.from(value).toString("base64url");
function signature(payload) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function issueSession(email) {
  const payload = b64(JSON.stringify({ email, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  return `${payload}.${signature(payload)}`;
}
export function readSession(req) {
  const raw = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = signature(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.email || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
export function setSession(res, token) {
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
}
export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}
export function requireAdmin(req, res) {
  const session = readSession(req);
  if (!session || session.email !== (process.env.ADMIN_EMAIL || "admin@aisoft.in").toLowerCase()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return session;
}
