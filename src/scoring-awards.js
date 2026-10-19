<script>
/* ============================================================
   THE EFFICIENCY BONUS IN THE PAGE (Oct 2026)
   docs/SMART-SCORING.md §13, server/scoring-awards.js. A task finished in less time than its approved, locked estimate
   may earn a small bonus in points once someone who did not work on it approves it. This file shows it and lets the
   right people act on it:
   - The task's Scoring & Intelligence panel (src/scoring-panel.js) asks scoringEfficiencyLineHtml(tk, efficiency) for
     its line — "Estimated 8 h · Actual 5 h · Saved 3 h · Base 8.00 pts · Efficiency Bonus +1.10 pts · Earned 9.10 pts ·
     Pending review" — from the `efficiency` block of GET /api/tasks/:id/scoring, which the server sends only to the
     people credited (their own award), whoever approves finished work and whoever sees the team's scoring analytics.
     Hovering the line shows how it is worked out; "How it is worked out" lists the steps in the person's language.
     When the task cannot earn a bonus the line says why, every condition in words; the flags for the reviewer are
     listed apart — never an accusation. Whoever may approve it (not assigned, not credited, not acting as someone
     else) has Approve and Reject: a quality score of 1–5 (required when the workspace sets a minimum), the shares of a
     shared task (to 100%, with a reason) and a reason. Everyone who sees it reads that it is an operational metric,
     not compensation or a ranking.
   - Settings → Smart Scoring → "Efficiency bonus" (scoringBonusSettingsHtml, called by src/scoring-settings.js): the
     switch, a worked example (E 8 h, A 5 h, B 8 pts → bonus +1.10, earned 9.10) recomputed as the fields are typed,
     the grace and the largest bonus, the fixed rules as "Always true"; the rest of the policy (reward factor, minimums,
     review flags, base, hours → points bands, completed stages, approved version, quality, pilot teams) under
     "Advanced", each field with a line on what it does.
   - The approvers' notification ("… is finished: its efficiency bonus waits for your review") in the bell, in English
     and Indonesian, under the "approval" notifications.
   Nothing blinks: the line is drawn from what the panel has, and the panel redraws it in place. In the offline demo the
   bonus stays off (awards are the server's).
   ============================================================ */
var SCE={why:{},busy:false,shares:null};
I.flag=I.flag||'<svg class="i" viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';
var SCE_STATUS={provisional:"Provisional",pending_review:"Pending review",approved:"Approved",rejected:"Rejected",ineligible:"Not eligible",revoked:"No longer credited"};
/* the server's sentences for what the engine does not know about (server/scoring-awards.js SENTENCES) */
var SCE_SENTENCES={
  not_in_pilot:"The efficiency bonus runs as a pilot for other teams; this task's team is not in it.",
  lock_not_approved:"The estimate is locked but nobody approved it: it was frozen when work started, or changed after its lock. A bonus needs an approved estimate.",
  lock_self_approved:"The estimate was approved by someone who works on this task. A bonus needs someone else's approval.",
  lock_before_bonus:"The estimate was approved before the efficiency bonus was turned on. Awards are never made retroactively.",
  lock_after_work_started:"The estimate was approved only after the work had started. A bonus needs a baseline approved before the work.",
  legacy_time_only:"Only time from before the time log is recorded, and it never counts towards a bonus.",
  not_credited:"No work or revision time of theirs is logged on this task any more.",
  review_time_after_approval:"Time was logged, changed or deleted after the work was approved ({n} entries): check it before approving.",
  review_estimate_raised:"The estimate went up from {from} h to {to} h in the {hours} hours before it was approved.",
  review_rebaselined:"The estimate was set again after the work had started: {from} h → {to} h.",
  review_base_not_locked:"The Weighted Points the base comes from are not locked yet."};
var SCE_QUALITY={no_version:"No version of the work has been uploaded yet.",not_approved:"The latest version is not approved yet.",approved_by_contributor:"The latest version was approved by someone who worked on the task."};

/* ---------- numbers ---------- */
function sceH(v){ return v==null||!isFinite(v)?"—":(Math.round(+v*100)/100)+" h"; }
function sceP(v){ return v==null||!isFinite(v)?"—":(+v).toFixed(2)+" "+tr("pts"); }
function scePct(x){ return Math.round((+x||0)*10000)/100; }
/* a sentence of the server or the engine ({key, vars}) in the person's language */
function sceStep(st){ if(!st) return ""; if(typeof scrStep==="function") return scrStep(st); return fmt(tr(st.key||""),st.vars||{}); }
/* "Saved" is "Tersimpan" (stored) everywhere else in the page; here it is time saved */
function sceSavedWord(){ return typeof UI_LANG!=="undefined"&&UI_LANG==="id"?"Hemat":"Saved"; }
function sceStepsText(steps){ return (steps||[]).map(sceStep).filter(Boolean).join("\n"); }

/* ---------- the line in the task's panel ---------- */
function sceChip(st){ return st&&SCE_STATUS[st]?'<span class="scr-chip scr-eff-st scr-eff-st-'+attr(st)+'" data-scr-eff-status="'+attr(st)+'">'+tr(SCE_STATUS[st])+'</span>':''; }
function sceBlockedHint(e){ var b=e.can&&e.can.blocked;
  if(b==="worked_on_it") return '<p class="hint scr-eff-why-not">'+tr("You worked on this task, so someone else reviews its bonus.")+'</p>';
  if(b==="impersonating") return '<p class="hint scr-eff-why-not">'+tr("Bonuses are never approved or rejected while acting as someone else.")+'</p>';
  return ""; }
