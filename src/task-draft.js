<script>
/* ============================================================
   TASK DRAFTS
   A new task closed before it was created — the ×, Esc, a tap outside, another task opened — is kept as a draft
   instead of being lost. It is a real task in the first stage (the backlog), assigned to no one and with no
   reviewer, so no one is told about it or finds it in their work. The stage and the people chosen for it are kept
   with it (task.meta.draft) and come back when it is finished with "Create task". The board marks it Draft; Undo on
   the toast, or "Delete draft", throws it away. Its maker may finish or delete it although no one is assigned to it
   (server/permissions.js). Only for someone who can create tasks; a request someone cannot create closes as before.
   ============================================================ */
function isDraftTask(tk){ return !!(tk&&!tk._draft&&tk.meta&&tk.meta.draft); }
/* what is in the panel's editors is the newest text: the title and description save on their own clock */
function draftCapture(tk){ if(typeof descWysiwygSave==="function") descWysiwygSave(); if(S.briefEdit&&typeof briefFlush==="function") briefFlush(tk); var el=document.querySelector(".dr-title"); if(el&&S.drawerTask===tk.id){ var t=String(el.textContent||"").trim(); if(t) tk.title=t; } }
function draftWorthKeeping(tk){ var t=String(tk.title||"").trim(); if(t&&t!=="Untitled task") return true; if(String(tk.description||"").trim()) return true; var b=tk.brief||{}; return Object.keys(b).some(function(k){ return k!=="tpl"&&String(b[k]==null?"":b[k]).trim(); }); }
function draftTitle(tk){ var t=String(tk.title||"").trim(); if(t&&t!=="Untitled task") return t.slice(0,240); var line=String(tk.description||"").split(/\n/).map(function(s){ return s.replace(/[#*_>`~\[\]]/g," ").replace(/\s+/g," ").trim(); }).filter(Boolean)[0]; return (line||tr("Untitled draft")).slice(0,120); }
function saveAsDraft(tk){
  var t=clone(tk); delete t._draft; delete t._draftKey; delete t._onCreated; delete t._request; delete t._kept;
  t.meta=Object.assign({},t.meta||{},{draft:{status:t.status,assignees:assigneesOf(t),reviewers:reviewersOf(t),by:ME,at:new Date().toISOString()}});
  t.id=nextId("T-",TASKS); t.title=draftTitle(tk); t.activity=[]; t.status=firstStage(); t.assignee=null; t.assignees=[]; t.reviewer=null; t.reviewers=[]; t.createdBy=ME;
  log(t,"created");
  return createTask(t).then(function(saved){ if(saved===false) return false;
    var st=stage(firstStage()); undoToast(tr("Saved as a draft in")+" "+(st.name||tr("the backlog")),function(){ if(S.drawerTask===t.id) closeDrawer(); deleteTaskById(t.id); });
    return t; }).catch(function(){ return false; });
}
/* the panel is leaving a new task (closed, another task, another new one): keep what was written in it */
function draftKeepOpen(){ var cur=S.drawerTask?task(S.drawerTask):null; if(!cur||!cur._draft||cur._kept||!canI.createTask()) return; draftCapture(cur); if(!draftWorthKeeping(cur)) return; cur._kept=true; saveAsDraft(cur); }
(function(){
  if(typeof closeDrawer==="function"){ var c=closeDrawer; closeDrawer=function(){ draftKeepOpen(); return c.apply(this,arguments); }; }
  if(typeof openTask==="function"){ var o=openTask; openTask=function(id){ if(S.drawerTask&&S.drawerTask!==id) draftKeepOpen(); return o.apply(this,arguments); }; }
  if(typeof newTaskModal==="function"){ var n=newTaskModal; newTaskModal=function(){ draftKeepOpen(); return n.apply(this,arguments); }; }
})();

/* Finishing it: the stage and people chosen while it was written come back — unless someone has set them since */
function draftFinish(id){ var tk=task(id); if(!isDraftTask(tk)) return; var dr=tk.meta.draft||{}, el=document.querySelector(".dr-title");
  if(el&&S.drawerTask===id){ var title=String(el.textContent||"").trim(); if(title) tk.title=title; }
  var real=function(list){ return (list||[]).filter(function(p){ return PEOPLE[p]; }); };
  var assignees=assigneesOf(tk).length?assigneesOf(tk):real(dr.assignees), reviewers=reviewersOf(tk).length?reviewersOf(tk):real(dr.reviewers);
  var status=(tk.status===firstStage()&&dr.status&&byId(WS.workflow,dr.status))?dr.status:tk.status;
  editTaskWith(tk,function(t){ delete taskMeta(t).draft; t.assignees=assignees.slice(); t.assignee=assignees[0]||null; t.reviewers=reviewers.slice(); t.reviewer=reviewers[0]||null; t.status=status; }).then(function(saved){ if(saved===false) return;
    toast(tr("Task")+" "+tk.id+" "+tr("created")); if(tk.assignee) notify("assigned",assigneesOf(tk),tk.id); notify("reviewer",reviewersOf(tk).filter(function(r){ return !isAssignee(tk,r); }),tk.id);
    /* finished with no one on it in the first stage, it is a request: whoever triages them is told, as on a new one */
    if(!tk.assignee&&tk.status===firstStage()) notify("request",Object.keys(PEOPLE).filter(function(p){ var r=byId(ROLES,PEOPLE[p].perm); return PEOPLE[p].perm==="admin"||(r&&(r.permissions||[]).indexOf("decide_request")>=0); }),tk.id); });
}
function draftDelete(id){ confirmModal(tr("Delete this draft?"),tr("It was never created, so no one has it in their work."),function(){ closeDrawer(); deleteTaskById(id).then(function(saved){ if(saved===false) return; toast(tr("Draft deleted"),"bad"); }); },true); }

/* the panel of a draft says what it is, and its footer finishes or deletes it */
(function(){ if(typeof renderDrawer!=="function") return; var base=renderDrawer;
  renderDrawer=function(){ var out=base.apply(this,arguments); try{ draftDecorate(); }catch(e){ console.error(e); } return out; };
})();
function draftDecorate(){ var tk=S.drawerTask?task(S.drawerTask):null; if(!isDraftTask(tk)) return;
  var body=document.getElementById("drBody"), foot=document.getElementById("drFoot"), dr=tk.meta.draft||{};
  if(body&&!body.querySelector(".draft-note")) body.insertAdjacentHTML("afterbegin",'<div class="draft-note">'+I.edit+'<div><b>'+tr("Draft")+'</b> — '+tr("closed before it was created, so it was kept. No one is assigned to it or told about it until it is created.")+(dr.at?' <span class="hint" data-no-translate>'+esc(person(dr.by||tk.createdBy).name||"")+' · '+esc(typeof pnWhen==="function"?pnWhen(dr.at):dr.at)+'</span>':'')+'</div></div>');
  if(foot){ var fin=canI.editTask(tk), del=canI.deleteTask(tk);
    foot.innerHTML=(del?'<button class="btn ghost" onclick="draftDelete('+jsq(tk.id)+')">'+I.trash+'<span>'+tr("Delete draft")+'</span></button>':'')+'<span class="spacer"></span>'+(fin?'<button class="btn primary" onclick="draftFinish('+jsq(tk.id)+')">'+I.check+tr("Create task")+'</button>':'<span class="hint">'+tr("Only its maker or someone who can edit it can create it")+'</span>'); }
}
/* on the board: a Draft mark wherever a task's request mark is shown */
(function(){ if(typeof requestBadge!=="function") return; var rb=requestBadge; requestBadge=function(tk){ return (isDraftTask(tk)?'<span class="badge draft-badge">'+tr("Draft")+'</span>':'')+rb.apply(this,arguments); }; })();
</script>
