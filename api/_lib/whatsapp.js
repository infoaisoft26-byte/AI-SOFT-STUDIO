const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v26.0";

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN && process.env.META_APP_SECRET);
}

export async function graphRequest(path, init = {}) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) throw new Error("WhatsApp access token is not configured.");
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Meta API request failed (${response.status}).`);
  return data;
}

export async function sendText(phone, body) {
  const to = String(phone || "").replace(/\D/g, "");
  if (!to || !body) throw new Error("A valid recipient and message are required.");
  return graphRequest(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: String(body).slice(0, 4096) } }),
  });
}

export async function sendTemplate(phone, name, language, components = []) {
  const to = String(phone || "").replace(/\D/g, "");
  if (!to || !name) throw new Error("A valid recipient and approved template are required.");
  return graphRequest(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: language || "en" }, ...(components.length ? { components } : {}) } }),
  });
}