function scoringEfficiencyLineHtml(tk,e){
  if(!tk||!e||typeof e!=="object") return "";
  var awards=Array.isArray(e.awards)?e.awards:[], reasons=Array.isArray(e.reasons)?e.reasons:[], flags=Array.isArray(e.flags)?e.flags:[];
  /* nothing to say: the bonus is off and nothing was awarded, or the task has neither a locked estimate nor time logged */
  if(!e.on&&!awards.length) return "";
  if(!awards.length&&e.estimate==null&&!(e.actual>0)) return "";
  var st=e.status||(reasons.length?"ineligible":null), id=tk.id, open=!!SCE.why[id], text=sceStepsText(e.steps);
  var item=function(k,label){ return '<span class="scr-eff-i" data-k="'+k+'">'+label+'</span>'; }, sep='<span class="scr-eff-sep" aria-hidden="true">·</span>';
  var parts=[item("estimate",tr("Estimated")+" "+sceH(e.estimate)),item("actual",tr("Actual")+" "+sceH(e.actual)),item("saved",sceSavedWord()+" "+sceH(e.saved)),
    item("base",tr("Base")+" "+sceP(e.base&&e.base.value)),item("bonus",tr("Efficiency Bonus")+" +"+sceP(e.bonus||0)),item("earned",'<b>'+tr("Earned")+" "+sceP(e.earned)+'</b>')];
  var h='<div class="scr-eff-box" data-scr-eff="'+attr(id)+'" data-scr-eff-status="'+attr(st||"none")+'">'
    +'<div class="scr-eff-head">'+(I.star||"")+'<b>'+tr("Efficiency bonus")+'</b>'+(e.on?'':'<span class="hint">'+tr("turned off: nothing changes until it is on again")+'</span>')+'</div>'
    +'<div class="scr-eff-line" title="'+attr(text)+'">'+parts.join(sep)+(st?sep+sceChip(st):'')+'</div>';
  /* the people credited: each one's share of the base and the bonus */
  var people=Array.isArray(e.people)?e.people.filter(function(p){ return p.minutes>0||p.share>0; }):[];
  if(people.length>1) h+='<div class="hint scr-eff-people">'+tr("Shares")+': '+people.map(function(p){ return '<span data-no-translate>'+esc(person(p.userId).name)+'</span> '+scePct(p.share)+'%'; }).join(" · ")+'</div>';
  else if(people.length===1&&people[0].userId===ME&&awards.length) h+='<div class="hint scr-eff-people">'+tr("Your share")+': '+scePct(people[0].share)+'%</div>';
  if(e.legacyHours>0) h+='<div class="hint">'+fmt(tr("{h} h from before the time log are not counted."),{h:e.legacyHours})+'</div>';
  /* why it does not count (yet) */
  if(reasons.length){ var blocking=reasons.some(function(r){ return ["not_completed","quality_not_approved","no_actual_time"].indexOf(r.code)<0; });
    h+='<div class="scr-eff-reasons" data-scr-eff-reasons><b>'+tr(blocking||st==="ineligible"?"Not eligible":"Before it counts")+'</b><ul>'+reasons.map(function(r){ return '<li data-code="'+attr(r.code)+'">'+esc(sceStep(r))+'</li>'; }).join("")+'</ul>'
      +(e.quality&&!e.quality.ok&&SCE_QUALITY[e.quality.why]?'<div class="hint">'+tr(SCE_QUALITY[e.quality.why])+'</div>':'')+'</div>'; }
  /* for the reviewer to look at */
  if(flags.length) h+='<div class="scr-eff-flags" data-scr-eff-flags><b>'+I.flag+tr("For the reviewer to look at — never an accusation")+'</b><ul>'+flags.map(function(f){ return '<li data-code="'+attr(f.code)+'">'+esc(sceStep(f))+'</li>'; }).join("")+'</ul></div>';
  if(e.review&&(st==="approved"||st==="rejected")) h+='<div class="hint scr-eff-review">'+fmt(tr(st==="approved"?"Approved by {name}":"Rejected by {name}"),{name:'<span data-no-translate>'+esc(person(e.review.by).name)+'</span>'})
    +(e.review.at&&typeof scrDate==="function"?' · '+scrDate(e.review.at):'')+(e.review.quality!=null?' · '+tr("quality")+' '+e.review.quality+'/5':'')+(e.review.note?' · <span data-no-translate>“'+esc(e.review.note)+'”</span>':'')+'</div>';
  /* how it is worked out */
  h+='<div class="scr-eff-acts"><button type="button" class="btn xs ghost" data-scr-eff-act="why" aria-expanded="'+(open?"true":"false")+'" onclick="sceWhy('+jsq(id)+')">'+tr(open?"Hide how it is worked out":"How it is worked out")+'</button>'
    +(e.can&&e.can.recalculate?'<button type="button" class="btn xs ghost" data-scr-eff-act="recalculate" onclick="sceRecalc('+jsq(id)+')">'+tr("Recalculate")+'</button>':'')
    +(e.can&&e.can.approve?'<span class="spacer"></span><button type="button" class="btn xs" data-scr-eff-act="reject" onclick="sceReview('+jsq(id)+',\'reject\')">'+tr("Reject")+'</button><button type="button" class="btn xs primary" data-scr-eff-act="approve" onclick="sceReview('+jsq(id)+',\'approve\')">'+tr("Approve bonus")+'</button>':'')+'</div>';
  if(open) h+=(typeof scrStepsHtml==="function"?scrStepsHtml(e.steps):'<ol class="scr-steps">'+(e.steps||[]).map(function(s){ return '<li>'+esc(sceStep(s))+'</li>'; }).join("")+'</ol>');
  h+=sceBlockedHint(e)+'<p class="hint scr-eff-note">'+tr("Operational metric, not compensation or a ranking.")+'</p></div>';
  return h; }
function sceWhy(id){ SCE.why[id]=!SCE.why[id]; if(typeof scrPaint==="function") scrPaint(id); }
function sceEff(id){ var c=typeof SCR!=="undefined"&&SCR.cache[id]; return c&&c.efficiency||null; }
function scePath(id,act){ return "/api/tasks/"+encodeURIComponent(id)+"/efficiency/"+act; }
/* an answer {taskId, efficiency, task}: the task replaced, the block kept, the panel's view asked for again */
function sceDone(id,d,msg){ var tk=task(id); if(!tk) return; if(typeof scrAfter==="function") scrAfter(tk,"hours",d,msg); else { if(msg) toast(msg); refresh(); } }
function sceRecalc(id){ if(SCE.busy||!API.on) return; SCE.busy=true;
  apiFetch("POST",scePath(id,"recalculate"),{}).then(function(d){ SCE.busy=false; sceDone(id,d,d&&d.changed?tr("Worked out again"):tr("Nothing changed")); })
    .catch(function(e){ SCE.busy=false; toast(e&&e.message||tr("Could not save"),"bad"); }); }

