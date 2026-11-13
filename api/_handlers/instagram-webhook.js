import { createHmac,timingSafeEqual } from "node:crypto";
import { db } from "../_lib/db.js";
import { ensureCompanySchema } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
import { ensureInstagramSchema,sendInstagramText,getInstagramToken } from "../_lib/instagram.js";
export const config={api:{bodyParser:false}};
async function rawBody(req){const chunks=[];for await(const c of req)chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c));return Buffer.concat(chunks);}
function validSignature(raw,sig){const secret=process.env.INSTAGRAM_APP_SECRET||process.env.META_APP_SECRET;if(!secret||!sig?.startsWith("sha256="))return false;const expected=Buffer.from("sha256="+createHmac("sha256",secret).update(raw).digest("hex")),actual=Buffer.from(sig);return expected.length===actual.length&&timingSafeEqual(expected,actual);}
async function aiReply(message,company){const key=process.env.AI_GATEWAY_API_KEY;if(!key)return null;const model=process.env.AI_BOT_MODEL||"openai/gpt-4o-mini";const response=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:"You are a helpful Instagram customer support assistant for "+company+". Reply briefly, politely, and ask one useful follow-up question when needed. Do not invent prices, policies, or promises."},{role:"user",content:String(message).slice(0,3000)}],max_tokens:180})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.message||"AI Gateway request failed.");return data.choices?.[0]?.message?.content?.trim()||null;}
async function handleMessage(sql,entry,m){
 const sender=String(m.sender?.id||m.from?.id||"");if(!sender||!m.message?.mid)return;
 const rows=await sql`SELECT i.company_id,i.ig_user_id,c.name AS company_name FROM studio_company_instagram i JOIN studio_companies c ON c.id=i.company_id WHERE i.ig_user_id=${String(entry.id)} AND i.status='connected' LIMIT 1`;
 const account=rows[0];if(!account)return;
 const text=String(m.message?.text||"").slice(0,4000),username=m.sender?.username||null;
 const contacts=await sql`INSERT INTO studio_instagram_contacts(company_id,ig_scoped_id,username,last_message_at,updated_at) VALUES(${account.company_id},${sender},${username},NOW(),NOW()) ON CONFLICT(company_id,ig_scoped_id) DO UPDATE SET username=COALESCE(EXCLUDED.username,studio_instagram_contacts.username),last_message_at=NOW(),updated_at=NOW() RETURNING id`;
 const inserted=await sql`INSERT INTO studio_instagram_messages(company_id,contact_id,mid,direction,message_type,body,raw_payload) VALUES(${account.company_id},${contacts[0].id},${m.message.mid},'inbound','text',${text},${JSON.stringify(m)}::jsonb) ON CONFLICT(company_id,mid) DO NOTHING RETURNING id`;
 if(!inserted.length)return;
 const settings=await sql`SELECT * FROM studio_company_instagram_settings WHERE company_id=${account.company_id} LIMIT 1`,s=settings[0];
 if(s?.auto_reply_enabled){
  try{const reply=s.ai_reply_enabled?await aiReply(text,account.company_name):null;const finalReply=reply||s.auto_reply_text;const sent=await sendInstagramText(String(entry.id), (await getInstagramToken(sql,account.company_id)).token,sender,finalReply);await sql`INSERT INTO studio_instagram_messages(company_id,contact_id,mid,direction,message_type,body,status) VALUES(${account.company_id},${contacts[0].id},${sent.message_id||sent.id||null},'outbound','text',${finalReply},'sent') ON CONFLICT(company_id,mid) DO NOTHING`;await sql`INSERT INTO studio_saas_usage(company_id,channel,event_type,quantity) VALUES(${account.company_id},'instagram','message',1)`;}catch(e){console.error("Instagram auto reply failed:",e.message);}
 }
}
async function handleComment(sql,entry,change){
 const v=change.value||{},commentId=String(v.id||v.comment_id||"");if(!commentId)return;
 const rows=await sql`SELECT i.company_id,i.ig_user_id,c.name AS company_name FROM studio_company_instagram i JOIN studio_companies c ON c.id=i.company_id WHERE i.ig_user_id=${String(entry.id)} AND i.status='connected' LIMIT 1`;const account=rows[0];if(!account)return;
 const username=v.from?.username||null,body=String(v.text||"").slice(0,2000),senderId=String(v.from?.id||"");
 if(senderId) await sql`INSERT INTO studio_instagram_contacts(company_id,ig_scoped_id,username,source) VALUES(${account.company_id},${senderId},${username},'instagram_comment') ON CONFLICT(company_id,ig_scoped_id) DO UPDATE SET username=COALESCE(EXCLUDED.username,studio_instagram_contacts.username),updated_at=NOW()`;
 const inserted=await sql`INSERT INTO studio_instagram_comments(company_id,comment_id,media_id,username,text) VALUES(${account.company_id},${commentId},${String(v.media?.id||v.media_id||"")},${username},${body}) ON CONFLICT(company_id,comment_id) DO NOTHING RETURNING id`;if(!inserted.length)return;
 const s=await sql`SELECT comment_reply_enabled,comment_reply_text FROM studio_company_instagram_settings WHERE company_id=${account.company_id} LIMIT 1`;
 if(s[0]?.comment_reply_enabled){const token=await getInstagramToken(sql,account.company_id);if(token){const r=await fetch(`https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_API_VERSION||"v26.0"}/${commentId}/replies`,{method:"POST",headers:{Authorization:"Bearer "+token.token,"Content-Type":"application/json"},body:JSON.stringify({message:s[0].comment_reply_text})});const d=await r.json().catch(()=>({}));await sql`UPDATE studio_instagram_comments SET reply_text=${s[0].comment_reply_text},status=${r.ok?"replied":"reply_failed"} WHERE company_id=${account.company_id} AND comment_id=${commentId}`;if(!r.ok)console.error("Instagram comment reply failed:",d.error?.message);}}
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method==="GET"){const url=new URL(req.url,"https://localhost"),mode=url.searchParams.get("hub.mode"),token=url.searchParams.get("hub.verify_token"),challenge=url.searchParams.get("hub.challenge");if(mode==="subscribe"&&token&&token===process.env.INSTAGRAM_VERIFY_TOKEN&&challenge){res.setHeader("Content-Type","text/plain");return res.status(200).send(challenge);}return res.status(403).send("Webhook verification failed");}
 if(req.method!=="POST"){res.setHeader("Allow","GET, POST");return res.status(405).send("Method not allowed");}
 const raw=await rawBody(req);if(!validSignature(raw,req.headers["x-hub-signature-256"]))return res.status(401).send("Invalid signature");
 let payload;try{payload=JSON.parse(raw.toString("utf8"));}catch{return res.status(400).send("Invalid JSON");}
 if(payload.object!=="instagram")return res.status(200).send("Ignored");
 try{const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);await ensureInstagramSchema(sql);for(const entry of payload.entry||[]){for(const m of entry.messaging||[])await handleMessage(sql,entry,m);for(const change of entry.changes||[])if(change.field==="comments")await handleComment(sql,entry,change);}return res.status(200).send("EVENT_RECEIVED");}
 catch(error){console.error("Instagram webhook failed:",error.message);return res.status(500).send("Webhook processing failed");}
}
