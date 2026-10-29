<script>
/* PERSONAL CHECKS FOLLOW THE PERSON (Oct 2026) — the tick on a task ("Mark as checked", the "N checked" chip and its
   Clear checks) is kept on the server for the account that made it (server/task-checks.js), so a tick made on the
   laptop is on the phone and in the other tab without a reload.

   The set is src/core.js's (TASK_CHECKED, one array changed in place; taskCheckSet, taskCheckSave, paintTaskCheck,
   syncTaskCheckBar). This file is how it reaches the server and comes back:
   - The first time a tab uses the set of an account (taskChecksStart, from taskCheckSet) it is drawn at once from what
     this browser last had from the server (cos.taskChecks.<id>), together with the ticks it kept before the server
     kept them (cos.taskChecked.<id>, the old store). Those are sent up once as "check", which the server adds to the
     set it has: merged, never written over. The old store is removed only once the server has answered that request.
     From then on the server's set is what is drawn.
   - A change (taskChecksSend, from taskCheckSave) sends what differs from the set the server will have once everything
     already sent has arrived (TCHK.shadow). One request at a time: while one is on its way the next waits and takes
     every change made meanwhile, so each answer is newer than the one before it, and each is drawn with the changes
     still waiting on top (taskChecksAdopt).
   - A change in another tab or on another device ("checks_changed", to this person only) asks for the set again; the
     tab that made it skips its own echo when the per-tab id says so (liveFromThisTab), and asking twice is harmless.
     A hidden tab asks when it is shown, and a stream that comes back after a drop asks once (an event may have gone).
   - Only what changed is painted (paintTaskCheck, syncTaskCheckBar): no board drawn again, no scroll, focus or menu
     lost.
   - A request that fails goes again a little later each time (5 s, 10 s … a minute), at once on the next change, with
     one toast while changes wait; nothing waiting is dropped, and nothing is asked while nobody is signed in. */
var TCHK={ gen:0, key:null };
function taskChecksCacheKey(key){ return "cos.taskChecks."+String(key).replace(/^cos\.taskChecked\./,""); }
function taskChecksHas(list){ var o=Object.create(null); for(var i=0;i<list.length;i++) o[list[i]]=1; return o; }
function taskChecksCache(){ if(!TCHK.key||!TASK_CHECKED) return; try{ localStorage.setItem(taskChecksCacheKey(TCHK.key),JSON.stringify(TASK_CHECKED)); }catch(e){} }

/* an account's set, the first time this tab uses it: what to draw now; the server is asked straight after */
function taskChecksStart(key){
  if(TCHK.retry) clearTimeout(TCHK.retry);
  var cache=taskCheckList(taskChecksCacheKey(key))||[], old=taskCheckList(key), set=cache.slice(), has=taskChecksHas(set);
  (old||[]).forEach(function(id){ if(!has[id]){ has[id]=1; set.push(id); } });
  TCHK={ gen:TCHK.gen+1, key:key, shadow:set.slice(), want:{}, clear:false, load:true, migrate:old!==null, mine:false, busy:false, stale:false, retry:null, wait:0, told:false };
  (old||[]).forEach(function(id){ TCHK.want[id]=true; });
  setTimeout(taskChecksPush,0);
  return set;
}

/* the set was changed here (clearAll: Clear checks, every tick of this account): queue what differs and send it */
function taskChecksSend(clearAll){
  var c=TCHK, set=TASK_CHECKED; if(!c.key||!set) return;
  c.mine=true;   /* a change made here (the ticks moved up from the old store alone are not) */
  if(clearAll){ c.clear=true; c.want={}; c.shadow=[]; }
  var has=taskChecksHas(set), sh=taskChecksHas(c.shadow);
  set.forEach(function(id){ if(!sh[id]) c.want[id]=true; });
  c.shadow.forEach(function(id){ if(!has[id]) c.want[id]=false; });
  c.shadow=set.slice();
  taskChecksCache();
  if(c.retry){ clearTimeout(c.retry); c.retry=null; }
  taskChecksPush();
}