/* ---------- approve or reject ---------- */
function sceReview(id,act){ var tk=task(id), e=sceEff(id); if(!tk||!e) return;
  var approve=act==="approve", need=!!(e.can&&e.can.qualityRequired), min=e.policy&&e.policy.minQuality;
  var people=(e.people||[]).filter(function(p){ return p.minutes>0||p.share>0; });
  SCE.shares=people.map(function(p){ return {id:p.userId,v:scePct(p.share)}; });
  var q='<div class="field"><label for="sceQ">'+tr("Quality of the work (1–5)")+(need?'':' ('+tr("optional")+')')+'</label>'+selectHtml("sceQ",[["",tr("No score")]].concat([1,2,3,4,5].map(function(n){ return [String(n),String(n)]; })),"")+(need&&min!=null?'<div class="hint">'+fmt(tr("This workspace approves a bonus from a score of {n}."),{n:min})+'</div>':'')+'</div>';
  var shares=approve&&people.length>1?'<div class="field scr-eff-shares"><label>'+tr("Shares")+'</label>'+people.map(function(p,i){ return '<div class="scr-eff-share"><span data-no-translate>'+esc(person(p.userId).name)+'</span><div class="scr-unit"><input type="number" min="0" max="100" step="1" id="sceS'+i+'" value="'+attr(scePct(p.share))+'" aria-label="'+attr(person(p.userId).name)+'" oninput="sceShareInput()"><span>%</span></div></div>'; }).join("")+'<div class="hint" id="sceShareSum" aria-live="polite"></div><div class="hint">'+tr("Shared by the time each one logged. Change them only with a reason.")+'</div></div>':'';
  var sum='<p class="scr-eff-sum">'+tr("Estimated")+' '+sceH(e.estimate)+' · '+tr("Actual")+' '+sceH(e.actual)+' · '+tr("Base")+' '+sceP(e.base&&e.base.value)+' · '+tr("Efficiency Bonus")+' +'+sceP(e.bonus||0)+' · <b>'+tr("Earned")+' '+sceP(e.earned)+'</b></p>';
  var flags=(e.flags||[]).length?'<div class="scr-eff-flags"><b>'+I.flag+tr("For the reviewer to look at — never an accusation")+'</b><ul>'+e.flags.map(function(f){ return '<li>'+esc(sceStep(f))+'</li>'; }).join("")+'</ul></div>':'';
  var why='<div class="field"><label for="sceReason">'+tr("Reason")+(approve?' ('+tr("optional")+')':'')+'</label><textarea id="sceReason" rows="3" maxlength="1000" placeholder="'+attr(tr(approve?"Anything the people credited should know":"Why is the bonus rejected?"))+'"></textarea></div>';
  openModal(approve?"Approve the efficiency bonus":"Reject the efficiency bonus",sum+flags+(approve?'<p class="hint">'+tr("Approving also verifies the time the people credited logged on this task.")+'</p>':'<p class="hint">'+tr("Rejected, the task keeps its base points and no bonus.")+'</p>')+q+shares+why+'<p class="hint">'+tr("Operational metric, not compensation or a ranking.")+'</p>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="sceGo" onclick="sceReviewGo('+jsq(id)+',\''+(approve?"approve":"reject")+'\')">'+tr(approve?"Approve bonus":"Reject")+'</button>');
  sceShareInput(); }
function sceShareRead(){ return (SCE.shares||[]).map(function(s,i){ var el=document.getElementById("sceS"+i), n=el?parseFloat(String(el.value).replace(",",".")):s.v; return {id:s.id,v:isFinite(n)?n:0}; }); }
function sceShareInput(){ var el=document.getElementById("sceShareSum"); if(!el) return; var t=Math.round(sceShareRead().reduce(function(a,s){ return a+s.v; },0)*100)/100, ok=Math.abs(t-100)<=0.01;
  el.className="hint "+(ok?"scr-ok":"scr-bad"); el.textContent=tr("Total")+": "+t+"%"+(ok?"":" · "+tr("must be 100%")); }
function sceReviewGo(id,act){ var tk=task(id), e=sceEff(id); if(!tk||!e) return closeModal();
  var why=String((document.getElementById("sceReason")||{}).value||"").trim().slice(0,1000), qv=(document.getElementById("sceQ")||{}).value, body={calcKey:e.calcKey||null};
  if(qv) body.qualityScore=+qv; else if(act==="approve"&&e.can&&e.can.qualityRequired) return toast(tr("Give a quality score first"),"bad");
  if(act==="reject"&&!why) return toast(tr("Write a reason for the change"),"bad");
  if(act==="approve"&&(SCE.shares||[]).length>1){ var sh=sceShareRead(), changed=sh.some(function(s,i){ return Math.abs(s.v-SCE.shares[i].v)>0.005; });
    if(changed){ var t=sh.reduce(function(a,s){ return a+s.v; },0); if(Math.abs(t-100)>0.01) return toast(tr("The shares must add up to 100%"),"bad"); if(!why) return toast(tr("Say why the shares change"),"bad"); body.shares={}; sh.forEach(function(s){ body.shares[s.id]=s.v; }); } }
  if(why) body.reason=why;
  var b=document.getElementById("sceGo"); if(b) b.disabled=true;
  apiFetch("POST",scePath(id,act),body).then(function(d){ closeModal(); SCE.shares=null; sceDone(id,d,act==="approve"?tr("Efficiency bonus approved"):tr("Efficiency bonus rejected")); })
    .catch(function(err){ if(b) b.disabled=false; toast(err&&err.message||tr("Could not save"),"bad"); var t2=task(id); if(t2&&typeof scrLoad==="function") scrLoad(t2,true); }); }

/* the panel asks for the task's scores again when what the bonus rests on changes: the stage, the time logged — and,
   for whoever sees the bonus, any change of the task (an award decided in another tab touches it) */
