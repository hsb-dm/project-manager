<script>
/* ============================================================
   THE LIST'S COLUMNS, MOVED AND SIZED (Oct 2026)
   The owner: "buat list view tablenya bisa digeser2". A List header (Tasks, a project's List tab) is dragged left or
   right to move its column — a line shows where it lands, Esc puts it back, the table is drawn again once, on the
   drop; a press that does not travel is still a click that sorts. Its right edge is dragged to size it, live, only
   the headers' widths changing; a double-click there gives the usual width back. Until a person sizes a column the
   table looks as before (spare room shared by every column); the first sizing keeps each column at the width it was
   drawn at, so nothing jumps, and from then on widths are exact and Task takes the room the others leave (never
   less than its own width). Keys on a focused header: Alt+Left/Right moves it, Alt+Shift+Left/Right
   sizes it, Enter sorts; each change is read out. Pointer events (mouse, touch, pen) — the rows keep their HTML5
   drag-and-drop (kStart, lDrop, lGroupDrop in src/tasks.js) untouched; on touch a header is held LCOL_HOLD ms
   before it moves, so a swipe still scrolls the table. Check and drag stay first.
   Kept per person in myPrefs().listCols = {order, w} (what differs from the usual; saved to the server, so every
   device draws the same table); unknown keys are ignored, a new column appears at its usual place, "Reset columns"
   (next to Group, while something differs) brings the usual back. Phones draw the List as cards with no header
   (src/responsive.css finds each cell by its lcol-<key> class), so nothing moves there.
   ============================================================ */
var LCOL_MIN={title:160,effort:44}, LCOL_STEP=16, LCOL_HOLD=350;
var LCOL={mv:null,rz:null,noClick:false};
function listColKeys(){ return LIST_COLS.map(function(c){ return c.k; }); }
function listColPrefs(){ var p=PEOPLE[ME]?myPrefs().listCols:null; return p&&typeof p==="object"&&!Array.isArray(p)?p:{}; }
/* known keys once each; a missing one goes after the nearest column before it by default */
function listColOrder(){ var def=listColKeys(), raw=listColPrefs().order, out=[];
  if (Array.isArray(raw)) raw.forEach(function(k){ if (def.indexOf(k)>=0&&out.indexOf(k)<0) out.push(k); });
  def.forEach(function(k,i){ if (out.indexOf(k)>=0) return; var at=0; for (var j=i-1;j>=0;j--){ var p=out.indexOf(def[j]); if (p>=0){ at=p+1; break; } } out.splice(at,0,k); });
  return out; }
function listColClamp(k,w){ return Math.max(LCOL_MIN[k]||60,Math.min(800,Math.round(w))); }
function listColWidth(k){ if (LCOL.rz&&LCOL.rz.k===k) return LCOL.rz.w; var w=(listColPrefs().w||{})[k]; return typeof w==="number"&&isFinite(w)?listColClamp(k,w):colW(LIST_COL_W,k); }
function listColWidths(){ var w={}; listColKeys().forEach(function(k){ w[k]=listColWidth(k); }); return w; }
/* sized: the person has sized a column, so widths are exact and Task has no width of its own on the page */
function listColSized(){ var w=listColPrefs().w; return !!w&&typeof w==="object"&&!Array.isArray(w); }
function listColCustom(){ return listColSized()||listColOrder().join()!==listColKeys().join(); }
/* widths null = not sized. {} rather than no key, so an older copy in this browser cannot bring a layout back
   (myPrefs fills in keys the server copy lacks) */
function listColStore(order,widths){ var d=listColKeys(), o={};
  if (order&&order.join()!==d.join()) o.order=order.slice();
  if (widths){ o.w={}; Object.keys(widths).forEach(function(k){ var v=widths[k]; if (d.indexOf(k)>=0&&typeof v==="number"&&listColClamp(k,v)!==colW(LIST_COL_W,k)) o.w[k]=listColClamp(k,v); }); }
  myPrefs().listCols=o; saveMyPrefs(); var b=document.querySelector("#content .lcol-reset"); if (b) b.hidden=!listColCustom(); }
