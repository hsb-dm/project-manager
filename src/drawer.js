<script>
/* ============================================================
   TASK DRAWER — description + details, brief, versions & approval, files, comments (replies/attachments), activity (§22, §44–50)
   ============================================================ */
function V(n,by,agoMin,state,color,note,annots){ return {id:uid("ver"),n:n,by:by,ago:agoMin||0,state:state,color:color,note:note||"",annots:annots||[]}; }
function C(by,agoMin,vis,text,parent){ return {id:uid("cm"),by:by,ago:agoMin||0,vis:vis,text:text,parent:parent||null,attachments:[]}; }
function F(name,type,source,size,agoMin,url,extra){ var f={id:uid("file"),name:name,type:type,source:source,size:size,ago:agoMin||0,url:url||"",preview:null,driveId:null}; if (extra) for (var k in extra) f[k]=extra[k]; return f; }
function fileThumb(f){ if (f.preview) return '<span class="fthumb" style="background-image:url('+attr(f.preview)+')" onclick="previewFile(\''+f.id+'\')" title="Preview"></span>'; return fileIcon(f); }
function previewFile(fid){ var tk=task(S.drawerTask); var f=byId(tk.files,fid); if (!f) return; previewModal({title:esc(f.name)+' <span class="badge" style="margin-left:6px">'+esc(tk.id)+'</span> '+statusBadge(tk.status)+(isClosed(tk)?' <span class="badge done">'+I.check+'done</span>':""),name:f.name,img:f.preview,driveId:f.driveId,url:f.url,rawTitle:true}); }
function previewVersion(n){ var tk=task(S.drawerTask); var v=tk.versions.filter(function(x){ return x.n===n; })[0]; if (!v) return; openModal(tr("Version")+" "+n+" · "+esc(tk.title)+' '+statusBadge(tk.status)+' '+verBadge(v),versionPreviewHtml(tk,v,{full:true})+(typeof verNotesReadHtml==="function"?verNotesReadHtml(v):""),(v.driveUrl?'<button class="btn" onclick="openExternal('+jsq(v.driveUrl)+')">'+I.ext+origLabel(v.driveUrl)+'</button>':"")+((v.img||v.driveId)?'<button class="btn" onclick="saveFile('+attr(JSON.stringify({name:tk.id+" V"+v.n+" "+tk.title,img:v.img||"",driveId:v.driveId||null,url:v.driveUrl||""}))+')">'+I.download+tr("Download")+'</button>':"")+(v.img?'<button class="btn ghost" onclick="copyImageToClipboard('+jsq(v.img)+')">'+I.copy+tr("Copy image")+'</button>':"")+'<span class="spacer"></span><button class="btn primary" onclick="closeModal()">'+tr("Close")+'</button>',true); }
function openTask(id){ if(typeof signedIn==="function"&&!signedIn()) return; var tk=task(id); if (!tk) return; if(S.drawerTask!==id){ if(S.briefEdit&&S.drawerTask) briefFlush(task(S.drawerTask)); S.drawerExpanded=!tk._draft&&drawerAutoExpand(); S.descMode=null; S.briefOptOpen=false; } var prev=S.drawerTask&&S.drawerTask!==id?task(S.drawerTask):null; if(prev&&prev._draft){ var di=TASKS.indexOf(prev); if(di>=0) TASKS.splice(di,1); } S.drawerTask=id; S.drawerTab=tk.versions.length?"versions":"brief"; S.drawerVer=tk.versions.length?tk.versions[tk.versions.length-1].n:null; S.revOpen=false; S.briefEdit=false; S.replyTo=null; closePops(); markRead(id);
  document.getElementById("overlay").classList.add("open"); var d=document.getElementById("drawer"); d.classList.add("open"); d.setAttribute("aria-hidden","false"); renderDrawer(); }
function closeDrawer(){ var cur=S.drawerTask?task(S.drawerTask):null; if(cur&&S.briefEdit&&!cur._draft) briefFlush(cur); S.briefEdit=false; document.getElementById("overlay").classList.remove("open"); var d=document.getElementById("drawer"); d.classList.remove("open"); d.setAttribute("aria-hidden","true"); S.drawerTask=null; if (cur&&cur._draft){ var i=TASKS.indexOf(cur); if (i>=0) TASKS.splice(i,1); refresh(); } }
/* moving to another tab saves and closes what was being edited, as a click outside would */
function setTab(tb){ var tk=S.drawerTask?task(S.drawerTask):null; if(tk&&!tk._draft){ if(S.descMode==="editor"&&typeof descSaveNow==="function"){ descSaveNow(); S.descMode="viewer"; } if(S.briefEdit){ briefFlush(tk); S.briefEdit=false; } } S.drawerTab=tb; renderDrawer(); }
/* Which task a field on screen was drawn for. The title saves on blur, and a blur can arrive after
   the panel has moved on: the panel is redrawn for the next task while the old title still has
   focus, and Chrome blurs it on the way out. Saving into "whichever task is open now" then wrote
   the old title into the new task — creating two tasks in a row gave the second the first one's
   name. Every draft is "T-new", so a draft is told apart by a key of its own. */
function drawerKey(tk){ tk=tk||(S.drawerTask?task(S.drawerTask):null); return tk?(tk._draft?(tk._draftKey||"T-new"):tk.id):""; }
/* ---- expanded: what is in the tabs gets the panel ----
   The header — title, priority, team, people, dates, project, labels, tags — took about 390px of an
   850px panel, leaving the brief, the assets and the comments a 350px strip with its own scrollbar.
   Expanded, the header folds down to its top line (the task number, project, status and the
   actions), the tabs sit straight under it, and the tab's contents fill the rest. Collapse brings
   every field back.
   It belongs to the task on screen: another task opens collapsed, unless Auto-expand is switched on
   in the task's gear menu, in which case every task opens expanded. A task being created never
   does — its title and fields are what is being filled in. */
var DRAWER_AUTOEXPAND_KEY="zc.drawerAutoExpand";
function drawerAutoExpand(){ if(S.drawerAutoExpand===undefined){ try{ S.drawerAutoExpand=localStorage.getItem(DRAWER_AUTOEXPAND_KEY)==="1"; }catch(e){ S.drawerAutoExpand=false; } } return !!S.drawerAutoExpand; }
function drawerExpanded(){ var tk=S.drawerTask?task(S.drawerTask):null; return !!S.drawerExpanded&&!!tk&&!tk._draft; }
function applyDrawerExpand(){ var d=document.getElementById("drawer"); if(d) d.classList.toggle("expanded",drawerExpanded()); }
function toggleDrawerExpand(){ S.drawerExpanded=!drawerExpanded(); applyDrawerExpand(); renderDrawer(); }
function toggleDrawerAutoExpand(){
  S.drawerAutoExpand=!drawerAutoExpand();
  try{ localStorage.setItem(DRAWER_AUTOEXPAND_KEY,S.drawerAutoExpand?"1":"0"); }catch(e){}
  /* show what it does on the task already open, rather than only on the next one */
  S.drawerExpanded=S.drawerAutoExpand;
  closePops(); applyDrawerExpand(); renderDrawer();
}
/* The two button labels are chosen here, not looked up with tr(): "Expand" is already translated
   three different ways across the app, and the last file to load wins with "Buka" ("Open"), which
   is not what this button does. */
function drawerExpandLabel(on){ return UI_LANG==="id"?(on?"Perkecil":"Perbesar"):(on?"Collapse":"Expand"); }
function curVer(tk){ for (var i=0;i<tk.versions.length;i++) if (tk.versions[i].n===S.drawerVer) return tk.versions[i]; return tk.versions[tk.versions.length-1]||null; }
function pplChips(tk,kind,ed){ var ids=kind==="assignees"?assigneesOf(tk):reviewersOf(tk); return '<div class="pplchips">'+ids.map(function(id,i){ return '<span class="mchip" title="'+attr(person(id).name+(i===0?" · primary":""))+'">'+av(id)+esc(first(id))+(i===0?'<span class="pr"></span>':'')+(ed?'<button onclick="removePerson(\''+kind+'\',\''+id+'\')" title="Remove" aria-label="'+attr(tr("Remove")+" "+first(id))+'">×</button>':'')+'</span>'; }).join("")+(ed?'<button class="btn xs" data-menu aria-label="'+attr(tr(kind==="assignees"?"Add assignee":"Add reviewer"))+'" onclick="addPersonMenu(this,\''+kind+'\')">'+I.plus+'</button>':'')+'</div>'; }
function addPersonMenu(anchor,kind){ var tk=task(S.drawerTask); if(!tk)return; var cur=kind==="assignees"?assigneesOf(tk):reviewersOf(tk); entityPicker({kind:"person",anchor:anchor,title:"Add "+(kind==="assignees"?"assignee":"reviewer"),placeholder:tr("Search people..."),context:{includeMe:true},selected:cur,onSelect:function(id){ if(cur.indexOf(id)<0)addPerson(kind,id); }}); }
function addPerson(kind,id){ var tk=task(S.drawerTask); if (kind==="assignees"&&!tk._draft&&!canI.assignTask(tk)) return toast("You don't have permission to assign this task","bad"); editTaskWith(tk,function(t){ var arr=kind==="assignees"?assigneesOf(t):reviewersOf(t); if (arr.indexOf(id)<0) arr.push(id); t[kind]=arr; if (kind==="assignees") t.assignee=arr[0]; else t.reviewer=arr[0]; log(t,kind==="assignees"?"assigned":"edited",kind==="assignees"?{to:first(id)}:{what:"reviewers"}); }).then(function(saved){ if(saved===false)return false; notify(kind==="assignees"?"assigned":"reviewer",id,tk.id); }); }
function removePerson(kind,id){ var tk=task(S.drawerTask); var arr=(kind==="assignees"?assigneesOf(tk):reviewersOf(tk)).filter(function(x){ return x!==id; }); if (!arr.length) return toast("A task needs at least one "+(kind==="assignees"?"assignee":"reviewer"),"bad"); editTaskWith(tk,function(t){ t[kind]=arr; if (kind==="assignees") t.assignee=arr[0]; else t.reviewer=arr[0]; log(t,"edited",{what:kind}); }); }
function makePrimary(kind,id){ var tk=task(S.drawerTask); editTaskWith(tk,function(t){ var arr=(kind==="assignees"?assigneesOf(t):reviewersOf(t)).filter(function(x){ return x!==id; }); arr.unshift(id); t[kind]=arr; if (kind==="assignees") t.assignee=id; else t.reviewer=id; }); }
function toggleHidden(id){ var tk=task(id); var to=!tk.hidden; var snap=clone(tk); tk.hidden=to; log(tk,to?"hidden":"unhidden"); refresh(); toast(to?"Task hidden — turn on “Hidden tasks: Show” in Filters to see it":"Task visible again"); if (API.on) apiFetch("POST","/api/tasks/"+id+"/hidden",{hidden:to}).then(function(doc){ replaceInto(tk,hTask(doc)); refresh(); }).catch(function(e){ replaceInto(tk,snap); refresh(); fail(e); }); }
function metaCell(k,v,id){ return '<div'+(id?' data-meta="'+attr(id)+'"':'')+'><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'; }
function editTask(k,v){ var tk=task(S.drawerTask); if (!tk) return;
  /* The title saves on blur, so merely clicking from it into another field — the comment box, say —
     used to save an unchanged title, and the save redrew the panel and replaced the field just
     clicked into: what was typed next went nowhere. An unchanged title is not an edit. */
  if (k==="title"&&String(v==null?"":v).trim()===String(tk.title||"").trim()) return;
  if (tk._draft){ return editDraft(tk,k,v); } if (!canI.editTask(tk)) return toast("You don't have permission to edit this task","bad"); var old=tk[k];
  if (k==="status"){ if (v!==old) setStatus(tk.id,v); return; } if (k==="prio"){ if (v!==old) setPrio(tk.id,v); return; } if (k==="team"){ if ((v||null)!==(old||null)) moveTask(tk,{type:"MOVE_TASK_TEAM",teamId:v||null},function(t){ t.team=v||null; }); return; } if (k==="proj"){ if (v!==old) moveTask(tk,{type:"MOVE_TASK_PROJECT",projectId:v},function(t){ t.proj=v; }); return; }
  if (k==="assignee"){ if (v!==old) moveTask(tk,{type:"MOVE_TASK_ASSIGNEE",assigneeId:v},function(t){ t.assignee=v; }).then(function(saved){ if(saved===false)return false; notify("assigned",v,tk.id); }); return; }
  if (k==="due"||k==="start"){ var due=k==="due"?offsetFromIso(v):tk.due; var start=k==="start"?offsetFromIso(v):tk.due-tk.span; if (start>due) start=due; if (due===tk.due&&start===tk.due-tk.span) return; moveTask(tk,{type:"MOVE_TASK_DATE",startDate:iso(start),dueDate:iso(due)},function(t){ t.due=due; t.span=Math.max(1,due-start); }); return; }
  var saving=editTaskWith(tk,function(t){ if (k==="assetCount") t.assetCount=Math.max(0,Math.round(+v||0)); else if (k==="effort") t.effort=+v||0; else if (k==="tags") t.tags=tagsFromLegacy(v); else if (k==="title"){ if (!v.trim()) return; t.title=v.trim(); } else if (k==="description") t.description=v; else if (k==="reviewer") t.reviewer=v; if (k!=="description"||v!==old) log(t,"edited",{what:k==="description"?"the description":k}); });
  if (k==="reviewer"&&v&&v!==old) saving.then(function(saved){ if(saved!==false) notify("reviewer",v,tk.id); }); }
