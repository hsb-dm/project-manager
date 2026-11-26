<script>
/* ============================================================
   AI INTELLIGENCE — what it is told beyond the lists (Nov 2026)
   The owner asked for the chat to know how many assets each person has and what someone produced in a project in a
   given month, and then for the dashboard's and Analytics' figures: trends, speed, quality and risk. Every figure here
   comes from the function the app's own screen uses, or from one helper that both the snapshot the model reads
   (aiContext) and the answers without a model (aiLocalAnswer) call, so the chat, the screens and the two kinds of
   answer cannot disagree:
   - output (aiOutput): finished tasks and assets per month, week, quarter and year, person, project, team (Nov 2026:
     after "berapa banyak asset yang diproduksi habib bulan ini di social media tim?" was answered "not available"),
     label and kind. A task is finished in a done stage other than Declined and counts in the month it was finished
     (teamDoneThisMonth's rule: Teams' "Done this month", a person's "this month"); its assets go to whom the reports
     credit them (taskAssetCredit); a team's tasks are the Teams page's (taskInvolvesTeam). The sections are packed by
     how often they are asked (aiPack), and every person line is that person's own, a group's total written "of N";
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

/* ---------- output: finished tasks and assets, by month, week, quarter and year, person, project, team, label, kind ---------- */
/* the day a task counts on, or null while it is not finished (Declined is not finished): the day it was finished, in
   local time, else its due date when no time was kept, as Teams' "Done this month" decides (teamDoneThisMonth) */
function aiDoneDate(t){ if(!t||t._draft||!isSuccessfulTask(t)) return null; var d=t.completedAt?new Date(t.completedAt):dateOf(t.due); return isNaN(d.getTime())?null:d; }
function aiDoneMonth(t){ var d=aiDoneDate(t); return d?aiMonthKey(d):null; }
/* the Monday a day's week starts on, as Analytics counts its weeks */
function aiWeekOf(d){ var x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate()-((x.getDay()+6)%7)); return aiDayKey(x); }
function aiQuarterOf(d){ return d.getFullYear()+"-Q"+(Math.floor(d.getMonth()/3)+1); }
/* the weekly table runs from the week the 1st of last month falls in to this week */
function aiWeekFrom(){ var p=aiMonthShift(aiMonthKey(TODAY),-1).split("-"); return aiWeekOf(new Date(+p[0],+p[1]-1,1)); }
/* the teams a task is work of, as the Teams page counts a team's work (taskInvolvesTeam): set to the team, or assigned
   to one of its members. A project's teams do not make a task the team's. */
function aiTaskTeams(t){ var o={}; if(t.team) o[t.team]=1; assigneesOf(t).forEach(function(id){ if(PEOPLE[id]) teamsOf(id).forEach(function(x){ o[x]=1; }); }); return Object.keys(o); }
/* the kind of work chosen on a task (Kind of work, or the main kind of its split), "" when none was chosen: the title
   is never read for it here, so a count by kind is only what people set */
function aiTaskKind(t){ return typeof ScoringEngine!=="undefined"&&ScoringEngine.kindPick&&typeof estKindList==="function"?ScoringEngine.kindPick(t,estKindList(),estHoursSet())||"":""; }
function aiKindName(k,id){ if(!k) return "(kind not set)"; var x=(typeof estKindList==="function"?estKindList():[]).filter(function(y){ return y.id===k; })[0]; return x?(id&&x.nameId||x.name):k; }
function aiTeamName(id){ var x=team(id); return x?x.name:"(a removed team)"; }
function aiLabelName(id){ var x=typeof label==="function"?label(id):null; return x?x.name:"(a removed label)"; }
/* The one count behind every output section and the answers without a model. A task's assets go to whom the reports
   credit them (taskAssetCredit: each person's count typed under Assets & versions, else whoever uploaded its versions,
   in proportion, else shared among its assignees, which is an estimate and marked so). A slim task (finished long ago
   and loaded without its versions) still carries its assetCount and its typed counts: it is counted, never read as 0.
   A person's tasks are the finished tasks they are assigned to. A task in two projects, teams or labels counts in
   each, and once in a person's or a period's total. Shares are added before rounding, as personAssetCredit does.
   get(period, person, group): period "YYYY-MM" (a month), "W"+Monday (a week of last month or this one), "YYYY-Qn",
   "Y"+year, "done" (finished, any time) or "total" (every task not Declined, open ones too: a person page's "Assets
   produced"); person null for everyone; group null for all, a project's id ("" for none), "team:"+id, "label:"+id or
   "kind:"+id ("kind:" for not set). Weeks, quarters and years are kept for everyone and teams; months and "done" for
   every group; "total" for projects and teams. sum(keep, person) adds up the finished tasks keep(row) is true of. */
function aiOutput(tasks){
  var cells={}, rows=[], idx={}, wk0=aiWeekFrom();
  function add(k,n,raw,est){ var c=cells[k]||(cells[k]={tasks:0,raw:0,est:false}); c.tasks+=n; c.raw+=raw; if(est) c.est=true; }
  (tasks||TASKS).forEach(function(t){
    if(!t||t._draft||t.status==="declined") return;
    var total=assetCount(t), c=total?taskAssetCredit(t):{by:{},exact:true}, by=c.by, est=!c.exact, cr=Object.keys(by), who=assigneesOf(t), d=aiDoneDate(t),
        also=(t.alsoIn||[]).filter(function(x){ return x&&x!==t.proj; }), pj=t.proj?[t.proj].concat(also):also.length?also:[""], tms=aiTaskTeams(t),
        tg=tms.map(function(x){ return "team:"+x; }), base=["*"].concat(pj,tg);
    function put(m,gs){ gs.forEach(function(g){ add(m+"|*|"+g,1,total,false); who.forEach(function(id){ add(m+"|"+id+"|"+g,1,0,false); }); cr.forEach(function(id){ add(m+"|"+id+"|"+g,0,by[id],est); }); }); }
    put("total",base); if(!d) return;
    var mo=aiMonthKey(d), wk=aiWeekOf(d), lb=(t.labels||[]).filter(Boolean), kd=aiTaskKind(t), all=base.concat(lb.map(function(x){ return "label:"+x; }),["kind:"+kd]), few=["*"].concat(tg);
    put("done",all); put(mo,all); put(aiQuarterOf(d),few); put("Y"+d.getFullYear(),few); if(wk>=wk0) put("W"+wk,few);
    rows.push({t:t,month:mo,week:wk,quarter:aiQuarterOf(d),year:"Y"+d.getFullYear(),projects:pj,teams:tms,labels:lb,kind:kd,assignees:who,credit:c});
    [mo,"W"+wk].forEach(function(k){ var ix=idx[k]||(idx[k]={}); who.concat(cr).forEach(function(id){ var o=ix[id]||(ix[id]={}); all.forEach(function(g){ if(g!=="*") o[g]=1; }); }); });
  });
  var none={tasks:0,assets:0,raw:0,est:false};
  return {rows:rows,
    get:function(m,id,g){ var c=cells[(m||"done")+"|"+(id||"*")+"|"+(g==null?"*":g)]; return c?{tasks:c.tasks,assets:Math.round(c.raw),raw:c.raw,est:c.est}:none; },
    sum:function(keep,id){ var g={tasks:0,raw:0,est:false}; rows.forEach(function(r){ if(!keep(r)) return; if(!id){ g.tasks++; g.raw+=assetCount(r.t); return; } if(r.assignees.indexOf(id)>=0) g.tasks++; var x=r.credit.by[id]; if(x){ g.raw+=x; if(!r.credit.exact) g.est=true; } }); g.assets=Math.round(g.raw); return g; },
    /* who finished or was credited with something in a month (or a week, "W"+Monday), and in what: {person: {group: 1}} */
    people:function(m){ return idx[m]||{}; }};
}
function aiProjLabel(p){ if(!p) return "(no project)"; var x=project(p); return x?x.name+(x.status==="archived"?" [archived]":""):"(a removed project)"; }
/* Sections into the room they have, most asked first (pri: 0 is always shown, then 1, 2, …): each takes its lines in
   order, whole when it can, and the room left goes to the next. Within a section the newest and busiest lines come
   first, so a cut leaves out the oldest and quietest, and says how many; a section with no room even for its heading is
   named in one line at the end, so the model can say it could not read it. Shown in the order given. spare: room the
   two most asked (pri 1 and 2) may also take, from the open tasks' share, so each person's totals and the teams' months
   are whole even in a narrow snapshot. secs: [{name, head, lines, pri, what}]; returns the lines. */
