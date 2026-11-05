import { createHmac,timingSafeEqual } from "node:crypto";
import { db } from "../_lib/db.js";
import { ensureCompanySchema } from "../_lib/company.js";
import { ensureSaasSchema } from "../_lib/saas-usage.js";
export const config={api:{bodyParser:false}};
async function raw(req){const a=[];for await(const c of req)a.push(Buffer.isBuffer(c)?c:Buffer.from(c));return Buffer.concat(a);}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).send("Method not allowed");}
 const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)return res.status(503).send("Webhook not configured");
 try{
  const body=await raw(req),signature=String(req.headers["x-razorpay-signature"]||""),expected=createHmac("sha256",secret).update(body).digest("hex");
  const a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).send("Invalid signature");
  const event=JSON.parse(body.toString("utf8"));if(event.event!=="payment.captured")return res.status(200).send("Ignored");
  const payment=event.payload?.payment?.entity;if(!payment?.order_id||!payment?.id||payment.status!=="captured")return res.status(400).send("Invalid payment payload");
  const sql=db();await ensureCompanySchema(sql);await ensureSaasSchema(sql);await sql`ALTER TABLE studio_companies ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ`;
  const rows=await sql`SELECT p.id,p.company_id,p.plan_key,p.amount,pl.billing_period FROM studio_saas_payments p JOIN studio_saas_plans pl ON pl.plan_key=p.plan_key WHERE p.provider_order_id=${payment.order_id} AND p.provider='razorpay' LIMIT 1`;
  const p=rows[0];if(!p||Number(p.amount)*100!==Number(payment.amount))return res.status(409).send("Payment does not match order");
  const changed=await sql`UPDATE studio_saas_payments SET provider_payment_id=${payment.id},status='paid',paid_at=COALESCE(paid_at,NOW()) WHERE id=${p.id} AND status<>'paid' RETURNING id`;
  if(changed.length)await sql`UPDATE studio_companies SET plan=${p.plan_key},status='active',plan_expires_at=CASE WHEN ${p.billing_period}='yearly' THEN NOW()+INTERVAL '1 year' ELSE NOW()+INTERVAL '1 month' END,updated_at=NOW() WHERE id=${p.company_id}`;
  return res.status(200).send("OK");
 }catch(error){console.error("Razorpay webhook:",error.message);return res.status(500).send("Webhook processing failed");}
}