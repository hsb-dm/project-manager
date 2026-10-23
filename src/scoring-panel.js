<script>
/* ============================================================
   THE TASK'S "SCORING & INTELLIGENCE" PANEL (Oct 2026)
   Smart Scoring's place in a task (docs/SMART-SCORING.md, Phase 1 C). On the Brief tab, under the Effort line, a
   panel that opens and folds — folded at first, and each person's choice is remembered with their preferences — with a
   row for every module the workspace has on: Effort Hours, Story Points, Weighted Points. Each row shows the number the
   workspace's own arithmetic gives (Math baseline), the AI's suggestion (Ask AI, below), the
   final value — or the locked one — with where it came from (math, AI, set by a person, kept from before Smart
   Scoring), its status (draft, proposed, approved, locked, unverified, re-baseline needed), who changed it last and
   when. Its buttons follow what the server says this person may do (the `can` of GET /api/tasks/:id/scoring), and the
   server decides every write: Calculate, Change value (with scoring_edit_task) or Propose a change (with a reason, for
   an approver), Approve & lock (the current value or the proposal), Re-baseline (a new approved lock — kept, the
   proposal's, the math's or another value — with a reason), the explanation — the engine's own sentences, in English
   or Indonesian — and the task's scoring history. Every write answers with the whole view and the task as the server
   now has it (docs/SMART-SCORING.md §5.2), so the task's Estimate follows without asking again.
   - Calculate: hours from the kind of work, its complexity, the task's Assets produced as the deliverable count and its
     open dependencies; Story and Weighted Points from four 1–5 ratings, the Scope rating suggested from the Assets
     produced. While rating, the result is worked out in the page with the same engine the server uses
     (shared/scoring-engine.js), so the preview is the number that is stored.
   - A locked hour estimate cannot be typed over: the Estimate in the task's details, in the grid and in the Effort line
     is greyed out and says who locked it (scoringEstimateLock, used by src/drawer.js and src/tasks.js).
   - Nothing blinks: the panel is drawn from what is known (the task's own `scoring` summary and what was loaded
     before), the details are fetched once when the task is opened or changes, and the panel is then redrawn in place —
     nothing else in the task moves and nothing being typed loses its place.
   - Hours are shown to the half hour, as the Estimate is; Weighted Points with two decimals; Story Points are whole
     (their scale is 1, 2, 3, 5, 8, 13).
   - Places for what the other parts of Smart Scoring add, each drawn only when that part is there:
     scoringTimeRowHtml(tk) (the time log, in place of the Actual number while time is logged per entry),
     scoringAssetsRowHtml(tk) (points for assets produced), scoringOutcomesRowHtml(tk) (KPI and OKR links) and, in
     Phase 3, scoringEfficiencyLineHtml(tk, efficiency) for the efficiency bonus line.
   - Ask AI (Phase 2, server/scoring-ai.js): for whoever may ask the AI (scoring_request_ai) and a score not set to
     "math only", POST …/scoring/ai asks the workspace's AI model — on the server, from the task's own data — and the
     row then shows its suggestion with how sure it is (lowered when it is far from the calculation), why, what it
     assumed and what the task does not say, the warnings (far from the calculation, low confidence, made for the task
     as it was before), and Accept (PUT …/:module {use:"ai"}: set, or proposed for an approver, with a reason when it is
     far) or Dismiss (this person's view only). The AI's own words stay as it wrote them; everything around them is in
     English or Indonesian. An answer from the cache, a quota used up, external AI processing off, an answer that could
     not be used: said in plain words, and the math stands. A spinner while it is asked; nothing else moves.
   - The documents in the brief (Oct 2026): while the workspace lets the AI read them (Settings → Smart Scoring → AI,
     ai.readDocs) and the task has some (GET …/scoring ai.docs.found), a "Documents for the AI" line under the rows: each
     one a chip with its kind and title, and what happened to it at the last ask (aiResult.docs: read and how much of it,
     cut to fit, not shared publicly — private Google documents are never read — too large, not supported), with
     "Use this task's documents" for whoever may edit the task (meta.aiReadDocs false leaves them out; saved as any
     change to the task). With reading off, only a quiet line for whoever may change it. A document the brief points
     into (Doc.part) shows that part beside its title ("· slide 5"), what was sent of it ("read: slide 12 (the work) +
     slide 13 (continues) of 40 · 2,300 characters") or that it could not be read on its own (then nothing was sent);
     a deck or a PDF has "Slides/pages:" to set them by hand (meta.aiDocParts, saved with the task, over the link).
   - Without a server (the offline demo) the same routes are answered in the page (scrDemo), with the same rules.
   - The team's context for the AI (Oct 2026): after a suggestion, each assumption is marked right or wrong (a wrong one
     with what is true instead) and a note tells the AI what the brief does not say; kept with the task (GET …/scoring
     ai.context, PUT …/scoring/context) and sent on every ask; "Send & ask again" saves and asks at once, and each row
     then says what changed and why (previous, contextEffect). See "the team's context for the AI" below.
   While Smart Scoring is off (scoringOn() in src/scoring-core.js) the Effort line is exactly as it always was, and
   nothing here runs.
   ============================================================ */
var SCR={cache:{},busy:{},err:{},demo:{},why:{},shown:null,base:null,rate:null,aiBusy:{},aiNote:{},aiHide:null,docRun:{}};
var SCR_MODULES=["hours","story","weighted"];
var SCR_NAMES={hours:"Effort Hours",story:"Story Points",weighted:"Weighted Points"};
var SCR_SRC={math:"Math",ai:"AI",manual:"Manual",legacy:"Legacy"};
var SCR_SRC_WHY={math:"Worked out from the workspace's templates and this task",ai:"Suggested by the AI",manual:"Set by a person",legacy:"Kept from before Smart Scoring"};
var SCR_ST={draft:"Draft",proposed:"Proposed",approved:"Approved",locked:"Locked, not approved",unverified:"Unverified",rebaseline_needed:"Re-baseline needed"};
var SCR_FACTORS=["complexity","scope","uncertainty","dependencies"];
var SCR_FACTOR_NAMES={complexity:"Complexity",scope:"Scope",uncertainty:"Uncertainty",dependencies:"Dependencies"};
var SCR_LEVELS={
  complexity:["Simple, routine work","Mostly routine, a few choices","Some craft and decisions","Demanding, many details","Very complex or new ground"],
  scope:["One small piece","A few pieces (2–3)","A set (4–6)","A large set (7–12)","Very large (13 or more)"],
  uncertainty:["The brief is clear and settled","A few small open questions","Some unknowns","Many unknowns, likely to change","The brief is unclear and will change"],
  dependencies:["Needs nobody else","One hand-off","Input from a few others","Several people or teams","Waits on many others"]};
var SCR_ACTIONS={calculate:"Calculated",calculated:"Calculated",propose:"Proposed a change",proposed:"Proposed a change",manual:"Changed the value",set:"Changed the value",change:"Changed the value",changed:"Changed the value",override:"Changed the value",approve:"Approved and locked",approved:"Approved and locked",lock:"Locked",locked:"Locked",frozen:"Frozen when work started",rebaseline:"Set a new baseline",rebaselined:"Set a new baseline",rebaseline_needed:"Needs a new baseline",backfill:"Kept from before Smart Scoring",backfilled:"Kept from before Smart Scoring",ai:"AI suggestion",removed_with_task:"Removed with the task",
  locked_changed:"Changed the locked value",estimate_set:"Took the task's Estimate",estimate_changed:"Followed the task's Estimate",frozen_at_work_start:"Frozen when work started",scope_changed:"The scope changed",scope_restored:"The scope is as it was again",scope_recorded:"Noted the scope",ai_suggested:"The AI suggested a value"};

/* ---------- reading what the server sends (camelCase or snake_case, a summary or a whole row) ---------- */
function scrPick(o,keys){ if(!o) return null; for(var i=0;i<keys.length;i++){ var v=o[keys[i]]; if(v!==undefined&&v!==null) return v; } return null; }
function scrNum(v){ var n=typeof v==="string"&&v.trim()!==""?+v:v; return typeof n==="number"&&isFinite(n)?n:null; }
function scrJson(v){ if(typeof v==="string"){ try{ v=JSON.parse(v); }catch(e){ return null; } } return v&&typeof v==="object"&&!Array.isArray(v)?v:null; }
function scrPropNorm(p,mathValue){ p=scrJson(p); if(!p) return null; var v=scrNum(scrPick(p,["value","finalValue","final_value"])); if(v==null&&p.use==="math") v=mathValue; return {value:v,ratings:scrJson(p.ratings),use:p.use||null,reason:scrPick(p,["reason"])||"",by:scrPick(p,["by","proposedBy","proposed_by","actor","actorId","actor_id"]),at:scrPick(p,["at","proposedAt","proposed_at","createdAt","created_at"])}; }
/* a Row of GET /api/tasks/:id/scoring (docs/SMART-SCORING.md §5.2.1: value, math {inputs, steps, low, high…}, locked…),
   a task document's summary ({value, unit, status, source, lockedValue, lockedAt, rev, proposed}), or the table's own
   snake_case columns (math_inputs holding {inputs, steps, …}) */
function scrRowNorm(r,m){ if(!r||typeof r!=="object") return null; var p=function(k){ return scrPick(r,k); };
  var mo=scrJson(r.math), mi=scrJson(p(["mathInputs","math_inputs"])); if(!mo&&mi&&(Array.isArray(mi.steps)||scrJson(mi.inputs))){ mo=mi; mi=null; }
  var mathValue=scrNum(p(["mathValue","math_value"]));
  return {module:p(["module"])||m, mathValue:mathValue, mathInputs:mi||(mo&&scrJson(mo.inputs))||{}, mathLow:mo?scrNum(mo.low):null, mathHigh:mo?scrNum(mo.high):null,
    aiValue:scrNum(p(["aiValue","ai_value"])), finalValue:scrNum(p(["finalValue","final_value","final","value"])), source:p(["source"]), status:p(["status"])||"draft", locked:typeof r.locked==="boolean"?r.locked:null,
    factors:scrJson(p(["factors","ratings"]))||{}, lockedValue:scrNum(p(["lockedValue","locked_value"])), lockedAt:p(["lockedAt","locked_at"]), lockedBy:p(["lockedBy","locked_by"]),
    approvedBy:p(["approvedBy","approved_by"]), approvedAt:p(["approvedAt","approved_at"]), proposal:scrPropNorm(p(["proposal"]),mathValue), proposed:r.proposed===true,
    updatedBy:p(["updatedBy","updated_by"]), updatedAt:p(["updatedAt","updated_at"]), rev:scrNum(p(["rev"]))||0, steps:Array.isArray(r.steps)?r.steps:(mo&&Array.isArray(mo.steps)?mo.steps:null)}; }
/* an Audit entry ({id, module, action, by (null: the server), impersonatedBy, at, reason, from, to, meta}; from/to are snapshots) */
function scrAuditNorm(a){ a=a||{}; var p=function(k){ return scrPick(a,k); }; return {action:p(["action"])||"",module:p(["module"])||"",by:p(["by","actor","actorId","actor_id"]),as:p(["impersonatedBy","impersonated_by"]),at:p(["at","createdAt","created_at"]),oldValue:p(["oldValue","old_value","from"]),newValue:p(["newValue","new_value","to"]),reason:p(["reason"])||""}; }

/* the row as known now: the task document's summary or what GET …/scoring answered, the newer of the two */
function scrRow(tk,m){ if(!tk) return null; var a=tk.scoring&&tk.scoring[m]?scrRowNorm(tk.scoring[m],m):null, c=SCR.cache[tk.id], b=c&&c.rows[m]||null;
  if(!a) return b; if(!b||a.rev>b.rev&&!c.local){ if(!b) return a; var o=Object.assign({},b,{locked:null,proposed:a.proposed}); ["finalValue","status","source","lockedValue","lockedAt","lockedBy","approvedBy","approvedAt","rev","updatedBy","updatedAt"].forEach(function(k){ if(a[k]!=null) o[k]=a[k]; }); return o; } return b; }
/* what the panel shows: the row, or — before Smart Scoring has a row for the task — the task's own estimate */
function scrView(tk,m){ var r=scrRow(tk,m); if(r) return r; var e=m==="hours"&&+tk.effort>0;
  return {module:m,synthetic:true,mathValue:null,mathInputs:{},mathLow:null,mathHigh:null,aiValue:null,finalValue:e?+tk.effort:null,source:e?scrLegacySrc(tk):null,status:e?"unverified":"draft",locked:null,factors:{},lockedValue:null,lockedAt:null,lockedBy:null,approvedBy:null,approvedAt:null,proposal:null,proposed:false,updatedBy:null,updatedAt:null,rev:0,steps:null}; }
/* where the task's estimate came from before Smart Scoring (as the server's backfill reads it) */
function scrLegacySrc(tk){ var m=tk.meta||{}, a=m.effortAuto; if(a&&a.src==="ai") return "ai"; if(a&&(a.src==="history"||a.src==="kind"||a.kind)) return "math"; if(m.effortManual) return "manual"; return "legacy"; }
/* locked = approved (by an approver), locked (not approved: frozen when work started, or changed after the lock) or
   rebaseline_needed (the scope changed since); the server's own `locked` says so when it is sent */
function scrLocked(r){ if(!r) return false; if(typeof r.locked==="boolean") return r.locked; if(r.status==="locked"||r.status==="approved"||r.status==="rebaseline_needed") return true; return !!r.lockedAt&&r.status!=="draft"&&r.status!=="unverified"&&r.status!=="proposed"; }
function scrLockedValue(r){ return r.lockedValue!=null?r.lockedValue:r.finalValue; }

/* ---------- a locked hour estimate, for every place the Estimate is typed (src/drawer.js, src/tasks.js, the Effort line) ---------- */
function scoringEstimateLock(tk){ if(!tk||tk._draft||typeof scoringModuleOn!=="function"||!scoringModuleOn("hours")) return null; var r=scrRow(tk,"hours"); if(!scrLocked(r)) return null;
  return {by:r.approvedBy||r.lockedBy||null,at:r.approvedAt||r.lockedAt||null,value:scrLockedValue(r),approved:!!r.approvedBy,title:scrLockTitle(r)}; }
/* who holds it and since when: approved and locked by an approver; locked by someone who changed it after the lock, or
   frozen when work started — those two not approved yet; and whether the scope has changed since */
function scrLockShort(r){ var st=r.status, ap=r.approvedBy, by=ap||r.lockedBy, at=r.approvedAt||r.lockedAt, name=by?person(by).name:"";
  var head=st==="approved"||ap?(by?fmt(tr("Approved and locked by {name}"),{name:name}):tr("Approved and locked"))
    :st==="locked"&&!r.lockedBy?tr("Frozen when work started"):by?fmt(tr("Locked by {name}"),{name:name}):tr("Locked");
  return head+(at?" · "+scrDate(at):"")+(st==="locked"&&!ap?" · "+tr("not approved yet"):"")+(st==="rebaseline_needed"?" · "+tr("the scope changed since: it needs a new baseline"):""); }
function scrLockTitle(r){ return scrLockShort(r)+". "+tr("Change it under Scoring & Intelligence on the Brief tab."); }
function scrLockIcon(lk){ return lk?'<span class="scr-lock-ico" title="'+attr(lk.title)+'" aria-label="'+attr(lk.title)+'" role="img">'+I.lock+'</span>':''; }

/* ---------- numbers and words ---------- */
function scrHalf(v){ return v>0?Math.max(0.5,Math.round(v*2)/2):0; }
function scrFmt(m,v){ if(v==null||!isFinite(v)) return "—"; if(m==="hours") return scrHalf(+v)+" h"; if(m==="story") return Math.round(+v)+" "+tr("SP"); return (+v).toFixed(2)+" "+tr("pts"); }
function scrDate(iso){ var d=new Date(iso); return isNaN(d.getTime())?"":d.toLocaleDateString(UI_LANG==="id"?"id-ID":"en-US",{day:"numeric",month:"short",year:"numeric"}); }
function scrWhen(iso){ return iso?ago(0,iso):""; }
function scrWho(id){ return id?'<span data-no-translate>'+esc(person(id).name)+'</span>':tr("The system"); }
function scrSrcChip(src){ return src&&SCR_SRC[src]?'<span class="scr-chip scr-src-'+src+'" data-scr-src="'+src+'" title="'+attr(tr(SCR_SRC_WHY[src]))+'">'+tr(SCR_SRC[src])+'</span>':''; }
function scrStChip(st){ return '<span class="scr-chip scr-st-'+attr(st)+'" data-scr-status="'+attr(st)+'">'+tr(SCR_ST[st]||st)+'</span>'; }
function scrFactorName(f){ return tr(SCR_FACTOR_NAMES[f]||f); }
/* the Scope rating the assets produced suggest: 1 → 1, 2–3 → 2, 4–6 → 3, 7–12 → 4, 13 or more → 5; none recorded, no suggestion */
function scrScopeFromAssets(n){ n=Math.round(+n||0); if(n<1) return null; return n<=1?1:n<=3?2:n<=6?3:n<=12?4:5; }

/* ---------- what this person may do: the server's `can`, or the page's mirror until it has answered ---------- */
function scrCanLocal(tk){ var ed=canI.scoringEditTask(tk), pr=canI.scoringPropose(tk), ap=canI.scoringApproveEstimate(tk), blocked=null;
  if(!ap&&has("scoring_approve_estimate")) blocked=scoringStakeholder()?"stakeholder":scoringActingAs()?"impersonating":isAssignee(tk,ME)?"assignee":null;
  return {calculate:pr||ed,propose:pr,edit:ed,approve:ap,rebaseline:ap,requestAi:canI.scoringRequestAi(tk),blocked:blocked}; }
/* GET …/scoring's can: {calculate, propose, edit, approve, rebaseline, requestAi, …, approveBlocked} (also per module, or
   in the predicates' names) */
function scrCan(tk,m){ var c=SCR.cache[tk.id], k=c&&c.can; if(!k) return scrCanLocal(tk); var o=k[m]&&typeof k[m]==="object"?k[m]:k;
  var b=function(names,d){ for(var i=0;i<names.length;i++) if(typeof o[names[i]]==="boolean") return o[names[i]]; return d; };
  var edit=b(["edit","editTask","scoringEditTask"],false), propose=b(["propose","scoringPropose"],false), approve=b(["approve","approveEstimate","scoringApproveEstimate"],false);
  return {calculate:b(["calculate"],propose||edit),propose:propose,edit:edit,approve:approve,rebaseline:b(["rebaseline"],approve),requestAi:b(["requestAi","ai","scoringRequestAi"],false),blocked:typeof (k.approveBlocked||o.approveBlocked)==="string"?(k.approveBlocked||o.approveBlocked):null}; }
/* GET …/scoring's context: what the server counts with — the kind it reads in the title, the assets produced, the open
   dependencies, the Scope the assets suggest, whether a reason is required; the page's own reading until it answers */
function scrCtx(tk){ var c=SCR.cache[tk.id]; return c&&c.context&&typeof c.context==="object"?c.context:{}; }
function scrCtxKind(tk){ var x=scrCtx(tk).kind; return typeof x==="string"&&x?x:scrKind(tk); }
function scrCtxDeps(tk){ var x=scrNum(scrCtx(tk).openDeps); return x!=null?x:scrOpenDeps(tk); }
function scrScopeSug(tk){ var s=scrCtx(tk).scope, n=assetCount(tk); if(s&&typeof s==="object"&&!s.assumed&&scrNum(s.value)!=null) return {v:scrNum(s.value),n:scrNum(s.assetCount)||n}; var v=scrScopeFromAssets(n); return v?{v:v,n:n}:null; }
function scrNeedReason(tk){ var x=scrCtx(tk).requireReason; if(typeof x==="boolean") return x; var s=scoringSettings(); return !!(s&&s.overrides.requireReason); }
/* whether a complexity rating was given (the server says where each input came from) */
function scrRated(mi){ if(!mi||mi.complexityRated===false||mi.complexitySource==="default") return null; return scrNum(scrPick(mi,["complexity1to5","complexity"])); }

/* ---------- the engine, in the page ---------- */
function scrEngine(){ return typeof ScoringEngine!=="undefined"?ScoringEngine:null; }
function scrKind(tk){ return typeof estKindOf==="function"?estKindOf(tk):null; }
function scrKindName(id){ return id?(typeof estKindName==="function"?estKindName(id):id):tr("not recognised"); }
function scrUnits(tk){ return Math.max(1,Math.round(assetCount(tk))); }
function scrOpenDeps(tk){ return typeof unresolvedDependencies==="function"?unresolvedDependencies(tk).length:0; }
/* the hour estimate's inputs: the kind chosen (else the title's), the Assets produced as the deliverables, the open
   dependencies — or, with several kinds of work (meta.kinds, src/scoring-kinds.js), each kind with its own count */
function scrMix(tk){ return typeof kmixOf==="function"?kmixOf(tk):null; }
function scrMixIn(mix){ return mix.map(function(x){ return {kind:x.k,units:x.n}; }); }
function scrHoursInputs(tk,o){ o=o||{}; var mix=scrMix(tk), inp={kind:mix?null:("kind" in o?o.kind:scrCtxKind(tk))||null,units:scrUnits(tk),complexity1to5:scrNum(o.complexity1to5),openDeps:scrCtxDeps(tk)};
  if(mix) inp.mix=scrMixIn(mix); return inp; }
