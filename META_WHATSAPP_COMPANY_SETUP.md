# Company WhatsApp SaaS setup

The company workspace code is intentionally separate from the existing AI SOFT STUDIO single-number WhatsApp inbox.

## Vercel environment variables

Add these to the **Preview** environment first, then Production only after Meta approval and a successful Preview test:

- `META_APP_ID`: Meta Developer App ID (public identifier).
- `META_WHATSAPP_CONFIG_ID`: Facebook Login for Business configuration ID created for **WhatsApp Embedded Signup v4**.
- `META_APP_SECRET`: existing Meta App Secret; server-side only.
- `META_TOKEN_ENCRYPTION_KEY`: a new random secret of at least 32 characters, used only to encrypt each company's business token at rest. Generate with `openssl rand -hex 32`.
- `WHATSAPP_GRAPH_API_VERSION`: currently defaults to `v26.0`.

Never add the App Secret or encryption key to browser code, Git, screenshots, or customer-visible settings. Do not reuse the Meta access token as the encryption key.

## Meta prerequisites

1. Use the Meta app owned by AI SOFT STUDIO and select the correct business portfolio.
2. Complete Meta Business Verification and the Tech Provider onboarding applicable to your account.
3. Configure Facebook Login for Business with **WhatsApp Embedded Signup v4**. Select WhatsApp Cloud API; select the WhatsApp account asset and required WhatsApp permissions.
4. Request Advanced Access / App Review for `whatsapp_business_management` and `whatsapp_business_messaging`. The app must be Live and approved for customer onboarding.
5. Add `ai-soft-studio.vercel.app` to the allowed JavaScript SDK domains and configure the required HTTPS OAuth settings.
6. In the WhatsApp product Webhooks settings, subscribe the app to the WhatsApp Business Account `messages` field. Callback URL remains `https://ai-soft-studio.vercel.app/api/whatsapp/webhook`; use the existing `WHATSAPP_VERIFY_TOKEN` as the verify token. The app secret is used to validate webhook signatures.

## What the implementation does

- Company owner starts Meta's Embedded Signup from `/company.html`.
- The short-lived authorization code is exchanged server-side immediately.
- The selected WABA and phone number are checked against the connected WABA.
- The app subscribes to that WABA's webhooks.
- The returned business token is encrypted using AES-256-GCM and stored per company in Neon.
- Webhook events are routed by the business phone number ID into that company's contacts and messages. Unknown customer numbers are never sent through the studio's own WhatsApp sender.
- Company employees sign in separately and use the tenant-scoped inbox. Owner manages employees and WhatsApp connection.

## Before selling

Meta must approve the app and Tech Provider onboarding. Test with two separate business test accounts and verify that each can only see its own contacts and messages. Also verify that each company can send from its own number, receives delivery statuses, and has its own WhatsApp billing/payment method. The current starter workspace has basic text inbox and default auto-reply; advanced automation rules, templates/campaign controls, billing, assignment and audit reports are later product milestones.
