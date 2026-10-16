<script>
/* WHO SEES WHICH SETTINGS, AND ROLES IN GROUPS (Oct 2026).

   Settings showed every tab to everyone — a member could open the AI providers, cloud storage, SMTP and backups,
   read-only. Now each tab is there only for whoever may do what it is for: the personal ones (profile, menu &
   home, the look, notifications) for everyone; the workspace's for whoever manages the workspace; Members, Roles
   and Teams for whoever manages them; Cloud storage, e-mail delivery and Backups each by a capability of its own
   (manage_cloud_storage, manage_email, manage_backups — given once to every role that could manage the workspace),
   so one can be handed over without the rest. The server asks for the same capabilities.

   In Roles & permissions the capabilities stand in groups by what they are for, each group with how many are on
   and one button to turn them all on or off. */
canI.manageEmail=function(){ return has("manage_email"); };
canI.manageCloudStorage=function(){ return has("manage_cloud_storage"); };
canI.manageBackups=function(){ return has("manage_backups"); };
canI.manageNotificationSettings=function(){ return has("manage_notification_settings"); };
/* the workspace's notification switches are saved on their own (they have a capability of their own) */
function saveNotifDefaults(){ if(!API.on) return; apiFetch("PUT","/api/workspace/notif-prefs",{notifPrefs:WS.notifPrefs}).then(function(d){ if(d&&d.notifPrefs) WS.notifPrefs=d.notifPrefs; toast(tr("Saved")); }).catch(function(e){ toast(e.message,"bad"); }); }
var SETTINGS_ACCESS={profile:null,layout:null,theme:null,notifications:null,
  workspace:["manage_workspace"],workflow:["manage_workspace"],automation:["manage_workspace"],scoring:["scoring_manage_workspace","scoring_view_analytics"],briefs:["manage_workspace"],fields:["manage_workspace"],labels:["manage_workspace"],tags:["manage_workspace"],ai:["manage_workspace"],
  members:["manage_members","approve_members"],roles:["manage_roles"],teams:["manage_teams"],integrations:["manage_cloud_storage"],backup:["manage_backups"]};
function settingsTabAllowed(id){ if(!API.on) return true; var need=SETTINGS_ACCESS[id]; if(need===undefined) return canI.manageWorkspace(); return !need||need.some(function(c){ return has(c); }); }

var CAP_GROUPS=[
  ["Workspace & settings",["manage_workspace","manage_email","manage_cloud_storage","manage_backups","manage_roles"]],
  ["People & teams",["manage_members","approve_members","manage_teams"]],
  ["Notifications",["choose_notifications","manage_notification_settings","send_announcements"]],
  ["Projects",["create_project","edit_any_project","delete_project"]],
  ["Tasks",["view_all","create_task","create_own_task","edit_any_task","edit_team_tasks","edit_own_task","assign_task","delete_task","upload_file"]],
  ["Reviews & requests",["review_any","submit_request","decide_request"]],
  ["Progress notes",["view_progress_notes","write_progress_notes"]],
  ["Assets & knowledge",["manage_assets","manage_knowledge"]],
  ["AI Hub & gallery",["use_ai_hub","view_ai_gallery","publish_ai_gallery","duplicate_ai_gallery","manage_own_ai_gallery","manage_all_ai_gallery","save_ai_templates","save_own_ai_templates"]],
  ["Insights",["view_analytics"]],
  /* Smart Scoring (src/scoring-core.js, docs/SMART-SCORING.md): no role but Admin has these until given */
  ["Smart Scoring",["scoring_manage_workspace","scoring_manage_project","scoring_approve_estimate","scoring_edit_task","scoring_request_ai","scoring_approve_completion","scoring_manage_outcomes","scoring_view_analytics"]]];
