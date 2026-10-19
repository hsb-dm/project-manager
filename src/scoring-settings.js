<script>
/* ============================================================
   SETTINGS → SMART SCORING (Oct 2026)
   Where whoever holds scoring_manage_workspace sets up Smart Scoring (docs/SMART-SCORING.md), after Automation. It
   was one long page with a Save button per panel; now seven groups in a menu on the left (chips on a phone), one at a
   time: Overview, Estimating, Output & goals, AI, Review & bonus, Access & visibility, History. The group is in the
   address (/settings/scoring/estimating) so links and Back/Forward work; each person's last group and opened
   "Advanced" folds are kept on their device. Switching group repaints the group only, from the edits kept in memory.
   One Save bar appears while the edits differ from what is saved: Discard puts the saved values back, Save sends
   them with the version they were made on (someone saved in between: theirs is loaded and the person is told).
   Leaving Settings with changes not saved asks first. scoring_view_analytics alone: read-only, no Save bar.
   The sections other files add use these:
   - scSection(id, title, intro, body, opts) → section.panel[data-scr-sec=id] with its h2, a one-line intro,
     opts.example ("Example: …"), body. opts.off: a notice that the module is off (fields stay usable, dimmed); with
     opts.onModule (a module id like "story", or a path like "bonus.on") a "Turn on" button switches it on in the
     draft. opts.icon, opts.foot (panel foot), opts.cls. Strings in English; tr() is applied here.
   - scAdvanced(body, opts) → a closed "Advanced" fold; opts.id (e.g. "bonus") remembers it per person, opts.hint.
   - scHelp(text, example) → a field's help line, with "Example: …" when given.
   - scRepaint() → the group drawn again in place (after adding a row), instead of renderScreen.
   - Fields go through scPut/scInput/scSwitch and their data-sc paths, so the Save bar sees every change.
   - Called with (ro, ed) when defined: Estimating → scKindsPanel; Output → scoringAssetsSettingsHtml,
     scoringOutcomesSettingsHtml; Review → scoringBonusSettingsHtml; Access → scoringTeamsSettingsHtml.
     scSaveFoot() returns "". The longer sentences are kept once in each language in SC_T.
   ============================================================ */
