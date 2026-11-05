import { createHmac,timingSafeEqual } from "node:crypto";
import { db } from "../_lib/db.js";
import { ensureCompanySchema,requireCompanyUser } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
async function activate(sql,orderId,paymentId,amount){
 const rows=await sql`SELECT p.id,p.company_id,p.plan_key,p.amount,p.currency,pl.billing_period FROM studio_saas_payments p JOIN studio_saas_plans pl ON pl.plan_key=p.plan_key WHERE p.provider_order_id=${orderId} LIMIT 1`;
 const p=rows[0];if(!p||Number(p.amount)*100!==Number(amount))throw new Error("Payment order does not match the subscription amount.");
 const changed=await sql`UPDATE studio_saas_payments SET provider_payment_id=${paymentId},status='paid',paid_at=COALESCE(paid_at,NOW()) WHERE id=${p.id} AND status<>'paid' RETURNING id`;
 if(changed.length)await sql`UPDATE studio_companies SET plan=${p.plan_key},status='active',plan_expires_at=CASE WHEN ${p.billing_period}='yearly' THEN NOW()+INTERVAL '1 year' ELSE NOW()+INTERVAL '1 month' END,updated_at=NOW() WHERE id=${p.company_id}`;
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");if(!["GET","POST"].includes(req.method)){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});}
 const user=await requireCompanyUser(req,res,["owner"]);if(!user)return;
 let body={};try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:"Invalid JSON"});}
 try{
  const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);await sql`ALTER TABLE studio_companies ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ`;
  if(req.method==="GET"){const plans=await sql`SELECT plan_key,name,price,billing_period,message_quota,contact_limit,team_limit,campaign_limit FROM studio_saas_plans WHERE active=TRUE ORDER BY price ASC`;return res.status(200).json({plans,paymentConfigured:Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET)});}
  const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;if(!key||!secret)return res.status(503).json({error:"Online payments are not configured yet."});
  if(body.action==="order.create"){
   const planKey=String(body.planKey||"");const plans=await sql`SELECT plan_key,name,price,billing_period,active FROM studio_saas_plans WHERE plan_key=${planKey} LIMIT 1`;const plan=plans[0];
   if(!plan||!plan.active||Number(plan.price)<=0)return res.status(400).json({error:"Choose an active paid plan."});
   const amount=Math.round(Number(plan.price)*100);const receipt="AS"+Date.now().toString(36)+String(user.company_id);
   const response=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{Authorization:"Basic "+Buffer.from(key+":"+secret).toString("base64"),"Content-Type":"application/json"},body:JSON.stringify({amount,currency:"INR",receipt,notes:{company_id:String(user.company_id),plan_key:plan.plan_key}})});
   const order=await response.json().catch(()=>({}));if(!response.ok||!order.id)throw new Error(order.error?.description||"Razorpay order could not be created.");
   await sql`INSERT INTO studio_saas_payments(company_id,plan_key,provider,provider_order_id,amount,currency,status,metadata) VALUES(${user.company_id},${plan.plan_key},'razorpay',${order.id},${plan.price},'INR','created',${JSON.stringify({receipt})}::jsonb) ON CONFLICT(provider_order_id) DO NOTHING`;
   return res.status(200).json({keyId:key,orderId:order.id,amount:order.amount,currency:order.currency,planName:plan.name});
  }
  if(body.action==="order.verify"){
   const orderId=String(body.razorpay_order_id||""),paymentId=String(body.razorpay_payment_id||""),signature=String(body.razorpay_signature||"");
   if(!orderId||!paymentId||!signature)return res.status(400).json({error:"Payment verification details are incomplete."});
   const expected=createHmac("sha256",secret).update(orderId+"|"+paymentId).digest("hex");const a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(400).json({error:"Payment signature verification failed."});
   const response=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(paymentId),{headers:{Authorization:"Basic "+Buffer.from(key+":"+secret).toString("base64")}});
   const payment=await response.json().catch(()=>({}));if(!response.ok||payment.status!=="captured"||payment.order_id!==orderId)return res.status(409).json({error:"Payment is not captured yet. Subscription has not been activated."});
   const owned=await sql`SELECT id FROM studio_saas_payments WHERE provider_order_id=${orderId} AND company_id=${user.company_id} LIMIT 1`;if(!owned.length)return res.status(404).json({error:"Payment order does not belong to this company."});
   await activate(sql,orderId,paymentId,payment.amount);return res.status(200).json({ok:true,message:"Payment verified. Your subscription is active."});
  }
  return res.status(400).json({error:"Unknown payment action."});
 }catch(error){console.error("Razorpay subscription payment:",error.message);return res.status(503).json({error:error.message||"Payment service unavailable."});}
}