var CAP_GROUP_ICON={"Workspace & settings":"settings","People & teams":"team","Notifications":"bell","Projects":"projects","Tasks":"tasks","Reviews & requests":"check","Progress notes":"edit","Assets & knowledge":"assets","AI Hub & gallery":"sparkle","Insights":"analytics","Smart Scoring":"gauge","Other":"more"};
/* the capabilities of a role, in their groups; any the list does not name yet go under Other */
function capGroupsHtml(r,all){ var seen={}, has_=function(id){ return all||(r.permissions||[]).indexOf(id)>=0; };
  var groups=CAP_GROUPS.map(function(g){ return [g[0],g[1].map(function(id){ seen[id]=1; return CAPS.filter(function(c){ return c[0]===id; })[0]; }).filter(Boolean)]; });
  var rest=CAPS.filter(function(c){ return !seen[c[0]]; }); if(rest.length) groups.push(["Other",rest]);
  return groups.filter(function(g){ return g[1].length; }).map(function(g){ var on=g[1].filter(function(c){ return has_(c[0]); }).length;
    return '<div class="cap-group"><div class="cap-group-head"><span class="cap-group-ico" aria-hidden="true">'+(I[CAP_GROUP_ICON[g[0]]]||I.lock)+'</span><b>'+esc(tr(g[0]))+'</b><span class="cap-count">'+on+'/'+g[1].length+'</span><span class="spacer"></span>'+(all?'':'<button type="button" class="btn xs ghost cap-all" onclick="capGroupToggle(this)">'+tr(on===g[1].length?"Turn all off":"Turn all on")+'</button>')+'</div>'
      +g[1].map(function(c){ var o=has_(c[0]); return '<div class="pref cap-row"><div class="pl"><b>'+esc(tr(c[1]))+'</b><span class="cap-id" data-no-translate>'+esc(c[0])+'</span></div><button type="button" class="switch'+(o?" on":"")+'" data-cap="'+attr(c[0])+'" role="switch" aria-checked="'+o+'" aria-label="'+attr(tr(c[1]))+'" '+(all?'disabled':'onclick="capToggle(this)"')+'></button></div>'; }).join("")+'</div>'; }).join(""); }
function capToggle(b){ b.classList.toggle("on"); b.setAttribute("aria-checked",String(b.classList.contains("on"))); capGroupSync(b.closest(".cap-group")); }
function capGroupToggle(btn){ var g=btn.closest(".cap-group"), sw=g.querySelectorAll("[data-cap]"), allOn=Array.prototype.every.call(sw,function(s){ return s.classList.contains("on"); });
  Array.prototype.forEach.call(sw,function(s){ s.classList.toggle("on",!allOn); s.setAttribute("aria-checked",String(!allOn)); }); capGroupSync(g); }
function capGroupSync(g){ if(!g) return; var n=g.querySelectorAll("[data-cap]").length, on=g.querySelectorAll("[data-cap].on").length, c=g.querySelector(".cap-count"), b=g.querySelector(".cap-all");
  if(c) c.textContent=on+"/"+n; if(b) b.textContent=tr(on===n?"Turn all off":"Turn all on"); }

Object.assign(UI_ID,{
  "Workspace & settings":"Workspace & pengaturan","People & teams":"Orang & tim","Notifications":"Notifikasi","Projects":"Project","Tasks":"Task","Reviews & requests":"Review & permintaan","Progress notes":"Catatan progres","Assets & knowledge":"Aset & knowledge","AI Hub & gallery":"AI Hub & galeri","Insights":"Analitik","Other":"Lainnya",
  "Turn all on":"Nyalakan semua","Set which events the workspace sends, in the app and by e-mail":"Mengatur event yang dikirim workspace, di aplikasi dan lewat email","Saved":"Tersimpan","Turn all off":"Matikan semua",
  "Set up e-mail delivery (SMTP), see the delivery log":"Mengatur pengiriman email (SMTP), melihat log pengiriman",
  "Connect and set up cloud storage (Google Drive)":"Menghubungkan dan mengatur cloud storage (Google Drive)",
  "See, create, verify and restore backups":"Melihat, membuat, memeriksa, dan memulihkan backup","Submit a request (a task in the first stage, unassigned) for the creative team to triage":"Mengajukan permintaan (task di tahap pertama, tanpa penanggung jawab) untuk disortir tim kreatif",
  "Open AI Hub and generate visuals":"Membuka AI Hub dan membuat visual","Browse the shared AI Gallery":"Menjelajah AI Gallery bersama","Publish their own designs to the AI Gallery":"Menerbitkan desain sendiri ke AI Gallery",
  "Duplicate someone else's gallery design":"Menduplikat desain galeri milik orang lain","Rename, archive and delete their own designs":"Mengganti nama, mengarsipkan, dan menghapus desain sendiri","Manage any member's gallery design":"Mengelola desain galeri anggota mana pun"
});
</script>
