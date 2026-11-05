import { db } from "../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser,decryptCompanyToken } from "../_lib/company.js";
import { ensureSaasSchema,checkResourceQuota,checkWhatsappQuota } from "../_lib/saas-usage.js";
const version=process.env.WHATSAPP_GRAPH_API_VERSION||"v26.0";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");if(!["GET","POST"].includes(req.method)){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});}
 const user=await requireCompanyUser(req,res,["owner","manager"]);if(!user)return;
 let body={};if(req.method==="POST"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
 try{
  const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);
  if(req.method==="GET"){
   const [campaigns,counts]=await Promise.all([
    sql`SELECT id,template_name,language,status,total_count,sent_count,delivered_count,read_count,failed_count,created_at FROM studio_whatsapp_campaigns WHERE company_id=${user.company_id} ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE opted_in=TRUE)::int AS opted_in FROM studio_company_contacts WHERE company_id=${user.company_id}`
   ]);return res.status(200).json({campaigns,contacts:counts[0]});
  }
  if(body.action!=="create")return res.status(400).json({error:"Unknown campaign action."});
  const resource=await checkResourceQuota(sql,user,"campaign");if(!resource.allowed)return res.status(429).json({error:resource.error});
  const template=String(body.templateName||"").trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,512);
  const language=String(body.language||"en").trim().slice(0,20);
  const components=Array.isArray(body.components)?body.components.slice(0,10):[];
  if(!template)return res.status(400).json({error:"Approved WhatsApp template name is required."});
  const wa=await sql`SELECT phone_number_id,encrypted_access_token,status,business_account_id FROM studio_company_whatsapp WHERE company_id=${user.company_id} LIMIT 1`;
  if(!wa[0]||wa[0].status!=="connected")return res.status(409).json({error:"Connect your WhatsApp Business number first."});
  const token=decryptCompanyToken(wa[0].encrypted_access_token);
  const check=await fetch("https://graph.facebook.com/"+version+"/"+wa[0].business_account_id+"/message_templates?name="+encodeURIComponent(template)+"&fields=name,status,language",{headers:{Authorization:"Bearer "+token}});
  const templateData=await check.json().catch(()=>({}));
  if(!check.ok||!(templateData.data||[]).some(x=>x.name===template&&x.status==="APPROVED"&&x.language===language))return res.status(400).json({error:"This template is not approved for the selected language in Meta."});
  const contacts=await sql`SELECT id,phone FROM studio_company_contacts WHERE company_id=${user.company_id} AND opted_in=TRUE ORDER BY id LIMIT 10000`;
  if(!contacts.length)return res.status(400).json({error:"No opted-in contacts. Campaigns can only be sent to contacts with recorded WhatsApp consent."});
  const msgQuota=await checkWhatsappQuota(sql,user);if(!msgQuota.allowed)return res.status(429).json({error:msgQuota.error});
  if(contacts.length>msgQuota.quota-msgQuota.messagesUsed)return res.status(429).json({error:"Your remaining message quota is lower than the opted-in audience size."});
  const rows=await sql`INSERT INTO studio_whatsapp_campaigns(company_id,created_by,template_name,language,components,status,total_count) VALUES(${user.company_id},${user.id},${template},${language},${JSON.stringify(components)}::jsonb,'queued',${contacts.length}) RETURNING id`;
  const campaignId=rows[0].id;
  for(const contact of contacts)await sql`INSERT INTO studio_whatsapp_campaign_recipients(campaign_id,company_id,contact_id,phone) VALUES(${campaignId},${user.company_id},${contact.id},${contact.phone}) ON CONFLICT(campaign_id,phone) DO NOTHING`;
  return res.status(201).json({ok:true,campaignId,queued:contacts.length,message:"Campaign queued. Approved templates will be sent in background batches."});
 }catch(error){console.error("Company campaigns API:",error.message);return res.status(503).json({error:"Campaign service is temporarily unavailable."});}
}