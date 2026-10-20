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
   Shown or hidden (Oct 2026, the owner: "bisa pilih mana aja yang ditampilin"): "Columns" next to Group opens a
   popover listing every column in its order, each with a box to show it and buttons to move it up or down; Task is
   always shown. A header's own menu (right-click, Shift+F10 or the menu key) hides it. A hidden column is not drawn
   at all (header, cells, group rows, phone cards), keeps its place in the order and comes back there; sorting and
   grouping by it still work. Kept as listCols.hide (known keys only, never Task; a column added later shows).
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
/* hidden: known keys in their usual order, never Task; shown: the rest, in the person's order */
function listColHidden(){ var h=listColPrefs().hide; return Array.isArray(h)?listColKeys().filter(function(k){ return k!=="title"&&h.indexOf(k)>=0; }):[]; }
function listColShown(){ var h=listColHidden(); return listColOrder().filter(function(k){ return h.indexOf(k)<0; }); }
/* the shown columns in a new order, each hidden one left in its place */
function listColWithShown(vis){ var h=listColHidden(), i=0; return listColOrder().map(function(k){ return h.indexOf(k)>=0?k:vis[i++]; }); }
function listColCustom(){ return listColSized()||listColHidden().length>0||listColOrder().join()!==listColKeys().join(); }
/* widths null = not sized. {} rather than no key, so an older copy in this browser cannot bring a layout back
   (myPrefs fills in keys the server copy lacks). hide left out keeps what is hidden */
function listColStore(order,widths,hide){ var d=listColKeys(), o={}; hide=hide||listColHidden();
  if (order&&order.join()!==d.join()) o.order=order.slice();
  if (widths){ o.w={}; Object.keys(widths).forEach(function(k){ var v=widths[k]; if (d.indexOf(k)>=0&&typeof v==="number"&&listColClamp(k,v)!==colW(LIST_COL_W,k)) o.w[k]=listColClamp(k,v); }); }
  hide=d.filter(function(k){ return k!=="title"&&hide.indexOf(k)>=0; }); if (hide.length) o.hide=hide;
  myPrefs().listCols=o; saveMyPrefs(); var b=document.querySelector("#content .lcol-reset"); if (b) b.hidden=!listColCustom(); }
function listColResetBtn(){ return '<button type="button" class="btn sm ghost lcol-reset desktop-only" onclick="listColReset()"'+(listColCustom()?"":" hidden")+'>'+esc(tr("Reset columns"))+'</button>'; }
function listColReset(){ lcolEnd(); LCOL.rz=null; listColStore(null,null,[]); lcolRedraw(); toast(tr("Columns back to their usual order and widths")); }
function lcolTable(){ return document.querySelector("#content table.lcol-tbl"); }
function lcolTh(k){ var t=lcolTable(); return t?t.querySelector('thead th[data-col="'+k+'"]'):null; }
/* widths shown at once, on the headers only (a fixed table takes its column widths from them) */
function lcolApply(){ var t=lcolTable(), sized=listColSized(); if (!t) return; t.classList.toggle("lcol-sized",sized);
  t.querySelectorAll("thead th[data-col]").forEach(function(th){ var k=th.getAttribute("data-col"); th.style.width=k==="title"&&sized?"":listColWidth(k)+"px"; });
  t.style.setProperty("--tbl-min",listColShown().reduce(function(s,c){ return s+listColWidth(c); },LIST_COL_W.check+LIST_COL_W.drag)+"px"); }
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
  d.from=listColShown().indexOf(d.k); lcolPaint(); d.raf=requestAnimationFrame(lcolAuto); }
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
  if (!d||e.pointerId!==d.id) return; var on=d.on, vis=listColShown(), from=vis.indexOf(d.k), to=d.to; lcolEnd();
  if (!on||to==null) return; if (to>from) to--; if (to===from) return;   /* not moved: the header's own click sorts */
  vis.splice(from,1); vis.splice(to,0,d.k); listColStore(listColWithShown(vis),listColSized()?listColWidths():null); lcolRedraw(); lcolSayPlace(d.k); }
