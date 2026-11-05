import { db } from "../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");if(!["GET","PATCH"].includes(req.method)){res.setHeader("Allow","GET, PATCH");return res.status(405).json({error:"Method not allowed"});}
 const user=await requireCompanyUser(req,res,["owner","manager"]);if(!user)return;
 let body={};if(req.method==="PATCH"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
 try{const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);
  await sql`ALTER TABLE studio_company_contacts ADD COLUMN IF NOT EXISTS opted_in_at TIMESTAMPTZ`;
  await sql`ALTER TABLE studio_company_contacts ADD COLUMN IF NOT EXISTS opt_in_source TEXT`;
  await sql`ALTER TABLE studio_company_contacts ADD COLUMN IF NOT EXISTS opt_in_proof TEXT`;
  if(req.method==="GET"){const contacts=await sql`SELECT id,phone,name,opted_in,opted_in_at,opt_in_source,lead_status FROM studio_company_contacts WHERE company_id=${user.company_id} ORDER BY created_at DESC LIMIT 500`;return res.status(200).json({contacts});}
  const id=Number(body.contactId),optedIn=body.optedIn===true,source=String(body.source||"").trim().slice(0,80),proof=String(body.proof||"").trim().slice(0,500);
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:"Invalid contact."});
  if(optedIn&&(!source||!proof))return res.status(400).json({error:"Record how and when this customer gave WhatsApp consent before enabling campaigns."});
  const rows=await sql`UPDATE studio_company_contacts SET opted_in=${optedIn},opted_in_at=CASE WHEN ${optedIn} THEN NOW() ELSE NULL END,opt_in_source=CASE WHEN ${optedIn} THEN ${source} ELSE NULL END,opt_in_proof=CASE WHEN ${optedIn} THEN ${proof} ELSE NULL END WHERE id=${id} AND company_id=${user.company_id} RETURNING id,phone,opted_in,opted_in_at`;
  if(!rows.length)return res.status(404).json({error:"Contact not found."});
  await sql`INSERT INTO admin_audit(action,actor,entity_type,entity_id) VALUES('company.contact.consent.updated',${user.email},'company_contact',${id})`;
  return res.status(200).json({ok:true,contact:rows[0]});
 }catch(error){console.error("Contact consent API:",error.message);return res.status(503).json({error:"Contact consent could not be updated."});}
}
