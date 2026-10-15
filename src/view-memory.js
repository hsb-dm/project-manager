<script>
/* ============================================================
   THE LAST VIEW, KEPT (Oct 2026)
   A reload — or ZenCrevia opened again — went back to the defaults: Tasks to "Mine" after "All" was chosen, the
   calendar to a month after a week. How each screen was last looked at is now kept for the person on this device:
   Tasks (mine or all; kanban, list, grid or calendar; sort, its direction, grouping, the grid's columns), the
   calendar (month, week or day; mine or the team), Projects (active, archived or all; the tab a project opens on),
   Assets (grid or list; library or brand; done or all), a team's tasks (list, timeline, calendar), the Analytics
   range, the Messages filters and panels, the palette's Saved/Recent, comments shown (internal or for
   stakeholders), a version's zoom and the Notifications filter. A link that says otherwise (/calendar/month,
   /tasks/list) still wins.
   For the tab only: the task filters, the saved view applied and the Home pipeline's stage — a filter forgotten for
   days would hide work without anyone noticing.
   Not kept from one opening to the next: the Settings tab (Settings opens on My profile, as asked), the tab of a
   task's panel, search boxes. A refresh is different, see below: it puts the page back exactly as it was.
   ============================================================ */
var VIEW_MEMORY={
  taskScope:["mine","all"], taskView:["kanban","list","grid","calendar","timeline"], sort:"string", sortDir:[1,-1], group:"string", gridFields:"strings",
  calMode:["month","week","day"], calScope:["mine","all"],
  projView:["active","archived","all"], projectTab:"string",
  assetView:["grid","list"], assetTab:["library","brand"], assetScope:["done","all"],
  teamView:["list","timeline","calendar"], range:"number",
  messageFilter:["all","unread","mentions"], messageTab:"string", messageDetailTab:["detail","members","shared"], messageSharedTab:["media","links"], messageMediaKind:["all","image","video"], messageDerivedSort:"string",
  quickTab:["saved","recent"], commentVis:["internal","client"], annotZoom:["actual","fit"]
};
var VIEW_MEMORY_TAB={ filters:"filters", activeView:"stringOrNull", railFilter:"stringOrNull" };
var VIEW_RESTORED=null;
function viewMemoryKey(){ return "cos.view."+((typeof WS!=="undefined"&&WS&&WS.id)||"ws")+"."+ME; }
function viewMemoryOk(spec,v){
  if(Array.isArray(spec)) return spec.indexOf(v)>=0;
  if(spec==="string") return typeof v==="string"&&v.length<=60;
  if(spec==="number") return typeof v==="number"&&isFinite(v);
  if(spec==="strings") return Array.isArray(v)&&v.length<=40&&v.every(function(x){ return typeof x==="string"; });
  if(spec==="stringOrNull") return v===null||typeof v==="string"&&v.length<=80;
  if(spec==="filters") return !!v&&typeof v==="object";
  return false; }
function viewMemorySave(){ if(!ME||!S) return; try{
  var o={}, t={};
  Object.keys(VIEW_MEMORY).forEach(function(k){ if(S[k]!==undefined) o[k]=S[k]; });
  if(typeof NOTIF_FILTER!=="undefined") o.notifFilter=NOTIF_FILTER;
  Object.keys(VIEW_MEMORY_TAB).forEach(function(k){ if(S[k]!==undefined) t[k]=S[k]; });
  localStorage.setItem(viewMemoryKey(),JSON.stringify(o));
  sessionStorage.setItem(viewMemoryKey()+".tab",JSON.stringify(t)); }catch(e){} }
