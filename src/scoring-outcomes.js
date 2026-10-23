<script>
/* ============================================================
   KPIs AND OKRs (Oct 2026)
   Smart Scoring's outcomes (docs/SMART-SCORING.md §11; the server is server/outcomes.js): KPI indicators, and
   Objectives with their Key Results — one metric model for both, each with a baseline, a target, a direction, a period
   and where its progress comes from: the assets a team's lead validated on finished tasks, the tasks finished
   successfully, or a value entered by hand with a reason. Points never count as progress, and the AI never records any.
   Settings → Smart Scoring has a "KPIs and OKRs" section (scoringOutcomesSettingsHtml, called from src/scoring-settings.js):
   whoever holds scoring_manage_outcomes defines KPIs, objectives and key results and enters values; everyone who sees
   the tab sees each one's progress as a bar, said to come "from evidence" or to be "manual", with how it was worked out
   step by step, starting with what it counts; a metric with nothing to measure against says why instead of showing a
   made-up percentage. Which tasks count, the baseline and the direction are under the editor's "Advanced". Details
   list the tasks counted (and taken back), the links waiting for a manager, the values entered and the history. A
   person given scoring_manage_outcomes alone sees the tab for this section (the rest of it read-only).
   A task's Smart Scoring panel shows what the task counts towards (scoringOutcomesRowHtml, called by the panel when
   defined): each KPI or key result it is linked to or counts for by its rule, what it adds or why it does not count yet,
   and a picker (the shared entity picker) to link it to another — a link waits for an outcomes manager to confirm it.
   KPI and OKR are switched on separately (scoringModuleOn("kpi"|"okr")); while one is off its part is shown as it was
   and cannot change. Nothing is ranked by person. Both parts draw at once from what the page already has and refresh
   in place, only where something changed, so switching the language or redrawing never makes them blink. The offline
   demo has no server to count evidence, and says so.
   ============================================================ */
I.target=I.target||'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>';
var SCO={data:null,html:null,loading:false,loadedAt:0,err:false,archived:false,open:{},tasks:{},taskHtml:{},taskAt:{},taskLoading:{},owner:null,saving:false,shown:null,again:{}};
var SCO_RULE_LABEL={approved_assets:"Approved assets",tasks_completed:"Completed tasks",manual:"Entered by hand"};
var SCO_STATUS_LABEL={draft:"Draft",active:"Active",closed:"Closed",archived:"Archived"};
/* why a task does not count (yet) towards something it is linked to or covered by */
var SCO_WHY={waiting_confirmation:"Waiting for an outcomes manager to confirm the link",switched_off:"Switched off: nothing is counted for now",not_active:"Not active: nothing is counted for now",
  not_completed:"Counts once the task is finished",not_validated:"Counts once a lead validates its asset counts",no_assets:"No validated assets",outside_period:"Finished outside the period",
  outside_filter:"Outside what it counts",not_linked:"Counts linked tasks only",manual_rule:"Its value is entered by hand",no_task:"Not counted"};

/* ---------- small pieces ---------- */
function scoFill(s){ var f=typeof ScoringEngine!=="undefined"?ScoringEngine.fill:function(t){ return t; }; return f(tr(s.key),s.vars||{}); }
function scoNum(v){ if(v===null||v===undefined||v==="") return "—"; var n=+v; if(!isFinite(n)) return "—"; n=Math.round(n*100)/100; try{ return n.toLocaleString(UI_LANG==="id"?"id-ID":"en-US",{maximumFractionDigits:2}); }catch(e){ return String(n); } }
function scoPct(v){ var p=Math.round(v*1000)/10; return (p%1===0?String(p):p.toFixed(1))+"%"; }
function scoDay(s){ if(!s) return ""; var p=String(s).split("-"); return (+p[2])+" "+uiMo(+p[1]-1)+" "+p[0]; }
function scoPeriod(p){ p=p||{}; if(!p.start&&!p.end) return tr("Any time"); if(p.start&&p.end) return scoDay(p.start)+" – "+scoDay(p.end); return p.start?tr("From")+" "+scoDay(p.start):tr("Until")+" "+scoDay(p.end); }
function scoKind(m){ return m.kind==="kpi"?tr("KPI"):tr("Key result"); }
function scoKindOn(kind){ return scoringModuleOn(kind==="kpi"?"kpi":"okr"); }
function scoObjective(id){ var d=SCO.data; return d&&byId(d.objectives,id)||null; }
function scoRuleText(m){ var r=m.rule||{}, f=r.filter||{}, bits=[tr(SCO_RULE_LABEL[r.type]||r.type)];
  if(r.type!=="manual"){ if(r.scope==="linked") bits.push(tr("linked tasks only"));
    else { var w=[]; if(f.team) w.push(teamName(f.team)); if(f.project) w.push((project(f.project)||{}).name||f.project); if(f.label) w.push((label(f.label)||{}).name||f.label); bits.push(w.length?w.join(" · "):tr("every task")); } }
  return bits.join(" · "); }
/* a progress bar, or "no progress yet" and why — never a percentage made up */
function scoBarHtml(p){ p=p||{};
  if(p.value===null||p.value===undefined){ var why=(p.steps||[]).filter(function(s){ return /^No progress/.test(s.key); }).pop(); return '<div class="scr-out-none">'+esc(why?scoFill(why):tr("No progress yet"))+'</div>'; }
  var w=Math.max(0,Math.min(100,Math.round(p.value*1000)/10));
  return '<div class="scr-out-bar"><div class="pbar'+(w>=100?" good":"")+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+w+'"><i style="width:'+w+'%"></i></div><span class="scr-out-pct">'+scoPct(p.value)+'</span></div>'; }
/* how a number is worked out — for a KPI or key result, first what it counts */
function scoWhyHtml(key,p,rule){ var st=(p&&p.steps)||[]; if(!st.length&&!rule) return "";
  return '<details class="scr-out-why"'+(SCO.open[key]?" open":"")+' ontoggle="SCO.open['+jsq(key)+']=this.open"><summary>'+tr("How this is worked out")+'</summary><ul>'+(rule?'<li>'+tr("Counts")+': '+esc(rule)+'</li>':'')+st.map(function(s){ return '<li>'+esc(scoFill(s))+'</li>'; }).join("")+'</ul></details>'; }
function scoIconBtn(icon,label,onclick){ return '<button type="button" class="iconbtn scr-out-ib" aria-label="'+attr(tr(label))+'" title="'+attr(tr(label))+'" onclick="'+onclick+'">'+icon+'</button>'; }

/* ---------- Settings → Smart Scoring: the section ---------- */
function scoringOutcomesSettingsHtml(ro,ed){
  if(!scoringFeature()||typeof scSection!=="function") return "";
  if(SCO.owner!==ME){ SCO.data=null; SCO.html=null; SCO.tasks={}; SCO.taskHtml={}; SCO.owner=ME; SCO.shown=null; }
  var title=tr("KPIs and OKRs"), intro=tr("Goals whose progress comes from real work — never from points."), o={icon:I.target,cls:"scr-out-panel"};
  if(!API.on) return scSection("outcomes",title,intro,scHelp(tr("KPIs and OKRs are kept on the ZenCrevia server, which counts their evidence; this offline copy does not track them.")),o);
  /* opened afresh: fetched now; drawn again while open (a redraw, the language): at most every few seconds */
  var fresh=!document.getElementById("scrOut"); setTimeout(function(){ scoLoad(fresh); },0);
  var h=scoBodyHtml(); SCO.html=h;
  o.example=tr("a KPI “Approved assets this month” with a target of 40: each asset a lead validates on a finished task adds 1, so 10 assets make 25%.");
  if(!scoringModuleOn("kpi")&&!scoringModuleOn("okr")) o.off=tr("KPI and OKR are both off. Turn either on in Overview and save, then set them up here.");
  return scSection("outcomes",title,intro,scHelp(tr("A KPI, objective or key result is saved as soon as it is added or changed — the Save bar is for the settings."))+'<div id="scrOut" class="scr-out">'+h+'</div>',o); }
