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

/* WHICH COMMENT BOX (Oct 2026). A project's discussion has a comment box too — this same box, with the same @ picker,
   attachments, links read as their names, pasted pictures and Enter to send. Each box has a key: its task's id, or
   "project:<id>". The box being written in owns the draft (window._cmtDraft, _cmtAtt, _cmtLinks, _cmtMentions and
   S.replyTo); any other box's draft is put aside under its key (cmtDraftSwitch, below) and comes back when that box
   is used again. Pressing or focusing anything in a box makes it the one being written in. */
function cmtIsProjectKey(k){ return /^project:/.test(String(k||"")); }
/* REPLYING WHERE THE COMMENT IS (Oct 2026). Reply opens a box of its own under the comment answered, in its thread,
   where the reply will appear; the box at the bottom is for new comments and no longer says whom it answers. The
   reply box is a box like the others, with the same @ picker, attachments, named links, pasted pictures and
   Enter to send, and its key is its panel's key and the comment it answers: "<task id>#r:<comment id>", or
   "project:<id>#r:<comment id>". Each comment answered keeps its own draft, as each task and project does: one box
   is open at a time in a panel (CMT_REPLY_OPEN), and opening another puts the first one's words aside; they come
   back when that comment's Reply is pressed again. Cancel or Esc lets a reply go. */
var CMT_REPLY_OPEN={};   /* a panel's key → the comment whose reply box is open there */
function cmtReplyKey(base,cid){ return base+"#r:"+cid; }
function cmtKeyBase(k){ return String(k||"").split("#r:")[0]; }
function cmtKeyReply(k){ var s=String(k||""), i=s.indexOf("#r:"); return i<0?null:s.slice(i+3)||null; }
function cmtKeyProject(k){ return cmtIsProjectKey(k)?cmtKeyBase(k).slice(8):null; }
/* a task's own box: the one at the bottom, or the one editing a comment */
function cmtIsTaskBaseKey(k){ return !!k&&!cmtIsProjectKey(k)&&!cmtKeyReply(k); }
function cmtIsInput(el){ return !!(el&&el.classList&&el.classList.contains("cmt-input")); }
function cmtInput(){ var k=typeof CMT_DRAFT_FOR==="undefined"?null:CMT_DRAFT_FOR; if(cmtIsProjectKey(k)||cmtKeyReply(k)){ var list=document.querySelectorAll("textarea.cmt-input"); for(var i=0;i<list.length;i++) if(list[i].getAttribute("data-cmt-key")===k) return list[i]; if(cmtKeyReply(k)) return null; } return document.getElementById("cmtText"); }
function cmtActivate(key){ if(!key||key===CMT_DRAFT_FOR) return; if(S.cmtEdit) cmtEditFinish(); cmtDraftSwitch(key); }
["pointerdown","focusin"].forEach(function(type){ document.addEventListener(type,function(e){ var box=e.target&&e.target.closest?e.target.closest("[data-cmt-key]"):null; if(box) cmtActivate(box.getAttribute("data-cmt-key")); },true); });
/* the box being written in, drawn again */
function cmtBoxRedraw(){ if(cmtIsProjectKey(CMT_DRAFT_FOR)&&typeof pdRedraw==="function") pdRedraw(); else renderDrawer(); }
function cmtAttRemove(i){ (window._cmtAtt||[]).splice(i,1); cmtRedraw(); }
/* a box's draft: the live one for the box being written in, the one put aside for any other */
function cmtDraftOf(key){ var live=key===CMT_DRAFT_FOR||(cmtIsTaskBaseKey(key)&&(!CMT_DRAFT_FOR||cmtIsTaskBaseKey(CMT_DRAFT_FOR))); return live?{text:window._cmtDraft||"",att:(window._cmtAtt=window._cmtAtt||[]),links:window._cmtLinks||[],mentions:window._cmtMentions||[],reply:S.replyTo||null}:(CMT_DRAFTS[key]||cmtDraftEmpty()); }
/* the draft of the box a text field belongs to */
function cmtBoxDraft(ta){ var k=ta&&ta.getAttribute&&ta.getAttribute("data-cmt-key"); return k?cmtDraftOf(k):cmtDraftOf(CMT_DRAFT_FOR); }

