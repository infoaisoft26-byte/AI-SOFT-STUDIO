import { readSession, clearSession } from "../_lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "DELETE") {
    clearSession(res);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) {
    return res.status(503).json({ authenticated: false, error: "Admin authentication is not configured" });
  }

  const session = readSession(req);
  if (!session || session.email !== configuredEmail) {
    return res.status(401).json({ authenticated: false });
  }

  return res.status(200).json({ authenticated: true, email: session.email });
}
