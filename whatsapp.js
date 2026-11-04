const $ = id => document.getElementById(id);
let state = { contacts: [], messages: [], templates: [], configured: false };
let activeTab = "inbox";
async function api(url, options={}) {
  const response = await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3500);}
function showTab(tab){activeTab=tab;document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));["inbox","leads","campaigns"].forEach(t=>$("tab-"+t).classList.toggle("hidden",t!==tab));}
function render(){
  $("connection").textContent=state.configured?"Meta credentials configured":"Meta credentials missing";
  $("connection").className="connection "+(state.configured?"ok":"bad");
  $("count-contacts").textContent=state.contacts.length;
  $("count-optin").textContent=state.contacts.filter(c=>c.opted_in).length;
  $("count-inbound").textContent=state.messages.filter(m=>m.direction==="inbound").length;
  $("count-templates").textContent=state.templates.length;
  $("messages").innerHTML=state.messages.length?state.messages.map(m=>'<article class="message"><div><strong>'+esc(m.name||m.phone||"Unknown contact")+'</strong><small>'+esc(m.phone||"")+' · '+esc(m.direction)+'</small></div><p>'+esc(m.body||"["+m.message_type+"]")+'</p><time>'+esc(new Date(m.created_at).toLocaleString())+'<br>'+esc(m.status)+'</time></article>').join(""):'<div class="empty">No WhatsApp messages received yet.</div>';
  $("leads").innerHTML=state.contacts.length?state.contacts.map(c=>'<tr><td><strong>'+esc(c.name||"WhatsApp contact")+'</strong><small>'+esc(c.phone)+'</small></td><td>'+esc(c.last_message||"—")+'</td><td><span class="lead-status">'+esc(c.lead_status)+'</span></td><td>'+ (c.opted_in?"Yes":"No") +'</td><td><div class="lead-controls"><select data-status="'+c.id+'"><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="lost">Lost</option></select><label><input type="checkbox" data-optin="'+c.id+'" '+(c.opted_in?"checked":"")+'> Opt-in</label><button data-save="'+c.id+'">Save</button></div></td></tr>').join(""):'<tr><td colspan="5" class="empty">No contacts yet. Incoming WhatsApp messages will appear here.</td></tr>';
  state.contacts.forEach(c=>{const el=document.querySelector('[data-status="'+c.id+'"]');if(el)el.value=c.lead_status;});
  $("template").innerHTML=state.templates.length?'<option value="">Choose approved template</option>'+state.templates.map(t=>'<option value="'+esc(t.name)+'" data-language="'+esc(t.language)+'">'+esc(t.name)+' · '+esc(t.language)+'</option>').join(""):'<option value="">No approved templates found</option>';
  $("recipients").innerHTML=state.contacts.filter(c=>c.opted_in).map(c=>'<label class="recipient"><input type="checkbox" value="'+c.id+'" checked><span>'+esc(c.name||c.phone)+' · '+esc(c.phone)+'</span></label>').join("")||'<p class="muted">No contacts with recorded opt-in. Record consent in Leads first.</p>';
}
async function load(){
  $("refresh").disabled=true;
  try{state=await api("/api/admin/whatsapp");render();}
  catch(e){toast(e.message);}
  finally{$("refresh").disabled=false;}
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
$("refresh").addEventListener("click",load);
$("template").addEventListener("change",e=>{const opt=e.target.selectedOptions[0];if(opt?.dataset.language)$("language").value=opt.dataset.language;});
$("select-all").addEventListener("click",()=>document.querySelectorAll("#recipients input[type=checkbox]").forEach(x=>x.checked=true));
$("leads").addEventListener("click",async e=>{
 const button=e.target.closest("[data-save]");if(!button)return;
 const id=Number(button.dataset.save),status=document.querySelector('[data-status="'+id+'"]').value,optedIn=document.querySelector('[data-optin="'+id+'"]').checked;
 button.disabled=true;
 try{await api("/api/admin/whatsapp",{method:"POST",body:JSON.stringify({action:"update_contact",id,leadStatus:status,optedIn})});toast("Lead updated.");await load();}
 catch(err){toast(err.message);}finally{button.disabled=false;}
});
$("campaign-form").addEventListener("submit",async e=>{
 e.preventDefault();const ids=[...document.querySelectorAll("#recipients input:checked")].map(x=>Number(x.value));
 const templateName=$("template").value,language=$("language").value.trim();
 if(!templateName||!ids.length){$("campaign-result").textContent="Choose an approved template and at least one opted-in contact.";return;}
 const button=$("send-campaign");button.disabled=true;$("campaign-result").textContent="Sending campaign…";
 try{const result=await api("/api/admin/whatsapp",{method:"POST",body:JSON.stringify({action:"campaign",name:new FormData(e.currentTarget).get("name"),templateName,language,contactIds:ids})});$("campaign-result").textContent="Campaign complete: "+result.sent+" sent, "+result.failed+" failed, "+result.skipped+" skipped.";toast("Campaign finished.");await load();}
 catch(err){$("campaign-result").textContent=err.message;}finally{button.disabled=false;}
});
async function start(){
 try{const me=await api("/api/admin/me");if(!me.authenticated)throw new Error("Sign in required");$("app").classList.remove("hidden");await load();}
 catch{$("login").classList.remove("hidden");}
}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();const form=Object.fromEntries(new FormData(e.currentTarget));try{await api("/api/admin/login",{method:"POST",body:JSON.stringify(form)});$("login").classList.add("hidden");$("app").classList.remove("hidden");await load();}catch(err){$("login-error").textContent=err.message;}});
$("logout").addEventListener("click",async()=>{try{await api("/api/admin/me",{method:"DELETE"});}catch{}location.href="/admin.html";});
start();
