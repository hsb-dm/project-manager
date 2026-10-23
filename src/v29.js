<script>
/* ZenCrevia v29 — readiness fixes (see IMPLEMENTATION-NOTES-v29.md).
   Loaded after every feature module and before boot.js. */

/* ---------- Members: deactivate / reactivate ----------
   The server route POST /api/members/:id/active already existed; the UI had no control.
   Deactivation blocks sign-in and ends sessions but keeps tasks, history and ownership,
   so it is the safe alternative to Remove. */
function toggleMemberActive(id){
  var p=PEOPLE[id]; if(!p||!API.on) return;
  var activate=p.active===false;
  var go=function(){
    apiFetch("POST","/api/members/"+encodeURIComponent(id)+"/active",{active:activate})
      .then(function(d){ PEOPLE=d.people||d; WS.people=PEOPLE; refresh(); toast(activate?tr("Member reactivated"):tr("Member deactivated — sign-in blocked, work kept"),activate?"":"bad"); })
      .catch(function(e){ fail(e); });
  };
  if(activate) return go();
  confirmModal(tr("Deactivate")+" "+esc(p.name)+"?",
    tr("They are signed out everywhere and cannot sign in. Their tasks, comments and history stay as they are. You can reactivate them at any time."),
    go);
}

/* ---------- Mobile floating buttons ----------
   Two stacked FABs (Messages + AI) covered the last rows of content on phones.
   On narrow screens: hide the FAB that duplicates the current screen, hide both
   while the user scrolls down, bring them back on scroll up, and reserve space at
   the bottom of the content so nothing sits permanently underneath them. */
(function(){
  var MOBILE=function(){ return window.innerWidth<=760; };
  function sync(){
    var b=document.body; if(!b) return;
    var scr=(typeof S!=="undefined"&&S.screen)||"";
    b.setAttribute("data-screen",scr);
    b.classList.toggle("v29-mobile",MOBILE());
  }
  var lastY=0, ticking=false;
  function onScroll(e){
    if(!MOBILE()||ticking) return; ticking=true;
    requestAnimationFrame(function(){
      ticking=false;
      var t=e&&e.target&&e.target!==document?e.target:document.scrollingElement||document.documentElement;
      var y=t.scrollTop||0, down=y>lastY+6, up=y<lastY-6;
      if(down&&y>80) document.body.classList.add("fab-tucked");
      else if(up||y<40) document.body.classList.remove("fab-tucked");
      lastY=y;
    });
  }
  document.addEventListener("scroll",onScroll,true);
  window.addEventListener("resize",sync);
  if(typeof renderScreen==="function"){
    var orig=renderScreen;
    renderScreen=function(){ var r=orig.apply(this,arguments); try{ sync(); document.body.classList.remove("fab-tucked"); lastY=0; }catch(e){} return r; };
  }
  document.addEventListener("DOMContentLoaded",sync); sync();
})();

/* ---------- Mobile calendar ----------
   Month cells on a 390 px screen are ~50 px wide, so chip titles were cut to
   "Roads…". On phones the month grid becomes an overview (coloured bars per item)
   and tapping a day opens that day's full agenda instead of a cramped chip. */
document.addEventListener("click",function(e){
  if(window.innerWidth>760) return;
  /* every month calendar: the Calendar screen, the calendar view in Tasks, a project's calendar */
  if(typeof S==="undefined"||S.calMode!=="month") return;
  var cell=e.target.closest&&e.target.closest(".cal-grid .cal-day");
  if(!cell||e.target.closest(".task-check,.checkbox,button")) return;
  var off=+cell.getAttribute("data-off"); if(isNaN(off)||typeof calAgenda!=="function") return;
  e.preventDefault(); e.stopPropagation();
  calAgenda(iso(off));
},true);

