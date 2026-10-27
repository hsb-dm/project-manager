<script>
/* ============================================================
   TASKS — one dataset, five views (Kanban · List · Grid · Calendar · Timeline), filters, sort, group, saved views, universal drag-and-drop (§23–41)
   ============================================================ */
var DUE_PRESETS=[["","Any due date"],["today","Today"],["tomorrow","Tomorrow"],["week","This week"],["nextweek","Next week"],["overdue","Overdue"],["custom","Custom range…"]];
function weekRange(offsetWeeks){ var dow=(TODAY.getDay()+6)%7; var s=-dow+7*offsetWeeks; return [s,s+6]; }
function dueMatch(t,preset,f){ if (!preset) return true; if (preset==="today") return t.due===0; if (preset==="tomorrow") return t.due===1; if (preset==="overdue") return t.due<0&&!isClosed(t); if (preset==="week"){ var w=weekRange(0); return t.due>=w[0]&&t.due<=w[1]; } if (preset==="nextweek"){ var n=weekRange(1); return t.due>=n[0]&&t.due<=n[1]; } if (preset==="custom"){ var a=f.dueFrom?offsetFromIso(f.dueFrom):-9999, b=f.dueTo?offsetFromIso(f.dueTo):9999; return t.due>=a&&t.due<=b; } return true; }
/* Every filter but Hidden tasks (f.hidden: "" hides archived tasks, "show" shows all, "only" shows only them), which
   taskFilterPass applies after it. One pass over TASKS gives what the view shows and how many archived tasks the same
   filters and scope hold: the count on the Tasks page's Archived button (taskArchivedBtn) is what a click shows. */
function filteredTasks(){ return taskFilterPass().list; }
function taskFilterPass(){ var f=S.filters, list=[], archived=0;
  TASKS.forEach(function(x){ if (!taskBaseMatch(x,f)) return; var a=!!(x.hidden||autoHidden(x)); if (a) archived++; if (f.hidden==="only"?a:(!a||!!f.hidden)) list.push(x); });
  return {list:list,archived:archived}; }
function taskBaseMatch(x,f){ if (!f.archived&&projArchived(x.proj)&&!(S.screen==="projects"&&S.projectId===x.proj)) return false;
    if (f.label&&(x.labels||[]).indexOf(f.label)<0) return false; if (S.taskScope==="mine"&&!isAssignee(x,ME)&&!isReviewer(x,ME)) return false; if (S.projectId&&S.screen==="projects"&&!inProject(x,S.projectId)) return false; if (f.status&&x.status!==f.status) return false; if (f.kind&&stageKind(x.status)!==f.kind) return false; if (f.assignee&&!isAssignee(x,f.assignee)) return false; if (f.reviewer&&!isReviewer(x,f.reviewer)) return false; if (f.proj&&!inProject(x,f.proj)) return false; if (f.prio&&x.prio!==f.prio) return false; if (f.team&&!taskInvolvesTeam(x,f.team)) return false; if (f.tag&&x.tags.indexOf(f.tag)<0) return false; if (f.dependency==="blocked"&&!isTaskBlocked(x)) return false; if (f.dependency==="ready"&&dependencyState(x)!=="ready") return false; if (f.dependency==="blocking"&&!blockingTasksOf(x).length) return false; if (f.dependency==="has"&&!(x.dependencies||[]).length) return false; if (f.dependency==="none"&&(x.dependencies||[]).length) return false; if (!dueMatch(x,f.due,f)) return false; return true; }
function anyFilter(){ var f=S.filters; return Object.keys(f).some(function(k){ return f[k]; }); }
function useManualTaskFilters(){ if(!S._temporaryTaskFilter)return; S._temporaryTaskFilter=false; S._manualTaskFilters=null; S._manualTaskScope=null; S._manualActiveView=null; }
function clearFilters(){ useManualTaskFilters(); S.filters=emptyTaskFilters(); S.activeView=null; renderScreen(false); }
function setFilter(k,v){ useManualTaskFilters(); S.filters[k]=v; S.activeView=null; if (k==="due"&&v==="custom") return customRangeModal(); renderScreen(false); }
function customRangeModal(){ openModal("Custom due range",'<div class="field-row">'+fieldHtml("cr_from","From",'<input id="cr_from" type="date" value="'+(S.filters.dueFrom||iso(0))+'">')+fieldHtml("cr_to","To",'<input id="cr_to" type="date" value="'+(S.filters.dueTo||iso(14))+'">')+'</div>','<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="S.filters.dueFrom=val(\'cr_from\');S.filters.dueTo=val(\'cr_to\');closeModal();renderScreen(false)">Apply</button>'); }
function sortedTasks(list){ var k=S.sort, d=S.sortDir; var wf=WS.workflow.map(function(s){ return s.id; }); return list.slice().sort(function(a,b){ var x,y; if (k==="manual"){ x=a.sort||0; y=b.sort||0; } else if (k==="due"){ x=a.due; y=b.due; } else if (k==="prio"){ x=PRANK[a.prio]; y=PRANK[b.prio]; } else if (k==="created"){ x=-(a.ago||0); y=-(b.ago||0); } else if (k==="status"){ x=wf.indexOf(a.status); y=wf.indexOf(b.status); } else if (k==="assignee"){ x=person(a.assignee).name; y=person(b.assignee).name; } else if (k==="proj"){ x=projName(a); y=projName(b); } else if (k==="team"){ x=teamName(a.team); y=teamName(b.team); } else if (k==="effort"){ x=a.effort; y=b.effort; } else { x=a.title.toLowerCase(); y=b.title.toLowerCase(); } return ((x<y?-1:x>y?1:0)||(a.due-b.due))*d; }); }
function groupKey(t,g){ if (g==="status") return t.status; if (g==="team") return t.team||""; if (g==="assignee") return t.assignee||""; if (g==="proj") return t.proj; if (g==="prio") return t.prio; if (g==="due") return t.due<0?"overdue":t.due===0?"today":t.due===1?"tomorrow":t.due<=weekRange(0)[1]?"week":t.due<=weekRange(1)[1]?"nextweek":"later"; return ""; }
function groupLabel(key,g){ if (g==="status") return {l:stageName(key),c:""}; if (g==="team"){ return {l:teamName(key),c:teamVar(key)}; } if (g==="assignee") return {l:key?person(key).name:"Unassigned",c:""}; if (g==="proj"){ var p=project(key); return {l:p?p.name:"No project",c:""}; } if (g==="prio") return {l:prioL(key),c:""}; if (g==="due") return {l:{overdue:"Overdue",today:"Today",tomorrow:"Tomorrow",week:"This week",nextweek:"Next week",later:"Later"}[key],c:""}; return {l:"",c:""}; }
function groupOrder(g){ if (g==="status") return WS.workflow.map(function(s){ return s.id; }); if (g==="team") return activeTeams().map(function(t){ return t.id; }).concat([""]); if (g==="assignee") return Object.keys(PEOPLE); if (g==="proj") return PROJECTS.map(function(p){ return p.id; }); if (g==="prio") return ["urgent","high","medium","low"]; if (g==="due") return ["overdue","today","tomorrow","week","nextweek","later"]; return []; }
function groupedTasks(list,g){ var m={}; list.forEach(function(t){ var k=groupKey(t,g); (m[k]=m[k]||[]).push(t); }); var keys=groupOrder(g).filter(function(k){ return m[k]; }); Object.keys(m).forEach(function(k){ if (keys.indexOf(k)<0) keys.push(k); }); return keys.map(function(k){ return {key:k,tasks:m[k]}; }); }
function groupOp(g,key){ if (g==="status") return {type:"MOVE_TASK_STATUS",toStatusId:key,apply:function(t){ t.status=key; }}; if (g==="team") return {type:"MOVE_TASK_TEAM",teamId:key||null,apply:function(t){ t.team=key||null; }}; if (g==="assignee") return {type:"MOVE_TASK_ASSIGNEE",assigneeId:key||null,apply:function(t){ t.assignee=key||null; }}; if (g==="proj") return {type:"MOVE_TASK_PROJECT",projectId:key,apply:function(t){ t.proj=key; }}; if (g==="prio") return {type:"MOVE_TASK_PRIORITY",priority:key,apply:function(t){ t.prio=key; }}; return null; }
function rankBetween(before,after,fallback){ var b=before?before.sort||0:null, a=after?after.sort||0:null; if (b!=null&&a!=null) return (b+a)/2; if (b!=null) return b+1000; if (a!=null) return a-1000; return fallback||0; }
function taskCardColor(t,view){ var mode=((WS.taskCardColors||{})[view])||"team", firstLabel=labelsOf(t)[0]; return mode==="label"&&firstLabel?firstLabel.color:teamVar(t.team); }
function taskIdFrom(el){ var host=el&&el.closest?el.closest("[data-id]"):null; return host?host.getAttribute("data-id"):""; }

