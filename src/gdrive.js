<script>
/* ============================================================
   GOOGLE DRIVE — attachments go straight from the browser to your Drive (OAuth via Google Identity Services).
   The server never stores binaries: only the Drive file id, the web link and a thumbnail link. Configure in Settings → Cloud storage → Google Drive.
   ============================================================ */
var GD={token:null,exp:0,loading:null,request:null};
function gdCfg(){ var c=cloudOf("gdrive"); return (c&&c.config)||{}; }
function gdReady(){ return !!gdCfg().clientId; }
function gdAuto(){ var c=gdCfg(); return gdReady()&&c.autoUpload!==false; }
/* Google access tokens are intentionally never persisted.  We do remember that
   this browser/account completed consent, so the next page load asks GIS for a
   silent fresh token instead of showing the consent screen again. */
function gdAuthKey(){ var ws=(WS&&WS.id)||"workspace", user=(SESSION&&SESSION.user&&SESSION.user.id)||ME||"browser"; return "cos.gdrive.authorized."+encodeURIComponent(ws)+"."+encodeURIComponent(user); }
function gdWorkspaceAuth(){ var c=gdCfg(), x=c.verified; return x&&x.clientId===c.clientId&&x.folderId===(c.folderId||"")?x:null; }
function gdSavedAuth(){ try{ var x=JSON.parse(localStorage.getItem(gdAuthKey())||"null"), c=gdCfg(); return x&&x.clientId===c.clientId&&x.folderId===(c.folderId||"")?x:gdWorkspaceAuth(); }catch(e){ return gdWorkspaceAuth(); } }
function gdRememberAuth(){ try{ var c=gdCfg(), proof={clientId:c.clientId,folderId:c.folderId||"",at:Date.now()}; localStorage.setItem(gdAuthKey(),JSON.stringify(proof)); /* An admin's successful connection is also a workspace marker. It lets every
  member start with a silent token request; their Google identity/token stays private. */ if(canI.manageWorkspace()&&(!gdWorkspaceAuth()||gdWorkspaceAuth().clientId!==proof.clientId||gdWorkspaceAuth().folderId!==proof.folderId)){ c.verified=proof; persistWS(); } }catch(e){} }
function gdClearAuth(){ try{ localStorage.removeItem(gdAuthKey()); }catch(e){} }
/* A browser only lets a site open a window while it still has the user's gesture. Uploads
   asked Google for a token after the file chooser had come and gone, which is outside that
   window, so the sign-in popup was blocked and the upload failed with nothing to click.
   The token is fetched on the click that opens the chooser instead, while the gesture is
   live; by the time a file is picked it is already cached and no window is needed. */
