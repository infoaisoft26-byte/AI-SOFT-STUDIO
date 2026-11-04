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
  await sql`CREATE TABLE IF NOT EXISTS admin_login_attempts (
    ip_hash TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    name TEXT,
    lead_status TEXT NOT NULL DEFAULT 'new' CHECK (lead_status IN ('new','contacted','qualified','converted','lost')),
    opted_in BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT NOT NULL DEFAULT 'whatsapp',
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS whatsapp_contacts_updated_idx ON whatsapp_contacts (updated_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id BIGSERIAL PRIMARY KEY,
    contact_id BIGINT REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
    wamid TEXT UNIQUE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    message_type TEXT NOT NULL DEFAULT 'text',
    body TEXT,
    status TEXT NOT NULL DEFAULT 'received',
    error TEXT,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS whatsapp_messages_contact_idx ON whatsapp_messages (contact_id, created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    template_name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'queued',
    recipient_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
    id BIGSERIAL PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
    contact_id BIGINT REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    wamid TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}