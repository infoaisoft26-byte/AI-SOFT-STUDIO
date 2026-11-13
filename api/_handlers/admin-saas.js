import { requireAdmin } from "../_lib/auth.js";
import { db } from "../_lib/db.js";
import { ensureCompanySchema } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
import { ensureInstagramSchema } from "../_lib/instagram.js";

async function init(sql){
 await ensureCompanySchema(sql);
 await ensureSaasSchema(sql);
 await ensureInstagramSchema(sql);
 await sql`CREATE TABLE IF NOT EXISTS studio_saas_settings(
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),signup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  trial_hours INTEGER NOT NULL DEFAULT 24,trial_message_quota INTEGER NOT NULL DEFAULT 50,
  trial_contact_limit INTEGER NOT NULL DEFAULT 25,currency TEXT NOT NULL DEFAULT 'INR',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`INSERT INTO studio_saas_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING`;
 await sql`CREATE TABLE IF NOT EXISTS studio_saas_plans(
  id BIGSERIAL PRIMARY KEY,plan_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,price NUMERIC(12,2) NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'monthly',message_quota INTEGER NOT NULL DEFAULT 1000,
  contact_limit INTEGER NOT NULL DEFAULT 500,team_limit INTEGER NOT NULL DEFAULT 2,
  campaign_limit INTEGER NOT NULL DEFAULT 10,whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  api_access BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`CREATE TABLE IF NOT EXISTS studio_saas_payments(
  id BIGSERIAL PRIMARY KEY,company_id BIGINT REFERENCES studio_companies(id) ON DELETE SET NULL,
  plan_key TEXT,provider TEXT,provider_payment_id TEXT UNIQUE,amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),metadata JSONB NOT NULL DEFAULT '{}'::jsonb)`;
 await sql`CREATE TABLE IF NOT EXISTS studio_saas_usage(
  id BIGSERIAL PRIMARY KEY,company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',event_type TEXT NOT NULL DEFAULT 'message',
  quantity INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`INSERT INTO studio_saas_plans(plan_key,name,price,billing_period,message_quota,contact_limit,team_limit,campaign_limit)
 VALUES('starter','Starter',499,'monthly',1000,500,2,10),('growth','Growth',1499,'monthly',5000,2500,5,50),('business','Business',3999,'monthly',20000,10000,15,200)
 ON CONFLICT(plan_key) DO NOTHING`;
}
async function audit(sql,email,action,id){await sql`INSERT INTO admin_audit(action,actor,entity_type,entity_id) VALUES(${action},${email},'saas_configuration',${id||1})`;}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!["GET","POST","PATCH"].includes(req.method)){res.setHeader("Allow","GET, POST, PATCH");return res.status(405).json({error:"Method not allowed"});}
 const admin=requireAdmin(req,res);if(!admin)return;
 let body={};if(req.method!=="GET"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
 try{
  const sql=db();await init(sql);
  if(req.method==="GET"){
   const [settings,plans,companies,wa,messages,usage,payments,registrations,campaigns]=await Promise.all([
    sql`SELECT * FROM studio_saas_settings WHERE id=1`,
    sql`SELECT * FROM studio_saas_plans ORDER BY price ASC`,
    sql`SELECT c.id,c.name,c.owner_name,c.owner_email,c.plan,c.status,c.trial_started_at,c.trial_ends_at,c.created_at,
      COUNT(DISTINCT u.id)::int AS users,COALESCE(w.status,'not_connected') AS whatsapp_status,w.display_phone,
      COUNT(DISTINCT ct.id)::int AS contacts,COUNT(DISTINCT m.id)::int AS message_count,
      COUNT(DISTINCT m.id) FILTER(WHERE m.direction='outbound')::int AS sent_count,
      COUNT(DISTINCT m.id) FILTER(WHERE m.status='failed')::int AS failed_count,
      COALESCE((SELECT SUM(us.quantity)::int FROM studio_saas_usage us WHERE us.company_id=c.id AND us.created_at>=date_trunc('month',NOW())),0)::int AS metered_usage
     FROM studio_companies c LEFT JOIN studio_company_users u ON u.company_id=c.id
     LEFT JOIN studio_company_whatsapp w ON w.company_id=c.id
     LEFT JOIN studio_company_contacts ct ON ct.company_id=c.id
     LEFT JOIN studio_company_messages m ON m.company_id=c.id
     LEFT JOIN studio_saas_usage us ON us.company_id=c.id AND us.created_at>=date_trunc('month',NOW())
     GROUP BY c.id,w.status,w.display_phone ORDER BY c.created_at DESC`,
    sql`SELECT COALESCE(status,'unknown') AS status,COUNT(*)::int AS count FROM studio_company_whatsapp GROUP BY status`,
    sql`SELECT direction,status,COUNT(*)::int AS count FROM studio_company_messages GROUP BY direction,status`,
    sql`SELECT COUNT(*)::int AS total,COALESCE(SUM(quantity),0)::int AS quantity FROM studio_saas_usage WHERE created_at>=date_trunc('month',NOW())`,
    sql`SELECT p.id,p.company_id,c.name AS company_name,p.plan_key,p.provider,p.provider_payment_id,p.amount,p.currency,p.status,p.paid_at,p.created_at FROM studio_saas_payments p LEFT JOIN studio_companies c ON c.id=p.company_id ORDER BY p.created_at DESC LIMIT 500`,
    sql`SELECT date_trunc('day',created_at)::date AS day,COUNT(*)::int AS registrations FROM studio_companies WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY 1`,
    sql`SELECT c.id,c.name AS company_name,x.template_name,x.status,x.total_count,x.sent_count,x.delivered_count,x.read_count,x.failed_count,x.created_at FROM studio_whatsapp_campaigns x JOIN studio_companies c ON c.id=x.company_id ORDER BY x.created_at DESC LIMIT 500`
   ]);
   const statusCounts=Object.fromEntries(companies.map(x=>[x.status,(companies.filter(y=>y.status===x.status).length)]));
   const waCounts=Object.fromEntries(wa.map(x=>[x.status,Number(x.count)]));
   const msgCounts=Object.fromEntries(messages.map(x=>[x.direction+"_"+x.status,Number(x.count)]));
   return res.status(200).json({settings:settings[0],metaSetup:{appSecretConfigured:Boolean(process.env.META_APP_SECRET),tokenEncryptionConfigured:Boolean(process.env.META_TOKEN_ENCRYPTION_KEY&&process.env.META_TOKEN_ENCRYPTION_KEY.length>=32),webhookVerifyConfigured:Boolean(process.env.WHATSAPP_VERIFY_TOKEN)},plans,companies,whatsapp:waCounts,messages:msgCounts,usage:usage[0],payments,registrations,campaigns,summary:{
    totalCompanies:companies.length,activeCompanies:statusCounts.active||0,trialCompanies:statusCounts.trial||0,suspendedCompanies:statusCounts.suspended||0,
    connectedWhatsapp:waCounts.connected||0,notConnectedWhatsapp:companies.length-(waCounts.connected||0),
    totalMessages:Object.values(msgCounts).reduce((a,b)=>a+b,0),outboundMessages:msgCounts.outbound_sent||0,
    failedMessages:msgCounts.outbound_failed||0,totalContacts:companies.reduce((a,x)=>a+Number(x.contacts||0),0),
    paidRevenue:payments.filter(p=>p.status==="paid").reduce((a,p)=>a+Number(p.amount||0),0)
   }});
  }
  if(req.method==="POST"&&body.action==="meta.save"){
   const appId=String(body.metaAppId||"").trim(),configId=String(body.metaConfigId||"").trim();
   if(!/^\d{5,30}$/.test(appId)||!/^\d{5,40}$/.test(configId))return res.status(400).json({error:"Enter a valid numeric Meta App ID and Embedded Signup Configuration ID."});
   const rows=await sql`UPDATE studio_saas_settings SET meta_app_id=${appId},meta_config_id=${configId},updated_at=NOW() WHERE id=1 RETURNING meta_app_id,meta_config_id`;
   await audit(sql,admin.email,"saas.meta.settings.updated",1);
   return res.status(200).json({ok:true,metaSetup:rows[0]});
  }
  if(req.method==="POST"&&body.action==="settings.save"){
   const hours=Math.max(1,Math.min(168,Number(body.trialHours)||24)),quota=Math.max(0,Math.min(100000,Number(body.trialMessageQuota)||0)),contacts=Math.max(0,Math.min(100000,Number(body.trialContactLimit)||0));
   const teamLimit=Math.max(0,Math.min(1000,Number(body.trialTeamLimit)||0)),campaignLimit=Math.max(0,Math.min(10000,Number(body.trialCampaignLimit)||0));
   const enabled=body.signupEnabled===true;
   const rows=await sql`UPDATE studio_saas_settings SET signup_enabled=${enabled},trial_hours=${hours},trial_message_quota=${quota},trial_contact_limit=${contacts},trial_team_limit=${teamLimit},trial_campaign_limit=${campaignLimit},currency='INR',updated_at=NOW() WHERE id=1 RETURNING *`;
   await audit(sql,admin.email,"saas.settings.updated",1);return res.status(200).json({ok:true,settings:rows[0]});
  }
  if(req.method==="POST"&&body.action==="plan.save"){
   const key=String(body.planKey||"").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40),name=String(body.name||"").trim().slice(0,80);
   const price=Number(body.price),messageQuota=Number(body.messageQuota),contactLimit=Number(body.contactLimit),teamLimit=Number(body.teamLimit),campaignLimit=Number(body.campaignLimit);
   if(!key||!name||![price,messageQuota,contactLimit,teamLimit,campaignLimit].every(Number.isFinite)||price<0||messageQuota<0||contactLimit<0||teamLimit<1||campaignLimit<0)return res.status(400).json({error:"Check plan name, price and quota values."});
   const rows=await sql`INSERT INTO studio_saas_plans(plan_key,name,price,billing_period,message_quota,contact_limit,team_limit,campaign_limit,whatsapp_enabled,api_access,active,updated_at)
    VALUES(${key},${name},${price},${String(body.billingPeriod||"monthly")},${messageQuota},${contactLimit},${teamLimit},${campaignLimit},${body.whatsappEnabled!==false},${body.apiAccess===true},${body.active!==false},NOW())
    ON CONFLICT(plan_key) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,billing_period=EXCLUDED.billing_period,message_quota=EXCLUDED.message_quota,
    contact_limit=EXCLUDED.contact_limit,team_limit=EXCLUDED.team_limit,campaign_limit=EXCLUDED.campaign_limit,whatsapp_enabled=EXCLUDED.whatsapp_enabled,
    api_access=EXCLUDED.api_access,active=EXCLUDED.active,updated_at=NOW() RETURNING *`;
   await audit(sql,admin.email,"saas.plan.saved",rows[0].id);return res.status(200).json({ok:true,plan:rows[0]});
  }
  if(req.method==="PATCH"&&body.action==="company.update"){
   const id=Number(body.id),status=String(body.status||""),plan=String(body.plan||"").slice(0,40);
   if(!Number.isSafeInteger(id)||id<1||!["trial","active","suspended"].includes(status))return res.status(400).json({error:"Invalid company or account status."});
   const rows=await sql`UPDATE studio_companies SET status=${status},plan=${plan||"trial"},
    trial_started_at=CASE WHEN ${status}='trial' AND trial_started_at IS NULL THEN NOW() ELSE trial_started_at END,
    trial_ends_at=CASE WHEN ${status}='trial' AND trial_ends_at IS NULL THEN NOW()+INTERVAL '24 hours' ELSE trial_ends_at END,updated_at=NOW()
    WHERE id=${id} RETURNING id,name,plan,status,trial_ends_at`;
   if(!rows.length)return res.status(404).json({error:"Customer not found."});
   await audit(sql,admin.email,"saas.company.updated",id);return res.status(200).json({ok:true,company:rows[0]});
  }
  return res.status(400).json({error:"Unknown SaaS admin action."});
 }catch(error){console.error("SaaS admin report failed:",error.message);return res.status(503).json({error:"SaaS reports or configuration are temporarily unavailable."});}
}