/* ---------- Translations for strings added in v29 ---------- */
Object.assign(UI_ID,{
  "Deactivate":"Nonaktifkan","Reactivate":"Aktifkan lagi",
  "Member reactivated":"Anggota diaktifkan lagi",
  "Member deactivated — sign-in blocked, work kept":"Anggota dinonaktifkan — tidak bisa masuk, pekerjaannya tetap ada",
  "They are signed out everywhere and cannot sign in. Their tasks, comments and history stay as they are. You can reactivate them at any time.":"Semua sesinya diakhiri dan ia tidak bisa masuk. Task, komentar, dan riwayatnya tetap utuh. Kamu bisa mengaktifkannya lagi kapan saja.",
  "Allow this member to sign in again":"Izinkan anggota ini masuk lagi",
  "Block sign-in but keep their work and history":"Blokir akses masuk tanpa menghapus pekerjaan dan riwayat",
  "The server sets this schedule through COS_BACKUP_INTERVAL_HOURS":"Jadwal ini diatur server lewat COS_BACKUP_INTERVAL_HOURS",
  "Remove the variable to manage it here.":"Hapus variabel itu agar bisa diatur dari sini.",
  "set by server":"diatur server","Every":"Setiap","Manual only":"Manual saja",
  "Off":"Mati","Daily":"Harian","Weekly":"Mingguan",
  "No projects yet":"Belum ada project","No archived projects":"Belum ada project terarsip",
  "Completed projects move here automatically the month after they finish.":"Project selesai otomatis pindah ke sini sebulan setelah rampung.",
  "Projects group related tasks, milestones and final assets. Create the first one to start planning.":"Project mengelompokkan task, milestone, dan aset final. Buat project pertama untuk mulai merencanakan."
});
</script>
<script>
/* ---------- Slim history tasks (v29 scale) ----------
   Tasks finished more than COS_TASK_HOT_DAYS ago arrive without comments, versions,
   files and activity. They are complete for lists, calendars, search and analytics;
   opening one fetches the full record first. */
(function(){
  if (typeof openTask!=="function") return;
  var baseOpen=openTask, loading={};
  openTask=function(id){
    var tk=typeof task==="function"?task(id):null, args=arguments, self=this;
    if (!tk||!tk._slim||!API.on) return baseOpen.apply(self,args);
    if (loading[id]) return;
    loading[id]=true;
    return apiFetch("GET","/api/tasks/"+encodeURIComponent(id)).then(function(d){
      var full=hTask(d); delete full._slim; replaceInto(tk,full); delete tk._slim;
      delete loading[id]; return baseOpen.apply(self,args);
    }).catch(function(e){ delete loading[id]; fail(e); });
  };
})();
</script>
<script>
/* ---------- Forgot / reset password (v29) ----------
   Link format: APP_URL/?reset=<64 hex>. The token is taken out of the address bar
   immediately so it does not stay in history, screenshots or shared URLs. */
