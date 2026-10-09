<script>
/* ASSETS & VERSIONS, SIMPLIFIED.

   The tab reads top to bottom as one story:

   1. the version — one box, always the latest: its preview, its notes, and the one thing to do
      about it now. There is never a second box. When a revision is done the box turns from V1 into
      V2; what was said about V1 is a button away ("View V1 notes"), and V1's files stay where the
      designer keeps them — usually a subfolder of the same link;
   2. Final files — the work being delivered;
   3. From comments — screenshots and links shared while talking about the work. They are kept
      in sight, but they are not deliverables: they do not count in the asset links, the dashboard
      or the export (fileFromComment in src/core.js). Whoever can edit the task can mark one as
      final, for the designer who hands work over in a comment.

   The round trip:
   • the reviewer writes notes on the version — what to change, with a screenshot to show it — and
     sends them back with "Request revision". The notes go into the comments too, as one message,
     and the task moves to the revision stage;
   • the designer ticks the notes off, and "Revised" turns the box into the next version: the same
     link (or a new one), with a clean page of notes. It is not in review until the designer submits
     it, so everyone can see where it stands (avSteps). Rounds are not limited — V2, V3, … V12.
   • a link or a screenshot handed over in a comment can become the next version as it is, from
     its row under Assets ("Use as new version"), without uploading it again.
   Notes replaced the pins dropped on the picture: a pin needs a picture, and most versions are a
   link to a folder, a Doc or a Figma file. The server owns them (sanitizeNotes in server.js). */

/* Drive links filed before their name could be read carry a stand-in ("Google Drive Folder").
   When the tab is opened by someone who can edit the task, those are looked up once and renamed,
   in one save. A name somebody chose is never touched — only the stand-ins. */
var AV_HEALED={};
function avIsStandIn(f){
  if(!f||!f.url||typeof isGoogleLink!=="function"||!isGoogleLink(f.url)) return false;
  var p=detectProvider(f.url); if(!p) return false;
  var s=smartSubtitle(p); return f.name===s||f.name===tr(s);
}
function avHealDriveNames(tk){
  if(!tk||tk._draft||AV_HEALED[tk.id]||!canI.editTask(tk)) return;
  var todo=(tk.files||[]).filter(avIsStandIn); if(!todo.length) return;
  AV_HEALED[tk.id]=true;
  Promise.all(todo.map(function(f){ return driveLinkName(f.url).then(function(n){ return [f.id,n]; }); })).then(function(found){
    var names={}; found.forEach(function(x){ if(x[1]) names[x[0]]=x[1]; });
    if(!Object.keys(names).length) return;
    var live=task(tk.id); if(!live) return;
    editTaskWith(live,function(t){ (t.files||[]).forEach(function(f){ if(names[f.id]&&avIsStandIn(f)) f.name=names[f.id]; }); });
  });
}
function assetsTabSimple(tk){
  var ed=tk._draft||canI.editTask(tk);
  /* a task being created has no versions or comments yet, only reference files */
  if(tk._draft) return '<div class="av-sec">'+filesView(tk,true)+'</div>';
  setTimeout(function(){ avHealDriveNames(tk); },0);
  return avVersionSection(tk,ed)+avFinalFiles(tk,ed)+avCommentFiles(tk,ed)+avCountRow(tk,ed);
}

/* ---------- 1. the version ---------- */
function lastVer(tk){ return tk&&tk.versions&&tk.versions.length?tk.versions[tk.versions.length-1]:null; }
function avVersionSection(tk,ed){
  if(!tk.versions.length) return '<section class="av-sec">'+versionsView(tk)+'</section>';
  var v=lastVer(tk);
  S.drawerVer=v.n; /* versionsView draws curVer(), and the box only ever shows the latest */
  var acts=ed?'<button class="btn sm" onclick="linkDriveVersionModal()">'+(typeof driveIcon==="function"?driveIcon():I.link)+tr("Link from Google Drive")+'</button><button class="btn sm" onclick="linkVersionModal()">'+I.link+tr("Attach link")+'</button><button class="btn sm primary" data-short="'+attr(tr("Upload"))+'" onclick="uploadVersion()">'+I.up+tr("Upload new version")+'</button>':'';
  return '<section class="av-sec av-version">'
    + '<div class="av-head"><h3>'+tr("Version")+' '+v.n+(v.state==="approved"?' · '+tr("Final"):'')+'</h3>'+verStateBadge(tk,v)+'<span class="spacer"></span>'+acts+(verCanDelete(tk,v)?'<button class="iconbtn flat sm av-ver-del" title="'+attr(tr("Delete version"))+'" aria-label="'+attr(tr("Delete version"))+'" onclick="deleteVersion()">'+I.trash+'</button>':'')+'</div>'
    + versionsView(tk,{onlyPreview:true})
    + verNotesHtml(tk,v)
    + avSteps(tk,v)
    + avDecision(tk,v,ed)
    + avEarlierNotes(tk)
    + '</section>';
}
/* A version made by mistake can be deleted: the newest one, while nobody has decided on it (an
   approved or sent-back version is part of the task's history). Whoever can add versions to the task
   can, and so can its reviewers; the server holds the same rule. The file uploaded with it goes too —
   not one that came from a comment, is marked final, or is another version as well. */
function verCanDelete(tk,v){ return !!tk&&!!v&&v===lastVer(tk)&&v.state!=="approved"&&v.state!=="revision"&&((has("upload_file")&&(has("edit_any_task")||teamScoped(tk)||isAssignee(tk,ME)||isReviewer(tk,ME)))||canI.reviewTask(tk)); }
function verOwnFiles(tk,v){ return (tk.files||[]).filter(function(f){ var l=typeof fileLinkedVersions==="function"?fileLinkedVersions(tk,f):[]; return l.length===1&&l[0]===v&&!f.final&&!(typeof fileFromComment==="function"&&fileFromComment(tk,f)); }); }
function verDeletedText(n){ return UI_LANG==="id"?"Versi "+n+" dihapus":"Version "+n+" deleted"; }
function deleteVersion(){
  var tk=task(S.drawerTask), v=lastVer(tk); if(!verCanDelete(tk,v)) return;
  var n=v.n, notes=verNotesOf(v).length, own=verOwnFiles(tk,v);
  confirmModal(tr("Delete Version")+" "+esc(n)+"?",tr("Use this when it was made by mistake.")+" "
    + (notes?notes+" "+tr(notes===1?"note on it is deleted too.":"notes on it are deleted too.")+" ":"")
    + (own.length?tr("Its file is removed from Files too:")+" <b>"+own.map(function(f){ return esc(f.name); }).join(", ")+"</b>. ":"")
    + tr("Earlier versions stay as they are."),function(){
    var now=lastVer(tk); if(!now||now.n!==n||!verCanDelete(tk,now)) return toast(tr("This version changed in the meantime — nothing was deleted."),"bad");
    editTaskWith(tk,function(t){
      var x=t.versions.filter(function(y){ return y.n===n; })[0]; if(!x) return;
      var gone=verOwnFiles(t,x);
      t.files=t.files.filter(function(f){ return gone.indexOf(f)<0; });
      t.versions=t.versions.filter(function(y){ return y!==x; });
      S.drawerVer=t.versions.length?t.versions[t.versions.length-1].n:null;
      log(t,"version_deleted",{v:n});
    }).then(function(saved){ if(saved!==false) toast(verDeletedText(n)); });
  },true);
}
/* Where the version is in its round, so nobody has to guess: ready → submitted for review → the
   reviewer's decision. A version made after a revision is not in review until it is submitted. */
