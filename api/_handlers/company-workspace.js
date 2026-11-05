import { db } from "../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed"});}
  const user=await requireCompanyUser(req,res);if(!user)return;
  try{
    const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);
    const [counts,account,members,plan,usage]=await Promise.all([
      sql`SELECT COUNT(*)::int AS contacts FROM studio_company_contacts WHERE company_id=${user.company_id}`,
      sql`SELECT status,display_phone FROM studio_company_whatsapp WHERE company_id=${user.company_id} LIMIT 1`,
      sql`SELECT COUNT(*)::int AS employees FROM studio_company_users WHERE company_id=${user.company_id} AND active=TRUE`,
      sql`SELECT p.name,p.price,p.billing_period,p.message_quota,p.contact_limit,p.team_limit,p.campaign_limit FROM studio_saas_plans p JOIN studio_companies c ON c.plan=p.plan_key WHERE c.id=${user.company_id} LIMIT 1`,
      sql`SELECT COALESCE(SUM(quantity),0)::int AS messages_used FROM studio_saas_usage WHERE company_id=${user.company_id}`
    ]);
    return res.status(200).json({company:{id:user.company_id,name:user.company_name,status:user.company_status,trialEndsAt:user.trial_ends_at||null,plan:plan[0]||null,messagesUsed:usage[0]?.messages_used||0},user:{id:user.id,name:user.name,email:user.email,role:user.role},metrics:{contacts:counts[0].contacts,employees:members[0].employees},whatsapp:account[0]||{status:"not_connected",display_phone:null}});
  }catch(error){console.error("Company workspace failed:",error.message);return res.status(503).json({error:"Workspace could not be loaded."});}
}
