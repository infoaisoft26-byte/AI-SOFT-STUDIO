const $ = (id) => document.getElementById(id);
const login = $("login"), dashboard = $("dashboard");
let allEnquiries = [], toastTimer;
async function api(url, options = {}) {
  const response = await fetch(url, { credentials:"same-origin", headers:{"Content-Type":"application/json",...(options.headers||{})}, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
  return data;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function showToast(message, isError = false) {
  const el = $("toast"); el.textContent = message; el.classList.toggle("toast-error", isError); el.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}
function formatDate(value) {
  const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], {year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
function showDashboard(email) {
  login.classList.add("hidden"); dashboard.classList.remove("hidden"); $("admin-email").textContent = email;
  $("footer-year").textContent = "© " + new Date().getFullYear(); loadEnquiries();
}
function buildServiceFilter() {
  const select = $("service-filter"), current = select.value;
  const services = [...new Set(allEnquiries.map(x => x.service).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">All services</option>' + services.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join("");
  if (services.includes(current)) select.value = current;
}
function renderStats() {
  $("total").textContent = allEnquiries.length;
  ["new","contacted","qualified","closed","spam"].forEach(s => $(s === "new" ? "new-count" : s).textContent = allEnquiries.filter(x => x.status === s).length);
}
function contactActions(item) {
  const email = String(item.email || ""), digits = String(item.phone || "").replace(/\D/g, "");
  const mail = email ? '<a class="action-link" href="mailto:' + escapeHtml(email) + '?subject=' + encodeURIComponent("Your enquiry · AI SOFT STUDIO") + '">Email</a>' : "";
  const whatsapp = digits ? '<a class="action-link" href="https://wa.me/' + digits + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' : "";
  return mail + whatsapp || '<span class="muted">No contact</span>';
}
function filteredEnquiries() {
  const q = $("search").value.trim().toLowerCase(), status = $("status-filter").value, service = $("service-filter").value;
  return allEnquiries.filter(x => [x.name,x.email,x.phone,x.service,x.budget,x.message].join(" ").toLowerCase().includes(q) &&
    (status === "all" || x.status === status) && (service === "all" || x.service === service));
}
function renderRows() {
  const items = filteredEnquiries();
  $("result-count").textContent = items.length + (items.length === 1 ? " enquiry" : " enquiries");
  if (!items.length) { $("rows").innerHTML = '<tr><td colspan="6" class="empty">No enquiries match these filters.</td></tr>'; return; }
  $("rows").innerHTML = items.map(x => {
    const message = String(x.message || ""), preview = message.slice(0,100) + (message.length > 100 ? "…" : "");
    const options = ["new","contacted","qualified","closed","spam"].map(s => '<option value="' + s + '" ' + (s === x.status ? "selected" : "") + '>' + s[0].toUpperCase() + s.slice(1) + '</option>').join("");
    return '<tr><td class="customer-cell"><strong>' + escapeHtml(x.name) + '</strong><a href="mailto:' + escapeHtml(x.email) + '">' + escapeHtml(x.email) + '</a><small>' + escapeHtml(x.phone || "No phone provided") + '</small></td>' +
      '<td><span class="service-name">' + escapeHtml(x.service || "Not specified") + '</span><small class="budget">' + escapeHtml(x.budget || "Budget not specified") + '</small></td>' +
      '<td class="message-cell"><details><summary>' + escapeHtml(preview) + '</summary><p>' + escapeHtml(message) + '</p></details></td><td class="date-cell">' + escapeHtml(formatDate(x.created_at)) + '</td>' +
      '<td><select class="status-select" data-id="' + Number(x.id) + '" aria-label="Enquiry status">' + options + '</select></td><td><div class="actions">' + contactActions(x) + '</div></td></tr>';
  }).join("");
  document.querySelectorAll(".status-select").forEach(el => el.addEventListener("change", async () => {
    const item = allEnquiries.find(x => String(x.id) === el.dataset.id), previous = item && item.status, next = el.value; el.disabled = true;
    try {
      await api("/api/admin/enquiries", {method:"PATCH",body:JSON.stringify({id:Number(el.dataset.id),status:next})});
      if (item) item.status = next; renderStats(); renderRows(); showToast("Enquiry status updated.");
    } catch (error) { showToast(error.message, true); if (previous) el.value = previous; }
    finally { el.disabled = false; }
  }));
}
async function loadEnquiries() {
  $("refresh").disabled = true; $("rows").innerHTML = '<tr><td colspan="6" class="empty">Loading customer enquiries…</td></tr>';
  try {
    const result = await api("/api/admin/enquiries"); allEnquiries = Array.isArray(result.enquiries) ? result.enquiries : [];
    buildServiceFilter(); renderStats(); renderRows(); $("last-updated").textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (error) { $("rows").innerHTML = '<tr><td colspan="6" class="empty error">' + escapeHtml(error.message) + '</td></tr>'; showToast(error.message, true); }
  finally { $("refresh").disabled = false; }
}
$("login-form").addEventListener("submit", async event => {
  event.preventDefault(); $("login-error").textContent = ""; $("login-submit").disabled = true;
  const form = new FormData(event.currentTarget);
  try { const result = await api("/api/admin/login", {method:"POST",body:JSON.stringify({email:form.get("email"),password:form.get("password")})}); event.currentTarget.reset(); showDashboard(result.email); }
  catch (error) { $("login-error").textContent = error.message; }
  finally { $("login-submit").disabled = false; }
});
$("logout").addEventListener("click", async () => {
  try { await api("/api/admin/me",{method:"DELETE"}); } catch {}
  allEnquiries = []; dashboard.classList.add("hidden"); login.classList.remove("hidden"); $("login-form").reset(); showToast("You have signed out.");
});
$("refresh").addEventListener("click", loadEnquiries);
$("search").addEventListener("input", renderRows);
$("status-filter").addEventListener("change", renderRows);
$("service-filter").addEventListener("change", renderRows);
$("clear-filters").addEventListener("click", () => { $("search").value = ""; $("status-filter").value = "all"; $("service-filter").value = "all"; renderRows(); });
api("/api/admin/me").then(result => { if (result.authenticated) showDashboard(result.email); }).catch(() => {});
