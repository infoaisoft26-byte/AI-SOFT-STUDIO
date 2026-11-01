# AI SOFT STUDIO admin and enquiries

## Routes
- Public enquiry API: POST /api/enquiries
- Admin login: /admin.html
- Admin session: POST /api/admin/login, GET/DELETE /api/admin/me
- Enquiry list and status updates: GET/PATCH /api/admin/enquiries

## Vercel environment variables
Set these as encrypted variables for Production and Preview:
- DATABASE_URL: dedicated Neon connection string for this project (pooled connection recommended)
- ADMIN_EMAIL: admin@aisoft.in
- ADMIN_PASSWORD: unique password, minimum 12 characters
- ADMIN_SESSION_SECRET: random secret, minimum 32 characters

Do not reuse a database from Global Finance, NovoPay, KaamSetu, AIJobs, or AISOFT Automation.
The API creates the enquiry and audit tables on first use. No existing records are modified.
