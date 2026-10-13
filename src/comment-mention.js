<script>
/* @MENTIONS IN TASK COMMENTS, THE WAY CHAT DOES THEM.

   Until now a comment only recognised "@" followed by somebody's internal id ("@rina"), which
   nobody knows, so typing "@Anna Wijaya" notified no one and only "@Anna" was drawn in bold. Now,
   as in Messages: typing "@" opens the people picker at the caret, the arrows and Enter (or Tab)
   choose, Esc closes it, the choice is written as "@Full Name", it is coloured while typing, and
   whoever is still named in the text when the comment is posted is notified.

   Two things differ from chat, because a task is not a conversation:
   • people on the task — assignees, reviewers, whoever created it, whoever has commented — are
     listed first, under "On this task";
   • an internal comment cannot be seen by stakeholders, so they are not offered there: mentioning
     them would send a notification about a comment they cannot open.

   The picker, its caret anchor and the "@query" detection are chat's own (src/messages.js,
   src/entity-picker.js); this file only connects them to the comment box. */

window._cmtMentions=window._cmtMentions||[];   /* [{userId, display}] chosen while writing */
var CMT_MENTION={open:false};

function cmtVisibility(){ return person(ME).stakeholder?"client":(S.commentVis||"internal"); }
function cmtMentionable(id){ return !(cmtVisibility()==="internal"&&person(id).stakeholder); }
function cmtTaskPeople(tk){
  var ids=[];
  var add=function(x){ if(x&&x!==ME&&PEOPLE[x]&&ids.indexOf(x)<0) ids.push(x); };
  if(!tk) return ids;
  (typeof assigneesOf==="function"?assigneesOf(tk):[tk.assignee]).forEach(add);
  (typeof reviewersOf==="function"?reviewersOf(tk):[tk.reviewer]).forEach(add);
  add(tk.createdBy);
  (tk.comments||[]).forEach(function(c){ add(c.by); });
  return ids.filter(cmtMentionable);
}
function cmtOpenMention(ta,q){
  var tk=S.drawerTask?task(S.drawerTask):null;
  var ctx={members:cmtTaskPeople(tk),membersTitle:"On this task"};
  CMT_MENTION.open=true; CMT_MENTION.dismissed=false;
  /* _deferred:true opens it now. Pickers normally open a tick later so one opened by a click
     survives that click's own close-everything handler; this one is opened by typing, and the
     tick was a gap in which each further letter opened another picker (closing the last) and
     Enter, finding none, became a new line. */
  entityPicker({_cmt:true,_deferred:true,kind:"person",anchor:msgCaretAnchor(ta),align:"left",initial:q,placeholder:tr("Mention someone…"),context:ctx,
    search:function(query){ return epPersonItems(query,ctx).filter(function(id){ return id!=="@everyone"&&cmtMentionable(id); }); },
    onSelect:function(id){ cmtInsertMention(id); },
    onClose:function(){ CMT_MENTION.open=false; var t=document.getElementById("cmtText"); if(t) t.focus(); }});
  CMT_MENTION.caret=ta.selectionStart;
  var ep=document.getElementById("entityPicker");
  if(ep){ ep.classList.add("ep-mention"); var s=ep.querySelector(".ep-search"); if(s) s.setAttribute("tabindex","-1"); }
}
/* The picker focuses its own search box 10ms after it opens. Here the typing has to stay in the
   comment — otherwise the next letters went into the search box, and Esc reached the drawer and
   closed the task. So whenever that box takes the focus during a comment mention, the focus goes
   straight back, caret where it was. Reacting to the focus, rather than racing the picker's timer
   with one of our own, holds however long the picker takes. */
