const $ = (id) => document.getElementById(id);
const login = $("login"), dashboard = $("dashboard");
async function api(url, options={}) {
  const response = await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function showDashboard(email){login.classList.add("hidden");dashboard.classList.remove("hidden");$("admin-email").textContent=email;loadEnquiries();}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function loadEnquiries(){
  $("rows").innerHTML='<tr><td colspan="5">Loading…</td></tr>';
  try {
    const {enquiries=[]}=await api("/api/admin/enquiries");
    $("total").textContent=enquiries.length;
    $("new-count").textContent=enquiries.filter(x=>x.status==="new").length;
    $("contacted").textContent=enquiries.filter(x=>x.status==="contacted").length;
    $("qualified").textContent=enquiries.filter(x=>x.status==="qualified").length;
    $("last-updated").textContent="Updated "+new Date().toLocaleTimeString();
    $("rows").innerHTML=enquiries.length?enquiries.map(x=>`<tr><td><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.email)} · ${escapeHtml(x.phone||"")}</small></td><td>${escapeHtml(x.service||"—")}<small>${escapeHtml(x.budget||"")}</small></td><td>${escapeHtml(x.message)}</td><td>${new Date(x.created_at).toLocaleString()}</td><td><select class="status-select" data-id="${x.id}">${["new","contacted","qualified","closed","spam"].map(s=>`<option value="${s}" ${s===x.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join(""):'<tr><td colspan="5">No enquiries yet. New website submissions will appear here.</td></tr>';
    document.querySelectorAll(".status-select").forEach(el=>el.addEventListener("change",async()=>{try{await api("/api/admin/enquiries",{method:"PATCH",body:JSON.stringify({id:Number(el.dataset.id),status:el.value})});await loadEnquiries();}catch(e){alert(e.message);}}));
  } catch(e) {$("rows").innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;}
}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();$("login-error").textContent="";const fd=new FormData(e.currentTarget);try{const r=await api("/api/admin/login",{method:"POST",body:JSON.stringify({email:fd.get("email"),password:fd.get("password")})});showDashboard(r.email);}catch(err){$("login-error").textContent=err.message;}});
$("logout").addEventListener("click",async()=>{await api("/api/admin/me",{method:"DELETE"});dashboard.classList.add("hidden");login.classList.remove("hidden");});
$("refresh").addEventListener("click",loadEnquiries);
api("/api/admin/me").then(r=>{if(r.authenticated)showDashboard(r.email);}).catch(()=>{});
