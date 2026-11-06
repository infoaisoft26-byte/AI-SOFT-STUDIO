const $ = id => document.getElementById(id);
let state = { contacts: [], messages: [], templates: [], configured: false };
let activeTab = "inbox";
let selectedContactId = null;
async function api(url, options={}) {
  const response = await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3500);}
function showTab(tab){activeTab=tab;document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));["inbox","leads","campaigns"].forEach(t=>$("tab-"+t).classList.toggle("hidden",t!==tab));}
function contactMessages(id){return state.messages.filter(m=>Number(m.contact_id)===Number(id)).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));}
function lastInbound(id){return contactMessages(id).filter(m=>m.direction==="inbound").sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null;}
function canFreeReply(id){const inbound=lastInbound(id);return Boolean(inbound&&Date.now()-new Date(inbound.created_at).getTime()<24*60*60*1000);}
function renderInbox(){
  const query=$("conversation-search").value.trim().toLowerCase();
  const contacts=state.contacts.filter(c=>!query||[c.name,c.phone,c.last_message].some(v=>String(v||"").toLowerCase().includes(query)));
  $("conversation-list").innerHTML=contacts.length?contacts.map(c=>{
    const latest=state.messages.find(m=>Number(m.contact_id)===Number(c.id));
    return '<button type="button" class="conversation-item '+(Number(c.id)===Number(selectedContactId)?"selected":"")+'" data-contact="'+c.id+'"><span class="conversation-avatar">'+esc((c.name||c.phone||"?").slice(0,1).toUpperCase())+'</span><span class="conversation-copy"><strong>'+esc(c.name||c.phone||"WhatsApp contact")+'</strong><small>'+esc(c.phone)+'</small><span>'+esc(latest?.body||c.last_message||"No message yet")+'</span></span><time>'+esc(latest?new Date(latest.created_at).toLocaleDateString(): "")+'</time></button>';
  }).join(""):'<div class="empty">No matching contacts.</div>';
  const contact=state.contacts.find(c=>Number(c.id)===Number(selectedContactId));
  const thread=contact?contactMessages(contact.id):[];
  $("thread-header").innerHTML=contact?'<div><strong>'+esc(contact.name||contact.phone)+'</strong><small>'+esc(contact.phone)+' · '+esc(contact.lead_status||"new")+'</small></div><span class="window-pill '+(canFreeReply(contact.id)?"open":"closed")+'">'+(canFreeReply(contact.id)?"24-hour reply window open":"Template required")+'</span>':'<div><strong>Select a conversation</strong><small>Choose a customer to view the chat.</small></div>';
  $("thread-messages").innerHTML=thread.length?thread.map(m=>'<article class="chat-bubble '+(m.direction==="outbound"?"outbound":"inbound")+'"><p>'+esc(m.body||"["+m.message_type+"]")+'</p><small>'+esc(new Date(m.created_at).toLocaleString())+' · '+esc(m.status||"received")+'</small></article>').join(""):'<div class="empty">'+(contact?"No messages in this conversation yet.":"Your customer conversations will appear here.")+'</div>';
  const allowed=Boolean(contact&&state.configured&&canFreeReply(contact.id));
  $("reply-text").disabled=!allowed;
  $("send-reply").disabled=!allowed;
  $("reply-text").placeholder=!contact?"Select a customer first":!state.configured?"Connect WhatsApp credentials first":!canFreeReply(contact.id)?"24-hour window closed. Use an approved template.":"Type a WhatsApp message…";
  $("reply-hint").textContent=!state.configured?"WhatsApp sending is unavailable: check the Meta phone number ID and access token in server settings.":!contact?"Select a conversation to reply.":!canFreeReply(contact.id)?"The customer's 24-hour service window is closed. Use an approved template from the Campaigns tab; do not send a free-form message.":"You can send free-form replies while the 24-hour customer service window is open.";
  $("reply-form").classList.toggle("disabled",!allowed);
  $("thread-messages").scrollTop=$("thread-messages").scrollHeight;
}
function render(){
  $("connection").textContent=state.configured?"Meta credentials configured":"Meta credentials missing";
  $("connection").className="connection "+(state.configured?"ok":"bad");
  $("count-contacts").textContent=state.contacts.length;
  $("count-optin").textContent=state.contacts.filter(c=>c.opted_in).length;
  $("count-inbound").textContent=state.messages.filter(m=>m.direction==="inbound").length;
  $("count-templates").textContent=state.templates.length;
  $("leads").innerHTML=state.contacts.length?state.contacts.map(c=>'<tr><td><strong>'+esc(c.name||"WhatsApp contact")+'</strong><small>'+esc(c.phone)+'</small></td><td>'+esc(c.last_message||"—")+'</td><td><span class="lead-status">'+esc(c.lead_status)+'</span></td><td>'+(c.opted_in?"Yes":"No")+'</td><td><div class="lead-controls"><select data-status="'+c.id+'"><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="lost">Lost</option></select><label><input type="checkbox" data-optin="'+c.id+'" '+(c.opted_in?"checked":"")+'> Opt-in</label><button data-save="'+c.id+'">Save</button></div></td></tr>').join(""):'<tr><td colspan="5" class="empty">No contacts yet. Incoming WhatsApp messages will appear here.</td></tr>';
  state.contacts.forEach(c=>{const el=document.querySelector('[data-status="'+c.id+'"]');if(el)el.value=c.lead_status;});
  $("template").innerHTML=state.templates.length?'<option value="">Choose approved template</option>'+state.templates.map(t=>'<option value="'+esc(t.name)+'" data-language="'+esc(t.language)+'">'+esc(t.name)+' · '+esc(t.language)+'</option>').join(""):'<option value="">No approved templates found</option>';
  $("recipients").innerHTML=state.contacts.filter(c=>c.opted_in).map(c=>'<label class="recipient"><input type="checkbox" value="'+c.id+'" checked><span>'+esc(c.name||c.phone)+' · '+esc(c.phone)+'</span></label>').join("")||'<p class="muted">No contacts with recorded opt-in. Record consent in Leads first.</p>';
  renderInbox();
}
async function load({quiet=false}={}){
  $("refresh").disabled=true;
  try{const next=await api("/api/admin/whatsapp");state={...state,...next};if(!state.contacts.some(c=>Number(c.id)===Number(selectedContactId)))selectedContactId=state.contacts[0]?.id??null;render();}
  catch(e){if(!quiet)toast(e.message);}
  finally{$("refresh").disabled=false;}
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
$("refresh").addEventListener("click",()=>load());
$("conversation-search").addEventListener("input",renderInbox);
$("conversation-list").addEventListener("click",e=>{const item=e.target.closest("[data-contact]");if(!item)return;selectedContactId=Number(item.dataset.contact);$("reply-result").textContent="";renderInbox();});
$("template").addEventListener("change",e=>{const opt=e.target.selectedOptions[0];if(opt?.dataset.language)$("language").value=opt.dataset.language;});
$("select-all").addEventListener("click",()=>document.querySelectorAll("#recipients input[type=checkbox]").forEach(x=>x.checked=true));
$("leads").addEventListener("click",async e=>{
 const button=e.target.closest("[data-save]");if(!button)return;
 const id=Number(button.dataset.save),status=document.querySelector('[data-status="'+id+'"]').value,optedIn=document.querySelector('[data-optin="'+id+'"]').checked;
 button.disabled=true;
 try{await api("/api/admin/whatsapp",{method:"POST",body:JSON.stringify({action:"update_contact",id,leadStatus:status,optedIn})});toast("Lead updated.");await load({quiet:true});}
 catch(err){toast(err.message);}finally{button.disabled=false;}
});
$("reply-form").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!selectedContactId){$("reply-result").textContent="Select a customer conversation first.";return;}
 if(!canFreeReply(selectedContactId)){$("reply-result").textContent="The 24-hour reply window is closed. Use an approved template.";renderInbox();return;}
 const text=$("reply-text").value.trim();if(!text)return;
 const button=$("send-reply");button.disabled=true;$("reply-result").textContent="Sending…";
 try{await api("/api/admin/whatsapp",{method:"POST",body:JSON.stringify({action:"send_text",contactId:Number(selectedContactId),text})});$("reply-text").value="";$("reply-result").textContent="Message sent.";await load({quiet:true});}
 catch(err){$("reply-result").textContent=err.message;toast(err.message);}
 finally{renderInbox();button.disabled=!canFreeReply(selectedContactId)||!state.configured;}
});
$("campaign-form").addEventListener("submit",async e=>{
 e.preventDefault();const ids=[...document.querySelectorAll("#recipients input:checked")].map(x=>Number(x.value));
 const templateName=$("template").value,language=$("language").value.trim();
 let components=[];try{components=JSON.parse($("components").value||"[]");if(!Array.isArray(components))throw new Error("Components must be a JSON array.");}catch(err){$("campaign-result").textContent="Invalid template components JSON: "+err.message;return;}
 if(!templateName||!ids.length){$("campaign-result").textContent="Choose an approved template and at least one opted-in contact.";return;}
 const button=$("send-campaign");button.disabled=true;$("campaign-result").textContent="Sending campaign…";
 try{const result=await api("/api/admin/whatsapp",{method:"POST",body:JSON.stringify({action:"campaign",name:new FormData(e.currentTarget).get("name"),templateName,language,contactIds:ids,components})});$("campaign-result").textContent="Campaign complete: "+result.sent+" sent, "+result.failed+" failed, "+result.skipped+" skipped.";toast("Campaign finished.");await load({quiet:true});}
 catch(err){$("campaign-result").textContent=err.message;}finally{button.disabled=false;}
});
async function start(){
 try{const me=await api("/api/admin/me");if(!me.authenticated)throw new Error("Sign in required");$("app").classList.remove("hidden");await load();setInterval(()=>load({quiet:true}),15000);}
 catch{$("login").classList.remove("hidden");}
}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();const form=Object.fromEntries(new FormData(e.currentTarget));try{await api("/api/admin/login",{method:"POST",body:JSON.stringify(form)});$("login").classList.add("hidden");$("app").classList.remove("hidden");await load();setInterval(()=>load({quiet:true}),15000);}catch(err){$("login-error").textContent=err.message;}});
$("logout").addEventListener("click",async()=>{try{await api("/api/admin/me",{method:"DELETE"});}catch{}location.href="/admin.html";});
start();
