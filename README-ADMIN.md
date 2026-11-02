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
