<script>
/* ============================================================
   ADMIN OPERATIONS — v17 §P1-4 (SMTP) and §P1-5 (Backup & Data)
   Both areas follow §P1-7: category navigation, an overview page,
   plain-language labels, helper text, and advanced fields collapsed.
   ============================================================ */

function bytesLabel(n){ n=+n||0; if(n<1024) return n+" B"; if(n<1048576) return Math.round(n/1024)+" KB"; if(n<1073741824) return (n/1048576).toFixed(1)+" MB"; return (n/1073741824).toFixed(2)+" GB"; }
function whenLabel(iso){ if(!iso) return "—"; try{ return new Date(iso).toLocaleString(); }catch(e){ return iso; } }
function serverOnlyNotice(what){
  return '<div class="banner warn">'+tr("This runs on the server.")+' '+tr(what)+'</div>';
}

/* ============================================================
   §P1-4 SMTP — guided setup inside the Admin dashboard
   1 provider · 2 server · 3 credentials · 4 sender · 5 test · 6 send · 7 save
   ============================================================ */
var SMTP_PRESETS = [
  ["gmail","Google Workspace / Gmail","smtp.gmail.com",587,false,"Create an App Password in your Google account — the normal password will be rejected."],
  ["microsoft","Microsoft 365","smtp.office365.com",587,false,"The mailbox must have SMTP AUTH enabled by your tenant admin."],
  ["ses","Amazon SES","email-smtp.us-east-1.amazonaws.com",587,false,"Use SES SMTP credentials (not your AWS access keys), and match the region in the host."],
  ["sendgrid","SendGrid SMTP","smtp.sendgrid.net",587,false,"The username is literally “apikey”; the password is the API key itself."],
  ["mailgun","Mailgun SMTP","smtp.mailgun.org",587,false,"Use the SMTP credentials shown on your sending domain."],
  ["zoho","Zoho","smtp.zoho.com",587,false,"Enable IMAP/SMTP access in the Zoho admin console first."],
  ["custom","Custom SMTP","",587,false,""]
];
var SMTP = { loaded:false, cfg:null, presets:null, testing:false, result:null, secretsReady:true };

function smtpPreset(id){ var f=SMTP_PRESETS.filter(function(p){ return p[0]===id; })[0]; return f||SMTP_PRESETS[SMTP_PRESETS.length-1]; }
function loadSmtp(){
  if(!API.on) return;
  apiFetch("GET","/api/mail/smtp").then(function(r){
    SMTP.loaded=true; SMTP.cfg=r.config; SMTP.secretsReady=r.secretsReady!==false;
    if(S.screen==="settings"&&S.settingsTab==="notifications") renderScreen(false);
  }).catch(function(){ SMTP.loaded=true; });
}
/* Applying a preset fills the server fields but never touches what the admin
   has already typed into the credential or sender fields. */