function scoBodyHtml(){
  var d=SCO.data, kpi=scoringModuleOn("kpi"), okr=scoringModuleOn("okr"), man=canI.scoringManageOutcomes(), h="";
  if(!d) return SCO.err?'<div class="hint">'+tr("KPIs and OKRs could not be loaded.")+' <button class="btn sm" onclick="scoLoad(true)">'+tr("Try again")+'</button></div>':'<div class="hint">'+tr("Loading…")+'</div>';
  var kpis=d.metrics.filter(function(m){ return m.kind==="kpi"; });
  var shown=function(x){ return SCO.archived||x.status!=="archived"; }, hidden=d.metrics.filter(function(m){ return m.status==="archived"; }).length+d.objectives.filter(function(o){ return o.status==="archived"; }).length;
  if(kpi||kpis.length){
    var rows=kpis.filter(shown);
    h+='<div class="scr-out-block" data-kind="kpi"><div class="scr-out-head"><b>'+tr("KPIs")+'</b>'+(kpi?'':'<span class="badge">'+tr("Switched off — shown as they were")+'</span>')+'<span class="spacer"></span>'
      +(kpi&&man?'<button class="btn sm" id="scoNewKpi" onclick="scoMetricModal(\'kpi\',null,null)">'+I.plus+tr("New KPI")+'</button>':'')+'</div>'
      +(rows.length?rows.map(function(m){ return scoMetricHtml(m,man&&kpi); }).join(""):'<div class="hint">'+tr("No KPIs yet.")+'</div>')+'</div>'; }
  if(okr||d.objectives.length){
    var objs=d.objectives.filter(shown);
    h+='<div class="scr-out-block" data-kind="okr"><div class="scr-out-head"><b>'+tr("Objectives and key results")+'</b>'+(okr?'':'<span class="badge">'+tr("Switched off — shown as they were")+'</span>')+'<span class="spacer"></span>'
      +(okr&&man?'<button class="btn sm" id="scoNewObjective" onclick="scoObjectiveModal(null)">'+I.plus+tr("New objective")+'</button>':'')+'</div>'
      +(objs.length?objs.map(function(o){ return scoObjectiveHtml(o,d,man&&okr); }).join(""):'<div class="hint">'+tr("No objectives yet.")+'</div>')+'</div>'; }
  if(hidden) h+='<div class="scr-out-foot"><button class="btn sm" onclick="SCO.archived=!SCO.archived;scoPaint()">'+tr(SCO.archived?"Hide archived":"Show archived")+' ('+hidden+')</button></div>';
  return h; }
function scoMetricHtml(m,ed){
  var src=m.source==="manual"?tr("manual"):tr("from evidence"), man=m.manual, unit=m.unit?' <span data-no-translate>'+esc(m.unit)+'</span>':'';
  var line='<div class="scr-out-line"><span class="scr-out-title" data-no-translate>'+esc(m.title)+'</span><span class="badge scr-out-src" data-src="'+attr(m.source||"")+'">'+src+'</span>'
    +(m.status!=="active"?'<span class="badge">'+tr(SCO_STATUS_LABEL[m.status]||m.status)+'</span>':'')
    +(m.kind==="kr"?'<span class="badge scr-out-w">'+tr("weight")+' '+scoNum(m.weight)+'</span>':'')
    +'<span class="spacer"></span><span class="scr-out-acts">'
    +(ed&&m.rule.type==="manual"?scoIconBtn(I.edit,"Enter a value","scoValueModal("+jsq(m.id)+")"):'')
    +scoIconBtn(I.list,"Details","scoDetails("+jsq(m.id)+")")
    +(ed?scoIconBtn(I.settings,"Edit","scoMetricModal("+jsq(m.kind)+","+jsq(m.id)+",null)")+scoIconBtn(I.trash,"Delete","scoDelete(\'metric\',"+jsq(m.id)+")"):'')+'</span></div>';
  var nums=scoNum(m.actual)+' / '+scoNum(m.target)+unit+' · '+esc(scoPeriod(m.period))+(m.owner?' · <span data-no-translate>'+esc(person(m.owner).name)+'</span>':'');
  var extra=man?'<div class="scr-out-sub scr-out-manual">'+tr("Entered by")+' <span data-no-translate>'+esc(man.by?person(man.by).name:"")+'</span>, '+esc(ago(minAgo(man.at),man.at))+(man.reason?': <span data-no-translate>'+esc(man.reason)+'</span>':'')+'</div>':'';
  var wait=m.links&&m.links.waiting&&canI.scoringManageOutcomes()?'<div class="scr-out-sub scr-out-waiting">'+tr(m.links.waiting===1?"1 task link waits for you to confirm it":"{n} task links wait for you to confirm them").replace("{n}",m.links.waiting)+' — <a href="#" onclick="event.preventDefault();scoDetails('+jsq(m.id)+')">'+tr("Details")+'</a></div>':'';
  return '<div class="scr-out-m" data-metric="'+attr(m.id)+'">'+line+scoBarHtml(m.progress)+'<div class="scr-out-sub">'+nums+'</div>'+extra+wait+scoWhyHtml("m:"+m.id,m.progress,scoRuleText(m))+'</div>'; }
function scoObjectiveHtml(o,d,ed){
  var krs=d.metrics.filter(function(m){ return m.kind==="kr"&&m.objective===o.id&&(SCO.archived||m.status!=="archived"); });
  var line='<div class="scr-out-line"><span class="scr-out-title" data-no-translate>'+esc(o.title)+'</span>'+(o.status!=="active"?'<span class="badge">'+tr(SCO_STATUS_LABEL[o.status]||o.status)+'</span>':'')
    +'<span class="spacer"></span><span class="scr-out-acts">'
    +(ed?'<button class="btn sm" onclick="scoMetricModal(\'kr\',null,'+jsq(o.id)+')">'+I.plus+tr("Key result")+'</button>'+scoIconBtn(I.settings,"Edit","scoObjectiveModal("+jsq(o.id)+")")+scoIconBtn(I.trash,"Delete","scoDelete(\'objective\',"+jsq(o.id)+")"):'')+'</span></div>';
  var sub='<div class="scr-out-sub">'+esc(scoPeriod(o.period))+(o.owner?' · <span data-no-translate>'+esc(person(o.owner).name)+'</span>':'')+' · '+esc(tr(krs.length===1?"1 key result":"{n} key results").replace("{n}",krs.length))+'</div>';
  return '<div class="scr-out-obj" data-objective="'+attr(o.id)+'">'+line+scoBarHtml(o.progress)+sub+scoWhyHtml("o:"+o.id,o.progress)
    +'<div class="scr-out-krs">'+krs.map(function(m){ return scoMetricHtml(m,ed); }).join("")+'</div></div>'; }
/* draw again only where something changed */
function scoPaint(){ var el=document.getElementById("scrOut"); if(!el) return; var h=scoBodyHtml(); if(h===SCO.html&&el.innerHTML) return; SCO.html=h; el.innerHTML=h; }
function scoLoad(force){
  if(!API.on||SCO.loading||(!force&&SCO.loadedAt&&Date.now()-SCO.loadedAt<5000)) return Promise.resolve(SCO.data);
  SCO.loading=true;
  return apiFetch("GET","/api/outcomes").then(function(r){ SCO.loading=false; SCO.loadedAt=Date.now(); SCO.err=false; SCO.data=r; scoPaint(); return r; })
    .catch(function(){ SCO.loading=false; SCO.err=!SCO.data; scoPaint(); return SCO.data; }); }
