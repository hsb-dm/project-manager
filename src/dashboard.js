<script>
/* ============================================================
   DASHBOARD — KPI · priorities · team workload · projects · deadlines · review queue · requests · activity (§15–18)
   ============================================================ */
function kpi(cls,v,k,hint,onclick,icon,sq){ return '<div class="kpi '+cls+'" onclick="'+(onclick||"")+'"><div class="top"><span class="sq '+(sq||"")+'">'+(icon||I.tasks)+'</span><span class="k">'+tr(k)+'</span></div><div class="v">'+v+'</div>'+(hint?'<div class="d">'+tr(hint)+'</div>':'')+'</div>'; }
function rail(){ var st=WS.workflow; var counts={}; var max=1; st.forEach(function(s){ counts[s.id]=0; }); visibleBoardTasks().forEach(function(x){ counts[x.status]=(counts[x.status]||0)+1; }); st.forEach(function(s){ if (counts[s.id]>max) max=counts[s.id]; });
  var h='<div class="rail"><div class="rail-head"><span class="sq">'+I.kanban+'</span><div><div style="font-weight:700">Creative pipeline</div><div class="sub">'+(S.railFilter?'Filtered by “'+esc(stageName(S.railFilter))+'” · <a href="#" onclick="S.railFilter=null;renderScreen(false);return false" style="color:var(--color-primary);font-weight:600">Clear</a>':tr("All")+' '+visibleBoardTasks().length+' '+tr("tasks"))+'</div></div></div><div class="rail-track">';
  st.forEach(function(sg){ var n=counts[sg.id]||0; var over=visibleBoardTasks().filter(function(x){ return x.status===sg.id&&x.due<0&&sg.kind!=="closed"; }).length; var cls=sg.kind==="closed"?"good":sg.kind==="review"?"warn":sg.kind==="revision"?"bad":"";
    h+='<div class="stage '+cls+(S.railFilter===sg.id?" on":"")+(n===0?" empty":"")+'" onclick="S.railFilter=(S.railFilter===\''+sg.id+'\')?null:\''+sg.id+'\';renderScreen(false)" title="'+attr(sg.name)+'">'+(over?'<span class="flag"></span>':'')+'<div class="n">'+n+'</div><div class="l">'+esc(sg.name)+'</div><div class="bar"><i style="width:'+Math.round(n/max*100)+'%"></i></div></div>'; });
  return h+'</div></div>'; }
