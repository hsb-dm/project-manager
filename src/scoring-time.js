<script>
/* ============================================================
   TIME WORKED ON A TASK, DAY BY DAY (Oct 2026)
   Smart Scoring's time log (docs/SMART-SCORING.md, Phase 3a; the server is server/scoring-time.js). While Smart
   Scoring is on with its Effort Hours, a task's Actual is no longer a number anyone types: the people assigned to the
   task log the time they worked — a day, how long (90 or 1:30), work, revision or blocked, and if they like the start
   and end and a note — and Actual is the work and revision logged, worked out by the server to the nearest quarter
   hour. Blocked time (waiting on someone or something) is logged and shown, and kept out of Actual. Everyone who sees
   the task sees its log; each person changes and deletes their own entries; whoever may correct scores
   (scoring_edit_task) changes anyone's, with a reason. The Actual of before is there as an entry "from before the
   time log (not verified)".
   In the task: the Actual box of the Effort block becomes the total, read-only, with a "Log time" button that opens
   the log (the Effort block itself is src/enhance.js's; its Actual is swapped here, and left alone when the task panel
   already shows it). For Smart Scoring's task panel: scoringTimeRowHtml(tk), a line with the totals and the button,
   kept current in place; scoringTimeActualHtml(tk), the read-only Actual; scoringTimeOpen(taskId), the log.
   Nothing blinks: what was loaded is shown at once and brought up to date in place. While Smart Scoring or its Effort
   Hours is off, nothing here shows and Actual is typed exactly as before. In the offline demo the log is kept in the
   page, with the same rules.
   ============================================================ */
var SCR_TIME={cache:{},loading:{},errors:{},open:null,edit:null,del:null,kind:"work",date:null,busy:false,demo:{}};
var SCR_TIME_KINDS=[["work","Work"],["revision","Revision"],["blocked","Blocked"]];
var SCR_TIME_OFF="Time logging is off. It is on while Smart Scoring and its Effort Hours are turned on (Settings → Smart Scoring).";
function scoringTimeMode(){ return typeof scoringModuleOn==="function"&&scoringModuleOn("hours"); }
/* minutes → hours to the nearest quarter, never 0 once a minute is logged (the server's rule) */
function scoringTimeActual(min){ min=Math.max(0,Math.round(+min||0)); return min?Math.max(0.25,Math.round(min/15)/4):0; }
function scoringTimeH(h){ return String(Math.round((+h||0)*100)/100); }
function scoringTimeLen(min){ min=Math.max(0,Math.round(+min||0)); var h=Math.floor(min/60), m=min%60; return h&&m?fmt(tr("{h} h {m} min"),{h:h,m:m}):h?fmt(tr("{h} h"),{h:h}):fmt(tr("{m} min"),{m:m}); }
function scoringTimeHm(min){ min=Math.max(0,Math.round(+min||0)); var m=min%60; return Math.floor(min/60)+":"+(m<10?"0":"")+m; }
/* what is typed: 90 (minutes), 1:30, 1.5h, 1h30, 1h 30m, 45m — null when nothing, NaN when it is none of those */
function scoringTimeParse(s){
  s=String(s==null?"":s).trim().toLowerCase().replace(/,/g,"."); if(!s) return null; var m;
  if((m=/^(\d{1,2}):([0-5]\d)$/.exec(s))) return +m[1]*60+(+m[2]);
  if((m=/^(\d+(?:\.\d+)?)\s*(?:h|j|jam|hours?)$/.exec(s))) return Math.round(+m[1]*60);
  if((m=/^(\d+)\s*(?:h|j|jam)\s*(\d+)\s*(?:m|min|mins|mnt|menit)?$/.exec(s))) return +m[1]*60+(+m[2]);
  if((m=/^(\d+)\s*(?:m|min|mins|minutes?|mnt|menit)?$/.exec(s))) return +m[1];
  return NaN;
}
function scoringTimePad(n){ return (n<10?"0":"")+n; }
function scoringTimeIso(d){ return d.getFullYear()+"-"+scoringTimePad(d.getMonth()+1)+"-"+scoringTimePad(d.getDate()); }
function scoringTimeToday(){ return scoringTimeIso(new Date()); }
function scoringTimeDaysAgo(n){ var d=new Date(); d.setDate(d.getDate()-n); return scoringTimeIso(d); }
function scoringTimeDay(iso){
  var p=String(iso||"").split("-"); if(p.length!==3) return esc(iso);
  if(iso===scoringTimeToday()) return tr("Today"); if(iso===scoringTimeDaysAgo(1)) return tr("Yesterday");
  var d=new Date(+p[0],+p[1]-1,+p[2]), o={weekday:"short",day:"numeric",month:"short"}; if(d.getFullYear()!==new Date().getFullYear()) o.year="numeric";
  try{ return esc(d.toLocaleDateString(UI_LANG==="id"?"id-ID":"en-GB",o)); }catch(e){ return esc(iso); }
}
/* the server's sentence in the reader's language; a bracketed detail (times, a day) is kept as it is */
function scoringTimeErr(e){ var msg=String(e&&e.message||e||""), m=/^([\s\S]*?)(\s*\([^()]*\))?$/.exec(msg); return tr(m[1])+(m[2]||""); }
function scoringTimeKindLabel(k){ for(var i=0;i<SCR_TIME_KINDS.length;i++) if(SCR_TIME_KINDS[i][0]===k) return tr(SCR_TIME_KINDS[i][1]); return esc(k); }

