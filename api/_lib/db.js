import { neon } from "@neondatabase/serverless";
let client;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  client ||= neon(process.env.DATABASE_URL);
  return client;
}
export async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS enquiries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    service TEXT,
    budget TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed','spam')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries (created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS admin_audit (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    entity_type TEXT,
    entity_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}
