import { db } from "../_lib/db.js";
import { ensureCompanySchema, requireCompanyUser } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
import { ensureInstagramSchema, getInstagramConnection, instagramRedirectUri, makeOAuthState, IG_SCOPES } from "../_lib/instagram.js";

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  try {
    const user = await requireCompanyUser(req,res);
    if (!user) return;
    const sql=db(); await ensureCompanySchema(sql); await ensureSaasSchema(sql); await ensureInstagramSchema(sql);
    if (req.method==="GET") {
      const [settings,connection] = await Promise.all([
        sql`SELECT meta_app_id FROM studio_saas_settings WHERE id=1 LIMIT 1`,
        getInstagramConnection(sql,user.company_id)
      ]);
      const appId = process.env.INSTAGRAM_APP_ID || settings[0]?.meta_app_id || "";
      return res.status(200).json({enabled:Boolean(appId && process.env.META_APP_SECRET && process.env.META_TOKEN_ENCRYPTION_KEY),appId,redirectUri:instagramRedirectUri(req),scopes:IG_SCOPES,connection:connection||{status:"not_connected"}});
    }
    if (req.method==="POST") {
      if(user.role!=="owner") return res.status(403).json({error:"Only the company owner can manage Instagram connection and automation settings."});
      const body=typeof req.body==="object"&&req.body?req.body:{};
      if(body.action==="connect") {
        const [settings] = await Promise.all([sql`SELECT meta_app_id FROM studio_saas_settings WHERE id=1 LIMIT 1`]);
        const appId=process.env.INSTAGRAM_APP_ID || settings[0]?.meta_app_id || "";
        if(!appId||!process.env.META_APP_SECRET||!process.env.META_TOKEN_ENCRYPTION_KEY) return res.status(503).json({error:"Instagram Meta App ID, META_APP_SECRET, or META_TOKEN_ENCRYPTION_KEY is missing in Vercel."});
        const state=makeOAuthState(user.company_id);
        await sql`INSERT INTO studio_instagram_oauth_states(state_hash,company_id,expires_at) VALUES(${state.hash},${user.company_id},NOW()+INTERVAL '10 minutes') ON CONFLICT(state_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at,used_at=NULL`;
        const url=new URL("https://www.instagram.com/oauth/authorize");
        url.searchParams.set("client_id",appId);url.searchParams.set("redirect_uri",instagramRedirectUri(req));url.searchParams.set("response_type","code");url.searchParams.set("scope",IG_SCOPES);url.searchParams.set("state",state.state);url.searchParams.set("enable_fb_login","0");url.searchParams.set("force_authentication","1");
        return res.status(200).json({url:url.toString()});
      }
      if(body.action==="disconnect") {
        await sql`DELETE FROM studio_company_instagram WHERE company_id=${user.company_id}`;
        return res.status(200).json({ok:true,message:"Instagram account disconnected."});
      }
      if(body.action==="settings") {
        const enabled=body.autoReplyEnabled===true,ai=body.aiReplyEnabled===true,comment=body.commentReplyEnabled===true;
        const reply=String(body.autoReplyText||"").trim().slice(0,1000),commentReply=String(body.commentReplyText||"").trim().slice(0,500);
        await sql`INSERT INTO studio_company_instagram_settings(company_id,auto_reply_enabled,ai_reply_enabled,auto_reply_text,comment_reply_enabled,comment_reply_text)
          VALUES(${user.company_id},${enabled},${ai},${reply||"Thanks for messaging us. Our team will get back to you shortly."},${comment},${commentReply||"Thanks for your comment! We will be in touch."})
          ON CONFLICT(company_id) DO UPDATE SET auto_reply_enabled=EXCLUDED.auto_reply_enabled,ai_reply_enabled=EXCLUDED.ai_reply_enabled,auto_reply_text=EXCLUDED.auto_reply_text,comment_reply_enabled=EXCLUDED.comment_reply_enabled,comment_reply_text=EXCLUDED.comment_reply_text,updated_at=NOW()`;
        return res.status(200).json({ok:true});
      }
      return res.status(400).json({error:"Unknown Instagram action."});
    }
    res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});
  } catch(error) { console.error("Instagram connect failed:",error.message);return res.status(503).json({error:error.message||"Instagram connection unavailable."}); }
}