function gdWarmOnPick(){
  var inp=document.getElementById("fileInput");
  if(!inp||inp.dataset.gdWarm) return;
  inp.dataset.gdWarm="1";
  inp.addEventListener("click",function(){
    if(typeof gdAuto!=="function"||!gdAuto()) return;
    if(GD.token&&Date.now()<GD.exp) return;
    gdToken().catch(function(){});   /* the upload itself reports any failure */
  });
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",gdWarmOnPick); else gdWarmOnPick();
function gdLoad(){ if(window.google&&google.accounts&&google.accounts.oauth2)return Promise.resolve(); if(GD.loading)return GD.loading; GD.loading=new Promise(function(res,rej){ var s=document.createElement("script"); s.src="https://accounts.google.com/gsi/client"; s.async=true; s.onload=function(){ GD.loading=null;res(); }; s.onerror=function(){ GD.loading=null;rej(new Error(tr("Could not load Google sign-in (offline?)"))); }; document.head.appendChild(s); }); return GD.loading; }
function gdToken(opts){ opts=opts||{}; if (GD.token&&Date.now()<GD.exp) return Promise.resolve(GD.token); if(GD.request)return GD.request; GD.request=gdLoad().then(function(){ return new Promise(function(res,rej){ var silent=!!gdSavedAuth()&&!opts.interactive, retried=false, tc;
  var request=function(prompt){ tc.requestAccessToken({prompt:prompt}); };
  /* Google does not always call back: if the popup cannot reach its opener the callbacks
     never fire, this promise never settles, and because GD.request is kept every later
     attempt returns the same dead promise — the Test button goes quiet until a reload.
     Settle once, on a timer, so the failure is reportable instead of invisible. */
  var done=false, timer=null, settle=function(fn,v){ if(done)return; done=true; clearTimeout(timer); fn(v); };
  timer=setTimeout(function(){ settle(rej,new Error(tr("Google never answered the sign-in request. Check that this exact address is an Authorized JavaScript origin on your Google OAuth client, that the popup is not blocked, and that Settings → Integrations reports popups as allowed."))); }, GD.timeoutMs!=null?GD.timeoutMs:(silent?25000:180000));
  tc=google.accounts.oauth2.initTokenClient({client_id:gdCfg().clientId,scope:"https://www.googleapis.com/auth/drive.file",error_callback:function(e){ if(silent&&!retried){ retried=true; return request("consent"); } settle(rej,new Error(e.type==="popup_closed"?tr("Google sign-in cancelled"):tr("Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.")));},callback:function(r){ if (!r||r.error){ if(silent&&!retried){ retried=true; return request("consent"); } return settle(rej,new Error((r&&r.error_description)||(r&&r.error)||"Google sign-in cancelled")); } GD.token=r.access_token; GD.exp=Date.now()+((r.expires_in||3600)-60)*1000; gdRememberAuth(); var c=cloudOf("gdrive"); if (c&&!c.connected){ c.connected=true; c.account=c.account||"Google account (signed in from the browser)"; c.lastSync=0; if (canI.manageWorkspace()) persistWS(); } settle(res,GD.token); }});
  request(silent?"":"consent");
 }); }).then(function(token){GD.request=null;return token;},function(e){GD.request=null;throw e;}); return GD.request; }
function gdUpload(file,name){ var cfg=gdCfg(); return gdToken().then(function(token){ var meta={name:name||file.name}; if (cfg.folderId) meta.parents=[cfg.folderId]; var fd=new FormData(); fd.append("metadata",new Blob([JSON.stringify(meta)],{type:"application/json"})); fd.append("file",file);
  return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,thumbnailLink,mimeType,size",{method:"POST",headers:{Authorization:"Bearer "+token},body:fd}).then(function(r){ return r.json().then(function(j){ if (!r.ok) throw new Error((j.error&&j.error.message)||"Drive upload failed"); return j; }); })
  .then(function(j){ var done=function(){ return {driveId:j.id,url:j.webViewLink||("https://drive.google.com/file/d/"+j.id+"/view"),thumb:"https://drive.google.com/thumbnail?id="+j.id+"&sz=w1600",preview:"https://drive.google.com/file/d/"+j.id+"/preview",mime:j.mimeType,size:j.size?(j.size/1048576).toFixed(1)+" MB":"—"}; };
    if (cfg.publicLinks!==true) return done(); return fetch("https://www.googleapis.com/drive/v3/files/"+j.id+"/permissions?supportsAllDrives=true",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({role:"reader",type:"anyone"})}).then(function(){ return done(); }).catch(function(){ return done(); }); }); }); }
/* uploadAny(file) → {source,url,driveId,preview,size,type}: Drive when configured, else a downscaled local preview (images) / metadata only. */
function uploadAny(file,opts){ opts=opts||{}; var type=/^image\//.test(file.type)?"image":/^video\//.test(file.type)?"video":/pdf$/.test(file.type)?"pdf":"other"; var size=(file.size/1048576).toFixed(1)+" MB";
  if ((gdAuto()||(opts.forceDrive&&gdReady()))&&!opts.forceLocal){ toast("Uploading to Google Drive…"); return gdUpload(file,opts.name).then(function(r){ return {source:"gdrive",url:r.url,driveId:r.driveId,preview:(type==="image"||type==="video")?r.thumb:null,previewUrl:r.preview,size:size,type:type,name:file.name}; }).catch(function(e){ throw new Error("Drive upload failed. "+e.message); }); }
  return localUpload(file,type,size); }
