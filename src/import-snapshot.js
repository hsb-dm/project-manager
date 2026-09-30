<script>
/* IMPORT A JSON SNAPSHOT — Settings → Backup & data → Import / Export (admins, server mode).
   The whole snapshot or any part of it: the workspace look, the workflow and fields, AI settings
   and presets, projects and tasks, knowledge, assets, saved views, teams and members.

   The browser does the conversion. It shifts the snapshot's dates (stored as days from the day it
   was exported) to today, exactly as the demo loader does, and turns each item into the server's
   shape with the same dTask / dProject / … the page uses for every ordinary save. The server then
   previews what would change and, when asked, applies it after an automatic safety backup.
   Nothing is ever deleted, and existing items are skipped unless the admin chooses to update them. */
var IMP = { name: "", source: null, payload: null, preview: null, sections: [], conflict: "skip", confirmNoBackup: false, timer: null, seq: 0 };
var IMP_SECTIONS = [
  ["identity", "Workspace identity & appearance", "settings"],
  ["workflow", "Workflow, fields & brief templates", "settings"],
  ["ai", "AI settings & presets", "settings"],
  ["projects", "Projects, tasks & requests", "content"],
  ["knowledge", "Knowledge base", "content"],
  ["assets", "Asset library", "content"],
  ["views", "Saved views", "content"],
  ["people", "Teams & members", "content"]
];
function importSnapshotPick(){
  var inp=document.getElementById("fileInput"); inp.accept=".json,application/json"; inp.multiple=false;
  inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if(!f) return;
    if(f.size>11*1048576) return toast(tr("That snapshot is larger than the server accepts in one import (about 11 MB)."),"bad");
    var rd=new FileReader();
    rd.onload=function(){ var d; try{ d=JSON.parse(rd.result); }catch(e){ return toast(tr("That file is not valid JSON."),"bad"); }
      try{ IMP.payload=impPrepare(d); }catch(e){ return toast(e.message,"bad"); }
      IMP.name=f.name; IMP.source={ exportedAt:d.exportedAt||"", version:d.version||0, workspace:(d.ws&&d.ws.name)||"" };
      IMP.sections=impAvailable(IMP.payload); IMP.conflict="skip"; IMP.confirmNoBackup=false; IMP.preview=null;
      if(!IMP.sections.length) return toast(tr("That snapshot has nothing this workspace can import."),"bad");
      impOpen(); impRefresh(); };
    rd.onerror=function(){ toast(tr("Could not read that file."),"bad"); };
    rd.readAsText(f); };
  inp.click();
}
/* Snapshot (page shape, dates as offsets from its export day) → server shape, dated from today. */
function impPrepare(d){
  if(!d||typeof d!=="object"||!d.ws||!Array.isArray(d.tasks)||!Array.isArray(d.projects)) throw new Error(tr("That file is not a ZenCrevia snapshot."));
  var shift=offsetFromIso(d.baseDate||(d.exportedAt?String(d.exportedAt).slice(0,10):iso(0)));
  var arr=function(v){ return Array.isArray(v)?v:[]; };
  var tasks=arr(d.tasks).map(function(t0){ var t=clone(t0); ["versions","files","comments","activity","tags","labels","dependencies"].forEach(function(k){ if(!Array.isArray(t[k])) t[k]=[]; }); t.due=(+t.due||0)+shift; t.span=+t.span||1; return dTask(t); });
  var projects=arr(d.projects).map(function(p0){ var p=clone(p0); p.start=(+p.start||0)+shift; p.due=(+p.due||0)+shift; p.milestones=arr(p.milestones).map(function(m){ m=clone(m); m.due=(+m.due||0)+shift; return m; }); return dProject(p); });
  var requests=arr(d.requests).map(function(r0){ var r=clone(r0); if(r.deadline!=null) r.deadline=(+r.deadline||0)+shift; return dRequest(r); });
  var people=d.people&&typeof d.people==="object"?Object.keys(d.people).map(function(id){ return Object.assign({id:id},d.people[id]); }):[];
  return {
    ws:clone(d.ws), teams:arr(d.teams), people:people, projects:projects, tasks:tasks, requests:requests,
    folders:arr(d.folders), assets:arr(d.assets).map(function(a){ return dAsset(clone(a)); }),
    pages:arr(d.knowledge).map(function(k){ return dPage(clone(k)); }), knowledgeFolders:arr(d.knowledgeFolders), views:arr(d.views)
  };
}
/* Offer only the parts the file actually contains. */
function impAvailable(p){
  var ws=p.ws||{}, has={
    identity:!!ws.name, workflow:!!((ws.workflow||[]).length||(ws.customFields||[]).length), ai:!!(ws.ai&&Object.keys(ws.ai).length),
    projects:!!(p.projects.length||p.tasks.length||p.requests.length), knowledge:!!p.pages.length, assets:!!(p.assets.length||p.folders.length),
    views:!!p.views.length, people:!!(p.people.length||p.teams.length) };
  return IMP_SECTIONS.map(function(s){ return s[0]; }).filter(function(k){ return has[k]&&(k!=="people"||canI.manageMembers()); });
}
function impBody(){ return { sections:IMP.sections, conflict:IMP.conflict, confirmNoBackup:IMP.confirmNoBackup, source:IMP.source, data:IMP.payload }; }
/* Every change of choice asks the server again; only the latest answer is drawn. */
function impRefresh(){
  clearTimeout(IMP.timer);
  IMP.timer=setTimeout(function(){
    var mine=++IMP.seq;
    if(!IMP.sections.length){ IMP.preview=null; return impDraw(); }
    impDraw(true);
    apiFetch("POST","/api/admin/import/preview",impBody()).then(function(r){ if(mine!==IMP.seq) return; IMP.preview=r; IMP.error=""; impDraw(); },
      function(e){ if(mine!==IMP.seq) return; IMP.preview=null; IMP.error=e.message; impDraw(); });
  },120);
}
function impCount(o){ if(!o) return ""; var bits=[]; if(o.added) bits.push(o.added+" "+tr("new")); if(o.updated) bits.push(o.updated+" "+tr("updated")); if(o.skipped) bits.push(o.skipped+" "+tr("already here, skipped")); return bits.join(" · ")||tr("nothing to change"); }
function impSummary(key){
  var s=IMP.preview&&IMP.preview.sections&&IMP.preview.sections[key]; if(!s) return "";
  if(key==="identity") return s.changes.length?s.changes.length+" "+tr("settings change"):tr("already the same");
  if(key==="ai") return s.changes.length?s.changes.length+" "+tr("settings change"):tr("already the same");
  if(key==="workflow") return tr("Stages")+": "+impCount(s.stages)+(s.stages.kept?" · "+s.stages.kept+" "+tr("kept"):"")+" — "+tr("Custom fields")+": "+impCount(s.customFields);
  if(key==="projects") return tr("Tasks")+": "+impCount(s.tasks)+" — "+tr("Projects")+": "+impCount(s.projects);
  if(key==="knowledge") return tr("Pages")+": "+impCount(s.pages);
  if(key==="assets") return tr("Assets")+": "+impCount(s.assets);
  if(key==="views") return impCount(s.views);
  if(key==="people") return tr("Teams")+": "+impCount(s.teams)+" — "+tr("Members")+": "+s.members.added+" "+tr("new")+(s.members.existing?" · "+s.members.existing+" "+tr("already here"):"");
  return "";
}
function impOpen(){ openModal("Import a snapshot",'<div id="impBody"></div>','<span class="spacer"></span><button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" id="impGo" onclick="impApply()">'+tr("Import")+'</button>',true); impDraw(); }
function impDraw(loading){
  var el=document.getElementById("impBody"); if(!el) return;
  var avail=impAvailable(IMP.payload), pv=IMP.preview, src=IMP.source||{}, h="";
  h+='<p class="hint" style="margin-bottom:10px">'+esc(IMP.name)+(src.workspace?' · '+esc(src.workspace):'')+(src.exportedAt?' · '+tr("exported")+' '+esc(String(src.exportedAt).slice(0,10)):'')+'</p>';
  h+='<div class="imp-quick"><span class="hint">'+tr("Choose")+':</span>'
    + '<button type="button" class="btn sm ghost" onclick="impPreset(\'all\')">'+tr("Everything")+'</button>'
    + '<button type="button" class="btn sm ghost" onclick="impPreset(\'settings\')">'+tr("Settings only")+'</button>'
    + '<button type="button" class="btn sm ghost" onclick="impPreset(\'ai\')">'+tr("AI settings only")+'</button></div>';
  h+='<div class="imp-list">'+IMP_SECTIONS.filter(function(s){ return avail.indexOf(s[0])>=0; }).map(function(s){ var on=IMP.sections.indexOf(s[0])>=0;
    return '<label class="imp-row'+(on?" on":"")+'"><input type="checkbox" data-imp="'+s[0]+'"'+(on?" checked":"")+' onchange="impToggle(\''+s[0]+'\',this.checked)"><span><b>'+tr(s[1])+'</b><span class="hint">'+(on?(loading&&!pv?tr("Checking…"):esc(impSummary(s[0]))):tr("Not imported"))+'</span></span></label>'; }).join("")+'</div>';
  h+='<div class="field" style="margin-top:12px"><label>'+tr("When an item already exists here")+'</label>'
    + '<label class="imp-radio"><input type="radio" name="impConflict" value="skip"'+(IMP.conflict==="skip"?" checked":"")+' onchange="impSetConflict(\'skip\')"> '+tr("Keep what is here and skip it — safe")+'</label>'
    + '<label class="imp-radio"><input type="radio" name="impConflict" value="update"'+(IMP.conflict==="update"?" checked":"")+' onchange="impSetConflict(\'update\')"> '+tr("Replace it with the snapshot's version")+'</label>'
    + '<div class="hint">'+tr("Items are matched by id. A snapshot from another workspace can reuse ids such as T-101 for different work, so replacing is only right when restoring this workspace.")+'</div></div>';
  if(IMP.error) h+='<div class="errbox" style="margin:10px 0">'+esc(IMP.error)+'</div>';
  if(pv&&pv.warnings&&pv.warnings.length) h+='<div class="banner warn" style="margin:10px 0;display:block"><b>'+tr("Check before importing")+'</b><ul style="margin:6px 0 0 18px">'+pv.warnings.map(function(w){ return '<li>'+esc(w)+'</li>'; }).join("")+'</ul></div>';
  if(pv&&pv.backup) h+=pv.backup.available
    ? '<p class="hint" style="margin-top:10px">'+I.lock+' '+tr("An encrypted safety backup is taken first, so this import can be undone from Backup history.")+'</p>'
    : '<div class="banner warn" style="margin-top:10px;display:block">'+tr("Backups are not configured, so no safety copy can be taken first.")+'<label class="imp-radio" style="margin-top:6px"><input type="checkbox" id="impNoBackup"'+(IMP.confirmNoBackup?" checked":"")+' onchange="IMP.confirmNoBackup=this.checked;impDraw()"> '+tr("I understand — import without a safety copy")+'</label></div>';
  h+='<details style="margin-top:10px"><summary class="hint">'+tr("Never imported")+'</summary><ul class="hint" style="margin:6px 0 0 18px">'+((pv&&pv.never)||[]).map(function(x){ return '<li>'+esc(tr(x))+'</li>'; }).join("")+'</ul><p class="hint">'+tr("Nothing here is deleted by an import. To replace the whole workspace, restore an encrypted backup instead.")+'</p></details>';
  el.innerHTML=h;
  var go=document.getElementById("impGo"); if(go) go.disabled=!IMP.sections.length||!pv||!!IMP.error||(pv.backup&&!pv.backup.available&&!IMP.confirmNoBackup);
}
function impToggle(k,on){ var i=IMP.sections.indexOf(k); if(on&&i<0) IMP.sections.push(k); if(!on&&i>=0) IMP.sections.splice(i,1); impRefresh(); }
function impSetConflict(c){ IMP.conflict=c==="update"?"update":"skip"; impRefresh(); }
function impPreset(which){
  var avail=impAvailable(IMP.payload);
  IMP.sections=avail.filter(function(k){ if(which==="all") return true; if(which==="ai") return k==="ai"; var s=IMP_SECTIONS.filter(function(x){ return x[0]===k; })[0]; return s&&s[2]==="settings"; });
  if(!IMP.sections.length) toast(tr("That part is not in this snapshot."),"bad");
  impRefresh();
}
function impApply(){
  var go=document.getElementById("impGo"); if(go){ go.disabled=true; go.textContent=tr("Importing…"); }
  apiFetch("POST","/api/admin/import",impBody()).then(function(r){
    /* impSummary reads IMP.preview; the apply returns the same shape, with the numbers it applied */
    IMP.preview=r;
    var lines=Object.keys(r.sections||{}).map(function(k){ var s=IMP_SECTIONS.filter(function(x){ return x[0]===k; })[0]; return '<li><b>'+tr(s?s[1]:k)+'</b> — '+esc(impSummary(k))+'</li>'; });
    openModal("Import finished",'<p>'+tr("The snapshot was imported.")+(r.backup?' '+tr("A safety backup was taken first")+' (<span class="mono">'+esc(r.backup.name)+'</span>).':'')+'</p><ul style="margin:8px 0 0 18px">'+lines.join("")+'</ul>'
      + ((r.warnings||[]).length?'<ul class="hint" style="margin:8px 0 0 18px">'+r.warnings.map(function(w){ return '<li>'+esc(w)+'</li>'; }).join("")+'</ul>':'')
      + '<p class="hint" style="margin-top:10px">'+tr("Reload to see everything that arrived.")+'</p>',
      '<span class="spacer"></span><button class="btn primary" onclick="location.reload()">'+tr("Reload now")+'</button>');
  },function(e){ toast(e.message,"bad"); var g=document.getElementById("impGo"); if(g){ g.disabled=false; g.textContent=tr("Import"); } });
}
</script>