/* ---------- the reply box: opened, let go, sent ---------- */
function cmtReplyEmpty(key){ var d=key===CMT_DRAFT_FOR?{text:window._cmtDraft,att:window._cmtAtt}:CMT_DRAFTS[key]; return !d||(!String(d.text||"").trim()&&!(d.att||[]).length); }
/* Reply: the box opens under the comment's thread and takes the typing; another comment's box, if one was open in
   this panel, closes, its words kept for that comment. A comment being edited lets the edit go, as pressing any
   other box does. */
function cmtReplyOpen(base,cid){ if(!base||!cid) return;
  var was=S.cmtEdit; if(was&&typeof cmtEditFinish==="function") cmtEditFinish();
  CMT_REPLY_OPEN[base]=cid; cmtDraftSwitch(cmtReplyKey(base,cid));
  /* an edit let go in the other panel (the task panel over a project's page) is drawn as let go there too */
  if(was&&!!was.project!==cmtIsProjectKey(base)) cmtRedrawFor(was.project?pdKeyOf(was.project):S.drawerTask);
  cmtRedrawFor(base); cmtFocusLive(); }
/* Cancel or Esc: the reply is let go — what was written in it too — and the focus goes back to its Reply button */
function cmtReplyCancel(key){ var base=cmtKeyBase(key), cid=cmtKeyReply(key); if(!cid) return;
  cmtReplyDrop(key); cmtRedrawFor(base); cmtReplyBtnFocus(base,cid); }
/* the panel a box is in, drawn again: a project's discussion, or the task panel */
function cmtRedrawFor(key){ if(cmtIsProjectKey(key)){ if(typeof pdRedraw==="function") pdRedraw(); } else if(S.drawerTask) renderDrawer(); }
function pdKeyOf(pid){ return "project:"+pid; }
/* the box closed and its draft gone, without drawing (a reply sent, a comment removed) */
function cmtReplyDrop(key){ var base=cmtKeyBase(key), cid=cmtKeyReply(key);
  if(CMT_REPLY_OPEN[base]===cid) delete CMT_REPLY_OPEN[base];
  if(CMT_DRAFT_FOR===key){ window._cmtDraft=""; window._cmtAtt=[]; window._cmtLinks=[]; window._cmtMentions=[]; cmtDraftSwitch(base); }
  delete CMT_DRAFTS[key]; }
/* A comment the server refused goes back into its box — the one being written in now, or put aside for it; a reply's
   box opens again under its comment unless another is open there — and never over something written there since. */
function cmtDraftRestore(key,d){ var base=cmtKeyBase(key), cid=cmtKeyReply(key);
  if(cid&&!CMT_REPLY_OPEN[base]) CMT_REPLY_OPEN[base]=cid;
  var live=key===CMT_DRAFT_FOR||(cmtIsTaskBaseKey(key)&&(!CMT_DRAFT_FOR||cmtIsTaskBaseKey(CMT_DRAFT_FOR)));
  if(live){ if(!String(window._cmtDraft||"").trim()&&!(window._cmtAtt||[]).length){ window._cmtDraft=d.text; window._cmtAtt=d.att||[]; window._cmtLinks=d.links||[]; window._cmtMentions=d.mentions||[]; } return; }
  if(cmtReplyEmpty(key)) CMT_DRAFTS[key]={text:d.text,att:d.att||[],links:d.links||[],mentions:d.mentions||[],reply:cid}; }
/* the comment a box answers, as the panel shows it: on show, removed, or on show nowhere (filtered, not loaded) */
function cmtReplyTarget(base,list,all){ var cid=CMT_REPLY_OPEN[base]; if(!cid) return null; var c=byId(list,cid);
  if(!c) return all&&!byId(all,cid)?{cid:cid,gone:true}:null;
  var root=c; for(var hop=0;root.parent&&hop<20;hop++){ var up=byId(list,root.parent); if(!up) break; root=up; }
  return {cid:cid,c:c,root:root.id}; }
/* the focus in the box being written in, at the end of what is in it, the box in sight */
function cmtFocusLive(){ var ta=cmtInput(); if(!ta) return; try{ ta.focus({preventScroll:true}); }catch(e){ ta.focus(); } var n=ta.value.length; try{ ta.setSelectionRange(n,n); }catch(e){}
  var box=ta.closest(".cmt-reply-box")||ta.closest(".composer"); if(box&&box.scrollIntoView) box.scrollIntoView({block:"nearest"}); }
