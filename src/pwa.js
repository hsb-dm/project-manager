<script>
/* ============================================================
   PWA: INSTALL AS AN APP, AND PUSH NOTIFICATIONS
   ZenCrevia can be installed (Chrome and Edge show Install in the address bar; on an iPhone or iPad,
   Share → Add to Home Screen) and opens in a window of its own. public/sw.js is its service worker.
   Push follows the switch that is already there, "Enable browser notifications" (notify-delivery.js):
   turned on, this device subscribes (server/push.js) and gets notifications with the app closed; turned
   off, it stops. Signing out stops it too, so a shared device does not keep someone else's notifications.
   On an iPhone or iPad, notifications work only from the installed app (iOS 16.4 and later).
   Not in the standalone file (file://): no service worker there.
   ============================================================ */
var PWA={reg:null,deferred:null,pushOn:false,endpoint:null,devices:null,syncedFor:null};
function pwaSupported(){ return location.protocol!=="file:"&&("serviceWorker" in navigator); }
function pwaPushSupported(){ return pwaSupported()&&("PushManager" in window)&&typeof Notification!=="undefined"; }
function pwaStandalone(){ return !!((window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true); }
function pwaIOS(){ return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1); }
function pwaKey(b64){ var s=String(b64).replace(/-/g,"+").replace(/_/g,"/"), raw=atob(s+"===".slice((s.length+3)%4)), out=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i); return out; }

/* this device on: subscribe (no prompt — the browser's permission was asked for by the switch) and tell the server */
function pwaPushOn(){ if(!pwaPushSupported()||!API.on||Notification.permission!=="granted") return Promise.resolve(false);
  return navigator.serviceWorker.ready.then(function(reg){ return Promise.all([reg,apiFetch("GET","/api/push/key"),reg.pushManager.getSubscription()]); })
    .then(function(r){ return r[2]||r[0].pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pwaKey(r[1].publicKey)}); })
    .then(function(sub){ var j=sub.toJSON(); PWA.pushOn=true; PWA.endpoint=j.endpoint; return apiFetch("POST","/api/push/subscribe",{subscription:{endpoint:j.endpoint,keys:j.keys}}); })
    .then(function(r){ PWA.devices=r&&r.devices; pwaRefreshSettings(); return true; })
    .catch(function(e){ console.warn("[push]",e&&e.message); return false; }); }
/* this device off */
function pwaPushOff(){ if(!pwaSupported()) return Promise.resolve();
  return navigator.serviceWorker.ready.then(function(reg){ return reg.pushManager&&reg.pushManager.getSubscription(); }).then(function(sub){ PWA.pushOn=false; PWA.endpoint=null; if(!sub) return; var ep=sub.endpoint; return sub.unsubscribe().then(function(){ if(API.on) return apiFetch("POST","/api/push/unsubscribe",{endpoint:ep}).then(function(r){ PWA.devices=r&&r.devices; }); }); })
    .then(function(){ pwaRefreshSettings(); }).catch(function(){}); }
/* signed in: this device follows the person's switch (and a device someone else used stops getting theirs) */
function pwaSync(){ if(!pwaPushSupported()||!API.on||!ME||!PEOPLE[ME]) return; PWA.syncedFor=ME;
  if(notifPref("browser")&&Notification.permission==="granted") pwaPushOn(); else pwaPushOff(); }
function pwaTest(){ apiFetch("POST","/api/push/test",{}).then(function(r){ PWA.devices=r.devices; toast(tr("Test sent to")+" "+r.sent+" "+tr("device(s)")); pwaRefreshSettings(); }).catch(function(e){ toast(e.message,"bad"); }); }

