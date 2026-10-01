<script>
/* COMMENTS: ATTACH THE WAY ASSETS & VERSIONS DOES, AND DRIVE LINKS THAT READ AS THEIR NAMES.

   Some people hand work over in the comments rather than in Assets & versions, so the comment box
   gets the same five ways in: Upload images, Upload file, Link Google Drive, Attach link and Attach
   from library. What is attached there is filed under Assets too, so the deliverable is found where
   deliverables are looked for, whichever way it arrived.

   A link is filed as an asset only when it is one: a Google Drive / Docs / Sheets / Slides link, a
   Figma or Canva design, a cloud-storage share, or a link straight to a file (.pdf, .psd, .zip…).
   A link to an article or a reference page stays on the comment — putting that among the assets
   would make the tab mean less. Drive links pasted into the comment's text count as attached; that
   is how most people attach one.

   A Drive link is shown short, as its name ("Q4 Campaign") rather than as a URL. The name comes from
   resolveSmartLink, which asks the server when nobody here has a Google token of their own. A link
   that is not shared with "anyone with the link" has no readable name and is shown as "Google
   Drive folder" (or file, doc, sheet…), which is still shorter than the URL and still says what it
   is. */

/* ---------- what counts as an asset ---------- */
var CMT_ASSET_EXT=/\.(pdf|png|jpe?g|gif|webp|svg|tiff?|psd|ai|eps|indd|fig|sketch|xd|zip|rar|7z|mp4|mov|webm|mp3|wav|pptx?|xlsx?|docx?|key|numbers|pages)$/i;
var CMT_ASSET_HOSTS=/(^|\.)(dropbox\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|wetransfer\.com|we\.tl|box\.com|frame\.io)$/i;
function linkLooksLikeAsset(url){
  var p=typeof detectProvider==="function"?detectProvider(url):null;
  if(p&&(/^GOOGLE_/.test(p.provider)||p.provider==="FIGMA"||p.provider==="CANVA")) return true;
  try{ var u=new URL(url); return CMT_ASSET_HOSTS.test(u.hostname)||CMT_ASSET_EXT.test(u.pathname); }catch(e){ return false; }
}
function isGoogleLink(url){ var p=typeof detectProvider==="function"?detectProvider(url):null; return !!(p&&/^GOOGLE_/.test(p.provider)); }

/* ---------- a Drive link's short label ---------- */
/* What is known right now, without waiting: the remembered name, or what kind of thing it is. */
function driveLinkLabel(url){
  var p=typeof detectProvider==="function"?detectProvider(url):null;
  if(!p||!/^GOOGLE_/.test(p.provider)) return "";
  var c=p.resourceId&&typeof smartCacheGet==="function"?smartCacheGet(p.provider+":"+p.resourceId):null;
  return (c&&c.title)||tr(smartSubtitle(p));
}
function driveLinkKnown(url){ var p=detectProvider(url); var c=p&&p.resourceId?smartCacheGet(p.provider+":"+p.resourceId):null; return !!(c&&c.title); }
/* One lookup per link however many times it is drawn. */
var DRIVE_NAME_JOBS={};
function driveLinkName(url){
  if(!DRIVE_NAME_JOBS[url]) DRIVE_NAME_JOBS[url]=resolveSmartLink(url).then(function(r){ return r&&r.title?r.title:""; },function(){ return ""; });
  return DRIVE_NAME_JOBS[url];
}
/* A Drive link in written text becomes a chip: the Drive mark and the name. */
function driveChipHtml(url){
  var known=driveLinkKnown(url);
  return '<a href="'+attr(url)+'" target="_blank" rel="noopener nofollow" class="rich-link drive-chip"'+(known?'':' data-drive-pending="1"')
    + ' title="'+attr(url)+'" onclick="event.stopPropagation();event.preventDefault();openExternal(this.href)">'
    + (typeof driveIcon==="function"?driveIcon():"")+'<span>'+esc(driveLinkLabel(url))+'</span></a>';
}
/* richLinkText draws every external link the same way, as its raw URL. A Drive link is drawn as a
   chip instead — in comments, and wherever else written text shows one. */
(function(){
  if(typeof richLinkText!=="function") return;
  var base=richLinkText;
  richLinkText=function(){
    return base.apply(this,arguments).replace(/<a href="([^"]+)" target="_blank" rel="noopener nofollow" class="rich-link"[^>]*>[^<]*<\/a>/g,function(whole,href){
      var url=typeof pasteUnesc==="function"?pasteUnesc(href):href;
      return isGoogleLink(url)?driveChipHtml(url):whole;
    });
  };
})();
/* Chips drawn before their name was known fill it in when it arrives. Watching the page rather than
   one screen catches every place written text is drawn. */
