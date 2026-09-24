<script>
/* ============================================================
   GOOGLE PICKER — attachments go straight from the browser to your Drive (OAuth via Google Identity Services).
   The server never stores binaries: only the Drive file id, the web link and a thumbnail link. Configure in Settings -> Cloud storage -> Google Drive.
   ============================================================ */
Object.assign(UI_ID,{
  "Choose the team folder":"Pilih folder tim",
  "Choose folder in Google Drive":"Pilih folder di Google Drive",
  "Picker API key":"API key Picker",
  "Project number":"Nomor project",
  "Required: a pasted folder ID is not visible to the app until you choose it here.":"Wajib: ID folder yang ditempel belum terlihat oleh aplikasi sampai dipilih di sini.",
  "Fill in Client ID, Picker API key and project number first":"Isi Client ID, API key Picker, dan nomor project terlebih dahulu.",
  "Selected":"Dipilih",
  "press Save":"tekan Simpan",
  "Team folder access granted":"Akses folder tim diberikan",
  "Select the team folder to give ZenCrevia access":"Pilih folder tim untuk memberikan akses ke ZenCrevia",
  "That is a different folder. Choose the team folder set by your admin.":"Itu folder yang berbeda. Pilih folder tim yang ditentukan admin.",
  "Choose the team folder once to allow uploads from your account":"Pilih folder tim sekali agar akunmu dapat mengunggah.",
  "Folder access was not granted":"Akses folder belum diberikan.",
  "Could not load Google Picker":"Google Picker gagal dimuat",
  "Could not load Google Picker (blocked or offline?)":"Google Picker gagal dimuat (diblokir atau offline?)",
  "Google Picker needs an API key and the project number. Add them in Settings -> Google Drive.":"Google Picker memerlukan API key dan nomor project. Tambahkan di Settings -> Google Drive."
});
var GDP={loading:null,pending:null};
function gdpCfgReady(){ var c=gdCfg(); return !!(c.clientId&&c.pickerKey&&c.appId); }
function gdpLoad(){
  if (window.google&&google.picker) return Promise.resolve();
  if (GDP.loading) return GDP.loading;
  GDP.loading=new Promise(function(res,rej){
    function go(){ gapi.load("picker",{callback:function(){ res(); },onerror:function(){ rej(new Error(tr("Could not load Google Picker"))); }}); }
    if (window.gapi&&gapi.load) return go();
    var s=document.createElement("script"); s.src="https://apis.google.com/js/api.js"; s.async=true;
    s.onload=go; s.onerror=function(){ GDP.loading=null; rej(new Error(tr("Could not load Google Picker (blocked or offline?)"))); };
    document.head.appendChild(s);
  });
  return GDP.loading;
}
/* Opens the Picker on folders. Resolves with {id,name} or null when cancelled. */
function gdPickFolder(opts){
  opts=opts||{}; var c=gdCfg(), key=opts.pickerKey||c.pickerKey, appId=opts.appId||c.appId;
  if (!key||!appId) return Promise.reject(new Error(tr("Google Picker needs an API key and the project number. Add them in Settings -> Google Drive.")));
  return Promise.all([gdToken(),gdpLoad()]).then(function(r){
    var token=r[0];
    return new Promise(function(res){
      var mine=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes("application/vnd.google-apps.folder").setMode(google.picker.DocsViewMode.LIST);
      var shared=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes("application/vnd.google-apps.folder").setEnableDrives(true).setMode(google.picker.DocsViewMode.LIST);
      var p=new google.picker.PickerBuilder()
        .setTitle(opts.title||"Choose the team folder")
        .addView(mine).addView(shared)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setOAuthToken(token).setDeveloperKey(key).setAppId(String(appId).trim())
        .setOrigin(window.location.protocol+"//"+window.location.host)
        .setCallback(function(d){
          var A=google.picker.Action;
          if (d.action===A.PICKED){ var doc=(d.docs||[])[0]; res(doc?{id:doc.id,name:doc.name}:null); }
          else if (d.action===A.CANCEL) res(null);
        }).build();
      p.setVisible(true);
    });
  });
}
/* Teammates: grant this browser's Google account access to the configured team folder. */
function gdGrantFolder(){
  var c=gdCfg(); if (!c.folderId) return Promise.resolve(true);
  return gdPickFolder({title:tr("Select the team folder to give ZenCrevia access")}).then(function(f){
    if (!f) throw new Error(tr("Folder access was not granted"));
    if (f.id!==c.folderId) throw new Error(tr("That is a different folder. Choose the team folder set by your admin."));
    toast(tr("Team folder access granted")); return true;
  });
}

