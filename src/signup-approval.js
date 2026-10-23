<script>
/* ============================================================
   SIGN-UPS WAIT FOR APPROVAL (Oct 2026)
   Someone who registers cannot sign in until an approver lets them in. Approvers are the roles with "Approve or
   turn away people who sign up" — Admin and Team Lead by default, any role in Settings → Roles & permissions. They
   are told (a notification, an e-mail) and decide on Home or in Settings → Members: Approve — with the role they
   registered with (another, for someone who manages members) and the team they chose (or another, or none) — or
   Turn away, which frees the address.
   Whether sign-ups wait at all is a switch in the workspace's Access settings (on unless an admin turns it off).
   ============================================================ */
var PENDING=[];
(function(){ if(typeof loadBootstrap!=="function") return; var lb=loadBootstrap; loadBootstrap=function(d){ PENDING=(d&&d.pendingMembers)||[]; return lb.apply(this,arguments); }; })();
function canApproveSignups(){ return !!(API.on&&has("approve_members")); }
function pendingRefresh(){ if(!canApproveSignups()) return Promise.resolve(); return apiFetch("GET","/api/members/pending").then(function(r){ PENDING=r.pending||[]; if(S.screen==="home"||(S.screen==="settings"&&S.settingsTab==="members")) renderScreen(false); }).catch(function(){}); }
function pendingWhen(iso){ var t=Date.parse(iso||""); return isNaN(t)?"":ago(Math.max(0,Math.round((Date.now()-t)/60000)),iso); }
/* the roles an approver may give: the one they registered with, or — for someone who manages members — any not above their own */
function pendingRoles(p){ var me=byId(ROLES,(PEOPLE[ME]||{}).perm)||{}, admin=(PEOPLE[ME]||{}).perm==="admin";
  return ROLES.filter(function(r){ return r.id===p.perm||(canI.manageMembers()&&(admin||(r.rank||0)<=(me.rank||0))); }); }
function pendingField(label,html,id){ return '<div class="pending-field">'+(id?'<label for="'+attr(id)+'">':'<span>')+esc(tr(label))+(id?'</label>':'</span>')+html+'</div>'; }
function pendingRowHtml(p){ var chose=(p.teams||[])[0]||"", ct=chose&&team(chose), roles=pendingRoles(p);
  var meta=[esc(p.email),esc(p.role),ct?esc(tr("chose"))+' '+esc(ct.name):""].filter(Boolean).join(" · ");
  var teamSel='<select id="pt_'+attr(p.id)+'">'+[["",tr("No team")]].concat(activeTeams().map(function(t){ return [t.id,t.name]; })).map(function(o){ return '<option value="'+attr(o[0])+'"'+(o[0]===chose?' selected':'')+'>'+esc(o[1])+'</option>'; }).join("")+'</select>';
  return '<div class="pending-row" data-pid="'+attr(p.id)+'"><span class="av c'+(+p.c||0)+'" aria-hidden="true">'+esc(p.ini||"")+'</span>'
    +'<div class="pending-who"><b data-no-translate>'+esc(p.name)+'</b><span class="pending-meta" data-no-translate>'+meta+'</span><span class="hint">'+esc(tr("Signed up"))+' '+esc(pendingWhen(p.createdAt))+'</span></div>'
    +'<div class="pending-acts">'+pendingField("Role",roles.length>1?'<select id="pr_'+attr(p.id)+'">'+roles.map(function(r){ return '<option value="'+attr(r.id)+'"'+(r.id===p.perm?' selected':'')+'>'+esc(r.name)+'</option>'; }).join("")+'</select>':'<span class="pending-fixed">'+esc((byId(ROLES,p.perm)||{}).name||p.perm)+'</span>',roles.length>1?"pr_"+p.id:"")+pendingField("Team",teamSel,"pt_"+p.id)
    +'<button type="button" class="btn sm primary" onclick="pendingApprove('+jsq(p.id)+')">'+I.check+esc(tr("Approve"))+'</button><button type="button" class="btn sm ghost" onclick="pendingDecline('+jsq(p.id)+')">'+esc(tr("Turn away"))+'</button></div></div>'; }
function pendingSectionHtml(){ if(!canApproveSignups()||!PENDING.length) return "";
  return sp("Waiting for approval",'<p class="hint" style="margin-bottom:6px">'+esc(tr("They signed up and cannot sign in until someone lets them in. Who may approve is set in Roles & permissions."))+'</p>'+PENDING.map(pendingRowHtml).join(""),null,I.user,"pending-signups"); }
function pendingSettle(id){ NOTIFS.forEach(function(n){ if(n.k==="signup"&&n.t===id) n.read=true; }); if(typeof syncNotifDot==="function") syncNotifDot(); }
function pendingApprove(id){ var p=byId(PENDING,id); if(!p) return; var sel=document.getElementById("pr_"+id), ts=document.getElementById("pt_"+id), body=sel&&sel.value&&sel.value!==p.perm?{role:sel.value}:{};
  if(ts&&ts.value!==((p.teams||[])[0]||"")) body.teamId=ts.value;
  apiFetch("POST","/api/members/"+encodeURIComponent(id)+"/approve",body).then(function(r){ PEOPLE=r.people; WS.people=PEOPLE; PENDING=r.pending||[]; pendingSettle(id); renderScreen(false); toast(p.name+" "+tr("can sign in now")); }).catch(function(e){ toast(e.message,"bad"); }); }
