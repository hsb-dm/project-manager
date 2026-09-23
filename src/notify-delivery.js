<script>
/* ============================================================
   v18 §16–27 / §142 NOTIFICATION DELIVERY
   One logical event → the existing in-app Notification Center, plus
   optional browser notification and the ZenCrevia sound. No second
   notification store; NOTIFS / notifPrefs / bell stay the source of truth.

   SOUND: exactly one sound exists — the ZenCrevia chime shipped as
   Notification_ZenCrevia.mp3, inlined by build.js. The preference is a
   simple on/off; there is no alternative tone to pick.
   ============================================================ */
var ZEN_SOUND_SRC="__ZEN_SOUND_DATA__";
var ZEN_AUDIO={el:null,unlocked:false,lastAt:0};
/* §23 browsers block audio before a user gesture: the element is created and
   primed on the first click/tap/keypress, then reused. */
function zenSoundInit(){ if(ZEN_AUDIO.el) return ZEN_AUDIO.el; try{ var a=new Audio(ZEN_SOUND_SRC); a.preload="auto"; a.volume=0.65; ZEN_AUDIO.el=a; }catch(e){} return ZEN_AUDIO.el; }
function zenSoundUnlock(){ if(ZEN_AUDIO.unlocked) return; var a=zenSoundInit(); if(!a) return; ZEN_AUDIO.unlocked=true; try{ a.load(); }catch(e){} }
["pointerdown","keydown","touchstart"].forEach(function(ev){ document.addEventListener(ev,zenSoundUnlock,{once:true,capture:true,passive:true}); });
function zenSoundPlay(force){ if(!force&&!notifPref("sound")) return false; var a=zenSoundInit(); if(!a) return false; var now=Date.now(); if(!force&&now-ZEN_AUDIO.lastAt<1200) return false; ZEN_AUDIO.lastAt=now; try{ a.currentTime=0; var p=a.play(); if(p&&p.catch) p.catch(function(){}); return true; }catch(e){ return false; } }
/* ---------- §20 per-user preferences (workspace-level admin toggles stay in WS.notifPrefs) ---------- */
var NOTIF_PREF_DEFAULT={browser:false,sound:true,chat_dm:true,chat_mention:true,chat_group:true,chat_team_general:true,chat_reply:true,task_assigned:true,task_due:true,task_completed:false,blocker:true,project_updates:true,approval:true,prePromptSeen:false};
function notifPrefs(){ var p=myPrefs(); p.notif=Object.assign({},NOTIF_PREF_DEFAULT,p.notif||{}); return p.notif; }
function notifPref(k){ return notifPrefs()[k]!==false; }
function setNotifPref(k,v){ notifPrefs()[k]=v; saveMyPrefs(); }
/* ---------- §16/§17 browser permission ---------- */
function notifPermission(){ return (typeof Notification!=="undefined"&&Notification.permission)||"unsupported"; }
function notifPermissionLabel(){ var p=notifPermission(); return tr(p==="granted"?"Allowed":p==="denied"?"Blocked":p==="unsupported"?"Not supported":"Not enabled"); }
/* The pre-prompt is shown before the browser's own dialog, only after the
   member has done something that benefits from notifications (open chat,
   receive a mention, open notification settings). Never on first load. */
function notifPrePrompt(source,force){ var pf=notifPrefs(); if(notifPermission()==="unsupported") return; if(!force&&(pf.prePromptSeen||notifPermission()!=="default")) return; pf.prePromptSeen=true; saveMyPrefs();
  openModal(tr("Stay updated with ZenCrevia"),'<div class="notif-preprompt"><div class="notif-preprompt-icon">'+I.bell+'</div><p>'+tr("Get notified when:")+'</p><ul><li>'+tr("someone messages you")+'</li><li>'+tr("you are mentioned")+'</li><li>'+tr("a task needs approval")+'</li><li>'+tr("a blocker changes")+'</li><li>'+tr("a project update requires attention")+'</li></ul><p class="hint">'+tr("Your browser will ask once. You can change this any time in Settings → Notifications.")+'</p></div>','<button class="btn" onclick="closeModal()">'+tr("Not now")+'</button><span class="spacer"></span><button class="btn primary" onclick="closeModal();notifRequestPermission()">'+I.bell+tr("Enable notifications")+'</button>'); }