var DASH_DEFAULT=["myspace","kpis","rail","priorities","review","workload","projects","deadlines","requests","activity"];
function dashOrder(){ var p=myPrefs(); var saved=p.dashboard; var o=(saved||[]).filter(function(k){ return DASH_DEFAULT.indexOf(k)>=0; }); DASH_DEFAULT.forEach(function(k){ if (o.indexOf(k)<0) o.push(k); }); return o; }
function dashWide(k){ var p=myPrefs(); var w=p.dashWide||{}; return w[k]!=null?!!w[k]:(k==="myspace"||k==="kpis"||k==="rail"||k==="activity"); }
function toggleDashWide(k){ var pf=myPrefs(); pf.dashWide=pf.dashWide||{}; pf.dashWide[k]=!dashWide(k); saveMyPrefs(); renderScreen(false); }
function dashPrefs(){ return myPrefs(); }
function saveDashPrefs(){ saveMyPrefs(); }
function dashHidden(){ return myPrefs().dashHidden||[]; }
/* v19.5 My space starts minimized (summary row + tabs); clicking the row or a tab expands it. Applied once per member so an explicit choice sticks. */
function dashCollapsed(){ var pf=dashPrefs(); var c=pf.dashCollapsed||[]; if(!pf.myspaceCollapsedInit){ pf.myspaceCollapsedInit=true; if(c.indexOf("myspace")<0) c=c.concat(["myspace"]); pf.dashCollapsed=c; saveDashPrefs(); } return c; }
function toggleDashHide(k){ var pf=dashPrefs(); var h=(pf.dashHidden||[]).slice(); var i=h.indexOf(k); if (i>=0) h.splice(i,1); else h.push(k); pf.dashHidden=h; saveDashPrefs(); renderScreen(false); }
function toggleDashCollapse(k){ var pf=dashPrefs(); var c=dashCollapsed().slice(); var i=c.indexOf(k); if (i>=0) c.splice(i,1); else c.push(k); pf.dashCollapsed=c; saveDashPrefs(); renderScreen(false); }
/* v19.7 the eight KPI cards are back; each can be shown/hidden per member (myPrefs.kpiHidden) from Customize */
var KPI_ALL=[["mytasks","My tasks"],["duetoday","Due today"],["inreview","In review"],["overdue","Overdue"],["assetsdone","Assets delivered"],["assetsopen","Assets in production"],["assetlinks","Asset links"],["autohidden","Auto-hidden"]];
function kpiHidden(){ return myPrefs().kpiHidden||[]; }
var DASH_NAMES={myspace:"My space",kpis:"KPI cards",rail:"Creative pipeline",priorities:"My priorities",review:"Needs your review",workload:"Team workload",projects:"Active projects",deadlines:"Upcoming deadlines",requests:"Inbox \u2014 new requests",activity:"Recent activity"};
/* ---------- one modal: tick everything, then apply ---------- */
var CUST=null;
function dashMenu(){ customizeModal(); }
function customizeModal(){
  CUST={ dash:dashHidden().slice(), nav:navHidden().slice(), kpi:kpiHidden().slice() };
  openModal("Customize layout",
    '<p class="hint" style="margin-bottom:14px">Choose your home cards and menu items, then click Apply. Changes only affect your account.</p>'
    + '<div class="eyebrow" style="margin-bottom:8px">Cards on my home <span class="hint" id="cust_dn" style="font-weight:400"></span></div>'
    + '<div class="chips" style="margin-bottom:16px">'+DASH_DEFAULT.map(function(k){
        return '<label class="chipx" style="cursor:pointer"><input type="checkbox" '+(CUST.dash.indexOf(k)<0?"checked":"")+' onchange="custToggle(\'dash\',\''+k+'\',this.checked)"> '+DASH_NAMES[k]+'</label>'; }).join("")+'</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:18px"><button class="btn xs" onclick="custAll(\'dash\',true)">Select all</button><button class="btn xs ghost" onclick="custAll(\'dash\',false)">Clear all</button></div>'
    + '<div class="eyebrow" style="margin-bottom:8px">KPI cards <span class="hint" id="cust_kn" style="font-weight:400"></span></div>'
    + '<div class="chips" style="margin-bottom:16px">'+KPI_ALL.map(function(k){
        return '<label class="chipx" style="cursor:pointer"><input type="checkbox" '+(CUST.kpi.indexOf(k[0])<0?"checked":"")+' onchange="custToggle(\'kpi\',\''+k[0]+'\',this.checked)"> '+tr(k[1])+'</label>'; }).join("")+'</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:18px"><button class="btn xs" onclick="custAll(\'kpi\',true)">Select all</button><button class="btn xs ghost" onclick="custAll(\'kpi\',false)">Clear all</button></div>'
    + '<div class="eyebrow" style="margin-bottom:8px">Top menu <span class="hint" id="cust_nn" style="font-weight:400"></span></div>'
    + '<div class="chips" style="margin-bottom:16px">'+NAV_ALL.map(function(it){ var lock=it[0]==="home";
        return '<label class="chipx" style="cursor:'+(lock?"not-allowed":"pointer")+';opacity:'+(lock?".6":"1")+'"><input type="checkbox" '+(CUST.nav.indexOf(it[0])<0?"checked":"")+(lock?" disabled":"")+' onchange="custToggle(\'nav\',\''+it[0]+'\',this.checked)"> '+it[1]+'</label>'; }).join("")+'</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:18px"><button class="btn xs" onclick="custAll(\'nav\',true)">Select all</button><button class="btn xs ghost" onclick="custAll(\'nav\',false)">Clear all</button></div>'
    + '<div class="eyebrow" style="margin-bottom:8px">Presets</div><div id="cust_presets"></div>',
    '<button class="btn ghost" onclick="custResetAll()">'+I.sync+'Reset to default</button><span class="spacer"></span><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="custApply()">'+I.check+'Apply</button>',
    true);
  renderPresets(); custCounts();
}
function custToggle(group,k,on){
  var a=CUST[group], i=a.indexOf(k);
  if (on){ if (i>=0) a.splice(i,1); } else if (i<0) a.push(k);
  custCounts();
}
function custAll(group,on){
  CUST[group]= on?[]:(group==="dash"?DASH_DEFAULT.slice():group==="kpi"?KPI_ALL.map(function(x){ return x[0]; }):NAV_ALL.map(function(x){ return x[0]; }).filter(function(x){ return x!=="home"; }));
  var boxes=document.querySelectorAll('#modal input[type="checkbox"]');
  var list=group==="dash"?DASH_DEFAULT:NAV_ALL.map(function(x){ return x[0]; });
  for (var i=0;i<boxes.length;i++){
    var h=boxes[i].getAttribute("onchange")||"";
    if (h.indexOf("'"+group+"'")<0) continue;
    if (boxes[i].disabled) continue;
    boxes[i].checked=on;
  }
  custCounts();
}
function custCounts(){
  var d=document.getElementById("cust_dn"), n=document.getElementById("cust_nn"), kk=document.getElementById("cust_kn");
  if (kk){ kk.textContent="\u00b7 "+(KPI_ALL.length-CUST.kpi.length)+" of "+KPI_ALL.length+" shown"; localizeVisibleText(kk); }
  if (d) d.textContent="\u00b7 "+(DASH_DEFAULT.length-CUST.dash.length)+" of "+DASH_DEFAULT.length+" shown";
  if (n) n.textContent="\u00b7 "+(NAV_ALL.length-CUST.nav.length)+" of "+NAV_ALL.length+" shown";
  localizeVisibleText(d); localizeVisibleText(n);
}
function custApply(){
  var pf=myPrefs();
  pf.dashHidden=CUST.dash.slice();
  pf.navHidden=CUST.nav.slice();
  pf.kpiHidden=(CUST.kpi||[]).slice();
  saveMyPrefs(); closeModal(); applyShell(); refresh();
  toast("Layout updated");
}
function custResetAll(){
  CUST={dash:[],nav:[],kpi:[]};
  var pf=myPrefs();
  pf.dashHidden=[]; pf.navHidden=[]; pf.kpiHidden=[]; pf.dashCollapsed=[]; pf.dashboard=null; pf.dashWide=null;
  saveMyPrefs(); closeModal(); applyShell(); refresh();
  toast("Layout restored to default");
}

