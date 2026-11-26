<script>
/* ============================================================
   AI INTELLIGENCE — what it is told beyond the lists (Nov 2026)
   The owner asked for the chat to know how many assets each person has and what someone produced in a project in a
   given month, and then for the dashboard's and Analytics' figures: trends, speed, quality and risk. Every figure here
   comes from the function the app's own screen uses, or from one helper that both the snapshot the model reads
   (aiContext) and the answers without a model (aiLocalAnswer) call, so the chat, the screens and the two kinds of
   answer cannot disagree:
   - output (aiOutput): finished tasks and assets per month, person and project. A task is finished in a done stage
     other than Declined and counts in the month it was finished (teamDoneThisMonth's rule: Teams' "Done this month",
     a person's "this month"); its assets go to whom the reports credit them (taskAssetCredit);
   - Home: dashCounts() (src/dashboard.js); a person's load: assigned() (src/core.js), as Team workload counts it;
   - Analytics: metrics() (src/analytics.js) on the server's figures when the page holds them (AN, or the ones the
     Analytics screen last drew), else on demoAnalytics(), Analytics' own formula over the loaded tasks; nothing is
     fetched for the chat. Per-person review outcomes are counted as reportData() (src/export.js) counts them.
   Only what this viewer's page already holds is read, and Analytics' figures go only to someone who may open Analytics.
   ============================================================ */

/* ---------- months ---------- */
/* six calendar months, the current one included: this month and last month, a quarter and a half-year review. Older
   work is still in each person's totals; the window only bounds the tables by month. */
var AI_OUT_MONTHS=6;
function aiPad(n){ return (n<10?"0":"")+n; }
function aiMonthKey(d){ return d.getFullYear()+"-"+aiPad(d.getMonth()+1); }
function aiDayKey(d){ return d.getFullYear()+"-"+aiPad(d.getMonth()+1)+"-"+aiPad(d.getDate()); }
function aiMonthShift(key,n){ var p=String(key).split("-"); return aiMonthKey(new Date(+p[0],+p[1]-1+n,1)); }
/* "2026-11 November": how a month is written in the snapshot (in English: the model reads it) */
function aiMonthTag(key){ return key+" "+MOL[+String(key).slice(5,7)-1]; }
/* "November 2026" / "Oktober 2026": how an answer names a month */
function aiMonthName(key,id){ return (id?MOL_ID:MOL)[+String(key).slice(5,7)-1]+" "+String(key).slice(0,4); }
var AI_MONTH_WORDS=[["january","jan","januari"],["february","feb","februari","pebruari"],["march","mar","maret"],["april","apr"],["may","mei"],["june","jun","juni"],["july","jul","juli"],["august","aug","agustus","agu","agt"],["september","sep","sept"],["october","oct","oktober","okt"],["november","nov","nopember"],["december","dec","desember","des"]];
var AI_NUM_WORDS={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,satu:1,dua:2,tiga:3,empat:4,lima:5,enam:6,tujuh:7,delapan:8,sembilan:9,sepuluh:10};
/* The month a question is about, as "YYYY-MM", or null: "this month" / "bulan ini", "last month" / "bulan lalu",
   "2 months ago" / "dua bulan lalu", "2026-10", or a month's name in English or Indonesian, with its year or else the
   latest one not in the future ("December", asked in November, is last December). "may" counts only as "in May" or
   "May 2026": "may I ask" is no month. skip: words not to read as a month (the person's name: Jan, April). */
