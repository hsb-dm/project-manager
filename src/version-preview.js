<script>
/* VERSION PREVIEW — the work itself, shown in the task.

   A version is an uploaded image, a Google Drive file or folder, or a link to wherever the work
   lives. An image shows as itself. A link shows through the service's own embed — the address a
   service publishes for showing its content inside another site — so a Drive folder lists what is in
   it, a PDF pages through, a Sheet shows its cells, a Figma frame can be panned. A designer who keeps
   earlier rounds in subfolders of the same link has them one click away.

   Only services with an official embed are shown inside the app, and only through that embed
   address; server/security.js allows the same hosts in frame-src. Any other link shows as a card
   that opens it: a page from anywhere, framed inside the app, could pose as the app's own sign-in.
   The frame is sandboxed — it runs its own scripts and may open a new tab, but never navigates the
   app. */
function embedFor(url){
  var u; try{ u=new URL(String(url||"").trim()); }catch(e){ return null; }
  if(u.protocol!=="https:") return null;
  var h=u.hostname.toLowerCase().replace(/^(www|m)\./,""), p=u.pathname, m, id;
  var ok=function(s){ return /^[-\w]+$/.test(s||""); };
  if(h==="drive.google.com"){
    if((m=p.match(/^\/drive\/(?:u\/\d+\/)?folders\/([-\w]+)/))) return {src:"https://drive.google.com/embeddedfolderview?id="+m[1]+"#grid",kind:"folder",label:"Google Drive"};
    if((m=p.match(/^\/file\/d\/([-\w]+)/))) return {src:"https://drive.google.com/file/d/"+m[1]+"/preview",kind:"file",label:"Google Drive"};
    id=u.searchParams.get("id");
    if(/^\/(open|uc)$/.test(p)&&ok(id)) return {src:"https://drive.google.com/file/d/"+id+"/preview",kind:"file",label:"Google Drive"};
    return null;
  }
  if(h==="docs.google.com"&&(m=p.match(/^\/(document|spreadsheets|presentation)\/d\/([-\w]+)/)))
    return {src:"https://docs.google.com/"+m[1]+"/d/"+m[2]+"/preview",kind:"doc",label:{document:"Google Docs",spreadsheets:"Google Sheets",presentation:"Google Slides"}[m[1]]};
  /* the whole link goes to Figma, node-id and all, so the viewer opens on the frame the link points to */
  if(h==="figma.com"&&/^\/(file|design|proto|board|slides)\/[-\w]+/.test(p))
    return {src:"https://www.figma.com/embed?embed_host=share&url="+encodeURIComponent(u.href),kind:"design",label:"Figma",url:u.href};
  if(h==="canva.com"&&(m=p.match(/^\/design\/([-\w]+)\/([-\w]+)\/view/)))
    return {src:"https://www.canva.com/design/"+m[1]+"/"+m[2]+"/view?embed",kind:"design",label:"Canva"};
  if(h==="youtube.com"||h==="youtu.be"){
    id=h==="youtu.be"?p.slice(1).split("/")[0]:(u.searchParams.get("v")||(p.match(/^\/(?:shorts|embed|live)\/([-\w]+)/)||[])[1]);
    return ok(id)?{src:"https://www.youtube-nocookie.com/embed/"+id,kind:"video",label:"YouTube"}:null;
  }
  if(h==="vimeo.com"&&(m=p.match(/^\/(\d+)(?:\/([0-9a-f]+))?\/?$/)))
    return {src:"https://player.vimeo.com/video/"+m[1]+(m[2]?"?h="+m[2]:""),kind:"video",label:"Vimeo"};
  if(h==="loom.com"&&(m=p.match(/^\/share\/([0-9a-f]+)/))) return {src:"https://www.loom.com/embed/"+m[1],kind:"video",label:"Loom"};
  if(h==="miro.com"&&(m=p.match(/^\/app\/board\/([-\w=]+)/))) return {src:"https://miro.com/app/live-embed/"+m[1]+"/",kind:"board",label:"Miro"};
  /* a file at a public address: a picture as itself, a PDF or an Office file through Google's viewer */
  if(/\.(png|jpe?g|gif|webp|avif)$/i.test(p)) return {src:u.href,kind:"image",label:h};
  if(/\.(pdf|docx?|pptx?|xlsx?)$/i.test(p)) return {src:"https://docs.google.com/viewer?url="+encodeURIComponent(u.href)+"&embedded=true",kind:"doc",label:h};
  return null;
}
/* The page sends no referrer (Referrer-Policy in server/security.js); a video player refuses to play
   without one, so the frame sends just the app's origin. */