/* after a write: the answer is the new state; the open task rows refresh too */
function scoTook(r,msg){ if(r&&r.metrics){ SCO.data={on:r.on,objectives:r.objectives,metrics:r.metrics,can:r.can}; SCO.loadedAt=Date.now(); }
  scoPaint(); SCO.taskAt={}; scoTaskRefreshAll(); if(msg) toast(tr(msg)); return r; }
function scoFailed(e){ SCO.saving=false; toast(e&&e.message?e.message:tr("Something went wrong"),"bad"); if(/in the meantime/.test(String(e&&e.message))){ closeModal(); scoLoad(true); } }

/* ---------- defining: KPIs and key results ---------- */
function scoNumIn(id,v,ph){ return '<input type="number" step="any" id="'+id+'" value="'+attr(v===null||v===undefined?"":v)+'"'+(ph?' placeholder="'+attr(tr(ph))+'"':'')+'>'; }
function scoPeopleOpts(){ return [["",tr("Nobody in particular")]].concat(Object.keys(PEOPLE).filter(function(id){ return !PEOPLE[id].stakeholder; }).sort(function(a,b){ return person(a).name.localeCompare(person(b).name); }).map(function(id){ return [id,person(id).name]; })); }
function scoMetricModal(kind,id,objective){
  if(!canI.scoringManageOutcomes()||!SCO.data) return;
  var m=id?byId(SCO.data.metrics,id):null; if(id&&!m) return; kind=m?m.kind:kind;
  var r=(m&&m.rule)||{type:kind==="kpi"?"approved_assets":"manual",scope:"matching",filter:{}}, f=r.filter||{};
  var objs=SCO.data.objectives.filter(function(o){ return o.status!=="archived"||(m&&m.objective===o.id); });
  var body=fieldHtml("sco_title","Name",'<input id="sco_title" maxlength="200" value="'+attr(m?m.title:"")+'" placeholder="'+attr(tr(kind==="kpi"?"e.g. Approved assets this month":"e.g. 40 approved launch assets"))+'">')
    +(kind==="kr"?'<div class="field-row">'+fieldHtml("sco_obj","Objective",selectHtml("sco_obj",objs.map(function(o){ return [o.id,o.title]; }),m?m.objective:objective))
      +fieldHtml("sco_weight","Weight in the objective",scoNumIn("sco_weight",m?m.weight:1))+'</div><p class="hint scr-out-fh">'+tr("A key result weighing 0 does not count towards its objective.")+'</p>':'')
    +fieldHtml("sco_rule","Progress comes from",selectHtml("sco_rule",[["approved_assets",tr("Assets a lead validated, on tasks finished successfully")],["tasks_completed",tr("Tasks finished successfully (1 each; Declined does not count)")],["manual",tr("A value entered by hand, with a reason")]],r.type,'onchange="scoRuleSync()"'))
    +'<div class="field-row">'+fieldHtml("sco_target","Target",scoNumIn("sco_target",m?m.target:null,"Required for progress"))+fieldHtml("sco_unit","Unit",'<input id="sco_unit" maxlength="24" value="'+attr(m?m.unit:"")+'" placeholder="'+attr(tr("e.g. assets"))+'">')+'</div>'
    +'<div class="field-row">'+fieldHtml("sco_start","Period from",'<input type="date" id="sco_start" value="'+attr(m&&m.period.start||"")+'">')+fieldHtml("sco_end","Period until",'<input type="date" id="sco_end" value="'+attr(m&&m.period.end||"")+'">')+'</div>'
    +'<div class="field-row">'+fieldHtml("sco_owner","Owner",selectHtml("sco_owner",scoPeopleOpts(),m&&m.owner||""))+fieldHtml("sco_status","Status",selectHtml("sco_status",[["active",tr("Active — counting")],["draft",tr("Draft — not counting yet")],["closed",tr("Closed — kept as it is")],["archived",tr("Archived — hidden")]],m?m.status:"active"))+'</div>'
    +fieldHtml("sco_desc","Description",'<textarea id="sco_desc" maxlength="2000">'+esc(m?m.description:"")+'</textarea>')
    /* which tasks count, the baseline and the direction: under "Advanced", open when they are not as they start */
    +scAdvanced('<div id="sco_counted">'+fieldHtml("sco_scope","Which tasks",selectHtml("sco_scope",[["matching",tr("Every task that matches the filter below (no filter: every task)")],["linked",tr("Only tasks linked to it, once an outcomes manager confirms the link")]],r.scope,'onchange="scoRuleSync()"'))
      +'<div class="field-row scr-out-filter" id="sco_filter">'+fieldHtml("sco_team","Team",selectHtml("sco_team",[["",tr("Any team")]].concat(activeTeams().map(function(t){ return [t.id,t.name]; })),f.team||""))
        +fieldHtml("sco_project","Project",selectHtml("sco_project",[["",tr("Any project")]].concat(liveProjects().map(function(p){ return [p.id,p.name]; })),f.project||""))
        +fieldHtml("sco_label","Label",selectHtml("sco_label",[["",tr("Any label")]].concat(allLabels().map(function(l){ return [l.id,l.name]; })),f.label||""))+'</div>'
      +'<p class="hint scr-out-fh">'+tr("A task linked by hand counts too, once an outcomes manager confirms the link. A task counts in the period by the day it was finished; reopened, it no longer counts.")+'</p></div>'
      +'<div class="field-row">'+fieldHtml("sco_dir","Direction",selectHtml("sco_dir",[["up",tr("Up — more is better")],["down",tr("Down — less is better")]],m?m.direction:"up"))+fieldHtml("sco_base","Baseline",scoNumIn("sco_base",m?m.baseline:0))+'</div>'
      +'<p class="hint scr-out-fh">'+tr("Counted evidence moves the actual from the baseline towards the target: up adds it, down takes it away (a backlog burnt down by completions).")+'</p>',
      {id:"outcome",open:!!(m&&(r.scope==="linked"||f.team||f.project||f.label||m.direction==="down"||+m.baseline))});
  openModal(m?(kind==="kpi"?"Edit KPI":"Edit key result"):(kind==="kpi"?"New KPI":"New key result"),body,'<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" id="sco_save" onclick="scoMetricSave('+jsq(kind)+','+jsq(id||"")+')">'+tr("Save")+'</button>',true);
  scoRuleSync(); }
function scoRuleSync(){ var r=document.getElementById("sco_rule"), c=document.getElementById("sco_counted"), s=document.getElementById("sco_scope"), f=document.getElementById("sco_filter"); if(!r||!c) return;
  c.hidden=r.value==="manual"; if(f&&s) f.hidden=s.value==="linked"; }
function scoMaybeNum(id){ var v=val(id); if(v==="") return null; var n=parseFloat(v.replace(",",".")); return isFinite(n)?n:v; }
function scoMetricSave(kind,id){
  if(SCO.saving||!require(["sco_title"])) return;
  var b={kind:kind,title:val("sco_title"),description:val("sco_desc"),unit:val("sco_unit"),direction:val("sco_dir"),baseline:scoMaybeNum("sco_base"),target:scoMaybeNum("sco_target"),
    period:{start:val("sco_start")||null,end:val("sco_end")||null},owner:val("sco_owner")||null,status:val("sco_status"),
    rule:{type:val("sco_rule"),scope:val("sco_scope")||"matching",filter:{team:val("sco_team")||null,project:val("sco_project")||null,label:val("sco_label")||null}}};
  if(kind==="kr"){ b.objective=val("sco_obj"); b.weight=scoMaybeNum("sco_weight"); }
  var m=id?byId(SCO.data.metrics,id):null; if(m) b.rev=m.rev;
  SCO.saving=true;
  apiFetch(m?"PUT":"POST",m?"/api/outcomes/metrics/"+encodeURIComponent(id):"/api/outcomes/metrics",b).then(function(r){ SCO.saving=false; closeModal(); scoTook(r,"Saved"); }).catch(scoFailed); }