function smtpApplyPreset(id){
  var p=smtpPreset(id);
  var host=document.getElementById("smtp_host"), port=document.getElementById("smtp_port"), sec=document.getElementById("smtp_secure");
  if(host&&p[2]) host.value=p[2];
  if(port) port.value=p[3];
  if(sec) sec.checked=!!p[4];
  var note=document.getElementById("smtp_note");
  if(note) note.textContent=p[5]||"";
  var seg=document.getElementById("smtp_provider");
  if(seg) seg.value=id;
}
function smtpFormValues(){
  return {
    enabled: document.getElementById("smtp_enabled").classList.contains("on"),
    provider: val("smtp_provider"),
    host: val("smtp_host").trim(),
    port: +val("smtp_port")||587,
    secure: document.getElementById("smtp_secure").checked,
    user: val("smtp_user").trim(),
    pass: val("smtp_pass"),
    fromName: val("smtp_from_name").trim(),
    fromEmail: val("smtp_from_email").trim(),
    replyTo: val("smtp_reply").trim()
  };
}
function smtpTestConnection(){
  var btn=document.getElementById("smtpTestBtn"); if(btn){ btn.disabled=true; btn.textContent=tr("Connecting…"); }
  var done=function(html){ var el=document.getElementById("smtpResult"); if(el) el.innerHTML=html; if(btn){ btn.disabled=false; btn.textContent=tr("Test connection"); } };
  apiFetch("POST","/api/mail/smtp/test",smtpFormValues()).then(function(r){
    done('<div class="banner ok"><b>'+tr("Connection succeeded")+'</b> — '+tr("encryption")+': <span class="mono">'+esc(r.encryption)+'</span>'
      + (r.authenticated?' · '+tr("credentials accepted"):' · '+tr("no credentials sent"))+'</div>');
  }).catch(function(e){
    done('<div class="banner warn"><b>'+tr("Connection failed")+'</b> — '+esc(e.message)+'</div>');
  });
}
function smtpSendTest(){
  var btn=document.getElementById("smtpSendBtn"); if(btn){ btn.disabled=true; btn.textContent=tr("Sending…"); }
  var to=val("smtp_test_to").trim();
  var done=function(html){ var el=document.getElementById("smtpResult"); if(el) el.innerHTML=html; if(btn){ btn.disabled=false; btn.textContent=tr("Send test email"); } };
  apiFetch("POST","/api/mail/smtp/send-test",Object.assign(smtpFormValues(),{to:to})).then(function(r){
    done('<div class="banner ok"><b>'+tr("Test email sent")+'</b> — '+esc(r.to)+'. '+tr("Check the inbox, including spam.")+'</div>');
  }).catch(function(e){
    done('<div class="banner warn"><b>'+tr("Send failed")+'</b> — '+esc(e.message)+'</div>');
  });
}
function smtpSave(){
  var v=smtpFormValues();
  if(v.enabled&&!v.host) return toast(tr("Enter the SMTP host"),"bad");
  if(v.enabled&&!v.fromEmail) return toast(tr("Enter the sender email address"),"bad");
  apiFetch("PUT","/api/mail/smtp",v).then(function(cfg){
    SMTP.cfg=cfg; toast(tr("SMTP settings saved")); renderScreen(false);
  }).catch(function(e){ toast(e.message,"bad"); });
}
function setSmtp(){
  var ed=canI.manageWorkspace();
  if(!API.on) return sp("SMTP",serverOnlyNotice("Start the server (npm start) to configure email delivery from here.")
    + '<p class="hint">'+tr("In standalone demo mode there is no mail transport, so notification emails are not sent.")+'</p>',null,I.inbox||I.bell);
  if(!SMTP.loaded){ setTimeout(loadSmtp,0); return sp("SMTP",'<div class="hint">'+tr("Loading email settings…")+'</div>',null,I.inbox||I.bell); }
  var c=SMTP.cfg||{}, ro=ed?"":" disabled";
  var pv=c.provider||"custom", preset=smtpPreset(pv);
  var stepRow=function(n,title,body){
    return '<div class="setup-step"><span class="setup-num">'+n+'</span><div class="setup-body"><b>'+tr(title)+'</b>'+body+'</div></div>'; };

  var body=''
    + '<div class="pref"><div class="pl"><b>'+tr("Send email through SMTP")+'</b><span>'+tr("When this is off, ZenCrevia falls back to the transport configured on the server (or writes .eml files in demo mode).")+'</span></div>'
    + '<button class="switch'+(c.enabled?" on":"")+'" id="smtp_enabled" '+(ed?'onclick="this.classList.toggle(\'on\')"':'disabled')+'></button></div>'

    + stepRow(1,"Choose a provider",
        '<div class="field">'+selectHtml("smtp_provider",SMTP_PRESETS.map(function(p){ return [p[0],p[1]]; }),pv,ro+' onchange="smtpApplyPreset(this.value)"')
        + '<p class="hint" id="smtp_note">'+esc(preset[5]||"")+'</p></div>')

    + stepRow(2,"Server details",
        '<div class="field-row">'+fieldHtml("smtp_host","Host",'<input'+ro+' id="smtp_host" value="'+attr(c.host||"")+'" placeholder="smtp.example.com">')
        + fieldHtml("smtp_port","Port",'<input'+ro+' id="smtp_port" type="number" min="1" max="65535" value="'+(c.port||587)+'">')+'</div>'
        + '<label class="chipx" style="cursor:pointer"><input type="checkbox" id="smtp_secure"'+(c.secure?" checked":"")+(ed?"":" disabled")+'> '+tr("Use implicit TLS (port 465)")+'</label>'
        + '<p class="hint">'+tr("Leave this off for port 587 — STARTTLS is negotiated automatically.")+'</p>')

    + stepRow(3,"Credentials",
        '<div class="field-row">'+fieldHtml("smtp_user","Username",'<input'+ro+' id="smtp_user" autocomplete="off" value="'+attr(c.user||"")+'">')
        + fieldHtml("smtp_pass","Password / app password",'<input'+ro+' id="smtp_pass" type="password" autocomplete="new-password" placeholder="'+(c.passSet?"•••• "+tr("stored — leave blank to keep it"):tr("Enter the SMTP password"))+'">')+'</div>'
        + '<p class="hint">'+tr("The password is encrypted on the server and is never sent back to the browser. To remove it, type:")+' <code>clear</code>'
        + (SMTP.secretsReady?'':' · <span class="badge warn">'+tr("Set COS_SECRET_KEY on the server to encrypt it at rest")+'</span>')+'</p>')

    + stepRow(4,"Sender",
        '<div class="field-row">'+fieldHtml("smtp_from_name","From name",'<input'+ro+' id="smtp_from_name" value="'+attr(c.fromName||WS.name||"")+'" placeholder="'+attr(WS.name||"ZenCrevia")+'">')
        + fieldHtml("smtp_from_email","From email",'<input'+ro+' id="smtp_from_email" type="email" value="'+attr(c.fromEmail||"")+'" placeholder="no-reply@yourdomain.com">')+'</div>'
        + fieldHtml("smtp_reply","Reply-to (optional)",'<input'+ro+' id="smtp_reply" type="email" value="'+attr(c.replyTo||"")+'" placeholder="team@yourdomain.com">')
        + '<p class="hint">'+tr("The from address usually has to belong to a domain your provider has verified, or messages will be rejected.")+'</p>')

    + stepRow(5,"Test the connection",
        '<p class="hint">'+tr("Reaches the server, negotiates TLS and signs in. Nothing is sent.")+'</p>'
        + '<button class="btn" id="smtpTestBtn" '+(ed?'onclick="smtpTestConnection()"':'disabled')+'>'+I.sync+tr("Test connection")+'</button>')

    + stepRow(6,"Send a test email",
        '<div class="field-row">'+fieldHtml("smtp_test_to","Send to",'<input'+ro+' id="smtp_test_to" type="email" value="'+attr((person(ME)||{}).email||"")+'">')+'</div>'
        + '<button class="btn" id="smtpSendBtn" '+(ed?'onclick="smtpSendTest()"':'disabled')+'>'+I.inbox||I.bell+tr("Send test email")+'</button>')

    + '<div id="smtpResult" style="margin-top:12px"></div>'
    + (c.updatedAt?'<p class="hint" style="margin-top:10px">'+tr("Last saved")+' '+esc(whenLabel(c.updatedAt))+(c.updatedBy?' '+tr("by")+' '+esc((person(c.updatedBy)||{}).name||c.updatedBy):'')+'</p>':'');

  return sp("SMTP",body, ed?'<button class="btn primary" onclick="smtpSave()">'+tr("Save SMTP settings")+'</button>':'', I.inbox||I.bell)
       + setMailLog();
}
/* §10 delivery logs and retry status */
var MAIL_LOG=null;
function setMailLog(){
  if(!API.on||!canI.manageWorkspace()) return "";
  if(MAIL_LOG===null){ MAIL_LOG=[]; apiFetch("GET","/api/mail/log").then(function(r){ MAIL_LOG=r.entries||[]; MAIL_LOG.state=r.state; if(S.settingsTab==="notifications") renderScreen(false); }).catch(function(){}); }
  var rows=(MAIL_LOG||[]).slice(0,12).map(function(e){
    return '<div class="pref"><div class="pl"><b>'+esc((person(e.to)||{}).name||e.to)+' <span class="badge'+(e.error?" bad":" ok")+'">'+tr(e.error?"Failed":"Sent")+'</span></b>'
      + '<span>'+esc(e.kind||"")+' · '+esc(whenLabel(e.at))+(e.error?' · <span style="color:var(--color-danger)">'+esc(e.error)+'</span>':'')+'</span></div></div>'; }).join("");
  var st=(MAIL_LOG&&MAIL_LOG.state)||{};
  return sp("Delivery log",
    '<p class="hint" style="margin-bottom:10px">'+tr("The most recent notification emails and what happened to them.")+'</p>'
    + '<div class="pref"><div class="pl"><b>'+(st.sent||0)+' '+tr("sent")+' · '+(st.failed||0)+' '+tr("failed")+'</b><span>'+(st.lastError?tr("Last error")+': '+esc(st.lastError):tr("No delivery errors recorded."))+'</span></div></div>'
    + (rows||'<p class="hint">'+tr("Nothing has been sent yet.")+'</p>'),
    '<button class="btn ghost" onclick="MAIL_LOG=null;renderScreen(false)">'+I.sync+tr("Refresh")+'</button>', I.list);
}

