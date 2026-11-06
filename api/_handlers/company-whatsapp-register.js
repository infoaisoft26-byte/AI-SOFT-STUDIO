import { db } from "../../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser,decryptCompanyToken } from "../../_lib/company.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
 const user=await requireCompanyUser(req,res,["owner"]);if(!user)return;
 let body={};try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}
 const pin=String(body.pin||"").trim();if(!/^\d{6}$/.test(pin))return res.status(400).json({error:"Enter the 6-digit WhatsApp two-step verification PIN."});
 try{
  const sql=db();await ensureCompanySchema(sql);
  const rows=await sql`SELECT phone_number_id,encrypted_access_token,status FROM studio_company_whatsapp WHERE company_id=${user.company_id} LIMIT 1`;
  const wa=rows[0];if(!wa?.encrypted_access_token)return res.status(409).json({error:"Connect the WhatsApp Business account first."});
  if(wa.status==="connected")return res.status(200).json({ok:true,message:"This WhatsApp number is already active."});
  const token=decryptCompanyToken(wa.encrypted_access_token);
  const response=await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_API_VERSION||"v26.0"}/${wa.phone_number_id}/register`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",pin})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!(data.success===true||data.success==="true"))return res.status(400).json({error:data.error?.message||"Meta could not activate this phone number. Check the PIN and number status."});
  await sql`UPDATE studio_company_whatsapp SET status='connected',updated_at=NOW() WHERE company_id=${user.company_id}`;
  return res.status(200).json({ok:true,message:"Your WhatsApp number is now active."});
 }catch(error){console.error("Company WhatsApp registration failed:",error.message);return res.status(503).json({error:error.message||"WhatsApp activation failed."});}
}