/* §P0-3 the picker hands back an array; nothing re-serialises it to a
   comma string on the way in. */
function editTaskTags(value){ editTask("tags",value||[]); }
function editDraftTags(value){ var tk=S.drawerTask?task(S.drawerTask):null; if(tk) editDraft(tk,"tags",value||[]); }
function editDraft(t,k,v){ if (k==="due"||k==="start"){ var due=k==="due"?offsetFromIso(v):t.due; var start=k==="start"?offsetFromIso(v):t.due-t.span; if (start>due) start=due; t.due=due; t.span=Math.max(1,due-start); } else if (k==="assetCount") t.assetCount=Math.max(0,Math.round(+v||0)); else if (k==="effort") t.effort=+v||0; else if (k==="tags") t.tags=tagsFromLegacy(v); else if (k==="title") t.title=v.trim(); else if (k==="assignee"){ t.assignee=v||null; t.assignees=v?[v].concat((t.assignees||[]).filter(function(x){ return x!==v; })):[]; if (v&&!t.team) t.team=primaryTeam(v); } else if (k==="reviewer"){ t.reviewer=v||null; t.reviewers=v?[v].concat((t.reviewers||[]).filter(function(x){ return x!==v; })):[]; } else t[k]=v||(k==="team"||k==="proj"?null:v); if (k!=="title") renderDrawer(); }
function editCustom(id,v){ var tk=task(S.drawerTask); if (tk._draft){ tk.custom[id]=v; return; } editTaskWith(tk,function(t){ t.custom[id]=v; log(t,"edited",{what:byId(WS.customFields,id).name}); }); }
function taskMoreOpen(){ return !!(myPrefs()||{}).taskMoreDetailsOpen; }
function toggleTaskMore(){ var p=myPrefs(); p.taskMoreDetailsOpen=!p.taskMoreDetailsOpen; saveMyPrefs(); renderDrawer(); }
function taskDateLabel(day){ var d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+(+day||0)); return d.toLocaleDateString(UI_LANG==="id"?"id-ID":"en-US",{day:"numeric",month:"short",year:"numeric"}); }
function taskOpenDate(e,el){ var input=el&&el.querySelector("input[type=date]"); if(!input)return; if(e&&e.target===input)return; try{ input.showPicker(); }catch(_){ input.focus(); } }
function taskDateField(kind,day,tk,ed,relative){ var value=iso(day), label=taskDateLabel(day), rel=relative?'<span class="due '+dueCls(day,tk)+'">'+esc(dueTxt(day))+'</span>':''; if(!ed)return '<span class="task-date-read"><span data-no-translate>'+esc(label)+'</span>'+rel+'</span>'; return '<label class="task-date-read editable" tabindex="0" title="'+attr(tr("Edit date"))+'" onclick="taskOpenDate(event,this)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();taskOpenDate(event,this)}"><span data-no-translate>'+esc(label)+'</span>'+rel+'<input tabindex="-1" type="date" value="'+value+'" onchange="editTask(\''+kind+'\',this.value)"></label>'; }
function taskSelectRead(kind,opts,cur,ed){ var hit=opts.filter(function(o){return o[0]===cur;})[0], label=hit?hit[1]:"—"; if(!ed)return '<span class="task-read-value">'+esc(label)+'</span>'; return '<button class="task-read-value editable" data-menu aria-haspopup="menu" onclick="taskSelectMenu(this,'+jsq(kind)+','+jsq(cur||"")+')">'+esc(label)+I.chevd+'</button>'; }
function taskSelectCommit(kind,value){ if(kind.indexOf("custom:")===0)editCustom(kind.slice(7),value); else editTask(kind,value); }
function taskSelectOptions(kind){ if(kind==="prio")return PRIOS; if(kind==="team")return teamOpts(true); if(kind==="status")return localStages().map(function(x){return[x.id,x.name];}); if(kind.indexOf("custom:")===0){var cf=byId(WS.customFields,kind.slice(7));return [["","—"]].concat(((cf&&cf.options)||[]).map(function(o){return[o,o];}));} return []; }
function taskSelectMenu(a,kind,cur){ var opts=taskSelectOptions(kind), label=kind.indexOf("custom:")===0?(locName(byId(WS.customFields,kind.slice(7)))||tr("Field")):fieldLabel(kind); ctxMenu(a,'<div class="mh">'+esc(label)+'</div>'+opts.map(function(o){return '<button onclick="closePops();taskSelectCommit('+jsq(kind)+','+jsq(o[0])+')"><span style="width:16px">'+(o[0]===cur?'✓':'')+'</span>'+esc(o[1])+'</button>';}).join(""),"anchor"); }
/* One task can be in several projects (it can serve two campaigns): a click adds or removes one; the first
   chosen is its own project. "Select project later" leaves it in none for now. */
function taskProjectPicker(a){ var tk=task(S.drawerTask); if(!tk)return; var none={id:"",name:tr("Select project later"),_none:true};
  var o={kind:"project",anchor:a,title:tr("Project"),placeholder:tr("Search projects…"),multi:true,selected:taskProjectIds(tk).length?taskProjectIds(tk):[""],
    lead:function(q){ var ql=(q||"").toLowerCase(); return !ql||none.name.toLowerCase().indexOf(ql)>=0?[none]:[]; },
    onSelect:function(p){ var ids=taskProjectIds(tk);
      if(p._none) ids=[];
      else if(ids.indexOf(p.id)>=0) ids=ids.filter(function(x){ return x!==p.id; });
      else { if(ids.length>=5){ toast(tr("A task can be in up to 5 projects"),"bad"); return true; } ids.push(p.id); }
      setTaskProjects(ids); o.selected=ids.length?ids:[""]; return !p._none; }};
  entityPicker(o); }
function setTaskProjects(ids){ var tk=task(S.drawerTask); if(!tk) return; var same=JSON.stringify(ids)===JSON.stringify(taskProjectIds(tk)); if(same) return;
  if(tk._draft){ tk.proj=ids[0]||null; tk.alsoIn=ids.slice(1); renderDrawer(); return; }
  if(!canI.editTask(tk)) return toast("You don't have permission to edit this task","bad");
  editTaskWith(tk,function(t){ t.proj=ids[0]||null; t.alsoIn=ids.slice(1); log(t,"edited",{what:"the project"}); }); }
function taskProjectField(tk,ed){ var p=project(tk.proj), label=taskProjectIds(tk).map(function(id){ return (project(id)||{}).name; }).filter(Boolean).join(", ")||tr("No project"); if(!ed)return '<span class="task-read-value">'+esc(label)+'</span>'; return '<button class="task-read-value editable" data-menu aria-haspopup="listbox" onclick="taskProjectPicker(this)">'+esc(label)+I.chevd+'</button>'+(canI.createProject()?'<button class="iconbtn flat task-meta-add" title="'+attr(tr("New project"))+'" onclick="quickProjectModal()">'+I.plus+'</button>':''); }
function taskCustomCell(cf,tk,ed,ro){ var cv=tk.custom[cf.id]; if(cf.type==="select")return taskSelectRead("custom:"+cf.id,[["","—"]].concat((cf.options||[]).map(function(o){return[o,o];})),cv||"",ed); if(cf.type==="checkbox")return '<input'+ro+' type="checkbox" style="width:16px;height:16px"'+(cv?" checked":"")+' onchange="editCustom(\''+cf.id+'\',this.checked)">'; if(cf.type==="number")return '<input'+ro+' type="number" style="width:80px" value="'+attr(cv==null?"":cv)+'" onchange="editCustom(\''+cf.id+'\',this.value===\'\'?null:+this.value)">'; return '<input'+ro+' value="'+attr(cv||"")+'" onchange="editCustom(\''+cf.id+'\',this.value)">'; }
/* ---------- dependencies / blockers ---------- */
function dependencyRow(dep,ed,current){ var risk=current&&current.due!=null&&dep.due!=null&&dep.due>current.due; return '<div class="row" style="cursor:pointer" onclick="openTask(\''+dep.id+'\')"><div class="prio '+(isClosed(dep)?"low":"medium")+'"></div><div style="min-width:0;flex:1"><div class="t">'+esc(dep.title)+'</div><div class="m"><span class="mono">'+esc(dep.id)+'</span><span class="sep">·</span>'+esc(projName(dep))+'<span class="sep">·</span>'+esc(person(dep.assignee).name)+'</div></div><div class="r">'+statusBadge(dep.status)+(risk?'<span class="badge revision" title="This prerequisite is due after this task">Schedule risk</span>':'')+(ed?'<button class="iconbtn flat" onclick="event.stopPropagation();removeTaskDependency(\''+current.id+'\',\''+dep.id+'\')" title="Remove dependency">'+I.x+'</button>':'')+'</div></div>'; }
function dependencyDrawerBanner(tk){ var open=unresolvedDependencies(tk), all=(tk.dependencies||[]).length; if(!all||isClosed(tk)) return all?'<div class="hint" style="margin:-6px 0 12px;padding:8px 12px;border-radius:var(--radius);background:var(--color-surface-sunken)">'+I.check+' All dependencies are completed.</div>':''; if(open.length) return '<div class="hint" style="margin:-6px 0 12px;padding:10px 12px;border-radius:var(--radius);background:color-mix(in srgb, var(--color-warning) 13%, var(--color-surface));border:1px solid color-mix(in srgb, var(--color-warning) 35%, var(--color-border));display:flex;gap:8px;align-items:flex-start">⛓<div><b>Blocked</b><div>'+ (open.length===1?'Waiting for '+esc(open[0].title):'Waiting for '+open.length+' tasks to be completed') +'</div></div></div>'; return '<div class="hint" style="margin:-6px 0 12px;padding:8px 12px;border-radius:var(--radius);background:var(--color-surface-sunken)">'+I.check+' Ready to start — all dependencies are complete.</div>'; }
function dependencySection(tk,ed){ var deps=dependenciesOf(tk), blockers=blockingTasksOf(tk); var empty='<div class="dependency-empty"><div><b>'+tr("No dependencies yet.")+'</b><span>'+tr("This task is ready to start.")+'</span></div>'+(ed?'<button class="btn sm" onclick="openDependencyPicker(\''+tk.id+'\')">'+I.plus+tr("Add dependency")+'</button>':'')+'</div>'; return '<section data-tour="task-dependencies" style="margin:18px 0"><div class="eyebrow" style="margin-bottom:8px">Dependencies</div><div class="panel" data-tour="task-blocked-by" style="box-shadow:none"><div class="panel-body">'+(deps.length?'<div class="hint" style="padding:10px 12px 6px">BLOCKED BY</div>'+deps.map(function(x){return dependencyRow(x,ed,tk);}).join("")+(ed?'<div class="panel-foot"><button class="btn sm" onclick="openDependencyPicker(\''+tk.id+'\')">'+I.plus+'Add dependency</button></div>':''):empty)+'</div></div>'+(blockers.length?'<div class="panel" data-tour="task-blocking" style="box-shadow:none;margin-top:10px"><div class="panel-body"><div class="hint" style="padding:10px 12px 6px">BLOCKING</div>'+blockers.map(function(x){return dependencyRow(x,false,null);}).join("")+'</div></div>':'')+'</section>'; }
/* §374-382 P0 — the tab bar is anchored: switching mode only repaints the
   active pill and the result list, never the modal geometry. */
