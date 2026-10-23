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
/* Links whose name can be read (server/messages.js /api/links/title): Google's, from the page Google serves, and
   Figma files, YouTube and Vimeo videos, Loom recordings and Miro boards, from their own oEmbed. */
function linkNameable(url){ if(isGoogleLink(url)) return true; var u; try{ u=new URL(url); }catch(e){ return false; }
  var h=u.hostname.toLowerCase().replace(/^(www|m)\./,""), p=u.pathname;
  return h==="figma.com"?/^\/(file|design|proto|board|slides|make|deck)\/[^/]+/.test(p):h==="youtube.com"?/^\/(watch|shorts|live)\b/.test(p):h==="youtu.be"?p.length>1:h==="vimeo.com"?/^\/\d+/.test(p):h==="loom.com"?/^\/share\//.test(p):h==="miro.com"?/^\/app\/board\//.test(p):false; }
/* the key its name is remembered under: a Google file by its id, anything else by its address */
function linkNameKey(url){ var p=typeof detectProvider==="function"?detectProvider(url):null; return p&&/^GOOGLE_/.test(p.provider)&&p.resourceId?p.provider+":"+p.resourceId:"url:"+((p&&p.url)||url); }
function linkNameKnown(url){ if(isGoogleLink(url)) return driveLinkKnown(url); var c=typeof smartCacheGet==="function"?smartCacheGet(linkNameKey(url)):null; return !!(c&&c.title); }
/* what a link reads as right now: its remembered name; else, for Google, what kind of thing it is; else the words in its address */
function linkLabelNow(url){ if(isGoogleLink(url)) return driveLinkLabel(url); var c=typeof smartCacheGet==="function"?smartCacheGet(linkNameKey(url)):null; return (c&&c.title)||cmtLinkLabel(url); }
/* One lookup per link however many times it is drawn. */
var DRIVE_NAME_JOBS={};
function driveLinkName(url){
  if(!DRIVE_NAME_JOBS[url]) DRIVE_NAME_JOBS[url]=resolveSmartLink(url).then(function(r){ return r&&r.title?r.title:""; },function(){ return ""; });
  return DRIVE_NAME_JOBS[url];
}
/* A Drive link in written text becomes a chip: the Drive mark and the name. */
/* name: the one written with the link ([name](url), see link-tab.js); without it the chip shows
   the remembered name, or what kind of link it is and looks the name up */
function driveChipHtml(url,name){
  var known=!!name||driveLinkKnown(url);
  return '<a href="'+attr(url)+'" target="_blank" rel="noopener nofollow" class="rich-link drive-chip"'+(known?'':' data-drive-pending="1"')
    + ' title="'+attr(url)+'" onclick="event.stopPropagation();event.preventDefault();openExternal(this.href)">'
    + (typeof googleIcon==="function"?googleIcon(url):"")+'<span>'+esc(name||driveLinkLabel(url))+'</span></a>';
}
/* richLinkText draws every external link the same way, as its raw URL. A Drive link is drawn as a
   chip instead — in comments, and wherever else written text shows one. */
(function(){
  if(typeof richLinkText!=="function") return;
  var base=richLinkText;
  richLinkText=function(text){
    /* a link written as [name](url) reads as its name */
    var names=typeof mdLinkNames==="function"?mdLinkNames(text):{};
    var args=Array.prototype.slice.call(arguments);
    if(Object.keys(names).length) args[0]=mdLinkStrip(text);
    return base.apply(this,args).replace(/<a href="([^"]+)" target="_blank" rel="noopener nofollow" class="rich-link"([^>]*)>([^<]*)<\/a>/g,function(whole,href,rest){
      var url=typeof pasteUnesc==="function"?pasteUnesc(href):href, name=names[url];
      if(isGoogleLink(url)) return driveChipHtml(url,name);
      /* any other link is a chip too — its service's mark and its name (written with it, or read from the address) */
      return cmtAttChipHtml({url:url,name:name||"",named:!!name});
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
    driveLinkName(url).then(function(name){ if(!name) return; var s=a.querySelector(".lc-name")||a.querySelector("span"); if(s) s.textContent=name; });
  });
}
/* only what was just added is looked at (the first time, the whole page): the whole page was searched at every change */
var DRIVE_CHIP_SEEN_ALL=false;
new MutationObserver(function(recs){ if(DRIVE_CHIP_SCAN) return; var sel='[data-drive-pending="1"]', hit=false;
  if(!DRIVE_CHIP_SEEN_ALL){ DRIVE_CHIP_SEEN_ALL=true; hit=!!document.querySelector(sel); }
  for(var i=0;!hit&&i<recs.length;i++){ var a=recs[i].addedNodes; for(var j=0;j<a.length;j++){ var n=a[j]; if(n.nodeType===1&&(n.matches(sel)||(n.firstElementChild&&n.querySelector(sel)))){ hit=true; break; } } }
  if(hit) DRIVE_CHIP_SCAN=setTimeout(driveChipsFill,60); })
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
    + '<button type="button" class="btn xs cmt-ref-btn" data-ref-kind="task" title="'+attr(tr("Attach a task"))+'" onclick="cmtAttachRef(this,\'task\')">'+I.tasks+tr("Task")+'</button>'
    + '<button type="button" class="btn xs cmt-ref-btn" data-ref-kind="project" title="'+attr(tr("Attach a project"))+'" onclick="cmtAttachRef(this,\'project\')">'+I.projects+tr("Project")+'</button>'
    + '</div>';
}
var CMT_MAX_ATT=50;
function cmtRoom(){ return CMT_MAX_ATT-(window._cmtAtt||[]).length; }
function cmtStage(a){
  window._cmtAtt=window._cmtAtt||[];
  if(cmtRoom()<=0) return toast(tr("Up to 50 attachments per comment"),"bad");
  if(a.url&&window._cmtAtt.some(function(x){ return x.url===a.url; })) return toast(tr("That link is already attached"));
  if(a.ref&&window._cmtAtt.some(function(x){ return x.ref===a.ref&&x.refId===a.refId; })) return toast(tr("Already attached"));
  window._cmtAtt.push(a); cmtRedraw();
}
/* Upload images / Upload file: the same path as the comment box's own attach, filtered by kind. */
function cmtUpload(imagesOnly){
  var inp=document.getElementById("fileInput");
  inp.accept=imagesOnly?"image/*":"*/*"; inp.multiple=true;
  var forKey=typeof CMT_DRAFT_FOR==="undefined"?null:CMT_DRAFT_FOR;
  var cmtStage=function(a){ if(forKey&&forKey!==CMT_DRAFT_FOR&&typeof CMT_DRAFTS!=="undefined"){ (CMT_DRAFTS[forKey]=CMT_DRAFTS[forKey]||cmtDraftEmpty()).att.push(a); return; } window.cmtStage(a); };
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
    + fieldHtml("cmt_url",tr("Link"),'<textarea id="cmt_url" rows="2" inputmode="url" spellcheck="false" placeholder="'+attr(drive?"https://drive.google.com/drive/folders/…":"https://")+'" oninput="cmtLinkNameSoon(\''+kind+'\')"></textarea><div class="hint cmt-links-found" id="cmt_found">'+esc(tr("One link, or many — paste a list, or text with links in it."))+'</div>')
    + '<div id="cmt_name_wrap">'+fieldHtml("cmt_name",tr("Display name"),'<input id="cmt_name" placeholder="'+attr(tr(drive?"Filled in from Drive when it can be read":"Optional"))+'">')+'</div>'
    + '<p class="hint" id="cmt_name_hint" style="min-height:1.3em"></p>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" onclick="cmtLinkSave(\''+kind+'\')">'+(drive?driveIcon():I.link)+tr("Attach")+'</button>');
  focusSoon("cmt_url",40);
}
/* Any dialog with a link field and a name field: once a Google link is pasted, the name fills in
   from Drive. A name somebody typed is never replaced; one filled in from Drive is (data-auto),
   so pasting a different link updates it. The hint says what happened when it cannot be read. */