/* ---------- presets, saved per person ---------- */
function presets(){ return myPrefs().presets||[]; }
function renderPresets(){
  var el=document.getElementById("cust_presets"); if (!el) return;
  var ps=presets();
  el.innerHTML=(ps.length?ps.map(function(p){
      return '<div class="alink"><span class="ficon" style="background:var(--color-primary)">'+I.tiles+'</span>'
        + '<div style="min-width:0;flex:1"><div class="t">'+esc(p.name)+'</div><div class="m"><span>'+(DASH_DEFAULT.length-(p.dashHidden||[]).length)+' cards</span><span>'+(NAV_ALL.length-(p.navHidden||[]).length)+' menu items</span></div></div>'
        + '<div style="display:flex;gap:4px"><button class="btn xs" onclick="loadPreset(\''+p.id+'\')">Load</button><button class="btn xs ghost" onclick="updatePreset(\''+p.id+'\')" title="Overwrite with what is ticked now">Update</button><button class="btn xs ghost" onclick="delPreset(\''+p.id+'\')">'+I.trash+'</button></div></div>'; }).join("")
    :'<p class="hint">No presets saved.</p>')
    + '<div style="display:flex;gap:6px;margin-top:10px"><input id="cust_pname" placeholder="Preset name, e.g. Daily standup" style="flex:1;border:1px solid var(--color-border);border-radius:var(--pill);padding:7px 12px;background:var(--color-surface-sunken);outline:none;color:var(--color-text-primary);font-size:var(--fs-sm)" onkeydown="if(event.key===\'Enter\')savePreset()"><button class="btn sm" onclick="savePreset()">'+I.plus+'Save current</button></div>';
  localizeVisibleText(el);
}
function savePreset(){
  var el=document.getElementById("cust_pname"); var name=(el.value||"").trim();
  if (!name) return toast("Give the preset a name","bad");
  var pf=myPrefs(); pf.presets=presets().slice();
  pf.presets.push({ id:"pr_"+Math.random().toString(36).slice(2,7), name:name, dashHidden:CUST.dash.slice(), navHidden:CUST.nav.slice(), dashboard:pf.dashboard||null, dashWide:pf.dashWide||null });
  saveMyPrefs(); el.value=""; renderPresets(); toast('Preset "'+name+'" saved');
}
function updatePreset(id){
  var pf=myPrefs(); pf.presets=presets().map(function(p){ return p.id===id?Object.assign({},p,{dashHidden:CUST.dash.slice(),navHidden:CUST.nav.slice(),dashboard:pf.dashboard||null,dashWide:pf.dashWide||null}):p; });
  saveMyPrefs(); renderPresets(); toast("Preset updated");
}
function delPreset(id){
  var pf=myPrefs(); pf.presets=presets().filter(function(p){ return p.id!==id; });
  saveMyPrefs(); renderPresets(); toast("Preset deleted");
}
/* loading only stages the preset \u2014 Apply still has the last word */
function loadPreset(id){
  var p=null; presets().forEach(function(x){ if (x.id===id) p=x; });
  if (!p) return;
  CUST={ dash:(p.dashHidden||[]).slice(), nav:(p.navHidden||[]).slice() };
  var pf=myPrefs(); if (p.dashboard) pf.dashboard=p.dashboard; if (p.dashWide) pf.dashWide=p.dashWide;
  var boxes=document.querySelectorAll('#modal input[type="checkbox"]');
  for (var i=0;i<boxes.length;i++){
    var h=boxes[i].getAttribute("onchange")||"";
    var m=h.match(/custToggle\('(\w+)','([\w-]+)'/);
    if (!m) continue;
    boxes[i].checked = CUST[m[1]].indexOf(m[2])<0;
  }
  custCounts(); toast('Loaded "'+p.name+'" \u2014 press Apply to use it');
}
function resetDashboard(){ var pf=myPrefs(); pf.dashHidden=[]; pf.dashCollapsed=[]; pf.dashboard=null; pf.dashWide=null; saveMyPrefs(); renderScreen(false); toast("Home layout restored to default"); }
function saveDashOrder(order){ myPrefs().dashboard=order; saveMyPrefs(); }
var DDRAG=null;
function dStart(e,k){ DDRAG=k; e.dataTransfer.effectAllowed="move"; setTimeout(function(){ var el=document.querySelector('[data-sec="'+k+'"]'); if (el) el.classList.add("drag"); },0); }
function dOver(e,el){ e.preventDefault(); el.classList.add("over"); }
function dDrop(e,k){ e.preventDefault(); document.querySelectorAll("[data-sec].over,[data-sec].drag").forEach(function(x){ x.classList.remove("over","drag"); }); var from=DDRAG; DDRAG=null; if (!from||from===k) return; var o=dashOrder(); o.splice(o.indexOf(from),1); o.splice(o.indexOf(k),0,from); saveDashOrder(o); renderScreen(false); toast("Dashboard layout saved"); }
function renderDashboard(){ var ot=openTasks(); var hr=new Date().getHours(); var g=hr<11?"Good morning":hr<18?"Good afternoon":"Good evening"; var d=new Date();
  var mine=ot.filter(function(x){ return isAssignee(x,ME); }); var today=ot.filter(function(x){ return x.due===0; }); var inrev=ot.filter(function(x){ return isReview(x); }); var over=ot.filter(function(x){ return x.due<0; }); var rev=sortTasks(inrev.filter(function(x){ return isReviewer(x,ME)||canI.reviewTask(x); }));
  var doneWeek=TASKS.filter(function(x){ return isClosed(x)&&x.completedAt&&minAgo(x.completedAt)<7*1440; }).length; var assetsDone=assetsProduced(TASKS.filter(isClosed)); var assetsOpen=assetsProduced(ot);
  var h='<div class="pagehead m-head"><div><div class="date">'+uiDow(d.getDay())+', '+uiMol(d.getMonth())+' '+d.getDate()+'</div><h1>'+tr(g)+', '+first(ME)+'</h1><div class="muted" style="margin-top:4px">'+rev.length+' '+tr("waiting for your review")+' · '+today.length+' '+tr("due today")+' · '+over.length+' '+tr("overdue")+' · '+doneWeek+' '+tr("completed this week")+'</div></div><div class="actions"><button class="btn desktop-only" onclick="openMenu(\'exportMenu\',this)" data-menu>'+I.download+tr("Export")+'</button>'+dashboardCreateAction()+'<button class="btn desktop-only" id="dashCustom" title="'+tr("Choose which cards and menu items you see")+'" onclick="customizeModal()">'+I.tiles+tr("Customize")+((dashHidden().length+navHidden().length)?' <span class="cnt">'+(dashHidden().length+navHidden().length)+'</span>':'')+'</button></div></div>';
  h+=typeof wqHomeCard==="function"?wqHomeCard():"";
  var rf=S.railFilter, inStage=function(x){ return !rf||x.status===rf; };
  var prioTitle=rf?"Tasks in “"+esc(stageName(rf))+"”":"My priorities"; var prioList=rf?sortTasks(visibleBoardTasks().filter(function(x){ return x.status===rf; })):sortTasks(mine);
  if (rf) rev=rev.filter(inStage);
  var upcoming=sortTasks(ot.filter(inStage).filter(function(x){ return x.due>=0&&x.due<=7; })).slice(0,6); var openReqs=sortTasks(ot.filter(inStage).filter(function(t){ return isRequestTask(t)&&!projArchived(t.proj); }));
  var actAll=ACTIVITY; var actMine=ACTIVITY.filter(function(a){ var t=a.a.task?task(a.a.task):null; return (t&&involved(t,ME))||a.who===ME; }); var actList=S.actScope==="all"?actAll:actMine;
  var sec={
    /* v19.4 My space is a normal Home card: draggable, hideable, collapsible, restorable from Customize */
    myspace:{full:true,html:typeof workbenchHtml==="function"?workbenchHtml():""},
    kpis:{full:true,html:(function(){ var kh=kpiHidden(); var cards={
      mytasks:function(){ return kpi("accent",mine.length,tr("My tasks"),"","go(\'tasks\')",I.tasks,"blue"); },
      duetoday:function(){ return kpi("warn",today.length,tr("Due today"),"","go(\'calendar\')",I.calendar,"lime"); },
      inreview:function(){ return kpi("",inrev.length,tr("In review"),rev.length+" "+tr("waiting for you"),"S.railFilter=\'"+(WS.workflow.filter(function(s){return s.kind==="review";})[0]||{id:""}).id+"\';renderScreen(false)",I.eye,"ink"); },
      overdue:function(){ return kpi(over.length?"danger":"good",over.length,tr("Overdue"),"","S.filters.due=\'overdue\';S.taskScope=\'all\';go(\'tasks\',\'list\')",I.bell,over.length?"red":"green"); },
      assetsdone:function(){ return kpi("good",assetsDone,tr("Assets delivered"),tr("from completed tasks"),"S.filters.kind=\'closed\';S.taskScope=\'all\';go(\'tasks\',\'list\')",I.assets,"green"); },
      assetsopen:function(){ return kpi("accent",assetsOpen,tr("Assets in production"),tr("planned on open tasks"),"go(\'tasks\')",I.assets,"blue"); },
      assetlinks:function(){ return kpi("",assetLinks(TASKS).length,tr("Asset links"),tr("attached to tasks"),"go(\'projects\')",I.link,"ink"); },
      autohidden:function(){ return kpi("",autoHiddenCount(),tr("Auto-hidden"),tr("done tasks")+" · "+autoHideLabel(),"S.filters.hidden=\'show\';S.taskScope=\'all\';go(\'tasks\',\'list\')",I.eye,"lime"); } };
      var shown=KPI_ALL.map(function(k){ return k[0]; }).filter(function(k){ return kh.indexOf(k)<0; }); if(!shown.length) return '<div class="hint" style="padding:6px 2px">'+tr("All KPI cards are hidden.")+' <a href="#" onclick="customizeModal();return false" style="color:var(--color-primary);font-weight:600">'+tr("Customize")+'</a></div>';
      var cols=shown.length>=4?4:shown.length; return '<div class="kpis kpis-4 kpis-n'+cols+'">'+shown.map(function(k){ return cards[k](); }).join("")+'</div>'; })()},
    rail:{full:true,html:rail()},
    priorities:{html:panel(prioTitle,prioList.length,prioList.length?prioList.slice(0,8).map(function(x){ return taskRow(x,{showAssignee:!!S.railFilter}); }).join(""):emptyBox(S.railFilter?"No tasks in this stage":"No tasks assigned to you",S.railFilter?"Try another stage or clear the filter.":""),"go(\'tasks\')",null,I.tasks)},
    review:{html:panel("Needs your review",rev.length,rev.length?rev.slice(0,6).map(function(x){ return taskRow(x,{showStatus:false}); }).join(""):emptyBox("Nothing waiting for your review",""),null,null,I.eye,"ink")},
    workload:{html:panel("Team workload",activeTeams().length,teamWorkloadRows(),"go(\'teams\')",null,I.team)},
    projects:{html:panel("Active projects",liveProjects().filter(function(p){return p.status!=="done";}).length,projRows(liveProjects().filter(function(p){return p.status!=="done";})),"go(\'projects\')",null,I.projects)},
    deadlines:{html:panel("Upcoming deadlines",upcoming.length,upcoming.length?upcoming.map(function(x){ return taskRow(x,{showStatus:false}); }).join(""):emptyBox("Nothing due this week",""),"go(\'calendar\')",null,I.calendar)},
    requests:{html:panel("Inbox — new requests",openReqs.length,openReqs.length?openReqs.slice(0,6).map(function(x){ return taskRow(x,{showStatus:false}); }).join(""):emptyBox("Inbox is empty",""),"S.filters.status=firstStage();S.taskScope=\'all\';go(\'tasks\',\'list\')",null,I.inbox)},
    activity:{full:true,html:panel("Recent activity",actList.length,actList.length?activityRows(actList,10):emptyBox("No activity on your tasks yet",""),null,'<div class="seg"><button class="'+(S.actScope!=="all"?"on":"")+'" onclick="S.actScope=\'mine\';renderScreen(false)">Mine</button><button class="'+(S.actScope==="all"?"on":"")+'" onclick="S.actScope=\'all\';renderScreen(false)">All</button></div>',I.sync)}
  };
  var hidden=dashHidden(), collapsed=dashCollapsed();
  var MARK='<span class="spacer"></span>';
  var card=function(ctl,html){
    /* Wanted order: icon, title, count, head actions (Mine/All, View all), gap, controls.
       panel() puts every action after the spacer, so move that whole run in front of it
       and park the controls at the end. */
    var b=html.indexOf('<div class="panel-body');
    if (b<0||html.indexOf('panel-head')<0) return ctl.replace('class="dctl"','class="dctl float"')+html;
    var head=html.slice(0,b), rest=html.slice(b);
    var e=head.lastIndexOf("</div>");
    if (e<0) return ctl.replace('class="dctl"','class="dctl float"')+html;
    var sp=head.indexOf(MARK);
    if (sp>=0){
      var actions=head.slice(sp+MARK.length,e);
      head=head.slice(0,sp)+actions+MARK+head.slice(e);
      e=head.lastIndexOf("</div>");
    }
    return head.slice(0,e)+ctl+head.slice(e)+rest;
  };
  if (rf){
    var nStage=visibleBoardTasks().filter(function(x){ return x.status===rf; }).length;
    h+='<div class="railbar">'+I.filter+'<span>Pipeline filtered to <b>'+esc(stageName(rf))+'</b> \u00b7 '+nStage+' task'+(nStage===1?"":"s")+'.</span><span class="spacer"></span>'
      + '<button class="btn xs" onclick="openHomeTasks({status:\''+rf+'\'})">Open in Tasks</button>'
      + '<button class="btn xs ghost" onclick="S.railFilter=null;renderScreen(false)">'+I.x+'Clear</button></div>';
  }
  var questDash=typeof wqRequiredDashboard==="function"?wqRequiredDashboard():null;
  h+='<div class="dash">'+dashOrder().filter(function(k){ return hidden.indexOf(k)<0||questDash===k||(rf&&(k==="priorities"||k==="rail")); }).map(function(k){ var s=sec[k]; var col=collapsed.indexOf(k)>=0; var wide=dashWide(k); var ctl='<div class="dctl"><button title="'+(wide?"Half width":"Full width")+'" onclick="event.stopPropagation();toggleDashWide(\''+k+'\')">'+(wide?'<svg viewBox="0 0 24 24"><path d="M9 5l-6 7 6 7M15 5l6 7-6 7"/></svg>':'<svg viewBox="0 0 24 24"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>')+'</button><button title="'+(col?"Expand":"Minimize")+'" aria-label="'+(col?"Expand":"Minimize")+'" aria-expanded="'+(col?"false":"true")+'" onclick="event.stopPropagation();toggleDashCollapse(\''+k+'\')">'+(col?I.chevd:I.chevu)+'</button><button title="Hide from my dashboard" onclick="event.stopPropagation();toggleDashHide(\''+k+'\')">'+I.x+'</button></div>';
    return '<div data-sec="'+k+'" data-tour="home-'+k+'" class="'+(wide?"full":"")+(col?" collapsed":"")+'" draggable="true" ondragstart="dStart(event,\''+k+'\')" ondragend="this.classList.remove(\'drag\')" ondragover="dOver(event,this)" ondragleave="this.classList.remove(\'over\')" ondrop="dDrop(event,\''+k+'\')">'+(k==="myspace"?s.html.replace(/<\/div>(<div class="wb-body">|<\/section>)/,ctl+'</div>$1'):card(ctl,s.html))+'</div>'; }).join("")+'</div><div class="hint" style="text-align:center">'+(hidden.length?'<a href="#" onclick="customizeModal();return false" style="color:var(--color-primary);font-weight:600">'+hidden.length+' hidden — restore</a>':'')+'</div>';
  document.getElementById("content").innerHTML=h; }
function dashboardCreateAction(){var taskAllowed=canI.createTask(),requestAllowed=canI.submitRequest();if(taskAllowed&&requestAllowed)return '<button class="btn primary m-primary" aria-label="'+attr(tr("Create"))+'" data-menu aria-haspopup="menu" title="'+tr("Create a task or submit a work request")+'" onclick="openMenu(\'createMenu\',this,dashboardCreateMenu())">'+I.plus+tr("Create")+I.chevd+'</button>';if(taskAllowed)return '<button class="btn primary m-primary" aria-label="'+attr(tr("New task"))+'" onclick="newTaskModal()">'+I.plus+tr("New task")+'</button>';if(requestAllowed)return '<button class="btn primary m-primary" aria-label="'+attr(tr("Request work"))+'" onclick="newRequestModal()">'+I.inbox+tr("Request work")+'</button>';return '';}
function dashboardCreateMenu(){return '<div class="mh">'+tr("Create work")+'</div><button class="create-option" onclick="closePops();newTaskModal()">'+I.tasks+'<span><b>'+tr("New task")+'</b><small>'+tr("Assign and schedule work now.")+'</small></span></button><button class="create-option" onclick="closePops();newRequestModal()">'+I.inbox+'<span><b>'+tr("Request work")+'</b><small>'+tr("Send unassigned work to the Inbox for triage.")+'</small></span></button>';}
</script>