(function(){
  try{
    var q=new URLSearchParams(location.search), t=q.get("reset");
    if(t&&/^[a-f0-9]{64}$/.test(t)){
      AUTH.resetToken=t; AUTH.tab="reset";
      q.delete("reset"); history.replaceState(null,"",location.pathname+(q.toString()?"?"+q:"")+location.hash);
    }
  }catch(e){}
})();
function authForgotForm(){
  if(AUTH.forgotSent) return '<div class="auth-note" role="status"><b>'+tr("Check your email")+'</b><p>'+tr("If that address belongs to an active account, a reset link is on its way. Check your inbox and spam folder.")+'</p><p class="hint">'+tr("The link works once and expires in")+' '+(AUTH.resetMinutes||60)+' '+tr("minutes.")+'</p></div><button class="btn" style="width:100%;justify-content:center;padding:11px" onclick="AUTH.forgotSent=false;AUTH.tab=\'login\';showLogin()">'+tr("Back to sign in")+'</button>';
  return '<h2 class="auth-title">'+tr("Reset your password")+'</h2><p class="hint" style="margin:-4px 0 14px">'+tr("Enter the email you sign in with. We will send you a link to choose a new password.")+'</p>'
    +'<div class="field"><label for="au_email">'+tr("Email")+'</label><input id="au_email" type="email" placeholder="you@company.com" autocomplete="username" value="'+attr(AUTH.lastEmail||"")+'" onkeydown="if(event.key===\'Enter\')doForgot()"></div>'
    +'<div class="err" id="au_err" role="alert"></div><button class="btn primary" id="au_submit" style="width:100%;justify-content:center;padding:11px" onclick="doForgot()">'+tr("Send reset link")+'</button>'
    +'<p class="hint" style="margin-top:12px;text-align:center"><button type="button" class="linkbtn" onclick="AUTH.tab=\'login\';showLogin()">'+tr("Back to sign in")+'</button></p>';
}
function authResetForm(inModal){
  if(AUTH.resetDone) return '<div class="auth-note" role="status"><b>'+tr("Password updated")+'</b><p>'+tr("Sign in with your new password. You have been signed out on every other device.")+'</p></div><button class="btn primary" style="width:100%;justify-content:center;padding:11px" onclick="AUTH.resetDone=false;AUTH.tab=\'login\';showLogin()">'+tr("Sign in")+'</button>';
  if(AUTH.resetInvalid) return '<div class="errbox" role="alert" style="margin-bottom:14px">'+tr("This reset link is invalid, already used or expired. Request a new one.")+'</div><button class="btn primary" style="width:100%;justify-content:center;padding:11px" onclick="AUTH.resetInvalid=false;AUTH.tab=\'forgot\';showLogin()">'+tr("Request a new link")+'</button>';
  if(AUTH.resetToken&&AUTH.resetChecked!==AUTH.resetToken){ AUTH.resetChecked=AUTH.resetToken; apiFetch("POST","/api/auth/reset/check",{token:AUTH.resetToken}).then(function(r){ if(!r.valid){ AUTH.resetInvalid=true; showLogin(); } }).catch(function(){}); }
  return (inModal?'':'<h2 class="auth-title">'+tr("Choose a new password")+'</h2>')+'<p class="hint" style="margin:-4px 0 14px">'+tr("At least 8 characters. A short sentence is easier to remember than random symbols.")+'</p>'
    +'<div class="field"><label for="rs_pw">'+tr("New password")+'</label><input id="rs_pw" type="password" autocomplete="new-password" minlength="8"></div>'
    +'<div class="field"><label for="rs_pw2">'+tr("Repeat new password")+'</label><input id="rs_pw2" type="password" autocomplete="new-password" onkeydown="if(event.key===\'Enter\')doReset()"></div>'
    +'<div class="err" id="au_err" role="alert"></div><button class="btn primary" id="au_submit" style="width:100%;justify-content:center;padding:11px" onclick="doReset()">'+tr("Save new password")+'</button>';
}
function authBusy(on){ var b=document.getElementById("au_submit"); if(b){ b.disabled=!!on; b.setAttribute("aria-busy",on?"true":"false"); } }
function doForgot(){
  var email=val("au_email"); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr(tr("Enter a valid email address"));
  AUTH.lastEmail=email; authBusy(true);
  apiFetch("POST","/api/auth/forgot",{email:email}).then(function(r){ AUTH.resetMinutes=r&&r.minutes; AUTH.forgotSent=true; showLogin(); })
    .catch(function(e){ authBusy(false); authErr(tr(e.message)); });
}
function doReset(){
  var a=document.getElementById("rs_pw").value, b=document.getElementById("rs_pw2").value;
  var problem=passwordClientProblem(a); if(problem) return authErr(tr(problem));
  if(a!==b) return authErr(tr("Passwords do not match"));
  authBusy(true);
  apiFetch("POST","/api/auth/reset",{token:AUTH.resetToken,password:a}).then(function(){
    AUTH.resetToken=null; AUTH.resetDone=true;
    if(!document.body.classList.contains("auth")){ closeModal(); toast(tr("Password updated")); SESSION.user=null; showLogin(); return; }
    showLogin();
  }).catch(function(e){ authBusy(false); if(/invalid, already used or expired/.test(e.message)){ AUTH.resetInvalid=true; closeModal(); showLogin(); } else authErr(tr(e.message)); });
}
/* A reset link opened while already signed in: offer the same form in a modal. */
window.addEventListener("load",function(){ setTimeout(function(){
  if(!AUTH.resetToken||document.body.classList.contains("auth")||typeof openModal!=="function") return;
  openModal(tr("Choose a new password"),'<div class="authform">'+authResetForm(true)+'</div>','');
},1200); });
Object.assign(UI_ID,{
  "Forgot password?":"Lupa password?","Reset your password":"Atur ulang password",
  "Enter the email you sign in with. We will send you a link to choose a new password.":"Masukkan email yang kamu pakai untuk masuk. Kami akan mengirim tautan untuk membuat password baru.",
  "Send reset link":"Kirim tautan reset","Back to sign in":"Kembali ke halaman masuk","Check your email":"Cek email kamu",
  "If that address belongs to an active account, a reset link is on its way. Check your inbox and spam folder.":"Jika alamat itu terdaftar di akun aktif, tautan reset sedang dikirim. Cek kotak masuk dan folder spam.",
  "The link works once and expires in":"Tautan hanya bisa dipakai sekali dan berlaku","minutes.":"menit.",
  "Choose a new password":"Buat password baru","At least 8 characters. A short sentence is easier to remember than random symbols.":"Minimal 8 karakter. Kalimat pendek lebih mudah diingat daripada simbol acak.",
  "New password":"Password baru","Repeat new password":"Ulangi password baru","Save new password":"Simpan password baru",
  "Password updated":"Password diperbarui","Sign in with your new password. You have been signed out on every other device.":"Masuk dengan password baru. Semua sesi di perangkat lain sudah diakhiri.",
  "This reset link is invalid, already used or expired. Request a new one.":"Tautan reset ini tidak valid, sudah dipakai, atau kedaluwarsa. Minta tautan baru.",
  "Request a new link":"Minta tautan baru","Enter a valid email address":"Masukkan alamat email yang valid",
  "Password must contain at least 8 characters":"Password minimal 8 karakter","Password must be at least 8 characters":"Password minimal 8 karakter","Password must combine at least three of: lowercase, uppercase, numbers, and symbols":"Password harus menggabungkan minimal tiga dari: huruf kecil, huruf besar, angka, dan simbol","Passwords do not match":"Password tidak sama",
  "Too many reset requests. Try again later.":"Terlalu banyak permintaan reset. Coba lagi nanti."
});
</script>
<script>
/* ---------- Email delivery warning (v29) ----------
   With the default "log" transport, notification and password-reset emails are only
   written to data/outbox. Admins now see that on Home until SMTP is configured. */
