<script>
/* ============================================================
   SMART SCORING IN THE PAGE: WHETHER IT IS ON, AND WHO MAY DO WHAT (Oct 2026)
   Smart Scoring (docs/SMART-SCORING.md) scores tasks in Effort Hours, Story Points or Weighted Points and links them
   to KPIs and OKRs. It is off until an admin turns it on in Settings → Smart Scoring, and while it is off nothing in
   the app looks or works differently. Every other scoring file of the page asks here first:
   - scoringOn(): the server has the feature (features.scoring; COS_SCORING=0 turns it off there) and the workspace's
     master switch is on. scoringModuleOn("hours"|"story"|"weighted"|"kpi"|"okr"): that, and the module is on.
   - scoringSettings(): the workspace's settings, always in their full shape (shared/scoring-settings.js, which
     build.js inlines as window.ScoringSettings). Read-only: clone before changing anything.
   - canI.scoring…: the browser's mirror of the server's checks (server/permissions.js), for showing the right
     buttons only — the server decides. Admin holds every permission, so the separation of duties is written out and
     binds admins too: nobody approves an estimate on a task they are assigned to (unless the workspace allows it),
     nobody approves the finished work of a task they are assigned to or credited on, nothing is approved while
     acting as someone else, and time is logged by the people assigned, on their task.
   - scoringLoad / scoringSave / scoringDelegateLeads: the settings routes, with the same behaviour kept in the
     browser in the offline demo, so the standalone file works too.
   A task sent to the server never carries its scoring summary back (dTask): only the scoring routes write scores.
   ============================================================ */
I.gauge=I.gauge||'<svg class="i" viewBox="0 0 24 24"><path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 15l4-5"/><circle cx="12" cy="15.5" r="1.4"/></svg>';
var SCORING_NORM={src:null,val:null}, SCORING_DEMO_AUDIT=[];
var SCORING_LEAD_CAPS=["scoring_approve_estimate","scoring_approve_completion","scoring_view_analytics"], SCORING_LEAD_ROLES=["team_lead","creative_lead"];
var SCORING_CAPS=["scoring_manage_workspace","scoring_manage_project","scoring_approve_estimate","scoring_edit_task","scoring_request_ai","scoring_approve_completion","scoring_manage_outcomes","scoring_view_analytics"];
function scoringModel(){ return typeof ScoringSettings!=="undefined"?ScoringSettings:null; }
/* the server's switch for the whole feature; the offline demo has no server, so it is always there */
function scoringFeature(){ return API.on?!!(API.features&&API.features.scoring):true; }
function scoringSettings(){ var m=scoringModel(); if(!m) return null; var src=(typeof WS!=="undefined"&&WS&&WS.scoring)||null;
  if(SCORING_NORM.val&&SCORING_NORM.src===src) return SCORING_NORM.val;
  SCORING_NORM={src:src,val:m.normalizeSettings(src||{})}; return SCORING_NORM.val; }
function scoringOn(){ if(!scoringFeature()) return false; var s=scoringSettings(); return !!(s&&s.enabled); }
function scoringModuleOn(id){ var s=scoringSettings(); return scoringOn()&&!!(s.modules[id]&&s.modules[id].on); }
function scoringMode(id){ var s=scoringSettings(), m=s&&s.modules[id]; return m&&m.mode||null; }
function scoringPrimary(){ var s=scoringSettings(); return s?s.primaryCapacity:"hours"; }
function scoringStakeholder(){ return !!(typeof PEOPLE!=="undefined"&&PEOPLE[ME]&&PEOPLE[ME].stakeholder); }
/* signed in as one person, acting as another (an admin trying someone's view): no approvals */
function scoringActingAs(){ return !!(API.on&&SESSION.user&&ME!==SESSION.user.id); }

canI.scoringConfigure=function(){ return has("scoring_manage_workspace"); };
canI.scoringManageProject=function(p){ return has("scoring_manage_project"); };
canI.scoringEditTask=function(t){ return !scoringStakeholder()&&has("scoring_edit_task"); };
canI.scoringPropose=function(t){ return !!t&&!scoringStakeholder()&&(isAssignee(t,ME)||canI.editTask(t)); };
canI.scoringApproveEstimate=function(t){ var s=scoringSettings(); return !!t&&!scoringStakeholder()&&!scoringActingAs()&&has("scoring_approve_estimate")&&(!isAssignee(t,ME)||!!(s&&s.overrides.allowSelfApproveEstimate)); };
canI.scoringRequestAi=function(t){ return !scoringStakeholder()&&has("scoring_request_ai"); };
/* credited: the people the task's efficiency award credits (assignees count as credited either way) */
canI.scoringApproveCompletion=function(t,credited){ return !!t&&!scoringStakeholder()&&!scoringActingAs()&&has("scoring_approve_completion")&&!isAssignee(t,ME)&&(credited||[]).indexOf(ME)<0; };
canI.scoringManageOutcomes=function(){ return has("scoring_manage_outcomes"); };
canI.scoringViewAnalytics=function(){ return has("scoring_view_analytics"); };
canI.logTime=function(t){ return !!t&&!scoringStakeholder()&&isAssignee(t,ME); };

