import { randomBytes } from "node:crypto";
import { db } from "../_lib/db.js";
import { requireCompanyUser } from "../_lib/company.js";

async function ensureAiSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS studio_ai_bots (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES studio_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL UNIQUE,
    welcome_message TEXT NOT NULL DEFAULT 'Hi! How can I help you today?',
    system_prompt TEXT NOT NULL DEFAULT 'You are a helpful customer support assistant. Answer clearly and politely using the business information provided. If you do not know, say so and offer to connect the visitor with the business.',
    knowledge_text TEXT NOT NULL DEFAULT '',
    primary_color TEXT NOT NULL DEFAULT '#ff6b2c',
    monthly_message_limit INTEGER NOT NULL DEFAULT 1000,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS studio_ai_bot_usage (
    bot_id BIGINT NOT NULL REFERENCES studio_ai_bots(id) ON DELETE CASCADE,
    month_start DATE NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(bot_id, month_start)
  )`;
}

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST","PATCH"].includes(req.method)){res.setHeader("Allow","GET, POST, PATCH");return res.status(405).json({error:"Method not allowed"});}
  const user=await requireCompanyUser(req,res,["owner","manager"]); if(!user)return;
  try {
    const sql=db(); await ensureAiSchema(sql);
    if(req.method==="GET"){
      const rows=await sql`SELECT b.id,b.name,b.public_key,b.welcome_message,b.system_prompt,b.knowledge_text,b.primary_color,b.monthly_message_limit,b.status,b.created_at,
        COALESCE(u.messages,0)::int AS messages_used
        FROM studio_ai_bots b LEFT JOIN studio_ai_bot_usage u ON u.bot_id=b.id AND u.month_start=date_trunc('month',NOW())::date
        WHERE b.company_id=${user.company_id} ORDER BY b.created_at DESC`;
      return res.status(200).json({bots:rows,aiReady:Boolean(process.env.AI_GATEWAY_API_KEY),model:process.env.AI_BOT_MODEL||"openai/gpt-5.5"});
    }
    let body={}; try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}
    const id=Number(body.id||0);
    if(req.method==="POST"){
      const name=String(body.name||"").trim().slice(0,100);
      if(!name)return res.status(400).json({error:"Enter a name for your AI bot."});
      const key=randomBytes(24).toString("hex");
      const rows=await sql`INSERT INTO studio_ai_bots(company_id,name,public_key,welcome_message,system_prompt,knowledge_text,primary_color)
        VALUES(${user.company_id},${name},${key},${String(body.welcomeMessage||"Hi! How can I help you today?").trim().slice(0,300)},
        ${String(body.systemPrompt||"").trim().slice(0,2000)||"You are a helpful customer support assistant. Answer clearly and politely using the business information provided. If you do not know, say so and offer to connect the visitor with the business."},
        ${String(body.knowledgeText||"").trim().slice(0,20000)},${/^#[0-9a-fA-F]{6}$/.test(body.primaryColor||"")?body.primaryColor:"#ff6b2c"})
        RETURNING id,name,public_key,welcome_message,system_prompt,knowledge_text,primary_color,monthly_message_limit,status,created_at`;
      return res.status(201).json({bot:rows[0]});
    }
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:"Invalid bot."});
    const name=String(body.name||"").trim().slice(0,100);
    const welcome=String(body.welcomeMessage||"").trim().slice(0,300);
    const prompt=String(body.systemPrompt||"").trim().slice(0,2000);
    const knowledge=String(body.knowledgeText||"").trim().slice(0,20000);
    const color=/^#[0-9a-fA-F]{6}$/.test(body.primaryColor||"")?body.primaryColor:"#ff6b2c";
    const status=body.status==="paused"?"paused":"active";
    const rows=await sql`UPDATE studio_ai_bots SET name=COALESCE(NULLIF(${name},''),name),
      welcome_message=COALESCE(NULLIF(${welcome},''),welcome_message),
      system_prompt=COALESCE(NULLIF(${prompt},''),system_prompt),
      knowledge_text=${knowledge},primary_color=${color},status=${status},updated_at=NOW()
      WHERE id=${id} AND company_id=${user.company_id}
      RETURNING id,name,public_key,welcome_message,system_prompt,knowledge_text,primary_color,monthly_message_limit,status,created_at`;
    if(!rows.length)return res.status(404).json({error:"Bot not found."});
    return res.status(200).json({bot:rows[0]});
  } catch(error) { console.error("Company AI bots failed:",error.message); return res.status(503).json({error:"AI bot workspace is temporarily unavailable."}); }
}
