<script>
/* IMAGES IN A BRIEF OR A DESCRIPTION.

   Two fields, two different things, because they are built differently:

   • The description is a contenteditable (v38's md-wysiwyg), so a picture can sit in the writing
     itself — between two paragraphs, after a bullet, wherever the caret is. It behaves the way a
     picture does in any editor: select it and press Backspace, or drag it somewhere else, and the
     text follows. The Markdown keeps a marker, ![name](zc-att:ID), never the picture: the task
     record must stay free of data URLs (that is what server/uploads.js exists to enforce), and an
     image on Drive resolves through its attachment the same way every other attachment does.

   • A brief field is a <textarea>, which can only hold text. Nothing can be placed inside it, so
     its pictures hang underneath the field instead, as a strip.

   Either way the file is uploaded through uploadAny — honouring whichever storage the workspace
   uses — and kept as a comment attachment, which is the only record that stores attachments as
   JSON and can therefore carry the field marker. Deliberately NOT added to the task's files:
   Assets & versions is where the work being delivered lives, and reference material dropped into a
   brief would stop the count beside that tab meaning "assets produced".

   Images arrive two ways: pasted (src/clipboard.js routes them here) or picked with the toolbar
   button, which is the only way in on a phone. */

/* ---------- looking an image up ---------- */
function pasteUnesc(s){
  return String(s).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
}
/* Match the attachment id first. A deliverable in Assets can share a file name with a brief
   reference, and opening the wrong one would be worse than opening nothing. The name is only a
   fallback, for markers written before images carried ids. */
