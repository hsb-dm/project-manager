<script>
/* ============================================================
   POINTS FOR THE ASSETS PEOPLE PRODUCE (Oct 2026)
   Smart Scoring's "assets" module (docs/SMART-SCORING.md §11): the assets each person produced on a task — their
   own count typed under Assets & versions, or as the reports credit them (taskAssetCredit in src/export.js) — earn
   output points by the kind of work, the task's as the estimator reads it (estKindOf: chosen by hand, else from
   the title): one feed
   post is 1 point, a resize 0.25, a logo 5, as the workspace sets it in Settings → Smart Scoring. A count a team's
   lead has not validated yet counts all the same and says so; one changed since it was validated says that too —
   to those who see validation on the Assets tab (whoever may validate the task's counts) and to those who see Smart
   Scoring's analytics; a member sees their count and points without it, as the Assets tab shows it to them.
   The points are a figure of their own, never hours, base points or the efficiency bonus, and never a ranking:
   people are listed in name order. Off — the module, Smart Scoring, or the server's feature — nothing shows.
   For the other scoring files to call when they are there:
   - scoringAssetsRowHtml(tk): the task panel's row — each person's count, points and validation mark.
   - scoringAssetsSettingsHtml(ro, ed): the Settings tab's "Asset points" section — whether counts not validated yet
     count, and the points of a title no kind is recognised in (each kind's own points are with its row under Kinds of
     work, src/scoring-kinds.js; the module's own switch is in the tab's Overview).
   - scoringAssetsSummaryHtml(data): the "Assets produced" points view for Analytics, from scoringAssetsLoad(q)
     (GET /api/scoring/assets; worked out in the page in the offline demo), cached so it draws at once.
   ============================================================ */
var SCA={cache:{}};
function scoringAssetsOn(){ return typeof scoringModuleOn==="function"&&scoringModuleOn("assets")&&typeof ScoringEngine!=="undefined"; }
function scaSettings(){ var s=scoringSettings(); return (s&&s.assets)||ScoringEngine.ENGINE_DEFAULTS.assets; }
function scaNum(x){ var n=Math.round((+x||0)*100)/100; return String(n); }
function scaPts(x){ return (Math.round((+x||0)*100)/100).toFixed(2); }
function scaKindName(id){ return id?(typeof estKindName==="function"?estKindName(id):id):tr("Kind not recognised"); }
/* one task's points: who is credited with how many (as the reports credit them), at the kind's points per asset */
function scoringAssetsTask(tk){ var c=typeof taskAssetCredit==="function"?taskAssetCredit(tk):{by:{},exact:true,how:""}, kind=typeof estKindOf==="function"?estKindOf(tk):ScoringEngine.kindOf(tk&&tk.title);
  var r=ScoringEngine.assetPoints(scaSettings(),{kind:kind,split:c.by,validated:tk&&tk.meta&&tk.meta.assetSplitOk});
  return {credit:c,kind:kind,r:r}; }
/* the engine's steps in the person's language, with names for the ids */
function scaSeesValidation(tk){ return (typeof assetSplitCanValidate==="function"&&!!tk&&assetSplitCanValidate(tk))||(typeof canI!=="undefined"&&typeof canI.scoringViewAnalytics==="function"&&canI.scoringViewAnalytics()); }
function scaWhy(r,seeVal){ return r.steps.filter(function(s){ return seeVal!==false||!/validat/i.test(String(s.key)); }).map(function(s){ var v=Object.assign({},s.vars); if(v.person) v.person=person(v.person).name; if(v.kind) v.kind=scaKindName(v.kind);
  return ScoringEngine.fill(tr(s.key),v); }).join(" "); }
function scaMark(x){ if(x.validated) return '<span class="badge ok scr-ap-mark">'+I.check+tr("Validated")+'</span>';
  return '<span class="badge warn scr-ap-mark">'+tr(x.changedSinceValidation?"Changed since validation":"Not validated yet")+'</span>'; }

