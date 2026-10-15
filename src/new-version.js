<script>
/* ============================================================
   A NEW VERSION, OFFERED (Oct 2026)
   A tab keeps the page it loaded. Left open across an update — for days, or as the installed app — it went on
   running the old page against the new server, and things went wrong for some people without anyone knowing why.
   Every API reply now says which page the server serves (X-ZC-Build, stamped into the page by build.js); when it is
   not this tab's, a bar at the top offers to reload. It never reloads by itself: something may be half typed. A tab
   nobody touches checks when it is looked at again, and every 15 minutes while in view. "Later" puts the bar away
   until the next update.
   ============================================================ */
var ZC_BUILD=(function(){ try{ var m=document.querySelector('meta[name="zc-build"]'); return m?m.getAttribute("content")||"":""; }catch(e){ return ""; } })();
var ZC_NEWER="", ZC_NEWER_LATER="", ZC_BUILD_CHECKED=0;
/* apiFetch hands over what each reply says */
function zcBuildSeen(id){
  if(!id||!ZC_BUILD||id===ZC_BUILD||id===ZC_NEWER) return;
  ZC_NEWER=id; zcNewVersionBar();
}
function zcNewVersionBar(){
  var el=document.getElementById("zcNewVersion");
  if(!ZC_NEWER||ZC_NEWER===ZC_NEWER_LATER){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement("div"); el.id="zcNewVersion"; el.className="zc-new-version"; el.setAttribute("role","status"); document.body.appendChild(el); }
  el.innerHTML='<span class="zc-nv-ic" aria-hidden="true">'+I.sync+'</span><span class="zc-nv-text">'+tr("A new version of ZenCrevia is ready.")+'</span>'
    + '<button type="button" class="btn sm primary" onclick="zcReloadNow()">'+tr("Reload")+'</button>'
    + '<button type="button" class="iconbtn flat sm zc-nv-later" aria-label="'+attr(tr("Later"))+'" title="'+attr(tr("Later"))+'" onclick="zcNewVersionLater()">'+I.x+'</button>';
}
/* the page comes back as it was (view-memory.js keeps it on a reload) */
function zcReloadNow(){ try{ if(typeof pageSave==="function") pageSave(); }catch(e){} location.reload(); }
function zcNewVersionLater(){ ZC_NEWER_LATER=ZC_NEWER; zcNewVersionBar(); }
function zcBuildCheck(){
  if(typeof API==="undefined"||!API.on||document.hidden||Date.now()-ZC_BUILD_CHECKED<60000) return;
  ZC_BUILD_CHECKED=Date.now();
  apiFetch("GET","/api/auth/status").catch(function(){});
}
document.addEventListener("visibilitychange",function(){ if(!document.hidden) zcBuildCheck(); });
setInterval(zcBuildCheck,15*60000);
/* the bar speaks the language chosen after it appeared */
(function(){ if(typeof renderScreen!=="function") return; var base=renderScreen; renderScreen=function(){ var r=base.apply(this,arguments); if(document.getElementById("zcNewVersion")) zcNewVersionBar(); return r; }; })();
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"A new version of ZenCrevia is ready.":"Versi baru ZenCrevia sudah siap.","Reload":"Muat ulang","Later":"Nanti"});
</script>