var SC={draft:null,saved:null,base:0,dirty:false,audit:null,loading:false,loadedAt:0,saving:false,owner:null,gFor:null,leave:null};
var SC_FACTORS=["complexity","scope","uncertainty","dependencies"];
var SC_FACTOR_LABEL={complexity:"Complexity",scope:"Scope",uncertainty:"Uncertainty",dependencies:"Dependencies"};
var SC_MODULE_LABEL={hours:"Effort Hours",story:"Story Points",weighted:"Weighted Points",assets:"Assets produced",kpi:"KPI",okr:"OKR"};
var SC_MODE_LABEL={math_only:"Math only",ai_assisted:"AI-assisted",hybrid:"Hybrid"};
var SC_PRIMARY_LABEL={hours:"Hours",story_points:"Story Points",weighted_points:"Weighted Points"};
var SC_T=(function(t){ Object.keys(t).forEach(function(k){ var p=t[k]; if(!(p[0] in UI_ID)) UI_ID[p[0]]=p[1]; t[k]=p[0]; }); return t; })({
  gOverview:["Switch Smart Scoring and its modules on or off, and see what each one does.","Nyalakan atau matikan Smart Scoring dan modul-modulnya, dan lihat fungsi masing-masing."],
  gEstimating:["How a task's hours and points are worked out.","Cara jam dan poin sebuah task dihitung."],
  gOutput:["Points for the assets people produce, and the KPIs and OKRs the work counts towards.","Poin untuk aset yang dihasilkan tiap orang, serta KPI dan OKR yang didukung pekerjaan."],
  gAi:["When the AI may suggest scores, and how often.","Kapan AI boleh menyarankan skor, dan seberapa sering."],
  gReview:["Who may change a score by hand, and the bonus for finishing under the estimate.","Siapa yang boleh mengubah skor secara manual, dan bonus untuk pekerjaan yang selesai di bawah estimasi."],
  gAccess:["Who sees the numbers, and who holds the Smart Scoring permissions.","Siapa yang melihat angkanya, dan siapa yang memegang izin Smart Scoring."],
  gHistory:["Every saved change: who made it, when, and what changed.","Setiap perubahan yang disimpan: siapa, kapan, dan apa yang berubah."],
  off:["{m} is off. You can prepare its settings now; they apply once it is on.","{m} sedang mati. Pengaturannya bisa disiapkan sekarang dan berlaku setelah dinyalakan."],
  ro:["You can see these settings. Changing them takes the permission to set up Smart Scoring.","Kamu bisa melihat pengaturan ini. Untuk mengubahnya perlu izin mengatur Smart Scoring."],
  leave1:["1 change to Smart Scoring is not saved yet. It is lost if you leave.","1 perubahan Smart Scoring belum disimpan. Perubahan itu hilang kalau kamu keluar."],
  leaveN:["{n} changes to Smart Scoring are not saved yet. They are lost if you leave.","{n} perubahan Smart Scoring belum disimpan. Semuanya hilang kalau kamu keluar."],
  master:["Score tasks in hours and points, and link the work to KPIs and OKRs. While it is off, ZenCrevia works exactly as it does now.","Beri skor task dalam jam dan poin, lalu kaitkan pekerjaan dengan KPI dan OKR. Selama mati, ZenCrevia bekerja persis seperti sekarang."],
  masterEx:["Switched on with Effort Hours only: tasks get an estimate and a time log, and nothing else changes.","Dinyalakan dengan Effort Hours saja: task mendapat estimasi dan log waktu, selebihnya tidak berubah."],
  on:["On — the modules below appear for the people allowed to use them.","Nyala — modul di bawah muncul bagi orang yang boleh memakainya."],
  offAll:["Off — nothing changes for anyone.","Mati — tidak ada yang berubah bagi siapa pun."],
  s1:["Hours and points are worked out from the task; the AI may suggest.","Jam dan poin dihitung dari task; AI boleh memberi saran."],
  s2:["A lead approves the estimate, and it is locked.","Lead menyetujui estimasi, lalu estimasi dikunci."],
  s3:["The people assigned log the time they spend.","Orang yang ditugaskan mencatat waktu yang mereka pakai."],
  s4:["Finished work is reviewed; points and any bonus are counted.","Pekerjaan selesai di-review; poin dan bonus (kalau ada) dihitung."],
  modules:["Switch each module on or off on its own. Math only: just the calculation. AI-assisted: the AI suggests, the calculation stays as a fallback. Hybrid: both side by side.","Setiap modul dinyalakan atau dimatikan sendiri-sendiri. Hanya hitungan: cukup hasil hitungan. Dibantu AI: AI memberi saran, hasil hitungan tetap jadi cadangan. Hibrida: keduanya berdampingan."],
  masterOff:["Smart Scoring itself is still off, so the modules switched on below show nowhere yet. Switch on “Smart Scoring for this workspace” above and save.","Smart Scoring sendiri masih mati, jadi modul yang dinyalakan di bawah belum tampil di mana pun. Nyalakan “Smart Scoring untuk workspace ini” di atas, lalu simpan."],
  hoursDo:["Estimates each task's hours from the kind of work, the number of deliverables, complexity and open dependencies.","Mengestimasi jam tiap task dari jenis pekerjaan, jumlah deliverable, kompleksitas, dan ketergantungan yang masih terbuka."],
  hoursSee:["People see the estimate on each task and log their time against it.","Orang melihat estimasi di tiap task dan mencatat waktunya terhadap estimasi itu."],
  storyDo:["Gives each task 1, 2, 3, 5, 8 or 13 points from four quick 1–5 ratings.","Memberi tiap task 1, 2, 3, 5, 8, atau 13 poin dari empat penilaian cepat 1–5."],
  storySee:["People see Story Points on the task, and points done against planned on Teams.","Orang melihat Story Points di task, serta poin selesai dibanding rencana di Teams."],
  weightedDo:["Turns the same ratings into points on the workspace's own scale, 1–10 by default.","Mengubah penilaian yang sama menjadi poin pada skala milik workspace, bawaannya 1–10."],
  weightedSee:["People see Weighted Points on the task; they are also the bonus's base points.","Orang melihat Poin Berbobot di task; poin ini juga menjadi poin dasar bonus."],
  assetsDo:["Gives each person points for the assets they produce, by kind of work: a feed post 1, a resize 0.25, a logo 5.","Memberi tiap orang poin untuk aset yang dihasilkannya, menurut jenis pekerjaan: feed post 1, resize 0,25, logo 5."],
  assetsSee:["People see their asset points on the task and in Analytics.","Orang melihat poin asetnya di task dan di Analytics."],
  kpiDo:["Indicators the work counts towards, moved only by evidence: validated assets or finished tasks.","Indikator yang didukung pekerjaan, hanya bergerak karena bukti: aset yang divalidasi atau task yang selesai."],
  kpiSee:["People see the KPIs a task counts towards, and their progress in Analytics.","Orang melihat KPI yang didukung sebuah task, dan progresnya di Analytics."],
  okrDo:["Objectives with key results; the key results add up to the objective's progress.","Objective dengan key result; key result menjumlah menjadi progres objective-nya."],
  okrSee:["People see the key results a task counts towards, and their progress in Analytics.","Orang melihat key result yang didukung sebuah task, dan progresnya di Analytics."],
  primary:["The one metric velocity is counted in, so nothing is counted twice. Workload and capacity stay in hours.","Satu-satunya metrik untuk menghitung velocity, agar tidak ada yang terhitung dua kali. Beban kerja dan kapasitas tetap dalam jam."],
  primaryEx:["Story Points: velocity is the Story Points finished in the period.","Story Points: velocity adalah Story Points yang selesai dalam periode itu."],
  hours:["A task's estimated hours: the first deliverable's hours, plus a share for each next one, adjusted for complexity and open dependencies.","Jam estimasi sebuah task: jam deliverable pertama, ditambah porsi untuk tiap deliverable berikutnya, lalu disesuaikan dengan kompleksitas dan ketergantungan yang masih terbuka."],
  hoursEx:["3 feed posts: 2 h + 1 h + 1 h = 4 h; rated complex (× 1.25), 5 h.","3 feed post: 2 jam + 1 jam + 1 jam = 4 jam; dinilai kompleks (× 1,25), jadi 5 jam."],
  lock:["After the lock, only people allowed to change scores can change it. Estimates tasks already have are kept: nothing is recalculated unless someone asks.","Setelah dikunci, hanya orang yang berizin mengubah skor yang bisa mengubahnya. Estimasi yang sudah ada tetap dipakai: tidak ada yang dihitung ulang kecuali diminta."],
  lockWork:["When it is approved — or, if work starts first, it is frozen then (unapproved: it never earns a bonus)","Saat disetujui — atau, bila pekerjaan dimulai lebih dulu, dibekukan saat itu (belum disetujui: tidak pernah mendapat bonus)"],
  next:["Each next: the share of the first one's hours that every next deliverable adds (1 at most).","Tiap berikutnya: porsi jam deliverable pertama yang ditambahkan setiap deliverable berikutnya (paling banyak 1)."],
  nextEx:["12 resizes at 1.5 h, each next 0.25: about 5.5 h.","12 resize, 1,5 jam, tiap berikutnya 0,25: sekitar 5,5 jam."],
  cx:["How much the complexity rating stretches or shrinks the hours.","Seberapa besar penilaian kompleksitas menambah atau mengurangi jam."],
  cxEx:["5 · Very complex at × 1.5 turns 4 h into 6 h.","5 · Sangat kompleks dengan × 1,5 mengubah 4 jam menjadi 6 jam."],
  dp:["Extra time while other work is still open.","Tambahan waktu selama pekerjaan lain masih terbuka."],
  dpEx:["1 open dependency at × 1.1 turns 4 h into 4.4 h.","1 ketergantungan terbuka dengan × 1,1 mengubah 4 jam menjadi 4,4 jam."],
  bounds:["No estimate goes below the fewest or above the most hours.","Tidak ada estimasi di bawah jam paling sedikit atau di atas jam paling banyak."],
  story:["Each task gets 1, 2, 3, 5, 8 or 13 points from four 1–5 ratings: complexity, scope, uncertainty and dependencies. 13 suggests splitting the task.","Tiap task mendapat 1, 2, 3, 5, 8, atau 13 poin dari empat penilaian 1–5: kompleksitas, cakupan, ketidakpastian, dan ketergantungan. 13 berarti task sebaiknya dipecah."],
  storyEx:["Rated 3, 3, 2 and 1: index 2.6, so 3 points.","Dinilai 3, 3, 2, dan 1: indeks 2,6, jadi 3 poin."],
  weights:["How much each rating counts; together they must be 100%.","Seberapa besar tiap penilaian dihitung; jumlahnya harus 100%."],
  thresholds:["Above the last: 13 points, which suggests splitting the task. The thresholds are kept in order when saved.","Di atas yang terakhir: 13 poin, yang menyarankan task dipecah. Ambang diurutkan saat disimpan."],
  weighted:["Points from the same four ratings, each weighted, on a scale from 1 to the top set here.","Poin dari empat penilaian yang sama, masing-masing dibobot, pada skala 1 sampai batas atas yang diatur di sini."],
  weightedEx:["Rated 3, 3, 2 and 1: index 2.6, so 4.6 points on a scale of 1 to 10.","Dinilai 3, 3, 2, dan 1: indeks 2,6, jadi 4,6 poin pada skala 1 sampai 10."],
  mapping:["Changing the weights or the scale starts a new mapping version; scores already given keep theirs.","Mengubah bobot atau skala memulai versi pemetaan baru; skor yang sudah diberikan tetap memakai versinya."],
  ai:["The AI only suggests; people decide. It never changes a locked value, gives a bonus or records progress.","AI hanya memberi saran; keputusan tetap di tangan orang. AI tidak pernah mengubah nilai yang terkunci, memberi bonus, atau mencatat progres."],
  aiEx:["With 20 suggestions a person a day, the 21st request in a day gets the calculation only.","Dengan 20 saran per orang per hari, permintaan ke-21 dalam sehari hanya mendapat hasil hitungan."],
  aiModel:["Which model answers is chosen in Settings → AI & integrations → Models → Chat models, under “Used for”.","Model yang menjawab dipilih di Pengaturan → AI & integrasi → Model → Model chat, pada “Dipakai untuk”."],
  aiCreate:["Only once Smart Scoring is on. While it is off, the estimate filled in on Create works as it always has.","Hanya setelah Smart Scoring dinyalakan. Selama mati, estimasi yang terisi saat Create bekerja seperti biasa."],
  aiBrief:["Never on every keystroke or when a task is opened.","Tidak pernah di setiap ketikan atau saat task dibuka."],
  aiConf:["Below that confidence, a suggestion is shown with a warning.","Di bawah tingkat keyakinan itu, saran ditampilkan dengan peringatan."],
  aiSees:["What the AI sees: the title, brief, number of deliverables, labels, team and up to 800 characters of the description (no links or e-mail addresses); similar finished tasks only while the workspace shares its data with the AI.","Yang dilihat AI: judul, brief, jumlah deliverable, label, tim, dan hingga 800 karakter deskripsi (tanpa link atau alamat email); task serupa yang sudah selesai hanya selama workspace berbagi datanya dengan AI."],
  manual:["What happens when someone changes a calculated score by hand.","Apa yang terjadi bila seseorang mengubah skor hasil hitungan secara manual."],
  manualEx:["An estimate changed from 6 h to 8 h needs a reason, and with approval on, it waits for an approver.","Estimasi yang diubah dari 6 jam ke 8 jam perlu alasan, dan bila persetujuan dinyalakan, perubahan itu menunggu penyetuju."],
  reason:["Kept in the task's scoring history with who made the change.","Disimpan di riwayat skor task beserta siapa yang mengubahnya."],
  approval:["Someone with the permission to approve estimates confirms them first.","Orang yang berizin menyetujui estimasi mengonfirmasinya terlebih dulu."],
  self:["Not recommended. Recorded in the history, and an estimate approved this way never earns a bonus.","Tidak disarankan. Dicatat di riwayat, dan estimasi yang disetujui dengan cara ini tidak pernah mendapat bonus."],
  holders:["Admin always holds all of them. Give one to a role in Roles & permissions, or to one person from their row in Members. Being assigned to a task never gives any of them.","Admin selalu memegang semuanya. Beri ke sebuah role di Role & izin, atau ke satu orang dari barisnya di Members. Ditugaskan pada task tidak pernah memberi izin ini."],
  holdersEx:["Once the leads have them, a Team Lead approves the estimates of their team's tasks — never of their own.","Setelah lead memilikinya, Team Lead menyetujui estimasi task timnya — tidak pernah task-nya sendiri."],
  leadsCan:["Team Lead and Creative Lead can be given the permissions to approve estimates and finished work and to see the team's scoring analytics.","Team Lead dan Creative Lead bisa diberi izin menyetujui estimasi dan pekerjaan selesai serta melihat analitik skor tim."],
  leadsHave:["Team Lead and Creative Lead have the approval and analytics permissions.","Team Lead dan Creative Lead sudah punya izin persetujuan dan analitik."],
  leadsAsk:["They will be able to approve estimates and finished work (never on their own tasks) and to see the team's scoring analytics. Nothing else about the roles changes, and each permission can be taken back in Roles & permissions.","Mereka akan bisa menyetujui estimasi dan pekerjaan selesai (tidak pernah pada task sendiri) serta melihat analitik skor tim. Hal lain dari role tidak berubah, dan setiap izin bisa dicabut di Role & izin."],
  leadsDone:["Team Lead and Creative Lead have the approval and analytics permissions now","Team Lead dan Creative Lead kini punya izin persetujuan dan analitik"],
  conflict:["Someone else saved the Smart Scoring settings in the meantime. Their version is loaded now; make your change again.","Orang lain sudah menyimpan pengaturan Smart Scoring. Versi mereka kini dimuat; ulangi perubahanmu."],
  duty:["This role can both change scores and approve them. Recommended: give these to different people. Nobody approves an estimate or a bonus on their own task either way.","Role ini bisa mengubah skor sekaligus menyetujuinya. Disarankan: berikan ke orang yang berbeda. Bagaimanapun, tidak ada yang menyetujui estimasi atau bonus pada task-nya sendiri."]
});
/* [id, name, icon, one line] */
var SC_GROUPS=[["overview","Overview","gauge",SC_T.gOverview],["estimating","Estimating","clock",SC_T.gEstimating],["output","Output & goals","target",SC_T.gOutput],["ai","AI","sparkle",SC_T.gAi],
  ["review","Review & bonus","star",SC_T.gReview],["access","Access & visibility","lock",SC_T.gAccess],["history","History","list",SC_T.gHistory]];
