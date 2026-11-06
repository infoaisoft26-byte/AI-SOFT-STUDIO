import { db } from "../../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser,decryptCompanyToken } from "../../_lib/company.js";
import { checkWhatsappQuota,recordWhatsappUsage } from "../../_lib/saas-usage.js";
const version=process.env.WHATSAPP_GRAPH_API_VERSION||"v26.0";
async function send(phoneId,token,to,text){
  const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body:text}})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error?.message||"WhatsApp message could not be sent.");
  return data;
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST"].includes(req.method)){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});}
  const user=await requireCompanyUser(req,res);if(!user)return;
  let body={};if(req.method==="POST"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
  try{
    const sql=db();await ensureCompanySchema(sql);
    if(req.method==="GET"){
      const [messages,contacts]=await Promise.all([
        sql`SELECT m.id,m.contact_id,m.direction,m.message_type,m.body,m.status,m.created_at,c.phone,c.name
          FROM studio_company_messages m LEFT JOIN studio_company_contacts c ON c.id=m.contact_id
          WHERE m.company_id=${user.company_id} ORDER BY m.created_at DESC LIMIT 100`,
        sql`SELECT id,phone,name,lead_status,assigned_user_id,last_message_at FROM studio_company_contacts
          WHERE company_id=${user.company_id} ORDER BY COALESCE(last_message_at,created_at) DESC LIMIT 200`
      ]);
      return res.status(200).json({messages,contacts});
    }
    const contactId=Number(body.contactId),text=String(body.text||"").trim().slice(0,4096);
    if(!Number.isSafeInteger(contactId)||contactId<1||!text)return res.status(400).json({error:"Choose a contact and enter a message."});
    const [contactRows,waRows]=await Promise.all([
      sql`SELECT id,phone FROM studio_company_contacts WHERE id=${contactId} AND company_id=${user.company_id} LIMIT 1`,
      sql`SELECT phone_number_id,encrypted_access_token,status FROM studio_company_whatsapp WHERE company_id=${user.company_id} LIMIT 1`
    ]);
    if(!contactRows.length)return res.status(404).json({error:"Contact not found in this company."});
    const wa=waRows[0];if(!wa||wa.status!=="connected"||!wa.encrypted_access_token) return res.status(409).json({error:"Connect your company's WhatsApp number first."});
    const quota=await checkWhatsappQuota(sql,user);
    if(!quota.allowed)return res.status(429).json({error:quota.error});
    const token=decryptCompanyToken(wa.encrypted_access_token);
    const result=await send(wa.phone_number_id,token,contactRows[0].phone,text);
    const wamid=result.messages?.[0]?.id||null;
    await sql`INSERT INTO studio_company_messages(company_id,contact_id,wamid,direction,message_type,body,status,assigned_user_id)
      VALUES(${user.company_id},${contactId},${wamid},'outbound','text',${text},'sent',${user.id}) ON CONFLICT(wamid) DO NOTHING`;
    await sql`UPDATE studio_company_contacts SET last_message_at=NOW() WHERE id=${contactId} AND company_id=${user.company_id}`;
    await recordWhatsappUsage(sql,user.company_id);
    return res.status(200).json({ok:true,messageId:wamid});
  }catch(error){console.error("Company WhatsApp messages failed:",error.message);return res.status(503).json({error:error.message||"Company inbox is unavailable."});}
}
