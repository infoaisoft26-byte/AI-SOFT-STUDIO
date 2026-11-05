const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(url,options={}){const r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed.");return d}
let currentUser=null,currentView="overview",workspaceData=null;
const views=["overview","whatsapp","inbox","contacts","team","automation"];
const titles={overview:"Overview",whatsapp:"WhatsApp setup",inbox:"Team inbox",contacts:"Contacts",team:"Team members",automation:"Automation"};
function setView(view){if(!views.includes(view))return;currentView=view;document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+view));document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===view));$("top-title").textContent=titles[view];}
function showApp(user){currentUser=user;$("login").classList.add("hidden");$("app").classList.remove("hidden");$("role").textContent=user.role.toUpperCase();$("welcome-user").textContent="Signed in as "+user.name+" · "+user.email;$("sidebar-user").textContent=user.email;$("sidebar-company").textContent=user.companyName||"Your workspace";const manager=["owner","manager"].includes(user.role);$("nav-team").classList.toggle("hidden",!manager);$("nav-automation").classList.toggle("hidden",!manager);$("view-team").classList.toggle("hidden",!manager);$("view-automation").classList.toggle("hidden",!manager);$("number-activation").classList.toggle("hidden",user.role!=="owner");}
function showConnection(status,phone){const connected=status==="connected";$("wa-status").textContent=connected?"Connected":status==="pending"?"Setup pending":"Not connected";$("wa-number").textContent=phone||"Connect your business number";$("connection-status").textContent=connected?"CONNECTED":status==="pending"?"ACTION REQUIRED":"NOT CONNECTED";$("connection-status").classList.toggle("connected",connected);$("connect-whatsapp").textContent=connected?"Reconnect WhatsApp":"Scan QR / Connect WhatsApp";}
async function load(){const d=await api("/api/company/workspace");workspaceData=d;$("company-name").textContent=d.company.name;$("employee-count").textContent=d.metrics.employees;$("contact-count").textContent=d.metrics.contacts;$("account-status").textContent=d.company.status==="trial"?"FREE TRIAL":d.company.status.toUpperCase();$("sidebar-company").textContent=d.company.name;showConnection(d.whatsapp.status,d.whatsapp.display_phone);if(["owner","manager"].includes(d.user.role)){await loadTeam();await loadAutomation();}await loadWhatsApp();}
async function loadAutomation(){try{const d=await api("/api/company/settings");$("auto-reply-enabled").checked=d.auto_reply_enabled;$("auto-reply-text").value=d.auto_reply_text;}catch(err){$("automation-result").textContent=err.message;}}
async function loadWhatsApp(){try{const d=await api("/api/company/whatsapp/connect");showConnection(d.connection.status,d.connection.display_phone);$("connect-whatsapp").disabled=!d.enabled;$("connect-whatsapp").title=d.enabled?"Open Meta's official WhatsApp onboarding":"The platform administrator is completing setup.";if(!d.enabled){$("connect-result").textContent="WhatsApp connection is being prepared by the platform administrator. Please contact support if this continues."; }else if(d.connection.status==="connected"){$("connect-result").textContent="Your WhatsApp Business account is connected and ready."; }else if(!d.connection.status||d.connection.status==="not_connected"){$("connect-result").textContent="Ready. Start the secure Meta onboarding to connect your business number.";} $("register-whatsapp").classList.toggle("hidden",d.connection.status!=="pending");await loadMessages();}catch(err){$("connect-result").textContent=err.message;}}
async function loadMessages(){try{const d=await api("/api/company/whatsapp/messages");const contacts=d.contacts||[],messages=d.messages||[];$("reply-contact").innerHTML='<option value="">Choose a customer contact</option>'+contacts.map(c=>'<option value="'+c.id+'">'+esc(c.name||c.phone)+' · '+esc(c.phone)+'</option>').join("");$("company-messages").innerHTML=messages.map(m=>'<article class="message"><div><b>'+esc(m.name||m.phone||"Customer")+'</b><small>'+esc(m.direction)+' · '+esc(m.status||"received")+'</small></div><p>'+esc(m.body||"")+'</p><time>'+esc(new Date(m.created_at).toLocaleString())+'</time></article>').join("")||'<p class="muted">No customer messages yet. Messages will appear here after WhatsApp is connected.</p>';$("contacts-list").innerHTML=contacts.map(c=>'<tr><td><b>'+esc(c.name||"WhatsApp contact")+'</b></td><td>'+esc(c.phone)+'</td><td>'+esc(c.lead_status||"new")+'</td><td>'+esc(c.last_message_at?new Date(c.last_message_at).toLocaleString():"—")+'</td></tr>').join("")||'<tr><td colspan="4">No contacts yet.</td></tr>';$("contacts-count").textContent=contacts.length+" contacts";}catch(err){$("company-messages").textContent=err.message;}}
let metaSdkPromise=null;
function loadMetaSdk(appId){
 if(window.FB){if(window.__studioMetaSdkAppId===appId)return Promise.resolve(window.FB);window.FB.init({appId,cookie:true,xfbml:false,version:"v26.0"});window.__studioMetaSdkAppId=appId;return Promise.resolve(window.FB);}
 if(metaSdkPromise)return metaSdkPromise;
 metaSdkPromise=new Promise((resolve,reject)=>{
  window.fbAsyncInit=()=>{try{FB.init({appId,cookie:true,xfbml:false,version:"v26.0"});window.__studioMetaSdkAppId=appId;resolve(FB);}catch(error){metaSdkPromise=null;reject(error);}};
  if(!document.querySelector('script[data-meta-sdk="true"]')){
   const script=document.createElement("script");script.src="https://connect.facebook.net/en_US/sdk.js";script.async=true;script.defer=true;script.dataset.metaSdk="true";script.onerror=()=>{metaSdkPromise=null;reject(Error("Meta's secure connection service could not load."));};document.head.appendChild(script);
  }
 });
 return metaSdkPromise;
}
async function launchWhatsAppSignup(){
 const cfg=await api("/api/company/whatsapp/connect");
 if(!cfg.enabled)throw Error("WhatsApp connection is not available yet. Please contact your platform administrator.");
 await loadMetaSdk(cfg.appId);
 let sessionInfo=null,flowEvent=null;
 const allowedOrigins=new Set(["https://www.facebook.com","https://web.facebook.com","https://facebook.com"]);
 const listener=event=>{
  if(!allowedOrigins.has(event.origin)||!event.data)return;
  let payload=event.data;
  if(typeof payload==="string"){try{payload=JSON.parse(payload);}catch{return;}}
  if(payload.type!=="WA_EMBEDDED_SIGNUP")return;
  flowEvent=String(payload.event||"").toUpperCase();
  sessionInfo=payload.data&&typeof payload.data==="object"?payload.data:{};
 };
 window.addEventListener("message",listener);
 try{
  const response=await new Promise((resolve,reject)=>{
   let settled=false;
   const timer=setTimeout(()=>{if(!settled){settled=true;reject(Error("Meta onboarding timed out. Please try again."));}},180000);
   FB.login(result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);},{
    config_id:cfg.configId,
    response_type:"code",
    override_default_response_type:true,
    extras:{
     version:"v4",
     featureType:"whatsapp_business_app_onboarding",
     sessionInfoVersion:"3",
     setup:{
      business:{id:null,name:"AISOFTStudio",phone:{},address:{},timezone:null},
      phone:{category:null,description:""}
     }
    }
   });
  });
  const code=response?.authResponse?.code;
  if(!code)throw Error("Meta connection was cancelled. Please start again and complete all onboarding steps.");
  for(let i=0;i<60&&!sessionInfo;i++)await new Promise(r=>setTimeout(r,250));
  if(flowEvent==="CANCEL"||flowEvent==="ERROR")throw Error("Meta WhatsApp setup was not completed. Please retry and finish the Meta popup.");
  const wabaId=String(sessionInfo?.waba_id||sessionInfo?.wabaId||"");
  const phoneNumberId=String(sessionInfo?.phone_number_id||sessionInfo?.phoneNumberId||"");
  if(!/^\\d{5,30}$/.test(wabaId)||flowEvent!=="FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")
   throw Error("Meta did not confirm a completed WhatsApp Business App Coexistence setup. Please finish the full Meta flow and try again.");
  const result=await api("/api/company/whatsapp/connect",{method:"POST",body:JSON.stringify({code,wabaId,phoneNumberId,signupEvent:flowEvent})});
  $("connect-result").textContent=result.message||"WhatsApp account linked. Checking connection status…";
  await loadWhatsApp();
 }finally{window.removeEventListener("message",listener);}
}
$("connect-whatsapp").addEventListener("click",async()=>{const b=$("connect-whatsapp");b.disabled=true;$("connect-result").textContent="Opening Meta's secure WhatsApp onboarding…";try{await launchWhatsAppSignup();}catch(err){$("connect-result").textContent=err.message;}finally{b.disabled=false;}});
$("register-whatsapp").addEventListener("click",async()=>{const b=$("register-whatsapp");b.disabled=true;try{const d=await api("/api/company/whatsapp/register",{method:"POST",body:JSON.stringify({pin:$("whatsapp-pin").value.trim()})});$("connect-result").textContent=d.message;$("whatsapp-pin").value="";await loadWhatsApp();}catch(err){$("connect-result").textContent=err.message;}finally{b.disabled=false;}});
$("workspace-nav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b&&!b.classList.contains("hidden"))setView(b.dataset.view);});
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.go)));
$("refresh-workspace").addEventListener("click",async()=>{const b=$("refresh-workspace");b.disabled=true;try{await load();}catch(err){$("connect-result").textContent=err.message;}finally{b.disabled=false;}});
$("refresh-inbox").addEventListener("click",loadMessages);
$("automation-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/company/settings",{method:"POST",body:JSON.stringify({autoReplyEnabled:$("auto-reply-enabled").checked,autoReplyText:$("auto-reply-text").value})});$("automation-result").textContent="Automation settings saved.";}catch(err){$("automation-result").textContent=err.message;}});
$("reply-form").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),b=e.currentTarget.querySelector("button");b.disabled=true;$("reply-result").textContent="Sending…";try{await api("/api/company/whatsapp/messages",{method:"POST",body:JSON.stringify({contactId:Number(fd.get("contactId")),text:fd.get("text")})});$("reply-text").value="";$("reply-result").textContent="Message sent.";await loadMessages();}catch(err){$("reply-result").textContent=err.message;}finally{b.disabled=false;}});
async function loadTeam(){const d=await api("/api/company/team");$("members").innerHTML=d.members.map(m=>'<div class="member"><div><b>'+esc(m.name)+'</b><small>'+esc(m.email)+' · '+esc(m.role)+(m.active?"":" · Disabled")+'</small></div>'+(m.role!=="owner"?'<button data-toggle="'+m.id+'" data-active="'+m.active+'">'+(m.active?"Disable":"Enable")+'</button>':"")+'</div>').join("")||'<p class="muted">No team members yet.</p>';}
$("team-form").addEventListener("submit",async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.currentTarget));try{const d=await api("/api/company/team",{method:"POST",body:JSON.stringify(fd)});$("team-result").textContent="Employee created: "+d.member.email+" · Temporary password: "+d.temporaryPassword+" (copy and share securely now)";e.currentTarget.reset();await loadTeam();}catch(err){$("team-result").textContent=err.message;}});
$("members").addEventListener("click",async e=>{const b=e.target.closest("[data-toggle]");if(!b)return;try{await api("/api/company/team",{method:"PATCH",body:JSON.stringify({id:Number(b.dataset.toggle),active:b.dataset.active!=="true"})});await loadTeam();}catch(err){$("team-result").textContent=err.message;}});
$("login-form").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{const d=await api("/api/company/auth",{method:"POST",body:JSON.stringify({email:fd.get("email"),password:fd.get("password")})});showApp(d.user);await load();}catch(err){$("login-error").textContent=err.message;}});
$("logout").addEventListener("click",async()=>{try{await api("/api/company/auth",{method:"DELETE"});}finally{location.reload();}});
api("/api/company/auth").then(async d=>{if(d.authenticated){showApp(d.user);await load();}}).catch(()=>{});
