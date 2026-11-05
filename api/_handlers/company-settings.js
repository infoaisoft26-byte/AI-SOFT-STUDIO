import { db } from "../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser } from "../_lib/company.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!["GET","POST"].includes(req.method)){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});}
 const user=await requireCompanyUser(req,res,["owner","manager"]);if(!user)return;
 let body={};if(req.method==="POST"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
 try{
  const sql=db();await ensureCompanySchema(sql);
  if(req.method==="GET"){
   const rows=await sql`SELECT auto_reply_enabled,auto_reply_text FROM studio_company_settings WHERE company_id=${user.company_id} LIMIT 1`;
   return res.status(200).json(rows[0]||{auto_reply_enabled:true,auto_reply_text:"Thanks for contacting us. We have received your message and our team will get back to you shortly."});
  }
  const enabled=body.autoReplyEnabled===true,text=String(body.autoReplyText||"").trim().slice(0,1000);
  if(!text)return res.status(400).json({error:"Enter an automatic reply message."});
  const rows=await sql`INSERT INTO studio_company_settings(company_id,auto_reply_enabled,auto_reply_text,updated_at)
   VALUES(${user.company_id},${enabled},${text},NOW())
   ON CONFLICT(company_id) DO UPDATE SET auto_reply_enabled=EXCLUDED.auto_reply_enabled,auto_reply_text=EXCLUDED.auto_reply_text,updated_at=NOW()
   RETURNING auto_reply_enabled,auto_reply_text`;
  return res.status(200).json({ok:true,settings:rows[0]});
 }catch(error){console.error("Company settings failed:",error.message);return res.status(503).json({error:"Company settings could not be saved."});}
}
