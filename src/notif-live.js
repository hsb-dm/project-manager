<script>
/* ============================================================
   NOTIFICATIONS READ, EVERYWHERE AT ONCE (Oct 2026)
   With ZenCrevia open in two tabs, or on a phone and a laptop, notifications read in one stayed unread in the others
   until they were reloaded. Whenever notifications become read the server now tells every page of that person
   (notifications_read: all of them, some ids, or the ones about one task, project, conversation or sign-up, and when;
   removed when a sign-up was turned away), and each page applies it to NOTIFS and patches what shows it, in place:
   - the bell's number and the red dot on the browser tab (syncNotifDot), at once, a tab in the background too;
   - the open bell and the Notifications screen: only the rows that changed, the scroll, the filter and the focus kept;
     a hidden tab patches them once it is shown;
   - a conversation read elsewhere: unread_count_changed now says up to where, so its count in Messages and the
     Messages badges follow, in a page that has its messages loaded too (it counted from its own read mark).
   Applying an event twice changes nothing: the page that marked them read finds nothing left to mark (and, once pages
   send X-ZC-Tab, src/core.js liveFromThisTab, it skips its own echo). Only what was there by then is marked: a
   notification that came after is left unread.
   A page whose live stream dropped (a laptop asleep, the network gone) missed what happened meanwhile: when the stream
   is back it asks once for the bell (GET /api/live/notifs) and for the conversations' read marks, and catches up.
   The server: notifReadPublish in server/server.js and the read route in server/messages.js.
   ============================================================ */
var NL={stream:"",server:{},dirty:false,catching:null};
function nlFromHere(ev){ return typeof liveFromThisTab==="function"&&liveFromThisTab(ev); }
function nlTime(s){ var t=Date.parse(s||""); return isNaN(t)?0:t; }
/* is n among the notifications this event read? (at: only those there by then) */
function nlHits(n,ev,at){ if(ev.ids&&ev.ids.indexOf(n.id)>=0) return true;
  if(at&&nlTime(n.createdAt)>at) return false;
  if(ev.all) return true;
  return ev.entityId!=null&&n.t===ev.entityId&&(!ev.entityType||(n.entityType||"task")===ev.entityType); }
function nlApply(ev){ var changed=0;
  if(ev.removed){ var keep=NOTIFS.filter(function(n){ return !nlHits(n,ev,0); }); changed=NOTIFS.length-keep.length; if(changed) NOTIFS=keep; }
  else { var at=nlTime(ev.at); NOTIFS.forEach(function(n){ if(n.read||!nlHits(n,ev,at)) return; n.read=true; changed++; }); }
  if(changed) nlShow(); return changed; }
/* what shows unread state: the number on the bell and the tab's dot at once; the open lists when they can be seen */
function nlShow(){ if(typeof syncNotifDot==="function") syncNotifDot(); if(typeof document!=="undefined"&&document.hidden){ NL.dirty=true; return; } nlLists(); }
function nlLists(){ NL.dirty=false; var np=document.getElementById("notifPop");
  if(np&&np.classList.contains("open")&&typeof notifRows==="function") nlPatch(document.getElementById("notifList"),notifRows());
  if(S.screen==="notifications"&&!S.search) nlScreen(); }
/* the Notifications screen: its rows, its "N unread" and its count, patched; drawn again only when it is not as drawn */
function nlScreen(){ var c=document.getElementById("content"), body=c&&c.querySelector(".panel .panel-body"), head=c&&c.querySelector(".pagehead .muted"), cnt=c&&c.querySelector(".panel .panel-head .cnt");
  if(!body||!head){ if(typeof bgRedraw==="function") bgRedraw(function(){ renderScreen(false); }); else renderScreen(false); return; }
  nlPatch(body,notifRows()); nlText(head,NOTIFS.filter(function(n){ return !n.read; }).length+" unread"); if(cnt) nlText(cnt,String(NOTIFS.length)); }
/* a list drawn again from its html, onto what is there: a row that only changed its classes (unread → read) or a
   word (how long ago) keeps its elements, another row is swapped alone, and only a list that lost or gained rows (the
   Unread filter) is refilled, where it was scrolled to. What is put in is translated first, the way it was drawn. */
function nlPatch(box,html){ if(!box) return; var tmp=document.createElement("div"); tmp.innerHTML=html; if(typeof localizeVisibleText==="function") localizeVisibleText(tmp); nlKids(box,tmp); }
function nlText(el,s){ var tmp=document.createElement(el.tagName); tmp.textContent=s; if(typeof localizeVisibleText==="function") localizeVisibleText(tmp); nlKids(el,tmp); }
function nlKids(a,b){ if(a.innerHTML===b.innerHTML) return; var an=Array.prototype.slice.call(a.childNodes), bn=Array.prototype.slice.call(b.childNodes);
  if(an.length!==bn.length){ var top=a.scrollTop; a.textContent=""; bn.forEach(function(n){ a.appendChild(n); }); if(top) a.scrollTop=top; return; }
  an.forEach(function(x,i){ var y=bn[i];
    if(x.nodeType===3&&y.nodeType===3){ if(x.nodeValue!==y.nodeValue){ x.nodeValue=y.nodeValue; nlSource(x,y); } }
    else if(x.nodeType===1&&y.nodeType===1&&x.outerHTML===y.outerHTML){}
    else if(nlSameBut(x,y)){ if(y.hasAttribute("class")) x.setAttribute("class",y.getAttribute("class")); else x.removeAttribute("class"); nlKids(x,y); }
    else a.replaceChild(y,x); }); }