function lcolEnd(){ var d=LCOL.mv; LCOL.mv=null; if (d){ clearTimeout(d.hold); cancelAnimationFrame(d.raf); if (d.ghost) d.ghost.remove(); if (d.line) d.line.remove(); }
  document.querySelectorAll(".lcol-src").forEach(function(x){ x.classList.remove("lcol-src"); }); document.body.classList.remove("lcol-moving"); if (!LCOL.rz) lcolListen(false); }
function lcolCancel(e){ var x=LCOL.rz||LCOL.mv; if (!x||(e.type==="pointercancel"&&e.pointerId!==x.id)) return; if (LCOL.rz) lcolRzDone(false); else lcolEnd(); }
function lcolEsc(e){ if (e.key!=="Escape"||!((LCOL.mv&&LCOL.mv.on)||LCOL.rz)) return; e.preventDefault(); e.stopImmediatePropagation(); LCOL.noClick=true;
  if (LCOL.rz) lcolRzDone(false); else { lcolEnd(); lcolSay(tr("Column move cancelled")); } }
/* a held header must not scroll the page: a listener on the header row can stop it (one on the document is passive) */
function lcolTouch(e){ if ((LCOL.mv&&LCOL.mv.on)||LCOL.rz) e.preventDefault(); }
/* no menu while dragging; otherwise a header's own menu (once: the menu key's own event finds it open) */
function lcolMenu(e){ if (LCOL.mv||LCOL.rz) return e.preventDefault(); var th=e.target.closest&&e.target.closest("th[data-col]"), m=document.getElementById("ctxMenu"); if (!th) return;
  e.preventDefault(); if (!m.classList.contains("open")||m._anchor!==th) lcolHeadMenu(th); }
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
  if (e.key==="ContextMenu"||(e.shiftKey&&e.key==="F10")){ e.preventDefault(); e.stopPropagation(); return lcolHeadMenu(th); }
  if (e.altKey&&!e.ctrlKey&&!e.metaKey&&(e.key==="ArrowLeft"||e.key==="ArrowRight")){ e.preventDefault(); e.stopPropagation(); var dir=e.key==="ArrowLeft"?-1:1, vis=listColShown(), i=vis.indexOf(k);
    if (e.shiftKey){ var from=th.getBoundingClientRect().width; lcolFreeze(); var w=listColWidths(); w[k]=listColClamp(k,from+dir*LCOL_STEP); listColStore(listColOrder(),w); lcolApply(); return lcolSayWidth(k); }
    if (vis[i+dir]){ vis.splice(i,1); vis.splice(i+dir,0,k); listColStore(listColWithShown(vis),listColSized()?listColWidths():null); lcolRedraw(); var f=lcolTh(k); if (f) f.focus(); }
    return lcolSayPlace(k); }
  if ((e.key==="Enter"||e.key===" ")&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&c.sort){ e.preventDefault(); setSort(k); var g=lcolTh(k); if (g) g.focus(); } }
/* read out */
function lcolSay(text){ var el=document.getElementById("lcolLive"); if (!el){ el=document.createElement("div"); el.id="lcolLive"; el.className="zc-sr"; el.setAttribute("role","status"); el.setAttribute("aria-live","polite"); document.body.appendChild(el); } el.textContent=""; setTimeout(function(){ el.textContent=text; },40); }
function lcolSayPlace(k,o){ o=o||listColShown(); lcolSay(tr("{column}: column {n} of {total}").replace("{column}",tr(LIST_COL_BY[k].l)).replace("{n}",o.indexOf(k)+1).replace("{total}",o.length)); }
function lcolSayWidth(k){ var th=lcolTh(k); lcolSay(tr("{column}: {px} px wide").replace("{column}",tr(LIST_COL_BY[k].l)).replace("{px}",th?Math.round(th.getBoundingClientRect().width):listColWidth(k))); }
/* shown or hidden: the Columns button (next to Group) and its popover, in the shared #ctxMenu */
function listColBtn(){ var n=listColHidden().length, t=tr("Columns")+(n?" · "+tr("{n} hidden").replace("{n}",n):"");
  return '<button type="button" class="btn sm lcol-cols'+(n?" on":"")+'" data-menu aria-haspopup="dialog" aria-label="'+attr(t)+'" title="'+attr(t)+'" onclick="lcolPop(this)">'+I.eye+'<span class="lcol-cbl">'+esc(tr("Columns"))+'</span>'+(n?'<span class="lcol-cnt" aria-hidden="true">'+n+'</span>':"")+'</button>'; }