function embedIframeHtml(e,full){
  return '<div class="vp-frame vp-'+attr(e.kind)+(full?' full':'')+'"><iframe src="'+attr(e.src)+'" title="'+attr(e.label)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-downloads"></iframe></div>';
}
/* every embed in the app is drawn here (the version box, Full view, a file's or a link card's preview): a Figma file
   shows its picture until someone asks for Figma's viewer (below), every other service its embed at once */
function embedFrameHtml(e,full){ return e&&e.label==="Figma"&&!figmaIsLive(e.url)?figmaBoxHtml(e,full):embedIframeHtml(e,full); }
/* o.full: the Full view modal. o.foot: the bar under the preview. */
function versionPreviewHtml(tk,v,o){
  o=o||{};
  var e=!v.img&&v.driveUrl?embedFor(v.driveUrl):null;
  var img=v.img||(e&&e.kind==="image"?e.src:"");
  if(img){
    if(o.full) return '<div class="vp-image"><img src="'+attr(img)+'" alt=""></div>'+(o.foot||"");
    var z=S.annotZoom||"actual";
    return '<div class="preview has-img zoom-'+z+'"><div class="annot-zoom"><span class="hint">'+tr("Zoom")+'</span><div class="seg"><button class="'+(z==="actual"?"on":"")+'" onclick="S.annotZoom=\'actual\';renderDrawer()">100%</button><button class="'+(z==="fit"?"on":"")+'" onclick="S.annotZoom=\'fit\';renderDrawer()">'+tr("Fit")+'</button></div></div>'
      + '<div class="annot-scroll"><div class="canvas canvas-img" style="background:transparent"><img src="'+attr(img)+'" alt="" draggable="false"></div></div>'+(o.foot||"")+'</div>';
  }
  if(e) return '<div class="preview vp">'+embedFrameHtml(e,o.full)
    + (e.kind==="folder"?'<p class="vp-hint">'+tr("The folder's files show here when it is shared with you, or with anyone who has the link.")+'</p>':'')+(o.foot||"")+'</div>'+(o.full?'':figmaTipHtml(v.driveUrl));
  var host=""; try{ host=new URL(v.driveUrl).hostname.replace(/^www\./,""); }catch(x){}
  return '<div class="preview"><div class="canvas'+(o.full?' full':'')+'" style="background:'+attr(v.color||"#475569")+'"><div class="lbl">'+esc(tk.id)+' · V'+v.n+'<b>'+esc(tk.title)+'</b>'+(o.full?esc(v.note||""):'')+'</div>'
    + (host?'<span class="vp-nopreview">'+esc(host)+' · '+tr("open the link to see it")+'</span>':'')+'</div>'+(o.foot||"")+'</div>';
}

/* ---------- a Figma file: its picture first, Figma's viewer when asked (Oct 2026) ----------
   Figma's embed loads Figma's whole viewer (several MB of code, WebGL and the file's own data) before it shows
   anything. So wherever a Figma file would be framed, its thumbnail shows instead, which the server keeps
   (server/link-preview.js, GET /api/link-preview), with Open interactive, Open in Figma and Refresh preview under it.
   Open interactive swaps in the embed exactly as it was (the same address, sandbox and frame-src); in a task it stays
   so for that link until the task is closed. A file Figma will not describe (private) shows a card with the Figma
   mark, the name from its link and the same Open interactive, which may ask the viewer to sign in to Figma.
   - Nothing blinks: the box has the embed's own height from the start; until the picture is known, a skeleton of its
     shape holds the place; what was seen once is drawn at once the next time (localStorage, cos.figmaPreviews), asked
     again once per page behind it, and the box is patched in place, never the panel drawn again.
   - A link to the whole file (no node-id) gets a tip under it, once in the panel, until it is dismissed (per person).
   - A task with a Figma link warms the connection to Figma when it opens (figmaWarm), so Open interactive starts
     sooner; a task without one never does. */