function listColResetBtn(){ return '<button type="button" class="btn sm ghost lcol-reset desktop-only" onclick="listColReset()"'+(listColCustom()?"":" hidden")+'>'+esc(tr("Reset columns"))+'</button>'; }
function listColReset(){ lcolEnd(); LCOL.rz=null; listColStore(null,null); renderScreen(false); toast(tr("Columns back to their usual order and widths")); }
function lcolTable(){ return document.querySelector("#content table.lcol-tbl"); }
function lcolTh(k){ var t=lcolTable(); return t?t.querySelector('thead th[data-col="'+k+'"]'):null; }
/* widths shown at once, on the headers only (a fixed table takes its column widths from them) */
function lcolApply(){ var t=lcolTable(), sized=listColSized(); if (!t) return; t.classList.toggle("lcol-sized",sized);
  t.querySelectorAll("thead th[data-col]").forEach(function(th){ var k=th.getAttribute("data-col"); th.style.width=k==="title"&&sized?"":listColWidth(k)+"px"; });
  t.style.setProperty("--tbl-min",listColOrder().reduce(function(s,c){ return s+listColWidth(c); },LIST_COL_W.check+LIST_COL_W.drag)+"px"); }
/* the first sizing: every column keeps the width it is drawn at (Task keeps its own as its least) */
function lcolFreeze(){ var t=lcolTable(), w={}; if (listColSized()||!t) return;
  t.querySelectorAll("thead th[data-col]").forEach(function(th){ var k=th.getAttribute("data-col"); if (k!=="title") w[k]=listColClamp(k,th.getBoundingClientRect().width); });
  myPrefs().listCols=Object.assign({},listColPrefs(),{w:w}); lcolApply(); }
function lcolListen(on){ var f=on?"addEventListener":"removeEventListener"; window[f]("pointermove",lcolMove,true); window[f]("pointerup",lcolUp,true); window[f]("pointercancel",lcolCancel,true); window[f]("keydown",lcolEsc,true); window[f]("blur",lcolCancel); }
function lcolSort(e,k){ if (LCOL.noClick){ LCOL.noClick=false; return; } setSort(k); }
/* moving */
function lcolDown(e,th){ LCOL.noClick=false; var k=th.getAttribute("data-col"); if (e.button!==0||LCOL.mv||LCOL.rz||!LIST_COL_BY[k]) return;
  var d=LCOL.mv={k:k,id:e.pointerId,touch:e.pointerType==="touch",x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY}; lcolListen(true);
  if (d.touch) d.hold=setTimeout(function(){ if (LCOL.mv===d) lcolStart(d); },LCOL_HOLD); }
function lcolStart(d){ var th=lcolTh(d.k); if (!th) return lcolEnd(); d.on=true; LCOL.noClick=true; try { th.setPointerCapture(d.id); } catch(x){}
  th.classList.add("lcol-src"); document.body.classList.add("lcol-moving");
  d.ghost=document.createElement("div"); d.ghost.className="lcol-ghost"; d.ghost.textContent=th.querySelector(".lcol-lbl").textContent;
  d.line=document.createElement("div"); d.line.className="lcol-drop"; document.body.append(d.ghost,d.line);
  d.from=listColOrder().indexOf(d.k); lcolPaint(); d.raf=requestAnimationFrame(lcolAuto); }
function lcolMove(e){ var r=LCOL.rz, d=LCOL.mv;
  if (r){ if (e.pointerId===r.id&&(r.moved||e.clientX!==r.x0)){ e.preventDefault(); if (!r.moved){ r.moved=true; lcolFreeze(); } r.w=listColClamp(r.k,r.w0+e.clientX-r.x0); lcolApply(); } return; }
  if (!d||e.pointerId!==d.id) return; d.x=e.clientX; d.y=e.clientY;
  if (!d.on){ var far=Math.max(Math.abs(d.x-d.x0),Math.abs(d.y-d.y0)); if (d.touch){ if (far>8) lcolEnd(); return; } if (far<=5) return; lcolStart(d); }
  e.preventDefault(); lcolPaint(); }
/* lands before the first header whose middle is right of the pointer; the line marks that edge */
function lcolPaint(){ var d=LCOL.mv, t=lcolTable(); if (!d||!d.on) return; if (!t) return lcolEnd();
  var hs=[].slice.call(t.querySelectorAll("thead th[data-col]")), wr=t.parentNode.getBoundingClientRect(), i=0, b;
  for (;i<hs.length;i++){ b=hs[i].getBoundingClientRect(); if (d.x<b.left+b.width/2) break; }
  var x=i<hs.length?hs[i].getBoundingClientRect().left:hs[hs.length-1].getBoundingClientRect().right, top=Math.max(t.tHead.getBoundingClientRect().top,wr.top,0), s=d.line.style;
  d.to=i; s.left=Math.round(Math.max(wr.left+1,Math.min(wr.right-2,x))-1)+"px"; s.top=Math.round(top)+"px"; s.height=Math.max(0,Math.round(Math.min(wr.bottom,innerHeight)-top))+"px";
  d.line.classList.toggle("same",i===d.from||i===d.from+1); d.ghost.style.transform="translate("+(d.x+12)+"px,"+(d.y+14)+"px)"; }