function pasteFindImage(tk,ref){
  var byId=null, byName=null;
  (tk&&tk.comments||[]).forEach(function(c){ (c.attachments||[]).forEach(function(a){
    if(!a||!(a.preview||a.url)) return;
    if(a.id===ref) byId=a; else if(a.name===ref&&!byName) byName=a;
  }); });
  if(byId) return byId;
  if(byName) return byName;
  var hit=null; (tk&&tk.files||[]).forEach(function(f){ if(f&&f.name===ref&&(f.preview||f.url)) hit=f; });
  return hit;
}
function pasteImgSrc(a){ return a?(a.preview||(/^\/files\//.test(a.url||"")?a.url:"")):""; }
function pasteCurrentTask(){ return S.drawerTask?task(S.drawerTask):null; }
/* The description editor, if it is this task's. An upload can finish after the person has moved to
   another task and opened its editor: that editor is not this task's, and nothing may be read from
   it into this task or written into it from this one (it used to be, both ways). */
function pasteDescEl(tk){ var el=document.getElementById("descSrc"); return el&&tk&&el.getAttribute("data-for")===tk.id?el:null; }

/* ---------- the picture in the writing ---------- */
/* Called by descMdInline for every ![…](…) it finds, in the editor and the read-only view alike. */
/* Pictures whose upload has not answered yet, by the id their marker already uses. The editor is
   rebuilt from the saved text on every change to the task, which happens constantly while someone
   is typing; without this the picture would vanish from the writing and reappear at the end when
   the upload landed. */
var PASTE_INFLIGHT={};
function descImgHtml(ref,alt,srcHint,width){
  var id="", src=srcHint||"", label=pasteUnesc(alt||""), busy=false;
  var w=parseInt(width,10); if(!(w>0&&w<100)) w=0;
  if(/^zc-att:/.test(ref)){
    id=ref.slice(7);
    if(!src){
      var a=pasteFindImage(pasteCurrentTask(),id);
      if(a){ src=pasteImgSrc(a); label=label||a.name||""; }
      else if(PASTE_INFLIGHT[id]){ src=PASTE_INFLIGHT[id].src; label=label||PASTE_INFLIGHT[id].name; busy=true; }
      else return '<span class="desc-img missing" title="'+attr(tr("That image is no longer attached to this task"))+'">'+I.image+esc(label||tr("Image"))+'</span>';
    }
  } else src=src||ref;
  if(!src) return '<span class="desc-img missing">'+I.image+esc(label)+'</span>';
  return '<img class="desc-img'+(busy?" uploading":"")+'" data-zc-att="'+attr(id)+'"'+(w?' data-zc-w="'+w+'" style="width:'+w+'%"':'')
    + ' src="'+attr(src)+'" alt="'+attr(label)+'" loading="lazy">';
}
/* The caret, kept across the file dialog and the upload — both of which take the focus away. */
var PASTE_RANGE=null;
function descKeepCaret(){
  var el=document.getElementById("descSrc"); if(!el) return;
  var sel=window.getSelection();
  PASTE_RANGE=(sel&&sel.rangeCount&&el.contains(sel.anchorNode))?sel.getRangeAt(0).cloneRange():null;
}
/* Puts the picture where the caret was, or at the end when the caret was elsewhere. A paragraph is
   left after it so there is somewhere to keep typing — otherwise an image at the end of the
   writing traps the caret. */
function descInsertImage(html){
  var el=document.getElementById("descSrc"); if(!el) return false;
  el.focus();
  var sel=window.getSelection();
  if(PASTE_RANGE&&el.contains(PASTE_RANGE.startContainer)){ sel.removeAllRanges(); sel.addRange(PASTE_RANGE); }
  else { var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  document.execCommand("insertHTML",false,html+"<p><br></p>");
  PASTE_RANGE=null;
  return true;
}
/* ---------- picking a file ---------- */
function pastePickImage(key){
  var inp=document.createElement("input");
  inp.type="file"; inp.accept="image/*"; inp.style.display="none";
  inp.onchange=function(){ var f=inp.files&&inp.files[0]; inp.remove(); if(f) briefPasteImage(f,{key:key}); };
  document.body.appendChild(inp); inp.click();
}
function descPickImage(){ pastePickImage(PASTE_DESC_KEY); }

/* ---------- which field an image belongs to ---------- */
function pasteFieldName(el){
  if(!el||!el.getAttribute) return tr("the brief");
  if(el.id==="descSrc"||(el.closest&&el.closest("#descSrc"))) return tr("the description");
  var k=el.getAttribute("data-bf")||(el.closest&&el.closest("[data-bf]")&&el.closest("[data-bf]").getAttribute("data-bf"));
  if(k){ var f=(WS.briefFields||[]).filter(function(x){ return x[0]===k; })[0]; return f?f[1]:k; }
  return tr("the brief");
}
/* The description has no data-bf, so it gets its own key. */
var PASTE_DESC_KEY="__description";
function pasteFieldKey(el){
  if(!el||!el.closest) return PASTE_DESC_KEY;
  if(el.id==="descSrc"||el.closest("#descSrc")) return PASTE_DESC_KEY;
  var f=el.closest("[data-bf]");
  return f?f.getAttribute("data-bf"):PASTE_DESC_KEY;
}
function pasteLabelFor(key){
  if(key===PASTE_DESC_KEY) return tr("the description");
  var f=(WS.briefFields||[]).filter(function(x){ return x[0]===key; })[0];
  return f?f[1]:tr("the brief");
}
/* Brief edits in progress, so adding a comment does not discard them. */
function pasteBriefDraft(){
  var out={}, list=document.querySelectorAll("[data-bf]");
  for(var i=0;i<list.length;i++) out[list[i].getAttribute("data-bf")]=list[i].value;
  return out;
}
/* ---------- taking an image in ----------
   Returns true when it takes the paste; clipboard.js calls preventDefault on true. */
function briefPasteImage(file,opts){
  opts=opts||{};
  if(!file||!/^image\//.test(file.type||"")) return false;
  if(typeof signedIn==="function"&&!signedIn()) return false;
  var tk=pasteCurrentTask();
  if(!tk||tk._draft) return false;        /* a task that does not exist yet has nowhere to put it */
  var key=opts.key, field=null;
  if(key===undefined||key===null){
    field=document.activeElement;
    if(field&&field.closest&&!field.closest("[data-bf],#descSrc")) field=document.querySelector("[data-bf],#descSrc");
    key=pasteFieldKey(field);
  }
  var label=field?pasteFieldName(field):pasteLabelFor(key);
  var name=file.name||("pasted-"+Date.now()+".png");
  var attId=uid("att");
  /* The description can hold the picture itself; a brief textarea cannot, so its images hang below
     the field instead. */
  var inline=key===PASTE_DESC_KEY&&!!document.getElementById("descSrc");
  /* The picture goes in where the caret is, now, while the writing around it is still exactly as
     the person left it. Waiting for the upload meant a save could land first, rebuild the editor
     from the saved text, and drop whatever had been typed since. Until the upload answers it is a
     local preview carrying no id, and descHtmlToMd writes nothing for an image without one — so a
     save during the upload cannot put a blob: URL into the task. */
  if(inline){
    if(!PASTE_RANGE) descKeepCaret();
    var tmp=""; try{ tmp=URL.createObjectURL(file); }catch(x){}
    PASTE_INFLIGHT[attId]={src:tmp,name:name};
    descInsertImage(descImgHtml("zc-att:"+attId,name,tmp,PASTE_DEFAULT_WIDTH).replace('class="desc-img"','class="desc-img uploading"'));
  }
  var brief=pasteBriefDraft();
  toast(tr("Uploading the pasted image…"));

  uploadAny(file,{forceDrive:true,name:name}).then(function(up){
    var att={id:attId,name:name,type:"image",size:up.size,preview:up.preview||null,url:up.url||"",driveId:up.driveId||null,briefField:key,pasteAuto:true};
    var md=null;
    if(inline){
      att.inlineIn="description";
      delete PASTE_INFLIGHT[attId];
      var el=pasteDescEl(tk);
      var slot=el&&el.querySelector('img[data-zc-att="'+attId+'"]');
      if(slot){ slot.classList.remove("uploading"); slot.src=pasteImgSrc(att); }
      /* No slot: either the marker is already in the saved text and will draw itself, or the
         person deleted the preview while it was uploading, which is a decision to be respected. */
      else if(el&&(tk.description||"").indexOf("zc-att:"+attId)>=0&&typeof descMdHtml==="function") el.innerHTML=descMdHtml(tk.description);
      if(tmp) try{ URL.revokeObjectURL(tmp); }catch(x){}
      if(el&&typeof descHtmlToMd==="function") md=descHtmlToMd(el.innerHTML);
    }
    editTaskWith(tk,function(t){
      if(t.brief) Object.keys(brief).forEach(function(k){ if(t.brief[k]!==undefined) t.brief[k]=brief[k]; });
      if(md!==null) t.description=md;
      var c=C(ME,0,"internal",tr("Pasted into")+" "+label,null);
      c.attachments=[att];
      t.comments.push(c);
      log(t,"comment");
    });
    toast(tr("Image attached"));
  },function(err){
    delete PASTE_INFLIGHT[attId];
    if(inline){
      var el=pasteDescEl(tk), slot=el&&el.querySelector('img[data-zc-att="'+attId+'"]');
      if(slot) slot.remove();
      /* A save may already have written the marker; nothing will ever resolve it now. */
      if((tk.description||"").indexOf("zc-att:"+attId)>=0) editTaskWith(tk,function(t){ t.description=pasteStripMarker(t.description,attId); });
      if(tmp) try{ URL.revokeObjectURL(tmp); }catch(x){}
    }
    toast(tr("Could not attach that image")+": "+err.message,"bad");
  });
  return true;
}
/* ---------- taking an image out ----------
   Removing means removing: the picture leaves the writing and the comment that carried it goes
   too. Leaving the comment behind would put a picture the person just deleted back in Comments,
   which reads as the delete having failed. A comment someone replied to is kept — a reply is
   somebody else's words, and no delete here may take those away. */
function pasteDropAttachment(t,attId){
  var drop=[];
  (t.comments||[]).forEach(function(c){
    var had=(c.attachments||[]).some(function(a){ return a&&a.id===attId; });
    if(!had) return;
    c.attachments=(c.attachments||[]).filter(function(a){ return !a||a.id!==attId; });
    var auto=!c.attachments.length&&!(t.comments||[]).some(function(x){ return x.parent===c.id; });
    if(auto) drop.push(c.id);
  });
  if(drop.length) t.comments=(t.comments||[]).filter(function(c){ return drop.indexOf(c.id)<0; });
}
function pasteRemoveImage(attId){
  var tk=pasteCurrentTask(); if(!tk) return;
  var a=pasteFindImage(tk,attId);
  confirmModal(tr("Remove this image?"),tr("It is taken out of the brief and out of Comments. Files in Assets & versions are not touched."),function(){
    /* Out of the writing first, so the editor and the saved text agree. */
    var el=pasteDescEl(tk), md=null;
    if(el){
      Array.prototype.forEach.call(el.querySelectorAll('img[data-zc-att="'+attId+'"]'),function(n){ n.remove(); });
      if(typeof descHtmlToMd==="function") md=descHtmlToMd(el.innerHTML);
    }
    editTaskWith(tk,function(t){
      if(md!==null) t.description=md;
      else if(t.description) t.description=pasteStripMarker(t.description,attId);
      pasteDropAttachment(t,attId);
    });
    toast(tr("Image removed"));
  },true);
  return a;
}
function pasteStripMarker(text,attId){
  /* the width suffix, when the reader set one, is part of the marker and goes with it */
  return String(text||"").replace(new RegExp("!\\[[^\\]\\n]*\\]\\(zc-att:"+attId.replace(/[^A-Za-z0-9_.:-]/g,"")+"(?:\\s+=\\s*\\d{1,3}%)?\\)","g"),"").replace(/\n{3,}/g,"\n\n");
}
/* ---------- opening one ---------- */
function pasteOpenImage(ref){
  var tk=pasteCurrentTask(); if(!tk) return;
  var a=pasteFindImage(tk,ref);
  if(!a) return toast(tr("That image is no longer attached to this task"),"bad");
  previewModal({ name:a.name, title:a.name, img:a.preview||"", url:a.url||"", driveId:a.driveId||null });
}
/* ---------- the two buttons on a picture: remove (top right) and resize (bottom right) ----------
   Both float above the page (position:fixed) rather than living inside the editable text, where
   anything placed becomes part of what gets typed over, serialised and undone. That makes them easy
   to strand, so they share ONE record of which picture they belong to, and every handler — hover,
   leave, scroll, redraw — moves or hides both together. Each used to look only at whether the x was
   showing: once the x had scrolled under the header, the resize square was never touched again and
   was left floating over the page with no picture under it. */
var PASTE_TOOLS=null;   /* {img, id} while a picture's buttons are up */
document.addEventListener("click",function(e){
  var img=e.target&&e.target.closest&&e.target.closest("img.desc-img"); if(!img) return;
  var id=img.getAttribute("data-zc-att")||"";
  if(img.closest('[contenteditable="true"]')){ if(id) pasteShowImageX(img,id); return; }
  /* in the read-only view a picture opens full size */
  if(id){ e.preventDefault(); pasteOpenImage(id); }
});
document.addEventListener("mouseover",function(e){
  var img=e.target&&e.target.closest&&e.target.closest('[contenteditable="true"] img.desc-img');
  if(img){ var id=img.getAttribute("data-zc-att")||""; if(id) pasteShowImageX(img,id); }
  if(PASTE_TOOLS&&e.target&&e.target.closest&&e.target.closest(".desc-img-x,.desc-img-size")) clearTimeout(PASTE_TOOLS.t);
});
function pasteImageXEl(){
  var b=document.getElementById("descImgX");
  if(b) return b;
  b=document.createElement("button");
  b.id="descImgX"; b.type="button"; b.className="desc-img-x"; b.innerHTML=I.x;
  b.addEventListener("mousedown",function(e){ e.preventDefault(); });
  b.addEventListener("click",function(e){ e.preventDefault(); e.stopPropagation(); var id=PASTE_TOOLS&&PASTE_TOOLS.id; pasteHideImageX(); if(id) pasteRemoveImage(id); });
  document.body.appendChild(b);
  return b;
}
/* The panel that scrolls says where the buttons may be drawn: a corner that has scrolled out of
   sight takes its button with it, instead of leaving it over the tabs with nothing beneath. */
function pasteToolsClip(img){
  var box=img.closest("#drBody")||img.closest(".dr-body")||img.closest(".drawer")||document.documentElement;
  var r=box.getBoundingClientRect();
  return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};
}
/* The whole button has to be inside, not just its corner — half a button hanging over the header
   is the same bug, only smaller. */
function pastePlaceTool(b,x,y,size,clip){
  if(y<clip.top-2||y+size>clip.bottom+2||x<clip.left-2||x+size>clip.right+2){ b.classList.remove("on"); return false; }
  b.style.left=Math.round(x)+"px";
  b.style.top=Math.round(y)+"px";
  b.classList.add("on");
  return true;
}
function pastePlaceTools(){
  var st=PASTE_TOOLS;
  if(!st||!st.img||!st.img.isConnected||!st.img.closest('[contenteditable="true"]')) return pasteHideImageX();
  var r=st.img.getBoundingClientRect(), clip=pasteToolsClip(st.img);
  pastePlaceTool(pasteImageXEl(),r.right-32,r.top+6,26,clip);
  pastePlaceTool(pasteImageSizeEl(),r.right-28,r.bottom-28,24,clip);
}
function pasteShowImageX(img,id){
  if(!img||!img.isConnected||!img.closest('[contenteditable="true"]')) return pasteHideImageX();
  if(PASTE_TOOLS) clearTimeout(PASTE_TOOLS.t);
  PASTE_TOOLS={img:img,id:id};
  var x=pasteImageXEl(), s=pasteImageSizeEl();
  x.setAttribute("title",tr("Remove this image")); x.setAttribute("aria-label",tr("Remove this image"));
  s.setAttribute("title",tr("Drag to resize — tap to step through sizes")); s.setAttribute("aria-label",tr("Drag to resize — tap to step through sizes"));
  pastePlaceTools();
}
function pasteHideImageX(){
  if(PASTE_SIZING) return;   /* never pull the handle out from under a drag */
  if(PASTE_TOOLS) clearTimeout(PASTE_TOOLS.t);
  PASTE_TOOLS=null;
  ["descImgX","descImgSize"].forEach(function(id){ var b=document.getElementById(id); if(b) b.classList.remove("on"); });
}
/* Leaving the picture hides both, unless the pointer went onto one of its own buttons. */
document.addEventListener("mouseout",function(e){
  if(!PASTE_TOOLS||PASTE_SIZING) return;
  var to=e.relatedTarget;
  if(to&&to.closest&&(to===PASTE_TOOLS.img||to.closest(".desc-img-x,.desc-img-size"))) return;
  clearTimeout(PASTE_TOOLS.t); PASTE_TOOLS.t=setTimeout(pasteHideImageX,180);
});
/* Scrolling moves the picture, so its buttons move with it — or go, once it is out of sight. */
document.addEventListener("scroll",function(){ if(PASTE_TOOLS) pastePlaceTools(); },true);
window.addEventListener("resize",function(){ if(PASTE_TOOLS) pastePlaceTools(); });
/* Redrawing the drawer can swap the editor for the read-only view, where there is nothing to
   remove or resize. */
(function(){
  if(typeof renderDrawer!=="function") return;
  var base=renderDrawer;
  renderDrawer=function(){ pasteHideImageX(); return base.apply(this,arguments); };
})();

/* ---------- how big the picture is ----------
   A picture arrives at a quarter of the column: big enough to recognise, small enough that a
   screenshot of one button does not take over the brief. Drag the corner to set it, as a percentage
   of the writing — a percentage, not pixels, so it keeps its proportions on a phone, in a wider
   panel and in a printed brief. A tap with no drag steps up through the usual sizes instead, since
   there is no comfortable way to drag a corner on a touch screen. */
var PASTE_DEFAULT_WIDTH=25;
var PASTE_SIZES=[25,50,75,100];
/* A diagonal double arrow: the conventional sign for "drag this corner". */
var PASTE_RESIZE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>';
function pasteImageSizeEl(){
  var b=document.getElementById("descImgSize");
  if(b) return b;
  b=document.createElement("button");
  b.id="descImgSize"; b.type="button"; b.className="desc-img-size"; b.innerHTML=PASTE_RESIZE_ICON;
  b.addEventListener("mousedown",function(e){ e.preventDefault(); });
  b.addEventListener("pointerdown",pasteSizeStart);
  document.body.appendChild(b);
  return b;
}
function pasteImageWidth(img){
  var w=parseInt(img.getAttribute("data-zc-w")||"",10);
  if(w>0) return w;
  return /%$/.test(img.style.width||"")?parseInt(img.style.width,10):100;
}
/* Full width is written as no width at all, so the Markdown of a full-width picture stays plain. */
function pasteSetImageWidth(img,pct){
  pct=Math.max(15,Math.min(100,Math.round(pct)));
  if(pct>=100){ img.removeAttribute("data-zc-w"); img.style.width=""; }
  else { img.setAttribute("data-zc-w",pct); img.style.width=pct+"%"; }
  return pct;
}
var PASTE_SIZING=null;
function pasteSizeStart(e){
  var img=PASTE_TOOLS&&PASTE_TOOLS.img;
  if(!img||!img.isConnected||!img.closest('[contenteditable="true"]')) return;
  e.preventDefault(); e.stopPropagation();
  var host=img.closest('[contenteditable="true"]');
  PASTE_SIZING={img:img,left:img.getBoundingClientRect().left,hostW:host.getBoundingClientRect().width||1,moved:false,x0:e.clientX};
  try{ e.target.setPointerCapture(e.pointerId); }catch(x){}
  document.addEventListener("pointermove",pasteSizeMove);
  document.addEventListener("pointerup",pasteSizeEnd);
  document.addEventListener("pointercancel",pasteSizeEnd);
  document.body.classList.add("paste-resizing");
}
function pasteSizeMove(e){
  var st=PASTE_SIZING; if(!st) return;
  if(Math.abs(e.clientX-st.x0)>3) st.moved=true;
  if(!st.moved) return;
  st.pct=pasteSetImageWidth(st.img,((e.clientX-st.left)/st.hostW)*100);
  pastePlaceTools();
}
function pasteSizeEnd(){
  document.removeEventListener("pointermove",pasteSizeMove);
  document.removeEventListener("pointerup",pasteSizeEnd);
  document.removeEventListener("pointercancel",pasteSizeEnd);
  document.body.classList.remove("paste-resizing");
  var st=PASTE_SIZING; PASTE_SIZING=null;
  if(!st) return;
  if(!st.moved){
    var now=pasteImageWidth(st.img), next=PASTE_SIZES[0];
    for(var i=0;i<PASTE_SIZES.length;i++) if(Math.abs(PASTE_SIZES[i]-now)<4){ next=PASTE_SIZES[(i+1)%PASTE_SIZES.length]; break; }
    st.pct=pasteSetImageWidth(st.img,next);
  }
  pastePlaceTools();
  if(typeof descSaveNow==="function") descSaveNow();
  if(st.pct) toast(st.pct+"%");
}

/* ---------- a brief field's images, drawn under it ----------
   A textarea cannot hold a picture, so these hang below the field in both edit and view mode. The
   file name is the tooltip, not a caption: in the writing it is the picture that matters. */
function pasteFieldImages(tk,key){
  /* The files table has a fixed column list, so a key added to a file record is dropped on save.
     A comment keeps its attachments as JSON, so that is where the field marker lives. */
  var out=[];
  (tk&&tk.comments||[]).forEach(function(c){ (c.attachments||[]).forEach(function(a){ if(a&&a.briefField===key&&(a.preview||a.url)) out.push(a); }); });
  return out;
}
function pasteThumbHtml(a){
  var src=pasteImgSrc(a), q=attr(a.name||""), id=attr(a.id||a.name||"");
  if(!src) return '<span class="paste-thumb missing" title="'+q+'">'+I.image+esc(a.name||"")+'</span>';
  return '<span class="paste-thumb-wrap">'
    + '<button type="button" class="paste-thumb" title="'+q+'" onclick="pasteOpenImage(\''+id+'\')"><img src="'+attr(src)+'" alt="'+q+'" loading="lazy"></button>'
    + '<button type="button" class="paste-thumb-x" title="'+attr(tr("Remove this image"))+'" aria-label="'+attr(tr("Remove this image"))+'" onclick="pasteRemoveImage(\''+id+'\')">'+I.x+'</button></span>';
}
function pasteFieldImagesHtml(tk,key){
  var list=pasteFieldImages(tk,key), edit=!!S.briefEdit&&key!==PASTE_DESC_KEY&&(tk._draft||canI.editTask(tk));
  if(!list.length&&!edit) return "";
  return '<div class="paste-strip">'+list.map(pasteThumbHtml).join("")
    + (edit?'<button type="button" class="paste-add" onclick="pastePickImage('+jsq(key)+')">'+I.image+'<span>'+esc(tr("Add image"))+'</span></button>':"")
    + '</div>';
}
/* Images pasted into the description before it could hold them are still filed against it. They
   are shown below the editor unless the writing already points at them, so nothing that was
   attached once quietly disappears. */
function pasteLegacyDescHtml(tk){
  var txt=(tk&&tk.description)||"";
  var list=pasteFieldImages(tk,PASTE_DESC_KEY).filter(function(a){ return txt.indexOf("zc-att:"+a.id)<0; });
  if(!list.length) return "";
  return '<div class="paste-strip">'+list.map(pasteThumbHtml).join("")+'</div>';
}
(function(){
  if(typeof descEditorHtml!=="function") return;
  var base=descEditorHtml;
  descEditorHtml=function(tk){ return base.apply(this,arguments)+pasteLegacyDescHtml(tk); };
})();

/* Briefs written by an earlier version carry [[img:name]] in the text. Nothing writes those any
   more, but a task saved then would otherwise show the raw characters. */
function pasteMarkersToThumbs(html,tk){
  tk=tk||pasteCurrentTask();
  return String(html).replace(/\[\[img:([^\]]{1,180})\]\]/g,function(m,n){
    var a=pasteFindImage(tk,pasteUnesc(n));
    return a?pasteThumbHtml(a):'<span class="paste-thumb missing">'+I.image+esc(pasteUnesc(n))+'</span>';
  });
}

Object.assign(UI_ID,{
  "Insert image":"Sisipkan gambar",
  "Add image":"Tambah gambar",
  "Remove this image":"Hapus gambar ini",
  "Remove this image?":"Hapus gambar ini?",
  "It is taken out of the brief and out of Comments. Files in Assets & versions are not touched.":"Gambar ini dikeluarkan dari brief dan dari Komentar. File di Aset & versi tidak tersentuh.",
  "Image removed":"Gambar dihapus",
  "Image attached":"Gambar terlampir",
  "Image":"Gambar",
  "Drag to resize — tap to step through sizes":"Tarik untuk mengubah ukuran — ketuk untuk berganti ukuran",
  "Hide the task details so the tab has room":"Sembunyikan detail task agar isi tab lebih lega",
  "Show the task details again":"Tampilkan lagi detail task",
  "Auto-expand":"Auto perbesar"
});
</script>