function aiPack(secs,room,spare){
  var left=room-250, extra=Math.max(0,spare||0), NOTE=70;
  secs.slice().sort(function(a,b){ return a.pri-b.pri; }).forEach(function(x){ x.n=0; x.drop=false;
    var top=x.pri>0&&x.pri<=2, have=function(){ return left+(top?extra:0); }, take=function(n){ left-=n; if(left<0&&top){ extra+=left; left=0; } };
    if(x.pri>0&&x.head.length+1+(x.lines.length?NOTE:0)>have()){ x.drop=true; return; }
    take(x.head.length+1);
    for(var i=0;i<x.lines.length;i++){ var l=x.lines[i].length+1; if(l+(i<x.lines.length-1?NOTE:0)>have()) break; take(l); x.n++; }
    /* a heading with none of its lines is no use: named at the end instead, its room given back */
    if(x.pri>0&&x.lines.length&&!x.n){ x.drop=true; left+=x.head.length+1; return; }
    if(x.n<x.lines.length) take(NOTE); });
  var out=[], dropped=[];
  secs.forEach(function(x){ if(x.drop){ dropped.push(x.name+" ("+x.lines.length+" lines)"); return; } out.push(x.head); for(var i=0;i<x.n;i++) out.push(x.lines[i]); if(x.n<x.lines.length) out.push("…"+(x.lines.length-x.n)+" more "+x.what+" left out, for room."); });
  if(dropped.length) out.push("LEFT OUT FOR ROOM (say so if asked about them): "+dropped.join(", ")+".");
  return out;
}
/* The snapshot's output sections, in the order shown, each with its priority for aiPack: each person's totals first,
   then a person in a team, the teams, the months by project, the projects, the year, the weeks, then the teams'
   people, labels and kinds by month. Every person line gives that person's own figures; a group's whole figure is
   written "of N" or "team total" / "label total", so a share and a total are never the same number in one place. */