var FG={data:{},asked:{},pending:{},loaded:{},live:{task:null,urls:{}},tip:false,warm:false,disk:null};
var FG_STORE="cos.figmaPreviews";
var FG_POINTER='<svg viewBox="0 0 24 24"><path d="M5 3l13 6.5-5.5 1.8L10.7 17z"/><path d="M13 12l5 5"/></svg>';
var FG_BULB='<svg class="fg-tip-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
/* a figma.com file link: its kind, key (letters and digits, as the server checks it) and node-id */
function figmaParts(url){ var u; try{ u=new URL(String(url||"")); }catch(e){ return null; }
  if(u.protocol!=="https:"||!/^(www\.)?figma\.com$/i.test(u.hostname)) return null;
  var m=u.pathname.match(/^\/(file|design|proto|board|slides|make|deck)\/([A-Za-z0-9]{2,128})(?:\/|$)/); if(!m) return null;
  return {kind:m[1],key:m[2],node:u.searchParams.get("node-id")||""}; }
function fgDisk(){ if(FG.disk) return FG.disk; var d=null; try{ d=JSON.parse(localStorage.getItem(FG_STORE)||"null"); }catch(e){ d=null; } return FG.disk=(d&&typeof d==="object")?d:{}; }
function fgKeep(key,v){ var d=fgDisk(); d[key]=v; var ks=Object.keys(d);
  if(ks.length>60) ks.sort(function(a,b){ return (d[a].at||0)-(d[b].at||0); }).slice(0,ks.length-60).forEach(function(k){ delete d[k]; });
  try{ localStorage.setItem(FG_STORE,JSON.stringify(d)); }catch(e){} }
function fgData(key){ return key?(FG.data[key]||fgDisk()[key]||null):null; }
/* what the server says about the file; every box showing it is patched in place */
function fgAsk(url,key,refresh){
  if(!key||!API.on) return Promise.resolve(null);
  if(FG.pending[key]&&!refresh) return FG.pending[key];
  var q=apiFetch("GET","/api/link-preview?url="+encodeURIComponent(url)+(refresh?"&refresh=1":"")).then(function(r){
    var v={t:r.title||"",th:r.thumb||"",w:+r.width||0,h:+r.height||0,p:!!r.private,off:!!r.unavailable,at:Date.now()}, old=fgData(key);
    /* Figma out of reach for a moment: a picture already seen stays */
    if(v.off&&old&&old.th) return old;
    FG.data[key]=v; if(!v.off) fgKeep(key,v); return v;
  },function(){ if(!fgData(key)) FG.data[key]={t:"",th:"",w:0,h:0,p:false,off:true,at:Date.now()}; return null; })
  .then(function(v){ if(FG.pending[key]===q) delete FG.pending[key]; fgPaint(key); return v; });
  FG.pending[key]=q; return q;
}
function fgName(url,d){ return (d&&d.t)||(typeof cmtLinkLabel==="function"?cmtLinkLabel(url):"")||"Figma"; }
function fgMark(url,px){ return typeof brandIconHtml==="function"?brandIconHtml(url,px):""; }
function fgSkel(w,h){ return '<svg class="fg-skel skel" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" aria-hidden="true"></svg>'; }
/* the picture is not known yet: the skeleton; there is none: the card */
function fgWaiting(key,d){ return !d&&!!key&&API.on; }
function fgIsCard(key,d){ return !(d&&d.th)&&!fgWaiting(key,d); }
function fgStageHtml(url,key,d){
  if(d&&d.th){
    var w=d.w||800, h=d.h||448, ready=!!FG.loaded[d.th];
    return '<div class="fg-stage'+(ready?' fg-ready':'')+'" data-sig="'+attr(d.th)+'">'+(ready?'':fgSkel(w,h))
      + '<img class="fg-img" src="'+attr(d.th)+'" alt="'+attr(fgName(url,d))+'" width="'+w+'" height="'+h+'" onload="figmaImgReady(this)" onerror="figmaImgFailed(this)" onclick="figmaLive(this)"></div>';
  }
  if(fgWaiting(key,d)) return '<div class="fg-stage" data-sig="wait" role="img" aria-busy="true" aria-label="'+attr(tr("Loading preview…"))+'">'+fgSkel(800,448)+'</div>';
  var priv=!!(d&&d.p);
  return '<div class="fg-stage fg-card" data-sig="'+(priv?"private":"off")+'"><span class="fg-logo">'+fgMark(url,30)+'</span><b class="fg-card-name">'+esc(fgName(url,d))+'</b>'
    + '<span class="fg-card-note">'+tr(priv?"Private file: no static preview":"No static preview right now")+'</span></div>';
}
function fgBarHtml(url,key){
  return '<div class="fg-bar"><span class="fg-title">'+fgMark(url,14)+'<span class="fg-tname"></span></span>'
    + (key&&API.on?'<button type="button" class="iconbtn flat sm fg-refresh" aria-label="'+attr(tr("Refresh preview"))+'" title="'+attr(tr("Refresh preview"))+'" onclick="figmaRefresh(this)">'+I.sync+'</button>':'')
    + '<button type="button" class="btn sm fg-open" onclick="openExternal('+jsq(url)+')">'+I.ext+tr("Open in Figma")+'</button>'
    + '<button type="button" class="btn sm primary fg-live" onclick="figmaLive(this)">'+FG_POINTER+tr("Open interactive")+'</button></div>';
}
function figmaBoxHtml(e,full){
  var url=e.url||"", p=figmaParts(url), key=p?p.key:"", d=fgData(key);
  if(key&&API.on&&!FG.asked[key]){ FG.asked[key]=1; setTimeout(function(){ fgAsk(url,key); },0); }
  figmaWarm();
  return '<div class="fg-box'+(full?' full':'')+(fgIsCard(key,d)?' fg-card-on':'')+'" data-fg="'+attr(key)+'" data-url="'+attr(url)+'">'+fgStageHtml(url,key,d)
    + fgBarHtml(url,key).replace('<span class="fg-tname"></span>','<span class="fg-tname">'+esc(fgName(url,d))+'</span>')+'</div>';
}
/* the answer came: what changed in each box showing the file — the picture, the card, the name — and nothing else,
   so a button that has the focus keeps it */