function pendingDecline(id){ var p=byId(PENDING,id); if(!p) return;
  confirmModal(tr("Turn away this sign-up?"),'<b data-no-translate>'+esc(p.name)+'</b> ('+esc(p.email)+') '+esc(tr("will not be let in, and the address can register again.")),function(){
    apiFetch("POST","/api/members/"+encodeURIComponent(id)+"/decline",{}).then(function(r){ PENDING=r.pending||[]; NOTIFS=NOTIFS.filter(function(n){ return !(n.k==="signup"&&n.t===id); }); if(typeof syncNotifDot==="function") syncNotifDot(); renderScreen(false); toast(tr("Sign-up turned away")); }).catch(function(e){ toast(e.message,"bad"); }); },true); }
/* Settings → Members opens with them */
(function(){ if(typeof setMembers!=="function") return; var base=setMembers; setMembers=function(){ return pendingSectionHtml()+base.apply(this,arguments); }; })();
/* Home: while someone waits, an approver sees who, and approves or turns them away right there (the first three;
   the rest are in Settings → Members) */
(function(){
  function paint(){ if(typeof S==="undefined"||S.screen!=="home"||!canApproveSignups()||!PENDING.length) return; var c=document.getElementById("content"); if(!c||document.getElementById("zcPendingHome")) return;
    var n=PENDING.length, d=document.createElement("section"); d.id="zcPendingHome"; d.className="panel pending-signups zc-pending-home"; d.setAttribute("role","status");
    d.innerHTML='<div class="panel-head"><span class="sq">'+I.user+'</span><h2>'+esc(fmt(tr(n===1?"{n} sign-up is waiting for your approval":"{n} sign-ups are waiting for your approval"),{n:n}))+'</h2><span class="spacer"></span>'+(n>3?'<span class="link" onclick="go(\'settings\',\'members\')">'+esc(tr("See all"))+'</span>':'')+'</div><div class="panel-body pad">'+PENDING.slice(0,3).map(pendingRowHtml).join("")+'</div>';
    c.insertBefore(d,c.firstChild); }
  if(typeof renderScreen==="function"){ var rs=renderScreen; renderScreen=function(){ var r=rs.apply(this,arguments); try{ paint(); }catch(e){} return r; }; }
})();
/* someone signs up while an approver has ZenCrevia open: the list and the line follow */
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(ev){ var r=base.apply(this,arguments); try{ if(ev&&ev.type==="notification_created"&&ev.notification&&ev.notification.k==="signup") pendingRefresh(); }catch(e){} return r; }; })();

Object.assign(UI_ID,{"Waiting for approval":"Menunggu persetujuan","They signed up and cannot sign in until someone lets them in. Who may approve is set in Roles & permissions.":"Mereka sudah mendaftar dan belum bisa masuk sampai ada yang menyetujui. Siapa yang boleh menyetujui diatur di Peran & izin.",
  "Signed up":"Mendaftar","Approve":"Setujui","Turn away":"Tolak","can sign in now":"sekarang bisa masuk","Turn away this sign-up?":"Tolak pendaftaran ini?","will not be let in, and the address can register again.":"tidak akan diizinkan masuk, dan alamat ini bisa mendaftar lagi.","Sign-up turned away":"Pendaftaran ditolak",
  "{n} sign-up is waiting for your approval":"{n} pendaftar menunggu persetujuan Anda","{n} sign-ups are waiting for your approval":"{n} pendaftar menunggu persetujuan Anda","See all":"Lihat semua","chose":"memilih","No team":"Tanpa tim","Role":"Peran","Team":"Tim",
  "Approve or turn away people who sign up":"Menyetujui atau menolak orang yang mendaftar",
  "New sign-ups wait for approval":"Pendaftar baru menunggu persetujuan","Someone who registers can sign in only after an approver lets them in. Who may approve is set in Roles & permissions.":"Orang yang mendaftar baru bisa masuk setelah disetujui. Siapa yang boleh menyetujui diatur di Peran & izin.",
  "Thanks":"Terima kasih","Your account is waiting for approval":"Akun Anda menunggu persetujuan","An admin or team lead will let you in. You will get an e-mail when they do.":"Admin atau lead tim akan menyetujuinya. Anda akan mendapat email saat sudah disetujui.","Back to sign in":"Kembali ke halaman masuk",
  "New accounts are approved by an admin or team lead before they can sign in.":"Akun baru perlu disetujui admin atau lead tim sebelum bisa masuk.",
  "Your account is waiting for approval. An admin or team lead will let you in, and you will get an e-mail when they do.":"Akun Anda menunggu persetujuan. Admin atau lead tim akan menyetujuinya, dan Anda akan mendapat email saat sudah disetujui."});
</script>