function aiOutputSections(A0){
  var A=A0||aiOutput(), cur=aiMonthKey(TODAY), prev=aiMonthShift(cur,-1), months=[], secs=[], i;
  for(i=0;i<AI_OUT_MONTHS;i++) months.push(aiMonthShift(cur,-i));
  var st=function(g){ return g.assets+(g.est?"*":""); }, ta=function(g){ return "tasks="+g.tasks+" assets="+st(g); };
  var push=function(l){ secs.push({name:"",head:l,lines:[],pri:0,what:""}); };
  var fit=function(head,lines,pri,what){ secs.push({name:head.replace(/ \(.*$|,.*$|:.*$/,""),head:head,lines:lines,pri:pri,what:what}); };
  var ppl=Object.keys(PEOPLE).filter(function(id){ var p=PEOPLE[id]; return p&&p.active!==false&&!p.stakeholder; }), tms=typeof activeTeams==="function"?activeTeams():[];
  var act={}; tms.forEach(function(x){ act[x.id]=1; });
  var teamsIn=function(id){ return teamsOf(id).filter(function(x){ return act[x]; }); }, memberOf=function(id){ return teamsIn(id).map(aiTeamName); };
  push("OUTPUT RULE: a task is finished in a done stage other than Declined and counts in the month it was finished (local time; its due date's month when no finish time was kept), as Teams' \"Done this month\" and each person's \"this month\" count it. Its assets are credited as the reports, the person pages and Smart Scoring credit them: each person's count typed under Assets & versions, else whoever uploaded its versions (in proportion), else shared among its assignees, which is an estimate and marked * (old finished tasks are loaded without their versions and may land there). A person's tasks are the finished tasks they are assigned to. A team's tasks are those set to the team or assigned to one of its members, as the Teams page counts them (a project's teams do not count). A task in two projects, teams or labels counts in each, once in a person's or a period's total. In a person's line every figure is their own; \"of N\" and \"team total\" or \"label total\" are the whole group's. Quote these figures as they are; never add them up.");
  push("GLOSSARY: assets = aset, asset, konten, output, deliverable, materi; finished = selesai, done, approved, delivered (any done stage but Declined); team = tim; \"X team\", \"tim X\" and \"X tim\" mean the team named X even when a project's name contains X too; a first name or nickname means the person whose full name starts with it; when a name matches nobody, say so and name the closest people; bulan ini / bulan lalu = this / last month, minggu ini / minggu lalu = this / last week, tahun ini = this year, kuartal = quarter. Asked about a person in a team, say which reading you give: their work on the team's tasks, or all their work as a member (both are below), or both when they differ.");
  var T=A.get("total"), D=A.get("done");
  push("ASSETS IN ALL: produced="+T.assets+" on every task not Declined, open ones included; delivered="+D.assets+" on "+D.tasks+" finished tasks; "+cur+" (this month)="+A.get(cur).assets+"; "+prev+" (last month)="+A.get(prev).assets+".");
  var idle=[], apl=[];
  ppl.slice().sort(function(a,b){ return A.get("total",b).raw-A.get("total",a).raw; }).forEach(function(id){ var p=PEOPLE[id], t=A.get("total",id), d=A.get("done",id), a=A.get(cur,id), b=A.get(prev,id), mt=memberOf(id);
    if(!t.raw&&!d.tasks){ idle.push(p.name); return; }
    apl.push("- "+p.name+(mt.length?" (member of "+mt.join(", ")+")":"")+": produced="+st(t)+" delivered="+st(d)+" "+cur+"="+st(a)+" "+prev+"="+st(b)+" | tasks finished: all="+d.tasks+" "+cur+"="+a.tasks+" "+prev+"="+b.tasks); });
  if(idle.length) apl.push("- nothing produced or finished yet: "+idle.join(", "));
  fit("ASSETS BY PERSON (produced = on all their tasks not Declined, open ones included, as their page's \"Assets produced\"; delivered = on finished tasks; "+cur+" = this month, "+prev+" = last month; tasks finished = finished tasks they are assigned to; the most productive first):",apl,1,"people (the least productive)");
  push("OUTPUT BY MONTH, whole workspace (finished tasks and all their assets; "+AI_OUT_MONTHS+" calendar months, newest first; "+cur+" is the current month, still running): "+months.map(function(m){ var g=A.get(m); return aiMonthTag(m)+" tasks="+g.tasks+" assets="+g.assets; }).join("; "));
  /* a person in a team, this month and last: on the team's tasks, and all their work, which is what they did as a member */
  var px=[], quiet=[];
  /* their own teams in both months; other teams whose tasks they worked on, this month and only the three busiest, the
     rest counted (every one of them is in TEAM PEOPLE BY MONTH) */
  ppl.forEach(function(id){ var mine=teamsIn(id), parts=[];
    [cur,prev].forEach(function(m){ var all=A.get(m,id), on=function(x){ var g=A.get(m,id,"team:"+x.id); return g.tasks||g.raw; };
      var own=tms.filter(function(x){ return mine.indexOf(x.id)>=0; }), other=m===cur?tms.filter(function(x){ return mine.indexOf(x.id)<0&&on(x); }).sort(function(a,b){ return A.get(m,id,"team:"+b.id).raw-A.get(m,id,"team:"+a.id).raw; }):[];
      if(!all.tasks&&!all.raw&&!own.some(on)&&!other.length){ if(mine.length) parts.push(m+": nothing finished"); return; }
      var cell=function(x){ var g=A.get(m,id,"team:"+x.id); return x.name+(g.tasks||g.raw?" tasks="+g.tasks+" assets="+st(g)+" of ":" none, of ")+A.get(m,null,"team:"+x.id).assets; };
      var same=own.length===1&&A.get(m,id,"team:"+own[0].id).tasks===all.tasks&&A.get(m,id,"team:"+own[0].id).raw===all.raw;
      parts.push(m+": "+own.map(cell).join(", ")+(same?" (= all their work)":(own.length?"; ":"")+"all their work tasks="+all.tasks+" assets="+st(all))+(other.length?"; on other teams' tasks: "+other.slice(0,3).map(cell).join(", ")+(other.length>3?", +"+(other.length-3)+" more teams":""):"")); });
    if(parts.some(function(x){ return !/: nothing finished$/.test(x); })) px.push({id:id,n:A.get(cur,id).raw+A.get(prev,id).raw,l:"- "+person(id).name+(mine.length?" (member of "+memberOf(id).join(", ")+")":" (in no team)")+": "+parts.join(" | ")});
    else if(mine.length) quiet.push(person(id).name); });
  px.sort(function(a,b){ return b.n-a.n; });
  fit("PERSON x TEAM, this month ("+aiMonthTag(cur)+") and last month ("+aiMonthTag(prev)+"): for each team, the person's own finished tasks and assets on the team's tasks, \"of N\" = the whole team's assets that month; \"all their work\" = everything they finished that month, which is what they produced as a member; \"on other teams' tasks\" = tasks of a team they are not in, this month:",px.map(function(x){ return x.l; }).concat(quiet.length?["- in a team, nothing finished in these two months: "+quiet.join(", ")]:[]),3,"people (the least productive)");
  /* each team's totals, month by month */
  fit("TEAM OUTPUT BY MONTH (team totals: the team's tasks finished that month and all their assets, as the Teams page's \"Done this month\" and \"Assets produced\"; months with nothing are left out):",tms.map(function(x){ var g="team:"+x.id, ms=months.filter(function(m){ return A.get(m,null,g).tasks; });
    return "- "+x.name+" ("+teamMembers(x.id).filter(function(id){ return PEOPLE[id]&&!PEOPLE[id].stakeholder; }).length+" members): "+(ms.length?ms.map(function(m){ return m+" tasks="+A.get(m,null,g).tasks+" assets="+A.get(m,null,g).assets; }).join("; "):"nothing finished in these months")+" | all time: tasks="+A.get("done",null,g).tasks+" assets="+A.get("done",null,g).assets; }),2,"teams");
  /* this year by quarter, and last year's total: the workspace, each team, each person */
  var yr=TODAY.getFullYear(), qn=Math.floor(TODAY.getMonth()/3)+1;
  var yq=function(id,g){ return aiYearLine(A,id,g); };
  var yl=[], yw=yq(null,null); if(yw) yl.push("- whole workspace (totals): "+yw);
  tms.forEach(function(x){ var l=yq(null,"team:"+x.id); if(l) yl.push("- team "+x.name+" (team totals): "+l); });
  ppl.slice().sort(function(a,b){ return A.get("Y"+yr,b).raw-A.get("Y"+yr,a).raw; }).forEach(function(id){ var l=yq(id,null); if(l) yl.push("- "+person(id).name+" (own): "+l); });
  fit("YEAR AND QUARTERS (finished tasks and assets; Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec; Q"+qn+" "+yr+" is the current quarter, still running, and a quarter with nothing is left out; "+(yr-1)+" is last year's total):",yl,7,"lines (the least productive people)");
  /* week by week, last month and this month */
  var wks=aiWeeks(), wline=function(id,g){ return aiWeekLine(A,wks,id,g); };
  var wl=[], ww=wline(null,null); wl.push("- whole workspace (totals): "+(ww||"nothing finished"));
  tms.forEach(function(x){ var l=wline(null,"team:"+x.id); if(l) wl.push("- team "+x.name+" (team totals): "+l); });
  ppl.map(function(id){ var n=0; wks.forEach(function(k){ n+=A.get("W"+k,id).raw+A.get("W"+k,id).tasks; }); return {id:id,n:n}; }).filter(function(x){ return x.n; }).sort(function(a,b){ return b.n-a.n; }).forEach(function(x){ wl.push("- "+person(x.id).name+" (own): "+wline(x.id,null)); });
  fit("WEEKLY OUTPUT, last month and this month (weeks start on Monday and are named by it; a task counts in the week it was finished; "+wks[0]+" is this week, still running, "+(wks[1]||"-")+" last week; weeks with nothing are left out):",wl,6,"lines (the least productive people)");
  /* per project: the busiest first */
  var w={}; A.rows.forEach(function(r){ if(months.indexOf(r.month)>=0) r.projects.forEach(function(p){ w[p]=(w[p]||0)+assetCount(r.t)+0.001; }); });
  fit("PROJECT OUTPUT BY MONTH (project totals: finished tasks and all their assets, the same months, newest first; months with nothing finished, and projects with nothing finished in them, are left out):",Object.keys(w).sort(function(a,b){ return (w[b]-w[a])||aiProjLabel(a).localeCompare(aiProjLabel(b)); }).map(function(p){
    return "- "+aiProjLabel(p)+": "+months.filter(function(m){ return A.get(m,null,p).tasks; }).map(function(m){ return m+" "+ta(A.get(m,null,p)); }).join("; ")+" | all time: "+ta(A.get("done",null,p)); }),4,"projects with less output");
  /* person x project, team, label and kind, month by month, newest first */
  var grid=function(prefix,name,total,ok){ var ls=[];
    months.forEach(function(m){ var ix=A.people(m), gs={};
      Object.keys(ix).forEach(function(id){ Object.keys(ix[id]).forEach(function(g){ if(g.indexOf(prefix)===0&&(!ok||ok(g.slice(prefix.length)))) (gs[g]=gs[g]||[]).push(id); }); });
      Object.keys(gs).sort(function(a,b){ return A.get(m,null,b).raw-A.get(m,null,a).raw; }).forEach(function(g){ var tt=A.get(m,null,g), ids=gs[g].sort(function(a,b){ return A.get(m,b,g).raw-A.get(m,a,g).raw||A.get(m,b,g).tasks-A.get(m,a,g).tasks; });
        ls.push("- "+name(g.slice(prefix.length))+", "+m+": "+total+" tasks="+tt.tasks+" assets="+tt.assets+" | "+ids.map(function(id){ return person(id).name+" tasks="+A.get(m,id,g).tasks+" assets="+st(A.get(m,id,g)); }).join("; ")); }); });
    return ls; };
  var pxp=[];
  months.forEach(function(m){ var ix=A.people(m), ids=Object.keys(ix).sort(function(a,b){ var x=A.get(m,a), y=A.get(m,b); return (y.raw-x.raw)||(y.tasks-x.tasks)||person(a).name.localeCompare(person(b).name); });
    pxp.push(aiMonthTag(m)+(m===cur?" (current month)":m===prev?" (last month)":"")+(ids.length?":":": nothing finished"));
    ids.forEach(function(id){ var ps=Object.keys(ix[id]).filter(function(g){ return g.indexOf(":")<0; });
      pxp.push("- "+person(id).name+": "+ta(A.get(m,id))+" | "+(ps.length===1?"all in "+aiProjLabel(ps[0])+(ps[0]?", of the project's ":", of the ")+A.get(m,null,ps[0]).assets+(ps[0]?"":" with no project"):ps.map(function(p){ return aiProjLabel(p)+" tasks="+A.get(m,id,p).tasks+" assets="+st(A.get(m,id,p))+" of "+A.get(m,null,p).assets; }).join("; "))); }); });
  fit("MONTHLY OUTPUT BY PERSON x PROJECT (each line is one person's own month: their finished tasks and the assets credited to them, then by project, \"of N\" = the whole project's assets that month; newest month first; nobody is listed in a month they finished nothing in):",pxp,8,"lines (the oldest months)");
  fit("TEAM PEOPLE BY MONTH (on each team's tasks: the team total, then each person's own share; newest month first):",grid("team:",aiTeamName,"team total",function(x){ return act[x]; }),9,"lines (the oldest months)");
  var labelled=A.rows.some(function(r){ return r.labels.length&&months.indexOf(r.month)>=0; });
  if(labelled) fit("LABEL OUTPUT BY MONTH (finished tasks carrying the label: the label total, then each person's own share; newest month first):",grid("label:",aiLabelName,"label total"),10,"lines (the oldest months)");
  else push("LABEL OUTPUT BY MONTH: no task finished in these months carries a label.");
  var inWin=A.rows.filter(function(r){ return months.indexOf(r.month)>=0; }), kinded=inWin.filter(function(r){ return r.kind; }).length;
  if(kinded) fit("KIND OUTPUT BY MONTH (the kind of work chosen on the task, set on "+kinded+" of the "+inWin.length+" tasks finished in these months; the others have none and are not counted here, and titles are not read for it: the kind total, then each person's own share; newest month first):",grid("kind:",aiKindName,"kind total").filter(function(l){ return l.indexOf("- (kind not set)")!==0; }),11,"lines (the oldest months)");
  else push("KIND OUTPUT BY MONTH: no task finished in these months has its kind of work chosen, so output by kind is not known (titles are not read for it).");
  return secs;
}
/* the output sections in a room of their own (the snapshot packs them with its other sections, aiContext) */
function aiOutputLines(room){ return aiPack(aiOutputSections(),room); }
/* one figure as the snapshot writes it: assets marked * when part of them is an estimate */
function aiSt(g){ return g.assets+(g.est?"*":""); }
function aiTa(g){ return "tasks="+g.tasks+" assets="+aiSt(g); }
/* this year so far and its quarters (those with nothing left out), and last year's total; null when both years are empty */
function aiYearLine(A,id,g){ var yr=TODAY.getFullYear(), qs=[1,2,3,4].slice(0,Math.floor(TODAY.getMonth()/3)+1), y=A.get("Y"+yr,id,g), ly=A.get("Y"+(yr-1),id,g);
  if(!y.tasks&&!y.raw&&!ly.tasks&&!ly.raw) return null;
  var qq=qs.filter(function(q){ var x=A.get(yr+"-Q"+q,id,g); return x.tasks||x.raw; });
  return yr+" so far "+aiTa(y)+(qq.length?" ("+qq.map(function(q){ return "Q"+q+" "+aiTa(A.get(yr+"-Q"+q,id,g)); }).join("; ")+")":"")+" | "+(yr-1)+" "+(ly.tasks||ly.raw?aiTa(ly):"nothing"); }
/* the weeks of the weekly table, this week first, back to the one the 1st of last month is in */
function aiWeeks(){ var w0=aiWeekFrom(), wks=[], wd=new Date(TODAY); for(var wk=aiWeekOf(wd);wk>=w0;){ wks.push(wk); wd.setDate(wd.getDate()-7); wk=aiWeekOf(wd); } return wks; }
function aiWeekLine(A,wks,id,g){ var ws=wks.filter(function(k){ var x=A.get("W"+k,id,g); return x.tasks||x.raw; }); return ws.length?ws.map(function(k){ return k+" "+aiTa(A.get("W"+k,id,g)); }).join("; "):null; }

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
/* x appears in s as words of its own (s lower case, as aiLocalAnswer makes it) */
function aiHas(s,x){ for(var i=s.indexOf(x);i>=0;i=s.indexOf(x,i+1)){ if(!/[a-z0-9]/.test(s.charAt(i-1))&&!/[a-z0-9]/.test(s.charAt(i+x.length))) return true; } return false; }
/* ---------- what a question names: the one matcher for the snapshot's FOCUS and for the answers without a model ---------- */
/* Each list is read longest name first, and a name read is blanked, so a shorter one inside it is not read again. */
/* the teams a text names: a team's whole name, or its name without "team" / "tim" ("social media tim", "tim social
   media", "Social Media team", "SEO & ASO") */
function aiTeamsIn(s){ var c=[], out=[], seen={};
  (typeof activeTeams==="function"?activeTeams():[]).forEach(function(t){ var n=String(t.name||"").toLowerCase(), core=n.replace(/\b(?:team|tim)\b/g," ").replace(/\s+/g," ").trim(); c.push({t:t,x:n}); if(core!==n) c.push({t:t,x:core}); });
  c.sort(function(a,b){ return b.x.length-a.x.length; }).forEach(function(k){ if(seen[k.t.id]||k.x.length<3||!aiHas(s,k.x)) return; seen[k.t.id]=1; out.push(k); s=s.split(k.x).join(" "); });
  return out; }
/* the team a question names, the longest; skip: a name already read as a person's, so "Rina Output" is not the team "Output Team" */
function aiWhichTeam(s,skip){ if(skip) s=s.split(skip).join(" "); var r=aiTeamsIn(s); return r.length?r[0].t:null; }
/* the projects a text names, by their whole name, as aiLocalAnswer has always read them */
function aiProjectsIn(s){ var out=[]; PROJECTS.map(function(p){ return {p:p,x:String(p.name||"").toLowerCase()}; }).sort(function(a,b){ return b.x.length-a.x.length; }).forEach(function(k){ if(k.x.length<4||s.indexOf(k.x)<0) return; out.push(k); s=s.split(k.x).join(" "); }); return out; }
function aiLabelsIn(s){ var out=[]; (typeof allLabels==="function"?allLabels():[]).map(function(l){ return {l:l,x:String(l.name||"").toLowerCase()}; }).sort(function(a,b){ return b.x.length-a.x.length; }).forEach(function(k){ if(k.x.length<3||!aiHas(s,k.x)) return; out.push(k); s=s.split(k.x).join(" "); }); return out; }
function aiWhichLabel(s){ var r=aiLabelsIn(s); return r.length?r[0].l:null; }
/* kinds of work: only those chosen on some finished task (so a word like "video" in a question about something else
   finds nothing to count) */
function aiKindsUsed(A){ var used={}; if(A) A.rows.forEach(function(r){ if(r.kind) used[r.kind]=1; }); else TASKS.forEach(function(t){ if(aiDoneDate(t)){ var k=aiTaskKind(t); if(k) used[k]=1; } }); return used; }
function aiKindsIn(s,used){ var c=[], out=[], seen={};
  (typeof estKindList==="function"?estKindList():[]).forEach(function(k){ if(!used[k.id]) return; [k.id,String(k.name||"").split(/ or /)[0],String(k.nameId||"").split(/ atau /)[0]].forEach(function(x){ x=String(x||"").toLowerCase(); if(x.length>=3) c.push({k:k,x:x}); }); });
  c.sort(function(a,b){ return b.x.length-a.x.length; }).forEach(function(e){ if(seen[e.k.id]||!aiHas(s,e.x)) return; seen[e.k.id]=1; out.push(e); s=s.split(e.x).join(" "); });
  return out; }
function aiWhichKind(s,A){ var r=aiKindsIn(s,aiKindsUsed(A)); return r.length?r[0].k:null; }
/* the people a text names: whole names first, then first names in what is left (so "Rina Output" is not also "Rina Split") */
function aiPeopleIn(s){ var ids=Object.keys(PEOPLE).filter(function(id){ return PEOPLE[id]&&PEOPLE[id].name; }), fulls=[], firsts=[], rest=s;
  ids.forEach(function(id){ var f=PEOPLE[id].name.toLowerCase(); if(f.length>=4&&aiHas(s,f)) fulls.push(id); });
  fulls.slice().sort(function(a,b){ return PEOPLE[b].name.length-PEOPLE[a].name.length; }).forEach(function(id){ rest=rest.split(PEOPLE[id].name.toLowerCase()).join(" "); });
  ids.forEach(function(id){ if(fulls.indexOf(id)>=0) return; var fn=PEOPLE[id].name.toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g,""); if(fn.length>=3&&new RegExp("\\b"+fn+"\\b").test(rest)) firsts.push(id); });
  return {fulls:fulls,firsts:firsts,rest:rest}; }
