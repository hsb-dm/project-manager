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
/* Captured before the box's own key handler, so Enter picks a person rather than starting a new
   line, and Ctrl+Enter cannot post while the picker is still open. */
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

Object.assign(UI_ID,{
  "On this task":"Di task ini",
  "Internal comments are only visible to the creative team.":"Komentar internal hanya terlihat oleh tim kreatif.",
  "Stakeholder-visible comments can be seen by requesters like Marketing.":"Komentar stakeholder bisa dibaca peminta seperti tim Marketing.",
  "Write a comment… type @ to mention someone":"Tulis komentar… ketik @ untuk menyebut seseorang"
});
</script>