(function(){ if(typeof scrSig!=="function") return; var base=scrSig; scrSig=function(tk){ var s=base.apply(this,arguments); try{ var c=typeof SCR!=="undefined"&&SCR.cache[tk.id];
  return s+"|"+(tk.status||"")+"|"+(+((tk.meta||{}).actualEffort)||0)+(c&&c.efficiency?"|"+(tk.updatedAt||""):""); }catch(e){ return s; } }; })();

/* the task's scoring history names what happened to its award (module "efficiency") in words of its own */
var SCE_AUDIT={approved:"Approved the efficiency bonus",rejected:"Rejected the efficiency bonus",recalculated:"Worked out the efficiency bonus again",pending_review:"The efficiency bonus waits for review",
  review_reopened:"The efficiency bonus went back to review",reopened:"The efficiency bonus went back to provisional",removed_with_task:"Removed with the task"};
(function(){ if(typeof scrAuditNorm!=="function"||typeof SCR_ACTIONS==="undefined") return; Object.keys(SCE_AUDIT).forEach(function(k){ SCR_ACTIONS["efficiency_"+k]=SCE_AUDIT[k]; });
  var base=scrAuditNorm; scrAuditNorm=function(a){ var n=base.apply(this,arguments); if(n&&n.module==="efficiency"&&SCE_AUDIT[n.action]){ n.action="efficiency_"+n.action; n.oldValue=null; n.newValue=null; } return n; }; })();

/* ---------- Settings → Smart Scoring → Efficiency bonus ---------- */
/* the worked example, from the policy as typed: estimated 8 h, done in 5 h, base 8 points */
function scoringBonusExample(b){ var E=typeof ScoringEngine!=="undefined"?ScoringEngine:null; if(!E) return null;
  var r=E.efficiency(b||{},{E:8,A:5,B:8,completed:true,qualityApproved:true,scopeChanged:false,validLogs:true});
  return {bonus:(+r.bonus||0).toFixed(2),earned:(+r.earned||0).toFixed(2),saved:scePct(r.savedRatio),beyond:scePct(r.eligibleSavings),rate:scePct(r.multiplier)}; }
function sceExampleHtml(b){ var x=scoringBonusExample(b); if(!x) return ""; var p=b||{};
  return '<b>'+tr("Example")+': '+fmt(tr("E {E} h, A {A} h, B {B} pts → bonus +{bonus}, earned {earned}"),{E:8,A:5,B:8,bonus:x.bonus,earned:x.earned})+'</b><span>'
    +(x.beyond>0?fmt(tr("Saved {saved}% of the estimate; {beyond}% beyond the grace × the reward factor {factor} = a bonus rate of {rate}% (at most {max}%)."),{saved:x.saved,beyond:x.beyond,factor:+p.rewardFactor,rate:x.rate,max:scePct(p.maxRate)})
      :fmt(tr("Saved {saved}% of the estimate: within the {grace}% grace, so no bonus."),{saved:x.saved,grace:scePct(p.grace)}))+'</span><span class="hint">'+tr("E = the approved estimate, A = the time logged, B = the task's base points.")+'</span>'; }
function sceExamplePaint(){ var el=document.getElementById("sceExample"); if(!el||typeof SC==="undefined"||!SC.draft) return; el.innerHTML=sceExampleHtml(SC.draft.bonus||{}); }
(function(){ if(typeof scTotalsPaint!=="function") return; var base=scTotalsPaint; scTotalsPaint=function(){ var out=base.apply(this,arguments); try{ sceExamplePaint(); }catch(e){ console.error(e); } return out; }; })();
/* the hours → points bands, drawn again in place when one is added or removed */
function sceBands(){ var b=scGet("bonus.hourMapping.bands"); return Array.isArray(b)?b:[]; }
function sceBandsHtml(ro){ var bands=sceBands();
  return bands.map(function(x,i){ return '<div class="scr-band" data-band="'+i+'"><span>'+tr(i===bands.length-1&&bands.length>1?"Above that, up to":"Up to")+'</span><div class="scr-unit"><input type="number" min="0.05" max="10000" step="0.25" data-sc="bonus.hourMapping.bands.'+i+'.0" data-k="num" value="'+attr(x[0])+'" aria-label="'+attr(tr("Hours"))+' '+(i+1)+'"'+(ro?' disabled':' oninput="scInput(this)"')+'><span>h</span></div><span aria-hidden="true">→</span>'
      +'<div class="scr-unit"><input type="number" min="0.01" max="1000" step="0.5" data-sc="bonus.hourMapping.bands.'+i+'.1" data-k="num" value="'+attr(x[1])+'" aria-label="'+attr(tr("Points"))+' '+(i+1)+'"'+(ro?' disabled':' oninput="scInput(this)"')+'><span>'+tr("pts")+'</span></div>'
      +(ro||bands.length<=1?'':'<button type="button" class="iconbtn" onclick="sceBandDel('+i+')" aria-label="'+attr(tr("Remove this band"))+'">'+(I.x||"×")+'</button>')+'</div>'; }).join("")
    +(ro||bands.length>=12?'':'<button type="button" class="btn xs ghost" onclick="sceBandAdd()">'+(I.plus||"")+tr("Add a band")+'</button>'); }
function sceBandsSet(b){ scPut("bonus.hourMapping.bands",b); var el=document.getElementById("sceBands"); if(el) el.innerHTML=sceBandsHtml(!canI.scoringConfigure()); }
function sceBandAdd(){ var b=sceBands().map(function(x){ return x.slice(); }); if(b.length>=12) return; var last=b[b.length-1]||[8,5]; b.push([Math.min(10000,(+last[0]||8)*2),Math.round(((+last[1]||5)+3)*100)/100]); sceBandsSet(b); }
function sceBandDel(i){ var b=sceBands().map(function(x){ return x.slice(); }); if(b.length<=1) return; b.splice(i,1); sceBandsSet(b); }
/* the stages that count as completed: every closed stage but Declined unless the workspace picks its own */
function sceClosed(){ return ((typeof WS!=="undefined"&&WS.workflow)||[]).filter(function(s){ return s.kind==="closed"; }); }
function sceDefaultStages(){ return sceClosed().filter(function(s){ return s.id!=="declined"; }).map(function(s){ return s.id; }); }
function sceStagesChange(){ var box=document.getElementById("sceStages"); if(!box) return; var on=[].slice.call(box.querySelectorAll("input:checked")).map(function(x){ return x.value; }), dflt=sceDefaultStages();
  scPut("bonus.completionStages",!on.length||on.slice().sort().join("|")===dflt.slice().sort().join("|")?null:on); }