/* ---------- the task panel's row ---------- */
function scoringAssetsRowHtml(tk){
  if(!tk||tk._draft||!scoringAssetsOn()||(PEOPLE[ME]&&PEOPLE[ME].stakeholder)) return "";
  var a=scoringAssetsTask(tk), r=a.r, seeVal=scaSeesValidation(tk), ids=Object.keys(r.perPerson).sort(function(x,y){ return person(x).name.localeCompare(person(y).name); });
  var head='<div class="scr-ap-head"><div class="scr-ap-title"><b>'+tr("Assets produced")+'</b><span class="hint">'+esc(scaKindName(a.kind))+' · '+scaPts(r.pointsPerAsset)+' '+tr("pts per asset")+'</span></div>'
    + '<b class="scr-ap-total" title="'+attr(scaWhy(r,seeVal))+'">'+scaPts(r.total)+' '+tr("pts")+'</b></div>';
  var rows=ids.map(function(id){ var x=r.perPerson[id];
    return '<div class="scr-ap-row" data-person="'+attr(id)+'">'+av(id)+'<div class="scr-ap-main"><span class="scr-ap-name" data-no-translate>'+esc(person(id).name)+'</span>'
      + '<span class="scr-ap-nums"><span class="scr-ap-calc">'+scaNum(x.counted)+' × '+scaPts(r.pointsPerAsset)+' = <b>'+scaPts(x.points)+'</b> '+tr("pts")+'</span>'+(seeVal?scaMark(x):'')+'</span></div></div>'; }).join("");
  var notes=(ids.length?'':'<div class="hint">'+tr("No assets produced yet. Each person's count goes under Assets & versions.")+'</div>')
    + (ids.length&&!a.credit.exact?'<div class="hint">'+tr("Shared among the people assigned until each person's count is typed.")+'</div>':'')
    + (!r.countUnvalidated&&ids.some(function(id){ return !r.perPerson[id].validated; })?'<div class="hint">'+tr("Only counts a lead has validated earn points in this workspace.")+'</div>':'')
    + '<div class="hint">'+tr("Counted when the task is completed. Output points, kept apart from hours, base points and the bonus.")+'</div>';
  return '<div class="scr-ap" data-scoring-assets="'+attr(tk.id)+'">'+head+rows+notes+'</div>';
}

/* ---------- Settings → Smart Scoring: the section ---------- */
function scoringAssetsSettingsHtml(ro,ed){
  if(typeof scGet!=="function"||typeof sp!=="function") return "";
  if(ed===undefined) ed=canI.scoringConfigure(); if(ro===undefined) ro=!ed;
  var sw=function(path,label,desc){ return '<div class="pref"><div class="pl"><b>'+label+'</b><span>'+desc+'</span></div>'+scSwitchHtml(path,label,ro)+'</div>'; };
  return scSection("assets",tr("Asset points"),tr("Each asset someone makes earns points by its kind of work, read from the task's title."),
    sw("assets.countUnvalidated",tr("Count assets before a lead validates them"),tr("On: they earn points at once, marked “not validated yet”. Off: only validated counts earn points, and a count changed later earns at most what was validated."))
    + '<div class="scr-grid">'+scNumHtml("sc_ap_unknown","assets.unknownKind","Kind not recognised",{min:0,max:20,step:0.25,unit:"pts",ro:ro})+'</div>'
    + scHelp(tr("Each kind's own points are under Kinds of work (about its hours ÷ 2, 0–20). A title with no kind recognised earns the points above.")),
    {icon:I.assets,example:tr("with a logo at 5 points, someone who makes 2 logos earns 2 × 5 = 10 points, and 4 resizes 4 × 0.25 = 1 point."),
     off:!scGet("modules.assets.on")?tr("Asset points are off. Turn them on in Overview — the points can be set up first."):null,onModule:"assets"});
}
/* the section's changes in the tab's history */
if(typeof SC_MODULE_LABEL!=="undefined") SC_MODULE_LABEL.assets="Assets produced";
(function(){ if(typeof scPathLabel!=="function") return; var base=scPathLabel; scPathLabel=function(p){ var s=String(p).split(".");
  if(s[0]==="assets"&&s[1]==="perKind") return tr("Asset points")+" · "+scaKindName(s[2]);
  if(p==="assets.unknownKind") return tr("Asset points")+" · "+tr("Kind not recognised");
  if(p==="assets.countUnvalidated") return tr("Asset points")+" · "+tr("Count assets before a lead validates them");
  return base.apply(this,arguments); }; })();

