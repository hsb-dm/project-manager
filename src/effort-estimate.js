<script>
/* ============================================================
   ESTIMATED HOURS, FILLED IN — and still the person's to change.
   While a new task is written, its Estimate fills itself in from work already done: finished tasks that read
   alike (simScore), counted more when they share the brief template, the team or a label, each with the hours
   it actually took (its estimate when nobody logged the actual). The weighted median, rounded to half an hour,
   with the range. Fewer than three alike and the title says what kind of work it is (a feed post, a carousel,
   reels…)? What that kind usually takes (EST_KINDS), per deliverable for work made in sets, weighed with the one
   or two alike. Nothing at all? Finished tasks of the same brief template, then of the same team (three or more).
   Text only, in the browser — no cost, no wait.
   Only when neither says enough, and the workspace lets the AI work for it, the AI is asked once, on Create, with
   the task, the usual hours of each kind as a yardstick (and the closest examples, when the workspace shares its
   data with the AI); its answer — never more than a working week — fills the task a moment later.
   A number the person types is theirs: never overwritten, and the "auto" mark goes. The mark (meta.effortAuto)
   says where the number came from — on hover, or a tap on phones.
   ============================================================ */
var EST_MIN=0.4, EST_ENOUGH=3, EST_BASE={}, EST_T=null;
/* What a kind of work usually takes — hands-on hours for one person, not calendar time or waiting for approval.
   It is the number when the workspace has nothing finished like it yet, it is weighed in when there are only one or
   two, and it is the yardstick the AI is given: a single feed post is not a ten-hour job. A task's deliverables are
   its assets produced: the first counts in full and each next one at the kind's own share (Oct 2026) — a resize is
   quick once the first is done (25%), posts, stories and banners take about half, a poster, a reel or a video more,
   and a deck, a copy or a logo concept less than half. It used to be 60% for work made in sets and nothing for the
   rest, so twelve resizes came to ten hours and three reels to the hours of one. Matched on the title, English or
   Indonesian, the more specific kinds first.
   One list for all of it (Oct 2026): the kinds, their names and the title patterns are Smart Scoring's engine's
   (ScoringEngine.KINDS and kindOf, shared/scoring-engine.js, inlined before this file), and so are the hours (its hour
   templates) — the estimator, the scoring and the points for assets produced always agree on what a title is.
   [id, English name, Indonesian name, title pattern, typical, low, high, each next deliverable at] */
var EST_KINDS=(typeof ScoringEngine!=="undefined"?ScoringEngine.KINDS:[]).map(function(k){ var t=ScoringEngine.ENGINE_DEFAULTS.hours.templates[k.id];
  return [k.id,k.name,k.nameId,k.pattern,t.perUnit,t.low,t.high,t.nextUnitFactor]; });
function estKind(title){ var id=typeof ScoringEngine!=="undefined"?ScoringEngine.kindOf(String(title||"")):null; for(var i=0;id&&i<EST_KINDS.length;i++) if(EST_KINDS[i][0]===id) return EST_KINDS[i]; return null; }
/* the kind's hours for this many deliverables: the first in full, each next one at the kind's share */
function estKindHours(k,items){ var f=items>1?1+k[7]*(items-1):1; return {h:k[4]*f,low:k[5]*f,high:k[6]*f}; }
function estKindName(id){ var k=EST_KINDS.filter(function(x){ return x[0]===id; })[0]; return k?(UI_LANG==="id"?k[2]:k[1]):id; }
function estHours(t){ var a=+((t.meta||{}).actualEffort)||0; return a>0?a:(+t.effort||0); }
function estRound(h){ return Math.max(0.5,Math.round(h*2)/2); }
function estPool(){ return TASKS.filter(function(t){ return !t._draft&&!t._creating&&t.title&&isSuccessfulTask(t)&&estHours(t)>0; }); }
function estMedian(xs){ xs=xs.slice().sort(function(a,b){ return a.h-b.h; }); var tot=xs.reduce(function(n,x){ return n+x.w; },0), acc=0; for(var i=0;i<xs.length;i++){ acc+=xs[i].w; if(acc>=tot/2) return xs[i].h; } return 0; }
function estFrom(list,basis){ var hs=list.map(function(x){ return x.h; }).sort(function(a,b){ return a-b; });
  return {h:estRound(estMedian(list)),n:list.length,low:estRound(hs[0]),high:estRound(hs[hs.length-1]),src:"history",basis:basis,ids:list.slice(0,5).map(function(x){ return x.t.id; })}; }