var LINK_NAME_T={};
function linkNameSoon(urlId,nameId,hintId){
  clearTimeout(LINK_NAME_T[urlId]);
  LINK_NAME_T[urlId]=setTimeout(function(){
    var url=normalizedAttachUrl(val(urlId)), hint=document.getElementById(hintId), nameEl=document.getElementById(nameId);
    if(!url||!linkNameable(url)||!nameEl){ if(hint) hint.textContent=""; return; }
    var google=isGoogleLink(url); if(hint) hint.textContent=tr(google?"Reading the name from Google Drive…":"Reading the name…");
    driveLinkName(url).then(function(name){
      var h=document.getElementById(hintId), n=document.getElementById(nameId); if(!n) return;
      if(name){ if(!n.value.trim()||n.value===n.getAttribute("data-auto")){ n.value=name; n.setAttribute("data-auto",name); } if(h) h.textContent=""; }
      else if(h) h.textContent=tr(google?"The name could not be read — the link is probably not shared with anyone who has it. It will show as":"The name could not be read — the link is probably private. It will show as")+" “"+linkLabelNow(url)+"”.";
    });
  },350);
}
/* The name to save under: the one typed, else Drive's — waited for briefly if it is still on its
   way, so a quick Save does not file the link as "Google Drive Folder" — else what kind of link it is. */