/* ============================================================
   §P1-5 BACKUP & DATA
   Overview · Backup History · Import / Export · Automatic · Retention · Storage
   ============================================================ */
var BACKUP_SECTIONS = [
  ["overview","Overview"],["history","Backup History"],["io","Import / Export"],
  ["auto","Automatic Backups"],["retention","Retention"],["storage","Storage"]
];
var BK = { loaded:false, data:null, busy:false };
function backupSection(){ var v=S.backupSection; return BACKUP_SECTIONS.some(function(x){ return x[0]===v; })?v:"overview"; }
function loadBackups(force){
  if(!API.on||!canI.manageWorkspace()) return;
  if(BK.loaded&&!force) return;
  BK.loaded=true;
  apiFetch("GET","/api/backups").then(function(r){
    BK.data=r; if(S.screen==="settings"&&S.settingsTab==="backup") renderScreen(false);
  }).catch(function(e){ BK.data={error:e.message}; if(S.settingsTab==="backup") renderScreen(false); });
}
function setBackup(){
  var cur=backupSection();
  var nav='<div class="subnav" role="tablist">'+BACKUP_SECTIONS.map(function(x){
    return '<button role="tab" aria-selected="'+(cur===x[0]?"true":"false")+'" class="'+(cur===x[0]?"on":"")+'" onclick="S.backupSection=\''+x[0]+'\';renderScreen(false)">'+tr(x[1])+'</button>'; }).join("")+'</div>';
  if(API.on&&canI.manageWorkspace()) setTimeout(function(){ loadBackups(false); },0);
  return nav+({overview:bkOverview,history:bkHistory,io:bkImportExport,auto:bkAuto,retention:bkRetention,storage:bkStorage}[cur])();
}
function bkNotReady(){
  if(!API.on) return sp("Backup & data",serverOnlyNotice("Encrypted backups, history and restore need the server. In standalone demo mode you can still download and load a JSON snapshot from Import / Export."),null,I.lock);
  if(!canI.manageWorkspace()) return sp("Backup & data",'<p class="hint">'+tr("Your role cannot view backups.")+'</p>',null,I.lock);
  if(!BK.data) return sp("Backup & data",'<div class="hint">'+tr("Loading backup status…")+'</div>',null,I.lock);
  if(BK.data.error) return sp("Backup & data",'<div class="banner warn">'+esc(BK.data.error)+'</div>',null,I.lock);
  if(!BK.data.configured) return sp("Backup & data",
    '<div class="banner warn"><b>'+tr("Setup required")+'</b> — '+tr("Set")+' <span class="mono">COS_BACKUP_KEY</span> '+tr("on the server (at least 32 characters) to enable encrypted backups.")+'</div>',null,I.lock);
  return null;
}
function bkOverview(){
  var gate=bkNotReady(); if(gate) return gate;
  var d=BK.data, list=d.backups||[], latest=list[0];
  var bad=list.filter(function(b){ return b.integrityStatus==="corrupt"||b.integrityStatus==="missing"; }).length;
  var row=function(label,value,badge){
    return '<div class="pref"><div class="pl"><b>'+tr(label)+'</b>'+(badge?'<span>'+badge+'</span>':'')+'</div><b class="mono">'+esc(value)+'</b></div>'; };
  return sp("Backup overview",
    '<p class="hint" style="margin-bottom:10px">'+tr("Whether this workspace could actually be recovered right now.")+'</p>'
    + row("Latest backup", latest?whenLabel(latest.createdAt):tr("none yet"), latest?'<span class="badge ok">'+tr("Encryption ready")+'</span>':'<span class="badge warn">'+tr("No backup has been created")+'</span>')
    + row("Backups kept", list.length+" / "+((d.settings||{}).keep||14), null)
    + (function(){ var sc=d.schedule||{}, h=+sc.intervalHours||0, lbl=!h?"Off":(h===24?"Daily":h===168?"Weekly":"Every "+h+"h"); return row("Automatic backups", tr(lbl)+(sc.source==="environment"?' · '+tr("set by server"):''), !h?'<span class="badge warn">'+tr("Manual only")+'</span>':''); })()
    + row("Integrity", bad?bad+" "+tr("need attention"):tr("all verified"), bad?'<span class="badge bad">'+tr("Check Backup History")+'</span>':'<span class="badge ok">'+tr("Checksums match")+'</span>')
    + row("Off-server copy", (d.settings||{}).offsite?tr("configured"):tr("not configured"), (d.settings||{}).offsite?'':'<span class="badge warn">'+tr("A copy on the same disk does not survive losing the disk")+'</span>'),
    canI.manageWorkspace()?'<button class="btn primary" onclick="createServerBackup()">'+I.lock+tr("Create backup now")+'</button>':'', I.lock);
}
function bkKindBadge(kind){
  var map={manual:["Manual",""],scheduled:["Scheduled","ok"],"pre-restore":["Safety copy","warn"],"pre-import":["Safety copy","warn"]};
  var m=map[kind]||["Manual",""];
  return '<span class="badge '+m[1]+'">'+tr(m[0])+'</span>';
}
function bkIntegrityBadge(status){
  if(status==="verified") return '<span class="badge ok">'+tr("Verified")+'</span>';
  if(status==="corrupt")  return '<span class="badge bad">'+tr("Checksum mismatch")+'</span>';
  if(status==="missing")  return '<span class="badge bad">'+tr("File missing")+'</span>';
  return '<span class="badge">'+tr("Unverified")+'</span>';
}
function bkHistory(){
  var gate=bkNotReady(); if(gate) return gate;
  var list=BK.data.backups||[];
  var rows=list.length?list.map(function(b){
    return '<div class="pref"><span class="sq">'+I.lock+'</span><div class="pl">'
      + '<b>'+esc(b.name)+' '+bkKindBadge(b.kind)+' '+bkIntegrityBadge(b.integrityStatus)+'</b>'
      + '<span>'+esc(whenLabel(b.createdAt))+' · '+esc(bytesLabel(b.bytes))
      + (b.tables?' · '+b.tables+' '+tr("tables"):'')
      + (b.createdBy?' · '+esc((person(b.createdBy)||{}).name||b.createdBy):'')
      + (b.reason?' · '+esc(b.reason):'')+'</span></div>'
      + '<button class="btn xs ghost" onclick="bkVerify(\''+attr(b.name)+'\')">'+tr("Verify")+'</button>'
      + '<button class="btn xs" onclick="bkDetail(\''+attr(b.name)+'\')">'+tr("Details")+'</button>'
      + '<button class="btn sm" onclick="bkRestoreModal(\''+attr(b.name)+'\')">'+I.sync+tr("Restore")+'</button>'
      + '</div>'; }).join("")
    : emptyBox("No backups yet","Create one now so this workspace can be recovered.");
  var audit=(BK.data.audit||[]).slice(0,8);
  var auditRows=audit.length?'<div class="eyebrow" style="margin:16px 0 6px">'+tr("Restore audit trail")+'</div>'
    + audit.map(function(a){
        return '<div class="pref"><div class="pl"><b>'+tr(a.action==="restore"?"Restore":"Operation")+' '
          + (a.result==="ok"?'<span class="badge ok">'+tr("Succeeded")+'</span>':'<span class="badge bad">'+tr("Failed")+(a.rolledBack?' · '+tr("rolled back"):'')+'</span>')+'</b>'
          + '<span>'+esc(whenLabel(a.at))+' · '+esc(a.backup||"")+(a.userId?' · '+esc((person(a.userId)||{}).name||a.userId):'')
          + (a.error?' · <span style="color:var(--color-danger)">'+esc(a.error)+'</span>':'')+'</span></div></div>'; }).join("")
    : "";
  return sp("Backup History",
    '<p class="hint" style="margin-bottom:10px">'+tr("Every stored backup, what created it, and whether its checksum still matches. Safety copies taken before a restore or import are kept even when retention prunes the rest.")+'</p>'
    + rows + auditRows,
    '<button class="btn primary" onclick="createServerBackup()">'+I.lock+tr("Create backup now")+'</button><button class="btn ghost" onclick="loadBackups(true)">'+I.sync+tr("Refresh")+'</button>', I.list);
}
function bkVerify(name){
  apiFetch("POST","/api/backups/"+encodeURIComponent(name)+"/verify",{}).then(function(r){
    toast(r.detail, r.ok?"":"bad"); loadBackups(true);
  }).catch(function(e){ toast(e.message,"bad"); });
}
function bkDetail(name){
  apiFetch("GET","/api/backups/"+encodeURIComponent(name)).then(function(m){
    openModal("Backup details",
      '<div class="pref"><div class="pl"><b>'+tr("File")+'</b><span class="mono">'+esc(m.name)+'</span></div></div>'
      + '<div class="pref"><div class="pl"><b>'+tr("Created")+'</b><span>'+esc(whenLabel(m.createdAt))+(m.createdBy?' · '+esc((person(m.createdBy)||{}).name||m.createdBy):'')+'</span></div></div>'
      + '<div class="pref"><div class="pl"><b>'+tr("Type")+'</b><span>'+esc(m.kind||"manual")+(m.reason?' — '+esc(m.reason):'')+'</span></div></div>'
      + '<div class="pref"><div class="pl"><b>'+tr("Size")+'</b><span>'+esc(bytesLabel(m.bytes))+(m.tables?' · '+m.tables+' '+tr("tables"):'')+'</span></div></div>'
      + '<div class="pref"><div class="pl"><b>'+tr("Checksum (SHA-256)")+'</b><span class="mono" style="word-break:break-all">'+esc(m.checksum||"—")+'</span></div></div>'
      + '<div class="pref"><div class="pl"><b>'+tr("Integrity")+'</b><span>'+bkIntegrityBadge(m.integrity&&m.integrity.status)+' '+esc((m.integrity&&m.integrity.detail)||"")+'</span></div></div>',
      '<button class="btn" onclick="closeModal()">'+tr("Close")+'</button><button class="btn primary" onclick="closeModal();bkRestoreModal(\''+attr(m.name)+'\')">'+tr("Restore this backup")+'</button>',true);
  }).catch(function(e){ toast(e.message,"bad"); });
}
/* §P1-5 restore is explicit: the admin types the file name, and the flow that
   runs takes a safety copy first and rolls back if anything fails. */