var DEPENDENCY_PICKER={taskId:null,mode:"same_project"};
var DEP_MODES=[["same_project","Same project"],["my_tasks","My tasks"],["all_tasks","All tasks"]];
function openDependencyPicker(id){
  var tk=task(id); if(!tk) return;
  DEPENDENCY_PICKER={taskId:id,mode:"same_project"};
  var tabs='<div class="dependency-picker-tabs"><div class="seg" role="tablist">'
    + DEP_MODES.map(function(m){
        return '<button role="tab" data-dep-mode="'+m[0]+'" aria-selected="'+(m[0]==="same_project"?"true":"false")+'"'
          + ' class="'+(m[0]==="same_project"?"on":"")+'" onclick="setDependencyMode(\''+m[0]+'\')">'+tr(m[1])+'</button>'; }).join("")
    + '</div></div>';
  openModal("Add dependency",
    '<div class="dependency-picker">'
    + '<div class="field"><label>Search tasks</label><input id="dep_search" placeholder="Task title, ID, project, assignee, or team" oninput="renderDependencyPicker()"></div>'
    + tabs
    + '<div id="dep_options" class="agenda dependency-picker-results" role="tabpanel"></div>'
    + '<p class="hint dependency-picker-footer">Finish → Start: this task becomes ready when every prerequisite is in a closed workflow stage.</p>'
    + '</div>',
    '<button class="btn" onclick="closeModal()">Done</button>',true);
  renderDependencyPicker();
}
/* §380-381 mode change touches two things only — no rebuild, no reposition. */
function setDependencyMode(mode){
  if(!DEP_MODES.some(function(m){ return m[0]===mode; })) return;
  DEPENDENCY_PICKER.mode=mode;
  document.querySelectorAll("[data-dep-mode]").forEach(function(b){
    var on=b.getAttribute("data-dep-mode")===mode;
    b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false");
  });
  var box=document.getElementById("dep_options"); if(box) box.scrollTop=0;
  renderDependencyPicker();
}
function renderDependencyPicker(){
  var id=DEPENDENCY_PICKER.taskId, tk=task(id), box=document.getElementById("dep_options");
  if(!tk||!box)return;
  var q=((document.getElementById("dep_search")||{}).value||"").toLowerCase(), mode=DEPENDENCY_PICKER.mode;
  var items=TASKS.filter(function(x){
    if(x.id===tk.id||(tk.dependencies||[]).some(function(d){return d.taskId===x.id;})||wouldCreateDependency(tk,x.id))return false;
    if(mode==="same_project"&&!shareProject(x,tk))return false;
    if(mode==="my_tasks"&&!isAssignee(x,ME)&&!isReviewer(x,ME))return false;
    var hay=[x.id,x.title,projName(x),teamName(x.team),person(x.assignee).name].join(" ").toLowerCase();
    return !q||hay.indexOf(q)>=0;
  }).sort(function(a,b){return (shareProject(a,tk)?0:1)-(shareProject(b,tk)?0:1)||a.due-b.due;});
  box.innerHTML=items.length?items.slice(0,30).map(function(x){
    return '<button class="row" onclick="addTaskDependency(\''+tk.id+'\',\''+x.id+'\')"><div class="prio '+x.prio+'"></div>'
      + '<div style="min-width:0"><div class="t">'+esc(x.title)+'</div><div class="m"><span class="mono">'+esc(x.id)+'</span> · '+esc(projName(x))+' · '+esc(person(x.assignee).name)+'</div></div>'
      + '<div class="r">'+statusBadge(x.status)+'</div></button>';
  }).join(""):'<div class="empty" style="padding:16px"><p>No eligible tasks</p><span>Self, duplicates, and circular chains are excluded.</span></div>';
}
function addTaskDependency(id,depId){ var tk=task(id), dep=task(depId); if(!tk||!dep)return; if(depId===id) return toast("A task cannot depend on itself","bad"); if((tk.dependencies||[]).some(function(d){return d.taskId===depId;}))return toast("That dependency already exists","bad"); if(wouldCreateDependency(tk,depId))return toast("Can't add dependency — this would create a circular chain","bad"); var add=function(t){ t.dependencies=t.dependencies||[]; t.dependencies.push({taskId:depId,type:"finish_to_start",createdBy:ME,createdAt:new Date().toISOString()}); log(t,"dependency_added",{what:dep.title}); }; if(tk._draft){add(tk);closeModal();renderDrawer();return;} editTaskWith(tk,add).then(function(saved){ if(saved===false)return false;closeModal();notify("status",assigneesOf(tk),tk.id);toast("Dependency added");}); }
function removeTaskDependency(id,depId){ var tk=task(id), dep=task(depId); if(!tk)return; var fn=function(t){t.dependencies=(t.dependencies||[]).filter(function(d){return d.taskId!==depId;});log(t,"dependency_removed",{what:dep?dep.title:depId});}; if(tk._draft){fn(tk);renderDrawer();return;} editTaskWith(tk,fn).then(function(saved){ if(saved===false)return false;toast("Dependency removed");}); }
/* The drawer paints workspace data without going through renderScreen, so it needs the same guard:
   with no session there is nothing it may show. */
function renderDrawer(){ if(typeof signedIn==="function"&&!signedIn()) return; var tk=task(S.drawerTask); if (!tk) return; var pj=project(tk.proj); var draft=!!tk._draft; var ed=draft||canI.editTask(tk); var ro=ed?"":" disabled"; var reqBy=tk.createdBy&&PEOPLE[tk.createdBy]&&(PEOPLE[tk.createdBy].stakeholder||(tk.tags||[]).indexOf("request")>=0)?tk.createdBy:null;
  var head='<div class="dr-top"><span class="dr-id">'+(draft?(tk._request?"NEW REQUEST":"NEW TASK"):tk.id)+'</span><div class="dr-badges">'+(pj?'<span class="badge" style="cursor:pointer" onclick="closeDrawer();go(\'projects\',\''+pj.id+'\')">'+esc(pj.name)+'</span>':'')+statusBadge(tk.status)+'<span class="badge"><span class="prio '+attr(tk.prio)+'" style="height:10px;width:3px"></span>'+prioL(tk.prio)+'</span>'+teamBadge(tk.team)+(ed?'':'<span class="badge">'+I.lock+'read-only</span>')+'</div><span class="spacer"></span>'
    /* §18.6 / §20.4 one control now: the panel position and the task actions
       share a single menu, so the header is not two near-identical buttons. */
    +'<button class="iconbtn" data-menu data-tour="task-settings" aria-haspopup="menu" aria-expanded="false" aria-label="'+attr(tr("Task settings"))+'" title="'+attr(tr("Task settings"))+'" onclick="taskGearMenu(this)">'+I.settings.replace('class="i"','')+'</button>'
    +'<button class="iconbtn task-close" onclick="closeDrawer()" title="Close">'+I.x+'</button></div><div class="dr-title" data-placeholder="'+attr(tr(draft?"Task title":"Untitled task"))+'" '+(ed?'contenteditable="true"':'')+' spellcheck="false" data-for="'+attr(drawerKey(tk))+'" onblur="if(this.getAttribute(\'data-for\')===drawerKey())editTask(\'title\',this.textContent)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">'+esc(tk.title)+'</div>';
  var popts=peopleOpts();
  var cell={
    status:function(){ return taskSelectRead("status",localStages().map(function(x){ return [x.id,x.name]; }),tk.status,ed); },
    prio:function(){ return taskSelectRead("prio",PRIOS,tk.prio,ed); },
    labels:function(){ return labelPicker(tk,ed); },
    team:function(){ return taskSelectRead("team",teamOpts(true),tk.team||"",ed); },
    proj:function(){ return taskProjectField(tk,ed); },
    assignees:function(){ return pplChips(tk,"assignees",ed); },
    reviewers:function(){ return pplChips(tk,"reviewers",ed); },
    start:function(){ return taskDateField("start",tk.due-tk.span,tk,ed,false); },
    due:function(){ return taskDateField("due",tk.due,tk,ed,true); },
    effort:function(){ return '<input'+ro+' type="number" min="0" style="width:54px" value="'+tk.effort+'" onchange="editTask(\'effort\',this.value)"><span class="muted">h</span>'; },
    assetCount:function(){ return '<input'+ro+' type="number" min="0" step="1" style="width:60px" value="'+assetCount(tk)+'" onchange="editTask(\'assetCount\',this.value)"><span class="muted">'+tr("deliverables")+'</span>'; },
    tags:function(){ return tagPicker("tp_task_"+tk.id,tk.tags||[],function(value){ editTaskTags(value); },{readonly:!ed}); }
  };
  var primary=[], secondary=[], tagsField=null;
  taskFields().forEach(function(f){ if(f.displayMode==="hidden"||!cell[f.id])return; if(f.id==="tags"){tagsField=f;return;} (f.displayMode==="secondary"?secondary:primary).push(metaCell(esc(locName(f)),cell[f.id](),f.id)); });
  (WS.customFields||[]).forEach(function(cf){ var mode=["primary","secondary","hidden"].indexOf(cf.displayMode)>=0?cf.displayMode:"secondary"; if(mode==="hidden")return; (mode==="primary"?primary:secondary).push(metaCell(esc(locName(cf)),taskCustomCell(cf,tk,ed,ro),"custom-"+cf.id)); });
  head+='<div class="meta task-meta-primary">'+primary.join("")+'</div>';
  /* v34 phones: project/labels/more/tags fold behind one toggle so the brief starts higher */
  head+=draft?'':'<button type="button" class="m-details-toggle mobile-only" aria-expanded="'+(S.mDetails?"true":"false")+'" onclick="S.mDetails=!S.mDetails;renderDrawer()">'+tr(S.mDetails?"Fewer details":"All details")+' '+(S.mDetails?I.chevu:I.chevd)+'</button>';
  if(secondary.length){ var more=taskMoreOpen(); head+='<button class="task-more-toggle" aria-expanded="'+more+'" onclick="toggleTaskMore()">'+tr("More details")+' '+(more?I.chevu:I.chevd)+'</button><div class="meta task-meta-secondary'+(more?" open":"")+'">'+secondary.join("")+'</div>'; }
  if(tagsField) head+='<div class="task-tags-bottom">'+metaCell(esc(tagsField.name),cell.tags(),"tags")+'</div>';
  if (!draft) head+=dependencyDrawerBanner(tk);
  if (!draft&&(tk.hidden||autoHidden(tk))) head+='<div class="hint" style="margin:-6px 0 12px;padding:8px 12px;border-radius:var(--radius);background:var(--color-surface-sunken);display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+I.eye+'<span>'+(tk.hidden?'Hidden manually \u2014 it stays off the board until someone unhides it.':'Auto-hidden: completed work is dropped from the board '+esc(autoHideLabel())+'. Nothing was deleted.')+'</span><span class="spacer"></span>'+(tk.hidden?'<button class="btn xs" onclick="toggleHidden(\''+tk.id+'\')">Unhide</button>':'<button class="btn xs" onclick="closeDrawer();go(\'settings\',\'automation\')">Change the rule</button>')+'<button class="btn xs ghost" onclick="S.filters.hidden=\'show\';S.taskScope=\'all\';closeDrawer();go(\'tasks\',\'list\')">Show hidden tasks</button></div>';
  var tabs=[["brief","Brief",tk.brief?"✓":""],["files","Assets & versions",tk.versions.length+tk.files.filter(function(f){ return !(typeof fileFromComment==="function"&&fileFromComment(tk,f)); }).length],["comments","Comments",tk.comments.length],["activity","Activity",tk.activity.length]];
  head+='<div class="tabs">'+tabs.map(function(x){ var tour=x[0]==="brief"?"task-brief":x[0]==="files"?"task-versions":x[0]==="comments"?"task-comments":"task-activity"; return '<button data-tour="'+tour+'" class="tab'+(S.drawerTab===x[0]?" on":"")+'" onclick="setTab(\''+x[0]+'\')">'+x[1]+(x[2]?'<span class="cnt">'+x[2]+'</span>':'')+'</button>'; }).join("")
    + (draft?'':'<button type="button" class="tab-expand" aria-pressed="'+(drawerExpanded()?"true":"false")+'" title="'+attr(tr(drawerExpanded()?"Show the task details again":"Hide the task details so the tab has room"))+'" onclick="toggleDrawerExpand()">'+(drawerExpanded()?I.shrink:I.expand)+'<span>'+drawerExpandLabel(drawerExpanded())+'</span></button>')
    + '</div>';
  document.getElementById("drHead").innerHTML=head; document.getElementById("drHead").classList.toggle("m-details",draft||!!S.mDetails);
  applyDrawerExpand();
  if (S.drawerTab==="versions") S.drawerTab="files";
  var body=S.drawerTab==="brief"?descView(tk)+dependencySection(tk,ed)+briefView(tk):S.drawerTab==="files"?assetsTab(tk):S.drawerTab==="comments"?commentsView(tk):activityView(tk);
  document.getElementById("drBody").innerHTML=body;
  var k=stageKind(tk.status); var primary='';
  if (!ed) primary='';
  else if (k==="work"||k==="revision"||k==="queue") primary='<button class="btn" onclick="uploadVersion()">'+I.up+'Upload version</button><button data-tour="task-review" class="btn primary" onclick="submitReview()">Submit for review</button>';
  else if (k==="closed"&&canI.reviewTask(tk)&&tk.versions.length&&tk.versions[tk.versions.length-1].state==="approved"&&typeof startRevision==="function"&&reviewFlow().reopen) primary='<button class="btn danger-soft" onclick="startRevision()">'+tr("Request revision")+'</button>';
  else if (isReview(tk)&&canI.reviewTask(tk)&&tk.versions.length) primary='<button class="btn danger-soft" onclick="if(typeof startRevision===\'function\')startRevision();else{setTab(\'versions\');S.revOpen=true;renderDrawer()}">Request revision</button><button class="btn success" onclick="approveTask()">'+I.check+'Approve</button>';
  var footStages=taskFooterStages(), footStatus=taskFooterStatus(tk.status,footStages);
  var stepper=ed?'<div class="views task-stage-rail" role="group" aria-label="'+attr(tr("Workflow stage"))+'">'+footStages.map(function(s){ var on=s.ids.indexOf(tk.status)>=0; var wf=footStages.map(function(x){ return x.id; }); var done=wf.indexOf(s.id)<wf.indexOf(footStatus); return '<button class="'+(on?"on":done?"star":"")+'" '+(on?'disabled':'onclick="editTask(\'status\',\''+s.id+'\')"')+' title="Move to '+attr(s.name)+'">'+(done?I.check:on?I.chev:'')+esc(s.name)+'</button>'; }).join("")+'</div>':'';
  if (draft){ document.getElementById("drFoot").innerHTML='<button class="btn ghost" onclick="discardDraft()">Discard</button><span class="spacer"></span><span class="hint">Nothing is saved until you create it</span><button class="btn primary" onclick="createDraft()">'+I.check+(tk._request?"Submit request":"Create task")+'</button>'; localizeVisibleText(document.querySelector(".drawer")); return; }
  var declineBtn=(!isClosed(tk)&&isRequestTask(tk)&&canI.decideRequest()&&byId(WS.workflow,"declined"))?'<button class="btn danger-soft" onclick="declineRequest(\''+tk.id+'\')">'+I.x+'Decline</button>':'';
  document.getElementById("drFoot").innerHTML=stepper+declineBtn+'<label class="stage-select task-stage-select">Move to <select'+ro+' onchange="editTask(\'status\',this.value)">'+footStages.map(function(s){ return '<option value="'+s.id+'"'+(s.ids.indexOf(tk.status)>=0?" selected":"")+'>'+esc(s.name)+'</option>'; }).join("")+'</select></label><span class="spacer"></span>'+primary; localizeVisibleText(document.querySelector(".drawer")); }