function cmtReplyBtn(base,cid){ var scope=cmtIsProjectKey(base)?document.querySelector("#content .pd-box"):document.getElementById("drawer"); return scope?scope.querySelector('.cmt[data-cid="'+String(cid).replace(/["\\]/g,"")+'"] > div > .acts .cmt-reply-btn'):null; }
function cmtReplyBtnFocus(base,cid){ var b=cmtReplyBtn(base,cid); if(b){ try{ b.focus({preventScroll:true}); }catch(e){ b.focus(); } } }
/* Esc in a reply box lets it go — unless the @ picker is open, which Esc closes first. Also Esc in the box editing a
   comment: the picker's own Esc (above) is the one that closes it, and is marked as used. */
document.addEventListener("keydown",function(e){ if(e.key!=="Escape"||e.defaultPrevented) return; var t=e.target; if(!cmtIsInput(t)||cmtPicker()) return; var k=t.getAttribute("data-cmt-key"); if(!cmtKeyReply(k)) return; e.preventDefault(); e.stopPropagation(); cmtReplyCancel(k); },true);
/* A redraw replaces the Reply button that has the focus — after a reply is sent, or a colleague's change arrives —
   and the focus stays on that button. */
function cmtReplyBtnKeep(root){ var a=document.activeElement; if(!a||!a.classList||!a.classList.contains("cmt-reply-btn")||!root||!root.contains(a)) return null; var c=a.closest(".cmt"); return c?{cid:c.getAttribute("data-cid"),el:a}:null; }
function cmtReplyBtnBack(k,base){ if(!k||(document.activeElement&&document.activeElement!==document.body&&document.activeElement.isConnected&&document.activeElement!==k.el)||k.el.isConnected) return; cmtReplyBtnFocus(base,k.cid); }

function cmtVisibility(){ if(person(ME).stakeholder) return "client"; if(cmtIsProjectKey(CMT_DRAFT_FOR)&&typeof pdBoxVisFor==="function") return pdBoxVisFor(CMT_DRAFT_FOR); return S.commentVis||"internal"; }
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
  var ctx=cmtIsProjectKey(CMT_DRAFT_FOR)&&typeof pdPeople==="function"?{members:pdPeople(cmtKeyProject(CMT_DRAFT_FOR)).filter(cmtMentionable),membersTitle:"On this project"}:{members:cmtTaskPeople(tk),membersTitle:"On this task"};
  CMT_MENTION.open=true; CMT_MENTION.dismissed=false;
  /* _deferred:true opens it now. Pickers normally open a tick later so one opened by a click
     survives that click's own close-everything handler; this one is opened by typing, and the
     tick was a gap in which each further letter opened another picker (closing the last) and
     Enter, finding none, became a new line. */
  entityPicker({_cmt:true,_deferred:true,kind:"person",anchor:msgCaretAnchor(ta),align:"left",initial:q,placeholder:tr("Mention someone…"),context:ctx,
    search:function(query){ return epPersonItems(query,ctx).filter(function(id){ return id!=="@everyone"&&cmtMentionable(id); }); },
    onSelect:function(id){ cmtInsertMention(id); },
    onClose:function(){ CMT_MENTION.open=false; var t=cmtInput(); if(t) t.focus(); }});
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
  var ta=cmtInput(); if(!ta) return;
  ta.focus();
  var c=CMT_MENTION.caret==null?ta.value.length:CMT_MENTION.caret;
  try{ ta.setSelectionRange(c,c); }catch(x){}
});
function cmtInsertMention(id){
  var ta=cmtInput(); if(!ta) return;
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
  var ta=cmtInput(); if(!ta) return;
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
  var ta=e.target; if(!cmtIsInput(ta)) return;
  CMT_MENTION.caret=ta.selectionStart; CMT_MENTION.dismissed=false;
  var at=msgCaretMention(ta), ep=cmtPicker();
  if(at!==null){ if(ep) ep._ep.setQuery(at); else cmtOpenMention(ta,at); }
  else if(ep) epClose();
  cmtMirrorSync(ta);
});
/* Captured before the box's own key handler (Enter sends there), so Enter on "@name" picks a person
   rather than sending the comment. */