var SC_NAMED={"ai.onCreate":"Suggest when a task is created","ai.onBriefRevision":"Suggest again when the brief changes a lot","ai.minConfidence":"Warn below confidence","ai.perUserDaily":"Suggestions per person a day","ai.workspaceDaily":"Suggestions for the workspace a day","ai.comparables":"Similar finished tasks as examples",
  "overrides.requireReason":"A reason for every manual change","overrides.requireApproval":"Manual changes wait for approval","overrides.allowSelfApproveEstimate":"Someone assigned to a task may approve its estimate",
  "hours.bounds.min":"Fewest hours","hours.bounds.max":"Most hours","hours.lockPolicy":"An estimate is locked","primaryCapacity":"Primary capacity metric","enabled":"Smart Scoring"};

/* ---------- the edits, kept apart from the saved settings until Save ---------- */
function scDraft(){ var cur=scoringSettings(); if(!cur) return null;
  /* someone else signed in on this page: they start from the saved settings, not from another person's edits */
  if(SC.owner!==ME){ SC.draft=null; SC.audit=null; SC.loadedAt=0; SC.owner=ME; }
  if(!SC.draft||!SC.saved||(!scCount()&&SC.base!==cur.configVersion)){ SC.draft=clone(cur); SC.saved=clone(cur); SC.base=cur.configVersion; SC.dirty=false; }
  return SC.draft; }
/* how many fields differ from what is saved (the server's own bookkeeping left out) */
function scCount(){ var m=scoringModel(); return SC.draft&&SC.saved&&m?m.diffSettings(SC.saved,SC.draft).length:0; }
function scGet(path){ return String(path).split(".").reduce(function(o,k){ return o==null?undefined:o[k]; },SC.draft); }
function scPut(path,v){ var ks=String(path).split("."), o=SC.draft; for(var i=0;i<ks.length-1;i++){ if(o[ks[i]]==null||typeof o[ks[i]]!=="object") o[ks[i]]={}; o=o[ks[i]]; } o[ks[ks.length-1]]=v; SC.dirty=true; scLivePaint(); }
function scPct(x){ return Math.round((+x||0)*10000)/100; }
function scTotal(w){ return Math.round(SC_FACTORS.reduce(function(s,f){ return s+(+(w||{})[f]||0); },0)*10000)/100; }
function scInput(el){ if(!SC.draft) return; var k=el.getAttribute("data-k"), p=el.getAttribute("data-sc"), v=el.value;
  if(k==="num"||k==="pct"){ var n=parseFloat(String(v).replace(",",".")); if(!isFinite(n)) return; scPut(p,k==="pct"?n/100:n); }
  else if(k==="bool") scPut(p,v==="1"); else scPut(p,v);
  scTotalsPaint(); }
function scSwitch(b){ if(!SC.draft||b.disabled) return; var on=!b.classList.contains("on"); b.classList.toggle("on",on); b.setAttribute("aria-checked",String(on)); scPut(b.getAttribute("data-sc"),on); }
/* modules switched on while Smart Scoring itself is off show nowhere: Overview says so while it is the case */
function scMasterOff(){ var d=SC.draft||{}, m=d.modules||{}; return !d.enabled&&Object.keys(m).some(function(k){ return m[k]&&m[k].on; }); }
function scLivePaint(){ var el=document.querySelector(".scr-master-off"), st=document.getElementById("scrMasterState");
  if(el) el.style.display=scMasterOff()?"":"none"; if(st) st.textContent=tr(SC.draft&&SC.draft.enabled?SC_T.on:SC_T.offAll); scBarPaint(); }

/* ---------- the pieces every section is made of (the contract above) ---------- */
function scSection(id,title,intro,body,o){ o=o||{}; var p=o.onModule?(String(o.onModule).indexOf(".")<0?"modules."+o.onModule+".on":o.onModule):"";
  return '<section class="panel scr-sec'+(o.off?" off":"")+(o.cls?" "+o.cls:"")+'" data-scr-sec="'+attr(id)+'"><div class="panel-head">'+(o.icon?'<span class="sq">'+o.icon+'</span>':'')+'<h2>'+tr(title)+'</h2></div><div class="panel-body pad">'
    +(o.off?'<div class="banner scr-off" role="status"><span>'+tr(o.off)+'</span>'+(p&&canI.scoringConfigure()?'<button type="button" class="btn sm" onclick="scTurnOn('+jsq(p)+')">'+tr("Turn on")+'</button>':'')+'</div>':'')
    +(intro?'<p class="scr-intro">'+tr(intro)+'</p>':'')+(o.example?'<p class="scr-ex">'+tr("Example:")+' '+tr(o.example)+'</p>':'')
    +'<div class="scr-sec-body">'+body+'</div></div>'+(o.foot?'<div class="panel-foot">'+o.foot+'</div>':'')+'</section>'; }
