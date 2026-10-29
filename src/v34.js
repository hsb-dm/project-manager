<script>
/* ZenCrevia v34 — concurrent task edits.
   Every task the client receives from the server is remembered in its normalised form.
   When a task is saved, the PUT carries the revision it was loaded at (_rev) and the list of
   top-level fields this user actually changed (_changed). If a colleague saved in between,
   the server applies only these fields on top of the latest version (see server PUT).
   Oct 2026: what the server sent is kept as it came (raw) — hTask copies it and never changes it — and the
   normalised form a save is compared with is made from it the first time that task is saved, then kept. Making it
   for every task as it arrived took two more hydrations and two more copies of each, most of a 740 ms boot task
   with 1,500 tasks, for tasks that are mostly never saved. */
var ZC_BASE={};
/* Requests of this tab's own about a task, still on their way (src/v34.js live board waits for them) */
var ZC_TASK_BUSY={n:{},w:{}};
function zcTaskBusy(id,d){
  if(d>0){ ZC_TASK_BUSY.n[id]=(ZC_TASK_BUSY.n[id]||0)+1; return; }
  /* after what the answer starts (the caller's own .then, a fetch it makes next) has run */
  setTimeout(function(){ var n=(ZC_TASK_BUSY.n[id]||0)-1; if(n>0){ ZC_TASK_BUSY.n[id]=n; return; } delete ZC_TASK_BUSY.n[id]; var w=ZC_TASK_BUSY.w[id]||[]; delete ZC_TASK_BUSY.w[id]; w.forEach(function(f){ f(); }); },0); }
/* resolves once no request of this tab's about the task is on its way, or after ms */
function zcTaskIdle(id,ms){ return new Promise(function(res){ var done=false, t=setTimeout(fin,ms);
  function fin(){ if(done) return; done=true; clearTimeout(t); res(); }
  function check(){ if(done) return; if(!ZC_TASK_BUSY.n[id]) return fin(); (ZC_TASK_BUSY.w[id]=ZC_TASK_BUSY.w[id]||[]).push(check); }
  check(); }); }
(function(){
  if (typeof hTask!=="function"||typeof dTask!=="function") return;
  var baseH=hTask;
  hTask=function(d){ var t=baseH.apply(this,arguments); if(d&&d.id) ZC_BASE[d.id]={rev:d.updatedAt||null,raw:d,body:null}; return t; };
  /* the task as it was loaded, in the form a save sends: made once, from what the server sent */
  function baseBody(b){ if(!b.body&&b.raw){ try{ b.body=JSON.parse(JSON.stringify(dTask(baseH(b.raw)))); b.raw=null; }catch(e){ return null; } } return b.body; }
  var baseF=apiFetch;
  apiFetch=function(method,path,body){
    var m=method==="PUT"&&/^\/api\/tasks\/([^\/?]+)$/.exec(path||"");
    if (m&&body&&typeof body==="object"){
      var b=ZC_BASE[decodeURIComponent(m[1])], bb=b&&b.rev?baseBody(b):null;
      if (bb){ var changed=[]; Object.keys(body).forEach(function(k){ if (k.charAt(0)==="_") return; if (JSON.stringify(body[k])!==JSON.stringify(bb[k])) changed.push(k); });
        body=Object.assign({},body,{_rev:b.rev,_changed:changed}); }
    }
    var own=/^\/api\/tasks\/([^\/?]+)/.exec(path||""), oid=null; if(own){ try{ oid=decodeURIComponent(own[1]); }catch(e){} }
    if(oid) zcTaskBusy(oid,1);
    return baseF.call(this,method,path,body).then(function(d){
      if(oid) zcTaskBusy(oid,-1);
      if (m&&d&&Array.isArray(d._merged)){
        toast(tr("Someone else edited this task at the same time. Both changes were kept."));
      }
      return d;
    },function(e){ if(oid) zcTaskBusy(oid,-1); throw e; });
  };
})();
Object.assign(UI_ID,{"Someone else edited this task at the same time. Both changes were kept.":"Orang lain mengedit task ini bersamaan. Kedua perubahan tetap tersimpan.",
  "Someone else changed this task while you were editing. Reload it and try again.":"Orang lain mengubah task ini saat kamu mengedit. Muat ulang lalu coba lagi.",
  "Only the reviewer, the requester, a team lead or an admin can move this task out of":"Hanya reviewer, requester, lead tim, atau admin yang bisa memindahkan task ini keluar dari"});
</script>
<script>
/* ---------- v34 live board ----------
   The server announces {type:"task_changed", id, updatedAt, by, deleted} after every task
   write. Fetch just that task (batched), so boards, calendars and open drawers stay current.
   Oct 2026: the tasks of one batch are fetched together and drawn once, when all have answered (it was one redraw
   per task). The server tells this tab of its own saves too: while a request of this tab's about the task is on its
   way, the event waits for it (at most 4 s), and a task already at that revision, or fetched unchanged, is neither
   fetched nor drawn again. A hidden tab is drawn once when it is shown (requestRefresh, src/core.js). */
