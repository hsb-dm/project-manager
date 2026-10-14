<script>
/* WHAT REACHES ME (Oct 2026) — Settings → Notifications, for each person: every kind of notification is a row, and
   each row is on or off in the bell, by e-mail and in the browser. The server keeps to it (server.js notifWanted):
   what is off is not in the bell, not e-mailed, not pushed. The browser column is the switches people had before,
   under the same names. Whoever's role lacks choose_notifications sees the table as it stands and receives what the
   workspace sends; an admin gives or takes the choice per role, in Roles & permissions. */
var NC_ROWS=[
  ["Tasks & projects",[
    ["task_assigned","Assigned to me, or asked to review","","aep"],
    ["approval","Reviews and approvals","Sent for my review, approved, changes asked for","aep"],
    ["comment_mention","Mentioned in a comment or a project discussion","","aep"],
    ["comment_reply","Comments on my work, and replies to me","","aep"],
    ["task_due","Due soon and overdue","","aep"],
    ["project_updates","Other updates","Stage changes, new versions, files, progress notes, tasks I watch","aep"],
    ["requests","Requests","New requests, and my request's status","aep"],
    ["task_completed","Task completed","Moved to Done or Delivered","aep"],
    ["blocker","Blocker update","A task it depended on is finished — it can start","aep"]]],
  ["Chat",[
    ["chat_dm","Direct messages","E-mailed only while you are away","aep"],
    ["chat_mention","Mentions","@you and @everyone","aep"],
    ["chat_reply","Replies to my messages","","ap"],
    ["chat_group","Group messages","","ap"],
    ["chat_team_general","Team #general messages","Per conversation you can still pick All / Mentions only / Mute.","ap"]]],
  ["Workspace",[
    ["signup","Sign-ups waiting for my approval","","aep"]]]
];
/* which row each kind of notification is — the same as the server's (server.js NOTIF_CATEGORY) */
var NC_CATEGORY={completed:"task_completed",blocker:"blocker",assigned:"task_assigned",reviewer:"task_assigned",review:"approval",approved:"approval",revision:"approval",mention:"comment_mention",comment:"comment_reply",deadline:"task_due",missed:"task_due",status:"project_updates",upload:"project_updates",file:"project_updates",progress:"project_updates",watch:"project_updates",transition:"project_updates",request:"requests",request_status:"requests",signup:"signup"};
/* a role that may not choose gets every kind in the browser too, whatever was chosen before (as the server does) */
(function(){ if(typeof notifPref!=="function") return; var base=notifPref, rows={}; NC_ROWS.forEach(function(g){ g[1].forEach(function(r){ rows[r[0]]=1; }); }); notifPref=function(k){ if(rows[k]&&API.on&&!has("choose_notifications")) return true; return base.apply(this,arguments); }; })();
var NC_WAYS=[["a","app","In the bell"],["e","email","Email"],["p","push","Browser"]];
function ncCanChoose(){ return !API.on||has("choose_notifications"); }
function ncKey(cat,way){ return way==="push"?cat:cat+":"+way; }
var NC_CHAT_ICON='<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg>';
function ncGroupIcon(name){ return name==="Chat"?NC_CHAT_ICON:name==="Workspace"?I.team:I.tasks; }
function notifChoicesHtml(){ var np=notifPrefs(), ok=ncCanChoose(), browserOn=typeof notifBrowserAllowed==="function"&&notifBrowserAllowed();
  var head='<div class="nc-row nc-head"><span></span>'+NC_WAYS.map(function(w){ return '<span class="nc-way">'+tr(w[2])+'</span>'; }).join("")+'</div>';
  var groups=NC_ROWS.map(function(g){ var rows=g[1].filter(function(r){ return r[0]!=="signup"||has("approve_members"); }); if(!rows.length) return "";
    /* each group a box of its own, headed by its mark, its name and how many kinds are in it */
    return '<div class="nc-group-box"><div class="nc-group"><span class="nc-group-ico" aria-hidden="true">'+ncGroupIcon(g[0])+'</span><span>'+tr(g[0])+'</span><span class="nc-group-n">'+rows.length+'</span></div>'+rows.map(function(r){ var cat=r[0];
      return '<div class="nc-row" data-cat="'+attr(cat)+'"><div class="nc-what"><b>'+tr(r[1])+'</b>'+(r[2]?'<span>'+tr(r[2])+'</span>':'')+'</div>'+NC_WAYS.map(function(w){
        if(r[3].indexOf(w[0])<0) return '<span class="nc-cell nc-na" title="'+attr(tr("Not sent this way"))+'">—</span>';
        var k=ncKey(cat,w[1]), on=np[k]!==false, off=!ok||(w[1]==="push"&&!browserOn);
        return '<label class="nc-cell"><input type="checkbox" data-way="'+w[1]+'"'+(on?' checked':'')+(off?' disabled':'')+' aria-label="'+attr(tr(r[1])+" — "+tr(w[2]))+'" onchange="ncSet('+jsq(k)+',this.checked,'+jsq(w[1])+')"></label>'; }).join("")+'</div>'; }).join("")+'</div>'; }).join("");
  var note=!ok?'<p class="nc-note">'+I.lock+'<span>'+tr("Your role receives every notification the workspace sends. An admin can let your role choose, in Roles & permissions.")+'</span></p>'
    :(!browserOn?'<p class="hint nc-hint">'+tr("The Browser column works once browser notifications are on, above.")+'</p>':'');
  return sp("What reaches me",'<p class="hint" style="margin-bottom:10px">'+tr("Personal to your account. Turn a kind off where you do not want it — in the bell, by e-mail or in the browser. What the workspace does not send does not come either way.")+'</p>'+note+'<div class="nc-table'+(ok?'':' nc-locked')+'" role="group" aria-label="'+attr(tr("What reaches me"))+'">'+head+groups+'</div>',null,I.bell,"nc-panel"); }
