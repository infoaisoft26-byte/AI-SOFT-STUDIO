import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

const COOKIE = "aisoft_company_session";
const TTL = 8 *  60 * 60 * 1000;
const b64 = value => Buffer.from(value).toString("base64url");

export async function ensureCompanySchema(sql = db()) {
  await sql`CREATE TABLE IF NOT EXISTS studio_companies (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    owner_name TEXT NOT NULL, owner_email TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'starter', status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active','suspended','trial')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_company_users (
    id BIGSERIAL PRIMARY KEY, company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, role TEXT NOT NULL DEFAULT 'employee'
      CHECK(role IN ('owner','manager','employee')),
    password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,email)
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS studio_company_users_email_global_idx ON studio_company_users(LOWER(email))`;
  await sql`CREATE TABLE IF NOT EXISTS studio_company_whatsapp (
    id BIGSERIAL PRIMARY KEY, company_id BIGINT NOT NULL UNIQUE REFERENCES studio_companies(id) ON DELETE CASCADE,
    business_account_id TEXT, phone_number_id TEXT, display_phone TEXT, encrypted_access_token TEXT,
    status TEXT NOT NULL DEFAULT 'not_connected' CHECK(status IN ('not_connected','pending','connected','error')),
    connected_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_company_contacts (
    id BIGSERIAL PRIMARY KEY, company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    phone TEXT NOT NULL, name TEXT, lead_status TEXT NOT NULL DEFAULT 'new',
    opted_in BOOLEAN NOT NULL DEFAULT FALSE, assigned_user_id BIGINT REFERENCES studio_company_users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,phone)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_company_messages (
    id BIGSERIAL PRIMARY KEY, company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    contact_id BIGINT REFERENCES studio_company_contacts(id) ON DELETE SET NULL,
    wamid TEXT UNIQUE, direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
    message_type TEXT NOT NULL DEFAULT 'text', body TEXT, status TEXT NOT NULL DEFAULT 'received',
    assigned_user_id BIGINT REFERENCES studio_company_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}
export function verifyPassword(password, encoded) {
  try {
    const [kind,salt,hash] = String(encoded).split(":");
    if (kind !== "scrypt" || !salt || !hash) return false;
    const actual = scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash,"hex");
    return actual.length === expected.length && timingSafeEqual(actual,expected);
  } catch { return false; }
}
function sessionSignature(payload) {
  const secret=process.env.ADMIN_SESSION_SECRET;
  if(!secret || secret.length<32) throw new Error("Session security is not configured.");
  return createHmac("sha256",secret).update(payload).digest("base64url");
}
export function issueCompanySession(user) {
  const payload=b64(JSON.stringify({sub:Number(user.id),companyId:Number(user.company_id),email:user.email,role:user.role,exp:Date.now()+TTL}));
  return payload+"."+sessionSignature(payload);
}
export function readCompanySession(req) {
  try {
    const raw=(req.headers?.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
    if(!raw)return null;
    const [payload,sig]=raw.split(".");
    const expected=sessionSignature(payload);
    const a=Buffer.from(sig||""); const b=Buffer.from(expected);
    if(a.length!==b.length||!timingSafeEqual(a,b))return null;
    const s=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(!Number.isSafeInteger(s.sub)||!Number.isSafeInteger(s.companyId)||!s.email||!s.role||s.exp<=Date.now())return null;
    return s;
  } catch { return null; }
}
export function setCompanySession(res,token) {
  res.setHeader("Set-Cookie",`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`);
}
export function clearCompanySession(res) {
  res.setHeader("Set-Cookie",`${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}
export async function requireCompanyUser(req,res,roles=[]) {
  const session=readCompanySession(req);
  if(!session){res.status(401).json({error:"Please sign in to your company workspace."});return null;}
  const sql=db();
  await ensureCompanySchema(sql);
  const rows=await sql`SELECT u.id,u.company_id,u.name,u.email,u.role,u.active,c.name AS company_name,c.status AS company_status
    FROM studio_company_users u JOIN studio_companies c ON c.id=u.company_id
    WHERE u.id=${session.sub} AND u.company_id=${session.companyId} AND u.active=TRUE LIMIT 1`;
  const user=rows[0];
  if(!user||user.company_status==='suspended'){res.status(401).json({error:"This company workspace is unavailable."});return null;}
  if(roles.length&&!roles.includes(user.role)){res.status(403).json({error:"You don't have permission for this action."});return null;}
  return user;
}
export function makeTempPassword() { return randomBytes(9).toString("base64url"); }
export function makeSlug(name) {
  const base=String(name||"company").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"company";
  return base+"-"+randomBytes(3).toString("hex");
}
