import { db } from "../_lib/db.js";
import { ensureCompanySchema,decryptCompanyToken } from "../_lib/company.js";
import { ensureSaasSchema,checkWhatsappQuota,recordWhatsappUsage } from "../_lib/saas-usage.js";
const version=process.env.WHATSAPP_GRAPH_API_VERSION||"v26.0";
async function sendTemplate(phoneId,token,to,name,language,components){
 const r=await fetch("https://graph.facebook.com/"+version+"/"+phoneId+"/messages",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to,type:"template",template:{name,language:{code:language},...(components?.length?{components}:{})}})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message||"Template send failed");return d;
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
 if(!process.env.CRON_SECRET||req.headers.authorization!=="Bearer "+process.env.CRON_SECRET)return res.status(401).json({error:"Unauthorized"});
 try{
  const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);
  const jobs=await sql`WITH picked AS (
   SELECT id FROM studio_whatsapp_campaign_recipients WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10
  ) UPDATE studio_whatsapp_campaign_recipients r SET status='processing',attempts=attempts+1,updated_at=NOW()
    FROM picked WHERE r.id=picked.id RETURNING r.id,r.campaign_id,r.company_id,r.contact_id,r.phone`;
  let sent=0,failed=0;
  for(const job of jobs){
   try{
    const [campaign,wa,userRows]=await Promise.all([
     sql`SELECT template_name,language,components FROM studio_whatsapp_campaigns WHERE id=${job.campaign_id}`,
     sql`SELECT phone_number_id,encrypted_access_token FROM studio_company_whatsapp WHERE company_id=${job.company_id} AND status='connected' LIMIT 1`,
     sql`SELECT c.status AS company_status,c.plan FROM studio_companies c WHERE c.id=${job.company_id}`
    ]);
    if(!campaign[0]||!wa[0])throw new Error("WhatsApp account or campaign is not connected.");
    const q=await checkWhatsappQuota(sql,{company_id:job.company_id,company_status:userRows[0]?.company_status});
    if(!q.allowed)throw new Error(q.error);
    await recordWhatsappUsage(sql,job.company_id);
    const token=decryptCompanyToken(wa[0].encrypted_access_token);
    const result=await sendTemplate(wa[0].phone_number_id,token,job.phone,campaign[0].template_name,campaign[0].language,campaign[0].components||[]);
    const wamid=result.messages?.[0]?.id||null;
    await sql`UPDATE studio_whatsapp_campaign_recipients SET status='sent',wamid=${wamid},updated_at=NOW() WHERE id=${job.id}`;
    await sql`INSERT INTO studio_company_messages(company_id,contact_id,wamid,direction,message_type,body,status) VALUES(${job.company_id},${job.contact_id},${wamid},'outbound','template',${campaign[0].template_name},'sent') ON CONFLICT(wamid) DO NOTHING`;
    await sql`UPDATE studio_whatsapp_campaigns SET sent_count=sent_count+1,status='sending',updated_at=NOW() WHERE id=${job.campaign_id}`;sent++;
   }catch(error){
    await sql`UPDATE studio_whatsapp_campaign_recipients SET status='failed',error=${String(error.message||"Send failed").slice(0,500)},updated_at=NOW() WHERE id=${job.id}`;
    await sql`UPDATE studio_whatsapp_campaigns SET failed_count=failed_count+1,updated_at=NOW() WHERE id=${job.campaign_id}`;failed++;
   }
  }
  await sql`UPDATE studio_whatsapp_campaigns c SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM studio_whatsapp_campaign_recipients r WHERE r.campaign_id=c.id AND r.status IN ('queued','processing')) THEN 'completed' ELSE 'sending' END,updated_at=NOW() WHERE c.status IN ('queued','sending')`;
  return res.status(200).json({ok:true,processed:jobs.length,sent,failed});
 }catch(error){console.error("WhatsApp campaign worker:",error.message);return res.status(500).json({error:"Campaign worker failed."});}
}