# AI SOFT STUDIO — Admin CRM

## Admin workspace
- Open `/admin.html` on the deployed site.
- Admin login uses `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET`.
- Session cookies are HTTP-only, Secure, SameSite=Strict, and expire after eight hours.
- Admin login is rate-limited per source IP: 10 failed attempts within a 15-minute window trigger a 15-minute lockout.
- The admin dashboard can search enquiries by customer details/message, filter by status or service, expand full project messages, and contact customers by email or WhatsApp when a phone number is available.
- Statuses: `new`, `contacted`, `qualified`, `closed`, `spam`.
- Dashboard list is limited to the latest 250 enquiries.

## API routes
- `POST /api/enquiries` — public customer enquiry submission.
- `POST /api/admin/login` — admin sign-in.
- `GET /api/admin/me` — current session check.
- `DELETE /api/admin/me` — sign out.
- `GET /api/admin/enquiries` — list enquiries (admin only).
- `PATCH /api/admin/enquiries` — update enquiry status (admin only).

## Vercel environment variables
Configure these for the intended Preview branch and separately for Production only when you are ready to release:
- `DATABASE_URL`: pooled connection string for this project's dedicated Neon branch.
- `ADMIN_EMAIL`: admin login email (currently intended to be `admin@aisoft.in`).
- `ADMIN_PASSWORD`: unique password of at least 12 characters.
- `ADMIN_SESSION_SECRET`: random secret of at least 32 characters.

Never paste secrets into source code, chat, or commits. Keep Preview connected to the dedicated `feature-admin-crm-preview` Neon branch. Do not reuse a database from Global Finance, NovoPay, KaamSetu, AIJobs, or AISOFT Automation.

The API creates `enquiries`, `admin_audit`, and `admin_login_attempts` tables on first request. Existing customer data is not deleted by schema setup.

## WhatsApp Cloud API CRM
- Open `/whatsapp.html` after signing into the existing admin account.
- Webhook callback URL: `https://YOUR-DOMAIN/api/whatsapp/webhook`.
- Subscribe the WhatsApp Business Account webhook to the `messages` field.
- Webhook verification uses `WHATSAPP_VERIFY_TOKEN`; POST requests are checked against `META_APP_SECRET` using `X-Hub-Signature-256`.
- Incoming messages are deduplicated by Meta message ID, stored in `whatsapp_messages`, and create/update a lead in `whatsapp_contacts`.
- Optional auto-replies use `WHATSAPP_AUTO_REPLY` and `WHATSAPP_AUTO_REPLY_TEXT`. Admin alerts are sent to `WHATSAPP_ADMIN_PHONE` when configured.
- Manual text replies are sent through the official Cloud API. Meta enforces its customer-service window and messaging rules.
- Campaigns are restricted to Meta-approved templates and contacts explicitly marked as opted in by an admin. A campaign is capped at 100 selected recipients per request.

Add the following encrypted environment variables to the AI SOFT STUDIO Vercel project (Preview first):
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN` (permanent System User token)
- `WHATSAPP_VERIFY_TOKEN` (a random secret string you create)
- `META_APP_SECRET`
- `WHATSAPP_ADMIN_PHONE` (international format, digits only)
- `WHATSAPP_AUTO_REPLY` (`true` or `false`)
- `WHATSAPP_AUTO_REPLY_TEXT`
- `WHATSAPP_GRAPH_API_VERSION`

Do not put Meta tokens or app secrets in browser code, Git commits, or chat messages.

- Website form WhatsApp acknowledgements are sent only when the visitor checks the WhatsApp consent box and an approved `WHATSAPP_ENQUIRY_ACK_TEMPLATE` is configured. Use a template that does not require variables unless sending components are configured.
- For admin notifications outside an open 24-hour customer-service window, configure an approved `WHATSAPP_ADMIN_ALERT_TEMPLATE`; otherwise the integration attempts a regular text alert, which Meta may reject outside the window.
