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
   Not kept: the Settings tab (Settings opens on My profile, as asked), the tab of a task's panel, search boxes.
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
(function(){ if(typeof loadBootstrap!=="function") return; var base=loadBootstrap; loadBootstrap=function(){ var r=base.apply(this,arguments); try{ if(VIEW_RESTORED!==ME){ VIEW_RESTORED=ME; viewMemoryLoad(); } }catch(e){} return r; }; })();
/* kept as it changes: every redraw writes it down (the notifications list draws on its own) */
(function(){ if(typeof renderScreen!=="function") return; var base=renderScreen; renderScreen=function(){ var r=base.apply(this,arguments); if(VIEW_RESTORED===ME) viewMemorySave(); return r; }; })();
(function(){ if(typeof renderNotifs!=="function") return; var base=renderNotifs; renderNotifs=function(){ var r=base.apply(this,arguments); if(VIEW_RESTORED===ME) viewMemorySave(); return r; }; })();
</script>