/* Every person, team, project, label and kind of work a question names, and the period it asks about. person: the one
   person a single answer is about, as aiLocalAnswer has always read it (the viewer for "my" / "saya" / "aku", else the
   last whole name, else the first first name). People's names are blanked before teams and projects are read, so a
   person is never read as a team; a team and a project named by the same words are both kept, unless "tim" / "team" or
   "project" / "proyek" says which. used: the kinds chosen on tasks (aiKindsUsed), when the caller has them. */
function aiNamesIn(q,used){
  var s=String(q||"").toLowerCase().replace(/[?？!.,]/g," "), me=/\b(me|my|myself|saya|aku)\b/.test(s), pp=aiPeopleIn(s), rest=pp.rest;
  var ts=aiTeamsIn(rest), ps=aiProjectsIn(rest), saidT=/\b(?:tim|team)\b/.test(s), saidP=/\b(?:project|proyek|projek)\b/.test(s);
  var clash=function(t,p){ return p.x.indexOf(t.x)>=0||t.x.indexOf(p.x)>=0; };
  if(saidT&&!saidP) ps=ps.filter(function(p){ return !ts.some(function(t){ return clash(t,p); }); });
  else if(saidP&&!saidT) ts=ts.filter(function(t){ return !ps.some(function(p){ return clash(t,p); }); });
  var r2=rest; ts.concat(ps).forEach(function(k){ r2=r2.split(k.x).join(" "); });
  var ls=aiLabelsIn(r2); ls.forEach(function(k){ r2=r2.split(k.x).join(" "); });
  /* the people in the order the question names them */
  var at=function(id){ var n=PEOPLE[id].name.toLowerCase(), i=s.indexOf(n); return i>=0?i:s.search(new RegExp("\\b"+n.split(" ")[0].replace(/[^a-z0-9]/g,"")+"\\b")); };
  var ks=aiKindsIn(r2,used||aiKindsUsed()), people=pp.fulls.concat(pp.firsts).sort(function(a,b){ return at(a)-at(b); }), skip=[];
  people.forEach(function(id){ skip=skip.concat(PEOPLE[id].name.toLowerCase().split(/\s+/)); });
  return {person:me?ME:pp.fulls.length?pp.fulls[pp.fulls.length-1]:pp.firsts[0]||null, me:me, people:people,
    teams:ts.map(function(k){ return k.t; }), projects:ps.map(function(k){ return k.p; }), labels:ls.map(function(k){ return k.l; }), kinds:ks.map(function(k){ return k.k; }),
    period:aiPeriodIn(q,skip), saidTeam:saidT, saidProject:saidP};
}
/* ---------- FOCUS: every figure about what the question names, ahead of the general sections ---------- */
/* What a chat question is about, for the snapshot's FOCUS: the names in the latest question, else in the user's
   messages before it (up to three back), so "dan bulan lalu?" keeps the focus and "kalau Sari?" moves it; the period
   is the latest one asked. The viewer is in focus for "saya" / "my" only in a question about work or output. history:
   the user's messages, oldest first (the chat's own, when not given; the latest may be q itself). null: nothing named. */