function lcolPopHtml(){ var o=listColOrder(), h=listColHidden(), mv=function(i,d,l){ return '<button type="button" class="lcol-mv" data-a="'+(d<0?"up":"dn")+'"'+(o[i+d]?"":" disabled")+' aria-label="'+attr(tr(d<0?"Move {column} up":"Move {column} down").replace("{column}",l))+'" onclick="lcolPopMove('+jsq(o[i])+','+d+')">'+(d<0?I.chevu:I.chevd)+'</button>'; };
  return '<div class="lcol-pop" role="dialog" aria-label="'+attr(tr("Columns"))+'" onkeydown="lcolPopKey(event)" oncontextmenu="event.preventDefault()"><div class="lcol-ph"><b>'+esc(tr("Columns"))+'</b><span>'+esc(tr("{n} of {total} shown").replace("{n}",o.length-h.length).replace("{total}",o.length))+'</span></div><div class="lcol-pl">'
    +o.map(function(k,i){ var l=tr(LIST_COL_BY[k].l), on=h.indexOf(k)<0, lock=k==="title";
      return '<div class="lcol-pr'+(on?"":" off")+'" data-k="'+k+'"><label><input type="checkbox" data-a="cb"'+(on?" checked":"")+(lock?" disabled":"")+' onchange="lcolShow('+jsq(k)+',this.checked)"><span>'+esc(l)+'</span>'+(lock?'<small>'+esc(tr("always shown"))+'</small>':"")+'</label>'+mv(i,-1,l)+mv(i,1,l)+'</div>'; }).join("")
    +'</div><div class="lcol-pf"><button type="button" class="btn xs ghost" data-a="all"'+(h.length?"":" disabled")+' onclick="lcolShowAll()">'+esc(tr("Show all"))+'</button><button type="button" class="btn xs ghost" data-a="reset"'+(listColCustom()?"":" disabled")+' onclick="listColReset()">'+esc(tr("Reset columns"))+'</button></div></div>'; }
function lcolPopEl(){ var m=document.getElementById("ctxMenu"); return m&&m.classList.contains("open")&&m.querySelector(".lcol-pop")?m:null; }
/* opened from the button (or a header's menu: k, that column's row has the focus) */
function lcolPop(a,k){ a=a||document.querySelector("#content .lcol-cols")||lcolTh(k); if (!a) return; ctxMenu(a,lcolPopHtml()); var m=lcolPopEl(); if (m){ if (k) lcolFocus(m,k,"cb"); else m.querySelector("input:enabled").focus(); } }
/* focus a row's control a, or the next best one there, or anywhere in the popover (k null: the buttons at the bottom) */
function lcolFocus(m,k,a){ var s=m.querySelector(k?'.lcol-pr[data-k="'+k+'"]':".lcol-pf"), q=function(e,x){ return e?[].slice.call(e.querySelectorAll(x)):[]; };
  var c=[s&&s.querySelector('[data-a="'+a+'"]')].concat(q(s,"button"),q(s,"input"),q(m,"input"),q(m,"button")).filter(function(x){ return x&&!x.disabled; }); if (c[0]) c[0].focus(); }
