import { timingSafeEqual } from "node:crypto";
import { issueSession, setSession } from "../_lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;

  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};
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

  if (
    !expectedEmail ||
    !expectedPassword ||
    expectedPassword.length < 12 ||
    !sessionSecret ||
    sessionSecret.length < 32
  ) {
    return res.status(503).json({
      error: "Admin login is not configured yet.",
    });
  }

  const suppliedPassword = Buffer.from(password, "utf8");
  const configuredPassword = Buffer.from(expectedPassword, "utf8");

  const validPassword =
    suppliedPassword.length === configuredPassword.length &&
    timingSafeEqual(suppliedPassword, configuredPassword);

  if (email !== expectedEmail || !validPassword) {
    return res.status(401).json({
      error: "Invalid email or password.",
    });
  }

  try {
    const token = issueSession(email);
    setSession(res, token);

    return res.status(200).json({ ok: true, email });
  } catch {
    return res.status(503).json({
      error: "Admin session is not configured.",
    });
  }
}