document.addEventListener("focusin",function(e){
  if(!e.target||!e.target.closest||!e.target.closest("#entityPicker")||!(typeof EP!=="undefined"&&EP.open&&EP.open._cmt)) return;
  var ta=document.getElementById("cmtText"); if(!ta) return;
  ta.focus();
  var c=CMT_MENTION.caret==null?ta.value.length:CMT_MENTION.caret;
  try{ ta.setSelectionRange(c,c); }catch(x){}
});
function cmtInsertMention(id){
  var ta=document.getElementById("cmtText"); if(!ta) return;
  var display=person(id).name;
  var before=ta.value.slice(0,ta.selectionStart).replace(/@[^\s@]*$/,""), after=ta.value.slice(ta.selectionStart);
  ta.value=before+"@"+display+" "+after;
  if(!window._cmtMentions.some(function(x){ return x.userId===id; })) window._cmtMentions.push({userId:id,display:display});
  var p=before.length+display.length+2; ta.setSelectionRange(p,p);
  CMT_MENTION.open=false; epClose(); ta.focus();
  ta.dispatchEvent(new Event("input",{bubbles:true}));
}
/* The @ button beside Post: puts an "@" at the caret, which opens the picker like typing it does. */
function cmtMentionButton(){
  var ta=document.getElementById("cmtText"); if(!ta) return;
  ta.focus();
  var v=ta.value, pos=ta.selectionStart;
  ta.setRangeText((pos>0&&!/\s$/.test(v.slice(0,pos))?" ":"")+"@",pos,pos,"end");
  ta.dispatchEvent(new Event("input",{bubbles:true}));
}

/* ---------- typing in the comment box ----------
   Listened for on the document: the drawer redraws the box often, and a listener on the element
   would be lost each time. */
/* The picker that is actually on the page, if it is this box's. A flag saying "open" is not
   enough: the picker can be taken off the page without its close routine running, and a stale
   flag then let Enter fall through as a new line. */
function cmtPicker(){ var ep=document.getElementById("entityPicker"); return ep&&ep._ep&&typeof EP!=="undefined"&&EP.open&&EP.open._cmt?ep:null; }
document.addEventListener("input",function(e){
  var ta=e.target; if(!ta||ta.id!=="cmtText") return;
  CMT_MENTION.caret=ta.selectionStart; CMT_MENTION.dismissed=false;
  var at=msgCaretMention(ta), ep=cmtPicker();
  if(at!==null){ if(ep) ep._ep.setQuery(at); else cmtOpenMention(ta,at); }
  else if(ep) epClose();
  cmtMirrorSync();
});
/* Captured before the box's own key handler (Enter sends there), so Enter on "@name" picks a person
   rather than sending the comment. */
document.addEventListener("keydown",function(e){
  var ta=e.target; if(!ta||ta.id!=="cmtText") return;
  var ep=cmtPicker(), q=msgCaretMention(ta);
  var stop=function(){ e.preventDefault(); e.stopPropagation(); };
  if(e.key==="Enter"||e.key==="Tab"){
    if(q===null||e.ctrlKey||e.metaKey||e.shiftKey) return;
    /* Enter straight after "@name" chooses that person even if the picker is not there yet or has
       gone — unless it was just dismissed with Esc, in which case Enter is a new line. */
    if(!ep){ if(CMT_MENTION.dismissed) return; cmtOpenMention(ta,q); ep=cmtPicker(); if(!ep) return; }
    /* Choose from what is written, not from what the list last heard: typed quickly, the letters
       after "@" can land before the picker has filtered, and Enter took the first name of the
       unfiltered list. */
    var box=ep.querySelector(".ep-search");
    if(box&&box.value!==q) ep._ep.setQuery(q);
    if(ep._ep.count()){ stop(); ep._ep.choose(); }
    return;
  }
  if(!ep) return;
  if(e.key==="ArrowDown"){ stop(); ep._ep.move(1); }
  else if(e.key==="ArrowUp"){ stop(); ep._ep.move(-1); }
  else if(e.key==="Escape"){ stop(); CMT_MENTION.dismissed=true; epClose(); }
},true);

/* ---------- the mirror: mentions coloured while typing ----------
   A textarea can only hold plain text, so — as in chat — the text is drawn by a layer behind it
   and the textarea's own letters are made transparent, leaving its caret and selection. The layer
   copies the textarea's measured font and padding rather than trusting the stylesheet, so the two
   cannot drift apart. The textarea's letters go transparent only once the layer is in place; if
   anything here failed, the text would still be visible as ordinary text. */