(function(){
  var MAIL={transport:null};
  if(typeof loadBootstrap==="function"){ var lb=loadBootstrap; loadBootstrap=function(d){ MAIL.transport=d&&d.mail?d.mail.transport:null; return lb.apply(this,arguments); }; }
  function dismissed(){ try{ return sessionStorage.getItem("zc.mailWarn")==="1"; }catch(e){ return false; } }
  window.zcDismissMailWarn=function(){ try{ sessionStorage.setItem("zc.mailWarn","1"); }catch(e){} var b=document.getElementById("zcMailWarn"); if(b) b.remove(); };
  function paint(){
    if(!API.on||MAIL.transport!=="log"||dismissed()||typeof S==="undefined"||S.screen!=="home"||!canI.manageWorkspace()) return;
    var c=document.getElementById("content"); if(!c||document.getElementById("zcMailWarn")) return;
    var d=document.createElement("div"); d.id="zcMailWarn"; d.className="banner warn zc-mail-warn"; d.setAttribute("role","status");
    d.innerHTML='<span><b>'+tr("Email is not being delivered.")+'</b> '+tr("Notifications and password-reset links are only written to the server outbox until SMTP is set up.")+'</span><span class="zc-mail-warn-actions"><button class="btn xs primary" onclick="go(\'settings\',\'notifications\')">'+tr("Set up email")+'</button><button class="btn xs ghost" aria-label="'+tr("Dismiss")+'" onclick="zcDismissMailWarn()">'+tr("Dismiss")+'</button></span>';
    c.insertBefore(d,c.firstChild);
  }
  if(typeof renderScreen==="function"){ var rs=renderScreen; renderScreen=function(){ var r=rs.apply(this,arguments); try{ paint(); }catch(e){} return r; }; }
  Object.assign(UI_ID,{"Email is not being delivered.":"Email belum terkirim.","Notifications and password-reset links are only written to the server outbox until SMTP is set up.":"Notifikasi dan tautan reset password hanya ditulis ke outbox server sampai SMTP diatur.","Set up email":"Atur email","Dismiss":"Tutup"});
})();
</script>
<script>
/* ---------- Form labels (v29 a11y) ----------
   Many forms render <div class="field"><label>Name</label><input id="x"></div> without
   for= on the label, so screen readers announce an unnamed field. Link each such label
   to the single control in its field (and name unlabeled selects from their label).
   Only what was added since the last frame is looked at — the nodes put on the page, and any field whose
   controls changed — never the whole page again. A select's own .labels was read for every select on the
   page at each frame, and each read walked the whole page: with 1,500 tasks the Grid's thousands of
   selects took 34 of its 39 seconds. Whether a <label> names a select is now answered from the select's
   own ancestors and the page's label[for] list, which is what .labels says. A select already handled is
   marked and not looked at again unless its field changes. */