var AI_FOCUS_BACK=3, AI_WORK_WORDS=/asset|\baset\b|\btasks?\b|tugas|selesai|finish|produc|produk|hasil|konten|materi|kerja|\bwork|output|deliverable/;
function aiFocusFor(q,history){
  var us=(history||(typeof AI_CHAT!=="undefined"&&AI_CHAT&&AI_CHAT.msgs?AI_CHAT.msgs.filter(function(m){ return m&&m.role==="user"; }).map(function(m){ return String(m.text||""); }):[])).slice();
  if(q==null) q=us.length?us[us.length-1]:"";
  var qs=[String(q||"")]; if(us.length&&us[us.length-1]===qs[0]) us.pop();
  qs=qs.concat(us.slice(-AI_FOCUS_BACK).reverse());
  var used=aiKindsUsed(), got=null, at=0, per=null, ns=[];
  for(var i=0;i<qs.length;i++){ var n=ns[i]=aiNamesIn(qs[i],used), ppl=n.people.slice(); if(!per&&n.period) per=n.period;
    if(n.me&&ME&&ppl.indexOf(ME)<0&&AI_WORK_WORDS.test(qs[i].toLowerCase())) ppl.unshift(ME);
    if(ppl.length||n.teams.length||n.projects.length||n.labels.length||n.kinds.length){ got={people:ppl,teams:n.teams,projects:n.projects,labels:n.labels,kinds:n.kinds}; at=i; break; } }
  if(!got) return null;
  for(var j=at+1;j<qs.length&&!per;j++) per=aiNamesIn(qs[j],used).period;
  got.period=per; got.earlier=at>0; return got;
}
/* the period a FOCUS is read in, as written in it */
function aiPeriodTag(p){ return !p?"":p.kind==="month"?p.key:p.kind==="week"?"the week of "+p.key:p.kind==="quarter"?p.key:p.key.slice(1); }
/* The FOCUS section: for each name, every figure about it, in full. A person: their totals, each month by team (and
   all their work), by project, the tasks they finished in the period asked (this month when none was), their weeks,
   their year, labels and kinds, their review outcomes for someone who may see Analytics, and their open tasks. A team:
   its months, its people and its projects and labels month by month, its weeks and year, and its tasks finished in the
   period. A project, label or kind: its months, its people month by month, its tasks finished in the period. cap: the
   characters it may take, shared fairly between the names (one that needs less leaves the rest to the others), each cut
   from its end and saying so. Returns {lines, skip}: skip, the names whose lines the general sections leave out. */