function fgPaint(key){
  if(!key) return; var d=fgData(key);
  Array.prototype.forEach.call(document.querySelectorAll('.fg-box[data-fg="'+key+'"]'),function(box){
    var url=box.getAttribute("data-url"), st=box.querySelector(".fg-stage"), html=fgStageHtml(url,key,d), sig=(html.match(/data-sig="([^"]*)"/)||[])[1];
    if(st&&st.getAttribute("data-sig")!==sig){ var t=document.createElement("div"); t.innerHTML=html; st.parentNode.replaceChild(t.firstChild,st); }
    box.classList.toggle("fg-card-on",fgIsCard(key,d));
    var nm=box.querySelector(".fg-tname"); if(nm&&nm.textContent!==fgName(url,d)) nm.textContent=fgName(url,d);
  });
}
function figmaImgReady(img){ FG.loaded[img.getAttribute("src")]=1; if(img.parentNode) img.parentNode.classList.add("fg-ready"); }
/* the kept picture would not load (signed out meanwhile, say): the card, for this box */
function figmaImgFailed(img){ var box=img.closest(".fg-box"), st=img.parentNode; if(!box||!st) return; var url=box.getAttribute("data-url"), d=fgData(box.getAttribute("data-fg"));
  var t=document.createElement("div"); t.innerHTML=fgStageHtml(url,"",{t:d&&d.t||"",off:true}); st.parentNode.replaceChild(t.firstChild,st); box.classList.add("fg-card-on"); }
/* Open interactive: the embed, in the same place and of the same height. Within a task it stays for that link until
   the task is closed (figmaTaskOpened); anywhere else (a chat preview) for that box. */