document.addEventListener("keydown",function(e){
  var ta=e.target; if(!cmtIsInput(ta)) return;
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
   anything here failed, the text would still be visible as ordinary text.
   The measured font and padding are kept until the window is resized or the look changes (theme, density, font,
   corners, panel position: attributes of <html>), and the scrollbar's width is read on the next frame: reading
   them at every keystroke and every redraw made the browser work out the page's styles and layout there and then,
   each time. (A web font finishing loading changes none of these values, only how the same text is drawn, in the
   box and its layer alike.) */
var CMT_MIRROR_KEYS=["fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","paddingTop","paddingRight","paddingBottom","paddingLeft","borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth","textIndent","wordSpacing"];
var CMT_MIRROR_GEN=0, CMT_MIRROR_CACHE={gen:-1,map:{}};
(function(){ var bump=function(){ CMT_MIRROR_GEN++; };
  window.addEventListener("resize",bump);
  if(typeof MutationObserver!=="undefined") new MutationObserver(bump).observe(document.documentElement,{attributes:true});
})();
function cmtMirrorStyle(ta){
  if(CMT_MIRROR_CACHE.gen!==CMT_MIRROR_GEN) CMT_MIRROR_CACHE={gen:CMT_MIRROR_GEN,map:{}};
  var dr=ta.closest("#drawer"), key=[ta.id,String(ta.className).replace("cmt-mirrored","").trim(),dr?dr.className:"",ta.closest(".cmt-edit-box")?1:0,ta.closest(".pd-box")?1:0].join("|");
  var c=CMT_MIRROR_CACHE.map[key]; if(c) return c;
  var cs=getComputedStyle(ta), v={}; CMT_MIRROR_KEYS.forEach(function(k){ v[k]=cs[k]; });
  return CMT_MIRROR_CACHE.map[key]={v:v,bl:parseFloat(cs.borderLeftWidth)||0,br:parseFloat(cs.borderRightWidth)||0,pr:parseFloat(cs.paddingRight)||0};
}
/* A scrolling box loses its scrollbar's width to the text; the layer, which never scrolls, has to give up the same
   width or its lines wrap in different places. Measured on the next frame, when the page is laid out anyway. */
function cmtMirrorBarSoon(ta,mirror){ if(mirror._cmtBarSoon) return; mirror._cmtBarSoon=true;
  requestAnimationFrame(function(){ mirror._cmtBarSoon=false; var st=mirror._cmtMs; if(!st||!ta.isConnected||!mirror.isConnected) return;
    var bar=ta.offsetWidth-ta.clientWidth-st.bl-st.br; if(!(bar>0)) bar=0;
    if(bar!==mirror._cmtBar){ mirror._cmtBar=bar; mirror.style.paddingRight=bar?(st.pr+bar)+"px":st.v.paddingRight; }
    if(mirror.scrollTop!==ta.scrollTop) mirror.scrollTop=ta.scrollTop; }); }
function cmtMirrorEnsure(ta){
  ta=ta||cmtInput(); if(!ta) return null;
  var wrap=ta.parentNode;
  if(!wrap.classList||!wrap.classList.contains("cmt-ta-wrap")){
    /* a box moved into its wrapper loses the focus: one being typed in keeps it, and its caret (the first letter
       typed in a project's discussion box used to be the only one, the rest typed into nothing) */
    var had=document.activeElement===ta, s0=had?ta.selectionStart:null, s1=had?ta.selectionEnd:null, sd=had?ta.selectionDirection:null;
    wrap=document.createElement("div"); wrap.className="cmt-ta-wrap";
    ta.parentNode.insertBefore(wrap,ta); wrap.appendChild(ta);
    var m=document.createElement("div"); m.className="cmt-ta-mirror"; m.setAttribute("aria-hidden","true");
    wrap.insertBefore(m,ta);
    ta.addEventListener("scroll",function(){ m.scrollTop=ta.scrollTop; });
    if(had&&document.activeElement!==ta){ try{ ta.focus({preventScroll:true}); if(s0!=null) ta.setSelectionRange(s0,s1,sd||"none"); }catch(e){} }
  }
  var mirror=wrap.querySelector(".cmt-ta-mirror"), st=cmtMirrorStyle(ta);
  if(mirror._cmtMs!==st){ CMT_MIRROR_KEYS.forEach(function(k){ mirror.style[k]=st.v[k]; }); mirror._cmtMs=st; mirror._cmtBar=0; }
  cmtMirrorBarSoon(ta,mirror);
  return {ta:ta,mirror:mirror};
}
/* ta: the box (the one being written in when left out); the names are those chosen in that box's draft */
function cmtMirrorSync(ta){
  var x=cmtMirrorEnsure(ta); if(!x) return;
  var text=x.ta.value, html=esc(text), chosen=cmtBoxDraft(x.ta).mentions||[];
  /* only the people chosen from the picker, and only while their name is still written out */
  chosen.map(function(m){ return m.display; }).filter(Boolean).sort(function(a,b){ return b.length-a.length; }).forEach(function(n){
    var e=esc("@"+n).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    html=html.replace(new RegExp(e+"(?=\\s|$|[.,!?;:])","g"),'<span class="msg-mention" data-no-translate>'+esc("@"+n)+'</span>');
  });
  x.mirror.innerHTML=html+(/\n$/.test(text)?"<br>":"")+"&#8203;";
  x.ta.classList.add("cmt-mirrored");
}
/* every comment box in root — the one at the bottom and a reply box, side by side — each with its own layer */
function cmtMirrorAll(root){ if(!root) return; Array.prototype.forEach.call(root.querySelectorAll("textarea.cmt-input"),function(ta){ try{ cmtMirrorSync(ta); }catch(e){} }); }
/* The comment boxes are drawn fresh with each redraw of the drawer; give each its layer each time. A Reply button
   that had the focus has it again. */
(function(){
  if(typeof renderDrawer!=="function") return;
  var base=renderDrawer;
  renderDrawer=function(){
    var dr=document.getElementById("drawer"), keep=cmtReplyBtnKeep(dr);
    var r=base.apply(this,arguments);
    cmtMirrorAll(document.getElementById("drBody"));
    if(keep&&S.drawerTask) cmtReplyBtnBack(keep,S.drawerTask);
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
  /* each named link comes back as the capsule it was written as (src/link-tab.js) */
  var shown=String(text||"").replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)/g,function(m,name,url){ if(!links.some(function(l){ return l.display===name&&l.url===url; })) links.push({display:name,url:url}); return (typeof LINK_CHIP==="string"?LINK_CHIP:"")+name; });
  var mentions=(typeof refMentionIds==="function"?refMentionIds(shown):[]).map(function(id){ return {userId:id,display:person(id).name}; });
  return {text:shown,links:links,mentions:mentions}; }
function cmtEditStart(id){ var tk=S.drawerTask?task(S.drawerTask):null, c=tk&&byId(tk.comments||[],id); if(!c||c.by!==ME) return;
  /* the task's own box takes the edit: a reply being written is put aside for its comment, and comes back after */
  cmtActivate(tk.id);
  if(!S.cmtEdit){ var ta=document.getElementById("cmtText"); S.cmtEditStash={text:ta?ta.value:(window._cmtDraft||""),att:(window._cmtAtt||[]).slice(),links:(window._cmtLinks||[]).slice(),mentions:(window._cmtMentions||[]).slice(),reply:S.replyTo||null}; }
  var shown=cmtEditLoad(c.text||"");
  window._cmtDraft=shown.text; window._cmtLinks=shown.links; window._cmtMentions=shown.mentions; window._cmtAtt=clone(c.attachments||[]); S.replyTo=null;
  S.cmtEdit={task:tk.id,id:id};
  renderDrawer(); cmtEditFocus(); }
function cmtEditFocus(){ setTimeout(function(){ var ta=cmtInput(); if(!ta) return; var box=ta.closest(".composer"); if(box&&box.scrollIntoView) box.scrollIntoView({block:"nearest"});
  ta.focus(); var n=ta.value.length; try{ ta.setSelectionRange(n,n); }catch(e){} if(typeof cmtMirrorSync==="function") try{ cmtMirrorSync(); }catch(e){} },0); }
/* the box back to what was being written in it before the edit */
function cmtEditFinish(){ var st=S.cmtEditStash||{text:"",att:[],links:[],mentions:[],reply:null};
  window._cmtDraft=st.text; window._cmtAtt=st.att; window._cmtLinks=st.links; window._cmtMentions=st.mentions; S.replyTo=st.reply; S.cmtEdit=null; S.cmtEditStash=null; }
function cmtEditCancel(){ var inProject=S.cmtEdit&&S.cmtEdit.project; cmtEditFinish(); if(inProject&&typeof pdRedraw==="function") pdRedraw(); else renderDrawer(); }
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
document.addEventListener("keydown",function(e){ if(e.key!=="Escape"||!S.cmtEdit||e.defaultPrevented) return; var t=e.target; if(!cmtIsInput(t)||cmtPicker()||cmtKeyReply(t.getAttribute("data-cmt-key"))) return; e.preventDefault(); e.stopPropagation(); cmtEditCancel(); },true);
/* leaving the task lets the edit go, and what was being written comes back */
(function(){ if(typeof openTask!=="function") return; var base=openTask; openTask=function(id){ if(S.cmtEdit&&S.cmtEdit.task!==id) cmtEditFinish(); cmtDraftSwitch(id); return base.apply(this,arguments); }; })();
/* A comment being written belongs to its task (Oct 2026): opening another task puts it aside — its words, the
   attachments and names in it, the comment it replies to — and brings back what was being written there, if anything.
   It used to follow the person into every task they opened. */
var CMT_DRAFTS={}, CMT_DRAFT_FOR=null;
function cmtDraftEmpty(){ return {text:"",att:[],links:[],mentions:[],reply:null}; }
/* A box's words are put aside under its key when another box is used, and its draft comes back with it. What a reply
   box answers is its key's; the box at the bottom answers nothing. Nothing written is nothing kept: a reply box
   opened and left empty leaves no draft behind. */
function cmtDraftSwitch(id){ if(!id||CMT_DRAFT_FOR===id) return;
  if(CMT_DRAFT_FOR){ var cur={text:window._cmtDraft||"",att:(window._cmtAtt||[]).slice(),links:(window._cmtLinks||[]).slice(),mentions:(window._cmtMentions||[]).slice(),reply:cmtKeyReply(CMT_DRAFT_FOR)};
    if(cur.text||cur.att.length) CMT_DRAFTS[CMT_DRAFT_FOR]=cur; else delete CMT_DRAFTS[CMT_DRAFT_FOR]; }
  var d=CMT_DRAFTS[id]||cmtDraftEmpty(); delete CMT_DRAFTS[id];
  window._cmtDraft=d.text; window._cmtAtt=d.att; window._cmtLinks=d.links; window._cmtMentions=d.mentions; S.replyTo=cmtKeyReply(id); CMT_DRAFT_FOR=id; }
/* the comment being replied to, kept with the draft of the task being opened (openTask asks) */
function cmtDraftReplyFor(id){ return CMT_DRAFT_FOR===id?(S.replyTo||null):null; }
/* an attachment that finishes uploading after its task was left goes to that task's comment, not this one's */
function cmtDraftAttach(forTask,a){ if(!forTask||!CMT_DRAFT_FOR||forTask===CMT_DRAFT_FOR){ (window._cmtAtt=window._cmtAtt||[]).push(a); return true; } (CMT_DRAFTS[forTask]=CMT_DRAFTS[forTask]||cmtDraftEmpty()).att.push(a); return false; }

Object.assign(UI_ID,{
  "Editing your comment":"Mengedit komentarmu","sends":"mengirim","new line":"baris baru","Edit comment":"Edit komentar","Comment updated":"Komentar diperbarui","Could not save the comment":"Komentar tidak dapat disimpan","saves":"menyimpan","cancels":"membatalkan","Edited":"Diedit",
  "On this task":"Di task ini","On this project":"Di project ini",
  "Internal comments are only visible to the creative team.":"Komentar internal hanya terlihat oleh tim kreatif.",
  "Stakeholder-visible comments can be seen by requesters like Marketing.":"Komentar stakeholder bisa dibaca requester seperti tim Marketing.",
  "Write a comment… type @ to mention someone":"Tulis komentar… ketik @ untuk menyebut seseorang",
  "Write a reply… type @ to mention someone":"Tulis balasan… ketik @ untuk menyebut seseorang",
  "Reply":"Balas","Reply (draft)":"Balas (draft)","Reply to":"Balas","Replying to":"Membalas","Cancel":"Batal","Comment posted":"Komentar terkirim",
  "The comment you were replying to was removed — this will be posted as a comment of its own.":"Komentar yang kamu balas sudah dihapus — ini akan dikirim sebagai komentar baru."
});
</script>
