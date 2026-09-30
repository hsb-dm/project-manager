<script>
/* SHARED GOOGLE DRIVE ACCOUNT — Settings → Integrations (admins only).
   The admin connects Google once here; the refresh token stays on the server (server/gdrive.js,
   table cloud_secrets) and every member's upload is streamed through it. Members never see a
   Google window, so none of the per-browser popup machinery applies to them.
   The client secret is write-only: it can be set and cleared from here, never read back. */
var GDS = { status: null };
function gdsPanel(){
  if(typeof canI!=="function" && !(canI&&canI.manageWorkspace)) return "";
  if(!canI.manageWorkspace()) return "";
  setTimeout(gdsRefresh,0);
  return sp("Shared Google Drive account",'<div id="gdsBody"><p class="hint">'+tr("Checking…")+'</p></div>',"",I.cloud);
}
function gdsRefresh(){
  var el=document.getElementById("gdsBody"); if(!el) return;
  apiFetch("GET","/api/cloud/gdrive/status").then(function(st){
    GDS.status=st; var e=document.getElementById("gdsBody"); if(e) e.innerHTML=gdsMarkup(st);
  },function(err){
    var e=document.getElementById("gdsBody"); if(e) e.innerHTML='<p class="hint">'+esc(err.message)+'</p>';
  });
}
function gdsRow(label,value){ return '<div class="pref"><div class="pl"><b>'+label+'</b><span>'+value+'</span></div></div>'; }
/* The secret field is autocomplete="new-password", not "off": Chrome ignores "off" on a password
   input and offers the saved sign-in for this site instead, which pops the workspace admin's own
   email over the field the moment this panel opens. */
function gdsMarkup(st){
  var cfg=gdCfg(), pub=cfg.publicLinks===true, out="";
  out+='<p class="hint" style="margin-bottom:10px">'+tr("Connect Google once as an admin. Every member then uploads through this one account and never has to sign in to Google.")+'</p>';
  out+=st.shared
    ? gdsRow('<span class="badge approved">'+tr("Connected")+'</span>',tr("Uploads go to")+' '+esc(st.sharedAccount||tr("the connected account"))+' · '+tr("members need no sign-in"))
    : gdsRow('<span class="badge warn">'+tr("Not connected")+'</span>',tr("Members are each asked to sign in to Google until this is connected."));
  /* Every prerequisite is something only the admin can do in Google Cloud Console, so name them
     plainly rather than failing later with a Google error code. */
  out+=gdsRow(tr("1 · OAuth client ID"),st.clientId?'<span class="mono">'+esc(st.clientId)+'</span>':'<em>'+tr("set it in the Google Drive card below")+'</em>');
  out+=gdsRow(tr("2 · Authorised redirect URI"),'<span class="mono">'+esc(st.redirectUri||"")+'</span>');
  out+='<p class="hint">'+tr("Add that exact URI to your OAuth client under “Authorised redirect URIs”. It must match character for character.")+'</p>';
  out+=gdsRow(tr("3 · OAuth client secret"),st.hasSecret?'<span class="badge approved">'+tr("Saved")+'</span> '+tr("stored encrypted; it is never sent back to any browser"):'<span class="badge warn">'+tr("Missing")+'</span>');
  out+='<div class="pref"><div class="pl" style="flex:1"><b><label for="gdsSecret">'+tr("Paste the client secret")+'</label></b>'
     + '<input id="gdsSecret" type="password" name="gdrive-client-secret" autocomplete="new-password" placeholder="'+esc(st.hasSecret?tr("Saved — paste a new one to replace it"):"GOCSPX-…")+'" style="width:100%;max-width:420px">'
     + '</div><div class="pr"><button class="btn" onclick="gdsSaveSecret()">'+tr("Save secret")+'</button>'+(st.hasSecret?'<button class="btn ghost" onclick="gdsSaveSecret(true)">'+tr("Clear")+'</button>':'')+'</div></div>';
  if(!st.shared) out+='<p class="hint">'+tr("If your OAuth consent screen is still in “Testing”, publish it first: refresh tokens expire after seven days there and everyone would have to reconnect weekly.")+'</p>';
  out+='<div class="pref"><div class="pl"><b>'+tr("Upload limit")+'</b><span>'+esc(String(st.maxUploadMB||0))+' MB '+tr("per file, streamed straight to Drive")+'</span></div><div class="pr">'
     + (st.clientId&&st.hasSecret?'<button class="btn primary" onclick="gdsConnect()">'+I.cloud+(st.shared?tr("Reconnect Google"):tr("Connect Google"))+'</button>':'')
     + (st.shared?'<button class="btn ghost" onclick="gdsDisconnect()">'+tr("Disconnect")+'</button>':'')+'</div></div>';
  if(pub) out+='<p class="hint"><b>'+tr("Warning")+':</b> '+tr("“Public links” is on, so every uploaded file is shared with anyone who has the link. With one shared account that is every file the whole team uploads. Turn it off unless you need it.")+'</p>';
  if(st.shared) out+='<p class="hint">'+tr("Files are owned by the connected Google account and count against its storage. ZenCrevia still records which member uploaded each file.")+'</p>';
  return out;
}
function gdsSaveSecret(clear){
  var inp=document.getElementById("gdsSecret"), v=clear?"":String((inp&&inp.value)||"").trim();
  if(!clear&&!v) return toast(tr("Paste the client secret first"),"bad");
  apiFetch("PUT","/api/cloud/gdrive/secret",{clientSecret:v}).then(function(){
    if(inp) inp.value="";
    toast(clear?tr("Client secret cleared"):tr("Client secret saved"));
    gdsRefresh();
  },function(e){ toast(e.message,"bad"); });
}
/* A full-page redirect, not a popup: nothing to block and no opener channel to lose. */
function gdsConnect(){
  apiFetch("POST","/api/cloud/gdrive/connect").then(function(r){
    if(!r||!r.url) return toast(tr("Could not start the Google connection"),"bad");
    location.href=r.url;
  },function(e){ toast(e.message,"bad"); });
}
function gdsDisconnect(){
  if(!confirm(tr("Disconnect the shared Google Drive account? Uploads stop working until someone reconnects it. Files already in Drive are untouched."))) return;
  apiFetch("DELETE","/api/cloud/gdrive/shared").then(function(){ toast(tr("Shared Google Drive disconnected")); gdsRefresh(); if(typeof loadWorkspace==="function") loadWorkspace(); },function(e){ toast(e.message,"bad"); });
}
/* Google hands the admin back to /settings/integrations?gdrive=… — report it, then tidy the URL so
   a later reload does not repeat the message. */
function gdsCallbackNotice(){
  try{
    var q=new URLSearchParams(location.search), st=q.get("gdrive"); if(!st) return;
    if(st==="ok") toast(tr("Google Drive connected for the whole workspace"));
    else toast(tr("Google Drive: ")+(q.get("msg")||tr("could not connect")),"bad");
    q.delete("gdrive"); q.delete("msg");
    history.replaceState(null,"",location.pathname+(q.toString()?"?"+q.toString():"")+location.hash);
    if(typeof loadWorkspace==="function") loadWorkspace();
  }catch(e){}
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){ setTimeout(gdsCallbackNotice,600); }); else setTimeout(gdsCallbackNotice,600);
(function(){ if(typeof setIntegrations!=="function") return; var base=setIntegrations;
  setIntegrations=function(){ var h=base.apply(this,arguments); return typeof h==="string"?gdsPanel()+h:h; }; })();
</script>