/* ---- Settings modal: add Picker fields + "Choose folder" button ---- */
(function(){
  var baseEdit=window.editGDrive, baseSave=window.saveGDrive, baseApply=window.saveGDriveApply, baseUpload=window.gdUpload;
  if (!baseEdit||!baseApply) return;
  window.editGDrive=function(){
    baseEdit.apply(this,arguments);
    var folder=document.getElementById("gd_folder"); if (!folder) return;
    var cfg=gdCfg(), host=folder.closest(".field-row")||folder.parentNode;
    var box=document.createElement("div");
    box.innerHTML='<div class="gdrive-picker-fields">'
      +fieldHtml("gd_pkey",tr("Picker API key"),'<input id="gd_pkey" value="'+attr(cfg.pickerKey||"")+'" placeholder="AIza..." style="font-family:var(--font-mono);font-size:12px">')
      +fieldHtml("gd_appid",tr("Project number"),'<input id="gd_appid" value="'+attr(cfg.appId||"")+'" placeholder="123456789012" inputmode="numeric" style="font-family:var(--font-mono);font-size:12px">')
      +'</div><div class="gdrive-picker-actions"><button type="button" class="btn" id="gd_pickbtn">'+(I.cloud||"")+esc(tr("Choose folder in Google Drive"))+'</button><span class="hint" id="gd_pickhint">'+esc(tr("Required: a pasted folder ID is not visible to the app until you choose it here."))+'</span></div>';
    host.parentNode.insertBefore(box,host.nextSibling);
    document.getElementById("gd_pickbtn").onclick=function(){
      var cid=val("gd_client"), key=val("gd_pkey"), app=val("gd_appid");
      if (!cid||!key||!app) return toast(tr("Fill in Client ID, Picker API key and project number first"),"bad");
      if (cid!==(gdCfg().clientId||"")){ var cc=cloudOf("gdrive"); cc.config=Object.assign({},cc.config||{},{clientId:cid}); GD.token=null; GD.exp=0; }
      gdPickFolder({pickerKey:key,appId:app}).then(function(f){
        if (!f) return;
        document.getElementById("gd_folder").value=f.id;
        document.getElementById("gd_pickhint").textContent=tr("Selected")+": "+f.name+" - "+tr("press Save");
      }).catch(function(e){ toast(e.message,"bad"); });
    };
  };
  window.saveGDrive=function(){
    GDP.pending={pickerKey:(document.getElementById("gd_pkey")?val("gd_pkey"):undefined),appId:(document.getElementById("gd_appid")?val("gd_appid"):undefined)};
    return baseSave.apply(this,arguments);
  };
  window.saveGDriveApply=function(signIn,draft){
    var p=GDP.pending; GDP.pending=null;
    baseApply.apply(this,arguments);
    var c=cloudOf("gdrive"); if (!c) return;
    var prev=c.config||{};
    c.config=Object.assign({},prev,{
      pickerKey:p&&p.pickerKey!==undefined?String(p.pickerKey).trim():(prev.pickerKey||""),
      appId:p&&p.appId!==undefined?String(p.appId).replace(/\D/g,""):(prev.appId||"")
    });
    persistWS();
  };
  /* Upload into the team folder fails with "File not found" until this user has
     granted folder access once. Offer the Picker, then retry once. */
  if (baseUpload) window.gdUpload=function(file,name){
    var self=this, args=arguments;
    return baseUpload.apply(self,args).catch(function(e){
      var c=gdCfg();
      if (!c.folderId||!gdpCfgReady()||!/not found/i.test(String(e&&e.message))) throw e;
      toast(tr("Choose the team folder once to allow uploads from your account"));
      return gdGrantFolder().then(function(){ return baseUpload.apply(self,args); });
    });
  };
})();
</script>
<style>
.gdrive-picker-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:14px;align-items:start}
.gdrive-picker-fields .field{min-width:0}
.gdrive-picker-fields .field label{display:block;font-size:12px;line-height:1.4;margin-bottom:7px}
.gdrive-picker-fields .field input{width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;line-height:1.45}
.gdrive-picker-actions{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:2px}
.gdrive-picker-actions .hint{flex:1 1 240px;min-width:0;margin:4px 0 0;line-height:1.45}
.picker-dialog-bg{z-index:100000!important}
.picker-dialog{z-index:100001!important}
@media(max-width:640px){.gdrive-picker-fields{grid-template-columns:1fr;gap:12px}.gdrive-picker-actions{gap:8px}}
</style>
