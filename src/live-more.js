<script>
/* ============================================================
   LIVE: WHAT HAD NO LIVE UPDATE AT ALL (Oct 2026)
   Saved views, AI Gallery and the announcement e-mails' list followed nobody: a colleague's change, or the person's
   own in another tab or on their phone, showed only after a reload. The server now says so, to whoever may see the
   thing (live_changed {kind, id, by, tab}, server/live-more.js), and this page asks again for just that list and
   patches what is on the screen in place:
   - views: the saved views of Tasks and Calendar (VIEWS, GET /api/views). An open Views menu is written again where
     it is, with the focus where it was; the screen is drawn again (requestRefresh, which keeps the reader's place)
     only when the view applied was renamed or deleted, and the filters in use stay as they are;
   - gallery: the AI Gallery page in sight, as it is filtered, sorted and paged. Only the cards that changed are
     drawn again (a picture already shown is not loaded again), new ones take their place and gone ones go; the
     usage count follows. While "Manage design" is open it waits, so a rename made elsewhere still meets "This design
     changed" instead of being written over, and comes in when the dialog closes. AI Hub's editor is left alone;
   - announcements: Settings → Notifications → "Sent before". Only that list is written again (what is being typed,
     the people ticked and their list's scroll stay), and while one is going it follows how far it got.
   The tab that made the change leaves its own event alone (liveFromThisTab, src/core.js), and a tab out of sight
   does the work when it is shown. Asking again and finding the same draws nothing, so an event may come twice.
   ============================================================ */
var LIVE_MORE={wait:{},timer:{},hidden:{},galleryHeld:false,annPoll:null};
function liveMoreOwn(ev){ return typeof liveFromThisTab==="function"&&liveFromThisTab(ev); }
var LIVE_MORE_KINDS={views:liveViews,gallery:liveGallery,announcements:liveAnnouncements};
/* one event, or a burst of them (a save and its finish, several tabs), is asked for once */
function liveMoreTake(ev){ var k=ev&&ev.kind; if(!LIVE_MORE_KINDS[k]||!API.on||liveMoreOwn(ev)) return;
  if(document.hidden){ LIVE_MORE.hidden[k]=ev; return; }
  LIVE_MORE.wait[k]=ev; if(LIVE_MORE.timer[k]) return;
  LIVE_MORE.timer[k]=setTimeout(function(){ var e=LIVE_MORE.wait[k]; delete LIVE_MORE.wait[k]; delete LIVE_MORE.timer[k]; try{ LIVE_MORE_KINDS[k](e); }catch(x){ console.error(x); } },120); }
if(typeof document!=="undefined"&&document.addEventListener) document.addEventListener("visibilitychange",function(){ if(document.hidden) return; var h=LIVE_MORE.hidden; LIVE_MORE.hidden={}; Object.keys(h).forEach(function(k){ liveMoreTake(h[k]); }); });
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(ev){ var r=base.apply(this,arguments); if(ev&&ev.type==="live_changed") liveMoreTake(ev); return r; }; })();

/* ---------- saved views: the owner's other tabs and devices ---------- */
function liveViews(){ return apiFetch("GET","/api/views").then(function(list){
  if(!Array.isArray(list)||JSON.stringify(list)===JSON.stringify(VIEWS)) return;
  var act=S.activeView, was=act?byId(VIEWS,act):null, wasName=was?was.name:null;
  VIEWS=list; var now=act?byId(VIEWS,act):null;
  if(act&&!now) S.activeView=null;   /* deleted elsewhere: the list stays as filtered, without the view's name */
  liveViewsMenu();
  if(act&&(!now||now.name!==wasName)&&(S.screen==="tasks"||S.screen==="calendar")) requestRefresh({bg:true});
}).catch(function(){}); }
/* the Views menu, while it is open: written again in place, the focus on the same row */
(function(){ if(typeof viewsMenu!=="function") return; var base=viewsMenu; viewsMenu=function(){ var r=base.apply(this,arguments), m=document.getElementById("ctxMenu"); if(m) m._liveViews=m.classList.contains("open")?m._anchor:null; return r; }; })();
function liveViewsMenu(){ var m=document.getElementById("ctxMenu"); if(!m||!m.classList.contains("open")||!m._liveViews||m._liveViews!==m._anchor||typeof viewsMenuHtml!=="function") return;
  var at=Array.prototype.indexOf.call(m.querySelectorAll("button"),document.activeElement);
  m.innerHTML=viewsMenuHtml(); if(typeof localizeVisibleText==="function") localizeVisibleText(m);
  var bs=m.querySelectorAll("button"); if(at>=0&&bs.length){ try{ bs[Math.min(at,bs.length-1)].focus({preventScroll:true}); }catch(e){} } }

