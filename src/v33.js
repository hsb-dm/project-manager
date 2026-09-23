<script>
/* ZenCrevia v33 — who may move a task into each workflow stage.
   The server enforces the rules (gateStatusChange); this file mirrors them so the board
   explains a refusal before anything moves, and adds the editor in Settings → Workflow.

   Per stage:
     requireReviewer  a reviewer must be named before a task can enter the stage
     reviewerOnly     only the reviewer, the requester, a team lead or an admin may move a
                      task in; the assignee cannot close their own work
   Defaults (set on the server): reviewer required from the first review stage onward;
   anyone who can edit may move up to and including Delivered; Done and Declined are
   reviewer-only. Every value is editable here. */

function zcStage(id){ return (WS.workflow||[]).find(function(s){ return s.id===id; })||null; }
function zcIsRequester(tk){ return (tk.tags||[]).indexOf("request")>=0&&tk.createdBy===ME; }
function zcCanDecide(tk){
  if (has("manage_workspace")||has("review_any")) return true;
  if (has("edit_team_tasks")&&leadsTeam(tk.team)) return true;
  if (assigneesOf(tk).indexOf(ME)>=0) return false;
  if (reviewersOf(tk).indexOf(ME)>=0) return true;
  return zcIsRequester(tk);
}
/* Returns null when the move is allowed, otherwise {code, msg}. */
function zcStageBlock(tk,toId){
  var st=zcStage(toId); if (!st||!tk||tk.status===toId) return null;
  if (st.requireReviewer&&!reviewersOf(tk).length) return {code:"reviewer",msg:tr("Choose a reviewer before moving this task to")+" "+st.name+"."};
  if (st.reviewerOnly&&!zcCanDecide(tk)) return {code:"decide",msg:tr("Only the reviewer, the requester, a team lead or an admin can move this task to")+" "+st.name+"."};
  var from=zcStage(tk.status);
  if (from&&from.reviewerOnly&&!zcCanDecide(tk)) return {code:"decide",msg:tr("Only the reviewer, the requester, a team lead or an admin can move this task out of")+" "+from.name+"."};
  return null;
}

/* Every status change in the UI (board drag, drawer, keyboard, calendar) goes through
   moveTask(); refuse there so the card never jumps and snaps back. */
(function(){
  if (typeof moveTask!=="function") return;
  var base=moveTask;
  moveTask=function(tk,op,apply){
    if (op&&op.type==="MOVE_TASK_STATUS"){
      var blk=zcStageBlock(tk,op.toStatusId);
      if (blk){ toast(blk.msg,"bad"); if (blk.code==="reviewer"&&typeof openTask==="function"&&S.drawerTask!==tk.id) setTimeout(function(){ openTask(tk.id); },250); refresh(); return Promise.resolve(false); }
    }
    return base.apply(this,arguments);
  };
})();

/* While dragging a card, mark the columns it may not enter. */
(function(){
  document.addEventListener("dragstart",function(){ setTimeout(function(){
    var id=typeof DRAG!=="undefined"?DRAG:null, tk=id&&task(id); if (!tk) return;
    document.querySelectorAll("[data-status]").forEach(function(col){ var b=zcStageBlock(tk,col.getAttribute("data-status")); col.classList.toggle("zc-locked",!!b); if (b) col.setAttribute("data-lock",b.msg); });
  },0); },true);
  document.addEventListener("dragend",function(){ document.querySelectorAll(".zc-locked").forEach(function(c){ c.classList.remove("zc-locked"); c.removeAttribute("data-lock"); }); },true);
})();