/* the table drawn again; an open popover is refilled where it stands, the focus on the control just used */
function lcolRedraw(){ var m=lcolPopEl(), a=m&&m.contains(document.activeElement)?document.activeElement:null, r=a&&a.closest(".lcol-pr");
  renderScreen(false); if (!m) return; m.innerHTML=lcolPopHtml(); m._anchor=document.querySelector("#content .lcol-cols")||m._anchor; if (a) lcolFocus(m,r&&r.getAttribute("data-k"),a.getAttribute("data-a")); }
function lcolShow(k,on,head){ if (!LIST_COL_BY[k]||k==="title") return; var v=listColShown(), i=v.indexOf(k), h=listColHidden().filter(function(x){ return x!==k; });
  if (!on) h.push(k); listColStore(listColOrder(),listColSized()?listColWidths():null,h); lcolRedraw();
  if (head){ var f=lcolTh(v[i+1]||v[i-1]); if (f) f.focus(); }
  lcolSay(tr(on?"{column} shown":"{column} hidden").replace("{column}",tr(LIST_COL_BY[k].l))); }
function lcolShowAll(){ listColStore(listColOrder(),listColSized()?listColWidths():null,[]); lcolRedraw(); lcolSay(tr("All columns shown")); }
/* up or down the whole order, hidden columns too: the same order a header's drag changes */
function lcolPopMove(k,d){ var o=listColOrder(), i=o.indexOf(k); if (i<0||!o[i+d]) return; o.splice(i,1); o.splice(i+d,0,k); listColStore(o,listColSized()?listColWidths():null); lcolRedraw(); lcolSayPlace(k,o); }
/* Esc closes (the focus back where it came from), Up/Down go from row to row, Alt+Up/Down move the row */
function lcolPopKey(e){ var m=document.getElementById("ctxMenu"), a=e.target, hm=a.closest(".lcol-hm"), r=a.closest(".lcol-pr")||(hm?a:null);
  if (e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closePops(); var b=hm?lcolTh(hm.getAttribute("data-k")):document.querySelector("#content .lcol-cols"); if (b) b.focus(); return; }
  if ((e.key!=="ArrowDown"&&e.key!=="ArrowUp")||!r||e.ctrlKey||e.metaKey) return; e.preventDefault(); var d=e.key==="ArrowUp"?-1:1;
  if (e.altKey){ if (!hm) lcolPopMove(r.getAttribute("data-k"),d); return; }
  var all=[].slice.call(m.querySelectorAll(".lcol-pr,.lcol-hm>button")), n=all[all.indexOf(r)+d]; if (n) hm?n.focus():lcolFocus(m,n.getAttribute("data-k"),a.getAttribute("data-a")); }
