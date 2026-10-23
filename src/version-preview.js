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
  if(h==="figma.com"&&/^\/(file|design|proto|board|slides)\/[-\w]+/.test(p))
    return {src:"https://www.figma.com/embed?embed_host=share&url="+encodeURIComponent(u.href),kind:"design",label:"Figma"};
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
function embedFrameHtml(e,full){
  return '<div class="vp-frame vp-'+attr(e.kind)+(full?' full':'')+'"><iframe src="'+attr(e.src)+'" title="'+attr(e.label)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-downloads"></iframe></div>';
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
    + (e.kind==="folder"?'<p class="vp-hint">'+tr("The folder's files show here when it is shared with you, or with anyone who has the link.")+'</p>':'')+(o.foot||"")+'</div>';
  var host=""; try{ host=new URL(v.driveUrl).hostname.replace(/^www\./,""); }catch(x){}
  return '<div class="preview"><div class="canvas'+(o.full?' full':'')+'" style="background:'+attr(v.color||"#475569")+'"><div class="lbl">'+esc(tk.id)+' · V'+v.n+'<b>'+esc(tk.title)+'</b>'+(o.full?esc(v.note||""):'')+'</div>'
    + (host?'<span class="vp-nopreview">'+esc(host)+' · '+tr("open the link to see it")+'</span>':'')+'</div>'+(o.foot||"")+'</div>';
}

Object.assign(UI_ID,{
  "The folder's files show here when it is shared with you, or with anyone who has the link.":"File di folder ini tampil di sini bila folder dibagikan kepada Anda, atau kepada siapa saja yang memiliki tautannya.",
  "open the link to see it":"buka tautannya untuk melihat"
});
</script>