(function(){
  var pending={}, timer=null;
  function flush(){
    timer=null; var ids=Object.keys(pending); var evs=pending; pending={}; var need="";
    var more=function(s){ if(s==="all"||!need) need=s||need; };
    Promise.all(ids.map(function(id){
      var ev=evs[id], cur=TASKS.filter(function(x){ return x.id===id&&!x._creating; })[0];   /* one being created carries a proposed number, not this task */
      if (ev.deleted){ if (cur){ var i=TASKS.indexOf(cur); if (i>=0) TASKS.splice(i,1); if (S.drawerTask===id&&typeof closeDrawer==="function"){ closeDrawer(); toast(ev.by===ME?tr("This task was deleted"):tr("This task was deleted by")+" "+((person(ev.by)||{}).name||tr("a colleague"))); } more("all"); } return null; }
      return zcTaskIdle(id,4000).then(function(){
        var cur=TASKS.filter(function(x){ return x.id===id&&!x._creating; })[0];
        if (cur&&cur.updatedAt&&ev.updatedAt&&cur.updatedAt>=ev.updatedAt) return; /* already have it (our own save) */
        return apiFetch("GET","/api/tasks/"+encodeURIComponent(id)).then(function(d){
          var t=hTask(d), now=TASKS.filter(function(x){ return x.id===id&&!x._creating; })[0];
          if (now){ if (now._draft) return; more(taskRedrawNeed(now,t)); replaceInto(now,t); } else { TASKS.push(t); more("all"); }
          /* who changed it, when it was a colleague; one's own change from another tab or device is only drawn */
          if (S.drawerTask===id&&ev.by!==ME) toast(tr("Updated by")+" "+((person(ev.by)||{}).name||tr("a colleague")));
        }).catch(function(){});
      });
    })).then(function(){ if (!need) return; AN=null; liveRefresh(need); });
  }
  /* a colleague's change: drawn again without losing the reader's place (src/live-redraw.js) */
  function liveRefresh(need){ requestRefresh({bg:true,drawer:need==="drawer"}); }
  function onEvent(e){ var ev; try{ ev=JSON.parse(e.data); }catch(x){ return; } if (!ev||ev.type!=="task_changed"||!API.on) return; pending[ev.id]=ev; if (!timer) timer=setTimeout(flush,250); }
  var ES=window.EventSource; if (typeof ES!=="function") return;
  window.EventSource=function(u,o){ var es=new ES(u,o); es.addEventListener("message",onEvent); return es; };
  window.EventSource.prototype=ES.prototype; ["CONNECTING","OPEN","CLOSED"].forEach(function(k){ window.EventSource[k]=ES[k]; });
})();
Object.assign(UI_ID,{"Updated by":"Diperbarui oleh","This task was deleted by":"Task ini dihapus oleh","This task was deleted":"Task ini dihapus","a colleague":"rekan kerja"});
</script>
<script>
/* ---------- v34 bulk status respects stage rules ----------
   Bulk "move to" used to report "{n} tasks moved" and then show one error per task the
   server refused. Tasks that may not move are now skipped up front and counted. */
(function(){
  if (typeof bulkStatus!=="function"||typeof bulkApply!=="function"||typeof zcStageBlock!=="function") return;
  window.zcBulkStatus=function(sid){
    var st=zcStage(sid)||{name:sid}, ids=bulkIds(), ok=0, blocked=0;
    ids.forEach(function(id){ var t=task(id); if(!t||!canI.editTask(t)) return; if (zcStageBlock(t,sid)) blocked++; else ok++; });
    if (!ok){ return toast(tr("None of the selected tasks can be moved to")+" "+st.name+": "+tr("they need a reviewer, or a reviewer's decision."),"bad"); }
    var label=ok+" "+tr(ok===1?"task moved to":"tasks moved to")+" "+st.name+(blocked?" · "+blocked+" "+tr("not moved (reviewer rule)"):"");
    bulkApply(label,function(t){ if(!zcStageBlock(t,sid)) t.status=sid; });
  };
  bulkStatus=function(a){ ctxMenu(a,'<div class="mh">'+tr("Status")+'</div>'+localStages().map(function(s){ return '<button onclick="closePops();zcBulkStatus('+jsq(s.id)+')">'+statusBadge(s.id)+'</button>'; }).join(""),"left"); };
  Object.assign(UI_ID,{"None of the selected tasks can be moved to":"Tidak ada task terpilih yang bisa dipindahkan ke","they need a reviewer, or a reviewer's decision.":"task tersebut butuh reviewer, atau keputusan reviewer.","task moved to":"task dipindahkan ke","tasks moved to":"task dipindahkan ke","not moved (reviewer rule)":"tidak dipindahkan (aturan reviewer)"});
})();
</script>
