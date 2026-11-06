import adminCompanies from "./_handlers/admin-companies.js";
import adminEnquiries from "./_handlers/admin-enquiries.js";
import adminLogin from "./_handlers/admin-login.js";
import adminMe from "./_handlers/admin-me.js";
import adminWhatsapp from "./_handlers/admin-whatsapp.js";
import adminSaas from "./_handlers/admin-saas.js";
import adminWorkspace from "./_handlers/admin-workspace.js";
import companyAuth from "./_handlers/company-auth.js";
import companyRegister from "./_handlers/company-register.js";
import companySettings from "./_handlers/company-settings.js";
import companyTeam from "./_handlers/company-team.js";
import companyWhatsappConnect from "./_handlers/company-whatsapp-connect.js";
import companyWhatsappMessages from "./_handlers/company-whatsapp-messages.js";
import companyWhatsappRegister from "./_handlers/company-whatsapp-register.js";
import companyWorkspace from "./_handlers/company-workspace.js";
import enquiries from "./_handlers/enquiries.js";
import whatsappWebhook from "./_handlers/whatsapp-webhook.js";

const routes = new Map([
  ["/api/admin/companies", adminCompanies],
  ["/api/admin/enquiries", adminEnquiries],
  ["/api/admin/login", adminLogin],
  ["/api/admin/me", adminMe],
  ["/api/admin/whatsapp", adminWhatsapp],
  ["/api/admin/saas", adminSaas],
  ["/api/admin/workspace", adminWorkspace],
  ["/api/company/auth", companyAuth],
  ["/api/company/register", companyRegister],
  ["/api/company/settings", companySettings],
  ["/api/company/team", companyTeam],
  ["/api/company/whatsapp/connect", companyWhatsappConnect],
  ["/api/company/whatsapp/messages", companyWhatsappMessages],
  ["/api/company/whatsapp/register", companyWhatsappRegister],
  ["/api/company/workspace", companyWorkspace],
  ["/api/enquiries", enquiries],
  ["/api/whatsapp/webhook", whatsappWebhook],
]);

export default async function handler(req, res) {
  const pathname = new URL(req.url || "/", "https://ai-soft-studio.invalid").pathname.replace(/\/+$/, "") || "/";
  // Vercel catch-all invocations can expose the path with or without the /api prefix.
  // Resolve both forms so nested admin endpoints never fall through to a false 404.
  const withoutApiPrefix = pathname.replace(/^\/api(?=\/)/, "") || "/";
  const withApiPrefix = pathname.startsWith("/api/") ? pathname : `/api${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const route = routes.get(pathname) || routes.get(withoutApiPrefix) || routes.get(withApiPrefix);
  if (!route) return res.status(404).json({ error: "API route not found.", path: pathname });
  return route(req, res);
}
