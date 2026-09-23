<script>
/* ============================================================
   v38 — live-deployment fixes (see IMPLEMENTATION-NOTES-v38.md)
   Wrappers keep the original functions (var base=fn; fn=function(){…}) as described in
   docs/HANDOVER.md §5.2. No function declared here shares a name with another file.
   ============================================================ */
Object.assign(UI_ID,{
  "Zoom":"Zoom","Fit":"Pas","Up to 10 attachments per comment":"Maksimal 10 lampiran per komentar","Could not read":"Tidak bisa membaca",
  "This file is an approved version. It cannot be removed.":"File ini adalah versi yang sudah disetujui dan tidak bisa dihapus.",
  "Remove file and version?":"Hapus file dan versinya?","is also Version":"juga merupakan Versi","The version and its annotations will be removed too.":"Versi dan anotasinya ikut dihapus.",
  "Allow self-registration":"Izinkan pendaftaran mandiri","Shows a Register tab on the sign-in page and the page":"Menampilkan tab Daftar di halaman masuk dan halaman",
  "New accounts get the default role below.":"Akun baru mendapat role bawaan di bawah.",
  "Registration is on without a join code: anyone who knows the address can create an account. Continue?":"Pendaftaran aktif tanpa kode bergabung: siapa pun yang tahu alamatnya bisa membuat akun. Lanjutkan?",
  "The server could not be reached (":"Server tidak dapat dihubungi (","). It may be restarting — try again in a minute.":"). Server mungkin sedang restart — coba lagi sebentar lagi.",
  "The request took too long (":"Permintaan terlalu lama (","). Try again; for AI, pick a faster model or a smaller size.":"). Coba lagi; untuk AI, pilih model yang lebih cepat atau ukuran lebih kecil.",
  "That upload is too large.":"Unggahan terlalu besar.","Unexpected server response (HTTP ":"Respons server tidak terduga (HTTP ",
  "Show password":"Tampilkan password","Hide password":"Sembunyikan password","That item is not available to you":"Item itu tidak tersedia untukmu",
  "Project not found — it may have been deleted or you no longer have access.":"Project tidak ditemukan — mungkin sudah dihapus atau kamu tidak punya akses lagi.",
  "Write":"Tulis","Preview":"Pratinjau","Bold":"Tebal","Italic":"Miring","Strikethrough":"Coret","Heading":"Judul","Bullet list":"Daftar poin","Numbered list":"Daftar bernomor","Quote":"Kutipan","Link":"Tautan","Code":"Kode",
  "Formatting uses Markdown: **bold**, *italic*, # heading, - list. Pasted text keeps its styling.":"Format memakai Markdown: **tebal**, *miring*, # judul, - daftar. Teks yang ditempel tetap mempertahankan gayanya.",
  "Nothing to preview yet.":"Belum ada yang bisa dipratinjau.","No description.":"Tidak ada deskripsi.","Description":"Deskripsi","Link URL (https://…)":"URL tautan (https://…)",
  "Appearance is personal: only your account changes.":"Tampilan bersifat pribadi: hanya akunmu yang berubah.",
  "Verified":"Terverifikasi","Key saved — not tested":"Kunci tersimpan — belum dites","Test failed":"Tes gagal","Not set":"Belum diatur","Last check":"Pengecekan terakhir",
  "Save & test connection":"Simpan & tes koneksi","Testing connection…":"Mengetes koneksi…","Connection works":"Koneksi berhasil","Connection failed":"Koneksi gagal",
  "Image provider":"Provider gambar","Choose the provider that matches your API key.":"Pilih provider yang sesuai dengan API key-mu.",
  "Google Drive connection":"Koneksi Google Drive","Test Google Drive":"Tes Google Drive","Drive works":"Drive berfungsi","Drive check failed":"Pengecekan Drive gagal",
  "Checks sign-in and access to the team folder from this browser.":"Mengecek login dan akses ke folder tim dari browser ini.","Not verified":"Belum diverifikasi",
  "Remove demo data":"Hapus data demo","Demo accounts and sample content":"Akun demo dan konten contoh",
  "This workspace still contains accounts and content from the demo seed.":"Workspace ini masih berisi akun dan konten dari data demo.",
  "No demo accounts or demo content found.":"Tidak ada akun atau konten demo.","Demo accounts":"Akun demo","Sample tasks":"Task contoh","Sample projects":"Project contoh",
  "Demo accounts leave the workspace and cannot sign in. Their open tasks move to you. Sample content is deleted unless real work was added to it. Make a backup first.":"Akun demo keluar dari workspace dan tidak bisa login. Task mereka dipindahkan ke kamu. Konten contoh dihapus kecuali sudah berisi pekerjaan nyata. Buat backup dulu.",
  "Remove accounts and sample content":"Hapus akun dan konten contoh","Accounts only":"Akun saja","Demo data removed":"Data demo dihapus",
  "Adding":"Menambahkan","versions":"versi","Uploading":"Mengunggah","files":"file","Choose files":"Pilih file",
  "Task created":"Task dibuat","Open":"Buka","Couldn't create the task. Your draft is kept.":"Task gagal dibuat. Draf tetap disimpan."
});

