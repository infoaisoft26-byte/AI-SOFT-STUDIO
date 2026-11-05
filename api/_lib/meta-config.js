import { db } from "./db.js";
import { encryptCompanyToken, decryptCompanyToken } from "./company.js";

export async function ensureMetaConfig(sql=db()) {
  await sql`CREATE TABLE IF NOT EXISTS studio_meta_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),
    app_id TEXT,
    config_id TEXT,
    encrypted_app_secret TEXT,
    encrypted_verify_token TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`INSERT INTO studio_meta_config(id) VALUES(1) ON CONFLICT(id) DO NOTHING`;
}
export async function getMetaConfig(sql=db()) {
  await ensureMetaConfig(sql);
  const rows=await sql`SELECT * FROM studio_meta_config WHERE id=1 LIMIT 1`;
  return rows[0]||{};
}
export function decryptMetaAppSecret(row) {
  if(!row?.encrypted_app_secret) return process.env.META_APP_SECRET||"";
  return decryptCompanyToken(row.encrypted_app_secret);
}
export function decryptMetaVerifyToken(row) {
  if(!row?.encrypted_verify_token) return process.env.WHATSAPP_VERIFY_TOKEN||"";
  return decryptCompanyToken(row.encrypted_verify_token);
}
export function metaReady(row) {
  return Boolean(row?.app_id&&row?.config_id&&(row?.encrypted_app_secret||process.env.META_APP_SECRET)&&process.env.META_TOKEN_ENCRYPTION_KEY&&process.env.META_TOKEN_ENCRYPTION_KEY.length>=32);
}
export { encryptCompanyToken };
