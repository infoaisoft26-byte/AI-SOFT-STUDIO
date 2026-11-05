






















const routes = new Map([
  ["/api/admin/companies", () => import("./_handlers/admin-companies.js")],
  ["/api/admin/enquiries", () => import("./_handlers/admin-enquiries.js")],
  ["/api/admin/login", () => import("./_handlers/admin-login.js")],
  ["/api/admin/me", () => import("./_handlers/admin-me.js")],
  ["/api/admin/whatsapp", () => import("./_handlers/admin-whatsapp.js")],
  ["/api/admin/saas", () => import("./_handlers/admin-saas.js")],
  ["/api/admin/workspace", () => import("./_handlers/admin-workspace.js")],
  ["/api/company/auth", () => import("./_handlers/company-auth.js")],
  ["/api/company/contacts", () => import("./_handlers/company-contacts.js")],
  ["/api/company/payment", () => import("./_handlers/company-payment.js")],
  ["/api/payments/razorpay/webhook", () => import("./_handlers/razorpay-webhook.js")],
  ["/api/company/campaigns", () => import("./_handlers/company-campaigns.js")],
  ["/api/cron/whatsapp-campaigns", () => import("./_handlers/whatsapp-campaign-worker.js")],
  ["/api/company/register", () => import("./_handlers/company-register.js")],
  ["/api/company/settings", () => import("./_handlers/company-settings.js")],
  ["/api/company/team", () => import("./_handlers/company-team.js")],
  ["/api/company/whatsapp/connect", () => import("./_handlers/company-whatsapp-connect.js")],
  ["/api/company/whatsapp/messages", () => import("./_handlers/company-whatsapp-messages.js")],
  ["/api/company/whatsapp/register", () => import("./_handlers/company-whatsapp-register.js")],
  ["/api/company/workspace", () => import("./_handlers/company-workspace.js")],
  ["/api/enquiries", () => import("./_handlers/enquiries.js")],
  ["/api/whatsapp/webhook", () => import("./_handlers/whatsapp-webhook.js")],
]);

export default async function handler(req, res) {
  const rawPath = req.query?.path;
  const pathParts = Array.isArray(rawPath) ? rawPath : [rawPath || ""];
  const pathname = "/api/" + pathParts.join("/").split("/").filter(Boolean).join("/");
  const load = routes.get(pathname);
  if (!load) return res.status(404).json({ error: "API route not found." });
  const module = await load();
  return module.default(req, res);
}