function scAdvanced(body,o){ o=o||{}; var id=o.id?String(o.id):"", open=!!(id&&scUi().adv[id]);
  return '<details class="scr-adv"'+(id?' data-adv="'+attr(id)+'" ontoggle="scAdvToggle(this)"':'')+(open?' open':'')+'><summary>'+tr(o.title||"Advanced")+(o.hint?'<span>'+tr(o.hint)+'</span>':'')+'</summary><div class="scr-adv-body">'+body+'</div></details>'; }
function scHelp(text,example){ return '<div class="scr-help">'+tr(text)+(example?'<span class="scr-ex">'+tr("Example:")+' '+tr(example)+'</span>':'')+'</div>'; }
function scSaveFoot(){ return ""; }
function scOff(id){ return scGet("modules."+id+".on")?"":fmt(tr(SC_T.off),{m:tr(SC_MODULE_LABEL[id])}); }
function scTurnOn(p){ if(!SC.draft) return; scPut(p,true); scRepaint(); }
function scSwitchHtml(path,label,ro){ var on=!!scGet(path); return '<button type="button" class="switch'+(on?" on":"")+'" role="switch" aria-checked="'+on+'" aria-label="'+attr(tr(label))+'" data-sc="'+attr(path)+'"'+(ro?" disabled":' onclick="scSwitch(this)"')+'></button>'; }
function scPrefHtml(path,desc,ro){ var label=SC_NAMED[path]; return '<div class="pref"><div class="pl"><b>'+tr(label)+'</b><span>'+tr(desc)+'</span></div>'+scSwitchHtml(path,label,ro)+'</div>'; }
function scNumHtml(id,path,label,o){ o=o||{}; var v=scGet(path), shown=o.pct?scPct(v):(v==null?"":v);
  return '<div class="field"><label for="'+id+'">'+tr(label)+'</label><div class="scr-unit"><input type="number" id="'+id+'" data-sc="'+attr(path)+'" data-k="'+(o.pct?"pct":"num")+'" value="'+attr(shown)+'"'+(o.min!=null?' min="'+o.min+'"':'')+(o.max!=null?' max="'+o.max+'"':'')+' step="'+(o.step||"any")+'"'+(o.ro?" disabled":' oninput="scInput(this)"')+'>'+(o.unit?'<span>'+esc(tr(o.unit))+'</span>':'')+'</div></div>'; }
function scSelectHtml(id,path,opts,ro,extraCls,label){ return selectHtml(id,opts.map(function(o){ return [o[0],tr(o[1])]; }),scGet(path),'data-sc="'+attr(path)+'" data-k="str"'+(extraCls?' class="'+extraCls+'"':'')+(label?' aria-label="'+attr(label)+'"':'')+(ro?" disabled":' onchange="scInput(this)"')); }
function scWeightsHtml(key,ro){
  return '<div class="eyebrow">'+tr("Weight of each factor")+'</div><div class="scr-grid">'+SC_FACTORS.map(function(f){ return scNumHtml("sc_"+key+"_w_"+f,key+".weights."+f,SC_FACTOR_LABEL[f],{pct:true,min:0,max:100,step:1,unit:"%",ro:ro}); }).join("")+'</div>'
    + '<div class="scr-total" id="sc_total_'+key+'" aria-live="polite"></div>'+scHelp(SC_T.weights); }
function scTotalsPaint(){ ["weighted","story"].forEach(function(k){ var el=document.getElementById("sc_total_"+k); if(!el||!SC.draft) return; var t=scTotal((SC.draft[k]||{}).weights), ok=Math.abs(t-100)<0.05;
  el.className="scr-total "+(ok?"ok":"bad"); el.textContent=tr("Total")+": "+t+"%"+(ok?"":" · "+tr("must be 100% to save")); }); }

/* ---------- what each person last chose here, on this device ---------- */
function scUiKey(){ return "cos.scoring.ui."+((typeof WS!=="undefined"&&WS&&WS.id)||"ws")+"."+ME; }
function scUi(){ try{ var o=JSON.parse(localStorage.getItem(scUiKey())||"null"); if(o&&typeof o==="object") return {g:o.g,adv:o.adv&&typeof o.adv==="object"?o.adv:{}}; }catch(e){} return {g:null,adv:{}}; }
function scUiPut(f){ var o=scUi(); f(o); try{ localStorage.setItem(scUiKey(),JSON.stringify(o)); }catch(e){} }
function scAdvToggle(el){ var id=el.getAttribute("data-adv"), open=el.open; scUiPut(function(o){ if(open) o.adv[id]=1; else delete o.adv[id]; }); }
function scGroupOk(g){ return SC_GROUPS.some(function(x){ return x[0]===g; }); }
function scGroup(){ if(SC.gFor!==ME){ SC.gFor=ME; S.scoringGroup=scUi().g; } return scGroupOk(S.scoringGroup)?S.scoringGroup:"overview"; }
function scGroupSet(g){ if(!scGroupOk(g)) return; SC.gFor=ME; S.scoringGroup=g; scUiPut(function(o){ o.g=g; }); }

/* ---------- the tab: the groups, the group shown, the Save bar ---------- */
function setScoring(){
  var cur=scoringSettings(); if(!cur) return sp("Smart Scoring",'<div class="hint">'+tr("Smart Scoring is not available")+'</div>',null,I.gauge);
  scDraft(); var ed=canI.scoringConfigure(), g=scGroup(), n=scCount();
  setTimeout(scLoadOnce,0); setTimeout(function(){ scTotalsPaint(); scNavScroll(); },0);
  return '<div class="scr-shell"><nav class="scr-nav" aria-label="Smart Scoring"><ul>'+SC_GROUPS.map(function(x){
      return '<li><a href="'+attr(routeBuild("settings","scoring/"+x[0]))+'" data-g="'+x[0]+'"'+(x[0]===g?' class="on" aria-current="page"':'')+' onclick="return scGo(\''+x[0]+'\',event)">'+(I[x[2]]||"")+'<span>'+tr(x[1])+'</span></a></li>'; }).join("")+'</ul></nav>'
    + '<div class="scr-main">'+(ed?'':'<div class="banner scr-ro">'+I.eye+'<span>'+tr(SC_T.ro)+'</span></div>')+'<div id="scrBody">'+scGroupHtml(g,!ed,ed)+'</div>'
    + (ed?'<div class="scr-bar'+(n?" on":"")+'" id="scrBar" role="region" aria-label="'+attr(tr("Unsaved changes"))+'"><b class="scr-bar-n" aria-live="polite">'+scCountText(n)+'</b><span class="spacer"></span><button type="button" class="btn" onclick="scDiscard()">'+tr("Discard")+'</button><button type="button" class="btn primary" onclick="scSaveClick()">'+tr("Save")+'</button></div>':'')
    + '</div></div>'; }