/* ---------- defining: objectives ---------- */
function scoObjectiveModal(id){
  if(!canI.scoringManageOutcomes()||!SCO.data) return;
  var o=id?byId(SCO.data.objectives,id):null; if(id&&!o) return;
  var body=fieldHtml("sco_title","Objective",'<input id="sco_title" maxlength="200" value="'+attr(o?o.title:"")+'" placeholder="'+attr(tr("e.g. Launch HSB Pro 2.0 across every channel"))+'">')
    +'<div class="field-row">'+fieldHtml("sco_start","Period from",'<input type="date" id="sco_start" value="'+attr(o&&o.period.start||"")+'">')+fieldHtml("sco_end","Period until",'<input type="date" id="sco_end" value="'+attr(o&&o.period.end||"")+'">')+'</div>'
    +'<div class="field-row">'+fieldHtml("sco_owner","Owner",selectHtml("sco_owner",scoPeopleOpts(),o&&o.owner||""))+fieldHtml("sco_status","Status",selectHtml("sco_status",[["active",tr("Active")],["draft",tr("Draft")],["closed",tr("Closed")],["archived",tr("Archived — hidden")]],o?o.status:"active"))+'</div>'
    +fieldHtml("sco_desc","Description",'<textarea id="sco_desc" maxlength="2000">'+esc(o?o.description:"")+'</textarea>')
    +'<p class="hint">'+tr("Its progress is the weighted progress of its key results; add them once it is saved.")+'</p>';
  openModal(o?"Edit objective":"New objective",body,'<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" id="sco_save" onclick="scoObjectiveSave('+jsq(id||"")+')">'+tr("Save")+'</button>'); }
function scoObjectiveSave(id){
  if(SCO.saving||!require(["sco_title"])) return;
  var o=id?byId(SCO.data.objectives,id):null, b={title:val("sco_title"),description:val("sco_desc"),period:{start:val("sco_start")||null,end:val("sco_end")||null},owner:val("sco_owner")||null,status:val("sco_status")};
  if(o) b.rev=o.rev; SCO.saving=true;
  apiFetch(o?"PUT":"POST",o?"/api/outcomes/objectives/"+encodeURIComponent(id):"/api/outcomes/objectives",b).then(function(r){ SCO.saving=false; closeModal(); scoTook(r,"Saved"); }).catch(scoFailed); }
function scoDelete(what,id){
  if(!SCO.data) return;
  var x=what==="objective"?byId(SCO.data.objectives,id):byId(SCO.data.metrics,id); if(!x) return;
  var krs=what==="objective"?SCO.data.metrics.filter(function(m){ return m.objective===id; }).length:0;
  var text=what==="objective"?(krs?tr("The objective and its {n} key results are deleted, with what they counted. The history keeps a record. To keep them visible instead, set the status to Archived.").replace("{n}",krs):tr("The objective is deleted. The history keeps a record."))
    :tr("It is deleted with what it counted and the values entered. The history keeps a record. To keep it visible instead, set the status to Archived.");
  confirmModal(what==="objective"?"Delete this objective?":(x.kind==="kpi"?"Delete this KPI?":"Delete this key result?"),esc(text),function(){
    apiFetch("DELETE","/api/outcomes/"+(what==="objective"?"objectives/":"metrics/")+encodeURIComponent(id)+"?rev="+x.rev+(krs?"&cascade=1":"")).then(function(r){ scoTook(r,"Deleted"); }).catch(scoFailed); },true); }

/* ---------- a value entered by hand ---------- */
function scoValueModal(id){
  var m=SCO.data&&byId(SCO.data.metrics,id); if(!m||!canI.scoringManageOutcomes()) return;
  var last=m.manual?'<p class="hint">'+tr("Last value")+': <b>'+esc(scoNum(m.manual.value))+'</b> · '+esc(ago(minAgo(m.manual.at),m.manual.at))+(m.manual.reason?' · <span data-no-translate>'+esc(m.manual.reason)+'</span>':'')+'</p>':'';
  openModal("Enter a value",'<p class="hint"><b data-no-translate>'+esc(m.title)+'</b> · '+tr("Baseline")+' '+esc(scoNum(m.baseline))+' · '+tr("Target")+' '+esc(scoNum(m.target))+(m.unit?' <span data-no-translate>'+esc(m.unit)+'</span>':'')+'</p>'+last
    +fieldHtml("sco_value","Value now",scoNumIn("sco_value",null))
    +fieldHtml("sco_reason","Why — where the number comes from",'<textarea id="sco_reason" maxlength="1000" placeholder="'+attr(tr("e.g. October client survey, 48 answers"))+'"></textarea>',"A reason is required")
    +'<p class="hint">'+tr("The value is the metric's current reading. It is kept with your name and the reason, and every earlier value stays in its history.")+'</p>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" id="sco_save" onclick="scoValueSave('+jsq(id)+')">'+tr("Save")+'</button>'); }
function scoValueSave(id){
  if(SCO.saving||!require(["sco_value","sco_reason"])) return; SCO.saving=true;
  apiFetch("POST","/api/outcomes/metrics/"+encodeURIComponent(id)+"/value",{value:scoMaybeNum("sco_value"),reason:val("sco_reason")}).then(function(r){ SCO.saving=false; closeModal(); scoTook(r,"Value saved"); }).catch(scoFailed); }

/* ---------- details: what was counted, the links, the values, the history ---------- */
var SCO_ACTION={metric_created:"Created",metric_updated:"Changed",metric_deleted:"Deleted",manual_value:"Value entered",task_linked:"Task linked",link_confirmed:"Link confirmed",task_unlinked:"Link removed",
  evidence_counted:"Counted",evidence_updated:"Count changed",evidence_revoked:"Taken back",evidence_recounted:"Counted again"};
function scoDetails(id){
  var m=SCO.data&&byId(SCO.data.metrics,id); if(!m) return;
  openModal(m.kind==="kpi"?"KPI details":"Key result details",'<div class="scr-out-dtitle" data-no-translate>'+esc(m.title)+'</div><div id="scoDetail" data-metric="'+attr(id)+'"><div class="hint">'+tr("Loading…")+'</div></div>',null,true);
  apiFetch("GET","/api/outcomes/metrics/"+encodeURIComponent(id)).then(function(r){ var el=document.getElementById("scoDetail"); if(el&&el.getAttribute("data-metric")===id) el.innerHTML=scoDetailHtml(r); })
    .catch(function(e){ var el=document.getElementById("scoDetail"); if(el) el.innerHTML='<div class="hint">'+esc(e.message)+'</div>'; }); }