/* ---------- the figures over a period: the server's, or worked out in the page in the offline demo ---------- */
function scaKey(q){ q=q||{}; return ["from","to","team","project","person"].map(function(k){ return q[k]||""; }).join("|"); }
function scoringAssetsCached(q){ return SCA.cache[scaKey(q)]||null; }
function scoringAssetsLoad(q){ q=q||{}; var key=scaKey(q);
  var p=API.on?apiFetch("GET","/api/scoring/assets?"+["from","to","team","project","person"].filter(function(k){ return q[k]; }).map(function(k){ return k+"="+encodeURIComponent(q[k]); }).join("&"))
    :Promise.resolve(scoringAssetsCompute(q));
  return p.then(function(r){ SCA.cache[key]=r; return r; }); }
/* the server's rule, on the page's tasks: completed in the period in a completed stage, by the reports' credit */
function scoringAssetsCompute(q){ q=q||{}; var s=scoringSettings(), stages=s&&s.bonus&&s.bonus.completionStages, all=canI.scoringViewAnalytics(), only=all?(q.person||null):ME;
  var tasks=TASKS.filter(function(t){ var day=String(t.completedAt||"").slice(0,10);
    return !t._draft&&day&&isClosed(t)&&(stages?stages.indexOf(t.status)>=0:t.status!=="declined")&&assetCount(t)>0&&(!q.from||day>=q.from)&&(!q.to||day<=q.to)&&(!q.team||t.team===q.team)&&(!q.project||t.proj===q.project||(t.alsoIn||[]).indexOf(q.project)>=0); });
  var rows={}, b=function(){ return {assets:0,points:0}; }, add=function(o,n,pt){ o.assets+=n; o.points+=pt; }, counted=0;
  var row=function(id){ return rows[id]||(rows[id]={userId:id,name:person(id).name,raw:0,points:0,tasks:0,validated:b(),notValidated:b(),changed:b(),attributed:false,typed:false,uploads:false,byKind:{},byWeek:{}}); };
  if(only) row(only);
  tasks.forEach(function(t){ var a=scoringAssetsTask(t), c=a.credit, d=new Date(String(t.completedAt).slice(0,10)+"T00:00:00Z"), mine=false; d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7); var wk=isNaN(d.getTime())?null:d.toISOString().slice(0,10);
    Object.keys(a.r.perPerson).forEach(function(id){ if(only&&id!==only) return; var x=a.r.perPerson[id], p=row(id), n=c.by[id], k=a.kind||"unknown"; mine=true;
      p.raw+=n; p.points+=x.points; p.tasks++; if(!c.exact) p.attributed=true; else if(c.how==="split") p.typed=true; else p.uploads=true;
      add(x.validated?p.validated:x.changedSinceValidation?p.changed:p.notValidated,n,x.points); add(p.byKind[k]=p.byKind[k]||b(),n,x.points); if(wk) add(p.byWeek[wk]=p.byWeek[wk]||b(),n,x.points); });
    if(mine) counted++; });
  var r2=ScoringEngine.round2, fin=function(o){ return {assets:r2(o.assets),points:r2(o.points)}; }, map=function(o){ var out={}; Object.keys(o).sort().forEach(function(k){ out[k]=fin(o[k]); }); return out; };
  var list=Object.keys(rows).map(function(id){ var p=rows[id]; return {userId:id,name:p.name,assets:Math.round(p.raw),assetsExact:r2(p.raw),points:r2(p.points),tasks:p.tasks,validated:fin(p.validated),notValidated:fin(p.notValidated),changed:fin(p.changed),attributed:p.attributed,typed:p.typed,uploads:p.uploads,byKind:map(p.byKind),byWeek:map(p.byWeek)}; })
    .sort(function(x,y){ return String(x.name).localeCompare(String(y.name))||(x.userId<y.userId?-1:1); });
  var raw=Object.keys(rows).reduce(function(n,id){ return n+rows[id].raw; },0), as=(s&&s.assets)||{};
  return {scope:all?"everyone":"own",from:q.from||null,to:q.to||null,team:q.team||null,project:q.project||null,person:only,rule:"completed_in_period",stages:stages||null,countUnvalidated:as.countUnvalidated!==false,perKind:as.perKind||{},unknownKind:as.unknownKind,
    people:list,total:{assets:Math.round(raw),assetsExact:r2(raw),points:r2(list.reduce(function(n,x){ return n+x.points; },0)),tasks:counted,people:list.filter(function(x){ return x.tasks>0; }).length}};
}

