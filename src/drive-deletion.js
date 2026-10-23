<script>
/* ============================================================
   STORAGE & DELETION — Settings → Integrations (Oct 2026; server/drive-trash.js)
   Whoever manages cloud storage turns on deletion sync, sees the files ZenCrevia itself put in Google Drive with where
   each is used, and deletes one everywhere in ZenCrevia. With sync on, the server then moves that same Drive file to
   Drive's Trash (never deletes it for good). A file used anywhere cannot be deleted — the dialog says where; links to
   Drive files people already had are not listed and never touched. Removing a file from a task or a message is
   unchanged: the file stays.
   Painted from DD.view, which outlives a re-render, so switching language does not blink; while a file waits for
   Drive the list asks again every few seconds, and says what Drive answered — never "done" before it is.
   ============================================================ */
var DD={view:null, draft:null, all:false, open:{}, poll:null, polls:0};
function ddCan(){ return typeof canI!=="undefined"&&canI&&(canI.manageCloudStorage?canI.manageCloudStorage():canI.manageWorkspace&&canI.manageWorkspace()); }
function ddPanel(){
  if(!ddCan()) return "";
  setTimeout(ddRefresh,0);
  return sp("Storage & Deletion",'<div id="ddBody">'+(DD.view?ddMarkup(DD.view):'<p class="hint">'+tr("Checking…")+'</p>')+'</div>',"",I.trash);
}
function ddRefresh(){
  if(!document.getElementById("ddBody")) return;
  apiFetch("GET","/api/cloud/gdrive/deletion").then(function(v){ DD.view=v; ddPaint(); ddPollSoon(); },function(e){ var el=document.getElementById("ddBody"); if(el&&!DD.view) el.innerHTML='<p class="hint">'+esc(e.message)+'</p>'; });
}
function ddPaint(){ var el=document.getElementById("ddBody"); if(!el||!DD.view) return; var h=ddMarkup(DD.view); if(el.getAttribute("data-h")!==h){ el.innerHTML=h; el.setAttribute("data-h",h); } }
/* a file waiting for Drive: asked again until Drive has answered (two minutes at most, then on the next visit) */
function ddPollSoon(){ clearTimeout(DD.poll); var v=DD.view; if(!v||!v.summary||!v.summary.pending){ DD.polls=0; return; } if(DD.polls++>30) return; DD.poll=setTimeout(ddRefresh,4000); }

