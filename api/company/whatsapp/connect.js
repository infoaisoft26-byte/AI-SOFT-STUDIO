import { db } from "../../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser,encryptCompanyToken } from "../../_lib/company.js";

const version=process.env.WHATSAPP_GRAPH_API_VERSION||"v26.0";
const idOk=v=>/^\d{5,30}$/.test(String(v||""));
async function graph(path,token,init={}){
  const response=await fetch(`https://graph.facebook.com/${version}/${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...(init.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error?.message||"Meta connection request failed.");
  return data;
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(!["GET","POST"].includes(req.method)){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});}
  const user=await requireCompanyUser(req,res,["owner"]);if(!user)return;
  try{
    const sql=db();await ensureCompanySchema(sql);
    if(req.method==="GET"){
      const rows=await sql`SELECT status,display_phone,connected_at FROM studio_company_whatsapp WHERE company_id=${user.company_id} LIMIT 1`;
      return res.status(200).json({enabled:Boolean(process.env.META_APP_ID&&process.env.META_WHATSAPP_CONFIG_ID&&process.env.META_APP_SECRET&&process.env.META_TOKEN_ENCRYPTION_KEY),appId:process.env.META_APP_ID||null,configId:process.env.META_WHATSAPP_CONFIG_ID||null,connection:rows[0]||{status:"not_connected",display_phone:null}});
    }
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const code=String(body.code||"").trim(),wabaId=String(body.wabaId||""),phoneNumberId=String(body.phoneNumberId||"");
    if(code.length<20||code.length>4096)return res.status(400).json({error:"Meta signup code is missing or invalid. Please connect again."});
    if(!idOk(wabaId))return res.status(400).json({error:"WhatsApp Business Account could not be identified. Please repeat signup and finish the Meta popup."});
    if(!process.env.META_APP_ID||!process.env.META_APP_SECRET||!process.env.META_TOKEN_ENCRYPTION_KEY||process.env.META_TOKEN_ENCRYPTION_KEY.length<32)
      return res.status(503).json({error:"WhatsApp connection is not fully configured yet. Ask the platform administrator to finish setup."});
    const params=new URLSearchParams({client_id:process.env.META_APP_ID,client_secret:process.env.META_APP_SECRET,code});
    const tokenData=await graph("oauth/access_token?"+params.toString(),"");
    const token=tokenData.access_token;
    if(!token)throw new Error("Meta did not return a business access token.");
    const phoneData=await graph(wabaId+"/phone_numbers?fields=id,display_phone_number,verified_name&limit=100",token);
    const phones=phoneData.data||[];
    const selected=phoneNumberId?phones.find(x=>String(x.id)===phoneNumberId):phones[0];
    if(!selected)throw new Error("The selected WhatsApp phone number was not found in the connected business account.");
    const subscribed=await graph(wabaId+"/subscribed_apps",token,{method:"POST"});
    if(subscribed.success!==true)throw new Error("Meta did not confirm webhook subscription. Please retry the connection.");
    const encrypted=encryptCompanyToken(token);
    await sql`INSERT INTO studio_company_whatsapp(company_id,business_account_id,phone_number_id,display_phone,encrypted_access_token,status,connected_at,updated_at)
      VALUES(${user.company_id},${wabaId},${String(selected.id)},${selected.display_phone_number||null},${encrypted},'connected',NOW(),NOW())
      ON CONFLICT(company_id) DO UPDATE SET business_account_id=EXCLUDED.business_account_id,phone_number_id=EXCLUDED.phone_number_id,
      display_phone=EXCLUDED.display_phone,encrypted_access_token=EXCLUDED.encrypted_access_token,status='connected',connected_at=NOW(),updated_at=NOW()`;
    await sql`INSERT INTO studio_company_settings(company_id) VALUES(${user.company_id}) ON CONFLICT(company_id) DO NOTHING`;
    await sql`INSERT INTO admin_audit(action,actor,entity_type,entity_id) VALUES('company.whatsapp.connected',${user.email},'company',${user.company_id})`;
    return res.status(200).json({ok:true,connection:{status:"connected",displayPhone:selected.display_phone_number||null,verifiedName:selected.verified_name||null},message:"WhatsApp Business account connected."});
  }catch(error){
    console.error("Company WhatsApp connect failed:",error.message);
    return res.status(400).json({error:error.message||"Could not connect WhatsApp. Please try again."});
  }
}