/* near an edge of a table that scrolls sideways, it scrolls */
function lcolAuto(){ var d=LCOL.mv, t=lcolTable(), w=t&&t.parentNode; if (!d||!d.on) return;
  if (w&&w.scrollWidth>w.clientWidth){ var r=w.getBoundingClientRect(), v=d.x<r.left+40?(d.x-r.left-40)/3:d.x>r.right-40?(d.x-r.right+40)/3:0;
    if (v){ var was=w.scrollLeft; w.scrollLeft=was+Math.max(-24,Math.min(24,Math.round(v)||(v<0?-1:1))); if (w.scrollLeft!==was) lcolPaint(); } }
  d.raf=requestAnimationFrame(lcolAuto); }
function lcolUp(e){ var r=LCOL.rz, d=LCOL.mv;
  if (r){ if (e.pointerId===r.id) lcolRzDone(true); return; }
  if (!d||e.pointerId!==d.id) return; var on=d.on, order=listColOrder(), from=order.indexOf(d.k), to=d.to; lcolEnd();
  if (!on||to==null) return; if (to>from) to--; if (to===from) return;   /* not moved: the header's own click sorts */
  order.splice(from,1); order.splice(to,0,d.k); listColStore(order,listColSized()?listColWidths():null); renderScreen(false); lcolSayPlace(d.k); }
function lcolEnd(){ var d=LCOL.mv; LCOL.mv=null; if (d){ clearTimeout(d.hold); cancelAnimationFrame(d.raf); if (d.ghost) d.ghost.remove(); if (d.line) d.line.remove(); }
  document.querySelectorAll(".lcol-src").forEach(function(x){ x.classList.remove("lcol-src"); }); document.body.classList.remove("lcol-moving"); if (!LCOL.rz) lcolListen(false); }
function lcolCancel(e){ var x=LCOL.rz||LCOL.mv; if (!x||(e.type==="pointercancel"&&e.pointerId!==x.id)) return; if (LCOL.rz) lcolRzDone(false); else lcolEnd(); }
function lcolEsc(e){ if (e.key!=="Escape"||!((LCOL.mv&&LCOL.mv.on)||LCOL.rz)) return; e.preventDefault(); e.stopImmediatePropagation(); LCOL.noClick=true;
  if (LCOL.rz) lcolRzDone(false); else { lcolEnd(); lcolSay(tr("Column move cancelled")); } }
/* a held header must not scroll the page: a listener on the header row can stop it (one on the document is passive) */
function lcolTouch(e){ if ((LCOL.mv&&LCOL.mv.on)||LCOL.rz) e.preventDefault(); }
function lcolMenu(e){ if (LCOL.mv||LCOL.rz) e.preventDefault(); }
/* sizing */
function lcolRzDown(e,h){ e.stopPropagation(); LCOL.noClick=true; var th=h.parentNode, k=th.getAttribute("data-col"); if (e.button!==0||LCOL.mv||LCOL.rz||!LIST_COL_BY[k]) return; e.preventDefault();
  LCOL.rz={k:k,id:e.pointerId,x0:e.clientX,w0:listColClamp(k,th.getBoundingClientRect().width),w:listColWidth(k),h:h,was:myPrefs().listCols};
  try { h.setPointerCapture(e.pointerId); } catch(x){} h.classList.add("on"); document.body.classList.add("lcol-sizing"); lcolListen(true); }
/* kept on a release that moved; Esc, a lost pointer or a press that did not move puts back what was there */
function lcolRzDone(keep){ var r=LCOL.rz; LCOL.rz=null; r.h.classList.remove("on"); document.body.classList.remove("lcol-sizing"); if (!LCOL.mv) lcolListen(false);
  if (keep&&r.moved){ var w=listColWidths(); w[r.k]=r.w; listColStore(listColOrder(),w); lcolSayWidth(r.k); } else myPrefs().listCols=r.was;
  lcolApply(); }
