import { db } from "../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser,hashPassword,makeTempPassword } from "../_lib/company.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST","PATCH"].includes(req.method)){res.setHeader("Allow","GET, POST, PATCH");return res.status(405).json({error:"Method not allowed"});}
  const user=await requireCompanyUser(req,res,req.method==="GET"?["owner","manager"]:["owner","manager"]);if(!user)return;
  let body={};if(req.method!=="GET"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}}
  try{
    const sql=db();await ensureCompanySchema(sql);
    if(req.method==="GET"){
      const members=await sql`SELECT id,name,email,phone,role,active,created_at FROM studio_company_users WHERE company_id=${user.company_id} ORDER BY created_at`;
      return res.status(200).json({members});
    }
    if(req.method==="POST"){
      const name=String(body.name||"").trim().slice(0,160),email=String(body.email||"").trim().toLowerCase(),phone=String(body.phone||"").slice(0,40);
      const role=body.role==="manager"?"manager":"employee";
      if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Employee name and valid email are required."});
      const duplicate=await sql`SELECT id FROM studio_company_users WHERE company_id=${user.company_id} AND LOWER(email)=${email} LIMIT 1`;
      if(duplicate.length)return res.status(409).json({error:"This employee already exists in your company."});
      const password=makeTempPassword();
      const rows=await sql`INSERT INTO studio_company_users(company_id,name,email,phone,role,password_hash)
        VALUES(${user.company_id},${name},${email},${phone},${role},${hashPassword(password)})
        RETURNING id,name,email,phone,role,active`;
      return res.status(201).json({ok:true,member:rows[0],temporaryPassword:password,message:"Share this temporary password securely. It is shown only once."});
    }
    const id=Number(body.id),active=body.active===true;
    if(!Number.isSafeInteger(id)||id<1||id===Number(user.id))return res.status(400).json({error:"Invalid employee update."});
    const rows=await sql`UPDATE studio_company_users SET active=${active},updated_at=NOW()
      WHERE id=${id} AND company_id=${user.company_id} AND role<>'owner' RETURNING id,active`;
    if(!rows.length)return res.status(404).json({error:"Employee not found."});
    return res.status(200).json({ok:true,member:rows[0]});
  }catch(error){console.error("Company team API failed:",error.message);return res.status(503).json({error:"Team management is temporarily unavailable."});}
}