function aiFocusLines(f,A,cap,seesAn){
  var cur=aiMonthKey(TODAY), months=[], i; for(i=0;i<AI_OUT_MONTHS;i++) months.push(aiMonthShift(cur,-i));
  var ta=aiTa, tms=typeof activeTeams==="function"?activeTeams():[], act={}, wks=aiWeeks(); tms.forEach(function(x){ act[x.id]=1; });
  var per=f.period||{kind:"month",key:cur,now:true}, inPer=function(r){ return (per.kind==="month"?r.month:per.kind==="week"?r.week:per.kind==="quarter"?r.quarter:r.year)===per.key; };
  var perTag=per.kind==="month"?aiMonthTag(per.key):aiPeriodTag(per);
  var byRaw=function(m,g){ return function(a,b){ return (A.get(m,b,g).raw-A.get(m,a,g).raw)||(A.get(m,b,g).tasks-A.get(m,a,g).tasks)||person(a).name.localeCompare(person(b).name); }; };
  var done=function(keep,id){ var rs=A.rows.filter(function(r){ return inPer(r)&&keep(r)&&(!id||r.assignees.indexOf(id)>=0||r.credit.by[id]); }).sort(function(a,b){ return aiDoneDate(b.t)-aiDoneDate(a.t); }), out=["  finished in "+perTag+" ("+rs.length+(rs.length>30?", the latest 30":"")+"):"];
    rs.slice(0,30).forEach(function(r){ out.push("  - "+r.t.id+" \""+r.t.title+"\" project="+r.projects.map(aiProjLabel).join("/")+" teams="+(r.teams.filter(function(x){ return act[x]; }).map(aiTeamName).join("/")||"none")+" on "+aiDayKey(aiDoneDate(r.t))+(id?" assets="+Math.round((r.credit.by[id]||0)*10)/10+" of "+assetCount(r.t):" assets="+assetCount(r.t)+" by "+aiNames(r.assignees))); });
    if(rs.length>30) out.push("  - …"+(rs.length-30)+" more finished in "+perTag);
    return out; };
  var people=function(g,label){ return monthly(label,function(m){ var ix=A.people(m), ids=Object.keys(ix).filter(function(id){ return ix[id][g]; }).sort(byRaw(m,g));
    return ids.length?ids.map(function(id){ return person(id).name+" "+ta(A.get(m,id,g)); }).join("; "):null; }); };
  var totals=function(g,what){ return "  "+what+" totals: "+months.map(function(m){ return m+" "+ta(A.get(m,null,g)); }).join("; ")+" | all time "+ta(A.get("done",null,g)); };
  /* month lines, newest first, with a run of empty months said once ("2026-08 to 2026-06: nothing finished") */
  var monthly=function(label,fn){ var out=[], run=[]; var flush=function(){ if(run.length) out.push("  "+label+" "+run[0]+(run.length>1?" to "+run[run.length-1]:"")+": nothing finished"); run=[]; };
    months.forEach(function(m){ var t=fn(m); if(t==null){ run.push(m); return; } flush(); out.push("  "+label+" "+m+": "+t); }); flush(); return out; };
  var ents=[], skip={people:[],teams:[],projects:[],labels:[],kinds:[]}, named=[];
  (f.people||[]).forEach(function(id){ if(!PEOPLE[id]) return; var N=person(id).name, mine=teamsOf(id).filter(function(x){ return act[x]; }), L=[], t=A.get("total",id), d=A.get("done",id);
    named.push("person "+N); skip.people.push(N);
    L.push("- person "+N+(mine.length?" (member of "+mine.map(aiTeamName).join(", ")+")":" (in no team)")+": every figure is their own; \"of N\" is the whole team's or project's");
    L.push("  totals: produced="+aiSt(t)+" (all their tasks not Declined, open ones too) delivered="+aiSt(d)+" tasks finished="+d.tasks+" | by month: "+months.map(function(m){ return m+" "+ta(A.get(m,id)); }).join("; "));
    monthly("by team",function(m){ var all=A.get(m,id), on=function(x){ var g=A.get(m,id,"team:"+x.id); return g.tasks||g.raw; }, ts=tms.filter(function(x){ return mine.indexOf(x.id)>=0||on(x); });
      return !all.tasks&&!all.raw&&!ts.some(on)?null:ts.map(function(x){ return x.name+(mine.indexOf(x.id)<0?" (not a member)":"")+" "+ta(A.get(m,id,"team:"+x.id))+" of "+A.get(m,null,"team:"+x.id).assets; }).join(", ")+(ts.length?"; ":"")+"all their work "+ta(all); }).forEach(function(l){ L.push(l); });
    monthly("by project",function(m){ var ps=Object.keys(A.people(m)[id]||{}).filter(function(g){ return g.indexOf(":")<0; });
      return ps.length?ps.map(function(p){ return aiProjLabel(p)+" "+ta(A.get(m,id,p))+" of "+A.get(m,null,p).assets; }).join("; "):null; }).forEach(function(l){ L.push(l); });
    L.push("  weekly (weeks start on Monday): "+(aiWeekLine(A,wks,id,null)||"nothing finished in these weeks"));
    L.push("  year: "+(aiYearLine(A,id,null)||"nothing this year or last"));
    var groups=function(prefix,name){ var parts=[]; months.forEach(function(m){ var gs=Object.keys(A.people(m)[id]||{}).filter(function(g){ return g.indexOf(prefix)===0&&g!=="kind:"; }); if(gs.length) parts.push(m+": "+gs.map(function(g){ return name(g.slice(prefix.length))+" "+ta(A.get(m,id,g))+" of "+A.get(m,null,g).assets; }).join(", ")); }); return parts.join(" | ")||"none"; };
    L.push("  by label: "+groups("label:",aiLabelName));
    L.push("  by kind of work (chosen on the task): "+groups("kind:",aiKindName));
    if(seesAn){ var r=aiReviewOutcomes(id,exportTasks()), o=aiOnTime(id,aiWeekStarts(8)[0]), pc=function(v){ return v==null?"-":v+"%"; };
      L.push("  review outcomes="+r.outcomes+" approved="+pc(r.approvalRate)+" sent back="+pc(r.revisionRate)+" first pass="+pc(r.firstPassRate)+" | on time="+o.ok+" of "+o.n+" finished in the last 8 weeks"); }
    /* the task lists last: when room is short they give way first */
    done(function(){ return true; },id).forEach(function(l){ L.push(l); });
    var op=TASKS.filter(function(x){ return !x._draft&&!isClosed(x)&&!x.hidden&&isAssignee(x,id); }).sort(function(a,b){ return aiUrgency(a)-aiUrgency(b); });
    L.push("  open tasks ("+op.length+(op.length>20?", the 20 most urgent":"")+"):"); op.slice(0,20).forEach(function(x){ L.push("  - "+aiShortLine(x)); });
    ents.push({name:"person "+N,lines:L}); });
  (f.teams||[]).forEach(function(x){ var g="team:"+x.id, mem=teamMembers(x.id).filter(function(id){ return PEOPLE[id]&&!PEOPLE[id].stakeholder; }), L=[];
    named.push("team "+x.name); skip.teams.push(x.name);
    L.push("- team "+x.name+" ("+mem.length+" members: "+(mem.length?aiNames(mem.slice(0,15))+(mem.length>15?" +"+(mem.length-15):""):"none")+"): its tasks are those set to it or assigned to its members");
    L.push(totals(g,"team"));
    people(g,"people").forEach(function(l){ L.push(l); });
    /* the team's tasks in each project (or under each label), month by month */
    var split=function(what,of,name){ var ls=monthly(what,function(m){ var by={}; A.rows.forEach(function(r){ if(r.month!==m||r.teams.indexOf(x.id)<0) return; of(r).forEach(function(k){ var o=by[k]||(by[k]={tasks:0,raw:0}); o.tasks++; o.raw+=assetCount(r.t); }); });
      var ks=Object.keys(by).sort(function(a,b){ return by[b].raw-by[a].raw; }); return ks.length?ks.map(function(k){ return name(k)+" tasks="+by[k].tasks+" assets="+Math.round(by[k].raw); }).join("; "):null; });
      if(what==="projects"||ls.some(function(l){ return !/: nothing finished$/.test(l); })) ls.forEach(function(l){ L.push(l); }); };
    split("projects",function(r){ return r.projects; },aiProjLabel);
    split("labels",function(r){ return r.labels; },aiLabelName);
    L.push("  weekly (team totals): "+(aiWeekLine(A,wks,null,g)||"nothing finished in these weeks"));
    L.push("  year (team totals): "+(aiYearLine(A,null,g)||"nothing this year or last"));
    done(function(r){ return r.teams.indexOf(x.id)>=0; },null).forEach(function(l){ L.push(l); });
    ents.push({name:"team "+x.name,lines:L}); });
  var group=function(what,label,g,keep,key){ named.push(what+" "+label); skip[key].push(label);
    var L=["- "+what+" "+label+":",totals(g,what)].concat(people(g,"people"),done(keep,null)); ents.push({name:what+" "+label,lines:L}); };
  (f.projects||[]).forEach(function(p){ group("project",aiProjLabel(p.id),p.id,function(r){ return r.projects.indexOf(p.id)>=0; },"projects"); });
  (f.labels||[]).forEach(function(l){ group("label",l.name,"label:"+l.id,function(r){ return r.labels.indexOf(l.id)>=0; },"labels"); });
  (f.kinds||[]).forEach(function(k){ group("kind",aiKindName(k.id),"kind:"+k.id,function(r){ return r.kind===k.id; },"kinds"); });
  var head="FOCUS (from "+(f.earlier?"an earlier question, as the latest one names no one":"the question")+": "+named.join(", ")+", period "+(f.period?aiPeriodTag(f.period):"none asked, so this month for the task lists")+"). Every figure about them is here in full; answer from here first. The sections below leave out the lines that are here.";
  /* the room shared fairly: each name its share, one that needs less leaving the rest to the others */
  var NOTE=80, need=ents.map(function(e){ return e.lines.reduce(function(n,l){ return n+l.length+1; },0); }), give=need.map(function(){ return 0; }), left=cap-head.length-1, todo=ents.map(function(e,k){ return k; });
  while(todo.length&&left>0){ var share=left/todo.length, more=[]; todo.forEach(function(k){ var want=need[k]-give[k]; if(want<=share){ give[k]+=want; left-=want; } else more.push(k); });
    if(more.length===todo.length){ more.forEach(function(k){ give[k]+=share; }); left=0; } todo=more; }
  var out=[head];
  ents.forEach(function(e,k){ if(give[k]>=need[k]){ e.lines.forEach(function(l){ out.push(l); }); return; }
    var used=0, n=0; for(;n<e.lines.length;n++){ if(used+e.lines[n].length+1+NOTE>give[k]) break; used+=e.lines[n].length+1; }
    for(var j=0;j<n;j++) out.push(e.lines[j]); out.push("  …"+(e.lines.length-n)+" more lines about "+e.name+" left out, for room."); });
  return {lines:out,skip:skip};
}
/* the general sections leave out the lines the FOCUS carries: a focused person's own lines, a focused team's,
   project's, label's or kind's; lines that only mention them among others stay */