function notifRequestPermission(){ if(notifPermission()==="unsupported") return toast(tr("This browser does not support notifications"),"bad"); zenSoundUnlock(); Notification.requestPermission().then(function(res){ setNotifPref("browser",res==="granted"); if(res==="granted"){ toast(tr("Browser notifications enabled")); zenSoundPlay(true); } else toast(tr(res==="denied"?"Notifications are blocked in the browser settings":"Notifications not enabled"),"bad"); if(S.screen==="settings") renderScreen(false); }); }
function notifBrowserAllowed(){ return notifPermission()==="granted"&&notifPref("browser"); }
function notifShowBrowser(evt){ if(!notifBrowserAllowed()) return false; try{ var n=new Notification(evt.title||"ZenCrevia",{body:evt.body||"",tag:evt.tag||(evt.conversationId||"")+":"+(evt.messageId||evt.type),silent:true,icon:WS.favicon||WS.logoImg||undefined}); n.onclick=function(){ try{ window.focus(); }catch(e){} n.close(); notifOpenTarget(evt); }; setTimeout(function(){ try{ n.close(); }catch(e){} },8000); return true; }catch(e){ return false; } }
function notifOpenTarget(evt){ if(evt.conversationId&&typeof openConversation==="function"){ if(S.screen!=="messages") go("messages"); openConversation(evt.conversationId,evt.messageId); } else if(evt.target&&evt.target.taskId){ openTask(evt.target.taskId); } else if(evt.target&&evt.target.screen){ go(evt.target.screen,evt.target.sub); } }
/* ---------- §142 the pipeline ---------- */
/* evt: {type, priority, title, body, actor, conversationId, messageId, target, inApp, push, sound, prefKey, notifKey} */
function notifEventAllowed(evt){ var key=evt.prefKey||{CHAT_DM:"chat_dm",CHAT_MENTION:"chat_mention",CHAT_REPLY:"chat_reply",CHAT_GROUP:"chat_group",CHAT_TEAM_GENERAL:"chat_team_general",TASK_ASSIGNED:"task_assigned",TASK_DUE:"task_due",TASK_COMPLETED:"task_completed",TASK_BLOCKED:"blocker",TASK_UNBLOCKED:"blocker",PROJECT_UPDATED:"project_updates",APPROVAL_REQUESTED:"approval",APPROVAL_APPROVED:"approval",APPROVAL_REJECTED:"approval"}[evt.type]; if(key&&!notifPref(key)) return false;
  /* conversation override sits on top of the global preference (§142.1) */
  if(evt.conversationId&&typeof convNotifLevel==="function"){ var lvl=convNotifLevel(evt.conversationId); if(lvl==="MUTED") return false; if(lvl==="MENTIONS"&&evt.type!=="CHAT_MENTION"&&evt.type!=="CHAT_DM"&&evt.type!=="CHAT_REPLY") return false; }
  return true; }
function notifForeground(evt){ return !!(evt.conversationId&&S.screen==="messages"&&S.messageConversationId===evt.conversationId&&document.visibilityState==="visible"&&document.hasFocus()); }
function deliverNotification(evt){ if(!evt) return; if(!notifEventAllowed(evt)) return {delivered:false};
  var fg=notifForeground(evt), out={inApp:false,push:false,sound:false};
  if(evt.inApp!==false&&!fg&&evt.notifKey){ NOTIFS.unshift({id:evt.id||uid("nt"),k:evt.notifKey,who:evt.actor||null,t:evt.conversationId||(evt.target&&evt.target.taskId)||evt.title,msg:evt.messageId||null,text:evt.body||"",ago:0,read:false,entityType:evt.conversationId?"message":(evt.entityType||"task")}); syncNotifDot(); if(typeof renderNav==="function") renderNav(); if(typeof messagesBadgeSync==="function") messagesBadgeSync(); out.inApp=true; }
  /* §26/§142.2 foreground dedup: the active conversation shows the message
     itself, so no browser push and only a subtle sound. */
  if(!fg&&evt.push!==false) out.push=notifShowBrowser(evt);
  if(evt.sound!==false) out.sound=zenSoundPlay(false);
  return out; }
/* Existing task/comment events (notify() in core.js) flow through the same
   pipeline in standalone mode so they reach the browser and the chime too. */
function deliverLegacyNotif(n){ var map={assigned:"TASK_ASSIGNED",deadline:"TASK_DUE",missed:"TASK_DUE",approved:"APPROVAL_APPROVED",revision:"APPROVAL_REJECTED",mention:"CHAT_MENTION",comment:"CHAT_REPLY"}; var tk=task(n.t); deliverNotification({type:map[n.k]||"PROJECT_UPDATED",prefKey:n.k==="mention"?"chat_mention":undefined,title:"ZenCrevia",body:fmt(NTEXT[n.k]||n.k,{who:n.who?first(n.who):"",t:tk?tk.title:n.t}).replace(/[“”]/g,'"'),actor:n.who,inApp:false,target:{taskId:tk?tk.id:null}}); }
Object.assign(UI_ID,{"Stay updated with ZenCrevia":"Tetap terhubung dengan ZenCrevia","Get notified when:":"Dapatkan notifikasi saat:","someone messages you":"seseorang mengirimimu pesan","you are mentioned":"kamu disebut (@mention)","a task needs approval":"task memerlukan persetujuan","a blocker changes":"ada perubahan blocker","a project update requires attention":"ada update project yang perlu perhatian","Your browser will ask once. You can change this any time in Settings → Notifications.":"Browser akan bertanya sekali. Ubah kapan saja di Pengaturan → Notifikasi.","Not now":"Nanti saja","Enable notifications":"Aktifkan notifikasi","Browser notifications enabled":"Notifikasi browser aktif","Notifications are blocked in the browser settings":"Notifikasi diblokir di pengaturan browser","Notifications not enabled":"Notifikasi belum diaktifkan","This browser does not support notifications":"Browser ini tidak mendukung notifikasi","Allowed":"Diizinkan","Blocked":"Diblokir","Not enabled":"Belum aktif","Not supported":"Tidak didukung"});
</script>
