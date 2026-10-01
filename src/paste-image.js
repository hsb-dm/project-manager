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
  var label=pasteFieldName(field), name=file.name||("pasted-"+Date.now()+".png");
  var marker=PASTE_MARK_OPEN+name+PASTE_MARK_CLOSE;
  pasteInsertInField(field,marker);
  var brief=pasteBriefDraft();
  toast(tr("Uploading the pasted image…"));

  uploadAny(file,{forceDrive:true,name:name}).then(function(up){
    editTaskWith(tk,function(t){
      if(t.brief) Object.keys(brief).forEach(function(k){ if(t.brief[k]!==undefined) t.brief[k]=brief[k]; });
      var c=C(ME,0,"internal",tr("Pasted into")+" "+label,null);
      c.attachments=[{id:uid("att"),name:name,type:"image",size:up.size,preview:up.preview||null,url:up.url||"",driveId:up.driveId||null}];
      t.comments.push(c);
      /* the same record the comment path files under References */
      t.files.push(F(name,"image",up.source||"local",up.size,0,up.url||"",{preview:up.preview||null,driveId:up.driveId||null}));
      log(t,"comment");
    });
    toast(tr("Image attached and added to Comments"));
  },function(err){
    /* take the marker back out: there is nothing for it to point at */
    if(field){ if(field.tagName==="TEXTAREA"||field.tagName==="INPUT") field.value=String(field.value).split(marker).join("");
               else field.textContent=String(field.textContent).split(marker).join(""); }
    toast(tr("Could not attach that image")+": "+err.message,"bad");
  });
  return true;
}
/* In the brief, a marker reads as a chip that opens Comments. */
function pasteMarkersToChips(html){
  return String(html).replace(/\[\[img:([^\]]{1,180})\]\]/g,function(m,n){
    return '<button type="button" class="paste-chip" onclick="pasteOpenComments()" title="'+attr(tr("Open Comments"))+'">'+I.image+esc(n)+'</button>';
  });
}
function pasteOpenComments(){ S.drawerTab="comments"; renderDrawer(); var b=document.getElementById("drBody"); if(b) b.scrollTop=b.scrollHeight; }
</script>