function aiFocusSkip(secs,sk){
  var pre={}, add=function(names,pats){ names.forEach(function(n){ pats.forEach(function(p){ (pre[p[0]]=pre[p[0]]||[]).push(p[1].split("%").join(n)); }); }); };
  add(sk.people,[["ASSETS BY PERSON","- %:"],["ASSETS BY PERSON","- % ("],["PERSON x TEAM","- % ("],["YEAR AND QUARTERS","- % (own)"],["WEEKLY OUTPUT","- % (own)"],["MONTHLY OUTPUT BY PERSON x PROJECT","- %:"]]);
  add(sk.teams,[["TEAM OUTPUT BY MONTH","- % ("],["YEAR AND QUARTERS","- team % ("],["WEEKLY OUTPUT","- team % ("],["TEAM PEOPLE BY MONTH","- %, "]]);
  add(sk.projects,[["PROJECT OUTPUT BY MONTH","- %:"]]);
  add(sk.labels,[["LABEL OUTPUT BY MONTH","- %, "]]);
  add(sk.kinds,[["KIND OUTPUT BY MONTH","- %, "]]);
  secs.forEach(function(x){ var ps=pre[x.name]; if(ps) x.lines=x.lines.filter(function(l){ return !ps.some(function(p){ return l.indexOf(p)===0; }); }); });
}
var AI_ORD={1:1,2:2,3:3,4:4,satu:1,pertama:1,first:1,dua:2,kedua:2,second:2,tiga:3,ketiga:3,third:3,empat:4,keempat:4,fourth:4};
/* The period a question is about: {kind: "month"|"week"|"quarter"|"year", key, now (the current one), prev (the one
   before)}, or null. A month as aiMonthIn reads it; "this week" / "minggu ini", "last week" / "minggu lalu"; "Q3",
   "kuartal 3", "kuartal ketiga", "third quarter", "this quarter" / "kuartal ini", "last quarter" / "kuartal lalu"
   (a quarter without a year: the latest one not in the future); "this year" / "tahun ini", "last year" / "tahun
   lalu", or a year by itself ("2025"). skip: words not to read as a month (the person's name). */
