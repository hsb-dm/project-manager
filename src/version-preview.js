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
  /* a video: its picture first, the player when asked (videoBoxHtml below) */
  if(h==="youtube.com"||h==="youtu.be"){
    id=h==="youtu.be"?p.slice(1).split("/")[0]:(u.searchParams.get("v")||(p.match(/^\/(?:shorts|embed|live)\/([-\w]+)/)||[])[1]);
    return ok(id)?{src:"https://www.youtube-nocookie.com/embed/"+id,kind:"video",label:"YouTube",url:u.href}:null;
  }
  /* an unlisted video's hash, after its number or as ?h= */
  if(h==="vimeo.com"&&(m=p.match(/^\/(\d+)(?:\/([0-9a-f]+))?\/?$/))){
    var vh=m[2]||(/^[0-9a-f]+$/.test(u.searchParams.get("h")||"")?u.searchParams.get("h"):"");
    return {src:"https://player.vimeo.com/video/"+m[1]+(vh?"?h="+vh:""),kind:"video",label:"Vimeo",url:u.href};
  }
  /* Loom's id, a title before it allowed (/share/Brand-review-<id>), as the shared check reads it */
  if(h==="loom.com"&&(m=p.match(/^\/share\/(?:[^/]*-)?([0-9A-Fa-f]{32})\/?$/)||p.match(/^\/share\/([0-9a-f]+)/))) return {src:"https://www.loom.com/embed/"+m[1].toLowerCase(),kind:"video",label:"Loom",url:u.href};
  if(h==="miro.com"&&(m=p.match(/^\/app\/board\/([-\w=]+)/))) return {src:"https://miro.com/app/live-embed/"+m[1]+"/",kind:"board",label:"Miro"};
  /* a file at a public address: a picture as itself, a PDF or an Office file through Google's viewer */
  if(/\.(png|jpe?g|gif|webp|avif)$/i.test(p)) return {src:u.href,kind:"image",label:h};
  if(/\.(pdf|docx?|pptx?|xlsx?)$/i.test(p)) return {src:"https://docs.google.com/viewer?url="+encodeURIComponent(u.href)+"&embedded=true",kind:"doc",label:h};
  return null;
}
/* The page sends no referrer (Referrer-Policy in server/security.js); a video player refuses to play
   without one, so the frame sends just the app's origin.
   o.shape: a video player in the place of its picture, of the picture's shape and size (a Short upright, a Loom
   recording often 4:3). o.autoplay: Play was clicked, so the player starts at once (YouTube, Vimeo and Loom all take
   autoplay=1 in this sandbox; a browser that holds back sound shows the player's own play button instead). */
function embedIframeHtml(e,full,o){
  o=o||{}; var src=e.src+(o.autoplay?(e.src.indexOf("?")<0?"?":"&")+"autoplay=1":"");
  return '<div class="vp-frame vp-'+attr(e.kind)+(full?' full':'')+(o.shape?' vd-sized" style="'+attr(vdShapeCss(o.shape)):'')+'"><iframe src="'+attr(src)+'" title="'+attr(e.label)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-downloads"></iframe></div>';
}
/* every embed in the app is drawn here (the version box, Full view, a file's or a link card's preview): a Figma file
   shows its picture until someone asks for Figma's viewer, a YouTube, Vimeo or Loom video its picture until Play
   (below), every other service its embed at once */
function embedFrameHtml(e,full){
  if(e&&!figmaIsLive(e.url)){
    if(e.label==="Figma") return figmaBoxHtml(e,full);
    if(e.kind==="video"&&vdParts(e.url)) return videoBoxHtml(e,full);
  }
  return embedIframeHtml(e,full,e&&e.kind==="video"?{shape:vdShapeOf(e.url)}:null);
}
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

/* ---------- a link's picture first, its viewer when asked (Oct 2026) ----------
   A Figma file's embed loads Figma's whole viewer (several MB of code, WebGL and the file's own data), a video's its
   player (YouTube's about a megabyte of script), before either shows anything. So wherever such a link would be
   framed, its thumbnail shows instead, which the server keeps (server/link-preview.js, GET /api/link-preview; which
   links, and their ids, is shared/link-providers.js, the server's own check). The viewer comes when asked: a Figma
   file's Open interactive, a video's Play. It is the embed exactly as it was (the same address, sandbox and
   frame-src; a video's with autoplay=1), and in a task it stays so for that link until the task is closed. A link the
   provider will not describe (private) shows a card with its mark, the name from the link and the same button, which
   loads the viewer as before (it may ask the viewer to sign in).
   - Nothing blinks: the box has the viewer's own size from the start; until the picture is known, a skeleton of its
     shape holds the place; what was seen once is drawn at once the next time (localStorage, cos.linkPreviews), asked
     again once per page behind it, and the box is patched in place, never the panel drawn again.
   - A Figma link to the whole file (no node-id) gets a tip under it, once in the panel, until it is dismissed (per
     person). A task with a Figma link warms the connection to Figma when it opens (figmaWarm), so Open interactive
     starts sooner; a task without one never does. */