if(pwaSupported()){
  window.addEventListener("load",function(){
    navigator.serviceWorker.register("/sw.js").then(function(reg){ PWA.reg=reg; return reg.pushManager&&reg.pushManager.getSubscription(); }).then(function(sub){ PWA.pushOn=!!sub; PWA.endpoint=sub?sub.endpoint:null; }).catch(function(){});
    /* once someone is signed in (and again for whoever signs in next) */
    setInterval(function(){ if(window.ZC_READY&&API.on&&ME&&PEOPLE[ME]&&PWA.syncedFor!==ME) pwaSync(); },1500);
  });
  /* a notification clicked while ZenCrevia is open: go to what it is about, no reload */
  navigator.serviceWorker.addEventListener("message",function(e){ if(e.data&&e.data.type==="zc-open") pwaOpenUrl(e.data.url); });
}
function pwaOpenUrl(u){ try{ var x=new URL(u,location.origin), m=x.pathname.match(/^\/messages\/([^\/?#]+)/), t=x.searchParams.get("task");
  if(m&&typeof openConversation==="function") return openConversation(decodeURIComponent(m[1]),x.searchParams.get("msg")||undefined);
  if(t&&typeof openTask==="function"){ var id=(t.match(/^[A-Za-z]+-\d+/)||[t])[0]; if(task(id)) return openTask(id); }
  location.assign(x.href); }catch(e){} }

/* the switch in Settings → Notifications also turns this device's push on or off */
(function(){ if(typeof setNotifPref!=="function") return; var base=setNotifPref;
  setNotifPref=function(k,v){ var out=base.apply(this,arguments); if(k==="browser"){ if(v) pwaPushOn(); else pwaPushOff(); } return out; }; })();
/* with push on, the server sends what the open tab would have shown: one notification, not two */
(function(){ if(typeof notifShowBrowser!=="function") return; var base=notifShowBrowser;
  notifShowBrowser=function(evt){ if(PWA.pushOn&&evt&&evt.type!=="CHAT_TEAM_GENERAL"&&(evt.conversationId||(evt.target&&evt.target.taskId))) return false; return base.apply(this,arguments); }; })();
/* signing out: this device stops getting this person's notifications (core.js sends the endpoint with the sign-out) */
(function(){ if(typeof signOut!=="function") return; var base=signOut;
  signOut=function(){ var out=base.apply(this,arguments); PWA.syncedFor=null; if(pwaSupported()&&PWA.pushOn){ PWA.pushOn=false; PWA.endpoint=null; navigator.serviceWorker.ready.then(function(r){ return r.pushManager.getSubscription(); }).then(function(s){ if(s) s.unsubscribe(); }).catch(function(){}); } return out; }; })();

/* install: the browser's own prompt where there is one (Chrome, Edge), the steps on an iPhone or iPad */
window.addEventListener("beforeinstallprompt",function(e){ e.preventDefault(); PWA.deferred=e; });
window.addEventListener("appinstalled",function(){ PWA.deferred=null; toast(tr("ZenCrevia is installed")); });
function pwaCanInstall(){ return pwaSupported()&&!pwaStandalone()&&(!!PWA.deferred||pwaIOS()); }
function pwaInstall(){ closePops();
  if(PWA.deferred){ var d=PWA.deferred; d.prompt(); d.userChoice.then(function(){ PWA.deferred=null; }); return; }
  if(pwaIOS()) return openModal(tr("Install on iPhone or iPad"),'<p>'+tr("Tap the Share button, then “Add to Home Screen”. Open ZenCrevia from its icon — notifications work only there.")+'</p>','<button class="btn primary" onclick="closeModal()">'+tr("Got it")+'</button>');
  toast(tr("Use the install button in the address bar, or the browser menu → Install ZenCrevia.")); }
(function(){ if(typeof userMenuHtml!=="function") return; var base=userMenuHtml;
  userMenuHtml=function(){ var h=base.apply(this,arguments); if(!pwaCanInstall()) return h; var item='<button onclick="pwaInstall()"><svg viewBox="0 0 24 24" class="i"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>'+tr("Install app")+'</button>';
    var at=h.lastIndexOf('<div class="mh"></div><button onclick="signOut()"'); return at<0?h:h.slice(0,at)+item+h.slice(at); }; })();

/* Settings → Notifications: this device */
function pwaDeviceHtml(){ if(!pwaSupported()) return "";
  var line, act="";
  if(!pwaPushSupported()) line=pwaIOS()&&!pwaStandalone()?tr("On iPhone and iPad, add ZenCrevia to the Home Screen first; notifications then work from its icon."):tr("This browser cannot receive push notifications.");
  else if(PWA.pushOn){ line=tr("Push notifications are on for this device.")+" "+tr("Notifications reach you even when ZenCrevia is closed."); act='<button class="btn sm" onclick="pwaTest()">'+I.bell+tr("Send a test")+'</button>'; }
  else line=tr("Push notifications are off for this device.")+" "+tr("Turn on browser notifications above to get them on this device.");
  if(pwaCanInstall()) act+='<button class="btn sm" onclick="pwaInstall()">'+tr("Install app")+'</button>';
  return '<div class="pref pwa-device"><div class="pl"><b>'+tr("This device")+'</b><span>'+esc(line)+(PWA.devices?' · '+tr("Devices with notifications on")+': <b>'+PWA.devices+'</b>':'')+'</span></div>'+act+'</div>'; }
/* The installed app's icon is the favicon the workspace uses (server.js pwaManifest). The server cannot resize
   images, so an admin's browser draws it at each size and sends the PNGs whenever the favicon in use is not the
   one they were drawn from. With no favicon uploaded, ZenCrevia's own mark is the icon. */
function pwaStrHash(s){ var h=5381; s=String(s||""); for(var i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36)+"-"+s.length.toString(36); }
function pwaDrawIcons(src){ return new Promise(function(ok,no){ var img=new Image();
  img.onload=function(){ var w=img.naturalWidth||512, h=img.naturalHeight||512, draw=function(size,bg,fill){ var c=document.createElement("canvas"); c.width=c.height=size; var x=c.getContext("2d"); if(bg){ x.fillStyle=bg; x.fillRect(0,0,size,size); } var k=Math.min(size*fill/w,size*fill/h), dw=w*k, dh=h*k; x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high"; x.drawImage(img,(size-dw)/2,(size-dh)/2,dw,dh); return c.toDataURL("image/png"); };
    /* any: the favicon as it is; maskable and iPhone: on white, inside the area the platform does not cut away */
    ok({"192":draw(192,null,1),"512":draw(512,null,1),"maskable-512":draw(512,"#FFFFFF",.72),"apple-180":draw(180,"#FFFFFF",.86)}); };
  img.onerror=function(){ no(new Error("the favicon could not be drawn")); }; img.src=src; }); }
function pwaIconsSync(){ if(!API.on||!WS||!WS.favicon||!canI.manageWorkspace()) return Promise.resolve(); var src=WS.favicon, h=pwaStrHash(src);
  return apiFetch("GET","/api/workspace/pwa-icons").then(function(r){ if(r&&r.hash===h&&r.live) return; return pwaDrawIcons(src).then(function(icons){ if(WS.favicon!==src) return; return apiFetch("PUT","/api/workspace/pwa-icons",{hash:h,icons:icons}); }); }).catch(function(e){ console.warn("[pwa icon]",e&&e.message); }); }
if(pwaSupported()) setInterval(function(){ if(window.ZC_READY&&API.on&&window.WS&&WS.favicon!==PWA.iconSrc){ PWA.iconSrc=WS.favicon; pwaIconsSync(); } },2000);
function pwaRefreshSettings(){ var el=document.querySelector(".pwa-device"); if(el&&S.screen==="settings"){ var t=document.createElement("div"); t.innerHTML=pwaDeviceHtml(); if(t.firstChild){ el.replaceWith(t.firstChild); if(typeof localizeVisibleText==="function") localizeVisibleText(document.querySelector(".pwa-device")); } } }
</script>