var DRIVE_CHIP_SCAN=null;
function driveChipsFill(){
  DRIVE_CHIP_SCAN=null;
  Array.prototype.forEach.call(document.querySelectorAll('[data-drive-pending="1"]'),function(a){
    a.removeAttribute("data-drive-pending");
    var url=a.getAttribute("href");
    driveLinkName(url).then(function(name){ if(!name) return; var s=a.querySelector("span"); if(s) s.textContent=name; });
  });
}
new MutationObserver(function(){ if(!DRIVE_CHIP_SCAN&&document.querySelector('[data-drive-pending="1"]')) DRIVE_CHIP_SCAN=setTimeout(driveChipsFill,60); })
  .observe(document.documentElement,{childList:true,subtree:true});

/* ---------- the comment box's toolbar ---------- */
/* Plain buttons: in a comment box Post is the one primary action. */
function cmtToolbarHtml(){
  var drive=typeof driveIcon==="function"?driveIcon():I.cloud;
  return '<div class="cmt-tools">'
    + '<button type="button" class="btn xs" onclick="cmtUpload(true)">'+I.up+tr("Upload images")+'</button>'
    + '<button type="button" class="btn xs" onclick="cmtUpload(false)">'+I.up+tr("Upload file")+'</button>'
    + '<button type="button" class="btn xs" onclick="cmtLinkModal(\'drive\')">'+drive+tr("Link Google Drive")+'</button>'
    + '<button type="button" class="btn xs" onclick="cmtLinkModal(\'web\')">'+I.link+tr("Attach link")+'</button>'
    + '<button type="button" class="btn xs" onclick="cmtLibraryModal()">'+I.assets.replace('class="i"','')+tr("Attach from library")+'</button>'
    + '</div>';
}
function cmtRoom(){ return 10-(window._cmtAtt||[]).length; }
function cmtStage(a){
  window._cmtAtt=window._cmtAtt||[];
  if(cmtRoom()<=0) return toast(tr("Up to 10 attachments per comment"),"bad");
  if(a.url&&window._cmtAtt.some(function(x){ return x.url===a.url; })) return toast(tr("That link is already attached"));
  var ta=document.getElementById("cmtText"); if(ta) window._cmtDraft=ta.value;
  window._cmtAtt.push(a); renderDrawer();
}
/* Upload images / Upload file: the same path as the comment box's own attach, filtered by kind. */
function cmtUpload(imagesOnly){
  var inp=document.getElementById("fileInput");
  inp.accept=imagesOnly?"image/*":"*/*"; inp.multiple=true;
  inp.onchange=function(){
    var files=Array.prototype.slice.call(inp.files||[]); inp.value=""; inp.multiple=false; if(!files.length) return;
    if(files.length>cmtRoom()){ toast(tr("Up to 10 attachments per comment"),"bad"); files=files.slice(0,Math.max(0,cmtRoom())); }
    files.forEach(function(f){
      var isImg=/^image\/(png|jpe?g|webp|gif)$/i.test(f.type);
      if(isImg) shrinkImage(f,1600,1600,function(u){ cmtStage({name:f.name,size:(f.size/1048576).toFixed(1)+" MB",preview:u,type:"image"}); },function(){ toast(tr("Could not read")+" "+f.name,"bad"); });
      else uploadAny(f,{forceDrive:true}).then(function(u){ cmtStage({name:f.name,size:u.size,url:u.url,driveId:u.driveId||null,type:u.type,source:u.source||(u.driveId?"gdrive":"local")}); }).catch(function(e){ toast(f.name+": "+e.message,"bad"); });
    });
  };
  inp.click();
}
/* Link Google Drive / Attach link: paste a link; a Drive link's name is filled in by itself when it
   can be read, and can always be typed over. */
