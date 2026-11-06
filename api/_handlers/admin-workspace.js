import { requireAdmin } from "../_lib/auth.js";
import { db, ensureSchema } from "../_lib/db.js";

async function init(sql) {
  await ensureSchema(sql);
  await sql`CREATE TABLE IF NOT EXISTS studio_clients (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT,phone TEXT,company TEXT,notes TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS studio_projects (id BIGSERIAL PRIMARY KEY,client_id BIGINT REFERENCES studio_clients(id) ON DELETE SET NULL,title TEXT NOT NULL,service TEXT,description TEXT,status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','in_progress','review','on_hold','delivered','cancelled')),progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),amount NUMERIC(12,2) NOT NULL DEFAULT 0,deadline DATE,assigned_to TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS studio_payments (id BIGSERIAL PRIMARY KEY,project_id BIGINT REFERENCES studio_projects(id) ON DELETE SET NULL,client_id BIGINT REFERENCES studio_clients(id) ON DELETE SET NULL,amount NUMERIC(12,2) NOT NULL CHECK(amount>0),currency TEXT NOT NULL DEFAULT 'INR',payment_type TEXT NOT NULL DEFAULT 'advance',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded')),reference TEXT,paid_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS studio_services (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,description TEXT,price NUMERIC(12,2) NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'INR',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS studio_campaigns (id BIGSERIAL PRIMARY KEY,channel TEXT NOT NULL CHECK(channel IN ('whatsapp','sms','instagram','facebook')),name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',audience_count INTEGER DEFAULT 0,sent_count INTEGER DEFAULT 0,failed_count INTEGER DEFAULT 0,created_by TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS studio_hosting_assets (id BIGSERIAL PRIMARY KEY,client_id BIGINT REFERENCES studio_clients(id) ON DELETE SET NULL,project_id BIGINT REFERENCES studio_projects(id) ON DELETE SET NULL,asset_type TEXT NOT NULL CHECK(asset_type IN ('domain','hosting','website')),name TEXT NOT NULL,provider TEXT,expires_at DATE,status TEXT NOT NULL DEFAULT 'active',notes TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`;
  const defaults=[['5-Page Business Website','Business website development',9999],['Premium Website Development','Custom UI and responsive experience',30999],['Admin Panel Development','Secure dashboard and management',99999],['E-commerce Website','Products, cart, orders and admin',99999],['Finance Website','Dashboard and transaction workflows',35999],['Gaming Website','Gaming and tournament portal',50000],['Android Application','App UI and backend integration',79999],['Business Web Application','Custom business workflows',90000],['WhatsApp Automation SaaS','Customer messaging automation',25000],['Instagram Automation SaaS','Instagram business integrations',20999],['Facebook Business SaaS','Facebook page messaging',14999],['Custom AI Automation','AI-powered business workflows',9999]];
  for (const s of defaults) await sql`INSERT INTO studio_services(name,description,price) VALUES(${s[0]},${s[1]},${s[2]}) ON CONFLICT(name) DO NOTHING`;
}
async function audit(sql,email,action,type,id) { await sql`INSERT INTO admin_audit(action,actor,entity_type,entity_id) VALUES(${action},${email},${type},${id})`; }

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST","PATCH"].includes(req.method)){res.setHeader("Allow","GET, POST, PATCH");return res.status(405).json({error:"Method not allowed"});}
  const session=requireAdmin(req,res); if(!session)return;
  let body={}; if(req.method!=="GET"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
  try {
    const sql=db(); await init(sql);
    if(req.method==="GET") {
      const [enquiries,clients,projects,payments,services,campaigns,hosting,clientRows,projectRows,paymentRows,assets]=await Promise.all([
        sql`SELECT status,COUNT(*)::int AS count FROM enquiries GROUP BY status`,
        sql`SELECT COUNT(*)::int AS count FROM studio_clients`,
        sql`SELECT status,COUNT(*)::int AS count FROM studio_projects GROUP BY status`,
        sql`SELECT COALESCE(SUM(amount) FILTER(WHERE status='paid'),0)::numeric AS revenue,COALESCE(SUM(amount) FILTER(WHERE status='pending'),0)::numeric AS pending FROM studio_payments`,
        sql`SELECT id,name,description,price,currency,active FROM studio_services ORDER BY name`,
        sql`SELECT id,channel,name,status,audience_count,sent_count,failed_count,created_at FROM studio_campaigns ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT COUNT(*)::int AS count FROM studio_hosting_assets WHERE status='active'`,
        sql`SELECT * FROM studio_clients ORDER BY created_at DESC LIMIT 250`,
        sql`SELECT p.*,c.name AS client_name FROM studio_projects p LEFT JOIN studio_clients c ON c.id=p.client_id ORDER BY p.created_at DESC LIMIT 250`,
        sql`SELECT p.*,c.name AS client_name,pr.title AS project_title FROM studio_payments p LEFT JOIN studio_clients c ON c.id=p.client_id LEFT JOIN studio_projects pr ON pr.id=p.project_id ORDER BY p.created_at DESC LIMIT 250`,
        sql`SELECT * FROM studio_hosting_assets ORDER BY created_at DESC LIMIT 250`
      ]);
      const em=Object.fromEntries(enquiries.map(x=>[x.status,Number(x.count)])), pm=Object.fromEntries(projects.map(x=>[x.status,Number(x.count)]));
      return res.status(200).json({overview:{enquiries:Object.values(em).reduce((a,b)=>a+b,0),newEnquiries:em.new||0,clients:Number(clients[0].count),activeProjects:pm.in_progress||0,pendingProjects:(pm.planning||0)+(pm.review||0)+(pm.on_hold||0),deliveredProjects:pm.delivered||0,revenue:Number(payments[0].revenue||0),pendingPayments:Number(payments[0].pending||0),hostingAssets:Number(hosting[0].count)},enquiries:em,projects:pm,services,campaigns,clients:clientRows,projectRows,paymentRows,assets,integrations:{whatsapp:Boolean(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID),instagram:Boolean(process.env.INSTAGRAM_ACCESS_TOKEN&&process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID),facebook:Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN&&process.env.FACEBOOK_PAGE_ID),sms:Boolean(process.env.SMS_PROVIDER_API_KEY&&process.env.SMS_PROVIDER_URL),ai:Boolean(process.env.AI_GATEWAY_API_KEY||process.env.OPENAI_API_KEY),hosting:Boolean(process.env.HOSTING_PROVIDER_API_KEY),domains:Boolean(process.env.DOMAIN_PROVIDER_API_KEY)}});
    }
    const action=String(body.action||"");
    if(action==="client.create") {
      const name=String(body.name||"").trim().slice(0,160); if(!name)return res.status(400).json({error:"Client name is required"});
      const email=String(body.email||"").trim().toLowerCase().slice(0,180)||null;
      const rows=await sql`INSERT INTO studio_clients(name,email,phone,company,notes) VALUES(${name},${email},${String(body.phone||"").slice(0,40)},${String(body.company||"").slice(0,160)},${String(body.notes||"").slice(0,2000)}) RETURNING *`;
      await audit(sql,session.email,"client.created","client",rows[0].id); return res.status(201).json({client:rows[0]});
    }
    if(action==="project.create") {
      const title=String(body.title||"").trim().slice(0,180); if(!title)return res.status(400).json({error:"Project title is required"});
      const rows=await sql`INSERT INTO studio_projects(title,client_id,service,description,amount,deadline,assigned_to) VALUES(${title},${body.clientId?Number(body.clientId):null},${String(body.service||"").slice(0,160)},${String(body.description||"").slice(0,3000)},${Math.max(0,Number(body.amount)||0)},${body.deadline||null},${String(body.assignedTo||"").slice(0,160)}) RETURNING *`;
      await audit(sql,session.email,"project.created","project",rows[0].id); return res.status(201).json({project:rows[0]});
    }
    if(action==="payment.create") {
      const amount=Number(body.amount); if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:"Enter a valid payment amount"});
      const status=body.status==="paid"?"paid":"pending";
      const rows=await sql`INSERT INTO studio_payments(project_id,client_id,amount,currency,payment_type,status,reference,paid_at) VALUES(${body.projectId?Number(body.projectId):null},${body.clientId?Number(body.clientId):null},${amount},${String(body.currency||"INR").slice(0,8)},${String(body.paymentType||"advance").slice(0,40)},${status},${String(body.reference||"").slice(0,160)},${status==="paid"?new Date():null}) RETURNING *`;
      await audit(sql,session.email,"payment.recorded","payment",rows[0].id); return res.status(201).json({payment:rows[0]});
    }
    if(action==="service.update") {
      const id=Number(body.id),price=Number(body.price); if(!Number.isSafeInteger(id)||id<1||!Number.isFinite(price)||price<0)return res.status(400).json({error:"Invalid service update"});
      const rows=await sql`UPDATE studio_services SET price=${price},active=${body.active!==false},updated_at=NOW() WHERE id=${id} RETURNING *`;
      if(!rows.length)return res.status(404).json({error:"Service not found"}); await audit(sql,session.email,"service.updated","service",id); return res.status(200).json({service:rows[0]});
    }
    if(action==="campaign.create") {
      const channel=String(body.channel||""),name=String(body.name||"").trim().slice(0,160); if(!["whatsapp","sms","instagram","facebook"].includes(channel)||!name)return res.status(400).json({error:"Choose a valid channel and campaign name"});
      const rows=await sql`INSERT INTO studio_campaigns(channel,name,status,created_by) VALUES(${channel},${name},'draft',${session.email}) RETURNING *`;
      await audit(sql,session.email,"campaign.created",channel+"_campaign",rows[0].id); return res.status(201).json({campaign:rows[0],message:"Draft saved. Sending requires a verified provider connection and consent-based audience."});
    }
    return res.status(400).json({error:"Unknown workspace action"});
  } catch(error) { console.error("Admin workspace failed:",error.message); return res.status(503).json({error:"Workspace data is temporarily unavailable."}); }
}