/* ---------- the routes (and the same rules kept in the page in the offline demo) ---------- */
function scoringTimeApi(method,id,entryId,body,reason){
  if(!API.on) return scoringTimeDemo(method,id,entryId,body,reason);
  var p="/api/tasks/"+encodeURIComponent(id)+"/time"+(entryId?"/"+encodeURIComponent(entryId):"")+(method==="DELETE"&&reason?"?reason="+encodeURIComponent(reason):"");
  return apiFetch(method,p,method==="GET"||method==="DELETE"?undefined:body);
}
function scoringTimeLoad(id){
  if(SCR_TIME.loading[id]) return SCR_TIME.loading[id];
  var p=scoringTimeApi("GET",id).then(function(r){ delete SCR_TIME.loading[id]; delete SCR_TIME.errors[id]; SCR_TIME.cache[id]=r; scoringTimeDrawAll(id); return r; },
    function(e){ delete SCR_TIME.loading[id]; SCR_TIME.errors[id]=e; scoringTimeDrawAll(id); throw e; });
  SCR_TIME.loading[id]=p; return p;
}
/* the task changed since its log was loaded (someone logged time in another tab): load it again, quietly */
function scoringTimeFreshen(tk){ var c=SCR_TIME.cache[tk.id]; if(!c||(tk.updatedAt&&c.updatedAt&&tk.updatedAt>c.updatedAt)) scoringTimeLoad(tk.id).catch(function(){}); }
/* an answer to a change: the log and the task's Actual shown at once; the task fetched again, so everything else
   about it is current too, and the page drawn once with it (it was drawn before the fetch and again after) */
function scoringTimeTook(id,r){
  SCR_TIME.cache[id]=r; var tk=task(id);
  if(tk){ var m=taskMeta(tk); if(+r.actualEffort>0) m.actualEffort=+r.actualEffort; else delete m.actualEffort; }
  scoringTimeDrawAll(id);
  if(!(API.on&&tk)) return scoringTimeRedraw();
  apiFetch("GET","/api/tasks/"+encodeURIComponent(id)).then(function(d){ var now=task(id); if(now&&!now._draft) replaceInto(now,hTask(d)); },function(){}).then(scoringTimeRedraw);
}
function scoringTimeRedraw(){ requestRefresh({bg:true}); }

/* ---------- for the Effort block and the task panel ---------- */
/* the read-only Actual with its button (the drawer's Effort block; the panel may use it too) */
function scoringTimeActualHtml(tk){
  if(!tk||!scoringTimeMode()) return "";
  var act=+taskMeta(tk).actualEffort||0, est=+tk.effort||0, log=canI.logTime(tk);
  if(SCR_TIME.open===tk.id) scoringTimeFreshen(tk);
  return '<span class="scr-time-actual'+(est&&act>est?' over':'')+'">'+tr("Actual")+' <b>'+scoringTimeH(act)+'</b> h<button class="btn xs scr-time-btn" onclick="scoringTimeOpen('+jsq(tk.id)+')">'+(I.clock||"")+tr(log?"Log time":"Time log")+'</button></span>';
}
/* one line for the panel's hours row: the totals and the button, kept current in place */
function scoringTimeRowHtml(tk){
  if(!tk||!scoringTimeMode()) return "";
  scoringTimeFreshen(tk);
  return '<div class="scr-time-row" data-task="'+attr(tk.id)+'">'+scoringTimeRowInner(tk)+'</div>';
}
function scoringTimeRowInner(tk){
  var c=SCR_TIME.cache[tk.id], act=c?c.actualEffort:(+taskMeta(tk).actualEffort||0), m=c&&c.totals.minutes, legacy=c&&c.entries.some(function(e){ return e.source==="legacy"; });
  return '<span>'+tr("Logged")+' <b>'+scoringTimeH(act)+' h</b></span>'
    +(m&&m.revision?'<span>'+tr("Revision")+' '+scoringTimeLen(m.revision)+'</span>':'')
    +(m&&m.blocked?'<span>'+tr("Blocked")+' '+scoringTimeLen(m.blocked)+' <span class="scr-time-hint">('+tr("not in Actual")+')</span></span>':'')
    +(legacy?'<span class="scr-time-legacy">'+tr("includes time from before the time log (not verified)")+'</span>':'')
    +'<button class="btn xs scr-time-btn" onclick="scoringTimeOpen('+jsq(tk.id)+')">'+(I.clock||"")+tr(canI.logTime(tk)?"Log time":"Time log")+'</button>';
}
/* the Effort block (src/enhance.js effortHtml): its Actual box becomes the total and the button — unless what is
   drawn already shows it (the task panel calling scoringTimeActualHtml itself) */
function scoringTimeSwap(h,tk){
  if(h.indexOf("scr-time-actual")>=0) return h;
  var box=document.createElement("div"); box.innerHTML=h;
  var spans=box.querySelectorAll(".effort > span"), lbl=tr("Actual"), hit=null;
  for(var i=0;i<spans.length&&!hit;i++){ var sp=spans[i], inp=sp.querySelector("input");
    if(inp?/actualEffort/.test(inp.getAttribute("onchange")||""):(!sp.classList.contains("hint")&&sp.textContent.trim().indexOf(lbl)===0)) hit=sp; }
  if(!hit) return h;
  hit.insertAdjacentHTML("afterend",scoringTimeActualHtml(tk)); hit.parentNode.removeChild(hit);
  return box.innerHTML;
}
(function(){ if(typeof effortHtml!=="function") return; var base=effortHtml; effortHtml=function(tk){ var h=base.apply(this,arguments); if(!tk||!scoringTimeMode()) return h; try{ return scoringTimeSwap(h,tk); }catch(e){ return h; } }; })();