function cmtLinkModal(kind){
  var drive=kind==="drive";
  openModal(drive?(driveIcon()+" "+tr("Link Google Drive")):tr("Attach link"),
    '<p class="hint" style="margin-bottom:10px">'+tr(drive?"Paste a Google Drive, Docs, Sheets or Slides link. It is shown by its name, and filed under Assets & versions.":"Paste a link. A link to a file or a design is also filed under Assets & versions; any other link stays on the comment.")+'</p>'
    + fieldHtml("cmt_url",tr("Link"),'<input id="cmt_url" inputmode="url" placeholder="'+attr(drive?"https://drive.google.com/drive/folders/…":"https://")+'" oninput="cmtLinkNameSoon(\''+kind+'\')">')
    + fieldHtml("cmt_name",tr("Display name"),'<input id="cmt_name" placeholder="'+attr(tr(drive?"Filled in from Drive when it can be read":"Optional"))+'">')
    + '<p class="hint" id="cmt_name_hint" style="min-height:1.3em"></p>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" onclick="cmtLinkSave(\''+kind+'\')">'+(drive?driveIcon():I.link)+tr("Attach")+'</button>');
  setTimeout(function(){ var i=document.getElementById("cmt_url"); if(i) i.focus(); },40);
}
var CMT_NAME_T=null;
function cmtLinkNameSoon(kind){
  clearTimeout(CMT_NAME_T);
  CMT_NAME_T=setTimeout(function(){
    var url=normalizedAttachUrl(val("cmt_url")), hint=document.getElementById("cmt_name_hint"), nameEl=document.getElementById("cmt_name");
    if(!url||!isGoogleLink(url)||!nameEl){ if(hint) hint.textContent=""; return; }
    if(hint) hint.textContent=tr("Reading the name from Google Drive…");
    driveLinkName(url).then(function(name){
      var h=document.getElementById("cmt_name_hint"), n=document.getElementById("cmt_name"); if(!n) return;
      if(name){ if(!n.value.trim()||n.value===n.getAttribute("data-auto")){ n.value=name; n.setAttribute("data-auto",name); } if(h) h.textContent=""; }
      else if(h) h.textContent=tr("The name could not be read — the link is probably not shared with anyone who has it. It will show as")+" “"+driveLinkLabel(url)+"”.";
    });
  },350);
}
function cmtLinkSave(kind){
  var url=normalizedAttachUrl(val("cmt_url"));
  if(!url) return toast(tr("Use a valid HTTPS link"),"bad");
  var drive=isGoogleLink(url);
  if(kind==="drive"&&!drive) return toast(tr("Use a Google Drive, Docs, Sheets, or Slides share link"),"bad");
  var nameEl=document.getElementById("cmt_name"), typed=val("cmt_name").trim(), host=""; try{ host=new URL(url).hostname; }catch(e){}
  /* a name filled in from Drive is Drive's, and follows it; only one somebody typed or changed is theirs */
  var own=!!typed&&typed!==(nameEl&&nameEl.getAttribute("data-auto"));
  closeModal();
  cmtStage({name:typed||(drive?driveLinkLabel(url):host||tr("External link")),url:url,type:"link",kind:"link",
    source:drive?"gdrive":"link",size:tr("Link"),named:own});
}
/* Attach from library: the same list as in Assets & versions. */
function cmtLibraryModal(){
  if(!ASSETS.length) return toast(tr("The asset library is empty"),"bad");
  openModal(tr("Attach from library"),'<div class="agenda">'+ASSETS.map(function(a){
    return '<div class="row" onclick="cmtLibraryPick(\''+a.id+'\')"><span class="ficon" style="background:'+a.color+'">'+typeExt(a)+'</span><div style="min-width:0"><div class="t">'+esc(a.name)+'</div><div class="m">'+srcBadge(srcOf(a))+' <span>'+esc(a.size)+'</span></div></div><span class="btn xs">'+tr("Attach")+'</span></div>';
  }).join("")+'</div>',null,true);
}
function cmtLibraryPick(id){
  var a=asset(id); if(!a) return; closeModal();
  cmtStage({name:a.name,size:a.size,url:a.url||"",preview:a.img||null,driveId:a.driveId||null,
    type:a.type==="image"||a.type==="logo"||a.type==="icon"?"image":(a.type||"other"),source:a.source||"local",fromLibrary:true});
}

/* ---------- filing a comment's assets under Assets & versions ----------
   Called by postComment with the task, the comment's attachments and its text. */
