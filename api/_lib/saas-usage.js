export async function checkWhatsappQuota(sql,user){
 await sql`CREATE TABLE IF NOT EXISTS studio_saas_settings(id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),signup_enabled BOOLEAN NOT NULL DEFAULT TRUE,trial_hours INTEGER NOT NULL DEFAULT 24,trial_message_quota INTEGER NOT NULL DEFAULT 50,trial_contact_limit INTEGER NOT NULL DEFAULT 25,currency TEXT NOT NULL DEFAULT 'INR',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`INSERT INTO studio_saas_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING`;
 await sql`CREATE TABLE IF NOT EXISTS studio_saas_plans(id BIGSERIAL PRIMARY KEY,plan_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,price NUMERIC(12,2) NOT NULL DEFAULT 0,billing_period TEXT NOT NULL DEFAULT 'monthly',message_quota INTEGER NOT NULL DEFAULT 1000,contact_limit INTEGER NOT NULL DEFAULT 500,team_limit INTEGER NOT NULL DEFAULT 2,campaign_limit INTEGER NOT NULL DEFAULT 10,whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,api_access BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`CREATE TABLE IF NOT EXISTS studio_saas_usage(id BIGSERIAL PRIMARY KEY,company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,channel TEXT NOT NULL DEFAULT 'whatsapp',event_type TEXT NOT NULL DEFAULT 'message',quantity INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 const [settings,plans,used]=await Promise.all([
  sql`SELECT trial_message_quota FROM studio_saas_settings WHERE id=1`,
  sql`SELECT message_quota,whatsapp_enabled,active FROM studio_saas_plans WHERE plan_key=(SELECT plan FROM studio_companies WHERE id=${user.company_id}) LIMIT 1`,
  sql`SELECT COALESCE(SUM(quantity),0)::int AS used FROM studio_saas_usage WHERE company_id=${user.company_id} AND channel='whatsapp' AND created_at>=date_trunc('month',NOW())`
 ]);
 const trial=user.company_status==='trial',plan=plans[0];
 if(!trial&&(!plan||!plan.active||!plan.whatsapp_enabled))return {allowed:false,error:"WhatsApp messaging is not included in the assigned plan."};
 const quota=trial?Number(settings[0]?.trial_message_quota??50):Number(plan.message_quota||0);
 if(Number(used[0]?.used||0)>=quota)return {allowed:false,error:"Your WhatsApp message quota is exhausted for this billing month. Upgrade your plan to continue."};
 return {allowed:true};
}
export async function recordWhatsappUsage(sql,companyId){
 await sql`INSERT INTO studio_saas_usage(company_id,channel,event_type,quantity) VALUES(${companyId},'whatsapp','message',1)`;
}
