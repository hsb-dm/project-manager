<script>
/* ============================================================
   SMART SCORING IN ANALYTICS (Oct 2026)
   What the scores add up to over a period (docs/SMART-SCORING.md §5.3; the figures come from GET
   /api/scoring/analytics, server/scoring-analytics.js): tasks completed; the locked estimate against the time
   logged, with the estimates from before Smart Scoring, never locked or whose scope changed counted apart and said
   so; how far estimates were off (the typical miss, the share within ±20 %); velocity in the workspace's primary
   capacity metric; where the scores came from and how often they were changed by hand; first-pass approval and
   review rounds; approved base points and the efficiency bonus, always apart, with what still waits for review;
   output points for assets produced; KPI and OKR progress. Each figure says in one line what it counts (hover, or
   tap to open). Time and points are never added into one score, and people are listed in name order — operational
   figures, not pay and not a ranking.
   - The Analytics screen gets a "Smart Scoring" section (renderAnalytics wrapped) while Smart Scoring is on and
     the viewer is not a stakeholder: the team's figures for whoever holds scoring_view_analytics — with project,
     team, person and estimate filters over the screen's own timeline —, anyone else's own.
   - A member's page gets their own figures (renderMember wrapped), for themselves and for those who see the team.
   Nothing blinks: each answer is kept per query (SCAN) and drawn from there at once, then fetched again in the
   background (at most every 5 s) and painted only when the markup changed. The offline demo has no server and says
   so. Bilingual through tr() and this file's Indonesian entries.
   ============================================================ */