/* ---------- toolbar ---------- */
function pillSel(name,cur,opts,cb){ var selected=opts.filter(function(o){return o[0]===cur;})[0]||opts[0]||["",""]; return '<div class="pillsel pillsel-custom'+(cur?" on":"")+'" data-pill="'+attr(String(name).toLowerCase())+'"><span>'+name+'</span><button type="button" class="pillsel-trigger" aria-haspopup="listbox" aria-expanded="false" onclick="pillSelToggle(this.closest(\'.pillsel-custom\'),event)"><span class="pillsel-value">'+esc(selected[1])+'</span><span class="pillsel-chevron"></span></button><select class="pillsel-native" onchange="'+cb+'">'+opts.map(function(o){ return '<option value="'+attr(o[0])+'"'+(o[0]===cur?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("")+'</select><span class="pillsel-menu" role="listbox">'+opts.map(function(o){ return '<button type="button" role="option" data-value="'+attr(o[0])+'"'+(o[0]===cur?' aria-selected="true"':'')+' onclick="pillSelChoose(this)">'+esc(o[1])+'</button>'; }).join("")+'</span></div>'; }
function pillSelClose(root){ if(!root)return;root.classList.remove("open");var trigger=root.querySelector(".pillsel-trigger");if(trigger)trigger.setAttribute("aria-expanded","false"); }
function pillSelToggle(root,e){ if(e){e.preventDefault();e.stopPropagation();}if(!root)return;var opening=!root.classList.contains("open");document.querySelectorAll(".pillsel-custom.open").forEach(function(x){if(x!==root)pillSelClose(x);});root.classList.toggle("open",opening);root._escClose=function(){ pillSelEsc(root); };var trigger=root.querySelector(".pillsel-trigger");if(trigger)trigger.setAttribute("aria-expanded",opening?"true":"false");
  if(opening) pillSelPlace(root); }
/* Where a finger can reach the menu: inside every box around the pill that cuts off what overflows it, on the screen,
   and above the phone's bottom tab bar (the menu is drawn under it). */
function pillSelArea(root){ var a={top:0,bottom:window.innerHeight,left:0,right:document.documentElement.clientWidth||window.innerWidth};
  for(var e=root.parentElement;e&&e!==document.body&&e!==document.documentElement;e=e.parentElement){ var cs=getComputedStyle(e); if(cs.overflowX==="visible"&&cs.overflowY==="visible") continue; var r=e.getBoundingClientRect(); a.top=Math.max(a.top,r.top); a.bottom=Math.min(a.bottom,r.bottom); a.left=Math.max(a.left,r.left); a.right=Math.min(a.right,r.right); }
  var tb=document.getElementById("tabbar"), t=tb&&tb.getBoundingClientRect(); if(t&&t.height&&t.top>a.top) a.bottom=Math.min(a.bottom,t.top);
  return a; }
/* The menu opens toward the side with room: sideways, a pill at the screen's left edge put it off the screen; up or
   down, below the pill when it fits, else on the side with more room, as tall as that room (it scrolls inside), so a
   pill low on a phone (a project's List) no longer opened its last choices under the tab bar or off the screen. */
function pillSelPlace(root){ var menu=root&&root.querySelector(".pillsel-menu"); if(!menu||!root.classList.contains("open")) return;
  var s=menu.style, a=pillSelArea(root), pad=8, gap=7; s.left=""; s.right=""; s.top=""; s.bottom=""; s.maxHeight="";
  var m=menu.getBoundingClientRect(); if(m.left<a.left+pad){ s.left="-1px"; s.right="auto"; m=menu.getBoundingClientRect(); } if(m.right>a.right-pad){ s.left="auto"; s.right="0"; }
  var r=root.getBoundingClientRect(), h=menu.offsetHeight, below=a.bottom-r.bottom-gap-pad, above=r.top-a.top-gap-pad, down=h<=below||below>=above, room=Math.max(down?below:above,72);
  if(!down){ s.top="auto"; s.bottom="calc(100% + "+gap+"px)"; } if(h>room) s.maxHeight=Math.floor(room)+"px";
  root.classList.toggle("pillsel-up",!down); }
window.addEventListener("resize",function(){ document.querySelectorAll(".pillsel-custom.open").forEach(pillSelPlace); });
function pillSelChoose(option){ var root=option.closest(".pillsel-custom"), select=root&&root.querySelector(".pillsel-native"); if(!root||!select)return; select.value=option.getAttribute("data-value"); root.querySelector(".pillsel-value").textContent=option.textContent; root.classList.toggle("on",!!select.value); pillSelClose(root); root.querySelectorAll("[role=option]").forEach(function(x){x.setAttribute("aria-selected",x===option?"true":"false");}); select.dispatchEvent(new Event("change",{bubbles:true})); }
function upgradePillSelects(root){ (root||document).querySelectorAll(".pillsel:not(.pillsel-custom) select").forEach(function(select){ var wrap=select.closest(".pillsel"), current=select.options[select.selectedIndex]||select.options[0]; if(!wrap||!current)return; wrap.classList.add("pillsel-custom"); var trigger=document.createElement("button"); trigger.type="button"; trigger.className="pillsel-trigger"; trigger.innerHTML='<span class="pillsel-value">'+esc(current.textContent)+'</span><span class="pillsel-chevron"></span>'; trigger.onclick=function(e){e.preventDefault();e.stopPropagation();pillSelToggle(wrap);}; var menu=document.createElement("span"); menu.className="pillsel-menu"; menu.setAttribute("role","listbox"); Array.prototype.forEach.call(select.options,function(o){var b=document.createElement("button");b.type="button";b.setAttribute("role","option");b.setAttribute("data-value",o.value);b.setAttribute("aria-selected",o.selected?"true":"false");b.textContent=o.textContent;b.onclick=function(){pillSelChoose(b);};menu.appendChild(b);}); select.className="pillsel-native"; wrap.insertBefore(trigger,select); wrap.appendChild(menu); }); }
document.addEventListener("pointerdown",function(e){if(!e.target.closest(".pillsel-custom"))document.querySelectorAll(".pillsel-custom.open").forEach(pillSelClose);});
/* Esc closes the open one and nothing else (the app's Escape, src/core.js), the focus back on its trigger */
function pillSelEsc(root){ pillSelClose(root); escFocusBack(root.querySelector(".pillsel-trigger"),root.querySelector(".pillsel-menu")); }
/* only what was just added is looked at (the first time, the whole page): the whole page was searched at every change */
if(typeof MutationObserver!=="undefined"&&document.body){ var PILL_SEEN_ALL=false; new MutationObserver(function(recs){ if(!PILL_SEEN_ALL){ PILL_SEEN_ALL=true; upgradePillSelects(document); return; } for(var i=0;i<recs.length;i++){ var a=recs[i].addedNodes; for(var j=0;j<a.length;j++){ var n=a[j]; if(n.nodeType!==1||!n.isConnected) continue; if(n.tagName==="SELECT"){ if(n.matches(".pillsel:not(.pillsel-custom) select")) upgradePillSelects(n.parentNode); } else if(n.firstElementChild) upgradePillSelects(n); } } }).observe(document.body,{childList:true,subtree:true}); }
/* A redraw of the same screen (a colleague's change arriving live, a list finishing loading) draws the toolbar again,
   and an open Sort or Group menu vanished under the finger before anything could be chosen. It stays open, scrolled
   where it was. A choice closes the menu before the redraw it causes; another screen starts with it closed. */
(function(){ if(typeof renderScreen!=="function") return; var base=renderScreen;
  renderScreen=function(){ var open=document.querySelector("#content .pillsel-custom.open"), was=null;
    if(open&&(typeof redrawSame!=="function"||redrawSame(REDRAW_DRAWN,redrawIdentity()))){ var m=open.querySelector(".pillsel-menu"); was={pill:open.getAttribute("data-pill"),i:[].indexOf.call(document.querySelectorAll("#content .pillsel-custom"),open),top:m?m.scrollTop:0}; }
    var r=base.apply(this,arguments), c=document.getElementById("content");
    if(was&&c&&!open.isConnected){ upgradePillSelects(c); var again=was.pill?c.querySelector('.pillsel-custom[data-pill="'+was.pill+'"]'):c.querySelectorAll(".pillsel-custom")[was.i];
      if(again&&!again.getAttribute("data-pill")===!was.pill&&!again.classList.contains("open")){ again.classList.add("open"); if(typeof pillSelEsc==="function") again._escClose=function(){ pillSelEsc(again); }; var t=again.querySelector(".pillsel-trigger"); if(t) t.setAttribute("aria-expanded","true"); pillSelPlace(again); var mm=again.querySelector(".pillsel-menu"); if(mm) mm.scrollTop=was.top; } }
    return r; }; })();
function viewSwitch(views){ var all={kanban:["Kanban",I.kanban],list:["List",I.list],grid:["Grid",I.grid],calendar:["Calendar",I.calendar.replace('class="i"','')],timeline:["Timeline",I.timeline]}; return '<div class="seg" data-tour="task-views">'+(views||["kanban","list","grid","calendar","timeline"]).map(function(k){ return '<button data-view="'+k+'" class="'+(S.taskView===k?"on":"")+'" aria-label="'+attr(tr(all[k][0]))+'" title="'+attr(tr(all[k][0]))+'" onclick="S.taskView=\''+k+'\';renderScreen(false)">'+all[k][1]+'<span class="view-label">'+all[k][0]+'</span></button>'; }).join("")+'</div>'; }
var FILTER_DEFS=function(opts){ var tags=WS.tags.slice(); TASKS.forEach(function(x){ x.tags.forEach(function(g){ if (tags.indexOf(g)<0) tags.push(g); }); }); var defs=[
  ["status","Status",[["","Any"]].concat(localStages().map(function(s){ return [s.id,s.name]; }))],["team","Team",[["","Any"]].concat(activeTeams().map(function(x){ return [x.id,x.name]; }))],["assignee","Assignee",[["","Any"]].concat(peopleOpts())],["reviewer","Reviewer",[["","Any"]].concat(peopleOpts())],
  ["prio","Priority",[["","Any"]].concat(PRIOS)],["tag","Tag",[["","Any"]].concat(tags.map(function(x){ return [x,x]; }))],["dependency","Dependency",[["","All dependency states"],["blocked","Blocked"],["ready","Ready"],["blocking","Blocking other tasks"],["has","Has dependencies"],["none","No dependencies"]]],["due","Due date",DUE_PRESETS]];
  if (!opts.noProject){ defs.splice(4,0,["proj","Project",[["","Any"]].concat((S.filters.archived?PROJECTS:liveProjects()).map(function(p){ return [p.id,p.name]; }))]); if (PROJECTS.some(function(p){ return p.status==="archived"; })) defs.push(["archived","Archived projects",[["","Hidden"],["show","Show"]]]); }
  if (TASKS.some(function(x){ return x.hidden||autoHidden(x); })) defs.push(["hidden","Hidden tasks",[["","Hidden"],["show","Show all"],["only","Hidden only"]]]);
  if (allLabels().length) defs.push(["label","Label",[["","All labels"]].concat(allLabels().map(function(l){ return [l.id,l.name]; }))]); return defs; };
function filterLabel(k,v){ if (k==="status") return stageName(v); if (k==="team") return teamName(v); if (k==="assignee"||k==="reviewer") return person(v).name; if (k==="proj") return (project(v)||{name:v}).name; if (k==="prio") return prioL(v); if (k==="dependency") return {blocked:"Blocked",ready:"Ready",blocking:"Blocking other tasks",has:"Has dependencies",none:"No dependencies"}[v]||v; if (k==="due"){ var p=DUE_PRESETS.filter(function(x){ return x[0]===v; })[0]; return p?p[1]:v; } if (k==="archived") return "shown"; if (k==="hidden") return v==="only"?"hidden only":"shown"; if (k==="kind") return "In review"; return v; }
/* a filter shown as a chip and counted on the Filters button. On the Tasks page Hidden tasks: Hidden only is the
   Archived button pressed, which the page's title, the line under it and the button say in their own words; a chip
   "Hidden tasks: hidden only" beside them read as something else (ARCHIVED TASKS, below renderTasks). */
function filterChipOn(d){ var f=S.filters; return !!f[d[0]]&&!(d[0]==="hidden"&&f.hidden==="only"&&S.screen==="tasks"); }
function calFilterOpts(){ return S.screen==="calendar"?{noScope:true}:S.screen==="projects"?{noScope:true,noProject:true}:{}; }
/* The filter control and its chips, without the toolbar around them. */
/* filterInline("chips"): only the active filters' chips, which the calendar's row puts on a line of their own under its
   controls (as the task toolbar does), so a filter never pushes the month's controls onto a second line */
function filterInline(part){
  var o=calFilterOpts(), f=S.filters, defs=FILTER_DEFS(o), active=defs.filter(filterChipOn);
  if(f.kind) active.push(["kind","Stage kind"]);
  if(part!=="chips") return (o.noScope?"":segRadio("taskscope","Show",[["mine","Mine",I.user],["all","Team",I.team]],S.taskScope,"setTaskScope","cal-scope-seg"))
    + '<button data-tour="task-filters" class="iconbtn task-round-action'+(active.length?" active":"")+'" onclick="filterModal()" aria-label="'+attr(tr("Filters"))+'" title="'+attr(tr("Filters"))+'">'+I.filter+(active.length?'<span class="task-round-count">'+active.length+'</span>':"")+'</button>';
  return (active.length?'<div class="fchips cal-fchips">'+active.map(function(d){ var k=d[0]; return '<span class="fchip"'+(k==="team"?' title="'+attr(tr("Includes other teams' tasks assigned to its people"))+'"':'')+'>'+esc(tr(d[1]))+': <b>'+esc(filterLabel(k,f[k]))+'</b><button title="'+attr(tr("Remove"))+'" onclick="setFilter(\x27'+k+'\x27,\x27\x27)">'+I.x+'</button></span>'; }).join("")+(active.length>1?'<button class="btn xs ghost" onclick="clearFilters()">'+tr("Clear all")+'</button>':"")+'</div>':"");
}
function filterBar(opts){ opts=opts||{};
  /* In calendar views these controls live on the month row instead (see calendar()), so this
     toolbar would be an almost empty band above it. */
  if(S.taskView==="calendar") return "";
 var f=S.filters; var defs=FILTER_DEFS(opts); var active=defs.filter(filterChipOn); if (f.kind) active.push(["kind","Stage kind"]);
  var h='<div class="toolbar task-filter-toolbar" data-tour="task-filters"><div class="task-toolbar-primary">'+(opts.noScope?'':'<div class="seg"><button class="'+(S.taskScope==="mine"?"on":"")+'" onclick="S.taskScope=\'mine\';renderScreen(false)">Mine</button><button class="'+(S.taskScope==="all"?"on":"")+'" onclick="S.taskScope=\'all\';renderScreen(false)">All</button></div><button type="button" class="btn sm task-scope-toggle" aria-label="'+attr(tr("Scope"))+'" onclick="S.taskScope=S.taskScope===\'mine\'?\'all\':\'mine\';renderScreen(false)">'+(S.taskScope==="mine"?(UI_LANG==="id"?"Saya":"Mine"):tr("All"))+'</button>')+
    '<button data-tour="task-dependency-filter" class="iconbtn task-round-action'+(active.length?" active":"")+'" onclick="filterModal()" aria-label="Filters" title="Filters">'+I.filter+(active.length?'<span class="task-round-count">'+active.length+'</span>':'')+'</button></div>'+
    '<div class="fchips">'+active.map(function(d){ var k=d[0]; return '<span class="fchip"'+(k==="team"?' title="'+attr(tr("Includes other teams' tasks assigned to its people"))+'"':'')+'>'+esc(tr(d[1]))+': <b>'+esc(filterLabel(k,f[k]))+'</b>'+(k==="due"&&f.due==="custom"?' <span class="mono">'+esc(f.dueFrom||"…")+'→'+esc(f.dueTo||"…")+'</span>':'')+'<button title="Remove" onclick="setFilter(\''+k+'\',\'\')">'+I.x+'</button></span>'; }).join("")+(active.length>1?'<button class="btn xs ghost" onclick="clearFilters()">Clear all</button>':'')+'</div><span class="spacer"></span>';
  h=h.replace('<span class="spacer"></span>','<span class="spacer task-toolbar-spacer"></span><div class="task-toolbar-sort">');
  if (S.taskView!=="calendar"&&S.taskView!=="timeline") h+=pillSel("Sort",S.sort,[["manual","Manual"],["due","Due date"],["prio","Priority"],["created","Created"],["title","A → Z"],["status","Status"],["team","Team"],["assignee","Assignee"]],"S.sort=this.value;S.sortDir=1;renderScreen(false)")+'<button class="iconbtn task-sort-direction" title="Reverse sort" aria-label="Reverse sort" onclick="S.sortDir=-S.sortDir;renderScreen(false)">'+(S.sortDir>0?I.arrowdn:I.arrowup)+'</button>';
  if (S.taskView==="list"||S.taskView==="grid") h+=pillSel("Group",S.group,[["","None"],["status","Status"],["team","Team"],["assignee","Assignee"],["proj","Project"],["prio","Priority"],["due","Due date"]],"S.group=this.value;renderScreen(false)");
  if (S.taskView==="list") h+=listColBtn()+listColResetBtn();
  if (S.taskView==="grid") h+='<button class="btn sm task-fields-btn" aria-label="'+attr(tr("Fields"))+'" title="'+attr(tr("Fields"))+'" onclick="fieldsMenu(this)" data-menu>'+I.grid+'<span class="fields-label">Fields</span></button>';
  h+='</div><div class="task-toolbar-tail">'+taskCheckChip()+viewsMenuBtn(); return h+'</div></div>'; }
function filterModal(){ var f=S.filters; var defs=FILTER_DEFS({noProject:S.screen==="projects"&&S.projectId}); openModal("Filters",'<div class="fgrid">'+defs.map(function(d){ return fieldHtml("fm_"+d[0],d[1],selectHtml("fm_"+d[0],d[2],f[d[0]]||"",d[0]==="due"?'onchange="document.getElementById(\'fm_range\').style.display=this.value===\'custom\'?\'grid\':\'none\'"':'')); }).join("")+'</div><div id="fm_range" class="field-row" style="display:'+(f.due==="custom"?"grid":"none")+'">'+fieldHtml("fm_from","From",'<input id="fm_from" type="date" value="'+(f.dueFrom||iso(0))+'">')+fieldHtml("fm_to","To",'<input id="fm_to" type="date" value="'+(f.dueTo||iso(14))+'">')+'</div><p class="hint">Filters combine with AND. Save the result as a view to reuse it.</p>','<button class="btn ghost" onclick="closeModal();clearFilters()">Clear all</button><span class="spacer"></span><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="applyFilterModal()">Apply</button>',true); }
function applyFilterModal(){ useManualTaskFilters(); var defs=FILTER_DEFS({noProject:S.screen==="projects"&&S.projectId}); defs.forEach(function(d){ S.filters[d[0]]=val("fm_"+d[0]); }); if (S.filters.due==="custom"){ S.filters.dueFrom=val("fm_from"); S.filters.dueTo=val("fm_to"); } S.activeView=null; closeModal(); renderScreen(false); }
function viewsMenuBtn(){ var cur=S.activeView?byId(VIEWS,S.activeView):null; return '<button class="iconbtn task-round-action'+(cur?" active":"")+'" data-menu onclick="viewsMenu(this)" aria-label="Views" title="'+attr(cur?cur.name:"Views")+'">'+I.pin+'</button>'; }
function viewsMenu(anchor){ ctxMenu(anchor,'<div class="mh">Saved views</div>'+(VIEWS.length?VIEWS.map(function(v){ return '<button onclick="closePops();applyView(\''+v.id+'\')">'+I.pin+'<span style="flex:1">'+esc(v.name)+(S.activeView===v.id?" ✓":"")+'</span><span class="hint">'+esc(v.type)+'</span></button>'; }).join(""):'<div class="hint" style="padding:6px 10px">No saved views yet</div>')+'<div class="mh">This view</div><button onclick="closePops();saveViewModal()">'+I.plus+(S.activeView?"Save as new view":"Save current view")+'</button>'+(S.activeView?'<button onclick="closePops();updateView()">'+I.check+'Update “'+esc((byId(VIEWS,S.activeView)||{}).name)+'”</button><button onclick="closePops();renameView(\''+S.activeView+'\')">'+I.edit+'Rename</button><button onclick="closePops();deleteViewById(\''+S.activeView+'\');toast(\'View deleted\',\'bad\')">'+I.trash+'Delete</button><button onclick="closePops();S.activeView=null;clearFilters()">'+I.x+'Exit view</button>':'')); }
var GRID_FIELDS=[["status","Status"],["team","Team"],["assignee","Assignee"],["reviewer","Reviewer"],["proj","Project"],["prio","Priority"],["start","Start"],["due","Due"],["effort","Effort (h)"],["tags","Tags"]].concat((WS.customFields||[]).map(function(f){ return ["cf:"+f.id,locName(f)]; }));
function fieldsMenu(anchor){ var cf=(WS.customFields||[]).map(function(f){ return ["cf:"+f.id,locName(f)]; }); ctxMenu(anchor,'<div class="mh">Visible columns</div>'+GRID_FIELDS.slice(0,10).concat(cf).map(function(f){ var on=S.gridFields.indexOf(f[0])>=0; return '<button onclick="event.stopPropagation();toggleGridField(\''+f[0]+'\')"><span style="width:16px">'+(on?"✓":"")+'</span>'+esc(f[1])+'</button>'; }).join("")); }
function toggleGridField(k){ var i=S.gridFields.indexOf(k); if (i>=0) S.gridFields.splice(i,1); else S.gridFields.push(k); renderScreen(false); fieldsMenu(document.querySelector("[data-menu]")||document.body); }
function viewSnapshot(){ return {type:S.taskView,filters:clone(S.filters),sort:S.sort,group:S.group,fields:S.gridFields.slice(),config:{scope:S.taskScope,sortDir:S.sortDir}}; }
function applyView(id){ var v=byId(VIEWS,id); if (!v) return; S.taskView=v.type; S.filters=Object.assign(emptyTaskFilters(),v.filters||{}); S.sort=v.sort||"manual"; S.group=v.group||""; if (v.fields&&v.fields.length) S.gridFields=v.fields.slice(); S.taskScope=(v.config&&v.config.scope)||"all"; S.sortDir=(v.config&&v.config.sortDir)||1; S.activeView=id; if (S.screen!=="tasks") go("tasks"); else renderScreen(false); }
function saveViewModal(){ openModal("Save view",fieldHtml("sv_name","Name",'<input id="sv_name" placeholder="e.g. Design — this week">')+'<p class="hint">Saves the current view type, filters, sort, grouping and visible fields.</p>','<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="if(require([\'sv_name\'])){var v=Object.assign({id:uid(\'sv\'),name:val(\'sv_name\'),owner:ME},viewSnapshot());VIEWS.push(v);S.activeView=v.id;closeModal();toast(\'View saved\');renderScreen(false);persistView(v,true)}">Save</button>'); }
function updateView(){ var v=byId(VIEWS,S.activeView); if (!v) return; Object.assign(v,viewSnapshot()); toast("View updated"); renderScreen(false); persistView(v,false); }
function viewMenu(anchor,id){ ctxMenu(anchor,'<button onclick="closePops();renameView(\''+id+'\')">'+I.edit+'Rename</button><button onclick="closePops();deleteViewById(\''+id+'\');toast(\'View deleted\',\'bad\')">'+I.trash+'Delete view</button>'); }
function renameView(id){ var v=byId(VIEWS,id); openModal("Rename view",fieldHtml("sv_name","Name",'<input id="sv_name" value="'+attr(v.name)+'">'),'<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="if(require([\'sv_name\'])){var v=byId(VIEWS,\''+id+'\');v.name=val(\'sv_name\');closeModal();renderScreen(false);persistView(v,false)}">Save</button>'); }

function renderTasks(){ var pass=taskFilterPass(), list=pass.list, arch=S.filters.hidden==="only", view=S.activeView?' · '+tr("view")+' “'+esc((byId(VIEWS,S.activeView)||{}).name)+'”':'';
  var sub=arch?list.length+' '+tr(list.length===1?"task":"tasks")+' · '+esc(taskArchivedWhy())+view:list.length+' '+tr("tasks")+' · '+list.filter(function(x){return !isClosed(x);}).length+' '+tr("open")+view;
  var h=(arch?'<div class="task-archived-back"><button type="button" class="btn ghost sm" onclick="toggleArchivedTasks()">'+I.back+tr("Back to tasks")+'</button></div>':'')+'<div class="pagehead task-pagehead'+(arch?' task-archived-on':'')+'"><div><h1>'+tr(arch?"Archived tasks":S.taskScope==="mine"?"My tasks":"All tasks")+'</h1><div class="muted" style="margin-top:4px">'+sub+'</div></div><div class="actions">'+viewSwitch()+taskArchivedBtn(pass.archived,arch)+'<button class="btn task-export" aria-label="Excel" title="Excel" onclick="exportModal(\'xlsx\')">'+I.download+'<span class="task-export-label">Excel</span></button>'+(canI.createTask()?'<button class="btn primary task-new" aria-label="'+attr(tr("New task"))+'" title="'+attr(tr("New task"))+'" onclick="newTaskModal()">'+I.plus+'New task</button>':'')+'</div></div>'+filterBar();
  /* no archived task to show: what archives one, in place of an empty board, list, grid or timeline; the calendar
     keeps its month, whose row holds whose tasks and the filters, under the note */
  if (arch&&!list.length) h+=S.taskView==="calendar"?taskArchivedEmpty()+taskViewBody(list,arch):'<div data-tour="task-list" class="task-archived-list">'+taskArchivedEmpty()+'</div>';
  else h+=taskViewBody(list,arch);
  document.getElementById("content").innerHTML=h; }
function taskViewBody(list,arch){ var out=S.taskView==="kanban"?kanban(list):S.taskView==="list"?taskTable(list):S.taskView==="grid"?taskGrid(list):S.taskView==="calendar"?calendar(list):timeline(list); return '<div data-tour="task-list"'+(arch?' class="task-archived-list"':'')+'>'+out+'</div>'; }

/* ---------- ARCHIVED TASKS (Oct 2026) ----------
   "Satu tombol di Tasks untuk lihat task mana yang sudah diarsipkan": an archived task is one hidden from the board,
   by hand (t.hidden: the row menu's Archive, the task panel's Hide task) or automatically (autoHidden: done work older
   than Settings → Automation's rule). The List could already show them (Filters → Hidden tasks: Hidden only), a
   choice only there when such a task existed, so nobody found it. The page head now has the Archived button, before
   Excel, with how many archived tasks the scope and the other filters hold (taskFilterPass, the same pass as the
   list): it sets that filter to Hidden only (setFilter, as any filter: a saved view applied is let go of, a Home
   card's lens is kept as the person's own) and back to hidden, the view, the scope and the other filters as they
   are, in every view (the Calendar's too, which has no filter bar). While it is on the title is "Archived tasks",
   the line under it says how they got there, "Back to tasks" above the head turns it off, the Hidden tasks chip is
   not drawn beside them (filterChipOn), no card is greyed out, and nothing archived says so with what archives a
   task (or, with other filters on, what to change). A task's menu offers the way back: Unarchive for one archived by
   hand (the screen is drawn again at once, the task gone from it and the count one less), the rule for one archived
   automatically (src/enhance.js taskCtxArchive). Where the head is short of room the button shows its icon
   and count only, its name staying in aria-label and title (CSS below; the head keeps its rows at every width). */
/* the archive box Messages draws for an archived conversation, in the icons' style */
I.archive=I.archive||'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>';
function taskArchivedBtn(n,on){ var name=tr("Archived");
  return '<button type="button" class="btn task-archived'+(on?' on':'')+'" aria-pressed="'+(on?'true':'false')+'" aria-label="'+attr(name+' '+n)+'" title="'+attr(tr(on?"Back to tasks":"Show archived tasks"))+'" onclick="toggleArchivedTasks()">'+I.archive+'<span class="task-archived-label">'+esc(name)+'</span><span class="task-archived-count">'+n+'</span></button>'; }
function toggleArchivedTasks(){ var a=document.activeElement, kept=!!(a&&a.closest&&a.closest(".task-archived,.task-archived-back,.task-archived-empty"));
  setFilter("hidden",S.filters.hidden==="only"?"":"only");
  /* the focus, on one of them, goes to the button drawn again (the screen is drawn anew) */
  if (kept){ var b=document.querySelector("#content .task-archived"); if (b) b.focus({preventScroll:true}); } }
/* the Automation rule for tasks, in the reader's words ("previous months", "older than 30 days") */
function taskArchiveRule(){ var c=autoHideCfg(); return c.tasks==="month"?tr("previous months"):c.tasks==="quarter"?tr("previous quarters"):fmt(tr("older than {n} days"),{n:c.taskDays}); }
function taskArchivedWhy(){ return autoHideCfg().tasks==="off"?tr("archived by hand"):fmt(tr("archived by hand, or automatically when done ({rule})"),{rule:taskArchiveRule()}); }
/* none archived at all, or none the other filters let through (then, as an empty List says, what to change) */
function taskArchivedEmpty(){ var f=S.filters, off=autoHideCfg().tasks==="off", narrowed=Object.keys(f).some(function(k){ return f[k]&&k!=="hidden"&&k!=="dueFrom"&&k!=="dueTo"; });
  return '<div class="panel task-archived-empty">'+emptyBox(tr(narrowed?"No archived tasks match these filters":"No archived tasks"),esc(narrowed?tr("Clear a filter or switch to All tasks."):off?tr("Archive a task from its menu and it shows here."):fmt(tr("Archive a task from its menu, or done tasks are archived automatically ({rule})."),{rule:taskArchiveRule()})),I.archive,'<button type="button" class="btn sm" onclick="toggleArchivedTasks()">'+I.back+tr("Back to tasks")+'</button>')+'</div>'; }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({ "Archived tasks":"Task diarsipkan", "Back to tasks":"Kembali ke task",
  "Show archived tasks":"Tampilkan task diarsipkan", "No archived tasks":"Belum ada task yang diarsipkan",
  "No archived tasks match these filters":"Tidak ada task diarsipkan yang cocok dengan filter ini",
  "archived by hand":"diarsipkan manual", "archived by hand, or automatically when done ({rule})":"diarsipkan manual, atau otomatis setelah selesai ({rule})",
  "previous quarters":"kuartal-kuartal sebelumnya", "older than {n} days":"lebih dari {n} hari",
  "Archive a task from its menu and it shows here.":"Arsipkan task dari menunya, nanti task itu tampil di sini.",
  "Archive a task from its menu, or done tasks are archived automatically ({rule}).":"Arsipkan task dari menunya, atau task selesai diarsipkan otomatis ({rule}).",
  /* a task's menu (src/enhance.js taskCtxArchive) */
  "Archived automatically":"Diarsipkan otomatis",
  /* the Hidden tasks chip's value (filterLabel), where it is drawn: the Calendar page, a project */
  "hidden only":"hanya tersembunyi" });

/* ---------- DRAWING ONLY WHAT CAN BE SEEN (Oct 2026) ----------
   With 1,500 tasks the List drew 62,000 elements, the Kanban 28,500, the Timeline 79,000 and the Grid 135,000, and
   every sort, filter or group drew them all again: 1.3–1.6 s on a laptop, some 9 s on a slow phone.
   The List and the Grid show a page at a time: 100 rows, or when grouped 25 rows of each group, each group paging on
   its own (grouped by status, 100 rows a group still drew up to 1,000 rows: 2.1 s, 17 s on a slow phone; the owner
   chose pages). Under the rows (of each group) a pager: "‹ Prev", the page numbers with a "…" for those skipped (it
   goes to the middle of them), "Next ›" and "1–100 of 1,526". A page change draws only that table's or that group's
   rows and the pager, never the screen; the focus stays on the pager, and the top of the group or the table is
   scrolled into sight when it is out of it. A Kanban column draws its first 30 cards and a Timeline project its first
   30 tasks, then "Show 30 more" puts the next ones in where they belong. The page (List, Grid) or how many are shown
   (Kanban, Timeline) is kept for that view, sort, filter and group (S.vpage, so any redraw and a refresh keep it); a
   change of the List's or the Grid's filter, sort, group or scope goes back to page 1, and a page past the last (the
   tasks fewer now) becomes the last.
   - Counts, group totals and column counts are always the full numbers.
   - Select all (select mode) takes every task the view holds, on every page (bulkSelectAll).
   - A row or card dropped on another lands before it, as always, reading the whole list's order, not only the rows
     drawn; one dropped on a Kanban column's free space lands after the last card drawn there, where it can be seen.
   - A task opened from search, a link or a notification opens in its panel by id, drawn or not; the List stays on
     its page.
   - The browser's Print prints every row of every page.
   The Timeline also draws its day grid once, behind every row (tl-days), instead of 42 cells in each row. */
var VPAGE_SIZE={list:100,grid:100,kanban:30,timeline:30}, VPAGE_GROUP=25;
var VPAGE={g:{},roots:{},seq:0,last:{}};
function vpageHash(s){ var h=5381; for (var i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); }
/* what a count belongs to: the screen (and its project or team), the view, its scope, sort, grouping and filters (those
   set, in one order: the filters object does not always carry the empty ones) */
function vpageViewKey(view){ var f=S.filters||{}, fs=Object.keys(f).filter(function(k){ return f[k]; }).sort().map(function(k){ return k+"="+f[k]; }).join("&");
  return [S.screen,S.screen==="projects"?S.projectId||"":"",S.screen==="teams"?S.teamId||"":"",view,S.taskScope,S.sort,S.sortDir,view==="list"||view==="grid"?S.group||"":"",fs].join("|"); }
/* the same place without what sends the List or the Grid back to page 1 when it changes (scope, sort, group, filters) */
function vpageSlot(view){ return [S.screen,S.screen==="projects"?S.projectId||"":"",S.screen==="teams"?S.teamId||"":"",view].join("|"); }
/* a new drawing of a paged view (its element carries data-vroot); groups of drawings no longer on the page are forgotten.
   The List and the Grid page (R.paged): 100 rows a page, 25 a group when grouped */
function vpageBegin(view){ Object.keys(VPAGE.roots).forEach(function(r){ if (!document.querySelector('[data-vroot="'+r+'"]')) delete VPAGE.roots[r]; });
  Object.keys(VPAGE.g).forEach(function(id){ if (!VPAGE.roots[VPAGE.g[id].root]) delete VPAGE.g[id]; });
  var r="vr"+(++VPAGE.seq), key=vpageViewKey(view), R=VPAGE.roots[r]={view:view,key:key,order:null,paged:view==="list"||view==="grid"};
  if (R.paged){ R.pkey="p"+vpageHash(key); R.size=S.group?VPAGE_GROUP:(VPAGE_SIZE[view]||100);
    /* drawn last with another filter, sort, group or scope: page 1 (a refresh, a redraw or coming back keeps the page) */
    var slot=vpageSlot(view); if (VPAGE.last[slot]!==undefined&&VPAGE.last[slot]!==key) vpageStore(R.pkey,null); VPAGE.last[slot]=key; }
  return r; }
/* one group's rows as drawn now. List, Grid: the page kept for this view and group (1 at first; the last when the tasks
   are fewer now). Kanban, Timeline: the first 30, or as many as were shown last */
function vpageGroup(root,gk,list,row){ var R=VPAGE.roots[root], id="vg"+(++VPAGE.seq), e;
  if (R.paged){ var was=vpagePageOf(R.pkey,gk), page=Math.min(Math.max(1,was),Math.max(1,Math.ceil(list.length/R.size)));
    if (was>page) vpageSetPage(R.pkey,gk,page);
    e=VPAGE.g[id]={root:root,key:R.pkey,gk:gk,list:list,size:R.size,row:row,page:page,paged:true};
    return {id:id,e:e,html:list.slice((page-1)*R.size,page*R.size).map(function(t){ return row(t); }).join("")}; }
  var size=VPAGE_SIZE[R.view]||100, key=vpageHash(R.key+"|"+gk), was2=(S.vpage&&S.vpage[key])|0;
  e=VPAGE.g[id]={root:root,key:key,list:list,size:size,row:row,shown:Math.min(list.length,Math.max(size,was2))};
  return {id:id,e:e,html:list.slice(0,e.shown).map(function(t){ return row(t); }).join("")}; }
function vpageCountText(e){ return tr("{n} of {total} shown").replace("{n}",e.shown).replace("{total}",e.list.length); }
function vpageBtnText(e){ return tr("Show {n} more").replace("{n}",Math.min(e.size,e.list.length-e.shown)); }
/* ---- the List's and the Grid's pager ---- */
/* numbers as the app writes them elsewhere: 1,526 / 1.526 */
function vpageNum(n){ try { return Number(n).toLocaleString(UI_LANG==="id"?"id-ID":"en-US"); } catch(x){ return String(n); } }
function vpagePages(e){ return Math.max(1,Math.ceil(e.list.length/e.size)); }
function vpageRangeText(e){ return fmt(tr("{from}–{to} of {total}"),{from:vpageNum(Math.min(e.list.length,(e.page-1)*e.size+1)),to:vpageNum(Math.min(e.list.length,e.page*e.size)),total:vpageNum(e.list.length)}); }
/* every page up to 7, else seven places: the first and the last, the page shown with one each side, and a gap [from,to]
   for the pages skipped (1 2 3 4 5 … 16 · 1 … 7 8 9 … 16 · 1 … 12 13 14 15 16), so Prev and Next keep their places */
function vpageItems(page,pages){ var out=[]; if (pages<=7){ for (var i=1;i<=pages;i++) out.push(i); return out; }
  if (page<=4) return [1,2,3,4,5,[6,pages-1],pages];
  if (page>=pages-3) return [1,[2,pages-5],pages-4,pages-3,pages-2,pages-1,pages];
  return [1,[2,page-2],page-1,page,page+1,[page+2,pages-1],pages]; }
function vpageNumsHtml(e){ return vpageItems(e.page,vpagePages(e)).map(function(p){
    if (Array.isArray(p)){ var mid=Math.floor((p[0]+p[1])/2), t=fmt(tr("Pages {from}–{to}: go to page {n}"),{from:vpageNum(p[0]),to:vpageNum(p[1]),n:vpageNum(mid)});
      return '<button type="button" class="vpager-num vpager-gap" data-pg="'+mid+'" aria-label="'+attr(t)+'" title="'+attr(t)+'" onclick="vpageGo(this)">…</button>'; }
    return '<button type="button" class="vpager-num'+(p===e.page?' on" aria-current="page':'')+'" data-pg="'+p+'" aria-label="'+attr(fmt(tr("Page {n}"),{n:vpageNum(p)}))+'" onclick="vpageGo(this)">'+vpageNum(p)+'</button>'; }).join(""); }
function vpagePagerHtml(e,label){ var pages=vpagePages(e);
  return '<nav class="vpager" aria-label="'+attr(label)+'"><button type="button" class="btn sm vpager-step vpager-prev" data-pg="'+(e.page-1)+'"'+(e.page<=1?' disabled':'')+' aria-label="'+attr(tr("Previous page"))+'" onclick="vpageGo(this)"><span aria-hidden="true">‹</span><span class="vpager-txt">'+esc(tr("Prev"))+'</span></button>'
    +'<span class="vpager-nums">'+vpageNumsHtml(e)+'</span>'
    +'<button type="button" class="btn sm vpager-step vpager-next" data-pg="'+(e.page+1)+'"'+(e.page>=pages?' disabled':'')+' aria-label="'+attr(tr("Next page"))+'" onclick="vpageGo(this)"><span class="vpager-txt">'+esc(tr("Next"))+'</span><span aria-hidden="true">›</span></button>'
    +'<span class="vpage-n vpager-range" role="status">'+esc(vpageRangeText(e))+'</span></nav>'; }
/* the pager after its page changed: in place, so the range line (role=status) reads the new one out */
function vpagerUpdate(host,e){ var pages=vpagePages(e), p=host.querySelector(".vpager-prev"), n=host.querySelector(".vpager-next"), nums=host.querySelector(".vpager-nums"), r=host.querySelector(".vpager-range");
  if (p){ p.disabled=e.page<=1; p.setAttribute("data-pg",e.page-1); } if (n){ n.disabled=e.page>=pages; n.setAttribute("data-pg",e.page+1); }
  if (nums) nums.innerHTML=vpageNumsHtml(e); if (r) r.textContent=vpageRangeText(e); }
/* one group's (or the table's) rows: the page asked for — or every page (all: printing) — in place of those shown,
   between the group's header (or the table's top) and its pager; nothing else is drawn again */
function vpageShow(host,e,page,all){ page=Math.min(Math.max(1,page|0),vpagePages(e));
  for (var n=host.previousElementSibling; n&&!n.classList.contains("grp")&&!n.classList.contains("vpage-row"); n=host.previousElementSibling) n.remove();
  var part=(all?e.list:e.list.slice((page-1)*e.size,page*e.size)).map(function(t){ return task(t.id); }).filter(Boolean), prev=host.previousSibling, added=[];
  host.insertAdjacentHTML("beforebegin",part.map(function(t){ return e.row(t); }).join(""));
  for (var m=prev?prev.nextSibling:host.parentNode.firstChild; m&&m!==host; m=m.nextSibling) if (m.nodeType===1) added.push(m);
  added.forEach(function(x){ localizeVisibleText(x); });
  if (!all){ e.page=page; vpageSetPage(e.key,e.gk,page); vpagerUpdate(host,e); }
  if (typeof ENH!=="undefined"&&ENH.bulk&&typeof bulkInject==="function") bulkInject(); }
/* a pager's button: Prev, Next, a page or a "…". The focus stays on the pager — on Prev or Next while it can still be
   used, else on the page now shown — and the top of the group (its header) or of the table comes into sight */
function vpageGo(btn){ var host=btn&&btn.closest?btn.closest("[data-vpage]"):null, e=host&&VPAGE.g[host.getAttribute("data-vpage")]; if (!e||!e.paged||!host.parentNode||btn.disabled) return;
  var step=btn.classList.contains("vpager-prev")?"prev":btn.classList.contains("vpager-next")?"next":"", had=host.contains(document.activeElement);
  vpageShow(host,e,+btn.getAttribute("data-pg")||1);
  var to=(step&&host.querySelector(".vpager-"+step+":not([disabled])"))||host.querySelector('.vpager-num[aria-current="page"]');
  if (had&&to) try { to.focus({preventScroll:true}); } catch(x){}
  vpageReveal(host); }
/* the group's header row, or the table, scrolled into sight when its top is out of it — in the Grid's own box (under
   its sticky header) and in the page */
function vpageReveal(host){ var n=host.previousElementSibling; while (n&&!n.classList.contains("grp")&&!n.classList.contains("vpage-row")) n=n.previousElementSibling;
  var el=n&&n.classList.contains("grp")?n:host.closest("table"); if (!el) return;
  var th=el.tagName==="TR"?el.closest("table").querySelector("thead th"):null;
  for (var p=el.parentElement; p&&p!==document.body&&p!==document.documentElement; p=p.parentElement){ if (p.scrollHeight<=p.clientHeight+1||!/(auto|scroll)/.test(getComputedStyle(p).overflowY)) continue;
    var pr=p.getBoundingClientRect(), r=el.getBoundingClientRect(), lim=pr.top+(th&&p.contains(th)&&getComputedStyle(th).position==="sticky"?th.getBoundingClientRect().height:0);
    if (r.top<lim||r.top>pr.bottom-48) p.scrollTop+=r.top-lim-8; }
  var w=el.getBoundingClientRect(); if (w.top<0||w.top>window.innerHeight-48) window.scrollBy(0,w.top-8); }
/* after a group's drawn rows: List, Grid — the pager, while there is more than one page (a table row; label names the
   group); Kanban, Timeline — while some are not drawn, a box in a column or a Timeline row with "Show 30 more" */
function vpageMoreHtml(g,kind,extra,label){ if (g.e.paged){ if (vpagePages(g.e)<=1) return "";
    return '<tr class="vpage-row vpager-row" data-vpage="'+g.id+'"><td colspan="'+extra+'">'+vpagePagerHtml(g.e,label?tr("Pages")+": "+tr(label):tr("Pages"))+'</td></tr>'; }
  if (g.e.shown>=g.e.list.length) return "";
  var inner='<span class="vpage-n" role="status">'+esc(vpageCountText(g.e))+'</span><button type="button" class="btn sm vpage-btn" onclick="vpageMore(this)">'+esc(vpageBtnText(g.e))+'</button>';
  if (kind==="tr") return '<tr class="vpage-row" data-vpage="'+g.id+'"><td colspan="'+extra+'"><div class="vpage">'+inner+'</div></td></tr>';
  if (kind==="tl") return '<div class="tl-row vpage-tl" data-vpage="'+g.id+'" style="grid-template-columns:'+extra.cols+'"><div class="tl-lbl vpage">'+inner+'</div>'+extra.today+'</div>';
  return '<div class="vpage vpage-k" data-vpage="'+g.id+'">'+inner+'</div>'; }
/* S.vpage: how many are shown (Kanban, Timeline: a number) or the pages (List, Grid: {group: page}, page 1 left out),
   the 40 used last */
function vpageStore(key,v){ var m=S.vpage&&typeof S.vpage==="object"&&!Array.isArray(S.vpage)?S.vpage:{}; delete m[key]; if (v!=null) m[key]=v; var ks=Object.keys(m); while (ks.length>40) delete m[ks.shift()]; S.vpage=m; }
function vpageKeep(key,n){ vpageStore(key,n); }
function vpagePageOf(pkey,gk){ var o=S.vpage&&S.vpage[pkey]; return o&&typeof o==="object"&&Object.prototype.hasOwnProperty.call(o,gk)?(o[gk]|0):0; }
function vpageSetPage(pkey,gk,page){ var o=S.vpage&&S.vpage[pkey], c={}; if (o&&typeof o==="object"&&!Array.isArray(o)) Object.keys(o).forEach(function(k){ c[k]=o[k]; }); if (page>1) c[gk]=page; else delete c[gk]; vpageStore(pkey,Object.keys(c).length?c:null); }
/* "Show N more": the next rows go in just before this row, in place; the screen is not drawn again.
   all: every row left, not kept (printing) */
function vpageMore(btn,all){ var host=btn&&btn.closest?btn.closest("[data-vpage]"):null, e=host&&VPAGE.g[host.getAttribute("data-vpage")]; if (!e||!host.parentNode) return;
  var to=all?e.list.length:Math.min(e.list.length,e.shown+e.size), part=e.list.slice(e.shown,to).map(function(t){ return task(t.id); }).filter(Boolean), prev=host.previousSibling, added=[];
  host.insertAdjacentHTML("beforebegin",part.map(function(t){ return e.row(t); }).join(""));
  for (var n=prev?prev.nextSibling:host.parentNode.firstChild; n&&n!==host; n=n.nextSibling) if (n.nodeType===1) added.push(n);
  e.shown=to; if (!all) vpageKeep(e.key,to);
  added.forEach(function(x){ localizeVisibleText(x); });
  if (to>=e.list.length){ var had=host.contains(document.activeElement), next=added.length?added[0].querySelector("button,input,select,[tabindex]"):null; host.remove(); if (had&&next) try { next.focus({preventScroll:true}); } catch(x){} }
  else { var c=host.querySelector(".vpage-n"), b=host.querySelector(".vpage-btn"); if (c) c.textContent=vpageCountText(e); if (b) b.textContent=vpageBtnText(e); }
  if (typeof ENH!=="undefined"&&ENH.bulk&&typeof bulkInject==="function") bulkInject(); }
/* the browser's Print still prints every row: the rest is drawn first, in place, and not kept — a List's or a Grid's
   group goes back to its page after printing, a Kanban column or a Timeline project at the next redraw */
window.addEventListener("beforeprint",function(){ document.querySelectorAll("#content [data-vpage]").forEach(function(h){ var e=VPAGE.g[h.getAttribute("data-vpage")];
  if (e&&e.paged){ vpageShow(h,e,e.page,true); h.setAttribute("data-vprint","1"); } else vpageMore(h,true); }); });
window.addEventListener("afterprint",function(){ document.querySelectorAll("#content [data-vprint]").forEach(function(h){ var e=VPAGE.g[h.getAttribute("data-vpage")]; h.removeAttribute("data-vprint"); if (e) vpageShow(h,e,e.page); }); });
/* the whole list's order, drawn or not, for a drop on a row (lDrop) */
function vpageOrder(el){ var r=el&&el.closest?el.closest("[data-vroot]"):null, R=r&&VPAGE.roots[r.getAttribute("data-vroot")]; return R&&R.order?R.order:null; }
/* every task the view on the page holds, drawn or not */
function vpageAllIds(){ var out=[], seen={}, on={};
  Object.keys(VPAGE.g).forEach(function(id){ var e=VPAGE.g[id]; if (!(e.root in on)) on[e.root]=!!document.querySelector('#content [data-vroot="'+e.root+'"]'); if (!on[e.root]) return;
    e.list.forEach(function(t){ if (!seen[t.id]&&task(t.id)){ seen[t.id]=1; out.push(t.id); } }); });
  return out; }
/* Select all, in select mode (src/enhance.js): every task the view holds, not only the rows and cards drawn */
function bulkSelectAll(){ document.querySelectorAll(".bulk-check input[data-bulk-id]").forEach(function(c){ c.checked=true; bulkMark(c); ENH.bulkSel[c.getAttribute("data-bulk-id")]=true; }); vpageAllIds().forEach(function(id){ ENH.bulkSel[id]=true; }); bulkBar(); }

/* ---------- KANBAN (drag within column = REORDER_TASK, between columns = MOVE_TASK_STATUS) ---------- */
function kanban(list){ var root=vpageBegin("kanban"); return '<div class="kanban" data-vroot="'+root+'">'+localStages().map(function(s){ var col=sortedTasks(list.filter(function(x){ return x.status===s.id; })), pg=vpageGroup(root,s.id,col,kcard); return '<div class="kcol" data-status="'+s.id+'" ondragover="kOver(event,this)" ondragleave="this.classList.remove(\'over\')" ondrop="kDrop(event,\''+s.id+'\',this,null)"><div class="kcol-head '+s.kind+'"><span class="kdot"></span>'+esc(s.name)+'<span class="cnt">'+col.length+'</span></div><div class="kcol-body">'+pg.html+vpageMoreHtml(pg,"k")+(col.length?'':'<div class="empty" style="padding:18px 8px"><p>Drop a card here</p></div>')+'</div>'+(canI.createTask()?'<button class="kadd" onclick="newTaskModal({status:\''+s.id+'\'})">+ Add task</button>':'')+'</div>'; }).join("")+'</div>'; }
function kcard(tk){ var v=tk.versions.length?tk.versions[tk.versions.length-1]:null; var dim=tk.hidden||autoHidden(tk); return '<div class="kcard'+(dim?" dim":"")+(taskChecked(tk.id)?" checked":"")+'" style="--tc:'+taskCardColor(tk,"kanban")+'" draggable="true" data-id="'+attr(tk.id)+'" data-status="'+attr(tk.status)+'" ondragstart="kStart(event,taskIdFrom(this))" ondragend="kEnd(this)" ondragover="kCardOver(event,this)" ondragleave="this.classList.remove(\'drop-before\')" ondrop="kDrop(event,this.getAttribute(\'data-status\'),this.closest(\'.kcol\'),taskIdFrom(this))" onclick="openTask(taskIdFrom(this))">'+(v?'<div class="kthumb" style="background:'+(v.img?"url("+v.img+") center/cover":v.color)+'">V'+v.n+(v.state==="approved"?" · approved":"")+'</div>':'')+labelChips(tk,true)+'<div class="kt-line">'+taskCheckBtn(tk.id)+'<div class="kt">'+esc(tk.title)+'</div></div><div class="km">'+(dim?'<span class="badge muted-badge" title="'+(tk.hidden?"Hidden manually":"Auto-hidden \u00b7 "+attr(autoHideLabel()))+'">'+(tk.hidden?"hidden":"archived")+'</span>':'')+dependencyBadge(tk,false)+requestBadge(tk)+teamBadge(tk.team)+'<span>'+esc(projName(tk))+'</span></div><div class="kf"><span style="display:flex;gap:6px;align-items:center"><span class="prio '+attr(tk.prio)+'" style="height:12px" title="'+prioL(tk.prio)+'"></span><span class="due '+dueCls(tk.due,tk)+'">'+dueTxt(tk.due)+'</span>'+(tk.effort?'<span class="tiny muted mono">'+tk.effort+'h</span>':'')+(assetCount(tk)?assetBadge(tk):'')+'</span>'+avStack(assigneesOf(tk))+'</div></div>'; }
var DRAG=null, DEP_STATUS_CONTINUE=null;
function needsDependencyWarning(tk,status){ var kind=stageKind(status); return isTaskBlocked(tk)&&(kind==="work"||kind==="review"||kind==="closed"); }
function confirmDependencyStatusMove(tk,status,done){ if(!needsDependencyWarning(tk,status)) return done(); var blocked=unresolvedDependencies(tk); DEP_STATUS_CONTINUE=done; openModal("Task still has unresolved dependencies",'<p>This task is blocked by:</p><ul style="margin:8px 0 0;padding-left:20px">'+blocked.map(function(x){return '<li><b>'+esc(x.title)+'</b> · '+esc(stageName(x.status))+'</li>';}).join("")+'</ul><p class="hint" style="margin-top:12px">You can still move it to '+esc(stageName(status))+' when work has started early.</p>','<button class="btn" onclick="DEP_STATUS_CONTINUE=null;closeModal()">Cancel</button><button class="btn primary" onclick="var fn=DEP_STATUS_CONTINUE;DEP_STATUS_CONTINUE=null;closeModal();if(fn)fn()">Move anyway</button>',true); }
function kStart(e,id){ DRAG=id; e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain",id); e.stopPropagation(); setTimeout(function(){ var el=document.querySelector('.kcard[data-id="'+id+'"]'); if (el) el.classList.add("drag"); },0); }
function kEnd(el){ el.classList.remove("drag"); document.querySelectorAll(".drop-before,.kcol.over").forEach(function(x){ x.classList.remove("drop-before","over"); }); }
function kOver(e,col){ e.preventDefault(); col.classList.add("over"); }
function kCardOver(e,card){ e.preventDefault(); e.stopPropagation(); card.classList.add("drop-before"); }
function kDrop(e,status,col,beforeId){ e.preventDefault(); e.stopPropagation(); col.classList.remove("over"); document.querySelectorAll(".drop-before").forEach(function(x){ x.classList.remove("drop-before"); }); var id=DRAG||e.dataTransfer.getData("text/plain"); var tk=task(id); DRAG=null; if (!tk||id===beforeId) return;
  var colTasks=sortedTasks(filteredTasks().filter(function(x){ return x.status===status&&x.id!==id; })); var idx=beforeId?colTasks.findIndex(function(x){ return x.id===beforeId; }):colTasks.length;
  /* dropped on the free space of a column with cards not drawn: after the last card drawn there, and the column draws
     one card more, so it can be seen (with every card drawn it went to the very end, out of sight) */
  var more=!beforeId&&col?col.querySelector(".vpage[data-vpage]"):null, grow=null;
  if (more){ var drawn=Array.prototype.map.call(col.querySelectorAll(".kcard[data-id]"),function(c){ return c.getAttribute("data-id"); }), lastId=drawn.filter(function(x){ return x!==id; }).pop(); idx=colTasks.findIndex(function(x){ return x.id===lastId; })+1; if (drawn.indexOf(id)<0) grow=VPAGE.g[more.getAttribute("data-vpage")]||null; }
  var keepIt=function(){ if (grow&&S.sort==="manual") vpageKeep(grow.key,grow.shown+1); };
  var after=idx>0?colTasks[idx-1]:null, before=idx<colTasks.length?colTasks[idx]:null; var newSort=rankBetween(after,before,tk.sort);
  if (tk.status===status){ if (S.sort!=="manual") return toast("Switch sort to Manual to reorder cards"); keepIt(); moveTask(tk,{type:"REORDER_TASK",afterTaskId:after?after.id:null,beforeTaskId:before?before.id:null},function(t){ t.sort=newSort; }); }
  else { var from=tk.status, run=function(){ keepIt(); moveTask(tk,{type:"MOVE_TASK_STATUS",fromStatusId:from,toStatusId:status,afterTaskId:after?after.id:null,beforeTaskId:before?before.id:null},function(t){ t.status=status; t.sort=newSort; }).then(function(saved){ if(saved===false)return false; toast("Moved to “"+stageName(status)+"”"); }); }; confirmDependencyStatusMove(tk,status,run); } }

/* ---------- LIST (grouping, drag reorder, drag between groups) ---------- */
function setSort(k){ if (S.sort===k) S.sortDir=-S.sortDir; else { S.sort=k; S.sortDir=1; } renderScreen(false); }
/* v38 fixed column widths (px) by column type: the table no longer re-measures itself from its content, so switching Mine/All or filters can't shift columns.
   Due is two lines (Oct 2026) — the date, then how far off — so its room went to the narrow ones: dependency, team, project.
   Since the List's columns can be moved and sized (Oct 2026, src/list-columns.js) these are the List's defaults. */
var LIST_COL_W={check:40,drag:28,title:164,status:116,dependency:96,team:132,assignee:124,proj:130,prio:80,start:66,due:92,effort:48,tags:76};
var GRID_COL_W={drag:32,title:230,status:130,team:150,assignee:160,reviewer:160,proj:170,prio:100,start:130,due:130,effort:90,tags:200};
function colW(map,k){ return map[k]||(String(k).indexOf("cf:")===0?140:120); }
/* The List's columns (Oct 2026): this ONE ordered list draws the header, each row's cells and the group rows' span,
   so they cannot disagree. Check and drag stay first; the rest come in the person's order and widths
   (src/list-columns.js). Once the person has sized a column Task has no width of its own on the page: it takes the
   room left, at least its width (before that, spare room is shared by all, as it always was).
   Cells carry lcol-<key> for the phone's cards. sort: a click on the header sorts by the same key. */
var LIST_COLS=[
  {k:"title",l:"Task",sort:true,td:function(x){ return '<td class="t lcol-title"><div>'+esc(x.title)+'</div><div class="mono tiny muted">'+esc(x.id)+'</div></td>'; }},
  {k:"status",l:"Status",sort:true,td:function(x){ return '<td class="lcol-status" onclick="event.stopPropagation();statusMenu(this,taskIdFrom(this))">'+statusBadge(x.status)+'</td>'; }},
  {k:"dependency",l:"Dependency",td:function(x){ return '<td class="lcol-dependency">'+dependencyBadge(x,false)+'</td>'; }},
  {k:"team",l:"Team",sort:true,td:function(x){ return '<td class="lcol-team">'+teamBadge(x.team)+'</td>'; }},
  {k:"assignee",l:"Assignee",sort:true,td:function(x){ return '<td class="lcol-assignee"><span class="cell-flex">'+avStack(assigneesOf(x))+esc(assigneesOf(x).map(first).join(", "))+'</span></td>'; }},
  {k:"proj",l:"Project",sort:true,td:function(x){ return '<td class="lcol-proj">'+esc(projName(x))+'</td>'; }},
  {k:"prio",l:"Priority",sort:true,td:function(x){ return '<td class="lcol-prio" onclick="event.stopPropagation();prioMenu(this,taskIdFrom(this))"><span class="cell-flex"><span class="prio '+attr(x.prio)+'" style="height:14px"></span>'+prioL(x.prio)+'</span></td>'; }},
  {k:"start",l:"Start",td:function(x){ return '<td class="mono lcol-start">'+dueDate(x.due-x.span)+'</td>'; }},
  {k:"due",l:"Due",sort:true,td:function(x){ return '<td class="lcol-due"><span class="due due-2 '+dueCls(x.due,x)+'"><span class="due-day">'+dueDate(x.due)+'</span><span class="due-rel">'+dueTxt(x.due)+'</span></span></td>'; }},
  {k:"effort",l:"Est.",sort:true,td:function(x){ return '<td class="mono lcol-effort">'+(x.effort||"—")+'h</td>'; }},
  {k:"tags",l:"Tags",td:function(x){ return '<td class="lcol-tags">'+x.tags.slice(0,3).map(function(t){ return '<span class="badge">'+esc(t)+'</span> '; }).join("")+'</td>'; }}
];
var LIST_COL_BY={}; LIST_COLS.forEach(function(c){ LIST_COL_BY[c.k]=c; });
function taskTable(list){ var k=S.sort, root=vpageBegin("list");   /* begun when empty too: a filter that empties the List and is taken off again still starts at page 1 */
  if (!list.length) return '<div class="panel">'+emptyBox("No tasks match these filters","Clear a filter or switch to All tasks.")+'</div>';
  var cols=listColShown().map(function(c){ return LIST_COL_BY[c]; }), min=LIST_COL_W.check+LIST_COL_W.drag, sized=listColSized(), tip=attr(tr("Drag to move · drag the edge to resize"));
  var head=cols.map(function(c){ var w=listColWidth(c.k), on=!!c.sort&&k===c.k; min+=w;
    return '<th data-col="'+c.k+'" class="lcol-th'+(c.sort?" lcol-sortable":"")+(on?" on":"")+'"'+(c.k==="title"&&sized?"":' style="width:'+w+'px"')+' tabindex="0" aria-describedby="lcolHelp" title="'+tip+'"'+(on?' aria-sort="'+(S.sortDir>0?"ascending":"descending")+'"':"")+(c.sort?' onclick="lcolSort(event,'+jsq(c.k)+')"':"")+' onpointerdown="lcolDown(event,this)" onkeydown="lcolKey(event,this)"><span class="lcol-lbl">'+esc(tr(c.l))+'</span>'+(on?'<span class="lcol-dir" aria-hidden="true">'+(S.sortDir>0?" ↑":" ↓")+'</span>':"")+'<span class="lcol-rz" aria-hidden="true" onpointerdown="lcolRzDown(event,this)" ondblclick="lcolRzReset(event,this)" onclick="event.stopPropagation()"></span></th>'; }).join("");
  var row=function(x){ return '<tr draggable="true" data-id="'+attr(x.id)+'" ondragstart="kStart(event,taskIdFrom(this))" ondragend="lEnd(this)" ondragover="lRowOver(event,this)" ondragleave="this.classList.remove(\'drop-before\')" ondrop="lDrop(event,this)" onclick="openTask(taskIdFrom(this))" class="'+(taskChecked(x.id)?'checked':'')+'"><td class="tcheck-col" onclick="event.stopPropagation()">'+taskCheckBtn(x.id)+'</td><td class="drag-h">'+I.drag+'</td>'+cols.map(function(c){ return c.td(x); }).join("")+'</tr>'; };
  /* a page of 100 rows, or 25 of each group, and the pager under them — see DRAWING ONLY WHAT CAN BE SEEN */
  var span=2+cols.length, order=[], body="";
  if (S.group){ groupedTasks(sortedTasks(list),S.group).forEach(function(g){ var gl=groupLabel(g.key,S.group), pg=vpageGroup(root,"g:"+g.key,g.tasks,row); order=order.concat(g.tasks); body+='<tr class="grp" data-group="'+attr(g.key)+'" ondragover="event.preventDefault();this.classList.add(\'over\')" ondragleave="this.classList.remove(\'over\')" ondrop="lGroupDrop(event,this,'+jsq(g.key)+')"><td colspan="'+span+'"><span style="display:inline-flex;align-items:center;gap:8px">'+(gl.c?'<span class="tdot" style="--tc:'+gl.c+'"></span>':'')+esc(gl.l)+'<span class="cnt">'+g.tasks.length+'</span>'+(S.group==="assignee"&&g.key?'<span class="hint mono">'+assigned(g.key)+'h / '+person(g.key).cap+'h</span>':'')+'</span></td></tr>'+pg.html+vpageMoreHtml(pg,"tr",span,gl.l); }); }
  else { order=sortedTasks(list); var pg=vpageGroup(root,"",order,row); body=pg.html+vpageMoreHtml(pg,"tr",span); }
  VPAGE.roots[root].order=order.map(function(x){ return x.id; });
  return '<div class="panel"><div class="tbl-wrap lcol-wrap"><table class="tbl tbl-fixed lcol-tbl'+(sized?" lcol-sized":"")+'" data-vroot="'+root+'" style="--tbl-min:'+min+'px"><thead ontouchmove="lcolTouch(event)" oncontextmenu="lcolMenu(event)"><tr><th class="tcheck-col" style="width:'+LIST_COL_W.check+'px"></th><th style="width:'+LIST_COL_W.drag+'px"></th>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div><div class="panel-foot hint">Drag rows to reorder (Manual sort) or drop them on a group header to change status, team, assignee, project or priority. Click a status or priority to change it.</div><span id="lcolHelp" class="zc-sr">'+esc(tr("Drag a header to move its column, or its right edge to size it; double-click the edge for the usual width. On a focused header: Alt+Left/Right moves it, Alt+Shift+Left/Right sizes it, Enter sorts, Shift+F10 opens its menu to hide it or choose the columns."))+'</span></div>'; }
function lEnd(el){ el.classList.remove("dragging"); document.querySelectorAll(".drop-before,.grp.over").forEach(function(x){ x.classList.remove("drop-before","over"); }); }
function lRowOver(e,tr){ e.preventDefault(); e.stopPropagation(); tr.classList.add("drop-before"); }
function lDrop(e,tr){ e.preventDefault(); e.stopPropagation(); tr.classList.remove("drop-before"); var id=DRAG||e.dataTransfer.getData("text/plain"); DRAG=null; var tk=task(id), target=task(tr.getAttribute("data-id")); if (!tk||!target||tk===target) return;
  var ops=[]; if (S.group){ var gk=groupKey(target,S.group); if (groupKey(tk,S.group)!==gk){ var op=groupOp(S.group,gk); if (op) ops.push(op); } }
  /* the whole list's order — the rows not drawn too — so a drop lands where it would with every row drawn */
  var listIds=(vpageOrder(tr)||Array.prototype.map.call(document.querySelectorAll(".tbl tbody tr[data-id]"),function(r){ return r.getAttribute("data-id"); })).filter(function(x){ return x!==id; }); var idx=listIds.indexOf(target.id); var after=idx>0?task(listIds[idx-1]):null; var newSort=rankBetween(after,target,tk.sort);
  if (S.sort!=="manual"&&!ops.length) return toast("Switch sort to Manual to reorder rows");
  var run=function(){ if (S.sort==="manual") moveTask(tk,{type:"REORDER_TASK",afterTaskId:after?after.id:null,beforeTaskId:target.id},function(t){ t.sort=newSort; }); };
  if (ops.length){ var o=ops[0]; var apply=o.apply; delete o.apply; moveTask(tk,o,apply).then(run); } else run(); }
function lGroupDrop(e,tr,key){ e.preventDefault(); tr.classList.remove("over"); var id=DRAG||e.dataTransfer.getData("text/plain"); DRAG=null; var tk=task(id); if (!tk) return; if (groupKey(tk,S.group)===key) return; var op=groupOp(S.group,key); if (!op) return toast("Can't move into a due-date group — change the date instead"); var apply=op.apply; delete op.apply; moveTask(tk,op,apply).then(function(saved){ if(saved===false)return false; toast("Moved to "+groupLabel(key,S.group).l); }); }
function statusMenu(anchor,id){ var tk=task(id); if (!canI.editTask(tk)) return; ctxMenu(anchor,'<div class="mh">Move to</div>'+localStages().map(function(s){ return '<button onclick="closePops();setStatus(\''+id+'\',\''+s.id+'\')"><span class="kdot" style="width:9px;height:9px;border-radius:50%;background:'+(s.kind==="closed"?"var(--color-success)":s.kind==="review"?"var(--color-warning)":s.kind==="revision"?"var(--color-danger)":"var(--color-primary)")+'"></span>'+esc(s.name)+(tk.status===s.id?" ✓":"")+'</button>'; }).join("")); }
function prioMenu(anchor,id){ var tk=task(id); if (!canI.editTask(tk)) return; ctxMenu(anchor,'<div class="mh">Priority</div>'+PRIOS.map(function(p){ return '<button onclick="closePops();setPrio(\''+id+'\',\''+p[0]+'\')"><span class="prio '+p[0]+'" style="height:12px"></span>'+p[1]+(tk.prio===p[0]?" ✓":"")+'</button>'; }).join("")); }
function setStatus(id,st,done){ var tk=task(id); if (tk.status===st) return; confirmDependencyStatusMove(tk,st,function(){ moveTask(tk,{type:"MOVE_TASK_STATUS",fromStatusId:tk.status,toStatusId:st},function(t){ t.status=st; }).then(function(saved){ if(saved===false){ if(done) done(false); return false; } toast("Moved to “"+stageName(st)+"”"); if(done) done(true); }); }); }
function setPrio(id,p){ var tk=task(id); moveTask(tk,{type:"MOVE_TASK_PRIORITY",priority:p},function(t){ t.prio=p; }); }

/* ---------- GRID (spreadsheet: every cell edits the same task record, §31) ---------- */
function taskGrid(list){ var root=vpageBegin("grid"); if (!list.length) return '<div class="panel">'+emptyBox("No tasks match these filters","")+'</div>'; var cols=S.gridFields; var cf=WS.customFields||[];
  var cell=function(x,k){ var ed=canI.editTask(x); var dis=ed?"":" disabled", set='gridSet(taskIdFrom(this),\''+k+'\',this.value)'; if (k==="status") return '<select'+dis+' onchange="'+set+'">'+localStages().map(function(s){ return '<option value="'+attr(s.id)+'"'+(x.status===s.id?" selected":"")+'>'+esc(s.name)+'</option>'; }).join("")+'</select>'; if (k==="team") return '<select'+dis+' onchange="'+set+'">'+teamOpts(true).map(function(o){ return '<option value="'+attr(o[0])+'"'+((x.team||"")===o[0]?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("")+'</select>';
    if (k==="assignee"||k==="reviewer") return '<select'+dis+' onchange="'+set+'">'+peopleOpts().map(function(o){ return '<option value="'+attr(o[0])+'"'+(x[k]===o[0]?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("")+'</select>'; if (k==="proj") return '<select'+dis+' onchange="'+set+'">'+PROJECTS.map(function(p){ return '<option value="'+attr(p.id)+'"'+(x.proj===p.id?" selected":"")+'>'+esc(p.name)+'</option>'; }).join("")+'</select>';
    if (k==="prio") return '<select'+dis+' onchange="'+set+'">'+PRIOS.map(function(p){ return '<option value="'+attr(p[0])+'"'+(x.prio===p[0]?" selected":"")+'>'+p[1]+'</option>'; }).join("")+'</select>'; if (k==="start") return '<input'+dis+' type="date" value="'+iso(x.due-x.span)+'" onchange="'+set+'">'; if (k==="due") return '<input'+dis+' type="date" value="'+iso(x.due)+'" onchange="'+set+'">';
    if (k==="effort"){ var lk=typeof scoringEstimateLock==="function"?scoringEstimateLock(x):null; /* a locked hour estimate (Smart Scoring) is greyed out and says who locked it */ return '<input'+(lk?' disabled data-scr-lock="1" title="'+attr(lk.title)+'" aria-label="'+attr(tr("Estimate")+" — "+lk.title)+'"':dis)+' type="number" min="0" value="'+x.effort+'" onchange="'+set+'">'; } if (k==="tags") return tagPicker("tp_grid_"+x.id,x.tags||[],function(value){ gridSet(x.id,"tags",value); },{readonly:!!dis,compact:true});
    if (k.indexOf("cf:")===0){ var f=byId(cf,k.slice(3)); if (!f) return ""; var v=x.custom[f.id]; if (f.type==="checkbox") return '<input'+dis+' type="checkbox" '+(v?"checked":"")+' onchange="gridSet(taskIdFrom(this),\''+k+'\',this.checked)">'; if (f.type==="select") return '<select'+dis+' onchange="'+set+'"><option value="">—</option>'+f.options.map(function(o){ return '<option'+(v===o?" selected":"")+'>'+esc(o)+'</option>'; }).join("")+'</select>'; return '<input'+dis+' type="'+(f.type==="number"?"number":"text")+'" value="'+attr(v==null?"":v)+'" onchange="'+set+'">'; } return ""; };
  var head='<tr><th style="width:'+GRID_COL_W.drag+'px"></th><th style="width:'+GRID_COL_W.title+'px">Task</th>'+cols.map(function(k){ var f=GRID_FIELDS.concat(cf.map(function(c){ return ["cf:"+c.id,locName(c)]; })).filter(function(g){ return g[0]===k; })[0]; return '<th style="width:'+colW(GRID_COL_W,k)+'px">'+esc(f?f[1]:k)+'</th>'; }).join("")+'</tr>', gridMin=GRID_COL_W.drag+GRID_COL_W.title+cols.reduce(function(s,k){ return s+colW(GRID_COL_W,k); },0);
  var row=function(x){ return '<tr draggable="true" data-id="'+attr(x.id)+'" ondragstart="kStart(event,taskIdFrom(this))" ondragend="lEnd(this)" ondragover="lRowOver(event,this)" ondragleave="this.classList.remove(\'drop-before\')" ondrop="lDrop(event,this)" style="cursor:default"><td class="drag-h">'+I.drag+'</td><td><div class="cell"><input value="'+attr(x.title)+'" '+(canI.editTask(x)?'':'disabled')+' onchange="gridSet(taskIdFrom(this),\'title\',this.value)" style="font-weight:600"><button class="iconbtn flat" style="width:26px;height:26px" onclick="openTask(taskIdFrom(this))" title="Open">'+I.ext+'</button></div></td>'+cols.map(function(k){ return '<td><div class="cell">'+cell(x,k)+'</div></td>'; }).join("")+'</tr>'; };
  /* pages as the List's: 100 rows, or 25 of each group — see DRAWING ONLY WHAT CAN BE SEEN */
  var span=cols.length+2, order=[], body="";
  if (S.group){ groupedTasks(sortedTasks(list),S.group).forEach(function(g){ var gl=groupLabel(g.key,S.group), pg=vpageGroup(root,"g:"+g.key,g.tasks,row); order=order.concat(g.tasks); body+='<tr class="grp" data-group="'+attr(g.key)+'" ondragover="event.preventDefault();this.classList.add(\'over\')" ondragleave="this.classList.remove(\'over\')" ondrop="lGroupDrop(event,this,'+jsq(g.key)+')"><td colspan="'+span+'"><span style="display:inline-flex;align-items:center;gap:8px">'+(gl.c?'<span class="tdot" style="--tc:'+gl.c+'"></span>':'')+esc(gl.l)+'<span class="cnt">'+g.tasks.length+'</span></span></td></tr>'+pg.html+vpageMoreHtml(pg,"tr",span,gl.l); }); }
  else { order=sortedTasks(list); var pg=vpageGroup(root,"",order,row); body=pg.html+vpageMoreHtml(pg,"tr",span); }
  VPAGE.roots[root].order=order.map(function(x){ return x.id; });
  return '<div class="panel"><div class="tbl-wrap" style="max-height:70vh"><table class="tbl gridv tbl-fixed" data-vroot="'+root+'" style="--tbl-min:'+gridMin+'px"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div><div class="panel-foot hint">Every cell writes straight to the task record — the same one Kanban, Calendar and Timeline show.</div></div>'; }
function gridSet(id,k,v){ var tk=task(id); if (!tk) return; if (k==="effort"&&typeof scoringEstimateLock==="function"&&scoringEstimateLock(tk)) return toast(scoringEstimateLock(tk).title,"bad"); if (k==="status") return setStatus(id,v); if (k==="prio") return setPrio(id,v); if (k==="team") return moveTask(tk,{type:"MOVE_TASK_TEAM",teamId:v||null},function(t){ t.team=v||null; }); if (k==="assignee") return moveTask(tk,{type:"MOVE_TASK_ASSIGNEE",assigneeId:v},function(t){ t.assignee=v; }).then(function(saved){ if(saved===false)return false; notify("assigned",v,id); }); if (k==="proj") return moveTask(tk,{type:"MOVE_TASK_PROJECT",projectId:v},function(t){ t.proj=v; });
  if (k==="due"||k==="start"){ var due=k==="due"?offsetFromIso(v):tk.due; var start=k==="start"?offsetFromIso(v):tk.due-tk.span; if (start>due) start=due; return moveTask(tk,{type:"MOVE_TASK_DATE",startDate:iso(start),dueDate:iso(due)},function(t){ t.due=due; t.span=Math.max(1,due-start); }); }
  editTaskWith(tk,function(t){ if (k==="title") t.title=v||t.title; else if (k==="reviewer") t.reviewer=v; else if (k==="effort"){ t.effort=+v||0; if(typeof effortManual==="function") effortManual(t); } else if (k==="tags") t.tags=tagsFromLegacy(v); else if (k.indexOf("cf:")===0){ var f=byId(WS.customFields,k.slice(3)); t.custom[f.id]=f.type==="number"?(v===""?null:+v):v; } log(t,"edited",{what:k.replace("cf:","")}); }); }

/* ---------- CALENDAR (month / week / day; drag a chip to a day = MOVE_TASK_DATE, §27–28) ---------- */
var CAL_AGENDA={};
function calNav(dir){ if (S.calMode==="month"){ S.calMonth+=dir; if (S.calMonth>11){S.calMonth=0;S.calYear++;} if (S.calMonth<0){S.calMonth=11;S.calYear--;} } else if (S.calMode==="week") S.calDay+=7*dir; else S.calDay+=dir; renderScreen(false); }
function calToday(){ S.calMonth=TODAY.getMonth(); S.calYear=TODAY.getFullYear(); S.calDay=0; renderScreen(false); }
/* The calendar's Month / Week / Day is one control, and whose tasks is another (Oct 2026). On a phone the owner saw
   "Tim  Bulan  Minggu  Hari" as one row of loose pills: the period's track was the page's own grey, and whose tasks
   was a black pill like the chosen period, so people took the period for the Mine / All filter. Each group is now a
   radio group on a track that shows on the page and on a panel (.cal-mode-seg, .cal-scope-seg), and on a phone whose
   tasks is a plain button with a person icon, apart from the track.
   segRadio: one Tab stop (the chosen option), the arrow keys, Home and End between options; a choice redraws the
   screen, and the focus goes back to the group's chosen option when it was in the group (a keyboard keeps its place). */
var CAL_MODES=[["month","Month"],["week","Week"],["day","Day"]];
/* An option may carry an icon (o[2]), and short says the group may show one letter per option (data-short): where a
   row is short of room the CSS shows the icon or the letter instead of the word (.seg-word), so each option is named
   by its aria-label and, there, its tooltip (the calendar's row on a tablet, "Calendar controls" in responsive.css). */
function segRadio(g,label,opts,cur,fn,cls,short){ var any=opts.some(function(o){ return o[0]===cur; });
  return '<div class="seg '+cls+'" role="radiogroup" aria-label="'+attr(tr(label))+'" data-g="'+g+'" onkeydown="segRadioKey(event)">'+opts.map(function(o,i){ var on=o[0]===cur, name=tr(o[1]); return '<button type="button" role="radio" aria-checked="'+on+'" tabindex="'+(on||(!any&&!i)?0:-1)+'" class="'+(on?"on":"")+'" data-v="'+o[0]+'"'+(o[2]||short?' aria-label="'+attr(name)+'" title="'+attr(name)+'"':'')+(short?' data-short="'+attr(name.charAt(0))+'"':'')+' onclick="segRadioPick(this,'+fn+')">'+(o[2]?'<span class="seg-ico" aria-hidden="true">'+o[2]+'</span><span class="seg-word">'+esc(name)+'</span>':short?'<span class="seg-word">'+esc(name)+'</span>':esc(name))+'</button>'; }).join("")+'</div>'; }
function segRadioRefocus(g){ var b=Array.prototype.filter.call(document.querySelectorAll('.seg[data-g="'+g+'"] [aria-checked="true"]'),function(x){ return !!x.offsetParent; })[0]; if(b) try{ b.focus({preventScroll:true}); }catch(e){} }
function segRadioPick(b,fn){ var g=b.parentNode, had=g.contains(document.activeElement); fn(b.getAttribute("data-v")); if(had) segRadioRefocus(g.getAttribute("data-g")); }
function segRadioKey(e){ var g=e.currentTarget, bs=Array.prototype.slice.call(g.querySelectorAll('[role="radio"]')), n=bs.length, i=bs.indexOf(g.querySelector('[aria-checked="true"]')), k=e.key;
  var j=(k==="ArrowRight"||k==="ArrowDown")?(i+1)%n:(k==="ArrowLeft"||k==="ArrowUp")?(i+n-1)%n:k==="Home"?0:k==="End"?n-1:-1;
  if(j<0||!n) return; e.preventDefault(); if(j!==i) bs[j].click(); else segRadioRefocus(g.getAttribute("data-g")); }
function calModeSeg(){ return segRadio("calmode","Calendar view",CAL_MODES,S.calMode,"setCalMode","cal-mode-seg",true); }
function setCalScope(v){ S.calScope=v; renderScreen(false); }
function setTaskScope(v){ S.taskScope=v; renderScreen(false); }
/* a phone's whose tasks: one button that says whose and switches; "Saya" in Indonesian, as the list's own button */
function calScopeToggle(k,allLabel){ var mine=S[k]==="mine", label=mine?(UI_LANG==="id"?"Saya":"Mine"):tr(allLabel), name=tr("Show")+": "+label;
  return '<button type="button" class="btn sm cal-mobile-scope-toggle" aria-label="'+attr(name)+'" title="'+attr(name)+'" onclick="S.'+k+'=S.'+k+'===\'mine\'?\'all\':\'mine\';renderScreen(false)">'+(mine?I.user:I.team)+'<span>'+esc(label)+'</span></button>'; }
/* opts.noFilter (a team's calendar, on its page): the month, Today and the period only. It shows one team's tasks, not
   the filtered list, so it has no filters, no saved views and no whose tasks; before Oct 2026 it had no row at all, so a
   phone could not leave the month. */
function calendarMobileControls(opts){ opts=opts||{}; var defs=FILTER_DEFS({noProject:false}), active=defs.filter(filterChipOn).length+(S.filters.kind?1:0), cur=S.activeView?byId(VIEWS,S.activeView):null;
  if(opts.noFilter) return '<div class="calendar-mobile-controls cal-team-controls cal-m-'+S.calMode+'"><div class="cal-mobile-date"><button class="iconbtn" aria-label="'+attr(tr("Previous"))+'" onclick="calNav(-1)">'+I.chevl+'</button><strong>'+calTitleBoth()+'</strong><button class="iconbtn" aria-label="'+attr(tr("Next"))+'" onclick="calNav(1)">'+I.chev+'</button><button class="btn sm cal-mobile-today" onclick="calToday()">'+tr("Today")+'</button></div><div class="cal-mobile-actions">'+calModeSeg()+'</div></div>';
  return '<div class="calendar-mobile-controls cal-m-'+S.calMode+(S.screen==="tasks"?' cal-tasks':'')+'"><div class="cal-mobile-date"><button class="iconbtn" aria-label="'+attr(tr("Previous"))+'" onclick="calNav(-1)">'+I.chevl+'</button><strong>'+calTitleBoth()+'</strong><button class="iconbtn" aria-label="'+attr(tr("Next"))+'" onclick="calNav(1)">'+I.chev+'</button><button class="btn sm cal-mobile-today" onclick="calToday()">'+tr("Today")+'</button></div><div class="cal-mobile-actions"><button class="iconbtn'+(active?' active':'')+'" aria-label="'+attr(tr("Filters"))+'" title="'+attr(tr("Filters"))+'" onclick="filterModal()">'+I.filter+(active?'<span class="cal-mobile-count">'+active+'</span>':'')+'</button>'+(S.screen==="projects"?'':'<button class="iconbtn'+(cur?' active':'')+'" data-menu aria-label="'+attr(tr("Views"))+'" title="'+attr(tr("Views"))+'" onclick="viewsMenu(this)">'+I.pin+'</button>')+(S.screen==="calendar"?calScopeToggle("calScope","Team"):'')+(S.screen==="tasks"?calScopeToggle("taskScope","All"):'')+calModeSeg()+'<button class="iconbtn'+(S.calLabelsOpen?' active':'')+'" aria-pressed="'+(S.calLabelsOpen?'true':'false')+'" aria-label="'+attr(tr(S.calLabelsOpen?'Hide labels':'Show labels'))+'" title="'+attr(tr(S.calLabelsOpen?'Hide labels':'Show labels'))+'" onclick="toggleChipLabels()">'+(S.calLabelsOpen?I.eyeoff:I.eye)+'</button></div></div>'; }
function calItems(list,opts){ var byDay={}; list.forEach(function(t){ var k=iso(t.due); (byDay[k]=byDay[k]||[]).push({type:"task",o:t}); }); (S.filters.archived?PROJECTS:liveProjects()).filter(function(p){ /* compact (a team's page): the milestones and deadlines of its own projects only */ return !(opts&&opts.compact)||list.some(function(t){ return inProject(t,p.id); }); }).forEach(function(p){ p.milestones.forEach(function(ms){ var k=iso(ms.due); (byDay[k]=byDay[k]||[]).push({type:"ms",o:ms,p:p}); }); if (p.status!=="done"){ var k2=iso(p.due); (byDay[k2]=byDay[k2]||[]).push({type:"pdue",o:p}); } }); return byDay; }
function chipHtml(t){ var ls=labelsOf(t), dim=t.hidden||autoHidden(t);
  return '<div class="chip'+(isClosed(t)?" closed":(t.due<0?" over":""))+(dim?" dim":"")+(taskChecked(t.id)?" checked":"")+'" data-id="'+attr(t.id)+'" style="--tc:'+taskCardColor(t,"calendar")+'" draggable="true" ondragstart="kStart(event,taskIdFrom(this))" ondragend="kEnd(this)" onclick="event.stopPropagation();openTask(taskIdFrom(this))" title="'+attr(t.title+" \u00b7 "+stageName(t.status)+" \u00b7 "+person(t.assignee).name+(isTaskBlocked(t)?" \u00b7 "+tr("Blocked by")+" "+unresolvedDependencies(t).map(function(x){return x.title;}).join(", "):"")+(ls.length?" \u00b7 "+ls.map(function(x){return x.name;}).join(", "):""))+'">'
    + '<div class="chip-eyebrow">'+(ls.length?labelPills(t)+labelFull(t):'<span class="eb">'+esc(teamName(t.team)||projName(t))+'</span>')
    + '<span class="spacer"></span><span class="sb badge '+badgeCls(t.status)+'">'+esc(stageName(t.status))+'</span></div>'
    + '<div class="chip-main">'+taskCheckBtn(t.id,"xs")+'<span class="pd '+t.prio+'"></span><span class="chip-t">'+(isTaskBlocked(t)?'⛓ ':'')+esc(t.title)+'</span>'+avStack(assigneesOf(t))+'</div></div>'; }
function dayCell(d,items,other,extraCls,limit){ var off=Math.round((d-TODAY)/86400000); var k=iso(off); var h='<div class="cal-day'+(other?" other":"")+(off===0?" today":"")+(extraCls||"")+'" data-off="'+off+'" ondragover="event.preventDefault();this.classList.add(\'over\')" ondragleave="this.classList.remove(\'over\')" ondrop="calDrop(event,this,'+off+')" onclick="if(event.target===this||event.target.classList.contains(\'dn\')||event.target.parentNode.classList.contains(\'dn\'))'+(canI.createTask()?'newTaskModal({due:'+off+'})':'calAgenda(\''+k+'\')')+'"><div class="dn"><span>'+d.getDate()+'</span>'+(off===0?'<b class="todaytag">Today</b>':'')+(items.length>limit?'<small>'+items.length+'</small>':'')+'</div>';
  items.slice(0,limit).forEach(function(it){ if (it.type==="task") h+=chipHtml(it.o); else if (it.type==="ms") h+='<div class="chip ms" onclick="event.stopPropagation();go(\'projects\',\''+it.p.id+'\')" title="'+attr(it.p.name+" · "+it.o.name)+'">◆ '+esc(it.o.name)+'</div>'; else h+='<div class="chip ms" style="border-left-color:var(--color-warning)" onclick="event.stopPropagation();go(\'projects\',\''+it.o.id+'\')">⚑ '+esc(it.o.name)+' '+tr("deadline")+'</div>'; });
  if (items.length>limit) h+='<div class="chip more" onclick="event.stopPropagation();calAgenda(\''+k+'\')">+'+(items.length-limit)+' '+tr("more")+'</div>'; return h+'</div>'; }
function calDrop(e,el,off){ e.preventDefault(); el.classList.remove("over"); var id=DRAG||e.dataTransfer.getData("text/plain"); DRAG=null; var tk=task(id); if (!tk||tk.due===off) return; var span=tk.span; moveTask(tk,{type:"MOVE_TASK_DATE",startDate:iso(off-span),dueDate:iso(off)},function(t){ t.due=off; }).then(function(saved){ if(saved===false)return false; toast("Due "+dueDate(off)); }); }
/* The month's row (.cal-row: the Tasks page, the Calendar page, a project; a team's page keeps its own): one line at
   every width it is shown, which is from 600 px on the Tasks page (its second row under the views, "Calendar
   controls" in responsive.css) and from 761 px elsewhere. Where it is short of room the title takes its short form
   (.cal-t-short), Show labels its icon, whose tasks its icons and the period its letters, each named for screen readers;
   the legend then sits under the calendar (.cal-legend-foot), and active filters' chips have a line of their own. */
function calendar(list,opts){ opts=opts||{}; var byDay=calItems(list,opts); CAL_AGENDA=byDay; var row=!opts.compact, labelsName=tr(S.calLabelsOpen?"Hide labels":"Show labels");
  var legend='<span><i style="background:var(--color-primary)"></i>Task (team color)</span><span><i style="background:var(--color-secondary)"></i>Milestone</span><span><i style="background:var(--color-danger)"></i>Overdue</span>', foot=row?'<div class="legend cal-legend-foot">'+legend+'</div>':'';
  var h=calendarMobileControls(opts)+'<div class="toolbar calendar-toolbar'+(row?' cal-row cal-m-'+S.calMode:'')+(row&&S.screen==="tasks"?' cal-tasks':'')+'" style="justify-content:space-between"><div class="cal-nav">'+(opts.noFilter?'':filterInline())+'<button class="iconbtn" aria-label="'+attr(tr("Previous"))+'" onclick="calNav(-1)">'+I.chevl+'</button><h2 title="'+attr(calTitle())+'">'+calTitleBoth()+'</h2><button class="iconbtn" aria-label="'+attr(tr("Next"))+'" onclick="calNav(1)">'+I.chev+'</button><button class="btn sm cal-today" onclick="calToday()">Today</button><button class="btn sm'+(S.calLabelsOpen?" primary":"")+'" aria-pressed="'+(S.calLabelsOpen?"true":"false")+'" aria-label="'+attr(labelsName)+'" id="calLabelBtn" onclick="toggleChipLabels()" title='+(S.calLabelsOpen?'"Hide the label names"':'"Name every label on the board"')+'>'+(S.calLabelsOpen?I.eyeoff+'<span class="cal-lbl-word">Hide labels</span>':I.eye+'<span class="cal-lbl-word">Show labels</span>')+'</button></div><div class="calendar-display-controls">'+taskCheckChip()+viewsMenuBtn()+calModeSeg()+'<div class="legend" style="padding:0">'+legend+'</div></div>'+(opts.noFilter?'':filterInline("chips"))+'</div>';
  if (S.calMode==="month"){ var y=S.calYear, m=S.calMonth; var startDow=(new Date(y,m,1).getDay()+6)%7; var start=new Date(y,m,1-startDow); var cells=(startDow+new Date(y,m+1,0).getDate()<=35)?35:42;
    h+='<div class="cal'+(S.calLabelsOpen?" labels-open":"")+'"><div class="cal-head">'+["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(function(d){ return '<div>'+tr(d)+'</div>'; }).join("")+'</div><div class="cal-grid">'; for (var i=0;i<cells;i++){ var d=new Date(start); d.setDate(start.getDate()+i); h+=dayCell(d,byDay[iso(Math.round((d-TODAY)/86400000))]||[],d.getMonth()!==m,"",3); } h+='</div>'+foot+'</div>'; }
  else if (S.calMode==="week"){ var w=weekRange(0); var s0=w[0]+Math.floor(S.calDay/7)*7; h+='<div class="cal'+(S.calLabelsOpen?" labels-open":"")+'"><div class="cal-head">'+[0,1,2,3,4,5,6].map(function(i){ var d=dateOf(s0+i); return '<div>'+tr(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i])+' '+d.getDate()+'</div>'; }).join("")+'</div><div class="cal-week">'; for (var j=0;j<7;j++){ var dd=dateOf(s0+j); h+=dayCell(dd,byDay[iso(s0+j)]||[],false,"",12); } h+='</div>'+foot+'</div>'; }
  else { var items=byDay[iso(S.calDay)]||[]; var dd2=dateOf(S.calDay); h+='<div class="cal'+(S.calLabelsOpen?" labels-open":"")+'"><div class="cal-dayv" ondragover="event.preventDefault()" ondrop="calDrop(event,this,'+S.calDay+')">'+(items.length?items.map(function(it){ if (it.type==="task") return '<div style="display:flex;gap:10px;align-items:center">'+chipHtml(it.o).replace('class="chip','style="flex:1" class="chip')+statusBadge(it.o.status)+av(it.o.assignee)+'</div>'; if (it.type==="ms") return '<div class="chip ms" onclick="go(\'projects\',\''+it.p.id+'\')">◆ '+esc(it.p.name)+' · '+esc(it.o.name)+'</div>'; return '<div class="chip ms" style="border-left-color:var(--color-warning)">⚑ '+esc(it.o.name)+' '+tr("deadline")+'</div>'; }).join(""):emptyBox((UI_LANG==="id"?"Tidak ada tenggat pada ":"Nothing due on ")+uiDow(dd2.getDay()),tr("Drop a task here or create one."),null,canI.createTask()?'<button class="btn sm primary" onclick="newTaskModal({due:'+S.calDay+'})">'+tr("New task")+'</button>':''))+'</div>'+foot+'</div>'; }
  var up=sortTasks(list.filter(function(t){ return !isClosed(t)&&t.due>=0&&t.due<=14; }));
  h+=panel("Next 14 days",up.length,'<div class="agenda">'+(up.length?up.map(function(t){ return '<div class="row dated'+(taskChecked(t.id)?" checked":"")+'" data-id="'+attr(t.id)+'" onclick="openTask(taskIdFrom(this))"><div class="prio '+attr(t.prio)+'"></div>'+taskCheckBtn(t.id)+'<span class="dd">'+dueDate(t.due)+'</span><div style="min-width:0"><div class="t">'+esc(t.title)+'</div><div class="m">'+teamBadge(t.team)+' · '+esc(projName(t))+' · '+statusBadge(t.status)+'</div></div><div class="r">'+av(t.assignee)+'</div></div>'; }).join(""):emptyBox("Nothing due in the next two weeks",""))+'</div>',null,null,I.calendar);
  return h; }
function calTitle(){ if (S.calMode==="month") return uiMol(S.calMonth)+" "+S.calYear; if (S.calMode==="week"){ var w=weekRange(0); var s=w[0]+Math.floor(S.calDay/7)*7; return (UI_LANG==="id"?"Pekan ":"Week of ")+dueDate(s)+" – "+dueDate(s+6); } var d=dateOf(S.calDay); return uiDow(d.getDay())+", "+uiMol(d.getMonth())+" "+d.getDate(); }
/* the same, short, for a row short of room: "Oct 2026", "Oct 19–25" (or "Oct 26 – Nov 1"), "Fri, Oct 23", whose
   weekday (.cal-t-dow) the narrowest row leaves out; it is markup, built from the app's own month and day names */
function calTitleShort(){ if (S.calMode==="month") return uiMo(S.calMonth)+" "+S.calYear; if (S.calMode==="week"){ var w=weekRange(0), s=w[0]+Math.floor(S.calDay/7)*7, a=dateOf(s), b=dateOf(s+6); return a.getMonth()===b.getMonth()?dueDate(s)+"–"+b.getDate():dueDate(s)+" – "+dueDate(s+6); } var d=dateOf(S.calDay); return '<span class="cal-t-dow">'+esc(tr(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]))+', </span>'+dueDate(S.calDay); }
/* both, for the CSS to choose (.cal-t-short is hidden unless a row is short of room: the month's row on a tablet, a
   phone's bar at 360 px or less, a team's at 400 px or less, in a week or a day). A week's short title has a second
   form, its first day over its last (.cal-t-two: "Okt 26 –" / "Nov 1"), for the Tasks page's row below 700 px: beside
   the "N checked" chip the title has 74 px there, and on one line a week across two months needs 112 ("Aug 30 – Sep 5")
   and one inside a month 85 ("May 24–30"), so in a month's last week the title was cut (27 Oct 2026) */
function calTitleBoth(){ var short=calTitleShort();
  if (S.calMode==="week"){ var s=weekRange(0)[0]+Math.floor(S.calDay/7)*7; short='<span class="cal-t-one">'+short+'</span><span class="cal-t-two"><span>'+dueDate(s)+' –</span> <span>'+dueDate(s+6)+'</span></span>'; }
  return '<span class="cal-t-long">'+calTitle()+'</span><span class="cal-t-short">'+short+'</span>'; }
function setCalMode(m){ S.calMode=m; renderScreen(false); }
function openCalendarTask(id){ closeModal(); openTask(id); }
function calAgendaRow(it){
  if(it.type==="task") return taskRow(it.o,{fixedMeta:true,check:true,openAction:"openCalendarTask(taskIdFrom(this))"});
  var milestone=it.type==="ms", p=milestone?it.p:it.o, title=milestone?it.o.name:p.name;
  return '<div class="row cal-context-row" onclick="closeModal();go(\'projects\',\''+p.id+'\')"><span class="cal-context-icon '+(milestone?'milestone':'deadline')+'">'+(milestone?'◆':'⚑')+'</span><span class="cal-context-spacer"></span><div style="min-width:0"><div class="t">'+esc(title)+'</div><div class="m"><span class="badge">'+tr(milestone?'Milestone':'Project deadline')+'</span><span>'+esc(p.name)+'</span></div></div><div class="r meta-grid"><span class="mcell mcell-assets"></span><span class="mcell mcell-due"><span class="due">'+dueDate(milestone?it.o.due:p.due)+'</span></span><span class="mcell mcell-who">'+av(p.owner)+'</span></div></div>';
}
function calAgenda(k){
  var off=offsetFromIso(k), items=CAL_AGENDA[k]||[];
  openModal(dueDate(off)+(items.length?' \u00b7 '+items.length+' '+tr(items.length===1?"item":"items"):""),
    '<div class="agenda cal-more-list">'+(items.length?items.map(calAgendaRow).join(""):emptyBox("Nothing due",""))+'</div>');
}
function renderCalendarScreen(){ var h='<div class="pagehead calendar-pagehead"><div><h1>Calendar</h1><div class="muted" style="margin-top:4px">A view over task dates — drag a task to another day to reschedule it</div></div><div class="actions">'+segRadio("calscope","Show",[["mine","Mine"],["all","Team"]],S.calScope,"setCalScope","cal-scope-seg")+(canI.createTask()?'<button class="btn primary" onclick="newTaskModal()">'+I.plus+'New task</button>':'')+'</div></div>'; var saved=S.taskScope, sv=S.taskView; S.taskScope=S.calScope; S.taskView="calendar"; h+=filterBar({noScope:true}); h+=calendar(filteredTasks()); S.taskScope=saved; S.taskView=sv; document.getElementById("content").innerHTML=h; }

/* ---------- TIMELINE (drag bar = shift dates, resize = change duration; MOVE_TASK_TIMELINE §32) ---------- */
var TL={from:-14,days:42,label:240};
function timeline(list,opts){ opts=opts||{}; var from=TL.from, days=TL.days; var cols=TL.label+"px repeat("+days+",minmax(26px,1fr))"; var start=dateOf(from);
  var hd='<div class="tl-hd" style="grid-template-columns:'+cols+'"><div style="text-align:left;position:sticky;left:0;background:var(--color-surface);z-index:3">'+tr("Project / task")+'</div>'; for (var i=0;i<days;i++){ var d=new Date(start); d.setDate(start.getDate()+i); var off=from+i; var prevMon=i>0&&(new Date(start.getTime()+(i-1)*86400000)).getDay()===1; var isFirst=d.getDate()===1&&!prevMon; var lbl=(d.getDay()===1||isFirst)?uiMo(d.getMonth())+" "+d.getDate():(prevMon?"":String(d.getDate())); hd+='<div class="'+(d.getDay()===1?"wk":"")+(off===0?" today":"")+'" style="'+(d.getDay()===1||isFirst?"text-align:left;overflow:visible;padding-left:6px;position:relative;z-index:1":"")+'">'+lbl+'</div>'; } hd+='</div>';
  /* The day grid — a line after each day, weekends shaded — is drawn once, behind every row (tl-days, the same 42
     columns as a row's), instead of 42 cells in each row. Only a project's row, whose own background would cover it,
     still has its cells (a few rows). .tl-grid is as wide as its rows (min-width), so tl-days lines up with them. */
  var weekend=function(i){ var d=new Date(start); d.setDate(start.getDate()+i); return d.getDay()===0||d.getDay()===6; };
  var cellsHtml='', daysHtml=''; for (var ci=0;ci<days;ci++){ cellsHtml+='<div class="tl-cell'+(weekend(ci)?" we":"")+'" style="grid-column:'+(ci+2)+'"></div>'; daysHtml+='<i'+(weekend(ci)?' class="we"':'')+'></i>'; }
  var cells=function(){ return cellsHtml; };
  var root=vpageBegin("timeline");
  var todayLine='<div class="tl-today" style="left:calc('+TL.label+'px + ('+(-from)+' + 0.5) * ((100% - '+TL.label+'px) / '+days+'))"></div>';
  var barStyle=function(s,e){ var a=Math.max(from,s), b=Math.min(from+days-1,e); if (b<a) return null; return 'left:calc('+TL.label+'px + '+(a-from)+' * ((100% - '+TL.label+'px) / '+days+') + 2px);width:calc('+(b-a+1)+' * ((100% - '+TL.label+'px) / '+days+') - 4px)'; };
  var rows=''; var projs=S.projectId&&S.screen==="projects"?PROJECTS.filter(function(p){ return p.id===S.projectId; }):(S.filters.archived?PROJECTS:liveProjects());
  projs.forEach(function(p){ var ts=sortedTasks(list.filter(function(t){ return inProject(t,p.id); })); if (!ts.length&&(opts.compact||S.taskScope==="mine"||anyFilter())) return;
    var ps=barStyle(p.start,p.due),progress=projectProgress(p); rows+='<div class="tl-row group" style="grid-template-columns:'+cols+'"><div class="tl-lbl lbl" onclick="go(\'projects\',\''+p.id+'\')">'+esc(p.name)+' <span class="tiny muted mono">'+progress+'%</span></div>'+cells()+(ps?'<div class="tl-bar" style="'+ps+';background:var(--color-border-strong);color:var(--color-text-primary);opacity:.9;cursor:pointer" onclick="go(\'projects\',\''+p.id+'\')">'+esc(p.name)+'</div>':'')+todayLine+'</div>';
    p.milestones.forEach(function(ms){ var s=barStyle(ms.due,ms.due+2); if (!s) return; rows+='<div class="tl-row" style="grid-template-columns:'+cols+';min-height:30px"><div class="tl-lbl" style="color:var(--color-text-secondary)">◆ '+esc(ms.name)+'</div><div class="tl-bar ms" style="'+s+';width:auto" title="'+attr(ms.name)+'">'+esc(ms.name)+(ms.done?" ✓":"")+'</div>'+todayLine+'</div>'; });
    tlTasks("p:"+p.id,ts); });
  /* a project's first 30 tasks, then "Show 30 more" (DRAWING ONLY WHAT CAN BE SEEN) */
  function tlTasks(gk,ts){ var pg=vpageGroup(root,gk,ts,tlTask); rows+=pg.html+vpageMoreHtml(pg,"tl",{cols:cols,today:todayLine}); }
  function tlTask(t){ var s=barStyle(t.due-t.span,t.due); var ed=canI.editTask(t); return '<div class="tl-row" data-id="'+attr(t.id)+'" style="grid-template-columns:'+cols+'"><div class="tl-lbl" onclick="openTask(taskIdFrom(this))">'+av(t.assignee)+'<span class="tdot" style="--tc:'+teamVar(t.team)+'"></span><span style="overflow:hidden;text-overflow:ellipsis">'+esc(t.title)+'</span></div>'+(s?'<div class="tl-bar'+(isClosed(t)?" closed":"")+'" style="'+s+';--tc:'+teamVar(t.team)+'" data-id="'+attr(t.id)+'" '+(ed?'onmousedown="tlDown(event,taskIdFrom(this),\'move\')"':'')+' onclick="tlClick(taskIdFrom(this))" title="'+attr(t.title+" · "+dueDate(t.due-t.span)+" → "+dueDate(t.due))+'">'+(ed?'<span class="hz l" onmousedown="tlDown(event,taskIdFrom(this),\'start\')"></span>':'')+esc(t.title)+(ed?'<span class="hz r" onmousedown="tlDown(event,taskIdFrom(this),\'end\')"></span>':'')+'</div>':'')+todayLine+'</div>'; }
  /* compact (a team's page): only the projects it has work in, then its work in no project */
  if (opts.compact){ var loose=sortedTasks(list.filter(function(t){ return !taskProjectIds(t).length; })); if (loose.length){ rows+='<div class="tl-row group" style="grid-template-columns:'+cols+'"><div class="tl-lbl lbl">'+tr("No project")+'</div>'+cells()+todayLine+'</div>'; tlTasks("loose",loose); } }
  var dayGrid=rows?'<div class="tl-days" aria-hidden="true" style="left:'+TL.label+'px;grid-template-columns:repeat('+days+',1fr)">'+daysHtml+'</div>':'';
  if (!rows) rows='<div class="empty" style="padding:40px"><p>'+tr(opts.compact?"No tasks with dates yet.":"No tasks match the current filters.")+'</p></div>';
  return '<div class="tlw"><div class="tl-grid" id="tlGrid" data-vroot="'+root+'" style="min-width:'+(TL.label+days*26)+'px">'+dayGrid+hd+rows+'</div></div><div class="hint" style="padding:6px 4px">Drag a bar to move it, drag its edges to change duration. Changes persist to the task start/due dates.</div>'; }
var TLD=null;
function tlDown(e,id,mode){ if (e.button!==0) return; e.preventDefault(); e.stopPropagation(); var grid=document.getElementById("tlGrid"); var dayW=(grid.getBoundingClientRect().width-TL.label)/TL.days; var bar=document.querySelector('.tl-bar[data-id="'+id+'"]'); TLD={id:id,mode:mode,x0:e.clientX,dayW:dayW,bar:bar,left0:bar.offsetLeft,w0:bar.offsetWidth,delta:0,moved:false}; bar.classList.add("moving"); document.addEventListener("mousemove",tlMove); document.addEventListener("mouseup",tlUp); }
function tlMove(e){ if (!TLD) return; var dx=e.clientX-TLD.x0; var delta=Math.round(dx/TLD.dayW); if (Math.abs(dx)>3) TLD.moved=true; TLD.delta=delta; var b=TLD.bar; if (TLD.mode==="move") b.style.transform="translateX("+(delta*TLD.dayW)+"px)"; else if (TLD.mode==="end") b.style.width=Math.max(TLD.dayW-4,TLD.w0+delta*TLD.dayW)+"px"; else { var nw=Math.max(TLD.dayW-4,TLD.w0-delta*TLD.dayW); b.style.width=nw+"px"; b.style.transform="translateX("+(TLD.w0-nw)+"px)"; } }
function tlUp(){ document.removeEventListener("mousemove",tlMove); document.removeEventListener("mouseup",tlUp); var d=TLD; TLD=null; if (!d) return; d.bar.classList.remove("moving"); d.bar.style.transform=""; d.bar.style.width=""; var tk=task(d.id); if (!tk||!d.delta||!d.moved) { if (d.moved) renderScreen(false); return; } window._tlSuppress=true; setTimeout(function(){ window._tlSuppress=false; },50);
  var start=tk.due-tk.span, due=tk.due; if (d.mode==="move"){ start+=d.delta; due+=d.delta; } else if (d.mode==="end"){ due=Math.max(start,due+d.delta); } else { start=Math.min(due,start+d.delta); }
  moveTask(tk,{type:"MOVE_TASK_TIMELINE",startDate:iso(start),dueDate:iso(due)},function(t){ t.due=due; t.span=Math.max(1,due-start); }).then(function(saved){ if(saved===false)return false; toast(dueDate(start)+" → "+dueDate(due)); }); }
function tlClick(id){ if (window._tlSuppress) return; openTask(id); }

/* ---------- create (same drawer as viewing a task — a draft that is only saved on "Create") ---------- */
function newTaskModal(pre){ if(typeof signedIn==="function"&&!signedIn()){ if(typeof showLogin==="function") showLogin(); return; } pre=pre||{}; if (S.drawerTask){ var cur=task(S.drawerTask); if (cur&&cur._draft) discardDraft(); }
  var asReq=!!pre.request; var assignee=pre.assignee!==undefined?pre.assignee:(asReq?null:ME); var due=pre.due!==undefined?pre.due:(asReq?7:5); var start=Math.min(due,pre.start!==undefined?pre.start:0);
  var status=pre.status||(asReq?firstStage():(WS.workflow[0]||{}).id); var maxSort=0; TASKS.forEach(function(x){ if (x.status===status&&x.sort>maxSort) maxSort=x.sort; });
  var tplId=pre.tpl||(asReq?(byId(WS.briefTemplates,"general")?"general":""):""); var brief=null; if (tplId){ brief={tpl:tplId}; (byId(WS.briefTemplates,tplId)||{fields:[]}).fields.forEach(function(f){ brief[f]=""; }); if (pre.brief) Object.assign(brief,pre.brief); }
  var tk={id:"T-new",_draft:true,_draftKey:uid("draft"),title:pre.title||"",description:pre.description||"",proj:pre.proj||S.projectId||(liveProjects()[0]||{}).id,team:pre.team||(assignee?primaryTeam(assignee):"")||null,status:status,prio:pre.prio||"medium",assignee:assignee,reviewer:pre.reviewer||(assignee?defaultReviewerFor(assignee,pre.team||primaryTeam(assignee)):null),assignees:assignee?[assignee]:[],reviewers:[],dependencies:pre.dependencies||[],hidden:false,assetCount:0,labels:pre.labels||[],due:due,span:Math.max(1,due-start),effort:asReq?0:4,sort:maxSort+1000,tags:pre.tags?tagsFromLegacy(pre.tags):(asReq?["request"]:[]),brief:brief,custom:{},versions:[],files:[],comments:[],activity:[],ago:0,createdBy:ME,requestId:pre.requestId||null,_onCreated:pre.onCreated||null,_request:asReq};
  if (!tk.reviewer&&!asReq) tk.reviewer=ME; tk.reviewers=tk.reviewer?[tk.reviewer]:[]; TASKS.push(tk); openTask("T-new"); S.drawerTab="brief"; renderDrawer(); setTimeout(function(){ var el=document.querySelector(".dr-title"); /* only while the new task is still the one open — by now it may have been created and another task opened */ if (el&&S.drawerTask==="T-new"){ el.focus(); } },80); }
function newRequestModal(pre){ newTaskModal(Object.assign({request:true},pre||{})); }
function discardDraft(){ var i=TASKS.findIndex(function(x){ return x._draft; }); if (i>=0) TASKS.splice(i,1); if (S.drawerTask==="T-new") closeDrawer(); refresh(); }
function createDraft(){ var tk=task("T-new"); if (!tk) return; if(typeof descWysiwygSave==="function") descWysiwygSave(); if(S.briefEdit&&typeof briefFlush==="function") briefFlush(tk); var title=(document.querySelector(".dr-title")||{}).textContent||tk.title; tk.title=String(title).trim(); if (!tk.title||tk.title==="Untitled task"){ toast("Give the task a title first","bad"); var el=document.querySelector(".dr-title"); if (el) el.focus(); return; }
  var isReq=tk._request||(!tk.assignee&&tk.status===firstStage()); if (!isReq&&!canI.createTask()) return toast("You don't have permission to create tasks","bad");
  var i=TASKS.indexOf(tk); TASKS.splice(i,1); var onCreated=tk._onCreated; var t=clone(tk); delete t._draft; delete t._draftKey; delete t._onCreated; delete t._request; t.id=nextId("T-",TASKS); t.activity=[]; t.assignees=assigneesOf(t); t.reviewers=reviewersOf(t); t.assignee=t.assignees[0]||null; t.reviewer=t.reviewers[0]||null;
  log(t,"created"); if (t.brief) log(t,"brief"); if (t.assignee&&t.assignee!==ME) log(t,"assigned",{to:first(t.assignee)}); closeDrawer();
  /* the task, once the server has numbered it (or false): the AI chat waits for it */
  return createTask(t).then(function(saved){ if(saved===false)return false; toast(isReq&&!t.assignee?"Request "+t.id+" submitted — it is in the inbox for triage":"Task "+t.id+" created"); if (t.assignee) notify("assigned",assigneesOf(t),t.id); notify("reviewer",reviewersOf(t).filter(function(r){ return !isAssignee(t,r); }),t.id); if (isReq&&!t.assignee) notify("request",Object.keys(PEOPLE).filter(function(id){ var r=byId(ROLES,PEOPLE[id].perm); return PEOPLE[id].perm==="admin"||(r&&(r.permissions||[]).indexOf("decide_request")>=0); }),t.id); if (onCreated) onCreated(t); openTask(t.id); return t; }).catch(function(){ return false; }); }
function submitNewTask(){ createDraft(); }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({ "Show {n} more":"Tampilkan {n} lagi", "{n} of {total} shown":"{n} dari {total} tampil",
  /* the List's and the Grid's pager */
  "Prev":"Sebelumnya", "Next":"Berikutnya", "Previous page":"Halaman sebelumnya", "Next page":"Halaman berikutnya", "Pages":"Halaman", "Page {n}":"Halaman {n}",
  "{from}–{to} of {total}":"{from}–{to} dari {total}", "Pages {from}–{to}: go to page {n}":"Halaman {from}–{to}: buka halaman {n}" });
function deleteTask(id){ var linked=TASKS.filter(function(t){return (t.dependencies||[]).some(function(d){return d.taskId===id;});}); var msg=tr("This removes the task, its versions, files and comments. Workspace activity is kept.")+(linked.length?" "+tr("It is currently blocking")+" "+linked.length+" "+tr(linked.length===1?"task":"tasks")+": "+linked.map(function(t){return esc(t.title);}).join(", ")+". "+tr("Their dependency links will be removed."):""); confirmModal(tr("Delete task")+" "+id+"?",msg,function(){ closeDrawer(); deleteTaskById(id).then(function(saved){ if(saved===false)return false; toast(tr("Task deleted"),"bad"); }); },true); }
</script>
<style>
/* "Show 30 more" after the cards and rows drawn, and the List's and the Grid's pager (DRAWING ONLY WHAT CAN BE SEEN, above) */
.vpage{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 12px;padding:10px 12px}
.vpage-n{font-size:12px;color:var(--color-text-secondary);font-variant-numeric:tabular-nums}
.tbl tbody tr.vpage-row{cursor:default}
.tbl tbody tr.vpage-row:hover{background:none}
.tbl tbody tr.vpage-row>td{padding:0;border-bottom:0}
/* the pager: Prev, the numbers and Next keep their places (seven numbers at most); it stays at the left of what can
   be seen when a wide table is scrolled sideways */
.vpager{display:flex;align-items:center;flex-wrap:wrap;gap:6px 6px;padding:8px 12px 10px;position:sticky;left:0;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box}
.vpager .vpager-step{margin:0;gap:4px;min-height:30px}
.vpager .vpager-step>span[aria-hidden]{font-size:15px;line-height:1}
.vpager-nums{display:inline-flex;align-items:center;gap:2px}
.vpager-num{min-width:30px;height:30px;padding:0 7px;border:0;border-radius:var(--pill);background:none;color:var(--color-text-secondary);font:inherit;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;line-height:30px;text-align:center;cursor:pointer}
@media (hover:hover){ .vpager-num:hover{background:var(--color-surface-hover);color:var(--color-text-primary)} }
.vpager-num.on{background:var(--color-ink);color:var(--color-ink-text);cursor:default}
.vpager-gap{letter-spacing:1px;color:var(--color-text-tertiary)}
.vpager button:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.vpager-range{margin-left:6px;white-space:nowrap}
.kcol-body .vpage-k{flex-direction:column;gap:6px;padding:2px 0 0}
.kcol-body .vpage-k .vpage-btn{width:100%;justify-content:center}
.tl-row .tl-lbl.vpage{cursor:default;white-space:normal;flex-wrap:wrap;justify-content:flex-start;gap:4px 10px;padding:6px 12px}
/* the Timeline's day grid, drawn once behind every row */
.tl-grid{position:relative;isolation:isolate}
.tl-days{position:absolute;top:0;bottom:0;right:0;z-index:-1;display:grid;pointer-events:none}
.tl-days>i{border-right:1px solid var(--color-border)}
.tl-days>i.we{background:var(--color-surface-sunken)}
/* a phone draws the List as cards (src/responsive.css): the pager stays one plain block under them, in a compact form —
   the range on a line of its own, then ‹ and › at the two ends with the numbers between (their names are still said) */
@media (max-width:760px){
  .lcol-tbl tbody tr.vpage-row{display:block!important;padding:0!important;border-bottom:0!important}
  .lcol-tbl tbody tr.vpage-row>td{display:block!important;padding:0!important}
  .vpager{width:auto;max-width:none;justify-content:space-between;gap:6px 2px;padding:8px 10px 12px}
  .gridv .vpager{width:calc(100vw - 32px)}
  .vpager-range{order:-1;flex:1 0 100%;margin:0;text-align:center}
  .vpager .vpager-step{min-width:36px;min-height:34px;padding:0 10px;justify-content:center}
  .vpager .vpager-txt{display:none}
  .vpager .vpager-step>span[aria-hidden]{font-size:19px}
  .vpager-num{min-width:32px;height:34px;line-height:34px;padding:0 5px}
}
@media print{ .vpage-btn,.vpager-row{display:none!important} }
/* ARCHIVED TASKS (above): the Archived button, its count in a small pill; pressed, it is drawn as the chosen view is
   (ink), its count on the primary colour in that colour's ink */
.task-archived .task-archived-count{display:inline-block;min-width:19px;padding:1px 6px;border-radius:10px;background:var(--color-surface-sunken);color:var(--color-text-secondary);font-size:11px;font-weight:700;line-height:1.45;text-align:center;font-variant-numeric:tabular-nums;box-sizing:border-box}
.task-archived.on{background:var(--color-ink);border-color:var(--color-ink);color:var(--color-ink-text)}
.task-archived.on:hover{background:var(--color-ink);opacity:.9}
.task-archived.on .task-archived-count{background:var(--color-primary);color:var(--color-primary-ink)}
.task-archived-back{margin:-4px 0 8px}
/* while on: the line under the title (how many, and how they got there) never widens the title's block, so the
   actions keep the place they have; it wraps within the room the block takes */
.task-pagehead.task-archived-on>div:first-child{flex:1 1 auto;min-width:0}
.task-pagehead.task-archived-on>div:first-child>.muted{contain:inline-size}
/* every card is archived here: none is greyed out */
.task-archived-list .kcard.dim,.task-archived-list .kcard.dim .kthumb,.task-archived-list .chip.dim,.task-archived-list .row.dim{opacity:1;filter:none}
.task-archived-list .kcard.dim{background:var(--color-surface)}
.task-archived-empty .empty .ico svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.task-archived-empty+div[data-tour="task-list"]{margin-top:14px}
/* The head keeps its rows at every width (e2e/task-toolbar-rows.spec.js, e2e/archived-tasks.spec.js). Its name and
   count take 137 px in English and 149 in Indonesian, which the row of actions has from 1240 px; below that the
   button is round, its icon with its count on its corner as on the Filters button, its name in aria-label and title.
   Even round it had no room in places from 600 to 1099 px: under 640 px while selecting with Timeline chosen (its
   word the longest), where the views show all five words beside Select (828 to 899 px, 2 px left in Indonesian
   while selecting) and where the actions share the title's row (981 to 1099 px, 10 px left at 981 while selecting,
   12 px at 1024 in Indonesian). Excel gives up its word there, one rule for that whole range rather than three:
   its icon, round, its name kept the same way. On a phone (up to 599 px) the button sits in the title's row beside
   the round New task, the row of views under it unchanged. */
@media (max-width:1239px){
  .task-pagehead .actions>.task-archived{position:relative;width:36px;min-width:36px;height:36px;padding:0;gap:0;justify-content:center;border-radius:50%;flex:none}
  .task-pagehead .task-archived .task-archived-label{display:none}
  .task-pagehead .task-archived .task-archived-count{position:absolute;right:-6px;top:-6px;min-width:18px;height:18px;padding:0 4px;border:1px solid var(--color-border-strong);border-radius:9px;background:var(--color-surface);color:var(--color-text-primary);font-size:9.5px;line-height:16px}
  .task-pagehead .task-archived.on .task-archived-count{border-color:var(--color-surface);background:var(--color-primary);color:var(--color-primary-ink)}
}
@media (min-width:600px) and (max-width:980px){
  .task-pagehead .actions>.task-archived{width:38px;min-width:38px;height:38px}
}
@media (min-width:600px) and (max-width:1099px){
  .task-pagehead .actions>.task-export{width:36px;min-width:36px;height:36px;padding:0;gap:0;justify-content:center;border-radius:50%}
  .task-pagehead .task-export .task-export-label{display:none}
}
@media (min-width:600px) and (max-width:980px){
  .task-pagehead .actions>.task-export{width:38px;min-width:38px;height:38px}
}
@media (max-width:599px){
  .task-pagehead:has(.task-new)>div:first-child{padding-right:92px}
  .task-pagehead .actions>.task-archived{position:absolute;top:0;right:44px;width:38px;min-width:38px;height:38px;margin:0}
  .task-pagehead .actions:not(:has(.task-new))>.task-archived{right:0}
}
</style>
