<script>
/* ============================================================
   SETTINGS → SMART SCORING (Oct 2026)
   Where an admin — or whoever is given scoring_manage_workspace — sets up Smart Scoring (docs/SMART-SCORING.md),
   right after Automation: the master switch; each module on or off with how it works (math only, AI-assisted, or
   both side by side), KPI and OKR as two separate switches under Outcomes; which metric capacity and velocity are
   counted in; the Effort Hours templates (the kinds of work the estimator already knows), multipliers and bounds; the
   Story Points thresholds; the weights of the factors, which must add up to 100% before anything is saved; what the
   AI may do and how often; how manual changes are approved. The efficiency bonus is shown as it will start, switched
   off: it comes in a later phase. Whoever manages roles also sees who holds each Smart Scoring permission (roles and
   extra permissions), and can give Team Lead and Creative Lead the approval and analytics permissions in one click.
   The last twenty changes are listed with who made them and what changed.
   Someone with scoring_view_analytics only sees the settings, without changing them.
   The tab draws at once from the settings the page already has, and refreshes its history in place. Edits are kept
   while the page redraws; Save sends them with the version they were made on, and if someone else saved in between
   the newer settings are loaded and the person is told to make their change again.
   In Roles & permissions, a role that can both change scores and approve them is warned: the duties are best kept
   apart (nobody approves their own task either way).
   ============================================================ */
var SC={draft:null,base:0,dirty:false,audit:null,loading:false,loadedAt:0,saving:false,owner:null};
var SC_FACTORS=["complexity","scope","uncertainty","dependencies"];
var SC_FACTOR_LABEL={complexity:"Complexity",scope:"Scope",uncertainty:"Uncertainty",dependencies:"Dependencies"};
var SC_MODULE_LABEL={hours:"Effort Hours",story:"Story Points",weighted:"Weighted Points",kpi:"KPI",okr:"OKR"};
var SC_MODE_LABEL={math_only:"Math only",ai_assisted:"AI-assisted",hybrid:"Hybrid"};
var SC_PRIMARY_LABEL={hours:"Hours",story_points:"Story Points",weighted_points:"Weighted Points"};

/* ---------- the edits, kept apart from the saved settings until Save ---------- */
function scDraft(){ var cur=scoringSettings(); if(!cur) return null;
  /* someone else signed in on this page: they start from the saved settings, not from another person's edits */
  if(SC.owner!==ME){ SC.draft=null; SC.audit=null; SC.loadedAt=0; SC.owner=ME; }
  if(!SC.draft||(!SC.dirty&&SC.base!==cur.configVersion)){ SC.draft=clone(cur); SC.base=cur.configVersion; SC.dirty=false; }
  return SC.draft; }
function scGet(path){ return String(path).split(".").reduce(function(o,k){ return o==null?undefined:o[k]; },SC.draft); }
function scPut(path,v){ var ks=String(path).split("."), o=SC.draft; for(var i=0;i<ks.length-1;i++){ if(o[ks[i]]==null||typeof o[ks[i]]!=="object") o[ks[i]]={}; o=o[ks[i]]; } o[ks[ks.length-1]]=v; SC.dirty=true; }
function scPct(x){ return Math.round((+x||0)*10000)/100; }
function scTotal(w){ return Math.round(SC_FACTORS.reduce(function(s,f){ return s+(+(w||{})[f]||0); },0)*10000)/100; }
function scInput(el){ if(!SC.draft) return; var k=el.getAttribute("data-k"), p=el.getAttribute("data-sc"), v=el.value;
  if(k==="num"||k==="pct"){ var n=parseFloat(String(v).replace(",",".")); if(!isFinite(n)) return; scPut(p,k==="pct"?n/100:n); }
  else if(k==="bool") scPut(p,v==="1"); else scPut(p,v);
  scTotalsPaint(); }
function scSwitch(b){ if(!SC.draft||b.disabled) return; var on=!b.classList.contains("on"); b.classList.toggle("on",on); b.setAttribute("aria-checked",String(on)); scPut(b.getAttribute("data-sc"),on); }

/* ---------- small pieces ---------- */
function scSwitchHtml(path,label,ro){ var on=!!scGet(path); return '<button type="button" class="switch'+(on?" on":"")+'" role="switch" aria-checked="'+on+'" aria-label="'+attr(tr(label))+'" data-sc="'+attr(path)+'"'+(ro?" disabled":' onclick="scSwitch(this)"')+'></button>'; }
function scNumHtml(id,path,label,o){ o=o||{}; var v=scGet(path), shown=o.pct?scPct(v):(v==null?"":v);
  return '<div class="field"><label for="'+id+'">'+tr(label)+'</label><div class="scr-unit"><input type="number" id="'+id+'" data-sc="'+attr(path)+'" data-k="'+(o.pct?"pct":"num")+'" value="'+attr(shown)+'"'+(o.min!=null?' min="'+o.min+'"':'')+(o.max!=null?' max="'+o.max+'"':'')+' step="'+(o.step||"any")+'"'+(o.ro?" disabled":' oninput="scInput(this)"')+'>'+(o.unit?'<span>'+esc(tr(o.unit))+'</span>':'')+'</div></div>'; }
function scSelectHtml(id,path,opts,ro,extraCls,label){ return selectHtml(id,opts.map(function(o){ return [o[0],tr(o[1])]; }),scGet(path),'data-sc="'+attr(path)+'" data-k="str"'+(extraCls?' class="'+extraCls+'"':'')+(label?' aria-label="'+attr(label)+'"':'')+(ro?" disabled":' onchange="scInput(this)"')); }
function scWeightsHtml(key,ro){ var w=scGet(key+".weights")||{};
  return '<div class="scr-grid">'+SC_FACTORS.map(function(f){ return scNumHtml("sc_"+key+"_w_"+f,key+".weights."+f,SC_FACTOR_LABEL[f],{pct:true,min:0,max:100,step:1,unit:"%",ro:ro}); }).join("")+'</div>'
    + '<div class="scr-total" id="sc_total_'+key+'" aria-live="polite"></div>'; }