/* the estimate for a task as it is written now (title, description, template, team, labels) */
function effortEstimate(tk){ var title=String(tk.title||"").trim(); if(!title||typeof simScore!=="function") return null;
  var tpl=tk.brief&&tk.brief.tpl, labels=tk.labels||[], pool=estPool();
  var alike=pool.map(function(t){ var s=simScore(title,tk.description||"",t); if(s<EST_MIN) return null;
      if(tpl&&t.brief&&t.brief.tpl===tpl) s+=0.1; if(tk.team&&t.team===tk.team) s+=0.05; if(labels.some(function(l){ return (t.labels||[]).indexOf(l)>=0; })) s+=0.05;
      return {t:t,h:estHours(t),w:s}; }).filter(Boolean).sort(function(a,b){ return b.w-a.w; }).slice(0,8);
  var k=estKind(title), items=Math.max(1,Math.round(+tk.assetCount||0)), kh=k?estKindHours(k,items):null;
  /* enough finished work like it: that is the answer */
  if(alike.length>=EST_ENOUGH||(alike.length&&!k)) return estFrom(alike,"alike");
  /* one or two like it: weighed with what the kind usually takes (the kind counts as two) */
  if(alike.length){ var e=estFrom(alike,"alike"), n=alike.length; return Object.assign(e,{h:estRound((n*estMedian(alike)+2*kh.h)/(n+2)),low:estRound(Math.min(e.low,kh.low)),high:estRound(Math.max(e.high,kh.high)),kind:k[0],items:items}); }
  if(k) return {h:estRound(kh.h),n:0,low:estRound(kh.low),high:estRound(kh.high),src:"kind",basis:"",kind:k[0],items:items};
  var same=function(f,basis){ var l=pool.filter(f).map(function(t){ return {t:t,h:estHours(t),w:1}; }); return l.length>=EST_ENOUGH?estFrom(l,basis):null; };
  return (tpl&&same(function(t){ return t.brief&&t.brief.tpl===tpl; },"template"))||(tk.team&&same(function(t){ return t.team===tk.team; },"team"))||null; }
/* the AI is asked only when neither the workspace's finished work nor the kind of work says enough */
function effortWantsAi(est){ return !est||(!est.kind&&(est.basis!=="alike"||est.n<EST_ENOUGH)); }
/* fill it in — unless the person has typed their own; with nothing to go on, back to what the draft started with */
function effortApply(tk,est){ var m=taskMeta(tk); if(m.effortManual) return false; var k=tk._draftKey||tk.id; if(!(k in EST_BASE)) EST_BASE[k]=+tk.effort||0;
  if(est){ tk.effort=est.h; m.effortAuto={src:est.src,basis:est.basis||"",n:est.n||0,low:est.low||est.h,high:est.high||est.h,reason:est.reason||""}; if(est.kind){ m.effortAuto.kind=est.kind; m.effortAuto.items=est.items||1; } }
  else if(m.effortAuto){ tk.effort=EST_BASE[k]; delete m.effortAuto; }
  return true; }
/* a number typed by the person (every place the estimate is edited calls this) */
function effortManual(t){ var m=taskMeta(t); m.effortManual=true; delete m.effortAuto; }
function effortWhy(a){ if(!a) return ""; var range=a.low!==a.high?" ("+a.low+"–"+a.high+" h)":"";
  var items=a.items>1?", "+a.items+" "+tr("deliverables"):"", like=function(n){ return n+" "+tr(n===1?"finished task like this one":"finished tasks like this one"); };
  var s=a.src==="ai"?tr("Estimated by AI")+(a.reason?": "+a.reason:"")+(a.n?" · "+tr("Examples")+": "+a.n+" "+tr(a.n===1?"similar task":"similar tasks"):"")
    :a.kind?tr("Typical for a")+" "+estKindName(a.kind)+items+(a.n?", "+tr("weighed with")+" "+like(a.n):"")+range
    :tr("Filled in from")+" "+(a.basis==="template"?a.n+" "+tr("finished tasks with the same brief template"):a.basis==="team"?a.n+" "+tr("finished tasks of the same team"):like(a.n))+range;
  return s+". "+tr("Type a number to set your own."); }