/* ---------- the log ---------- */
function scoringTimeOpen(id){
  var tk=task(id); if(!tk) return; if(!scoringTimeMode()) return toast(SCR_TIME_OFF,"bad");
  SCR_TIME.open=id; SCR_TIME.edit=null; SCR_TIME.del=null; SCR_TIME.kind="work"; SCR_TIME.date=null;
  var c=SCR_TIME.cache[id];
  openModal(tr("Time log")+" · "+id,'<div class="scr-time" data-task="'+attr(id)+'"><div class="scr-time-sum" id="scrTimeSum">'+scoringTimeSumHtml(tk,c)+'</div><div class="scr-time-list" id="scrTimeList">'+scoringTimeListHtml(tk,c)+'</div><div class="scr-time-msg" id="scrTimeMsg" role="status" aria-live="polite"></div><div class="scr-time-form" id="scrTimeForm" data-mode="'+attr(scoringTimeFormMode(tk,c))+'">'+scoringTimeFormHtml(tk,c,null)+'</div></div>','<button class="btn" onclick="closeModal()">'+tr("Close")+'</button>');
  scoringTimeLoad(id).catch(function(){});
}
function scoringTimeIsOpen(id){ var w=document.getElementById("modalWrap"), box=document.querySelector("#modal .scr-time"); return !!(w&&w.classList.contains("open")&&box&&box.getAttribute("data-task")===id); }
function scoringTimeDrawAll(id){
  var tk=task(id); if(!tk) return; var c=SCR_TIME.cache[id];
  document.querySelectorAll(".scr-time-row").forEach(function(el){ if(el.getAttribute("data-task")===id) el.innerHTML=scoringTimeRowInner(tk); });
  if(!scoringTimeIsOpen(id)) return;
  var s=document.getElementById("scrTimeSum"), l=document.getElementById("scrTimeList"), f=document.getElementById("scrTimeForm");
  var why=document.getElementById("scrTimeDelWhy"), typed=why?why.value:"";
  if(s) s.innerHTML=scoringTimeSumHtml(tk,c); if(l) l.innerHTML=scoringTimeListHtml(tk,c);
  why=document.getElementById("scrTimeDelWhy"); if(why&&typed) why.value=typed;
  /* the form only when what it should be changed (being typed in, it is left alone) */
  if(f&&f.getAttribute("data-mode")!==scoringTimeFormMode(tk,c)) scoringTimeFormRedraw();
}
function scoringTimeEntry(id,eid){ var c=SCR_TIME.cache[id]; return c&&c.entries.filter(function(e){ return e.id===eid; })[0]||null; }
function scoringTimeSumHtml(tk,c){
  var act=c?c.actualEffort:(+taskMeta(tk).actualEffort||0), t=c&&c.totals, ppl=t?Object.keys(t.byPerson||{}):[];
  return '<span class="scr-time-big"><b>'+scoringTimeH(act)+'</b> h</span><span>'+tr("Actual")+'</span>'
    +(t?'<span class="scr-time-parts">'+tr("Work")+' '+scoringTimeLen(t.minutes.work)+(t.minutes.revision?' · '+tr("Revision")+' '+scoringTimeLen(t.minutes.revision):'')+(t.minutes.blocked?' · '+tr("Blocked")+' '+scoringTimeLen(t.minutes.blocked):'')+'</span>':'')
    +(ppl.length>1?'<span class="scr-time-people">'+ppl.map(function(p){ return '<span>'+esc(person(p).name)+' <b>'+scoringTimeH(t.byPerson[p].actualHours)+' h</b></span>'; }).join("")+'</span>':'')
    +'<span class="scr-time-hint">'+tr("Actual is the work and revision logged. Blocked time is kept apart and not counted in Actual.")+'</span>';
}
function scoringTimeListHtml(tk,c){
  if(!c){ var err=SCR_TIME.errors[tk.id]; return '<div class="scr-time-empty">'+(err?esc(tr("Could not load the time log"))+': '+esc(scoringTimeErr(err)):tr("Loading…"))+'</div>'; }
  if(!c.entries.length){ var any=c.totals.minutes.work+c.totals.minutes.revision+c.totals.minutes.blocked; return '<div class="scr-time-empty">'+tr(any?"Only the totals are shown here.":"No time logged yet.")+'</div>'; }
  return c.entries.map(function(e){ return scoringTimeEntryHtml(tk,c,e); }).join("");
}
/* what this person may do with an entry (the server decides; this only shows the right buttons) */
function scoringTimeMay(c,e){ var own=e.userId===ME&&!!c.can.log, inWin=!c.window||e.workDate>=c.window.earliest; return { edit:e.source==="legacy"?!!c.can.correct:((own&&inWin)||!!c.can.correct), del:(own&&inWin)||!!c.can.correct, reason:!own }; }
function scoringTimeEntryHtml(tk,c,e){
  var may=scoringTimeMay(c,e), q=jsq(e.id), flags='';
  if(e.source==="legacy") flags+='<span class="scr-time-legacy">'+tr("from before the time log (not verified)")+'</span>';
  else if(e.verified) flags+='<span class="scr-time-flag">'+tr("verified")+'</span>';
  if(e.editedBy) flags+='<span class="scr-time-flag">'+(e.editedBy===e.userId?tr("edited"):tr("corrected by")+' '+esc(person(e.editedBy).name))+'</span>';
  var acts=(may.edit?'<button class="iconbtn scr-time-ib" title="'+attr(tr("Edit"))+'" aria-label="'+attr(tr("Edit"))+'" onclick="scoringTimeEditStart('+q+')">'+I.edit+'</button>':'')
    +(may.del?'<button class="iconbtn scr-time-ib" title="'+attr(tr("Delete"))+'" aria-label="'+attr(tr("Delete"))+'" onclick="scoringTimeDelAsk('+q+')">'+I.trash+'</button>':'');
  var del=SCR_TIME.del===e.id?'<div class="scr-time-del"><span>'+tr("Delete this entry?")+'</span>'+(may.reason?'<input id="scrTimeDelWhy" maxlength="1000" placeholder="'+attr(tr("Reason for the correction"))+'" aria-label="'+attr(tr("Reason for the correction"))+'">':'')+'<button class="btn xs danger" onclick="scoringTimeDelGo('+q+')">'+tr("Delete")+'</button><button class="btn xs" onclick="scoringTimeDelAsk(null)">'+tr("Cancel")+'</button></div>':'';
  return '<div class="scr-time-entry'+(SCR_TIME.edit===e.id?' is-edit':'')+'" data-id="'+attr(e.id)+'"><span class="scr-time-line"><span class="scr-time-who">'+esc(person(e.userId).name)+'</span><span class="scr-time-date">'+scoringTimeDay(e.workDate)+(e.startedAt?' · '+esc(e.startedAt)+(e.endedAt?'–'+esc(e.endedAt):''):'')+'</span><span class="scr-time-k k-'+attr(e.kind)+'">'+scoringTimeKindLabel(e.kind)+'</span>'+flags+'</span><b class="scr-time-len">'+scoringTimeLen(e.minutes)+'</b><span class="scr-time-acts">'+acts+'</span>'+(e.note?'<span class="scr-time-note">'+esc(e.note)+'</span>':'')+del+'</div>';
}
/* the form: adding (the people assigned), changing an entry, or nothing */
function scoringTimeFormMode(tk,c){ return SCR_TIME.edit?"edit:"+SCR_TIME.edit:(c?c.can.log:canI.logTime(tk))?"add":"none"; }
function scoringTimeFormHtml(tk,c,e){
  var mode=scoringTimeFormMode(tk,c);
  if(mode==="none") return '<p class="scr-time-hint">'+tr("Only the people assigned to this task log time on it.")+'</p>';
  var today=scoringTimeToday(), correct=c?!!c.can.correct:canI.scoringEditTask(tk), min=correct?"":scoringTimeDaysAgo(60), day=e?e.workDate:(SCR_TIME.date||today), reason=e&&scoringTimeMay(c||{can:{}},e).reason, kind=e?e.kind:SCR_TIME.kind, enter=' onkeydown="if(event.key===\'Enter\'){event.preventDefault();scoringTimeSubmit()}"';
  SCR_TIME.kind=kind;
  return '<div class="scr-time-fhead">'+(e?tr("Edit entry")+(e.userId!==ME?' · '+esc(person(e.userId).name):''):tr("Log time"))+'</div>'
    +'<div class="scr-time-fields"><label class="scr-time-f"><span>'+tr("Day")+'</span><input type="date" id="scrTimeDate" data-nofocus value="'+attr(day)+'" max="'+today+'"'+(min?' min="'+min+'"':'')+'></label>'
    +'<label class="scr-time-f"><span>'+tr("How long")+'</span><input id="scrTimeDur" class="scr-time-dur" autocomplete="off" placeholder="1:30" value="'+(e?scoringTimeHm(e.minutes):'')+'"'+enter+'></label>'
    +'<div class="scr-time-f"><span>'+tr("Kind")+'</span><div class="seg scr-time-kind" role="radiogroup" aria-label="'+attr(tr("Kind"))+'">'+SCR_TIME_KINDS.map(function(k){ var on=k[0]===kind; return '<button type="button" role="radio" aria-checked="'+on+'" class="'+(on?'on':'')+'" data-kind="'+k[0]+'" onclick="scoringTimeKindSet(this)">'+tr(k[1])+'</button>'; }).join("")+'</div></div></div>'
    +'<div class="scr-time-fields"><label class="scr-time-f"><span>'+tr("From")+'</span><input type="time" id="scrTimeFrom" value="'+attr(e&&e.startedAt||"")+'"></label><label class="scr-time-f"><span>'+tr("To")+'</span><input type="time" id="scrTimeTo" value="'+attr(e&&e.endedAt||"")+'"></label>'
    +'<label class="scr-time-f scr-time-grow"><span>'+tr("Note")+'</span><input id="scrTimeNote" maxlength="500" placeholder="'+attr(tr("What was it? (optional)"))+'" value="'+attr(e&&e.note||"")+'"'+enter+'></label></div>'
    +(reason?'<label class="scr-time-f scr-time-grow"><span>'+tr("Reason for the correction")+'</span><input id="scrTimeReason" maxlength="1000"'+enter+'></label>':'')
    +'<p class="scr-time-hint">'+tr("Minutes (90) or hours and minutes (1:30). Start and end are optional.")+'</p>'
    +'<div class="scr-time-actions"><button class="btn primary sm" id="scrTimeGo" onclick="scoringTimeSubmit()">'+tr(e?"Save changes":"Add entry")+'</button>'+(e?'<button class="btn sm" onclick="scoringTimeEditStart(null)">'+tr("Cancel")+'</button>':'')+'</div>';
}
function scoringTimeFormRedraw(){ var id=SCR_TIME.open, tk=task(id), f=document.getElementById("scrTimeForm"), c=SCR_TIME.cache[id]; if(!tk||!f) return; f.setAttribute("data-mode",scoringTimeFormMode(tk,c)); f.innerHTML=scoringTimeFormHtml(tk,c,SCR_TIME.edit?scoringTimeEntry(id,SCR_TIME.edit):null); }
function scoringTimeKindSet(btn){ SCR_TIME.kind=btn.getAttribute("data-kind"); var seg=btn.parentNode; Array.prototype.forEach.call(seg.children,function(b){ var on=b===btn; b.classList.toggle("on",on); b.setAttribute("aria-checked",on?"true":"false"); }); }
function scoringTimeMsg(text,kind){ var m=document.getElementById("scrTimeMsg"); if(!m) return; m.className="scr-time-msg"+(kind?" "+kind:""); m.textContent=text||""; }
function scoringTimeEditStart(eid){
  SCR_TIME.edit=eid; SCR_TIME.del=null; scoringTimeMsg("");
  var id=SCR_TIME.open, tk=task(id), l=document.getElementById("scrTimeList"); if(l&&tk) l.innerHTML=scoringTimeListHtml(tk,SCR_TIME.cache[id]);
  scoringTimeFormRedraw(); var d=document.getElementById("scrTimeDur"); if(d) focusSoon(d,30);
}
function scoringTimeDelAsk(eid){ SCR_TIME.del=eid; var id=SCR_TIME.open, tk=task(id), l=document.getElementById("scrTimeList"); if(l&&tk) l.innerHTML=scoringTimeListHtml(tk,SCR_TIME.cache[id]); var w=document.getElementById("scrTimeDelWhy"); if(w) focusSoon(w,30); }
function scoringTimeVal(id){ var el=document.getElementById(id); return el?String(el.value||"").trim():""; }
function scoringTimeSubmit(){
  var id=SCR_TIME.open, tk=task(id); if(!tk||SCR_TIME.busy) return;
  var c=SCR_TIME.cache[id], e=SCR_TIME.edit?scoringTimeEntry(id,SCR_TIME.edit):null;
  var day=scoringTimeVal("scrTimeDate"), dur=scoringTimeParse(scoringTimeVal("scrTimeDur")), from=scoringTimeVal("scrTimeFrom"), to=scoringTimeVal("scrTimeTo"), note=scoringTimeVal("scrTimeNote"), reason=scoringTimeVal("scrTimeReason");
  var bad=function(s){ scoringTimeMsg(tr(s),"bad"); return false; };
  if(!day) return bad("Choose the day the time was worked");
  if(day>scoringTimeToday()) return bad("That day has not come yet: time is logged for today or a day before");
  var span=null; if(from&&to){ var a=scoringTimeParse(from), b=scoringTimeParse(to); if(!(b>a)) return bad("The end must be after the start"); span=b-a; }
  if(dur===null&&span!==null) dur=span;
  if(dur===null||isNaN(dur)) return bad("Type how long: minutes (90) or hours and minutes (1:30)");
  if(dur<1||dur>(e&&e.source==="legacy"?600000:1440)) return bad("An entry is from 1 minute to 24 hours");
  if(span!==null&&dur>span) return bad("The time cannot be more than the time between the start and the end");
  if(e&&scoringTimeMay(c||{can:{}},e).reason&&!reason) return bad("Say why this time is corrected: a correction needs a reason");
  var body={workDate:day,minutes:dur,kind:SCR_TIME.kind,startedAt:from||null,endedAt:to||null,note:note}; if(reason) body.reason=reason;
  var go=document.getElementById("scrTimeGo"); SCR_TIME.busy=true; if(go) go.disabled=true; scoringTimeMsg("");
  scoringTimeApi(e?"PUT":"POST",id,e&&e.id,body).then(function(r){
    SCR_TIME.edit=null; SCR_TIME.date=day; scoringTimeTook(id,r); scoringTimeFormRedraw();
    var w=(r.warnings||[]).map(function(x){ return fmt(tr(x.key),x.vars||{}); }).join(" ");
    scoringTimeMsg(w,w?"warn":""); toast(e?"Entry updated":"Time logged");
    var d=document.getElementById("scrTimeDur"); if(d&&!e) focusSoon(d,30);
  }).catch(function(err){ scoringTimeMsg(scoringTimeErr(err),"bad"); }).then(function(){ SCR_TIME.busy=false; var g=document.getElementById("scrTimeGo"); if(g) g.disabled=false; });
}
function scoringTimeDelGo(eid){
  var id=SCR_TIME.open, c=SCR_TIME.cache[id], e=scoringTimeEntry(id,eid); if(!e||SCR_TIME.busy) return;
  var reason=scoringTimeVal("scrTimeDelWhy"); if(scoringTimeMay(c,e).reason&&!reason) return scoringTimeMsg(tr("Say why this time is corrected: a correction needs a reason"),"bad");
  SCR_TIME.busy=true;
  scoringTimeApi("DELETE",id,eid,null,reason).then(function(r){ SCR_TIME.del=null; if(SCR_TIME.edit===eid) SCR_TIME.edit=null; scoringTimeTook(id,r); scoringTimeFormRedraw(); scoringTimeMsg(""); toast("Entry deleted"); })
    .catch(function(err){ scoringTimeMsg(scoringTimeErr(err),"bad"); }).then(function(){ SCR_TIME.busy=false; });
}