function scHook(name,ro,ed){ var f=window[name]; return typeof f==="function"?f(ro,ed)||"":""; }
function scGroupHtml(g,ro,ed){ var x=SC_GROUPS.filter(function(x){ return x[0]===g; })[0], h;
  if(g==="estimating") h=scHook("scKindsPanel",ro,ed)+scHoursPanel(ro)+scStoryPanel(ro)+scWeightedPanel(ro);
  else if(g==="output") h=scHook("scoringAssetsSettingsHtml",ro,ed)+scHook("scoringOutcomesSettingsHtml",ro,ed);   /* src/scoring-assets.js, src/scoring-outcomes.js */
  else if(g==="ai") h=scAiPanel(ro);
  else if(g==="review") h=scOverridesPanel(ro)+scHook("scoringBonusSettingsHtml",ro,ed);   /* src/scoring-awards.js */
  else if(g==="access") h=scHook("scoringTeamsSettingsHtml",ro,ed)+(canI.manageRoles()?scHoldersPanel():"");   /* src/scoring-teams.js */
  else if(g==="history") h=scSection("history","Recent changes","The last 20 saves, newest first.",'<div id="scAudit">'+scAuditHtml()+'</div>',{icon:I.list});
  else h=scMainPanel(ro)+scModulesPanel(ro);
  return '<div class="scr-gh"><h2 id="scrGh" tabindex="-1">'+tr(x[1])+'</h2><p>'+tr(x[3])+'</p></div>'+h; }
function scCountText(n){ return n===1?tr("1 unsaved change"):fmt(tr("{n} unsaved changes"),{n:n}); }
function scBarPaint(){ var b=document.getElementById("scrBar"); if(!b) return; var n=scCount(); b.classList.toggle("on",n>0);
  b.querySelector(".scr-bar-n").textContent=scCountText(n); b.querySelectorAll("button").forEach(function(x){ x.disabled=SC.saving; }); }
/* the chosen group, drawn in place: its heading takes the focus, the address follows */
function scGo(g,e,sec){ if(e&&(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button>0)) return true;
  scGroupSet(g); if(!document.getElementById("scrBody")){ go("settings","scoring"); return false; }
  scPaintGroup(sec,true); routeSync(); return false; }
