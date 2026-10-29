<style>
/* the bar every upload shows, in the tray and where the file waits (a chip, a modal) */
.upbar{display:block;position:relative;height:4px;min-width:40px;border-radius:2px;background:var(--color-surface-sunken);overflow:hidden}
.upbar>i{display:block;height:100%;width:0;background:var(--color-primary);border-radius:inherit;transition:width .2s ease}
.upbar.indet>i{width:38%!important;animation:upbarSlide 1.15s ease-in-out infinite}
.upbar.wait>i{animation:upbarWait 1.4s ease-in-out infinite}
.upbar.ok>i{background:var(--color-success)}
.upbar.bad>i,.upbar.off>i{background:var(--color-danger)}
.upbar.off>i{opacity:.45}
@keyframes upbarSlide{0%{transform:translateX(-100%)}100%{transform:translateX(265%)}}
@keyframes upbarWait{0%,100%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.upbar.indet>i{animation:none;width:100%!important;opacity:.45}.upbar.wait>i{animation:none}}
</style>
<script>
/* ============================================================
   UPLOAD PROGRESS
   Every file uploadAny() sends (src/gdrive.js) is one record in UPLOADS, from the moment it is
   picked until it is kept, fails or is cancelled: its name, how many bytes have gone, and its stage.
   The upload tray and the screen that started the upload (a chip, a modal) both draw from that one
   record, so they never disagree.

   fetch() cannot tell how much of a request body has left, so the bytes go by XMLHttpRequest
   (uploadSend), which can: upload.onprogress while the body is sent, then "finishing" while the
   server, or Drive, is still answering.

   A record's stage:
     preparing   nothing sent yet: an image being optimised before it goes
     uploading   bytes leaving; loaded / total
     finishing   every byte sent, waiting for the answer (the server keeping it, Drive confirming)
     done | failed | cancelled   over; endedAt is set
   Each change calls the uploader's opts.onProgress(rec) and fires "zc-upload" on document with the
   record as detail. Progress patches the page in place (uploadPaint): nothing is redrawn per event.
   ============================================================ */
var UPLOADS=[], UPLOAD_SEQ=0, UPLOAD_KEEP=40;
function uploadBegin(file,opts){ opts=opts||{}; var n=(file&&file.size)||0;
  var rec={id:"up"+(++UPLOAD_SEQ),name:opts.name||(file&&file.name)||"file",size:n,loaded:0,total:n,stage:"preparing",dest:opts.dest||"",mime:(file&&file.type)||"",note:"",error:"",startedAt:Date.now(),endedAt:0,xhr:null,cancelRequested:false,onProgress:opts.onProgress||null};
  UPLOADS.push(rec);
  /* ended records are only kept for the tray to show "done"; the oldest go first */
  while(UPLOADS.length>UPLOAD_KEEP){ var i=0; while(i<UPLOADS.length&&!UPLOADS[i].endedAt) i++; if(i>=UPLOADS.length) break; UPLOADS.splice(i,1); }
  uploadEmit(rec); return rec; }
function uploadSet(rec,patch){ if(!rec) return; Object.keys(patch||{}).forEach(function(k){ rec[k]=patch[k]; });
  if(uploadOver(rec)&&!rec.endedAt){ rec.endedAt=Date.now(); rec.xhr=null; }
  uploadEmit(rec); }
function uploadOver(rec){ return !!rec&&(rec.stage==="done"||rec.stage==="failed"||rec.stage==="cancelled"); }
function uploadEmit(rec){ uploadPaint(rec); if(rec.onProgress){ try{ rec.onProgress(rec); }catch(e){} }
  try{ document.dispatchEvent(new CustomEvent("zc-upload",{detail:rec})); }catch(e){} }
function uploadById(id){ for(var i=0;i<UPLOADS.length;i++) if(UPLOADS[i].id===id) return UPLOADS[i]; return null; }
function uploadActive(){ return UPLOADS.filter(function(r){ return !uploadOver(r); }); }
function uploadPct(rec){ if(!rec) return 0; if(rec.stage==="done"||rec.stage==="finishing") return 100; return rec.total>0?Math.min(99,Math.floor(rec.loaded/rec.total*100)):0; }
/* Cancel stops the bytes. Once they are all sent (finishing) the file is being kept already, so
   there is nothing left to stop: uploadCanCancel says when the × may show. */
function uploadCanCancel(rec){ return !!rec&&(rec.stage==="preparing"||rec.stage==="uploading"); }
function uploadCancel(id){ var r=uploadById(id); if(!uploadCanCancel(r)) return false; r.cancelRequested=true; if(r.xhr) r.xhr.abort(); return true; }
function uploadCancelledError(){ var e=new Error(tr("Upload cancelled")); e.cancelled=true; return e; }

/* uploadSend(url,{method,headers,body,credentials,rec}) → a promise of {ok,status,text(),json()}, the
   part of a fetch Response the uploaders read. With rec, the bytes are counted into it. A cancel
   rejects with an error whose .cancelled is true; a dropped connection with a plain message. */
