import { db } from "../_lib/db.js";
import { ensureCompanySchema,verifyPassword,issueCompanySession,setCompanySession,clearCompanySession,readCompanySession } from "../_lib/company.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST","DELETE"].includes(req.method)){res.setHeader("Allow","GET, POST, DELETE");return res.status(405).json({error:"Method not allowed"});}
  if(req.method==="DELETE"){clearCompanySession(res);return res.status(200).json({ok:true});}
  try{
    const sql=db();await ensureCompanySchema(sql);
    if(req.method==="GET"){
      const session=readCompanySession(req);if(!session)return res.status(200).json({authenticated:false});
      const rows=await sql`SELECT u.id,u.company_id,u.name,u.email,u.role,u.active,c.name AS company_name,c.status AS company_status,c.trial_ends_at
        FROM studio_company_users u JOIN studio_companies c ON c.id=u.company_id
        WHERE u.id=${session.sub} AND u.company_id=${session.companyId} AND u.active=TRUE LIMIT 1`;
      if(!rows.length||rows[0].company_status==="suspended"||(rows[0].company_status==="trial"&&rows[0].trial_ends_at&&new Date(rows[0].trial_ends_at).getTime()<=Date.now()))return res.status(200).json({authenticated:false});
      const u=rows[0];return res.status(200).json({authenticated:true,user:{id:u.id,name:u.name,email:u.email,role:u.role,companyId:u.company_id,companyName:u.company_name}});
    }
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
    if(!email||!password)return res.status(400).json({error:"Email and password are required."});
    const rows=await sql`SELECT u.* ,c.status AS company_status,c.trial_ends_at FROM studio_company_users u
      JOIN studio_companies c ON c.id=u.company_id WHERE LOWER(u.email)=${email} AND u.active=TRUE
      ORDER BY u.created_at ASC LIMIT 2`;
    if(rows.length!==1||rows[0].company_status==="suspended"||(rows[0].company_status==="trial"&&rows[0].trial_ends_at&&new Date(rows[0].trial_ends_at).getTime()<=Date.now())||!verifyPassword(password,rows[0].password_hash))
      return res.status(401).json({error:"Email or password is incorrect."});
    const user=rows[0];setCompanySession(res,issueCompanySession(user));
    return res.status(200).json({ok:true,user:{id:user.id,name:user.name,email:user.email,role:user.role,companyId:user.company_id}});
  }catch(error){console.error("Company auth failed:",error.message);return res.status(503).json({error:"Company sign-in is temporarily unavailable."});}
}