function scePilotChange(){ var box=document.getElementById("scePilot"); if(!box) return; scPut("bonus.pilotTeams",[].slice.call(box.querySelectorAll("input:checked")).map(function(x){ return x.value; })); }
function sceMinQ(el){ scPut("bonus.minQuality",el.value===""?null:+el.value); }
function scoringBonusSettingsHtml(ro,ed){
  if(typeof scGet!=="function") return "";
  var demo=typeof API!=="undefined"&&!API.on, lock=ro||demo, b=scGet("bonus")||{}, on=!!b.on;
  var num=function(id,path,label,o,help,ex){ return '<div class="scr-fld">'+scNumHtml(id,path,label,Object.assign({ro:ro},o))+scrHelp(help,ex)+'</div>'; };
  var stages=b.completionStages, chosen=Array.isArray(stages)&&stages.length?stages:sceDefaultStages();
  var pinned=[tr("An independent approver: someone neither assigned to the task nor credited on it — admins included."),tr("Nobody approves their own bonus, nor while acting as someone else."),
    tr("No cap per person or period yet: unusual patterns are flagged for the reviewer."),tr("Never negative: taking longer never takes points away."),tr("Never backdated: only estimates approved after it is turned on count.")];
  var teams=(typeof TEAMS!=="undefined"?TEAMS:[]).filter(function(t){ return !t.archived; }), pilot=Array.isArray(b.pilotTeams)?b.pilotTeams:[];
  var adv='<div class="scr-grid scr-wide">'+num("sc_b_reward","bonus.rewardFactor","Reward factor",{min:0,max:5,step:0.05},tr("Each 1% saved beyond the grace adds this many % of the base points."),tr("0.5: 27.5% beyond the grace makes a 13.75% bonus."))
      +num("sc_b_mine","bonus.minE","Smallest estimate",{min:0,max:1000,step:0.25,unit:"h"},"",tr("1 h: a 45-minute task never earns a bonus."))
      +num("sc_b_mina","bonus.minA","Least time logged",{min:0,max:1000,step:0.25,unit:"h"},"",tr("0.25 h: under 15 minutes logged earns no bonus."))
      +num("sc_b_review","bonus.reviewBelowRatio","Ask for a close look below",{pct:true,min:0,max:100,step:5,unit:"%"},tr("Work done in less than this share of the estimate is flagged for the reviewer."),tr("40%: an 8 h task done in under 3.2 h."))
      +num("sc_b_material","bonus.materialChangeHours","Reopen the review after",{min:0,max:100,step:0.25,unit:"h"},tr("Logged time changed by at least this much after approval sends the bonus back to review."),tr("0.25 h = 15 minutes."))+'</div>'
    +fieldHtml("sc_b_base","Base points come from",scSelectHtml("sc_b_base","bonus.baseSource",[["weighted_else_mapping","Weighted Points while that module is on, else the hours bands"],["mapping","Always the hours bands"]],ro))
    +'<div class="eyebrow">'+tr("Base points from hours")+'</div><div class="scr-bands" id="sceBands">'+sceBandsHtml(ro)+'</div>'
    +scrHelp(tr("A task gets the points of the first band its locked hours fit in; above them all, the last band. Hours never count as points themselves."),tr("6 h: up to 8 h → 5 pts."))
    +'<div class="eyebrow">'+tr("Completed means")+'</div><div class="scr-checks" id="sceStages">'+sceClosed().map(function(s){ return '<label><input type="checkbox" value="'+attr(s.id)+'"'+(chosen.indexOf(s.id)>=0?' checked':'')+(ro?' disabled':' onchange="sceStagesChange()"')+'> <span>'+esc(typeof stageName==="function"?stageName(s.id):s.name)+'</span></label>'; }).join("")+'</div>'
    +scrHelp(tr("By default every closed stage except Declined."))
    +'<div class="pref"><div class="pl"><b>'+tr("The latest version must be approved")+'</b><span>'+tr("By a reviewer who did not work on the task: the quality gate before a bonus can be reviewed.")+'</span></div>'+scSwitchHtml("bonus.requireApprovedVersion","The latest version must be approved",ro)+'</div>'
    +fieldHtml("sc_b_minq","Lowest quality score that can be approved",selectHtml("sc_b_minq",[["",tr("No minimum: a score is optional")]].concat([1,2,3,4,5].map(function(n){ return [String(n),String(n)]; })),b.minQuality==null?"":String(b.minQuality),ro?"disabled":'onchange="sceMinQ(this)"'))
    +'<div class="eyebrow">'+tr("Pilot teams")+'</div><div class="scr-checks" id="scePilot">'+(teams.length?teams.map(function(t){ return '<label><input type="checkbox" value="'+attr(t.id)+'"'+(pilot.indexOf(t.id)>=0?' checked':'')+(ro?' disabled':' onchange="scePilotChange()"')+'> <span data-no-translate>'+esc(t.name)+'</span></label>'; }).join(""):'<span class="hint">'+tr("No teams yet.")+'</span>')+'</div>'
    +scrHelp(tr("None chosen: every team. Chosen: only their tasks can earn a bonus."));
  return scrSec("bonus",tr("Efficiency bonus"),tr("Finish faster than the approved estimate and earn a few extra points — never hours — once someone who did not work on the task approves it."),
    '<div class="pref" data-scr-bonus="on"><div class="pl"><b>'+tr("Efficiency bonus")+'</b><span>'+tr(demo?"In the offline demo the bonus stays off: awards are worked out by the server.":on?"On: completed tasks that meet every condition wait for an independent review.":"Off: no award is worked out.")+'</span>'
      +(on&&b.enabledAt?'<div class="hint" style="margin-top:2px">'+fmt(tr("Turned on {when}: only estimates approved after that count."),{when:esc(typeof scrDate==="function"?scrDate(b.enabledAt):b.enabledAt)})+'</div>':'')+'</div>'+scSwitchHtml("bonus.on","Efficiency bonus",lock)+'</div>'
    +'<div class="scr-eff-example" id="sceExample" aria-live="polite">'+sceExampleHtml(b)+'</div>'
    +'<div class="scr-grid scr-wide">'+num("sc_b_grace","bonus.grace","No bonus below",{pct:true,min:0,max:90,step:1,unit:"%"},tr("Saving less than this share of the estimate (the grace) earns nothing — small differences are normal."),tr("10%: an 8 h task done in 7.5 h earns nothing."))
      +num("sc_b_max","bonus.maxRate","Largest bonus",{pct:true,min:0,max:100,step:1,unit:"%"},tr("Never more than this share of the base points."),tr("20%: a task worth 8 pts earns at most +1.60."))+'</div>'
    +'<div class="scr-always"><b>'+(I.lock||"")+tr("Always true")+'</b><ul>'+pinned.map(function(p){ return '<li class="scr-pinned">'+p+'</li>'; }).join("")+'</ul></div>'
    +scrAdv(adv,{id:"bonus"})
    +'<p class="hint">'+tr("Operational metric, not compensation or a ranking.")+'</p>',
    {icon:I.star||I.gauge}); }
