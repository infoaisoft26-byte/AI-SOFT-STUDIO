import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "aisoft_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const b64 = (value) => Buffer.from(value).toString("base64url");

function signature(payload) {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("Admin session configuration is unavailable");
  }

  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

export function issueSession(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Valid admin email is required");
  }

  const payload = b64(
    JSON.stringify({
      email: normalizedEmail,
      exp: Date.now() + SESSION_TTL_MS,
    })
  );

  return `${payload}.${signature(payload)}`;
}

export function readSession(req) {
  try {
    const cookieHeader = req.headers?.cookie || "";

    const raw = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);

    if (!raw) return null;

    const parts = raw.split(".");
    if (parts.length !== 2) return null;

    const [payload, suppliedSignature] = parts;
    if (!payload || !suppliedSignature) return null;

    const expectedSignature = signature(payload);
    const supplied = Buffer.from(suppliedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return null;
    }

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (
      typeof data.email !== "string" ||
      !data.email ||
      !Number.isFinite(data.exp) ||
      data.exp <= Date.now()
    ) {
      return null;
    }

    return {
      email: data.email.toLowerCase(),
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

export function setSession(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
  );
}

export function clearSession(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  );
}

export function requireAdmin(req, res) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!configuredEmail) {
    res.status(503).json({ error: "Admin authentication is not configured" });
    return null;
  }

  const session = readSession(req);

  if (!session || session.email !== configuredEmail) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  return session;
}