/* ---------- AI Gallery: everyone who may see the design; a favourite, the person's own pages ---------- */
function liveGallery(){
  if(S.screen!=="aigallery"||typeof agCanView!=="function"||!agCanView()) return;   /* opening it asks anyway */
  if(liveGalleryHeld()){ LIVE_MORE.galleryHeld=true; return; }
  var seq=AG.sequence, user=ME;
  agRequest("GET",agFilterQuery()).then(function(r){ if(!r||seq!==AG.sequence||S.screen!=="aigallery"||user!==ME) return; liveGalleryPatch(r.items||[],r.total||0); }).catch(function(){});
  agRefreshOwnedCount().then(function(){ var el=document.querySelector(".ag-usage"); if(!el||S.screen!=="aigallery") return; var t=document.createElement("div"); t.innerHTML=agUsageIndicator(); var n=t.firstElementChild; if(n&&!n.isEqualNode(el)) el.replaceWith(n); });
}
/* "Manage design" is open (a closed dialog keeps its fields, hidden, until the next one) */
function liveGalleryHeld(){ var w=document.getElementById("modalWrap"), f=document.getElementById("agRename"); return !!(w&&f&&w.classList.contains("open")&&w.contains(f)); }
(function(){ if(typeof closeModal!=="function") return; var base=closeModal; closeModal=function(){ var r=base.apply(this,arguments); if(LIVE_MORE.galleryHeld){ LIVE_MORE.galleryHeld=false; setTimeout(function(){ liveMoreTake({type:"live_changed",kind:"gallery"}); },0); } return r; }; })();
function liveGallerySig(x){ return JSON.stringify(x); }
function liveGalleryPatch(items,total){
  var box=document.getElementById("agItems"); if(!box) return;
  var old=AG.items||[];
  if(total===AG.total&&items.length===old.length&&items.every(function(x,i){ return liveGallerySig(x)===liveGallerySig(old[i]); })) return;
  AG.items=items; AG.total=total;
  var grid=box.querySelector(".ag-grid");
  /* from none to some, or back: the list's own empty state, or its grid */
  if(!grid||!items.length||grid.children.length!==old.length){ agCards(); if(typeof localizeVisibleText==="function") localizeVisibleText(box); return; }
  var kids=Array.prototype.slice.call(grid.children), cards={};
  kids.forEach(function(c,i){ cards[old[i].id]={el:c,sig:liveGallerySig(old[i])}; });
  var a=document.activeElement, fCard=a&&grid.contains(a)?a.closest(".ag-card"):null, fId=null, fKey=fCard?(a.getAttribute("onclick")||a.className||a.tagName):null;
  if(fCard) kids.forEach(function(c,i){ if(c===fCard) fId=old[i].id; });
  items.forEach(function(x,i){ var had=cards[x.id], node;
    if(had&&had.sig===liveGallerySig(x)) node=had.el;
    else { var t=document.createElement("div"); t.innerHTML=agCardHTML(x); node=t.firstElementChild; if(typeof localizeVisibleText==="function") localizeVisibleText(node);
      var o=had&&had.el.querySelector("details.ag-note"), n=node.querySelector("details.ag-note"); if(o&&n&&o.open) n.open=true; }
    if(had) delete cards[x.id];
    if(grid.children[i]!==node) grid.insertBefore(node,grid.children[i]||null); });
  /* what is left after them: cards drawn again, and those gone from this page */
  while(grid.children.length>items.length) grid.removeChild(grid.lastElementChild);
  /* the focus stays on the same button: its card's, or the one drawn again in its place (a card moved loses it) */
  if(fId&&document.activeElement!==a){ var f=a.isConnected?a:null;
    if(!f){ var at=-1; items.forEach(function(x,i){ if(x.id===fId) at=i; }); var nc=at>=0?grid.children[at]:null;
      f=nc&&Array.prototype.filter.call(nc.querySelectorAll("button,summary"),function(b){ return (b.getAttribute("onclick")||b.className||b.tagName)===fKey; })[0]; }
    if(f){ try{ f.focus({preventScroll:true}); }catch(e){} } }
  var pg=box.querySelector(".ag-pagination"); if(pg){ var s=pg.querySelector("span"), bs=pg.querySelectorAll("button");
    if(s) s.textContent=(AG.offset+1)+"–"+(AG.offset+AG.items.length)+" / "+AG.total; if(bs[0]) bs[0].disabled=AG.offset===0; if(bs[1]) bs[1].disabled=AG.offset+24>=AG.total; }
}

/* ---------- announcements: whoever may send them ---------- */
function liveAnnOpen(){ return S.screen==="settings"&&S.settingsTab==="notifications"&&!!document.getElementById("annHistory"); }
function liveAnnouncements(){
  if(typeof canAnnounce!=="function"||!canAnnounce()||ANN===null) return;
  if(!liveAnnOpen()){ ANN=null; return; }   /* asked for again when the section is next drawn */
  if(ANN.loading) return;   /* its first answer is on its way */
  clearTimeout(LIVE_MORE.annPoll); LIVE_MORE.annPoll=null;
  apiFetch("GET","/api/announcements").then(function(d){ if(!d||!ANN||ANN.loading||!liveAnnOpen()) return;
    var was=JSON.stringify(ANN.history||[]); ANN.history=d.history||[];
    if(JSON.stringify(ANN.history)!==was){ var box=document.getElementById("annHistory"); box.innerHTML=annHistoryHtml(); if(typeof localizeVisibleText==="function") localizeVisibleText(box); }
    /* one still going: how far it got, until it is done */
    if(ANN.history.some(function(h){ return h.status==="sending"; })) LIVE_MORE.annPoll=setTimeout(function(){ LIVE_MORE.annPoll=null; liveMoreTake({type:"live_changed",kind:"announcements"}); },1500);
  }).catch(function(){}); }
</script>