var SCAN={cache:{},at:{},loading:{},err:{},html:{},q:{},open:{},owner:null,history:false,f:{team:"",project:"",person:"",status:""}};
var SCAN_UNIT={h:"hours",story_points:"story points",weighted_points:"weighted points"};
var SCAN_MODULE={hours:"Effort Hours",story:"Story Points",weighted:"Weighted Points"};
function scanReady(){ return typeof scoringOn==="function"&&scoringOn()&&!scoringStakeholder(); }
function scanWeeks(){ return Math.max(1,Math.min(52,+S.range||8)); }
function scanFill(key,vars){ var s=tr(key); return typeof ScoringEngine!=="undefined"?ScoringEngine.fill(s,vars||{}):s; }
function scanN(v,dec){ if(v===null||v===undefined||!isFinite(+v)) return "—"; dec=dec||0; try{ return (+v).toLocaleString(UI_LANG==="id"?"id-ID":"en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec}); }catch(e){ return (+v).toFixed(dec); } }
/* hours to the half hour, as the estimate shows them; points with 2 decimals; a share as a whole percentage or "no data" */
function scanH(v){ if(v===null||v===undefined) return "—"; var h=Math.round(+v*2)/2; return scanFill("{n} h",{n:scanN(h,h%1?1:0)}); }
function scanP(v){ return scanFill("{n} pts",{n:scanN(v,2)}); }
function scanPct(v){ return v===null||v===undefined?tr("no data"):Math.round(Math.max(0,Math.min(1,+v))*100)+"%"; }
function scanVal(v,unit){ return unit==="h"?scanH(v):scanN(v,2); }
function scanWeek(w){ var p=String(w).split("-"); return uiMo(+p[1]-1)+" "+(+p[2]); }
function scanName(id,fallback){ return PEOPLE[id]?person(id).name:(fallback||id); }

/* ---------- the answers: kept per query, fetched in the background ---------- */
function scanQuery(personId){ var all=canI.scoringViewAnalytics(), q={weeks:String(scanWeeks())};
  if(personId){ q.person=personId; return q; }
  ["team","project","person","status"].forEach(function(k){ if(SCAN.f[k]&&(k!=="person"||all)) q[k]=SCAN.f[k]; });
  if(SCAN.history&&all) q.history="1"; return q; }
function scanKey(q){ return ["weeks","team","project","person","status","history"].map(function(k){ return q[k]||""; }).join("|"); }
function scanOwner(){ if(SCAN.owner!==ME){ SCAN.cache={}; SCAN.at={}; SCAN.err={}; SCAN.html={}; SCAN.owner=ME; } }
function scanLoad(q,force){ if(!API.on) return; var key=scanKey(q); SCAN.q[key]=q;
  if(SCAN.loading[key]||(!force&&SCAN.at[key]&&Date.now()-SCAN.at[key]<5000)) return; SCAN.loading[key]=true;
  apiFetch("GET","/api/scoring/analytics?"+Object.keys(q).map(function(k){ return k+"="+encodeURIComponent(q[k]); }).join("&")).then(function(r){ SCAN.loading[key]=false; SCAN.at[key]=Date.now(); SCAN.err[key]=null; SCAN.cache[key]=r; scanPaint(); },
    function(e){ SCAN.loading[key]=false; SCAN.at[key]=Date.now(); SCAN.err[key]=(e&&e.message)||tr("Something went wrong"); scanPaint(); }); }
function scanRetry(key){ if(SCAN.q[key]) scanLoad(SCAN.q[key],true); }
/* every place on the screen that shows an answer, painted again only when its markup changed */
function scanPaint(){ var els=document.querySelectorAll("[data-scan]"); for(var i=0;i<els.length;i++){ var el=els[i], key=el.getAttribute("data-scan"), kind=el.getAttribute("data-scan-kind"), h=scanBody(key,kind);
  if(el.innerHTML&&SCAN.html[key+"/"+kind]===h) continue; SCAN.html[key+"/"+kind]=h; el.innerHTML=h; } }
function scanBody(key,kind){
  if(!API.on) return '<div class="hint">'+tr("Smart Scoring's analytics come from the server: the offline demo has none.")+'</div>';
  var r=SCAN.cache[key];
  if(!r) return SCAN.err[key]?'<div class="hint">'+esc(SCAN.err[key])+' <button class="btn sm" onclick="scanRetry('+jsq(key)+')">'+tr("Try again")+'</button></div>':'<div class="hint scr-an-loading">'+tr("Loading…")+'</div>';
  return kind==="member"?scanFigsHtml(r):scanPageHtml(r);
}

/* ---------- small pieces ---------- */
/* a figure: the number and what it is; its one-line explanation on hover, or opened with a tap */
function scanFig(id,value,label,why,sub,off){ return '<details class="scr-an-fig'+(off?' off':'')+'" data-fig="'+attr(id)+'"'+(SCAN.open[id]?' open':'')+' ontoggle="SCAN.open['+jsq(id)+']=this.open"><summary title="'+attr(why)+'"><b class="scr-an-v">'+value+'</b><span class="scr-an-k">'+esc(label)+'</span>'+(sub?'<span class="scr-an-s">'+sub+'</span>':'')+'</summary><p class="scr-an-why">'+esc(why)+'</p></details>'; }
function scanOff(x){ return x&&x.off?' <span class="badge warn scr-an-offb">'+tr("Switched off — history")+'</span>':''; }
/* columns by week, each series its own bar; a week with nothing says "no data" (not 0 %) */
function scanCols(weeks,series,fmt){
  var max=0; series.forEach(function(s){ s.v.forEach(function(x){ if(x!=null&&+x>max) max=+x; }); });
  if(!(max>0)) return '<div class="hint scr-an-nodata">'+tr("No data in this period.")+'</div>';
  var cols=weeks.map(function(w,i){ var has=series.some(function(s){ return s.v[i]!=null; });
    var tip=scanWeek(w)+": "+(has?series.map(function(s){ return s.label+" "+(s.v[i]==null?tr("no data"):fmt(s.v[i])); }).join(" · "):tr("no data"));
    return '<span class="scr-an-col'+(has?'':' nd')+'" title="'+attr(tip)+'">'+series.map(function(s){ var x=+s.v[i]||0; return '<i class="'+s.cls+'" style="height:'+(x>0?Math.max(3,Math.round(x/max*100)):0)+'%"></i>'; }).join("")+'</span>'; }).join("");
  return '<div class="scr-an-chart"><div class="scr-an-cols" role="img" aria-label="'+attr(series.map(function(s){ return s.label; }).join(", "))+'">'+cols+'</div>'
    + '<div class="scr-an-axis"><span>'+scanWeek(weeks[0])+'</span>'+(weeks.length>1?'<span>'+scanWeek(weeks[weeks.length-1])+'</span>':'')+'</div>'
    + '<div class="scr-an-legend">'+series.map(function(s){ return '<span><i class="'+s.cls+'"></i>'+esc(s.label)+'</span>'; }).join("")+'</div></div>'; }
function scanLine(text){ return '<div class="hint scr-an-line">'+text+'</div>'; }

/* ---------- the figures (the screen's and a member's page) ---------- */
function scanFigsHtml(r){
  var f=[], e=r.estimates, v=r.velocity, rv=r.review, pt=r.points, as=r.assets, who=r.filters&&r.filters.person;
  f.push(scanFig("thr",scanN(r.throughput.tasks),tr("Tasks completed"),tr(!who?"Tasks finished in the period, in a completed stage. Declined and open work are not counted.":who===ME?"Tasks you are assigned to, finished in the period in a completed stage. Declined and open work are not counted.":"Tasks this person is assigned to, finished in the period in a completed stage. Declined and open work are not counted.")));
  if(e){ var ve=e.verified, a=ve.accuracy;
    f.push(scanFig("est",ve.tasks?scanH(ve.estimateHours)+' → '+scanH(ve.actualHours):tr("no data"),tr("Locked estimate → time logged"),tr("Tasks whose estimate was locked (approved, or frozen when work started) and whose time was logged in the time log: their estimates added up, then the time logged."),ve.tasks?scanFill(ve.tasks===1?"{n} task":"{n} tasks",{n:ve.tasks}):e.unverified.tasks?scanFill("{n} unverified, counted apart",{n:e.unverified.tasks}):'',e.off));
    f.push(scanFig("miss",a.medianError==null?tr("no data"):Math.round(a.medianError*100)+"%",tr("Typical estimate miss"),tr("The median of |actual − estimate| ÷ estimate over those tasks. Lower is better; only tasks with both numbers count."),'',e.off));
    f.push(scanFig("within",scanPct(a.withinShare),tr("Within ±20%"),tr("The share of those tasks whose time logged was within 20% of the estimate."),a.tasks?scanFill("{over} took longer · {under} took less",{over:a.over,under:a.under}):'',e.off)); }
  if(v) f.push(scanFig("vel",scanVal(v.total,v.unit),scanFill("Velocity in {unit}",{unit:tr(SCAN_UNIT[v.unit]||v.unit)}),tr(v.shared?"The final values of the tasks completed, in the workspace's primary capacity metric. A task shared by several people counts its share for each.":"The final values of the tasks completed, in the workspace's primary capacity metric."),v.unscored?scanFill("{n} without a value",{n:v.unscored}):'',v.off));
  f.push(scanFig("fp",scanPct(rv.firstPassShare),tr("First-pass approval"),tr("Of the tasks reviewed, the share approved without any revision request."),rv.reviewed?scanFill("{n} reviewed",{n:rv.reviewed}):''));
  f.push(scanFig("rounds",rv.rounds==null?tr("no data"):scanN(rv.rounds,1),tr("Review rounds"),tr("Reviews until approval, on average: 1 is approved the first time. Beside it, the median time from the first version to the approval."),rv.medianCycleHours==null?'':scanFill("median {h} to approval",{h:scanH(rv.medianCycleHours)})));
  if(pt){ f.push(scanFig("base",scanP(pt.approved.base),tr("Base points approved"),tr("The base points of approved efficiency awards. Never the bonus, never hours."),scanFill(pt.approved.awards===1?"{n} award":"{n} awards",{n:pt.approved.awards}),pt.off));
    f.push(scanFig("bonus",'+'+scanP(pt.approved.bonus),tr("Efficiency bonus approved"),tr("Bonus points of approved awards, for work finished under a locked estimate. Kept apart from the base."),'',pt.off));
    f.push(scanFig("wait",scanP(pt.pending.base+pt.pending.bonus),tr("Waiting for review"),tr("Base and bonus points of awards not approved yet: not counted above."),scanFill(pt.pending.awards===1?"{n} award":"{n} awards",{n:pt.pending.awards}),pt.off)); }
  if(as) f.push(scanFig("assets",scanP(as.points),tr("Asset points"),tr("Output points for assets produced, by the kind of work (Settings → Smart Scoring), counted when the task is completed. Never hours, base points or bonus."),scanFill("{n} assets",{n:scanN(as.assetsExact,as.assetsExact%1?2:0)}),as.off));
  return '<div class="scr-an-figs">'+f.join("")+'</div>';
}

/* ---------- the Analytics screen's section ---------- */
function scanPageHtml(r){
  var h=scanFigsHtml(r), e=r.estimates, W=r.weeks, panels=[];
  if(r.scope==="own") h+=scanLine(tr("Your own figures: the tasks you are assigned to. Whoever holds the team's scoring analytics sees everyone's."));
  if(e){ var ve=e.verified, un=e.unverified, why=un.why||{}, bits=[];
    [["estimate_from_before","{n} estimate from before Smart Scoring","{n} estimates from before Smart Scoring"],["estimate_not_locked","{n} estimate never locked","{n} estimates never locked"],["scope_changed","{n} with the scope changed since the lock"],["time_from_before","{n} with time from before the time log"],["actual_typed","{n} with an Actual typed, not logged"]].forEach(function(x){ var n=why[x[0]]; if(n) bits.push(scanFill(n===1||!x[2]?x[1]:x[2],{n:n})); });
    var b=scanCols(W,[{label:tr("Locked estimate"),cls:"s1",v:ve.byWeek.map(function(x){ return x?x.estimateHours:null; })},{label:tr("Time logged"),cls:"s2",v:ve.byWeek.map(function(x){ return x?x.actualHours:null; })}],scanH)
      + (un.tasks?scanLine('<b>'+tr("Unverified, counted apart")+':</b> '+scanFill(un.tasks===1?"{n} task":"{n} tasks",{n:un.tasks})+' · '+scanH(un.estimateHours)+' → '+scanH(un.actualHours)+' · '+tr("typical miss")+' '+(un.accuracy.medianError==null?tr("no data"):Math.round(un.accuracy.medianError*100)+"%")+(bits.length?' — '+esc(bits.join(", ")):'')):'')
      + scanLine(scanFill("Not estimated: {a} · Estimated, no time logged: {b} · Blocked (waiting) time: {c}, never in Actual",{a:e.notEstimated,b:e.noTimeLogged,c:scanH(e.blockedHours)}));
    panels.push(panel(tr("Estimate against time logged")+scanOff(e),null,'<div class="panel-body pad">'+b+'</div>',null,null,I.calendar)); }
  var tv=scanCols(W,[{label:tr("Tasks completed"),cls:"s1",v:r.throughput.byWeek}],function(x){ return scanN(x); });
  if(r.velocity){ var v=r.velocity; tv+='<div class="scr-an-sub">'+esc(scanFill("Velocity in {unit}",{unit:tr(SCAN_UNIT[v.unit]||v.unit)}))+scanOff(v)+'</div>'+scanCols(W,[{label:tr(SCAN_UNIT[v.unit]||v.unit),cls:"s3",v:v.byWeek.map(function(x){ return x?x.value:null; })}],function(x){ return scanVal(x,v.unit); }); }
  panels.push(panel(tr("Throughput and velocity"),null,'<div class="panel-body pad">'+tv+'</div>',null,null,I.analytics));
  if(r.sources) panels.push(panel(tr("Where the scores came from"),null,'<div class="panel-body pad">'+Object.keys(r.sources).map(function(m){ return scanSourceHtml(m,r.sources[m]); }).join("")+'</div>',null,null,I.gauge));
  if(r.points) panels.push(panel(tr("Base points and efficiency bonus")+scanOff(r.points),null,'<div class="panel-body pad">'+scanPointsHtml(r)+'</div>',null,null,I.check));
  if(r.assets) panels.push(panel(tr("Asset points")+scanOff(r.assets),null,'<div class="panel-body pad">'+scanCols(W,[{label:tr("Asset points"),cls:"s4",v:r.assets.byWeek.map(function(x){ return x?x.points:null; })}],scanP)
    + scanLine(scanFill("{p} for {a} assets on {t} tasks completed; {v} of it validated by a lead.",{p:scanP(r.assets.points),a:scanN(r.assets.assetsExact,r.assets.assetsExact%1?2:0),t:r.assets.tasks,v:scanP(r.assets.validatedPoints)})+(r.assets.attributed?' '+tr("* shared among the people assigned until each person's count is typed."):''))+'</div>',null,null,I.assets));
  if(r.outcomes) panels.push(panel(tr("KPIs and OKRs"),null,'<div class="panel-body pad">'+scanOutcomesHtml(r.outcomes)+'</div>',null,null,I.gauge));
  if(r.people) panels.push(panel(tr("People"),r.people.length,'<div class="panel-body pad">'+scanPeopleHtml(r)+'</div>',null,null,I.team));
  return h+'<div class="scr-an-panels">'+panels.join("")+'</div>';
}
function scanSourceHtml(m,c){
  var parts=[["math","Math","s1"],["ai","AI","s2"],["manual","Typed by hand","s3"],["legacy","From before Smart Scoring","s4"],["notScored","Not scored","s0"]], n=c.tasks||0;
  var bar=n?'<div class="scr-an-stack" role="img" aria-label="'+attr(tr(SCAN_MODULE[m]||m))+'">'+parts.map(function(p){ return c[p[0]]?'<i class="'+p[2]+'" style="width:'+(c[p[0]]/n*100)+'%" title="'+attr(tr(p[1])+": "+c[p[0]])+'"></i>':''; }).join("")+'</div>':'';
  return '<div class="scr-an-src" data-module="'+attr(m)+'"><div class="scr-an-sub">'+esc(tr(SCAN_MODULE[m]||m))+scanOff(c)+'</div>'+(n?bar:'<div class="hint scr-an-nodata">'+tr("No data in this period.")+'</div>')
    + '<div class="scr-an-legend">'+parts.map(function(p){ return '<span><i class="'+p[2]+'"></i>'+esc(tr(p[1]))+' <b>'+c[p[0]]+'</b></span>'; }).join("")+'</div>'
    + scanLine(scanFill("Changed by hand {n} times, on {t} of {all} tasks; the AI suggested a value on {ai}.",{n:c.manualChanges,t:c.changedTasks,all:n,ai:c.aiSuggested}))+'</div>'; }
function scanPointsHtml(r){ var p=r.points, W=r.weeks, labels=[tr("No bonus"),"≤ 5%","5–10%","10–15%","15–20%","> 20%"], max=0;
  p.distribution.forEach(function(x){ if(x.awards>max) max=x.awards; });
  var dist=max?'<div class="scr-an-dist" role="img" aria-label="'+attr(tr("Bonus rate of each approved award"))+'">'+p.distribution.map(function(x,i){ return '<span class="scr-an-dcol" title="'+attr(labels[i]+": "+x.awards)+'"><b>'+x.awards+'</b><i style="height:'+(x.awards?Math.max(4,Math.round(x.awards/max*100)):0)+'%"></i><em>'+esc(labels[i])+'</em></span>'; }).join("")+'</div>':'<div class="hint scr-an-nodata">'+tr("No approved awards in this period.")+'</div>';
  return scanCols(W,[{label:tr("Base points"),cls:"s1",v:p.byWeek.map(function(x){ return x?x.base:null; })},{label:tr("Bonus"),cls:"s2",v:p.byWeek.map(function(x){ return x?x.bonus:null; })}],scanP)
    + '<div class="scr-an-sub">'+tr("Bonus rate of each approved award")+'</div>'+dist
    + scanLine(scanFill("Approved: {b} base + {x} bonus ({s} of the points earned). Waiting for review: {w}. Rejected {rj}, revoked {rv}, not eligible {ie}.",{b:scanP(p.approved.base),x:scanP(p.approved.bonus),s:scanPct(p.approved.bonusShare),w:scanP(p.pending.base+p.pending.bonus),rj:p.other.rejected,rv:p.other.revoked,ie:p.other.ineligible}))
    + scanLine(p.quality.average==null?tr("No quality scores yet."):scanFill("Average quality score {q} of 5, over {n} reviewed awards.",{q:scanN(p.quality.average,1),n:p.quality.scored}))
    + scanLine(tr("Per award, never per person: the bonus is an operational figure, not pay and not a ranking.")); }
function scanOutcomesHtml(o){
  var bar=function(p){ return typeof scoBarHtml==="function"?scoBarHtml(p):'<div class="scr-out-none">'+(p&&p.value!=null?scanPct(p.value):tr("No progress yet"))+'</div>'; };
  var row=function(m,cls){ return '<div class="scr-an-out'+(cls?' '+cls:'')+'" data-metric="'+attr(m.id)+'"><div class="scr-an-out-t"><span data-no-translate>'+esc(m.title)+'</span>'+(m.actual!=null?'<span class="hint">'+scanN(m.actual,m.actual%1?2:0)+(m.target!=null?' / '+scanN(m.target,m.target%1?2:0):'')+(m.unit?' '+esc(m.unit):'')+'</span>':'')+'</div>'+bar(m.progress)+'</div>'; };
  var h='';
  if(o.kpis) h+='<div class="scr-an-sub">'+tr("KPIs")+(o.off&&o.off.kpi?scanOff({off:true}):'')+'</div>'+(o.kpis.length?o.kpis.map(function(m){ return row(m); }).join(""):'<div class="hint">'+tr("No active KPIs.")+'</div>');
  if(o.objectives) h+='<div class="scr-an-sub">'+tr("Objectives and key results")+(o.off&&o.off.okr?scanOff({off:true}):'')+'</div>'+(o.objectives.length?o.objectives.map(function(ob){ return row(ob,"obj")+ob.keyResults.map(function(m){ return row(m,"kr"); }).join(""); }).join(""):'<div class="hint">'+tr("No active objectives.")+'</div>');
  return h+scanLine(tr("KPIs and OKRs keep their own periods and filters: the filters above do not change them. Progress comes only from evidence or a value entered with a reason — never from points.")); }
function scanPeopleHtml(r){
  if(!r.people.length) return '<div class="hint">'+tr("No one has completed tasks in this period.")+'</div>';
  var chip=function(label,v){ return '<span class="badge scr-an-chip">'+esc(tr(label))+' <b>'+v+'</b></span>'; };
  return r.people.map(function(p){ var c=chip("Tasks completed",scanN(p.tasks));
      if(p.loggedHours!==undefined) c+=chip("Time logged",scanH(p.loggedHours));
      if(p.velocity!==undefined&&r.velocity) c+=chip(SCAN_UNIT[r.velocity.unit]||"Velocity",scanVal(p.velocity,r.velocity.unit));
      if(p.basePoints!==undefined) c+=chip("Base points",scanN(p.basePoints,2))+chip("Bonus",'+'+scanN(p.bonusPoints,2))+(p.pendingPoints?chip("Waiting for review",scanN(p.pendingPoints,2)):'');
      if(p.assetPoints!==undefined) c+=chip("Asset points",scanN(p.assetPoints,2));
      return '<div class="scr-an-person" data-person="'+attr(p.userId)+'">'+av(p.userId)+'<div class="scr-an-pm"><span class="scr-an-pn" data-no-translate>'+esc(scanName(p.userId,p.name))+'</span><span class="scr-an-chips">'+c+'</span></div></div>'; }).join("")
    + scanLine(tr("In name order, each person's own figures side by side — not a ranking. Hours and points are never added together.")); }

/* the section: the screen's timeline, the filters, the figures */
function scanFiltersHtml(){ var all=canI.scoringViewAnalytics();
  var sel=function(k,label,opts){ return '<label class="scr-an-f"><span>'+tr(label)+'</span>'+selectHtml("scan_"+k,opts,SCAN.f[k]||"",'onchange="scanSet('+jsq(k)+',this.value)"')+'</label>'; };
  var people=Object.keys(PEOPLE).filter(function(id){ return !PEOPLE[id].stakeholder; }).sort(function(a,b){ return person(a).name.localeCompare(person(b).name); });
  return '<div class="scr-an-filters"><span class="badge scr-an-period">'+esc(scanFill(scanWeeks()===1?"Last {n} week":"Last {n} weeks",{n:scanWeeks()}))+'</span>'
    + sel("project","Project",[["",tr("All projects")]].concat(liveProjects().map(function(p){ return [p.id,p.name]; })))
    + sel("team","Team",[["",tr("All teams")]].concat(activeTeams().map(function(t){ return [t.id,t.name]; })))
    + (all?sel("person","Person",[["",tr("Everyone")]].concat(people.map(function(id){ return [id,person(id).name]; }))):'')
    + sel("status","Estimate",[["",tr("Any estimate")],["approved",tr("Approved")],["locked",tr("Locked (approved or frozen)")],["not_locked",tr("Not locked")],["unverified",tr("From before Smart Scoring")]])
    + (all?'<label class="scr-an-f scr-an-hist"><input type="checkbox" id="scan_history"'+(SCAN.history?' checked':'')+' onchange="SCAN.history=this.checked;scanRedraw()"><span>'+tr("Include switched-off modules")+'</span></label>':'')+'</div>'; }
function scanSectionHtml(){ scanOwner(); var q=scanQuery(), key=scanKey(q); SCAN.q[key]=q; setTimeout(function(){ scanLoad(q); },0);
  var body=scanBody(key,"page"); SCAN.html[key+"/page"]=body;
  return '<section class="scr-an" id="scrAn"><div class="scr-an-head"><div class="scr-an-title"><h2>'+I.gauge+tr("Smart Scoring")+'</h2><span class="hint">'+tr("Operational metrics, not compensation or a ranking.")+'</span></div>'+scanFiltersHtml()+'</div>'
    + '<div class="scr-an-body" data-scan="'+attr(key)+'" data-scan-kind="page">'+body+'</div></section>'; }
function scanSet(k,v){ SCAN.f[k]=v||""; scanRedraw(); }
function scanRedraw(){ var el=document.getElementById("scrAn"); if(el) el.outerHTML=scanSectionHtml(); }
/* a member's page: their own figures over the screen's timeline */
function scanMemberHtml(id){ scanOwner(); var q=scanQuery(id), key=scanKey(q); SCAN.q[key]=q; setTimeout(function(){ scanLoad(q); },0);
  var body=scanBody(key,"member"); SCAN.html[key+"/member"]=body;
  var title=id===ME?tr("Your Smart Scoring figures"):scanFill("Smart Scoring figures of {name}",{name:'<span data-no-translate>'+esc(person(id).name)+'</span>'});
  return '<section class="panel scr-an scr-an-member" id="scrAnMember" data-person="'+attr(id)+'"><div class="panel-head"><span class="sq">'+I.gauge+'</span><h2>'+title+'</h2><span class="spacer"></span><span class="badge scr-an-period">'+esc(scanFill(scanWeeks()===1?"Last {n} week":"Last {n} weeks",{n:scanWeeks()}))+'</span></div>'
    + '<div class="panel-body pad"><div class="scr-an-body" data-scan="'+attr(key)+'" data-scan-kind="member">'+body+'</div>'+scanLine(tr("The tasks assigned to this person, completed in the period. Operational metrics, not compensation or a ranking."))+'</div></section>'; }

/* the screens, wrapped: the Analytics screen and a member's page get the section once Smart Scoring is on */
(function(){ if(typeof renderAnalytics!=="function") return; var base=renderAnalytics; renderAnalytics=function(){ var out=base.apply(this,arguments);
  try{ var c=document.getElementById("content"); if(c&&scanReady()&&c.querySelector(".an-head")&&!document.getElementById("scrAn")) c.insertAdjacentHTML("beforeend",scanSectionHtml()); }catch(e){ console.error(e); } return out; }; })();
(function(){ if(typeof renderMember!=="function") return; var base=renderMember; renderMember=function(){ var out=base.apply(this,arguments);
  try{ var id=S.memberId, c=document.getElementById("content"); if(c&&id&&PEOPLE[id]&&!PEOPLE[id].stakeholder&&scanReady()&&(id===ME||canI.scoringViewAnalytics())&&!document.getElementById("scrAnMember")) c.insertAdjacentHTML("beforeend",scanMemberHtml(id)); }catch(e){ console.error(e); } return out; }; })();

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Smart Scoring":"Smart Scoring","Operational metrics, not compensation or a ranking.":"Metrik operasional, bukan kompensasi atau peringkat.",
  "{n} h":"{n} jam","{n} pts":"{n} poin","no data":"tidak ada data","No data in this period.":"Tidak ada data pada periode ini.","Switched off — history":"Dimatikan — riwayat",
  "Smart Scoring's analytics come from the server: the offline demo has none.":"Analitik Smart Scoring berasal dari server: demo offline tidak memilikinya.",
  "Tasks completed":"Task selesai","Tasks finished in the period, in a completed stage. Declined and open work are not counted.":"Task yang selesai dalam periode ini, di tahap selesai. Pekerjaan yang ditolak (Declined) dan yang masih berjalan tidak dihitung.",
  "Tasks you are assigned to, finished in the period in a completed stage. Declined and open work are not counted.":"Task yang ditugaskan kepada Anda dan selesai dalam periode ini di tahap selesai. Pekerjaan yang ditolak dan yang masih berjalan tidak dihitung.",
  "Tasks this person is assigned to, finished in the period in a completed stage. Declined and open work are not counted.":"Task yang ditugaskan kepada orang ini dan selesai dalam periode ini di tahap selesai. Pekerjaan yang ditolak dan yang masih berjalan tidak dihitung.",
  "Locked estimate → time logged":"Estimasi terkunci → waktu tercatat",
  "Tasks whose estimate was locked (approved, or frozen when work started) and whose time was logged in the time log: their estimates added up, then the time logged.":"Task yang estimasinya dikunci (disetujui, atau dibekukan saat pekerjaan dimulai) dan waktunya dicatat di catatan waktu: jumlah estimasinya, lalu waktu yang tercatat.",
  "{n} task":"{n} task","{n} tasks":"{n} task","{n} unverified, counted apart":"{n} belum terverifikasi, dihitung terpisah","Typical estimate miss":"Selisih estimasi yang lazim",
  "The median of |actual − estimate| ÷ estimate over those tasks. Lower is better; only tasks with both numbers count.":"Median dari |aktual − estimasi| ÷ estimasi pada task-task itu. Makin rendah makin baik; hanya task yang punya kedua angka yang dihitung.",
  "Within ±20%":"Dalam ±20%","The share of those tasks whose time logged was within 20% of the estimate.":"Persentase task-task itu yang waktu tercatatnya berada dalam 20% dari estimasi.",
  "{over} took longer · {under} took less":"{over} lebih lama · {under} lebih cepat",
  "Velocity in {unit}":"Velositas dalam {unit}","hours":"jam","story points":"story point","weighted points":"weighted point",
  "The final values of the tasks completed, in the workspace's primary capacity metric.":"Nilai akhir task yang selesai, dalam metrik kapasitas utama workspace.",
  "The final values of the tasks completed, in the workspace's primary capacity metric. A task shared by several people counts its share for each.":"Nilai akhir task yang selesai, dalam metrik kapasitas utama workspace. Task yang dikerjakan beberapa orang dihitung sesuai bagiannya untuk tiap orang.",
  "{n} without a value":"{n} tanpa nilai","First-pass approval":"Disetujui sekali jalan",
  "Of the tasks reviewed, the share approved without any revision request.":"Dari task yang di-review, persentase yang disetujui tanpa permintaan revisi.","{n} reviewed":"{n} di-review",
  "Review rounds":"Putaran review","Reviews until approval, on average: 1 is approved the first time. Beside it, the median time from the first version to the approval.":"Rata-rata jumlah review sampai disetujui: 1 berarti disetujui pada review pertama. Di sampingnya, median waktu dari versi pertama sampai disetujui.",
  "median {h} to approval":"median {h} sampai disetujui",
  "Base points approved":"Poin dasar disetujui","The base points of approved efficiency awards. Never the bonus, never hours.":"Poin dasar dari penghargaan efisiensi yang disetujui. Tidak termasuk bonus, bukan jam.",
  "{n} award":"{n} penghargaan","{n} awards":"{n} penghargaan","Efficiency bonus approved":"Bonus efisiensi disetujui",
  "Bonus points of approved awards, for work finished under a locked estimate. Kept apart from the base.":"Poin bonus dari penghargaan yang disetujui, untuk pekerjaan yang selesai di bawah estimasi terkunci. Dipisahkan dari poin dasar.",
  "Waiting for review":"Menunggu review","Base and bonus points of awards not approved yet: not counted above.":"Poin dasar dan bonus dari penghargaan yang belum disetujui: tidak dihitung di atas.",
  "Asset points":"Poin aset","Output points for assets produced, by the kind of work (Settings → Smart Scoring), counted when the task is completed. Never hours, base points or bonus.":"Poin hasil kerja untuk aset yang dihasilkan, menurut jenis pekerjaannya (Pengaturan → Smart Scoring), dihitung saat task selesai. Bukan jam, poin dasar, atau bonus.",
  "{n} assets":"{n} aset",
  "Your own figures: the tasks you are assigned to. Whoever holds the team's scoring analytics sees everyone's.":"Angka milik Anda sendiri: task yang ditugaskan kepada Anda. Pemegang analitik skor tim melihat angka semua orang.",
  "{n} estimate from before Smart Scoring":"{n} estimasi dari sebelum Smart Scoring","{n} estimate never locked":"{n} estimasi yang tidak pernah dikunci",
  "{n} estimates from before Smart Scoring":"{n} estimasi dari sebelum Smart Scoring","{n} estimates never locked":"{n} estimasi yang tidak pernah dikunci",
  "{n} with the scope changed since the lock":"{n} dengan cakupan berubah sejak dikunci","{n} with time from before the time log":"{n} dengan waktu dari sebelum catatan waktu",
  "{n} with an Actual typed, not logged":"{n} dengan Aktual diketik, bukan dicatat",
  "Locked estimate":"Estimasi terkunci","Time logged":"Waktu dicatat","Unverified, counted apart":"Belum terverifikasi, dihitung terpisah","typical miss":"selisih lazim",
  "Not estimated: {a} · Estimated, no time logged: {b} · Blocked (waiting) time: {c}, never in Actual":"Tanpa estimasi: {a} · Ada estimasi, tanpa waktu tercatat: {b} · Waktu terblokir (menunggu): {c}, tidak pernah masuk Aktual",
  "Estimate against time logged":"Estimasi dibanding waktu tercatat","Throughput and velocity":"Throughput dan velositas","Where the scores came from":"Asal nilai skor",
  "Math":"Hitungan","AI":"AI","Typed by hand":"Diketik manual","From before Smart Scoring":"Dari sebelum Smart Scoring","Not scored":"Belum dinilai",
  "Effort Hours":"Effort Hours","Story Points":"Story Points","Weighted Points":"Weighted Points",
  "Changed by hand {n} times, on {t} of {all} tasks; the AI suggested a value on {ai}.":"Diubah manual {n} kali, pada {t} dari {all} task; AI menyarankan nilai pada {ai}.",
  "Base points and efficiency bonus":"Poin dasar dan bonus efisiensi","Base points":"Poin dasar","Bonus":"Bonus","No bonus":"Tanpa bonus",
  "Bonus rate of each approved award":"Tingkat bonus tiap penghargaan yang disetujui","No approved awards in this period.":"Tidak ada penghargaan yang disetujui pada periode ini.",
  "Approved: {b} base + {x} bonus ({s} of the points earned). Waiting for review: {w}. Rejected {rj}, revoked {rv}, not eligible {ie}.":"Disetujui: {b} dasar + {x} bonus ({s} dari poin yang diperoleh). Menunggu review: {w}. Ditolak {rj}, dicabut {rv}, tidak memenuhi syarat {ie}.",
  "No quality scores yet.":"Belum ada skor kualitas.","Average quality score {q} of 5, over {n} reviewed awards.":"Rata-rata skor kualitas {q} dari 5, dari {n} penghargaan yang di-review.",
  "Per award, never per person: the bonus is an operational figure, not pay and not a ranking.":"Per penghargaan, bukan per orang: bonus adalah angka operasional, bukan gaji dan bukan peringkat.",
  "{p} for {a} assets on {t} tasks completed; {v} of it validated by a lead.":"{p} untuk {a} aset pada {t} task selesai; {v} di antaranya sudah divalidasi lead.",
  "* shared among the people assigned until each person's count is typed.":"* dibagi rata di antara orang yang ditugaskan sampai jumlah tiap orang diisi.",
  "KPIs and OKRs":"KPI dan OKR","KPIs":"KPI","Objectives and key results":"Objective dan key result","No active KPIs.":"Tidak ada KPI aktif.","No active objectives.":"Tidak ada objective aktif.","No progress yet":"Belum ada progres",
  "KPIs and OKRs keep their own periods and filters: the filters above do not change them. Progress comes only from evidence or a value entered with a reason — never from points.":"KPI dan OKR punya periode dan filternya sendiri: filter di atas tidak mengubahnya. Progres hanya berasal dari bukti atau nilai yang diisi dengan alasan — tidak pernah dari poin.",
  "People":"Orang","No one has completed tasks in this period.":"Belum ada yang menyelesaikan task pada periode ini.",
  "In name order, each person's own figures side by side — not a ranking. Hours and points are never added together.":"Diurutkan menurut nama, angka tiap orang berdampingan — bukan peringkat. Jam dan poin tidak pernah dijumlahkan.",
  "Last {n} week":"{n} minggu terakhir","Last {n} weeks":"{n} minggu terakhir","All projects":"Semua project","All teams":"Semua tim","Person":"Orang","Everyone":"Semua orang",
  "Estimate":"Estimasi","Any estimate":"Estimasi apa pun","Approved":"Disetujui","Locked (approved or frozen)":"Terkunci (disetujui atau dibekukan)","Not locked":"Belum dikunci",
  "Include switched-off modules":"Sertakan modul yang dimatikan","Your Smart Scoring figures":"Angka Smart Scoring milik Anda","Smart Scoring figures of {name}":"Angka Smart Scoring milik {name}",
  "The tasks assigned to this person, completed in the period. Operational metrics, not compensation or a ranking.":"Task yang ditugaskan kepada orang ini dan selesai dalam periode ini. Metrik operasional, bukan kompensasi atau peringkat.",
  "Something went wrong":"Terjadi kesalahan"
});
</script>
<style>
.scr-an{margin-top:18px}
.scr-an-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 16px;margin-bottom:12px}
.scr-an-title{display:flex;flex-direction:column;gap:2px;min-width:0}
.scr-an-title h2{display:flex;align-items:center;gap:8px;margin:0;font-size:var(--fs-md)}
.scr-an-title h2 .i{width:18px;height:18px}
.scr-an-filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.scr-an-f{display:flex;align-items:center;gap:6px;font-size:var(--fs-sm);color:var(--color-text-secondary);min-width:0;max-width:100%}
.scr-an-f select{max-width:180px;min-width:0;border:1px solid var(--color-border);border-radius:8px;padding:4px 8px;background:var(--color-surface);color:var(--color-text-primary);font:inherit;font-size:var(--fs-sm)}
.scr-an-hist input{margin:0}
.scr-an-figs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.scr-an-fig{border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);min-width:0}
.scr-an-fig.off{opacity:.75;border-style:dashed}
.scr-an-fig summary{list-style:none;cursor:pointer;display:flex;flex-direction:column;gap:2px;padding:10px 12px}
.scr-an-fig summary::-webkit-details-marker{display:none}
.scr-an-v{font-size:20px;font-weight:700;color:var(--color-text-primary);font-variant-numeric:tabular-nums;line-height:1.2;overflow-wrap:anywhere}
.scr-an-k{font-size:var(--fs-sm);font-weight:600;color:var(--color-text-secondary)}
.scr-an-s{font-size:11.5px;color:var(--color-text-tertiary)}
.scr-an-why{margin:0;padding:0 12px 10px;font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-an-panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px;align-items:start}
.scr-an-panels>.panel{margin:0;min-width:0}
.scr-an-chart{display:flex;flex-direction:column;gap:4px}
.scr-an-cols{display:flex;align-items:flex-end;gap:2px;height:110px;padding:4px 0;border-bottom:1px solid var(--color-border)}
.scr-an-col{flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center;gap:1px}
.scr-an-col i{display:block;flex:1 1 0;max-width:18px;border-radius:3px 3px 0 0;min-height:0}
.scr-an-col.nd{background:repeating-linear-gradient(135deg,transparent 0 4px,var(--color-surface-sunken) 4px 6px);border-radius:3px;height:12%}
.scr-an-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-tertiary)}
.scr-an-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-an-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.scr-an i.s0{background:var(--color-border-strong)}.scr-an i.s1{background:var(--color-primary)}.scr-an i.s2{background:var(--color-secondary)}.scr-an i.s3{background:var(--color-success)}.scr-an i.s4{background:var(--color-warning)}
.scr-an-sub{font-weight:650;font-size:var(--fs-sm);color:var(--color-text-primary);margin:12px 0 6px}
.scr-an-sub:first-child{margin-top:0}
.scr-an-line{margin-top:6px}
.scr-an-stack{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--color-surface-sunken);margin-bottom:6px}
.scr-an-stack i{display:block;height:100%}
.scr-an-src+.scr-an-src{margin-top:14px}
.scr-an-dist{display:flex;align-items:flex-end;gap:6px;height:120px;padding-top:4px}
.scr-an-dcol{flex:1 1 0;min-width:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;font-size:11px;color:var(--color-text-secondary)}
.scr-an-dcol i{display:block;width:70%;max-width:34px;background:var(--color-secondary);border-radius:3px 3px 0 0}
.scr-an-dcol em{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.scr-an-out{display:flex;flex-direction:column;gap:4px;padding:6px 0;border-bottom:1px solid var(--color-border)}
.scr-an-out.kr{padding-left:14px}
.scr-an-out.obj .scr-an-out-t{font-weight:650}
.scr-an-out-t{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;min-width:0}
.scr-an-out-t span:first-child{min-width:0;overflow-wrap:anywhere}
.scr-an-person{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--color-border);min-width:0}
.scr-an-person>.av{flex:none}
.scr-an-pm{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.scr-an-pn{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-an-chips{display:flex;flex-wrap:wrap;gap:4px}
.scr-an-chip b{color:var(--color-text-primary);font-variant-numeric:tabular-nums}
.scr-an-member .scr-an-figs{margin-bottom:6px}
@media (max-width:640px){.scr-an-figs{grid-template-columns:repeat(2,minmax(0,1fr))}.scr-an-f{flex:1 1 140px}.scr-an-f select{max-width:none;flex:1}.scr-an-v{font-size:18px}}
</style>