function cmtAssetsFrom(att,text){
  var out=[];
  (att||[]).forEach(function(a){
    if(!a||!(a.preview||a.url)) return;
    if(a.kind==="link"&&!linkLooksLikeAsset(a.url)) return;   /* a reference page stays on the comment */
    out.push(a);
  });
  /* Drive links written into the comment are attachments too */
  (typeof messageUrls==="function"?messageUrls(String(text||"")):[]).forEach(function(x){
    var url=normalizedAttachUrl(x.url); if(!url||!isGoogleLink(url)) return;
    if(out.some(function(a){ return a.url===url; })) return;
    out.push({name:driveLinkLabel(url),url:url,type:"link",kind:"link",source:"gdrive",size:tr("Link")});
  });
  return out;
}
function cmtFileAssets(t,list){
  var added=[];
  list.forEach(function(a){
    var dup=(t.files||[]).some(function(f){ return (a.url&&f.url===a.url)||(a.driveId&&f.driveId===a.driveId)||(a.preview&&f.preview===a.preview); });
    if(dup) return;
    var drive=a.url&&isGoogleLink(a.url);
    var f=F(a.name,drive?"document":(a.type==="link"?"document":(a.type||(a.preview?"image":"other"))),a.source||(a.driveId?"gdrive":(a.url&&/^https?:/i.test(a.url)?"link":"local")),a.size||"—",0,a.url||"",{preview:a.preview||null,driveId:a.driveId||null});
    t.files.push(f); added.push(f);
  });
  return added;
}
/* A Drive link filed before its name was known is renamed once the name arrives — unless somebody
   typed a name for it, which is theirs to keep. */
function cmtNameFiledLinks(tk,files){
  files.forEach(function(f){
    if(!f.url||!isGoogleLink(f.url)||f.name!==driveLinkLabel(f.url)||driveLinkKnown(f.url)) return;
    driveLinkName(f.url).then(function(name){
      if(!name) return;
      var live=task(tk.id); if(!live) return;
      var mine=(live.files||[]).filter(function(x){ return x.id===f.id; })[0];
      if(!mine||mine.name===name) return;
      /* Only the Assets entry is renamed. A comment's attachments cannot be changed once posted —
         the server refuses it, so nobody can alter what someone else attached — and the comment
         does not need it: it draws its Drive links as chips that look the name up themselves. */
      editTaskWith(live,function(t){ (t.files||[]).forEach(function(x){ if(x.id===f.id) x.name=name; }); });
    });
  });
}
/* A posted comment's Drive attachments, drawn as chips with their live name — unless someone typed
   a name for one, which is shown as typed. */
(function(){
  if(typeof commentAttachmentsHtml!=="function") return;
  var base=commentAttachmentsHtml;
  commentAttachmentsHtml=function(c){
    var list=(c&&c.attachments||[]).filter(Boolean);
    var drive=list.filter(function(a){ return a.url&&!a.preview&&!a.named&&isGoogleLink(a.url); });
    if(!drive.length) return base.apply(this,arguments);
    var rest=Object.assign({},c,{attachments:list.filter(function(a){ return drive.indexOf(a)<0; })});
    return base.call(this,rest)+'<div class="cmt-drive">'+drive.map(function(a){ return driveChipHtml(a.url); }).join("")+'</div>';
  };
})();
/* In Assets & versions a Drive link's row said its full URL under its name; it says what kind of
   Drive item it is instead, which is what the URL was being read for. */
function fileUrlLabel(url){ return isGoogleLink(url)?driveLinkKindLabel(url):url; }
function driveLinkKindLabel(url){ var p=detectProvider(url); return p?tr(smartSubtitle(p)):url; }

Object.assign(UI_ID,{
  "That link is already attached":"Tautan itu sudah dilampirkan",
  "Paste a Google Drive, Docs, Sheets or Slides link. It is shown by its name, and filed under Assets & versions.":"Tempel tautan Google Drive, Docs, Sheets, atau Slides. Ditampilkan dengan namanya, dan disimpan di Aset & versi.",
  "Paste a link. A link to a file or a design is also filed under Assets & versions; any other link stays on the comment.":"Tempel tautan. Tautan ke file atau desain juga disimpan di Aset & versi; tautan lain tetap di komentar.",
  "Filled in from Drive when it can be read":"Diisi otomatis dari Drive jika bisa dibaca",
  "Optional":"Opsional",
  "Reading the name from Google Drive…":"Membaca nama dari Google Drive…",
  "The name could not be read — the link is probably not shared with anyone who has it. It will show as":"Namanya tidak bisa dibaca — kemungkinan tautan tidak dibagikan ke siapa pun yang memilikinya. Akan tampil sebagai",
  "The asset library is empty":"Pustaka aset masih kosong"
});
</script>