function taskFooterStages(){ var out=[], finished=null; localStages().forEach(function(s){ var merge=s.kind==="closed"&&["approved","delivered","done"].indexOf(String(s.id).toLowerCase())>=0; if(!merge){out.push({id:s.id,ids:[s.id],name:s.name,kind:s.kind});return;} if(!finished){finished={id:s.id,ids:[],name:tr("Done"),kind:"closed"};out.push(finished);} finished.ids.push(s.id); }); return out; }
function taskFooterStatus(status,stages){ for(var i=0;i<stages.length;i++)if(stages[i].ids.indexOf(status)>=0)return stages[i].id; return status; }
function declineRequest(id){ openModal("Decline request",fieldHtml("dc_reason","Reason (visible to the requester)",'<textarea id="dc_reason" placeholder="e.g. Already covered by an existing task"></textarea>'),'<button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="if(require([\'dc_reason\'])){var tk=task(\''+id+'\');var r=val(\'dc_reason\');closeModal();editTaskWith(tk,function(t){t.comments.push(C(ME,0,\'client\',\'Declined: \'+r));log(t,\'declined\');log(t,\'moved\',{from:t.status,to:\'declined\'});t.status=\'declined\';t.completedAt=new Date().toISOString()}).then(function(saved){ if(saved===false)return false;toast(\'Request declined\',\'bad\');notify(\'request_status\',[tk.createdBy],tk.id)})}">Decline</button>'); }
/* ============================================================
   §18 TASK GEAR — quick access to the EXISTING task panel preference.
   This is an additional entry point, not a second panel system (§19):
   it reads and writes myPrefs().taskPanelPosition through the same
   taskPanelPosition() / setTaskPanelPosition() functions Settings uses,
   so the two can never disagree (§18.4, §18.5).
   ============================================================ */
/* Panel-position glyphs: a frame with the panel shaded on the matching side,
   so the choice is readable at a glance without three lines of text. */
var TASK_PANEL_GLYPH={
  left:'<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="3" y="5" width="7" height="14" rx="2" fill="currentColor" stroke="none"/>',
  center:'<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="8" y="5" width="8" height="14" fill="currentColor" stroke="none"/>',
  right:'<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="14" y="5" width="7" height="14" rx="2" fill="currentColor" stroke="none"/>'
};
function taskPanelGlyph(pos){
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"'
    + ' stroke-linejoin="round" aria-hidden="true">'+TASK_PANEL_GLYPH[pos]+'</svg>';
}
/* One menu for everything the task header offers: the personal panel position
   as a compact icon row (with the route to full layout settings sitting beside
   it rather than as its own labelled entry), then the task actions. */
function taskGearMenuHtml(){
  var cur=taskPanelPosition(), narrow=innerWidth<=980;
  var labels={left:"Left",center:"Center",right:"Right"};
  var icons=["left","center","right"].map(function(pos){
    return '<button type="button" role="menuitemradio" aria-checked="'+(cur===pos?"true":"false")+'"'
      + ' data-gear-pos="'+pos+'" class="gear-pos'+(cur===pos?" on":"")+'"'
      + ' title="'+attr(tr(labels[pos]))+'" aria-label="'+attr(tr("Task panel position")+": "+tr(labels[pos]))+'"'
      + ' onclick="taskGearSetPosition(\''+pos+'\')">'+taskPanelGlyph(pos)+'</button>'; }).join("");

  var id=S.drawerTask, tk=id?task(id):null, actions="";
  if(tk){
    /* v19.4 copy the task deep link straight from the gear (same link as the context menu) */
    if(!tk._draft&&typeof copyDeepLink==="function") actions+='<button data-tour="task-copy-link" onclick="closePops();copyDeepLink(\'task\',\''+id+'\')">'+I.link+tr("Copy task link")+'</button>';
    /* v18 §127 the Task → AI Hub shortcut: the task is pre-selected as brief source */
    if(!tk._draft&&has("use_ai_hub")) actions+='<button data-tour="task-use-ai" onclick="closePops();aiUseTask(\''+id+'\')">'+I.sparkle+tr("Use in AI Hub")+'</button>';
    if(canI.createTask()) actions+='<button onclick="closePops();duplicateTask(\''+id+'\')">'+I.plus+tr("Duplicate task")+'</button>';
    actions+='<button class="desktop-only" onclick="closePops();exportTaskCSV(\''+id+'\')">'+I.download+tr("Export task (.csv)")+'</button>';
    if(canI.editTask(tk)) actions+='<button onclick="closePops();toggleHidden(\''+id+'\')">'+I.eye+tr(tk.hidden?"Unhide task":"Hide task")+'</button>';
    if(canI.deleteTask()) actions+='<button class="danger" onclick="closePops();deleteTask(\''+id+'\')" style="color:var(--color-danger)">'+I.trash+tr("Delete task")+'</button>';
  }
  return (
    '<div class="desktop-only gear-pos-block"><div class="mh" data-tour="task-panel-position">'+tr("Panel position")+'</div>'
    + '<div class="gear-pos-row">'+icons
      /* the shortcut to full layout settings moved beside the icons */
      + '<span class="gear-pos-sep"></span>'
      + '<button type="button" class="gear-pos gear-pos-more" title="'+attr(tr("Open layout settings"))+'"'
      + ' aria-label="'+attr(tr("Open layout settings"))+'" onclick="closePops();closeDrawer();go(\'settings\',\'layout\')">'+I.settings+'</button>'
      + '</div>'
    /* §18.11 the control stays visible on narrow screens but says why it does
       nothing here, rather than forcing a drawer layout onto a phone. */
    + (narrow?'<p class="hint gear-note">'+tr("Used on wider screens.")+'</p>':'')
    + '<button type="button" class="gear-toggle" role="menuitemcheckbox" aria-checked="'+(drawerAutoExpand()?"true":"false")+'" onclick="toggleDrawerAutoExpand()"><span>'+tr("Auto-expand")+'</span><i aria-hidden="true"></i></button>'
    /* §18.7 make it unmistakable that this is a personal preference */
    + '<p class="hint gear-note">'+tr("Personal preference")+'</p>'
    + (actions?'<div class="gear-divider"></div>':'')+'</div>'
    + actions);
}
function taskGearMenu(a){
  ctxMenu(a,taskGearMenuHtml());
  a.setAttribute("aria-expanded","true");
  /* §20.7 if a position was already chosen during personal setup, simply
     seeing the control completes the step — the quest never forces a change. */
  /* v33: phones have no position choice (desktop-only), so opening the gear is the whole step there */
  if(((myPrefs()||{}).taskPanelPosition||innerWidth<=760)&&typeof WorkspaceQuest!=="undefined"&&WorkspaceQuest.emit)
    WorkspaceQuest.emit("task-panel-position");
  setTimeout(function(){
    var m=document.getElementById("ctxMenu"); if(!m) return;
    var first=m.querySelector('.gear-pos.on')||m.querySelector('.gear-pos'); if(first) first.focus();
    /* §18.14 arrows move, Enter/Space choose, Escape closes and returns focus */
    m.onkeydown=function(e){
      /* the positions are a horizontal row now, so left/right move too */
      var rows=Array.prototype.slice.call(m.querySelectorAll("[data-gear-pos]"));
      var i=rows.indexOf(document.activeElement);
      if(["ArrowDown","ArrowUp","ArrowRight","ArrowLeft"].indexOf(e.key)>=0){
        e.preventDefault();
        var fwd=(e.key==="ArrowDown"||e.key==="ArrowRight");
        if(i<0) i=0; else i=(i+(fwd?1:-1)+rows.length)%rows.length;
        rows[i].focus(); return;
      }
      if(e.key==="Enter"||e.key===" "){ if(i>=0){ e.preventDefault(); rows[i].click(); } return; }
      if(e.key==="Escape"){ e.preventDefault(); closePops(); a.setAttribute("aria-expanded","false"); a.focus(); }
    };
  },0);
}
/* §18.5 no duplicated state: if the gear menu happens to be open when the
   preference changes anywhere else, repaint it in place so the tick follows.
   This must not use ctxMenu(), which would toggle the menu shut. */
function refreshTaskGearMenu(){
  var m=document.getElementById("ctxMenu");
  if(!m||!m.classList.contains("open")) return false;
  var gear=document.querySelector('[data-tour="task-settings"]');
  if(!gear||m._anchor!==gear) return false;
  m.innerHTML=taskGearMenuHtml();
  if(typeof localizeVisibleText==="function") localizeVisibleText(m);
  return true;
}
/* §18.3 changing position must not disturb the open task: no re-fetch, no tab
   reset, no lost draft, no lost comment or field edits. The layout is driven by
   a root attribute and CSS, so the drawer DOM is left exactly as it is. */
function taskGearSetPosition(pos){
  var gear=document.querySelector('[data-tour="task-settings"]');
  var openTaskId=S.drawerTask, tab=S.drawerTab, ver=S.drawerVer, briefEdit=S.briefEdit, reply=S.replyTo;
  setTaskPanelPosition(pos);
  /* restore the view state in case anything upstream chose to re-render */
  S.drawerTask=openTaskId; S.drawerTab=tab; S.drawerVer=ver; S.briefEdit=briefEdit; S.replyTo=reply;
  /* the shared setter repaints the open menu for us (§18.5); the drawer DOM
     is never rebuilt, so nothing in the open task is disturbed.
     The menu deliberately stays open so three positions can be tried in a row,
     so focus goes to the freshly repainted icon — returning it to the gear read
     as "the menu is finished with you" even though it was still on screen. */
  var m=document.getElementById("ctxMenu");
  var chosen=m&&m.classList.contains("open")&&m.querySelector('.gear-pos[data-gear-pos="'+pos+'"]');
  if(chosen) chosen.focus({preventScroll:true});
  else if(gear) gear.focus();
  /* §20.6 the quest step completes on an actual selection */
  if(typeof WorkspaceQuest!=="undefined"&&WorkspaceQuest.emit) WorkspaceQuest.emit("task-panel-position");
}
function taskMenu(a){ var id=S.drawerTask; ctxMenu(a,(canI.createTask()?'<button onclick="closePops();duplicateTask(\''+id+'\')">'+I.plus+tr("Duplicate task")+'</button>':'')+'<button onclick="closePops();exportTaskCSV(\''+id+'\')">'+I.download+tr("Export task (.csv)")+'</button>'+(canI.editTask(task(id))?'<button onclick="closePops();toggleHidden(\''+id+'\')">'+I.eye+tr(task(id).hidden?"Unhide task":"Hide task")+'</button>':'')+(canI.deleteTask()?'<button class="danger" onclick="closePops();deleteTask(\''+id+'\')">'+I.trash+tr("Delete task")+'</button>':'')); }
function duplicateTask(id){ var src=task(id); var nid=nextId("T-",TASKS); var c=clone(src); c.id=nid; c.title=src.title+" (copy)"; c.status=WS.workflow[0].id; c.versions=[]; c.comments=[]; c.activity=[]; c.files=[]; c.ago=0; c.createdAt=null; c.completedAt=null; c.sort=(src.sort||0)+1; log(c,"created"); createTask(c).then(function(saved){ if(saved===false)return false; toast("Duplicated as "+c.id); openTask(c.id); }).catch(function(){}); }
function descView(tk){ if(typeof descEditorHtml==="function") return descEditorHtml(tk); var ed=canI.editTask(tk); return '<div style="margin-bottom:16px"><div class="eyebrow" style="margin-bottom:6px">Description</div>'+(ed?'<textarea class="desc" placeholder="'+attr(tr("Add context not covered by the brief…"))+'" onchange="editTask(\'description\',this.value)">'+esc(tk.description||"")+'</textarea><div class="hint" style="margin-top:5px">'+tr("Use this for additional context, constraints, or notes.")+'</div>':'<div style="white-space:pre-line">'+(tk.description?esc(tk.description):'<span class="hint">No description.</span>')+'</div>')+'</div>'; }

/* ---- brief ---- */
/* A creative brief is optional: many teams write the brief into the description, with its pictures.
   The empty section says so and opens folded on every task; Show unfolds it for that task. */