function scTotalsPaint(){ ["weighted","story"].forEach(function(k){ var el=document.getElementById("sc_total_"+k); if(!el||!SC.draft) return; var t=scTotal((SC.draft[k]||{}).weights), ok=Math.abs(t-100)<0.05;
  el.className="scr-total "+(ok?"ok":"bad"); el.textContent=tr("Total")+": "+t+"%"+(ok?"":" · "+tr("must be 100% to save")); }); }
function scSaveFoot(ed){ return ed?'<span class="spacer"></span><button class="btn primary" onclick="scSaveClick()">'+tr("Save")+'</button>':''; }

/* ---------- the tab ---------- */
function setScoring(){
  var cur=scoringSettings(); if(!cur) return sp("Smart Scoring",'<div class="hint">'+tr("Smart Scoring is not available")+'</div>',null,I.gauge);
  scDraft(); var ed=canI.scoringConfigure(), ro=!ed;
  setTimeout(scLoadOnce,0); setTimeout(scTotalsPaint,0);
  return scMainPanel(cur,ed,ro)+scModulesPanel(ro,ed)+scHoursPanel(ro,ed)+scStoryPanel(ro,ed)+scWeightedPanel(ro,ed)
    +(typeof scoringAssetsSettingsHtml==="function"?scoringAssetsSettingsHtml(ro,ed):"")   /* src/scoring-assets.js */
    +scAiPanel(ro,ed)+scOverridesPanel(ro,ed)+scBonusPanel()
    +(canI.manageRoles()?scHoldersPanel():"")+scAuditPanel(); }
function scMainPanel(cur,ed,ro){
  var by=cur.updatedBy?person(cur.updatedBy).name:"";
  return sp("Smart Scoring",
    '<p class="hint" style="margin-bottom:10px">'+tr("Score tasks in effort hours, story points or weighted points, and link them to KPIs and OKRs. Each module gives a calculated value, an optional AI suggestion, and a final value that only permitted people change, every change kept with who made it and why. While Smart Scoring is off ZenCrevia works exactly as it does now; turning it off later hides it again without erasing anything.")+'</p>'
    + '<div class="pref"><div class="pl"><b>'+tr("Smart Scoring for this workspace")+'</b><span>'+tr("Off: nothing changes for anyone. On: the modules switched on below appear for the people allowed to use them.")+'</span></div>'+scSwitchHtml("enabled","Smart Scoring for this workspace",ro)+'</div>'
    + '<div class="hint scr-meta">'+tr("Settings version")+' '+cur.configVersion+(by?' · '+tr("last saved by")+' <span data-no-translate>'+esc(by)+'</span> · '+esc(ago(minAgo(cur.updatedAt),cur.updatedAt)):'')+'</div>'
    + (ro?'<div class="banner scr-ro">'+I.eye+'<span>'+tr("You can see these settings. Changing them takes the permission to set up Smart Scoring.")+'</span></div>':''),
    scSaveFoot(ed),I.gauge); }
function scModulesPanel(ro,ed){
  var modes=[["math_only","Math only"],["ai_assisted","AI-assisted"],["hybrid","Hybrid"]];
  var row=function(id,desc,withMode){ return '<div class="pref scr-module" data-module="'+id+'"><div class="pl"><b>'+tr(SC_MODULE_LABEL[id])+'</b><span>'+tr(desc)+'</span></div>'
    + (withMode?'<div class="field scr-mode">'+scSelectHtml("sc_mode_"+id,"modules."+id+".mode",modes,ro,"",tr(SC_MODULE_LABEL[id])+" · "+tr("How it works"))+'</div>':'')
    + scSwitchHtml("modules."+id+".on",SC_MODULE_LABEL[id],ro)+'</div>'; };
  return sp("Modules",
    '<p class="hint" style="margin-bottom:6px">'+tr("Each module is switched on and off on its own. Math only: the calculated value. AI-assisted: the AI suggests, the calculated value is always there to fall back on. Hybrid: both side by side.")+'</p>'
    + row("hours","Estimated and actual hours, from the kind of work, the number of deliverables, complexity and dependencies.",true)
    + row("story","A point on 1, 2, 3, 5, 8, 13 from a few 1–5 ratings. 13 suggests splitting the task.",true)
    + row("weighted","Points from weighted factor ratings, on the workspace's own scale.",true)
    + '<div class="scr-sub"><b>'+tr("Outcomes")+'</b><span>'+tr("KPI and OKR are switched on and off separately. Progress comes only from evidence — validated assets, successful completions — or from a value entered with a reason; points never count as progress.")+'</span></div>'
    + row("kpi","Indicators a task can contribute to.",false)
    + row("okr","Objectives and their key results; key results add up to their objective's progress.",false)
    + '<div class="field-row scr-primary">'+fieldHtml("sc_primary","Primary capacity metric",scSelectHtml("sc_primary","primaryCapacity",[["hours","Hours"],["story_points","Story Points"],["weighted_points","Weighted Points"]],ro))+'<div class="hint scr-field-hint">'+tr("The one metric velocity is counted in, so nothing is counted twice. Workload and capacity stay in hours.")+'</div></div>',
    scSaveFoot(ed),I.sync); }