/* the bonus fields' names in the settings' history */
(function(){ if(typeof scPathLabel!=="function") return; var base=scPathLabel; var names={"bonus.on":"Efficiency bonus","bonus.grace":"No bonus below","bonus.rewardFactor":"Reward factor","bonus.maxRate":"Largest bonus","bonus.minE":"Smallest estimate","bonus.minA":"Least time logged","bonus.reviewBelowRatio":"Ask for a close look below","bonus.materialChangeHours":"Reopen the review after","bonus.baseSource":"Base points come from","bonus.hourMapping.bands":"Base points from hours","bonus.completionStages":"Completed means","bonus.requireApprovedVersion":"The latest version must be approved","bonus.minQuality":"Lowest quality score that can be approved","bonus.pilotTeams":"Pilot teams","bonus.enabledAt":"Turned on"};
  scPathLabel=function(p){ if(names[p]) return tr("Efficiency bonus")+(p==="bonus.on"?"":" · "+tr(names[p])); return base.apply(this,arguments); }; })();

/* ---------- the approvers' notification ---------- */
if(typeof NTEXT!=="undefined"&&!NTEXT.efficiency_review) NTEXT.efficiency_review="“{t}” is finished: its efficiency bonus waits for your review";
if(typeof NTEXT_ID!=="undefined"&&!NTEXT_ID.efficiency_review) NTEXT_ID.efficiency_review="“{t}” selesai: bonus efisiensinya menunggu review-mu";
if(typeof NC_CATEGORY!=="undefined"&&!NC_CATEGORY.efficiency_review) NC_CATEGORY.efficiency_review="approval";

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Provisional":"Sementara","Pending review":"Menunggu review","Approved":"Disetujui","Rejected":"Ditolak","Not eligible":"Tidak memenuhi syarat","No longer credited":"Tidak lagi dikreditkan",
  "The efficiency bonus runs as a pilot for other teams; this task's team is not in it.":"Bonus efisiensi sedang diujicobakan untuk tim lain; tim task ini tidak termasuk.",
  "The estimate is locked but nobody approved it: it was frozen when work started, or changed after its lock. A bonus needs an approved estimate.":"Estimasi terkunci tetapi tidak ada yang menyetujuinya: dibekukan saat pekerjaan dimulai, atau diubah setelah dikunci. Bonus memerlukan estimasi yang disetujui.",
  "The estimate was approved by someone who works on this task. A bonus needs someone else's approval.":"Estimasi disetujui oleh orang yang mengerjakan task ini. Bonus memerlukan persetujuan orang lain.",
  "The estimate was approved before the efficiency bonus was turned on. Awards are never made retroactively.":"Estimasi disetujui sebelum bonus efisiensi dinyalakan. Penghargaan tidak pernah diberikan surut.",
  "The estimate was approved only after the work had started. A bonus needs a baseline approved before the work.":"Estimasi baru disetujui setelah pekerjaan dimulai. Bonus memerlukan baseline yang disetujui sebelum pekerjaan.",
  "Only time from before the time log is recorded, and it never counts towards a bonus.":"Hanya ada waktu dari sebelum catatan waktu, dan itu tidak pernah dihitung untuk bonus.",
  "No work or revision time of theirs is logged on this task any more.":"Tidak ada lagi waktu kerja atau revisi miliknya yang tercatat di task ini.",
  "Time was logged, changed or deleted after the work was approved ({n} entries): check it before approving.":"Waktu dicatat, diubah, atau dihapus setelah pekerjaan disetujui ({n} entri): periksa sebelum menyetujui.",
  "The estimate went up from {from} h to {to} h in the {hours} hours before it was approved.":"Estimasi naik dari {from} jam menjadi {to} jam dalam {hours} jam sebelum disetujui.",
  "The estimate was set again after the work had started: {from} h → {to} h.":"Estimasi ditetapkan ulang setelah pekerjaan dimulai: {from} jam → {to} jam.",
  "The Weighted Points the base comes from are not locked yet.":"Poin Berbobot yang menjadi dasar belum dikunci.",
  "No version of the work has been uploaded yet.":"Belum ada versi pekerjaan yang diunggah.","The latest version is not approved yet.":"Versi terbaru belum disetujui.",
  "The latest version was approved by someone who worked on the task.":"Versi terbaru disetujui oleh orang yang mengerjakan task ini.",
  "pts":"poin","Estimated":"Estimasi","Actual":"Aktual","Base":"Dasar","Efficiency Bonus":"Bonus Efisiensi","Earned":"Diperoleh",
  "Efficiency bonus":"Bonus efisiensi","turned off: nothing changes until it is on again":"dimatikan: tidak ada yang berubah sampai dinyalakan lagi",
  "You worked on this task, so someone else reviews its bonus.":"Kamu mengerjakan task ini, jadi orang lain yang me-review bonusnya.",
  "Bonuses are never approved or rejected while acting as someone else.":"Bonus tidak pernah disetujui atau ditolak saat bertindak sebagai orang lain.",
  "Your share":"Bagianmu",
  "{h} h from before the time log are not counted.":"{h} jam dari sebelum catatan waktu tidak dihitung.",
  "Before it counts":"Sebelum dihitung","For the reviewer to look at — never an accusation":"Untuk diperhatikan reviewer — bukan tuduhan",
  "Approved by {name}":"Disetujui oleh {name}","Rejected by {name}":"Ditolak oleh {name}","quality":"kualitas",
  "How it is worked out":"Cara menghitungnya","Hide how it is worked out":"Sembunyikan cara menghitungnya","Recalculate":"Hitung ulang","Reject":"Tolak","Approve bonus":"Setujui bonus",
  "Operational metric, not compensation or a ranking.":"Metrik operasional, bukan kompensasi atau peringkat.",
  "Worked out again":"Dihitung ulang","Nothing changed":"Tidak ada yang berubah","Could not save":"Tidak dapat menyimpan",
  "Quality of the work (1–5)":"Kualitas pekerjaan (1–5)","optional":"opsional","No score":"Tanpa skor","This workspace approves a bonus from a score of {n}.":"Workspace ini menyetujui bonus mulai dari skor {n}.",
  "Shares":"Bagian","Shared by the time each one logged. Change them only with a reason.":"Dibagi menurut waktu yang dicatat masing-masing. Ubah hanya dengan alasan.",
  "Reason":"Alasan","Anything the people credited should know":"Hal yang perlu diketahui orang yang dikreditkan","Why is the bonus rejected?":"Mengapa bonus ditolak?",
  "Approve the efficiency bonus":"Setujui bonus efisiensi","Reject the efficiency bonus":"Tolak bonus efisiensi",
  "Approving also verifies the time the people credited logged on this task.":"Menyetujui juga memverifikasi waktu yang dicatat orang yang dikreditkan pada task ini.",
  "Rejected, the task keeps its base points and no bonus.":"Bila ditolak, task tetap mendapat poin dasarnya tanpa bonus.",
  "Cancel":"Batal","Total":"Total","must be 100%":"harus 100%","Give a quality score first":"Beri skor kualitas terlebih dulu","Write a reason for the change":"Tulis alasan perubahan",
  "The shares must add up to 100%":"Jumlah bagian harus 100%","Say why the shares change":"Jelaskan mengapa bagian berubah",
  "Efficiency bonus approved":"Bonus efisiensi disetujui","Efficiency bonus rejected":"Bonus efisiensi ditolak",
  "E {E} h, A {A} h, B {B} pts → bonus +{bonus}, earned {earned}":"E {E} jam, A {A} jam, B {B} poin → bonus +{bonus}, diperoleh {earned}",
  "Saved {saved}% of the estimate; {beyond}% beyond the grace × the reward factor {factor} = a bonus rate of {rate}% (at most {max}%).":"Hemat {saved}% dari estimasi; {beyond}% di atas batas toleransi × faktor imbalan {factor} = tingkat bonus {rate}% (paling banyak {max}%).",
  "Saved {saved}% of the estimate: within the {grace}% grace, so no bonus.":"Hemat {saved}% dari estimasi: masih dalam toleransi {grace}%, jadi tanpa bonus.",
  "Example":"Contoh","E = the approved estimate, A = the time logged, B = the task's base points.":"E = estimasi yang disetujui, A = waktu yang dicatat, B = poin dasar task.",
  "Finish faster than the approved estimate and earn a few extra points — never hours — once someone who did not work on the task approves it.":"Selesai lebih cepat dari estimasi yang disetujui bisa memberi sedikit poin tambahan — bukan jam — setelah disetujui oleh orang yang tidak mengerjakan task itu.",
  "In the offline demo the bonus stays off: awards are worked out by the server.":"Di demo offline bonus tetap mati: penghargaan dihitung oleh server.",
  "On: completed tasks that meet every condition wait for an independent review.":"Nyala: task selesai yang memenuhi semua syarat menunggu review independen.",
  "Off: no award is worked out.":"Mati: tidak ada penghargaan yang dihitung.",
  "Turned on {when}: only estimates approved after that count.":"Dinyalakan {when}: hanya estimasi yang disetujui setelahnya yang dihitung.",
  "No bonus below":"Tanpa bonus di bawah","Saving less than this share of the estimate (the grace) earns nothing — small differences are normal.":"Hemat kurang dari porsi estimasi ini (toleransi) tidak mendapat apa-apa — selisih kecil itu wajar.",
  "10%: an 8 h task done in 7.5 h earns nothing.":"10%: task 8 jam yang selesai dalam 7,5 jam tidak mendapat bonus.",
  "Largest bonus":"Bonus terbesar","Never more than this share of the base points.":"Tidak pernah lebih dari porsi poin dasar ini.","20%: a task worth 8 pts earns at most +1.60.":"20%: task bernilai 8 poin paling banyak mendapat +1,60.",
  "Always true":"Selalu berlaku",
  "An independent approver: someone neither assigned to the task nor credited on it — admins included.":"Penyetuju independen: orang yang tidak ditugaskan dan tidak dikreditkan di task itu — termasuk admin.",
  "Nobody approves their own bonus, nor while acting as someone else.":"Tidak ada yang menyetujui bonusnya sendiri, juga tidak saat bertindak sebagai orang lain.",
  "No cap per person or period yet: unusual patterns are flagged for the reviewer.":"Belum ada batas per orang atau periode: pola yang tidak biasa ditandai untuk reviewer.",
  "Never negative: taking longer never takes points away.":"Tidak pernah negatif: lebih lama dari estimasi tidak pernah mengurangi poin.",
  "Never backdated: only estimates approved after it is turned on count.":"Tidak berlaku surut: hanya estimasi yang disetujui setelah bonus dinyalakan yang dihitung.",
  "Reward factor":"Faktor imbalan","Each 1% saved beyond the grace adds this many % of the base points.":"Setiap 1% penghematan di atas toleransi menambah sekian % dari poin dasar.","0.5: 27.5% beyond the grace makes a 13.75% bonus.":"0,5: 27,5% di atas toleransi menjadi bonus 13,75%.",
  "Smallest estimate":"Estimasi terkecil","1 h: a 45-minute task never earns a bonus.":"1 jam: task 45 menit tidak pernah mendapat bonus.",
  "Least time logged":"Waktu tercatat minimum","0.25 h: under 15 minutes logged earns no bonus.":"0,25 jam: tercatat kurang dari 15 menit, tanpa bonus.",
  "Ask for a close look below":"Minta diperiksa teliti di bawah","Work done in less than this share of the estimate is flagged for the reviewer.":"Pekerjaan yang selesai kurang dari porsi estimasi ini ditandai untuk reviewer.","40%: an 8 h task done in under 3.2 h.":"40%: task 8 jam yang selesai dalam kurang dari 3,2 jam.",
  "Reopen the review after":"Buka review lagi setelah","Logged time changed by at least this much after approval sends the bonus back to review.":"Waktu tercatat yang berubah sebanyak ini atau lebih setelah disetujui mengembalikan bonus ke review.","0.25 h = 15 minutes.":"0,25 jam = 15 menit.",
  "Base points come from":"Poin dasar berasal dari","Weighted Points while that module is on, else the hours bands":"Poin Berbobot selama modul itu nyala, selain itu pita jam","Always the hours bands":"Selalu pita jam",
  "Base points from hours":"Poin dasar dari jam","Above that, up to":"Di atasnya, hingga","Up to":"Hingga","Hours":"Jam","Points":"Poin","Remove this band":"Hapus pita ini","Add a band":"Tambah pita",
  "A task gets the points of the first band its locked hours fit in; above them all, the last band. Hours never count as points themselves.":"Task mendapat poin dari pita pertama yang memuat jam terkuncinya; di atas semua pita, pita terakhir. Jam tidak pernah dihitung sebagai poin begitu saja.","6 h: up to 8 h → 5 pts.":"6 jam: hingga 8 jam → 5 poin.",
  "Completed means":"Selesai berarti","By default every closed stage except Declined.":"Secara bawaan setiap tahap tertutup kecuali Declined.",
  "The latest version must be approved":"Versi terbaru harus disetujui","By a reviewer who did not work on the task: the quality gate before a bonus can be reviewed.":"Oleh reviewer yang tidak mengerjakan task ini: gerbang kualitas sebelum bonus bisa di-review.",
  "Lowest quality score that can be approved":"Skor kualitas terendah yang bisa disetujui","No minimum: a score is optional":"Tanpa minimum: skor bersifat opsional",
  "Pilot teams":"Tim uji coba","No teams yet.":"Belum ada tim.","None chosen: every team. Chosen: only their tasks can earn a bonus.":"Tidak ada yang dipilih: semua tim. Dipilih: hanya task tim tersebut yang bisa mendapat bonus.",
  "Turned on":"Dinyalakan",
  "Approved the efficiency bonus":"Menyetujui bonus efisiensi","Rejected the efficiency bonus":"Menolak bonus efisiensi","Worked out the efficiency bonus again":"Menghitung ulang bonus efisiensi",
  "The efficiency bonus waits for review":"Bonus efisiensi menunggu review","The efficiency bonus went back to review":"Bonus efisiensi kembali ke review",
  "The efficiency bonus went back to provisional":"Bonus efisiensi kembali menjadi sementara","Removed with the task":"Dihapus bersama task"
});
</script>
<style>
.scr-eff-box{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);min-width:0}
.scr-eff-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.scr-eff-head svg{width:16px;height:16px;flex:none}
.scr-eff-line{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:13px;line-height:1.5;cursor:help;min-width:0}
.scr-eff-i{white-space:nowrap}
.scr-eff-sep{color:var(--color-text-tertiary)}
.scr-eff-st-approved{background:var(--color-success-soft);color:var(--color-success)}
.scr-eff-st-pending_review{background:var(--color-warning-soft);color:var(--color-text-primary)}
.scr-eff-st-rejected,.scr-eff-st-ineligible{background:var(--color-surface-sunken);color:var(--color-text-tertiary)}
.scr-eff-reasons,.scr-eff-flags{font-size:12.5px;min-width:0}
.scr-eff-reasons ul,.scr-eff-flags ul{margin:4px 0 0 18px;padding:0}
.scr-eff-reasons li,.scr-eff-flags li{margin:2px 0;overflow-wrap:anywhere}
.scr-eff-flags b{display:inline-flex;align-items:center;gap:4px}
.scr-eff-flags .i{width:14px;height:14px}
.scr-eff-acts{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.scr-eff-acts .spacer{flex:1}
.scr-eff-note{margin:0;font-size:11.5px}
.scr-eff-people,.scr-eff-review{overflow-wrap:anywhere}
.scr-eff-sum{margin:0 0 8px;line-height:1.6}
.scr-eff-share{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0}
.scr-eff-share .scr-unit{max-width:120px}
.scr-ok{color:var(--color-success)}
.scr-bad{color:var(--color-danger)}
.scr-eff-example{display:flex;flex-direction:column;gap:2px;padding:8px 10px;margin:8px 0 12px;border-radius:8px;background:var(--color-surface-sunken);font-size:13px}
.scr-bands{display:flex;flex-direction:column;gap:6px;margin-bottom:6px}
.scr-band{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.scr-band>span:first-child{min-width:110px}
.scr-band .scr-unit{max-width:140px}
.scr-band input{width:90px;border:1px solid var(--color-border);border-radius:10px;padding:6px 8px;background:var(--color-surface);color:var(--color-text-primary);outline:none;font-size:var(--fs-base)}
.scr-band input:focus{border-color:var(--color-primary)}
.scr-band input:disabled{opacity:.7}
.scr-checks{display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:4px}
.scr-checks label{display:inline-flex;align-items:center;gap:6px;font-size:13px}
.scr-always{padding:8px 10px;margin:4px 0 12px;border-radius:8px;background:var(--color-surface-sunken);font-size:var(--fs-sm)}
.scr-always b{display:flex;align-items:center;gap:6px}
.scr-always svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:2}
.scr-always ul{margin:4px 0 0 18px;padding:0;color:var(--color-text-secondary)}
.scr-wide{grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))}
.scr-fld .scr-help{margin:4px 0 0}
@media (max-width:640px){.scr-eff-line{font-size:12.5px}.scr-band>span:first-child{min-width:0;width:100%}}
</style>