function bkRestoreModal(name){
  openModal("Restore this backup?",
    '<p>'+tr("This replaces the live workspace data with the contents of:")+' <b class="mono">'+esc(name)+'</b></p>'
    + '<div class="restore-summary"><b>'+tr("Before you continue")+'</b><span>'+tr("The workspace may pause briefly while the database is switched. Other open screens should be refreshed after it finishes.")+'</span></div>'
    + '<ol class="restore-steps">'
    + '<li><span>1</span><div><b>'+tr("Protect current data")+'</b><small>'+tr("Create an encrypted safety copy of the database as it is now.")+'</small></div></li>'
    + '<li><span>2</span><div><b>'+tr("Validate the backup")+'</b><small>'+tr("Check its checksum, decrypt it, and verify the staged database.")+'</small></div></li>'
    + '<li><span>3</span><div><b>'+tr("Switch and reconnect")+'</b><small>'+tr("Close the active database, switch files, and reconnect automatically. If this fails, the previous database is restored.")+'</small></div></li>'
    + '</ol>'
    + fieldHtml("bk_confirm","Type the backup file name to confirm",'<input id="bk_confirm" data-confirm-name="'+attr(name)+'" autocomplete="off" spellcheck="false" placeholder="'+attr(name)+'" oninput="bkRestoreConfirmState(this)">')
    + '<div id="bkRestoreStatus" class="restore-status" role="status" aria-live="polite"></div>',
    '<button class="btn" id="bkRestoreCancel" onclick="closeModal()">'+tr("Cancel")+'</button>'
    + '<button class="btn danger" id="bkRestoreBtn" data-backup-name="'+attr(name)+'" onclick="bkRestore(this)" disabled>'+tr("Restore backup")+'</button>',true);
}
function bkRestoreConfirmState(input){
  var btn=document.getElementById("bkRestoreBtn"), expected=input&&input.getAttribute("data-confirm-name")||"";
  if(btn) btn.disabled=!input||input.value.trim()!==expected||BK.busy;
}
function bkRestore(trigger){
  if(BK.busy) return;
  var name=trigger&&trigger.getAttribute("data-backup-name")||"", input=document.getElementById("bk_confirm");
  if(!input||input.value.trim()!==name) return toast(tr("The name does not match."),"bad");
  BK.busy=true;
  var btn=document.getElementById("bkRestoreBtn"), cancel=document.getElementById("bkRestoreCancel"), status=document.getElementById("bkRestoreStatus");
  if(btn){ btn.disabled=true; btn.classList.add("is-busy"); btn.innerHTML='<span class="restore-spinner" aria-hidden="true"></span>'+tr("Restoring…"); }
  if(cancel) cancel.disabled=true;
  input.readOnly=true;
  if(status){ status.className="restore-status show"; status.textContent=tr("Creating a safety copy and validating the selected backup…"); }
  apiFetch("POST","/api/backups/"+encodeURIComponent(name)+"/restore",{confirm:name}).then(function(r){
    BK.busy=false; BK.loaded=false; closeModal();
    openModal("Restore complete",
      '<div class="banner ok"><b>'+tr("The database was restored.")+'</b></div>'
      + '<p>'+tr("A safety copy of the previous database was saved as")+' <b class="mono">'+esc(r.safetyBackup||"—")+'</b>.</p>'
      + '<p class="hint">'+tr("The server has already reconnected to the restored database. Reload this workspace to see the restored data. You may need to sign in again if this login did not exist in that backup.")+'</p>',
      '<button class="btn" onclick="closeModal()">'+tr("Later")+'</button><button class="btn primary" onclick="location.reload()">'+tr("Reload workspace")+'</button>');
  }).catch(function(e){
    BK.busy=false;
    if(btn){ btn.classList.remove("is-busy"); btn.textContent=tr("Restore backup"); }
    if(cancel) cancel.disabled=false;
    input.readOnly=false; bkRestoreConfirmState(input);
    if(status){ status.className="restore-status show error"; status.innerHTML='<b>'+tr("Restore failed")+'</b><span>'+esc(e.message)+'</span>'; }
    loadBackups(true);
  });
}
function bkImportExport(){
  var actions='<button class="btn primary" onclick="exportJSON()">'+I.download+tr("Download JSON snapshot")+'</button>';
  if(!API.on) actions+='<button class="btn" onclick="importJSON()">'+I.up+tr("Load snapshot")+'</button>';
  else if(canI.manageWorkspace()) actions+='<button class="btn" onclick="bkPreImportBackup()">'+I.lock+tr("Take a safety backup before importing")+'</button>';
  return sp("Import / Export",
    '<p class="hint" style="margin-bottom:10px">'
    + tr(API.on
        ? "The server database is the source of truth. A JSON snapshot is useful for review or migration; the encrypted backups are the recovery copy."
        : "Demo changes last until you reload the page. Download a snapshot to keep this state, or load one to restore it.")
    + '</p>'
    /* §9 secret exclusion from portable exports */
    + '<div class="pref"><div class="pl"><b>'+tr("What a JSON snapshot leaves out")+'</b><span>'+tr("Provider API keys, SMTP credentials and member passwords are never written to a portable export.")+'</span></div></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'+actions+'</div>', null, I.download)
    + sp("Report exports",'<p class="hint">'+tr("Reports are generated from the Export dialog on Analytics.")+'</p>',null,I.analytics);
}
function bkPreImportBackup(){
  toast(tr("Creating safety backup…"));
  apiFetch("POST","/api/backups",{kind:"pre-import",reason:"Safety copy taken before a data import"})
    .then(function(r){ toast(tr("Safety backup created")+": "+r.name); loadBackups(true); })
    .catch(function(e){ toast(e.message,"bad"); });
}
function bkAuto(){
  var gate=bkNotReady(); if(gate) return gate;
  var d=BK.data.settings||{}, sch=BK.data.schedule||{}, envLock=sch.source==="environment", ed=canI.manageWorkspace()&&!envLock;
  var shown=envLock?(sch.intervalHours?"":"off"):(sch.mode||d.auto||"off");
  return sp("Automatic Backups",
    '<p class="hint" style="margin-bottom:10px">'+tr("A scheduled backup runs on the server. It uses the same encryption and retention as a manual one.")+'</p>'
    + (envLock?'<div class="banner warn" style="margin-bottom:10px">'+tr("The server sets this schedule through COS_BACKUP_INTERVAL_HOURS")+' ('+(sch.intervalHours?esc(String(sch.intervalHours))+' h':tr("Off"))+'). '+tr("Remove the variable to manage it here.")+'</div>':'')
    + '<div class="field">'+selectHtml("bk_auto",[["off","Off — manual backups only"],["daily","Daily"],["weekly","Weekly"]],shown,(ed?"":"disabled"))+'</div>'
    + '<p class="hint">'+tr("Last automatic backup")+': '+esc(whenLabel(d.lastAutoAt))+'</p>'
    + '<div class="banner warn" style="margin-top:12px">'+tr("The schedule is enforced by the server process. If it is not running, no automatic backup is taken — treat this as a convenience, not a guarantee.")+'</div>',
    ed?'<button class="btn primary" onclick="bkSaveSettings()">'+tr("Save")+'</button>':'', I.calendar);
}
function bkRetention(){
  var gate=bkNotReady(); if(gate) return gate;
  var d=BK.data.settings||{}, ed=canI.manageWorkspace();
  return sp("Retention",
    '<p class="hint" style="margin-bottom:10px">'+tr("How many backups to keep. The oldest are removed once the limit is passed — except safety copies taken before a restore or import, which are always kept.")+'</p>'
    + '<div class="pref"><div class="pl"><b>'+tr("Backups to keep")+'</b><span>'+tr("Recommended")+': 14.</span></div>'
    + '<input type="number" min="3" max="365" id="bk_keep" value="'+(d.keep||14)+'" '+(ed?"":"disabled")+' style="border:1px solid var(--color-border);border-radius:8px;padding:5px 9px;width:88px;background:var(--color-surface)"></div>',
    ed?'<button class="btn primary" onclick="bkSaveSettings()">'+tr("Save")+'</button>':'', I.filter);
}
function bkStorage(){
  var gate=bkNotReady(); if(gate) return gate;
  var st=BK.data.storage||{}, d=BK.data.settings||{}, ed=canI.manageWorkspace();
  return sp("Storage",
    '<div class="pref"><div class="pl"><b>'+tr("Backup directory")+'</b><span class="mono">'+esc(st.dir||"—")+'</span></div></div>'
    + '<div class="pref"><div class="pl"><b>'+tr("Stored")+'</b><span>'+(st.count||0)+' '+tr("backups")+' · '+esc(bytesLabel(st.bytes))+'</span></div></div>'
    /* §P2-3 the standalone demo embeds gallery images in local JSON, which does
       not scale. Say so where the person sizing storage will read it. */
    + '<div class="pref"><div class="pl"><b>'+tr("AI Gallery images")+'</b><span>'
    + tr(API.on
        ? "Gallery designs are stored with the workspace database. For production volume, move the images to object storage (S3, R2 or Drive) and keep only asset references plus a small JSON payload."
        : "In standalone demo mode gallery images are embedded as Base64 in local storage. That is fine for a demo and does not scale — production should use object storage with asset references.")
    + '</span></div></div>'
    + '<div class="field" style="margin-top:12px"><label>'+tr("Off-server copy")+'</label>'
    + '<input id="bk_offsite" '+(ed?"":"disabled")+' value="'+attr(d.offsite||"")+'" placeholder="s3://bucket/path, rsync target, or a note describing where copies go">'
    + '<p class="hint">'+tr("Backups on the same disk as the database do not survive losing that disk. Record where a second copy goes so the next person knows.")+'</p></div>',
    ed?'<button class="btn primary" onclick="bkSaveSettings()">'+tr("Save")+'</button>':'', I.cloud);
}
function bkSaveSettings(){
  var body={};
  if(document.getElementById("bk_keep")) body.keep=+val("bk_keep");
  if(document.getElementById("bk_auto")) body.auto=val("bk_auto");
  if(document.getElementById("bk_offsite")) body.offsite=val("bk_offsite");
  apiFetch("PUT","/api/backups/settings",body).then(function(){ toast(tr("Backup settings saved")); loadBackups(true); })
    .catch(function(e){ toast(e.message,"bad"); });
}
function createServerBackup(){
  toast(tr("Creating encrypted backup…"));
  apiFetch("POST","/api/backups",{kind:"manual"}).then(function(r){ toast(tr("Encrypted backup created")+": "+r.name); loadBackups(true); })
    .catch(function(e){ toast(e.message,"bad"); });
}
function backupSize(n){ return bytesLabel(n); }
</script>