var BRIEF_OPT_KEY="zc.briefOptHidden";   /* the choice once remembered per browser; no longer read */
function briefOptHidden(){ return !S.briefOptOpen; }
function toggleBriefOpt(){ S.briefOptOpen=!S.briefOptOpen; renderDrawer(); }
function briefOptionalHtml(tk,ed){ var hid=briefOptHidden();
  var head='<div class="brief-opt-head"><span class="eyebrow">'+tr("Creative brief")+'</span><span class="badge">'+tr("Optional")+'</span><span class="spacer"></span><button type="button" class="btn xs ghost brief-opt-toggle" aria-expanded="'+(hid?"false":"true")+'" onclick="toggleBriefOpt()">'+tr(hid?"Show":"Hide")+'</button></div>';
  if (hid) return '<div class="brief-opt collapsed">'+head+'</div>';
  return '<div class="brief-opt">'+head+'<div class="empty" style="padding:20px 20px 26px"><div class="ico">'+I.knowledge+'</div><div class="h">'+tr("No creative brief yet")+'</div><p>'+tr("A structured brief is optional — use one of these, or keep the brief in the description above.")+'</p>'+(ed?'<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;justify-content:center">'+WS.briefTemplates.map(function(t){ return '<button class="btn sm" onclick="addBrief(\''+t.id+'\')">'+esc(t.name)+'</button>'; }).join("")+'</div>':'')+'</div></div>'; }
function briefView(tk){ var ed=canI.editTask(tk); if (!tk.brief) return briefOptionalHtml(tk,ed);
  var b=tk.brief; var tpl=byId(WS.briefTemplates,b.tpl)||{name:"Custom",fields:WS.briefFields.map(function(f){ return f[0]; }),required:[]}; var fields=WS.briefFields.filter(function(f){ return tpl.fields.indexOf(f[0])>=0; }); var req=tpl.required||[]; var missing=req.filter(function(f){ return !b[f]; });
  var h='<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="eyebrow">Creative brief</span><span class="tpl">'+esc(tpl.name)+'</span>'+(missing.length?'<span class="badge bad">'+missing.length+' required field'+(missing.length>1?"s":"")+' missing</span>':'<span class="badge ok">Complete</span>')+'<span class="spacer"></span>'+(tk._draft?'':'<button class="btn xs" onclick="closeDrawer();go(\'assets\');S.assetTab=\'brand\';renderScreen(false)">'+I.assets.replace('class="i"','')+'Brand library</button>')+(ed?(S.briefEdit?'<button class="btn sm" onclick="S.briefEdit=false;renderDrawer()">Cancel</button><button class="btn sm primary" onclick="saveBrief()">Save brief</button>':'<button class="btn sm" onclick="S.briefEdit=true;renderDrawer()">'+I.edit+'Edit</button>'):'')+'</div><div class="brief" data-for="'+attr(drawerKey(tk))+'"'+(ed&&!S.briefEdit?' ondblclick="briefStartEdit(event)" title="'+attr(tr("Double-click a field to edit it"))+'"':'')+'>';
  fields.forEach(function(f){ var v=b[f[0]]; h+='<div class="k'+(req.indexOf(f[0])>=0?" req":"")+'" data-k="'+attr(f[0])+'">'+f[1]+'</div><div class="v'+(!v&&!S.briefEdit?" empty-v":"")+'" data-k="'+attr(f[0])+'">'+(S.briefEdit?'<textarea data-bf="'+f[0]+'">'+esc(v||"")+'</textarea>':(v?(typeof pasteMarkersToThumbs==="function"?pasteMarkersToThumbs(esc(v),tk):esc(v)):"Not set"))+(typeof pasteFieldImagesHtml==="function"?pasteFieldImagesHtml(tk,f[0]):"")+'</div>'; });
  return h+'</div>'; }
function addBrief(tplId){ var tk=task(S.drawerTask); var tpl=byId(WS.briefTemplates,tplId); editTaskWith(tk,function(t){ t.brief={tpl:tplId}; tpl.fields.forEach(function(f){ t.brief[f]=""; }); if (t.description) t.brief.objective=t.description; log(t,"brief"); }); S.briefEdit=true; renderDrawer(); }
/* The brief fields drawn for this task (not any others still in the page). */
function briefInputs(tk){ var box=Array.prototype.filter.call(document.querySelectorAll(".brief[data-for]"),function(b){ return tk&&b.getAttribute("data-for")===drawerKey(tk); })[0]; return box?box.querySelectorAll("[data-bf]"):[]; }
/* Brief fields left open in edit are kept when the person moves to another task or closes the panel —
   they used to vanish — and saved to the task they were typed in. */
function briefFlush(tk){ if(!tk||!tk.brief) return false; var tas=briefInputs(tk), vals={}, changed=false; for(var i=0;i<tas.length;i++){ var k=tas[i].getAttribute("data-bf"), v=tas[i].value.trim(); vals[k]=v; if((tk.brief[k]||"")!==v) changed=true; } if(!changed) return false; if(tk._draft){ Object.assign(tk.brief,vals); return true; } editTaskWith(tk,function(t){ Object.assign(t.brief,vals); log(t,"edited",{what:"the brief"}); }); toast(tr("Brief saved")); return true; }
function saveBrief(){ var tk=task(S.drawerTask); var tas=briefInputs(tk); var vals={}; for (var i=0;i<tas.length;i++) vals[tas[i].getAttribute("data-bf")]=tas[i].value.trim(); S.briefEdit=false; editTaskWith(tk,function(t){ Object.assign(t.brief,vals); log(t,"edited",{what:"the brief"}); }); toast("Brief saved"); }

/* ---- versions & approval ---- */
function verBadge(v){ return v.state==="approved"?'<span class="badge approved">Approved</span>':v.state==="revision"?'<span class="badge revision">Revision requested</span>':'<span class="badge review">Pending review</span>'; }
/* the project dropdown doubles as "create one" — reset the select first so a
   cancelled modal leaves the task where it was */
function pickProject(sel){
  var tk=task(S.drawerTask); if (!tk) return;
  if (sel.value!=="__new__") return editTask("proj",sel.value);
  sel.value=tk.proj||"";
  quickProjectModal();
}
function labelPicker(tk,ed){
  var ls=labelsOf(tk);
  var h='<span class="lbls" style="margin:0">'+(ls.length?ls.map(function(l){ return '<span class="lbl" style="--lc:'+attr(l.color)+'">'+esc(l.name)+(ed?'<b class="lx" onclick="event.stopPropagation();toggleLabel(\''+l.id+'\')" title="Remove">\u00d7</b>':'')+'</span>'; }).join(""):'<span class="muted">\u2014</span>');
  if (ed) h+='<button class="btn xs ghost" data-menu onclick="labelMenu(this)">'+I.plus+'Label</button>';
  return h+'</span>';
}
function labelMenu(anchor){
  var tk=task(S.drawerTask); if (!tk) return;
  var cur=tk.labels||[];
  ctxMenu(anchor,'<div class="mh">Labels</div>'+allLabels().map(function(l){
      return '<button onclick="event.stopPropagation();toggleLabel(\''+l.id+'\');closePops()"><span style="width:16px">'+(cur.indexOf(l.id)>=0?"\u2713":"")+'</span><i style="width:9px;height:9px;border-radius:50%;background:'+attr(l.color)+';display:inline-block;margin-right:7px"></i>'+esc(l.name)+'</button>'; }).join("")
    +'<div class="mh">Manage</div><button onclick="closePops();closeDrawer();go(\'settings\',\'labels\')">'+I.settings+'Edit labels</button>');
}
function toggleLabel(id){
  var tk=task(S.drawerTask); if (!tk) return;
  editTaskWith(tk,function(t){ t.labels=t.labels||[]; var i=t.labels.indexOf(id); if (i>=0) t.labels.splice(i,1); else t.labels.push(id); });
}
function assetsTab(tk){
  if(typeof assetsTabSimple==="function") return assetsTabSimple(tk);
  var ed=tk._draft||canI.editTask(tk);
  var h=assetPanel(tk,ed);
  h+='<div class="eyebrow" style="margin:16px 0 8px">Versions &amp; approval</div>'+versionsView(tk);
  h+='<div class="eyebrow" style="margin:20px 0 8px">Files &amp; references</div>'+filesView(tk,true);
  return h;
}
function versionsView(tk,o){ o=o||{}; var ed=canI.editTask(tk); if (!tk.versions.length) return '<div class="empty" style="padding:48px 20px"><div class="ico">'+I.assets+'</div><div class="h">No versions uploaded yet</div><p>Upload the first version or link an existing file from Google Drive — the preview and approval flow work for both.</p>'+(ed?'<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn primary" onclick="uploadVersion()">'+I.up+tr("Upload version")+'</button><button class="btn" onclick="linkDriveVersionModal()">'+(typeof driveIcon==="function"?driveIcon():I.link)+tr("Link Google Drive")+'</button>'+(typeof linkVersionModal==="function"?'<button class="btn" onclick="linkVersionModal()">'+I.link+tr("Attach link")+'</button>':'')+'</div>':'')+'</div>';
  var v=curVer(tk); var isLast=v.n===tk.versions[tk.versions.length-1].n; var h='';
  if (ed&&!o.onlyPreview) h+='<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px"><button class="btn sm" onclick="linkDriveVersionModal()">'+I.link+'Link Google Drive version</button><button class="btn sm primary" onclick="uploadVersion()">'+I.up+'Upload new version</button></div>';
  var foot='<div class="pbar-foot">'+av(v.by)+'<span>'+esc(person(v.by).name)+' · '+ago(v.ago,v.createdAt)+(v.note?' · '+esc(v.note):'')+'</span><span class="spacer"></span><button class="btn xs" onclick="previewVersion('+v.n+')">'+I.eye+tr("Full view")+'</button>'+(v.driveUrl?'<button class="btn xs ghost" onclick="openExternal('+jsq(v.driveUrl)+')">'+I.ext+origLabel(v.driveUrl,true)+'</button>':'<button class="btn xs ghost" onclick="downloadVersion('+v.n+')">'+I.download+tr("Download")+'</button>')+(o.onlyPreview?'':verBadge(v))+'</div>';
  h+=versionPreviewHtml(tk,v,{foot:foot});
  /* the simplified Assets & versions tab takes the preview and its pins from here, and draws the
     rest — the version switcher, the decision and the actions — its own way (src/assets-tab.js) */
  if (o.onlyPreview) return h;
  if (v.state==="approved") h+='<div class="approval ok"><div class="h">'+I.check.replace("<svg",'<svg width="16" height="16" stroke="var(--color-success)" fill="none" stroke-width="2.5"')+'Version '+v.n+' approved</div><p>Approved by '+esc(person(v.decidedBy||tk.reviewer).name)+', '+ago(v.decidedAgo!=null?v.decidedAgo:v.ago,v.decidedAt||(v.decidedAgo!=null?null:v.createdAt))+'. Ready for delivery.</p></div>';
  else if (v.state==="revision") h+='<div class="approval rev"><div class="h">Version '+v.n+' sent back for revision</div><p>'+esc(v.reason||"Waiting for the assignee to upload a new version.")+'</p></div>';
  else if (isLast&&isReview(tk)){ if (canI.reviewTask(tk)) h+='<div class="approval"><div class="h">Approval · Version '+v.n+'</div><p>Approving moves the task to Approved. A revision request goes back to the assignee with a reason and specific feedback.</p><div class="acts"><button class="btn success" onclick="approveTask()">'+I.check+'Approve</button><button class="btn danger-soft" onclick="S.revOpen=!S.revOpen;renderDrawer()">Request revision</button></div>'+(S.revOpen?revForm():"")+'</div>'; else h+='<div class="approval"><div class="h">Approval · Version '+v.n+'</div><p>Waiting for '+esc(person(tk.reviewer).name)+' — only the reviewer (or a lead) can approve or send back.</p></div>'; }
  else if (isLast&&ed) h+='<div class="approval"><div class="h">Version '+v.n+' is not in review</div><p>Submit the task for review to unlock approval.</p><div class="acts"><button class="btn primary sm" onclick="submitReview()">Submit for review</button></div></div>';
  h+='<div class="versions">'+tk.versions.slice().reverse().map(function(x){ var last=x.n===tk.versions[tk.versions.length-1].n; return '<div class="ver'+(x.n===v.n?" cur":"")+'" onclick="S.drawerVer='+x.n+';S.revOpen=false;renderDrawer()"><div class="thumb" style="background:'+x.color+(x.img?';background-image:url('+x.img+');background-size:cover':'')+'">V'+x.n+'</div><div><div class="t">Version '+x.n+(x.state==="approved"&&last?' · Final':'')+'</div><div class="m">'+esc(person(x.by).name)+' · '+ago(x.ago,x.createdAt)+(x.note?' · '+esc(x.note):'')+'</div></div>'+verBadge(x)+'</div>'; }).join("")+'</div>';
  return h; }