function scHoursPanel(ro,ed){
  var kinds=(typeof ScoringSettings!=="undefined"&&ScoringSettings.KINDS)||Object.keys(scGet("hours.templates")||{});
  var name=function(id){ return typeof estKindName==="function"?estKindName(id):id; };
  var cell=function(id,f,step){ return '<td><input type="number" class="scr-cell" aria-label="'+attr(name(id)+" · "+tr({perUnit:"First deliverable (h)",low:"Low (h)",high:"High (h)",nextUnitFactor:"Each next deliverable (× the first)"}[f]))+'" data-sc="hours.templates.'+id+'.'+f+'" data-k="num" min="0" step="'+step+'" value="'+attr(scGet("hours.templates."+id+"."+f))+'"'+(ro?" disabled":' oninput="scInput(this)"')+'></td>'; };
  var cx=[[1,"1 · Very simple"],[2,"2 · Simple"],[3,"3 · Typical"],[4,"4 · Complex"],[5,"5 · Very complex"]], dp=[[0,"No open dependencies"],[1,"1 open dependency"],[2,"2 open dependencies"],[3,"3 or more"]];
  return sp("Effort Hours",
    '<p class="hint" style="margin-bottom:10px">'+tr("Estimated hours = the hours of the first deliverable, plus each next one at its share, × the complexity multiplier × the dependency multiplier, kept within the bounds. An estimate a task already has is kept as it is: nothing is recalculated unless someone asks.")+'</p>'
    + '<div class="tbl-wrap scr-tpl"><table class="tbl"><thead><tr><th>'+tr("Kind of work")+'</th><th>'+tr("First (h)")+'</th><th>'+tr("Low (h)")+'</th><th>'+tr("High (h)")+'</th><th>'+tr("Each next (× first)")+'</th></tr></thead><tbody>'
    + kinds.map(function(id){ return '<tr data-kind="'+attr(id)+'"><td class="t">'+esc(name(id))+'</td>'+cell(id,"perUnit","0.25")+cell(id,"low","0.25")+cell(id,"high","0.25")+cell(id,"nextUnitFactor","0.05")+'</tr>'; }).join("")
    + '</tbody></table></div>'
    + '<p class="hint" style="margin:6px 0 12px">'+tr("Each next: the share of the first that every next deliverable adds — 0.25 for a resize, about 0.5 for most work, 1 counts every deliverable in full. Never more than 1: a next piece is not more work than the first.")+'</p>'
    + '<div class="eyebrow">'+tr("Complexity multiplier")+'</div><div class="scr-grid">'+cx.map(function(c){ return scNumHtml("sc_cx_"+c[0],"hours.complexity."+c[0],c[1],{min:0.1,max:10,step:0.05,unit:"×",ro:ro}); }).join("")+'</div>'
    + '<div class="eyebrow">'+tr("Dependency multiplier")+'</div><div class="scr-grid">'+dp.map(function(c){ return scNumHtml("sc_dp_"+c[0],"hours.dependency."+c[0],c[1],{min:0.5,max:10,step:0.05,unit:"×",ro:ro}); }).join("")+'</div>'
    + '<div class="scr-grid">'+scNumHtml("sc_bmin","hours.bounds.min","Fewest hours",{min:0.05,max:40,step:0.25,unit:"h",ro:ro})+scNumHtml("sc_bmax","hours.bounds.max","Most hours",{min:0.5,max:400,step:1,unit:"h",ro:ro})+'</div>'
    + fieldHtml("sc_lock","An estimate is locked",scSelectHtml("sc_lock","hours.lockPolicy",[["approve","When it is approved"],["approve_or_work_start","When it is approved — or, if work starts first, it is frozen then (unapproved: it never earns a bonus)"]],ro)),
    scSaveFoot(ed),I.clock||I.sync); }
function scStoryPanel(ro,ed){
  var pts=[1,2,3,5,8];
  return sp("Story Points",
    '<p class="hint" style="margin-bottom:10px">'+tr("A task is rated 1–5 on each factor; the weighted index picks its point on 1, 2, 3, 5, 8, 13. Story points are never turned into hours or pay.")+'</p>'
    + '<div class="eyebrow">'+tr("Weight of each factor")+'</div>'+scWeightsHtml("story",ro)
    + '<div class="eyebrow">'+tr("The highest index each point is given for")+'</div><div class="scr-grid">'+pts.map(function(p,i){ return scNumHtml("sc_th_"+i,"story.thresholds."+i,tr(p===1?"1 point up to":"{n} points up to").replace("{n}",p),{min:1,max:5,step:0.05,ro:ro}); }).join("")+'</div>'
    + '<div class="hint">'+tr("Above the last: 13 points, which suggests splitting the task. The thresholds are kept in order when saved.")+'</div>',
    scSaveFoot(ed),I.list); }
function scWeightedPanel(ro,ed){
  return sp("Weighted Points",
    '<p class="hint" style="margin-bottom:10px">'+tr("Weighted index = the sum of each factor's weight × its rating (1–5), placed on a scale from 1 to the top set here. Changing the weights or the scale starts a new mapping version; scores already given keep the one they were made with.")+'</p>'
    + '<div class="eyebrow">'+tr("Weight of each factor")+'</div>'+scWeightsHtml("weighted",ro)
    + '<div class="scr-grid">'+scNumHtml("sc_wmax","weighted.scaleMax","Top of the scale",{min:2,max:100,step:1,unit:"pts",ro:ro})+'</div>'
    + '<div class="hint">'+tr("Mapping version")+' '+esc(scGet("weighted.mappingVersion"))+'</div>',
    scSaveFoot(ed),I.analytics); }
function scAiPanel(ro,ed){
  var sw=function(path,label,desc){ return '<div class="pref"><div class="pl"><b>'+tr(label)+'</b><span>'+tr(desc)+'</span></div>'+scSwitchHtml(path,label,ro)+'</div>'; };
  return sp("AI suggestions",
    '<p class="hint" style="margin-bottom:6px">'+tr("The AI only suggests: it never sets a locked or manually approved value, grants a bonus or records progress. It receives the title, the brief, the number of deliverables, the labels, the team and up to 800 characters of the description without links or e-mail addresses; similar finished tasks only when the workspace shares its data with the AI (Settings → AI & integrations).")+'</p>'
    + sw("ai.onCreate","Suggest when a task is created","Only once Smart Scoring is on. While it is off, the estimate filled in on Create works as it always has.")
    + sw("ai.onBriefRevision","Suggest again when the brief changes a lot","Never on every keystroke or when a task is opened.")
    + '<div class="scr-grid">'+scNumHtml("sc_ai_conf","ai.minConfidence","Warn below confidence",{pct:true,min:0,max:100,step:5,unit:"%",ro:ro})
    + scNumHtml("sc_ai_user","ai.perUserDaily","Suggestions per person a day",{min:0,max:1000,step:1,ro:ro})
    + scNumHtml("sc_ai_ws","ai.workspaceDaily","Suggestions for the workspace a day",{min:0,max:100000,step:1,ro:ro})+'</div>'
    + fieldHtml("sc_ai_cmp","Similar finished tasks as examples",scSelectHtml("sc_ai_cmp","ai.comparables",[["team","Of the same team"],["none","None"]],ro)),
    scSaveFoot(ed),I.sparkle); }