function uploadSend(url,o){ o=o||{}; var rec=o.rec||null;
  return new Promise(function(res,rej){
    if(rec&&rec.cancelRequested) return rej(uploadCancelledError());
    var x=new XMLHttpRequest(); x.open(o.method||"POST",url,true);
    if(o.credentials==="include") x.withCredentials=true;
    var h=Object.assign({},o.headers||{});
    /* to this server, the tab it comes from (src/core.js ZC_TAB); never to Google Drive, which would refuse the header */
    if(typeof zcTabHeaders==="function"&&String(url).indexOf(((typeof API!=="undefined"&&API.base)||"")+"/api/")===0) zcTabHeaders(h);
    Object.keys(h).forEach(function(k){ x.setRequestHeader(k,h[k]); });
    if(rec){ rec.xhr=x; var size=(o.body&&o.body.size)||rec.total||0;
      uploadSet(rec,{stage:"uploading",loaded:0,total:size});
      x.upload.onprogress=function(e){ if(rec.stage!=="uploading") return; uploadSet(rec,{loaded:e.loaded,total:e.lengthComputable&&e.total?e.total:rec.total}); };
      x.upload.onload=function(){ if(rec.stage==="uploading") uploadSet(rec,{stage:"finishing",loaded:rec.total}); }; }
    x.onload=function(){ if(rec) rec.xhr=null; var t=x.responseText||"", st=x.status;
      res({ok:st>=200&&st<300,status:st,text:function(){ return Promise.resolve(t); },json:function(){ return new Promise(function(ok,no){ try{ ok(t?JSON.parse(t):{}); }catch(e){ no(e); } }); }}); };
    x.onerror=function(){ if(rec) rec.xhr=null; rej(new Error(tr("The connection dropped before the upload finished."))); };
    x.onabort=function(){ if(rec) rec.xhr=null; rej(uploadCancelledError()); };
    x.send(o.body==null?null:o.body);
  });
}
/* Runs one upload under a record: run(rec) does the work and resolves with uploadAny's result. The
   promise carries the record as .upload for a caller that wants it at once. */
function uploadTracked(file,opts,dest,run){ opts=opts||{};
  var rec=uploadBegin(file,{name:opts.name||(file&&file.name),dest:dest,onProgress:opts.onProgress});
  var p=Promise.resolve().then(function(){ return run(rec); }).then(function(out){ uploadSet(rec,{stage:"done",loaded:rec.total}); return out; },
    function(e){ var c=!!(e&&e.cancelled)||rec.cancelRequested; uploadSet(rec,{stage:c?"cancelled":"failed",error:c?"":String((e&&e.message)||e||"")}); if(c&&!(e&&e.cancelled)) throw uploadCancelledError(); throw e; });
  p.upload=rec; return p; }
function uploadDestLabel(rec){ return rec&&rec.dest==="gdrive"?tr("Google Drive"):tr("this server"); }
/* "45% · 3.2 MB of 7.1 MB", "Optimising image…", "Saving to Google Drive…", "Uploaded"… */
function uploadStatusText(rec){ if(!rec) return "";
  switch(rec.stage){
    case "preparing": return rec.dest==="server"&&/^image\//.test(rec.mime)?tr("Optimising image…"):tr("Preparing…");
    case "uploading": return uploadPct(rec)+"%"+(rec.total?" · "+humanBytes(rec.loaded)+" "+tr("of")+" "+humanBytes(rec.total):"");
    case "finishing": return rec.dest==="gdrive"?tr("Saving to Google Drive…"):tr("Saving…");
    case "done": return tr("Uploaded");
    case "cancelled": return tr("Upload cancelled");
    default: return tr("Upload failed")+(rec.error?" · "+rec.error:"");
  } }
function uploadBarClass(rec){ var s=rec&&rec.stage; return "upbar"+(s==="preparing"?" indet":s==="finishing"?" wait":s==="done"?" ok":s==="failed"?" bad":s==="cancelled"?" off":""); }
/* The bar's markup for any screen: data-upload ties it to its record, and uploadPaint keeps it
   current from then on, with no redraw. A status text placed anywhere takes data-upload-text. */
function uploadBarHtml(rec){ if(!rec) return ""; var p=uploadPct(rec);
  return '<span class="'+uploadBarClass(rec)+'" data-upload="'+attr(rec.id)+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p+'" aria-label="'+attr(rec.name)+'"><i style="width:'+p+'%"></i></span>'; }
function uploadTextHtml(rec){ return rec?'<span class="uptext" data-upload-text="'+attr(rec.id)+'">'+esc(uploadStatusText(rec))+'</span>':""; }
function uploadPaint(rec){ if(!rec||typeof document==="undefined") return; var p=uploadPct(rec), cls=uploadBarClass(rec), txt=uploadStatusText(rec);
  document.querySelectorAll('[data-upload="'+rec.id+'"]').forEach(function(el){ if(el.className!==cls) el.className=cls; el.setAttribute("aria-valuenow",p); var i=el.firstElementChild; if(i) i.style.width=p+"%"; });
  document.querySelectorAll('[data-upload-text="'+rec.id+'"]').forEach(function(el){ if(el.textContent!==txt) el.textContent=txt; }); }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Upload cancelled":"Unggahan dibatalkan",
  "The connection dropped before the upload finished.":"Koneksi terputus sebelum unggahan selesai.",
  "Optimising image…":"Mengoptimalkan gambar…",
  "Preparing…":"Menyiapkan…",
  "Saving to Google Drive…":"Menyimpan ke Google Drive…",
  "Saving…":"Menyimpan…",
  "Uploaded":"Terunggah",
  "Upload failed":"Unggahan gagal",
  "of":"dari",
  "Google Drive":"Google Drive",
  "this server":"server ini"
});
</script>
