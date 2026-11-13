import { db } from "../_lib/db.js";
import { ensureCompanySchema } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
import { ensureInstagramSchema, instagramRedirectUri, hashState, verifyOAuthState, encryptCompanyToken } from "../_lib/instagram.js";

function finish(res,message,ok=false){res.setHeader("Content-Type","text/html; charset=utf-8");return res.status(ok?200:400).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Instagram connection</title></head><body style="font:16px system-ui;background:#080808;color:#f6f2e9;padding:40px"><h2>${ok?"Instagram connected":"Instagram connection not completed"}</h2><p>${String(message).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}</p><p>You can close this tab and return to your AI SOFT STUDIO workspace.</p><script>if(window.opener){window.opener.postMessage({type:"AISOFT_INSTAGRAM_OAUTH",ok:${ok}},"*")}</script></body></html>`);}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).send("Method not allowed");}
 if(req.query?.error)return finish(res,req.query.error_description||req.query.error);
 const code=String(req.query?.code||""),state=String(req.query?.state||"");
 const verified=verifyOAuthState(state);if(!code||!verified)return finish(res,"Invalid or expired OAuth state. Please reconnect from your workspace.");
 try{
  const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);await ensureInstagramSchema(sql);
  const rows=await sql`UPDATE studio_instagram_oauth_states SET used_at=NOW() WHERE state_hash=${hashState(state)} AND company_id=${verified.companyId} AND used_at IS NULL AND expires_at>NOW() RETURNING company_id`;
  if(!rows.length)return finish(res,"This connection link has expired or has already been used. Please reconnect.");
  const appRows=await sql`SELECT meta_app_id FROM studio_saas_settings WHERE id=1 LIMIT 1`;
  const appId=process.env.INSTAGRAM_APP_ID||appRows[0]?.meta_app_id||"",secret=process.env.META_APP_SECRET;
  if(!appId||!secret)return finish(res,"Instagram app credentials are not configured on the server.");
  const form=new URLSearchParams({client_id:appId,client_secret:secret,grant_type:"authorization_code",redirect_uri:instagramRedirectUri(req),code});
  const shortResponse=await fetch("https://api.instagram.com/oauth/access_token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  const shortData=await shortResponse.json().catch(()=>({}));
  if(!shortResponse.ok||!shortData.access_token)throw new Error(shortData.error_message||shortData.error?.message||"Instagram authorization code exchange failed.");
  let token=shortData.access_token,expiresIn=Number(shortData.expires_in)||3600;
  const longUrl=new URL("https://graph.instagram.com/access_token");longUrl.searchParams.set("grant_type","ig_exchange_token");longUrl.searchParams.set("client_secret",secret);longUrl.searchParams.set("access_token",token);
  const longResponse=await fetch(longUrl);const longData=await longResponse.json().catch(()=>({}));
  if(longResponse.ok&&longData.access_token){token=longData.access_token;expiresIn=Number(longData.expires_in)||5184000;}
  const profileUrl=new URL("https://graph.instagram.com/me");profileUrl.searchParams.set("fields","user_id,username,account_type");profileUrl.searchParams.set("access_token",token);
  const profileResponse=await fetch(profileUrl);const profile=await profileResponse.json().catch(()=>({}));
  if(!profileResponse.ok||!(profile.user_id||profile.id))throw new Error(profile.error?.message||"Could not read Instagram professional account profile.");
  const igId=String(profile.user_id||profile.id);
  await sql`INSERT INTO studio_company_instagram(company_id,ig_user_id,username,account_type,encrypted_access_token,token_expires_at,status,connected_at,updated_at)
    VALUES(${verified.companyId},${igId},${profile.username||null},${profile.account_type||null},${encryptCompanyToken(token)},NOW()+(${expiresIn} * INTERVAL '1 second'),'connected',NOW(),NOW())
    ON CONFLICT(company_id) DO UPDATE SET ig_user_id=EXCLUDED.ig_user_id,username=EXCLUDED.username,account_type=EXCLUDED.account_type,encrypted_access_token=EXCLUDED.encrypted_access_token,token_expires_at=EXCLUDED.token_expires_at,status='connected',connected_at=NOW(),updated_at=NOW()`;
  let webhookSubscribed=false;
  try{
   const subscribe=await fetch("https://graph.instagram.com/v26.0/me/subscribed_apps",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({subscribed_fields:"messages,comments"})});
   const subscribeData=await subscribe.json().catch(()=>({}));webhookSubscribed=subscribe.ok&&subscribeData.success!==false;
  }catch(error){console.error("Instagram webhook subscription request failed:",error.message);}
  await sql`UPDATE studio_company_instagram SET webhook_subscribed=${webhookSubscribed},updated_at=NOW() WHERE company_id=${verified.companyId}`;
  return finish(res,"@" + (profile.username||"Instagram account") + " is connected. " + (webhookSubscribed?"Instagram message/comment webhook subscription was requested.":"Finish webhook subscriptions in the Meta App Dashboard before testing inbox events."),true);
 }catch(error){console.error("Instagram OAuth callback failed:",error.message);return finish(res,error.message||"Instagram connection failed.");}
}