function cmtMirrorEnsure(){
  var ta=document.getElementById("cmtText"); if(!ta) return null;
  var wrap=ta.parentNode;
  if(!wrap.classList||!wrap.classList.contains("cmt-ta-wrap")){
    wrap=document.createElement("div"); wrap.className="cmt-ta-wrap";
    ta.parentNode.insertBefore(wrap,ta); wrap.appendChild(ta);
    var m=document.createElement("div"); m.className="cmt-ta-mirror"; m.setAttribute("aria-hidden","true");
    wrap.insertBefore(m,ta);
    ta.addEventListener("scroll",function(){ m.scrollTop=ta.scrollTop; });
  }
  var mirror=wrap.querySelector(".cmt-ta-mirror"), cs=getComputedStyle(ta);
  ["fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","paddingTop","paddingRight","paddingBottom","paddingLeft","borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth","textIndent","wordSpacing"].forEach(function(k){ mirror.style[k]=cs[k]; });
  /* A scrolling box loses its scrollbar's width to the text; the layer, which never scrolls, has to
     give up the same width or its lines wrap in different places. */
  var bar=ta.offsetWidth-ta.clientWidth-(parseFloat(cs.borderLeftWidth)||0)-(parseFloat(cs.borderRightWidth)||0);
  if(bar>0) mirror.style.paddingRight=((parseFloat(cs.paddingRight)||0)+bar)+"px";
  return {ta:ta,mirror:mirror};
}
function cmtMirrorSync(){
  var x=cmtMirrorEnsure(); if(!x) return;
  var text=x.ta.value, html=esc(text);
  /* only the people chosen from the picker, and only while their name is still written out */
  window._cmtMentions.map(function(m){ return m.display; }).filter(Boolean).sort(function(a,b){ return b.length-a.length; }).forEach(function(n){
    var e=esc("@"+n).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    html=html.replace(new RegExp(e+"(?=\\s|$|[.,!?;:])","g"),'<span class="msg-mention" data-no-translate>'+esc("@"+n)+'</span>');
  });
  x.mirror.innerHTML=html+(/\n$/.test(text)?"<br>":"")+"&#8203;";
  x.mirror.scrollTop=x.ta.scrollTop;
  x.ta.classList.add("cmt-mirrored");
}
/* The comment box is drawn fresh with each redraw of the drawer; give it its layer each time. */
(function(){
  if(typeof renderDrawer!=="function") return;
  var base=renderDrawer;
  renderDrawer=function(){
    var r=base.apply(this,arguments);
    if(document.getElementById("cmtText")) try{ cmtMirrorSync(); }catch(e){}
    return r;
  };
})();

/* ---------- posting ----------
   Who a comment notifies: everyone chosen from the picker whose name is still in the text, plus
   anyone written the old way, as "@id". On an internal comment, nobody who could not read it. */
function cmtMentionIds(text){
  text=String(text||"");
  var out=[];
  var add=function(id){ if(id&&PEOPLE[id]&&id!==ME&&out.indexOf(id)<0&&cmtMentionable(id)) out.push(id); };
  window._cmtMentions.forEach(function(m){ if(text.indexOf("@"+m.display)>=0) add(m.userId); });
  (text.match(/@(\w+)/g)||[]).forEach(function(m){ add(m.slice(1).toLowerCase()); });
  return out;
}
function cmtMentionsReset(){ window._cmtMentions=[]; }

/* ---------- reading a posted comment ----------
   A mention is drawn as the whole name — "@Anna Wijaya", not "@Anna" in bold followed by
   "Wijaya". Names are matched against the people in the workspace, longest first, and only in the
   text between tags, so a link's address is never touched. */
function cmtMentionsHtml(html){
  var names=Object.keys(PEOPLE).map(function(id){ return {id:id,name:person(id).name}; }).filter(function(p){ return p.name; })
    .sort(function(a,b){ return b.name.length-a.name.length; });
  return String(html).split(/(<[^>]+>)/).map(function(part,i){
    if(i%2) return part;   /* a tag */
    names.forEach(function(p){
      var e=esc("@"+p.name).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      part=part.replace(new RegExp("(^|[\\s(])"+e+"(?=\\s|$|[.,!?;:)])","g"),function(m,lead){ return lead+"\u0000"+p.id+"\u0001"; });
    });
    /* the old way, "@id", for comments written before names could be chosen */
    part=part.replace(/(^|[\s(])@(\w+)/g,function(m,lead,id){ return PEOPLE[id.toLowerCase()]?lead+"\u0000"+id.toLowerCase()+"\u0001":m; });
    return part.replace(/\u0000([^\u0001]+)\u0001/g,function(m,id){ return '<span class="msg-mention'+(id===ME?" self":"")+'" data-uid="'+attr(id)+'" role="button" tabindex="0" data-no-translate>@'+esc(person(id).name)+'</span>'; });
  }).join("");
}

/* ---------- editing a comment ----------
   A comment is edited where it is: the comment box — the box it was written in — opens in the comment's place, so
   the @ picker, a link read as its name, the attachments with their remove buttons and the Attach buttons all work
   as they did when it was written. It has Cancel and Save (Ctrl+Enter saves, Esc lets it go). The box at the bottom
   steps aside meanwhile; what was being written in it is put aside and comes back when the edit is saved or let go. Saved, the comment says
   "edited"; whoever the new words name is told; an attachment added that is an asset is filed under Assets &
   versions, as when posting. */
function cmtEditLoad(text){ var links=[];
  var shown=String(text||"").replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)/g,function(m,name,url){ if(!links.some(function(l){ return l.display===name&&l.url===url; })) links.push({display:name,url:url}); return name; });
  var mentions=(typeof refMentionIds==="function"?refMentionIds(shown):[]).map(function(id){ return {userId:id,display:person(id).name}; });
  return {text:shown,links:links,mentions:mentions}; }