/* the Settings tab is there only while the server has the feature (who sees it: SETTINGS_ACCESS.scoring) */
(function(){ if(typeof settingsTabAllowed!=="function") return; var base=settingsTabAllowed; settingsTabAllowed=function(id){ if(id==="scoring"&&!scoringFeature()) return false; return base.apply(this,arguments); }; })();
/* only the scoring routes write scores: a task saved through PUT /api/tasks never sends its summary back */
(function(){ if(typeof dTask!=="function") return; var base=dTask; dTask=function(t){ var d=base.apply(this,arguments); if(d&&typeof d==="object") delete d.scoring; return d; }; })();

/* ---------- the settings routes (and the same, kept in the browser, in the offline demo) ---------- */
function scoringLoad(){
  if(!API.on) return Promise.resolve({settings:scoringSettings(),audit:SCORING_DEMO_AUDIT.slice(0,20)});
  return apiFetch("GET","/api/scoring/settings").then(function(r){ if(r&&r.settings) WS.scoring=r.settings; return r; });
}
/* next: the settings as edited; version: the configVersion they were edited from (a stale one is refused) */
function scoringSave(next,version){
  if(API.on) return apiFetch("PUT","/api/scoring/settings",{settings:next,configVersion:version}).then(function(r){ if(r&&r.settings) WS.scoring=r.settings; return r; });
  var m=scoringModel(), cur=scoringSettings(); if(!m||!cur) return Promise.reject(new Error(tr("Smart Scoring is not available")));
  if(version!==cur.configVersion) return Promise.reject(new Error(tr("Someone else changed the Smart Scoring settings in the meantime. Reload them and make your change again.")));
  var n=m.normalizeSettings(next); n.configVersion=cur.configVersion; n.updatedAt=cur.updatedAt; n.updatedBy=cur.updatedBy; n.bonus.on=false; n.bonus.enabledAt=null; n.weighted.mappingVersion=cur.weighted.mappingVersion;
  if(JSON.stringify([cur.weighted.weights,cur.weighted.scaleMax])!==JSON.stringify([n.weighted.weights,n.weighted.scaleMax])) n.weighted.mappingVersion++;
  var diff=m.diffSettings(cur,n); if(!diff.length) return Promise.resolve({settings:cur,unchanged:true,audit:SCORING_DEMO_AUDIT.slice(0,20)});
  n.configVersion=cur.configVersion+1; n.updatedAt=new Date().toISOString(); n.updatedBy=ME; WS.scoring=n;
  SCORING_DEMO_AUDIT.unshift({id:uid("sa"),action:"settings_changed",by:ME,at:n.updatedAt,reason:"",diff:diff,configVersion:n.configVersion});
  return Promise.resolve({settings:n,audit:SCORING_DEMO_AUDIT.slice(0,20)});
}
/* the Team Lead and Creative Lead roles get the permissions to approve estimates and finished work and to see the team's scoring analytics */
function scoringDelegateLeads(){
  if(API.on) return apiFetch("POST","/api/scoring/delegate-leads",{}).then(function(r){ if(r&&r.roles) ROLES=r.roles; return r; });
  var added={}; SCORING_LEAD_ROLES.forEach(function(id){ var r=byId(ROLES,id); if(!r) return; r.permissions=r.permissions||[]; var add=SCORING_LEAD_CAPS.filter(function(c){ return r.permissions.indexOf(c)<0; }); if(!add.length) return; r.permissions=r.permissions.concat(add); added[id]=add; });
  if(Object.keys(added).length) SCORING_DEMO_AUDIT.unshift({id:uid("sa"),action:"leads_delegated",by:ME,at:new Date().toISOString(),reason:"",diff:[],added:added});
  return Promise.resolve({roles:ROLES,added:added,audit:SCORING_DEMO_AUDIT.slice(0,20)});
}
/* whether the lead roles still lack any of those permissions */
function scoringLeadsMissing(){ return SCORING_LEAD_ROLES.some(function(id){ var r=byId(ROLES,id); return !!r&&SCORING_LEAD_CAPS.some(function(c){ return (r.permissions||[]).indexOf(c)<0; }); }); }

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Smart Scoring":"Smart Scoring",
  "Set up Smart Scoring: modules, weights, scales and policies":"Mengatur Smart Scoring: modul, bobot, skala, dan kebijakan",
  "Change a project's Smart Scoring settings, where the workspace allows it":"Mengubah pengaturan Smart Scoring sebuah project, sejauh diizinkan workspace",
  "Approve and lock task estimates (never on a task they are assigned to)":"Menyetujui dan mengunci estimasi task (tidak pernah pada task yang ditugaskan kepadanya)",
  "Change any task's scores, a locked estimate included":"Mengubah skor task mana pun, termasuk estimasi yang sudah dikunci",
  "Ask the AI to suggest a task's scores":"Meminta AI menyarankan skor task",
  "Approve finished work and efficiency bonuses (never their own)":"Menyetujui pekerjaan selesai dan bonus efisiensi (tidak pernah miliknya sendiri)",
  "Set up KPIs and OKRs and correct their progress":"Mengatur KPI dan OKR serta mengoreksi progresnya",
  "See the whole team's scoring analytics":"Melihat analitik skor seluruh tim",
  "Smart Scoring is not available":"Smart Scoring tidak tersedia",
  "Someone else changed the Smart Scoring settings in the meantime. Reload them and make your change again.":"Orang lain sudah mengubah pengaturan Smart Scoring. Muat ulang lalu ulangi perubahanmu."
});
</script>