/* saved to the account; a kind turned off or back on in the bell changes the bell at once */
function ncSet(k,on,way){ if(!ncCanChoose()) return; notifPrefs()[k]=!!on; var saved=saveMyPrefs();
  if(way==="app"&&API.on&&saved&&saved.then) saved.then(function(){ return apiFetch("GET","/api/live/notifs"); }).then(function(d){ if(!d||!d.notifs) return; NOTIFS=d.notifs.map(hNotif); syncNotifDot(); renderNav(); var np=document.getElementById("notifPop"); if(np&&np.classList.contains("open")) renderNotifs(); }).catch(function(){}); }
/* A TASK FINISHED, AND WHAT WAITED ON IT (Oct 2026). Moved into a finishing stage (Done, Delivered — not Declined), everyone
   the task concerns hears it is finished ("completed": the Task completed row) rather than that it moved; and the people
   on each task that depended on it hear it can start ("blocker": the Blocker update row). An approval says "approved"
   itself, and tells those waiting too (approveTask). */
function taskFinished(tk){ return !!tk&&stageKind(tk.status)==="closed"&&String(tk.status).toLowerCase()!=="declined"; }
function notifyUnblocked(tk){ if(!tk||typeof blockingTasksOf!=="function") return; blockingTasksOf(tk).filter(function(d){ return !d._draft&&!isClosed(d); }).forEach(function(d){ notify("blocker",taskPeople(d,["assignees","reviewers"]),d.id); }); }
(function(){ if(typeof notifyMoved!=="function") return; var base=notifyMoved; notifyMoved=function(tk){ if(!tk||tk._draft||!taskFinished(tk)) return base.apply(this,arguments);
  var told=taskPeople(tk); notify("completed",told,tk.id);
  var ws=((tk.meta&&tk.meta.watchers)||[]).filter(function(u){ return u!==ME&&told.indexOf(u)<0; }); if(ws.length) notify("watch",ws,tk.id);
  notifyUnblocked(tk); }; })();
Object.assign(UI_ID,{
  "Moved to Done or Delivered":"Dipindah ke Done atau Delivered","Task finished (Done or Delivered)":"Task selesai (Done atau Delivered)","A task it depended on is finished":"Task yang ditunggunya sudah selesai","A task it depended on is finished — it can start":"Task yang ditunggunya sudah selesai — bisa dimulai",
  "What reaches me":"Yang ingin saya terima","In the bell":"Di lonceng","Email":"Email","Browser":"Browser","Not sent this way":"Tidak dikirim lewat cara ini",
  "Personal to your account. Turn a kind off where you do not want it — in the bell, by e-mail or in the browser. What the workspace does not send does not come either way.":"Berlaku untuk akunmu saja. Matikan jenis yang tidak ingin kamu terima — di lonceng, lewat email, atau di browser. Yang tidak dikirim workspace tetap tidak datang.",
  "Your role receives every notification the workspace sends. An admin can let your role choose, in Roles & permissions.":"Role-mu menerima semua notifikasi yang dikirim workspace. Admin bisa mengizinkan role-mu memilih, di Role & izin.",
  "The Browser column works once browser notifications are on, above.":"Kolom Browser aktif setelah notifikasi browser dinyalakan di atas.",
  "Tasks & projects":"Task & project","Assigned to me, or asked to review":"Ditugaskan ke saya, atau diminta me-review","Reviews and approvals":"Review dan persetujuan","Sent for my review, approved, changes asked for":"Dikirim untuk saya review, disetujui, diminta revisi",
  "Mentioned in a comment or a project discussion":"Disebut di komentar atau diskusi project","Comments on my work, and replies to me":"Komentar di pekerjaan saya, dan balasan untuk saya","Due soon and overdue":"Mendekati tenggat dan terlambat",
  "Other updates":"Update lainnya","Stage changes, new versions, files, progress notes, tasks I watch":"Perpindahan tahap, versi baru, file, catatan progres, task yang saya pantau","Requests":"Permintaan","New requests, and my request's status":"Permintaan baru, dan status permintaan saya",
  "Task completed":"Task selesai","Blocker update":"Update blocker","Chat":"Chat","Direct messages":"Pesan langsung","E-mailed only while you are away":"Email hanya dikirim saat kamu sedang tidak aktif","Mentions":"Mention","@you and @everyone":"@kamu dan @everyone",
  "Replies to my messages":"Balasan untuk pesan saya","Group messages":"Pesan grup","Team #general messages":"Pesan #general tim","Workspace":"Workspace","Sign-ups waiting for my approval":"Pendaftar yang menunggu persetujuan saya",
  "Choose which notifications they receive, and how":"Memilih notifikasi yang diterima, dan caranya",
  "Personal to your account: whether the browser and the chime join in. What reaches you, and how, is chosen below.":"Berlaku untuk akunmu saja: apakah browser dan suara ikut memberi tahu. Apa yang kamu terima, dan caranya, dipilih di bawah."
});
</script>