function scOverridesPanel(ro,ed){
  var sw=function(path,label,desc){ return '<div class="pref"><div class="pl"><b>'+tr(label)+'</b><span>'+tr(desc)+'</span></div>'+scSwitchHtml(path,label,ro)+'</div>'; };
  return sp("Manual changes",
    sw("overrides.requireReason","A reason for every manual change","Kept in the task's scoring history with who made the change.")
    + sw("overrides.requireApproval","Manual changes wait for approval","Someone with the permission to approve estimates confirms them first.")
    + sw("overrides.allowSelfApproveEstimate","Someone assigned to a task may approve its estimate","Not recommended. Recorded in the history, and an estimate approved this way never earns a bonus."),
    scSaveFoot(ed),I.edit); }
function scBonusPanel(){
  var b=scGet("bonus")||{}, f=function(id,label,v,unit){ return '<div class="field"><label for="'+id+'">'+tr(label)+'</label><div class="scr-unit"><input type="number" id="'+id+'" value="'+attr(v)+'" disabled>'+(unit?'<span>'+esc(tr(unit))+'</span>':'')+'</div></div>'; };
  var bands=((b.hourMapping||{}).bands||[]).map(function(x,i,all){ return '<span class="badge">'+(i===all.length-1&&all.length>1?tr("more")+" → ":"≤ "+x[0]+" h → ")+x[1]+" "+tr("pts")+'</span>'; }).join(" ");
  return sp("Efficiency bonus",
    '<div class="banner scr-later">'+(I.clock||"")+'<span>'+tr("Available in a later phase. The bonus stays off until then; these are the values it will start from.")+'</span></div>'
    + '<p class="hint" style="margin:10px 0">'+tr("Finishing faster than an approved, locked estimate may earn bonus points — never extra hours — once the work passes review and someone other than the people credited approves it, admins included.")+'</p>'
    + '<div class="pref"><div class="pl"><b>'+tr("Efficiency bonus")+'</b><span>'+tr("Off")+'</span></div><button type="button" class="switch" role="switch" aria-checked="false" aria-label="'+attr(tr("Efficiency bonus"))+'" disabled></button></div>'
    + '<div class="scr-grid">'+f("sc_b_grace","Savings that do not count",scPct(b.grace),"%")+f("sc_b_reward","Reward factor",b.rewardFactor,"")+f("sc_b_max","Most bonus",scPct(b.maxRate),"%")
    + f("sc_b_mine","Shortest estimate",b.minE,"h")+f("sc_b_mina","Least time logged",b.minA,"h")+f("sc_b_review","Review when time is below",scPct(b.reviewBelowRatio),"%")+'</div>'
    + '<div class="eyebrow">'+tr("Base points from hours")+'</div><div class="scr-bands">'+bands+'</div>'
    + '<div class="hint">'+tr("Completed means every closed stage except Declined. Weighted Points are the base when that module is on.")+'</div>',
    null,I.star); }
function scHoldersPanel(){
  var caps=(typeof CAPS!=="undefined"&&CAPS||[]).filter(function(c){ return SCORING_CAPS.indexOf(c[0])>=0; });
  var grants=(typeof CAP_GRANTS!=="undefined"?CAP_GRANTS:[]).filter(function(g){ return typeof capGrantLive!=="function"||capGrantLive(g); });
  var rows=caps.map(function(c){
    var roles=ROLES.filter(function(r){ return r.id==="admin"||(r.permissions||[]).indexOf(c[0])>=0; }).map(function(r){ return '<span class="badge" data-no-translate>'+esc(r.name)+'</span>'; }).join(" ");
    var people=grants.filter(function(g){ return g.cap===c[0]&&PEOPLE[g.userId]; }).map(function(g){ return '<span class="badge scr-grant" data-no-translate>'+esc(PEOPLE[g.userId].name)+(g.expiresAt&&typeof capGrantDate==="function"?' · '+esc(tr("until"))+' '+esc(capGrantDate(g.expiresAt)):'')+'</span>'; }).join(" ");
    return '<div class="pref scr-holder" data-cap="'+attr(c[0])+'"><div class="pl"><b>'+esc(tr(c[1]))+'</b><span class="scr-holder-who">'+roles+(people?' <span class="hint">'+tr("and, on top of their role:")+'</span> '+people:'')+'</span></div></div>'; }).join("");
  var missing=scoringLeadsMissing();
  return sp("Who holds the Smart Scoring permissions",
    '<p class="hint" style="margin-bottom:6px">'+tr("Admin always holds all of them. Give one to a role in Roles & permissions, or to one person from their row in Members. Being assigned to a task never gives any of them.")+'</p>'+rows,
    '<span class="hint scr-leads-hint">'+tr(missing?"Team Lead and Creative Lead can be given the permissions to approve estimates and finished work and to see the team's scoring analytics.":"Team Lead and Creative Lead have the approval and analytics permissions.")+'</span><span class="spacer"></span>'
    + '<button class="btn scr-leads" id="scLeadsBtn" onclick="scLeadsClick()"'+(missing?'':' disabled')+'>'+I.team+tr("Give Team Lead and Creative Lead these permissions")+'</button>',I.lock); }