function scoDetailHtml(r){
  var m=r.metric, man=canI.scoringManageOutcomes()&&scoKindOn(m.kind), when=function(at){ return at?esc(ago(minAgo(at),at)):""; };
  var unit=m.rule.type==="approved_assets"?tr("assets"):tr("task");
  var counted=r.evidence.length?r.evidence.map(function(e){ return '<div class="pref scr-out-ev" data-state="'+attr(e.status)+'"><div class="pl"><b><span class="ep-id">'+esc(e.taskId)+'</span> <span data-no-translate>'+esc(e.title)+'</span></b><span>'
      +(e.status==="counted"?'+'+esc(scoNum(e.contribution))+' '+unit+' · '+tr("counted")+' '+when(e.countedAt):tr("taken back")+' '+when(e.revokedAt))+'</span></div></div>'; }).join(""):'<div class="hint">'+tr("Nothing has been counted yet.")+'</div>';
  var links=r.links.length?r.links.map(function(l){ return '<div class="pref scr-out-link"><div class="pl"><b><span class="ep-id">'+esc(l.taskId)+'</span> <span data-no-translate>'+esc(l.title)+'</span></b><span>'+(l.confirmed?tr("Confirmed"):tr("Waiting for confirmation"))+(l.by?' · '+tr("linked by")+' <span data-no-translate>'+esc(person(l.by).name)+'</span>':'')+' · '+when(l.at)+'</span></div>'
      +(man&&!l.confirmed?'<button class="btn sm primary" onclick="scoConfirm('+jsq(l.taskId)+','+jsq(l.id)+','+jsq(m.id)+')">'+tr("Confirm")+'</button>':'')+'</div>'; }).join(""):'<div class="hint">'+tr("No task is linked by hand.")+'</div>';
  var values=r.values.filter(function(v){ return v.source==="manual"; }).map(function(v){ return '<div class="pref"><div class="pl"><b>'+esc(scoNum(v.value))+'</b><span><span data-no-translate>'+esc(v.by?person(v.by).name:"")+'</span> · '+when(v.at)+(v.reason?' · <span data-no-translate>'+esc(v.reason)+'</span>':'')+'</span></div></div>'; }).join("");
  var hist=r.audit.map(function(a){ var what=tr(SCO_ACTION[a.action]||a.action), val=(a.action==="manual_value"||/^evidence_(counted|updated|revoked)$/.test(a.action))?' '+(a.from!=null?esc(scoNum(a.from))+' → ':'')+esc(a.to!=null?scoNum(a.to):"—"):'';
    if(a.action==="evidence_recounted"&&a.to) val=': '+esc([a.to.counted?a.to.counted+" "+tr("counted"):"",a.to.changed?a.to.changed+" "+tr("changed"):"",a.to.revoked?a.to.revoked+" "+tr("taken back"):""].filter(Boolean).join(", "));
    return '<div class="pref scr-out-hist"><div class="pl"><b>'+what+val+(a.taskId?' · <span class="ep-id">'+esc(a.taskId)+'</span>':'')+'</b><span><span data-no-translate>'+esc(a.by?person(a.by).name:"ZenCrevia")+'</span>'+(a.impersonatedBy?' <span class="badge">'+tr("acting as")+'</span>':'')+' · '+when(a.at)+(a.why&&SCO_WHY[a.why]?' · '+esc(tr(SCO_WHY[a.why])):'')+(a.reason?' · <span data-no-translate>'+esc(a.reason)+'</span>':'')+'</span></div></div>'; }).join("");
  return '<div class="scr-out-m">'+scoBarHtml(m.progress)+'<div class="scr-out-sub">'+esc(scoKind(m))+' · '+esc(scoRuleText(m))+' · '+esc(scoPeriod(m.period))+'</div>'+scoWhyHtml("d:"+m.id,m.progress)+'</div>'
    +(m.rule.type!=="manual"?'<div class="eyebrow">'+tr("Counted from tasks")+'</div>'+counted:'')
    +'<div class="eyebrow">'+tr("Tasks linked by hand")+'</div>'+links
    +(values?'<div class="eyebrow">'+tr("Values entered by hand")+'</div>'+values:'')
    +'<div class="eyebrow">'+tr("History")+'</div>'+(hist||'<div class="hint">'+tr("No changes yet.")+'</div>'); }
function scoConfirm(taskId,linkId,metricId){
  apiFetch("POST","/api/tasks/"+encodeURIComponent(taskId)+"/outcomes/"+encodeURIComponent(linkId)+"/confirm",{}).then(function(r){ SCO.tasks[taskId]=r; scoTaskPaint(taskId); toast(tr("Link confirmed"));
    return scoLoad(true).then(function(){ if(metricId&&document.getElementById("scoDetail")) scoDetails(metricId); }); }).catch(scoFailed); }

/* ---------- a task's panel: what the task counts towards ---------- */
function scoringOutcomesRowHtml(tk){
  if(!tk||!API.on||!scoringOn()||!(scoringModuleOn("kpi")||scoringModuleOn("okr"))||scoringStakeholder()) return "";
  if(SCO.owner!==ME){ SCO.data=null; SCO.html=null; SCO.tasks={}; SCO.taskHtml={}; SCO.owner=ME; SCO.shown=null; }
  /* the task open in the task panel: asked for once each time it is opened (closing the panel forgets SCO.shown) and
     again on a live change to it (task_changed, below), not on each redraw (until an answer came, at most every 5 s);
     a row drawn anywhere else is asked for as it first appears, then at most every 5 s */
  var id=tk.id;
  if(typeof S!=="undefined"&&S.drawerTask===id){ var first=SCO.shown!==id; SCO.shown=id; if(first||!SCO.tasks[id]) setTimeout(function(){ scoTaskLoad(id,first); },0); }
  else { var fresh=!document.querySelector('.scr-out-row[data-out-task="'+CSS.escape(id)+'"]'); setTimeout(function(){ scoTaskLoad(id,fresh); },0); }
  var h=scoTaskInner(id); SCO.taskHtml[id]=h;
  return '<div class="scr-out-row" data-out-task="'+attr(id)+'">'+h+'</div>'; }
function scoTaskInner(id){
  var d=SCO.tasks[id], head='<div class="scr-out-row-head">'+I.target+'<b>'+tr("KPIs and OKRs")+'</b>';
  if(!d) return head+'</div><div class="hint">'+tr("Loading…")+'</div>';
  var can=d.can||{}, pick=can.link&&d.available&&d.available.length;
  head+='<span class="spacer"></span>'+(pick?'<button type="button" class="btn sm scr-out-pick" onclick="scoLinkPick(this,'+jsq(id)+')">'+I.link+tr("Link")+'</button>':'')+'</div>';
  if(!d.items.length) return head+'<div class="hint">'+tr(pick?"Not linked to a KPI or key result, and not counted towards one yet.":"Not counted towards a KPI or key result yet.")+'</div>';
  return head+d.items.map(function(it){ var m=it.metric, obj=m.kind==="kr"?(d.objectives||[]).filter(function(o){ return o.id===m.objective; })[0]:null;
    var adds=it.counts?'+'+scoNum(it.evidence.contribution)+' '+tr(m.rule.type==="approved_assets"?"assets":"task"):tr(SCO_WHY[it.why]||"Not counted");
    var pct=m.progress&&m.progress.value!=null?' · '+scoPct(m.progress.value):'';
    var mayRemove=it.link&&(can.manage||(can.link&&!it.link.confirmed));
    return '<div class="scr-out-item'+(it.counts?' counts':'')+'" data-metric="'+attr(m.id)+'"><span class="badge">'+esc(scoKind(m))+'</span><div class="scr-out-item-main"><b data-no-translate>'+esc(m.title)+'</b>'
      +(obj?'<span class="scr-out-sub"><span data-no-translate>'+esc(obj.title)+'</span></span>':'')+'<span class="scr-out-sub scr-out-adds">'+esc(adds)+esc(pct)+(it.link&&!it.link.confirmed?'':it.link?' · '+tr("linked"):' · '+tr("by its rule"))+'</span></div>'
      +(can.manage&&it.link&&!it.link.confirmed?'<button type="button" class="btn sm primary" onclick="scoConfirm('+jsq(id)+','+jsq(it.link.id)+',null)">'+tr("Confirm")+'</button>':'')
      +(mayRemove?scoIconBtn(I.x,"Remove the link","scoUnlink("+jsq(id)+","+jsq(it.link.id)+")"):'')+'</div>'; }).join(""); }
/* draw a task's row again only where what it shows changed (a row drawn by the panel shows what was cached then) */
function scoTaskPaint(id){ var prev=SCO.taskHtml[id], h=scoTaskInner(id); SCO.taskHtml[id]=h;
  document.querySelectorAll('.scr-out-row[data-out-task="'+CSS.escape(id)+'"]').forEach(function(el){ var shown=el._scoH!==undefined?el._scoH:prev; if(shown!==h) el.innerHTML=h; el._scoH=h; }); }