function lcolRzReset(e,h){ e.preventDefault(); e.stopPropagation(); var k=h.parentNode.getAttribute("data-col"), w=listColWidths(); if (!LIST_COL_BY[k]||!listColSized()) return; delete w[k]; listColStore(listColOrder(),w); lcolApply(); lcolSayWidth(k); }
/* keys */
function lcolKey(e,th){ var k=th.getAttribute("data-col"), c=LIST_COL_BY[k]; if (!c||LCOL.mv||LCOL.rz) return;
  if (e.altKey&&!e.ctrlKey&&!e.metaKey&&(e.key==="ArrowLeft"||e.key==="ArrowRight")){ e.preventDefault(); e.stopPropagation(); var dir=e.key==="ArrowLeft"?-1:1, order=listColOrder(), i=order.indexOf(k);
    if (e.shiftKey){ var from=th.getBoundingClientRect().width; lcolFreeze(); var w=listColWidths(); w[k]=listColClamp(k,from+dir*LCOL_STEP); listColStore(order,w); lcolApply(); return lcolSayWidth(k); }
    if (order[i+dir]){ order.splice(i,1); order.splice(i+dir,0,k); listColStore(order,listColSized()?listColWidths():null); renderScreen(false); var f=lcolTh(k); if (f) f.focus(); }
    return lcolSayPlace(k); }
  if ((e.key==="Enter"||e.key===" ")&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&c.sort){ e.preventDefault(); setSort(k); var g=lcolTh(k); if (g) g.focus(); } }
/* read out */
function lcolSay(text){ var el=document.getElementById("lcolLive"); if (!el){ el=document.createElement("div"); el.id="lcolLive"; el.className="zc-sr"; el.setAttribute("role","status"); el.setAttribute("aria-live","polite"); document.body.appendChild(el); } el.textContent=""; setTimeout(function(){ el.textContent=text; },40); }
function lcolSayPlace(k){ var o=listColOrder(); lcolSay(tr("{column}: column {n} of {total}").replace("{column}",tr(LIST_COL_BY[k].l)).replace("{n}",o.indexOf(k)+1).replace("{total}",o.length)); }
function lcolSayWidth(k){ var th=lcolTh(k); lcolSay(tr("{column}: {px} px wide").replace("{column}",tr(LIST_COL_BY[k].l)).replace("{px}",th?Math.round(th.getBoundingClientRect().width):listColWidth(k))); }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Drag to move · drag the edge to resize":"Seret untuk memindahkan · seret tepinya untuk mengubah lebar",
  "Reset columns":"Atur ulang kolom", "Columns back to their usual order and widths":"Kolom kembali ke urutan dan lebar semula",
  "Column move cancelled":"Pemindahan kolom dibatalkan", "{column}: column {n} of {total}":"{column}: kolom {n} dari {total}", "{column}: {px} px wide":"{column}: lebar {px} px",
  "Drag a header to move its column, or its right edge to size it; double-click the edge for the usual width. On a focused header: Alt+Left/Right moves it, Alt+Shift+Left/Right sizes it, Enter sorts.":"Seret judul kolom untuk memindahkannya, atau tepi kanannya untuk mengubah lebarnya; klik dua kali tepinya untuk lebar semula. Pada judul yang terfokus: Alt+Kiri/Kanan memindahkannya, Alt+Shift+Kiri/Kanan mengubah lebarnya, Enter mengurutkan."
});
</script>
<style>
.lcol-tbl th.lcol-th{position:relative;-webkit-touch-callout:none}
.lcol-tbl th.lcol-th:not(.lcol-sortable){cursor:grab}
.lcol-tbl th.lcol-th:focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}
.lcol-tbl th.lcol-src{opacity:.4}
.lcol-rz{position:absolute;top:0;right:0;bottom:0;width:10px;cursor:col-resize;touch-action:none;z-index:1}
.lcol-rz::after{content:"";position:absolute;top:24%;bottom:24%;right:4px;width:2px;border-radius:2px;background:var(--color-border-strong);opacity:0}
.lcol-th:hover .lcol-rz::after{opacity:1}
.lcol-rz:hover::after,.lcol-rz.on::after{opacity:1;background:var(--color-primary);top:0;bottom:0}
.lcol-ghost{position:fixed;left:0;top:0;z-index:10000;pointer-events:none;padding:7px 12px;border-radius:var(--radius-sm);background:var(--color-surface);border:1px solid var(--color-primary);box-shadow:var(--shadow-lg);color:var(--color-primary);font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.lcol-drop{position:fixed;z-index:9999;pointer-events:none;width:3px;border-radius:2px;background:var(--color-primary)}
.lcol-drop::before{content:"";position:absolute;top:-3px;left:-3px;width:9px;height:9px;border-radius:50%;background:inherit}
.lcol-drop.same{opacity:.35}
body.lcol-moving,body.lcol-moving *{cursor:grabbing!important;user-select:none!important}
body.lcol-sizing,body.lcol-sizing *{cursor:col-resize!important;user-select:none!important}
.lcol-reset[hidden]{display:none!important}
@media (min-width:761px){ .lcol-sized th.lcol-th{overflow:hidden;text-overflow:ellipsis} .lcol-sized tbody tr:not(.grp)>td[class*="lcol-"]{overflow:hidden} }
@media (pointer:coarse){ .lcol-rz{width:16px} }
</style>