function scAuditPanel(){ return sp("Recent changes",'<div id="scAudit">'+scAuditHtml()+'</div>',null,I.list); }

/* ---------- the history of the settings ---------- */
function scVal(path,v){ if(v===null||v===undefined) return "—"; if(typeof v==="boolean") return tr(v?"on":"off");
  if(/\.mode$/.test(path)) return tr(SC_MODE_LABEL[v]||v); if(path==="primaryCapacity") return tr(SC_PRIMARY_LABEL[v]||v);
  if(Array.isArray(v)) return v.map(function(x){ return Array.isArray(x)?x.join("→"):x; }).join(", ");
  if(/\.weights\./.test(path)||/minConfidence|grace|maxRate|reviewBelowRatio/.test(path)) return scPct(v)+"%";
  return String(v); }
function scPathLabel(p){ var s=p.split("."), mod=function(id){ return tr(SC_MODULE_LABEL[id]||id); };
  if(p==="enabled") return tr("Smart Scoring");
  if(s[0]==="modules") return mod(s[1])+(s[2]==="mode"?" · "+tr("How it works"):"");
  if(p==="primaryCapacity") return tr("Primary capacity metric");
  if(s[0]==="hours"&&s[1]==="templates") return tr("Effort Hours")+" · "+(typeof estKindName==="function"?estKindName(s[2]):s[2])+" · "+tr({perUnit:"First (h)",low:"Low (h)",high:"High (h)",nextUnitFactor:"Each next (× first)"}[s[3]]||s[3]);
  if(s[0]==="hours"&&s[1]==="complexity") return tr("Complexity multiplier")+" "+s[2];
  if(s[0]==="hours"&&s[1]==="dependency") return tr("Dependency multiplier")+" "+s[2];
  if(p==="hours.bounds.min") return tr("Fewest hours"); if(p==="hours.bounds.max") return tr("Most hours"); if(p==="hours.lockPolicy") return tr("An estimate is locked");
  if(s[1]==="weights") return mod(s[0])+" · "+tr(SC_FACTOR_LABEL[s[2]]||s[2]);
  if(p==="story.thresholds") return tr("Story Points")+" · "+tr("thresholds");
  if(p==="weighted.scaleMax") return tr("Weighted Points")+" · "+tr("Top of the scale"); if(p==="weighted.mappingVersion") return tr("Weighted Points")+" · "+tr("Mapping version");
  var named={"ai.onCreate":"Suggest when a task is created","ai.onBriefRevision":"Suggest again when the brief changes a lot","ai.minConfidence":"Warn below confidence","ai.perUserDaily":"Suggestions per person a day","ai.workspaceDaily":"Suggestions for the workspace a day","ai.comparables":"Similar finished tasks as examples",
    "overrides.requireReason":"A reason for every manual change","overrides.requireApproval":"Manual changes wait for approval","overrides.allowSelfApproveEstimate":"Someone assigned to a task may approve its estimate"};
  if(named[p]) return tr(named[p]);
  if(s[0]==="bonus") return tr("Efficiency bonus")+" · "+s.slice(1).join(".");
  return p; }
function scAuditHtml(){
  if(SC.audit===null) return '<div class="hint">'+tr("Loading…")+'</div>';
  if(!SC.audit.length) return '<div class="hint">'+tr("No changes yet.")+'</div>';
  return SC.audit.map(function(a){ var who=a.by?person(a.by).name:"ZenCrevia", what;
    if(a.action==="leads_delegated") what=tr("Gave the approval and analytics permissions to")+" "+Object.keys(a.added||{}).map(function(id){ var r=byId(ROLES,id); return r?r.name:id; }).join(", ");
    else { var d=a.diff||[]; what=d.slice(0,6).map(function(c){ return '<span class="scr-change"><b>'+esc(scPathLabel(c.path))+'</b> '+esc(scVal(c.path,c.from))+' → '+esc(scVal(c.path,c.to))+'</span>'; }).join("")+(d.length>6?'<span class="scr-change">+'+(d.length-6)+' '+tr("more")+'</span>':''); }
    return '<div class="pref scr-audit-row"><div class="pl"><b><span data-no-translate>'+esc(who)+'</span>'+(a.impersonatedBy?' <span class="badge">'+tr("acting as")+'</span>':'')+(a.configVersion?' <span class="badge">v'+esc(a.configVersion)+'</span>':'')+'</b><span>'+esc(ago(minAgo(a.at),a.at))+'</span>'
      + '<span class="scr-changes">'+(a.action==="leads_delegated"?esc(what):what)+'</span>'+(a.reason?'<span>'+esc(a.reason)+'</span>':'')+'</div></div>'; }).join(""); }
function scAuditPaint(){ var el=document.getElementById("scAudit"); if(el) el.innerHTML=scAuditHtml(); }
/* fresh settings and history from the server, at most every 15 s; what is on screen stays until they arrive */
function scLoadOnce(){ if(SC.loading||(SC.loadedAt&&Date.now()-SC.loadedAt<15000)) return; SC.loading=true;
  scoringLoad().then(function(r){ SC.loading=false; SC.loadedAt=Date.now(); SC.audit=(r&&r.audit)||[]; var cur=scoringSettings();
    if(!SC.dirty&&cur&&cur.configVersion!==SC.base&&S.screen==="settings"&&S.settingsTab==="scoring"){ SC.draft=null; bgRedraw(function(){ renderScreen(false); }); } else scAuditPaint(); })
  .catch(function(){ SC.loading=false; if(SC.audit===null) SC.audit=[]; scAuditPaint(); }); }