function effortBadge(tk){ var a=(tk.meta||{}).effortAuto; if(!a) return ""; var why=effortWhy(a);
  return '<button type="button" class="est-auto'+(a.src==="ai"?" ai":"")+'" title="'+attr(why)+'" aria-label="'+attr(tr("Filled in automatically")+". "+why)+'" onclick="event.stopPropagation();toast(this.title)">'+esc(tr("auto"))+'</button>'; }
/* the number and the mark, changed where they stand: no redraw while someone types the title */
function effortPaint(tk){ var cell=document.querySelector('#drawer [data-meta="effort"] .v'); if(!cell||!tk) return; var inp=cell.querySelector("input");
  if(inp&&document.activeElement!==inp&&+inp.value!==+tk.effort) inp.value=tk.effort;
  var old=cell.querySelector(".est-auto"), html=effortBadge(tk); if(old){ if(html){ if(old.outerHTML!==html) old.outerHTML=html; } else old.remove(); } else if(html) cell.insertAdjacentHTML("beforeend",html); }
function effortLive(){ var tk=S.drawerTask?task(S.drawerTask):null; if(!tk||!tk._draft) return; var r=typeof simRead==="function"?simRead(tk):{title:tk.title,desc:tk.description};
  if(effortApply(tk,effortEstimate(Object.assign({},tk,{title:r.title,description:r.desc})))) effortPaint(tk); }
document.addEventListener("input",function(e){ var el=e.target; if(!el||!el.closest||!(el.closest("#drHead .dr-title")||el.closest("#descSrc"))) return; var tk=S.drawerTask?task(S.drawerTask):null; if(!tk||!tk._draft) return; clearTimeout(EST_T); EST_T=setTimeout(effortLive,300); },true);(function(){ if(typeof renderDrawer!=="function") return; var base=renderDrawer; renderDrawer=function(){ var out=base.apply(this,arguments); try{ effortLive(); }catch(e){ console.error(e); } return out; }; })();

/* ---------- the AI, once, on Create ---------- */
function effortAiOk(){ if(typeof aiCfg!=="function"||typeof API==="undefined"||!API.on) return false; var c=aiCfg(); return !!(c.processing.externalEnabled&&(typeof aiChatReady==="function"?aiChatReady("estimate"):(typeof aiConfigured!=="function"||aiConfigured("chat")))); }
function effortAiPrompt(tk,ex){ var tpl=tk.brief&&tk.brief.tpl&&byId(WS.briefTemplates||[],tk.brief.tpl), tm=tk.team&&team(tk.team);
  return ["Estimate the hands-on working hours one experienced person needs to do this task — the time spent working on it, not calendar time and not time waiting for feedback or approval.",
    "Typical hands-on hours: "+EST_KINDS.map(function(k){ return k[1]+" "+k[5]+"–"+k[6]+" h"+" (each next at "+Math.round(k[7]*100)+"%)"; }).join("; ")+". A small task gets a small number.",
    "Task title: "+tk.title,
    tk.description?"Description: "+String(tk.description).slice(0,800):"",
    tpl?"Brief template: "+tpl.name:"", tm?"Team: "+tm.name:"", "Priority: "+(tk.prio||"medium"),
    tk.assetCount?"Deliverables: "+tk.assetCount:"",
    ex.length?"Finished tasks of this team that read alike, with the hours they took:\n"+ex.map(function(t){ return '- "'+String(t.title).slice(0,120)+'": '+estHours(t)+" h"; }).join("\n"):"",
    'Reply with JSON only: {"hours": <number>, "reason": "<one short sentence in '+(UI_LANG==="id"?"Indonesian":"English")+'>"}'].filter(Boolean).join("\n"); }
function effortAskAi(id,probe,est){ var c=aiCfg(), ex=c.processing.workspaceContextEnabled&&est&&est.ids?est.ids.map(task).filter(Boolean):[];
  var call=apiFetch("POST","/api/ai/chat",{messages:[{role:"user",content:effortAiPrompt(probe,ex)}],context:"",purpose:"estimate"}), late=new Promise(function(res){ setTimeout(function(){ res(null); },25000); });
  return Promise.race([call,late]).then(function(r){ if(!r) return false; var txt=String(r.reply||r.text||r.content||""), j=null; try{ j=JSON.parse((txt.match(/\{[\s\S]*\}/)||["null"])[0]); }catch(e){}
    /* kept within reason: a reply past a working week is read as a full week (it was asked for one task) */
    var h=j&&+j.hours, t=task(id); if(!(h>0)||!t||taskMeta(t).effortManual||!canI.editTask(t)) return false; h=Math.min(40,h);
    var auto={src:"ai",basis:ex.length?"alike":"",n:ex.length,low:estRound(h),high:estRound(h),reason:String(j.reason||"").slice(0,200)};
    return editTaskWith(t,function(x){ if(taskMeta(x).effortManual) return; x.effort=estRound(h); taskMeta(x).effortAuto=auto; }); }).catch(function(){ return false; }); }