function localUpload(file,type,size){ return new Promise(function(res,rej){ if(type==="video")return res({source:"local",url:"",driveId:null,preview:URL.createObjectURL(file),size:size,type:type,name:file.name,temporary:true}); if (type!=="image") return rej(new Error("Connect Google Drive to upload this file, or paste its Drive link.")); shrinkImage(file,1600,1600,function(u){ res({source:"local",url:"",driveId:null,preview:u,size:size,type:type,name:file.name}); },rej); }); }
/* full-size preview modal (images from Drive or local, or the Drive viewer for anything else) */
/* v19.11 save any attachment to the device: local previews (data URLs) download directly, Drive files go through Drive's download endpoint, other URLs try a same-origin fetch first and fall back to a link */
function saveFileName(name,mime){ var n=String(name||"file").trim()||"file"; if(!/\.[a-z0-9]{2,5}$/i.test(n)&&mime){ var ext=(mime.split("/")[1]||"").split(";")[0].replace("jpeg","jpg").replace("svg+xml","svg"); if(ext) n+="."+ext; } return n.replace(/[\\/:*?"<>|]+/g,"-"); }
function dataUrlToBlob(u){ var m=/^data:([^;,]+)?(;base64)?,(.*)$/i.exec(u); if(!m) return null; var mime=m[1]||"application/octet-stream", raw=m[2]?atob(m[3]):decodeURIComponent(m[3]); var arr=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i); return new Blob([arr],{type:mime}); }
function triggerDownload(blob,name){ var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.style.display="none"; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500); }
function saveFile(o){ o=o||{}; var data=o.img||o.preview||(o.url&&/^data:/i.test(o.url)?o.url:""); var name=o.name||"file";
  /* the original lives in Drive → always prefer it over the reduced preview */
  if(o.driveId){ openExternalNow("https://drive.google.com/uc?export=download&id="+encodeURIComponent(o.driveId)); toast(tr("Downloading from Google Drive…")); return; }
  if(data&&/^data:/i.test(data)){ var b=dataUrlToBlob(data); if(!b) return toast(tr("Nothing to save"),"bad"); var fn=saveFileName(name,b.type); /* a PNG preview of a .psd/.pdf/.ai must not pretend to be the original */ if(/^image\//.test(b.type)&&/\.(psd|ai|pdf|mp4|mov|indd|sketch|fig|zip|docx?|pptx?|xlsx?)$/i.test(fn)) fn=fn.replace(/\.[^.]+$/,"")+" (preview)."+((b.type.split("/")[1]||"png").replace("jpeg","jpg")); triggerDownload(b,fn); toast(tr("Saved")+" · "+fn); return; }
  if(o.url&&/^https?:/i.test(o.url)){ toast(tr("Downloading…")); fetch(o.url,{mode:"cors"}).then(function(r){ if(!r.ok) throw new Error(); return r.blob(); }).then(function(b){ triggerDownload(b,saveFileName(name,b.type)); }).catch(function(){ /* cross-origin without CORS: hand it to the browser */ var a=document.createElement("a"); a.href=o.url; a.download=saveFileName(name); a.target="_blank"; a.rel="noopener"; a.style.display="none"; document.body.appendChild(a); a.click(); setTimeout(function(){ a.remove(); },500); }); return; }
  toast(tr("Nothing to save"),"bad"); }
/* copy an image to the clipboard (PNG) — handy for screenshots shared in chat */
function copyImageToClipboard(src){ if(!navigator.clipboard||!window.ClipboardItem) return toast(tr("Your browser cannot copy images to the clipboard"),"bad"); var img=new Image(); img.crossOrigin="anonymous"; img.onload=function(){ try{ var c=document.createElement("canvas"); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext("2d").drawImage(img,0,0); c.toBlob(function(b){ if(!b) return toast(tr("Could not copy image"),"bad"); navigator.clipboard.write([new ClipboardItem({"image/png":b})]).then(function(){ toast(tr("Image copied")); },function(){ toast(tr("Could not copy image"),"bad"); }); },"image/png"); }catch(e){ toast(tr("Could not copy image"),"bad"); } }; img.onerror=function(){ toast(tr("Could not copy image"),"bad"); }; img.src=src; }
function previewModal(o){ var body; if (o.driveId&&!o.img) body='<iframe src="https://drive.google.com/file/d/'+attr(o.driveId)+'/preview" style="width:100%;height:72vh;border:0;border-radius:var(--radius);background:#111" allow="autoplay"></iframe>'; else if (o.img) body='<div style="text-align:center;background:var(--color-surface-sunken);border-radius:var(--radius);padding:8px"><img src="'+attr(o.img)+'" style="max-width:100%;max-height:72vh;border-radius:8px"></div>'; else body=emptyBox("No preview available","Open the file in its storage provider.");
  var saveArg=attr(JSON.stringify({name:o.name||o.plainTitle||"",img:o.img||"",url:o.url||"",driveId:o.driveId||null})); var canSave=!!(o.img||o.driveId||(o.url&&/^https?:/i.test(o.url)));
  openModal(o.rawTitle?o.title:esc(o.title||"Preview"),body,(o.url?'<button class="btn" onclick="openExternal(\''+attr(o.url)+'\')">'+I.ext+(o.driveId?"Open in Google Drive":"Open")+'</button>':'')+(canSave?'<button class="btn" onclick="saveFile('+saveArg+')">'+I.download+tr("Download")+'</button>':'')+(o.img?'<button class="btn ghost" onclick="copyImageToClipboard(\''+attr(o.img)+'\')">'+I.copy+tr("Copy image")+'</button>':'')+'<span class="spacer"></span><button class="btn primary" onclick="closeModal()">Close</button>',true); }
</script>