/* ---------- saving ---------- */
function scSaveClick(){
  if(!canI.scoringConfigure()||!SC.draft||SC.saving) return;
  var bad=["weighted","story"].filter(function(k){ return Math.abs(scTotal((SC.draft[k]||{}).weights)-100)>=0.05; });
  if(bad.length){ var k=bad[0], el=document.getElementById("sc_total_"+k); scTotalsPaint(); if(el) el.scrollIntoView({block:"center",behavior:"smooth"});
    return toast(tr("The weights must add up to 100% before saving")+" ("+tr(SC_MODULE_LABEL[k])+": "+scTotal(SC.draft[k].weights)+"%)","bad"); }
  SC.saving=true;
  scoringSave(clone(SC.draft),SC.base).then(function(r){ SC.saving=false; SC.draft=clone(r.settings); SC.base=r.settings.configVersion; SC.dirty=false; if(r.audit) SC.audit=r.audit; SC.loadedAt=Date.now();
    toast(tr(r.unchanged?"Nothing to save: no changes":"Smart Scoring saved")); refresh(); })
  .catch(function(e){ SC.saving=false;
    scoringLoad().then(function(d){ var cur=scoringSettings();
      if(cur&&cur.configVersion!==SC.base){ SC.draft=clone(cur); SC.base=cur.configVersion; SC.dirty=false; if(d&&d.audit) SC.audit=d.audit; refresh(); toast(tr("Someone else saved the Smart Scoring settings in the meantime. Their version is loaded now; make your change again."),"bad"); }
      else toast(e.message,"bad"); }).catch(function(){ toast(e.message,"bad"); }); }); }
function scLeadsClick(){ if(!canI.manageRoles()) return;
  confirmModal(tr("Give Team Lead and Creative Lead these permissions?"),esc(tr("They will be able to approve estimates and finished work (never on their own tasks) and to see the team's scoring analytics. Nothing else about the roles changes, and each permission can be taken back in Roles & permissions.")),function(){
    scoringDelegateLeads().then(function(r){ var n=Object.keys((r&&r.added)||{}).length; if(r&&r.audit) SC.audit=r.audit; toast(tr(n?"Team Lead and Creative Lead have the approval and analytics permissions now":"They already had them")); refresh(); }).catch(function(e){ toast(e.message,"bad"); }); }); }

/* ---------- Roles & permissions: a role that both changes scores and approves them ---------- */
function scoringDutyWarn(){ var m=document.getElementById("modal"); if(!m) return; var edit=m.querySelector('[data-cap="scoring_edit_task"]'); if(!edit) return;
  var on=function(c){ var b=m.querySelector('[data-cap="'+c+'"]'); return !!(b&&b.classList.contains("on")); };
  var both=!edit.disabled&&on("scoring_edit_task")&&(on("scoring_approve_estimate")||on("scoring_approve_completion")), w=m.querySelector(".scr-duty-warn"), g=edit.closest(".cap-group");
  if(both&&!w&&g){ var head=g.querySelector(".cap-group-head"); if(head) head.insertAdjacentHTML("afterend",'<div class="banner warn scr-duty-warn" role="status"><span>'+esc(tr("This role can both change scores and approve them. Recommended: give these to different people. Nobody approves an estimate or a bonus on their own task either way."))+'</span></div>'); }
  else if(!both&&w) w.remove(); }
(function(){ if(typeof roleModal!=="function") return; var base=roleModal; roleModal=function(){ var out=base.apply(this,arguments); try{ scoringDutyWarn(); }catch(e){ console.error(e); } return out; }; })();
(function(){ if(typeof capGroupSync!=="function") return; var base=capGroupSync; capGroupSync=function(){ var out=base.apply(this,arguments); try{ scoringDutyWarn(); }catch(e){ console.error(e); } return out; }; })();