function aiPeriodIn(q,skip){
  var s=" "+String(q||"").toLowerCase().replace(/[?!.,;:()"']/g," ").replace(/\s+/g," ")+" ", m, y=TODAY.getFullYear(), cq=Math.floor(TODAY.getMonth()/3)+1, d;
  if(/\b(?:this|current) week\b|\b(?:minggu|pekan) ini\b/.test(s)) return {kind:"week",key:aiWeekOf(TODAY),now:true};
  if(/\b(?:last|previous|past) week\b|\b(?:minggu|pekan) (?:lalu|kemarin|sebelumnya)\b|\bseminggu (?:yang )?lalu\b/.test(s)){ d=new Date(TODAY); d.setDate(d.getDate()-7); return {kind:"week",key:aiWeekOf(d),prev:true}; }
  var mo=aiMonthIn(q,skip); if(mo) return {kind:"month",key:mo,now:mo===aiMonthKey(TODAY),prev:mo===aiMonthShift(aiMonthKey(TODAY),-1)};
  var yr=(m=/\b(20\d\d)\b/.exec(s))?+m[1]:0, qn=0;
  if((m=/\bq([1-4])\b/.exec(s))) qn=+m[1];
  else if((m=/\b(?:kuartal|triwulan|quarter) (?:ke-?)?([1-4]|satu|pertama|dua|kedua|tiga|ketiga|empat|keempat)\b/.exec(s))||(m=/\b(first|second|third|fourth) quarter\b/.exec(s))) qn=AI_ORD[m[1]];
  else if(/\b(?:this|current) quarter\b|\b(?:kuartal|triwulan) ini\b/.test(s)){ qn=cq; yr=y; }
  else if(/\b(?:last|previous) quarter\b|\b(?:kuartal|triwulan) (?:lalu|sebelumnya)\b/.test(s)){ qn=cq===1?4:cq-1; yr=cq===1?y-1:y; }
  if(qn){ yr=yr||(qn>cq?y-1:y); return {kind:"quarter",key:yr+"-Q"+qn,now:yr===y&&qn===cq}; }
  if(/\b(?:this|current) year\b|\btahun ini\b|\bytd\b|\byear to date\b/.test(s)) return {kind:"year",key:"Y"+y,now:true};
  if(/\b(?:last|previous) year\b|\btahun (?:lalu|kemarin|sebelumnya)\b/.test(s)) return {kind:"year",key:"Y"+(y-1),prev:true};
  if(yr) return {kind:"year",key:"Y"+yr,now:yr===y};
  return null;
}
/* Questions about output: how many assets someone has or produced, how many tasks they finished, in a month, a week, a
   quarter or a year, in a project, a team, under a label or of a kind; who produced or finished the most; what a team,
   a project or a period produced. null when the question is about something else. All of it is aiOutput's count.
   o: {idL, L, who, pj, team} from aiLocalAnswer (its language and the person, project and team it found). */
function aiLocalOutput(q,s,o){
  var L=o.L, idl=o.idL;
  var aQ=/asset|\baset\b|deliverable|output|produc|produk|hasilkan|dihasilkan|\bhasil\b|\bkonten\b|\bmateri\b/.test(s),
      tQ=/\btasks?\b|\btugas\b|pekerjaan|kerjaan/.test(s)&&/finish|complet|\bdone\b|\bclosed?\b|selesai|rampung|tuntas|\bberes\b/.test(s),
      top=/\bmost\b|\btop\b|terbanyak|paling banyak|paling produktif|tertinggi|ranking|peringkat|\bbest\b/.test(s),
      cnt=/how many|how much|\bcount\b|number of|berapa|jumlah|\btotal\b/.test(s);
  if(!aQ&&!tQ) return null;
  /* the names and the period as the shared matcher read them (aiNamesIn, also behind the snapshot's FOCUS) */
  var A=aiOutput(), nm=o.names||aiNamesIn(q,aiKindsUsed(A)), who=top?null:o.who, pj=o.pj, tm=o.team||null, lb=nm.labels[0]||null, kd=nm.kinds[0]||null;
  if(!who&&!top&&/\bi\b|\bmine\b/.test(s)) who=ME;
  /* a team named in a question also named by a project: "tim" / "team" said, it is the team; otherwise the project */
  if(tm&&pj){ if(/\b(?:tim|team)\b/.test(s)) pj=null; else tm=null; }
  var per=nm.period;
  /* "how many tasks were finished this week", for nobody in particular, is the weekly throughput (aiLocalInsight) */
  if(per&&per.kind==="week"&&!who&&!pj&&!tm&&!lb&&!kd&&!aQ) return null;
  if(!(who||pj||tm||lb||kd||per||top||(tQ&&cnt))) return null;
  var cur=aiMonthKey(TODAY), prev=aiMonthShift(cur,-1), est=false;
  var inPer=function(r){ return !per||(per.kind==="month"?r.month:per.kind==="week"?r.week:per.kind==="quarter"?r.quarter:r.year)===per.key; };
  var inGrp=function(r){ return (!pj||r.projects.indexOf(pj.id)>=0)&&(!tm||r.teams.indexOf(tm.id)>=0)&&(!lb||r.labels.indexOf(lb.id)>=0)&&(!kd||r.kind===kd.id); };
  var keep=function(r){ return inPer(r)&&inGrp(r); };
  var when=function(){ if(!per) return L(" in total"," secara total"); var k=per.key;
    if(per.kind==="month") return L(" in "," pada ")+aiMonthName(k,idl)+(per.now?L(" (this month)"," (bulan ini)"):per.prev?L(" (last month)"," (bulan lalu)"):"");
    if(per.kind==="week") return per.now?L(" this week (from "+k+")"," minggu ini (sejak "+k+")"):L(" last week (from "+k+")"," minggu lalu (sejak "+k+")");
    if(per.kind==="quarter") return L(" in "," pada ")+k.slice(5)+" "+k.slice(0,4)+(per.now?L(" (this quarter, so far)"," (kuartal ini, sejauh ini)"):"");
    return per.now?L(" in "+k.slice(1)+" so far"," sepanjang "+k.slice(1)+" sejauh ini"):L(" in "," pada ")+k.slice(1); };
  var inG=(pj?L(" in **"+pj.name+"**"," di **"+pj.name+"**"):"")+(tm?L(/\bteam$/i.test(tm.name)?" on **"+tm.name+"**'s tasks":" on the **"+tm.name+"** team's tasks"," di tim **"+tm.name+"**"):"")+(lb?L(" with the label **"+lb.name+"**"," berlabel **"+lb.name+"**"):"")+(kd?L(" of the kind **"+aiKindName(kd.id)+"**"," jenis **"+aiKindName(kd.id,true)+"**"):"");
  var fa=function(g){ if(g.est) est=true; return g.assets+(g.est?"*":""); };
  var na=function(g){ return fa(g)+L(g.assets===1?" asset":" assets"," aset"); }, nt=function(g){ return g.tasks+L(g.tasks===1?" finished task":" finished tasks"," task selesai"); };
  var foot=function(){ return (est?"\n\n* "+L("Partly estimated: shared among the assignees, because nobody typed each person's count or uploaded the versions.","Sebagian perkiraan: dibagi ke para assignee, karena belum ada yang mengisi jumlah per orang atau mengunggah versinya."):"")
    +(tm?"\n\n"+L("A team's tasks are those set to the team or assigned to one of its members, as the Teams page counts them.","Task tim adalah task yang diset ke tim itu atau dikerjakan anggotanya, seperti halaman Teams menghitungnya."):"")
    +"\n\n_"+L("Counted as the person pages, the reports and Smart Scoring count them: a task counts once finished, in the month it was finished.","Dihitung seperti halaman anggota, laporan, dan Smart Scoring: task dihitung setelah selesai, pada bulan selesainya.")+"_"; };
  /* "in total" for a project or a team, or for nobody in particular: every task not Declined, open ones too; otherwise finished work */
  var produced=!per&&!lb&&!kd;
  var ranked=function(byTasks){ return Object.keys(PEOPLE).filter(function(id){ return PEOPLE[id]&&!PEOPLE[id].stakeholder; }).map(function(id){ return {id:id,g:produced&&!byTasks?A.get("total",id,pj?pj.id:tm?"team:"+tm.id:null):A.sum(keep,id)}; })
    .filter(function(r){ return byTasks?r.g.tasks:r.g.raw; }).sort(function(a,b){ return byTasks?(b.g.tasks-a.g.tasks)||(b.g.raw-a.g.raw):(b.g.raw-a.g.raw)||(b.g.tasks-a.g.tasks); }); };
  /* who produced or finished the most */
  if(top){ var byT=tQ&&!aQ, rs=ranked(byT), wn=when();
    if(!rs.length) return byT?L("No one finished a task"+inG+wn+".","Belum ada yang menyelesaikan task"+inG+wn+"."):L("No assets were produced"+inG+wn+".","Belum ada aset yang dihasilkan"+inG+wn+".");
    return (byT?L("Most tasks finished"+inG+wn+":","Task selesai terbanyak"+inG+wn+":"):L("Most assets produced"+inG+wn+":","Aset terbanyak yang dihasilkan"+inG+wn+":"))+"\n\n"
      + rs.slice(0,5).map(function(r,i){ return (i+1)+". **"+person(r.id).name+"** — "+(byT?nt(r.g)+", "+na(r.g):na(r.g)+(produced?"":", "+nt(r.g))); }).join("\n")+foot(); }
  /* one person */
  if(who){ var nm="**"+person(who).name+"**", fn=String(person(who).name||"").split(" ")[0];
    if(!produced){ var g=A.sum(keep,who), list=A.rows.filter(function(r){ return keep(r)&&(r.assignees.indexOf(who)>=0||r.credit.by[who]); }), wn2=when();
      var head=tQ&&!aQ?L(nm+" finished **"+g.tasks+"** task(s)"+inG+wn2+", with **"+fa(g)+"** asset(s) credited to them.",nm+" menyelesaikan **"+g.tasks+"** task"+inG+wn2+", dengan **"+fa(g)+"** aset.")
                      :L(nm+" produced **"+fa(g)+"** asset(s)"+inG+wn2+", from **"+g.tasks+"** finished task(s).",nm+" menghasilkan **"+fa(g)+"** aset"+inG+wn2+", dari **"+g.tasks+"** task selesai"+(tm?" milik tim itu":"")+".");
      /* in a team: the team's own total, and all of their work in the same period (what they produced as a member) */
      if(tm){ var tt=A.sum(keep), all=A.sum(inPer,who), same=all.tasks===g.tasks&&all.raw===g.raw;
        head+=" "+L("The team's total"+wn2+": "+na(tt)+" from "+tt.tasks+" task(s). All of "+fn+"'s work"+wn2+": "+na(all)+" from "+all.tasks+" task(s)"+(same?" (the same: all of it is the team's)":"")+".",
                    "Total tim"+wn2+": "+na(tt)+" dari "+tt.tasks+" task. Seluruh pekerjaan "+fn+wn2+": "+na(all)+" dari "+all.tasks+" task"+(same?" (sama: semuanya task tim itu)":"")+"."); }
      var ps={}; list.forEach(function(r){ r.projects.forEach(function(p){ ps[p]=1; }); }); ps=Object.keys(ps);
      if(!pj&&per&&per.kind==="month"&&ps.length>1) head+="\n\n"+L("By project:","Per project:")+"\n"+ps.map(function(p){ var x=A.sum(function(r){ return keep(r)&&r.projects.indexOf(p)>=0; },who); return "- "+aiProjLabel(p)+": "+na(x)+", "+nt(x); }).join("\n");
      if(list.length) head+="\n\n"+list.slice(0,8).map(function(r){ var mine=Math.round((r.credit.by[who]||0)*10)/10; return "- **"+r.t.id+"** "+r.t.title+" — "+mine+L(" of "," dari ")+assetCount(r.t)+L(" assets"," aset"); }).join("\n")+(list.length>8?"\n- "+L("…and "+(list.length-8)+" more","…dan "+(list.length-8)+" lainnya"):"");
      return head+foot(); }
    var gk=pj?pj.id:tm?"team:"+tm.id:null, t=A.get("total",who,gk), d=A.get("done",who,gk), a=A.get(cur,who,gk), b=A.get(prev,who,gk);
    return (tQ&&!aQ?L(nm+" has finished **"+d.tasks+"** task(s)"+inG+": "+a.tasks+" this month, "+b.tasks+" last month, with "+na(d)+" delivered.",nm+" telah menyelesaikan **"+d.tasks+"** task"+inG+": "+a.tasks+" bulan ini, "+b.tasks+" bulan lalu, dengan "+na(d)+" terkirim.")
                   :L(nm+" has produced **"+fa(t)+"** asset(s)"+inG+" in total: "+fa(d)+" delivered from finished tasks, "+fa(a)+" this month, "+fa(b)+" last month. Finished tasks: "+d.tasks+".",nm+" telah menghasilkan **"+fa(t)+"** aset"+inG+" secara total: "+fa(d)+" terkirim dari task selesai, "+fa(a)+" bulan ini, "+fa(b)+" bulan lalu. Task selesai: "+d.tasks+"."))+foot(); }
  /* a team, a project, a label, a kind, a period, or the workspace */
  var g2=A.sum(keep), wn3=when(), byT2=tQ&&!aQ, rs2=Object.keys(PEOPLE).filter(function(id){ return PEOPLE[id]&&!PEOPLE[id].stakeholder; }).map(function(id){ return {id:id,g:A.sum(keep,id)}; })
    .filter(function(r){ return byT2?r.g.tasks:r.g.raw; }).sort(function(a,b){ return byT2?(b.g.tasks-a.g.tasks)||(b.g.raw-a.g.raw):(b.g.raw-a.g.raw)||(b.g.tasks-a.g.tasks); });
  return L("**"+g2.tasks+"** task(s) finished"+inG+wn3+", with **"+g2.assets+"** asset(s).","**"+g2.tasks+"** task selesai"+inG+wn3+", dengan **"+g2.assets+"** aset.")
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