var LPV={data:{},asked:{},pending:{},loaded:{},live:{task:null,urls:{}},disk:null};
var FG={tip:false,warm:false};
/* by slot: a Figma file's key, a video's provider and id ("youtube:<id>", "youtube:shorts/<id>", "vimeo:<id>[/<hash>]",
   "loom:<id>"); the 80 seen last */
var LP_STORE="cos.linkPreviews";
var FG_POINTER='<svg viewBox="0 0 24 24"><path d="M5 3l13 6.5-5.5 1.8L10.7 17z"/><path d="M13 12l5 5"/></svg>';
var FG_BULB='<svg class="fg-tip-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
var VD_PLAY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>';
function lpParse(url){ return typeof LinkProviders!=="undefined"?LinkProviders.parse(url):null; }
function lpSlot(p){ return !p?"":p.provider==="figma"?p.key:p.provider+":"+p.key; }
/* a figma.com file link: its kind, key and node-id */
function figmaParts(url){ var p=lpParse(url); return p&&p.provider==="figma"?{kind:p.kind,key:p.key,node:p.nodeId||""}:null; }
/* what this browser kept (the first, Figma-only store, cos.figmaPreviews, is taken over once) */
function lpDisk(){ if(LPV.disk) return LPV.disk; var d=null;
  try{ var mine=localStorage.getItem(LP_STORE), old=localStorage.getItem("cos.figmaPreviews"); d=JSON.parse(mine||old||"null");
    if(old!==null){ if(!mine) localStorage.setItem(LP_STORE,old); localStorage.removeItem("cos.figmaPreviews"); } }catch(e){ d=null; }
  return LPV.disk=(d&&typeof d==="object")?d:{}; }
function lpKeep(slot,v){ var d=lpDisk(); d[slot]=v; var ks=Object.keys(d);
  if(ks.length>80) ks.sort(function(a,b){ return (d[a].at||0)-(d[b].at||0); }).slice(0,ks.length-80).forEach(function(k){ delete d[k]; });
  try{ localStorage.setItem(LP_STORE,JSON.stringify(d)); }catch(e){} }
function lpData(slot){ return slot?(LPV.data[slot]||lpDisk()[slot]||null):null; }
/* what the server says about the link; every box showing it is patched in place */
function lpAsk(url,slot,refresh){
  if(!slot||!API.on) return Promise.resolve(null);
  if(LPV.pending[slot]&&!refresh) return LPV.pending[slot];
  var q=apiFetch("GET","/api/link-preview?url="+encodeURIComponent(url)+(refresh?"&refresh=1":"")).then(function(r){
    var v={t:r.title||"",th:r.thumb||"",w:+r.width||0,h:+r.height||0,p:!!r.private,off:!!r.unavailable,at:Date.now(),d:+r.duration||0}, old=lpData(slot);
    /* the provider out of reach for a moment: a picture already seen stays */
    if(v.off&&old&&old.th) return old;
    LPV.data[slot]=v; if(!v.off) lpKeep(slot,v); return v;
  },function(){ if(!lpData(slot)) LPV.data[slot]={t:"",th:"",w:0,h:0,p:false,off:true,at:Date.now(),d:0}; return null; })
  .then(function(v){ if(LPV.pending[slot]===q) delete LPV.pending[slot]; lpPaint(slot); return v; });
  LPV.pending[slot]=q; return q;
}
/* the picture is not known yet: the skeleton; there is none: the card */
function lpWaiting(slot,d){ return !d&&!!slot&&API.on; }
function lpIsCard(slot,d){ return !(d&&d.th)&&!lpWaiting(slot,d); }
/* asked once a page; a link whose provider could not be reached (its name did not resolve, it did not answer: the card
   "No preview right now") again when it is drawn 10 minutes later, as the server asks the provider again by then. The
   box is drawn first either way: nothing waits for the answer. */