function ddSettings(){ var s=(DD.view&&DD.view.settings)||{}; return DD.draft?Object.assign({},s,DD.draft):s; }
function ddSwitch(on,label,onclick,disabled){ return '<button type="button" class="switch'+(on?" on":"")+'" role="switch" aria-checked="'+(on?"true":"false")+'" aria-label="'+attr(tr(label))+'"'+(disabled?' disabled':'')+(onclick&&!disabled?' onclick="'+onclick+'"':'')+'></button>'; }
function ddRow(label,help,control,extra){ return '<div class="pref'+(extra?" "+extra:"")+'"><div class="pl"><b>'+tr(label)+'</b>'+(help?'<span>'+tr(help)+'</span>':'')+'</div>'+control+'</div>'; }
function ddMarkup(v){
  var s=ddSettings(), drive=v.drive||{}, sum=v.summary||{}, out="";
  out+=ddRow("Google Drive",drive.shared?tr("Connected")+(drive.account?" · "+esc(drive.account):""):tr("Not connected — connect the shared account above first."),
    '<span class="badge '+(drive.shared?"approved":"warn")+'">'+tr(drive.shared?"Connected":"Not connected")+'</span>');
  /* failures, for the admins who asked to see them */
  if(s.showErrors&&sum.failed){
    var revoked=(v.files||[]).some(function(f){ return f.status==="trash_failed"&&/reconnect|revoked|not connected/i.test(f.lastError||""); });
    out+='<div class="banner warn dd-errors" role="status">'+esc(UI_LANG==="id"?sum.failed+" file tidak bisa dipindah ke Sampah Google Drive.":sum.failed+(sum.failed===1?" file could not be moved to Google Drive's Trash.":" files could not be moved to Google Drive's Trash."))
      +' '+tr(revoked?"Reconnect Google Drive above, then try again.":"Try again from the list below.")+'</div>';
  }
  out+='<div class="dd-group"><div class="eyebrow">'+tr("Deletion sync")+'</div>'
    + ddRow("Sync deleted files","Move eligible ZenCrevia-managed files to Google Drive Trash when they are deleted globally from ZenCrevia.",
        ddSwitch(!!s.deletionSync,"Sync deleted files","ddSet('deletionSync',"+(!s.deletionSync)+")",!s.deletionSync&&!drive.shared))
    + (!s.deletionSync&&!drive.shared?'<p class="hint dd-why">'+tr("Connect the shared Google Drive account first: deleted files can only be moved to its Trash.")+'</p>':'')
    + '<div class="dd-sub">'+tr("Deletion behavior")+'</div>'
    + '<label class="dd-radio"><input type="radio" checked disabled> <span><b>'+tr("Move to Google Drive Trash (Recommended)")+'</b><span class="hint">'+tr("Files may be restored while retained in Drive Trash. Nothing is ever deleted for good.")+'</span></span></label>'
    + '<div class="dd-sub">'+tr("Safety controls")+'</div>'
    + ddRow("Protect files referenced elsewhere","A file used in a task, comment, message or elsewhere cannot be deleted.",ddSwitch(true,"Protect files referenced elsewhere","",true)+'<span class="badge dd-lock">'+tr("Always on")+'</span>')
    + ddRow("Require confirmation for global deletion","",ddSwitch(true,"Require confirmation for global deletion","",true)+'<span class="badge dd-lock">'+tr("Always on")+'</span>')
    + ddRow("Show Drive sync errors to workspace admins","",ddSwitch(!!s.showErrors,"Show Drive sync errors to workspace admins","ddSet('showErrors',"+(!s.showErrors)+")"))
    + '<p class="hint">'+tr("Only files ZenCrevia uploaded to Google Drive are eligible. Links to Drive files people already had are never touched, and removing a file from a task or a message never deletes it.")+'</p>'
    + '<div class="dd-save"><button type="button" class="btn primary sm"'+(DD.draft?'':' disabled')+' onclick="ddSave()">'+tr("Save changes")+'</button></div></div>';
  out+=ddFilesHtml(v);
  return out;
}
function ddSet(k,v){ DD.draft=Object.assign({},DD.draft||{}); DD.draft[k]=v; var s=(DD.view&&DD.view.settings)||{}; if(Object.keys(DD.draft).every(function(x){ return DD.draft[x]===s[x]; })) DD.draft=null; ddPaint(); }
function ddSave(){ if(!DD.draft) return; var d=DD.draft;
  apiFetch("PUT","/api/cloud/gdrive/deletion",d).then(function(v){ DD.view=v; DD.draft=null; ddPaint(); toast(tr("Storage & Deletion saved")); },function(e){ toast(e.message,"bad"); }); }

