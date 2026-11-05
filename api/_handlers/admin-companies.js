import { requireAdmin } from "../_lib/auth.js";
import { db } from "../_lib/db.js";
import { ensureCompanySchema, hashPassword, makeSlug, makeTempPassword } from "../_lib/company.js";

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST","PATCH"].includes(req.method)){res.setHeader("Allow","GET, POST, PATCH");return res.status(405).json({error:"Method not allowed"});}
  const admin=requireAdmin(req,res); if(!admin)return;
  let body={}; if(req.method!=="GET"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
  try {
    const sql=db(); await ensureCompanySchema(sql);
    if(req.method==="GET"){
      const companies=await sql`SELECT c.id,c.name,c.slug,c.owner_name,c.owner_email,c.plan,c.status,c.created_at,
        COUNT(DISTINCT u.id)::int AS employees,COALESCE(w.status,'not_connected') AS whatsapp_status, w.display_phone
        FROM studio_companies c LEFT JOIN studio_company_users u ON u.company_id=c.id
        LEFT JOIN studio_company_whatsapp w ON w.company_id=c.id
        GROUP BY c.id,w.status,w.display_phone ORDER BY c.created_at DESC`;
      return res.status(200).json({companies});
    }
    if(req.method==="POST"){
      const name=String(body.name||"").trim().slice(0,160),ownerName=String(body.ownerName||"").trim().slice(0,160),email=String(body.ownerEmail||"").trim().toLowerCase();
      if(!name||!ownerName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Company name, owner name and valid owner email are required."});
      const exists=await sql`SELECT id FROM studio_company_users WHERE LOWER(email)=${email} LIMIT 1`;
      if(exists.length)return res.status(409).json({error:"This email already has a company login."});
      const password=makeTempPassword(),slug=makeSlug(name);
      const rows=await sql`INSERT INTO studio_companies(name,slug,owner_name,owner_email,plan)
        VALUES(${name},${slug},${ownerName},${email},${String(body.plan||"starter").slice(0,40)}) RETURNING id,name,slug`;
      const company=rows[0];
      await sql`INSERT INTO studio_company_users(company_id,name,email,role,password_hash)
        VALUES(${company.id},${ownerName},${email},'owner',${hashPassword(password)})`;
      await sql`INSERT INTO studio_company_whatsapp(company_id) VALUES(${company.id}) ON CONFLICT(company_id) DO NOTHING`;
      await sql`INSERT INTO admin_audit(action,actor,entity_type,entity_id) VALUES('company.created',${admin.email},'company',${company.id})`;
      return res.status(201).json({ok:true,company,ownerLogin:{email,password},message:"Share this temporary password securely. It is shown only once."});
    }
    const id=Number(body.id),status=body.status;
    if(!Number.isSafeInteger(id)||id<1||!["active","suspended","trial"].includes(status))return res.status(400).json({error:"Invalid company status."});
    const rows=await sql`UPDATE studio_companies SET status=${status},updated_at=NOW() WHERE id=${id} RETURNING id,status`;
    if(!rows.length)return res.status(404).json({error:"Company not found."});
    await sql`INSERT INTO admin_audit(action,actor,entity_type,entity_id) VALUES('company.status.updated',${admin.email},'company',${id})`;
    return res.status(200).json({ok:true,company:rows[0]});
  } catch(error){console.error("Company admin API failed:",error.message);return res.status(503).json({error:"Company management is temporarily unavailable."});}
}