function verStage(tk,v){ return v.state==="approved"||v.state==="revision"?"decided":isReview(tk)?"review":"ready"; }
function verStateBadge(tk,v){
  var st=verStage(tk,v);
  if(st==="decided") return verBadge(v);
  return st==="review"?'<span class="badge review">'+tr("In review")+'</span>':'<span class="badge av-not-sent">'+tr("Not submitted yet")+'</span>';
}
function avSteps(tk,v){
  var st=verStage(tk,v), rev=v.state==="revision";
  var steps=[
    [tr("Version ready"),"done"],
    [tr("Submitted for review"),st==="ready"?"now":"done"],
    [rev?tr("Revision requested"):v.state==="approved"?tr("Approved"):tr("Reviewer's decision"),st==="decided"?(rev?"done bad":"done"):st==="review"?"now":""]
  ];
  return '<ol class="av-steps" aria-label="'+attr(tr("Where this version is"))+'">'+steps.map(function(s){ return '<li class="'+s[1]+'"><i></i><span>'+esc(s[0])+'</span></li>'; }).join("")+'</ol>';
}
/* Who submitted the version for review, and when: the move into the review stage after it was made. */
function verSubmitted(tk,v){
  var since=new Date(v.createdAt||0).getTime()||0, hit=null;
  (tk.activity||[]).forEach(function(a){
    if(a.k!=="moved"||!a.a||stageKind(a.a.to)!=="review") return;
    var t=new Date(a.createdAt||0).getTime(); if(a.createdAt&&t<since) return;
    if(!hit||new Date(a.createdAt||0)>new Date(hit.createdAt||0)) hit=a;
  });
  return hit;
}
/* What can be done about the version now — one line, never a form. */
function avDecision(tk,v,ed){
  if(v.state==="approved"){
    var fin=typeof finalAssetLink==="function"?finalAssetLink(tk):null;
    return '<div class="av-decision ok">'+I.check+'<span>'+tr("Approved by")+' <b>'+esc(person(v.decidedBy||tk.reviewer).name)+'</b> · '+ago(v.decidedAgo!=null?v.decidedAgo:v.ago,v.decidedAt||(v.decidedAgo!=null?null:v.createdAt))+'</span><span class="spacer"></span>'
      + (fin&&fin.url?'<button class="btn sm" onclick="openExternal('+jsq(fin.url)+')">'+I.ext+tr("Open final")+'</button>':'')
      + (canI.reviewTask(tk)&&reviewFlow().reopen?'<button class="btn danger-soft sm" title="'+attr(tr("Something changed? It can still go back for revision."))+'" onclick="startRevision()">'+tr("Request revision")+(verNotesOpen(v).length?' <span class="vn-badge">'+verNotesOpen(v).length+'</span>':'')+'</button>':'')+'</div>';
  }
  if(v.state==="revision"){
    var h='<div class="av-decision rev"><span class="av-rev-ic">↺</span><span class="av-reason"><b>'+tr("Sent back for revision")+'</b>'+(v.decidedBy?' · '+esc(person(v.decidedBy).name):'')+(v.decidedAt?' · '+ago(null,v.decidedAt):'')+'</span><span class="spacer"></span>';
    if(ed) return h+'<button class="btn primary sm" onclick="revisedModal()">'+I.check+tr("Revised")+' → V'+(v.n+1)+'</button></div>';
    var who=assigneesOf(tk).map(function(id){ return person(id).name; }).join(", ");
    return h+(who?'<span class="muted">'+tr("Waiting for")+' <b>'+esc(who)+'</b></span>':'')+'</div>';
  }
  if(isReview(tk)){
    var open=verNotesOpen(v).length, sub=verSubmitted(tk,v);
    var by=sub?'<span class="av-sub">'+tr("Submitted for review by")+' <b>'+esc(person(sub.who).name)+'</b> · '+ago(null,sub.createdAt)+'</span>':'';
    if(canI.reviewTask(tk)) return '<div class="av-decision ask"><span class="av-reason"><b>'+tr("Waiting for your review")+'</b>'+(by?'<br>'+by:'')+'</span><span class="spacer"></span>'
      + '<button class="btn danger-soft sm" onclick="startRevision()">'+tr("Request revision")+(open?' <span class="vn-badge">'+open+'</span>':'')+'</button><button class="btn success sm" onclick="approveTask()">'+I.check+tr("Approve")+'</button></div>';
    var rv=reviewersOf(tk).map(function(id){ return person(id).name; }).join(", ");
    return '<div class="av-decision"><span class="av-reason">'+(rv?tr("Waiting for")+' <b>'+esc(rv)+'</b> '+tr("to review it"):tr("Waiting for review"))+(by?'<br>'+by:'')+'</span></div>';
  }
  /* made, not yet sent: after a revision, the designer says when the new version is ready to look at */
  if(ed) return '<div class="av-decision ready"><span class="av-reason"><b>'+tr("Version")+' '+v.n+' '+tr("is ready")+'</b> — '+tr("submit it for review when you are done.")+'</span><span class="spacer"></span><button class="btn primary sm" onclick="submitReview()">'+tr("Submit for review")+'</button></div>';
  var as=assigneesOf(tk).map(function(id){ return person(id).name; }).join(", ");
  return '<div class="av-decision"><span class="av-reason">'+tr("Not submitted for review yet")+(as?' · '+tr("Waiting for")+' <b>'+esc(as)+'</b>':'')+'</span></div>';
}

/* ---------- the notes on a version ---------- */
function verNotesOpen(v){ return ((v&&v.annots)||[]).filter(function(n){ return n&&!n.done; }); }
/* Pins saved before notes had ids get the id the server reads them with (noteIds in serialize.js). */
function verNotesOf(v){ var l=(v&&v.annots)||[]; l.forEach(function(n,i){ if(n&&!n.id) n.id=String(v.id||("v"+v.n))+"_n"+i; }); return l.filter(function(n){ return n&&typeof n==="object"; }); }
/* An approved version takes no notes — unless someone has started sending it back (a late change),
   or notes written for that are still open. */
var VN_REOPEN="";
function verNotesHtml(tk,v){
  var notes=verNotesOf(v), can=canI.editTask(tk), open=verNotesOpen(v).length, adding=can&&(v.state!=="approved"||VN_REOPEN===tk.id+"#"+v.n||open>0);
  var h='<div class="vn" id="verNotes"><div class="vn-head"><b>'+tr("Notes")+'</b>'+(notes.length?'<span class="vn-count">'+(open?open+' '+tr("to fix"):I.check+tr("all done"))+'</span>':'')+'</div>';
  h+=notes.map(function(n,i){ return verNoteRow(n,i,can); }).join("");
  if(!notes.length) h+='<p class="vn-empty">'+tr(adding?"No notes yet. Write what needs to change — paste or attach a screenshot to show it.":"No notes on this version.")+'</p>';
  if(adding) h+=verNoteComposer(tk,v);
  return h+'</div>';
}
function verNoteRow(n,i,can){
  var mine=can&&(n.by===ME||canI.manageWorkspace());
  return '<div class="vn-row'+(n.done?' done':'')+'" data-nid="'+attr(n.id)+'">'
    + '<button type="button" class="vn-tick" role="checkbox" aria-checked="'+(n.done?"true":"false")+'" aria-label="'+attr(tr(n.done?"Mark as not done":"Mark as done"))+'"'+(can?' onclick="toggleVerNote('+jsq(n.id)+')"':' disabled')+'>'+I.check+'</button>'
    + '<span class="vn-num">'+(i+1)+'</span>'
    + '<div class="vn-body">'+(n.text?'<div class="vn-text">'+esc(n.text)+'</div>':'')
    + (n.img?'<img class="vn-img" src="'+attr(n.img)+'" alt="'+attr(tr("Screenshot"))+'" onclick="verNoteZoom('+jsq(n.id)+')">':'')
    + '<div class="vn-meta">'+esc(first(n.by))+(n.at?' · '+ago(null,n.at):'')+(n.done&&n.doneBy?' · '+tr("done by")+' '+esc(first(n.doneBy)):'')+'</div></div>'
    + (mine?'<button type="button" class="iconbtn flat vn-x" aria-label="'+attr(tr("Remove note"))+'" onclick="removeVerNote('+jsq(n.id)+')">'+I.x+'</button>':'')
    + '</div>';
}
/* The notes of a version, to read: Full view, and an earlier version's notes. */
function verNotesReadHtml(v){
  var notes=verNotesOf(v);
  if(!notes.length) return '<p class="vn-empty">'+tr("No notes on this version.")+'</p>';
  return '<div class="vn vn-read"><div class="vn-head"><b>'+tr("Notes")+'</b></div>'+notes.map(function(n,i){ return verNoteRow(n,i,false); }).join("")+'</div>';
}
function verNoteFind(tk,id){ var hit=null; (tk&&tk.versions||[]).forEach(function(v){ verNotesOf(v).forEach(function(n){ if(n.id===id) hit=n; }); }); return hit; }
function verNoteZoom(id){ var n=verNoteFind(task(S.drawerTask),id); if(n&&n.img) previewModal({title:tr("Screenshot"),name:"note.png",img:n.img}); }
function verNoteEdit(id,fn){
  var tk=task(S.drawerTask); if(!tk) return;
  editTaskWith(tk,function(t){ t.versions.forEach(function(v){ var l=verNotesOf(v); for(var i=0;i<l.length;i++) if(l[i].id===id){ fn(v,l[i],i); return; } }); });
}
function toggleVerNote(id){ verNoteEdit(id,function(v,n){ n.done=!n.done; n.doneBy=n.done?ME:null; n.doneAt=n.done?new Date().toISOString():null; }); }
function removeVerNote(id){ verNoteEdit(id,function(v,n,i){ v.annots.splice(v.annots.indexOf(n),1); }); }

