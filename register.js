const form=document.getElementById("register-form");
const button=document.getElementById("register-button");
const error=document.getElementById("register-error");
form.addEventListener("submit",async event=>{
 event.preventDefault();button.disabled=true;error.textContent="Creating your secure workspace…";
 const data=Object.fromEntries(new FormData(form).entries());
 try{
  const response=await fetch("/api/company/register",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Registration failed.");
  error.textContent="Your free trial has started. Opening your dashboard…";
  location.href="/company.html";
 }catch(err){error.textContent=err.message;button.disabled=false;}
});