/* ---------- the files ZenCrevia put in Drive ---------- */
var DD_STATUS={active:["",""],deleted_local:["Deleted in ZenCrevia only",""],trash_pending:["Pending Drive sync","warn"],trashed:["Moved to Drive Trash","approved"],trash_failed:["Drive sync failed","bad"],provider_missing:["Not in Google Drive",""]};
function ddFilesHtml(v){
  var files=v.files||[], shown=DD.all?files:files.slice(0,12);
  var h='<div class="dd-group"><div class="eyebrow">'+tr("Files ZenCrevia put in Google Drive")+' <span class="cnt">'+files.length+'</span></div>';
  if(!files.length) return h+'<p class="hint">'+tr("None yet. Files uploaded through the shared Google Drive account appear here.")+'</p></div>';
  h+='<div class="dd-files">'+shown.map(ddFileRow).join("")+'</div>';
  if(files.length>shown.length) h+='<button type="button" class="btn xs ghost" onclick="DD.all=true;ddPaint()">'+tr("Show all")+' ('+files.length+')</button>';
  return h+'</div>';
}
function ddFileRow(f){
  var st=DD_STATUS[f.status]||["",""], who=f.uploadedBy?person(f.uploadedBy).name:"", used=f.usage||0, id=jsq(f.driveId);
  var usage=f.status!=="active"?"":used?'<button type="button" class="btn xs ghost dd-used" aria-expanded="'+(DD.open[f.driveId]?"true":"false")+'" onclick="ddToggleUsage('+id+')">'+esc(UI_LANG==="id"?"Dipakai di "+used+" tempat":"Used in "+used+(used===1?" place":" places"))+'</button>':'<span class="hint">'+tr("Not used anywhere")+'</span>';
  var acts="";
  if(f.status==="active") acts='<button type="button" class="btn xs danger-soft dd-del"'+(used?' disabled title="'+attr(tr("Remove it where it is used first"))+'"':'')+' onclick="ddDelete('+id+')">'+I.trash+tr("Delete file")+'</button>';
  if(f.status==="trash_failed") acts+='<button type="button" class="btn xs dd-retry" onclick="ddRetry('+id+')">'+tr("Try again")+'</button>';
  if(["deleted_local","trash_pending","trash_failed"].indexOf(f.status)>=0) acts+='<button type="button" class="btn xs ghost dd-undo" onclick="ddRestore('+id+')">'+tr("Undo")+'</button>';
  return '<div class="dd-file" data-drive="'+attr(f.driveId)+'"><div class="dd-file-main"><b class="dd-name">'+esc(f.name||f.driveId)+'</b>'+(st[0]?' <span class="badge '+st[1]+' dd-status">'+tr(st[0])+'</span>':'')
    + '<div class="dd-meta">'+[who,f.size,f.createdAt?ago(null,f.createdAt):""].filter(Boolean).map(function(x){ return '<span>'+x+'</span>'; }).join('<span>·</span>')+(usage?'<span>·</span>'+usage:'')+'</div>'
    + (f.status==="trash_failed"&&f.lastError?'<div class="dd-error">'+esc(f.lastError)+'</div>':f.status==="trash_pending"&&f.lastError?'<div class="dd-meta">'+esc(f.lastError)+' — '+tr("trying again soon")+'</div>':f.status==="deleted_local"&&f.lastError?'<div class="dd-meta">'+esc(f.lastError)+'</div>':'')
    + (DD.open[f.driveId]&&f.usedIn&&f.usedIn.length?'<ul class="dd-usage">'+f.usedIn.map(function(r){ return '<li>'+esc(tr(r.where))+': <b>'+esc(r.label)+'</b></li>'; }).join("")+(used>f.usedIn.length?'<li class="hint">…</li>':'')+'</ul>':'')
    + '</div><div class="dd-acts">'+acts+'</div></div>';
}
function ddToggleUsage(id){ DD.open[id]=!DD.open[id]; ddPaint(); }
function ddFile(id){ return ((DD.view&&DD.view.files)||[]).filter(function(f){ return f.driveId===id; })[0]||null; }
/* asked again right before deleting: used somewhere since the list was drawn, it is refused with where */
function ddDelete(id){
  var f=ddFile(id); if(!f) return;
  apiFetch("GET","/api/cloud/gdrive/files/"+encodeURIComponent(id)+"/usage").then(function(r){
    var used=r.usage||[], s=ddSettings(), drive=(DD.view&&DD.view.drive)||{};
    if(used.length){ f.usage=used.length; f.usedIn=used.slice(0,12); DD.open[id]=true; ddPaint();
      openModal(tr("This file is still in use"),'<p>'+esc(UI_LANG==="id"?"“"+f.name+"” masih dipakai di "+used.length+" tempat. Hapus dulu dari sana — menghapusnya dari task atau pesan tidak menghapus file-nya.":"“"+f.name+"” is still used in "+used.length+(used.length===1?" place":" places")+". Remove it there first — removing it from a task or a message does not delete the file.")+'</p><ul class="dd-usage">'+used.slice(0,20).map(function(x){ return '<li>'+esc(tr(x.where))+': <b>'+esc(x.label)+'</b></li>'; }).join("")+'</ul>','<span class="spacer"></span><button class="btn primary" onclick="closeModal()">'+tr("OK")+'</button>');
      return; }
    var sameAccount=!f.account||!drive.account||f.account===drive.account, toTrash=s.deletionSync&&drive.shared&&sameAccount;
    var driveLine=toTrash?tr("Will be moved to Trash (if sync succeeds)"):!s.deletionSync?tr("Stays in Google Drive — deletion sync is off"):!drive.shared?tr("Stays in Google Drive — Google Drive is not connected"):tr("Stays in Google Drive — uploaded under another Google account");
    openModal(tr("Delete this file everywhere in ZenCrevia?"),
      '<dl class="dd-confirm"><dt>'+tr("File")+'</dt><dd>'+esc(f.name)+'</dd><dt>'+tr("Used in")+'</dt><dd>'+tr("0 other locations")+'</dd><dt>Google Drive</dt><dd>'+driveLine+'</dd></dl><p class="hint">'+tr("This action removes the file from the ZenCrevia library.")+'</p>',
      '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn danger" onclick="ddDeleteNow('+jsq(id)+')">'+I.trash+tr("Delete file")+'</button>');
  },function(e){ toast(e.message,"bad"); });
}
function ddDeleteNow(id){ closeModal();
  apiFetch("POST","/api/cloud/gdrive/files/"+encodeURIComponent(id)+"/delete",{}).then(function(f){
    toast(tr(f.status==="trash_pending"?"File deleted in ZenCrevia. Google Drive sync pending.":"File deleted in ZenCrevia only.")); DD.polls=0; ddRefresh();
  },function(e){ toast(e.message,"bad"); ddRefresh(); }); }