/* ---------- the "Assets produced" points view (for Analytics): a plain list in name order ---------- */
function scoringAssetsSummaryHtml(data){
  var list=Array.isArray(data)?data:((data&&data.people)||[]), total=Array.isArray(data)?null:data&&data.total;
  list=list.slice().sort(function(x,y){ return person(x.userId).name.localeCompare(person(y.userId).name); });
  var seeVal=typeof canI!=="undefined"&&typeof canI.scoringViewAnalytics==="function"&&canI.scoringViewAnalytics();
  var chip=function(o,label,cls){ return seeVal&&o&&o.assets?'<span class="badge'+(cls?' '+cls:'')+'">'+tr(label)+' '+scaNum(o.assets)+' · '+scaPts(o.points)+' '+tr("pts")+'</span>':''; };
  var rows=list.map(function(p){ return '<div class="scr-asum-row" data-person="'+attr(p.userId)+'">'+av(p.userId)+'<div class="scr-ap-main"><span class="scr-ap-name" data-no-translate>'+esc(person(p.userId).name)+'</span>'
      + '<span class="scr-ap-nums"><span class="scr-asum-n"><b>'+scaNum(p.assets)+(p.attributed?'*':'')+'</b> '+tr(p.assets===1?"asset":"assets")+'</span><span class="scr-asum-n"><b>'+scaPts(p.points)+'</b> '+tr("pts")+'</span></span>'
      + '<span class="scr-asum-marks">'+chip(p.validated,"Validated","ok")+chip(p.notValidated,"Not validated yet","warn")+chip(p.changed,"Changed since validation","warn")+'</span></div></div>'; }).join("");
  return '<div class="scr-asum">'+(total?'<div class="scr-asum-total"><b>'+scaNum(total.assets)+'</b> '+tr("assets")+' · <b>'+scaPts(total.points)+'</b> '+tr("pts")+' · '+total.tasks+' '+tr(total.tasks===1?"task completed":"tasks completed")+'</div>':'')
    + (rows||'<div class="hint">'+tr("No assets produced in this period.")+'</div>')
    + '<div class="hint scr-asum-rule">'+tr("Tasks completed in the period, by the day they were completed; declined tasks and work still open are not counted. * shared among the people assigned, until each person's count is typed. People in name order — not a ranking.")+'</div></div>';
}

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Assets produced":"Aset yang dihasilkan","pts per asset":"poin per aset","pts":"poin","Kind not recognised":"Jenis tidak dikenali",
  "Validated":"Divalidasi","Not validated yet":"Belum divalidasi","Changed since validation":"Berubah sejak divalidasi",
  "No assets produced yet. Each person's count goes under Assets & versions.":"Belum ada aset yang dihasilkan. Jumlah tiap orang diisi di Aset & versi.",
  "Shared among the people assigned until each person's count is typed.":"Dibagi rata di antara orang yang ditugaskan sampai jumlah tiap orang diisi.",
  "Only counts a lead has validated earn points in this workspace.":"Di workspace ini, hanya jumlah yang sudah divalidasi lead yang mendapat poin.",
  "Counted when the task is completed. Output points, kept apart from hours, base points and the bonus.":"Dihitung saat task selesai. Poin hasil kerja, terpisah dari jam, poin dasar, dan bonus.",
  "Each asset someone makes earns points by its kind of work, read from the task's title.":"Setiap aset yang dibuat seseorang mendapat poin sesuai jenis pekerjaannya, yang dibaca dari judul task.",
  "with a logo at 5 points, someone who makes 2 logos earns 2 × 5 = 10 points, and 4 resizes 4 × 0.25 = 1 point.":"bila logo bernilai 5 poin, orang yang membuat 2 logo mendapat 2 × 5 = 10 poin, dan 4 resize 4 × 0,25 = 1 poin.",
  "Asset points are off. Turn them on in Overview — the points can be set up first.":"Poin aset sedang mati. Nyalakan di Ringkasan — poinnya bisa diatur lebih dulu.",
  "Count assets before a lead validates them":"Hitung aset sebelum divalidasi lead",
  "On: they earn points at once, marked “not validated yet”. Off: only validated counts earn points, and a count changed later earns at most what was validated.":"Nyala: langsung mendapat poin, ditandai “belum divalidasi”. Mati: hanya jumlah yang sudah divalidasi yang mendapat poin, dan jumlah yang berubah sesudahnya paling banyak mendapat sebesar yang divalidasi.",
  "Each kind's own points are under Kinds of work (about its hours ÷ 2, 0–20). A title with no kind recognised earns the points above.":"Poin tiap jenis ada di Jenis pekerjaan (kira-kira jamnya ÷ 2, 0–20). Judul yang jenisnya tidak dikenali mendapat poin di atas.",
  "Asset points":"Poin aset","asset":"aset","assets":"aset","task completed":"task selesai","tasks completed":"task selesai",
  "No assets produced in this period.":"Tidak ada aset yang dihasilkan pada periode ini.",
  "Tasks completed in the period, by the day they were completed; declined tasks and work still open are not counted. * shared among the people assigned, until each person's count is typed. People in name order — not a ranking.":"Task yang selesai dalam periode ini, menurut tanggal selesainya; task yang ditolak dan pekerjaan yang masih berjalan tidak dihitung. * dibagi rata di antara orang yang ditugaskan, sampai jumlah tiap orang diisi. Orang diurutkan menurut nama — bukan peringkat.",
  /* the engine's sentences (shared/scoring-engine.js SENTENCES) */
  "Kind of work \"{kind}\": {per} points for each asset.":"Jenis pekerjaan \"{kind}\": {per} poin untuk setiap aset.",
  "The kind of work is not known from the title: {per} points for each asset.":"Jenis pekerjaan tidak dikenali dari judul: {per} poin untuk setiap aset.",
  "No assets produced yet.":"Belum ada aset yang dihasilkan.",
  "{person}: {count} × {per} = {points} points.":"{person}: {count} × {per} = {points} poin.",
  "{person}: not validated by a lead yet; counted as entered.":"{person}: belum divalidasi lead; dihitung sesuai yang diisi.",
  "{person}: not validated by a lead yet; no points until a lead validates it.":"{person}: belum divalidasi lead; belum ada poin sampai lead memvalidasinya.",
  "{person}: changed since a lead validated {validated}; counted as entered now.":"{person}: berubah sejak lead memvalidasi {validated}; dihitung sesuai yang diisi sekarang.",
  "{person}: changed since a lead validated {validated}; {counted} counts until a lead validates it again.":"{person}: berubah sejak lead memvalidasi {validated}; {counted} yang dihitung sampai lead memvalidasinya lagi.",
  "Total: {points} points for {assets} assets.":"Total: {points} poin untuk {assets} aset."
});
</script>
<style>
.scr-ap{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface)}
.scr-ap-head{display:flex;align-items:flex-start;gap:8px}
.scr-ap-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.scr-ap-total{flex:none;font-variant-numeric:tabular-nums;color:var(--color-text-primary)}
.scr-ap-row,.scr-asum-row{display:flex;align-items:center;gap:8px;min-width:0}
.scr-ap-row>.av,.scr-asum-row>.av{flex:none}
.scr-ap-main{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.scr-ap-name{flex:1 1 110px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.scr-ap-nums{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.scr-ap-calc,.scr-asum-n{font-size:var(--fs-sm);color:var(--color-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.scr-ap-calc b,.scr-asum-n b{color:var(--color-text-primary)}
.scr-ap-mark .i{width:11px;height:11px}
.scr-asum{display:flex;flex-direction:column;gap:8px}
.scr-asum-total{font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-asum-total b{color:var(--color-text-primary)}
.scr-asum-row{padding:6px 0;border-bottom:1px solid var(--color-border)}
.scr-asum-marks{display:flex;flex-wrap:wrap;gap:4px;flex-basis:100%}
.scr-asum-rule{margin-top:2px}
</style>