var LP_RETRY_MS=10*60e3;
function lpAskOnce(url,slot){
  if(!slot||!API.on) return; var at=LPV.asked[slot], d=LPV.data[slot];
  if(at&&!(d&&d.off&&Date.now()-at>=LP_RETRY_MS)) return;
  LPV.asked[slot]=Date.now(); setTimeout(function(){ lpAsk(url,slot); },0);
}
/* the answer came: what changed in each box showing the link — the picture, the card, the name, the shape — and
   nothing else, so a button that has the focus keeps it */
function lpPaint(slot){
  if(!slot) return; var d=lpData(slot);
  function swap(st,html){ var sig=(html.match(/data-sig="([^"]*)"/)||[])[1]; if(st&&st.getAttribute("data-sig")!==sig){ var t=document.createElement("div"); t.innerHTML=html; st.parentNode.replaceChild(t.firstChild,st); } }
  Array.prototype.forEach.call(document.querySelectorAll('.fg-box[data-fg="'+slot+'"]'),function(box){
    var url=box.getAttribute("data-url");
    swap(box.querySelector(".fg-stage"),fgStageHtml(url,slot,d));
    box.classList.toggle("fg-card-on",lpIsCard(slot,d));
    var nm=box.querySelector(".fg-tname"); if(nm&&nm.textContent!==fgName(url,d)) nm.textContent=fgName(url,d);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.vd-box[data-vd="'+slot+'"]'),function(box){
    var url=box.getAttribute("data-url"), p=vdParts(url), s=vdShape(p,d);
    swap(box.querySelector(".vd-stage"),vdStageHtml(url,p,slot,d));
    box.classList.toggle("vd-card-on",lpIsCard(slot,d));
    /* the first answer for a video never seen here may change its shape (a Loom recording 4:3): once */
    if(box.getAttribute("data-shape")!==s.join(":")){ box.setAttribute("data-shape",s.join(":")); box.setAttribute("style",vdShapeCss(s)); }
    var nm=box.querySelector(".vd-tname"); if(nm&&nm.textContent!==vdName(p,d)) nm.textContent=vdName(p,d);
  });
}
function lpMark(url,px){ return typeof brandIconHtml==="function"?brandIconHtml(url,px):""; }
/* the viewer, asked for: in the same place and of the same size. Within a task it stays for that link until the task
   is closed (figmaTaskOpened); anywhere else (a chat preview) for that box. */
function lpLiveSync(){ var t=S.drawerTask||null; if(LPV.live.task!==t) LPV.live={task:t,urls:{}}; }
function figmaIsLive(url){ if(!S.drawerTask||!url) return false; lpLiveSync(); return !!LPV.live.urls[url]; }
function lpGoLive(box,o){
  var url=box.getAttribute("data-url"), e=embedFor(url); if(!e) return;
  if(S.drawerTask){ lpLiveSync(); LPV.live.urls[e.url]=1; }
  var t=document.createElement("div"); t.innerHTML=embedIframeHtml(e,box.classList.contains("full"),o);
  var fr=t.firstChild; box.parentNode.replaceChild(fr,box);
  var ifr=fr.querySelector("iframe"); if(ifr){ try{ ifr.focus(); }catch(x){} }
}

/* ---------- a Figma file ---------- */
function fgName(url,d){ return (d&&d.t)||(typeof cmtLinkLabel==="function"?cmtLinkLabel(url):"")||"Figma"; }
function fgSkel(w,h){ return '<svg class="fg-skel skel" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" aria-hidden="true"></svg>'; }
function fgStageHtml(url,key,d){
  if(d&&d.th){
    var w=d.w||800, h=d.h||448, ready=!!LPV.loaded[d.th];
    return '<div class="fg-stage'+(ready?' fg-ready':'')+'" data-sig="'+attr(d.th)+'">'+(ready?'':fgSkel(w,h))
      + '<img class="fg-img" src="'+attr(d.th)+'" alt="'+attr(fgName(url,d))+'" width="'+w+'" height="'+h+'" onload="figmaImgReady(this)" onerror="figmaImgFailed(this)" onclick="figmaLive(this)"></div>';
  }
  if(lpWaiting(key,d)) return '<div class="fg-stage" data-sig="wait" role="img" aria-busy="true" aria-label="'+attr(tr("Loading preview…"))+'">'+fgSkel(800,448)+'</div>';
  var priv=!!(d&&d.p);
  return '<div class="fg-stage fg-card" data-sig="'+(priv?"private":"off")+'"><span class="fg-logo">'+lpMark(url,30)+'</span><b class="fg-card-name">'+esc(fgName(url,d))+'</b>'
    + '<span class="fg-card-note">'+tr(priv?"Private file: no static preview":"No static preview right now")+'</span></div>';
}
function fgBarHtml(url,key){
  return '<div class="fg-bar"><span class="fg-title">'+lpMark(url,14)+'<span class="fg-tname"></span></span>'
    + (key&&API.on?'<button type="button" class="iconbtn flat sm fg-refresh" aria-label="'+attr(tr("Refresh preview"))+'" title="'+attr(tr("Refresh preview"))+'" onclick="figmaRefresh(this)">'+I.sync+'</button>':'')
    + '<button type="button" class="btn sm fg-open" onclick="openExternal('+jsq(url)+')">'+I.ext+tr("Open in Figma")+'</button>'
    + '<button type="button" class="btn sm primary fg-live" onclick="figmaLive(this)">'+FG_POINTER+tr("Open interactive")+'</button></div>';
}
function figmaBoxHtml(e,full){
  var url=e.url||"", p=figmaParts(url), key=p?p.key:"", d=lpData(key);
  lpAskOnce(url,key);
  figmaWarm();
  return '<div class="fg-box'+(full?' full':'')+(lpIsCard(key,d)?' fg-card-on':'')+'" data-fg="'+attr(key)+'" data-url="'+attr(url)+'">'+fgStageHtml(url,key,d)
    + fgBarHtml(url,key).replace('<span class="fg-tname"></span>','<span class="fg-tname">'+esc(fgName(url,d))+'</span>')+'</div>';
}
function figmaImgReady(img){ LPV.loaded[img.getAttribute("src")]=1; if(img.parentNode) img.parentNode.classList.add("fg-ready"); }
/* the kept picture would not load (signed out meanwhile, say): the card, for this box */
function figmaImgFailed(img){ var box=img.closest(".fg-box"), st=img.parentNode; if(!box||!st) return; var url=box.getAttribute("data-url"), d=lpData(box.getAttribute("data-fg"));
  var t=document.createElement("div"); t.innerHTML=fgStageHtml(url,"",{t:d&&d.t||"",off:true}); st.parentNode.replaceChild(t.firstChild,st); box.classList.add("fg-card-on"); }
/* Open interactive: Figma's embed, of the box's height */
function figmaLive(el){ var box=el&&el.closest?el.closest(".fg-box"):null; if(box) lpGoLive(box); }
function figmaRefresh(btn){
  var box=btn.closest(".fg-box"); if(!box) return; var url=box.getAttribute("data-url"), key=box.getAttribute("data-fg");
  btn.disabled=true; btn.setAttribute("aria-busy","true");
  lpAsk(url,key,true).then(function(v){ btn.disabled=false; btn.removeAttribute("aria-busy"); toast(tr(v?"Preview refreshed":"The preview could not be refreshed"),v?undefined:"bad"); });
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
/* openTask (src/drawer.js): another task, or the same one opened again, starts with every Figma file and every video
   as a picture */
function figmaTaskOpened(tk,fresh){ if(fresh) LPV.live={task:null,urls:{}}; if(figmaInTask(tk)) figmaWarm(); }

/* ---------- a video: YouTube, Vimeo, Loom ----------
   The box is the player's own shape (oEmbed's width and height: 16:9, a Short 9:16, a Loom recording often 4:3;
   16:9, or a Short's 9:16, until the answer is known) and size (.vp-frame.vp-video), so Play puts the player exactly
   where the picture was. On the picture: the video's title and length, Play / Putar in the middle and Open in
   YouTube / Buka di YouTube beside it. */
function vdParts(url){ var p=lpParse(url); return p&&p.provider!=="figma"?p:null; }
var VD_SHAPES=[[16,9],[9,16],[4,3],[3,4],[1,1],[21,9]];
/* [width, height]: oEmbed's 200 × 113 is 16:9; a shape close to a common one is that one */
function vdShape(p,d){
  var w=d&&d.w, h=d&&d.h;
  if(!(w>0&&h>0)) return p&&p.shorts?[9,16]:[16,9];
  var r=w/h; for(var i=0;i<VD_SHAPES.length;i++){ var s=VD_SHAPES[i]; if(Math.abs(r/(s[0]/s[1])-1)<0.03) return s; }
  return [Math.round(Math.max(0.4,Math.min(2.5,r))*1000)/1000,1];
}
function vdShapeOf(url){ var p=vdParts(url); return p?vdShape(p,lpData(lpSlot(p))):null; }
/* the shape, and --vr for its width: the box is as wide as its place allows up to its height's limit
   (src/v38.css), in a block or a flex column (a modal's body) alike */
function vdShapeCss(s){ return "aspect-ratio:"+s[0]+" / "+s[1]+";--vr:"+(Math.round(s[0]/s[1]*10000)/10000); }
function vdDur(s){ s=Math.round(+s||0); if(!(s>0)) return ""; var h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return (h?h+":"+(m<10?"0":""):"")+m+":"+(x<10?"0":"")+x; }
/* the title the provider gave it; a private video has none, so the link's own short form */
function vdName(p,d){
  if(d&&d.t) return d.t; if(!p) return "";
  return p.provider==="youtube"?(p.shorts?"youtube.com/shorts/":"youtu.be/")+p.id:p.provider==="vimeo"?"vimeo.com/"+p.id:"loom.com/share/"+p.id.slice(0,8)+"…";
}
function vdOpenLabel(p){ return p.provider==="youtube"?tr("Open in YouTube"):p.provider==="vimeo"?tr("Open in Vimeo"):tr("Open in Loom"); }
function vdStageHtml(url,p,slot,d){
  var name=vdName(p,d);
  if(d&&d.th){
    var ready=!!LPV.loaded[d.th], dur=vdDur(d.d);
    return '<div class="vd-stage vd-pic'+(ready?' vd-ready':'')+'" data-sig="'+attr(d.th)+'">'+(ready?'':'<span class="vd-skel skel" aria-hidden="true"></span>')
      + '<img class="vd-img" src="'+attr(d.th)+'" alt="'+attr(name)+'" onload="videoImgReady(this)" onerror="videoImgFailed(this)" onclick="videoPlay(this)">'
      + '<span class="vd-cap" aria-hidden="true">'+lpMark(url,16)+'<span class="vd-tname">'+esc(name)+'</span></span>'+(dur?'<span class="vd-dur">'+dur+'</span>':'')+'</div>';
  }
  if(lpWaiting(slot,d)) return '<div class="vd-stage" data-sig="wait" role="img" aria-busy="true" aria-label="'+attr(tr("Loading preview…"))+'"><span class="vd-skel skel" aria-hidden="true"></span></div>';
  var priv=!!(d&&d.p);
  return '<div class="vd-stage vd-card" data-sig="'+(priv?"private":"off")+'"><span class="vd-logo">'+lpMark(url,28)+'</span><b class="vd-card-name vd-tname">'+esc(name)+'</b>'
    + '<span class="vd-card-note">'+tr(priv?"Private video: no preview":"No preview right now")+'</span></div>';
}
function videoBoxHtml(e,full){
  var url=e.url||"", p=vdParts(url), slot=lpSlot(p), d=lpData(slot), s=vdShape(p,d);
  lpAskOnce(url,slot);
  return '<div class="vd-box'+(full?' full':'')+(lpIsCard(slot,d)?' vd-card-on':'')+'" data-vd="'+attr(slot)+'" data-url="'+attr(url)+'" data-shape="'+s.join(":")+'" style="'+attr(vdShapeCss(s))+'">'+vdStageHtml(url,p,slot,d)
    + '<div class="vd-acts"><button type="button" class="vd-play" onclick="videoPlay(this)">'+VD_PLAY+'<span>'+tr("Play")+'</span></button>'
    + '<button type="button" class="vd-open" onclick="openExternal('+jsq(url)+')">'+I.ext+'<span>'+vdOpenLabel(p)+'</span></button></div></div>';
}
function videoImgReady(img){ LPV.loaded[img.getAttribute("src")]=1; if(img.parentNode) img.parentNode.classList.add("vd-ready"); }
function videoImgFailed(img){ var box=img.closest(".vd-box"), st=img.parentNode; if(!box||!st) return; var url=box.getAttribute("data-url"), p=vdParts(url), d=lpData(box.getAttribute("data-vd"));
  var t=document.createElement("div"); t.innerHTML=vdStageHtml(url,p,"",{t:d&&d.t||"",off:true}); st.parentNode.replaceChild(t.firstChild,st); box.classList.add("vd-card-on"); }
/* Play: the player, of the box's shape, started */
function videoPlay(el){ var box=el&&el.closest?el.closest(".vd-box"):null; if(box) lpGoLive(box,{shape:(box.getAttribute("data-shape")||"16:9").split(":").map(Number),autoplay:true}); }

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
  "Dismiss tip":"Tutup tips",
  "Open in YouTube":"Buka di YouTube",
  "Open in Vimeo":"Buka di Vimeo",
  "Open in Loom":"Buka di Loom",
  "Private video: no preview":"Video privat: pratinjau tidak tersedia",
  "No preview right now":"Pratinjau belum tersedia"
});
</script>