function ddRestore(id){ apiFetch("POST","/api/cloud/gdrive/files/"+encodeURIComponent(id)+"/restore",{}).then(function(){ toast(tr("The file is kept")); ddRefresh(); },function(e){ toast(e.message,"bad"); ddRefresh(); }); }
function ddRetry(id){ apiFetch("POST","/api/cloud/gdrive/files/"+encodeURIComponent(id)+"/retry",{}).then(function(){ toast(tr("Trying Google Drive again")); DD.polls=0; ddRefresh(); },function(e){ toast(e.message,"bad"); }); }

(function(){ if(typeof setIntegrations!=="function") return; var base=setIntegrations;
  setIntegrations=function(){ var h=base.apply(this,arguments); return typeof h==="string"?ddPanel()+h:h; }; })();
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Storage & Deletion":"Penyimpanan & Penghapusan","Google Drive":"Google Drive","Connected":"Terhubung","Not connected":"Belum terhubung",
  "Not connected — connect the shared account above first.":"Belum terhubung — hubungkan akun bersama di atas dulu.",
  "Reconnect Google Drive above, then try again.":"Hubungkan ulang Google Drive di atas, lalu coba lagi.","Try again from the list below.":"Coba lagi dari daftar di bawah.",
  "Deletion sync":"Sinkronisasi penghapusan","Sync deleted files":"Sinkronkan file yang dihapus",
  "Move eligible ZenCrevia-managed files to Google Drive Trash when they are deleted globally from ZenCrevia.":"Pindahkan file yang dikelola ZenCrevia ke Sampah Google Drive saat file dihapus dari seluruh ZenCrevia.",
  "Connect the shared Google Drive account first: deleted files can only be moved to its Trash.":"Hubungkan akun Google Drive bersama dulu: file yang dihapus hanya bisa dipindah ke Sampah akun itu.",
  "Deletion behavior":"Cara menghapus","Move to Google Drive Trash (Recommended)":"Pindahkan ke Sampah Google Drive (Disarankan)",
  "Files may be restored while retained in Drive Trash. Nothing is ever deleted for good.":"File masih bisa dipulihkan selama ada di Sampah Drive. Tidak ada yang dihapus permanen.",
  "Safety controls":"Pengaman","Protect files referenced elsewhere":"Lindungi file yang dipakai di tempat lain",
  "A file used in a task, comment, message or elsewhere cannot be deleted.":"File yang dipakai di task, komentar, pesan, atau tempat lain tidak bisa dihapus.",
  "Require confirmation for global deletion":"Wajib konfirmasi untuk penghapusan global","Show Drive sync errors to workspace admins":"Tampilkan error sinkronisasi Drive ke admin workspace",
  "Always on":"Selalu aktif",
  "Only files ZenCrevia uploaded to Google Drive are eligible. Links to Drive files people already had are never touched, and removing a file from a task or a message never deletes it.":"Hanya file yang diunggah ZenCrevia ke Google Drive yang bisa. Tautan ke file Drive milik orang tidak pernah disentuh, dan menghapus file dari task atau pesan tidak pernah menghapus file-nya.",
  "Save changes":"Simpan perubahan","Storage & Deletion saved":"Penyimpanan & Penghapusan disimpan",
  "Files ZenCrevia put in Google Drive":"File yang diunggah ZenCrevia ke Google Drive","None yet. Files uploaded through the shared Google Drive account appear here.":"Belum ada. File yang diunggah lewat akun Google Drive bersama muncul di sini.",
  "Show all":"Tampilkan semua","Deleted in ZenCrevia only":"Dihapus di ZenCrevia saja","Pending Drive sync":"Menunggu sinkronisasi Drive","Moved to Drive Trash":"Dipindah ke Sampah Drive","Drive sync failed":"Sinkronisasi Drive gagal","Not in Google Drive":"Tidak ada di Google Drive",
  "Not used anywhere":"Tidak dipakai di mana pun","Remove it where it is used first":"Hapus dulu dari tempat file ini dipakai","Delete file":"Hapus file","Try again":"Coba lagi","Undo":"Urungkan","trying again soon":"segera dicoba lagi",
  "This file is still in use":"File ini masih dipakai","Delete this file everywhere in ZenCrevia?":"Hapus file ini dari seluruh ZenCrevia?","File":"File","Used in":"Dipakai di","0 other locations":"0 tempat lain",
  "Will be moved to Trash (if sync succeeds)":"Akan dipindah ke Sampah (jika sinkronisasi berhasil)","Stays in Google Drive — deletion sync is off":"Tetap di Google Drive — sinkronisasi penghapusan mati",
  "Stays in Google Drive — Google Drive is not connected":"Tetap di Google Drive — Google Drive belum terhubung","Stays in Google Drive — uploaded under another Google account":"Tetap di Google Drive — diunggah dengan akun Google lain",
  "This action removes the file from the ZenCrevia library.":"Tindakan ini menghapus file dari pustaka ZenCrevia.",
  "File deleted in ZenCrevia. Google Drive sync pending.":"File dihapus di ZenCrevia. Sinkronisasi Google Drive menunggu.","File deleted in ZenCrevia only.":"File dihapus di ZenCrevia saja.",
  "The file is kept":"File tetap disimpan","Trying Google Drive again":"Mencoba Google Drive lagi",
  "Task file":"File task","Version":"Versi","Comment":"Komentar","Description":"Deskripsi","Progress note":"Catatan progres","Project discussion":"Diskusi project","Asset library":"Pustaka aset","Chat":"Chat","Creative request":"Creative request","Knowledge page":"Halaman knowledge"});
</script>