/* Indonesian, for the words this tab adds (a word the page already translates keeps its translation) */
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Effort Hours":"Jam Kerja","Story Points":"Story Points","Weighted Points":"Poin Berbobot","KPI":"KPI","OKR":"OKR","Hours":"Jam",
  "Math only":"Hanya hitungan","AI-assisted":"Dibantu AI","Hybrid":"Hibrida","How it works":"Cara kerja",
  "Complexity":"Kompleksitas","Scope":"Cakupan","Uncertainty":"Ketidakpastian","Dependencies":"Ketergantungan",
  "Total":"Total","must be 100% to save":"harus 100% agar bisa disimpan",
  "Score tasks in effort hours, story points or weighted points, and link them to KPIs and OKRs. Each module gives a calculated value, an optional AI suggestion, and a final value that only permitted people change, every change kept with who made it and why. While Smart Scoring is off ZenCrevia works exactly as it does now; turning it off later hides it again without erasing anything.":"Beri skor task dalam jam kerja, story points, atau poin berbobot, lalu kaitkan dengan KPI dan OKR. Setiap modul memberi nilai hitungan, saran AI (opsional), dan nilai akhir yang hanya bisa diubah orang yang berwenang; setiap perubahan dicatat beserta siapa dan alasannya. Selama Smart Scoring mati, ZenCrevia bekerja persis seperti sekarang; mematikannya nanti menyembunyikannya lagi tanpa menghapus apa pun.",
  "Smart Scoring for this workspace":"Smart Scoring untuk workspace ini",
  "Off: nothing changes for anyone. On: the modules switched on below appear for the people allowed to use them.":"Mati: tidak ada yang berubah bagi siapa pun. Nyala: modul yang dinyalakan di bawah muncul bagi orang yang boleh memakainya.",
  "Settings version":"Versi pengaturan","last saved by":"terakhir disimpan oleh",
  "You can see these settings. Changing them takes the permission to set up Smart Scoring.":"Kamu bisa melihat pengaturan ini. Untuk mengubahnya perlu izin mengatur Smart Scoring.",
  "Modules":"Modul",
  "Each module is switched on and off on its own. Math only: the calculated value. AI-assisted: the AI suggests, the calculated value is always there to fall back on. Hybrid: both side by side.":"Setiap modul dinyalakan dan dimatikan sendiri-sendiri. Hanya hitungan: nilai hasil hitungan. Dibantu AI: AI memberi saran, nilai hitungan selalu ada sebagai cadangan. Hibrida: keduanya berdampingan.",
  "Estimated and actual hours, from the kind of work, the number of deliverables, complexity and dependencies.":"Jam estimasi dan aktual, dari jenis pekerjaan, jumlah deliverable, kompleksitas, dan ketergantungan.",
  "A point on 1, 2, 3, 5, 8, 13 from a few 1–5 ratings. 13 suggests splitting the task.":"Satu poin pada 1, 2, 3, 5, 8, 13 dari beberapa penilaian 1–5. 13 menyarankan task dipecah.",
  "Points from weighted factor ratings, on the workspace's own scale.":"Poin dari penilaian faktor berbobot, pada skala milik workspace.",
  "Outcomes":"Hasil (Outcomes)",
  "KPI and OKR are switched on and off separately. Progress comes only from evidence — validated assets, successful completions — or from a value entered with a reason; points never count as progress.":"KPI dan OKR dinyalakan dan dimatikan terpisah. Progres hanya berasal dari bukti — aset yang divalidasi, penyelesaian yang berhasil — atau nilai yang diisi beserta alasan; poin tidak pernah dihitung sebagai progres.",
  "Indicators a task can contribute to.":"Indikator yang bisa didukung oleh sebuah task.",
  "Objectives and their key results; key results add up to their objective's progress.":"Objective dan key result-nya; key result menjumlah menjadi progres objective-nya.",
  "Primary capacity metric":"Metrik kapasitas utama",
  "The one metric velocity is counted in, so nothing is counted twice. Workload and capacity stay in hours.":"Satu-satunya metrik untuk menghitung velocity, agar tidak ada yang terhitung dua kali. Beban kerja dan kapasitas tetap dalam jam.",
  "Estimated hours = the hours of the first deliverable, plus each next one at its share, × the complexity multiplier × the dependency multiplier, kept within the bounds. An estimate a task already has is kept as it is: nothing is recalculated unless someone asks.":"Jam estimasi = jam deliverable pertama, ditambah tiap deliverable berikutnya sesuai porsinya, × pengali kompleksitas × pengali ketergantungan, dijaga dalam batas. Estimasi yang sudah ada pada task tetap seperti adanya: tidak ada yang dihitung ulang kecuali diminta.",
  "Kind of work":"Jenis pekerjaan","First (h)":"Pertama (jam)","Low (h)":"Terendah (jam)","High (h)":"Tertinggi (jam)","Each next (× first)":"Tiap berikutnya (× pertama)",
  "First deliverable (h)":"Deliverable pertama (jam)","Each next deliverable (× the first)":"Tiap deliverable berikutnya (× yang pertama)",
  "Each next: the share of the first that every next deliverable adds — 0.25 for a resize, about 0.5 for most work, 1 counts every deliverable in full. Never more than 1: a next piece is not more work than the first.":"Tiap berikutnya: porsi dari yang pertama yang ditambahkan setiap deliverable berikutnya — 0,25 untuk resize, sekitar 0,5 untuk kebanyakan pekerjaan, 1 menghitung setiap deliverable penuh. Tidak lebih dari 1: potongan berikutnya tidak lebih berat dari yang pertama.",
  "Complexity multiplier":"Pengali kompleksitas","Dependency multiplier":"Pengali ketergantungan",
  "1 · Very simple":"1 · Sangat sederhana","2 · Simple":"2 · Sederhana","3 · Typical":"3 · Biasa","4 · Complex":"4 · Kompleks","5 · Very complex":"5 · Sangat kompleks",
  "No open dependencies":"Tanpa ketergantungan terbuka","1 open dependency":"1 ketergantungan terbuka","2 open dependencies":"2 ketergantungan terbuka","3 or more":"3 atau lebih",
  "Fewest hours":"Jam paling sedikit","Most hours":"Jam paling banyak","An estimate is locked":"Estimasi dikunci",
  "When it is approved":"Saat disetujui",
  "When it is approved — or, if work starts first, it is frozen then (unapproved: it never earns a bonus)":"Saat disetujui — atau, bila pekerjaan dimulai lebih dulu, dibekukan saat itu (belum disetujui: tidak pernah mendapat bonus)",
  "A task is rated 1–5 on each factor; the weighted index picks its point on 1, 2, 3, 5, 8, 13. Story points are never turned into hours or pay.":"Task dinilai 1–5 pada tiap faktor; indeks berbobot memilih poinnya pada 1, 2, 3, 5, 8, 13. Story points tidak pernah diubah menjadi jam atau bayaran.",
  "Weight of each factor":"Bobot tiap faktor","The highest index each point is given for":"Indeks tertinggi untuk tiap poin","1 point up to":"1 poin hingga","{n} points up to":"{n} poin hingga",
  "Above the last: 13 points, which suggests splitting the task. The thresholds are kept in order when saved.":"Di atas yang terakhir: 13 poin, yang menyarankan task dipecah. Ambang diurutkan saat disimpan.",
  "Weighted index = the sum of each factor's weight × its rating (1–5), placed on a scale from 1 to the top set here. Changing the weights or the scale starts a new mapping version; scores already given keep the one they were made with.":"Indeks berbobot = jumlah bobot tiap faktor × nilainya (1–5), ditempatkan pada skala dari 1 sampai batas atas yang diatur di sini. Mengubah bobot atau skala memulai versi pemetaan baru; skor yang sudah diberikan tetap memakai versinya sendiri.",
  "Top of the scale":"Batas atas skala","pts":"poin","Mapping version":"Versi pemetaan",
  "AI suggestions":"Saran AI",
  "The AI only suggests: it never sets a locked or manually approved value, grants a bonus or records progress. It receives the title, the brief, the number of deliverables, the labels, the team and up to 800 characters of the description without links or e-mail addresses; similar finished tasks only when the workspace shares its data with the AI (Settings → AI & integrations).":"AI hanya memberi saran: AI tidak pernah menetapkan nilai yang terkunci atau disetujui manual, memberi bonus, atau mencatat progres. AI menerima judul, brief, jumlah deliverable, label, tim, dan hingga 800 karakter deskripsi tanpa link atau alamat email; task serupa yang sudah selesai hanya bila workspace berbagi datanya dengan AI (Pengaturan → AI & integrasi).",
  "Suggest when a task is created":"Beri saran saat task dibuat",
  "Only once Smart Scoring is on. While it is off, the estimate filled in on Create works as it always has.":"Hanya setelah Smart Scoring dinyalakan. Selama mati, estimasi yang terisi saat Create bekerja seperti biasa.",
  "Suggest again when the brief changes a lot":"Beri saran lagi bila brief banyak berubah",
  "Never on every keystroke or when a task is opened.":"Tidak pernah di setiap ketikan atau saat task dibuka.",
  "Warn below confidence":"Peringatkan di bawah tingkat keyakinan","Suggestions per person a day":"Saran per orang per hari","Suggestions for the workspace a day":"Saran untuk workspace per hari",
  "Similar finished tasks as examples":"Task serupa yang selesai sebagai contoh","Of the same team":"Dari tim yang sama","None":"Tidak ada",
  "Manual changes":"Perubahan manual",
  "A reason for every manual change":"Alasan untuk setiap perubahan manual","Kept in the task's scoring history with who made the change.":"Disimpan di riwayat skor task beserta siapa yang mengubahnya.",
  "Manual changes wait for approval":"Perubahan manual menunggu persetujuan","Someone with the permission to approve estimates confirms them first.":"Orang yang berizin menyetujui estimasi mengonfirmasinya terlebih dulu.",
  "Someone assigned to a task may approve its estimate":"Orang yang ditugaskan pada task boleh menyetujui estimasinya",
  "Not recommended. Recorded in the history, and an estimate approved this way never earns a bonus.":"Tidak disarankan. Dicatat di riwayat, dan estimasi yang disetujui dengan cara ini tidak pernah mendapat bonus.",
  "Efficiency bonus":"Bonus efisiensi",
  "Available in a later phase. The bonus stays off until then; these are the values it will start from.":"Tersedia di tahap berikutnya. Bonus tetap mati sampai saat itu; inilah nilai awalnya nanti.",
  "Finishing faster than an approved, locked estimate may earn bonus points — never extra hours — once the work passes review and someone other than the people credited approves it, admins included.":"Selesai lebih cepat dari estimasi yang disetujui dan dikunci bisa mendapat poin bonus — tidak pernah jam tambahan — setelah pekerjaan lolos review dan disetujui oleh orang selain yang dikreditkan, termasuk admin.",
  "Off":"Mati","Savings that do not count":"Penghematan yang tidak dihitung","Reward factor":"Faktor imbalan","Most bonus":"Bonus maksimal","Shortest estimate":"Estimasi terpendek","Least time logged":"Waktu tercatat paling sedikit","Review when time is below":"Review bila waktu di bawah",
  "Base points from hours":"Poin dasar dari jam","more":"lebih",
  "Completed means every closed stage except Declined. Weighted Points are the base when that module is on.":"Selesai berarti setiap tahap tertutup kecuali Declined. Poin Berbobot menjadi dasar bila modul itu nyala.",
  "Who holds the Smart Scoring permissions":"Siapa yang memegang izin Smart Scoring",
  "Admin always holds all of them. Give one to a role in Roles & permissions, or to one person from their row in Members. Being assigned to a task never gives any of them.":"Admin selalu memegang semuanya. Beri ke sebuah role di Role & izin, atau ke satu orang dari barisnya di Members. Ditugaskan pada task tidak pernah memberi izin ini.",
  "and, on top of their role:":"dan, di luar role-nya:",
  "Team Lead and Creative Lead can be given the permissions to approve estimates and finished work and to see the team's scoring analytics.":"Team Lead dan Creative Lead bisa diberi izin menyetujui estimasi dan pekerjaan selesai serta melihat analitik skor tim.",
  "Team Lead and Creative Lead have the approval and analytics permissions.":"Team Lead dan Creative Lead sudah punya izin persetujuan dan analitik.",
  "Give Team Lead and Creative Lead these permissions":"Beri izin ini ke Team Lead dan Creative Lead",
  "Give Team Lead and Creative Lead these permissions?":"Beri izin ini ke Team Lead dan Creative Lead?",
  "They will be able to approve estimates and finished work (never on their own tasks) and to see the team's scoring analytics. Nothing else about the roles changes, and each permission can be taken back in Roles & permissions.":"Mereka akan bisa menyetujui estimasi dan pekerjaan selesai (tidak pernah pada task sendiri) serta melihat analitik skor tim. Hal lain dari role tidak berubah, dan setiap izin bisa dicabut di Role & izin.",
  "Team Lead and Creative Lead have the approval and analytics permissions now":"Team Lead dan Creative Lead kini punya izin persetujuan dan analitik","They already had them":"Mereka sudah memilikinya",
  "Recent changes":"Perubahan terakhir","Loading…":"Memuat…","No changes yet.":"Belum ada perubahan.","acting as":"bertindak sebagai","on":"nyala","off":"mati","thresholds":"ambang",
  "Gave the approval and analytics permissions to":"Memberi izin persetujuan dan analitik kepada",
  "The weights must add up to 100% before saving":"Bobot harus berjumlah 100% sebelum disimpan",
  "Nothing to save: no changes":"Tidak ada yang disimpan: tidak ada perubahan","Smart Scoring saved":"Smart Scoring tersimpan",
  "Someone else saved the Smart Scoring settings in the meantime. Their version is loaded now; make your change again.":"Orang lain sudah menyimpan pengaturan Smart Scoring. Versi mereka kini dimuat; ulangi perubahanmu.",
  "This role can both change scores and approve them. Recommended: give these to different people. Nobody approves an estimate or a bonus on their own task either way.":"Role ini bisa mengubah skor sekaligus menyetujuinya. Disarankan: berikan ke orang yang berbeda. Bagaimanapun, tidak ada yang menyetujui estimasi atau bonus pada task-nya sendiri."
});
</script>