/* the same element but for its classes */
function nlSameBut(x,y){ if(x.nodeType!==1||y.nodeType!==1||x.tagName!==y.tagName) return false; var p=x.cloneNode(false), q=y.cloneNode(false);
  if(q.hasAttribute("class")) p.setAttribute("class",q.getAttribute("class")); else p.removeAttribute("class"); return p.outerHTML===q.outerHTML; }
/* a word changed in place still knows what it was in English (src/i18n.js), for a switch of language */
function nlSource(x,y){ try{ if(typeof UI_TEXT_SOURCE==="undefined") return; var s=UI_TEXT_SOURCE.get(y); if(s) UI_TEXT_SOURCE.set(x,s); else UI_TEXT_SOURCE.delete(x); }catch(e){} }
/* a conversation read up to here, in another page: only ever forward (a later read in this page is not undone) */
function nlConvRead(c,rs){ if(!c||!rs||!rs.lastReadAt||!ME) return false; var all=c.readState=c.readState||{}, cur=all[ME]||{};
  if(cur.lastReadAt&&cur.lastReadAt>=rs.lastReadAt) return false; all[ME]={lastReadMessageId:rs.lastReadMessageId||null,lastReadAt:rs.lastReadAt}; return true; }
/* ---------- a stream that came back: catch up once ---------- */
function nlConnected(){ var who=(ME||"")+"|"+((typeof WS!=="undefined"&&WS&&WS.id)||""); if(NL.stream!==who){ NL.stream=who; return; } nlCatchUp(); }
function nlCatchUp(){ if(!API.on||!ME) return Promise.resolve(); if(NL.catching) return NL.catching;
  var a=apiFetch("GET","/api/live/notifs").then(function(d){ if(d&&Array.isArray(d.notifs)) nlMerge(d.notifs); }).catch(function(){});
  var b=typeof CONVERSATIONS!=="undefined"&&CONVERSATIONS.length?apiFetch("GET","/api/messages/conversations").then(nlConvMerge).catch(function(){}):null;
  NL.catching=Promise.all([a,b]).then(function(){ NL.catching=null; }); return NL.catching; }
/* the bell as the server has it now: read there is read here, what came meanwhile is added, and what is gone from it is
   gone (only what came from it, and not what is merely older than the hundred it sends) */
function nlMerge(list){ var have={}, got={}, changed=0; NOTIFS.forEach(function(n){ have[n.id]=n; });
  list.slice().reverse().forEach(function(d){ got[d.id]=1; NL.server[d.id]=1; var n=have[d.id]; if(n){ if(d.read&&!n.read){ n.read=true; changed++; } } else { NOTIFS.unshift(hNotif(d)); changed++; } });
  var oldest=list.length>=100?list.reduce(function(m,d){ var t=nlTime(d.createdAt); return t&&t<m?t:m; },Infinity):0;
  var keep=NOTIFS.filter(function(n){ return got[n.id]||!NL.server[n.id]||(oldest&&nlTime(n.createdAt)<oldest); });
  if(keep.length!==NOTIFS.length){ changed+=NOTIFS.length-keep.length; NOTIFS=keep; }
  if(changed) nlShow(); return changed; }
function nlConvMerge(list){ if(!Array.isArray(list)) return; var any=false;
  list.forEach(function(inc){ var c=typeof conv==="function"?conv(inc.id):null; if(!c) return; if(nlConvRead(c,(inc.readState||{})[ME])) any=true;
    if(typeof MESSAGES!=="undefined"&&!MESSAGES[c.id]&&typeof inc.unread==="number"&&c.unread!==inc.unread){ c.unread=inc.unread; any=true; } });
  if(!any) return; if(S.screen==="messages"&&typeof renderMsgNav==="function") renderMsgNav(); if(typeof messagesBadgeSync==="function") messagesBadgeSync(); }
/* the notifications that came from the server, so a catch-up knows which ones it may take away */
(function(){ if(typeof loadBootstrap!=="function") return; var lb=loadBootstrap; loadBootstrap=function(d){ var r=lb.apply(this,arguments); try{ NL.server={}; ((d&&d.notifs)||[]).forEach(function(n){ NL.server[n.id]=1; }); }catch(e){} return r; }; })();
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(ev){
  /* before Messages counts it again: where this person has read up to */
  try{ if(ev&&ev.type==="unread_count_changed"&&ev.lastReadAt&&API.on&&!nlFromHere(ev)&&typeof conv==="function") nlConvRead(conv(ev.conversationId),{lastReadMessageId:ev.lastReadMessageId,lastReadAt:ev.lastReadAt}); }catch(e){}
  var r=base.apply(this,arguments);
  try{ if(!ev||!API.on){}
    else if(ev.type==="notifications_read"){ if(!nlFromHere(ev)) nlApply(ev); }
    else if(ev.type==="notification_created"&&ev.notification) NL.server[ev.notification.id]=1;
    else if(ev.type==="connected") nlConnected(); }catch(e){ console.error(e); }
  return r; }; })();
if(typeof document!=="undefined"&&document.addEventListener) document.addEventListener("visibilitychange",function(){ if(!document.hidden&&NL.dirty) nlLists(); });
</script>
