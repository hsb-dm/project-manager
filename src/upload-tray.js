<style>
/* the upload tray (src/upload-tray.js): above dialogs (200), under menus (260) and toasts (300) */
.uptray{position:fixed;left:16px;bottom:52px;z-index:250;width:300px;max-width:calc(100vw - 32px);box-sizing:border-box;display:none;flex-direction:column;background:var(--color-surface);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);overflow:hidden}
.uptray.on{display:flex;animation:uptrayIn .18s ease}
@keyframes uptrayIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
body.auth .uptray{display:none!important}
.uptray-head{position:relative;display:flex;align-items:center;gap:4px;min-height:44px;box-sizing:border-box;padding:6px 6px 6px 14px}
.uptray-title{flex:1;min-width:0;font-size:var(--fs-sm);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uptray-pct{font-size:12px;font-weight:650;color:var(--color-text-secondary);font-variant-numeric:tabular-nums}
.uptray .upbar.uptray-all{position:absolute;left:0;right:0;bottom:0;height:3px;min-width:0;border-radius:0;background:transparent}
.uptray:not(.collapsed) .uptray-pct,.uptray:not(.collapsed) .uptray-all{display:none}
.uptray-btn{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:var(--color-text-secondary)}
.uptray-btn:hover{background:var(--color-surface-hover);color:var(--color-text-primary)}
.uptray-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s}
.uptray.collapsed .uptray-tog svg{transform:rotate(180deg)}
.uptray-list{max-height:min(268px,38vh);overflow-y:auto;overscroll-behavior:contain;border-top:1px solid var(--color-border)}
.uptray.collapsed .uptray-list{display:none}
.uptray-row{display:grid;grid-template-columns:28px minmax(0,1fr) 30px;gap:10px;align-items:center;padding:9px 6px 9px 14px}
.uptray-row+.uptray-row{border-top:1px solid var(--color-border)}
.uptray-row .ficon{width:28px;height:28px;border-radius:8px;font-size:8px}
.uptray-main{min-width:0}
.uptray-name{font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px}
.uptray-meta{margin-top:5px;font-size:11px;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uptray-row[data-stage="failed"] .uptray-meta{color:var(--color-danger)}
.uptray-end{display:grid;place-items:center;width:30px;height:30px}
.uptray-ok{display:grid;color:var(--color-success)}.uptray-ok svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.uptray-bad{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--color-danger);color:#fff;font-size:12px;font-weight:800;line-height:1}
.uptray-off{color:var(--color-text-tertiary);font-weight:800}
/* phones and tablets: above the tab bar, and what sits on the tab bar (the chat's box, sticky feet, the bulk bar)
   sits on the tray instead, through the tab bar's height (src/core.js --tabbar-h); a dialog, the task panel or the AI
   panel covering the tab bar ends above the tray, which waits under it, folded */
@media (max-width:980px){
  .uptray{bottom:calc(var(--uptray-tb,60px) + 8px);width:360px}
  .uptray[data-resv]{bottom:calc(8px + env(safe-area-inset-bottom))}
  html:has(#upTray.on.dock){--tabbar-h:var(--uptray-dock)!important}
  body:has(#upTray.on.dock) .toasts{bottom:calc(var(--uptray-dock) + 14px)}
  body:has(#upTray.on[data-resv="modal"]) #modal{max-height:calc(100dvh - 12px - var(--uptray-r))}
}
@media (max-width:640px){
  .uptray{right:16px;width:auto}
  body:has(#upTray.on.dock) .aifab{bottom:calc(var(--uptray-dock) + 10px)}
  body:has(#upTray.on.dock) .msgfab{bottom:calc(var(--uptray-dock) + 66px)}
}
body:has(#upTray.on[data-resv="modal"]) #modalWrap.open{padding-bottom:var(--uptray-r)}
@media (min-width:981px){body:has(#upTray.on[data-resv="modal"]) #modal{max-height:calc(100dvh - 20px - var(--uptray-r))}
  html[data-task-panel="center"] body:has(#upTray.on[data-resv="drawer"]) #drawer{height:min(calc(100dvh - 2 * var(--uptray-r)),960px)}}
body:has(#upTray.on[data-resv="drawer"]) #drawer{bottom:var(--uptray-r)}
body:has(#upTray.on[data-resv="chat"]) #aiChat{bottom:var(--uptray-r)}
@media (prefers-reduced-motion:reduce){.uptray.on{animation:none}.uptray-btn svg{transition:none}}
@media print{.uptray{display:none!important}}
</style>
<script>
/* ============================================================
   THE UPLOAD TRAY (Oct 2026)
   A small panel, like Google Drive's, with every upload in the app from whatever screen started it: one row
   per record of src/upload-progress.js (the file's icon and name, its bar and words, where it goes, what the
   optimiser saved, a × to cancel while it can, then ✓ or a failed mark). It is made the first time an upload
   starts ("zc-upload") and lives in <body> on its own: it never touches a screen's markup.
   - Nothing is redrawn per byte. A record seen for the first time adds its row; a stage or note that
     changes swaps that row's mark and words; the header's words change only when a count changes (they are
     the polite live region). The bar and its words follow the bytes through uploadPaint like any other.
   - The header says "Uploading 2 files", then "2 uploads complete" and "1 failed". ˅ folds it to its header
     (which then shows the overall percentage); × folds it too while something is still going, and closes it
     once nothing is, taking the finished rows with it. With nothing left going and nothing failed it closes
     itself a few seconds later, once the pointer, the focus and the keyboard have left it alone a moment;
     a failure keeps it open until it is closed.
   - Where it sits (upTrayPlace). Bottom left on a computer, above the "Connected" pill and away from the
     AI button, the toasts and the task panel on the right. On phones and tablets above the tab bar (a phone
     full width with a 16 px gutter, folded at first), and what sits on the tab bar (the chat's box, sticky
     Save bars, the bulk bar) sits on the tray instead: the tray's top is given out as the tab bar's height
     (--tabbar-h, src/core.js), and the floating buttons and the toasts rise with it. A dialog, the task panel
     or the AI panel that would reach the tray ends above it instead, and the tray folds to its header under
     it (unfolding again when it goes) — so a dialog's Save is never under it, and it stays in reach above
     the dialog's shade, since uploads start from dialogs.
   - Leaving the page while something is going asks first (the browser's own "Leave site?").
   ============================================================ */
var UPT={el:null,list:null,title:null,pct:null,all:null,tog:null,x:null,rows:{},collapsed:false,pref:null,auto:false,before:false,touched:false,timer:0,late:0,raf:0,lastInput:0,watch:null};
var UPT_HIDE_MS=4000, UPT_ROWS=40;
function upTrayKind(mime){ mime=String(mime||""); return /^image\//.test(mime)?"image":/^video\//.test(mime)?"video":/pdf$/.test(mime)?"pdf":"other"; }
function upTrayBuild(){ if(UPT.el) return UPT.el;
  var el=document.createElement("section"); el.className="uptray"; el.id="upTray";
  el.innerHTML='<div class="uptray-head"><span class="uptray-title" role="status" aria-live="polite"></span><span class="uptray-pct" aria-hidden="true"></span>'
    +'<button type="button" class="uptray-btn uptray-tog" aria-controls="upTrayList" aria-expanded="true">'+I.chevd+'</button><button type="button" class="uptray-btn uptray-x">'+I.x+'</button>'
    +'<span class="upbar uptray-all" aria-hidden="true"><i></i></span></div><div class="uptray-list" id="upTrayList" role="list"></div>';
  UPT.el=el; UPT.list=el.lastChild; UPT.title=el.querySelector(".uptray-title"); UPT.pct=el.querySelector(".uptray-pct"); UPT.all=el.querySelector(".uptray-all"); UPT.tog=el.querySelector(".uptray-tog"); UPT.x=el.querySelector(".uptray-x");
  el.addEventListener("click",function(e){ var b=e.target&&e.target.closest?e.target.closest("button"):null; if(!b||!el.contains(b)) return;
    if(b===UPT.tog){ UPT.touched=true; UPT.pref=!UPT.collapsed; return upTraySetCollapsed(!UPT.collapsed); }
    if(b===UPT.x) return upTrayClose();
    var id=b.getAttribute("data-up-cancel"); if(id) uploadCancel(id); });
  document.body.appendChild(el); upTrayLabels();
  if(window.ResizeObserver) new ResizeObserver(upTrayPlaceSoon).observe(el);
  /* an upload begun before the tray was made */
  if(typeof uploadActive==="function") uploadActive().forEach(function(r){ if(!UPT.rows[r.id]) upTrayAdd(r); });
  return el; }
function upTrayOn(rec){ if(!rec||!rec.id||typeof document==="undefined"||!document.body) return;
  var r=UPT.rows[rec.id], fresh=!r;
  if(fresh){ upTrayBuild(); if(!UPT.rows[rec.id]) upTrayAdd(rec); }
  else if(r.stage===rec.stage&&r.note===rec.note){ if(UPT.collapsed) upTrayOverall(); return; }
  else upTrayRow(r);
  if(!UPT.el.classList.contains("on")&&(fresh||!uploadOver(rec))) upTrayShow();
  upTrayHead(); }
function upTrayAdd(rec){ var row=document.createElement("div"); row.className="uptray-row"; row.setAttribute("role","listitem");
  row.innerHTML='<span class="uptray-ic" aria-hidden="true">'+(typeof fileIcon==="function"?fileIcon({type:upTrayKind(rec.mime),name:String(rec.name||"")}):"")+'</span><div class="uptray-main"><div class="uptray-name" data-no-translate title="'+attr(rec.name)+'">'+esc(rec.name)+'</div>'
    +uploadBarHtml(rec)+'<div class="uptray-meta">'+uploadTextHtml(rec)+'<span class="uptray-dest"></span><span class="uptray-note"></span></div></div><span class="uptray-end"></span>';
  var r={rec:rec,el:row,stage:"",note:null}; UPT.rows[rec.id]=r; UPT.list.appendChild(row); upTrayRow(r);
  /* the oldest finished rows go first when there are too many */
  var ids=Object.keys(UPT.rows); for(var i=0;i<ids.length&&ids.length-i>UPT_ROWS;i++){ var o=UPT.rows[ids[i]]; if(o&&uploadOver(o.rec)){ o.el.remove(); delete UPT.rows[ids[i]]; } } }
/* a row's words and its mark at the end: × while it can be cancelled, then ✓, ! or – */
function upTrayRow(r,again){ var rec=r.rec, row=r.el, s=rec.stage; r.stage=s; r.note=rec.note; row.setAttribute("data-stage",s);
  var dest=" · "+tr(rec.dest==="gdrive"?"to Google Drive":"to this server"), note=rec.note?" · "+rec.note:"";
  var d=row.querySelector(".uptray-dest"), n=row.querySelector(".uptray-note"); if(d.textContent!==dest) d.textContent=dest; if(n.textContent!==note) n.textContent=note;
  row.querySelector(".uptray-meta").title=uploadStatusText(rec)+dest+note;
  var end=row.lastChild, mark=uploadCanCancel(rec)?"cancel":s==="done"?"ok":s==="failed"?"bad":s==="cancelled"?"off":"";
  if(end.getAttribute("data-mark")===mark&&!again) return; end.setAttribute("data-mark",mark);
  if(mark==="cancel"){ var b=end.firstChild; if(!b||b.tagName!=="BUTTON"){ end.innerHTML='<button type="button" class="uptray-btn uptray-cancel" data-up-cancel="'+attr(rec.id)+'">'+I.x+'</button>'; b=end.firstChild; }
    b.title=tr("Cancel upload"); b.setAttribute("aria-label",tr("Cancel upload")+": "+rec.name); return; }
  end.innerHTML=mark==="ok"?'<span class="uptray-ok" role="img" aria-label="'+attr(tr("Uploaded"))+'">'+I.check+'</span>'
    :mark==="bad"?'<span class="uptray-bad" role="img" aria-label="'+attr(tr("Upload failed"))+'" title="'+attr(rec.error||tr("Upload failed"))+'">!</span>'
    :mark==="off"?'<span class="uptray-off" role="img" aria-label="'+attr(tr("Upload cancelled"))+'">–</span>':""; }
function upTrayCounts(){ var c={active:0,done:0,failed:0,cancelled:0};
  Object.keys(UPT.rows).forEach(function(id){ var s=UPT.rows[id].rec.stage; if(s==="done") c.done++; else if(s==="failed") c.failed++; else if(s==="cancelled") c.cancelled++; else c.active++; }); return c; }
/* "Uploading 2 files", "2 uploads complete · 1 failed": changed only when a count changes, so the live region
   speaks then and never per byte */
function upTrayHead(){ if(!UPT.el) return; var c=upTrayCounts(), parts=[];
  if(c.active) parts.push(tr("Uploading")+" "+c.active+" "+tr(c.active===1?"file":"files"));
  else if(c.done) parts.push(c.done+" "+tr(c.done===1?"upload complete":"uploads complete"));
  if(c.failed) parts.push(c.failed+" "+tr("failed"));
  if(!parts.length&&c.cancelled) parts.push(c.cancelled===1?tr("Upload cancelled"):c.cancelled+" "+tr("uploads cancelled"));
  var t=parts.join(" · "); if(UPT.title.textContent!==t) UPT.title.textContent=t;
  UPT.el.classList.toggle("busy",c.active>0); UPT.el.classList.toggle("bad",c.failed>0);
  upTrayLabels(c); upTrayOverall(c); upTrayAutoHide(c); }
function upTrayLabels(c){ if(!UPT.el) return; c=c||upTrayCounts();
  var t=tr(UPT.collapsed?"Expand uploads":"Collapse uploads"); UPT.tog.title=t; UPT.tog.setAttribute("aria-label",t); UPT.tog.setAttribute("aria-expanded",UPT.collapsed?"false":"true");
  var x=tr(c.active?"Collapse — uploads keep going":"Close uploads"); UPT.x.title=x; UPT.x.setAttribute("aria-label",x);
  UPT.el.setAttribute("aria-label",tr("Uploads")); }
/* folded, the header carries the overall percentage and a thin bar */
function upTrayOverall(c){ if(!UPT.el||!UPT.collapsed) return; c=c||upTrayCounts(); var sent=0, all=0, fin=true;
  Object.keys(UPT.rows).forEach(function(id){ var r=UPT.rows[id].rec; if(uploadOver(r)) return; if(r.stage!=="finishing") fin=false; all+=r.total||0; sent+=r.stage==="finishing"?(r.total||0):(r.loaded||0); });
  var p=c.active?(fin?100:all?Math.min(99,Math.floor(sent/all*100)):0):100, txt=c.active?p+"%":"";
  if(UPT.pct.textContent!==txt) UPT.pct.textContent=txt;
  var cls="upbar uptray-all"+(c.active?(fin?" wait":""):c.failed?" bad":" ok"); if(UPT.all.className!==cls) UPT.all.className=cls;
  UPT.all.firstChild.style.width=p+"%"; }
function upTraySetCollapsed(v){ v=!!v; if(!UPT.el) return; UPT.collapsed=v; UPT.el.classList.toggle("collapsed",v); upTrayLabels(); upTrayOverall(); }
function upTrayShow(){ var el=upTrayBuild(); clearTimeout(UPT.timer); UPT.timer=0;
  if(!el.classList.contains("on")){ upTraySetCollapsed(UPT.pref!=null?UPT.pref:innerWidth<=640); el.classList.add("on"); upTrayWatch(true); upTrayPlace(); } }
function upTrayClose(){ var c=upTrayCounts(); if(c.active){ UPT.touched=true; UPT.pref=true; return upTraySetCollapsed(true); } upTrayHide(); }
/* closing takes the finished rows with it; what is still going stays for the next time it shows */
function upTrayHide(){ clearTimeout(UPT.timer); clearTimeout(UPT.late); UPT.timer=0; var el=UPT.el; if(!el||!el.classList.contains("on")) return;
  var focus=el.contains(document.activeElement);
  el.classList.remove("on","dock"); el.removeAttribute("data-resv"); UPT.auto=false; upTrayWatch(false);
  Object.keys(UPT.rows).forEach(function(id){ var r=UPT.rows[id]; if(uploadOver(r.rec)){ r.el.remove(); delete UPT.rows[id]; } });
  if(focus&&document.activeElement&&document.activeElement.blur) document.activeElement.blur(); }
function upTrayAutoHide(c){ if(c.active||c.failed){ clearTimeout(UPT.timer); UPT.timer=0; return; } if(!UPT.timer&&UPT.el.classList.contains("on")) UPT.timer=setTimeout(upTrayHideWhenIdle,UPT_HIDE_MS); }
/* not while someone is pointing at it, in it, or using the page this very moment: the tray going may move what
   sat on it (the chat's box on a phone), and that must not happen under a finger */
function upTrayHideWhenIdle(){ UPT.timer=0; var el=UPT.el; if(!el||!el.classList.contains("on")) return; var c=upTrayCounts(); if(c.active||c.failed) return;
  if(el.matches(":hover")||el.contains(document.activeElement)||Date.now()-UPT.lastInput<1500){ UPT.timer=setTimeout(upTrayHideWhenIdle,1500); return; }
  upTrayHide(); }
function upTrayInput(){ UPT.lastInput=Date.now(); }
/* what the tray must keep clear of is watched only while it shows */
function upTrayWatch(on){
  if(on&&!UPT.watch){ var mo=window.MutationObserver?new MutationObserver(upTrayLayerMoved):null;
    ["modalWrap","modal","drawer","aiChat"].forEach(function(id){ var n=document.getElementById(id); if(n&&mo) mo.observe(n,{attributes:true,attributeFilter:["class"]}); });
    if(mo) mo.observe(document.body,{attributes:true,attributeFilter:["class"]});
    UPT.watch=mo||true; window.addEventListener("resize",upTrayPlaceSoon); document.addEventListener("pointerdown",upTrayInput,true); document.addEventListener("keydown",upTrayInput,true); }
  else if(!on&&UPT.watch){ if(UPT.watch.disconnect) UPT.watch.disconnect(); UPT.watch=null; window.removeEventListener("resize",upTrayPlaceSoon); document.removeEventListener("pointerdown",upTrayInput,true); document.removeEventListener("keydown",upTrayInput,true); } }
function upTrayPlaceSoon(){ if(!UPT.raf) UPT.raf=requestAnimationFrame(upTrayPlace); }
/* a dialog or a panel opening or closing; the task panel slides in, so it is looked at again where it stops */
function upTrayLayerMoved(){ upTrayPlaceSoon(); clearTimeout(UPT.late); UPT.late=setTimeout(upTrayPlaceSoon,320); }
function upTrayLayer(){ var mw=document.getElementById("modalWrap"); if(mw&&mw.classList.contains("open")) return {k:"modal",el:document.getElementById("modal")||mw};
  var ch=document.getElementById("aiChat"); if(ch&&document.body.classList.contains("aichat-open")) return {k:"chat",el:ch};
  var dr=document.getElementById("drawer"); if(dr&&dr.classList.contains("open")) return {k:"drawer",el:dr};
  return null; }
function upTrayPlace(){ if(UPT.raf){ cancelAnimationFrame(UPT.raf); UPT.raf=0; } var el=UPT.el; if(!el||!el.classList.contains("on")) return;
  var narrow=innerWidth<=980, L=upTrayLayer(), resv="";
  /* a layer on top that would reach the tray: on a phone or a tablet every one of them, on a computer only one
     that crosses the tray's column (a dialog centred on a narrow screen, the task panel on the left or wide) */
  if(L){ if(narrow) resv=L.k; else { var a=L.el.getBoundingClientRect(), b=el.getBoundingClientRect(); if(a.width&&a.left<b.right+12&&a.right>b.left-12) resv=L.k; } }
  if((el.getAttribute("data-resv")||"")!==resv){ if(resv) el.setAttribute("data-resv",resv); else el.removeAttribute("data-resv"); }
  el.classList.toggle("dock",narrow&&!L);
  if(resv&&!UPT.auto){ UPT.auto=true; UPT.before=UPT.collapsed; UPT.touched=false; upTraySetCollapsed(true); }
  else if(!resv&&UPT.auto){ UPT.auto=false; if(!UPT.touched) upTraySetCollapsed(UPT.before); }
  var root=document.documentElement.style, tb=narrow?document.getElementById("tabbar"):null, th=tb?tb.offsetHeight:0;
  root.setProperty("--uptray-tb",th+"px");
  root.setProperty("--uptray-dock",(th+16+el.offsetHeight)+"px");
  /* from the layout, not the box on screen: the tray may still be sliding in */
  root.setProperty("--uptray-r",Math.round((parseFloat(getComputedStyle(el).bottom)||0)+el.offsetHeight+8)+"px"); }
/* the same words in the other language, patched where they are */
function upTrayRetext(){ if(!UPT.el) return; Object.keys(UPT.rows).forEach(function(id){ var r=UPT.rows[id]; upTrayRow(r,true); uploadPaint(r.rec); }); upTrayHead(); }
if(typeof document!=="undefined"){
  document.addEventListener("zc-upload",function(e){ upTrayOn(e.detail); });
  window.addEventListener("beforeunload",function(e){ if(typeof uploadActive==="function"&&uploadActive().length){ e.preventDefault(); e.returnValue=true; } });
}
(function(){ if(typeof languageRedraw!=="function") return; var base=languageRedraw; languageRedraw=function(){ var out=base.apply(this,arguments); try{ upTrayRetext(); }catch(e){} return out; }; })();
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Uploads":"Unggahan",
  "Uploading":"Mengunggah",
  "file":"file",
  "files":"file",
  "upload complete":"unggahan selesai",
  "uploads complete":"unggahan selesai",
  "failed":"gagal",
  "uploads cancelled":"unggahan dibatalkan",
  "to Google Drive":"ke Google Drive",
  "to this server":"ke server ini",
  "Cancel upload":"Batalkan unggahan",
  "Collapse uploads":"Ciutkan daftar unggahan",
  "Expand uploads":"Buka daftar unggahan",
  "Collapse — uploads keep going":"Ciutkan — unggahan tetap berjalan",
  "Close uploads":"Tutup daftar unggahan"
});
</script>