function scoTaskLoad(id,force){
  if(!API.on||SCO.taskLoading[id]||(!force&&SCO.taskAt[id]&&Date.now()-SCO.taskAt[id]<5000)) return;
  SCO.taskLoading[id]=true;
  var again=function(){ if(SCO.again[id]){ delete SCO.again[id]; scoTaskLoad(id,true); } };
  apiFetch("GET","/api/tasks/"+encodeURIComponent(id)+"/outcomes").then(function(r){ SCO.taskLoading[id]=false; SCO.taskAt[id]=Date.now(); SCO.tasks[id]=r; scoTaskPaint(id); again(); })
    .catch(function(){ SCO.taskLoading[id]=false; SCO.taskAt[id]=Date.now(); again(); }); }
/* a live change to the task open in the task panel (task_changed, from anyone, a save of our own too) asks for its row
   again: at once while it is shown, else the next time it is drawn */
(function(){ var ES=typeof window!=="undefined"?window.EventSource:null, wait={}; if(typeof ES!=="function") return;
  function onEvent(e){ var ev; try{ ev=JSON.parse(e.data); }catch(x){ return; } if(!ev||ev.type!=="task_changed"||ev.deleted||!ev.id||!API.on) return; var id=String(ev.id);
    clearTimeout(wait[id]); wait[id]=setTimeout(function(){ delete wait[id];
      if(S.drawerTask===id&&document.querySelector('#drawer .scr-out-row[data-out-task="'+CSS.escape(id)+'"]')){ if(SCO.taskLoading[id]) SCO.again[id]=true; else scoTaskLoad(id,true); }
      else if(SCO.shown===id) SCO.shown=null; },300); }
  window.EventSource=function(u,o){ var es=new ES(u,o); es.addEventListener("message",onEvent); return es; };
  window.EventSource.prototype=ES.prototype; ["CONNECTING","OPEN","CLOSED"].forEach(function(k){ window.EventSource[k]=ES[k]; }); })();
(function(){ if(typeof closeDrawer!=="function") return; var base=closeDrawer; closeDrawer=function(){ SCO.shown=null; return base.apply(this,arguments); }; })();
function scoTaskRefreshAll(){ document.querySelectorAll(".scr-out-row[data-out-task]").forEach(function(el){ scoTaskLoad(el.getAttribute("data-out-task"),true); }); }
function scoLinkPick(btn,id){ var d=SCO.tasks[id]; if(!d) return;
  entityPicker({kind:"metric",anchor:btn,title:tr("Link to a KPI or key result"),placeholder:tr("Find a KPI or key result…"),
    search:function(q){ var ql=String(q||"").toLowerCase(); return (d.available||[]).filter(function(m){ return !ql||m.title.toLowerCase().indexOf(ql)>=0; }).slice(0,20); },
    onSelect:function(m){ scoLink(id,m.id); }}); }
function scoLink(id,metricId){
  apiFetch("POST","/api/tasks/"+encodeURIComponent(id)+"/outcomes",{metricId:metricId}).then(function(r){ SCO.tasks[id]=r; SCO.taskAt[id]=Date.now(); scoTaskPaint(id);
    var it=(r.items||[]).filter(function(x){ return x.metric.id===metricId; })[0]; toast(tr(it&&it.link&&!it.link.confirmed?"Linked — it counts once an outcomes manager confirms it":"Linked")); SCO.loadedAt=0; }).catch(scoFailed); }
function scoUnlink(id,linkId){
  apiFetch("DELETE","/api/tasks/"+encodeURIComponent(id)+"/outcomes/"+encodeURIComponent(linkId)).then(function(r){ SCO.tasks[id]=r; SCO.taskAt[id]=Date.now(); scoTaskPaint(id); toast(tr("Link removed")); SCO.loadedAt=0; }).catch(scoFailed); }
/* the shared entity picker learns a row for a KPI or key result */
function scoPickRow(m){ var obj=m.kind==="kr"&&SCO.data?scoObjective(m.objective):null;
  return '<span class="sq">'+I.target+'</span><div class="ep-main"><b data-no-translate>'+esc(m.title)+'</b><span>'+esc(scoKind(m))+(obj?' · <span data-no-translate>'+esc(obj.title)+'</span>':'')+' · '+esc(tr(SCO_RULE_LABEL[m.rule.type]||""))+(m.progress&&m.progress.value!=null?' · '+scoPct(m.progress.value):'')+'</span></div>'; }
(function(){ if(typeof epRow!=="function") return; var base=epRow; epRow=function(kind,item){ if(kind==="metric"&&item&&typeof item==="object") return scoPickRow(item); return base.apply(this,arguments); }; })();
/* whoever manages outcomes needs the tab their section is in (the settings there stay read-only for them) */
(function(){ if(typeof settingsTabAllowed!=="function") return; var base=settingsTabAllowed; settingsTabAllowed=function(id){ if(id==="scoring"&&API.on&&scoringFeature()&&canI.scoringManageOutcomes()) return true; return base.apply(this,arguments); }; })();