function scrCompute(m,inp){ var E=scrEngine(), s=typeof scoringSettings==="function"?scoringSettings():null; if(!E||!s) return null;
  if(m==="hours") return inp&&inp.mix&&typeof kmixEngine==="function"?kmixEngine(s.hours,inp):E.hours(s.hours,inp); if(m==="story") return E.storyPoints(s.story,inp); return E.weightedPoints(s.weighted,inp); }
/* a stored row's math again, from its own inputs — when the server did not send its steps */
function scrComputeRow(tk,m,r){ if(r.mathValue==null) return null; if(m==="hours"){ var mi=r.mathInputs||{}, cx=scrRated(mi), mix=scrMix(tk), deps=scrNum(scrPick(mi,["openDeps","dependencies"]))||0;
    if(mix) return scrCompute("hours",{mix:scrMixIn(mix),complexity1to5:cx,openDeps:deps});
    return scrCompute("hours",{kind:mi.kind||scrKind(tk),units:scrNum(scrPick(mi,["units","deliverables"]))||scrUnits(tk),complexity1to5:cx,openDeps:deps}); }
  return scrCompute(m,r.factors||{}); }
/* the hours of each kind of a mix: what the server worked out (GET …/scoring `mix`, for the mix it has: `kinds`), else
   the page's own reading of the workspace's templates */
function scrMixHours(tk){ var mix=scrMix(tk); if(!mix) return null; var c=SCR.cache[tk.id], sv=c&&Array.isArray(c.mix)?c.mix:null;
  if(sv&&sv.length&&(!Array.isArray(c.kinds)||typeof kmixClean!=="function"||kmixSame(kmixClean(c.kinds),mix))){ var by={};
    sv.forEach(function(x){ if(x&&typeof x==="object"){ var k=x.kind||x.k; if(typeof k==="string") by[k]=scrNum(scrPick(x,["hours","h","value"])); } });
    if(mix.every(function(x){ return x.k in by; })) return mix.map(function(x){ return {k:x.k,n:x.n,h:by[x.k]}; }); }
  var h=typeof kmixHours==="function"?kmixHours(tk,mix):null; return h?h.per:mix.map(function(x){ return {k:x.k,n:x.n,h:null}; }); }
function scrMixLine(tk){ var per=scrMixHours(tk); if(!per) return "";
  return fmt(tr("Deliverables by kind: {list}"),{list:per.map(function(x){ var nm=scrKindName(x.k); return x.h!=null?fmt(tr("{kind} {n} ({h} h)"),{kind:nm,n:x.n,h:scrHalf(x.h)}):nm+" "+x.n; }).join(", ")}); }
/* one step of an explanation, in the person's language: fill(tr(key), vars) — a factor's or a kind's name in its words
   ({factor} is also a plain number in some sentences: a multiplier) */
function scrStep(st){ var E=scrEngine(); if(!E||!st||!st.key) return ""; var name=function(x){ return SCR_FACTOR_NAMES[x]?String(scrFactorName(x)).toLowerCase():String(x); };
  return E.fill(tr(st.key),st.vars||{},function(v,k){
    if(k==="factor"&&typeof v==="string") return name(v); if(k==="factors"&&typeof v==="string") return v.split(/,\s*/).map(name).join(", ");
    if(k==="kind"&&typeof v==="string") return scrKindName(v); return typeof v==="number"?String(E.round2(v)):String(v); }); }
function scrStepsHtml(steps){ return steps&&steps.length?'<ol class="scr-steps">'+steps.map(function(s){ return '<li>'+esc(scrStep(s))+'</li>'; }).join("")+'</ol>':''; }

/* ---------- the routes (and the same answers in the page without a server) ---------- */
function scrPath(id,rest){ return "/api/tasks/"+encodeURIComponent(id)+"/scoring"+(rest?"/"+rest:""); }
function scrApi(method,path,body){ return API.on?apiFetch(method,path,body):scrDemo(method,path,body); }
/* what changes make the details worth asking for again: the summaries the task carries, its estimate, its assets */
function scrSig(tk){ var s=tk.scoring||{}, k=tk.meta&&tk.meta.kinds; return [+tk.effort||0,assetCount(tk)].concat(SCR_MODULES.map(function(m){ var x=s[m]; return x?(scrNum(x.rev)||0)+":"+(x.status||""):"-"; })).join("|")+scrAiSig(tk)+(Array.isArray(k)&&k.length?"|mix:"+scrRaw(k):""); }
/* a task with an AI suggestion is asked again after each of its saves: a new title, brief, description, label or team
   makes the suggestion one for the task as it was (stale), and only the server can say so */
function scrAiSig(tk){ var c=SCR.cache[tk.id], r=c&&c.ai&&c.ai.rows; return r&&(r.hours||r.story||r.weighted)?"|ai:"+(tk.updatedAt||""):""; }
function scrRespRow(d,m){ if(!d) return null; if(d.row) return scrRowNorm(d.row,m); if(d.rows&&d.rows[m]) return scrRowNorm(d.rows[m],m); return null; }
function scrStore(id,d,m){ if(!d||typeof d!=="object") return; var c=SCR.cache[id]||(SCR.cache[id]={rows:{},audit:[],can:null,at:0,sig:""}); c.raw=null;
  /* a slow answer never puts back an older row: rev only grows */
  var put=function(k,r){ var old=c.rows[k]; if(r&&old&&r.rev<old.rev) return; c.rows[k]=r; };
  var rows=Array.isArray(d.rows)?d.rows.reduce(function(o,x){ if(x&&x.module) o[x.module]=x; return o; },{}):d.rows;
  if(rows&&typeof rows==="object") SCR_MODULES.forEach(function(k){ if(k in rows) put(k,rows[k]?scrRowNorm(rows[k],k):null); });
  if(d.row){ var r=scrRowNorm(d.row,m); if(r&&SCR_MODULES.indexOf(r.module)>=0) put(r.module,r); }
  if(Array.isArray(d.audit)) c.audit=d.audit.slice(0,50); if(d.can&&typeof d.can==="object") c.can=d.can;
  if("efficiency" in d) c.efficiency=d.efficiency; if("outcomes" in d) c.outcomes=d.outcomes; if("ai" in d) c.ai=d.ai&&typeof d.ai==="object"?d.ai:null;
  /* several kinds of work: the mix the server counts with (or null) and each kind's hours, for the hours row */
  if("kinds" in d) c.kinds=Array.isArray(d.kinds)?d.kinds:null; var hm=d.rows&&!Array.isArray(d.rows)&&d.rows.hours&&d.rows.hours.mix; if("mix" in d||hm) c.mix=Array.isArray(d.mix)?d.mix:Array.isArray(hm)?hm:null;
  if(d.context&&typeof d.context==="object") c.context=d.context; if(d.on&&typeof d.on==="object") c.on=d.on; c.local=!API.on; c.at=Date.now();
  /* the task's summaries follow, so every view of the task (grid, details) agrees with the panel */
  var tk=task(id); if(tk){ tk.scoring=tk.scoring&&typeof tk.scoring==="object"?tk.scoring:{}; SCR_MODULES.forEach(function(k){ var x=c.rows[k]; if(x) tk.scoring[k]={finalValue:x.finalValue,status:x.status,source:x.source,lockedValue:x.lockedValue,lockedAt:x.lockedAt,lockedBy:x.lockedBy,approvedBy:x.approvedBy,approvedAt:x.approvedAt,rev:x.rev}; }); c.sig=scrSig(tk); } }
/* stale-while-revalidate: the panel is drawn at once from what is cached, then asked for again in the background; an
   answer the same as the last one (c.raw, which any write clears) draws nothing again, another one only the panel,
   in place (scrPaint) */
function scrRaw(d){ try{ return JSON.stringify(d); }catch(e){ return null; } }
function scrLoad(tk,force){ var id=tk.id; if(SCR.busy[id]&&!force) return SCR.busy[id];
  var p=scrApi("GET",scrPath(id)).then(function(d){ var c=SCR.cache[id], raw=scrRaw(d), same=!!c&&raw!=null&&c.raw===raw&&!SCR.err[id], before=scoringEstimateLock(task(id));
      scrStore(id,d); if(SCR.cache[id]) SCR.cache[id].raw=raw; delete SCR.err[id]; var lc=!!before!==!!scoringEstimateLock(task(id)); if(!same||lc) scrPaint(id,lc); })
    .catch(function(e){ var t=task(id); SCR.err[id]={msg:e&&e.message||String(e),at:Date.now(),sig:t?scrSig(t):""}; scrPaint(id); })
    .then(function(){ if(SCR.busy[id]===p) delete SCR.busy[id]; });
  SCR.busy[id]=p; return p; }
/* asked for each time the task is opened (closing the panel forgets SCR.shown), and again when it changed (its
   summaries, estimate or assets) */
function scrMaybeLoad(tk){ var c=SCR.cache[tk.id], sig=scrSig(tk), e=SCR.err[tk.id], want=!c||c.sig!==sig||SCR.shown!==tk.id; SCR.shown=tk.id; if(!want||SCR.busy[tk.id]) return;
  if(!c&&e&&e.sig===sig&&Date.now()-e.at<30000) return; scrLoad(tk); }

/* ---------- drawing ---------- */
function scrShow(tk){ return !!tk&&!tk._draft&&typeof scoringOn==="function"&&scoringOn()&&!scoringStakeholder(); }
function scrOpen(){ return !!myPrefs().scoringPanelOpen; }
function scrHash(s){ var h=0x811c9dc5; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; } return h.toString(36); }
function scrTimeRow(tk){ if(typeof scoringTimeRowHtml!=="function"||!scoringModuleOn("hours")) return ""; try{ return scoringTimeRowHtml(tk)||""; }catch(e){ console.error(e); return ""; } }
function scrHook(name,tk,arg){ var f=window[name]; if(typeof f!=="function") return ""; try{ return f(tk,arg)||""; }catch(e){ console.error(e); return ""; } }
function scrSummaryLine(tk,mods){ var parts=mods.map(function(m){ var r=scrView(tk,m), lk=scrLocked(r), v=lk?scrLockedValue(r):r.finalValue; return v==null?"":scrFmt(m,v)+(lk?" "+I.lock:""); }).filter(Boolean);
  var props=mods.filter(function(m){ return scrView(tk,m).proposal; }).length;
  return (parts.length?parts.join(" · "):tr("Not scored yet"))+(props?" · "+props+" "+tr(props===1?"proposal waiting":"proposals waiting"):""); }
/* folded, the body is left empty (it is hidden then): it is drawn as the panel is opened (scrToggle) */
function scrPanelHtml(tk,timeRow){ var mods=SCR_MODULES.filter(function(m){ return scoringModuleOn(m); }), open=scrOpen(), sum=scrSummaryLine(tk,mods), inner=open?scrBodyHtml(tk,mods,timeRow):"";
  return '<section class="scr-panel'+(open?' open':'')+'" data-scr-task="'+attr(tk.id)+'" data-scr-h="'+scrHash(sum+inner)+'">'
    +'<button type="button" class="scr-head" aria-expanded="'+(open?"true":"false")+'" onclick="scrToggle(this)">'+I.gauge+'<b>'+tr("Scoring & Intelligence")+'</b><span class="scr-sum">'+sum+'</span>'+I.chevd+'</button>'
    +'<div class="scr-body">'+inner+'</div></section>'; }
function scrBodyHtml(tk,mods,timeRow){ var c=SCR.cache[tk.id];
  var rows=mods.map(function(m){ return scrRowHtml(tk,m)+(m==="hours"&&timeRow?'<div class="scr-hook" data-scr-hook="time">'+timeRow+'</div>':''); }).join("")+scrCtxHtml(tk)+scrDocsHtml(tk,mods);
  var assets=scrHook("scoringAssetsRowHtml",tk), outcomes=scrHook("scoringOutcomesRowHtml",tk);
  /* Phase 3, the efficiency bonus line goes here — "Estimated 8h · Actual 5h · Saved 3h · Base 8 pts · Efficiency Bonus
     +1.10 pts · Earned 9.10 pts · Pending/Approved" — from GET …/scoring `efficiency`, which the server sends only to
     the people credited, the approvers and scoring_view_analytics holders. Not built yet. */
  var eff=scrHook("scoringEfficiencyLineHtml",tk,c&&c.efficiency);
  var err=SCR.err[tk.id]&&!c?'<p class="hint scr-err">'+tr("Could not load the latest scores")+' — '+esc(SCR.err[tk.id].msg)+'</p>':'';
  return rows+(assets?'<div class="scr-hook" data-scr-hook="assets">'+assets+'</div>':'')+(eff?'<div class="scr-hook scr-eff" data-scr-hook="efficiency">'+eff+'</div>':'')
    +(outcomes?'<div class="scr-hook" data-scr-hook="outcomes">'+outcomes+'</div>':'')+err
    +'<div class="scr-foot"><button type="button" class="btn xs ghost" data-scr-act="audit" onclick="scrAudit('+jsq(tk.id)+')">'+I.clock+tr("Scoring history")+'</button></div>'; }
function scrBtn(tk,m,act,label,fn,cls,extra){ return '<button type="button" class="btn xs'+(cls?" "+cls:"")+'" data-scr-act="'+act+'" data-scr-m="'+m+'"'+(extra||"")+(fn?' onclick="'+fn+'('+jsq(tk.id)+',\''+m+'\')"':'')+'>'+tr(label)+'</button>'; }
function scrRowHtml(tk,m){ var r=scrView(tk,m), can=scrCan(tk,m), lk=scrLocked(r), fin=lk?scrLockedValue(r):r.finalValue, aiOn=scoringMode(m)!=="math_only", key=tk.id+"|"+m, open=!!SCR.why[key];
  var vals='<div class="scr-vals">'
    +'<div class="scr-val" data-scr-v="math"><span class="scr-k">'+tr("Math baseline")+'</span><b>'+scrFmt(m,r.mathValue)+'</b>'+(r.mathValue==null?'<span class="hint">'+tr("Not calculated yet")+'</span>':scrSrcChip("math"))+'</div>'
    +'<div class="scr-val" data-scr-v="ai">'+scrAiCell(tk,m,aiOn)+'</div>'
    +'<div class="scr-val" data-scr-v="final"><span class="scr-k">'+tr(lk?"Locked value":"Final value")+'</span><b>'+scrFmt(m,fin)+'</b>'+scrSrcChip(r.source)+'</div></div>';
  var info=[];
  if(m==="hours"){ var mi=r.mathInputs||{}, cx=r.mathValue!=null?scrRated(mi):null, n=assetCount(tk), deps=scrCtxDeps(tk), mixLine=scrMixLine(tk);
    info.push(kindPickHtml(tk,canI.editTask(tk),"panel"));
    info.push(cx?fmt(tr("Complexity {n} of 5"),{n:cx}):tr("Complexity not rated"));
    /* with several kinds, each kind's count is its deliverables (not the Assets produced) */
    info.push(mixLine?'<span data-scr-in="mix">'+esc(mixLine)+'</span>':'<span data-scr-in="deliverables">'+(n?n+" "+tr(n===1?"deliverable":"deliverables"):tr("No assets produced recorded yet — counted as 1"))+'</span> '+tr("from")+' <button type="button" class="scr-link" onclick="setTab(\'files\')">'+tr("Assets produced")+'</button>');
    info.push(deps===1?tr("1 open dependency"):fmt(tr("{n} open dependencies"),{n:deps}));
    if(!lk&&+tk.effort>0&&fin!=null&&scrHalf(+tk.effort)!==scrHalf(fin)) info.push(fmt(tr("The task's Estimate is {h} h"),{h:scrHalf(+tk.effort)})); }
  else { var f=r.factors||{}, rated=SCR_FACTORS.filter(function(x){ return scrNum(f[x])!=null; }), sug=scrScopeSug(tk);
    info.push(rated.length?SCR_FACTORS.map(function(x){ return scrFactorName(x)+" "+(scrNum(f[x])!=null?f[x]:"—"); }).join(" · "):tr("Not rated yet"));
    if(sug) info.push('<span data-scr-in="scope-suggestion">'+fmt(tr("Scope suggested from {n} assets produced: {v}"),{n:sug.n,v:sug.v})+'</span>'); }
  var prop=r.proposal?'<div class="scr-prop" data-scr-proposal>'+tr("Proposed")+' <b>'+scrFmt(m,r.proposal.value)+'</b>'+(r.proposal.use==="math"?' ('+tr("the math baseline")+')':'')+' '+tr("by")+' '+scrWho(r.proposal.by)+(r.proposal.reason?': <span data-no-translate>“'+esc(r.proposal.reason)+'”</span>':'')+(r.proposal.at?' <span class="hint">'+esc(scrWhen(r.proposal.at))+'</span>':'')+'</div>':'';
  var lockLine=lk?'<div class="scr-in scr-locked-line">'+I.lock+'<span>'+esc(scrLockShort(r))+'</span></div>':'';
  var when=r.updatedAt||r.updatedBy?'<div class="scr-when">'+tr("Last change")+': '+scrWho(r.updatedBy)+(r.updatedAt?' · '+esc(scrWhen(r.updatedAt)):'')+'</div>':'';
  /* an approver who may not approve this one says why: assigned to it, or acting as someone else */
  var held=!can.approve&&(can.blocked==="assignee"||can.blocked==="impersonating")&&r.status!=="approved"?'<p class="hint scr-held" data-scr-held="'+can.blocked+'">'+tr(can.blocked==="assignee"?"You are assigned to this task, so someone else approves its estimate.":"Estimates are never approved while acting as someone else.")+'</p>':'';
  var acts=[];
  if(can.calculate) acts.push(scrBtn(tk,m,"calculate","Calculate","scrCalc","primary"));
  if(aiOn) acts.push(scrAiBtn(tk,m,can));
  if(can.edit) acts.push(scrBtn(tk,m,"change","Change value","scrChange"));
  else if(can.propose) acts.push(scrBtn(tk,m,"propose","Propose change","scrChange"));
  /* what is not approved yet can be: a draft, a proposal, an estimate from before, a baseline frozen at work start */
  if(can.approve&&r.status!=="approved"&&r.status!=="rebaseline_needed"&&(fin!=null||r.proposal)) acts.push(scrBtn(tk,m,"approve",r.proposal?"Review & lock":"Approve & lock","scrApprove"));
  if(can.rebaseline&&lk) acts.push(scrBtn(tk,m,"rebaseline","Re-baseline","scrRebase"));
  acts.push(scrBtn(tk,m,"explain","Explanation","scrWhyToggle","ghost",' aria-expanded="'+(open?"true":"false")+'"'));
  return '<div class="scr-row" data-scr-module="'+m+'"><div class="scr-rhead"><b>'+tr(SCR_NAMES[m])+'</b>'+scrStChip(r.status)+'</div>'+vals
    +'<p class="scr-in">'+info.join('<span class="scr-dot">·</span>')+'</p>'+(m==="hours"&&typeof kindMixSlotHtml==="function"?kindMixSlotHtml(tk,canI.editTask(tk),"panel"):'')+(aiOn?scrAiCardHtml(tk,m,can,lk):'')+prop+lockLine+when+held
    +(open?'<div class="scr-why" data-scr-why="'+m+'">'+scrWhyHtml(tk,m,r)+'</div>':'')
    +'<div class="scr-acts">'+acts.join("")+'</div></div>'; }
/* the explanation: the math, step by step, then where the final value came from and what holds it */
function scrWhyHtml(tk,m,r){ var steps=r.steps; if(!steps||!steps.length){ var res=scrComputeRow(tk,m,r); steps=res&&res.steps; }
  var out=steps&&steps.length?'<b>'+tr("How the math baseline is worked out")+'</b>'+scrStepsHtml(steps):'<p>'+tr("Not calculated yet. Calculate works it out from the workspace's templates and this task.")+'</p>';
  var lk=scrLocked(r), fin=lk?scrLockedValue(r):r.finalValue, s=[];
  if(m==="hours"&&r.mathValue!=null&&scrHalf(r.mathValue)!==r.mathValue) s.push(fmt(tr("Hours are shown to the nearest half hour: {v}."),{v:scrFmt("hours",r.mathValue)}));
  if(fin!=null){ var src=r.source;
    s.push(src==="math"?fmt(tr("The final value {v} is the math baseline."),{v:scrFmt(m,fin)})
      :src==="ai"?fmt(tr("The final value {v} came from the AI's suggestion."),{v:scrFmt(m,fin)})
      :src==="manual"?fmt(tr("The final value {v} was set by a person."),{v:scrFmt(m,fin)})
      :src==="legacy"?fmt(tr("The final value {v} is the task's estimate from before Smart Scoring."),{v:scrFmt(m,fin)})
      :fmt(tr("The final value is {v}."),{v:scrFmt(m,fin)})); }
  if(r.status==="unverified") s.push(tr("Nobody has checked it since Smart Scoring was turned on; an approver can lock it."));
  if(lk) s.push(scrLockShort(r)+".");
  if(r.status==="rebaseline_needed") s.push(tr("The task's scope changed after it was locked: it needs a new baseline."));
  if(r.proposal) s.push(fmt(tr("A change to {v} is waiting for an approver."),{v:scrFmt(m,r.proposal.value)}));
  return out+(s.length?'<p class="scr-why-more">'+s.map(esc).join(" ")+'</p>':''); }