function aiMonthIn(q,skip){
  var s=" "+String(q||"").toLowerCase().replace(/[?!.,;:()"']/g," ").replace(/\s+/g," ")+" ", cur=aiMonthKey(TODAY), m, n, i, j, w, y;
  skip=skip||[];
  if((m=/\b(\d{1,2}|[a-z]+) (?:months? ago|bulan (?:yang )?lalu|bulan (?:kemarin|sebelumnya))\b/.exec(s))){ n=/^\d+$/.test(m[1])?+m[1]:Object.prototype.hasOwnProperty.call(AI_NUM_WORDS,m[1])?AI_NUM_WORDS[m[1]]:0; if(n>0&&n<=120) return aiMonthShift(cur,-n); }
  if(/\b(?:this|current) month\b|\bbulan (?:ini|sekarang)\b/.test(s)) return cur;
  if(/\b(?:last|previous|past) month\b|\bbulan (?:yang )?lalu\b|\bbulan (?:kemarin|sebelumnya)\b|\bsebulan (?:yang )?lalu\b/.test(s)) return aiMonthShift(cur,-1);
  if((m=/\b(20\d\d)-(0[1-9]|1[0-2])\b/.exec(s))) return m[1]+"-"+m[2];
  y=(m=/\b(20\d\d)\b/.exec(s))?+m[1]:0;
  for(i=0;i<12;i++) for(j=0;j<AI_MONTH_WORDS[i].length;j++){ w=AI_MONTH_WORDS[i][j]; if(skip.indexOf(w)>=0) continue;
    if(w==="may"?/\b(?:in|during|of|for|since|bulan) may\b|\bmay 20\d\d\b/.test(s):new RegExp("\\b"+w+"\\b").test(s)) return (y||(i>TODAY.getMonth()?TODAY.getFullYear()-1:TODAY.getFullYear()))+"-"+aiPad(i+1); }
  return null;
}

/* ---------- output: finished tasks and assets, per month, person and project ---------- */
/* the month a task counts in, or null while it is not finished (Declined is not finished): the day it was finished, in
   local time, else its due date when no time was kept, as Teams' "Done this month" decides (teamDoneThisMonth) */
function aiDoneMonth(t){ if(!t||t._draft||!isSuccessfulTask(t)) return null; var d=t.completedAt?new Date(t.completedAt):dateOf(t.due); return isNaN(d.getTime())?null:aiMonthKey(d); }
/* The one count behind ASSETS BY PERSON, the monthly tables and the answers without a model. A task's assets go to whom
   the reports credit them (taskAssetCredit: each person's count typed under Assets & versions, else whoever uploaded
   its versions, in proportion, else shared among its assignees, which is an estimate and marked so). A slim task
   (finished long ago and loaded without its versions) still carries its assetCount and its typed counts: it is counted,
   never read as 0. A person's tasks are the finished tasks they are assigned to. A task in two projects counts in each
   project, and once in a person's or a month's total. Shares are added before rounding, as personAssetCredit does.
   get(month, person, project): month is "YYYY-MM", "done" (finished, any month) or "total" (every task not Declined,
   open ones too: a person page's "Assets produced"); person and project null for all, project "" for none. */
function aiOutput(tasks){
  var cells={}, rows=[], idx={};
  function add(k,n,raw,est){ var c=cells[k]||(cells[k]={tasks:0,raw:0,est:false}); c.tasks+=n; c.raw+=raw; if(est) c.est=true; }
  (tasks||TASKS).forEach(function(t){
    if(!t||t._draft||t.status==="declined") return;
    var total=assetCount(t), c=total?taskAssetCredit(t):{by:{},exact:true}, by=c.by, est=!c.exact, cr=Object.keys(by), who=assigneesOf(t), mo=aiDoneMonth(t),
        also=(t.alsoIn||[]).filter(function(x){ return x&&x!==t.proj; }), pj=t.proj?[t.proj].concat(also):also.length?also:[""];
    function put(m){ add(m+"|*|*",1,total,false); pj.forEach(function(p){ add(m+"|*|"+p,1,total,false); });
      who.forEach(function(id){ add(m+"|"+id+"|*",1,0,false); pj.forEach(function(p){ add(m+"|"+id+"|"+p,1,0,false); }); });
      cr.forEach(function(id){ add(m+"|"+id+"|*",0,by[id],est); pj.forEach(function(p){ add(m+"|"+id+"|"+p,0,by[id],est); }); }); }
    put("total"); if(!mo) return;
    put("done"); put(mo); rows.push({t:t,month:mo,projects:pj,assignees:who,credit:c});
    var ix=idx[mo]||(idx[mo]={}); who.concat(cr).forEach(function(id){ var o=ix[id]||(ix[id]={}); pj.forEach(function(p){ o[p]=1; }); });
  });
  return {rows:rows,
    get:function(m,id,p){ var c=cells[(m||"done")+"|"+(id||"*")+"|"+(p==null?"*":p)]; return c?{tasks:c.tasks,assets:Math.round(c.raw),raw:c.raw,est:c.est}:{tasks:0,assets:0,raw:0,est:false}; },
    /* who finished or was credited with something in a month, and in which projects: {person: {project: 1}} */
    people:function(m){ return idx[m]||{}; }};
}
function aiProjLabel(p){ if(!p) return "(no project)"; var x=project(p); return x?x.name+(x.status==="archived"?" [archived]":""):"(a removed project)"; }
/* The snapshot's output sections. room: the characters they may take; the monthly person x project table gives way
   first, from its oldest month, and says what it left out. */
function aiOutputLines(room){
  var A=aiOutput(), cur=aiMonthKey(TODAY), prev=aiMonthShift(cur,-1), months=[], out=[], i;
  for(i=0;i<AI_OUT_MONTHS;i++) months.push(aiMonthShift(cur,-i));
  var st=function(g){ return g.assets+(g.est?"*":""); }, ta=function(g){ return "tasks="+g.tasks+" assets="+st(g); };
  out.push("OUTPUT RULE: a task is finished in a done stage other than Declined and counts in the month it was finished (local time; its due date's month when no finish time was kept), as Teams' \"Done this month\" and each person's \"this month\" count it. Its assets are credited as the reports, the person pages and Smart Scoring credit them: each person's count typed under Assets & versions, else whoever uploaded its versions (in proportion), else shared among its assignees, which is an estimate and marked * (old finished tasks are loaded without their versions and may land there). A person's tasks are the finished tasks they are assigned to. A task in two projects counts in each project, once in a person's or a month's total. Quote these figures as they are.");
  var T=A.get("total"), D=A.get("done");
  out.push("ASSETS IN ALL: produced="+T.assets+" on every task not Declined, open ones included; delivered="+D.assets+" on "+D.tasks+" finished tasks; "+cur+" (this month)="+A.get(cur).assets+"; "+prev+" (last month)="+A.get(prev).assets+".");
  out.push("ASSETS BY PERSON (produced = on all their tasks not Declined, open ones included, as their page's \"Assets produced\"; delivered = on finished tasks; "+cur+" = this month, "+prev+" = last month; tasks finished = finished tasks they are assigned to):");
  var idle=[];
  Object.keys(PEOPLE).forEach(function(id){ var p=PEOPLE[id]; if(!p||p.active===false||p.stakeholder) return;
    var t=A.get("total",id), d=A.get("done",id), a=A.get(cur,id), b=A.get(prev,id);
    if(!t.raw&&!d.tasks){ idle.push(p.name); return; }
    out.push("- "+p.name+": produced="+st(t)+" delivered="+st(d)+" "+cur+"="+st(a)+" "+prev+"="+st(b)+" | tasks finished: all="+d.tasks+" "+cur+"="+a.tasks+" "+prev+"="+b.tasks); });
  if(idle.length) out.push("- nothing produced or finished yet: "+idle.join(", "));
  out.push("OUTPUT BY MONTH, whole workspace (finished tasks and all their assets; "+AI_OUT_MONTHS+" calendar months, newest first; "+cur+" is the current month, still running): "+months.map(function(m){ var g=A.get(m); return aiMonthTag(m)+" tasks="+g.tasks+" assets="+g.assets; }).join("; "));
  /* per project: the busiest first, so a cut leaves out the quietest */
  var w={}; A.rows.forEach(function(r){ if(months.indexOf(r.month)>=0) r.projects.forEach(function(p){ w[p]=(w[p]||0)+assetCount(r.t)+0.001; }); });
  var cap1=Math.max(1200,Math.min(4000,room*0.25)), used=0, left=0;
  out.push("PROJECT OUTPUT BY MONTH (finished tasks and all their assets, the same months, newest first; months with nothing finished, and projects with nothing finished in them, are left out):");
  Object.keys(w).sort(function(a,b){ return (w[b]-w[a])||aiProjLabel(a).localeCompare(aiProjLabel(b)); }).forEach(function(p){
    var l="- "+aiProjLabel(p)+": "+months.filter(function(m){ return A.get(m,null,p).tasks; }).map(function(m){ return m+" "+ta(A.get(m,null,p)); }).join("; ")+" | all time: "+ta(A.get("done",null,p));
    if(left||used+l.length+1>cap1){ left++; return; } used+=l.length+1; out.push(l); });
  if(left) out.push("- …"+left+" more projects with less output left out, for room");
  /* per person and project, month by month, newest first */
  var cap2=Math.max(800,Math.min(12000,room-used-1500)), used2=0, cut=0, from=null;
  out.push("MONTHLY OUTPUT BY PERSON x PROJECT (finished tasks the person is assigned to and the assets credited to them, newest month first; each line is the person's month total, then by project; nobody is listed in a month they finished nothing in):");
  months.forEach(function(m){
    var ix=A.people(m), ids=Object.keys(ix).sort(function(a,b){ var x=A.get(m,a), y=A.get(m,b); return (y.raw-x.raw)||(y.tasks-x.tasks)||person(a).name.localeCompare(person(b).name); });
    var ls=[aiMonthTag(m)+(m===cur?" (current month)":m===prev?" (last month)":"")+(ids.length?":":": nothing finished")];
    ids.forEach(function(id){ var ps=Object.keys(ix[id]); ls.push("- "+person(id).name+": "+ta(A.get(m,id))+" | "+(ps.length===1?"all in "+aiProjLabel(ps[0]):ps.map(function(p){ return aiProjLabel(p)+" "+ta(A.get(m,id,p)); }).join("; "))); });
    ls.forEach(function(l){ if(cut||used2+l.length+1>cap2){ cut++; if(!from) from=m; return; } used2+=l.length+1; out.push(l); });
  });
  if(cut) out.push("…"+cut+" more lines left out, for room: part of "+aiMonthTag(from)+" and the months before it. The totals above still cover every month.");
  return out;
}

/* ---------- Home, Analytics, risk, load and activity ---------- */
function aiFew(ts,f,n){ n=n||5; return ts.length?ts.slice(0,n).map(f).join("; ")+(ts.length>n?"; +"+(ts.length-n)+" more":""):"none"; }
function aiRef(t){ return t.id+" \""+t.title+"\""; }
/* the Monday each of the last n weeks starts on, as Analytics counts its weeks (the last is the current week) */
function aiWeekStarts(n){ var s=new Date(TODAY), out=[]; s.setDate(s.getDate()-((s.getDay()+6)%7)-7*(n-1)); for(var i=0;i<n;i++){ var d=new Date(s); d.setDate(s.getDate()+7*i); out.push(aiDayKey(d)); } return out; }
/* Analytics' figures, as its screen has them: the server's when the page holds them (AN, or the ones last drawn),
   else Analytics' own formula over the loaded tasks (demoAnalytics, as offline and in the exports). metrics() reads
   AN, so it is pointed at the chosen figures for the call and put back at once. */
function aiAnalytics(){
  var keep=AN, shown=typeof AN_SHOWN!=="undefined"&&AN_SHOWN?AN_SHOWN.an:null, ok=function(a){ return !!(a&&!a.error&&a.weeks&&a.weeks.length); };
  var raw=ok(AN)?AN:ok(shown)?shown:null, server=!!raw&&!raw.demo,
      src=raw?(raw.demo?"the demo workspace's figures":raw===AN?"the server's figures":"the server's figures, as the Analytics screen last drew them"):"Analytics' own formula, worked out in the browser over the loaded tasks",
      note=raw?"":"; old finished tasks are loaded without their versions and history, so the oldest weeks' revision, approval and time-in-status figures can read low";
  if(!raw) raw=demoAnalytics();
  var m; try{ AN=raw; m=metrics(); } finally{ AN=keep; }
  var n=m.weeks.length, off=Math.max(0,(raw.weeks||[]).length-n), sl=function(a){ return (a||[]).slice(off,off+n); };
  return {m:m,src:src,note:note,server:server,n:n,starts:aiWeekStarts(n),raw:{avgDays:sl(raw.avgDays),revisionRate:sl(raw.revisionRate),approvalHrs:sl(raw.approvalHrs)}};
}
/* One person's review outcomes, exactly as the report's Workload sheet counts them (reportData, src/export.js): the
   versions they uploaded on the tasks they are assigned to, approved or sent back; first pass = a task approved before
   any of theirs on it was sent back. Here for one person at a time, without the rest of the report (which credits
   every person's assets over every task, seconds in a big workspace). tasks: exportTasks(), as the report reads. */
function aiReviewOutcomes(id,tasks){ var approvals=0, revisions=0, firstPass=0, reviewed=0;
  tasks.forEach(function(t){ if(!isAssignee(t,id)) return; var vs=(t.versions||[]).filter(function(v){ return v.by===id; }), got=false;
    vs.forEach(function(v){ if(v.state==="approved"){ approvals++; if(!got) firstPass++; got=true; } else if(v.state==="revision"){ revisions++; got=true; } });
    if(vs.some(function(v){ return v.state==="approved"||v.state==="revision"; })) reviewed++; });
  var n=approvals+revisions; return {outcomes:n,approvalRate:n?Math.round(approvals/n*100):null,revisionRate:n?Math.round(revisions/n*100):null,firstPassRate:reviewed?Math.round(firstPass/reviewed*100):null}; }
/* a person's open hours against their weekly capacity, as Team workload counts them (assigned(): their share of a task
   with several assignees; archived projects left out) */
function aiLoad(id){ var p=person(id), h=assigned(id), cap=+p.cap||0; return {h:h,cap:cap,pct:cap?Math.round(h/cap*100):0}; }
function aiOverCapacity(){ var ld={}; return Object.keys(PEOPLE).filter(function(id){ var p=PEOPLE[id]; if(!p||p.active===false||p.stakeholder) return false; ld[id]=aiLoad(id); return ld[id].pct>100; }).sort(function(a,b){ return ld[b].pct-ld[a].pct; }); }
function aiDashLines(){
  var d=dashCounts();
  return ["HOME DASHBOARD (as the viewer's Home shows it): my tasks="+d.mine.length+", due today="+d.today.length+", in review="+d.inrev.length+" ("+d.rev.length+" waiting for your review), overdue="+d.over.length+", completed in the last 7 days="+d.doneWeek+", assets delivered="+d.assetsDone+" (from completed tasks: every done stage, Declined included, so it can differ from ASSETS IN ALL), assets in production="+d.assetsOpen+" (planned on open tasks), asset links="+assetLinks(TASKS).length+", auto-hidden done tasks="+autoHiddenCount()+". Its upcoming deadlines are DUE WITHIN 7 DAYS below.",
    "- needs your review ("+d.rev.length+"): "+aiFew(d.rev,aiRef),
    "- inbox, new requests waiting ("+d.reqs.length+"): "+aiFew(d.reqs,aiRef)];
}
/* Projects at risk, and why: Analytics' Deadline risk (high: overdue work, or past the deadline; medium: 7 days or
   less left and under 70% done), marked At risk by hand, or more work than time: its open hours are more than 8 a
   day, weekends included, for each person on its open tasks until the deadline. Most at risk first. */
function aiProjectRisks(m){
  var rank=function(x){ return x.risk==="high"?0:x.risk==="medium"?1:2; };
  var on={};   /* the people on each project's open tasks, in one pass */
  TASKS.forEach(function(t){ if(t._draft||isClosed(t)) return; var who=assigneesOf(t); [t.proj].concat(t.alsoIn||[]).forEach(function(pid){ if(!pid) return; var o=on[pid]||(on[pid]={}); who.forEach(function(id){ o[id]=1; }); }); });
  return (m.byProject||[]).map(function(r){ var p=project(r.id)||{};
    var n=Object.keys(on[r.id]||{}).length, hrs=+r.remainingHours||0, tight=r.daysLeft!=null&&r.daysLeft>=0&&hrs>Math.max(1,r.daysLeft)*8*Math.max(1,n);
    return {id:r.id,name:r.name,risk:r.risk,marked:p.status==="risk",tight:tight,progress:r.progress,open:r.open,overdue:r.overdue,hours:hrs,days:r.daysLeft,people:n}; })
    .filter(function(x){ return x.risk!=="low"||x.marked||x.tight; })
    .sort(function(a,b){ return (rank(a)-rank(b))||((a.days==null?1e4:a.days)-(b.days==null?1e4:b.days)); });
}
/* open tasks that cannot fit before their due date: the estimate left after the hours logged, per assignee, is more
   than 8 hours a day, today included (overdue ones are in OVERDUE already) */
function aiTasksTooBig(open){ return open.filter(function(t){ if(!(t.due>=0)) return false; var left=Math.max(0,(+t.effort||0)-(+((t.meta||{}).actualEffort)||0))/Math.max(1,assigneesOf(t).length); return left>8*(t.due+1); }); }
function aiRiskLines(an,open){
  var rk=aiProjectRisks(an.m), big=aiTasksTooBig(open), sch=open.filter(function(t){ return dependencyRisk(t).length; }), tb=an.m.topBlockers||[];
  return ["RISK:",
    "- projects at risk ("+rk.length+"; risk= is Analytics' Deadline risk: high = overdue work or past its deadline, medium = 7 days or less left and under 70% done; MARKED = set At risk by hand; MORE-WORK-THAN-TIME = its open hours are more than 8 a day, weekends included, for each person on its open tasks until the deadline): "+aiFew(rk,function(x){ return x.name+" risk="+x.risk+(x.marked?" MARKED":"")+(x.tight?" MORE-WORK-THAN-TIME":"")+" progress="+x.progress+"% open="+x.open+" overdue="+x.overdue+" hours_left="+x.hours+"h days_left="+(x.days==null?"no deadline":x.days)+" people="+x.people; },8),
    "- open tasks that cannot fit before their due date ("+big.length+"; the estimate left after the hours logged, per assignee, is more than 8h a day, today included): "+aiFew(big,function(t){ return aiRef(t)+" "+Math.max(0,(+t.effort||0)-(+((t.meta||{}).actualEffort)||0))+"h left for "+Math.max(1,assigneesOf(t).length)+" people, due "+aiDay(t.due); }),
    "- tasks waiting on work due after them (SCHEDULE-RISK, "+sch.length+"): "+aiFew(sch,function(t){ return t.id+" due "+iso(t.due)+" needs "+dependencyRisk(t).map(function(d){ return d.id+" due "+iso(d.due); }).join("+"); }),
    "- top blockers, open tasks others wait on ("+tb.length+"): "+aiFew(tb,function(x){ return aiRef(x.task)+" blocks "+x.count; })];
}
/* where work is now (Analytics' Pipeline snapshot), and how long it stays in each stage (Analytics' Time in status) */
function aiPipelineLines(an,full){
  var by={}; boardTasks().forEach(function(t){ by[t.status]=(by[t.status]||0)+1; });
  var cnt=localStages().map(function(s){ return {s:s,n:by[s.id]||0}; }), top=cnt.filter(function(x){ return x.s.kind!=="closed"; }).sort(function(a,b){ return b.n-a.n; })[0];
  var out=["PIPELINE (tasks in each stage now, as Analytics' Pipeline snapshot counts them; archived projects left out): "+cnt.map(function(x){ return x.s.name+"="+x.n; }).join(", ")+(top&&top.n?"; most open work waits in "+top.s.name+" ("+top.n+")":"")];
  if(full){ var tis=(an.m.timeInStatus||[]).filter(function(s){ return s.days!=null; }), slow=tis.slice().sort(function(a,b){ return b.days-a.days; })[0];
    out.push("TIME IN STATUS (average days a task stays in a stage before it moves on, from "+an.src+"; n = moves measured): "+(tis.length?tis.map(function(s){ return s.name+" "+s.days+"d (n="+s.samples+")"; }).join(", ")+"; slowest: "+slow.name:"not enough moves yet")); }
  return out;
}
/* revision rounds: versions sent back per task, over the loaded tasks with versions */
function aiRevisionRounds(){
  var ts=TASKS.filter(function(t){ return !t._draft&&(t.versions||[]).length; }).map(function(t){ var vs=t.versions; return {t:t,r:vs.filter(function(v){ return v.state==="revision"; }).length,v:vs.reduce(function(a,v,i){ return Math.max(a,+v.n||i+1); },0)}; });
  var sum=ts.reduce(function(a,x){ return a+x.r; },0), sent=ts.filter(function(x){ return x.r; });
  return {tasks:ts.length,avg:ts.length?Math.round(sum/ts.length*10)/10:0,sent:sent.length,top:sent.sort(function(a,b){ return (b.r-a.r)||(b.v-a.v); }).slice(0,5)};
}
/* Revision requests over versions uploaded between two times, as Analytics works a week out in the browser
   (demoAnalytics): an upload counts when it was made, a revision when it was decided */
function aiRevisionsIn(from,to){
  var up=0, rev=0, when=function(o){ return new Date(o.createdAt||isoAgo(o.ago||0)).getTime(); }, inR=function(v){ return v!=null&&v>=from&&v<to; };
  TASKS.forEach(function(t){ if(t._draft||t.tutorial) return; (t.versions||[]).forEach(function(v){ if(inR(when(v))) up++; var dd=v.decidedAt?+new Date(v.decidedAt):v.decidedAgo!=null?Date.now()-v.decidedAgo*60000:null; if(v.state==="revision"&&inR(dd)) rev++; }); });
  return {uploaded:up,revised:rev,rate:up?rev/up:null};
}
/* finished on or before the due date, of the finished tasks a person is assigned to that were finished since a day */
function aiOnTime(id,from){ var n=0, ok=0; TASKS.forEach(function(t){ if(t._draft||!isSuccessfulTask(t)||!t.completedAt||!isAssignee(t,id)) return; var day=aiDayKey(new Date(t.completedAt)); if(day<from) return; n++; if(day<=iso(t.due)) ok++; }); return {n:n,ok:ok}; }
function aiAnalyticsLines(an){
  var m=an.m, raw=an.raw, nz=function(v,u){ return v==null?"-":v+(u||""); }, pc=function(v){ return v==null?"-":Math.round(v*100)+"%"; };
  var out=["ANALYTICS (from "+an.src+an.note+"; the last "+an.n+" weeks, "+an.starts[0]+" to "+an.starts[an.n-1]+"; weeks start on Monday and the last one is the current week, still running):",
    "- totals: created="+m.totalCreated+" completed="+m.totalCompleted+" avg completion="+m.avgCompletion+" days from created to completed (the mean of the weekly averages, Analytics' \"Avg completion\"); team utilization="+m.utilization+"% ("+m.asg+"h of "+m.cap+"h a week)",
    "- by week (overdue = tasks due that week finished late or not yet; avg_days = created to completed; revision = revision requests / versions uploaded; approval_h = hours from upload to approval):"];
  for(var i=0;i<an.n;i++) out.push("  "+an.starts[i]+": created="+m.created[i]+" completed="+m.completed[i]+" overdue="+m.overdue[i]+" avg_days="+nz(raw.avgDays[i])+" revision="+pc(raw.revisionRate[i])+" approval_h="+nz(raw.approvalHrs[i]));
  out.push("- quality: revision rate="+m.liveRevRate+"% (Analytics' card: tasks with a version sent back / tasks with versions, all loaded tasks); weekly revision rate on average="+m.revRate+"%; approval rate="+m.approvalRate+"% (tasks whose latest version is approved / tasks with versions); average approval time="+m.avgApproval+"h");
  var rr=aiRevisionRounds();
  out.push("- revision rounds (versions sent back per task, over the "+rr.tasks+" loaded tasks with versions): average="+rr.avg+", "+rr.sent+" tasks had at least one; most: "+aiFew(rr.top,function(x){ return aiRef(x.t)+" "+x.r+" rounds, up to V"+x.v; }));
  var ex=exportTasks(), ppl=Object.keys(PEOPLE).filter(function(id){ var p=PEOPLE[id]; return p&&p.active!==false&&!p.stakeholder; }).map(function(id){ return {id:id,r:aiReviewOutcomes(id,ex),o:aiOnTime(id,an.starts[0])}; })
    .filter(function(x){ return x.r.outcomes||x.o.n; }).sort(function(a,b){ return (b.r.outcomes+b.o.n)-(a.r.outcomes+a.o.n); });
  out.push("- per person (review outcomes = their versions approved or sent back on their tasks, as the report's Workload sheet counts them; on time = finished on or before the due date, of their tasks finished in these weeks): "+(ppl.length?"":"nobody yet"));
  ppl.slice(0,20).forEach(function(x){ var r=x.r; out.push("  "+person(x.id).name+": review outcomes="+r.outcomes+" approved="+nz(r.approvalRate,"%")+" sent back="+nz(r.revisionRate,"%")+" first pass="+nz(r.firstPassRate,"%")+" | on time="+x.o.ok+" of "+x.o.n); });
  if(ppl.length>20) out.push("  …"+(ppl.length-20)+" more people left out, for room");
  return out;
}
/* what happened in the last 7 days, counted by kind, from the workspace's activity the page holds */
function aiActivityLine(){
  var list=typeof ACTIVITY!=="undefined"&&ACTIVITY||[], since=Date.now()-7*864e5, by={}, who={}, n=0, oldest=Infinity;
  list.forEach(function(a){ var at=new Date(a.createdAt||isoAgo(a.ago||0)).getTime(); if(at<oldest) oldest=at; if(!(at>=since)) return; n++; by[a.k]=(by[a.k]||0)+1; if(a.who) who[a.who]=(who[a.who]||0)+1; });
  var top=function(o,f,k){ return Object.keys(o).sort(function(a,b){ return o[b]-o[a]; }).slice(0,k).map(function(x){ return f(x)+"="+o[x]; }).join(", "); };
  return "ACTIVITY IN THE LAST 7 DAYS ("+n+" events among the "+list.length+" latest the page holds"+(list.length&&oldest>since?"; those go back only to "+aiDayKey(new Date(oldest))+", so these counts are a floor":"")+"): "+(n?top(by,String,10)+"; most active: "+top(who,function(id){ return person(id).name; },5):"none");
}

/* ---------- answers without a model ---------- */
/* Questions about output: how many assets someone has or produced (in a month, in a project), how many tasks they
   finished, who produced the most, what a project or a month produced. null when the question is about something
   else. o: {idL, L, who, pj} from aiLocalAnswer (its language and the person and project it found). */
function aiLocalOutput(q,s,o){
  var L=o.L, idl=o.idL;
  var aQ=/asset|\baset\b|deliverable|output|produc|hasilkan|dihasilkan|\bhasil\b/.test(s),
      tQ=/\btasks?\b|\btugas\b|pekerjaan|kerjaan/.test(s)&&/finish|complet|\bdone\b|\bclosed?\b|selesai|rampung|tuntas|\bberes\b/.test(s),
      top=/\bmost\b|\btop\b|terbanyak|paling banyak|paling produktif|tertinggi|ranking|peringkat|\bbest\b/.test(s),
      cnt=/how many|how much|\bcount\b|number of|berapa|jumlah|\btotal\b/.test(s);
  if(!aQ&&!tQ) return null;
  var who=top?null:o.who, pj=o.pj;
  if(!who&&!top&&/\bi\b|\bmine\b/.test(s)) who=ME;
  var mo=aiMonthIn(q,who?String(person(who).name||"").toLowerCase().split(/\s+/):[]);
  /* a week is not a month: "this week" goes to the weekly throughput (aiLocalInsight) */
  if(!mo&&/\b(?:this|last|past|previous) week\b|\bminggu (?:ini|lalu)\b/.test(s)) return null;
  if(!(who||pj||mo||top||(tQ&&cnt))) return null;
  var A=aiOutput(), cur=aiMonthKey(TODAY), prev=aiMonthShift(cur,-1), pid=pj?pj.id:null, est=false;
  var mon=function(m){ return aiMonthName(m,idl)+(m===cur?L(" (this month)"," (bulan ini)"):m===prev?L(" (last month)"," (bulan lalu)"):""); };
  var inP=pj?L(" in **"+pj.name+"**"," di **"+pj.name+"**"):"";
  var fa=function(g){ if(g.est) est=true; return g.assets+(g.est?"*":""); };
  var na=function(g){ return fa(g)+L(g.assets===1?" asset":" assets"," aset"); }, nt=function(g){ return g.tasks+L(g.tasks===1?" finished task":" finished tasks"," task selesai"); };
  var foot=function(){ return (est?"\n\n* "+L("Partly estimated: shared among the assignees, because nobody typed each person's count or uploaded the versions.","Sebagian perkiraan: dibagi ke para assignee, karena belum ada yang mengisi jumlah per orang atau mengunggah versinya."):"")
    +"\n\n_"+L("Counted as the person pages, the reports and Smart Scoring count them: a task counts once finished, in the month it was finished.","Dihitung seperti halaman anggota, laporan, dan Smart Scoring: task dihitung setelah selesai, pada bulan selesainya.")+"_"; };
  var ranked=function(key,byTasks){ return Object.keys(PEOPLE).filter(function(id){ return PEOPLE[id]&&!PEOPLE[id].stakeholder; }).map(function(id){ return {id:id,g:A.get(key,id,pid)}; })
    .filter(function(r){ return byTasks?r.g.tasks:r.g.raw; }).sort(function(a,b){ return byTasks?(b.g.tasks-a.g.tasks)||(b.g.raw-a.g.raw):(b.g.raw-a.g.raw)||(b.g.tasks-a.g.tasks); }); };
  /* who produced or finished the most */
  if(top){ var byT=tQ&&!aQ, key=mo||(byT?"done":"total"), when=mo?L(" in "," pada ")+mon(mo):L(" in total"," secara total"), rs=ranked(key,byT);
    if(!rs.length) return byT?L("No one finished a task"+inP+when+".","Belum ada yang menyelesaikan task"+inP+when+"."):L("No assets were produced"+inP+when+".","Belum ada aset yang dihasilkan"+inP+when+".");
    return (byT?L("Most tasks finished"+inP+when+":","Task selesai terbanyak"+inP+when+":"):L("Most assets produced"+inP+when+":","Aset terbanyak yang dihasilkan"+inP+when+":"))+"\n\n"
      + rs.slice(0,5).map(function(r,i){ return (i+1)+". **"+person(r.id).name+"** — "+(byT?nt(r.g)+", "+na(r.g):na(r.g)+(key==="total"?"":", "+nt(r.g))); }).join("\n")+foot(); }
  /* one person */
  if(who){ var nm="**"+person(who).name+"**";
    if(mo){ var g=A.get(mo,who,pid), list=A.rows.filter(function(r){ return r.month===mo&&(!pid||r.projects.indexOf(pid)>=0)&&(r.assignees.indexOf(who)>=0||r.credit.by[who]); }), ps=Object.keys(A.people(mo)[who]||{});
      var head=tQ&&!aQ?L(nm+" finished **"+g.tasks+"** task(s)"+inP+" in "+mon(mo)+", with **"+fa(g)+"** asset(s) credited to them.",nm+" menyelesaikan **"+g.tasks+"** task"+inP+" pada "+mon(mo)+", dengan **"+fa(g)+"** aset.")
                      :L(nm+" produced **"+fa(g)+"** asset(s)"+inP+" in "+mon(mo)+", from **"+g.tasks+"** finished task(s).",nm+" menghasilkan **"+fa(g)+"** aset"+inP+" pada "+mon(mo)+", dari **"+g.tasks+"** task selesai.");
      if(!pid&&ps.length>1) head+="\n\n"+L("By project:","Per project:")+"\n"+ps.map(function(p){ var x=A.get(mo,who,p); return "- "+aiProjLabel(p)+": "+na(x)+", "+nt(x); }).join("\n");
      if(list.length) head+="\n\n"+list.slice(0,8).map(function(r){ var mine=Math.round((r.credit.by[who]||0)*10)/10; return "- **"+r.t.id+"** "+r.t.title+" — "+mine+L(" of "," dari ")+assetCount(r.t)+L(" assets"," aset"); }).join("\n")+(list.length>8?"\n- "+L("…and "+(list.length-8)+" more","…dan "+(list.length-8)+" lainnya"):"");
      return head+foot(); }
    var t=A.get("total",who,pid), d=A.get("done",who,pid), a=A.get(cur,who,pid), b=A.get(prev,who,pid);
    return (tQ&&!aQ?L(nm+" has finished **"+d.tasks+"** task(s)"+inP+": "+a.tasks+" this month, "+b.tasks+" last month, with "+na(d)+" delivered.",nm+" telah menyelesaikan **"+d.tasks+"** task"+inP+": "+a.tasks+" bulan ini, "+b.tasks+" bulan lalu, dengan "+na(d)+" terkirim.")
                   :L(nm+" has produced **"+fa(t)+"** asset(s)"+inP+" in total: "+fa(d)+" delivered from finished tasks, "+fa(a)+" this month, "+fa(b)+" last month. Finished tasks: "+d.tasks+".",nm+" telah menghasilkan **"+fa(t)+"** aset"+inP+" secara total: "+fa(d)+" terkirim dari task selesai, "+fa(a)+" bulan ini, "+fa(b)+" bulan lalu. Task selesai: "+d.tasks+"."))+foot(); }
  /* a project, a month, or the workspace */
  var k2=mo||"done", g2=A.get(k2,null,pid), when2=mo?L(" in "," pada ")+mon(mo):L(" in total"," secara total"), rs2=ranked(k2,tQ&&!aQ);
  return L("**"+g2.tasks+"** task(s) finished"+inP+when2+", with **"+g2.assets+"** asset(s).","**"+g2.tasks+"** task selesai"+inP+when2+", dengan **"+g2.assets+"** aset.")
    + (rs2.length?"\n\n"+L("By person:","Per orang:")+"\n"+rs2.slice(0,5).map(function(r){ return "- **"+person(r.id).name+"** — "+na(r.g)+", "+nt(r.g); }).join("\n"):"")+foot();
}
/* Questions about speed, quality and flow: the revision rate (this month, or the Analytics figures), revision rounds,
   the average completion time, throughput this week, and where work piles up. null for anything else. For someone who
   may not open Analytics, it says so rather than reading the figures out. */
function aiLocalInsight(q,s,o){
  var L=o.L, idl=o.idL;
  var rev=/(?:revision|revisi)\s*(?:rate|rasio|tingkat|persen)|(?:tingkat|rasio|persentase) revisi|sent back|dikembalikan|approval rate|tingkat persetujuan|revision rounds?|putaran revisi|most revisions|revisi terbanyak|paling banyak revisi|how often.*revis|seberapa sering.*revisi/.test(s),
      speed=/average completion|avg completion|completion time|cycle time|lead time|how long (?:does|do|did|it)|rata-?rata waktu|waktu (?:penyelesaian|selesai|pengerjaan)|berapa lama/.test(s),
      thr=/throughput|velocity|created vs|dibuat vs/.test(s)||(/this week|minggu ini/.test(s)&&/finish|complet|\bdone\b|created|selesai|dibuat/.test(s)&&/how many|berapa|jumlah/.test(s)),
      pile=/bottleneck|piles? up|stuck|menumpuk|macet|tertahan|time in (?:status|stage)|waktu di (?:tahap|status)|paling lama di/.test(s);
  if(!(rev||speed||thr||pile)) return null;
  if(typeof canI!=="undefined"&&canI.viewAnalytics&&!canI.viewAnalytics()) return L("Throughput, completion time and revision figures come from Analytics, which is for leads and admins, so I can't read them out for you.","Angka throughput, waktu selesai, dan revisi berasal dari Analytics, yang hanya untuk lead dan admin, jadi saya tidak bisa membacakannya untukmu.");
  var an=aiAnalytics(), m=an.m, n=an.n, last=n-1, wk=function(i){ return an.starts[i]; };
  var src="\n\n_"+L("From ","Dari ")+(an.server?L("the server's Analytics figures","angka Analytics dari server"):L("Analytics' own formula over the tasks loaded in this page","rumus Analytics sendiri atas task yang dimuat di halaman ini"))+"._";
  if(rev){
    if(/rounds?|putaran|terbanyak|most/.test(s)){ var rr=aiRevisionRounds();
      return L("On average **"+rr.avg+"** revision round(s) per task with versions ("+rr.tasks+" tasks; "+rr.sent+" had at least one).","Rata-rata **"+rr.avg+"** putaran revisi per task yang punya versi ("+rr.tasks+" task; "+rr.sent+" pernah direvisi.")
        +(rr.top.length?"\n\n"+rr.top.map(function(x){ return "- **"+x.t.id+"** "+x.t.title+" — "+x.r+L(" round(s), up to V"," putaran, sampai V")+x.v; }).join("\n"):""); }
    var mo=aiMonthIn(q);
    if(mo){ var p=mo.split("-"), r=aiRevisionsIn(new Date(+p[0],+p[1]-1,1).getTime(),new Date(+p[0],+p[1],1).getTime()), lbl=aiMonthName(mo,idl);
      return (r.uploaded?L("Revision rate in "+lbl+": **"+Math.round(r.rate*100)+"%**: "+r.revised+" revision request(s) on "+r.uploaded+" version(s) uploaded.","Tingkat revisi pada "+lbl+": **"+Math.round(r.rate*100)+"%**: "+r.revised+" permintaan revisi dari "+r.uploaded+" versi yang diunggah.")
        :L("No versions were uploaded in "+lbl+", so there is no revision rate for it.","Tidak ada versi yang diunggah pada "+lbl+", jadi belum ada tingkat revisinya."))
        +"\n\n_"+L("Revision requests over versions uploaded, from the versions loaded in this page, as Analytics' chart counts a week.","Permintaan revisi dibagi versi yang diunggah, dari versi yang dimuat di halaman ini, seperti grafik Analytics menghitung per minggu.")+"_"; }
    return L("Revision rate: **"+m.liveRevRate+"%** of the tasks with versions had one sent back. Over the last "+n+" weeks, revision requests were **"+m.revRate+"%** of the versions uploaded on average. Approval rate **"+m.approvalRate+"%**, average approval time **"+m.avgApproval+"h**.",
             "Tingkat revisi: **"+m.liveRevRate+"%** task yang punya versi pernah dikembalikan untuk revisi. Dalam "+n+" minggu terakhir, permintaan revisi rata-rata **"+m.revRate+"%** dari versi yang diunggah. Tingkat persetujuan **"+m.approvalRate+"%**, rata-rata waktu persetujuan **"+m.avgApproval+" jam**.")
      +"\n\n"+an.raw.revisionRate.map(function(v,i){ return "- "+wk(i)+": "+(v==null?"—":Math.round(v*100)+"%"); }).slice(-4).join("\n")+src; }
  if(speed) return L("Average completion time: **"+m.avgCompletion+" days** from created to completed, over the last "+n+" weeks (the mean of the weekly averages).","Rata-rata waktu selesai: **"+m.avgCompletion+" hari** dari dibuat sampai selesai, dalam "+n+" minggu terakhir (rata-rata dari rata-rata mingguan).")
    +"\n\n"+an.raw.avgDays.map(function(v,i){ return "- "+L("week of ","minggu ")+wk(i)+": "+(v==null?"—":v+L(" days"," hari")); }).slice(-4).join("\n")+src;
  if(thr){ var d=dashCounts();
    return L("This week (from "+wk(last)+"): **"+m.created[last]+"** created, **"+m.completed[last]+"** completed. Over the last "+n+" weeks: "+m.totalCreated+" created, "+m.totalCompleted+" completed. In the last 7 days, "+d.doneWeek+" were completed (Home).",
             "Minggu ini (sejak "+wk(last)+"): **"+m.created[last]+"** dibuat, **"+m.completed[last]+"** selesai. Dalam "+n+" minggu terakhir: "+m.totalCreated+" dibuat, "+m.totalCompleted+" selesai. Dalam 7 hari terakhir, "+d.doneWeek+" selesai (Home).")
      +"\n\n"+m.weeks.map(function(x,i){ return "- "+wk(i)+": "+m.created[i]+L(" created, "," dibuat, ")+m.completed[i]+L(" completed"," selesai"); }).slice(-4).join("\n")+src; }
  var stg=localStages().filter(function(x){ return x.kind!=="closed"; }).map(function(x){ return {s:x,n:boardTasks().filter(function(t){ return t.status===x.id; }).length}; }).sort(function(a,b){ return b.n-a.n; }),
      tis=(m.timeInStatus||[]).filter(function(x){ return x.days!=null; }).sort(function(a,b){ return b.days-a.days; });
  return L("Most open work waits in **"+(stg[0]?stg[0].s.name:"—")+"** ("+(stg[0]?stg[0].n:0)+" tasks)"+(tis.length?"; tasks stay longest in **"+tis[0].name+"** ("+tis[0].days+" days on average)":"")+".","Pekerjaan terbuka paling banyak menumpuk di **"+(stg[0]?stg[0].s.name:"—")+"** ("+(stg[0]?stg[0].n:0)+" task)"+(tis.length?"; task paling lama tertahan di **"+tis[0].name+"** (rata-rata "+tis[0].days+" hari)":"")+".")
    +"\n\n"+stg.slice(0,6).map(function(x){ return "- "+x.s.name+": "+x.n; }).join("\n")+src;
}
</script>