function revForm(){ return '<div class="revform">'+fieldHtml("revReason","Reason",'<input id="revReason" placeholder="e.g. Off brand guideline">')+fieldHtml("revFeedback","Specific feedback",'<textarea id="revFeedback" placeholder="Be specific — headline, colors, layout, placement…"></textarea>')+fieldHtml("revPrio","Revision priority",selectHtml("revPrio",[["high","High"],["urgent","Urgent"],["medium","Medium"]],"high"))+'<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" onclick="S.revOpen=false;renderDrawer()">Cancel</button><button class="btn primary" onclick="sendRevision()">Send revision request</button></div></div>'; }
function downloadVersion(n){ var tk=task(S.drawerTask); var v=tk.versions.filter(function(x){ return x.n===n; })[0]; if (v.img){ var a=document.createElement("a"); a.href=v.img; a.download=tk.id+"-v"+n+".png"; a.click(); } else { toast("Preview placeholder — link a real file in the Files tab"); } }
function uploadVersion(silent){ var tk=task(S.drawerTask); if (silent){ return pushVersion(tk,null,"",true); } window._verImg=null; window._verName=""; window._verUp=null; window._verPending=false; window._verSession=(window._verSession||0)+1;
  openModal("Upload version "+(tk.versions.reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1),fieldHtml("uv_note","Version note",'<input id="uv_note" placeholder="What changed in this version?">')+'<div class="field"><label>File</label><div style="display:flex;gap:8px;align-items:center"><button class="btn" onclick="pickVersionFile()">'+I.up+'Choose file</button><span class="hint" id="uv_file">Choose a file</span></div></div><div id="uv_preview"></div>','<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="pushVersion(task(S.drawerTask),window._verImg,val(\'uv_note\'),false,window._verName)">Add version</button>'); }
function pickVersionFile(){ var inp=document.getElementById("fileInput"); inp.accept="image/*,.pdf,.psd,.ai,.mp4,.mov"; inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if (!f) return; versionFileChosen(f); }; inp.click(); }
/* v19.9 shared by the file picker and clipboard paste */
function versionFileChosen(f){ if(!f||!document.getElementById("uv_file")||!document.getElementById("modalWrap").classList.contains("open")) return; var session=window._verSession, token=window._verPick=(window._verPick||0)+1; window._verPending=true;window._verUp=null;window._verImg=null;window._verName=f.name; document.getElementById("uv_preview").innerHTML=""; document.getElementById("uv_file").textContent=f.name+" · "+(f.size/1048576).toFixed(1)+" MB · "+(gdAuto()?tr("uploading to Google Drive…"):(storageMode()==="server"&&API.on?tr("uploading…"):tr("processing…"))); uploadAny(f).then(function(u){ if(session!==window._verSession||token!==window._verPick)return; window._verImg=u.preview||null; window._verUp=u; var el=document.getElementById("uv_file"); if (el) el.textContent=f.name+" · "+u.size+(u.driveId?" · in Google Drive":""); var pv=document.getElementById("uv_preview"); if (pv&&u.preview) pv.innerHTML='<img src="'+attr(u.preview)+'" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--color-border)">'; }).catch(function(e){if(session===window._verSession&&token===window._verPick){window._verUp=null;toast(e.message,"bad");var el=document.getElementById("uv_file");if(el)el.textContent="Upload failed";}}).finally(function(){if(session===window._verSession&&token===window._verPick)window._verPending=false;}); }
function pushVersion(tk,img,note,silent,name){ if(!silent&&window._verPending)return toast("Wait for the upload to finish","bad");if(!silent&&!window._verUp)return toast("Choose a file first","bad"); var n=tk.versions.reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1; var cols=["#7C3AED","#0F766E","#B45309","#1D4ED8","#BE185D"]; if (!silent) closeModal(); S.drawerVer=n; S.drawerTab="versions"; var up=silent?null:(window._verUp||null); window._verUp=null; return editTaskWith(tk,function(t){ var v=V(n,ME,0,"pending",cols[n%cols.length],note||""); if (img) v.img=img; if (up&&(up.driveId||up.source==="server")){ v.driveUrl=up.url; if(up.driveId) v.driveId=up.driveId; } t.versions.push(v); if (name) t.files.push(F(name,up?up.type:(img?"image":"other"),up?up.source:"local",up?up.size:"—",0,up?up.url:"",up?{preview:up.preview,driveId:up.driveId}:null)); log(t,"upload",{v:n}); }).then(function(saved){ if(saved===false)return false; notifyTask("upload",tk); if (!silent) toast("Version "+n+" uploaded"); }); }
function linkDriveVersionModal(){ var tk=task(S.drawerTask); openModal("Link version from Google Drive",'<p class="hint">Paste a Google Drive file link. ZenCrevia will create the next version, keep the source in Drive, and open Drive’s preview in the dashboard.</p>'+fieldHtml("ldv_url","Google Drive share link",'<input id="ldv_url" placeholder="https://drive.google.com/file/d/…">')+fieldHtml("ldv_name","Version note",'<input id="ldv_name" placeholder="e.g. Final layout with updated disclaimer">'),'<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveDriveVersion()">Link version</button>'); }
function saveDriveVersion(){ if (!require(["ldv_url"])) return; var url=val("ldv_url"), note=val("ldv_name"); if (!isDriveUrl(url)) return toast("Use a Google Drive share link","bad"); var tk=task(S.drawerTask), n=tk.versions.reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1, id=(url.match(/\/d\/([^/?]+)/)||[])[1]||""; closeModal(); S.drawerVer=n; S.drawerTab="versions"; editTaskWith(tk,function(t){ var v=V(n,ME,0,"pending",["#7C3AED","#0F766E","#B45309"][n%3],note||"Linked from Google Drive"); v.driveUrl=url; v.driveId=id; t.versions.push(v); t.files.push(F("Version "+n,"document","gdrive","—",0,url,{driveId:id})); log(t,"upload",{v:n}); }).then(function(saved){ if(saved===false)return false; notifyTask("upload",tk); toast("Google Drive version linked"); }); }
function submitReview(){ var tk=task(S.drawerTask); var target=null; WS.workflow.forEach(function(s){ if (!target&&s.kind==="review") target=s.id; }); if (!target){ toast("Add a review stage in Settings → Workflow","bad"); return; } var go_=function(){ S.drawerTab="versions"; setStatus(tk.id,target,function(ok){ if(!ok) return; toast("Submitted for review"); }); }; if (!tk.versions.length) pushVersion(tk,null,"",true).then(function(r){ if(r!==false) go_(); }); else go_(); }
function approveTask(){ var tk=task(S.drawerTask); var v=tk.versions[tk.versions.length-1]; if (!v) return; var target=null; WS.workflow.forEach(function(s){ if (!target&&s.kind==="closed") target=s.id; }); target=target||tk.status; var from=tk.status; S.drawerVer=v.n; S.revOpen=false;
  editTaskWith(tk,function(t){ var lv=t.versions[t.versions.length-1]; lv.state="approved"; lv.decidedAgo=0; lv.decidedBy=ME; t.status=target; t.completedAt=stageKind(target)==="closed"?new Date().toISOString():null; log(t,"approved",{v:lv.n}); log(t,"moved",{from:from,to:target}); }).then(function(saved){ if(saved===false)return false; notifyTask("approved",tk); toast("Version "+v.n+" approved"); }); }
function sendRevision(){ var tk=task(S.drawerTask); if (!require(["revReason","revFeedback"])) return; var reason=val("revReason"), fb=val("revFeedback"), pr=val("revPrio"); var target=null; WS.workflow.forEach(function(s){ if (!target&&s.kind==="revision") target=s.id; }); if (!target) target=(WS.workflow.filter(function(s){ return s.kind==="work"; })[0]||WS.workflow[0]).id; var from=tk.status; S.revOpen=false;
  editTaskWith(tk,function(t){ var lv=t.versions[t.versions.length-1]; lv.state="revision"; lv.reason=reason; lv.feedback=fb; lv.decidedAgo=0; lv.decidedBy=ME; t.status=target; t.prio=pr; t.comments.push(C(ME,0,S.commentVis,reason+" — "+fb)); log(t,"revision"); log(t,"moved",{from:from,to:target}); }).then(function(saved){ if(saved===false)return false; notifyTask("revision",tk); toast("Revision request sent","bad"); }); }

/* ---- files ---- */
function fileIcon(f){ var c={image:"#8E24AA",video:"#0F766E",pdf:"#D63B3B",psd:"#1E5BB8",ai:"#E65100",figma:"#A259FF",other:"#546E7A",document:"#475569"}; return '<span class="ficon" style="background:'+(c[f.type]||"#546E7A")+'">'+(f.name.match(/\.(\w+)$/)?f.name.match(/\.(\w+)$/)[1].slice(0,4):f.type)+'</span>'; }
function assetPanel(tk,ed){ var links=taskAssetLinks(tk); var fin=finalAssetLink(tk); var n=assetCount(tk);
  var h='<div class="panel" style="margin-bottom:14px"><div class="panel-head"><span class="sq blue">'+I.assets+'</span><h2>Assets</h2><span class="cnt">'+n+' '+tr("produced")+' \u00b7 '+links.length+' '+tr(links.length===1?"link":"links")+'</span><span class="spacer"></span>';
  h+=(ed?'<label class="pillsel"><span>Assets produced</span><input type="number" min="0" step="1" value="'+n+'" style="width:58px;border:0;background:transparent;font-weight:700;outline:none" onchange="editTask(\'assetCount\',this.value)"></label>':'<span class="badge">'+n+' '+tr("assets")+'</span>');
  h+=(fin?'<button class="btn sm primary" onclick="openExternal('+jsq(fin.url)+')">'+I.ext+'Open final asset</button>':'')+'</div>';
  h+=links.length?'<div class="panel-body">'+links.map(function(l){ var isFinal=fin&&l.url===fin.url; return '<div class="alink">'+(l.kind==="version"?'<span class="ficon" style="background:var(--color-ink)">V'+l.v+'</span>':'<span class="ficon" style="background:#475569">'+esc((String(l.name).match(/\.(\w+)$/)||["","link"])[1].slice(0,4))+'</span>')+'<div style="min-width:0;flex:1"><div class="t">'+esc(l.name)+(isFinal?' <span class="badge approved">final</span>':'')+'</div><div class="u">'+esc(l.url)+'</div></div><button class="btn xs" onclick="openExternal('+jsq(l.url)+')">'+I.ext+'Open</button></div>'; }).join("")+'</div>':'<div class="panel-body pad"><p class="hint">No asset link yet. Upload a version or attach a cloud link below \u2014 links show up here, on the project Assets tab and in the Excel export.</p></div>';
  return h+'</div>'; }