function taskChecksPush(){
  var c=TCHK;
  if(c.busy||c.retry||!c.key||!API.on||!SESSION.user||c.key!==taskCheckKey()) return;
  var check=[], uncheck=[]; Object.keys(c.want).forEach(function(id){ (c.want[id]?check:uncheck).push(id); });
  var body=null;
  if(check.length||uncheck.length||c.clear){ body={}; if(c.clear) body.clear=true; if(check.length) body.check=check; if(uncheck.length) body.uncheck=uncheck; }
  else if(!c.load) return;
  var sent={ want:c.want, clear:c.clear, migrate:c.migrate, mine:c.mine&&!!body }, gen=c.gen, key=c.key;
  c.want={}; c.clear=false; c.migrate=false; c.load=false; c.mine=false; c.busy=true;
  (body?apiFetch("POST","/api/task-checks",body):apiFetch("GET","/api/task-checks")).then(function(r){
    if(TCHK.gen!==gen) return;   /* another account since */
    TCHK.busy=false; TCHK.wait=0; TCHK.told=false;
    if(sent.migrate){ try{ localStorage.removeItem(key); }catch(e){} }   /* the server has the ticks this browser kept */
    taskChecksAdopt(r&&r.ids);
    taskChecksPush();
  },function(){
    if(TCHK.gen!==gen) return;
    var c=TCHK; c.busy=false;
    /* what did not go goes again, under anything changed since (a Clear checks since outranks it) */
    if(!c.clear) Object.keys(sent.want).forEach(function(id){ if(!(id in c.want)) c.want[id]=sent.want[id]; });
    if(sent.clear) c.clear=true;
    if(sent.migrate) c.migrate=true;
    if(sent.mine) c.mine=true;
    c.load=true;
    c.wait=Math.min(60000,(c.wait||2500)*2);
    /* told once while changes made here wait; the old store's ticks are safe where they are until the server has them */
    if(c.mine&&!c.told){ c.told=true; toast("Your checks aren't saved yet — trying again","bad"); }
    c.retry=setTimeout(function(){ if(TCHK.gen!==gen) return; TCHK.retry=null; taskChecksPush(); },c.wait);
  });
}

/* the server's set, with the changes still waiting on top: painted where it differs from what is drawn */
function taskChecksAdopt(ids){
  if(!Array.isArray(ids)||!TASK_CHECKED) return;
  var c=TCHK, next=c.clear?[]:ids.filter(function(x){ return typeof x==="string"&&x; }), has=taskChecksHas(next);
  Object.keys(c.want).forEach(function(id){ if(c.want[id]&&!has[id]){ has[id]=1; next.push(id); } else if(!c.want[id]&&has[id]) has[id]=0; });
  next=next.filter(function(id){ return has[id]===1; });
  c.shadow=next.slice();
  var set=TASK_CHECKED, was=taskChecksHas(set), changed=[];
  set.forEach(function(id){ if(has[id]!==1) changed.push(id); });
  next.forEach(function(id){ if(was[id]!==1) changed.push(id); });
  if(changed.length){
    set.length=0; for(var i=0;i<next.length;i++) set.push(next[i]);
    changed.forEach(paintTaskCheck);
    syncTaskCheckBar();
  }
  taskChecksCache();
}

/* something may have changed elsewhere: ask, or once this tab is shown */
function taskChecksStale(){
  var c=TCHK; if(!c.key||!API.on) return;
  if(document.hidden){ c.stale=true; return; }
  c.stale=false; c.load=true;
  if(c.retry){ clearTimeout(c.retry); c.retry=null; }
  taskChecksPush();
}
document.addEventListener("visibilitychange",function(){ if(!document.hidden&&TCHK.stale) taskChecksStale(); });
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(ev){ var r=base.apply(this,arguments); try{ if(ev&&ev.type==="checks_changed"&&API.on&&(!ev.by||ev.by===ME)&&!(typeof liveFromThisTab==="function"&&liveFromThisTab(ev))) taskChecksStale(); }catch(e){} return r; }; })();
/* the live stream back after a drop (the laptop slept, the network went): what came meanwhile is asked for once */
(function(){ if(typeof msgStream!=="function"||typeof CHAT_RUNTIME==="undefined") return; var base=msgStream, opened=false;
  msgStream=function(){ var had=!!CHAT_RUNTIME.connection, r=base.apply(this,arguments); if(!had&&CHAT_RUNTIME.connection){ if(opened) taskChecksStale(); opened=true; } return r; }; })();
Object.assign(UI_ID,{"Your checks aren't saved yet — trying again":"Centang-mu belum tersimpan — mencoba lagi"});
</script>
