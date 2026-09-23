<script>
/* ZenCrevia v34 — concurrent task edits.
   Every task the client receives from the server is remembered in its normalised form.
   When a task is saved, the PUT carries the revision it was loaded at (_rev) and the list of
   top-level fields this user actually changed (_changed). If a colleague saved in between,
   the server applies only these fields on top of the latest version (see server PUT). */
var ZC_BASE={};
(function(){
  if (typeof hTask!=="function"||typeof dTask!=="function") return;
  var baseH=hTask;
  hTask=function(d){ var t=baseH.apply(this,arguments); try{ if(d&&d.id) ZC_BASE[d.id]={rev:d.updatedAt||null,body:JSON.parse(JSON.stringify(dTask(baseH(d))))}; }catch(e){} return t; };
  var baseF=apiFetch;
  apiFetch=function(method,path,body){
    var m=method==="PUT"&&/^\/api\/tasks\/([^\/?]+)$/.exec(path||"");
    if (m&&body&&typeof body==="object"){
      var b=ZC_BASE[decodeURIComponent(m[1])];
      if (b&&b.rev){ var changed=[]; Object.keys(body).forEach(function(k){ if (k.charAt(0)==="_") return; if (JSON.stringify(body[k])!==JSON.stringify(b.body[k])) changed.push(k); });
        body=Object.assign({},body,{_rev:b.rev,_changed:changed}); }
    }
    return baseF.call(this,method,path,body).then(function(d){
      if (m&&d&&Array.isArray(d._merged)){
        toast(tr("Someone else edited this task at the same time. Both changes were kept."));
      }
      return d;
    });
  };
})();
Object.assign(UI_ID,{"Someone else edited this task at the same time. Both changes were kept.":"Orang lain mengedit task ini bersamaan. Kedua perubahan tetap tersimpan.",
  "Someone else changed this task while you were editing. Reload it and try again.":"Orang lain mengubah task ini saat kamu mengedit. Muat ulang lalu coba lagi.",
  "Only the reviewer, the requester, a team lead or an admin can move this task out of":"Hanya reviewer, requester, lead tim, atau admin yang bisa memindahkan task ini keluar dari"});
</script>
<script>
/* ---------- v34 live board ----------
   The server announces {type:"task_changed", id, updatedAt, by, deleted} after every task
   write. Fetch just that task (batched), so boards, calendars and open drawers stay current. */
(function(){
  var pending={}, timer=null;
  function flush(){
    timer=null; var ids=Object.keys(pending); var evs=pending; pending={};
    ids.forEach(function(id){
      var ev=evs[id], cur=task(id);
      if (ev.deleted){ if (cur){ var i=TASKS.indexOf(cur); if (i>=0) TASKS.splice(i,1); if (S.drawerTask===id&&typeof closeDrawer==="function"){ closeDrawer(); toast(tr("This task was deleted by")+" "+((person(ev.by)||{}).name||tr("a colleague"))); } refresh(); } return; }
      if (cur&&cur.updatedAt&&ev.updatedAt&&cur.updatedAt>=ev.updatedAt) return; /* already have it (our own save) */
      apiFetch("GET","/api/tasks/"+encodeURIComponent(id)).then(function(d){
        var t=hTask(d), now=task(id);
        if (now){ if (now._draft) return; replaceInto(now,t); } else TASKS.push(t);
        AN=null; refresh();
        if (S.drawerTask===id&&ev.by!==ME) toast(tr("Updated by")+" "+((person(ev.by)||{}).name||tr("a colleague")));
      }).catch(function(){});
    });
  }
  function onEvent(e){ var ev; try{ ev=JSON.parse(e.data); }catch(x){ return; } if (!ev||ev.type!=="task_changed"||!API.on) return; pending[ev.id]=ev; if (!timer) timer=setTimeout(flush,250); }
  var ES=window.EventSource; if (typeof ES!=="function") return;
  window.EventSource=function(u,o){ var es=new ES(u,o); es.addEventListener("message",onEvent); return es; };
  window.EventSource.prototype=ES.prototype; ["CONNECTING","OPEN","CLOSED"].forEach(function(k){ window.EventSource[k]=ES[k]; });
})();
Object.assign(UI_ID,{"Updated by":"Diperbarui oleh","This task was deleted by":"Task ini dihapus oleh","a colleague":"rekan kerja"});
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
  bulkStatus=function(a){ ctxMenu(a,'<div class="mh">'+tr("Status")+'</div>'+(WS.workflow||[]).map(function(s){ return '<button onclick="closePops();zcBulkStatus(\''+attr(s.id)+'\')">'+statusBadge(s.id)+'</button>'; }).join(""),"left"); };
  Object.assign(UI_ID,{"None of the selected tasks can be moved to":"Tidak ada task terpilih yang bisa dipindahkan ke","they need a reviewer, or a reviewer's decision.":"task tersebut butuh reviewer, atau keputusan reviewer.","task moved to":"task dipindahkan ke","tasks moved to":"task dipindahkan ke","not moved (reviewer rule)":"tidak dipindahkan (aturan reviewer)"});
})();
</script>