/* ---------- Settings → Workflow: "Who can move tasks into each stage" ---------- */
function zcDefaultRules(list){
  var firstReview=-1, delivered=-1;
  list.forEach(function(s,i){ if (firstReview<0&&s.kind==="review") firstReview=i; if (s.id==="delivered") delivered=i; });
  return list.map(function(s,i){
    var pastReview=firstReview>=0?i>=firstReview:(s.kind==="revision"||s.kind==="closed");
    return {requireReviewer:pastReview, reviewerOnly:delivered>=0&&i>delivered&&s.kind==="closed"};
  });
}
function zcApplyPreset(kind){
  if (!canI.manageWorkspace()) return;
  var list=WS.workflow||[], def=zcDefaultRules(list), firstReview=list.findIndex(function(s){ return s.kind==="review"; });
  list.forEach(function(s,i){
    if (kind==="flexible"){ s.requireReviewer=def[i].requireReviewer; s.reviewerOnly=def[i].reviewerOnly; }
    else if (kind==="strict"){ s.requireReviewer=def[i].requireReviewer; s.reviewerOnly=s.kind==="closed"||s.kind==="revision"||(s.kind==="review"&&i>firstReview); }
    else if (kind==="open"){ s.requireReviewer=false; s.reviewerOnly=false; }
  });
  saveWS(); refresh(); toast(tr("Stage rules updated"));
}
function zcSetRule(i,key,val){ if (!canI.manageWorkspace()) return; WS.workflow[i][key]=!!val; saveWS(); refresh(); }
function zcMoveRulesPanel(){
  var ed=canI.manageWorkspace(), list=WS.workflow||[];
  var rows=list.map(function(s,i){
    return '<div class="zc-rule-row" role="row">'
      +'<span class="zc-rule-stage" role="cell"><i class="zc-dot c-'+attr(s.color||"gray")+'" aria-hidden="true"></i>'+esc(s.name)+'</span>'
      +'<label class="zc-rule-cell" role="cell"><input type="checkbox" '+(ed?"":"disabled")+(s.requireReviewer?" checked":"")+' onchange="zcSetRule('+i+',\'requireReviewer\',this.checked)"> <span>'+tr("Reviewer required")+'</span></label>'
      +'<span class="zc-rule-cell" role="cell"><select aria-label="'+attr(tr("Who can move tasks into")+" "+s.name)+'" '+(ed?"":"disabled")+' onchange="zcSetRule('+i+',\'reviewerOnly\',this.value===\'reviewer\')">'
      +'<option value="anyone"'+(s.reviewerOnly?"":" selected")+'>'+tr("Anyone who can edit the task")+'</option>'
      +'<option value="reviewer"'+(s.reviewerOnly?" selected":"")+'>'+tr("Reviewer, requester, team lead or admin")+'</option>'
      +'</select></span></div>';
  }).join("");
  var presets=ed?'<div class="zc-rule-presets"><span class="hint">'+tr("Presets")+':</span>'
    +'<button class="btn xs" onclick="zcApplyPreset(\'flexible\')">'+tr("Flexible (default)")+'</button>'
    +'<button class="btn xs" onclick="zcApplyPreset(\'strict\')">'+tr("Strict review")+'</button>'
    +'<button class="btn xs ghost" onclick="zcApplyPreset(\'open\')">'+tr("No restrictions")+'</button></div>':'';
  return sp(tr("Who can move tasks into each stage"),
    '<p class="hint" style="margin-bottom:10px">'+tr("Flexible (default): the assignee can move their own task up to Delivered; Done and Declined need the reviewer, the requester, a team lead or an admin. A reviewer must be named before a task enters review.")+'</p>'
    +presets+'<div class="zc-rules" role="table" aria-label="'+attr(tr("Stage move rules"))+'"><div class="zc-rule-row zc-rule-head" role="row"><span role="columnheader">'+tr("Stage")+'</span><span role="columnheader">'+tr("Before entering")+'</span><span role="columnheader">'+tr("Who can move tasks here")+'</span></div>'+rows+'</div>',
    null, typeof I!=="undefined"?I.lock:"");
}
(function(){
  if (typeof setWorkflow!=="function") return;
  var base=setWorkflow;
  setWorkflow=function(){ return base.apply(this,arguments)+zcMoveRulesPanel(); };
})();

Object.assign(UI_ID,{
  "Choose a reviewer before moving this task to":"Pilih reviewer dulu sebelum memindahkan task ini ke",
  "Only the reviewer, the requester, a team lead or an admin can move this task to":"Hanya reviewer, requester, lead tim, atau admin yang bisa memindahkan task ini ke",
  "Who can move tasks into each stage":"Siapa yang boleh memindahkan task ke setiap tahap",
  "Flexible (default): the assignee can move their own task up to Delivered; Done and Declined need the reviewer, the requester, a team lead or an admin. A reviewer must be named before a task enters review.":"Fleksibel (default): assignee bisa memindahkan task-nya sendiri sampai Delivered; Done dan Declined butuh reviewer, requester, lead tim, atau admin. Reviewer wajib diisi sebelum task masuk review.",
  "Reviewer required":"Reviewer wajib diisi","Anyone who can edit the task":"Siapa pun yang bisa mengedit task",
  "Reviewer, requester, team lead or admin":"Reviewer, requester, lead tim, atau admin",
  "Presets":"Preset","Flexible (default)":"Fleksibel (default)","Strict review":"Review ketat","No restrictions":"Tanpa batasan",
  "Stage":"Tahap","Before entering":"Syarat masuk","Who can move tasks here":"Siapa yang boleh memindahkan ke sini",
  "Who can move tasks into":"Siapa yang boleh memindahkan task ke","Stage move rules":"Aturan perpindahan tahap","Stage rules updated":"Aturan tahap diperbarui","Stage name":"Nama tahap","Stage type":"Jenis tahap"
});
</script>
