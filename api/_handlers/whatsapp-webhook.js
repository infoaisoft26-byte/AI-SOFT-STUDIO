import { createHmac,timingSafeEqual } from "node:crypto";
import { db,ensureSchema } from "../_lib/db.js";
import { ensureCompanySchema,decryptCompanyToken } from "../_lib/company.js";
import { sendText } from "../_lib/whatsapp.js";
export const config={api:{bodyParser:false}};
async function readRawBody(req){const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks);}
function validSignature(raw,signature){const secret=process.env.META_APP_SECRET;if(!secret||!signature?.startsWith("sha256="))return false;const expected=Buffer.from("sha256="+createHmac("sha256",secret).update(raw).digest("hex"));const supplied=Buffer.from(signature);return expected.length===supplied.length&&timingSafeEqual(expected,supplied);}
async function sendCompanyText(phoneId,token,to,body){
 const response=await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_API_VERSION||"v26.0"}/${phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body:String(body).slice(0,4096)}})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.message||"Company WhatsApp send failed.");return data;
}
async function processCompanyEntry(sql,entry,change){
 const value=change.value||{},phoneId=String(value.metadata?.phone_number_id||"");
 if(!phoneId)return false;
 const rows=await sql`SELECT w.company_id,w.phone_number_id,w.encrypted_access_token,c.name AS company_name
  FROM studio_company_whatsapp w JOIN studio_companies c ON c.id=w.company_id
  WHERE w.phone_number_id=${phoneId} AND w.status='connected' LIMIT 1`;
 const wa=rows[0];if(!wa)return false;
 const token=decryptCompanyToken(wa.encrypted_access_token);
 for(const message of value.messages||[]){
  const phone=String(message.from||"").replace(/\D/g,"");if(!phone||!message.id)continue;
  const profile=(value.contacts||[]).find(x=>x.wa_id===message.from)?.profile?.name||null;
  const body=message.text?.body||(message.type==="button"?message.button?.text:null)||`[${message.type||"message"} message]`;
  const contactRows=await sql`INSERT INTO studio_company_contacts(company_id,phone,name,last_message_at)
   VALUES(${wa.company_id},${phone},${profile},NOW())
   ON CONFLICT(company_id,phone) DO UPDATE SET name=COALESCE(EXCLUDED.name,studio_company_contacts.name),last_message_at=NOW()
   RETURNING id,phone`;
  const contact=contactRows[0];
  const inserted=await sql`INSERT INTO studio_company_messages(company_id,contact_id,wamid,direction,message_type,body,status)
   VALUES(${wa.company_id},${contact.id},${message.id},'inbound',${message.type||"unknown"},${body},'received')
   ON CONFLICT(wamid) DO NOTHING RETURNING id`;
  if(!inserted.length)continue;
  const settings=await sql`SELECT auto_reply_enabled,auto_reply_text FROM studio_company_settings WHERE company_id=${wa.company_id} LIMIT 1`;
  if(settings[0]?.auto_reply_enabled){
   const reply=String(settings[0].auto_reply_text||"Thanks for contacting us. Our team will get back to you shortly.").replace(/\{company\}/g,wa.company_name);
   try{const sent=await sendCompanyText(wa.phone_number_id,token,phone,reply);const wamid=sent.messages?.[0]?.id||null;
    await sql`INSERT INTO studio_company_messages(company_id,contact_id,wamid,direction,message_type,body,status)
     VALUES(${wa.company_id},${contact.id},${wamid},'outbound','text',${reply},'sent') ON CONFLICT(wamid) DO NOTHING`;
   }catch(error){console.error("Company WhatsApp auto-reply failed:",error.message);}
  }
 }
 for(const status of value.statuses||[]){
  await sql`UPDATE studio_company_messages SET status=${status.status||"updated"} WHERE wamid=${status.id} AND company_id=${wa.company_id} AND direction='outbound'`;
  const changed=await sql`UPDATE studio_whatsapp_campaign_recipients SET status=${status.status||"updated"},updated_at=NOW() WHERE wamid=${status.id} AND company_id=${wa.company_id} AND status IS DISTINCT FROM ${status.status||"updated"} RETURNING campaign_id`;
  for(const row of changed){if(status.status==="delivered")await sql`UPDATE studio_whatsapp_campaigns SET delivered_count=delivered_count+1 WHERE id=${row.campaign_id}`;else if(status.status==="read")await sql`UPDATE studio_whatsapp_campaigns SET read_count=read_count+1 WHERE id=${row.campaign_id}`;else if(status.status==="failed")await sql`UPDATE studio_whatsapp_campaigns SET failed_count=failed_count+1 WHERE id=${row.campaign_id}`;}
 }
 return true;
}
async function sendAndStore(sql,contactId,phone,body){const result=await sendText(phone,body);const wamid=result.messages?.[0]?.id||null;await sql`INSERT INTO whatsapp_messages(contact_id,wamid,direction,message_type,body,status) VALUES(${contactId},${wamid},'outbound','text',${body},'sent') ON CONFLICT(wamid) DO NOTHING`;}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method==="GET"){
  const url=new URL(req.url,"https://localhost"),mode=url.searchParams.get("hub.mode"),token=url.searchParams.get("hub.verify_token"),challenge=url.searchParams.get("hub.challenge");
  if(mode==="subscribe"&&token&&token===process.env.WHATSAPP_VERIFY_TOKEN&&challenge){res.setHeader("Content-Type","text/plain");return res.status(200).send(challenge);}
  return res.status(403).send("Webhook verification failed");
 }
 if(req.method!=="POST"){res.setHeader("Allow","GET, POST");return res.status(405).send("Method not allowed");}
 let raw;try{raw=await readRawBody(req);}catch{return res.status(400).send("Invalid body");}
 if(!validSignature(raw,req.headers["x-hub-signature-256"]))return res.status(401).send("Invalid signature");
 let payload;try{payload=JSON.parse(raw.toString("utf8"));}catch{return res.status(400).send("Invalid JSON");}
 if(payload.object!=="whatsapp_business_account")return res.status(200).send("Ignored");
 try{
  const sql=db();await ensureSchema(sql);await ensureCompanySchema(sql);
  for(const entry of payload.entry||[]){
   for(const change of entry.changes||[]){
    const value=change.value||{};
    const companyHandled=await processCompanyEntry(sql,entry,change);
    if(companyHandled)continue;
    const inboundPhoneId=String(value.metadata?.phone_number_id||"");
    if(inboundPhoneId && inboundPhoneId!==String(process.env.WHATSAPP_PHONE_NUMBER_ID||"")) continue;
    for(const message of value.messages||[]){
     const phone=String(message.from||"").replace(/\D/g,"");if(!phone||!message.id)continue;
     const profile=(value.contacts||[]).find(x=>x.wa_id===message.from)?.profile?.name||null;
     const body=message.text?.body||(message.type==="button"?message.button?.text:null)||`[${message.type||"message"} message]`;
     const contactRows=await sql`INSERT INTO whatsapp_contacts(phone,name,last_message_at,updated_at) VALUES(${phone},${profile},NOW(),NOW())
      ON CONFLICT(phone) DO UPDATE SET name=COALESCE(EXCLUDED.name,whatsapp_contacts.name),last_message_at=NOW(),updated_at=NOW() RETURNING id,phone`;
     const contact=contactRows[0];
     const inserted=await sql`INSERT INTO whatsapp_messages(contact_id,wamid,direction,message_type,body,raw_payload)
      VALUES(${contact.id},${message.id},'inbound',${message.type||"unknown"},${body},${JSON.stringify(message)}::jsonb)
      ON CONFLICT(wamid) DO NOTHING RETURNING id`;
     if(!inserted.length)continue;
     if(process.env.WHATSAPP_AUTO_REPLY!=="false"){
      const reply=process.env.WHATSAPP_AUTO_REPLY_TEXT||"Thanks for contacting AI SOFT STUDIO. We received your message and our team will get back to you shortly.";
      try{await sendAndStore(sql,contact.id,phone,reply);}catch(error){console.error("WhatsApp auto-reply failed:",error.message);}
     }
     const adminPhone=String(process.env.WHATSAPP_ADMIN_PHONE||"").replace(/\D/g,"");
     if(adminPhone){const alert=`New WhatsApp enquiry from ${profile||phone}: ${String(body).slice(0,500)}`;try{await sendText(adminPhone,alert);}catch(error){console.error("WhatsApp admin alert failed:",error.message);}}
    }
    for(const status of value.statuses||[])await sql`UPDATE whatsapp_messages SET status=${status.status||"updated"} WHERE wamid=${status.id} AND direction='outbound'`;
   }
  }
  return res.status(200).send("EVENT_RECEIVED");
 }catch(error){console.error("WhatsApp webhook processing failed:",error.message);return res.status(500).send("Webhook processing failed");}
}