/* Writing a note. What is typed and the picture waiting to go with it outlive a re-render (another
   save, the language switch) as long as it is the same version of the same task. */
var VN_DRAFT={key:"",text:"",img:"",busy:false};
function verNoteComposer(tk,v){
  var k=tk.id+"#"+v.n; if(VN_DRAFT.key!==k) VN_DRAFT={key:k,text:"",img:"",busy:false};
  return '<div class="vn-add"><div class="vn-add-row">'
    + '<textarea id="verNoteText" rows="1" placeholder="'+attr(tr("Add a note — what needs to change?"))+'" oninput="VN_DRAFT.text=this.value;verNoteGrow(this)" onkeydown="verNoteKeydown(event)">'+esc(VN_DRAFT.text)+'</textarea>'
    + '<button type="button" class="iconbtn vn-pic" title="'+attr(tr("Attach a screenshot"))+'" aria-label="'+attr(tr("Attach a screenshot"))+'" onclick="verNotePick()">'+I.image.replace("<svg",'<svg class="i"')+'</button>'
    + '<button type="button" class="btn sm" data-short="'+attr(tr("Add"))+'" onclick="addVerNote()">'+tr("Add note")+'</button></div>'
    + '<div id="verNoteImg">'+verNoteImgHtml()+'</div></div>';
}
function verNoteImgHtml(){
  if(VN_DRAFT.busy) return '<span class="hint">'+tr("Reading the image…")+'</span>';
  if(!VN_DRAFT.img) return "";
  return '<span class="vn-pending"><img src="'+attr(VN_DRAFT.img)+'" alt=""><button type="button" class="vn-pending-x" aria-label="'+attr(tr("Remove image"))+'" onclick="VN_DRAFT.img=\'\';verNoteImgPaint()">'+I.x+'</button></span>';
}
function verNoteImgPaint(){ var el=document.getElementById("verNoteImg"); if(el) el.innerHTML=verNoteImgHtml(); }
function verNoteSetImage(f){
  if(!f||!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)){ toast(tr("Use a PNG, JPG, WebP or GIF image"),"bad"); return false; }
  var key=VN_DRAFT.key; VN_DRAFT.busy=true; verNoteImgPaint();
  shrinkImage(f,1600,1600,function(u){ if(VN_DRAFT.key!==key) return; VN_DRAFT.busy=false; VN_DRAFT.img=u; verNoteImgPaint(); var t=document.getElementById("verNoteText"); if(t) t.focus(); },
    function(){ VN_DRAFT.busy=false; verNoteImgPaint(); toast(tr("Could not read")+" "+f.name,"bad"); });
  return true;
}
function verNotePick(){ var inp=document.getElementById("fileInput"); inp.accept="image/png,image/jpeg,image/webp,image/gif"; inp.multiple=false; inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if(f) verNoteSetImage(f); }; inp.click(); }
function verNoteKeydown(e){ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); addVerNote(); } }
function verNoteGrow(el){ el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,160)+"px"; }
function addVerNote(){
  var tk=task(S.drawerTask), v=lastVer(tk); if(!v) return;
  var el=document.getElementById("verNoteText"), text=(el?el.value:VN_DRAFT.text).trim();
  if(VN_DRAFT.busy) return toast(tr("Wait for the image to finish"),"bad");
  if(!text&&!VN_DRAFT.img){ if(el) el.focus(); return; }
  var img=VN_DRAFT.img, n=v.n;
  VN_DRAFT.text=""; VN_DRAFT.img="";
  editTaskWith(tk,function(t){
    var x=t.versions.filter(function(y){ return y.n===n; })[0]; if(!x) return;
    var note={id:uid("an"),text:text,by:ME,at:new Date().toISOString(),done:false};
    if(img) note.img=img;
    (x.annots=x.annots||[]).push(note); log(t,"note",{v:n});
  }).then(function(saved){
    if(saved===false){ VN_DRAFT.text=text; VN_DRAFT.img=img; renderDrawer(); return false; }
    focusSoon("verNoteText",30);
  });
}
/* a screenshot pasted into the note box goes with the note (src/clipboard.js routes pastes) */
(function(){
  if(typeof clipboardTarget!=="function"||typeof clipboardPasteFiles!=="function") return;
  var baseTarget=clipboardTarget, basePaste=clipboardPasteFiles;
  clipboardTarget=function(e){ var t=e&&e.target; if(t&&t.id==="verNoteText") return "vernote"; return baseTarget.apply(this,arguments); };
  clipboardPasteFiles=function(files,where){
    if(where!=="vernote") return basePaste.apply(this,arguments);
    var img=(files||[]).filter(function(f){ return /^image\//.test(f.type); })[0];
    return img?verNoteSetImage(img):false;
  };
})();

/* ---------- requesting a revision: one press sends it back ---------- */
function stageOfKind(kind){ var id=null; WS.workflow.forEach(function(s){ if(!id&&s.kind===kind) id=s.id; }); return id; }
function revisionStage(){ return stageOfKind("revision")||(WS.workflow.filter(function(s){ return s.kind==="work"; })[0]||WS.workflow[0]).id; }

/* How a review moves a task, as Settings → Automation sets it. Kept with the other automation
   settings (WS.autoHide, saved in the workspace's auto_hide column), under "review". */
var REVIEW_FLOW_DEFAULT={stage:"auto",needNote:false,prio:"keep",reopen:true,autoSubmit:false};
function reviewFlow(){ return Object.assign({},REVIEW_FLOW_DEFAULT,(WS&&WS.autoHide&&WS.autoHide.review)||{}); }
/* the stage "Request revision" moves the task to; null leaves it where it is */
function revisionTarget(){
  var c=reviewFlow(); if(c.stage==="none") return null;
  var s=c.stage!=="auto"?byId(WS.workflow||[],c.stage):null;
  return s&&s.kind!=="closed"?s.id:revisionStage();
}

/* "Request revision", beside the version or in the panel's footer. One press sends the version back
   and the task moves to the revision stage at once. The open notes go with it, and into the comments
   as one message; with none yet, the note box is ready for them. An approved version can be sent back
   the same way when something changes late, and the task opens again. Each of these can be changed
   in Settings → Automation (reviewFlow). */
function startRevision(){
  var tk=task(S.drawerTask), v=lastVer(tk); if(!v) return;
  var cfg=reviewFlow(), approved=v.state==="approved";
  if(approved&&!cfg.reopen) return toast(tr("Approved versions stay approved — this is set in Settings → Automation"),"bad");
  if(S.drawerTab!=="files"){ S.drawerTab="files"; renderDrawer(); }
  var open=verNotesOpen(v);
  if(!open.length&&cfg.needNote){
    if(approved){ VN_REOPEN=tk.id+"#"+v.n; renderDrawer(); }
    toast(tr(approved?"Write what changed — then send it back with Request revision":"Write a note first — say what needs to change"),"bad");
    setTimeout(function(){ var t=document.getElementById("verNoteText"); if(t){ t.scrollIntoView({block:"center"}); t.focus(); } },40);
    return;
  }
  var text=open.length?revisionText(v,open):"", all=verNotesOf(v);
  var att=open.filter(function(n){ return n.img; }).slice(0,10).map(function(n){ return {id:uid("att"),name:"V"+v.n+" · "+tr("note")+" "+(all.indexOf(n)+1)+".png",size:"",type:"image",preview:n.img}; });
  var vis=person(ME).stakeholder?"client":S.commentVis, target=revisionTarget(), n=v.n;
  editTaskWith(tk,function(t){
    var x=t.versions.filter(function(y){ return y.n===n; })[0];
    /* the comment is found again by the reason (revisionTagHtml) */
    x.state="revision"; x.reason=text; x.feedback=text; x.decidedAgo=0; x.decidedBy=ME;
    if(text){ var c=C(ME,0,vis,text); c.attachments=att; t.comments.push(c); }
    if(cfg.prio!=="keep") t.prio=cfg.prio;
    /* a task sent back cannot stay in Done, even when the setting says not to move it */
    var to=target||(isClosed(t)?revisionStage():null);
    if(to&&t.status!==to){ var from=t.status; t.status=to; log(t,"moved",{from:from,to:to}); }
    if(!isClosed(t)) t.completedAt=null;
    log(t,"revision",{v:n}); VN_REOPEN="";
  }).then(function(saved){
    if(saved===false) return false;
    notifyTask("revision",tk);
    var who=assigneesOf(tk).map(first).join(", ")||"—";
    toast((approved?tr("Version")+" "+n+" "+tr("was approved — the task is open again.")+" ":"")+(open.length?tr("Revision request sent to")+" "+who:tr("Sent back for revision")+" — "+tr("add notes so they know what to change.")),"bad");
    if(!open.length) setTimeout(function(){ var f=document.getElementById("verNoteText"); if(f){ f.scrollIntoView({block:"center"}); f.focus(); } },60);
  });
}
/* the message in Comments: the open notes, numbered as they are on the version */
function revisionText(v,open){ var all=verNotesOf(v); return open.map(function(n){ return (all.indexOf(n)+1)+". "+(n.text||tr("See the screenshot")); }).join("\n"); }

/* Settings → Automation: the review flow */
function reviewFlowSettingsHtml(){
  var ed=canI.manageWorkspace(), ro=ed?"":" disabled", c=reviewFlow();
  var auto=revisionStage(), stages=[["auto",tr("The revision stage")+(auto?" ("+stageName(auto)+")":"")]]
    .concat((WS.workflow||[]).filter(function(s){ return !s.hidden&&s.kind!=="closed"; }).map(function(s){ return [s.id,stageName(s.id)]; }))
    .concat([["none",tr("Don't move the task")]]);
  var pick=function(id,label,opts,cur){ return fieldHtml(id,label,selectHtml(id,opts,cur,ro)); };
  return sp("Review & revision",
    '<p class="hint" style="margin-bottom:10px">'+tr("What Request revision and a new version do to a task. Applies to everyone in this workspace.")+'</p>'
    + '<div class="field-row">'+pick("rf_stage","Request revision moves the task to",stages,c.stage)
    + pick("rf_note","Before it is sent back",[["0",tr("Send it at once — notes can follow")],["1",tr("Ask for a note first")]],c.needNote?"1":"0")+'</div>'
    + '<div class="field-row">'+pick("rf_prio","Priority when sent back",[["keep",tr("Keep the task's priority")],["high",tr("Set to High")],["urgent",tr("Set to Urgent")]],c.prio)
    + pick("rf_reopen","Approved versions",[["1",tr("Can still be sent back for revision")],["0",tr("Stay approved")]],c.reopen?"1":"0")+'</div>'
    + pick("rf_submit","A new version (Revised, or from a comment)",[["0",tr("Waits for Submit for review")],["1",tr("Goes to review at once")]],c.autoSubmit?"1":"0"),
    ed?'<button class="btn ghost" onclick="saveReviewFlow(true)">'+I.sync+tr("Reset to default")+'</button><span class="spacer"></span><button class="btn primary" onclick="saveReviewFlow()">'+tr("Save")+'</button>':'',I.sync);
}
function saveReviewFlow(reset){
  var r=reset?clone(REVIEW_FLOW_DEFAULT):{stage:val("rf_stage")||"auto",needNote:val("rf_note")==="1",prio:val("rf_prio")||"keep",reopen:val("rf_reopen")!=="0",autoSubmit:val("rf_submit")==="1"};
  WS.autoHide=Object.assign({},WS.autoHide||{},{review:r});
  saveWS("Automation saved"); if(reset) renderScreen(false);
}
function revisionTagHtml(tk,c){
  var v=(tk&&tk.versions||[]).filter(function(x){ return x.reason&&x.reason===c.text; })[0];
  return v?' <span class="badge revision">'+tr("Revision request")+' · V'+v.n+'</span>':'';
}

/* ---------- revised: the box becomes the next version ----------
   The work usually stays at the same link — the designer updates the file or the folder and keeps
   the earlier round in a subfolder of it — so the link is filled in already. A different link, or
   an uploaded file instead, works too. */
function revisedModal(){
  var tk=task(S.drawerTask), v=lastVer(tk); if(!v) return;
  var n=v.n+1, open=verNotesOpen(v).length, link=/^https:/i.test(v.driveUrl||"")||/^[/]files[/]/.test(v.driveUrl||"")?v.driveUrl:"";
  openModal(tr("Revised")+" → "+tr("Version")+" "+n,
    '<p class="hint" style="margin-bottom:10px">'+(link?tr("Version")+' '+n+' '+tr("uses the same link.")+' '+tr("Keep the earlier files in a subfolder of it so they stay available, or paste a different link."):tr("Paste the link to the revised work, or upload the revised file."))+' '+tr("You submit it for review in the next step.")+'</p>'
    + (open?'<div class="banner warn vn-warn">'+open+' '+tr(open===1?"note is not ticked off yet.":"notes are not ticked off yet.")+'</div>':'')
    + fieldHtml("rvd_url","Link",'<input id="rvd_url" inputmode="url" placeholder="https://" value="'+attr(link)+'">')
    + fieldHtml("rvd_note","What changed (optional)",'<input id="rvd_note" placeholder="'+attr(tr("e.g. Bigger headline, logo moved"))+'">'),
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn" onclick="closeModal();uploadVersion()">'+I.up+tr("Upload a file instead")+'</button><span class="spacer"></span><button class="btn primary" onclick="saveRevised()">'+tr("Create Version")+' '+n+'</button>');
  focusSoon(link?"rvd_note":"rvd_url",40);
}
function saveRevised(){
  var tk=task(S.drawerTask), v=lastVer(tk); if(!v) return;
  var raw=val("rvd_url").trim(), note=val("rvd_note").trim();
  var same=!!raw&&raw===v.driveUrl, url=same?raw:normalizedAttachUrl(raw);
  if(!url) return toast(tr("Paste the link to the revised work, or upload the revised file."),"bad");
  closeModal();
  pushVersionFrom(tk,same?{url:url,driveId:v.driveId||null,img:v.img||""}:{url:url},note);
}
/* The next version, from a link or a stored picture — nothing is uploaded again. It is not in review
   until it is submitted (avDecision), and there is no limit: V2, V3 … as many rounds as it takes. */
function nextVersionNo(tk){ return tk.versions.reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1; }
function pushVersionFrom(tk,src,note){
  var sent=false, n=nextVersionNo(tk), cols=["#7C3AED","#0F766E","#B45309","#1D4ED8","#BE185D"];
  S.drawerVer=n; S.drawerTab="files";
  return editTaskWith(tk,function(t){
    var x=V(n,ME,0,"pending",cols[n%cols.length],note||"");
    if(src.url) x.driveUrl=src.url;
    if(src.img) x.img=src.img;
    if(src.driveId) x.driveId=src.driveId;
    else if(src.url&&isDriveUrl(src.url)){ var id=(src.url.match(/\/d\/([^/?#]+)/)||src.url.match(/folders\/([^/?#]+)/)||[])[1]; if(id) x.driveId=id; }
    t.versions.push(x); log(t,"upload",{v:n});
    /* Settings → Automation can send it to review at once — when the task has a reviewer to send
       it to (a review stage may require one, and the save would be refused) */
    var rs=reviewFlow().autoSubmit?stageOfKind("review"):null;
    if(rs&&t.status!==rs&&reviewersOf(t).length){ var from=t.status; t.status=rs; log(t,"moved",{from:from,to:rs}); sent=true; }
  }).then(function(saved){
    if(saved===false) return false;
    if(sent){ notifyMoved(tk); toast(tr("Version")+" "+n+" "+tr("sent for review")); }
    else toast(tr("Version")+" "+n+" "+tr("is ready")+" — "+tr("submit it for review when you are done."));
    return n;
  });
}

/* ---------- a link from the comments, as the next version ----------
   A designer often hands work over in a comment — a Drive folder, a Figma link, a screenshot.
   Under Assets it can become the next version as it is, without uploading it again. */
function fileVersionSource(f){
  if(!f) return null;
  var url=f.url&&(/^https:/i.test(f.url)||/^[/]files[/]/.test(f.url))?f.url:"";
  var img=f.preview&&/^(data:image\/|[/]files[/])/.test(f.preview)?f.preview:"";
  return url||img?{url:url,img:img,driveId:f.driveId||null}:null;
}
/* the button on a file row, or the version it already is */
function useAsVersionHtml(tk,f){
  var as=typeof fileLinkedVersions==="function"?fileLinkedVersions(tk,f):[];
  if(as.length) return '<span class="badge av-is-ver">'+tr("Version")+' '+as.map(function(v){ return v.n; }).join(", ")+'</span>';
  if(!fileVersionSource(f)||!canI.editTask(tk)) return '';
  return '<button class="btn xs av-use-ver" onclick="useAsVersionModal('+jsq(f.id)+')">'+I.up+tr("Use as new version")+'</button>';
}
function useAsVersionModal(fid){
  var tk=task(S.drawerTask), f=tk&&byId(tk.files||[],fid), src=fileVersionSource(f); if(!src) return;
  var n=nextVersionNo(tk), drive=!!(src.url&&typeof isGoogleLink==="function"&&isGoogleLink(src.url)&&typeof driveIcon==="function");
  openModal(tr("Use as Version")+" "+n,
    '<p class="hint" style="margin-bottom:10px">'+tr("It becomes the next version as it is — nothing is uploaded again. You submit it for review in the next step.")+'</p>'
    + '<div class="av-use-src">'+(src.img&&!src.url?'<span class="fthumb" style="background-image:url('+attr(src.img)+')"></span>':'<span class="ficon ficon-drive">'+(drive?googleIcon(src.url):I.link)+'</span>')+'<div><b>'+esc(f.name)+'</b>'+(src.url?'<span class="mono">'+esc(typeof fileUrlLabel==="function"?fileUrlLabel(src.url):src.url)+'</span>':'')+'</div></div>'
    + fieldHtml("uav_note","What changed (optional)",'<input id="uav_note" placeholder="'+attr(tr("e.g. Bigger headline, logo moved"))+'">'),
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" onclick="saveUseAsVersion('+jsq(fid)+')">'+tr("Create Version")+' '+n+'</button>');
}
/* ---------- a final file, as the final version ----------
   A delivered file under Final files becomes the task's final version in one step: the next version,
   made from the file as it is (nothing is uploaded again), approved by whoever can approve the task —
   or, for someone who cannot, sent to review for the reviewer to approve. */
function useAsFinalHtml(tk,f){
  var as=typeof fileLinkedVersions==="function"?fileLinkedVersions(tk,f):[];
  if(as.length){ var fin=as.filter(function(v){ return v.state==="approved"; })[0]; return '<span class="badge av-is-ver'+(fin?' ok':'')+'">'+tr("Version")+' '+(fin||as[as.length-1]).n+(fin?' · '+tr("Final"):'')+'</span>'; }
  if(!fileVersionSource(f)||!canI.editTask(tk)) return '';
  return '<button class="btn xs av-make-final" onclick="finalVersionModal('+jsq(f.id)+')">'+I.check+tr("Make final version")+'</button>';
}
function finalVersionText(key,n,name,stage){ var id=UI_LANG==="id", q="“"+name+"”";
  return {
    approve:id?q+" menjadi Versi "+n+" dan disetujui sebagai versi final — tanpa upload ulang. Task pindah ke "+stage+".":q+" becomes Version "+n+" and is approved as the final version — nothing is uploaded again. The task moves to "+stage+".",
    review:id?q+" menjadi Versi "+n+" lalu dikirim untuk review — tanpa upload ulang. Reviewer yang menyetujuinya sebagai versi final.":q+" becomes Version "+n+" and goes to review — nothing is uploaded again. The reviewer approves it as the final version.",
    makeFinal:id?"Jadikan Versi "+n+" final":"Make Version "+n+" final",
    addOnly:id?"Tambahkan sebagai Versi "+n+" saja":"Add as Version "+n+" only",
    submit:id?"Buat Versi "+n+" dan kirim untuk review":"Create Version "+n+" and submit for review"
  }[key]; }
function finalVersionModal(fid){
  var tk=task(S.drawerTask), f=tk&&byId(tk.files||[],fid), src=fileVersionSource(f); if(!src) return;
  /* approving needs a reviewer on the task (the workflow asks for one): whoever approves becomes it,
     if they may set one */
  var n=nextVersionNo(tk), can=canI.reviewTask(tk)&&(reviewersOf(tk).length>0||canI.assignTask(tk)), closed=null; WS.workflow.forEach(function(s){ if(!closed&&s.kind==="closed") closed=s.id; });
  var drive=!!(src.url&&typeof isGoogleLink==="function"&&isGoogleLink(src.url)&&typeof googleIcon==="function");
  openModal(tr("Make this the final version?"),
    '<div class="av-use-src">'+(src.img&&!src.url?'<span class="fthumb" style="background-image:url('+attr(src.img)+')"></span>':'<span class="ficon ficon-drive">'+(drive?googleIcon(src.url):I.link)+'</span>')+'<div><b>'+esc(f.name)+'</b>'+(src.url?'<span class="mono">'+esc(typeof fileUrlLabel==="function"?fileUrlLabel(src.url):src.url)+'</span>':'')+'</div></div>'
    + '<p class="hint" style="margin-top:10px">'+esc(finalVersionText(can?"approve":"review",n,f.name,stageName(closed||tk.status)))+'</p>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span>'
    + (can?'<button class="btn" onclick="saveFinalVersion('+jsq(fid)+',false)">'+esc(finalVersionText("addOnly",n))+'</button><button class="btn primary" onclick="saveFinalVersion('+jsq(fid)+',true)">'+I.check+esc(finalVersionText("makeFinal",n))+'</button>'
      :'<button class="btn primary" onclick="saveFinalVersion('+jsq(fid)+',false,true)">'+esc(finalVersionText("submit",n))+'</button>'));
}
function saveFinalVersion(fid,approve,submit){
  var tk=task(S.drawerTask), f=tk&&byId(tk.files||[],fid), src=fileVersionSource(f); closeModal(); if(!src) return;
  pushVersionFrom(tk,src,f.name).then(function(n){
    if(n===false) return;
    if(approve&&canI.reviewTask(tk)){
      if(reviewersOf(tk).length) return approveTask();
      if(!canI.assignTask(tk)) return submitReview();
      return editTaskWith(tk,function(t){ t.reviewer=ME; t.reviewers=[ME]; }).then(function(saved){ if(saved!==false) approveTask(); });
    }
    if(submit&&!isReview(tk)) submitReview();
  });
}
function saveUseAsVersion(fid){
  var tk=task(S.drawerTask), f=tk&&byId(tk.files||[],fid), src=fileVersionSource(f); if(!src) return closeModal();
  var note=val("uav_note").trim(); closeModal();
  pushVersionFrom(tk,src,note||f.name);
}

/* ---------- earlier versions: their notes, a button away ----------
   Rounds are not limited, so past a few the row keeps the latest two and a list of all of them. */
function verNotesLabel(n){ return UI_LANG==="id"?"Lihat catatan V"+n:"View V"+n+" notes"; }
function avEarlierNotes(tk){
  var earlier=tk.versions.slice(0,-1); if(!earlier.length) return "";
  var shown=earlier.length>3?earlier.slice(-2):earlier;
  return '<div class="av-earlier"><span class="hint">'+tr("Earlier versions")+'</span>'+shown.map(function(x){
    var c=verNotesOf(x).length;
    return '<button type="button" class="btn xs ghost" onclick="showVersionNotes('+x.n+')">'+verNotesLabel(x.n)+(c?' <span class="vn-badge">'+c+'</span>':'')+'</button>';
  }).join("")+(earlier.length>3?'<button type="button" class="btn xs" onclick="versionHistoryModal()">'+tr("All versions")+' ('+tk.versions.length+')</button>':'')+'</div>';
}
function versionHistoryModal(){
  var tk=task(S.drawerTask); if(!tk) return;
  var last=lastVer(tk);
  openModal(tr("All versions")+" ("+tk.versions.length+")",'<div class="vh-list">'+tk.versions.slice().reverse().map(function(x){
    var c=verNotesOf(x).length, cur=x===last;
    return '<button type="button" class="vh-row" onclick="'+(cur?'closeModal()':'showVersionNotes('+x.n+',true)')+'"><b>V'+x.n+'</b>'+(cur?verStateBadge(tk,x):verBadge(x))
      + '<span class="vh-meta">'+esc(person(x.by).name)+' · '+ago(x.ago,x.createdAt)+(x.note?' · '+esc(x.note):'')+'</span><span class="spacer"></span><span class="vh-notes">'+c+' '+tr("notes")+'</span></button>';
  }).join("")+'</div>','<span class="spacer"></span><button class="btn primary" onclick="closeModal()">'+tr("Close")+'</button>');
}
function showVersionNotes(n,fromList){
  var tk=task(S.drawerTask); if(!tk) return;
  var v=tk.versions.filter(function(x){ return x.n===n; })[0]; if(!v) return;
  var dec=v.state==="approved"?tr("Approved by")+' <b>'+esc(person(v.decidedBy).name)+'</b>':v.state==="revision"?tr("Sent back for revision")+(v.decidedBy?' · <b>'+esc(person(v.decidedBy).name)+'</b>':''):'';
  openModal(tr("Notes")+" · "+tr("Version")+" "+n,
    '<div class="vn-ver"><div class="vn-ver-meta">'+av(v.by)+'<span>'+esc(person(v.by).name)+' · '+ago(v.ago,v.createdAt)+(v.note?' · '+esc(v.note):'')+'</span></div>'
    + (dec?'<div class="vn-ver-dec">'+verBadge(v)+'<span>'+dec+(v.decidedAt?' · '+ago(null,v.decidedAt):'')+'</span></div>':'')+'</div>'
    + verNotesReadHtml(v),
    (fromList?'<button class="btn ghost" onclick="versionHistoryModal()">← '+tr("All versions")+'</button>':'')+(v.driveUrl?'<button class="btn" onclick="openExternal('+jsq(v.driveUrl)+')">'+I.ext+origLabel(v.driveUrl)+'</button>':'')+'<span class="spacer"></span><button class="btn primary" onclick="closeModal()">'+tr("Close")+'</button>');
}

/* A version can be any HTTPS link — a Figma frame, a Canva design, a Dropbox file — not only a Drive
   file or an upload. A Drive link pasted here takes the Drive route, so it keeps Drive's preview. */
function linkVersionModal(){
  var tk=task(S.drawerTask); if(!tk) return;
  var n=tk.versions.reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1;
  openModal(tr("Attach a link as Version")+" "+n,
    '<p class="hint" style="margin-bottom:10px">'+tr("Paste a link to the work — Figma, Canva, Dropbox, a page — and it becomes the next version, ready for review.")+'</p>'
    + fieldHtml("lv_url",tr("Link"),'<input id="lv_url" inputmode="url" placeholder="https://" oninput="if(typeof linkNameSoon===\'function\')linkNameSoon(\'lv_url\',\'lv_note\',\'lv_hint\')">')
    + fieldHtml("lv_note",tr("Version note (optional)"),'<input id="lv_note" placeholder="'+attr(tr("What changed in this version?"))+'">')
    + '<p class="hint" id="lv_hint" style="min-height:1.3em;margin:-6px 0 0"></p>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" onclick="saveLinkVersion()">'+I.link+tr("Attach as a version")+'</button>');
  focusSoon("lv_url",40);
}
function saveLinkVersion(){
  var url=normalizedAttachUrl(val("lv_url"));
  if(!url) return toast(tr("Use a valid HTTPS link"),"bad");
  var tk=task(S.drawerTask); if(!tk) return;
  var drive=isDriveUrl(url), note=val("lv_note").trim(), host=""; try{ host=new URL(url).hostname.replace(/^www\./,""); }catch(e){}
  var n=tk.versions.reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1;
  var cols=["#7C3AED","#0F766E","#B45309","#1D4ED8","#BE185D"];
  closeModal(); S.drawerVer=n; S.drawerTab="files";
  editTaskWith(tk,function(t){
    var v=V(n,ME,0,"pending",cols[n%cols.length],note||(drive?tr("Linked from Google Drive"):host));
    /* drive_url is the column every version keeps its source address in, Drive or not */
    v.driveUrl=url;
    if(drive){ var id=(url.match(/\/d\/([^/?#]+)/)||url.match(/folders\/([^/?#]+)/)||[])[1]; if(id) v.driveId=id; }
    t.versions.push(v); log(t,"upload",{v:n});
  }).then(function(saved){ if(saved===false) return false; notifyTask("upload",tk); toast(tr("Version")+" "+n+" "+tr("attached")); });
}

/* ---------- 2. final files ---------- */
function avFinalFiles(tk,ed){
  var drive=typeof driveIcon==="function"?driveIcon():I.cloud;
  var rows=[]; (tk.files||[]).forEach(function(f,i){ if(!fileFromComment(tk,f)) rows.push([f,i]); });
  var promoted=commentFileIds(tk);
  var h='<section class="av-sec"><div class="av-head"><h3>'+tr("Final files")+'</h3><span class="cnt">'+rows.length+'</span>'+(ed?'<span class="spacer"></span><button type="button" class="btn xs m-attach" data-menu="" aria-label="'+attr(tr("Add a final file"))+'" onclick="mAttachMenu(this,\'.av-tools\')">'+I.plus+tr("Add")+'</button>':'')+'</div>';
  if(ed) h+='<div class="av-tools"><button class="btn xs" onclick="attachLocal(true)">'+I.up+tr("Upload images")+'</button><button class="btn xs" onclick="attachLocal()">'+I.up+tr("Upload file")+'</button><button class="btn xs" onclick="linkCloudModal(\'task\')">'+drive+tr("Link Google Drive")+'</button><button class="btn xs" onclick="attachTaskLinkModal()">'+I.link+tr("Attach link")+'</button><button class="btn xs" onclick="attachAssetModal()">'+I.assets.replace('class="i"','')+tr("Attach from library")+'</button></div>';
  h+=taskUploadPendingHtml(tk);
  if(!rows.length) return h+'<p class="av-empty">'+tr("No final files yet. Upload the delivered file, link it from Google Drive, or attach any HTTPS link.")+'</p></section>';
  return h+rows.map(function(r){
    var f=r[0], wasComment=promoted.indexOf(f.id)>=0;
    return fileRowHtml(tk,f,r[1],ed,wasComment?{tag:' <span class="badge">'+tr("from a comment")+'</span>',btns:useAsFinalHtml(tk,f)+(ed?'<button class="btn xs ghost" onclick="markFileFinal('+jsq(f.id)+',false)">'+tr("Not final")+'</button>':'')}:{btns:useAsFinalHtml(tk,f)});
  }).join("")+'</section>';
}

/* ---------- 3. from comments ---------- */
function avFileComment(tk,f){
  var hit=null;
  (tk.comments||[]).forEach(function(c){
    if(hit) return;
    var att=(c.attachments||[]).some(function(a){ return a&&((f.url&&a.url===f.url)||(f.preview&&a.preview===f.preview)||(f.driveId&&a.driveId===f.driveId)); });
    if(att||(f.url&&String(c.text||"").indexOf(f.url)>=0)) hit=c;
  });
  return hit;
}
function avCommentFiles(tk,ed){
  var rows=[]; (tk.files||[]).forEach(function(f,i){ if(fileFromComment(tk,f)) rows.push([f,i]); });
  if(!rows.length) return "";
  return '<section class="av-sec av-from-comments"><div class="av-head"><h3>'+tr("From comments")+'</h3><span class="cnt">'+rows.length+'</span></div>'
    + '<p class="av-hint">'+tr("Screenshots and links shared in the comments — references, not delivered work. Mark one as final if it is.")+'</p>'
    + rows.map(function(r){
      var f=r[0], c=avFileComment(tk,f);
      var meta=c?'<span>·</span><span>'+esc(first(c.by))+' '+tr("in a comment")+'</span>':'';
      var btns=useAsVersionHtml(tk,f)+(c?'<button class="btn xs ghost" onclick="avShowComment('+jsq(c.id)+')">'+tr("View comment")+'</button>':'')
        + (ed?'<button class="btn xs" onclick="markFileFinal('+jsq(f.id)+',true)">'+I.check+tr("Mark as final")+'</button>':'');
      return fileRowHtml(tk,f,r[1],ed,{cls:"from-comment",meta:meta,btns:btns});
    }).join("")+'</section>';
}
function markFileFinal(fid,on){
  var tk=task(S.drawerTask); if(!tk) return;
  editTaskWith(tk,function(t){
    t.meta=t.meta||{};
    var l=(t.meta.finalFiles||[]).filter(function(x){ return x!==fid; });
    if(on) l.push(fid);
    t.meta.finalFiles=l;
  }).then(function(saved){ if(saved===false) return false; toast(tr(on?"Marked as a final file":"Moved back to the files from comments")); });
}
/* Open Comments at the comment a file came from, and show which one it is. */
function avShowComment(cid){
  setTab("comments");
  setTimeout(function(){
    var el=document.querySelector('#drawer .cmt[data-cid="'+cid+'"]'); if(!el) return;
    el.scrollIntoView({block:"center",behavior:"smooth"});
    el.classList.add("cmt-flash"); setTimeout(function(){ el.classList.remove("cmt-flash"); },1800);
  },60);
}

/* ---------- the count used by reports ---------- */
function avCountRow(tk,ed){
  var n=assetCount(tk);
  return '<div class="av-count"><span>'+tr("Assets produced")+'</span><span class="hint">'+tr("the number used in reports")+'</span><span class="spacer"></span>'
    + (ed?'<input type="number" min="0" step="1" value="'+n+'" aria-label="'+attr(tr("Assets produced"))+'" onchange="editTask(\'assetCount\',this.value)">':'<b>'+n+'</b>')+'</div>';
}

/* notes in the history */
ATEXT.note="<b>{who}</b> added notes on Version {v}";
ATEXT_ID.note="<b>{who}</b> menambahkan catatan di Versi {v}";
ATEXT.version_deleted="<b>{who}</b> deleted Version {v}";
ATEXT.restored="<b>{who}</b> went back to an earlier point";
ATEXT_ID.restored="<b>{who}</b> mengembalikan ke titik sebelumnya";
ATEXT_ID.version_deleted="<b>{who}</b> menghapus Versi {v}";

Object.assign(UI_ID,{
  "Versions":"Versi",
  "Attach a link as Version":"Lampirkan tautan sebagai Versi",
  "Paste a link to the work — Figma, Canva, Dropbox, a page — and it becomes the next version, ready for review.":"Tempel tautan ke hasil kerja — Figma, Canva, Dropbox, sebuah halaman — dan tautan itu menjadi versi berikutnya, siap ditinjau.",
  "Version note (optional)":"Catatan versi (opsional)",
  "What changed in this version?":"Apa yang berubah di versi ini?",
  "Attach as a version":"Lampirkan sebagai versi",
  "Linked from Google Drive":"Ditautkan dari Google Drive",
  "attached":"terlampir",
  "Display name (optional)":"Nama tampilan (opsional)",
  "Original":"Asli",
  "Open link":"Buka tautan",
  "the title":"judul",
  "the description":"deskripsi",
  "the brief":"brief",
  "the priority":"prioritas",
  "Final files":"File final",
  "From comments":"Dari komentar",
  "Screenshots and links shared in the comments — references, not delivered work. Mark one as final if it is.":"Screenshot dan tautan yang dibagikan di komentar — referensi, bukan hasil kerja yang diserahkan. Tandai sebagai final jika memang final.",
  "in a comment":"di komentar",
  "View comment":"Lihat komentar",
  "Mark as final":"Tandai final",
  "Not final":"Bukan final",
  "from a comment":"dari komentar",
  "Marked as a final file":"Ditandai sebagai file final",
  "Moved back to the files from comments":"Dikembalikan ke file dari komentar",
  "Approved by":"Disetujui oleh",
  "Open final":"Buka file final",
  "Sent back for revision":"Dikembalikan untuk revisi",
  "Waiting for your review":"Menunggu review Anda",
  "Waiting for":"Menunggu",
  "to review it":"untuk meninjaunya",
  "Not in review yet":"Belum masuk tahap review",
  "Link from Google Drive":"Tautkan dari Google Drive",
  "No final files yet. Upload the delivered file, link it from Google Drive, or attach any HTTPS link.":"Belum ada file final. Unggah file yang diserahkan, tautkan dari Google Drive, atau lampirkan tautan HTTPS.",
  "the number used in reports":"angka yang dipakai di laporan",
  "Revision request":"Permintaan revisi",
  "Revision priority":"Prioritas revisi",
  "Send revision request":"Kirim permintaan revisi",
  "Revision request sent to":"Permintaan revisi dikirim ke",
  "Notes":"Catatan",
  "to fix":"perlu diperbaiki",
  "all done":"semua selesai",
  "No notes yet. Write what needs to change — paste or attach a screenshot to show it.":"Belum ada catatan. Tulis apa yang perlu diubah — tempel atau lampirkan screenshot untuk menunjukkannya.",
  "No notes on this version.":"Tidak ada catatan di versi ini.",
  "Mark as done":"Tandai selesai",
  "Mark as not done":"Tandai belum selesai",
  "Screenshot":"Screenshot",
  "done by":"diselesaikan oleh",
  "Remove note":"Hapus catatan",
  "Add a note — what needs to change?":"Tambah catatan — apa yang perlu diubah?",
  "Attach a screenshot":"Lampirkan screenshot",
  "Add note":"Tambah catatan",
  "Reading the image…":"Membaca gambar…",
  "Remove image":"Hapus gambar",
  "Use a PNG, JPG, WebP or GIF image":"Gunakan gambar PNG, JPG, WebP, atau GIF",
  "Wait for the image to finish":"Tunggu gambar selesai dibaca",
  "Write a note first — say what needs to change":"Tulis catatan dulu — apa yang perlu diubah",
  "See the screenshot":"Lihat screenshot",
  "note":"catatan",
  "Revised":"Sudah direvisi",
  "uses the same link.":"memakai tautan yang sama.",
  "Keep the earlier files in a subfolder of it so they stay available, or paste a different link.":"Simpan file versi sebelumnya di subfolder tautan itu agar tetap tersedia, atau tempel tautan lain.",
  "Paste the link to the revised work, or upload the revised file.":"Tempel tautan hasil revisi, atau unggah file hasil revisi.",
  "note is not ticked off yet.":"catatan belum dicentang selesai.",
  "notes are not ticked off yet.":"catatan belum dicentang selesai.",
  "What changed (optional)":"Apa yang berubah (opsional)",
  "e.g. Bigger headline, logo moved":"mis. Headline diperbesar, logo dipindah",
  "Upload a file instead":"Unggah file saja",
  "You submit it for review in the next step.":"Setelah itu, kirim untuk review.",
  "Create Version":"Buat Versi",
  "Not submitted yet":"Belum dikirim",
  "Version ready":"Versi siap",
  "Reviewer's decision":"Keputusan reviewer",
  "Where this version is":"Posisi versi ini",
  "Submitted for review by":"Dikirim untuk review oleh",
  "Waiting for review":"Menunggu review",
  "is ready":"siap",
  "submit it for review when you are done.":"kirim untuk review setelah selesai.",
  "Not submitted for review yet":"Belum dikirim untuk review",
  "Use as new version":"Jadikan versi baru",
  "Use as Version":"Jadikan Versi",
  "It becomes the next version as it is — nothing is uploaded again. You submit it for review in the next step.":"Tautan ini langsung menjadi versi berikutnya — tidak perlu diunggah ulang. Setelah itu, kirim untuk review.",
  "All versions":"Semua versi",
  "Delete version":"Hapus versi",
  "Make final version":"Jadikan versi final",
  "Make this the final version?":"Jadikan versi final?",
  "This version changed in the meantime — nothing was deleted.":"Versi ini berubah sementara itu — tidak ada yang dihapus.",
  "Delete Version":"Hapus Versi",
  "Use this when it was made by mistake.":"Pakai ini kalau versi ini tidak sengaja dibuat.",
  "note on it is deleted too.":"catatan di versi ini ikut terhapus.",
  "notes on it are deleted too.":"catatan di versi ini ikut terhapus.",
  "Its file is removed from Files too:":"File-nya juga dihapus dari File:",
  "Earlier versions stay as they are.":"Versi sebelumnya tetap seperti semula.",
  "notes":"catatan",
  "Earlier versions":"Versi sebelumnya",
  "Approved versions stay approved — this is set in Settings → Automation":"Versi yang sudah disetujui tidak bisa dikembalikan — diatur di Pengaturan → Otomatisasi",
  "was approved — the task is open again.":"sudah disetujui — task dibuka lagi.",
  "add notes so they know what to change.":"tambahkan catatan agar mereka tahu apa yang perlu diubah.",
  "sent for review":"dikirim untuk review",
  "Review & revision":"Review & revisi",
  "What Request revision and a new version do to a task. Applies to everyone in this workspace.":"Apa yang terjadi pada task saat Minta revisi ditekan dan saat versi baru dibuat. Berlaku untuk semua orang di workspace ini.",
  "The revision stage":"Tahap revisi",
  "Don't move the task":"Jangan pindahkan task",
  "Request revision moves the task to":"Minta revisi memindahkan task ke",
  "Before it is sent back":"Sebelum dikembalikan",
  "Send it at once — notes can follow":"Langsung kirim — catatan bisa menyusul",
  "Ask for a note first":"Minta catatan dulu",
  "Priority when sent back":"Prioritas saat dikembalikan",
  "Keep the task's priority":"Tetap seperti prioritas task",
  "Set to High":"Jadikan Tinggi",
  "Set to Urgent":"Jadikan Mendesak",
  "Approved versions":"Versi yang sudah disetujui",
  "Can still be sent back for revision":"Masih bisa dikembalikan untuk revisi",
  "Stay approved":"Tetap disetujui",
  "A new version (Revised, or from a comment)":"Versi baru (Sudah direvisi, atau dari komentar)",
  "Waits for Submit for review":"Menunggu Kirim untuk review",
  "Goes to review at once":"Langsung masuk review",
  "Something changed? It can still go back for revision.":"Ada perubahan? Versi ini masih bisa dikembalikan untuk revisi.",
  "Write what changed — then send it back with Request revision":"Tulis apa yang berubah — lalu kirim lewat Minta revisi",
  "The version and its notes will be removed too.":"Versi dan catatannya juga akan dihapus."
});
</script>

<script>
/* ---------- going back to a point in the history (admins) ----------
   Each entry in a task's Activity (and a project's, in the workspace feed) that the server saved a copy
   for can be gone back to: the admin sees what would change, then the task or project is put back.
   Comments and the history stay; the restore is itself an entry, so it can be undone the same way. */
function canRestoreHistory(){ return API.on&&has("manage_workspace"); }
function restoreButtonHtml(type,id,a){ if(!canRestoreHistory()||!a||!a.id||!a.a||!a.a.snap) return ""; return '<button type="button" class="btn xs ghost act-restore" title="'+attr(tr("Go back to this point"))+'" aria-label="'+attr(tr("Go back to this point"))+'" onclick="event.stopPropagation();restoreFromActivity('+jsq(type)+','+jsq(id)+','+jsq(a.id)+')">↺<span>'+tr("Go back")+'</span></button>'; }
function restoreWhen(iso){ try{ return new Date(iso).toLocaleString(UI_LANG==="id"?"id-ID":"en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){ return iso||""; } }
function restoreNames(ids){ return (ids||[]).filter(Boolean).map(function(x){ return person(x).name; }).join(", ")||"—"; }
function restoreVers(vs){ return (vs||[]).map(function(v){ return "V"+v.n+(v.state==="approved"?" ✓":v.state==="revision"?" ↺":""); }).join(", ")||"—"; }
function restoreDiff(type,cur,doc){
  var out=[], row=function(label,now,then){ if(String(now)===String(then)) return; out.push('<li><b>'+esc(tr(label))+'</b><span class="was">'+esc(now)+'</span><span class="arrow">→</span><span class="becomes">'+esc(then)+'</span></li>'); }, changed=function(label,a,b){ if(JSON.stringify(a||null)!==JSON.stringify(b||null)) out.push('<li><b>'+esc(tr(label))+'</b><span class="becomes">'+esc(tr("goes back to how it was"))+'</span></li>'); };
  if(!doc) return out;
  if(type==="task"){ var c=dTask(cur);
    row("Title",c.title,doc.title); row("Stage",stageName(c.status),stageName(doc.status)); row("Priority",prioL(c.prio),prioL(doc.prio));
    row("Assignees",restoreNames(assigneesOf(c)),restoreNames(doc.assignees&&doc.assignees.length?doc.assignees:[doc.assignee])); row("Reviewers",restoreNames(reviewersOf(c)),restoreNames(doc.reviewers&&doc.reviewers.length?doc.reviewers:[doc.reviewer]));
    /* the stored dates, not the page's day offsets (a task with no due date shows today here) */
    var same=cur._dates&&cur._dates[1]===cur.due&&cur._dates[2]===cur.span;
    row("Due date",(same?cur.dueDate:c.dueDate)||"—",doc.dueDate||"—"); row("Start date",(same?cur._dates[0]:c.startDate)||"—",doc.startDate||"—");
    row("Versions",restoreVers(c.versions),restoreVers(doc.versions)); row("Files",(c.files||[]).length,(doc.files||[]).length);
    changed("Description",c.description,doc.description); changed("Creative brief",c.brief,doc.brief); changed("Tags",c.tags,doc.tags); changed("Labels",c.labels,doc.labels);
  } else {
    row("Name",cur.name,doc.name); row("Status",tr(cur.status||""),tr(doc.status||"")); row("Due date",cur.dueDate||"—",doc.dueDate||"—"); row("Start date",cur.startDate||"—",doc.startDate||"—");
    row("Teams",(cur.teams||[]).map(teamName).join(", ")||"—",(doc.teams||[]).map(teamName).join(", ")||"—");
    changed("Description",cur.description,doc.description); changed("Creative brief",cur.brief,doc.brief); changed("Tags",cur.tags,doc.tags);
  }
  return out;
}
function restoreFromActivity(type,id,actId){
  if(!canRestoreHistory()) return;
  apiFetch("GET","/api/restore/"+type+"/"+encodeURIComponent(id)+"?activity="+encodeURIComponent(actId)).then(function(s){
    var cur=type==="task"?task(id):(typeof project==="function"?project(id):null); if(!cur) return;
    var lines=restoreDiff(type,cur,s.doc);
    openModal(tr("Go back to this point?"),
      '<p class="hint" style="margin-bottom:10px">'+esc(tr(type==="task"?"The task is put back to how it was on":"The project is put back to how it was on"))+' <b>'+esc(restoreWhen(s.takenAt))+'</b>'+(s.by?' · '+esc(person(s.by).name):'')+'</p>'
      +(lines.length?'<div class="restore-head"><span>'+tr("Now")+'</span><span>'+tr("After going back")+'</span></div><ul class="restore-diff">'+lines.join("")+'</ul>':'<p>'+tr("Nothing would change — it is already like this.")+'</p>')
      +'<p class="hint" style="margin-top:10px">'+tr("Comments and the history stay as they are. Going back is recorded too, so it can be undone the same way.")+'</p>',
      '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary"'+(lines.length?'':' disabled')+' onclick="restoreDo('+jsq(type)+','+jsq(id)+','+jsq(actId)+')">↺ '+tr("Go back")+'</button>');
  }).catch(function(e){ toast(e.message,"bad"); });
}
function restoreDo(type,id,actId){
  closeModal();
  apiFetch("POST","/api/restore/"+type+"/"+encodeURIComponent(id),{activityId:actId}).then(function(d){
    if(type==="task"){ var tk=task(id); if(tk) replaceInto(tk,hTask(d)); if(S.drawerTask===id) renderDrawer(); }
    else { if(d.projects) PROJECTS=d.projects.map(hProject); if(d.activity) ACTIVITY=d.activity.map(hAct); }
    AN=null; refresh(); toast(tr("Gone back to the earlier point"));
  }).catch(function(e){ toast(e.message,"bad"); });
}
/* only words not translated already: a common word keeps the translation it has elsewhere */
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"Go back":"Kembalikan","Go back to this point":"Kembalikan ke titik ini","Go back to this point?":"Kembalikan ke titik ini?","The task is put back to how it was on":"Task dikembalikan seperti keadaannya pada","The project is put back to how it was on":"Project dikembalikan seperti keadaannya pada","Now":"Sekarang","After going back":"Setelah dikembalikan","Nothing would change — it is already like this.":"Tidak ada yang berubah — keadaannya sudah seperti ini.","Comments and the history stay as they are. Going back is recorded too, so it can be undone the same way.":"Komentar dan riwayat tetap seperti sekarang. Pengembalian juga tercatat, jadi bisa dibatalkan dengan cara yang sama.","Gone back to the earlier point":"Sudah dikembalikan ke titik sebelumnya","goes back to how it was":"kembali seperti semula","Stage":"Tahap","Assignees":"Assignee","Reviewers":"Reviewer","Due date":"Tenggat","Start date":"Tanggal mulai","Versions":"Versi","Files":"File","Description":"Deskripsi","Creative brief":"Creative brief","Tags":"Tag","Labels":"Label","Name":"Nama","Status":"Status","Teams":"Tim","Title":"Judul","Priority":"Prioritas"});
</script>