function taskUploadQueue(tid){ window._taskUploads=window._taskUploads||{}; return window._taskUploads[tid]=window._taskUploads[tid]||[]; }
function taskUploadPendingHtml(tk){ var q=taskUploadQueue(tk.id); if(!q.length)return ""; return '<div class="file-upload-pending">'+q.map(function(x){ return '<div class="file pending">'+(x.preview?'<span class="fthumb" style="background-image:url('+attr(x.preview)+')"></span>':fileIcon({type:x.type}))+'<div style="min-width:0"><div class="t">'+esc(x.name)+'</div><div class="m"><span class="badge">'+tr("Uploading…")+'</span><span>'+esc(x.size)+'</span><span>· Google Drive</span></div></div><span class="spinner" aria-label="'+attr(tr("Uploading"))+'"></span></div>'; }).join("")+'</div>'; }
function filesView(tk,nested){ var ed=tk._draft||canI.editTask(tk); var drive=typeof driveIcon==="function"?driveIcon():I.cloud; var h=(nested?"":assetPanel(tk,ed))+(ed?'<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+(tk._draft?'':'<button class="btn sm primary" onclick="attachLocal(true)">'+I.up+'Upload images</button>')+'<button class="btn sm" onclick="attachLocal()">'+I.up+'Upload file</button><button class="btn sm" onclick="linkCloudModal(\'task\')">'+drive+'Link Google Drive</button><button class="btn sm" onclick="attachTaskLinkModal()">'+I.link+tr("Attach link")+'</button><button class="btn sm" onclick="attachAssetModal()">'+I.assets.replace('class="i"','')+'Attach from library</button></div>':'');
  h+=(gdAuto()?'<div class="hint" style="margin:-6px 0 10px">'+drive+' '+tr("Uploads go straight to your Google Drive")+(gdCfg().folderId?' '+tr("folder"):'')+' — '+tr("the server only keeps the link.")+'</div>'
     :(storageMode()==="server"&&API.on?'<div class="hint" style="margin:-6px 0 10px">'+tr("Files are kept on this server.")+'</div>':''));
  var pending=taskUploadPendingHtml(tk); if (!tk.files.length) return h+pending+emptyBox(tk._draft?tr("No files yet"):"No files attached",tk._draft?tr("Attach a working file, a Google Drive link or any HTTPS link. Reference images go in the description."):"Upload a working file, link one from Google Drive, or attach any HTTPS link.",drive);
  var imgs=tk.files.filter(function(f){ return f.preview; }); h+=imgs.length?'<div class="fgallery">'+imgs.map(function(f){ return '<div class="fg" style="background-image:url('+attr(f.preview)+')" onclick="previewFile(\''+f.id+'\')" title="'+attr(f.name)+'"><span>'+esc(f.name)+'</span></div>'; }).join("")+'</div>':'';
  return h+pending+tk.files.map(function(f,i){ return fileRowHtml(tk,f,i,ed); }).join(""); }
/* One file row. i is the file's place in tk.files, which is what removeFile takes, so a row keeps
   it however the list is grouped. o adds a tag after the name, a line of detail and buttons. */
function fileRowHtml(tk,f,i,ed,o){ o=o||{}; return '<div class="file'+(o.cls?" "+o.cls:"")+'" data-fid="'+attr(f.id)+'">'+((f.url&&typeof isGoogleLink==="function"&&isGoogleLink(f.url)&&typeof driveIcon==="function")?'<span class="ficon ficon-drive">'+googleIcon(f.url)+'</span>':fileThumb(f))+'<div style="min-width:0"><div class="t">'+esc(f.name)+(o.tag||"")+'</div><div class="m">'+srcBadge(srcOf(f))+'<span>'+esc(f.size)+'</span><span>·</span><span>'+ago(f.ago,f.createdAt)+'</span>'+((f.url&&(typeof fileUrlLabel==="function"?fileUrlLabel(f.url):f.url)!==f.name)?'<span>·</span><span class="mono" style="overflow:hidden;text-overflow:ellipsis" title="'+attr(f.url)+'">'+esc(typeof fileUrlLabel==="function"?fileUrlLabel(f.url):f.url)+'</span>':'')+(o.meta||"")+'</div></div><div class="file-acts">'+(o.btns||"")+((f.preview||f.driveId||(f.url&&typeof embedFor==="function"&&embedFor(f.url)))?'<button class="btn xs" onclick="previewFile(\''+f.id+'\')">'+I.eye+tr("Preview")+'</button>':'')+((f.preview||f.driveId||(f.url&&/^https?:/i.test(f.url)))?'<button class="btn xs" title="'+attr(tr("Save to device"))+'" onclick="saveFile('+attr(JSON.stringify({name:f.name,img:f.preview||"",url:f.url||"",driveId:f.driveId||null}))+')">'+I.download+tr("Save")+'</button>':'')+(f.url?'<button class="btn xs" onclick="openExternal('+jsq(f.url)+')">'+I.ext+(f.driveId?'Drive':tr("Open"))+'</button>':'')+(ed?'<button class="iconbtn flat" style="width:26px;height:26px" aria-label="'+attr(tr("Remove file"))+'" onclick="removeFile('+i+')">'+I.trash+'</button>':'')+'</div></div>'; }
/* v19.7 one gate for every external link — task versions/files, project final assets, asset library, Drive cards, chat links: confirm popup first, then a new tab */
/* what the button that opens a version's source says: the stored original, Drive, or — for a
   version attached as an ordinary link — just the link */
function origLabel(url,short){ if(/^[/]files[/]/.test(String(url||""))) return tr(short?"Original":"Open original"); if(typeof isDriveUrl!=="function"||isDriveUrl(url)) return short?"Drive":tr("Open in Google Drive"); return tr(short?"Link":"Open link"); }
function openExternalNow(url){ if (/^[/]files[/]/.test(String(url||""))) return window.open(url,"_blank","noopener"); if (/^https?:/.test(url)) window.open(url,"_blank","noopener"); else toast("Opens in the connected storage: "+url); }
function openExternal(url,name){ if(!/^https?:/.test(url)) return openExternalNow(url); externalLinkPop(url,name); }
/* The original file behind a link, as a download: a Slides/Docs/Sheets file is exported in the format it
   was uploaded as (a .pptx turned into Slides comes back a .pptx), a Drive file through Drive's download
   link, a file on this server with ?download=1. Folders and web pages have none. */
function fileDownloadInfo(url,name){ var u=String(url||""), m, ext=((String(name||"").match(/\.([a-z0-9]{1,6})$/i)||[])[1]||"").toLowerCase();
  if(/^\/files\/d\/[a-f0-9]{64}\.[a-z0-9]{1,6}/.test(u)){ var se=u.split("?")[0].split(".").pop(); return {url:u.split("?")[0]+"?download=1"+(name?"&name="+encodeURIComponent(name):""),ext:ext||se}; }
  if((m=u.match(/docs\.google\.com\/presentation\/d\/([-\w]+)/))){ var pe=ext==="pdf"?"pdf":"pptx"; return {url:"https://docs.google.com/presentation/d/"+m[1]+"/export/"+pe,ext:pe}; }
  if((m=u.match(/docs\.google\.com\/document\/d\/([-\w]+)/))){ var de=/^(pdf|odt|txt|rtf)$/.test(ext)?ext:"docx"; return {url:"https://docs.google.com/document/d/"+m[1]+"/export?format="+de,ext:de}; }
  if((m=u.match(/docs\.google\.com\/spreadsheets\/d\/([-\w]+)/))){ var xe=/^(pdf|csv|ods)$/.test(ext)?ext:"xlsx"; return {url:"https://docs.google.com/spreadsheets/d/"+m[1]+"/export?format="+xe,ext:xe}; }
  if((m=u.match(/drive\.google\.com\/file\/d\/([-\w]+)/))||(m=u.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([-\w]+)/))) return {url:"https://drive.google.com/uc?export=download&id="+m[1],ext:ext};
  return null; }
function fileDownloadNow(url){ var a=document.createElement("a"); a.href=url; a.target="_blank"; a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove(); }
function externalLinkPop(url,name){ var p=typeof detectProvider==="function"?detectProvider(url):null, host=""; try{ host=new URL(url).host; }catch(e){} var ico=p&&/^GOOGLE_/.test(p.provider)&&typeof googleIcon==="function"?googleIcon(p):(p&&typeof SMART_ICON!=="undefined"?SMART_ICON[p.provider]:"")||"🔗"; var dl=fileDownloadInfo(url,name); openModal(tr("Open external link"),'<div class="msg-linkpop"><span class="msg-card-ico'+(p&&/^GOOGLE_/.test(p.provider)?" drive":"")+'">'+ico+'</span><div class="msg-linkpop-body"><b data-no-translate>'+esc(name||host||url)+'</b>'+(name&&host?'<span data-no-translate>'+esc(host)+'</span>':'')+(p&&typeof smartSubtitle==="function"?'<span>'+esc(tr(smartSubtitle(p)))+'</span>':'')+'<code data-no-translate>'+esc(url)+'</code></div></div><p class="hint">'+tr("This opens in a new tab outside ZenCrevia. Only open links you trust.")+'</p>',/* with a download the row is full: the window closes with its ×, so Cancel goes */
(dl?'':'<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button>')+'<button class="btn" onclick="(navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText('+jsq(url)+'):Promise.reject()).then(function(){toast(tr(\'Link copied\'))},function(){prompt(tr(\'Copy link\'),'+jsq(url)+')})">'+I.link+tr("Copy link")+'</button><span class="spacer"></span>'+(dl?'<button class="btn link-download" onclick="closeModal();fileDownloadNow('+jsq(dl.url)+')">'+I.download+tr("Download original")+(dl.ext?' (.'+esc(dl.ext)+')':'')+'</button>':'')+'<button class="btn primary" onclick="closeModal();openExternalNow('+jsq(url)+')">'+I.ext+tr("Open link")+'</button>'); }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"Download original":"Unduh file asli"});
function removeFile(i){ var tk=task(S.drawerTask), f0=tk&&tk.files[i]; if(!f0) return; var linked=fileLinkedVersions(tk,f0);
  var run=function(){ editTaskWith(tk,function(t){ var k=t.files.indexOf(f0); if(k<0&&f0.id) k=t.files.findIndex(function(x){ return x.id===f0.id; }); if(k<0) return; var f=t.files.splice(k,1)[0]; var gone=fileLinkedVersions(t,f).map(function(v){ return v.n; }); if(gone.length){ t.versions=t.versions.filter(function(v){ return gone.indexOf(v.n)<0; }); if(gone.indexOf(S.drawerVer)>=0) S.drawerVer=t.versions.length?t.versions[t.versions.length-1].n:null; } log(t,"deleted",{what:f.name+(gone.length?" (V"+gone.join(", V")+")":"")}); }); };
  if(!linked.length) return run();
  if(linked.some(function(v){ return v.state==="approved"; })) return toast(tr("This file is an approved version. It cannot be removed."),"bad");
  confirmModal(tr("Remove file and version?"),esc(f0.name)+" "+tr("is also Version")+" "+linked.map(function(v){ return v.n; }).join(", ")+". "+tr("The version and its notes will be removed too."),run,true); }