function viewMemoryLoad(){ try{
  var o=JSON.parse(localStorage.getItem(viewMemoryKey())||"null");
  if(o&&typeof o==="object"){
    Object.keys(VIEW_MEMORY).forEach(function(k){ if(o.hasOwnProperty(k)&&viewMemoryOk(VIEW_MEMORY[k],o[k])) S[k]=o[k]; });
    if(typeof NOTIF_FILTER!=="undefined"&&["all","unread","action","mentions","tasks","messages"].indexOf(o.notifFilter)>=0) NOTIF_FILTER=o.notifFilter; }
  var t=JSON.parse(sessionStorage.getItem(viewMemoryKey()+".tab")||"null");
  if(t&&typeof t==="object") Object.keys(VIEW_MEMORY_TAB).forEach(function(k){ if(!t.hasOwnProperty(k)||!viewMemoryOk(VIEW_MEMORY_TAB[k],t[k])) return;
    if(k==="filters"){ if(S.filters) Object.keys(S.filters).forEach(function(f){ if(typeof t.filters[f]==="string") S.filters[f]=t.filters[f]; }); }
    else S[k]=t[k]; }); }catch(e){} }
/* put back once per person, when their workspace arrives — before the first screen is drawn */
(function(){ if(typeof loadBootstrap!=="function") return; var base=loadBootstrap; loadBootstrap=function(){ var r=base.apply(this,arguments); try{ if(VIEW_RESTORED!==ME){ VIEW_RESTORED=ME; viewMemoryLoad(); pageRestore(); } }catch(e){} return r; }; })();
/* kept as it changes: every redraw writes it down (the notifications list draws on its own) */
(function(){ if(typeof renderScreen!=="function") return; var base=renderScreen; renderScreen=function(){ var r=base.apply(this,arguments); if(VIEW_RESTORED===ME) viewMemorySave(); return r; }; })();
(function(){ if(typeof renderNotifs!=="function") return; var base=renderNotifs; renderNotifs=function(){ var r=base.apply(this,arguments); if(VIEW_RESTORED===ME) viewMemorySave(); return r; }; })();

/* ============================================================
   A REFRESH PUTS THE PAGE BACK (Oct 2026)
   Refreshing went back to the first sub-tab of wherever one was: Settings → AI & Integrations → Data & Privacy
   came back as Overview, an open task's panel as its first tab, the calendar as this month, a scrolled list at
   the top, a design in AI Hub as a blank canvas. Now, when this browser tab is refreshed (or comes back with
   Back/Forward), the page returns as it was: every view setting on S (sub-tabs and sections, the calendar's
   period, search boxes, filters, panels opened or folded), AI Gallery's filters, the open task's tab, version and
   size, the scroll of the page and of the task's panel, and the AI Hub design being worked on.
   The address still decides the screen, its sub-page and the open task. Editing modes (a brief, a comment, a
   page) are not reopened: what was typed into them is not part of the page's state. Kept for this browser tab
   only (sessionStorage; the AI Hub design, which can hold large pictures, in IndexedDB under the tab's id), so
   opening ZenCrevia afresh still starts clean.
   ============================================================ */
var PAGE_SKIP={ screen:1, sub:1, drawerTask:1, messageConversationId:1, projectId:1, teamId:1, memberId:1, kbPage:1, requestId:1, settingsTab:1, taskView:1, calMode:1,
  search:1, replyTo:1, briefEdit:1, briefNew:1, cmtEdit:1, cmtEditStash:1, projectTextEdit:1, kbEdit:1, revOpen:1 };