function cmtEditStart(id){ var tk=S.drawerTask?task(S.drawerTask):null, c=tk&&byId(tk.comments||[],id); if(!c||c.by!==ME) return;
  if(!S.cmtEdit){ var ta=document.getElementById("cmtText"); S.cmtEditStash={text:ta?ta.value:(window._cmtDraft||""),att:(window._cmtAtt||[]).slice(),links:(window._cmtLinks||[]).slice(),mentions:(window._cmtMentions||[]).slice(),reply:S.replyTo||null}; }
  var shown=cmtEditLoad(c.text||"");
  window._cmtDraft=shown.text; window._cmtLinks=shown.links; window._cmtMentions=shown.mentions; window._cmtAtt=clone(c.attachments||[]); S.replyTo=null;
  S.cmtEdit={task:tk.id,id:id};
  renderDrawer(); cmtEditFocus(); }
function cmtEditFocus(){ setTimeout(function(){ var ta=document.getElementById("cmtText"); if(!ta) return; var box=ta.closest(".composer"); if(box&&box.scrollIntoView) box.scrollIntoView({block:"nearest"});
  ta.focus(); var n=ta.value.length; try{ ta.setSelectionRange(n,n); }catch(e){} if(typeof cmtMirrorSync==="function") try{ cmtMirrorSync(); }catch(e){} },0); }
/* the box back to what was being written in it before the edit */
function cmtEditFinish(){ var st=S.cmtEditStash||{text:"",att:[],links:[],mentions:[],reply:null};
  window._cmtDraft=st.text; window._cmtAtt=st.att; window._cmtLinks=st.links; window._cmtMentions=st.mentions; S.replyTo=st.reply; S.cmtEdit=null; S.cmtEditStash=null; }
function cmtEditCancel(){ cmtEditFinish(); renderDrawer(); }
function cmtEditSave(){ var d=S.cmtEdit, tk=d&&task(d.task), c=tk&&byId(tk.comments||[],d.id), el=document.getElementById("cmtText"); if(!c||!el){ cmtEditCancel(); return; }
  var text=(typeof linkTokensExpand==="function"?linkTokensExpand(el.value,window._cmtLinks):el.value).trim(), att=(window._cmtAtt||[]).slice();
  if(!text&&!att.length) return toast(tr("Write something first"),"bad");
  var key=function(a){ return a?String(a.url||a.preview||a.driveId||(a.ref?a.ref+":"+a.refId:"")||a.name||""):""; };
  var before=c.text||"", beforeKeys=(c.attachments||[]).map(key);
  if(text===before&&JSON.stringify(att.map(key))===JSON.stringify(beforeKeys)){ cmtEditCancel(); return; }
  var added=att.filter(function(a){ return beforeKeys.indexOf(key(a))<0; }), btn=document.querySelector("#drawer .composer .bar .btn.primary"); if(btn) btn.disabled=true;
  var done=function(doc){ if(doc) replaceInto(tk,hTask(doc));
    var was=typeof refMentionIds==="function"?refMentionIds(before):[], tell=(typeof refMentionIds==="function"?refMentionIds(text):[]).filter(function(id){ return id!==ME&&was.indexOf(id)<0&&!(c.vis==="internal"&&person(id).stakeholder); });
    if(tell.length) notify("mention",tell,tk.id);
    cmtEditFinish();
    /* filed under Assets & versions as when posting: what was attached, and the links the new words bring — only
       the new ones, so a link someone took off Assets does not come back with every edit */
    var was=(typeof messageUrls==="function"?messageUrls(before):[]).map(function(x){ return normalizedAttachUrl(x.url); });
    var list=typeof cmtAssetsFrom==="function"&&(!API.on||canI.editTask(tk))?cmtAssetsFrom(added,text).filter(function(a){ return added.indexOf(a)>=0||was.indexOf(a.url)<0; }):[], filed=[];
    if(list.length) editTaskWith(tk,function(t){ filed=cmtFileAssets(t,list); }).then(function(saved){ if(saved!==false&&filed.length&&typeof cmtNameFiledLinks==="function") cmtNameFiledLinks(tk,filed); }); else refresh();
    toast(tr("Comment updated")); };
  if(!API.on){ c.text=text; c.attachments=att; c.editedAt=new Date().toISOString(); return done(null); }
  apiFetch("PUT","/api/tasks/"+encodeURIComponent(tk.id)+"/comments/"+encodeURIComponent(c.id),{text:text,attachments:att}).then(done).catch(function(e){ if(btn) btn.disabled=false; toast(e.message||tr("Could not save the comment"),"bad"); }); }