/* ---------- shared: links in plain text (chat rules) ---------- */
/* Turns URLs into safe links. Task/project links of this workspace become in-app chips. */
function richLinkText(text,o){ o=o||{}; text=String(text||""); var urls=typeof messageUrls==="function"?messageUrls(text):[], pos=0, out="";
  urls.forEach(function(x){ out+=esc(text.slice(pos,x.start)); var ie=internalEntityFromUrl(x.url), tk=ie&&ie.type==="TASK"?task(ie.id):null, pj=ie&&ie.type==="PROJECT"?project(ie.id):null;
    if(tk||pj) out+='<a href="'+attr(x.url)+'" class="msg-entity-link" onclick="event.stopPropagation();event.preventDefault();'+(tk?"openTask(\\'"+attr(tk.id)+"\\')":"go(\\'projects\\',\\'"+attr(pj.id)+"\\')")+'">'+(tk?I.tasks:I.projects)+'<span>'+esc(tk?tk.id+" · "+tk.title:pj.name)+'</span></a>';
    else if(/^https?:/i.test(x.url)) out+='<a href="'+attr(x.url)+'" target="_blank" rel="noopener nofollow" class="rich-link" onclick="event.stopPropagation();event.preventDefault();openExternal(this.href)">'+esc(x.raw)+'</a>';
    else out+=esc(x.raw);
    pos=x.end; });
  out+=esc(text.slice(pos));
  if(o.mentions) out=out.replace(/(^|[\s(>])@(\w+)/g,'$1<b style="color:var(--color-primary)">@$2</b>');
  return out.replace(/\n/g,"<br>"); }
function commentAttachmentsHtml(c){ var list=(c.attachments||[]).filter(Boolean); if(!list.length) return "";
  var imgs=list.filter(function(a){ return a.preview; }), rest=list.filter(function(a){ return !a.preview; });
  return (imgs.length?'<div class="cmt-images">'+imgs.map(function(a){ return '<button type="button" class="cmt-img" title="'+attr(a.name||"")+'" onclick="previewModal({name:\''+attr(a.name||"")+'\',title:\''+attr(a.name||tr("Preview"))+'\',img:\''+attr(a.preview)+'\'})"><img src="'+attr(a.preview)+'" alt="'+attr(a.name||"")+'" loading="lazy"></button>'; }).join("")+'</div>':"")
    +rest.map(function(a){ var nm=typeof a==="string"?a:(a.name||a.url||""); return a.url?'<a class="att" href="'+attr(a.url)+'" onclick="event.preventDefault();openExternal(\''+attr(a.url)+'\')">'+I.link+esc(nm)+'</a>':'<span class="att att-missing" title="'+attr(tr("Attached before v38 without the file itself"))+'">'+I.link+esc(nm)+'</span>'; }).join(""); }

/* ---------- #4/#5 default reviewer: the lead of the assignee's team, never demo ids ---------- */
function defaultReviewerFor(assignee,teamId){ var t=teamId?team(teamId):null; if(t&&t.lead&&t.lead!==assignee&&PEOPLE[t.lead]) return t.lead; return null; }

/* ---------- #1/#18 router (v38.1: clean URLs) ----------
   Served by the ZenCrevia server: /<screen>[/<sub>][?task=<id>], e.g. /tasks/kanban?task=T-101,
   /projects/p1, /register. The server answers every such path with the app shell (server.js).
   Opened as a file (standalone demo) there is no server to do that, so the same routes live in
   the hash: #/tasks/kanban?task=T-101. Old links (#/…, #task=…, #conv=…) keep working. */
var ROUTER={applying:false,ready:false,mode:/^https?:$/.test(location.protocol)?"path":"hash",screens:["home","tasks","calendar","projects","teams","team","assets","knowledge","aihub","aigallery","messages","analytics","notifications","settings"]};
function routeSub(){ switch(S.screen){ case "projects": return S.projectId; case "teams": return S.teamId; case "team": return S.memberId; case "settings": return S.settingsTab; case "tasks": return S.taskView; case "calendar": return S.calMode; case "knowledge": return S.kbPage; case "messages": return S.messageConversationId; default: return null; } }
function routeBuild(screen,sub,taskId){ var p=(screen&&screen!=="home"?"/"+screen+(sub?"/"+encodeURIComponent(sub):""):"/")+(taskId?"?task="+encodeURIComponent(taskId):""); return ROUTER.mode==="path"?p:"#"+(p==="/"?"/home":p); }
function routeCurrent(){ var t=S.drawerTask&&S.drawerTask!=="T-new"?S.drawerTask:null; return routeBuild(S.screen||"home",routeSub(),t); }
function routeHere(){ return ROUTER.mode==="path"?location.pathname+location.search:location.hash; }
/* accepts "/tasks/kanban?task=T-1", "#/tasks/kanban?task=T-1" or a full URL */
function routeParse(h){ if(h==null) h=routeHere(); h=String(h); if(/^https?:/i.test(h)){ try{ var u=new URL(h); h=/^#\//.test(u.hash)?u.hash:u.pathname+u.search; }catch(e){ return null; } }
  h=h.replace(/^#/,""); var m=h.match(/^\/([a-z]*)(?:\/([^?#]*))?(?:\?([^#]*))?$/i); if(!m) return null; var q={}; (m[3]||"").split("&").forEach(function(kv){ if(!kv) return; var p=kv.split("="); try{ q[decodeURIComponent(p[0])]=decodeURIComponent(p[1]||""); }catch(e){} });
  var sub=null; try{ sub=m[2]?decodeURIComponent(m[2].replace(/\/+$/,"")):null; }catch(e){}
  return {screen:(m[1]||"home").toLowerCase(),sub:sub||null,task:q.task||null,query:q}; }
function routeWrite(url,push){ var full=ROUTER.mode==="path"?url+location.hash.replace(/^#\/.*$/,""):location.pathname+location.search+url; try{ history[push?"pushState":"replaceState"](null,"",full); }catch(e){} }
function routeSync(){ if(ROUTER.applying||!ROUTER.ready||document.body.classList.contains("auth")) return; var h=routeCurrent(); if(h===routeHere()) return; var cur=routeParse(routeHere()), nx=routeParse(h);
  var push=!cur||cur.screen!==nx.screen||cur.sub!==nx.sub||(!!nx.task&&cur.task!==nx.task);
  routeWrite(h,push); }
function routeApply(r){ if(!r) return false; if(ROUTER.screens.indexOf(r.screen)<0) r={screen:"home",sub:null,task:r.task};
  ROUTER.applying=true;
  try{
    if(r.screen==="settings"&&r.sub) S.settingsTab=r.sub;
    if(r.screen==="projects"&&r.sub&&!project(r.sub)) toast(tr("Project not found — it may have been deleted or you no longer have access."),"bad");
    if(S.drawerTask&&(!r.task||r.task!==S.drawerTask)) closeDrawer();
    if(r.screen==="messages"&&r.sub){ S.messageConversationId=r.sub; go("messages",null,{direct:true}); if(typeof msgLoad==="function") msgLoad().then(function(){ if(conv(r.sub)&&convMember(conv(r.sub))) openConversation(r.sub,(r.query||{}).msg||null); }); }
    else go(r.screen,r.screen==="projects"&&r.sub&&!project(r.sub)?null:r.sub,{direct:true});
    if(r.task&&r.task!==S.drawerTask){ if(task(r.task)) openTask(r.task); else toast(tr("That item is not available to you"),"bad"); }
  } finally { ROUTER.applying=false; }
  routeSync(); return true; }
/* where the visitor wanted to go, before sign-in or the bootstrap changed anything */
function routeWanted(){ var h=location.hash||"";
  if(/^#\/[a-z]/i.test(h)) return routeParse(h);                         /* v38 hash link, also in path mode */
  if(ROUTER.mode==="path"&&location.pathname!=="/"&&location.pathname!=="/index.html") return routeParse(location.pathname+location.search);
  var t=location.search.match(/[?&]task=([^&]+)/); if(t) return {screen:"tasks",sub:null,task:decodeURIComponent(t[1])};
  return null; }
(function(){
  var baseRender=renderScreen; renderScreen=function(withLoading){ var r=baseRender.apply(this,arguments); if(!withLoading) routeSync(); return r; };
  var baseOpen=openTask; openTask=function(id){ var r=baseOpen.apply(this,arguments); routeSync(); return r; };
  var baseClose=closeDrawer; closeDrawer=function(){ var r=baseClose.apply(this,arguments); routeSync(); return r; };
  /* a v38 hash link (#/tasks?task=…) pasted into an open tab: move it to the clean path */
  window.addEventListener("hashchange",function(){ if(!ROUTER.ready||document.body.classList.contains("auth")||!/^#\/[a-z]/i.test(location.hash)) return; var r=routeParse(location.hash); if(ROUTER.mode==="path"){ try{ history.replaceState(null,"",routeBuild(r.screen,r.sub,r.task)); }catch(e){} } routeApply(r); });
  window.addEventListener("popstate",function(){ if(document.body.classList.contains("auth")) return authRouteApply(); var r=routeParse(routeHere()); routeApply(r||{screen:"home"}); });
  var baseAfter=afterLogin; afterLogin=function(){ var wanted=routeWanted(), legacy=/^#(task|project|asset|knowledge|decision|conv)=/.test(location.hash)?location.hash:null;
    window.ZC_READY=false;
    return baseAfter.apply(this,arguments).then(function(v){ ROUTER.ready=true; window.ZC_READY=true; /* browser tests wait for this */
      if(wanted&&wanted.screen!=="register"&&wanted.screen!=="login"&&wanted.screen!=="reset"){ if(ROUTER.mode==="path"&&/^#\//.test(location.hash)) routeWrite(routeBuild(wanted.screen,wanted.sub,wanted.task),false); routeApply(wanted); }
      else if(legacy){ go(/^#project=/.test(legacy)?"projects":/^#conv=/.test(legacy)?"messages":"tasks",null,{direct:true}); if(location.hash!==legacy) try{ history.replaceState(null,"",location.pathname+location.search+legacy); }catch(e){} }
      else { if(ROUTER.mode==="path"&&/^\/(register|login)$/.test(location.pathname)) routeWrite("/",false); routeSync(); }
      return v; }); };
  var baseDemo=typeof demoLogin==="function"?demoLogin:null; if(baseDemo) demoLogin=function(){ var wanted=routeWanted(); var r=baseDemo.apply(this,arguments); ROUTER.ready=true; if(wanted&&wanted.screen!=="register") routeApply(wanted); else routeSync(); return r; };
})();
/* someone who opens a shared task link for the first time gets that task, not the welcome tour on
   top of it; the tour waits until they are on Home */
(function(){ if(typeof showOnboardingIfNeeded!=="function") return; var base=showOnboardingIfNeeded; showOnboardingIfNeeded=function(){ if(S.drawerTask||S.screen!=="home"){ ROUTER.tourWaiting=true; return; } return base.apply(this,arguments); };
  var baseGo=go; go=function(screen){ var r=baseGo.apply(this,arguments); if(ROUTER.tourWaiting&&screen==="home"&&!S.drawerTask){ ROUTER.tourWaiting=false; setTimeout(base,300); } return r; }; })();
/* the chat/link parser understands router links (both forms) as well as the old ones */
(function(){ var base=internalEntityFromUrl; internalEntityFromUrl=function(url){ var hit=base(url); if(hit) return hit; var u; try{ u=new URL(url,location.href); }catch(e){ return null; }
  var r=/^#\//.test(u.hash)?routeParse(u.hash):(u.origin===location.origin?routeParse(u.pathname+u.search):null); if(!r) return null;
  var type=r.task?"TASK":(r.screen==="projects"&&r.sub?"PROJECT":null); if(!type) return null; var id=r.task||r.sub;
  var exists=type==="TASK"?!!task(id):!!project(id); if(u.origin!==location.origin&&!exists) return null; return {type:type,id:id,url:u.href}; }; })();
/* copied links: /tasks?task=T-101 and /projects/p1; other link types keep their one-shot hash */
(function(){ var base=deepLinkBase; deepLinkBase=function(){ return ROUTER.mode==="path"?location.origin+"/":base.apply(this,arguments); };
  var baseLink=deepLink; deepLink=function(type,id,sub){ if(type==="task") return (ROUTER.mode==="path"?location.origin:deepLinkBase())+routeBuild("tasks",null,id); if(type==="project") return (ROUTER.mode==="path"?location.origin:deepLinkBase())+routeBuild("projects",id,null); return baseLink.apply(this,arguments); }; })();

/* ---------- #3 register page, show/hide password ---------- */
function authRouteApply(){ var r=routeParse(routeHere()); if(r&&r.screen==="register"&&SESSION.canRegister){ AUTH.tab="register"; showLogin(); } else if(r&&(r.screen==="login"||r.screen==="register")){ AUTH.tab="login"; showLogin(); } }
(function(){ var base=showLogin; showLogin=function(msg){ var r=routeWanted()||routeParse(routeHere()); if(r&&r.screen==="register"&&SESSION.canRegister&&AUTH.tab==="login"&&!showLogin._seen){ AUTH.tab="register"; } showLogin._seen=true;
    /* registration lists the server's teams, never the bundled demo teams */
    var keep=TEAMS; if(API.on) TEAMS=(SESSION.teams||[]).map(function(t,i){ return {id:t.id,name:t.name,sort:i,archived:false}; });
    try{ base.apply(this,arguments); } finally { TEAMS=keep; }
    /* the address bar follows the Log in / Register tabs; any other deep link is kept for after sign-in */
    if(API.on&&(AUTH.tab==="register"||AUTH.tab==="login")){ var here=routeParse(routeHere()), onAuth=!here||here.screen==="home"||here.screen==="register"||here.screen==="login";
      if(onAuth){ var want=AUTH.tab==="register"?routeBuild("register"):(ROUTER.mode==="path"?"/":""); if(routeHere()!==want&&!/[?&]reset=/.test(location.search)) routeWrite(want,false); } } }; })();
(function(){ var base=window.fetch; window.fetch=function(u){ var p=base.apply(this,arguments); if(typeof u==="string"&&u.indexOf("/api/auth/session")>=0) p.then(function(r){ return r.clone().json().then(function(s){ SESSION.teams=s.teams||[]; }).catch(function(){}); }).catch(function(){}); return p; }; })();
function pwToggleAttach(inp){ if(inp._pwt||!inp.parentNode) return; inp._pwt=true; var wrap=document.createElement("span"); wrap.className="pw-wrap"; inp.parentNode.insertBefore(wrap,inp); wrap.appendChild(inp);
  var b=document.createElement("button"); b.type="button"; b.className="pw-eye"; b.tabIndex=0; b.setAttribute("aria-label",tr("Show password")); b.title=tr("Show password"); b.innerHTML=I.eye;
  b.onclick=function(e){ e.preventDefault(); var show=inp.type==="password"; inp.type=show?"text":"password"; b.classList.toggle("on",show); b.innerHTML=show?I.eyeoff:I.eye; b.setAttribute("aria-label",tr(show?"Hide password":"Show password")); b.title=tr(show?"Hide password":"Show password"); inp.focus(); };
  wrap.appendChild(b); }
new MutationObserver(function(){ document.querySelectorAll('input[type="password"]:not([data-no-eye])').forEach(pwToggleAttach); }).observe(document.documentElement,{childList:true,subtree:true});

/* ---------- #5 creating a task: the panel closes, failures keep the draft ---------- */
(function(){
  var baseCreate=createDraft; createDraft=function(){ var d=task("T-new"); window._v38Draft=d?clone(d):null; window._v38Creating=true; setTimeout(function(){ window._v38Creating=false; },15000); return baseCreate.apply(this,arguments); };
  var baseOpen=openTask; openTask=function(id){ if(window._v38Creating&&id!=="T-new"){ window._v38Creating=false; var t=task(id); if(t){ toastAction(tr("Task created")+" · "+t.id,tr("Open"),function(){ openTask(t.id); }); } return; } return baseOpen.apply(this,arguments); };
  var baseTask=createTask; createTask=function(tk){ return baseTask.apply(this,arguments).catch(function(e){ window._v38Creating=false; var d=window._v38Draft; if(d&&!task("T-new")){ d._draft=true; d.id="T-new"; TASKS.push(d); openTask("T-new"); toast(tr("Couldn't create the task. Your draft is kept.")+" "+e.message,"bad"); } throw e; }); };
})();
function toastAction(msg,label,fn){ var box=document.getElementById("toasts"); if(!box) return toast(msg); var el=document.createElement("div"); el.className="toast ok undo-toast"; el.innerHTML='<span>'+esc(msg)+'</span><button class="btn xs">'+esc(label)+'</button>'; el.querySelector("button").onclick=function(){ el.remove(); fn(); }; box.appendChild(el); setTimeout(function(){ el.style.transition="opacity .25s"; el.style.opacity="0"; setTimeout(function(){ el.remove(); },260); },6000); }

/* ---------- #6 task/project links in chat become the task/project, not a URL ---------- */
(function(){ var base=msgBuildFromDraft; msgBuildFromDraft=function(c){ var m=base.apply(this,arguments); if(!m||!m.body) return m;
    var urls=messageUrls(m.body).filter(function(x){ return internalEntityFromUrl(x.url); }); if(!urls.length) return m;
    urls.forEach(function(x){ var ie=internalEntityFromUrl(x.url); if(!(m.refs||[]).some(function(r){ return (r.type===ie.type)&&r.entityId===ie.id; })){ var ent=ie.type==="TASK"?task(ie.id):project(ie.id); if(ent) (m.refs=m.refs||[]).push({type:ie.type,entityId:ie.id,fallbackTitle:ent.title||ent.name,source:"ATTACH"}); } });
    var body=m.body; urls.slice().reverse().forEach(function(x){ body=body.slice(0,x.start)+body.slice(x.end); });
    (m.refs||[]).forEach(function(r){ if(r.type==="TASK"||r.type==="PROJECT"){ delete r.url; delete r.normalizedUrl; r.source="ATTACH"; /* the server re-derives BODY refs from the text, which no longer holds the URL */ } });
    m.body=body.replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim(); return m; }; })();

/* ---------- #7 the newest message is visible after a refresh ---------- */
function msgScrollBottom(id){ var go2=function(){ var box=document.getElementById("msgTimeline"); if(box&&S.screen==="messages"&&S.messageConversationId===id) box.scrollTop=box.scrollHeight; }; go2(); requestAnimationFrame(go2); setTimeout(go2,150); setTimeout(go2,600);
  var box=document.getElementById("msgTimeline"); if(box) box.querySelectorAll("img").forEach(function(im){ if(!im.complete) im.addEventListener("load",go2,{once:true}); }); }
(function(){ var base=msgFetchPage; msgFetchPage=function(id,before){ var p=base.apply(this,arguments); if(!before&&p&&p.then) p.then(function(){ msgScrollBottom(id); }); return p; };
  var baseOpen=openConversation; openConversation=function(id){ var r=baseOpen.apply(this,arguments); msgEnsureHistory(id); if(MESSAGES[id]&&MESSAGES[id].length) msgScrollBottom(id); routeSync(); return r; };
  /* v37 only fetched history when MESSAGES[id] was empty. After a reload the conversation list
     already carries the latest message, so the page was never fetched and the timeline stayed
     blank until the conversation was clicked again. */
  var baseRender=renderMessages; renderMessages=function(){ var r=baseRender.apply(this,arguments); if(CHAT_RUNTIME.loaded&&S.messageConversationId) msgEnsureHistory(S.messageConversationId); routeSync(); return r; }; })();
(function(){ var base=msgBootSync; msgBootSync=function(){ if(CHAT_RUNTIME.forUser!==ME) CHAT_RUNTIME.v38Fetched={}; return base.apply(this,arguments); }; })();
function msgEnsureHistory(id){ if(!API.on||!id) return; CHAT_RUNTIME.v38Fetched=CHAT_RUNTIME.v38Fetched||{}; if(CHAT_RUNTIME.v38Fetched[id]) return; CHAT_RUNTIME.v38Fetched[id]=true; if(CHAT_RUNTIME.activeSubscription!==id) msgSubscribe(id); msgFetchPage(id); }

/* ---------- #9 light/dark is personal ---------- */
function myAppearance(){ var p=PEOPLE[ME]&&SESSION&&(API.on?SESSION.user:true)?(myPrefs().appearance||null):null; if(p) return p; try{ return localStorage.getItem("cos.appearance."+(ME||""))||localStorage.getItem("cos.appearance.last")||"light"; }catch(e){ return "light"; } }
function withMyAppearance(fn,self,args){ var th=WS.theme=WS.theme||{}, keep=th.appearance; th.appearance=myAppearance(); try{ return fn.apply(self,args); } finally { th.appearance=keep; } }
(function(){
  var baseApply=applyTheme; applyTheme=function(){ return withMyAppearance(baseApply,this,arguments); };
  var baseQuick=renderQuickTheme; renderQuickTheme=function(){ var r=withMyAppearance(baseQuick,this,arguments); var q=document.getElementById("quickTheme"); if(q&&!q.querySelector(".appearance-note")){ var n=document.createElement("div"); n.className="hint appearance-note"; n.textContent=tr("Appearance is personal: only your account changes."); q.appendChild(n); } return r; };
  if(typeof setThemeTab==="function"){ var baseTab=setThemeTab; setThemeTab=function(){ var h=withMyAppearance(baseTab,this,arguments); return typeof h==="string"?h.replace('<label>Mode</label>','<label>Mode</label><div class="hint" style="margin:-2px 0 8px">'+esc(tr("Appearance is personal: only your account changes."))+'</div>'):h; }; }
  setAppearance=function(v){ if(PEOPLE[ME]){ myPrefs().appearance=v; saveMyPrefs(); } try{ localStorage.setItem("cos.appearance."+ME,v); localStorage.setItem("cos.appearance.last",v); }catch(e){} applyTheme(); var quick=document.getElementById("themePop"); if(quick&&quick.classList.contains("open")) renderQuickTheme(); if(S.screen==="settings") renderScreen(false); };
})();

/* ---------- #13 several files → several versions in one go ---------- */
(function(){
  pickVersionFile=function(){ var inp=document.getElementById("fileInput"); inp.accept="image/*,.pdf,.psd,.ai,.mp4,.mov"; inp.multiple=true; inp.onchange=function(){ var files=Array.prototype.slice.call(inp.files||[]); inp.value=""; inp.multiple=false; if(!files.length) return; window._verUps=null; if(files.length===1) return versionFileChosen(files[0]); versionFilesChosen(files.slice(0,10)); }; inp.click(); };
  var basePush=pushVersion; pushVersion=function(tk,img,note,silent,name){ var ups=window._verUps; if(silent||!ups||ups.length<2) return basePush.apply(this,arguments);
    if(window._verPending) return toast(tr("Wait for the upload to finish"),"bad"); window._verUps=null; closeModal(); var cols=["#7C3AED","#0F766E","#B45309","#1D4ED8","#BE185D"]; var start=tk.versions.reduce(function(m,x){ return Math.max(m,+x.n||0); },0)+1; S.drawerTab="versions"; S.drawerVer=start+ups.length-1;
    return editTaskWith(tk,function(t){ ups.forEach(function(up,i){ var n=start+i; var v=V(n,ME,0,"pending",cols[n%cols.length],note||up.name||""); if(up.preview) v.img=up.preview; if(up.driveId){ v.driveUrl=up.url; v.driveId=up.driveId; } t.versions.push(v); t.files.push(F(up.name,up.type,up.source,up.size,0,up.url||"",{preview:up.preview,driveId:up.driveId})); log(t,"upload",{v:n}); }); }).then(function(saved){ if(saved===false) return false; notify("upload",reviewersOf(tk),tk.id); toast(ups.length+" "+tr("versions")+" · V"+start+"–V"+(start+ups.length-1)); }); };
})();
function versionFilesChosen(files){ if(!document.getElementById("uv_file")) return; var session=window._verSession; window._verPending=true; window._verUp=null; window._verUps=[]; var el=document.getElementById("uv_file"), pv=document.getElementById("uv_preview"); el.textContent=tr("Uploading")+" "+files.length+" "+tr("files")+"…"; pv.innerHTML="";
  Promise.all(files.map(function(f){ return uploadAny(f).then(function(u){ u.name=f.name; return u; }); })).then(function(ups){ if(session!==window._verSession) return; window._verUps=ups; window._verUp=ups[0]; el.textContent=tr("Adding")+" "+ups.length+" "+tr("versions");
    pv.innerHTML='<div class="uv-multi">'+ups.map(function(u){ return '<figure>'+(u.preview?'<img src="'+attr(u.preview)+'" alt="">':'<span>'+I.link+'</span>')+'<figcaption>'+esc(u.name)+'</figcaption></figure>'; }).join("")+'</div>'; })
  .catch(function(e){ if(session===window._verSession){ window._verUps=null; el.textContent=tr("Upload failed"); toast(e.message,"bad"); } }).finally(function(){ if(session===window._verSession) window._verPending=false; }); }
(function(){ var base=uploadVersion; uploadVersion=function(silent){ window._verUps=null; var r=base.apply(this,arguments); if(!silent){ var b=document.querySelector('#modal button[onclick="pickVersionFile()"]'); if(b) b.innerHTML=I.up+tr("Choose files"); } return r; }; })();

/* ---------- #17 description: formatting toolbar, Markdown source, preview ---------- */
function descMdInline(s){ /* s is already escaped */
  s=s.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  s=s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,function(_,t,u){ return '<a href="'+u+'" target="_blank" rel="noopener nofollow" onclick="event.preventDefault();openExternal(this.href)">'+t+'</a>'; });
  s=s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>');
  s=s.replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>').replace(/(^|[\s(])_([^_\n]+)_/g,'$1<em>$2</em>');
  s=s.replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
  s=s.replace(/(^|[\s(>])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,function(_,p,u){ return p+'<a href="'+u+'" target="_blank" rel="noopener nofollow" onclick="event.preventDefault();openExternal(this.href)">'+u+'</a>'; });
  return s; }
function descMdHtml(src){ var lines=esc(String(src||"")).split(/\r?\n/), out=[], list=null, code=null;
  var close=function(){ if(list){ out.push("</"+list+">"); list=null; } };
  lines.forEach(function(l){
    if(code!==null){ if(/^```/.test(l)){ out.push('<pre><code>'+code.join("\n")+'</code></pre>'); code=null; } else code.push(l); return; }
    if(/^```/.test(l)){ close(); code=[]; return; }
    var m;
    if((m=l.match(/^(#{1,3})\s+(.*)$/))){ close(); out.push('<h'+(m[1].length+2)+'>'+descMdInline(m[2])+'</h'+(m[1].length+2)+'>'); return; }
    if((m=l.match(/^\s*[-*•]\s+(.*)$/))){ if(list!=="ul"){ close(); out.push("<ul>"); list="ul"; } out.push("<li>"+descMdInline(m[1])+"</li>"); return; }
    if((m=l.match(/^\s*\d+[.)]\s+(.*)$/))){ if(list!=="ol"){ close(); out.push("<ol>"); list="ol"; } out.push("<li>"+descMdInline(m[1])+"</li>"); return; }
    close();
    if((m=l.match(/^&gt;\s?(.*)$/))){ out.push("<blockquote>"+descMdInline(m[1])+"</blockquote>"); return; }
    if(/^(-{3,}|\*{3,})$/.test(l.trim())){ out.push("<hr>"); return; }
    out.push(l.trim()?"<p>"+descMdInline(l)+"</p>":"");
  });
  if(code!==null) out.push('<pre><code>'+code.join("\n")+'</code></pre>'); close();
  return out.join(""); }
/* pasted rich text (Docs, Word, web pages) keeps bold/italic/headings/lists as Markdown */
function descHtmlToMd(html){ var d=document.createElement("div"); d.innerHTML=html; d.querySelectorAll("script,style,meta,title").forEach(function(n){ n.remove(); });
  var walk=function(n,ctx){ if(n.nodeType===3) return n.nodeValue.replace(/\s+/g," "); if(n.nodeType!==1) return ""; var t=n.tagName.toLowerCase(), inner=Array.prototype.map.call(n.childNodes,function(c){ return walk(c,t==="ol"||t==="ul"?t:ctx); }).join(""), st=(n.getAttribute("style")||"").toLowerCase();
    var bold=/font-weight:\s*(bold|[6-9]00)/.test(st), ital=/font-style:\s*italic/.test(st);
    if(t==="b"||t==="strong"||bold&&t==="span") inner=inner.trim()?"**"+inner.trim()+"**":inner;
    if(t==="i"||t==="em"||ital&&t==="span") inner=inner.trim()?"*"+inner.trim()+"*":inner;
    if(t==="s"||t==="del"||t==="strike") return "~~"+inner+"~~";
    if(t==="code") return "`"+inner+"`";
    if(t==="a"){ var h=n.getAttribute("href")||""; return /^https?:/i.test(h)?"["+inner.trim()+"]("+h+")":inner; }
    if(/^h[1-3]$/.test(t)) return "\n"+"#".repeat(+t[1])+" "+inner.trim()+"\n";
    if(/^h[4-6]$/.test(t)) return "\n### "+inner.trim()+"\n";
    if(t==="li") return "\n"+(ctx==="ol"?"1. ":"- ")+inner.trim();
    if(t==="ul"||t==="ol") return inner+"\n";
    if(t==="blockquote") return "\n> "+inner.trim()+"\n";
    if(t==="br") return "\n";
    if(t==="p"||t==="div"||t==="tr") return "\n"+inner.trim()+"\n";
    return inner; };
  return walk(d,"").replace(/\*\*\s*\*\*/g,"").replace(/\n{3,}/g,"\n\n").trim(); }
function descEditorHtml(tk){ var ed=tk._draft||canI.editTask(tk), mode=S.descMode||"write", txt=tk.description||"";
  if(!ed) return '<div style="margin-bottom:16px"><div class="eyebrow" style="margin-bottom:6px">'+tr("Description")+'</div><div class="md-view">'+(txt?descMdHtml(txt):'<span class="hint">'+tr("No description.")+'</span>')+'</div></div>';
  var b=function(act,label,html){ return '<button type="button" class="md-btn" title="'+attr(tr(label))+'" aria-label="'+attr(tr(label))+'" onmousedown="event.preventDefault()" onclick="descFormat(\''+act+'\')">'+html+'</button>'; };
  return '<div class="md-editor" style="margin-bottom:16px"><div class="md-head"><span class="eyebrow">'+tr("Description")+'</span><span class="spacer"></span><div class="seg sm"><button class="'+(mode==="write"?"on":"")+'" onclick="descSaveNow();S.descMode=\'write\';renderDrawer()">'+tr("Write")+'</button><button class="'+(mode==="preview"?"on":"")+'" onclick="descSaveNow();S.descMode=\'preview\';renderDrawer()">'+tr("Preview")+'</button></div></div>'
    +(mode==="preview"?'<div class="md-view md-preview">'+(txt?descMdHtml(txt):'<span class="hint">'+tr("Nothing to preview yet.")+'</span>')+'</div>'
    :'<div class="md-toolbar">'+b("bold","Bold","<b>B</b>")+b("italic","Italic","<i>I</i>")+b("strike","Strikethrough","<s>S</s>")+'<span class="md-sep"></span>'+b("h","Heading","H")+b("ul","Bullet list","•&thinsp;≡")+b("ol","Numbered list","1.&thinsp;≡")+b("quote","Quote","❝")+'<span class="md-sep"></span>'+b("link","Link",I.link)+b("code","Code","&lt;/&gt;")+'</div>'
      +'<textarea class="desc md-src" id="descSrc" placeholder="'+attr(tr("Add context not covered by the brief…"))+'" oninput="descSaveSoon()" onchange="descSaveNow()" onpaste="descPaste(event)">'+esc(txt)+'</textarea><div class="hint" style="margin-top:5px">'+tr("Formatting uses Markdown: **bold**, *italic*, # heading, - list. Pasted text keeps its styling.")+'</div>')+'</div>'; }
var _descT=null;
function descSaveSoon(){ clearTimeout(_descT); _descT=setTimeout(descSaveNow,1200); }
function descSaveNow(){ clearTimeout(_descT); var el=document.getElementById("descSrc"), tk=task(S.drawerTask); if(!el||!tk) return; if((tk.description||"")===el.value) return; var pos=[el.selectionStart,el.selectionEnd], had=document.activeElement===el; editTask("description",el.value); if(had){ var n=document.getElementById("descSrc"); if(n){ n.focus(); try{ n.setSelectionRange(pos[0],pos[1]); }catch(e){} } } }
function descPaste(e){ var cd=e.clipboardData; if(!cd) return; var html=cd.getData("text/html"); if(!html||!/<(b|strong|i|em|h[1-6]|li|a)\b|font-weight|font-style/i.test(html)) return; var md=descHtmlToMd(html); if(!md) return; e.preventDefault(); var el=e.target, s=el.selectionStart, en=el.selectionEnd; el.value=el.value.slice(0,s)+md+el.value.slice(en); el.selectionStart=el.selectionEnd=s+md.length; descSaveSoon(); }
function descFormat(act){ var el=document.getElementById("descSrc"); if(!el) return; var s=el.selectionStart, e=el.selectionEnd, v=el.value, sel=v.slice(s,e);
  var wrap=function(a,b,ph){ var t=sel||tr(ph); el.value=v.slice(0,s)+a+t+b+v.slice(e); el.selectionStart=s+a.length; el.selectionEnd=s+a.length+t.length; };
  var lines=function(prefix){ var ls=v.lastIndexOf("\n",s-1)+1, le=v.indexOf("\n",e); if(le<0) le=v.length; var block=v.slice(ls,le).split("\n").map(function(l,i){ var p=typeof prefix==="function"?prefix(i):prefix; return l.indexOf(p)===0?l.slice(p.length):p+l; }).join("\n"); el.value=v.slice(0,ls)+block+v.slice(le); el.selectionStart=ls; el.selectionEnd=ls+block.length; };
  if(act==="bold") wrap("**","**","bold text"); else if(act==="italic") wrap("*","*","italic text"); else if(act==="strike") wrap("~~","~~","text"); else if(act==="code") wrap(sel.indexOf("\n")>=0?"```\n":"`",sel.indexOf("\n")>=0?"\n```":"`","code");
  else if(act==="h") lines("## "); else if(act==="ul") lines("- "); else if(act==="ol") lines(function(i){ return (i+1)+". "; }); else if(act==="quote") lines("> ");
  else if(act==="link"){ var u=prompt(tr("Link URL (https://…)"),"https://"); if(!u||!/^https?:\/\/\S+$/i.test(u)) return; wrap("[","]("+u+")","link text"); }
  el.focus(); descSaveSoon(); }

/* ---------- #18 live updates for everything that is not a task ---------- */
(function(){
  var pending={}, timer=null;
  function busy(){ var a=document.activeElement; return (a&&(/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)||a.isContentEditable)&&!a.closest("#msgComposer,.msg-composer"))||document.getElementById("modalWrap")&&document.getElementById("modalWrap").classList.contains("open"); }
  function apply(kind,d){
    if(kind==="projects") PROJECTS=d.projects.map(hProject);
    else if(kind==="teams"){ TEAMS=d.teams; PEOPLE=d.people; WS.people=PEOPLE; }
    else if(kind==="people"){ var mine=PEOPLE[ME]&&PEOPLE[ME].prefs; PEOPLE=d.people; if(mine&&PEOPLE[ME]) PEOPLE[ME].prefs=mine; WS.people=PEOPLE; }
    else if(kind==="assets"){ ASSETS=d.assets.map(hAsset); ASSET_FOLDERS=d.folders; }
    else if(kind==="knowledge"){ KNOWLEDGE=d.knowledge.map(hPage); KNOWLEDGE_FOLDERS=(d.knowledgeFolders||[]).slice(); }
    else if(kind==="workspace"){ var ws=clone(d.ws); ws.cloud=(ws.cloud||[]).map(hCloud); ws.people=PEOPLE; WS=ws; applyTheme(); applyShell(); }
    else if(kind==="roles") ROLES=d.roles;
  }
  function flush(){ timer=null; if(busy()){ timer=setTimeout(flush,2000); return; } var kinds=Object.keys(pending); pending={};
    Promise.all(kinds.map(function(k){ return apiFetch("GET","/api/live/"+k).then(function(d){ apply(k,d); }).catch(function(){}); })).then(function(){ AN=null; refresh(); }); }
  function onEvent(e){ var ev; try{ ev=JSON.parse(e.data); }catch(x){ return; } if(!ev||ev.type!=="ws_changed"||!API.on||ev.by===ME) return; pending[ev.kind]=1; if(!timer) timer=setTimeout(flush,400); }
  var ES=window.EventSource; if(typeof ES!=="function") return;
  window.EventSource=function(u,o){ var es=new ES(u,o); es.addEventListener("message",onEvent); return es; };
  window.EventSource.prototype=ES.prototype; ["CONNECTING","OPEN","CLOSED"].forEach(function(k){ window.EventSource[k]=ES[k]; });
})();

/* ---------- #19 AI settings: permissions survive, "Connected" means a passing test ---------- */
function aiCheckState(which){ var c=aiCfg()[which]||{}, lc=c.lastCheck; if(!(c.keySet||aiKey(which))) return "none"; if(!API.on) return "saved"; if(!lc) return "saved"; return lc.ok?"ok":"fail"; }
function aiStatusBadge(which){ var st=aiCheckState(which), lc=(aiCfg()[which]||{}).lastCheck;
  var when=lc?' <span class="hint">'+tr("Last check")+' '+esc(new Date(lc.at).toLocaleString())+'</span>':'';
  if(st==="ok") return '<span class="badge approved">'+tr("Verified")+'</span>'+when;
  if(st==="fail") return '<span class="badge bad">'+tr("Test failed")+'</span>'+when+'<div class="ai-check-err">'+esc(lc.error||"")+'</div>';
  if(st==="saved") return '<span class="badge warn">'+tr("Key saved — not tested")+'</span>';
  return '<span class="badge">'+tr("Not set")+'</span>'; }
(function(){
  var baseProv=setAIProviders; setAIProviders=function(){ var h=baseProv.apply(this,arguments); if(typeof h!=="string") return h; var n=0;
    h=h.replace(/<span class="badge approved">connected<\/span>|<span class="badge">not set<\/span>/g,function(){ n++; return '<span class="ai-status" data-ai-status="'+(n===1?"image":"chat")+'">'+aiStatusBadge(n===1?"image":"chat")+'</span>'; });
    var prov=(aiCfg().image.provider&&aiCfg().image.provider!=="magnific")?aiCfg().image.provider:(function(){ var m=(typeof aiDefaultModel==="function"&&aiDefaultModel())||null; return m&&m.provider||aiCfg().image.provider||"magnific"; })();
    var at=h.indexOf('id="ai_i_ep"'), rowAt=at>0?h.lastIndexOf('<div class="field-row">',at):-1;
    if(rowAt>=0) h=h.slice(0,rowAt)+'<div class="field-row">'+fieldHtml("ai_i_prov","Image provider",selectHtml("ai_i_prov",[["openai","OpenAI (gpt-image-1, dall-e-3)"],["gemini","Google Gemini / Imagen"],["magnific","Magnific / Freepik"],["custom","Custom endpoint"]],prov,(canI.manageWorkspace()?"":" disabled")+' onchange="aiImageProviderPreset(this.value)"'))+'</div><div class="hint" style="margin:-6px 0 10px">'+tr("Choose the provider that matches your API key.")+'</div>'+h.slice(rowAt);
    h=h.replace(/onclick="aiTest\('image'\)">([\s\S]*?)Test connection<\/button>/,'onclick="aiTest(\'image\')">$1'+tr("Save & test connection")+'</button>').replace(/onclick="aiTest\('chat'\)">([\s\S]*?)Test connection<\/button>/,'onclick="aiTest(\'chat\')">$1'+tr("Save & test connection")+'</button>');
    return h; };
  if(typeof setAIOverview==="function"){ var baseOv=setAIOverview; setAIOverview=function(){ var keep=aiConfigured; aiConfigured=function(w){ return aiCheckState(w)==="ok"; }; try{ return baseOv.apply(this,arguments); } finally { aiConfigured=keep; } }; }
})();
function aiImageProviderPreset(p){ var ep=document.getElementById("ai_i_ep"); if(!ep) return; ep.value={openai:"https://api.openai.com/v1/images/generations",gemini:"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",magnific:"https://api.freepik.com/v1/ai/mystic"}[p]||ep.value; }
saveAI=function(opts){ opts=opts||{}; var c=aiCfg(), el=function(id){ return document.getElementById(id); };
  var ik=el("ai_i_key")?val("ai_i_key"):"", ck=el("ai_c_key")?val("ai_c_key"):"";
  /* v37 read the permission switches even when they were not on screen (they live on another
     sub-tab), so saving a provider silently switched external AI off. Missing = unchanged. */
  var sw=function(id,cur){ var e=el(id); return e?e.classList.contains("on"):!!cur; };
  var external=sw("ai_external",c.processing.externalEnabled), context=external&&sw("ai_context",c.processing.workspaceContextEnabled), reporting=external&&sw("ai_reporting",c.processing.allowReporting);
  var keep=clone(WS.ai||{}); delete keep.image; delete keep.chat; delete keep.processing;
  WS.ai=Object.assign(keep,{
    processing:{externalEnabled:!!external,workspaceContextEnabled:!!context,allowReporting:!!reporting,acceptedAt:c.processing.acceptedAt||null,acceptedBy:c.processing.acceptedBy||null},
    image:Object.assign({},c.image,{ provider:el("ai_i_prov")?val("ai_i_prov"):(c.image.provider||"magnific"), endpoint:el("ai_i_ep")?(val("ai_i_ep")||c.image.endpoint):c.image.endpoint, model:el("ai_i_model")?aiModelStringFromField(c.image.model):c.image.model, defaultStyle:el("ai_i_style")?val("ai_i_style"):c.image.defaultStyle,
            key: ik==="clear"?null:(ik||undefined), keySet: ik==="clear"?false:(!!ik||c.image.keySet) }),
    chat:Object.assign({},c.chat,{ provider:el("ai_c_prov")?val("ai_c_prov"):c.chat.provider, endpoint:el("ai_c_ep")?(val("ai_c_ep")||c.chat.endpoint):c.chat.endpoint, model:el("ai_c_model")?val("ai_c_model"):c.chat.model, systemExtra:el("ai_c_sys")?val("ai_c_sys"):c.chat.systemExtra,
           key: ck==="clear"?null:(ck||undefined), keySet: ck==="clear"?false:(!!ck||c.chat.keySet) })
  });
  ["image","chat"].forEach(function(k){ var o=c[k], n=WS.ai[k]; if(n.key!==undefined||n.provider!==o.provider||n.endpoint!==o.endpoint||n.model!==o.model) delete n.lastCheck; });
  if(!API.on){ window.ZENCREVIA_DEMO_AI_KEYS=window.ZENCREVIA_DEMO_AI_KEYS||{}; if(ik==="clear") delete window.ZENCREVIA_DEMO_AI_KEYS.image; else if(ik) window.ZENCREVIA_DEMO_AI_KEYS.image=ik; if(ck==="clear") delete window.ZENCREVIA_DEMO_AI_KEYS.chat; else if(ck) window.ZENCREVIA_DEMO_AI_KEYS.chat=ck; if(external&&!WS.ai.processing.acceptedAt){ WS.ai.processing.acceptedAt=new Date().toISOString(); WS.ai.processing.acceptedBy=ME; } WS.ai.image.key=""; WS.ai.chat.key=""; }
  var p=persistWS().then(function(saved){ if(saved===false) return false; ["image","chat"].forEach(function(k){ if(WS.ai[k].key){ WS.ai[k].key=""; WS.ai[k].keySet=true; } else if(WS.ai[k].key===null){ WS.ai[k].key=""; } }); if(!opts.quiet) toast(tr("AI settings saved")); if(!opts.quiet&&S.screen==="settings") renderScreen(false); return true; });
  return p; };
aiTest=function(which){ if(!API.on){ toast(tr("Testing connection…")); var probe=which==="chat"?aiDirectChat("ready?"):aiDirectImage({prompt:"a plain neutral grey gradient, no subject",width:512,height:512}); return probe.then(function(){ toast(tr("Connection works")); },function(e){ toast(tr("Connection failed")+": "+e.message,"bad"); }); }
  toast(tr("Testing connection…"));
  return saveAI({quiet:true}).then(function(ok){ if(ok===false) return; var chosen=(typeof aiDefaultModel==="function"&&aiDefaultModel())||null;
    return apiFetch("POST","/api/ai/test",{kind:which,modelRegistryId:chosen?chosen.id:null}).then(function(r){ WS.ai[which]=WS.ai[which]||{}; WS.ai[which].lastCheck={ok:r.ok,at:r.at,by:r.by,error:r.error||null,ms:r.ms};
      if(r.ok) toast(tr("Connection works")+(r.sample&&r.sample!=="image"?": "+r.sample:"")+" · "+Math.round(r.ms/100)/10+" s"); else toast(tr("Connection failed")+": "+r.error,"bad");
      if(S.screen==="settings") renderScreen(false); }); }).catch(function(e){ toast(tr("Connection failed")+": "+e.message,"bad"); }); };

/* ---------- #19 Google Drive: "Connected" only after a real check ---------- */
function gdCheck(){ var c=cloudOf("gdrive"); if(!c||!gdReady()) return toast(tr("Add the Client ID first"),"bad"); toast(tr("Testing connection…"));
  var cfg=gdCfg();
  return gdToken().then(function(token){ var h={Authorization:"Bearer "+token};
      return fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",{headers:h}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error((j.error&&j.error.message)||("Drive "+r.status)); return j.user||{}; }); })
      .then(function(user){ if(!cfg.folderId) return {user:user,folder:null}; return fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(cfg.folderId)+"?supportsAllDrives=true&fields=id,name,capabilities(canAddChildren)",{headers:h}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(tr("Team folder")+": "+((j.error&&j.error.message)||r.status)); if(j.capabilities&&j.capabilities.canAddChildren===false) throw new Error(tr("This account can open the team folder but cannot upload to it.")); return {user:user,folder:j}; }); }); }); })
    .then(function(r){ c.connected=true; c.account=r.user.emailAddress||c.account; if(r.folder) c.folder=r.folder.name; c.lastCheck={ok:true,at:new Date().toISOString(),by:ME,account:r.user.emailAddress||""}; if(canI.manageWorkspace()) persistWS(); toast(tr("Drive works")+" · "+(r.user.emailAddress||"")+(r.folder?" · "+r.folder.name:"")); if(S.screen==="settings") renderScreen(false); })
    .catch(function(e){ c.lastCheck={ok:false,at:new Date().toISOString(),by:ME,error:e.message}; if(canI.manageWorkspace()) persistWS(); toast(tr("Drive check failed")+": "+e.message,"bad"); if(S.screen==="settings") renderScreen(false); }); }
(function(){ if(typeof setIntegrations!=="function") return; var base=setIntegrations; setIntegrations=function(){ var h=base.apply(this,arguments); if(typeof h!=="string") return h; var c=cloudOf("gdrive")||{}, lc=c.lastCheck, verified=c.connected&&lc&&lc.ok;
    if(c.connected&&!verified) h=h.replace('<span class="drive-status">'+esc(tr("Connected"))+'</span>','<span class="badge warn">'+esc(tr(lc&&!lc.ok?"Test failed":"Not verified"))+'</span>');
    var panel=sp("Google Drive connection",'<p class="hint" style="margin-bottom:10px">'+tr("Checks sign-in and access to the team folder from this browser.")+'</p>'+(lc?'<div class="pref"><div class="pl"><b>'+(lc.ok?'<span class="badge approved">'+tr("Verified")+'</span>':'<span class="badge bad">'+tr("Test failed")+'</span>')+'</b><span>'+tr("Last check")+' '+esc(new Date(lc.at).toLocaleString())+(lc.account?' · '+esc(lc.account):'')+(lc.error?' · '+esc(lc.error):'')+'</span></div></div>':''),gdReady()?'<button class="btn primary" onclick="gdCheck()">'+I.sync+tr("Test Google Drive")+'</button>':'',I.cloud);
    return panel+h; }; })();

/* ---------- #4 Settings → Backup & data → Remove demo data ---------- */
var DEMO_PURGE={data:null,loading:false};
function demoPurgeLoad(){ if(!API.on||DEMO_PURGE.loading||!canI.manageWorkspace()||!canI.manageMembers()) return; DEMO_PURGE.loading=true; apiFetch("GET","/api/admin/demo-data").then(function(d){ DEMO_PURGE.data=d; if(S.screen==="settings"&&S.settingsTab==="backup") renderScreen(false); }).catch(function(){ DEMO_PURGE.data={error:true}; }).finally(function(){ DEMO_PURGE.loading=false; }); }
function demoPurgePanel(){ if(!API.on||!canI.manageWorkspace()||!canI.manageMembers()) return ""; var d=DEMO_PURGE.data; if(!d){ demoPurgeLoad(); return ""; } if(d.error) return "";
  var any=d.people.length||d.tasks||d.projects||d.assets||d.knowledge;
  if(!any) return sp("Demo accounts and sample content",'<p class="hint">'+tr("No demo accounts or demo content found.")+'</p>',null,I.user);
  return sp("Demo accounts and sample content",'<p class="hint" style="margin-bottom:10px">'+tr("This workspace still contains accounts and content from the demo seed.")+'</p>'
    +'<div class="pref"><div class="pl"><b>'+tr("Demo accounts")+' · '+d.people.length+'</b><span>'+esc(d.people.map(function(p){ return p.name; }).join(", ")||"—")+'</span></div></div>'
    +'<div class="pref"><div class="pl"><b>'+tr("Sample tasks")+' · '+d.tasks+' · '+tr("Sample projects")+' · '+d.projects+'</b><span>'+d.assets+' assets · '+d.knowledge+' knowledge pages</span></div></div>'
    +'<p class="hint">'+tr("Demo accounts leave the workspace and cannot sign in. Their open tasks move to you. Sample content is deleted unless real work was added to it. Make a backup first.")+'</p>',
    '<button class="btn" onclick="demoPurgeRun(false)">'+tr("Accounts only")+'</button><span class="spacer"></span><button class="btn danger" onclick="demoPurgeRun(true)">'+I.trash+tr("Remove accounts and sample content")+'</button>',I.user); }
function demoPurgeRun(content){ confirmModal(tr("Remove demo data"),tr("Demo accounts leave the workspace and cannot sign in. Their open tasks move to you. Sample content is deleted unless real work was added to it. Make a backup first."),function(){ apiFetch("POST","/api/admin/demo-data/remove",{people:true,content:!!content}).then(function(r){ toast(tr("Demo data removed")+" · "+r.people+" / "+r.tasks); DEMO_PURGE.data=null; return reloadAll(); }).catch(function(e){ toast(e.message,"bad"); }); },true); }
(function(){ if(typeof setBackup!=="function") return; var base=setBackup; setBackup=function(){ var h=base.apply(this,arguments); return typeof h==="string"?h+demoPurgePanel():h; }; })();
</script>
<script>
/* v39 images are served from /files/<sha>.<ext> (server/uploads.js) instead of living inside the
   task as data URLs. Downloads and "copy image" fetch them from there. */
(function(){ var base=saveFile; saveFile=function(o){ o=o||{}; var src=o.img||o.preview||o.url||"";
  if(/^\/files\/[a-f0-9]{64}\./.test(src)&&!o.driveId){ toast(tr("Downloading…")); return fetch(src,{credentials:"same-origin"}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.blob(); }).then(function(b){ triggerDownload(b,saveFileName(o.name||"image",b.type)); }).catch(function(){ toast(tr("Nothing to save"),"bad"); }); }
  return base.apply(this,arguments); }; })();
</script>
