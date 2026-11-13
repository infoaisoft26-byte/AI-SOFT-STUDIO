import { db } from "../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
import { ensureInstagramSchema,getInstagramToken,sendInstagramText,IG_VERSION } from "../_lib/instagram.js";

export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 try{
  const user=await requireCompanyUser(req,res);if(!user)return;
  const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);await ensureInstagramSchema(sql);
  if(req.method==="GET"){
   const [connection,contacts,messages,comments,settings]=await Promise.all([
    sql`SELECT username,status,token_expires_at FROM studio_company_instagram WHERE company_id=${user.company_id} LIMIT 1`,
    sql`SELECT id,ig_scoped_id,username,name,lead_status,last_message_at FROM studio_instagram_contacts WHERE company_id=${user.company_id} ORDER BY last_message_at DESC NULLS LAST LIMIT 200`,
    sql`SELECT m.id,m.contact_id,m.direction,m.message_type,m.body,m.status,m.created_at,c.username,c.name,c.ig_scoped_id FROM studio_instagram_messages m LEFT JOIN studio_instagram_contacts c ON c.id=m.contact_id WHERE m.company_id=${user.company_id} ORDER BY m.created_at DESC LIMIT 300`,
    sql`SELECT comment_id,media_id,username,text,reply_text,status,created_at FROM studio_instagram_comments WHERE company_id=${user.company_id} ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT auto_reply_enabled,ai_reply_enabled,auto_reply_text,comment_reply_enabled,comment_reply_text FROM studio_company_instagram_settings WHERE company_id=${user.company_id} LIMIT 1`
   ]);
   return res.status(200).json({connection:connection[0]||{status:"not_connected"},contacts,messages,comments,settings:settings[0]||{auto_reply_enabled:false,ai_reply_enabled:false,comment_reply_enabled:false}});
  }
  if(req.method==="POST"){
   const entitlement=await sql`SELECT c.status,COALESCE(p.instagram_enabled,FALSE) AS instagram_enabled FROM studio_companies c LEFT JOIN studio_saas_plans p ON p.plan_key=c.plan WHERE c.id=${user.company_id} LIMIT 1`;
   if(entitlement[0]?.status!=="trial"&&!entitlement[0]?.instagram_enabled)return res.status(403).json({error:"Instagram is not included in your current plan."});
   const body=typeof req.body==="object"&&req.body?req.body:{};
   if(body.action==="reply"){
    const contactId=Number(body.contactId),message=String(body.text||"").trim();
    if(!Number.isSafeInteger(contactId)||contactId<1||!message||message.length>1000)return res.status(400).json({error:"Choose a contact and enter a message under 1,000 characters."});
    const quotaRows=await sql`SELECT c.status,COALESCE(p.message_quota,0)::int AS plan_quota,s.trial_message_quota FROM studio_companies c LEFT JOIN studio_saas_plans p ON p.plan_key=c.plan CROSS JOIN studio_saas_settings s WHERE c.id=${user.company_id} AND s.id=1 LIMIT 1`;
    const usageRows=await sql`SELECT COALESCE(SUM(quantity),0)::int AS used FROM studio_saas_usage WHERE company_id=${user.company_id} AND channel='instagram' AND created_at>=date_trunc('month',NOW())`;
    const messageLimit=quotaRows[0]?.status==="trial"?Number(quotaRows[0]?.trial_message_quota||0):Number(quotaRows[0]?.plan_quota||0);
    if(Number(usageRows[0]?.used||0)>=messageLimit)return res.status(429).json({error:"Your Instagram message quota is exhausted. Upgrade your plan to continue."});
    const token=await getInstagramToken(sql,user.company_id);if(!token)return res.status(409).json({error:"Connect an Instagram professional account first."});
    const contacts=await sql`SELECT id,ig_scoped_id FROM studio_instagram_contacts WHERE id=${contactId} AND company_id=${user.company_id} LIMIT 1`;
    if(!contacts.length)return res.status(404).json({error:"Instagram contact not found."});
    const response=await sendInstagramText(token.igUserId,token.token,contacts[0].ig_scoped_id,message);
    const mid=response.message_id||response.id||null;
    await sql`INSERT INTO studio_instagram_messages(company_id,contact_id,mid,direction,message_type,body,status) VALUES(${user.company_id},${contactId},${mid},'outbound','text',${message},'sent') ON CONFLICT(company_id,mid) DO NOTHING`;
    await sql`INSERT INTO studio_saas_usage(company_id,channel,event_type,quantity) VALUES(${user.company_id},'instagram','message',1)`;
    return res.status(200).json({ok:true,message:"Instagram reply sent."});
   }
   if(body.action==="publish"){
    if(!["IMAGE","REELS"].includes(String(body.mediaType||"IMAGE")))return res.status(400).json({error:"Choose an image or Reel publication."});
    const mediaUrl=String(body.mediaUrl||"").trim(),caption=String(body.caption||"").trim().slice(0,2200);
    let parsed;try{parsed=new URL(mediaUrl)}catch{return res.status(400).json({error:"Enter a valid public media URL."});}
    if(parsed.protocol!=="https:")return res.status(400).json({error:"Media URL must use HTTPS and be publicly accessible to Meta."});
    const token=await getInstagramToken(sql,user.company_id);if(!token)return res.status(409).json({error:"Connect Instagram first."});
    const base=`https://graph.instagram.com/${IG_VERSION}/${token.igUserId}`;
    const params=new URLSearchParams({caption,access_token:token.token});
    if(body.mediaType==="REELS"){params.set("media_type","REELS");params.set("video_url",mediaUrl);params.set("share_to_feed","true");}
    else params.set("image_url",mediaUrl);
    const create=await fetch(base+"/media",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
    const created=await create.json().catch(()=>({}));if(!create.ok||!created.id)throw new Error(created.error?.message||"Instagram media container creation failed.");
    const publish=await fetch(base+"/media_publish",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({creation_id:created.id,access_token:token.token})});
    const published=await publish.json().catch(()=>({}));if(!publish.ok||!published.id)throw new Error(published.error?.message||"Instagram publication failed.");
    await sql`INSERT INTO studio_instagram_publications(company_id,ig_media_id,media_type,caption,media_url,status) VALUES(${user.company_id},${published.id},${body.mediaType},${caption},${mediaUrl},'published')`;
    return res.status(200).json({ok:true,mediaId:published.id,message:"Instagram post published."});
   }
   if(body.action==="insights"){
    const token=await getInstagramToken(sql,user.company_id);if(!token)return res.status(409).json({error:"Connect Instagram first."});
    const url=new URL(`https://graph.instagram.com/${IG_VERSION}/${token.igUserId}/insights`);url.searchParams.set("metric","reach,profile_views,total_interactions");url.searchParams.set("period","day");url.searchParams.set("access_token",token.token);
    const r=await fetch(url);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error?.message||"Instagram insights unavailable.");
    return res.status(200).json({insights:data.data||[]});
   }
  }
  res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});
 }catch(error){console.error("Instagram workspace API failed:",error.message);return res.status(503).json({error:error.message||"Instagram workspace unavailable."});}
}