/* v38: a version uploaded through "Upload version" also appears in Files; both point at the same asset */
function fileLinkedVersions(tk,f){ if(!tk||!f) return []; return (tk.versions||[]).filter(function(v){ return (f.driveId&&v.driveId===f.driveId)||(f.preview&&v.img&&v.img===f.preview)||(f.url&&v.driveUrl&&v.driveUrl===f.url); }); }
function attachLocal(imagesOnly){ var tk=task(S.drawerTask); var inp=document.getElementById("fileInput"); inp.accept=imagesOnly?"image/*":"*/*"; inp.multiple=true; inp.onchange=function(){ var files=Array.prototype.slice.call(inp.files); inp.value=""; inp.multiple=false; if (!files.length) return; var q=taskUploadQueue(tk.id), entries=files.map(function(f){ return {id:uid("up"),name:f.name,size:(f.size/1048576).toFixed(1)+" MB",type:/^image\//.test(f.type)?"image":/^video\//.test(f.type)?"video":"other",preview:/^(image|video)\//.test(f.type)?URL.createObjectURL(f):""}; }); Array.prototype.push.apply(q,entries); renderDrawer();
  Promise.all(files.map(function(f,i){ return uploadAny(f,{forceDrive:true}).then(function(u){ return {file:f,upload:u}; }).catch(function(e){ return {file:f,error:e}; }); })).then(function(results){ var active=taskUploadQueue(tk.id); entries.forEach(function(x){ var i=active.indexOf(x); if(i>=0)active.splice(i,1); if(x.preview)URL.revokeObjectURL(x.preview); }); var good=results.filter(function(x){return x.upload;}); var bad=results.filter(function(x){return x.error;}); if(!good.length){ renderDrawer(); return toast(bad[0].file.name+": "+bad[0].error.message,"bad"); } return editTaskWith(tk,function(t){ good.forEach(function(x){ var u=x.upload; t.files.push(F(u.name,u.type,u.source,u.size,0,u.url,{preview:u.preview,driveId:u.driveId})); log(t,"file",{name:u.name}); }); }).then(function(saved){ renderDrawer(); if(saved===false)return false; toast(good.length+" file"+(good.length>1?"s":"")+" attached to Google Drive"); if(bad.length)toast(bad.length+" file could not be uploaded","bad"); if (!tk._draft) notifyTask("file",tk); }); }); }; inp.click(); }
function normalizedAttachUrl(raw){ var value=String(raw||"").trim(); if(/^www\./i.test(value))value="https://"+value; try{ var u=new URL(value); return u.protocol==="https:"?u.href:""; }catch(_){ return ""; } }
function attachTaskLinkModal(){ openModal(tr("Attach link"),'<p class="hint">'+tr("Attach any trusted HTTPS link. It stays connected to this task and appears with the other files and references.")+'</p>'+fieldHtml("atl_url",tr("Link"),'<input id="atl_url" inputmode="url" placeholder="https://example.com/file-or-page">')+fieldHtml("atl_name",tr("Display name"),'<input id="atl_name" placeholder="'+attr(tr("e.g. Campaign reference"))+'">'),'<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" onclick="saveTaskLink()">'+I.link+tr("Attach link")+'</button>'); }
function saveTaskLink(){ if(!require(["atl_url"]))return; var url=normalizedAttachUrl(val("atl_url")); if(!url)return toast(tr("Use a valid HTTPS link"),"bad"); var name=val("atl_name").trim(); if(!name){try{name=new URL(url).hostname;}catch(_){name=tr("External link");}} var tk=task(S.drawerTask); closeModal(); editTaskWith(tk,function(t){t.files.push(F(name,"document","link","Link",0,url));log(t,"file",{name:name});}).then(function(saved){if(saved===false)return false;toast(tr("Link attached"));if(!tk._draft)notifyTask("file",tk);}); }
function attachAssetModal(){ openModal("Attach from asset library",'<div class="agenda">'+ASSETS.map(function(a){ return '<div class="row" onclick="attachAsset(\''+a.id+'\')"><span class="ficon" style="background:'+attr(a.color)+'">'+typeExt(a)+'</span><div style="min-width:0"><div class="t">'+esc(a.name)+'</div><div class="m">'+srcBadge(srcOf(a))+' <span>'+esc(a.size)+'</span>'+(a.brand?' <span class="badge">brand</span>':'')+'</div></div><span class="btn xs">Attach</span></div>'; }).join("")+'</div>',null,true); }
function attachAsset(id){ var a=asset(id); var tk=task(S.drawerTask); closeModal(); editTaskWith(tk,function(t){ t.files.push(F(a.name,a.type==="image"||a.type==="logo"||a.type==="icon"?"image":a.type,a.source,a.size,0,a.url,{preview:a.img||null,driveId:a.driveId||null})); log(t,"file",{name:a.name}); }).then(function(saved){ if(saved===false)return false; toast("Attached "+a.name); }); }

/* ---- comments (threads, replies, mentions, attachments) ---- */
function commentsView(tk){ var vis=person(ME).stakeholder?"client":S.commentVis; var list=tk.comments.filter(function(c){ return vis==="internal"?true:c.vis==="client"; }); var roots=list.filter(function(c){ return !c.parent||!byId(list,c.parent); }).sort(function(a,b){ return b.ago-a.ago; });
  var one=function(c,isReply){ return '<div class="cmt '+c.vis+(isReply?" reply":"")+'" data-cid="'+attr(c.id||"")+'">'+av(c.by)+'<div><div class="who"><b>'+esc(person(c.by).name)+'</b>'+(typeof revisionTagHtml==="function"?revisionTagHtml(tk,c):'')+''+(person(c.by).stakeholder?'<span class="badge client">stakeholder</span>':'')+(c.vis==="internal"?'<span class="badge">'+I.lock+'internal</span>':'<span class="badge">'+I.eye+'visible</span>')+'<span class="when">'+ago(c.ago,c.createdAt)+'</span></div><div class="body">'+(typeof cmtMentionsHtml==="function"?cmtMentionsHtml(richLinkText(c.text||"",{})):richLinkText(c.text||"",{mentions:true}))+'</div>'+commentAttachmentsHtml(c)+'<div class="acts"><button onclick="S.replyTo=\''+c.id+'\';renderDrawer();setTimeout(function(){var e=document.getElementById(\'cmtText\');if(e)e.focus()},50)">Reply</button>'+(c.by===ME?'<button onclick="deleteComment(\''+c.id+'\')">Delete</button>':'')+'</div></div></div>'; };
  var h=(person(ME).stakeholder?'':'<div class="cvis"><button class="'+(S.commentVis==="internal"?"on":"")+'" onclick="S.commentVis=\'internal\';renderDrawer()">'+I.lock+'Internal</button><button class="'+(S.commentVis==="client"?"on":"")+'" onclick="S.commentVis=\'client\';renderDrawer()">'+I.eye+'Stakeholder-visible</button></div><div class="hint" style="margin:-6px 0 12px">'+tr(S.commentVis==="internal"?"Internal comments are only visible to the creative team.":"Stakeholder-visible comments can be seen by requesters like Marketing.")+'</div>');
  h+='<div class="cmts">'+(roots.length?roots.map(function(c){ return one(c,false)+list.filter(function(r){ return r.parent===c.id; }).sort(function(a,b){ return b.ago-a.ago; }).map(function(r){ return one(r,true); }).join(""); }).join(""):'<div class="empty" style="padding:20px"><div class="h">No comments yet</div></div>')+'</div>';
  var rt=S.replyTo?byId(tk.comments,S.replyTo):null; window._cmtAtt=window._cmtAtt||[];
  var audience=vis==="internal"?tr("Internal"):tr("Stakeholder-visible"),postHint=audience+" · "+shortcutCombo("Enter");
  return h+'<div class="composer">'+(rt?'<div class="hint">Replying to <b>'+esc(person(rt.by).name)+'</b> <button class="btn xs ghost" onclick="S.replyTo=null;renderDrawer()">'+I.x+'</button></div>':'')+'<textarea id="cmtText" placeholder="'+attr(tr("Write a comment… type @ to mention someone"))+'" oninput="window._cmtDraft=this.value" onkeydown="if((event.metaKey||event.ctrlKey)&&event.key===\'Enter\')postComment()">'+esc(window._cmtDraft||"")+'</textarea>'+(window._cmtAtt.length?'<div>'+window._cmtAtt.map(function(a,i){ return '<span class="att'+(a.preview?" att-img":"")+'">'+(a.preview?'<img src="'+attr(a.preview)+'" alt="">':(a.url&&typeof isGoogleLink==="function"&&isGoogleLink(a.url)&&typeof driveIcon==="function"?driveIcon():I.link))+esc(a.name)+' <button onclick="window._cmtAtt.splice('+i+',1);renderDrawer()">×</button></span>'; }).join("")+'</div>':'')+(typeof cmtToolbarHtml==="function"?cmtToolbarHtml():'')+'<div class="bar">'+av(ME)+'<span class="hint">'+esc(postHint)+' · '+esc(shortcutCombo("V"))+' '+tr("pastes an image")+'</span>'+(typeof cmtToolbarHtml==="function"?'':'<button class="btn xs ghost" onclick="attachToComment()">'+I.link+'Attach</button>')+'<span class="spacer"></span>'+(typeof cmtMentionButton==="function"?'<button type="button" class="iconbtn flat cmt-at" title="'+attr(tr("Mention"))+'" aria-label="'+attr(tr("Mention"))+'" onclick="cmtMentionButton()"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/></svg></button>':'')+'<button class="btn primary sm" onclick="postComment()">Post</button></div></div>'; }
function attachToComment(){ var inp=document.getElementById("fileInput"); inp.accept="*/*"; inp.multiple=true; inp.onchange=function(){ var files=Array.prototype.slice.call(inp.files||[]); inp.value=""; inp.multiple=false; if (!files.length) return; var room=10-(window._cmtAtt||[]).length; if(files.length>room){ toast(tr("Up to 10 attachments per comment"),"bad"); files=files.slice(0,Math.max(0,room)); }
  files.forEach(function(f){ var isImg=/^image\/(png|jpe?g|webp|gif)$/i.test(f.type); var done=function(a){ window._cmtAtt.push(a); cmtRedraw(); };
    if(isImg) shrinkImage(f,1600,1600,function(u){ done({name:f.name,size:(f.size/1048576).toFixed(1)+" MB",preview:u,type:"image"}); },function(){ toast(tr("Could not read")+" "+f.name,"bad"); });
    else uploadAny(f,{forceDrive:true}).then(function(u){ done({name:f.name,size:u.size,url:u.url,driveId:u.driveId||null,type:u.type}); }).catch(function(e){ toast(f.name+": "+e.message,"bad"); }); }); }; inp.click(); }
/* An attachment arriving redraws the comment box with what is in it now — not what was there when the
   upload started — and someone typing keeps typing: same focus, same caret. */
function cmtRedraw(){ var ta=document.getElementById("cmtText"), had=!!ta&&document.activeElement===ta, a=ta?ta.selectionStart:0, b=ta?ta.selectionEnd:0, top=ta?ta.scrollTop:0; if(ta) window._cmtDraft=ta.value; renderDrawer(); var n=document.getElementById("cmtText"); if(had&&n){ n.focus(); try{ n.setSelectionRange(a,b); }catch(x){} n.scrollTop=top; } }
function postComment(){ var el=document.getElementById("cmtText");
  /* links shown by their name while writing are stored as [name](url) (src/link-tab.js) */
  var txt=(typeof linkTokensExpand==="function"?linkTokensExpand(el.value,window._cmtLinks):el.value).trim();
  window._cmtDraft=""; if (!txt&&!(window._cmtAtt||[]).length){ el.focus(); return; } var tk=task(S.drawerTask); var vis=person(ME).stakeholder?"client":S.commentVis; var att=window._cmtAtt||[]; window._cmtAtt=[]; window._cmtLinks=[]; var parent=S.replyTo, replyOf=parent; S.replyTo=null; for(var hop=0;parent&&hop<20;hop++){ var pc=byId(tk.comments,parent); if(!pc||!pc.parent) break; parent=pc.parent; }
  var snap=clone(tk); var c=C(ME,0,vis,txt,parent); c.attachments=att; tk.comments.push(c); log(tk,"comment");
  /* What is attached here is filed under Assets & versions too — but only what is an asset (see
     src/comment-attach.js): a link to a reference page stays on the comment. */
  var own=API.on&&!canI.editTask(tk); var filed=own?[]:typeof cmtAssetsFrom==="function"?cmtFileAssets(tk,cmtAssetsFrom(att,txt)):(att.forEach(function(a){ if(a.preview||a.url) tk.files.push(F(a.name,a.type||(a.preview?"image":"other"),a.driveId?"gdrive":"local",a.size,0,a.url||"",{preview:a.preview||null,driveId:a.driveId||null})); }),[]); refresh();
  (API.on?(own?apiFetch("POST","/api/tasks/"+tk.id+"/comments",{id:c.id,text:txt,vis:vis,parent:parent,attachments:att}):apiFetch("PUT","/api/tasks/"+tk.id,dTask(tk))).then(function(d){ replaceInto(tk,hTask(d)); refresh(); }):Promise.resolve()).then(function(saved){ if(saved===false)return false; toast("Comment posted"); if(filed.length&&typeof cmtNameFiledLinks==="function") cmtNameFiledLinks(tk,filed); var mentions=[]; if(typeof cmtMentionIds==="function"){ mentions=cmtMentionIds(txt); cmtMentionsReset(); } else (txt.match(/@(\w+)/g)||[]).forEach(function(m){ var id=m.slice(1).toLowerCase(); if (PEOPLE[id]) mentions.push(id); }); if (mentions.length) notify("mention",mentions,tk.id); var others=taskPeople(tk).concat([replyOf?(byId(tk.comments,replyOf)||{}).by:null]).filter(function(x,i,a){ return x&&a.indexOf(x)===i&&mentions.indexOf(x)<0; }); notify("comment",others,tk.id); }).catch(function(e){ replaceInto(tk,snap); window._cmtDraft=txt; window._cmtAtt=att; refresh(); var box=document.getElementById("cmtText"); if(box&&!box.value) box.value=txt; fail(e,"Couldn't post comment. "+e.message); }); }
function deleteComment(id){ var tk=task(S.drawerTask); editTaskWith(tk,function(t){ t.comments=t.comments.filter(function(c){ return c.id!==id; }).map(function(c){ if(c.parent===id) c.parent=null; return c; }); }); }
function activityView(tk){ return '<div class="tl">'+tk.activity.slice().sort(function(a,b){ return a.ago-b.ago; }).map(function(a){ var args={who:first(a.who),from:a.a.from?stageName(a.a.from):"",to:a.a.to?(a.k==="team"?teamName(a.a.to):a.k==="assigned"?(PEOPLE[a.a.to]?first(a.a.to):a.a.to):stageName(a.a.to)):"",v:a.a.v,name:a.a.name,what:a.a.what}; return '<div class="it'+(a.k==="approved"||a.k==="revision"?" hi":"")+(a.k==="restored"?" restored":"")+'"><i></i><div>'+activityLine(a.k,args)+'</div><div class="when">'+ago(a.ago,a.createdAt)+'</div>'+restoreButtonHtml("task",tk.id,a)+'</div>'; }).join("")+'</div>'; }
Object.assign(UI_ID,{"Field":"Kolom","Task panel position":"Posisi panel task","Open external link":"Buka tautan eksternal","This opens in a new tab outside ZenCrevia. Only open links you trust.":"Tautan ini dibuka di tab baru di luar ZenCrevia. Buka hanya tautan yang kamu percaya.","Hide":"Sembunyikan","A structured brief is optional — use one of these, or keep the brief in the description above.":"Brief terstruktur bersifat opsional — pakai salah satu template ini, atau tulis brief di deskripsi di atas.","Attach a working file, a Google Drive link or any HTTPS link. Reference images go in the description.":"Lampirkan file kerja, tautan Google Drive, atau tautan HTTPS lain. Gambar referensi bisa dimasukkan ke deskripsi.","More details":"Detail lainnya","No dependencies yet.":"Belum ada dependensi.","This task is ready to start.":"Task ini siap dimulai.","Add dependency":"Tambah dependensi","Add context not covered by the brief…":"Tambahkan konteks yang belum tercakup di brief…","Type to see the formatting. Formatted text you paste keeps its formatting.":"Tulis langsung untuk melihat format. Paste teks berformat akan dipertahankan.","No description yet.":"Belum ada deskripsi.","Use this for additional context, constraints, or notes.":"Gunakan untuk konteks tambahan, batasan, atau catatan.","Edit date":"Ubah tanggal","Workflow stage":"Tahap workflow","deliverables":"deliverable","Attach link":"Lampirkan tautan","Attach any trusted HTTPS link. It stays connected to this task and appears with the other files and references.":"Lampirkan tautan HTTPS tepercaya. Tautan tetap terhubung ke task ini dan tampil bersama file serta referensi lainnya.","Display name":"Nama tampilan","e.g. Campaign reference":"mis. Referensi campaign","Use a valid HTTPS link":"Gunakan tautan HTTPS yang valid","External link":"Tautan eksternal","Link attached":"Tautan dilampirkan","Upload a working file, link one from Google Drive, or attach any HTTPS link.":"Unggah file kerja, tautkan dari Google Drive, atau lampirkan tautan HTTPS lain."});
</script>

<script>
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"Select project later":"Pilih proyek nanti","Not in any project for now":"Belum masuk proyek mana pun","A task can be in up to 5 projects":"Satu task bisa masuk maksimal 5 proyek","Delete project?":"Hapus proyek?","This deletes the project and its tasks:":"Proyek ini dihapus beserta task-nya:","tasks that are also in another project stay there.":"task yang juga ada di proyek lain tetap di sana."});
</script>
