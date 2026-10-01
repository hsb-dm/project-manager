<script>
/* AN IMAGE PASTED INTO A BRIEF FIELD OR THE DESCRIPTION.

   src/clipboard.js already routes pasted images to the chat composer, the comment box and the
   upload modals, but it deliberately leaves alone anything being typed into — so a brief field and
   the description did nothing at all. This is the branch it calls for those two ("brief").

   A brief field is a <textarea> and the description is a contenteditable; neither can hold an
   image, and embedding one as a data URL would put the picture inside the task record, which is
   what server/uploads.js exists to prevent. So the image is uploaded the way any attachment is
   (uploadAny, honouring whichever storage the workspace uses) and posted as a comment — that path
   already files every attachment under the task's References too, so one paste lands in both, with
   a note saying which field it came from. The text keeps a marker that reads as a chip opening
   Comments.

   Brief edits in progress are gathered and written with the same change, because adding the
   comment re-renders the drawer and would otherwise discard whatever was being typed. */

var PASTE_MARK_OPEN = "[[img:", PASTE_MARK_CLOSE = "]]";
/* Where the caret is, so the marker lands where the person was typing. */
function pasteInsertInField(el,text){
  if(!el) return;
  if(el.tagName==="TEXTAREA"||el.tagName==="INPUT"){
    var s=el.selectionStart==null?el.value.length:el.selectionStart, t=el.selectionEnd==null?s:el.selectionEnd;
    el.value=el.value.slice(0,s)+text+el.value.slice(t);
    el.selectionStart=el.selectionEnd=s+text.length;
  } else {
    var sel=window.getSelection();
    if(sel&&sel.rangeCount&&el.contains(sel.anchorNode)){
      var r=sel.getRangeAt(0); r.deleteContents(); var n=document.createTextNode(text);
      r.insertNode(n); r.setStartAfter(n); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    } else el.appendChild(document.createTextNode(text));
  }
  el.dispatchEvent(new Event("input",{bubbles:true}));
}
function pasteFieldName(el){
  if(!el||!el.getAttribute) return tr("the brief");
  if(el.id==="descSrc"||(el.closest&&el.closest("#descSrc"))) return tr("the description");
  var k=el.getAttribute("data-bf")||(el.closest&&el.closest("[data-bf]")&&el.closest("[data-bf]").getAttribute("data-bf"));
  if(k){ var f=(WS.briefFields||[]).filter(function(x){ return x[0]===k; })[0]; return f?f[1]:k; }
  return tr("the brief");
}
/* Which field an image belongs to. The description has no data-bf, so it gets its own key. */
var PASTE_DESC_KEY="__description";
function pasteFieldKey(el){
  if(!el||!el.closest) return PASTE_DESC_KEY;
  if(el.id==="descSrc"||el.closest("#descSrc")) return PASTE_DESC_KEY;
  var f=el.closest("[data-bf]");
  return f?f.getAttribute("data-bf"):PASTE_DESC_KEY;
}
/* Brief edits in progress, so adding a comment does not discard them. */
function pasteBriefDraft(){
  var out={}, list=document.querySelectorAll("[data-bf]");
  for(var i=0;i<list.length;i++) out[list[i].getAttribute("data-bf")]=list[i].value;
  return out;
}
/* Returns true when it takes the paste; clipboard.js calls preventDefault on true. */
function briefPasteImage(file){
  if(!file||!/^image\//.test(file.type||"")) return false;
  if(typeof signedIn==="function"&&!signedIn()) return false;
  var tk=S.drawerTask?task(S.drawerTask):null;
  if(!tk||tk._draft) return false;        /* a task that does not exist yet has nowhere to put it */
  var field=document.activeElement;
  if(field&&field.closest&&!field.closest("[data-bf],#descSrc")) field=document.querySelector("[data-bf],#descSrc");
  var label=pasteFieldName(field), key=pasteFieldKey(field), name=file.name||("pasted-"+Date.now()+".png");
  /* Nothing is written into the text. A brief field is a textarea, so any marker put there shows as
     raw characters the moment the field is edited — which is what a pasted image looked like at
     first. The picture is attached to the field instead and drawn underneath it, so the writing
     stays writing and Enter still just starts a new line. */
  var brief=pasteBriefDraft();
  toast(tr("Uploading the pasted image…"));

  uploadAny(file,{forceDrive:true,name:name}).then(function(up){
    editTaskWith(tk,function(t){
      if(t.brief) Object.keys(brief).forEach(function(k){ if(t.brief[k]!==undefined) t.brief[k]=brief[k]; });
      var c=C(ME,0,"internal",tr("Pasted into")+" "+label,null);
      c.attachments=[{id:uid("att"),name:name,type:"image",size:up.size,preview:up.preview||null,url:up.url||"",driveId:up.driveId||null,briefField:key}];
      t.comments.push(c);
      /* Deliberately NOT added to the task's files. Assets & versions is where the work being
         delivered lives; reference material pasted into a brief would blur that line, and the
         count beside the tab would stop meaning "assets produced". The picture lives on the
         comment, which is what the field strip reads. */
      log(t,"comment");
    });
    toast(tr("Image attached"));
  },function(err){
    toast(tr("Could not attach that image")+": "+err.message,"bad");
  });
  return true;
}
/* A marker becomes the picture itself, wherever the text is shown read-only: the brief and the
   description. The marker holds only the file name, so the image is looked up on the task each
   time — that keeps the raw text readable while editing ([[img:moodboard.png]]) instead of burying
   a URL in it, and a picture that was removed degrades to a plain label rather than a broken image. */
function pasteUnesc(s){
  return String(s).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
}
/* The newest attachment with this name: files first, then anything still only on a comment. */
/* Match the attachment id first. A deliverable in Assets can share a file name with a brief
   reference, and opening the wrong one would be worse than opening nothing. The name is only a
   fallback, for markers written before images moved out of the text. */
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
function pasteOpenImage(name){
  var tk=S.drawerTask?task(S.drawerTask):null; if(!tk) return;
  var a=pasteFindImage(tk,name);
  if(!a) return toast(tr("That image is no longer attached to this task"),"bad");
  previewModal({ name:a.name, title:a.name, img:a.preview||"", url:a.url||"", driveId:a.driveId||null });
}
function pasteThumbHtml(name,tk){
  var a=pasteFindImage(tk,name), src=a&&(a.preview||(a.url&&/^\/files\//.test(a.url)?a.url:""));
  var label=esc(name), q=attr(name);
  if(!src) return '<span class="paste-thumb missing" title="'+attr(tr("That image is no longer attached to this task"))+'">'+I.image+label+'</span>';
  return '<button type="button" class="paste-thumb" title="'+q+'" onclick="pasteOpenImage(\''+q+'\')">'
    + '<img src="'+attr(src)+'" alt="'+q+'" loading="lazy">'
    + '<span class="paste-thumb-cap">'+label+'</span></button>';
}
/* Runs over already-escaped or already-rendered HTML, so the name is unescaped before the lookup. */
function pasteMarkersToThumbs(html,tk){
  tk=tk||(S.drawerTask?task(S.drawerTask):null);
  return String(html).replace(/\[\[img:([^\]]{1,180})\]\]/g,function(m,n){ return pasteThumbHtml(pasteUnesc(n),tk); });
}
/* The description renders through descMdHtml, which escapes as it goes, so the swap happens after. */
(function(){
  if(typeof descMdHtml!=="function") return;
  var base=descMdHtml;
  descMdHtml=function(){ return pasteMarkersToThumbs(base.apply(this,arguments)); };
})();
/* ---- images attached to a field, drawn under it ----
   Shown in edit mode and in view mode alike, because they are not part of the text. The file name
   is the tooltip, not a caption: in the writing it is the picture that matters. Removing one is
   where every other attachment is removed, under Assets & versions. */
function pasteFieldImages(tk,key){
  /* The files table has a fixed column list, so a key added to a file record is dropped on save.
     A comment keeps its attachments as JSON, so that is where the field marker lives. */
  var out=[];
  (tk&&tk.comments||[]).forEach(function(c){ (c.attachments||[]).forEach(function(a){ if(a&&a.briefField===key&&(a.preview||a.url)) out.push(a); }); });
  return out;
}
function pasteFieldImagesHtml(tk,key){
  var list=pasteFieldImages(tk,key);
  if(!list.length) return "";
  return '<div class="paste-strip">'+list.map(function(f){
    var src=f.preview||(/^\/files\//.test(f.url||"")?f.url:"");
    var q=attr(f.name||"");
    if(!src) return '<span class="paste-thumb missing" title="'+q+'">'+I.image+esc(f.name||"")+'</span>';
    return '<button type="button" class="paste-thumb" title="'+q+'" onclick="pasteOpenImage(\''+attr(f.id||f.name||"")+'\')"><img src="'+attr(src)+'" alt="'+q+'" loading="lazy"></button>';
  }).join("")+'</div>';
}
/* The description is rendered by v38's descEditorHtml; its images hang below whichever mode it is in. */
(function(){
  if(typeof descEditorHtml!=="function") return;
  var base=descEditorHtml;
  descEditorHtml=function(tk){
    return base.apply(this,arguments)+pasteFieldImagesHtml(tk,PASTE_DESC_KEY);
  };
})();
</script>