/* With Smart Scoring and its Effort Hours on (Oct 2026), the workspace's "AI on create" (Settings → Smart Scoring)
   decides: off, the AI is not asked on Create; on (and Effort Hours not "math only"), it is asked through Smart
   Scoring's own route — the server builds the prompt from the task, checks the answer against the calculation and
   counts it against the workspace's quota — and the answer fills the Estimate as before, only when it is not far from
   the calculation and the AI is sure enough (else it waits in the task's Scoring & Intelligence for a person to take
   it). With Smart Scoring off, exactly as before. */
function effortAiRoute(){ if(typeof scoringOn!=="function"||!scoringOn()||typeof scoringModuleOn!=="function"||!scoringModuleOn("hours")) return "chat";
  var s=typeof scoringSettings==="function"?scoringSettings():null; return s&&s.ai&&s.ai.onCreate&&scoringMode("hours")!=="math_only"?"scoring":"none"; }
function effortAskScoring(id,est){
  return apiFetch("POST","/api/tasks/"+encodeURIComponent(id)+"/scoring/ai",{module:"hours",trigger:"create",comparables:est&&est.ids?est.ids.slice(0,5):[],lang:UI_LANG==="id"?"id":"en"}).then(function(d){ var t=task(id); if(!t||!d) return false;
    if(d.task&&typeof hTask==="function"){ var keep=t.scoring; replaceInto(t,hTask(d.task)); if(!t.scoring&&keep) t.scoring=keep; }
    if(typeof scrStore==="function") scrStore(id,d,"hours");
    var st=d.aiResult&&d.aiResult.status, a=d.ai&&d.ai.rows&&d.ai.rows.hours, row=d.rows&&d.rows.hours;
    if((st!=="ok"&&st!=="cached")||!a||a.far||a.lowConfidence||a.stale||!(+a.value>0)) return false;
    if(row&&(row.locked||row.status==="proposed"||row.source==="manual")||taskMeta(t).effortManual||!canI.editTask(t)) return false;
    /* kept within reason: a suggestion past a working week is read as a full week (it was asked for one task) */
    var h=Math.min(40,+a.value), n=(a.comparables||[]).length, auto={src:"ai",basis:n?"alike":"",n:n,low:estRound(h),high:estRound(h),reason:String(a.explanation||"").slice(0,200)};
    return editTaskWith(t,function(x){ if(taskMeta(x).effortManual) return; x.effort=estRound(h); taskMeta(x).effortAuto=auto; }); }).catch(function(){ return false; }); }
(function(){ if(typeof createDraft!=="function") return; var base=createDraft; createDraft=function(){ var tk=task("T-new"), want=null;
  if(tk) try{ var el=document.querySelector(".dr-title"), probe=Object.assign({},tk,{title:String((el&&el.textContent)||tk.title||"").trim()}), est=effortEstimate(probe);
    if(effortApply(tk,est)&&effortWantsAi(est)&&effortAiOk()) want={probe:probe,est:est,route:effortAiRoute()}; }catch(e){ console.error(e); }
  var out=base.apply(this,arguments);
  if(want&&want.route!=="none"&&out&&typeof out.then==="function") out.then(function(t){ if(t&&t.id){ if(want.route==="scoring") effortAskScoring(t.id,want.est); else effortAskAi(t.id,want.probe,want.est); } });
  return out; }; })();

Object.assign(UI_ID,{"auto":"otomatis","Filled in automatically":"Diisi otomatis","Estimated by AI":"Diperkirakan oleh AI","Examples":"Contoh","similar task":"task serupa","similar tasks":"task serupa",
  "Filled in from":"Diisi dari","finished task like this one":"task serupa yang sudah selesai","finished tasks like this one":"task serupa yang sudah selesai",
  "finished tasks with the same brief template":"task selesai dengan template brief yang sama","finished tasks of the same team":"task selesai dari tim yang sama",
  "Type a number to set your own.":"Ketik angka untuk menentukan sendiri.","Typical for a":"Lazimnya untuk","weighed with":"ditimbang dengan"});
</script>