function linkNameFor(url,typed){
  if(typed) return Promise.resolve(typed);
  if(!linkNameable(url)) return Promise.resolve("");
  var wait=new Promise(function(r){ setTimeout(function(){ r(""); },2500); });
  return Promise.race([driveLinkName(url),wait]).then(function(name){ return name||(isGoogleLink(url)?driveLinkLabel(url):""); });
}
/* Every link in what was pasted — a list, or text with links in it: http:// as https://, an address without its
   https:// as a link, each once. One link keeps the name field; several are named by themselves (a Drive link by
   its file's name, any other by its site). */
function cmtLinksIn(text,kind){ var seen={}, out=[];
  var add=function(raw){ var u=normalizedAttachUrl(raw); if(!u||seen[u]) return; if(kind==="drive"&&!isGoogleLink(u)) return; seen[u]=1; out.push(u); };
  (typeof messageUrls==="function"?messageUrls(String(text||"")):[]).forEach(function(x){ add(x.raw); });
  if(!out.length) add(String(text||"").trim());
  return out; }
function cmtLinkNameSoon(kind){ var list=cmtLinksIn(val("cmt_url"),kind), f=document.getElementById("cmt_found"), w=document.getElementById("cmt_name_wrap");
  if(f) f.textContent=list.length>1?list.length+" "+tr("links found — each is attached"):list.length===1?tr("1 link found"):tr("One link, or many — paste a list, or text with links in it.");
  if(w) w.style.display=list.length>1?"none":"";
  if(list.length<=1) linkNameSoon("cmt_url","cmt_name","cmt_name_hint"); }