/* redrawn in place when the details arrive: nothing else in the task moves, and focus stays where it was */
function scrPaint(id,lockChanged){ var tk=task(id); if(!tk||S.drawerTask!==id||S.drawerTab!=="brief"||!scrShow(tk)) return;
  var el=document.querySelector('#drawer .scr-panel[data-scr-task="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'); if(!el) return;
  var tmp=document.createElement("div"); tmp.innerHTML=scrPanelHtml(tk,scrTimeRow(tk)); var nu=tmp.firstElementChild;
  if(nu.getAttribute("data-scr-h")!==el.getAttribute("data-scr-h")){ var ae=document.activeElement, kk=ae&&el.contains(ae)&&ae.getAttribute("data-scr-key"), fk=ae&&el.contains(ae)?(ae.getAttribute("data-scr-act")?'[data-scr-act="'+ae.getAttribute("data-scr-act")+'"][data-scr-m="'+(ae.getAttribute("data-scr-m")||"")+'"]':ae.classList.contains("scr-head")?".scr-head":null):null;
    el.replaceWith(nu); if(typeof localizeVisibleText==="function") localizeVisibleText(nu); if(kk) scrKeep(nu,ae,kk); else if(fk){ var f=nu.querySelector(fk); if(f){ try{ f.focus({preventScroll:true}); }catch(x){ f.focus(); } } } }
  scrPaintLock(tk); if(lockChanged&&S.screen==="tasks"&&typeof renderScreen==="function") renderScreen(false); }
/* the Estimate inputs follow the lock where they stand */
function scrLockInput(inp,lk,ed){ if(!inp) return; var wrap=inp.parentNode, ico=wrap&&wrap.querySelector(".scr-lock-ico");
  if(lk){ inp.disabled=true; inp.title=lk.title; inp.setAttribute("data-scr-lock","1"); inp.setAttribute("aria-label",tr("Estimate")+" — "+lk.title); if(ico) ico.title=lk.title; else inp.insertAdjacentHTML("afterend",scrLockIcon(lk)); }
  else if(inp.getAttribute("data-scr-lock")){ inp.removeAttribute("data-scr-lock"); inp.removeAttribute("title"); inp.removeAttribute("aria-label"); inp.disabled=!ed; if(ico) ico.remove(); } }
function scrPaintLock(tk){ var lk=scoringEstimateLock(tk), ed=canI.editTask(tk)&&!tk._draft;
  scrLockInput(document.querySelector('#drawer [data-meta="effort"] .v input'),lk,ed);
  var line=document.querySelector("#drawer .enh-blocks .effort"); if(line) scrLockInput(line.querySelector("input"),lk,ed); }
/* the body is drawn as the panel opens and emptied as it folds, as a folded panel is drawn (scrPanelHtml); the head
   button, which has the focus, stays */
function scrToggle(btn){ var p=myPrefs(), on=!p.scoringPanelOpen; p.scoringPanelOpen=on; saveMyPrefs(); var el=btn.closest(".scr-panel");
  if(el){ var tk=task(el.getAttribute("data-scr-task")), body=el.querySelector(".scr-body");
    if(tk&&body){ var mods=SCR_MODULES.filter(function(m){ return scoringModuleOn(m); }), inner=on?scrBodyHtml(tk,mods,scrTimeRow(tk)):"";
      body.innerHTML=inner; if(on&&typeof localizeVisibleText==="function") localizeVisibleText(body); el.setAttribute("data-scr-h",scrHash(scrSummaryLine(tk,mods)+inner)); }
    el.classList.toggle("open",on); }
  btn.setAttribute("aria-expanded",on?"true":"false"); }
function scrWhyToggle(id,m){ var k=id+"|"+m; SCR.why[k]=!SCR.why[k]; scrPaint(id); }

/* ---------- Calculate: the hour estimate's inputs, or the four ratings, with the result worked out as they change ---------- */
function scrRateField(f,cur,sug){ var seg=segHtml([1,2,3,4,5].map(function(v){ return [String(v),String(v)]; }),cur?String(cur):"","scrRate.bind(null,'"+f+"')")
    .replace(/>([1-5])<\/button>/g,function(x,d){ return ' type="button" title="'+attr(d+" — "+tr(SCR_LEVELS[f][d-1]))+'">'+d+'</button>'; });
  return '<div class="field scr-rate" id="scrRate_'+f+'" data-scr-factor="'+f+'"><label>'+scrFactorName(f)+'</label>'+seg
    +'<p class="hint scr-lvl" id="scrLvl_'+f+'">'+(cur?cur+" — "+esc(tr(SCR_LEVELS[f][cur-1])):tr("Not rated yet"))+'</p>'
    +(sug?'<p class="hint scr-sugg" data-scr-sugg="'+sug.v+'">'+fmt(tr("Suggested from {n} assets produced: {v}"),{n:sug.n,v:sug.v})+'</p>':'')+'</div>'; }
function scrCalc(id,m){ var tk=task(id); if(!tk) return; var r=scrView(tk,m), s=scoringSettings(), body;
  var other=function(f){ var o=SCR_MODULES.filter(function(x){ return x!==m&&x!=="hours"; }).map(function(x){ return scrRow(tk,x); }).filter(Boolean)[0]; return o&&scrNum(o.factors&&o.factors[f]); };
  if(m==="hours"){ var mi=r.mathInputs||{}, cx=r.mathValue!=null?scrRated(mi):null;
    if(!cx){ var st=scrRow(tk,"story")||scrRow(tk,"weighted"); cx=st&&scrNum(st.factors&&st.factors.complexity); }
    var mix=scrMix(tk);
    SCR.rate={id:id,m:m,kind:mix?"":mi.kind||scrCtxKind(tk)||"",mix:mix,r:{complexity:cx||null}};
    var kinds=s.kinds.filter(function(k){ return k.active; }).map(function(k){ return k.id; }), n=assetCount(tk), deps=scrCtxDeps(tk);
    /* several kinds: the mix, as it is — no single kind to pick here, so nothing replaces it without a word */
    body=(mix?'<div class="field" data-scr-mix><label>'+tr("Kinds of work")+'</label><p class="scr-in" id="scrKindMix"><span class="scr-chip">'+tr("Mixed")+'</span><span data-no-translate>'+esc(kmixText(mix))+'</span></p>'
        +'<p class="hint">'+tr("Calculated with this task's mix: each kind's hours added up, then complexity and open dependencies once. One kind is not chosen here, so the mix stays as it is.")
        +' <button type="button" class="scr-link" data-scr-act="mix-edit" onclick="closeModal();kmixOpen('+jsq(id)+',\'panel\')">'+tr("Change the mix")+'</button></p></div>'
      :'<div class="field"><label for="scrKind">'+tr("Kind of work")+'</label>'
      +kindDropdownHtml({key:"rate",id:"scrKind",field:true,kinds:kinds,value:SCR.rate.kind,placeholder:tr("Choose the kind of work"),pick:function(v){ SCR.rate.kind=v; scrPreview(); }})
      +'<p class="hint">'+tr(scrCtxKind(tk)?"Recognised from the title; change it if it is something else.":"The title does not say what kind of work it is: choose one.")+'</p></div>')
      +scrRateField("complexity",SCR.rate.r.complexity)
      +'<div class="field"><label>'+tr("Deliverables")+'</label><p class="scr-in" data-scr-in="deliverables">'+(mix?esc(scrMixLine(tk)):(n?n+" "+tr(n===1?"deliverable":"deliverables"):tr("No assets produced recorded yet — counted as 1"))+' · '+tr("the task's Assets produced")+' <button type="button" class="scr-link" onclick="closeModal();setTab(\'files\')">'+tr("Change under Assets & versions")+'</button>')+'</p></div>'
      +'<div class="field"><label>'+tr("Open dependencies")+'</label><p class="scr-in">'+(deps===1?tr("1 open dependency"):fmt(tr("{n} open dependencies"),{n:deps}))+'</p></div>'; }
  else { var f=r.factors||{}, rs={}, sug=scrScopeSug(tk);
    SCR_FACTORS.forEach(function(x){ rs[x]=scrNum(f[x])||other(x)||null; });
    if(!rs.complexity){ var h=scrRow(tk,"hours"); if(h&&h.mathValue!=null) rs.complexity=scrRated(h.mathInputs)||null; }
    if(!rs.scope&&sug) rs.scope=sug.v;
    SCR.rate={id:id,m:m,r:rs};
    body='<p class="hint">'+tr("Rate the task from 1 to 5 on each. The result follows the workspace's weights and thresholds.")+'</p>'
      +SCR_FACTORS.map(function(x){ return scrRateField(x,rs[x],x==="scope"?sug:null); }).join(""); }
  openModal(fmt(tr("Calculate {module}"),{module:tr(SCR_NAMES[m])}),'<div class="scr-calc" data-scr-calc="'+m+'">'+body+'<div class="scr-preview" id="scrPreview" aria-live="polite"></div></div>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="scrGo" onclick="scrCalcGo()">'+tr("Calculate")+'</button>');
  scrPreview(); }
function scrRate(f,v){ var st=SCR.rate; if(!st) return; v=+v; st.r[f]=v; var box=document.getElementById("scrRate_"+f);
  if(box) box.querySelectorAll(".seg button").forEach(function(b){ b.classList.toggle("on",b.textContent.trim()===String(v)); });
  var l=document.getElementById("scrLvl_"+f); if(l) l.textContent=v+" — "+tr(SCR_LEVELS[f][v-1]); scrPreview(); }
function scrRateInputs(tk,st){ if(st.m==="hours") return scrHoursInputs(tk,{kind:st.kind||null,complexity1to5:st.r.complexity}); var o={}; SCR_FACTORS.forEach(function(f){ if(st.r[f]) o[f]=st.r[f]; }); return o; }
function scrPreview(){ var st=SCR.rate, el=document.getElementById("scrPreview"); if(!st||!el) return; var tk=task(st.id); if(!tk) return; var res=scrCompute(st.m,scrRateInputs(tk,st));
  var v=res&&res.value, range=st.m==="hours"&&res&&res.low!=null?'<span class="hint">'+tr("usual range")+' '+scrHalf(res.low)+'–'+scrHalf(res.high)+' h</span>':'';
  el.innerHTML='<div class="scr-pv-head"><span>'+tr("Result")+'</span><b data-scr-preview>'+scrFmt(st.m,v)+'</b>'+range+(st.m==="story"&&res&&res.split?'<span class="scr-chip scr-st-proposed">'+tr("Consider splitting")+'</span>':'')+'</div>'+scrStepsHtml(res&&res.steps); }
/* POST …/calculate: hours {kind, complexity} — the server counts the assets produced and the open dependencies itself;
   points {ratings} */
function scrCalcGo(){ var st=SCR.rate; if(!st) return; var tk=task(st.id); if(!tk) return closeModal(); var m=st.m;
  if(m!=="hours"&&SCR_FACTORS.some(function(f){ return !st.r[f]; })) return toast(tr("Rate every factor first"),"bad");
  if(m==="hours"&&!st.kind&&!st.mix) return toast(tr("Choose the kind of work first"),"bad");
  /* with a mix the server counts the task's own (meta.kinds): no kind is sent to replace it */
  var inputs=st.mix?{}:{kind:st.kind}; if(m==="hours"&&st.r.complexity) inputs.complexity=st.r.complexity;
  var body=m==="hours"?{module:m,inputs:inputs}:{module:m,ratings:scrRateInputs(tk,st)}, b=document.getElementById("scrGo"); if(b) b.disabled=true;
  scrApi("POST",scrPath(tk.id,"calculate"),body).then(function(d){ closeModal(); SCR.rate=null; SCR.why[tk.id+"|"+m]=true; scrAfter(tk,m,d,"Calculated"); })
    .catch(function(e){ if(b) b.disabled=false; scrFail(tk,e); }); }

/* ---------- Change value / Propose a change, Approve & lock, Re-baseline ---------- */
function scrValueInput(m,cur,extra){ var s=scoringSettings();
  if(m==="story") return '<select id="scrVal"'+(extra||'')+'>'+s.story.scale.map(function(v){ return '<option value="'+v+'"'+(+cur===v?' selected':'')+'>'+v+'</option>'; }).join("")+'</select>';
  var min=m==="hours"?0.5:1, max=m==="hours"?s.hours.bounds.max:s.weighted.scaleMax;
  return '<div class="scr-unit-in"><input type="number" id="scrVal" min="'+min+'" max="'+max+'" step="'+(m==="hours"?"0.5":"0.25")+'" value="'+(cur!=null?(m==="hours"?scrHalf(cur):(+cur).toFixed(2)):"")+'"'+(extra||'')+'><span>'+(m==="hours"?"h":tr("pts"))+'</span></div>'; }
/* the value typed, checked against the module's range: a number, or null after saying what is wrong */
function scrValueRead(m){ var s=scoringSettings(), v=scrNum((document.getElementById("scrVal")||{}).value), max=m==="hours"?s.hours.bounds.max:m==="story"?13:s.weighted.scaleMax, min=m==="hours"?s.hours.bounds.min:1;
  if(v==null||v<min||v>max){ toast(fmt(tr("Enter a value from {min} to {max}"),{min:min,max:max}),"bad"); return null; } return v; }