function fgLiveSync(){ var t=S.drawerTask||null; if(FG.live.task!==t) FG.live={task:t,urls:{}}; }
function figmaIsLive(url){ if(!S.drawerTask||!url) return false; fgLiveSync(); return !!FG.live.urls[url]; }
function figmaLive(el){
  var box=el&&el.closest?el.closest(".fg-box"):null; if(!box) return;
  var url=box.getAttribute("data-url"), e=embedFor(url); if(!e) return;
  if(S.drawerTask){ fgLiveSync(); FG.live.urls[e.url]=1; }
  var t=document.createElement("div"); t.innerHTML=embedIframeHtml(e,box.classList.contains("full"));
  var fr=t.firstChild; box.parentNode.replaceChild(fr,box);
  var ifr=fr.querySelector("iframe"); if(ifr){ try{ ifr.focus(); }catch(x){} }
}
function figmaRefresh(btn){
  var box=btn.closest(".fg-box"); if(!box) return; var url=box.getAttribute("data-url"), key=box.getAttribute("data-fg");
  btn.disabled=true; btn.setAttribute("aria-busy","true");
  fgAsk(url,key,true).then(function(v){ btn.disabled=false; btn.removeAttribute("aria-busy"); toast(tr(v?"Preview refreshed":"The preview could not be refreshed"),v?undefined:"bad"); });
}
/* ---------- the tip under a link to the whole file ---------- */
function figmaTipOff(){ try{ return localStorage.getItem("cos.figmaTip.off."+ME)==="1"; }catch(e){ return false; } }
function figmaTipReset(){ FG.tip=false; }
function figmaTipHtml(url){
  var p=figmaParts(url); if(!p||p.node||!/^(file|design)$/.test(p.kind)||FG.tip||figmaTipOff()) return "";
  FG.tip=true;
  return '<div class="fg-tip" role="note">'+FG_BULB+'<span>'+tr("Tip: in Figma use Copy link to selection to show the exact frame — it loads faster.")+'</span>'
    + '<button type="button" class="iconbtn flat sm fg-tip-x" aria-label="'+attr(tr("Dismiss tip"))+'" title="'+attr(tr("Dismiss tip"))+'" onclick="figmaTipDismiss(this)">'+I.x+'</button></div>';
}
function figmaTipDismiss(btn){
  try{ localStorage.setItem("cos.figmaTip.off."+ME,"1"); }catch(e){}
  var near=btn&&btn.closest?btn.closest(".fg-tip"):null, back=near&&near.previousElementSibling;
  Array.prototype.forEach.call(document.querySelectorAll(".fg-tip"),function(n){ n.parentNode.removeChild(n); });
  /* the focus goes back to what the tip was under */
  var f=back&&back.querySelector("button:not([disabled])"); if(f){ try{ f.focus(); }catch(x){} }
}
/* ---------- the connection, warmed when a task with a Figma link opens ----------
   The frame's own page (a navigation, credentials included) and Figma's scripts (fetched with crossorigin, from
   www.figma.com and static.figma.com) use separate connections, so both kinds are opened. */
function figmaWarm(){
  if(FG.warm) return; FG.warm=true;
  [["https://www.figma.com",false],["https://www.figma.com",true],["https://static.figma.com",true]].forEach(function(x){
    var l=document.createElement("link"); l.rel="preconnect"; l.href=x[0]; if(x[1]) l.crossOrigin="anonymous"; document.head.appendChild(l); });
}
function figmaInTask(tk){ return !!tk&&((tk.versions||[]).some(function(v){ return !!figmaParts(v.driveUrl); })||(tk.files||[]).some(function(f){ return !!figmaParts(f.url); })); }
/* openTask (src/drawer.js): another task, or the same one opened again, starts with every Figma file as a picture */
function figmaTaskOpened(tk,fresh){ if(fresh) FG.live={task:null,urls:{}}; if(figmaInTask(tk)) figmaWarm(); }

Object.assign(UI_ID,{
  "The folder's files show here when it is shared with you, or with anyone who has the link.":"File di folder ini tampil di sini bila folder dibagikan kepadamu, atau kepada siapa saja yang memiliki tautannya.",
  "open the link to see it":"buka tautannya untuk melihat",
  "Open interactive":"Buka interaktif",
  "Open in Figma":"Buka di Figma",
  "Refresh preview":"Muat ulang pratinjau",
  "Preview refreshed":"Pratinjau dimuat ulang",
  "The preview could not be refreshed":"Pratinjau tidak dapat dimuat ulang",
  "Loading preview…":"Memuat pratinjau…",
  "Private file: no static preview":"File privat: pratinjau statis tidak tersedia",
  "No static preview right now":"Pratinjau statis belum tersedia",
  "Tip: in Figma use Copy link to selection to show the exact frame — it loads faster.":"Tips: di Figma gunakan Copy link to selection agar langsung ke frame yang di-review — lebih cepat dimuat.",
  "Dismiss tip":"Tutup tips"
});
</script>