function cmtLinkSave(kind){
  var list=cmtLinksIn(val("cmt_url"),kind);
  if(list.length>1){ var room=cmtRoom(), added=0, skipped=0;
    list.forEach(function(u){ if(added>=room){ skipped++; return; } if((window._cmtAtt||[]).some(function(x){ return x.url===u; })) return; var drive=isGoogleLink(u), host=""; try{ host=new URL(u).hostname.replace(/^www\./,""); }catch(e){}
      window._cmtAtt=window._cmtAtt||[]; window._cmtAtt.push({name:drive?driveLinkLabel(u):host||tr("External link"),url:u,type:"link",kind:"link",source:drive?"gdrive":"link",size:tr("Link"),named:false}); added++; });
    closeModal(); cmtRedraw(); toast(added+" "+tr("links attached")+(skipped?" · "+tr("Up to 50 attachments per comment"):""),skipped?"bad":undefined); return; }
  var url=list[0]||normalizedAttachUrl(val("cmt_url"));
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
    return '<div class="row" onclick="cmtLibraryPick(\''+a.id+'\')"><span class="ficon" style="background:'+attr(a.color)+'">'+assetChip(a)+'</span><div style="min-width:0"><div class="t">'+esc(a.name)+'</div><div class="m">'+srcBadge(srcOf(a))+' <span>'+esc(a.size)+'</span></div></div><span class="btn xs">'+tr("Attach")+'</span></div>';
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
  /* links written into the comment count as attached ones do: an asset (Drive, Figma, Canva, Dropbox, a file…)
     is filed, a reference page stays on the comment */
  (typeof messageUrls==="function"?messageUrls(String(text||"")):[]).forEach(function(x){
    var url=normalizedAttachUrl(x.url); if(!url||!linkLooksLikeAsset(url)) return;
    if(out.some(function(a){ return a.url===url; })) return;
    var written=typeof mdLinkNames==="function"?mdLinkNames(text)[url]:"", g=isGoogleLink(url);
    out.push({name:written||(g?driveLinkLabel(url):cmtLinkLabel(url)),url:url,type:"link",kind:"link",source:g?"gdrive":"link",size:tr("Link")});
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
    if(!f.url||!linkNameable(f.url)||(isGoogleLink(f.url)?(f.name!==driveLinkLabel(f.url)||driveLinkKnown(f.url)):f.name!==cmtLinkLabel(f.url))) return;
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
/* A comment's links and files are chips, the way the description draws them (descLinkHtml): a file
   by its type's coloured badge (PDF, DOC, FIG…), a Google link by its product's mark and the file's
   live name (unless someone typed a name, shown as typed), Figma and Canva by theirs, any other link
   by a link mark — the name on one line. In the comment box they used to be a bare icon at full size
   (a black shape) beside a name that broke over two lines. Images keep their thumbnails. */
var CMT_LINK_BADGE={FIGMA:["FIG","#A259FF"],CANVA:["CNV","#00A3B4"]};
function cmtAttChipHtml(a){ var url=String(a.url||""), name=String(a.name||"").trim(), ext=typeof descFileExt==="function"?descFileExt(name):"";
  if(ext) return descFileChipHtml(esc(url),esc(name)).replace(' contenteditable="false"','');
  if(isGoogleLink(url)) return driveChipHtml(url,a.named||(name&&name!==url&&!/^https?:/i.test(name))?name:"");
  var p=typeof detectProvider==="function"?detectProvider(url):null, badge=p&&CMT_LINK_BADGE[p.provider], host="";
  try{ host=new URL(url,location.href).hostname.replace(/^www\./,""); }catch(e){}
  var named=!!(name&&name!==url), label=named?name:linkLabelNow(url), pending=!named&&linkNameable(url)&&!linkNameKnown(url);
  return '<a href="'+attr(url)+'" class="drive-chip file-chip link-chip"'+(pending?' data-drive-pending="1"':'')+' target="_blank" rel="noopener nofollow" title="'+attr(label+(host&&label!==host?" — "+host:""))+'" onclick="event.stopPropagation();event.preventDefault();openExternal(this.getAttribute(\'href\'),'+jsq(label)+')">'
    +(function(){ var bi=typeof brandIconHtml==="function"?brandIconHtml(url,14):""; return bi?'<span class="link-chip-ico brand">'+bi+'</span>':badge?'<span class="file-chip-ico" style="background:'+badge[1]+'">'+badge[0]+'</span>':'<span class="link-chip-ico">'+I.link+'</span>'; })()+'<span class="lc-name">'+esc(label)+'</span></a>'; }
/* A task or a project goes with a comment the way chat attaches one: picked from the Task and Project buttons,
   drawn as a live chip (refChipHtml, src/ref-chips.js) that opens it. Kept on the comment as
   {ref:"task"|"project", refId, name} — no link to check, nothing filed under Assets & versions. On a phone the
   buttons are behind the one attach button, so the picker opens by that one. */
function cmtAttachRef(btn,kind){ var inProject=typeof cmtIsProjectKey==="function"&&cmtIsProjectKey(CMT_DRAFT_FOR), tk=!inProject&&S.drawerTask?task(S.drawerTask):null, pid=inProject?cmtKeyProject(CMT_DRAFT_FOR):tk&&tk.proj, box=btn&&btn.closest?btn.closest(".composer"):null, anchor=btn&&btn.offsetParent?btn:((box&&box.querySelector(".m-attach"))||document.querySelector("#drawer .composer .m-attach")||btn);
  entityPicker({kind:kind,anchor:anchor,placeholder:tr(kind==="task"?"Find a task…":"Find a project…"),context:{projectId:pid},
    search:kind==="task"?function(q){ return epTaskItems(q,{projectId:pid}).filter(function(t){ return !tk||t.id!==tk.id; }); }:undefined,
    onSelect:function(item){ cmtStage({ref:kind,refId:item.id,name:kind==="task"?item.id+" · "+item.title:item.name}); }}); }
function cmtRefChipHtml(a){ return typeof refChipHtml==="function"?refChipHtml(a.ref,a.refId,a.name||a.refId):'<span class="att">'+esc(a.name||a.refId)+'</span>'; }
/* A link's name when none was written with it, read from its address: a known service's link by the page's own
   words in it (figma.com/design/…/Figma-KV-Insurance → "Figma KV Insurance"), any other by its site and that page
   (example.org › guidelines 2026), or its site alone. An id-like part (a long run of letters and digits) is no name. */
function cmtLinkLabel(url){ var u; try{ u=new URL(url); }catch(e){ return String(url||""); }
  var host=u.hostname.replace(/^www\./,""), segs=u.pathname.split("/").filter(Boolean).map(function(x){ try{ return decodeURIComponent(x); }catch(e){ return x; } });
  var words=null;
  /* figma.com/design/KEY/File-Name: the name is the part after the key, whatever it looks like */
  if(/(^|\.)figma\.com$/i.test(u.hostname)&&/^(file|design|proto|board|slides|make|deck)$/.test(segs[0]||"")&&segs[2]) words=segs[2].replace(/[-_]+/g," ").replace(/\s+/g," ").trim();
  for(var i=segs.length-1;!words&&i>=0;i--){ var sg=segs[i].replace(/\.[a-z0-9]{2,5}$/i,""); if(/[a-z]{3,}/i.test(sg)&&!(sg.length>=16&&!/[-_ ]/.test(sg))){ words=sg.replace(/[-_]+/g," ").replace(/\s+/g," ").trim(); break; } }
  if(words&&words.length>48) words=words.slice(0,47)+"…";
  var brand=typeof brandOf==="function"?brandOf(url):null;
  return brand?(words||brand.name):(words?host+" › "+words:host); }
function cmtStagedChipHtml(a,i){ return '<span class="att att-chip">'+(a.ref?cmtRefChipHtml(a):cmtAttChipHtml(a))+'<button type="button" class="att-x" title="'+attr(tr("Remove"))+'" aria-label="'+attr(tr("Remove")+" "+(a.name||""))+'" onclick="cmtAttRemove('+i+')">×</button></span>'; }
(function(){
  if(typeof commentAttachmentsHtml!=="function") return;
  var base=commentAttachmentsHtml;
  commentAttachmentsHtml=function(c){
    var list=(c&&c.attachments||[]).filter(Boolean);
    var links=list.filter(function(a){ return a&&typeof a==="object"&&!a.preview&&(a.url||(a.ref&&a.refId)); });
    if(!links.length) return base.apply(this,arguments);
    var rest=Object.assign({},c,{attachments:list.filter(function(a){ return links.indexOf(a)<0; })});
    return base.call(this,rest)+'<div class="cmt-drive cmt-links">'+links.map(function(a){ return a.ref?cmtRefChipHtml(a):cmtAttChipHtml(a); }).join("")+'</div>';
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
  "Reading the name…":"Membaca nama…",
  "The name could not be read — the link is probably private. It will show as":"Nama tidak terbaca — tautannya kemungkinan privat. Akan tampil sebagai",
  "The name could not be read — the link is probably not shared with anyone who has it. It will show as":"Namanya tidak bisa dibaca — kemungkinan tautan tidak dibagikan ke siapa pun yang memilikinya. Akan tampil sebagai",
  "The asset library is empty":"Pustaka aset masih kosong",
  "Use a Google Drive, Docs, Sheets, or Slides share link":"Gunakan tautan berbagi Google Drive, Docs, Sheets, atau Slides"
});
</script>
