import { db } from "../_lib/db.js";
import { ensureCompanySchema, hashPassword, makeSlug, issueCompanySession, setCompanySession } from "../_lib/company.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  let body={};
  try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid request body."});}
  const companyName=String(body.companyName||"").trim().slice(0,160);
  const ownerName=String(body.ownerName||"").trim().slice(0,160);
  const email=String(body.email||"").trim().toLowerCase().slice(0,180);
  const password=String(body.password||"");
  if(!companyName||!ownerName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||password.length>128){
    return res.status(400).json({error:"Enter your business name, owner name, valid email and a password of at least 10 characters."});
  }
  try{
    const sql=db();await ensureCompanySchema(sql);
    const exists=await sql`SELECT id FROM studio_company_users WHERE LOWER(email)=${email} LIMIT 1`;
    if(exists.length)return res.status(409).json({error:"An account with this email already exists. Please sign in instead."});
    const slug=makeSlug(companyName);
    const rows=await sql`INSERT INTO studio_companies(name,slug,owner_name,owner_email,plan,status,trial_started_at,trial_ends_at)
      VALUES(${companyName},${slug},${ownerName},${email},'trial','trial',NOW(),NOW()+INTERVAL '24 hours')
      RETURNING id,name,slug,trial_ends_at`;
    const company=rows[0];
    try{
      const users=await sql`INSERT INTO studio_company_users(company_id,name,email,role,password_hash)
        VALUES(${company.id},${ownerName},${email},'owner',${hashPassword(password)})
        RETURNING id,company_id,name,email,role`;
      const user=users[0];
      await sql`INSERT INTO studio_company_whatsapp(company_id) VALUES(${company.id}) ON CONFLICT(company_id) DO NOTHING`;
      await sql`INSERT INTO studio_company_settings(company_id) VALUES(${company.id}) ON CONFLICT(company_id) DO NOTHING`;
      setCompanySession(res,issueCompanySession(user));
      return res.status(201).json({ok:true,user:{id:user.id,name:user.name,email:user.email,role:user.role,companyId:user.company_id},company:{id:company.id,name:company.name,trialEndsAt:company.trial_ends_at},message:"Your 1-day free trial has started."});
    }catch(error){
      await sql`DELETE FROM studio_companies WHERE id=${company.id}`;
      if(String(error.message||"").toLowerCase().includes("unique"))return res.status(409).json({error:"An account with this email already exists. Please sign in instead."});
      throw error;
    }
  }catch(error){console.error("Customer registration failed:",error.message);return res.status(503).json({error:"Registration is temporarily unavailable. Please try again shortly."});}
}