/* ---------- the offline demo: the same rules, kept in the page ---------- */
function scoringTimeDemo(method,id,entryId,body,reason){
  try{
    var tk=task(id); if(!tk) throw new Error("Task not found"); if(!scoringTimeMode()) throw new Error(SCR_TIME_OFF);
    var list=SCR_TIME.demo[id]||(SCR_TIME.demo[id]=[]), now=new Date().toISOString(), out={entry:null,warnings:[]}, act0=+taskMeta(tk).actualEffort||0;
    if(method!=="GET"&&!list.length&&act0>0) list.push({id:uid("te"),userId:tk.assignee||assigneesOf(tk)[0]||tk.createdBy||ME,workDate:String(tk.completedAt||tk.updatedAt||now).slice(0,10),minutes:Math.round(act0*60),kind:"work",startedAt:null,endedAt:null,note:"",source:"legacy",verified:false,createdAt:now});
    var corrector=canI.scoringEditTask(tk), b=body||{}, all=function(){ var a=[]; Object.keys(SCR_TIME.demo).forEach(function(k){ a=a.concat(SCR_TIME.demo[k]); }); return a.filter(function(x){ return !x.deletedAt; }); };
    var check=function(f,userId,except){
      if(!(f.minutes>=1)||f.minutes>(f.source==="legacy"?600000:1440)) throw new Error("An entry is from 1 minute to 24 hours");
      if(f.workDate>scoringTimeToday()) throw new Error("That day has not come yet: time is logged for today or a day before");
      if(f.workDate<scoringTimeDaysAgo(60)&&!corrector) throw new Error("Only the last 60 days can be logged or changed. An older day needs someone who may correct scores (the scoring_edit_task permission).");
      var mine=all().filter(function(x){ return x.userId===userId&&x.workDate===f.workDate&&x.id!==except; }), s=scoringTimeParse(f.startedAt), t=scoringTimeParse(f.endedAt);
      if(f.startedAt&&f.endedAt&&mine.some(function(x){ var a=scoringTimeParse(x.startedAt), z=scoringTimeParse(x.endedAt); return x.startedAt&&x.endedAt&&a<t&&s<z; })) throw new Error("This overlaps another entry of the same person on that day");
      var total=f.minutes+mine.filter(function(x){ return x.source!=="legacy"; }).reduce(function(n,x){ return n+x.minutes; },0);
      if(total>1440) throw new Error("More than 24 hours in one day for one person");
      var per=+((PEOPLE[userId]||{}).hoursPerDay)||8; if(total>per*90) out.warnings.push({code:"long_day",key:"A long day: {hours} h logged on {date}, more than 1.5 × the usual {perDay} h a day",vars:{hours:Math.round(total/60*100)/100,date:f.workDate,perDay:per}});
    };
    var pickF=function(cur){ return {workDate:b.workDate||(cur&&cur.workDate),minutes:Math.round(+(b.minutes!=null?b.minutes:cur&&cur.minutes)),kind:b.kind||(cur&&cur.kind)||"work",startedAt:b.startedAt!==undefined?b.startedAt:(cur&&cur.startedAt||null),endedAt:b.endedAt!==undefined?b.endedAt:(cur&&cur.endedAt||null),note:b.note!==undefined?String(b.note||""):(cur&&cur.note||""),source:cur?cur.source:"manual"}; };
    if(method==="POST"){ if(!canI.logTime(tk)) throw new Error("You don't have permission to log time on this task: the people assigned to it log their own time."); var f=pickF(null); check(f,ME,null); out.entry=Object.assign({id:uid("te"),userId:ME,verified:false,createdBy:ME,createdAt:now},f); list.push(out.entry); }
    else if(method==="PUT"||method==="DELETE"){
      var cur=list.filter(function(x){ return x.id===entryId&&!x.deletedAt; })[0]; if(!cur) throw new Error("That time entry is not there any more. Reload the time log.");
      var own=cur.userId===ME&&canI.logTime(tk); if(!own&&!corrector) throw new Error("You don't have permission to change someone else's time.");
      if(!own&&!String(method==="DELETE"?reason:b.reason||"").trim()) throw new Error("Say why this time is corrected: a correction needs a reason");
      if(method==="DELETE"){ if(cur.workDate<scoringTimeDaysAgo(60)&&!corrector) throw new Error("Only the last 60 days can be logged or changed. An older day needs someone who may correct scores (the scoring_edit_task permission)."); cur.deletedAt=now; }
      else { if(cur.source==="legacy"&&!corrector) throw new Error("An entry from before the time log is changed only by someone who may correct scores. You can delete it and log the days instead."); var g=pickF(cur); check(g,cur.userId,cur.id); Object.assign(cur,g,{verified:false,editedBy:ME,editedAt:now}); out.entry=cur; }
    }
    var live=list.filter(function(x){ return !x.deletedAt; }), sum={work:0,revision:0,blocked:0}, by={};
    live.forEach(function(x){ sum[x.kind]+=x.minutes; var p=by[x.userId]||(by[x.userId]={work:0,revision:0,blocked:0,actualHours:0}); p[x.kind]+=x.minutes; });
    Object.keys(by).forEach(function(k){ by[k].actualHours=scoringTimeActual(by[k].work+by[k].revision); });
    var touched=live.some(function(x){ return x.source!=="legacy"||x.editedAt; })||live.length<list.length, act=touched?scoringTimeActual(sum.work+sum.revision):act0;
    if(method!=="GET"&&act!==act0) editTaskWith(tk,function(t){ if(act>0) taskMeta(t).actualEffort=act; else delete taskMeta(t).actualEffort; });
    live.sort(function(x,y){ return x.workDate<y.workDate?1:x.workDate>y.workDate?-1:String(y.startedAt||"")>String(x.startedAt||"")?1:-1; });
    return Promise.resolve(Object.assign({on:true,entries:live.slice(),totals:{minutes:sum,actualHours:scoringTimeActual(sum.work+sum.revision),byPerson:by},actualEffort:act,updatedAt:tk.updatedAt||null,touched:touched,can:{log:canI.logTime(tk),correct:corrector},window:{latest:scoringTimeToday(),earliest:scoringTimeDaysAgo(60)}},out));
  }catch(e){ return Promise.reject(e); }
}

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Log time":"Catat waktu","Time log":"Log waktu","Actual":"Aktual","Logged":"Tercatat","Work":"Dikerjakan","Revision":"Revisi","Blocked":"Terblokir",
  "not in Actual":"tidak masuk Aktual","{h} h {m} min":"{h} j {m} mnt","{h} h":"{h} j","{m} min":"{m} mnt",
  "Today":"Hari ini","Yesterday":"Kemarin","Day":"Hari","How long":"Berapa lama","Kind":"Jenis","From":"Dari","To":"Sampai","Note":"Catatan",
  "What was it? (optional)":"Apa yang dikerjakan? (opsional)","Reason for the correction":"Alasan koreksi",
  "Minutes (90) or hours and minutes (1:30). Start and end are optional.":"Menit (90) atau jam dan menit (1:30). Jam mulai dan selesai opsional.",
  "Add entry":"Tambah entri","Edit entry":"Ubah entri","Save changes":"Simpan perubahan","Cancel":"Batal","Close":"Tutup","Edit":"Edit","Delete":"Hapus",
  "Delete this entry?":"Hapus entri ini?","Time logged":"Waktu dicatat","Entry updated":"Entri diperbarui","Entry deleted":"Entri dihapus",
  "from before the time log (not verified)":"dari sebelum log waktu (belum diverifikasi)",
  "includes time from before the time log (not verified)":"termasuk waktu dari sebelum log waktu (belum diverifikasi)",
  "verified":"terverifikasi","edited":"diedit","corrected by":"dikoreksi oleh","Loading…":"Memuat…",
  "No time logged yet.":"Belum ada waktu yang dicatat.","Only the totals are shown here.":"Di sini hanya totalnya yang ditampilkan.",
  "Could not load the time log":"Log waktu tidak bisa dimuat",
  "Only the people assigned to this task log time on it.":"Hanya orang yang ditugaskan di task ini yang mencatat waktunya.",
  "Actual is the work and revision logged. Blocked time is kept apart and not counted in Actual.":"Aktual adalah waktu kerja dan revisi yang dicatat. Waktu terblokir dicatat terpisah dan tidak dihitung dalam Aktual.",
  "A long day: {hours} h logged on {date}, more than 1.5 × the usual {perDay} h a day":"Hari yang panjang: {hours} jam tercatat pada {date}, lebih dari 1,5 × jam biasa {perDay} jam sehari",
  "the time log":"log waktu",
  /* the server's answers */
  "Time logging is off. It is on while Smart Scoring and its Effort Hours are turned on (Settings → Smart Scoring).":"Pencatatan waktu sedang mati. Pencatatan aktif selama Smart Scoring dan Effort Hours-nya dinyalakan (Pengaturan → Smart Scoring).",
  "Smart Scoring is turned off on this server":"Smart Scoring dimatikan di server ini",
  "Task not found":"Task tidak ditemukan",
  "That time entry is not there any more. Reload the time log.":"Entri waktu itu sudah tidak ada. Muat ulang log waktunya.",
  "You don't have permission to log time on this task: the people assigned to it log their own time.":"Kamu tidak punya izin mencatat waktu di task ini: orang yang ditugaskan mencatat waktunya sendiri.",
  "You don't have permission to change someone else's time.":"Kamu tidak punya izin mengubah waktu orang lain.",
  "You don't have permission to change this time: it is changed by the people assigned to the task.":"Kamu tidak punya izin mengubah waktu ini: waktu diubah oleh orang yang ditugaskan di task.",
  "Choose the day the time was worked":"Pilih hari waktu itu dikerjakan",
  "Choose the day the time was worked (a date like 2026-10-16)":"Pilih hari waktu itu dikerjakan (tanggal seperti 2026-10-16)",
  "Choose what the time was: work, revision or blocked":"Pilih jenis waktunya: dikerjakan, revisi, atau terblokir",
  "Start and end are times of the day, like 09:30":"Jam mulai dan selesai adalah jam dalam sehari, seperti 09:30",
  "The end must be after the start":"Jam selesai harus setelah jam mulai",
  "Say how long it took: from 1 minute to 24 hours":"Sebutkan berapa lama: dari 1 menit sampai 24 jam",
  "Type how long: minutes (90) or hours and minutes (1:30)":"Ketik berapa lama: menit (90) atau jam dan menit (1:30)",
  "An entry is from 1 minute to 24 hours":"Satu entri antara 1 menit dan 24 jam",
  "The time cannot be more than the time between the start and the end":"Waktunya tidak boleh lebih dari selisih jam mulai dan selesai",
  "Text is too long: note (max 500 characters)":"Teks terlalu panjang: catatan (maks. 500 karakter)",
  "Text is too long: reason (max 1,000 characters)":"Teks terlalu panjang: alasan (maks. 1.000 karakter)",
  "That day has not come yet: time is logged for today or a day before":"Hari itu belum tiba: waktu dicatat untuk hari ini atau sebelumnya",
  "Only the last 60 days can be logged or changed. An older day needs someone who may correct scores (the scoring_edit_task permission).":"Hanya 60 hari terakhir yang bisa dicatat atau diubah. Hari yang lebih lama perlu orang yang boleh mengoreksi skor (izin scoring_edit_task).",
  "This overlaps another entry of the same person on that day":"Ini bertumpuk dengan entri lain dari orang yang sama di hari itu",
  "More than 24 hours in one day for one person":"Lebih dari 24 jam dalam sehari untuk satu orang",
  "Say why this time is corrected: a correction needs a reason":"Sebutkan alasan waktu ini dikoreksi: koreksi perlu alasan",
  "An entry from before the time log is changed only by someone who may correct scores. You can delete it and log the days instead.":"Entri dari sebelum log waktu hanya bisa diubah oleh orang yang boleh mengoreksi skor. Kamu bisa menghapusnya lalu mencatat per hari.",
  "This task has too many time entries":"Task ini punya terlalu banyak entri waktu"
});
</script>
<style>
.scr-time-actual{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.scr-time-actual>b{color:var(--color-text-primary)}
.scr-time-btn{display:inline-flex;align-items:center;gap:4px;margin-left:4px}
.scr-time-btn svg{width:13px;height:13px}
.scr-time-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;font-size:12.5px;color:var(--color-text-secondary)}
.scr-time-row b{color:var(--color-text-primary)}
.scr-time{display:flex;flex-direction:column;gap:12px;min-width:0}
.scr-time-sum{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;font-size:12.5px;color:var(--color-text-secondary)}
.scr-time-big{font-size:22px;line-height:1.1;color:var(--color-text-primary)}
.scr-time-big b{font-weight:650}
.scr-time-parts{color:var(--color-text-primary)}
.scr-time-people{display:flex;flex-wrap:wrap;gap:2px 14px;flex-basis:100%}
.scr-time-hint{flex-basis:100%;font-size:11.5px;color:var(--color-text-tertiary);margin:0}
.scr-time-list{display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:10px;max-height:min(42vh,340px);overflow-y:auto;background:var(--color-surface)}
.scr-time-entry{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:4px 10px;padding:8px 10px;border-top:1px solid var(--color-border);font-size:12.5px;min-width:0}
.scr-time-line{display:flex;flex-wrap:wrap;align-items:center;gap:3px 8px;min-width:0}
.scr-time-entry:first-child{border-top:0}
.scr-time-entry.is-edit{background:var(--color-primary-soft)}
.scr-time-who{font-weight:600;color:var(--color-text-primary)}
.scr-time-date{color:var(--color-text-secondary)}
.scr-time-k{font-size:11px;padding:1px 8px;border-radius:999px;background:var(--color-surface-sunken);color:var(--color-text-secondary)}
.scr-time-k.k-work{background:var(--color-primary-soft);color:var(--color-text-primary)}
.scr-time-k.k-revision{background:var(--color-warning-soft);color:var(--color-text-primary)}
.scr-time-flag{font-size:11px;color:var(--color-text-tertiary)}
.scr-time-legacy{font-size:11px;color:var(--color-text-secondary);font-style:italic}
.scr-time-len{font-variant-numeric:tabular-nums;color:var(--color-text-primary);white-space:nowrap}
.scr-time-acts{display:inline-flex;gap:4px}
.scr-time-ib{width:28px;height:28px}
.scr-time-ib svg{width:14px;height:14px}
.scr-time-note{grid-column:1/-1;color:var(--color-text-secondary);overflow-wrap:anywhere}
.scr-time-del{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding-top:4px}
.scr-time-del input,.scr-time-f input{font:inherit;font-size:13px;height:34px;padding:0 8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text-primary);min-width:0;box-sizing:border-box}
.scr-time-del input{flex:1 1 180px}
.scr-time-empty{padding:16px;text-align:center;font-size:12.5px;color:var(--color-text-tertiary)}
.scr-time-msg{font-size:12.5px;padding:8px 10px;border-radius:8px;background:var(--color-surface-sunken);color:var(--color-text-secondary)}
.scr-time-msg:empty{display:none}
.scr-time-msg.warn{background:var(--color-warning-soft);color:var(--color-text-primary)}
.scr-time-msg.bad{background:var(--color-danger-soft);color:var(--color-danger)}
.scr-time-form{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--color-border);padding-top:12px;min-width:0}
.scr-time-fhead{font-weight:600;font-size:13px;color:var(--color-text-primary)}
.scr-time-fields{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 12px;min-width:0}
.scr-time-f{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--color-text-secondary);min-width:0}
.scr-time-f .scr-time-dur{width:96px}
.scr-time-grow{flex:1 1 200px}
.scr-time-kind{flex-wrap:wrap}
.scr-time-actions{display:flex;flex-wrap:wrap;gap:8px}
@media(max-width:560px){.scr-time-fields>.scr-time-f{flex:1 1 130px}.scr-time-f input,.scr-time-f .scr-time-dur{width:100%}.scr-time-big{font-size:19px}.scr-time-entry{padding:8px}}
</style>