function scPaintGroup(sec,focus){ var body=document.getElementById("scrBody"); if(!body||!scDraft()) return; var g=scGroup(), ed=canI.scoringConfigure();
  body.innerHTML=scGroupHtml(g,!ed,ed); localizeVisibleText(body); scTotalsPaint(); scBarPaint();
  document.querySelectorAll(".scr-nav a").forEach(function(a){ var on=a.getAttribute("data-g")===g; a.classList.toggle("on",on); if(on) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  scNavScroll(); var t=sec&&body.querySelector('[data-scr-sec="'+sec+'"]');
  if(focus) document.getElementById("scrGh").focus(); if(t) t.scrollIntoView({block:"start"}); }
function scRepaint(){ var y=appScrollTop(); scPaintGroup(); appScrollTop(y); }
/* on a phone the chosen chip is kept in sight */
function scNavScroll(){ var ul=document.querySelector(".scr-nav ul"), a=ul&&ul.querySelector("a.on"); if(a&&ul.scrollWidth>ul.clientWidth) ul.scrollLeft=Math.max(0,a.parentNode.offsetLeft-ul.offsetLeft-24); }
function scDiscard(){ if(!SC.saved) return; SC.draft=clone(SC.saved); SC.dirty=false; scRepaint(); }

/* ---------- Overview ---------- */
function scMainPanel(ro){ var cur=scoringSettings(), by=cur.updatedBy?person(cur.updatedBy).name:"";
  return scSection("master","Smart Scoring",SC_T.master,
    '<div class="pref"><div class="pl"><b>'+tr("Smart Scoring for this workspace")+'</b><span id="scrMasterState">'+tr(scGet("enabled")?SC_T.on:SC_T.offAll)+'</span></div>'+scSwitchHtml("enabled","Smart Scoring for this workspace",ro)+'</div>'
    + '<div class="eyebrow scr-how-h">'+tr("How Smart Scoring works")+'</div><ol class="scr-how">'+[["Estimate",SC_T.s1],["Approve & lock",SC_T.s2],["Log the time",SC_T.s3],["Review & points",SC_T.s4]].map(function(s){ return '<li><b>'+tr(s[0])+'</b><span>'+tr(s[1])+'</span></li>'; }).join("")+'</ol>'
    + '<div class="hint scr-meta">'+tr("Settings version")+' '+cur.configVersion+(by?' · '+tr("last saved by")+' <span data-no-translate>'+esc(by)+'</span> · '+esc(ago(minAgo(cur.updatedAt),cur.updatedAt)):'')+'</div>',
    {icon:I.gauge,example:SC_T.masterEx}); }
function scModulesPanel(ro){ var modes=[["math_only","Math only"],["ai_assisted","AI-assisted"],["hybrid","Hybrid"]];
  return scSection("modules","Modules",SC_T.modules,
    '<div class="banner warn scr-master-off" role="status"'+(scMasterOff()?'':' style="display:none"')+'><span>'+tr(SC_T.masterOff)+'</span></div>'
    + '<div class="scr-cards">'+["hours","story","weighted","assets","kpi","okr"].map(function(id,i){ var name=SC_MODULE_LABEL[id], to=i<3?"estimating":"output";
      return '<div class="scr-card" data-module="'+id+'"><div class="scr-card-h"><b>'+tr(name)+'</b>'+scSwitchHtml("modules."+id+".on",name,ro)+'</div>'
        + (i<3?fieldHtml("sc_mode_"+id,"How it works",scSelectHtml("sc_mode_"+id,"modules."+id+".mode",modes,ro)):'')
        + '<p>'+tr(SC_T[id+"Do"])+'</p><p class="scr-see">'+I.eye+'<span>'+tr(SC_T[id+"See"])+'</span></p>'
        + '<button type="button" class="btn xs ghost scr-setup" onclick="scGo(\''+to+'\',0,\''+(i>3?"outcomes":id)+'\')">'+tr("Set up")+' →</button></div>'; }).join("")+'</div>'
    + fieldHtml("sc_primary","Primary capacity metric",scSelectHtml("sc_primary","primaryCapacity",[["hours","Hours"],["story_points","Story Points"],["weighted_points","Weighted Points"]],ro))+scHelp(SC_T.primary,SC_T.primaryEx),
    {icon:I.sync}); }

/* ---------- Estimating ---------- */
function scHoursPanel(ro){
  var kinds=(typeof ScoringSettings!=="undefined"&&ScoringSettings.KINDS)||Object.keys(scGet("hours.templates")||{});
  var name=function(id){ return typeof estKindName==="function"?estKindName(id):id; };
  var cell=function(id,f,step){ return '<td><input type="number" class="scr-cell" aria-label="'+attr(name(id)+" · "+tr({perUnit:"First deliverable (h)",low:"Low (h)",high:"High (h)",nextUnitFactor:"Each next deliverable (× the first)"}[f]))+'" data-sc="hours.templates.'+id+'.'+f+'" data-k="num" min="0" step="'+step+'" value="'+attr(scGet("hours.templates."+id+"."+f))+'"'+(ro?" disabled":' oninput="scInput(this)"')+'></td>'; };
  var grid=function(key,list,o){ return '<div class="scr-grid">'+list.map(function(c){ return scNumHtml("sc_"+key+"_"+c[0],"hours."+(key==="cx"?"complexity":"dependency")+"."+c[0],c[1],o); }).join("")+'</div>'; };
  /* the hours per kind of work move to "Kinds of work" once it is there */
  var tpl=typeof scKindsPanel==="function"?"":'<div class="eyebrow">'+tr("Hours per kind of work")+'</div><div class="tbl-wrap scr-tpl"><table class="tbl"><thead><tr><th>'+tr("Kind of work")+'</th><th>'+tr("First (h)")+'</th><th>'+tr("Low (h)")+'</th><th>'+tr("High (h)")+'</th><th>'+tr("Each next (× first)")+'</th></tr></thead><tbody>'
    + kinds.map(function(id){ return '<tr data-kind="'+attr(id)+'"><td class="t">'+esc(name(id))+'</td>'+cell(id,"perUnit","0.25")+cell(id,"low","0.25")+cell(id,"high","0.25")+cell(id,"nextUnitFactor","0.05")+'</tr>'; }).join("")
    + '</tbody></table></div>'+scHelp(SC_T.next,SC_T.nextEx);
  return scSection("hours","Effort Hours",SC_T.hours,
    fieldHtml("sc_lock","An estimate is locked",scSelectHtml("sc_lock","hours.lockPolicy",[["approve","When it is approved"],["approve_or_work_start",SC_T.lockWork]],ro))+scHelp(SC_T.lock)
    + scAdvanced(tpl
      + '<div class="eyebrow">'+tr("Complexity multiplier")+'</div>'+grid("cx",[[1,"1 · Very simple"],[2,"2 · Simple"],[3,"3 · Typical"],[4,"4 · Complex"],[5,"5 · Very complex"]],{min:0.1,max:10,step:0.05,unit:"×",ro:ro})+scHelp(SC_T.cx,SC_T.cxEx)
      + '<div class="eyebrow">'+tr("Dependency multiplier")+'</div>'+grid("dp",[[0,"No open dependencies"],[1,"1 open dependency"],[2,"2 open dependencies"],[3,"3 or more"]],{min:0.5,max:10,step:0.05,unit:"×",ro:ro})+scHelp(SC_T.dp,SC_T.dpEx)
      + '<div class="eyebrow">'+tr("Limits")+'</div><div class="scr-grid">'+scNumHtml("sc_bmin","hours.bounds.min","Fewest hours",{min:0.05,max:40,step:0.25,unit:"h",ro:ro})+scNumHtml("sc_bmax","hours.bounds.max","Most hours",{min:0.5,max:400,step:1,unit:"h",ro:ro})+'</div>'+scHelp(SC_T.bounds),
      {id:"hours",hint:"Multipliers and limits"}),
    {icon:I.clock,example:SC_T.hoursEx,off:scOff("hours"),onModule:"hours"}); }
function scStoryPanel(ro){
  return scSection("story","Story Points",SC_T.story,
    scAdvanced(scWeightsHtml("story",ro)+'<div class="eyebrow">'+tr("The highest index each point is given for")+'</div><div class="scr-grid">'+[1,2,3,5,8].map(function(p,i){ return scNumHtml("sc_th_"+i,"story.thresholds."+i,tr(p===1?"1 point up to":"{n} points up to").replace("{n}",p),{min:1,max:5,step:0.05,ro:ro}); }).join("")+'</div>'+scHelp(SC_T.thresholds),
      {id:"story",hint:"Weights and thresholds"}),
    {icon:I.list,example:SC_T.storyEx,off:scOff("story"),onModule:"story"}); }
function scWeightedPanel(ro){
  return scSection("weighted","Weighted Points",SC_T.weighted,
    scAdvanced(scWeightsHtml("weighted",ro)+'<div class="scr-grid">'+scNumHtml("sc_wmax","weighted.scaleMax","Top of the scale",{min:2,max:100,step:1,unit:"pts",ro:ro})+'</div>'+scHelp(SC_T.mapping)+'<div class="hint">'+tr("Mapping version")+' '+esc(scGet("weighted.mappingVersion"))+'</div>',
      {id:"weighted",hint:"Weights and scale"}),
    {icon:I.analytics,example:SC_T.weightedEx,off:scOff("weighted"),onModule:"weighted"}); }

/* ---------- AI, Review, Access ---------- */
function scAiPanel(ro){ var num=function(id,p,o){ return scNumHtml(id,p,SC_NAMED[p],Object.assign({min:0,step:1,ro:ro},o)); };
  return scSection("ai","AI suggestions",SC_T.ai,
    '<div class="banner scr-ai-model">'+I.sparkle+'<span>'+tr(SC_T.aiModel)+'</span><button type="button" class="btn xs" onclick="S.aiSettingsSection=\'models\';go(\'settings\',\'ai\')">'+tr("Open Chat models")+'</button></div>'
    + scPrefHtml("ai.onCreate",SC_T.aiCreate,ro)+scPrefHtml("ai.onBriefRevision",SC_T.aiBrief,ro)
    + '<div class="scr-grid">'+num("sc_ai_conf","ai.minConfidence",{pct:true,max:100,step:5,unit:"%"})+num("sc_ai_user","ai.perUserDaily",{max:1000})+num("sc_ai_ws","ai.workspaceDaily",{max:100000})+'</div>'+scHelp(SC_T.aiConf)
    + fieldHtml("sc_ai_cmp","Similar finished tasks as examples",scSelectHtml("sc_ai_cmp","ai.comparables",[["team","Of the same team"],["none","None"]],ro))+scHelp(SC_T.aiSees),
    {icon:I.sparkle,example:SC_T.aiEx}); }
function scOverridesPanel(ro){
  return scSection("overrides","Manual changes",SC_T.manual,
    scPrefHtml("overrides.requireReason",SC_T.reason,ro)+scPrefHtml("overrides.requireApproval",SC_T.approval,ro)+scPrefHtml("overrides.allowSelfApproveEstimate",SC_T.self,ro),
    {icon:I.edit,example:SC_T.manualEx}); }
function scHoldersPanel(){
  var caps=(typeof CAPS!=="undefined"&&CAPS||[]).filter(function(c){ return SCORING_CAPS.indexOf(c[0])>=0; });
  var grants=(typeof CAP_GRANTS!=="undefined"?CAP_GRANTS:[]).filter(function(g){ return typeof capGrantLive!=="function"||capGrantLive(g); });
  var rows=caps.map(function(c){
    var roles=ROLES.filter(function(r){ return r.id==="admin"||(r.permissions||[]).indexOf(c[0])>=0; }).map(function(r){ return '<span class="badge" data-no-translate>'+esc(r.name)+'</span>'; }).join(" ");
    var people=grants.filter(function(g){ return g.cap===c[0]&&PEOPLE[g.userId]; }).map(function(g){ return '<span class="badge scr-grant" data-no-translate>'+esc(PEOPLE[g.userId].name)+(g.expiresAt&&typeof capGrantDate==="function"?' · '+esc(tr("until"))+' '+esc(capGrantDate(g.expiresAt)):'')+'</span>'; }).join(" ");
    return '<div class="pref scr-holder" data-cap="'+attr(c[0])+'"><div class="pl"><b>'+esc(tr(c[1]))+'</b><span class="scr-holder-who">'+roles+(people?' <span class="hint">'+tr("and, on top of their role:")+'</span> '+people:'')+'</span></div></div>'; }).join("");
  var missing=scoringLeadsMissing();
  return scSection("holders","Who holds the Smart Scoring permissions",SC_T.holders,rows,{icon:I.lock,example:SC_T.holdersEx,
    foot:'<span class="hint scr-leads-hint">'+tr(missing?SC_T.leadsCan:SC_T.leadsHave)+'</span><span class="spacer"></span><button class="btn scr-leads" id="scLeadsBtn" onclick="scLeadsClick()"'+(missing?'':' disabled')+'>'+I.team+tr("Give Team Lead and Creative Lead these permissions")+'</button>'}); }

/* ---------- History: each save with who, when and every field from → to ---------- */
function scVal(path,v){ if(v===null||v===undefined) return "—"; if(typeof v==="boolean") return tr(v?"on":"off");
  if(/\.mode$/.test(path)) return tr(SC_MODE_LABEL[v]||v); if(path==="primaryCapacity") return tr(SC_PRIMARY_LABEL[v]||v);
  if(Array.isArray(v)) return v.map(function(x){ return Array.isArray(x)?x.join("→"):x; }).join(", ");
  if(/\.weights\./.test(path)||/minConfidence|grace|maxRate|reviewBelowRatio/.test(path)) return scPct(v)+"%";
  return String(v); }
function scPathLabel(p){ var s=p.split("."), mod=function(id){ return tr(SC_MODULE_LABEL[id]||id); };
  if(SC_NAMED[p]) return tr(SC_NAMED[p]);
  if(s[0]==="modules") return mod(s[1])+(s[2]==="mode"?" · "+tr("How it works"):"");
  if(s[0]==="hours"&&s[1]==="templates") return tr("Effort Hours")+" · "+(typeof estKindName==="function"?estKindName(s[2]):s[2])+" · "+tr({perUnit:"First (h)",low:"Low (h)",high:"High (h)",nextUnitFactor:"Each next (× first)"}[s[3]]||s[3]);
  if(s[0]==="hours"&&s[1]==="complexity") return tr("Complexity multiplier")+" "+s[2];
  if(s[0]==="hours"&&s[1]==="dependency") return tr("Dependency multiplier")+" "+s[2];
  if(s[1]==="weights") return mod(s[0])+" · "+tr(SC_FACTOR_LABEL[s[2]]||s[2]);
  if(p==="story.thresholds") return tr("Story Points")+" · "+tr("thresholds");
  if(p==="weighted.scaleMax") return tr("Weighted Points")+" · "+tr("Top of the scale"); if(p==="weighted.mappingVersion") return tr("Weighted Points")+" · "+tr("Mapping version");
  if(s[0]==="bonus") return tr("Efficiency bonus")+" · "+s.slice(1).join(".");
  return p; }
function scAuditHtml(){
  if(SC.audit===null) return '<div class="hint">'+tr("Loading…")+'</div>';
  if(!SC.audit.length) return '<div class="hint">'+tr("No changes yet.")+'</div>';
  var li=function(c){ return '<li class="scr-change"><b>'+esc(scPathLabel(c.path))+'</b> '+esc(scVal(c.path,c.from))+' → '+esc(scVal(c.path,c.to))+'</li>'; };
  return SC.audit.map(function(a){ var who=a.by?person(a.by).name:"ZenCrevia", d=a.diff||[], list;
    if(a.action==="leads_delegated") list='<li>'+esc(tr("Gave the approval and analytics permissions to")+" "+Object.keys(a.added||{}).map(function(id){ var r=byId(ROLES,id); return r?r.name:id; }).join(", "))+'</li>';
    else list=d.slice(0,6).map(li).join("")+(d.length>6?'<li><details><summary>'+fmt(tr("{n} more changes"),{n:d.length-6})+'</summary><ul>'+d.slice(6).map(li).join("")+'</ul></details></li>':'');
    return '<div class="scr-audit-row"><div class="scr-au-head"><b data-no-translate>'+esc(who)+'</b>'+(a.impersonatedBy?'<span class="badge">'+tr("acting as")+'</span>':'')+(a.configVersion?'<span class="badge">v'+esc(a.configVersion)+'</span>':'')+'<span class="hint">'+esc(ago(minAgo(a.at),a.at))+'</span></div>'
      + '<ul class="scr-changes">'+list+'</ul>'+(a.reason?'<div class="hint">'+esc(a.reason)+'</div>':'')+'</div>'; }).join(""); }
function scAuditPaint(){ var el=document.getElementById("scAudit"); if(el) el.innerHTML=scAuditHtml(); }
/* fresh settings and history from the server, at most every 15 s; what is on screen stays until they arrive */
function scLoadOnce(){ if(SC.loading||(SC.loadedAt&&Date.now()-SC.loadedAt<15000)) return; SC.loading=true;
  scoringLoad().then(function(r){ SC.loading=false; SC.loadedAt=Date.now(); SC.audit=(r&&r.audit)||[]; var cur=scoringSettings();
    if(!scCount()&&cur&&cur.configVersion!==SC.base&&S.screen==="settings"&&S.settingsTab==="scoring"){ SC.draft=null; scRepaint(); } else scAuditPaint(); })
  .catch(function(){ SC.loading=false; if(SC.audit===null) SC.audit=[]; scAuditPaint(); }); }

/* ---------- saving ---------- */
function scSaveClick(){
  if(!canI.scoringConfigure()||!SC.draft||SC.saving) return;
  var bad=["weighted","story"].filter(function(k){ return Math.abs(scTotal((SC.draft[k]||{}).weights)-100)>=0.05; });
  if(bad.length){ var k=bad[0]; if(scGroup()!=="estimating"){ scGroupSet("estimating"); scPaintGroup(); routeSync(); }
    var f=document.querySelector('[data-adv="'+k+'"]'), el=document.getElementById("sc_total_"+k); if(f) f.open=true; scTotalsPaint(); if(el) el.scrollIntoView({block:"center",behavior:"smooth"});
    return toast(tr("The weights must add up to 100% before saving")+" ("+tr(SC_MODULE_LABEL[k])+": "+scTotal(SC.draft[k].weights)+"%)","bad"); }
  var took=function(s,audit){ SC.draft=clone(s); SC.saved=clone(s); SC.base=s.configVersion; SC.dirty=false; if(audit) SC.audit=audit; };
  SC.saving=true; scBarPaint();
  scoringSave(clone(SC.draft),SC.base).then(function(r){ SC.saving=false; took(r.settings,r.audit); SC.loadedAt=Date.now();
    toast(tr(r.unchanged?"Nothing to save: no changes":"Smart Scoring saved")); refresh(); })
  .catch(function(e){ SC.saving=false; scBarPaint();
    scoringLoad().then(function(d){ var cur=scoringSettings();
      if(cur&&cur.configVersion!==SC.base){ took(cur,d&&d.audit); refresh(); toast(tr(SC_T.conflict),"bad"); }
      else toast(e.message,"bad"); }).catch(function(){ toast(e.message,"bad"); }); }); }
function scLeadsClick(){ if(!canI.manageRoles()) return;
  confirmModal(tr("Give Team Lead and Creative Lead these permissions?"),esc(tr(SC_T.leadsAsk)),function(){
    scoringDelegateLeads().then(function(r){ var n=Object.keys((r&&r.added)||{}).length; if(r&&r.audit) SC.audit=r.audit; toast(tr(n?SC_T.leadsDone:"They already had them")); refresh(); }).catch(function(e){ toast(e.message,"bad"); }); }); }
/* leaving Settings with changes not saved asks first; leaving without saving puts the saved values back */
function scLeaveGo(){ closeModal(); if(SC.saved){ SC.draft=clone(SC.saved); SC.dirty=false; } var f=SC.leave; SC.leave=null; if(f) f(); }
(function(){ var base=go; go=function(screen,sub,o){
  if(screen==="settings"&&typeof sub==="string"&&sub.indexOf("scoring/")===0){ scGroupSet(sub.slice(8)); sub="scoring"; }
  var n=S.screen==="settings"&&screen!=="settings"&&signedIn()&&canI.scoringConfigure()?scCount():0;
  if(n){ SC.leave=function(){ base.call(window,screen,sub,o); };
    return openModal("Leave without saving?",'<p>'+esc(fmt(tr(n===1?SC_T.leave1:SC_T.leaveN),{n:n}))+'</p>','<button class="btn" onclick="closeModal()">'+tr("Keep editing")+'</button><span class="spacer"></span><button class="btn danger" id="scLeaveGo" onclick="scLeaveGo()">'+tr("Leave without saving")+'</button>'); }
  return base.call(this,screen,sub,o); }; })();
/* the address: /settings/scoring/<group>; Back and Forward between groups repaint the group only */
(function(){ if(typeof routeSub!=="function") return;
  var sub=routeSub; routeSub=function(){ if(S.screen==="settings"&&S.settingsTab==="scoring") return "scoring/"+scGroup(); return sub.apply(this,arguments); };
  var build=routeBuild; routeBuild=function(screen,s){ var u=build.apply(this,arguments); return screen==="settings"&&/^scoring\/[a-z]+$/.test(s||"")?u.replace("scoring%2F","scoring/"):u; };
  /* an old link to /settings/scoring takes the group without a step of its own in the history */
  var write=routeWrite; routeWrite=function(url,push){ var c=push&&routeParse(routeHere()), n=c&&routeParse(url); if(n&&c.screen==="settings"&&n.screen==="settings"&&c.sub==="scoring"&&c.task===n.task) push=false; return write.call(this,url,push); };
  var apply=routeApply; routeApply=function(r){ if(r&&r.screen==="settings"&&/^scoring\/[a-z]+$/.test(r.sub||"")&&!r.task&&!S.drawerTask&&S.screen==="settings"&&S.settingsTab==="scoring"&&document.getElementById("scrBody")){ scGroupSet(r.sub.slice(8)); scPaintGroup(); return true; } return apply.apply(this,arguments); }; })();

/* ---------- Roles & permissions: a role that both changes scores and approves them ---------- */
function scoringDutyWarn(){ var m=document.getElementById("modal"); if(!m) return; var edit=m.querySelector('[data-cap="scoring_edit_task"]'); if(!edit) return;
  var on=function(c){ var b=m.querySelector('[data-cap="'+c+'"]'); return !!(b&&b.classList.contains("on")); };
  var both=!edit.disabled&&on("scoring_edit_task")&&(on("scoring_approve_estimate")||on("scoring_approve_completion")), w=m.querySelector(".scr-duty-warn"), g=edit.closest(".cap-group");
  if(both&&!w&&g){ var head=g.querySelector(".cap-group-head"); if(head) head.insertAdjacentHTML("afterend",'<div class="banner warn scr-duty-warn" role="status"><span>'+esc(tr(SC_T.duty))+'</span></div>'); }
  else if(!both&&w) w.remove(); }
(function(){ if(typeof roleModal!=="function") return; var base=roleModal; roleModal=function(){ var out=base.apply(this,arguments); try{ scoringDutyWarn(); }catch(e){ console.error(e); } return out; }; })();
(function(){ if(typeof capGroupSync!=="function") return; var base=capGroupSync; capGroupSync=function(){ var out=base.apply(this,arguments); try{ scoringDutyWarn(); }catch(e){ console.error(e); } return out; }; })();

/* Indonesian, for the shorter words this tab adds (a word the page already translates keeps its translation) */
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Effort Hours":"Effort Hours","Story Points":"Story Points","Weighted Points":"Poin Berbobot","KPI":"KPI","OKR":"OKR","Hours":"Jam","pts":"poin",
  "Math only":"Hanya hitungan","AI-assisted":"Dibantu AI","Hybrid":"Hibrida","How it works":"Cara kerja",
  "Complexity":"Kompleksitas","Uncertainty":"Ketidakpastian","must be 100% to save":"harus 100% agar bisa disimpan",
  "Estimating":"Estimasi","Output & goals":"Output & target","Review & bonus":"Review & bonus","Access & visibility":"Akses & visibilitas",
  "Unsaved changes":"Perubahan belum disimpan","1 unsaved change":"1 perubahan belum disimpan","{n} unsaved changes":"{n} perubahan belum disimpan",
  "Example:":"Contoh:","Turn on":"Nyalakan","Set up":"Atur","Leave without saving?":"Keluar tanpa menyimpan?","Keep editing":"Lanjut mengedit","Leave without saving":"Keluar tanpa menyimpan",
  "Smart Scoring for this workspace":"Smart Scoring untuk workspace ini","How Smart Scoring works":"Cara kerja Smart Scoring","Approve & lock":"Setujui & kunci","Log the time":"Catat waktu","Review & points":"Review & poin",
  "Settings version":"Versi pengaturan","last saved by":"terakhir disimpan oleh","Modules":"Modul","Primary capacity metric":"Metrik kapasitas utama",
  "Multipliers and limits":"Pengali dan batas","Hours per kind of work":"Jam per jenis pekerjaan","Limits":"Batas",
  "Kind of work":"Jenis pekerjaan","First (h)":"Pertama (jam)","Low (h)":"Terendah (jam)","High (h)":"Tertinggi (jam)","Each next (× first)":"Tiap berikutnya (× pertama)",
  "First deliverable (h)":"Deliverable pertama (jam)","Each next deliverable (× the first)":"Tiap deliverable berikutnya (× yang pertama)",
  "Complexity multiplier":"Pengali kompleksitas","Dependency multiplier":"Pengali ketergantungan",
  "1 · Very simple":"1 · Sangat sederhana","2 · Simple":"2 · Sederhana","3 · Typical":"3 · Biasa","4 · Complex":"4 · Kompleks","5 · Very complex":"5 · Sangat kompleks",
  "No open dependencies":"Tanpa ketergantungan terbuka","1 open dependency":"1 ketergantungan terbuka","2 open dependencies":"2 ketergantungan terbuka","3 or more":"3 atau lebih",
  "Fewest hours":"Jam paling sedikit","Most hours":"Jam paling banyak","An estimate is locked":"Estimasi dikunci","When it is approved":"Saat disetujui",
  "Weights and thresholds":"Bobot dan ambang","Weights and scale":"Bobot dan skala",
  "Weight of each factor":"Bobot tiap faktor","The highest index each point is given for":"Indeks tertinggi untuk tiap poin","1 point up to":"1 poin hingga","{n} points up to":"{n} poin hingga",
  "Top of the scale":"Batas atas skala","Mapping version":"Versi pemetaan","AI suggestions":"Saran AI",
  "Suggest when a task is created":"Beri saran saat task dibuat","Suggest again when the brief changes a lot":"Beri saran lagi bila brief banyak berubah",
  "Warn below confidence":"Peringatkan di bawah tingkat keyakinan","Suggestions per person a day":"Saran per orang per hari","Suggestions for the workspace a day":"Saran untuk workspace per hari",
  "Similar finished tasks as examples":"Task serupa yang selesai sebagai contoh","Of the same team":"Dari tim yang sama",
  "Manual changes":"Perubahan manual","A reason for every manual change":"Alasan untuk setiap perubahan manual","Manual changes wait for approval":"Perubahan manual menunggu persetujuan",
  "Someone assigned to a task may approve its estimate":"Orang yang ditugaskan pada task boleh menyetujui estimasinya","Efficiency bonus":"Bonus efisiensi",
  "Who holds the Smart Scoring permissions":"Siapa yang memegang izin Smart Scoring","and, on top of their role:":"dan, di luar role-nya:",
  "Give Team Lead and Creative Lead these permissions":"Beri izin ini ke Team Lead dan Creative Lead","Give Team Lead and Creative Lead these permissions?":"Beri izin ini ke Team Lead dan Creative Lead?",
  "They already had them":"Mereka sudah memilikinya","Recent changes":"Perubahan terakhir","The last 20 saves, newest first.":"20 penyimpanan terakhir, yang terbaru di atas.","{n} more changes":"{n} perubahan lainnya",
  "No changes yet.":"Belum ada perubahan.","acting as":"bertindak sebagai","on":"nyala","off":"mati","thresholds":"ambang",
  "Gave the approval and analytics permissions to":"Memberi izin persetujuan dan analitik kepada","The weights must add up to 100% before saving":"Bobot harus berjumlah 100% sebelum disimpan",
  "Nothing to save: no changes":"Tidak ada yang disimpan: tidak ada perubahan","Smart Scoring saved":"Smart Scoring tersimpan"
});
</script>