(function(){
  var LABELS=".field > label:not([for])", SELECTS="select:not([aria-label]):not([aria-labelledby])",
      CONTROLS="input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea";
  var pending=false, whole=true, roots=[], handled=new WeakSet();
  function each(root,sel,fn){ if(root.matches&&root.matches(sel)) fn(root); var l=root.querySelectorAll(sel); for(var i=0;i<l.length;i++) fn(l[i]); }
  /* what select.labels.length>0 says: a <label> ancestor whose control is this select, or a label[for] its id */
  function labelled(s,ctx){
    for(var a=s.parentElement;a;a=a.parentElement) if(a.tagName==="LABEL"&&a.control===s) return true;
    if(!s.id) return false;
    if(!ctx.forIds){ ctx.forIds=new Set(); var ls=document.querySelectorAll("label[for]"); for(var i=0;i<ls.length;i++) ctx.forIds.add(ls[i].htmlFor); }
    return ctx.forIds.has(s.id)&&document.getElementById(s.id)===s;
  }
  function link(list){
    var ctx={}, seenL=new Set(), seenS=new Set();
    list.forEach(function(r){ each(r.el,LABELS,function(l){ if(seenL.has(l)) return; seenL.add(l);
      var f=l.parentElement, ctl=f.querySelectorAll(CONTROLS);
      if(ctl.length!==1) return; var c=ctl[0];
      if(!c.id) c.id="zcf_"+Math.random().toString(36).slice(2,9);
      l.htmlFor=c.id;
    }); });
    list.forEach(function(r){ each(r.el,SELECTS,function(s){ if(seenS.has(s)||(!r.field&&handled.has(s))) return; seenS.add(s); handled.add(s);
      if(labelled(s,ctx)) return;
      var f=s.closest(".field,.pref"), l=f&&f.querySelector("label,.pl b,b");
      if(l&&l.textContent.trim()) s.setAttribute("aria-label",l.textContent.trim().slice(0,80));
    }); });
  }
  new MutationObserver(function(recs){
    /* the first frame looks at the whole page once, as before; after that only what changed */
    if(!whole) for(var i=0;i<recs.length;i++){ var a=recs[i].addedNodes, t=recs[i].target;
      for(var j=0;j<a.length;j++) if(a[j].nodeType===1) roots.push({el:a[j],field:false});
      var f=t.nodeType===1&&t.closest(".field,.pref"); if(f) roots.push({el:f,field:true}); }
    if(pending) return; pending=true;
    requestAnimationFrame(function(){ pending=false; var list=roots; roots=[];
      if(whole){ whole=false; list=[{el:document.documentElement,field:true}]; }
      try{ link(list.filter(function(r){ return r.el.isConnected; })); }catch(e){} });
  }).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>
<script>
/* ---------- Theme tab for non-admins (v29) ----------
   The controls looked live but the server rejected every change. Show it read-only. */
(function(){
  if(typeof setThemeTab!=="function") return;
  var base=setThemeTab;
  /* the look is personal (personal-theme.js): everyone uses this tab for their own; the workspace's own
     parts — its font list and how task cards are coloured — are drawn for admins only (settings.js) */
  setThemeTab=function(){ var h=base.apply(this,arguments); if(canI.manageWorkspace()) return h;
    return '<div class="banner" role="note" style="margin-bottom:12px">'+tr("Your look is personal: only your account changes.")+'</div>'+h; };
  Object.assign(UI_ID,{"Only workspace admins can change the theme. Your own light/dark preference is in the top bar.":"Hanya admin workspace yang bisa mengubah tema. Preferensi terang/gelap pribadimu ada di bilah atas."});
})();
</script>
<script>
/* ---------- v31: connection state, friendly network errors, dialogs ---------- */
Object.assign(UI_ID,{"Can't reach the ZenCrevia server":"Server ZenCrevia tidak dapat dihubungi","Check your connection. Nothing has been lost; the app will try again automatically.":"Periksa koneksimu. Tidak ada yang hilang; aplikasi akan mencoba lagi otomatis.","Try again now":"Coba lagi sekarang","Retrying in":"Mencoba lagi dalam",
  "Offline — changes will not be saved":"Offline — perubahan tidak tersimpan","Reconnecting…":"Menghubungkan ulang…",
  "No connection. Your change was not saved — try again when you are back online.":"Tidak ada koneksi. Perubahanmu tidak tersimpan — coba lagi saat kembali online.",
  "The server did not respond. Your change was not saved.":"Server tidak merespons. Perubahanmu tidak tersimpan.",
  "Your session has ended. Sign in again.":"Sesi kamu sudah berakhir. Silakan masuk lagi.",
  "Notifications for this conversation":"Notifikasi untuk percakapan ini"});
/* 1. The status pill said "Connected" while the browser was offline. */
(function(){
  function paint(){ var el=document.getElementById("conn"), t=document.getElementById("connTxt"); if(!el||!t||!API.on) return;
    var off=navigator.onLine===false||ZC_NET.streamDown; el.classList.toggle("off",off); 
    t.textContent=navigator.onLine===false?tr("Offline — changes will not be saved"):ZC_NET.streamDown?tr("Reconnecting…"):tr("Connected"); }
  window.ZC_NET={streamDown:false,paint:paint};
  addEventListener("online",function(){ paint(); if(typeof reloadAll==="function") reloadAll().catch(function(){}); });
  addEventListener("offline",paint);
  if(typeof setConn==="function"){ var sc=setConn; setConn=function(){ var r=sc.apply(this,arguments); paint(); return r; }; }
  if(typeof EventSource==="function"){ var ES=EventSource; window.EventSource=function(u,o){ var es=new ES(u,o); es.addEventListener("error",function(){ ZC_NET.streamDown=true; paint(); }); es.addEventListener("open",function(){ ZC_NET.streamDown=false; paint(); }); return es; }; window.EventSource.prototype=ES.prototype; ["CONNECTING","OPEN","CLOSED"].forEach(function(k){ window.EventSource[k]=ES[k]; }); }
})();
/* 2. Raw "Failed to fetch" in toasts (English even in Indonesian UI) becomes a plain message. */
(function(){
  if(typeof fail!=="function") return; var base=fail;
  fail=function(e,msg){ var m=String(e&&e.message||"");
    if(navigator.onLine===false||/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return base(e,tr("No connection. Your change was not saved — try again when you are back online."));
    if(/aborted|timeout/i.test(m)) return base(e,tr("The server did not respond. Your change was not saved."));
    if(/Please sign in/.test(m)){ base(e,tr("Your session has ended. Sign in again.")); if(typeof showLogin==="function") setTimeout(function(){ SESSION.user=null; showLogin(); },800); return; }
    return base(e,msg?tr(msg):msg); };
})();
/* 3. Dialog semantics + focus return. The modal and task drawer trapped focus and closed on
   Esc, but screen readers were not told they were dialogs, and focus was left on a hidden
   button after closing instead of returning to what opened it.
   Focus goes back once, when the last open dialog closes — not after every redraw. This used to run on
   any class change anywhere on the page and, whenever focus had fallen to the page itself (a redraw
   replaced the focused control), pulled it onto a control found by scanning every [onclick] element,
   so focus moved by itself. What opened the dialog is remembered when the dialog opens. */
(function(){
  var last=null, lastSig=null, wasOpen=false;
  function set(el,k,v){ if(el.getAttribute(k)!==v) el.setAttribute(k,v); }
  function mark(){ var m=document.getElementById("modal"), d=document.getElementById("drawer");
    if(m){ set(m,"role","dialog"); set(m,"aria-modal","true"); var h=m.querySelector("h2,h3,.modal-title,.mh b,.mh h2"); if(h){ if(!h.id) h.id="modalTitle"; set(m,"aria-labelledby",h.id); } }
    if(d){ set(d,"role","dialog"); set(d,"aria-modal","true"); var t=d.querySelector(".dr-title"); if(t){ if(!t.id) t.id="drawerTitle"; set(d,"aria-labelledby",t.id); } } }
  function isOpen(){ var m=document.getElementById("modalWrap"), d=document.getElementById("drawer"); return !!((m&&m.classList.contains("open"))||(d&&d.classList.contains("open"))); }
  function sig(t){ return t?{id:t.id,click:t.getAttribute&&t.getAttribute("onclick"),text:(t.innerText||"").trim().slice(0,40)}:null; }
  document.addEventListener("focusin",function(e){ var t=e.target; if(t&&t.closest&&!t.closest("#modalWrap,#drawer,#overlay")){ last=t; lastSig=wasOpen?sig(t):null; } },true);
  /* the opener is often re-rendered while the dialog is open; find its replacement */
  function opener(){ if(last&&document.contains(last)) return last; if(!lastSig) return null;
    if(lastSig.id){ var byId=document.getElementById(lastSig.id); if(byId) return byId; }
    if(lastSig.click){ var c=[].slice.call(document.querySelectorAll('[onclick="'+CSS.escape(lastSig.click)+'"]')).filter(function(x){ return x.offsetParent&&!x.closest("#modalWrap,#drawer"); }); if(c.length===1) return c[0]; var t=c.filter(function(x){ return (x.innerText||"").trim().slice(0,40)===lastSig.text; }); if(t.length) return t[0]; }
    return null; }
  /* A dialog over the task panel (a confirm, say) gives the focus back to the panel's control that opened it when it
     closes (Esc closes it alone and leaves the panel open: src/core.js), the same way: the panel's control that last
     had the focus before the dialog opened (for a dialog opened from one of the panel's menus, that menu's button). */
  var mWas=false, inDr=null, inDrSig=null, drLast=null;
  function modalOpen(){ var m=document.getElementById("modalWrap"); return !!(m&&m.classList.contains("open")); }
  function drawerOpen(){ var d=document.getElementById("drawer"); return !!(d&&d.classList.contains("open")); }
  document.addEventListener("focusin",function(e){ var t=e.target; if(t&&t.closest&&t.closest("#drawer")) drLast=t; },true);
  function inDrawer(){ if(inDr&&inDr.isConnected&&inDr.closest("#drawer")) return inDr; var s=inDrSig, d=document.getElementById("drawer"); if(!s||!d) return null;
    if(s.id){ var byId=document.getElementById(s.id); if(byId&&d.contains(byId)) return byId; }
    if(s.click){ var c=[].slice.call(d.querySelectorAll('[onclick="'+CSS.escape(s.click)+'"]')); if(c.length===1) return c[0]; var t=c.filter(function(x){ return (x.innerText||"").trim().slice(0,40)===s.text; }); if(t.length) return t[0]; }
    return null; }
  function changed(recs){ mark(); var now=isOpen(), was=wasOpen||(recs||[]).some(function(r){ return /(^|\s)open(\s|$)/.test(r.oldValue||""); });
    if(!was&&now) lastSig=sig(last);
    if(was&&!now){ var a=document.activeElement;
      if(a===document.body||!a||a.closest&&a.closest("#modalWrap,#drawer")){ if(!lastSig) lastSig=sig(last); var o=opener(); if(o){ try{ o.focus({preventScroll:true}); }catch(e){} } } }
    var mNow=modalOpen();
    if(mNow&&!mWas){ inDr=drawerOpen()?drLast:null; inDrSig=inDr?sig(inDr):null; }
    if(!mNow&&mWas&&drawerOpen()){ var b=document.activeElement;
      if(!b||b===document.body||b.closest&&b.closest("#modalWrap")){ var od=inDrawer(); if(od){ try{ od.focus({preventScroll:true}); }catch(e){} } } }
    if(!mNow){ inDr=null; inDrSig=null; }
    if(!drawerOpen()) drLast=null;
    mWas=mNow; wasOpen=now; }
  var opens=new MutationObserver(changed), parts=new MutationObserver(function(){ mark(); });
  ["modalWrap","drawer"].forEach(function(id){ var el=document.getElementById(id); if(el) opens.observe(el,{attributes:true,attributeFilter:["class"],attributeOldValue:true}); });
  /* the dialog's title is drawn again with its content */
  ["modal","drawer"].forEach(function(id){ var el=document.getElementById(id); if(el) parts.observe(el,{childList:true,subtree:true}); });
  mark(); wasOpen=isOpen(); mWas=modalOpen();
})();
</script>