/* a header's own menu: hide it (not Task), or all the columns */
function lcolHeadMenu(th){ var k=th.getAttribute("data-col");
  ctxMenu(th,'<div class="lcol-hm" data-k="'+k+'" onkeydown="lcolPopKey(event)" oncontextmenu="event.preventDefault()">'+(k==="title"?"":'<button type="button" onclick="closePops();lcolShow('+jsq(k)+',false,1)">'+I.eyeoff+esc(tr("Hide column"))+'</button>')+'<button type="button" onclick="lcolPop(null,'+jsq(k)+')">'+I.eye+esc(tr("Columns…"))+'</button></div>',"left");
  var b=document.querySelector("#ctxMenu.open .lcol-hm button"); if (b) b.focus(); }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Drag to move · drag the edge to resize":"Seret untuk memindahkan · seret tepinya untuk mengubah lebar",
  "Reset columns":"Atur ulang kolom", "Columns back to their usual order and widths":"Kolom kembali ke urutan dan lebar semula",
  "Column move cancelled":"Pemindahan kolom dibatalkan", "{column}: column {n} of {total}":"{column}: kolom {n} dari {total}", "{column}: {px} px wide":"{column}: lebar {px} px",
  "Drag a header to move its column, or its right edge to size it; double-click the edge for the usual width. On a focused header: Alt+Left/Right moves it, Alt+Shift+Left/Right sizes it, Enter sorts, Shift+F10 opens its menu to hide it or choose the columns.":"Seret judul kolom untuk memindahkannya, atau tepi kanannya untuk mengubah lebarnya; klik dua kali tepinya untuk lebar semula. Pada judul yang terfokus: Alt+Kiri/Kanan memindahkannya, Alt+Shift+Kiri/Kanan mengubah lebarnya, Enter mengurutkan, Shift+F10 membuka menunya untuk menyembunyikannya atau memilih kolom.",
  "Columns":"Kolom", "{n} hidden":"{n} disembunyikan", "{n} of {total} shown":"{n} dari {total} tampil", "always shown":"selalu tampil",
  "Move {column} up":"Pindahkan {column} ke atas", "Move {column} down":"Pindahkan {column} ke bawah", "Show all":"Tampilkan semua",
  "{column} hidden":"{column} disembunyikan", "{column} shown":"{column} ditampilkan", "All columns shown":"Semua kolom ditampilkan",
  "Hide column":"Sembunyikan kolom", "Columns…":"Kolom…"
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
/* how many are hidden: a count in a dot, as Filters has (the words are its label and tooltip) */
.lcol-cols .lcol-cnt{min-width:16px;height:16px;border-radius:8px;padding:0 4px;box-sizing:border-box;background:var(--color-primary);color:var(--color-primary-ink);font-size:10px;line-height:16px;text-align:center}
.lcol-cols.on{border-color:var(--color-primary);background:var(--color-primary-soft)}.lcol-cols.on svg{stroke:var(--color-primary)}
/* a tablet's or phone's toolbar has no room for the word: a round icon, the count on its corner */
@media (max-width:980px){ .toolbar .btn.lcol-cols{position:relative;flex:none;width:36px;min-width:36px;height:36px;min-height:0;padding:0;justify-content:center;border-radius:50%} .lcol-cols .lcol-cbl{display:none}
  .lcol-cols .lcol-cnt{position:absolute;right:-4px;top:-4px;min-width:15px;height:15px;padding:0 3px;font-size:9px;line-height:15px} }
@media (max-width:760px){ .toolbar .btn.lcol-cols{width:30px;min-width:30px;height:30px} }
@media (max-width:560px){ .toolbar .btn.lcol-cols{width:28px;min-width:28px;height:28px} }
.menu .lcol-pop{width:272px;max-width:calc(100vw - 34px)}
.lcol-ph{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:6px 8px 8px;border-bottom:1px solid var(--color-border);font-size:var(--fs-sm)}
.lcol-ph span{font-size:11px;color:var(--color-text-secondary);white-space:nowrap}
.lcol-pl{padding:4px 0}
.lcol-pr{display:flex;align-items:center;gap:2px;border-radius:8px}
.lcol-pr:hover{background:var(--color-surface-hover)}
.lcol-pr label{flex:1;min-width:0;display:flex;align-items:center;gap:9px;padding:6px 8px;font-size:var(--fs-sm);font-weight:550;cursor:pointer}
.lcol-pr input{width:15px;height:15px;min-width:15px;margin:0;padding:0;accent-color:var(--color-primary)}
.lcol-pr input:disabled{cursor:not-allowed}
.lcol-pr.off label>span{color:var(--color-text-tertiary)}
.lcol-pr small{margin-left:auto;font-size:10.5px;color:var(--color-text-tertiary);white-space:nowrap}
.menu .lcol-pop button.lcol-mv{flex:none;width:28px;height:28px;padding:0;justify-content:center;color:var(--color-text-secondary)}
.menu .lcol-pop button.lcol-mv:disabled{opacity:.3;cursor:default;background:none}
.lcol-pf{display:flex;justify-content:space-between;gap:6px;padding:7px 2px 2px;border-top:1px solid var(--color-border)}
.menu .lcol-pf button{width:auto;border-radius:var(--pill)}
.lcol-pop :focus-visible,.lcol-hm :focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}
@media (pointer:coarse){ .lcol-pr label{min-height:38px} .menu .lcol-pop button.lcol-mv{width:36px;height:36px} }
</style>