var PAGE_DRAWER=["drawerTab","drawerVer","drawerExpanded","descMode","briefOptOpen"];
var PAGE_AG=["mode","q","sort","filters","filterOpen"];
var PAGE_SNAP=null, PAGE_AI_DOC=null, PAGE_AI_T=null;
var PAGE_TAB=(function(){ try{ var id=sessionStorage.getItem("cos.tab"); if(!id){ id="t"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); sessionStorage.setItem("cos.tab",id); } return id; }catch(e){ return null; } })();
function pageKey(){ return viewMemoryKey()+".page"; }
function pageReloaded(){ try{ var n=performance.getEntriesByType("navigation")[0]; return !!n&&(n.type==="reload"||n.type==="back_forward"); }catch(e){ return false; } }
/* the element that scrolls inside the task's panel */
function pageScrollBox(root){ if(!root) return null; var all=root.querySelectorAll("*"); for(var i=0;i<all.length;i++){ var e=all[i]; if(e.scrollHeight>e.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)) return e; } return null; }
function pageSave(){ if(!ME||!S||VIEW_RESTORED!==ME) return; try{
  var s={}, ag={};
  Object.keys(S).forEach(function(k){ if(PAGE_SKIP[k]||k.charAt(0)==="_"&&!/^_(manual|lastManual|temporaryTaskFilter)/.test(k)) return;   /* of the inner keys, only the Home card's passing filter */ var v=S[k]; if(v===undefined||typeof v==="function") return; try{ var j=JSON.stringify(v); if(j!==undefined&&j.length<20000) s[k]=JSON.parse(j); }catch(e){} });
  if(typeof AG!=="undefined") PAGE_AG.forEach(function(k){ if(AG[k]!==undefined) ag[k]=AG[k]; });
  var dr=document.getElementById("drawer"), box=dr&&dr.classList.contains("open")?pageScrollBox(dr):null;
  sessionStorage.setItem(pageKey(),JSON.stringify({ s:s, ag:ag, at:{ screen:S.screen, sub:typeof routeSub==="function"?routeSub():null, task:S.drawerTask||null }, scroll:appScrollTop()||0, drawerScroll:box?box.scrollTop:0 }));
}catch(e){} }
/* while the workspace arrives, before the first screen is drawn */
function pageRestore(){
  if(!pageReloaded()) return;
  try{ PAGE_SNAP=JSON.parse(sessionStorage.getItem(pageKey())||"null"); }catch(e){ PAGE_SNAP=null; }
  var snap=PAGE_SNAP;
  if(snap&&snap.s&&typeof snap.s==="object") Object.keys(snap.s).forEach(function(k){ if(PAGE_SKIP[k]) return; var v=snap.s[k], cur=S[k];
    /* a value only comes back in the shape the page uses now */
    if(cur!==undefined&&cur!==null&&v!==null&&(typeof cur!==typeof v||Array.isArray(cur)!==Array.isArray(v))) return;
    if(k==="filters"&&cur&&v&&typeof v==="object"){ Object.keys(cur).forEach(function(f){ if(typeof v[f]==="string") cur[f]=v[f]; }); return; }
    S[k]=v; });
  if(snap&&snap.ag&&typeof AG!=="undefined") PAGE_AG.forEach(function(k){ var v=snap.ag[k]; if(v===undefined) return; if(k==="filters"&&v&&typeof v==="object"){ Object.keys(AG.filters).forEach(function(f){ if(typeof v[f]==="string") AG.filters[f]=v[f]; }); } else if(typeof v===typeof AG[k]) AG[k]=v; });
  /* the AI Hub design, when it is this person's in this workspace */
  var d=PAGE_AI_DOC; PAGE_AI_DOC=null;
  if(d&&d.ws===((typeof WS!=="undefined"&&WS&&WS.id)||"ws")&&d.me===ME&&d.fields&&typeof AIF!=="undefined"){
    AIF=Object.assign(AIF,d.fields); AI_LAST=d.last||null; if(typeof AG_EDIT!=="undefined") AG_EDIT=d.edit||null;
    AI_PROJECT_BASE=typeof d.base==="string"?d.base:null; if(typeof AI_DEFAULTS_SEEDED!=="undefined") AI_DEFAULTS_SEEDED=true;
  }
}
/* once the address has opened its screen and task: what the address does not say */
function pageAfterRoute(){
  var snap=PAGE_SNAP; PAGE_SNAP=null; if(!snap||!snap.at) return;
  var tk=snap.at.task&&S.drawerTask===snap.at.task?task(S.drawerTask):null;
  if(tk&&snap.s){ PAGE_DRAWER.forEach(function(k){ if(snap.s.hasOwnProperty(k)) S[k]=snap.s[k]; });
    if(S.drawerVer!=null&&!(tk.versions||[]).some(function(v){ return v.n===S.drawerVer; })) S.drawerVer=tk.versions.length?tk.versions[tk.versions.length-1].n:null;
    if(typeof renderDrawer==="function") renderDrawer(); }
  var same=snap.at.screen===S.screen&&String(snap.at.sub||"")===String((typeof routeSub==="function"?routeSub():"")||"");
  var put=function(){ if(same&&snap.scroll) appScrollTop(snap.scroll); if(tk&&snap.drawerScroll){ var b=pageScrollBox(document.getElementById("drawer")); if(b) b.scrollTop=snap.drawerScroll; } };
  put(); requestAnimationFrame(put);
}
/* IndexedDB, one record per browser tab */
function pageDb(mode,fn){ return new Promise(function(res){ try{ if(!PAGE_TAB||typeof indexedDB==="undefined") return res(null); var rq=indexedDB.open("zencrevia-tab",1);
  rq.onupgradeneeded=function(){ rq.result.createObjectStore("doc"); };
  rq.onerror=function(){ res(null); };
  rq.onsuccess=function(){ var db=rq.result, out=null; try{ var tx=db.transaction("doc",mode); out=fn(tx.objectStore("doc")); tx.oncomplete=function(){ db.close(); res(out&&out.result!==undefined?out.result:null); }; tx.onerror=tx.onabort=function(){ db.close(); res(null); }; }catch(e){ db.close(); res(null); } };
}catch(e){ res(null); } }); }
function pageAiSave(){ clearTimeout(PAGE_AI_T); PAGE_AI_T=null; if(!ME||typeof AIF==="undefined"||VIEW_RESTORED!==ME) return;
  var rec; try{ var f=clone(AIF); ["selectedLayer","selectedLayers","showSafeZones"].forEach(function(k){ delete f[k]; });
    rec={ ws:(WS&&WS.id)||"ws", me:ME, at:Date.now(), fields:f, last:AI_LAST?clone(AI_LAST):null, edit:(typeof AG_EDIT!=="undefined"&&AG_EDIT)?clone(AG_EDIT):null, base:typeof AI_PROJECT_BASE==="string"?AI_PROJECT_BASE:null }; }catch(e){ return; }
  pageDb("readwrite",function(st){ st.put(rec,PAGE_TAB);
    /* records of tabs closed days ago */
    var old=Date.now()-3*864e5, cur=st.openCursor(); cur.onsuccess=function(){ var c=cur.result; if(!c) return; if(c.key!==PAGE_TAB&&(!c.value||c.value.at<old)) c.delete(); c.continue(); }; }); }
function pageAiSoon(){ clearTimeout(PAGE_AI_T); PAGE_AI_T=setTimeout(pageAiSave,500); }
(function(){
  window.addEventListener("pagehide",function(){ pageSave(); if(PAGE_AI_T) pageAiSave(); });
  window.addEventListener("beforeunload",pageSave);
  /* every change to the design redraws its preview: that is when it is written down */
  if(typeof aiPreview==="function"){ var basePreview=aiPreview; aiPreview=function(){ var r=basePreview.apply(this,arguments); if(VIEW_RESTORED===ME) pageAiSoon(); return r; }; }
  if(typeof afterLogin!=="function") return;
  var base=afterLogin;
  afterLogin=function(){ var self=this, args=arguments;
    /* the design is read before the workspace arrives, so the first AI Hub drawn is already the right one */
    var pre=pageReloaded()&&VIEW_RESTORED===null?pageDb("readonly",function(st){ return st.get(PAGE_TAB); }).then(function(d){ PAGE_AI_DOC=d||null; }):Promise.resolve();
    return pre.then(function(){ return base.apply(self,args); }).then(function(v){ try{ pageAfterRoute(); }catch(e){} return v; }); };
})();
</script>