function scrReasonRead(){ return String((document.getElementById("scrWhy")||{}).value||"").trim().slice(0,1000); }
function scrReasonField(need,ph){ return '<div class="field"><label for="scrWhy">'+tr("Reason")+(need?'':' ('+tr("optional")+')')+'</label><textarea id="scrWhy" rows="3" maxlength="1000" placeholder="'+attr(tr(ph||"Why this value?"))+'"></textarea></div>'; }
/* PUT …/:module {value | use:"math", reason, rev}: with scoring_edit_task the value is set (applied), else proposed */
function scrChange(id,m){ var tk=task(id); if(!tk) return; var r=scrView(tk,m), can=scrCan(tk,m), lk=scrLocked(r), mine=!!can.edit, need=!mine||scrNeedReason(tk);
  var cur=lk?scrLockedValue(r):(r.finalValue!=null?r.finalValue:r.mathValue), math=r.mathValue!=null&&(m==="hours"?scrHalf(r.mathValue):r.mathValue);
  var why=mine?(lk?"The estimate is locked: your value replaces the locked one, and both stay in the history.":"Saved as a value set by a person, with your reason, in the history.")
    :"Your change goes to an approver as a proposal. The current value stays until it is approved.";
  SCR.useMath=false;
  openModal(mine?"Change value":"Propose a change",'<p class="hint">'+tr(why)+'</p><div class="field"><label for="scrVal">'+tr(SCR_NAMES[m])+'</label>'+scrValueInput(m,cur,' oninput="SCR.useMath=false" onchange="SCR.useMath=false"')
    +(math!==false&&math!==cur?'<button type="button" class="scr-link scr-usemath" data-scr-usemath onclick="SCR.useMath=true;var i=document.getElementById(\'scrVal\');if(i)i.value='+(m==="weighted"?'\''+(+math).toFixed(2)+'\'':math)+'">'+fmt(tr("Use the math baseline ({v})"),{v:scrFmt(m,r.mathValue)})+'</button>':'')+'</div>'
    +scrReasonField(need),
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="scrGo" onclick="scrChangeGo('+jsq(id)+',\''+m+'\','+(need?1:0)+')">'+tr(mine?"Save":"Propose")+'</button>'); }
function scrChangeGo(id,m,need){ var tk=task(id); if(!tk) return closeModal(); var useMath=!!SCR.useMath, v=useMath?null:scrValueRead(m), why=scrReasonRead();
  if(!useMath&&v==null) return; if(need&&!why) return toast(tr("Write a reason for the change"),"bad");
  var r=scrView(tk,m), b=document.getElementById("scrGo"); if(b) b.disabled=true;
  scrApi("PUT",scrPath(tk.id,m),useMath?{use:"math",reason:why,rev:r.rev||0}:{value:v,reason:why,rev:r.rev||0}).then(function(d){ closeModal(); SCR.useMath=false; var row=scrRespRow(d,m);
      var proposed=d&&d.applied===false||!!(d&&d.proposed)||(!(d&&d.applied===true)&&!!(row&&row.proposal&&row.finalValue!==row.proposal.value));
      scrAfter(tk,m,d,proposed?"Change proposed — an approver will look at it":"Saved"); })
    .catch(function(e){ if(b) b.disabled=false; scrFail(tk,e); }); }
/* a list of values to choose from; "other" has its own input */
function scrChoices(m,opts){ return opts.map(function(o,i){ return '<label class="scr-opt" data-scr-opt="'+o.k+'"><input type="radio" name="scrPick" value="'+i+'"'+(i===0?' checked':'')+'><span>'+(o.k==="other"?'<span>'+esc(o.label)+'</span>'+scrValueInput(m,o.v,' onfocus="var p=this.closest(\'.scr-opt\').querySelector(\'input[type=radio]\');if(p)p.checked=true"'):'<span data-no-translate>'+esc(o.label)+'</span>')+'</span></label>'; }).join(""); }
function scrPicked(){ var p=document.querySelector('#modal input[name="scrPick"]:checked'); return (SCR.pick||[])[p?+p.value:0]||null; }
function scrPropLabel(m,p){ return tr("Proposed")+" "+scrFmt(m,p.value)+" "+tr("by")+" "+person(p.by).name+(p.reason?": “"+p.reason+"”":""); }
/* POST …/:module/approve {rev, useProposal?}: the current value, or the proposal */
function scrApprove(id,m){ var tk=task(id); if(!tk) return; var r=scrView(tk,m), opts=[];
  if(r.proposal&&r.proposal.value!=null) opts.push({k:"proposal",label:scrPropLabel(m,r.proposal)});
  if(r.finalValue!=null) opts.push({k:"final",label:(r.status==="locked"&&!r.lockedBy?tr("The baseline frozen when work started"):tr("Current value"))+" "+scrFmt(m,r.finalValue)+(r.source&&SCR_SRC[r.source]?" ("+tr(SCR_SRC[r.source])+")":"")});
  if(!opts.length) return toast(tr("Calculate or set a value first"),"bad");
  SCR.pick=opts;
  openModal("Approve & lock",'<p>'+tr("Once locked, this is the task's baseline: only people allowed to change any task's scores can change it, and a change of scope asks for a new baseline.")+'</p>'
    +scrChoices(m,opts)+(m==="hours"?'<p class="hint">'+tr("The task's Estimate becomes the locked value.")+'</p>':''),
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="scrGo" onclick="scrApproveGo('+jsq(id)+',\''+m+'\')">'+tr("Approve & lock")+'</button>'); }
function scrApproveGo(id,m){ var tk=task(id); if(!tk) return closeModal(); var o=scrPicked(); if(!o) return;
  var r=scrView(tk,m), b=document.getElementById("scrGo"), body={rev:r.rev||0}; if(o.k==="proposal") body.useProposal=true; if(b) b.disabled=true;
  scrApi("POST",scrPath(tk.id,m+"/approve"),body).then(function(d){ closeModal(); SCR.pick=null; scrAfter(tk,m,d,"Approved and locked"); })
    .catch(function(e){ if(b) b.disabled=false; scrFail(tk,e); }); }
/* POST …/:module/rebaseline {reason, rev, value | use:"math" | useProposal}: a new approved lock now, by the caller */
function scrRebase(id,m){ var tk=task(id); if(!tk) return; var r=scrView(tk,m), cur=scrLockedValue(r), opts=[{k:"current",label:tr("Keep")+" "+scrFmt(m,cur)}];
  if(r.proposal&&r.proposal.value!=null) opts.unshift({k:"proposal",label:scrPropLabel(m,r.proposal)});
  if(r.mathValue!=null&&(m==="hours"?scrHalf(r.mathValue):r.mathValue)!==cur) opts.push({k:"math",label:tr("Math baseline")+" "+scrFmt(m,r.mathValue)});
  opts.push({k:"other",v:cur,label:tr("Another value")});
  SCR.pick=opts;
  openModal("Re-baseline",'<p>'+tr("A new baseline is approved and locked now, by you. The one it replaces stays in the history.")+'</p>'+scrChoices(m,opts)+scrReasonField(true,"What changed?"),
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="scrGo" onclick="scrRebaseGo('+jsq(id)+',\''+m+'\')">'+tr("Re-baseline")+'</button>'); }
function scrRebaseGo(id,m){ var tk=task(id); if(!tk) return closeModal(); var o=scrPicked(); if(!o) return; var why=scrReasonRead();
  var r=scrView(tk,m), body={reason:why,rev:r.rev||0};
  if(o.k==="proposal") body.useProposal=true; else if(o.k==="math") body.use="math"; else if(o.k==="other"){ var v=scrValueRead(m); if(v==null) return; body.value=v; }
  if(!why) return toast(tr("Write a reason for the change"),"bad");
  var b=document.getElementById("scrGo"); if(b) b.disabled=true;
  scrApi("POST",scrPath(tk.id,m+"/rebaseline"),body).then(function(d){ closeModal(); SCR.pick=null; scrAfter(tk,m,d,"New baseline approved and locked"); })
    .catch(function(e){ if(b) b.disabled=false; scrFail(tk,e); }); }
/* after a write: its answer is the whole view and the task as the server now has it (docs/SMART-SCORING.md §5.2) — the
   task's copy is replaced, the panel kept, everything drawn again; only an answer without the view asks again */
function scrAfter(tk,m,d,msg){ if(d&&d.task&&typeof d.task==="object"&&typeof hTask==="function"){ var keep=tk.scoring; replaceInto(tk,hTask(d.task)); if(!tk.scoring&&keep) tk.scoring=keep; if(typeof AN!=="undefined") AN=null; }
  scrStore(tk.id,d,m); var r=SCR.cache[tk.id]&&SCR.cache[tk.id].rows.hours;
  if(m==="hours"&&!(d&&d.task)&&r&&scrLocked(r)&&scrLockedValue(r)!=null) tk.effort=scrLockedValue(r);
  if(SCR.cache[tk.id]) SCR.cache[tk.id].sig=scrSig(tk);
  if(msg) toast(tr(msg)); refresh(); if(API.on&&!(d&&d.rows)) scrLoad(tk,true); }
function scrFail(tk,e){ toast(e&&e.message||tr("Could not save"),"bad"); scrLoad(tk,true); }

/* ---------- the AI's suggestion: Ask AI, what it says, Accept, Dismiss (server/scoring-ai.js) ---------- */
var SCR_AI_WARN={far:"Far from the calculation ({math}): check it before taking it.",low_confidence:"Low confidence: under the workspace's minimum of {min}%.",no_confidence:"The AI did not say how sure it is.",
  no_math:"Nothing calculated to compare it with yet.",stale:"The task changed since this suggestion: ask the AI again.",kind_differs:"The AI reads it as {ai}; the title says {title}.",deliverables_differ:"The AI counted {ai} deliverables; the task has {task}."};
var SCR_AI_GAPS={no_description:"No description",no_brief:"No brief filled in",no_deliverables:"No assets produced recorded (counted as 1)",no_kind:"The title does not say what kind of work it is"};
var SCR_AI_NOTE={cached:"The AI's earlier answer, for the task as it is now: it was not asked again.",external_off:"External AI processing is off in Settings → AI, so only the math is shown.",
  not_configured:"No AI chat model is set up in Settings → AI, so only the math is shown.",quota_user:"You have used your {n} AI suggestions for today, so the math stands.",
  quota_workspace:"The workspace has used its {n} AI suggestions for today, so the math stands.",invalid_reply:"The AI's answer could not be used, so the math stands.",
  timeout:"The AI did not answer in time, so the math stands.",provider_error:"The AI could not be reached, so the math stands.",offline:"The AI needs the server: the offline demo shows the math only.",
  missing:"The AI gave no usable value for this score."};
function scrAiInfo(tk){ var c=SCR.cache[tk.id]; return c&&c.ai&&typeof c.ai==="object"?c.ai:null; }
function scrAiOf(tk,m){ var a=scrAiInfo(tk), s=a&&a.rows&&a.rows[m]; return s&&typeof s==="object"&&scrNum(s.value)!=null?s:null; }
function scrPct(v){ return Math.round(Math.max(0,Math.min(1,+v||0))*100); }
/* Dismiss is this person's: the suggestion folds away on this device until the AI suggests something else */
function scrAiHides(){ if(SCR.aiHide) return SCR.aiHide; var o={}; try{ o=JSON.parse(localStorage.getItem("zc_scr_ai_hide")||"{}")||{}; }catch(e){ o={}; } SCR.aiHide=o&&typeof o==="object"?o:{}; return SCR.aiHide; }
function scrAiHidden(tk,m,s){ return !!s&&scrAiHides()[tk.id+"|"+m]===s.runId; }
function scrAiHideSet(id,m,runId){ var h=scrAiHides(), k=id+"|"+m; if(runId) h[k]=runId; else delete h[k]; var keys=Object.keys(h); if(keys.length>200) keys.slice(0,keys.length-200).forEach(function(x){ delete h[x]; }); try{ localStorage.setItem("zc_scr_ai_hide",JSON.stringify(h)); }catch(e){} }
function scrAiConf(s){ if(s.shownConfidence==null) return scrSrcChip("ai"); var low=s.far||s.lowConfidence;
  return '<span class="scr-chip scr-src-ai'+(low?' scr-ai-low':'')+'" data-scr-conf="'+scrPct(s.shownConfidence)+'" title="'+attr(tr(SCR_SRC_WHY.ai))+'">'+fmt(tr("{n}% sure"),{n:scrPct(s.shownConfidence)})+'</span>'; }
/* the AI cell of a row: math only, being asked, not asked yet, or the suggestion with how sure it is */
/* being asked for this score: on its own, or with every score the AI is asked for ("all", Send & ask again) */
function scrAiBusy(id,m){ var b=SCR.aiBusy[id]; return !!b&&(b===m||b==="all"); }
function scrAiCell(tk,m,aiOn){ var head='<span class="scr-k">'+tr("AI suggestion")+'</span>', s=scrAiOf(tk,m), busy=scrAiBusy(tk.id,m);
  if(!aiOn) return head+'<b>—</b><span class="hint">'+tr("Math only")+'</span>';
  if(busy) return head+'<b><span class="scr-spin" aria-hidden="true"></span>…</b><span class="hint" role="status">'+tr("Asking the AI…")+'</span>';
  if(!s) return head+'<b>—</b><span class="hint">'+tr("Not asked yet")+'</span>';
  return head+'<b data-scr-ai-value>'+scrFmt(m,s.value)+'</b>'+scrAiConf(s)+(scrAiHidden(tk,m,s)?'<button type="button" class="scr-link" data-scr-act="ai-show" data-scr-m="'+m+'" onclick="scrAiShow('+jsq(tk.id)+',\''+m+'\')">'+tr("Show the suggestion")+'</button>':''); }
/* Ask AI: for whoever may ask the AI; not while it is being asked, nor while external AI processing is off */
function scrAiBtn(tk,m,can){ var a=scrAiInfo(tk), busy=!!SCR.aiBusy[tk.id], off=!!a&&a.external===false, ok=!!can.requestAi&&!busy&&!off;
  var why=!can.requestAi?tr("Asking the AI needs the permission to ask the AI for a task's scores."):off?tr("External AI processing is off in Settings → AI."):"";
  return '<button type="button" class="btn xs" data-scr-act="ai" data-scr-m="'+m+'"'+(ok?' onclick="scrAskAi('+jsq(tk.id)+',\''+m+'\')"':' disabled')+(why?' title="'+attr(why)+'"':'')+(scrAiBusy(tk.id,m)?' aria-busy="true"':'')+'>'
    +(scrAiBusy(tk.id,m)?'<span class="scr-spin" aria-hidden="true"></span>'+tr("Asking…"):I.sparkle+(scrAiOf(tk,m)?tr("Ask AI again"):tr("Ask AI")))+'</button>'; }
function scrAiWarnText(m,w){ var t=tr(SCR_AI_WARN[w.code]||w.code);
  if(w.code==="far") return fmt(t,{math:scrFmt(m,w.math)}); if(w.code==="low_confidence") return fmt(t,{min:scrPct(w.min)});
  if(w.code==="kind_differs") return fmt(t,{ai:scrKindName(w.ai),title:scrKindName(w.title)}); if(w.code==="deliverables_differ") return fmt(t,{ai:w.ai,task:w.task}); return t; }
/* what was said after the last ask (or by the last request made in the background): the cache, a quota, AI off, an answer not used */
function scrAiNoteText(n){ if(!n||!n.code) return ""; var t=fmt(tr(SCR_AI_NOTE[n.code]||SCR_AI_NOTE.provider_error),{n:n.n!=null?n.n:""});
  if(n.resetAt){ var d=new Date(n.resetAt); if(!isNaN(d.getTime())) t+=" "+fmt(tr("The next one is possible from {when}."),{when:d.toLocaleString(UI_LANG==="id"?"id-ID":"en-US",{weekday:"short",hour:"2-digit",minute:"2-digit"})}); }
  return t; }
function scrAiNoteOf(tk,m){ var n=SCR.aiNote[tk.id+"|"+m]; if(n) return n; var a=scrAiInfo(tk), l=a&&a.last, s=scrAiOf(tk,m);
  if(l&&l.background&&l.status!=="ok"&&l.status!=="cached"&&(!s||(l.at&&s.at&&l.at>s.at))) return {code:l.reason||"provider_error"}; return null; }
function scrAiNoteFrom(r,m){ if(!r||!r.status) return null; var st=r.status;
  if(st==="ok"||st==="cached"){ if((r.missingModules||[]).indexOf(m)>=0) return {code:"missing"}; return st==="cached"?{code:"cached"}:null; }
  if(st==="quota"){ var q=r.quota||{}, part=r.reason==="quota_user"?q.user:q.workspace; return {code:r.reason==="quota_user"?"quota_user":"quota_workspace",n:part?part.limit:null,resetAt:part?part.resetAt:null}; }
  if(st==="off") return {code:r.reason==="offline"?"offline":r.reason||"external_off"};
  return {code:r.reason||(st==="timeout"?"timeout":st==="invalid"?"invalid_reply":"provider_error")}; }
/* the suggestion itself: how sure, the warnings, why, what it assumed, what the task does not say, Accept and Dismiss */
function scrAiCardHtml(tk,m,can,lk){ var s=scrAiOf(tk,m), a=scrAiInfo(tk), nt=scrAiNoteText(scrAiNoteOf(tk,m)), note=nt?'<p class="hint scr-ai-note" data-scr-ai-note="'+attr((scrAiNoteOf(tk,m)||{}).code)+'" role="status">'+esc(nt)+'</p>':'';
  if(!s||scrAiHidden(tk,m,s)) return note;
  var li=function(x){ return '<li data-no-translate>'+esc(x)+'</li>'; };
  var warns=(s.warnings||[]).map(function(w){ return '<li data-scr-warn="'+attr(w.code)+'">'+esc(scrAiWarnText(m,w))+'</li>'; }).join("");
  var gaps=(a&&a.gaps||[]).map(function(g){ return '<li data-scr-gap="'+attr(g)+'">'+esc(tr(SCR_AI_GAPS[g]||g))+'</li>'; }).join("")+(s.missing||[]).map(li).join("");
  var conf=s.shownConfidence!=null?fmt(tr("Confidence {n}%"),{n:scrPct(s.shownConfidence)})+(s.far&&s.confidence!=null?" — "+fmt(tr("lowered from {n}%, far from the calculation"),{n:scrPct(s.confidence)}):""):tr("Confidence not given");
  var by=s.by||s.requestedBy, who=s.background?tr("Asked again after the brief changed"):s.trigger==="create"?tr("Asked when the task was created"):by?fmt(tr("Asked by {name}"),{name:person(by).name}):tr("Asked");
  var fx=m!=="hours"&&s.factors?SCR_FACTORS.filter(function(f){ return scrNum(s.factors[f])!=null; }).map(function(f){ return scrFactorName(f)+" "+s.factors[f]; }).join(" · "):"";
  var n=(s.comparables||[]).length, meta=esc(who)+(s.at?' · '+esc(scrWhen(s.at)):'')+(n?' · '+esc(fmt(n===1?tr("compared with {n} finished task"):tr("compared with {n} finished tasks"),{n:n})):'');
  /* after a re-ask: what it was before and why it changed (the team's context); each assumption marked right or wrong */
  var pv=scrAiPrev(tk,m,s), eff=scrAiEffect(tk,s), bold=function(v){ return '<b>'+esc(scrFmt(m,v))+'</b>'; }, ctx=scrCtxOn(tk), ced=ctx&&scrCtxCanEdit(tk), cur=ctx&&scrCtxCur(tk,!ced);
  var delta=(pv!=null?'<p class="scr-ai-delta" data-scr-ai-delta="'+m+'">'+(scrFmt(m,pv)===scrFmt(m,s.value)?fmt(esc(tr("Same as before: {v}")),{v:bold(pv)}):fmt(esc(tr("Before {a} → now {b}")),{a:bold(pv),b:bold(s.value)}))+'</p>':'')
    +(eff?'<p class="scr-ai-effect" data-scr-ai-effect>'+esc(tr("Because of the team's context:"))+' <span data-no-translate>'+esc(eff)+'</span></p>':'');
  var acts=[];
  if(!lk&&s.acceptable!==false&&(can.edit||can.propose)) acts.push('<button type="button" class="btn xs primary" data-scr-act="ai-accept" data-scr-m="'+m+'" onclick="scrAiAccept('+jsq(tk.id)+',\''+m+'\')">'+(can.edit?tr("Accept"):tr("Propose it"))+'</button>');
  acts.push('<button type="button" class="btn xs ghost" data-scr-act="ai-dismiss" data-scr-m="'+m+'" onclick="scrAiDismiss('+jsq(tk.id)+',\''+m+'\')">'+tr("Dismiss")+'</button>');
  return '<div class="scr-ai'+(s.far?' far':'')+'" data-scr-ai="'+m+'">'
    +'<div class="scr-ai-head">'+I.sparkle+'<b>'+fmt(tr("The AI suggests {v}"),{v:scrFmt(m,s.value)})+'</b><span class="scr-ai-conf'+(s.far||s.lowConfidence?' scr-ai-low':'')+'" data-scr-ai-conf>'+esc(conf)+'</span></div>'
    +delta+(warns?'<ul class="scr-ai-warn" data-scr-warns>'+warns+'</ul>':'')
    +(s.explanation?'<p class="scr-ai-text" data-no-translate>'+esc(s.explanation)+'</p>':'')
    +(fx?'<p class="scr-ai-fx">'+tr("The AI's ratings")+': '+esc(fx)+'</p>':'')+(m==="hours"?scrAiMixHtml(tk):'')
    +(s.assumptions&&s.assumptions.length?'<div class="scr-ai-list" data-scr-ai-assumptions><b>'+tr("It assumes")+'</b><ul>'+s.assumptions.map(function(x,i){ return ctx?scrAsmHtml(tk,m,i,x,cur,ced):li(x); }).join("")+'</ul></div>':'')
    +(gaps?'<div class="scr-ai-list" data-scr-ai-missing><b>'+tr("Missing inputs")+'</b><ul>'+gaps+'</ul></div>':'')
    +(lk?'<p class="hint">'+tr("The estimate is locked: the AI's suggestion is shown beside it, never applied. Re-baseline it to change it.")+'</p>':'')
    +'<p class="hint scr-ai-meta">'+meta+'</p>'+note+'<div class="scr-acts">'+acts.join("")+'</div></div>'; }
/* the split the AI proposes when the work spans several kinds (its reply's `mix`, kept with the suggestion): shown when
   it is not the task's own mix, with "Use this split" for whoever may edit the task — it sets meta.kinds, as the mix
   editor does (src/scoring-kinds.js) */
function scrAiMixOf(tk){ var s=scrAiOf(tk,"hours"), a=scrAiInfo(tk), raw=s&&Array.isArray(s.mix)&&s.mix.length?s.mix:a&&Array.isArray(a.mix)?a.mix:null;
  var l=raw&&typeof kmixClean==="function"?kmixClean(raw):[]; return l.length>=2?l:null; }
function scrAiMixHtml(tk){ var am=scrAiMixOf(tk); if(!am||kmixSame(am,scrMix(tk))) return "";
  return '<div class="scr-ai-mix" data-scr-ai-mix><span>'+esc(fmt(tr("The AI suggests: {mix}"),{mix:kmixText(am)}))+'</span>'
    +(canI.editTask(tk)&&!tk._draft?'<button type="button" class="btn xs" data-scr-act="ai-mix" data-scr-m="hours" onclick="scrAiMix('+jsq(tk.id)+')">'+tr("Use this split")+'</button>':'')+'</div>'; }
function scrAiMix(id){ var tk=task(id), am=tk&&scrAiMixOf(tk); if(!am||typeof kmixUse!=="function") return;
  kmixUse(id,am).then(function(r){ if(r!==false) toast(tr("The AI's split is set")); }); }
/* the finished tasks like it that the estimator found (src/effort-estimate.js): the server decides whether the AI sees them */
function scrAiComparables(tk){ try{ var e=typeof effortEstimate==="function"?effortEstimate(tk):null; return e&&Array.isArray(e.ids)?e.ids.slice(0,5):[]; }catch(x){ return []; } }
/* m is one score or "all" (every score the AI is asked for: one ask, one of the quota); ctx, the team's context, is
   saved by the server first (Send & ask again) */
function scrAskAi(id,m,ctx){ var tk=task(id); if(!tk||SCR.aiBusy[id]) return; var mods=m==="all"?scrCtxAiMods():[m]; SCR.aiBusy[id]=m; mods.forEach(function(x){ delete SCR.aiNote[id+"|"+x]; }); scrPaint(id);
  var body={module:m,trigger:"ask",comparables:scrAiComparables(tk),lang:UI_LANG==="id"?"id":"en"}; if(ctx) body.context=ctx;
  scrApi("POST",scrPath(id,"ai"),body).then(function(d){ delete SCR.aiBusy[id]; delete SCR.ctx.busy[id];
      var r=d&&d.aiResult||{}, said=false; (Array.isArray(r.modules)&&r.modules.length?r.modules:mods).forEach(function(x){ var n=scrAiNoteFrom(r,x); if(n){ SCR.aiNote[id+"|"+x]=n; said=true; } scrAiHideSet(id,x,null); });
      if(r.runId) SCR.ctx.run[id]={runId:r.runId,previous:r.previous||null,effect:r.contextEffect||""};
      if(ctx){ var dr=SCR.ctx.draft[id]; if(!dr||scrCtxKey(dr)===scrCtxKey(scrCtxNorm(ctx))) delete SCR.ctx.draft[id]; }
      scrAfter(tk,m,d,null); if(Array.isArray(r.docs)) scrDocsRun(id,r.docs); if(r.status==="ok"&&!said) toast(tr("The AI's suggestion is ready")); })
    .catch(function(e){ delete SCR.aiBusy[id]; delete SCR.ctx.busy[id]; scrFail(tk,e); }); }
function scrAiDismiss(id,m){ var tk=task(id), s=tk&&scrAiOf(tk,m); if(!s) return; scrAiHideSet(id,m,s.runId); scrPaint(id); }
function scrAiShow(id,m){ scrAiHideSet(id,m,null); scrPaint(id); }
/* Accept: PUT …/:module {use:"ai", reason, rev} — set for whoever may change scores, proposed for anyone else on the task;
   a reason when the workspace asks for one, for a proposal, and always for a suggestion far from the calculation */
function scrAiAccept(id,m){ var tk=task(id), s=tk&&scrAiOf(tk,m); if(!s) return; var can=scrCan(tk,m), mine=!!can.edit, need=!mine||scrNeedReason(tk)||!!s.far;
  if(!need) return scrAiAcceptGo(id,m,0);
  var warns=(s.warnings||[]).filter(function(w){ return w.code==="far"||w.code==="low_confidence"; }).map(function(w){ return '<li>'+esc(scrAiWarnText(m,w))+'</li>'; }).join("");
  openModal(mine?"Accept the AI's suggestion":"Propose the AI's suggestion",'<p>'+fmt(tr("{module}: {v}, the AI's suggestion."),{module:tr(SCR_NAMES[m]),v:scrFmt(m,s.value)})+'</p>'
    +(warns?'<ul class="scr-ai-warn">'+warns+'</ul>':'')+'<p class="hint">'+(mine?tr("It becomes the final value, from the AI, with your reason in the history."):tr("Your change goes to an approver as a proposal. The current value stays until it is approved."))+'</p>'
    +scrReasonField(true,s.far?"Why take a value far from the calculation?":"Why take this value?"),
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="scrGo" onclick="scrAiAcceptGo('+jsq(id)+',\''+m+'\',1)">'+(mine?tr("Accept"):tr("Propose"))+'</button>'); }
function scrAiAcceptGo(id,m,need){ var tk=task(id); if(!tk) return closeModal(); var why=need?scrReasonRead():""; if(need&&!why) return toast(tr("Write a reason for the change"),"bad");
  var r=scrView(tk,m), b=document.getElementById("scrGo"); if(b) b.disabled=true;
  scrApi("PUT",scrPath(tk.id,m),{use:"ai",reason:why,rev:r.rev||0}).then(function(d){ if(need) closeModal(); var proposed=!!(d&&d.applied===false); scrAfter(tk,m,d,proposed?"Change proposed — an approver will look at it":"Saved"); })
    .catch(function(e){ if(b) b.disabled=false; scrFail(tk,e); }); }

/* ---------- the team's context for the AI (GET …/scoring ai.context, PUT …/scoring/context, POST …/ai {context}) ----------
   What the brief does not say, from the people doing the work: a note (1,000 characters) and the assumptions of "It
   assumes" marked right or wrong (8 at most; a wrong one with what is true instead, 200 characters), a check matching
   its assumption by its exact text. Kept with the task on the server, sent on every ask for it, and shown to everyone
   who sees the task's scores; changed by whoever may edit the task and is not a stakeholder (ai.context.canEdit).
   Notes left on similar tasks go with it (ai.context.similar, as the comparables setting allows). "Send & ask again"
   saves it and asks at once; "Clear context" saves it empty and asks nothing; each row then says what it was before
   (the suggestion's previous, or aiResult.previous) and why it changed (contextEffect). Hidden where the documents line
   is. What is typed is the page's own until it is sent (SCR.ctx.draft): every redraw keeps it, caret and all. */
SCR.ctx={draft:{},busy:{},run:{}};
var SCR_PREV_KEY={hours:"hours",story:"storyPoints",weighted:"weightedPoints"};
function scrCtxOf(tk){ var a=scrAiInfo(tk), x=a&&a.context; return x&&typeof x==="object"?x:null; }
function scrCtxAiMods(){ return SCR_MODULES.filter(function(m){ return scoringModuleOn(m)&&scoringMode(m)!=="math_only"; }); }
/* only where the AI is asked and may be sent anything, and only from a server that keeps it */
function scrCtxOn(tk){ var a=scrAiInfo(tk); return !!scrCtxOf(tk)&&a.external!==false&&scrCtxAiMods().length>0; }
function scrCtxCanEdit(tk){ var x=scrCtxOf(tk); return x&&typeof x.canEdit==="boolean"?x.canEdit:canI.editTask(tk)&&!scoringStakeholder(); }
function scrCtxMax(tk){ var x=scrCtxOf(tk)||{}; return {note:scrNum(x.maxNote)||1000,checks:scrNum(x.maxChecks)||8}; }
function scrCtxNorm(x){ x=x||{}; return {note:typeof x.note==="string"?x.note:"",checks:(Array.isArray(x.checks)?x.checks:[]).filter(function(c){ return c&&typeof c.a==="string"&&c.a; })
  .map(function(c){ return {a:c.a,ok:c.ok!==false,fix:c.ok===false&&typeof c.fix==="string"?c.fix:""}; })}; }
/* what it says, whatever the order the marks were made in */
function scrCtxKey(x){ return JSON.stringify([x.note.trim(),x.checks.map(function(c){ return JSON.stringify([c.a,c.ok?1:0,c.ok?"":c.fix.trim()]); }).sort()]); }
function scrCtxBody(x){ return {note:x.note.trim(),checks:x.checks.map(function(c){ var f=c.ok?"":c.fix.trim(); return f?{a:c.a,ok:false,fix:f}:{a:c.a,ok:!!c.ok}; })}; }
/* what is shown: what is being written, else what is saved (always what is saved for whoever only reads it) */
function scrCtxCur(tk,saved){ return !saved&&SCR.ctx.draft[tk.id]||scrCtxNorm(scrCtxOf(tk)); }
function scrCtxDirty(tk){ var d=SCR.ctx.draft[tk.id]; return !!d&&scrCtxKey(d)!==scrCtxKey(scrCtxNorm(scrCtxOf(tk))); }
/* an assumption as the server keeps it: trimmed, 200 characters */
function scrCtxCut(s){ return Array.from(String(s||"").trim()).slice(0,200).join(""); }
function scrCtxIdx(list,a){ var k=scrCtxCut(a); for(var i=0;i<list.length;i++) if(list[i].a===a||list[i].a===k) return i; return -1; }
/* the assumptions of the suggestions shown now: a check of none of them is a saved correction */
function scrCtxShown(tk){ var out=[]; scrCtxAiMods().forEach(function(m){ var s=scrAiOf(tk,m); if(s&&!scrAiHidden(tk,m,s)) (s.assumptions||[]).forEach(function(a){ if(typeof a==="string"&&out.indexOf(a)<0) out.push(a); }); }); return out; }
function scrCtxStale(tk){ return scrCtxAiMods().some(function(m){ var s=scrAiOf(tk,m); return !!s&&(s.stale===true||(s.warnings||[]).some(function(w){ return w&&w.code==="stale"; })); }); }
function scrCtxAsk(tk){ var l=scrCtxAiMods(); return !!l.length&&!!scrCan(tk,l[0]).requestAi; }
/* one ask: the one score with a suggestion (or the only one the AI is asked for), else all of them */
function scrCtxTarget(tk){ var l=scrCtxAiMods(), w=l.filter(function(m){ return scrAiOf(tk,m); }); return w.length===1?w[0]:l.length===1?l[0]:"all"; }
function scrCtxSendOk(tk){ if(SCR.aiBusy[tk.id]||SCR.ctx.busy[tk.id]) return false; var d=scrCtxDirty(tk); return scrCtxAsk(tk)?d||scrCtxStale(tk):d; }
/* the previous value of this score and why it changed: kept in GET with the suggestion, or what the ask in this page said */
function scrAiPrev(tk,m,s){ var p=s.previous, r=SCR.ctx.run[tk.id]; if(p==null&&r&&r.runId===s.runId) p=r.previous; if(p&&typeof p==="object") p=scrPick(p,[SCR_PREV_KEY[m],m]); return scrNum(p); }
function scrAiEffect(tk,s){ var e=s.contextEffect, r=SCR.ctx.run[tk.id]; if(!e&&r&&r.runId===s.runId) e=r.effect; return typeof e==="string"?e.trim():""; }
/* an assumption: its two toggles and, when wrong, what is true instead; marked only, for whoever only reads it */
function scrAsmHtml(tk,m,i,a,cur,ed){ var c=cur.checks[scrCtxIdx(cur.checks,a)], st=c?(c.ok?"ok":"wrong"):"", k=m+":"+i, txt='<span data-no-translate>'+esc(a)+'</span>';
  if(!ed) return '<li class="scr-asm" data-st="'+st+'">'+txt+(c?' <span class="scr-asm-mark">'+(c.ok?tr("✓ Right"):tr("✗ Wrong"))+'</span>'+(!c.ok&&c.fix?'<span class="scr-asm-fix" data-no-translate>'+esc(c.fix)+'</span>':''):'')+'</li>';
  var tog=function(ok,label){ var on=!!c&&c.ok===ok; return '<button type="button" class="scr-tog'+(on?' on':'')+'" data-ok="'+(ok?1:0)+'" aria-pressed="'+on+'" data-scr-key="asm:'+k+':'+(ok?1:0)+'" onclick="scrCtxMark('+jsq(tk.id)+',\''+m+'\','+i+','+ok+')">'+label+'</button>'; };
  return '<li class="scr-asm" data-st="'+st+'">'+txt+'<span class="scr-asm-acts">'+tog(true,tr("✓ Right"))+tog(false,tr("✗ Wrong"))+'</span>'
    +(c&&!c.ok?'<input type="text" class="scr-fix" data-scr-key="fix:'+k+'" maxlength="200" value="'+attr(c.fix)+'" placeholder="'+attr(tr("What is true instead…"))+'" aria-label="'+attr(tr("What is true instead…"))+'" oninput="scrCtxFix('+jsq(tk.id)+',\''+m+'\','+i+',this)">':'')+'</li>'; }
function scrCtxListHtml(tk,cur,shown,ed){ var list=cur.checks.map(function(c,i){ return {c:c,i:i}; }).filter(function(x){ return !shown.some(function(a){ return scrCtxIdx([x.c],a)===0; }); });
  if(!list.length) return ""; var q=function(s){ return '<span data-no-translate>'+esc(s)+'</span>'; };
  return '<div class="scr-ctx-saved" data-scr-ctx-saved><b>'+tr("Saved corrections")+'</b><ul>'+list.map(function(x){ var c=x.c;
    return '<li data-st="'+(c.ok?"ok":"wrong")+'"><span>'+(c.ok?fmt(esc(tr("“{a}” — right")),{a:q(c.a)}):c.fix?fmt(esc(tr("“{a}” — wrong; in fact: {fix}")),{a:q(c.a),fix:q(c.fix)}):fmt(esc(tr("“{a}” — wrong")),{a:q(c.a)}))+'</span>'
      +(ed?'<button type="button" class="scr-x" data-scr-key="ctx-rm:'+x.i+'" aria-label="'+attr(tr("Remove"))+'" title="'+attr(tr("Remove"))+'" onclick="scrCtxRemove('+jsq(tk.id)+','+x.i+')">'+I.x+'</button>':'')+'</li>'; }).join("")+'</ul></div>'; }
/* under the rows: the note, the saved corrections, who saved it, the similar tasks' notes going with it, the buttons */
function scrCtxHtml(tk){ if(!scrCtxOn(tk)) return ""; var x=scrCtxOf(tk), ed=scrCtxCanEdit(tk), saved=scrCtxNorm(x), cur=scrCtxCur(tk,!ed), has=!!(saved.note.trim()||saved.checks.length), shown=scrCtxShown(tk);
  var sim=(Array.isArray(x.similar)?x.similar:[]).filter(function(o){ return o&&o.id; }), any=scrCtxAiMods().some(function(m){ return scrAiOf(tk,m); });
  if(!(has||any&&(ed||sim.length))) return "";
  var name=x.byName||(x.by?person(x.by).name:""), id=tk.id, busy=SCR.ctx.busy[id]||SCR.aiBusy[id], mx=scrCtxMax(tk);
  var by=has&&name?'<p class="hint scr-ctx-by" data-scr-ctx-by>'+fmt(esc(tr(x.at?"Context from {name} · {when}":"Context from {name}")),{name:'<span data-no-translate>'+esc(name)+'</span>',when:esc(scrWhen(x.at))})+'</p>':'';
  var simL=sim.length?'<p class="hint scr-ctx-sim" data-scr-ctx-sim="'+sim.length+'">'+esc(fmt(tr(sim.length===1?"+ {n} note from a similar task will be used":"+ {n} notes from similar tasks will be used"),{n:sim.length}))+': '
    +sim.map(function(o){ var t='<span class="mono">'+esc(o.id)+'</span> <span data-no-translate>'+esc(o.title||"")+'</span>'; return task(o.id)?'<button type="button" class="scr-link" data-scr-sim="'+attr(o.id)+'" onclick="openTask('+jsq(o.id)+')">'+t+'</button>':'<span>'+t+'</span>'; }).join(", ")+'</p>':'';
  if(!ed) return '<div class="scr-ctx" data-scr-ctx="ro"><div class="scr-ctx-head">'+I.sparkle+'<b>'+tr("The team's context for the AI")+'</b></div>'
    +(saved.note.trim()?'<p class="scr-ctx-text" data-no-translate>'+esc(saved.note)+'</p>':'')+scrCtxListHtml(tk,saved,shown,false)+by+simL+'</div>';
  var ask=scrCtxAsk(tk), ok=scrCtxSendOk(tk), go=SCR.ctx.busy[id]==="send"||SCR.ctx.busy[id]==="save";
  return '<div class="scr-ctx" data-scr-ctx="edit"><label class="scr-ctx-head" for="scrCtxNote">'+I.sparkle+'<b>'+tr("Add context for the AI")+'</b></label>'
    +'<textarea id="scrCtxNote" class="scr-ctx-in" data-scr-key="ctx-note" rows="3" maxlength="'+mx.note+'" placeholder="'+attr(tr("E.g. this client usually asks for 3 revision rounds; product photos arrive two days before the deadline."))+'" oninput="scrCtxNote('+jsq(id)+',this)">'+esc(cur.note)+'</textarea>'
    +'<div class="scr-ctx-sub"><span class="hint">'+tr("The AI uses this on every Ask AI for this task, and as an example for similar tasks.")+'</span><span class="scr-ctx-n" data-scr-ctx-n>'+scrInt(Array.from(cur.note).length)+' / '+scrInt(mx.note)+'</span></div>'+scrCtxListHtml(tk,cur,shown,true)+by+simL
    +'<div class="scr-acts"><button type="button" class="btn xs primary" data-scr-act="ctx-send" data-scr-key="ctx-send"'+(ok?'':' disabled')+(go?' aria-busy="true"':'')+' onclick="scrCtxSend('+jsq(id)+')">'
    +(go?'<span class="scr-spin" aria-hidden="true"></span>'+tr("Sending…"):ask?I.sparkle+tr("Send & ask again"):tr("Save context"))+'</button>'
    +(has?'<button type="button" class="scr-link scr-ctx-clear" data-scr-act="ctx-clear" data-scr-key="ctx-clear"'+(busy?' disabled':'')+' onclick="scrCtxClear('+jsq(id)+')">'+tr("Clear context")+'</button>':'')+'</div></div>'; }
/* what is written: the page's own until sent; back to what is saved, it is nothing of its own again */
function scrCtxEdit(id){ var tk=task(id); if(!tk) return null; return SCR.ctx.draft[id]||(SCR.ctx.draft[id]=scrCtxNorm(scrCtxOf(tk))); }
function scrCtxDone(id){ var tk=task(id), d=SCR.ctx.draft[id]; if(tk&&d&&!scrCtxDirty(tk)) delete SCR.ctx.draft[id]; }
/* typing redraws nothing: the counter and the button follow where they stand */
function scrCtxSync(id){ scrCtxDone(id); var tk=task(id), box=document.querySelector('#drawer .scr-ctx[data-scr-ctx="edit"]'); if(!tk||!box) return;
  var n=box.querySelector("[data-scr-ctx-n]"), b=box.querySelector('[data-scr-act="ctx-send"]'), cur=scrCtxCur(tk), mx=scrCtxMax(tk);
  if(n) n.textContent=scrInt(Array.from(cur.note).length)+" / "+scrInt(mx.note); if(b&&!b.getAttribute("aria-busy")) b.disabled=!scrCtxSendOk(tk); }
function scrCtxNote(id,el){ var d=scrCtxEdit(id); if(!d) return; d.note=el.value; scrCtxSync(id); }
function scrCtxFix(id,m,i,el){ var tk=task(id), s=tk&&scrAiOf(tk,m), a=s&&(s.assumptions||[])[i], d=a&&scrCtxEdit(id), at=d?scrCtxIdx(d.checks,a):-1; if(at<0) return;
  /* the same assumption in another row's suggestion is the same check */
  d.checks[at].fix=el.value; document.querySelectorAll("#drawer .scr-fix").forEach(function(o){ var k=(o.getAttribute("data-scr-key")||"").split(":"), b=o!==el&&scrAiOf(tk,k[1]); if(b&&scrCtxIdx([d.checks[at]],(b.assumptions||[])[+k[2]])===0) o.value=el.value; }); scrCtxSync(id); }
/* Right or Wrong, or back to unmarked: the same again takes the mark away */
function scrCtxMark(id,m,i,ok){ var tk=task(id), s=tk&&scrAiOf(tk,m), a=s&&(s.assumptions||[])[i]; if(typeof a!=="string") return; var d=scrCtxEdit(id), at=scrCtxIdx(d.checks,a);
  if(at>=0&&d.checks[at].ok===ok) d.checks.splice(at,1); else if(at>=0){ d.checks[at].ok=ok; if(ok) d.checks[at].fix=""; }
  else { var mx=scrCtxMax(tk).checks; if(d.checks.length>=mx){ scrCtxDone(id); return toast(fmt(tr("At most {n} assumptions can be marked"),{n:mx}),"bad"); } d.checks.push({a:scrCtxCut(a),ok:ok,fix:""}); }
  scrCtxDone(id); scrPaint(id); if(!ok){ var f=document.querySelector('#drawer [data-scr-key="fix:'+m+':'+i+'"]'); if(f) try{ f.focus({preventScroll:true}); }catch(x){ f.focus(); } } }
function scrCtxRemove(id,i){ var d=scrCtxEdit(id); if(!d||!d.checks[i]) return; d.checks.splice(i,1); scrCtxDone(id); scrPaint(id); }
/* Send & ask again: saved and asked at once (POST …/ai {context}); without the right to ask the AI, only saved */
function scrCtxSend(id){ var tk=task(id); if(!tk||!scrCtxSendOk(tk)) return; var b=scrCtxBody(scrCtxCur(tk));
  if(!scrCtxAsk(tk)) return scrCtxPut(id,b,tr("Context saved"),"save"); SCR.ctx.busy[id]="send"; scrAskAi(id,scrCtxTarget(tk),b); }
function scrCtxClear(id){ scrCtxPut(id,{note:"",checks:[]},tr("Context cleared"),"clear"); }
/* PUT …/scoring/context {note, checks} → {context}; the suggestion is then one for the task as it was: asked again */
function scrCtxPut(id,body,msg,kind){ var tk=task(id); if(!tk||SCR.ctx.busy[id]||SCR.aiBusy[id]) return; SCR.ctx.busy[id]=kind; scrPaint(id);
  scrApi("PUT",scrPath(id,"context"),body).then(function(d){ delete SCR.ctx.busy[id]; var c=SCR.cache[id], dr=SCR.ctx.draft[id];
      if(c&&c.ai&&d&&d.context&&typeof d.context==="object") c.ai.context=d.context;
      if(!dr||!body.note&&!body.checks.length||scrCtxKey(dr)===scrCtxKey(scrCtxNorm(body))) delete SCR.ctx.draft[id];
      toast(msg); scrPaint(id); scrLoad(tk,true); })
    .catch(function(e){ delete SCR.ctx.busy[id]; scrFail(tk,e); }); }
/* a redraw keeps the field being typed in as the very same element (caret, scroll, undo) with the new one's words
   (another language), and a button its focus */
function scrKeep(root,ae,key){ var f=root.querySelector('[data-scr-key="'+key+'"]'); if(!f) return;
  if((ae.tagName==="TEXTAREA"||ae.tagName==="INPUT")&&f.tagName===ae.tagName&&f!==ae){ var a=ae.selectionStart, b=ae.selectionEnd, t=ae.scrollTop;
    ["placeholder","aria-label","title","maxlength"].forEach(function(k){ var v=f.getAttribute(k); if(v==null) ae.removeAttribute(k); else if(ae.getAttribute(k)!==v) ae.setAttribute(k,v); });
    f.replaceWith(ae); f=ae; try{ f.focus({preventScroll:true}); }catch(x){ f.focus(); } try{ f.setSelectionRange(a,b); }catch(x){} f.scrollTop=t; }
  else { try{ f.focus({preventScroll:true}); }catch(x){ f.focus(); } } }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "✓ Right":"✓ Benar","✗ Wrong":"✗ Salah","What is true instead…":"Yang sebenarnya…","Saved corrections":"Koreksi tersimpan",
  "“{a}” — right":"“{a}” — benar","“{a}” — wrong; in fact: {fix}":"“{a}” — salah; sebenarnya: {fix}","“{a}” — wrong":"“{a}” — salah","Remove":"Hapus",
  "Add context for the AI":"Tambah konteks untuk AI","The team's context for the AI":"Konteks tim untuk AI",
  "E.g. this client usually asks for 3 revision rounds; product photos arrive two days before the deadline.":"Misal: klien ini biasanya minta 3x revisi; foto produk dari klien baru masuk H-2.",
  "The AI uses this on every Ask AI for this task, and as an example for similar tasks.":"AI memakai ini setiap Ask AI di task ini, dan sebagai contoh untuk task serupa.",
  "Send & ask again":"Kirim & tanya ulang","Save context":"Simpan konteks","Sending…":"Mengirim…","Clear context":"Hapus konteks",
  "Context from {name} · {when}":"Konteks dari {name} · {when}","Context from {name}":"Konteks dari {name}",
  "+ {n} note from a similar task will be used":"+ {n} catatan dari task serupa ikut dipakai","+ {n} notes from similar tasks will be used":"+ {n} catatan dari task serupa ikut dipakai",
  "At most {n} assumptions can be marked":"Paling banyak {n} asumsi bisa ditandai","Context saved":"Konteks tersimpan","Context cleared":"Konteks dihapus",
  "Before {a} → now {b}":"Sebelumnya {a} → sekarang {b}","Same as before: {v}":"Sama seperti sebelumnya: {v}","Because of the team's context:":"Karena konteks tim:"
});

/* ---------- the documents in the brief the AI may read (GET …/scoring ai.docs, POST …/ai aiResult.docs) ---------- */
var SCR_DOC_ICO={gdoc:'<svg class="i" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4"/></svg>',gslides:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M12 17v3M8 21h8"/></svg>',
  gsheet:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/></svg>',file:'<svg class="i" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v4h4"/></svg>'};
var SCR_DOC_ST={ready:"read when the AI is asked",not_public:"not shared publicly — set it to “anyone with the link”",too_large:"too large",unsupported:"not supported",error:"could not be read",limit:"not read: the limit for one ask was reached",off:"will not be sent"};
/* why, as the server says it (docs/SMART-SCORING.md §5.4.1); not_public's own words say what to do, "budget" is "cut to fit" */
var SCR_DOC_WHY={over_5mb:"over 5 MB",over_15mb:"over 15 MB",zip_limits:"too much packed inside",type:"this kind of file is not read",no_text:"no text in it (a scan?)",encrypted:"protected by a password",
  zip64:"a file format that is not read",method:"compressed in a way that is not read",timeout:"took too long",redirect_refused:"the link leads outside Google",too_many_redirects:"too many redirects",
  rate_limited:"Google asked to wait: try again later",http:"Google answered with an error",network:"could not be reached",corrupt:"the file is damaged",missing:"the file is no longer on the server",
  part_not_found:"not found in it",part_too_large:"the deck is over 50 MB",part_timeout:"took too long",part_unreadable:"it cannot be read by slide or page"};
function scrDocs(tk){ var a=scrAiInfo(tk), d=a&&a.docs; return d&&typeof d==="object"?d:null; }
/* the workspace's switch: the settings' own word when they have it, else the server's */
function scrDocsWs(tk){ var s=scoringSettings(), v=s&&s.ai&&s.ai.readDocs, d=scrDocs(tk); return typeof v==="boolean"?v:!!(d&&d.on); }
function scrDocsUsed(tk){ return (tk.meta||{}).aiReadDocs!==false; }
function scrInt(n){ n=Math.round(+n||0); try{ return n.toLocaleString(UI_LANG==="id"?"id-ID":"en-US"); }catch(e){ return String(n); } }
/* what the server found, each with what the last ask in this page said of it — unless the server answered since with
   more than "ready" */
function scrDocList(tk){ var d=scrDocs(tk), f=d&&Array.isArray(d.found)?d.found:[], run=SCR.docRun[tk.id], c=SCR.cache[tk.id];
  return (f.length?f:run?run.list:[]).filter(function(x){ return x&&typeof x==="object"; }).map(function(x){ var r=run&&run.by[x.ref]; return r&&(x.status==="ready"||!c||run.at>=c.at)?Object.assign({},x,r):x; }); }
function scrDocsRun(id,list){ var c=SCR.cache[id], by={}; list.forEach(function(x){ if(x&&x.ref) by[x.ref]=x; }); SCR.docRun[id]={at:c?c.at:Date.now(),list:list,by:by}; scrPaint(id); }
/* the part of a document the brief points to (docs/SMART-SCORING.md §5.4.1 part): words built from its fields, never
   from its label — "slide 5", "slides 3–8", "page 2", "sheet tab", "range A1:C20", "one section" */
function scrDocNums(p){ var l=Array.isArray(p.list)?p.list.filter(function(n){ return n===Math.floor(n)&&n>0; }):[], f=scrNum(p.from), t=scrNum(p.to);
  if(l.length>1) return {many:true,txt:l.join(", ")}; if(l.length===1) f=t=l[0];
  if(f==null) return null; return t==null||t===f?{many:false,txt:String(f)}:{many:true,txt:f+"–"+t}; }
function scrDocUnit(kind,many,txt){ return fmt(tr(kind==="page"?(many?"pages {n}":"page {n}"):(many?"slides {n}":"slide {n}")),{n:txt}); }
function scrDocPart(p){ if(!p||typeof p!=="object") return ""; var n=scrDocNums(p);
  if(p.kind==="slide"||p.kind==="page") return n?scrDocUnit(p.kind,n.many,n.txt):tr(p.kind==="page"?"one page":"one slide");
  if(p.kind==="sheet") return tr("sheet tab");
  if(p.kind==="range") return /^(?:[A-Z]{1,3}\d{0,7}|\d{1,7})(?::(?:[A-Z]{1,3}\d{0,7}|\d{1,7}))?$/.test(String(p.label||""))?fmt(tr("range {r}"),{r:p.label}):tr("one range");
  if(p.kind==="heading") return tr("one section");
  return ""; }
var SCR_DOC_ROLE={continues:"(continues)",heading:"(section heading)",general:"(general)"};
/* what was sent of it: "slide 12 (the work) + slide 13 (continues) + slide 2 (general) of 40" */
function scrDocSent(p){ var w=scrDocPart(p)+" "+tr("(the work)"), groups=[];
  (Array.isArray(p.also)?p.also:[]).forEach(function(a){ if(!a||!Object.prototype.hasOwnProperty.call(SCR_DOC_ROLE,a.role)||!(a.n>0)) return; var g=groups[groups.length-1]; if(g&&g.role===a.role&&g.to===a.n-1) g.to=a.n; else groups.push({role:a.role,from:a.n,to:a.n}); });
  groups.forEach(function(g){ w+=" + "+scrDocUnit(p.kind==="page"?"page":"slide",g.to>g.from,g.to>g.from?g.from+"–"+g.to:String(g.from))+" "+tr(SCR_DOC_ROLE[g.role]); });
  var of=scrNum(p.of); return of!=null&&(p.kind==="slide"||p.kind==="page")?fmt(tr("{parts} of {of}"),{parts:w,of:scrInt(of)}):w; }
/* the slides or pages a person sets for a deck or a PDF (meta.aiDocParts, keyed by its ref without the part): they win
   over the link and the words, and are the way to fix a part that could not be read on its own */
function scrDocBase(ref){ return String(ref||"").split("#")[0]; }
function scrDocTakesNums(x){ return x.kind==="gslides"||x.kind==="gdrive"||(x.kind==="file"&&/\.(pdf|pptx)$/i.test(String(x.title||""))); }
function scrDocPartsHtml(tk,x,can){ if(!scrDocTakesNums(x)) return ""; var b=scrDocBase(x.ref), set=(tk.meta||{}).aiDocParts, own=set&&typeof set==="object"&&Object.prototype.hasOwnProperty.call(set,b)?String(set[b]):"", n=x.part&&scrDocNums(x.part);
  var v=own?own.replace(/-/g,"–").replace(/,/g,", "):n?n.txt:"";
  return '<label class="scr-doc-parts">'+esc(tr("Slides/pages:"))+'<input type="text" inputmode="numeric" maxlength="40" value="'+attr(v)+'" placeholder="'+attr(tr("e.g. 12–13"))+'" aria-label="'+attr(fmt(tr("Slides or pages of {doc} for the AI"),{doc:String(x.title||"")}))+'" data-scr-doc-parts="'+attr(b)+'"'+(own?' data-own="1"':'')+(can?' onchange="scrDocParts('+jsq(tk.id)+','+jsq(b)+',this.value)"':' disabled')+'></label>'; }
/* "12–13, 15" → "12-13,15"; "" → "" (back to the link); null when it is not slide or page numbers (at most 20, up to 999) */
function scrDocParseNums(v){ var s=String(v==null?"":v).replace(/[–—]/g,"-").replace(/\s+/g,""), seen={}, list=[], ok=true; if(!s) return ""; if(s.length>80||!/^[\d,-]+$/.test(s)) return null;
  s.split(",").forEach(function(it){ if(!ok||!it) return; var m=/^(\d{1,3})(?:-(\d{1,3}))?$/.exec(it); if(!m){ ok=false; return; } var a=+m[1], b=m[2]?+m[2]:a; if(a<1||b<a||b-a+1>20){ ok=false; return; } for(var x=a;x<=b;x++) if(!seen[x]){ seen[x]=1; list.push(x); } });
  if(!ok||!list.length||list.length>20) return null; list.sort(function(a,b){ return a-b; });
  var out=[]; for(var i=0;i<list.length;i++){ var j=i; while(j+1<list.length&&list[j+1]===list[j]+1) j++; out.push(j>i?list[i]+"-"+list[j]:String(list[i])); i=j; } return out.join(","); }
function scrDocParts(id,ref,v){ var tk=task(id); if(!tk) return; var spec=scrDocParseNums(v), cur=(tk.meta||{}).aiDocParts, set=Object.assign({},cur&&typeof cur==="object"?cur:{});
  if(spec===null){ toast(tr("Use slide or page numbers, such as 12–13 or 3, 5 (at most 20, up to 999)"),"bad"); scrPaint(id); return; }
  if((set[ref]||"")===spec) return;
  if(spec) set[ref]=spec; else delete set[ref];
  if(Object.keys(set).length>5){ toast(tr("Slides or pages can be set for at most 5 documents of a task"),"bad"); scrPaint(id); return; }
  editTaskWith(tk,function(t){ var m=taskMeta(t); if(Object.keys(set).length) m.aiDocParts=set; else delete m.aiDocParts; }).then(function(r){ if(r===false) return; toast(tr(spec?"The AI reads only these slides or pages of it":"The AI follows the brief's link for it again")); var t2=task(id); if(t2&&API.on) scrLoad(t2,true); }); }
function scrDocChip(x,used,max,tk,can){ var st=used?String(x.status||""):"off", k=x.kind==="gdrive"||Object.prototype.hasOwnProperty.call(SCR_DOC_ICO,x.kind)?x.kind:"file", n=scrNum(x.chars), t=String(x.title||x.ref||"");
  var p=x.part&&typeof x.part==="object"?x.part:null, pw=p?scrDocPart(p):"", loose=!!pw&&st==="read"&&p.resolved!==true;
  var why=st!=="off"&&st!=="not_public"&&Object.prototype.hasOwnProperty.call(SCR_DOC_WHY,x.reason)?" · "+tr(SCR_DOC_WHY[x.reason]):"";
  var txt=loose?fmt(tr("points to {part}; not sent: it could not be read on its own"),{part:pw})+why
    :st==="read"&&pw?fmt(tr("read: {parts}"),{parts:scrDocSent(p)})+(n!=null?" · "+fmt(tr("{n} characters"),{n:scrInt(n)}):"")+(x.cut?" · "+tr("cut to fit"):"")
    :st==="read"?(n!=null?fmt(tr("read · {n} characters"),{n:scrInt(n)}):tr("read"))+(x.cut?" · "+tr("cut to fit"):"")
    :st==="limit"&&x.reason==="max_docs"?fmt(tr("not read: only the first {n} are read per ask"),{n:max||5}):tr(SCR_DOC_ST[st]||SCR_DOC_ST.error)+why;
  var name=/^https:\/\/[^\s"'<>]+$/i.test(x.ref||"")?'<a href="'+attr(x.ref)+'" target="_blank" rel="noopener noreferrer" data-no-translate>'+esc(t)+'</a>':'<b data-no-translate>'+esc(t)+'</b>';
  return '<li class="scr-doc" data-scr-doc="'+attr(x.ref||"")+'" data-kind="'+k+'" data-st="'+attr(st)+'"'+(x.reason?' data-why="'+attr(x.reason)+'"':'')+(p?' data-part="'+attr(p.kind||"")+'" data-resolved="'+(p.resolved===true)+'"':'')+'>'+(k==="gdrive"?I.cloud||SCR_DOC_ICO.file:SCR_DOC_ICO[k])+name
    +(pw?'<span class="scr-doc-part">· '+esc(pw)+'</span>':'')+'<span class="scr-doc-st">'+esc(txt)+'</span>'+(tk?scrDocPartsHtml(tk,x,can&&used):'')+'</li>'; }
/* only where the AI is asked for some score; reading off: nothing, or one quiet line for whoever may turn it on */
function scrDocsHtml(tk,mods){ var a=scrAiInfo(tk), d=scrDocs(tk), list=scrDocList(tk);
  if(!list.length||a&&a.external===false||!mods.some(function(m){ return scoringMode(m)!=="math_only"; })) return "";
  if(!scrDocsWs(tk)) return canI.scoringConfigure()?'<p class="hint scr-docs-off" data-scr-docs="off">'+tr("Reading brief documents is off for this workspace")+' · <button type="button" class="scr-link" onclick="go(\'settings\',\'scoring/ai\')">'+tr("Change it in Settings")+'</button></p>':'';
  var used=scrDocsUsed(tk), can=d&&typeof d.canToggle==="boolean"?d.canToggle:canI.editTask(tk), s=scoringSettings(), lim=scrNum(d&&d.charsLimit);
  if(lim==null&&s&&s.ai) lim=scrNum(s.ai.docsChars);
  var read=list.filter(function(x){ return x.status==="read"; }), sum=read.reduce(function(t,x){ return t+(scrNum(x.chars)||0); },0);
  var tot=used&&read.length?'<span class="hint" data-scr-docs-sum>'+esc(lim?fmt(tr("read {n} of {m} characters"),{n:scrInt(sum),m:scrInt(lim)}):fmt(tr("read {n} characters"),{n:scrInt(sum)}))+'</span>':'';
  return '<div class="scr-docs" data-scr-docs="'+(used?"on":"excluded")+'"><div class="scr-docs-head">'+SCR_DOC_ICO.file+'<b>'+tr("Documents for the AI")+'</b>'+tot
    +'<span class="scr-docs-use"><span>'+tr("Use this task's documents")+'</span><button type="button" class="switch'+(used?" on":"")+'" role="switch" aria-checked="'+used+'" aria-label="'+attr(tr("Use this task's documents"))+'" data-scr-act="docs-use"'+(can?' onclick="scrDocsUse('+jsq(tk.id)+')"':' disabled')+'></button></span></div>'
    +'<ul class="scr-docs-list">'+list.map(function(x){ return scrDocChip(x,used,scrNum(d&&d.maxDocs),tk,can); }).join("")+'</ul></div>'; }
/* left out or used again: meta.aiReadDocs false, or no word (the workspace's), saved as any change to the task */
function scrDocsUse(id){ var tk=task(id); if(!tk) return; var on=!scrDocsUsed(tk);
  editTaskWith(tk,function(t){ var m=taskMeta(t); if(on) delete m.aiReadDocs; else m.aiReadDocs=false; }).then(function(r){ if(r!==false) toast(tr(on?"This task's documents are read when the AI is asked":"This task's documents will not be sent to the AI")); }); }

/* ---------- the task's scoring history (the last 50 changes) ---------- */
function scrAuditValue(v){ var j=scrJson(v); if(j) v=scrPick(j,["lockedValue","locked_value","finalValue","final_value","value","mathValue","math_value"]); var n=scrNum(v); return n==null?"":String(n); }
function scrAudit(id){ var tk=task(id); if(!tk) return; var c=SCR.cache[id], list=(c&&c.audit||[]).map(scrAuditNorm).slice(0,50);
  var row=function(a){ var o=scrAuditValue(a.oldValue), n=scrAuditValue(a.newValue);
    return '<div class="scr-aitem"><div class="scr-aitem-top">'+scrWho(a.by)+' <span>'+tr(SCR_ACTIONS[a.action]||a.action)+'</span>'+(a.module&&SCR_NAMES[a.module]?' · <span>'+tr(SCR_NAMES[a.module])+'</span>':'')
      +(o||n?' · <b data-no-translate>'+esc(o&&o!==n?o+" → ":"")+esc(n||o)+'</b>':'')+'</div>'+(a.reason?'<div class="scr-aitem-why" data-no-translate>“'+esc(a.reason)+'”</div>':'')
      +'<div class="hint">'+esc(scrWhen(a.at))+(a.as?' · '+tr("acting as")+' '+scrWho(a.as):'')+'</div></div>'; };
  openModal("Scoring history",list.length?'<div class="scr-alog">'+list.map(row).join("")+'</div>':'<p class="hint">'+tr("Nothing has been scored on this task yet.")+'</p>',
    '<span class="spacer"></span><button class="btn primary" onclick="closeModal()">'+tr("Done")+'</button>'); }

/* ---------- the offline demo: the routes answered in the page, with the server's rules (docs/SMART-SCORING.md §5.2) ---------- */
function scrDemoEffort(tk,r,mark){ var m=taskMeta(tk); tk.effort=r.finalValue||0;
  if(mark==="math"){ var mi=r.mathInputs||{}; delete m.effortManual; m.effortAuto={src:"kind",basis:"",n:0,low:scrHalf(r.mathLow||r.finalValue),high:scrHalf(r.mathHigh||r.finalValue),kind:mi.kind||scrKind(tk),items:scrUnits(tk)}; }
  else { m.effortManual=true; delete m.effortAuto; } }
function scrDemo(method,path,body){ var mt=path.match(/^\/api\/tasks\/([^/]+)\/scoring(?:\/([a-z]+))?(?:\/([a-z]+))?$/); if(!mt) return Promise.reject(new Error("Not found"));
  var id=decodeURIComponent(mt[1]), tk=task(id); if(!tk) return Promise.reject(new Error(tr("That item is not available to you")));
  var st=SCR.demo[id]||(SCR.demo[id]={rows:{},audit:[]}), now=new Date().toISOString(), can=scrCanLocal(tk), s=scoringSettings(); body=body||{};
  var view=function(extra){ var n=assetCount(tk), sv=scrScopeFromAssets(n), mix=scrMix(tk), mh=mix&&typeof kmixHours==="function"?kmixHours(tk,mix):null;
    return Object.assign({taskId:id,rows:{hours:st.rows.hours||null,story:st.rows.story||null,weighted:st.rows.weighted||null},audit:st.audit.slice(0,50),
      kinds:mix,mix:mh?mh.per.map(function(x){ return {kind:x.k,units:x.n,hours:x.h}; }):null,
      on:{feature:true,enabled:scoringOn(),hours:scoringModuleOn("hours"),story:scoringModuleOn("story"),weighted:scoringModuleOn("weighted")},
      context:{kind:scrKind(tk),assetCount:n,deliverables:Math.max(1,n),openDeps:scrOpenDeps(tk),scope:{value:sv||1,source:"assets",assetCount:n,assumed:!sv},requireReason:!!s.overrides.requireReason},
      can:{view:true,calculate:can.calculate,propose:can.propose,edit:can.edit,approve:can.approve,rebaseline:can.rebaseline,requestAi:can.requestAi,approveBlocked:can.blocked}},extra||{}); };
  var fail=function(msg){ return Promise.reject(new Error(tr(msg))); };
  if(method==="GET") return Promise.resolve(view());
  /* the AI is the server's: the demo answers with the math only, and says why */
  if(mt[2]==="ai") return Promise.resolve(view({aiResult:{status:"off",reason:"offline",modules:[body.module||"hours"],missingModules:[]}}));
  var m=mt[2]==="calculate"?body.module:mt[2], act=mt[2]==="calculate"?"calculate":(mt[3]||"set");
  if(SCR_MODULES.indexOf(m)<0) return fail("Unknown kind of score");
  if(!scoringModuleOn(m)) return fail("That kind of score is turned off in Smart Scoring.");
  var fresh=!st.rows[m], r=st.rows[m]||(st.rows[m]=Object.assign({},scrView(tk,m),{synthetic:false})), lk=scrLocked(r), half=function(v){ return m==="hours"?scrHalf(v):v; };
  var snap=function(){ return {value:r.finalValue,lockedValue:r.lockedValue,status:r.status,source:r.source}; }, from=snap();
  var log=function(action,why){ r.rev=(r.rev||0)+1; r.updatedBy=ME; r.updatedAt=now; r.locked=null; st.audit.unshift({id:uid("sa"),module:m,action:action,by:ME,at:now,reason:why||"",from:from,to:snap()}); };
  var deny=function(){ return fail("You don't have permission to do that"); }, stale=function(){ return body.rev!=null&&body.rev!==(r.rev||0); };
  var pick=function(){ if(body.useProposal){ if(!r.proposal) return null; return {v:r.proposal.value,src:r.proposal.use==="math"?"math":"manual"}; }
    if(body.use==="math"){ if(r.mathValue==null) return null; return {v:half(r.mathValue),src:"math"}; }
    if(body.value!=null){ var v=scrNum(body.value); return v==null?null:{v:v,src:"manual"}; } return {v:r.finalValue,src:r.source}; };
  if(act==="calculate"){ if(!can.calculate) return deny();
    var res=scrCompute(m,m==="hours"?scrHoursInputs(tk,{kind:body.inputs&&body.inputs.kind||scrKind(tk),complexity1to5:body.inputs&&body.inputs.complexity}):(body.ratings||{}));
    if(!res||res.value==null) return fail(m==="hours"?"Choose the kind of work first":"Rate every factor first");
    r.mathValue=res.value; r.steps=res.steps; r.mathLow=res.low; r.mathHigh=res.high; if(m==="hours") r.mathInputs=Object.assign({},res.inputs,{complexity:res.inputs.complexityRated?res.inputs.complexity1to5:null}); else r.factors=res.inputs.ratings;
    /* the math becomes the final value only on a new row or a draft whose final is empty, the math's or from before */
    var setFinal=!lk&&(fresh||r.status==="draft"&&(r.finalValue==null||r.source==="math"||r.source==="legacy"));
    if(setFinal){ r.finalValue=half(res.value); r.source="math"; if(m==="hours") scrDemoEffort(tk,r,"math"); }
    log("calculated"); return Promise.resolve(view({result:{module:m,value:res.value,final:r.finalValue,finalSet:setFinal,low:res.low,high:res.high,steps:res.steps,explanation:res.explanation}})); }
  if(stale()) return fail("Someone else changed this score in the meantime. Make your change again.");
  var why=String(body.reason||"").trim();
  if(act==="set"){ if(!can.edit&&!can.propose) return deny(); if(!why&&s.overrides.requireReason) return fail("Write a reason for the change");
    var p=pick(); if(!p||p.v==null) return fail("Enter a value");
    if(can.edit){ r.finalValue=p.v; r.source=p.src; r.proposal=null;
      if(lk){ r.status="locked"; r.lockedValue=p.v; r.lockedBy=ME; r.lockedAt=now; r.approvedBy=null; r.approvedAt=null; } else r.status="draft";
      if(m==="hours") scrDemoEffort(tk,r,p.src); log(lk?"locked_changed":"changed",why); return Promise.resolve(view({applied:true})); }
    r.proposal={value:p.v,ratings:null,use:body.use||null,by:ME,at:now,reason:why}; if(!lk) r.status="proposed"; log("proposed",why); return Promise.resolve(view({applied:false})); }
  if(act==="approve"){ if(!can.approve) return deny();
    if(r.status==="approved") return fail("This estimate is already approved. Re-baseline it to change it.");
    if(r.status==="rebaseline_needed") return fail("The scope changed since it was locked: re-baseline it instead.");
    var a=pick(); if(!a||!(a.v>0)) return fail("Calculate or set a value first");
    var keep=r.status==="locked"&&r.lockedValue===a.v; r.finalValue=a.v; r.source=a.src; r.lockedValue=a.v; r.status="approved"; r.approvedBy=ME; r.approvedAt=now; if(!keep){ r.lockedBy=ME; r.lockedAt=now; } r.proposal=null;
    if(m==="hours") scrDemoEffort(tk,r,a.src); log("approved",why); return Promise.resolve(view()); }
  if(act==="rebaseline"){ if(!can.rebaseline) return deny(); if(!lk) return fail("Only a locked estimate is re-baselined; approve this one instead."); if(!why) return fail("Write a reason for the change");
    var b2=pick(); if(!b2||!(b2.v>0)) return fail("Enter a value");
    r.finalValue=b2.v; r.source=b2.src; r.lockedValue=b2.v; r.status="approved"; r.approvedBy=ME; r.approvedAt=now; r.lockedBy=ME; r.lockedAt=now; r.proposal=null;
    if(m==="hours") scrDemoEffort(tk,r,b2.src); log("rebaselined",why); return Promise.resolve(view()); }
  return fail("Not found"); }

/* ---------- where it hooks in ---------- */
/* the Effort line of the Brief tab: as it always was while Smart Scoring is off; on, the Estimate follows the lock,
   the Actual is the time log's sum while time is logged per entry, and the panel comes under it */
(function(){ if(typeof effortHtml!=="function") return; var base=effortHtml; SCR.base=base;
  effortHtml=function(tk,ed){ if(!scrShow(tk)) return base.apply(this,arguments);
    try{ var lk=scoringEstimateLock(tk), timeRow=scrTimeRow(tk); scrMaybeLoad(tk);
      return base(tk,ed,lk||timeRow?{lock:lk,lockIcon:scrLockIcon(lk),actualRo:!!timeRow}:undefined)+scrPanelHtml(tk,timeRow); }
    catch(e){ console.error(e); return base.apply(this,arguments); } }; })();
/* opening the same task again later asks for its details again */
(function(){ if(typeof closeDrawer!=="function") return; var base=closeDrawer; closeDrawer=function(){ SCR.shown=null; return base.apply(this,arguments); }; })();
/* the task drawn again (an answer, a colleague's change): the context being typed keeps its element, caret and all */
(function(){ if(typeof renderDrawer!=="function") return; var base=renderDrawer; renderDrawer=function(){ var ae=document.activeElement, k=ae&&ae.closest&&ae.closest("#drawer .scr-panel")&&ae.getAttribute("data-scr-key");
  var out=base.apply(this,arguments); if(k){ var p=document.querySelector("#drawer .scr-panel"); if(p) scrKeep(p,ae,k); } return out; }; })();

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Scoring & Intelligence":"Skor & Intelijen","Effort Hours":"Effort Hours","Story Points":"Story Points","Weighted Points":"Weighted Points",
  "Math":"Hitungan","AI":"AI","Manual":"Manual","Legacy":"Lama",
  "Worked out from the workspace's templates and this task":"Dihitung dari template workspace dan task ini","Suggested by the AI":"Disarankan oleh AI","Set by a person":"Diisi oleh seseorang","Kept from before Smart Scoring":"Dipertahankan dari sebelum Smart Scoring",
  "Draft":"Draft","Proposed":"Diusulkan","Approved":"Disetujui","Locked":"Terkunci","Unverified":"Belum diverifikasi","Re-baseline needed":"Perlu baseline ulang",
  "Complexity":"Kompleksitas","Scope":"Cakupan","Uncertainty":"Ketidakpastian","Dependencies":"Dependensi",
  "Simple, routine work":"Sederhana, pekerjaan rutin","Mostly routine, a few choices":"Sebagian besar rutin, sedikit pilihan","Some craft and decisions":"Perlu keahlian dan beberapa keputusan","Demanding, many details":"Menuntut, banyak detail","Very complex or new ground":"Sangat kompleks atau hal baru",
  "One small piece":"Satu bagian kecil","A few pieces (2–3)":"Beberapa bagian (2–3)","A set (4–6)":"Satu set (4–6)","A large set (7–12)":"Set besar (7–12)","Very large (13 or more)":"Sangat besar (13 atau lebih)",
  "The brief is clear and settled":"Brief jelas dan sudah pasti","A few small open questions":"Ada sedikit pertanyaan kecil","Some unknowns":"Ada beberapa hal yang belum diketahui","Many unknowns, likely to change":"Banyak yang belum diketahui, kemungkinan berubah","The brief is unclear and will change":"Brief belum jelas dan akan berubah",
  "Needs nobody else":"Tidak bergantung pada orang lain","One hand-off":"Satu serah terima","Input from a few others":"Butuh masukan dari beberapa orang","Several people or teams":"Beberapa orang atau tim","Waits on many others":"Menunggu banyak pihak lain",
  "Calculated":"Dihitung","Proposed a change":"Mengusulkan perubahan","Changed the value":"Mengubah nilai","Approved and locked":"Disetujui dan dikunci","Frozen when work started":"Dibekukan saat pekerjaan dimulai","Set a new baseline":"Menetapkan baseline baru","Needs a new baseline":"Perlu baseline baru","AI suggestion":"Saran AI","Removed with the task":"Dihapus bersama task",
  "Locked by {name}":"Dikunci oleh {name}","not approved yet":"belum disetujui","Change it under Scoring & Intelligence on the Brief tab.":"Ubah di Skor & Intelijen pada tab Brief.",
  "SP":"SP","pts":"poin",  "Not scored yet":"Belum diberi skor","proposal waiting":"usulan menunggu","proposals waiting":"usulan menunggu",
  "Could not load the latest scores":"Skor terbaru tidak dapat dimuat","Scoring history":"Riwayat skor",
  "Math baseline":"Baseline hitungan","Not calculated yet":"Belum dihitung","Locked value":"Nilai terkunci","Final value":"Nilai final",
  "Kind of work":"Jenis pekerjaan","not recognised":"tidak dikenali","Complexity {n} of 5":"Kompleksitas {n} dari 5","Complexity not rated":"Kompleksitas belum dinilai",
  /* several kinds of work in one task */
  "Kinds of work":"Jenis pekerjaan","Mixed":"Campuran","Deliverables by kind: {list}":"Deliverable per jenis: {list}","{kind} {n} ({h} h)":"{kind} {n} ({h} j)",
  "Calculated with this task's mix: each kind's hours added up, then complexity and open dependencies once. One kind is not chosen here, so the mix stays as it is.":"Dihitung dengan campuran task ini: jam tiap jenis dijumlahkan, lalu kompleksitas dan dependensi terbuka sekali. Satu jenis tidak dipilih di sini, jadi campurannya tetap seperti itu.",
  "Change the mix":"Ubah campuran","The AI suggests: {mix}":"Saran AI: {mix}","Use this split":"Pakai pembagian ini","The AI's split is set":"Pembagian dari AI sudah dipakai",
  "deliverable":"deliverable","deliverables":"deliverable","No assets produced recorded yet — counted as 1":"Belum ada aset dihasilkan yang dicatat — dihitung 1","from":"dari","Assets produced":"Aset yang dihasilkan",
  "1 open dependency":"1 dependensi terbuka","{n} open dependencies":"{n} dependensi terbuka","The task's Estimate is {h} h":"Estimasi task ini {h} jam",
  "Not rated yet":"Belum dinilai","Scope suggested from {n} assets produced: {v}":"Cakupan disarankan dari {n} aset dihasilkan: {v}","by":"oleh",
  "Ask AI":"Tanya AI","Calculate":"Hitung","Change value":"Ubah nilai","Propose change":"Usulkan perubahan","Review & lock":"Review & kunci","Approve & lock":"Setujui & kunci","Re-baseline":"Baseline ulang","Explanation":"Penjelasan",
  "How the math baseline is worked out":"Cara baseline hitungan diperoleh","Not calculated yet. Calculate works it out from the workspace's templates and this task.":"Belum dihitung. Hitung akan menghitungnya dari template workspace dan task ini.",
  "Hours are shown to the nearest half hour: {v}.":"Jam ditampilkan dibulatkan ke setengah jam terdekat: {v}.","The final value {v} is the math baseline.":"Nilai final {v} adalah baseline hitungan.","The final value {v} came from the AI's suggestion.":"Nilai final {v} berasal dari saran AI.","The final value {v} was set by a person.":"Nilai final {v} diisi oleh seseorang.","The final value {v} is the task's estimate from before Smart Scoring.":"Nilai final {v} adalah estimasi task dari sebelum Smart Scoring.","The final value is {v}.":"Nilai finalnya {v}.",
  "Nobody has checked it since Smart Scoring was turned on; an approver can lock it.":"Belum ada yang memeriksanya sejak Smart Scoring diaktifkan; approver dapat menguncinya.","The task's scope changed after it was locked: it needs a new baseline.":"Cakupan task berubah setelah dikunci: perlu baseline baru.","A change to {v} is waiting for an approver.":"Perubahan menjadi {v} menunggu approver.",
  "Estimate":"Estimasi","Suggested from {n} assets produced: {v}":"Disarankan dari {n} aset dihasilkan: {v}","Choose the kind of work":"Pilih jenis pekerjaan","Recognised from the title; change it if it is something else.":"Dikenali dari judul; ubah jika jenisnya lain.","The title does not say what kind of work it is: choose one.":"Judul tidak menyebutkan jenis pekerjaannya: pilih salah satu.",
  "Deliverables":"Deliverable","the task's Assets produced":"Aset dihasilkan task ini","Change under Assets & versions":"Ubah di Aset & versi","Open dependencies":"Dependensi terbuka",
  "Rate the task from 1 to 5 on each. The result follows the workspace's weights and thresholds.":"Nilai task dari 1 sampai 5 untuk tiap faktor. Hasilnya mengikuti bobot dan ambang batas workspace.",
  "Calculate {module}":"Hitung {module}","Cancel":"Batal","usual range":"rentang biasa","Result":"Hasil","Consider splitting":"Pertimbangkan dipecah","Rate every factor first":"Nilai semua faktor dulu","Choose the kind of work first":"Pilih jenis pekerjaan dulu",
  "The estimate is locked: your value replaces the locked one, and both stay in the history.":"Estimasi sudah dikunci: nilaimu menggantikan nilai terkunci, dan keduanya tetap ada di riwayat.","Saved as a value set by a person, with your reason, in the history.":"Disimpan sebagai nilai yang diisi seseorang, beserta alasanmu, di riwayat.","Your change goes to an approver as a proposal. The current value stays until it is approved.":"Perubahanmu dikirim ke approver sebagai usulan. Nilai saat ini tetap berlaku sampai disetujui.",
  "Propose a change":"Usulkan perubahan","Reason":"Alasan","optional":"opsional","Why this value?":"Mengapa nilai ini?","Save":"Simpan","Propose":"Usulkan","Enter a value from {min} to {max}":"Masukkan nilai dari {min} sampai {max}","Write a reason for the change":"Tulis alasan perubahannya",
  "Change proposed — an approver will look at it":"Perubahan diusulkan — approver akan memeriksanya","Saved":"Tersimpan","Current value":"Nilai saat ini","Calculate or set a value first":"Hitung atau isi nilai dulu",
  "Once locked, this is the task's baseline: only people allowed to change any task's scores can change it, and a change of scope asks for a new baseline.":"Setelah dikunci, ini menjadi baseline task: hanya orang yang boleh mengubah skor task mana pun yang dapat mengubahnya, dan perubahan cakupan memerlukan baseline baru.",
  "The task's Estimate becomes the locked value.":"Estimasi task menjadi nilai yang dikunci.","What changed?":"Apa yang berubah?",
  "Last change":"Perubahan terakhir","Locked, not approved":"Dikunci, belum disetujui","Changed the locked value":"Mengubah nilai yang terkunci","Took the task's Estimate":"Mengambil Estimasi task","Followed the task's Estimate":"Mengikuti Estimasi task","The scope changed":"Cakupannya berubah","The scope is as it was again":"Cakupannya kembali seperti semula","Noted the scope":"Mencatat cakupan","The system":"Sistem",
  "Approved and locked by {name}":"Disetujui dan dikunci oleh {name}","the scope changed since: it needs a new baseline":"cakupannya berubah sejak itu: perlu baseline baru","You are assigned to this task, so someone else approves its estimate.":"Kamu ditugaskan di task ini, jadi orang lain yang menyetujui estimasinya.","Estimates are never approved while acting as someone else.":"Estimasi tidak pernah disetujui saat bertindak sebagai orang lain.",
  "the math baseline":"baseline hitungan","Use the math baseline ({v})":"Pakai baseline hitungan ({v})","The baseline frozen when work started":"Baseline yang dibekukan saat pekerjaan dimulai","Keep":"Tetap","Another value":"Nilai lain",
  "A new baseline is approved and locked now, by you. The one it replaces stays in the history.":"Baseline baru disetujui dan dikunci sekarang, olehmu. Yang digantikan tetap ada di riwayat.","New baseline approved and locked":"Baseline baru disetujui dan dikunci",
  "That kind of score is turned off in Smart Scoring.":"Jenis skor itu dimatikan di Smart Scoring.","This estimate is already approved. Re-baseline it to change it.":"Estimasi ini sudah disetujui. Lakukan baseline ulang untuk mengubahnya.","The scope changed since it was locked: re-baseline it instead.":"Cakupannya berubah sejak dikunci: lakukan baseline ulang.","Only a locked estimate is re-baselined; approve this one instead.":"Hanya estimasi yang terkunci yang di-baseline ulang; setujui yang ini saja.","Could not save":"Tidak dapat disimpan","acting as":"bertindak sebagai","Nothing has been scored on this task yet.":"Belum ada skor yang diberikan untuk task ini.","Done":"Selesai",
  "That item is not available to you":"Item itu tidak tersedia untukmu","Unknown kind of score":"Jenis skor tidak dikenal","You don't have permission to do that":"Kamu tidak punya izin untuk itu","Someone else changed this score in the meantime. Make your change again.":"Orang lain sudah mengubah skor ini. Ulangi perubahanmu.","Enter a value":"Masukkan nilai",
  /* the AI's suggestion (Phase 2) */
  "The AI suggested a value":"AI menyarankan nilai",
  "Far from the calculation ({math}): check it before taking it.":"Jauh dari hitungan ({math}): periksa dulu sebelum memakainya.","Low confidence: under the workspace's minimum of {min}%.":"Keyakinan rendah: di bawah batas minimum workspace {min}%.",
  "The AI did not say how sure it is.":"AI tidak menyebutkan seberapa yakin.","Nothing calculated to compare it with yet.":"Belum ada hitungan untuk dibandingkan.","The task changed since this suggestion: ask the AI again.":"Task sudah berubah sejak saran ini: tanya AI lagi.",
  "The AI reads it as {ai}; the title says {title}.":"AI membacanya sebagai {ai}; judulnya menyebut {title}.","The AI counted {ai} deliverables; the task has {task}.":"AI menghitung {ai} deliverable; task ini punya {task}.",
  "No description":"Tidak ada deskripsi","No brief filled in":"Brief belum diisi","No assets produced recorded (counted as 1)":"Belum ada aset dihasilkan yang dicatat (dihitung 1)","The title does not say what kind of work it is":"Judul tidak menyebutkan jenis pekerjaannya",
  "The AI's earlier answer, for the task as it is now: it was not asked again.":"Jawaban AI sebelumnya, untuk task seperti sekarang: AI tidak ditanya lagi.","External AI processing is off in Settings → AI, so only the math is shown.":"Pemrosesan AI eksternal dimatikan di Pengaturan → AI, jadi hanya hitungan yang ditampilkan.",
  "No AI chat model is set up in Settings → AI, so only the math is shown.":"Belum ada model chat AI di Pengaturan → AI, jadi hanya hitungan yang ditampilkan.","You have used your {n} AI suggestions for today, so the math stands.":"Kamu sudah memakai {n} saran AI untuk hari ini, jadi hitungan yang berlaku.",
  "The workspace has used its {n} AI suggestions for today, so the math stands.":"Workspace sudah memakai {n} saran AI untuk hari ini, jadi hitungan yang berlaku.","The AI's answer could not be used, so the math stands.":"Jawaban AI tidak dapat dipakai, jadi hitungan yang berlaku.",
  "The AI did not answer in time, so the math stands.":"AI tidak menjawab tepat waktu, jadi hitungan yang berlaku.","The AI could not be reached, so the math stands.":"AI tidak dapat dihubungi, jadi hitungan yang berlaku.","The AI needs the server: the offline demo shows the math only.":"AI membutuhkan server: demo offline hanya menampilkan hitungan.",
  "The AI gave no usable value for this score.":"AI tidak memberi nilai yang dapat dipakai untuk skor ini.","{n}% sure":"yakin {n}%","Math only":"Hanya hitungan","Asking the AI…":"Menanyakan AI…","Not asked yet":"Belum ditanyakan","Show the suggestion":"Tampilkan saran",
  "Asking the AI needs the permission to ask the AI for a task's scores.":"Bertanya ke AI memerlukan izin untuk meminta saran skor task dari AI.","External AI processing is off in Settings → AI.":"Pemrosesan AI eksternal dimatikan di Pengaturan → AI.","Asking…":"Menanyakan…","Ask AI again":"Tanya AI lagi",
  "The next one is possible from {when}.":"Saran berikutnya bisa mulai {when}.","Confidence {n}%":"Keyakinan {n}%","lowered from {n}%, far from the calculation":"diturunkan dari {n}%, jauh dari hitungan","Confidence not given":"Keyakinan tidak disebutkan",
  "Asked again after the brief changed":"Ditanyakan lagi setelah brief berubah","Asked when the task was created":"Ditanyakan saat task dibuat","Asked by {name}":"Ditanyakan oleh {name}","Asked":"Ditanyakan",
  "compared with {n} finished task":"dibandingkan dengan {n} task selesai","compared with {n} finished tasks":"dibandingkan dengan {n} task selesai","Accept":"Terima","Propose it":"Usulkan nilai ini","Dismiss":"Tutup",
  "The AI suggests {v}":"AI menyarankan {v}","The AI's ratings":"Penilaian AI","It assumes":"Asumsinya","Missing inputs":"Masukan yang kurang",
  "The estimate is locked: the AI's suggestion is shown beside it, never applied. Re-baseline it to change it.":"Estimasi sudah dikunci: saran AI hanya ditampilkan di sampingnya, tidak pernah diterapkan. Lakukan baseline ulang untuk mengubahnya.",
  "The AI's suggestion is ready":"Saran AI sudah siap","Accept the AI's suggestion":"Terima saran AI","Propose the AI's suggestion":"Usulkan saran AI","{module}: {v}, the AI's suggestion.":"{module}: {v}, saran AI.",
  "It becomes the final value, from the AI, with your reason in the history.":"Ini menjadi nilai final, dari AI, dengan alasanmu di riwayat.","Why take a value far from the calculation?":"Mengapa memakai nilai yang jauh dari hitungan?","Why take this value?":"Mengapa memakai nilai ini?",
  /* the documents in the brief */
  "Documents for the AI":"Dokumen untuk AI","Use this task's documents":"Pakai dokumen task ini","read when the AI is asked":"dibaca saat AI ditanya",
  "not shared publicly — set it to “anyone with the link”":"tidak dibagikan secara publik — atur ke “siapa saja yang memiliki link”","too large":"terlalu besar","not supported":"tidak didukung",
  "could not be read":"tidak dapat dibaca","not read: the limit for one ask was reached":"tidak dibaca: batas untuk sekali tanya sudah tercapai","will not be sent":"tidak akan dikirim",
  "read · {n} characters":"dibaca · {n} karakter","read":"dibaca","cut to fit":"dipotong agar muat","read {n} of {m} characters":"dibaca {n} dari {m} karakter","read {n} characters":"dibaca {n} karakter",
  "Reading brief documents is off for this workspace":"Membaca dokumen brief dimatikan untuk workspace ini","Change it in Settings":"Ubah di Pengaturan",
  "not read: only the first {n} are read per ask":"tidak dibaca: hanya {n} dokumen pertama yang dibaca per tanya","over 5 MB":"lebih dari 5 MB","over 15 MB":"lebih dari 15 MB","too much packed inside":"isinya terlalu banyak",
  "this kind of file is not read":"jenis file ini tidak dibaca","no text in it (a scan?)":"tidak ada teksnya (hasil scan?)","protected by a password":"dilindungi password","a file format that is not read":"format file yang tidak dibaca",
  "compressed in a way that is not read":"dikompresi dengan cara yang tidak dibaca","took too long":"terlalu lama","the link leads outside Google":"tautannya mengarah ke luar Google","too many redirects":"terlalu banyak pengalihan",
  "Google asked to wait: try again later":"Google meminta menunggu: coba lagi nanti","Google answered with an error":"Google menjawab dengan galat","could not be reached":"tidak dapat dihubungi","the file is damaged":"file-nya rusak","the file is no longer on the server":"file-nya sudah tidak ada di server",
  "This task's documents are read when the AI is asked":"Dokumen task ini dibaca saat AI ditanya","This task's documents will not be sent to the AI":"Dokumen task ini tidak akan dikirim ke AI",
  /* the part a document points to */
  "slide {n}":"slide {n}","slides {n}":"slide {n}","page {n}":"hal. {n}","pages {n}":"hal. {n}","one slide":"satu slide","one page":"satu halaman","sheet tab":"tab sheet","range {r}":"rentang {r}","one range":"satu rentang","one section":"satu bagian",
  "(the work)":"(dikerjakan)","(continues)":"(lanjutan)","(section heading)":"(judul bagian)","(general)":"(umum)","{parts} of {of}":"{parts} dari {of}","read: {parts}":"terbaca: {parts}","{n} characters":"{n} karakter",
  "points to {part}; not sent: it could not be read on its own":"menunjuk {part}; tidak dikirim: tidak bisa dibaca tersendiri","not found in it":"tidak ditemukan di dalamnya","the deck is over 50 MB":"deck-nya lebih dari 50 MB",
  "it cannot be read by slide or page":"tidak bisa dibaca per slide atau halaman","Slides/pages:":"Slide/halaman:","e.g. 12–13":"mis. 12–13","Slides or pages of {doc} for the AI":"Slide atau halaman {doc} untuk AI",
  "Use slide or page numbers, such as 12–13 or 3, 5 (at most 20, up to 999)":"Pakai nomor slide atau halaman, misalnya 12–13 atau 3, 5 (paling banyak 20, sampai 999)",
  "Slides or pages can be set for at most 5 documents of a task":"Slide atau halaman bisa diatur untuk paling banyak 5 dokumen per task",
  "The AI reads only these slides or pages of it":"AI hanya membaca slide atau halaman ini dari dokumen itu","The AI follows the brief's link for it again":"AI kembali mengikuti tautan di brief untuk dokumen itu"
});
/* the engine's sentences (ScoringEngine.SENTENCES, the keys of every explanation step) in Indonesian, by their name there */
(function(E,d){ if(!E||!E.SENTENCES) return; Object.keys(d).forEach(function(k){ var en=E.SENTENCES[k]; if(en&&!(en in UI_ID)) UI_ID[en]=d[k]; }); })(typeof ScoringEngine!=="undefined"?ScoringEngine:null,{
  hNoTemplate:"Tidak ada template untuk jenis pekerjaan ini dan jam per deliverable tidak diisi, jadi belum ada estimasi hitungan.",
  hTemplate:"Template \"{kind}\": {perUnit} jam untuk satu deliverable.",
  hPerUnit:"{perUnit} jam untuk satu deliverable, sesuai yang diisi.",
  hOne:"Satu deliverable: ×1.",
  hWhole:"{units} deliverable dikerjakan sebagai satu pekerjaan: ×1.",
  hUnits:"{units} deliverable, yang pertama penuh dan tiap berikutnya {pct}%: ×{factor}.",
  hComplexityDefault:"Kompleksitas belum dinilai, dianggap 3 dari 5: ×{mult}.",
  hComplexity:"Kompleksitas {rating} dari 5: ×{mult}.",
  hNoDeps:"Tidak ada dependensi terbuka: ×{mult}.",
  hOneDep:"Satu dependensi terbuka: ×{mult}.",
  hDeps:"{deps} dependensi terbuka: ×{mult}.",
  hProduct:"{perUnit} × {factor} × {cmult} × {dmult} = {raw} jam.",
  hMin:"Dinaikkan ke batas minimum {min} jam.",
  hMax:"Dibatasi pada maksimum {max} jam.",
  hRange:"Rentang biasa untuk pekerjaan ini: {low}–{high} jam.",
  hMixOne:"\"{kind}\": satu deliverable, {hours} jam.",
  hMixWhole:"\"{kind}\": {units} deliverable dikerjakan sebagai satu pekerjaan, {hours} jam.",
  hMixUnits:"\"{kind}\": {units} deliverable, {perUnit} jam untuk yang pertama dan tiap berikutnya {pct}%: {hours} jam.",
  hMixNone:"\"{kind}\": tidak ada template untuknya, jadi {units} deliverable-nya tidak menambah jam.",
  hMixNoneAll:"Tidak satu pun jenis pekerjaan ini punya template, jadi belum ada estimasi hitungan.",
  hMixSum:"Semua jenis pekerjaan digabung: {terms} = {base} jam.",
  hMixProduct:"{base} × {cmult} × {dmult} = {raw} jam.",
  fAdjusted:"Nilai {factor} {given} dibaca sebagai {used} (nilai berupa bilangan bulat 1 sampai 5).",
  fMissing:"Nilai semua faktor dulu; belum dinilai: {factors}.",
  fIndex:"Indeks berbobot {index} = {terms}.",
  sBucket:"Indeks {index} paling tinggi {limit}: {points} story point.",
  sTop:"Indeks {index} di atas {limit}: 13 story point.",
  sSplit:"13 poin adalah ukuran terbesar: pertimbangkan memecah task ini menjadi task yang lebih kecil.",
  wMap:"Indeks {index} pada skala 1–5, disebar merata ke 1–{max}: {points} poin (versi pemetaan {version}).",
  bWeighted:"Poin dasar {points}: Weighted Points final.",
  bBand:"Poin dasar {points}: {hours} jam yang dikunci masuk rentang sampai {limit} jam.",
  bTop:"Poin dasar {points}: {hours} jam yang dikunci di atas semua rentang, jadi rentang teratas yang berlaku.",
  bNone:"Tidak ada poin dasar: belum ada estimasi jam yang dikunci dan belum ada Weighted Points final.",
  bNotHours:"Jam tidak pernah dihitung langsung sebagai poin; rentanglah yang mengubahnya menjadi poin.",
  eSaved:"Waktu yang dihemat: ({E} − {A}) ÷ {E} = {pct}% dari estimasi.",
  eOver:"Butuh {over} jam lebih dari estimasi {E} jam ({pct}% lebih): tidak ada bonus, dan poin tidak pernah dikurangi.",
  eWithinGrace:"Penghematan {pct}% masih dalam toleransi {grace}%: tidak ada bonus.",
  eBeyond:"Penghematan di atas toleransi {grace}%: {pct}%.",
  eRate:"Tingkat bonus: {eligible}% × {factor} = {rate}%.",
  eRateCapped:"Tingkat bonus: {eligible}% × {factor} = {uncapped}%, dibatasi {max}%.",
  eBonus:"Bonus: {B} × {rate}% = {bonus} poin. Diperoleh: {B} + {bonus} = {earned} poin.",
  eWouldBe:"Jika semua syarat terpenuhi, bonusnya {bonus} poin.",
  eNone:"Tidak ada bonus: poin yang diperoleh tetap poin dasar {B}.",
  eReview:"Selesai dalam {pct}% dari waktu estimasi, di bawah {limit}%: reviewer sebaiknya memeriksa dengan teliti sebelum menyetujui.",
  rNotCompleted:"Task belum selesai.",
  rQuality:"Pekerjaan belum lolos review kualitas.",
  rScope:"Cakupan berubah setelah estimasi dikunci; perlu baseline baru dulu.",
  rLogs:"Waktu yang dicatat belum valid atau belum diverifikasi.",
  rNoE:"Belum ada estimasi yang dikunci.",
  rMinE:"Estimasi terkunci {E} jam di bawah minimum {minE} jam.",
  rNoA:"Belum ada waktu kerja yang dicatat.",
  rMinA:"Waktu tercatat {A} jam di bawah minimum {minA} jam.",
  rNoB:"Tidak ada poin dasar.",
  aNoTotal:"Tidak ada total untuk dibagi.",
  aNone:"Tidak ada orang untuk berbagi {total}.",
  aEqual:"Tidak ada porsi yang diberikan, jadi {total} dibagi rata untuk {n} orang.",
  aShares:"{total} dibagi sesuai porsi masing-masing.",
  aRemainder:"Sisa pembulatan {rem} diberikan ke porsi terbesar.",
  pMissing:"Belum ada progres: {fields} tidak ada.",
  pZero:"Belum ada progres: target sama dengan baseline ({baseline}), jadi tidak ada pembanding.",
  pUpWrong:"Belum ada progres: metrik yang naik butuh target di atas baseline ({baseline}).",
  pDownWrong:"Belum ada progres: metrik yang turun butuh target di bawah baseline ({baseline}).",
  pUp:"Naik: ({actual} − {baseline}) ÷ ({target} − {baseline}) = {pct}%.",
  pDown:"Turun: ({baseline} − {actual}) ÷ ({baseline} − {target}) = {pct}%.",
  pAbove:"Melewati target: dihitung 100%.",
  pBelow:"Di bawah baseline: dihitung 0%.",
  uNone:"Belum ada progres: belum ada key result yang punya nilai terukur.",
  uIgnored:"{n} dari {total} key result belum punya progres terukur dan tidak diikutkan.",
  uZero:"Belum ada progres: key result yang punya nilai semuanya berbobot 0.",
  uWeighted:"Progres berbobot dari {n} key result: {pct}%."
});
</script>
<style>
.scr-panel{border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);min-width:0}
.scr-head{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:9px 12px;background:none;border:0;border-radius:var(--radius);cursor:pointer;color:var(--color-text-primary);font:inherit;text-align:left}
.scr-head:hover{background:var(--color-surface-hover)}
.scr-head svg{width:16px;height:16px;flex:none}
.scr-head>b{font-size:var(--fs-sm);font-weight:650;white-space:nowrap}
.scr-sum{flex:1;min-width:0;font-size:var(--fs-sm);color:var(--color-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.scr-sum svg{width:11px;height:11px;vertical-align:-1px}
.scr-head>svg:last-child{transition:transform .15s}
.scr-panel.open .scr-head>svg:last-child{transform:rotate(180deg)}
.scr-panel:not(.open) .scr-body{display:none}
.scr-body{display:flex;flex-direction:column;gap:10px;padding:0 12px 12px;min-width:0}
.scr-row{display:flex;flex-direction:column;gap:7px;padding-top:10px;border-top:1px solid var(--color-border);min-width:0}
.scr-rhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.scr-rhead b{font-size:var(--fs-sm);font-weight:650}
.scr-vals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.scr-val{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;padding:8px 10px;border-radius:var(--radius-sm);background:var(--color-surface-sunken)}
.scr-val .scr-k{font-size:11.5px;color:var(--color-text-tertiary)}
.scr-val b{font-size:var(--fs-md);font-weight:650;font-variant-numeric:tabular-nums;color:var(--color-text-primary)}
.scr-val .hint{font-size:11px;margin:0}
.scr-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-secondary);font-size:11px;font-weight:600;white-space:nowrap}
.scr-src-math{color:var(--color-primary);background:var(--color-primary-soft);border-color:transparent}
.scr-src-ai{color:var(--color-info);border-color:var(--color-info)}
.scr-src-manual{color:var(--color-text-primary)}
.scr-st-locked,.scr-st-approved{color:var(--color-success);background:var(--color-success-soft);border-color:transparent}
.scr-st-proposed,.scr-st-rebaseline_needed{color:var(--color-warning);background:var(--color-warning-soft);border-color:transparent}
.scr-st-unverified{border-style:dashed}
.scr-in{display:flex;flex-wrap:wrap;align-items:center;gap:3px 6px;margin:0;font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-in svg{width:13px;height:13px;flex:none}
.scr-dot{color:var(--color-text-tertiary)}
.scr-prop{padding:7px 10px;border-radius:var(--radius-sm);background:var(--color-warning-soft);font-size:var(--fs-sm);color:var(--color-text-primary);overflow-wrap:anywhere}
.scr-when{font-size:11.5px;color:var(--color-text-tertiary)}
.scr-acts{display:flex;flex-wrap:wrap;gap:6px}
.scr-acts .btn svg{width:13px;height:13px}
.scr-why{padding:8px 10px;border-radius:var(--radius-sm);background:var(--color-surface-sunken);font-size:var(--fs-sm);color:var(--color-text-secondary);overflow-wrap:anywhere}
.scr-why>b{display:block;margin-bottom:4px;color:var(--color-text-primary);font-weight:600}
.scr-why p{margin:6px 0 0}
.scr-steps{display:flex;flex-direction:column;gap:2px;margin:0;padding-left:18px;font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-link{padding:0;border:0;background:none;color:var(--color-primary);font:inherit;text-decoration:underline;cursor:pointer}
.scr-lock-ico{display:inline-flex;align-items:center;margin-left:4px;color:var(--color-text-tertiary);vertical-align:middle}
.scr-lock-ico svg{width:13px;height:13px}
input[data-scr-lock]{cursor:not-allowed}
.scr-hook{min-width:0}
.scr-foot{display:flex;justify-content:flex-end}
.scr-err{margin:0}
.scr-calc>.hint{margin:0 0 12px}
.scr-calc .field{margin-bottom:12px}
.scr-rate .seg{flex-wrap:wrap}
.scr-rate .hint{margin:4px 0 0}
.scr-sugg{color:var(--color-primary)}
.scr-preview{margin-top:6px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--color-surface-sunken)}
.scr-pv-head{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px}
.scr-pv-head b{font-size:var(--fs-md)}
.scr-unit-in{display:flex;align-items:center;gap:6px}
.scr-unit-in input{flex:1;min-width:0}
.scr-opt{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;padding:8px 10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;overflow-wrap:anywhere}
.scr-alog{display:flex;flex-direction:column;gap:8px}
.scr-aitem{padding:8px 10px;border-radius:var(--radius-sm);background:var(--color-surface-sunken);font-size:var(--fs-sm);overflow-wrap:anywhere}
.scr-aitem-why{margin-top:2px;color:var(--color-text-secondary)}
.scr-ai{display:flex;flex-direction:column;gap:6px;min-width:0;padding:8px 10px;border:1px solid var(--color-border);border-left:3px solid var(--color-info);border-radius:var(--radius-sm);background:var(--color-surface);font-size:var(--fs-sm);color:var(--color-text-secondary);overflow-wrap:anywhere}
.scr-ai.far{border-left-color:var(--color-warning)}
.scr-ai-head{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;color:var(--color-text-primary)}
.scr-ai-head svg{width:13px;height:13px;flex:none;color:var(--color-info)}
.scr-ai-head b{font-weight:650}
.scr-ai-conf{font-size:11.5px;color:var(--color-text-secondary)}
.scr-ai-low{color:var(--color-warning);border-color:var(--color-warning)}
.scr-ai-warn{margin:0;padding:6px 10px 6px 26px;border-radius:var(--radius-sm);background:var(--color-warning-soft);color:var(--color-text-primary)}
.scr-ai-text,.scr-ai-fx,.scr-ai-note,.scr-ai-meta{margin:0}
.scr-ai-text{color:var(--color-text-primary)}
.scr-ai-list{min-width:0}
.scr-ai-list b{display:block;font-weight:600;color:var(--color-text-primary)}
.scr-ai-list ul{margin:2px 0 0;padding-left:18px}
.scr-ai-meta{font-size:11.5px;color:var(--color-text-tertiary)}
.scr-ai-delta{margin:0;color:var(--color-text-primary)}
.scr-ai-effect{margin:0;padding:5px 8px;border-radius:var(--radius-sm);background:var(--color-surface-sunken);color:var(--color-text-primary)}
.scr-ai-mix{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:6px 8px;border-radius:var(--radius-sm);background:var(--color-surface-sunken);color:var(--color-text-primary)}
.scr-ai-mix>span{flex:1 1 180px;min-width:0;overflow-wrap:anywhere}
#scrKindMix{gap:6px}
.scr-asm{margin:3px 0}
.scr-asm-acts{display:inline-flex;flex-wrap:wrap;gap:4px;margin-left:6px;vertical-align:1px}
.scr-tog{padding:0 8px;border:1px solid var(--color-border);border-radius:999px;background:var(--color-surface);color:var(--color-text-secondary);font-size:11px;font-weight:600;line-height:19px;white-space:nowrap}
.scr-tog:hover{background:var(--color-surface-hover)}
.scr-tog.on[data-ok="1"],.scr-asm[data-st="ok"] .scr-asm-mark{color:var(--color-success);background:var(--color-success-soft);border-color:transparent}
.scr-tog.on[data-ok="0"],.scr-asm[data-st="wrong"] .scr-asm-mark{color:var(--color-warning);background:var(--color-warning-soft);border-color:transparent}
.scr-asm-mark{display:inline-block;padding:0 7px;border-radius:999px;font-size:11px;font-weight:600}
.scr-asm-fix{display:block;color:var(--color-text-primary)}
.scr-fix,.scr-ctx-in{display:block;width:100%;min-width:0;box-sizing:border-box;margin-top:4px;padding:6px 10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-primary);font-size:var(--fs-sm);outline:none}
.scr-fix:focus,.scr-ctx-in:focus{border-color:var(--color-primary)}
.scr-ctx-in{min-height:64px;margin:0;resize:vertical;line-height:1.45}
.scr-ctx{display:flex;flex-direction:column;gap:6px;padding-top:10px;border-top:1px solid var(--color-border);min-width:0;font-size:var(--fs-sm);color:var(--color-text-secondary);overflow-wrap:anywhere}
.scr-ctx-head{display:flex;align-items:center;gap:6px;color:var(--color-text-primary)}
.scr-ctx-head svg{width:14px;height:14px;flex:none;color:var(--color-info)}
.scr-ctx-head b{font-weight:650}
.scr-ctx-sub{display:flex;flex-wrap:wrap;gap:2px 10px}
.scr-ctx .hint{margin:0;font-size:11.5px}
.scr-ctx-n{margin-left:auto;font-size:11.5px;color:var(--color-text-tertiary);font-variant-numeric:tabular-nums}
.scr-ctx-text{margin:0;white-space:pre-wrap;color:var(--color-text-primary)}
.scr-ctx-saved b{display:block;font-weight:600;color:var(--color-text-primary)}
.scr-ctx-saved ul{display:flex;flex-direction:column;gap:3px;margin:2px 0 0;padding:0;list-style:none}
.scr-ctx-saved li{display:flex;align-items:flex-start;gap:6px}
.scr-ctx-saved li>span{flex:1;min-width:0}
.scr-x{display:inline-flex;flex:none;padding:3px;border-radius:6px;color:var(--color-text-tertiary)}
.scr-x:hover{background:var(--color-surface-hover);color:var(--color-text-primary)}
.scr-x svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round}
.scr-ctx .scr-acts{align-items:center;gap:6px 12px}
.scr-ctx-clear:disabled{opacity:.5;cursor:default}
.scr-spin{display:inline-block;width:11px;height:11px;margin-right:5px;border:2px solid var(--color-border);border-top-color:var(--color-primary);border-radius:50%;vertical-align:-1px;animation:scr-spin .8s linear infinite}
@keyframes scr-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.scr-spin{animation:none}}
.scr-docs{display:flex;flex-direction:column;gap:7px;padding-top:10px;border-top:1px solid var(--color-border);min-width:0}
.scr-docs-head{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;font-size:var(--fs-sm);min-width:0}
.scr-docs-head>svg{width:14px;height:14px;flex:none}
.scr-docs-head b{font-weight:650}
.scr-docs-head .hint{margin:0;font-size:11.5px}
.scr-docs-use{display:inline-flex;align-items:center;gap:8px;margin-left:auto;color:var(--color-text-secondary)}
.scr-docs-list{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none;min-width:0}
.scr-doc{display:inline-flex;align-items:center;flex-wrap:wrap;gap:0 6px;max-width:100%;min-width:0;padding:3px 10px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface-sunken);font-size:12px}
.scr-doc svg{width:13px;height:13px;flex:none;color:var(--color-text-secondary)}
.scr-doc>a,.scr-doc>b{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--color-text-primary);text-decoration:none}
.scr-doc>a:hover{text-decoration:underline}
.scr-doc-st{min-width:0;color:var(--color-text-secondary);overflow-wrap:anywhere}
.scr-doc[data-kind="gdoc"] svg{color:var(--color-info)}.scr-doc[data-kind="gslides"] svg{color:var(--color-warning)}.scr-doc[data-kind="gsheet"] svg{color:var(--color-success)}
.scr-doc[data-st="read"] .scr-doc-st{color:var(--color-success)}
.scr-doc[data-st="not_public"] .scr-doc-st,.scr-doc[data-st="too_large"] .scr-doc-st,.scr-doc[data-st="error"] .scr-doc-st,.scr-doc[data-st="limit"] .scr-doc-st{color:var(--color-warning)}
.scr-doc[data-st="off"]{opacity:.7}
.scr-doc-part{color:var(--color-text-secondary);font-weight:600;white-space:nowrap}
.scr-doc[data-resolved="false"][data-st="read"] .scr-doc-st{color:var(--color-warning)}
.scr-doc-parts{display:inline-flex;align-items:center;gap:5px;min-width:0;color:var(--color-text-secondary);font-size:11.5px}
.scr-doc-parts input{width:76px;min-width:0;height:22px;padding:0 6px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text-primary);font:inherit;font-size:12px}
.scr-doc-parts input:focus{outline:2px solid var(--color-info);outline-offset:1px}
.scr-docs-off{margin:0;padding-top:8px;border-top:1px solid var(--color-border)}
@media(max-width:640px){.scr-vals{grid-template-columns:repeat(2,minmax(0,1fr))}.scr-val[data-scr-v="final"]{grid-column:1/-1}}
</style>
