import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { encryptCompanyToken, decryptCompanyToken } from "./company.js";

export const IG_VERSION = process.env.INSTAGRAM_GRAPH_API_VERSION || "v26.0";
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights"
].join(",");

export async function ensureInstagramSchema(sql = db()) {
  await sql`CREATE TABLE IF NOT EXISTS studio_company_instagram (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL UNIQUE REFERENCES studio_companies(id) ON DELETE CASCADE,
    ig_user_id TEXT NOT NULL UNIQUE,
    username TEXT,
    account_type TEXT,
    encrypted_access_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected','expired','error')),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE studio_company_instagram ADD COLUMN IF NOT EXISTS webhook_subscribed BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`CREATE TABLE IF NOT EXISTS studio_instagram_oauth_states (
    state_hash TEXT PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_company_instagram_settings (
    company_id BIGINT PRIMARY KEY REFERENCES studio_companies(id) ON DELETE CASCADE,
    auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ai_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_reply_text TEXT NOT NULL DEFAULT 'Thanks for messaging us. Our team will get back to you shortly.',
    comment_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    comment_reply_text TEXT NOT NULL DEFAULT 'Thanks for your comment! We will be in touch.',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_instagram_contacts (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    ig_scoped_id TEXT NOT NULL,
    username TEXT,
    name TEXT,
    source TEXT NOT NULL DEFAULT 'instagram',
    lead_status TEXT NOT NULL DEFAULT 'new',
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, ig_scoped_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_instagram_messages (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    contact_id BIGINT REFERENCES studio_instagram_contacts(id) ON DELETE SET NULL,
    mid TEXT,
    direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
    message_type TEXT NOT NULL DEFAULT 'text',
    body TEXT,
    status TEXT NOT NULL DEFAULT 'received',
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, mid)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS studio_instagram_messages_recent_idx ON studio_instagram_messages(company_id, created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS studio_instagram_comments (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    comment_id TEXT NOT NULL,
    media_id TEXT,
    username TEXT,
    text TEXT,
    reply_text TEXT,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, comment_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_instagram_publications (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    ig_media_id TEXT,
    media_type TEXT NOT NULL DEFAULT 'IMAGE',
    caption TEXT,
    media_url TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE studio_saas_plans ADD COLUMN IF NOT EXISTS instagram_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
}

export function instagramRedirectUri(req) {
  if (process.env.INSTAGRAM_REDIRECT_URI) return process.env.INSTAGRAM_REDIRECT_URI;
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}/api/instagram/callback` : "https://ai-soft-studio.vercel.app/api/instagram/callback";
}
export function hashState(state) { return createHash("sha256").update(String(state)).digest("hex"); }
export function makeOAuthState(companyId) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("OAuth state security is not configured.");
  const nonce = randomBytes(32).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ companyId: Number(companyId), nonce, exp: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return { state: payload + "." + signature, hash: hashState(payload + "." + signature) };
}
export function verifyOAuthState(state) {
  try {
    const [payload, supplied] = String(state || "").split(".");
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!payload || !supplied || !secret || secret.length < 32) return null;
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(supplied), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isSafeInteger(value.companyId) || !value.nonce || value.exp < Date.now()) return null;
    return value;
  } catch { return null; }
}
export async function getInstagramConnection(sql, companyId) {
  const rows = await sql`SELECT company_id,ig_user_id,username,account_type,status,token_expires_at,webhook_subscribed,connected_at
    FROM studio_company_instagram WHERE company_id=${companyId} LIMIT 1`;
  return rows[0] || null;
}
export async function getInstagramToken(sql, companyId) {
  const rows = await sql`SELECT ig_user_id,encrypted_access_token,status,token_expires_at FROM studio_company_instagram
    WHERE company_id=${companyId} AND status='connected' LIMIT 1`;
  if (!rows[0]) return null;
  let token=decryptCompanyToken(rows[0].encrypted_access_token);
  const expires=rows[0].token_expires_at?new Date(rows[0].token_expires_at).getTime():0;
  if(expires && expires<Date.now()+7*24*60*60*1000){
    try{
      const url=new URL("https://graph.instagram.com/refresh_access_token");url.searchParams.set("grant_type","ig_refresh_token");url.searchParams.set("access_token",token);
      const refreshed=await fetch(url);const data=await refreshed.json().catch(()=>({}));
      if(refreshed.ok&&data.access_token){token=data.access_token;await sql`UPDATE studio_company_instagram SET encrypted_access_token=${encryptCompanyToken(token)},token_expires_at=NOW()+(${Number(data.expires_in)||5184000} * INTERVAL '1 second'),updated_at=NOW() WHERE company_id=${companyId}`;}
    }catch(error){console.error("Instagram token refresh failed:",error.message);}
  }
  return { igUserId: rows[0].ig_user_id, token };
}
export async function sendInstagramText(igUserId, token, recipientId, text) {
  const response = await fetch(`https://graph.instagram.com/${IG_VERSION}/${igUserId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: String(recipientId) }, message: { text: String(text).slice(0, 1000) } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Instagram message send failed.");
  return data;
}
export { encryptCompanyToken, decryptCompanyToken };