/* Esc in the box while editing lets the edit go — unless the @ picker is open, which Esc closes first */
document.addEventListener("keydown",function(e){ if(e.key!=="Escape"||!S.cmtEdit) return; var t=e.target; if(!t||t.id!=="cmtText"||cmtPicker()) return; e.preventDefault(); e.stopPropagation(); cmtEditCancel(); },true);
/* leaving the task lets the edit go, and what was being written comes back */
(function(){ if(typeof openTask!=="function") return; var base=openTask; openTask=function(id){ if(S.cmtEdit&&S.cmtEdit.task!==id) cmtEditFinish(); cmtDraftSwitch(id); return base.apply(this,arguments); }; })();
/* A comment being written belongs to its task (Oct 2026): opening another task puts it aside — its words, the
   attachments and names in it, the comment it replies to — and brings back what was being written there, if anything.
   It used to follow the person into every task they opened. */
var CMT_DRAFTS={}, CMT_DRAFT_FOR=null;
function cmtDraftEmpty(){ return {text:"",att:[],links:[],mentions:[],reply:null}; }
function cmtDraftSwitch(id){ if(!id||CMT_DRAFT_FOR===id) return;
  if(CMT_DRAFT_FOR) CMT_DRAFTS[CMT_DRAFT_FOR]={text:window._cmtDraft||"",att:(window._cmtAtt||[]).slice(),links:(window._cmtLinks||[]).slice(),mentions:(window._cmtMentions||[]).slice(),reply:S.replyTo||null};
  var d=CMT_DRAFTS[id]||cmtDraftEmpty(); delete CMT_DRAFTS[id];
  window._cmtDraft=d.text; window._cmtAtt=d.att; window._cmtLinks=d.links; window._cmtMentions=d.mentions; S.replyTo=d.reply; CMT_DRAFT_FOR=id; }
/* the comment being replied to, kept with the draft of the task being opened (openTask asks) */
function cmtDraftReplyFor(id){ return CMT_DRAFT_FOR===id?(S.replyTo||null):null; }
/* an attachment that finishes uploading after its task was left goes to that task's comment, not this one's */
function cmtDraftAttach(forTask,a){ if(!forTask||!CMT_DRAFT_FOR||forTask===CMT_DRAFT_FOR){ (window._cmtAtt=window._cmtAtt||[]).push(a); return true; } (CMT_DRAFTS[forTask]=CMT_DRAFTS[forTask]||cmtDraftEmpty()).att.push(a); return false; }

Object.assign(UI_ID,{
  "Editing your comment":"Mengedit komentarmu","sends":"mengirim","new line":"baris baru","Edit comment":"Edit komentar","Comment updated":"Komentar diperbarui","Could not save the comment":"Komentar tidak dapat disimpan","saves":"menyimpan","cancels":"membatalkan","Edited":"Diedit",
  "On this task":"Di task ini",
  "Internal comments are only visible to the creative team.":"Komentar internal hanya terlihat oleh tim kreatif.",
  "Stakeholder-visible comments can be seen by requesters like Marketing.":"Komentar stakeholder bisa dibaca peminta seperti tim Marketing.",
  "Write a comment… type @ to mention someone":"Tulis komentar… ketik @ untuk menyebut seseorang"
});
</script>
