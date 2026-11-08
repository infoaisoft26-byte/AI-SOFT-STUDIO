import { createHash, randomUUID } from "node:crypto";
import { db } from "../_lib/db.js";

export default async function handler(req,res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Cache-Control","no-store");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST"){res.setHeader("Allow","POST, OPTIONS");return res.status(405).json({error:"Method not allowed"});}
  let body={};try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid request."});}
  const key=String(body.botKey||"").trim();
  const message=String(body.message||"").trim().slice(0,2000);
  const sessionId=/^[a-zA-Z0-9-]{12,80}$/.test(String(body.sessionId||""))?String(body.sessionId):randomUUID();
  if(!/^[a-f0-9]{48}$/.test(key)||!message)return res.status(400).json({error:"Enter a message to start chatting."});
  if(!process.env.AI_GATEWAY_API_KEY)return res.status(503).json({error:"AI assistant is being configured. Please try again later."});
  try {
    const sql=db();
    await sql`CREATE TABLE IF NOT EXISTS studio_ai_bot_usage (
      bot_id BIGINT NOT NULL REFERENCES studio_ai_bots(id) ON DELETE CASCADE,
      month_start DATE NOT NULL,messages INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(bot_id,month_start))`;
    await sql`CREATE TABLE IF NOT EXISTS studio_ai_bot_chats (
      id BIGSERIAL PRIMARY KEY,bot_id BIGINT NOT NULL REFERENCES studio_ai_bots(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE INDEX IF NOT EXISTS studio_ai_bot_chats_session_idx ON studio_ai_bot_chats(bot_id,session_id,created_at DESC)`;
    const bots=await sql`SELECT b.id,b.name,b.welcome_message,b.system_prompt,b.knowledge_text,b.monthly_message_limit
      FROM studio_ai_bots b JOIN studio_companies c ON c.id=b.company_id
      WHERE b.public_key=${key} AND b.status='active' AND c.status IN ('active','trial')
      AND (c.status<>'trial' OR c.trial_ends_at IS NULL OR c.trial_ends_at>NOW()) LIMIT 1`;
    const bot=bots[0];if(!bot)return res.status(404).json({error:"This assistant is not available."});
    const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
    const ipHash=createHash("sha256").update(ip).digest("hex");
    const rate=await sql`CREATE TABLE IF NOT EXISTS studio_ai_rate_limits (
      bot_id BIGINT NOT NULL REFERENCES studio_ai_bots(id) ON DELETE CASCADE,ip_hash TEXT NOT NULL,
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),request_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(bot_id,ip_hash))`;
    const rateRows=await sql`INSERT INTO studio_ai_rate_limits(bot_id,ip_hash,window_started_at,request_count)
      VALUES(${bot.id},${ipHash},NOW(),1)
      ON CONFLICT(bot_id,ip_hash) DO UPDATE SET
      request_count=CASE WHEN studio_ai_rate_limits.window_started_at<NOW()-INTERVAL '1 minute' THEN 1 ELSE studio_ai_rate_limits.request_count+1 END,
      window_started_at=CASE WHEN studio_ai_rate_limits.window_started_at<NOW()-INTERVAL '1 minute' THEN NOW() ELSE studio_ai_rate_limits.window_started_at END
      RETURNING request_count`;
    if(rateRows[0].request_count>20)return res.status(429).json({error:"Please wait a moment before sending another message."});
    const monthStart=new Date();monthStart.setDate(1);const month=monthStart.toISOString().slice(0,10);
    const usage=await sql`INSERT INTO studio_ai_bot_usage(bot_id,month_start,messages) VALUES(${bot.id},${month},1)
      ON CONFLICT(bot_id,month_start) DO UPDATE SET messages=studio_ai_bot_usage.messages+1
      WHERE studio_ai_bot_usage.messages<${bot.monthly_message_limit} RETURNING messages`;
    if(!usage.length)return res.status(429).json({error:"This assistant has reached its monthly message allowance. Please contact the business."});
    const history=await sql`SELECT role,content FROM studio_ai_bot_chats WHERE bot_id=${bot.id} AND session_id=${sessionId}
      ORDER BY created_at DESC LIMIT 12`;
    await sql`INSERT INTO studio_ai_bot_chats(bot_id,session_id,role,content) VALUES(${bot.id},${sessionId},'user',${message})`;
    const context=String(bot.knowledge_text||"").slice(0,20000);
    const system=[bot.system_prompt||"You are a helpful business assistant.",context?"\nBUSINESS KNOWLEDGE (use this as the source of truth):\n"+context:"","\nDo not invent prices, policies, availability, or business facts. If the information is missing, say you do not know and suggest contacting the business."].join("\n");
    const messages=[...history.reverse().map(x=>({role:x.role,content:x.content})),{role:"user",content:message}];
    const response=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{
      method:"POST",headers:{"Authorization":"Bearer "+process.env.AI_GATEWAY_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model:process.env.AI_BOT_MODEL||"openai/gpt-5.5",messages:[{role:"system",content:system},...messages],temperature:0.3,max_tokens:600})
    });
    if(!response.ok){const detail=await response.text().catch(()=>"");console.error("AI Gateway error:",response.status,detail.slice(0,500));return res.status(502).json({error:"The assistant could not reply right now. Please try again."});}
    const data=await response.json();
    const answer=String(data.choices?.[0]?.message?.content||"").trim().slice(0,6000);
    if(!answer)return res.status(502).json({error:"The assistant returned an empty response. Please try again."});
    await sql`INSERT INTO studio_ai_bot_chats(bot_id,session_id,role,content) VALUES(${bot.id},${sessionId},'assistant',${answer})`;
    return res.status(200).json({answer,sessionId,remaining:Math.max(0,bot.monthly_message_limit-usage[0].messages)});
  } catch(error) {console.error("Public AI chat failed:",error.message);return res.status(503).json({error:"Chat is temporarily unavailable. Please try again."});}
}