/* Indonesian, for the words this module adds (a word the page already translates keeps its translation) */
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "KPIs and OKRs":"KPI dan OKR","KPIs":"KPI","Key result":"Key result","Objectives and key results":"Objective dan key result","Objective":"Tujuan",
  "KPIs and OKRs are kept on the ZenCrevia server, which counts their evidence; this offline copy does not track them.":"KPI dan OKR disimpan di server ZenCrevia, yang menghitung buktinya; salinan offline ini tidak melacaknya.",
  "Counts":"Menghitung",
  "Goals whose progress comes from real work — never from points.":"Target yang progresnya berasal dari pekerjaan nyata — bukan dari poin.",
  "a KPI “Approved assets this month” with a target of 40: each asset a lead validates on a finished task adds 1, so 10 assets make 25%.":"KPI “Aset yang disetujui bulan ini” dengan target 40: setiap aset yang divalidasi lead pada task yang selesai menambah 1, jadi 10 aset berarti 25%.",
  "KPI and OKR are both off. Turn either on in Overview and save, then set them up here.":"KPI dan OKR sama-sama mati. Nyalakan salah satunya di Ringkasan lalu simpan, kemudian atur di sini.",
  "A KPI, objective or key result is saved as soon as it is added or changed — the Save bar is for the settings.":"KPI, objective, atau key result langsung tersimpan begitu ditambah atau diubah — bar Simpan hanya untuk pengaturan.",
  "KPIs and OKRs could not be loaded.":"KPI dan OKR tidak dapat dimuat.","Try again":"Coba lagi",
  "KPI details":"Detail KPI","Key result details":"Detail key result",
  "Switched off — shown as they were":"Dimatikan — ditampilkan seperti terakhir","New KPI":"KPI baru","No KPIs yet.":"Belum ada KPI.","New objective":"Objective baru","No objectives yet.":"Belum ada objective.",
  "Show archived":"Tampilkan yang diarsipkan","Hide archived":"Sembunyikan yang diarsipkan",
  "manual":"manual","from evidence":"dari bukti","weight":"bobot","Enter a value":"Masukkan nilai","Details":"Detail","Edit":"Edit","Delete":"Hapus",
  "Draft":"Draft","Active":"Aktif","Closed":"Selesai","Archived":"Diarsipkan",
  "Approved assets":"Aset yang disetujui","Completed tasks":"Task yang selesai","Entered by hand":"Diisi manual","linked tasks only":"hanya task yang ditautkan","every task":"setiap task",
  "Any time":"Kapan saja","From":"Dari","Until":"Sampai","Entered by":"Diisi oleh",
  "1 task link waits for you to confirm it":"1 tautan task menunggu konfirmasi Anda","{n} task links wait for you to confirm them":"{n} tautan task menunggu konfirmasi Anda",
  "1 key result":"1 key result","{n} key results":"{n} key result","How this is worked out":"Cara menghitungnya","No progress yet":"Belum ada progres",
  "Nobody in particular":"Tidak ada orang tertentu","Name":"Nama","e.g. Approved assets this month":"mis. Aset yang disetujui bulan ini","e.g. 40 approved launch assets":"mis. 40 aset peluncuran yang disetujui",
  "Weight in the objective":"Bobot dalam objective","A key result weighing 0 does not count towards its objective.":"Key result berbobot 0 tidak dihitung dalam objective-nya.",
  "Progress comes from":"Progres berasal dari","Assets a lead validated, on tasks finished successfully":"Aset yang divalidasi lead, pada task yang selesai dengan berhasil",
  "Tasks finished successfully (1 each; Declined does not count)":"Task yang selesai dengan berhasil (masing-masing 1; Declined tidak dihitung)",
  "A value entered by hand, with a reason":"Nilai yang diisi manual, beserta alasan","Which tasks":"Task mana",
  "Every task that matches the filter below (no filter: every task)":"Setiap task yang cocok dengan filter di bawah (tanpa filter: setiap task)",
  "Only tasks linked to it, once an outcomes manager confirms the link":"Hanya task yang ditautkan, setelah pengelola outcome mengonfirmasi tautannya",
  "Team":"Tim","Project":"Project","Label":"Label","Any team":"Tim mana pun","Any project":"Project mana pun","Any label":"Label mana pun",
  "A task linked by hand counts too, once an outcomes manager confirms the link. A task counts in the period by the day it was finished; reopened, it no longer counts.":"Task yang ditautkan manual juga dihitung, setelah pengelola outcome mengonfirmasi tautannya. Task dihitung dalam periode menurut hari selesainya; bila dibuka kembali, task tidak dihitung lagi.",
  "Direction":"Arah","Up — more is better":"Naik — makin banyak makin baik","Down — less is better":"Turun — makin sedikit makin baik","Unit":"Satuan","e.g. assets":"mis. aset",
  "Baseline":"Nilai awal","Target":"Target","Required for progress":"Wajib agar ada progres",
  "Counted evidence moves the actual from the baseline towards the target: up adds it, down takes it away (a backlog burnt down by completions).":"Bukti yang terhitung menggeser nilai aktual dari nilai awal ke arah target: naik menambahkannya, turun menguranginya (backlog yang berkurang karena task selesai).",
  "Period from":"Periode dari","Period until":"Periode sampai","Owner":"Pemilik","Status":"Status",
  "Active — counting":"Aktif — menghitung","Draft — not counting yet":"Draft — belum menghitung","Closed — kept as it is":"Ditutup — disimpan apa adanya","Archived — hidden":"Diarsipkan — disembunyikan",
  "Description":"Deskripsi","Edit KPI":"Ubah KPI","Edit key result":"Ubah key result","New key result":"Key result baru","Saved":"Tersimpan","Something went wrong":"Terjadi kesalahan",
  "e.g. Launch HSB Pro 2.0 across every channel":"mis. Luncurkan HSB Pro 2.0 di semua kanal","Its progress is the weighted progress of its key results; add them once it is saved.":"Progresnya adalah progres berbobot dari key result-nya; tambahkan setelah disimpan.",
  "Edit objective":"Ubah objective",
  "The objective and its {n} key results are deleted, with what they counted. The history keeps a record. To keep them visible instead, set the status to Archived.":"Objective dan {n} key result-nya dihapus, beserta yang sudah dihitung. Riwayat tetap menyimpan catatannya. Agar tetap terlihat, ubah statusnya menjadi Diarsipkan.",
  "The objective is deleted. The history keeps a record.":"Objective dihapus. Riwayat tetap menyimpan catatannya.",
  "It is deleted with what it counted and the values entered. The history keeps a record. To keep it visible instead, set the status to Archived.":"Dihapus beserta yang sudah dihitung dan nilai yang diisi. Riwayat tetap menyimpan catatannya. Agar tetap terlihat, ubah statusnya menjadi Diarsipkan.",
  "Delete this objective?":"Hapus objective ini?","Delete this KPI?":"Hapus KPI ini?","Delete this key result?":"Hapus key result ini?","Deleted":"Dihapus",
  "Last value":"Nilai terakhir","Value now":"Nilai sekarang","Why — where the number comes from":"Alasan — dari mana angka ini","e.g. October client survey, 48 answers":"mis. Survei klien Oktober, 48 jawaban","A reason is required":"Alasan wajib diisi",
  "The value is the metric's current reading. It is kept with your name and the reason, and every earlier value stays in its history.":"Nilai ini adalah angka metrik saat ini. Disimpan beserta nama Anda dan alasannya, dan setiap nilai sebelumnya tetap ada di riwayatnya.",
  "Value saved":"Nilai tersimpan",
  "Created":"Dibuat","Changed":"Diubah","Value entered":"Nilai diisi","Task linked":"Task ditautkan","Link confirmed":"Tautan dikonfirmasi","Link removed":"Tautan dihapus",
  "Counted":"Dihitung","Count changed":"Hitungan berubah","Taken back":"Ditarik kembali","Counted again":"Dihitung ulang",
  "assets":"aset","task":"task","counted":"dihitung","taken back":"ditarik kembali","changed":"berubah","Nothing has been counted yet.":"Belum ada yang dihitung.",
  "Confirmed":"Dikonfirmasi","Waiting for confirmation":"Menunggu konfirmasi","linked by":"ditautkan oleh","Confirm":"Konfirmasi","No task is linked by hand.":"Tidak ada task yang ditautkan manual.",
  "Counted from tasks":"Dihitung dari task","Tasks linked by hand":"Task yang ditautkan manual","Values entered by hand":"Nilai yang diisi manual","History":"Riwayat","No changes yet.":"Belum ada perubahan.","acting as":"bertindak sebagai",
  "Link":"Tautan","Not linked to a KPI or key result, and not counted towards one yet.":"Belum ditautkan ke KPI atau key result, dan belum dihitung untuk salah satunya.",
  "Not counted towards a KPI or key result yet.":"Belum dihitung untuk KPI atau key result mana pun.","Not counted":"Tidak dihitung","linked":"ditautkan","by its rule":"menurut aturannya","Remove the link":"Hapus tautan",
  "Link to a KPI or key result":"Tautkan ke KPI atau key result","Find a KPI or key result…":"Cari KPI atau key result…",
  "Linked — it counts once an outcomes manager confirms it":"Ditautkan — dihitung setelah pengelola outcome mengonfirmasinya","Linked":"Ditautkan",
  "Waiting for an outcomes manager to confirm the link":"Menunggu pengelola outcome mengonfirmasi tautan","Switched off: nothing is counted for now":"Dimatikan: untuk sementara tidak ada yang dihitung",
  "Not active: nothing is counted for now":"Tidak aktif: untuk sementara tidak ada yang dihitung","Counts once the task is finished":"Dihitung setelah task selesai",
  "Counts once a lead validates its asset counts":"Dihitung setelah lead memvalidasi jumlah asetnya","No validated assets":"Tidak ada aset yang divalidasi","Finished outside the period":"Selesai di luar periode",
  "Outside what it counts":"Di luar yang dihitungnya","Counts linked tasks only":"Hanya menghitung task yang ditautkan","Its value is entered by hand":"Nilainya diisi manual",
  /* how the server and the engine explain a number (fill(tr(key), vars)) */
  "{total} counted from the evidence of 1 task.":"{total} terhitung dari bukti 1 task.","{total} counted from the evidence of {n} tasks.":"{total} terhitung dari bukti {n} task.",
  "Actual = the baseline {baseline} + {total} counted = {actual}.":"Aktual = nilai awal {baseline} + {total} terhitung = {actual}.",
  "Actual = the baseline {baseline} − {total} counted = {actual}.":"Aktual = nilai awal {baseline} − {total} terhitung = {actual}.",
  "Actual = the value entered by hand: {actual}.":"Aktual = nilai yang diisi manual: {actual}.","No progress yet: no value has been entered.":"Belum ada progres: belum ada nilai yang diisi.",
  "No progress yet: this objective has no key results.":"Belum ada progres: objective ini belum punya key result.",
  "1 key result weighs 0 and is not counted.":"1 key result berbobot 0 dan tidak dihitung.","{n} key results weigh 0 and are not counted.":"{n} key result berbobot 0 dan tidak dihitung.",
  "No progress: {fields} missing.":"Belum ada progres: {fields} tidak ada.",
  "No progress: the target equals the baseline ({baseline}), so there is nothing to measure against.":"Belum ada progres: target sama dengan baseline ({baseline}), jadi tidak ada pembanding.",
  "No progress: an increasing metric needs a target above its baseline ({baseline}).":"Belum ada progres: metrik yang naik butuh target di atas baseline ({baseline}).",
  "No progress: a decreasing metric needs a target below its baseline ({baseline}).":"Belum ada progres: metrik yang turun butuh target di bawah baseline ({baseline}).",
  "Increasing: ({actual} − {baseline}) ÷ ({target} − {baseline}) = {pct}%.":"Naik: ({actual} − {baseline}) ÷ ({target} − {baseline}) = {pct}%.",
  "Decreasing: ({baseline} − {actual}) ÷ ({baseline} − {target}) = {pct}%.":"Turun: ({baseline} − {actual}) ÷ ({baseline} − {target}) = {pct}%.",
  "Past the target: counted as 100%.":"Melewati target: dihitung 100%.","Behind the baseline: counted as 0%.":"Di bawah baseline: dihitung 0%.",
  "No progress yet: no key result has a measured value.":"Belum ada progres: belum ada key result yang punya nilai terukur.",
  "{n} of {total} key results have no measured progress yet and are left out.":"{n} dari {total} key result belum punya progres terukur dan tidak diikutkan.",
  "No progress: the key results with a value all weigh 0.":"Belum ada progres: key result yang punya nilai semuanya berbobot 0.",
  "Weighted progress of {n} key results: {pct}%.":"Progres berbobot dari {n} key result: {pct}%.",
  /* what the server answers when something cannot be done */
  "Smart Scoring is switched off for this workspace. Turn it on in Settings → Smart Scoring first.":"Smart Scoring dimatikan untuk workspace ini. Nyalakan dulu di Pengaturan → Smart Scoring.",
  "KPIs are switched off. Turn KPI on in Settings → Smart Scoring to change them; what is there stays readable.":"KPI dimatikan. Nyalakan KPI di Pengaturan → Smart Scoring untuk mengubahnya; yang sudah ada tetap bisa dibaca.",
  "OKRs are switched off. Turn OKR on in Settings → Smart Scoring to change them; what is there stays readable.":"OKR dimatikan. Nyalakan OKR di Pengaturan → Smart Scoring untuk mengubahnya; yang sudah ada tetap bisa dibaca.",
  "Say why this value is entered (a reason is required)":"Jelaskan alasan nilai ini diisi (alasan wajib)","The period ends before it starts":"Periode berakhir sebelum dimulai",
  "A key result belongs to an objective: choose one":"Key result harus berada di bawah objective: pilih salah satu","This task is already linked to it":"Task ini sudah ditautkan ke sana",
  "This KPI counts its progress from evidence. A value is entered by hand only on one whose progress is entered by hand.":"KPI ini menghitung progresnya dari bukti. Nilai hanya diisi manual pada yang progresnya diisi manual.",
  "This key result counts its progress from evidence. A value is entered by hand only on one whose progress is entered by hand.":"Key result ini menghitung progresnya dari bukti. Nilai hanya diisi manual pada yang progresnya diisi manual.",
  "Only an active KPI can be linked":"Hanya KPI yang aktif yang bisa ditautkan","Only an active key result can be linked":"Hanya key result yang aktif yang bisa ditautkan",
  "That KPI or key result does not exist":"KPI atau key result itu tidak ada","Enter the value":"Isi nilainya","A title is required":"Judul wajib diisi",
  "Choose where the progress comes from: approved assets, completed tasks or a value entered by hand":"Pilih asal progres: aset yang disetujui, task yang selesai, atau nilai yang diisi manual",
  "Someone else changed this KPI in the meantime. Reload it and make your change again.":"Orang lain sudah mengubah KPI ini. Muat ulang lalu ulangi perubahan Anda.",
  "Someone else changed this key result in the meantime. Reload it and make your change again.":"Orang lain sudah mengubah key result ini. Muat ulang lalu ulangi perubahan Anda.",
  "Someone else changed this objective in the meantime. Reload it and make your change again.":"Orang lain sudah mengubah objective ini. Muat ulang lalu ulangi perubahan Anda."
});
</script>
<style>
.scr-out-block{margin-top:14px}
.scr-out-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.scr-out-head .btn svg,.scr-out-acts .btn svg,.scr-out-pick svg{width:15px;height:15px}
.scr-out-m,.scr-out-obj{border:1px solid var(--color-border);border-radius:var(--radius);padding:10px 12px;margin-top:8px;background:var(--color-surface);min-width:0}
.scr-out-obj>.scr-out-krs{margin-left:12px}
.scr-out-krs .scr-out-m{background:var(--color-surface-sunken)}
.scr-out-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.scr-out-title{font-weight:650;min-width:0;overflow-wrap:anywhere}
.scr-out-acts{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.scr-out-ib{width:30px;height:30px}
.scr-out-ib svg{width:15px;height:15px}
.scr-out-bar{display:flex;align-items:center;gap:8px;margin-top:8px}
.scr-out-bar .pbar{flex:1;min-width:60px}
.scr-out-pct{font-size:var(--fs-sm);font-weight:650;font-variant-numeric:tabular-nums;min-width:44px;text-align:right}
.scr-out-none{margin-top:8px;font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-out-sub{display:block;margin-top:4px;font-size:var(--fs-sm);color:var(--color-text-secondary);overflow-wrap:anywhere;min-width:0}
.scr-out-why{margin-top:6px}
.scr-out-why summary{cursor:pointer;font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-out-why ul{margin:4px 0 0 18px;padding:0;font-size:var(--fs-sm);line-height:1.5}
.scr-out-foot{margin-top:10px}
.scr-out-fh{margin:-4px 0 10px}
#sco_counted:not([hidden]){display:grid;gap:10px}
#sco_counted .field{margin:0}
.scr-out-filter{grid-template-columns:repeat(3,minmax(0,1fr))}
.scr-out-ev[data-state="revoked"] b{text-decoration:line-through;opacity:.7}
.scr-out-dtitle{font-weight:650;margin-bottom:4px;overflow-wrap:anywhere}
#scoDetail .eyebrow{margin-top:16px}
#scoDetail>.scr-out-m{margin-top:4px}
.scr-out-row{border:1px solid var(--color-border);border-radius:var(--radius);padding:8px 10px;background:var(--color-surface);min-width:0}
.scr-out-row-head{display:flex;align-items:center;gap:6px;min-height:28px}
.scr-out-row-head>svg{width:16px;height:16px;flex:none;stroke:currentColor;fill:none;stroke-width:2}
.scr-out-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--color-border);min-width:0}
.scr-out-item:first-of-type{border-top:0}
.scr-out-item-main{flex:1;min-width:0;display:flex;flex-direction:column}
.scr-out-item-main b{overflow-wrap:anywhere}
.scr-out-item.counts .scr-out-adds{color:var(--color-success)}
@media(max-width:640px){
  .scr-out-obj>.scr-out-krs{margin-left:4px}
  .scr-out-filter{grid-template-columns:1fr}
  .scr-out-m,.scr-out-obj{padding:9px 10px}
}
</style>
