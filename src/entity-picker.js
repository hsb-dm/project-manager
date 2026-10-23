<script>
/* ============================================================
   v18 §138 UNIFIED ENTITY PICKER
   One anchored, searchable, keyboard-driven picker for People, Tasks,
   Projects, Assets and Conversations. AI Hub (Use Task as brief), the
   Messages composer (@mention, Attach task/project/asset) and New
   conversation all use this — there is no second dropdown implementation.
   ============================================================ */
var EP={open:null};
function epClose(){ var el=document.getElementById("entityPicker"); if(el){ if(el._epResize) window.removeEventListener("resize",el._epResize); el.remove(); } if(EP.open&&EP.open.onClose) EP.open.onClose(); EP.open=null; document.removeEventListener("mousedown",epOutside,true); }
/* inline pickers (inside a modal) stay until the modal closes: removing them on mousedown shifts the layout under the pointer, so the following click lands on the modal backdrop and closes it */
function epOutside(e){ var el=document.getElementById("entityPicker"); if(EP.open&&EP.open.inline) return; if(EP.open&&EP.open.anchor&&EP.open.anchor.isConnected===false){ var nx=epReanchor(EP.open); if(nx) EP.open.anchor=nx; } if(el&&!el.contains(e.target)&&!(EP.open&&EP.open.anchor&&EP.open.anchor.contains&&EP.open.anchor.contains(e.target))) epClose(); }
/* ---------- indexes (§44.1 / §137) — minimal fields only ---------- */
function epTaskRank(tk,q,ctx){ var s=0, ql=q.toLowerCase(); if(ql&&tk.id.toLowerCase()===ql) s+=100; if(ctx&&ctx.projectId&&inProject(tk,ctx.projectId)) s+=40; if(isAssignee(tk,ME)||(tk.reviewers||[]).indexOf(ME)>=0||tk.reviewer===ME) s+=30; if((EP.recentTasks||[]).indexOf(tk.id)>=0) s+=20; if(ql&&tk.title.toLowerCase().indexOf(ql)===0) s+=10; if(!isClosed(tk)) s+=5; return s; }
function epTaskItems(q,ctx){ var ql=(q||"").toLowerCase(); var list=TASKS.filter(function(t){ return !t._draft&&(!ql||t.id.toLowerCase().indexOf(ql)>=0||t.title.toLowerCase().indexOf(ql)>=0||((project(t.proj)||{}).name||"").toLowerCase().indexOf(ql)>=0||assigneesOf(t).some(function(a){ return person(a).name.toLowerCase().indexOf(ql)>=0; })||(t.tags||[]).join(" ").toLowerCase().indexOf(ql)>=0); }); list.sort(function(a,b){ return epTaskRank(b,q||"",ctx)-epTaskRank(a,q||"",ctx); }); return list.slice(0,20); }
function epPersonItems(q,ctx){ var ql=(q||"").toLowerCase(), members=(ctx&&ctx.members)||null; var ids=Object.keys(PEOPLE).filter(function(id){ return id!==ME||(ctx&&ctx.includeMe); }); ids=ids.filter(function(id){ var p=person(id), teamText=(p.teams||[]).map(function(x){return teamName(Array.isArray(x)?x[0]:x);}).join(" ").toLowerCase(); return !ql||p.name.toLowerCase().indexOf(ql)>=0||(p.role||"").toLowerCase().indexOf(ql)>=0||teamText.indexOf(ql)>=0||id.indexOf(ql)>=0; }); ids.sort(function(a,b){ var ra=(members&&members.indexOf(a)>=0?50:0)+((EP.recentPeople||[]).indexOf(a)>=0?20:0), rb=(members&&members.indexOf(b)>=0?50:0)+((EP.recentPeople||[]).indexOf(b)>=0?20:0); return rb-ra||person(a).name.localeCompare(person(b).name); }); if(ctx&&ctx.everyone&&(!ql||"everyone".indexOf(ql)>=0)) ids.unshift("@everyone"); return ids.slice(0,20); }
function epProjectMatch(p,ql){ var teams=(p.teams||[]).map(teamName).join(" ").toLowerCase(); return !ql||p.name.toLowerCase().indexOf(ql)>=0||String(p.id||"").toLowerCase().indexOf(ql)>=0||teams.indexOf(ql)>=0; }
/* the recent first, most recent on top (a project not used lately ranks after all of them, so with more than 20 the
   recent are never the ones cut off), then by name; skip: ids already listed above (the chosen, under "Selected");
   keep: ids never cut off by the 20 (one ticked or unticked while the picker is open stays in sight, in its place) */
function epProjectItems(q,recentIds,skip,keep){ var ql=(q||"").toLowerCase(), rec=recentIds||EP.recentProjects||[], rank=function(p){ var i=rec.indexOf(p.id); return i<0?rec.length:i; }; return liveProjects().filter(function(p){ return (!skip||skip.indexOf(p.id)<0)&&epProjectMatch(p,ql); }).sort(function(a,b){ return rank(a)-rank(b)||a.name.localeCompare(b.name); }).filter(function(p,i){ return i<20||(!!keep&&keep.indexOf(p.id)>=0); }); }
function epAssetItems(q){ var ql=(q||"").toLowerCase(); return ASSETS.filter(function(a){ return !ql||(a.name||"").toLowerCase().indexOf(ql)>=0||(a.tags||[]).join(" ").toLowerCase().indexOf(ql)>=0; }).slice(0,20); }
/* ---------- rows (§44.2 show enough context to avoid the wrong pick) ---------- */
function epRow(kind,item){
  if(kind==="task"){ var tk=item, pj=project(tk.proj); return '<span class="ep-id">'+esc(tk.id)+'</span><div class="ep-main"><b data-no-translate>'+esc(tk.title)+'</b><span>'+(pj?'<span data-no-translate>'+esc(pj.name)+'</span> · ':'')+esc(tr(stageName(tk.status)))+(tk.assignee?' · '+esc(first(tk.assignee)):'')+' · '+esc(dueTxt(tk.due))+'</span></div>'+(tk.assignee?av(tk.assignee):''); }
  if(kind==="person"){ if(item==="@everyone") return '<span class="av" style="background:var(--color-ink)">@</span><div class="ep-main"><b>@everyone</b><span>'+tr("Notify everyone in this conversation")+'</span></div>'; var p=person(item); return av(item)+'<div class="ep-main"><b data-no-translate>'+esc(p.name)+(typeof availabilityDot==="function"?availabilityDot(item):"")+'</b><span>'+esc(p.role||"")+(p.teams&&p.teams.length?' · '+esc(teamName(p.teams[0][0])):'')+'</span></div>'; }
  if(kind==="project"&&item&&item._none){ return '<span class="sq ep-none">—</span><div class="ep-main"><b>'+esc(item.name)+'</b><span>'+esc(tr("Not in any project for now"))+'</span></div>'; }
  if(kind==="project"){ return '<span class="sq">'+I.projects+'</span><div class="ep-main"><b data-no-translate>'+esc(item.name)+'</b><span>'+esc(tr(item.status||""))+'</span></div>'; }
  if(kind==="asset"){ return '<span class="sq">'+I.assets+'</span><div class="ep-main"><b data-no-translate>'+esc(item.name)+'</b><span>'+esc(item.type||"")+(item.size?' · '+esc(item.size):'')+'</span></div>'; }
  if(kind==="conversation"){ return (item.type==="DM"?av(item.peer):'<span class="sq">'+I.team+'</span>')+'<div class="ep-main"><b data-no-translate>'+esc(item.title)+'</b><span>'+esc(item.subtitle||"")+'</span></div>'; }
  return '<div class="ep-main"><b>'+esc(String(item))+'</b></div>';
}
function epKey(kind,item){ return kind==="person"?item:kind==="task"?item.id:(item.id||String(item)); }
/* ---------- the picker ---------- */
/* opts: {kind, anchor, title, placeholder, context, multi, selected, pinSelected, onSelect(item), onClose, inline:elementToRenderInto, search(q)->items (override)} */
function entityPicker(opts){
  /* A picker opened from a click must outlive the document-level closePops()
     that runs when that same click bubbles, so anchored pickers are created
     on the next tick; inline pickers (inside a modal) can render at once. */
  if(!opts.inline&&!opts._deferred){ opts._deferred=true; setTimeout(function(){ entityPicker(opts); },0); return null; }
  /* pressing the same button again closes the picker instead of re-opening it */
  if(EP.open&&!opts.inline&&EP.open.kind===opts.kind&&(EP.open.anchor===opts.anchor||(EP.open.anchor&&EP.open.anchor.isConnected===false&&EP.open._anchorSig&&opts.anchor&&opts.anchor.getAttribute&&opts.anchor.getAttribute("onclick")===EP.open._anchorSig))){ epClose(); return null; }
  epClose(); EP.open=opts; var kind=opts.kind, host;
  /* While a picker stays open (choosing several) the list keeps its order — a choice made does not jump
     into Recent at the top under the pointer — and the button it opened from may be redrawn by the
     choice: its successor is found by its handler, so the picker stays beside it. */
  if(!opts._recentProjects) opts._recentProjects=(EP.recentProjects||[]).slice();
  /* opts.pinSelected (a task's projects): what is chosen leads the list under "Selected (N)", in the order it was
     chosen (the main one first, a new one last), and is left out of the sections below, so nothing is listed twice.
     A tick moves its row up there at once and an untick moves it back to its place below, Recent or Active
     projects as when the picker opened ("langsung auto keatas", Oct 2026); epSettle makes the move easy to follow. */
  var pinTake=function(){ opts._pinned=opts.pinSelected?(opts.selected||[]).filter(function(k){ return k!==""&&k!=null; }):[]; };
  pinTake();
  if(opts.anchor&&opts.anchor.getAttribute&&opts._anchorSig==null) opts._anchorSig=opts.anchor.getAttribute("onclick")||"";
  var el=document.createElement("div"); el.id="entityPicker"; el.className="menu ep open"+(opts.inline?" ep-inline":"")+(opts.pinSelected?" ep-pin":""); el.setAttribute("role","listbox"); if(opts.align) el.setAttribute("data-align",opts.align);
  el.innerHTML='<div class="ep-head"><input class="ep-search" placeholder="'+attr(opts.placeholder||tr("Search…"))+'" aria-label="'+attr(opts.title||tr("Search"))+'"></div><div class="ep-list"></div>';
  if(opts.inline){ opts.inline.innerHTML=""; opts.inline.appendChild(el); } else { document.body.appendChild(el); place(el,opts.anchor); }
  var input=el.querySelector(".ep-search"), list=el.querySelector(".ep-list"), sel=0, items=[];
  var sections=function(q){ var fn=opts.search||{task:function(q){ return epTaskItems(q,opts.context); },person:function(q){ return epPersonItems(q,opts.context); },project:function(q){ return epProjectItems(q,opts.multi?opts._recentProjects:null,opts._pinned,opts._moved); },asset:epAssetItems,conversation:function(q){ return (opts.items||[]).filter(function(c){ return !q||c.title.toLowerCase().indexOf(q.toLowerCase())>=0; }); }}[kind]; var all=fn(q)||[]; if(kind==="task"&&!q){ var mine=all.filter(function(t){ return isAssignee(t,ME); }), rest=all.filter(function(t){ return !isAssignee(t,ME); }); return [{title:tr("Suggested"),items:rest.slice(0,4)},{title:tr("Assigned to me"),items:mine.slice(0,6)},{title:tr("More"),items:rest.slice(4,12)}].filter(function(s){ return s.items.length; }); } if(kind==="person"&&!q&&opts.context&&opts.context.members){ var inC=all.filter(function(id){ return opts.context.members.indexOf(id)>=0||id==="@everyone"; }), out=all.filter(function(id){ return opts.context.members.indexOf(id)<0&&id!=="@everyone"; }); return [{title:tr(opts.context.membersTitle||"In this conversation"),items:inC},{title:tr("Workspace"),items:out}].filter(function(s){ return s.items.length; }); } if(kind==="project"&&!q){ var recent=(opts.multi?opts._recentProjects:(EP.recentProjects||[])).map(function(id){return byId(all,id);}).filter(Boolean), rest=all.filter(function(p){return recent.indexOf(p)<0;}); return [{title:tr("Recent"),items:recent},{title:tr("Active projects"),items:rest}].filter(function(s){return s.items.length;}); } return [{title:"",items:all}]; };
  /* the chosen that match the search, on top; with no search the heading counts what is chosen now */
  var pinSec=function(q){ var ql=q.toLowerCase(), its=(opts._pinned||[]).map(function(id){ return kind==="project"?project(id):null; }).filter(function(p){ return p&&epProjectMatch(p,ql); }); if(!its.length) return null; var n=(opts.selected||[]).filter(function(k){ return k!==""&&k!=null; }).length; return {title:q?tr("Selected"):tr("Selected")+" ("+n+")",cls:"ep-sel-h",pin:true,items:its}; };
  /* every heading, line and row carries a key (data-k), so a choice that moves rows can find each one again */
  var rk=function(it){ return it&&it._none?"none":String(epKey(kind,it)); };
  /* follow: the key of the row the highlight goes with (the one a choice just moved); still: the caller sets the scroll */
  var render=function(follow,still){ var q=input.value.trim(), secs=sections(q); if(opts.lead){ var ld=opts.lead(q)||[]; if(ld.length) secs=[{title:"",items:ld}].concat(secs); } var pin=pinSec(q); if(pin) secs=[pin].concat(secs); secs=secs.filter(function(s){ return s.items.length; }); items=[]; secs.forEach(function(s){ items.push.apply(items,s.items); }); if(follow!=null){ var fi=items.map(rk).indexOf(follow); if(fi>=0) sel=fi; } var h="", i=0; secs.forEach(function(s,si){ if(s.title) h+='<div class="mh'+(s.cls?" "+s.cls:"")+'" data-k="'+attr("h:"+(s.pin?"pin":s.title))+'">'+esc(s.title)+'</div>'; else if(si&&secs[si-1].pin) h+='<div class="ep-sep" data-k="sep" aria-hidden="true" style="height:1px;margin:6px 8px;background:var(--color-border)"></div>'; s.items.forEach(function(it){ var chosen=opts.selected&&opts.selected.indexOf(epKey(kind,it))>=0; h+='<button type="button" role="option" class="ep-row'+(i===sel?" on":"")+(chosen?" chosen":"")+'" data-i="'+i+'" data-k="'+attr(rk(it))+'" aria-selected="'+(i===sel?"true":"false")+'">'+epRow(kind,it)+(chosen?'<span class="ep-check">'+I.check+'</span>':'')+'</button>'; i++; }); }); if(!items.length) h='<div class="ep-empty">'+tr(q?"No results":"Nothing to show")+'</div>'; list.innerHTML=h; localizeVisibleText(list); if(still) return; var on=list.querySelector(".ep-row.on"); if(on) on.scrollIntoView({block:"nearest"}); };
  /* how: "pointer" (a click or a tap) or "key" (Enter, Tab, a caret popover): where the list scrolls after a move (epSettle) */
  var choose=function(i,how){ var it=items[i]; if(it===undefined) return; if(kind==="task"){ EP.recentTasks=[it.id].concat((EP.recentTasks||[]).filter(function(x){ return x!==it.id; })).slice(0,10); } if(kind==="person"&&it!=="@everyone"){ EP.recentPeople=[it].concat((EP.recentPeople||[]).filter(function(x){ return x!==it; })).slice(0,10); } if(kind==="project"){ EP.recentProjects=[it.id].concat((EP.recentProjects||[]).filter(function(x){return x!==it.id;})).slice(0,8); }
    /* a task's projects: where everything is before the choice, and whether this one was among the chosen on top */
    var pk=opts.pinSelected?rk(it):null, was=pk!=null&&opts._pinned.indexOf(pk)>=0, snap=pk!=null?epSnap(list):null; if(pk!=null) opts._moved=(opts._moved||[]).concat(pk);
    var keep=opts.onSelect(it,input.value); /* several can be chosen; a choice that ends it says so (false) — "Select project later" */ if(opts.multi?keep===false:keep!==true) epClose(); else if(EP.open===opts&&document.body.contains(el)){ /* chosen: the picker holds still (its field's label may have grown) */ var top=list.scrollTop; opts._hold=true; if(pk!=null) pinTake(); try{ render(pk,pk!=null); } finally { opts._hold=false; } list.scrollTop=top; if(pk!=null){ var moved=was!==(opts._pinned.indexOf(pk)>=0); epSettle(list,snap,pk,how==="pointer"&&opts._seenMove?"hold":"follow",moved); if(moved) opts._seenMove=true; } input.focus({preventScroll:true}); } };
  input.addEventListener("input",function(){ sel=0; pinTake(); render(); if(opts.onInput) opts.onInput(input.value); });
  /* Esc closes the picker and nothing else, the focus back on the field it opened from (drawn again since: the one
     with the same handler); an inline picker is part of its dialog, which the same Esc closes (src/core.js) */
  var escClose=function(){ var a=opts.anchor; epClose(); if(a&&a.nodeType&&!a.isConnected) a=epReanchor(opts); escFocusBack(a&&a.nodeType?a:null,el); };
  if(!opts.inline) el._escClose=escClose;
  input.addEventListener("keydown",function(e){ if(e.key==="ArrowDown"){ e.preventDefault(); sel=Math.min(items.length-1,sel+1); render(); } else if(e.key==="ArrowUp"){ e.preventDefault(); sel=Math.max(0,sel-1); render(); } else if(e.key==="Enter"||e.key==="Tab"){ if(items.length){ e.preventDefault(); choose(sel,"key"); } } else if(e.key==="Escape"){ if(opts.inline){ epClose(); return; } e.preventDefault(); escClose(); } });
  list.addEventListener("click",function(e){ var b=e.target.closest(".ep-row"); if(b) choose(+b.getAttribute("data-i"),"pointer"); });
  list.addEventListener("mousemove",function(e){ var b=e.target.closest(".ep-row"); if(b&&+b.getAttribute("data-i")!==sel){ sel=+b.getAttribute("data-i"); list.querySelectorAll(".ep-row").forEach(function(x,i){ x.classList.toggle("on",i===sel); }); } });
  if(opts.initial){ input.value=opts.initial; }
  /* re-place after every render: the list height decides whether the picker sits below or above the anchor (§43.2 — never clipped by the viewport) */
  /* only an element can drop out of the page; an anchor worked out from a caret (chat, comments) is never "gone" */
  var reposition=function(){ if(opts.inline||!opts.anchor||!document.body.contains(el)) return; if(opts.anchor.nodeType&&!opts.anchor.isConnected){ var nx=epReanchor(opts); if(!nx) return; opts.anchor=nx; } if(opts._hold) return; place(el,opts.anchor); };
  var render0=render; render=function(follow,still){ render0(follow,still); reposition(); };
  render(); setTimeout(function(){ input.focus(); document.addEventListener("mousedown",epOutside,true); },10);
  el._epResize=reposition; window.addEventListener("resize",reposition);
  /* the picker exposes a tiny API so a caret-anchored mention popover can feed it the text typed in the composer */
  el._ep={setQuery:function(q){ input.value=q; sel=0; pinTake(); render(); },move:function(d){ sel=Math.max(0,Math.min(items.length-1,sel+d)); render(); },choose:function(){ choose(sel); },count:function(){ return items.length; }};
  return el;
}
/* the button a picker was opened from, drawn again: the one with the same handler (none: stay put) */
function epReanchor(o){ if(!o._anchorSig) return null; var all=document.querySelectorAll("[onclick]"); for(var i=0;i<all.length;i++){ if(all[i].getAttribute("onclick")===o._anchorSig&&!all[i].closest("#entityPicker")) return all[i]; } return null; }
/* ---------- a choice that moves its row (pinSelected: a task's projects) ----------
   The list is drawn again with the row in its new place, and the eye can follow it: every heading, line and row
   glides from where it was on the screen to where it is now (FLIP, 200 ms), a heading or line that goes fades out
   where it was, one that comes fades in, the list's own height follows when it changes, and the moved row is lit
   for a moment. With reduced motion it is only the move, and the row keeps a quiet ring until the next redraw.
   Where the list scrolls when the row's new place is out of view (in view, nothing scrolls: it is seen getting there):
   - "follow": the list glides to it, with its section's heading when both fit ("Selected (3)" and the row that
     just arrived). That is every move made with the keyboard, whose highlight goes with the row as it goes with
     the arrow keys, and the first move of a click or a tap in an opening of the picker, so it is clear where a
     chosen project goes;
   - "hold", the later clicks and taps: the person is choosing several, and where they clicked is their place. The
     rows above it hold still and the ones below close the gap (the next project slides under the pointer), and the
     list shows the moved row only if the rows on either side of that place stay in view too; farther than that the
     place wins, and the row is seen leaving toward its section. */
function epSnap(list){ var lr=list.getBoundingClientRect(), m={}, order=[]; list.querySelectorAll("[data-k]").forEach(function(n){ var r=n.getBoundingClientRect(), k=n.getAttribute("data-k"); m[k]={y:r.top-lr.top,h:r.height,x:r.left-lr.left,w:r.width,n:n}; order.push(k); }); return {st:list.scrollTop,h:lr.height,m:m,order:order}; }
/* b: epSnap from before the choice (where things are on the screen, mid-glide included, so a quick second choice
   goes on from there); key: the chosen row; how: "follow" or "hold"; moved: it went into or out of "Selected" */
function epSettle(list,b,key,how,moved){
  if(list._epH){ try{ list._epH.cancel(); }catch(_){} list._epH=null; }
  var lr=list.getBoundingClientRect(), st=list.scrollTop, H=list.clientHeight, a={}, order=[];
  list.querySelectorAll("[data-k]").forEach(function(n){ var r=n.getBoundingClientRect(), k=n.getAttribute("data-k"); a[k]={top:r.top-lr.top+st,h:r.height,n:n}; order.push(k); });
  var s=b.st, m=moved?a[key]:null;
  if(m&&(m.top<s-1||m.top+m.h>s+H+1)){
    var top=m.top, bot=m.top+m.h, pv, hk;
    for(pv=m.n.previousElementSibling;pv&&!pv.classList.contains("ep-sep");pv=pv.previousElementSibling){ if(pv.classList.contains("mh")){ hk=pv.getAttribute("data-k"); if(a[hk]&&bot-a[hk].top<=H) top=a[hk].top; break; } }
    if(how==="follow") s=m.top<s?top:bot-H;
    else { var want=m.top<s?m.top:bot-H, i=b.order.indexOf(key), pk=null, nk=null, j;
      for(j=i-1;j>=0&&!pk;j--) if(a[b.order[j]]) pk=b.order[j];
      for(j=i+1;j<b.order.length&&!nk;j++) if(a[b.order[j]]) nk=b.order[j];
      var ak=pk||nk, hold=ak?s+a[ak].top-(b.m[ak].y+b.st):s;
      var keeps=[pk,nk].filter(Boolean).every(function(k){ return a[k].top>=want-1&&a[k].top+a[k].h<=want+H+1; });
      s=keeps?want:hold; } }
  s=Math.max(0,Math.min(s,list.scrollHeight-H)); list.scrollTop=s; s=list.scrollTop;
  var mv=m&&m.n; if(mv){ mv.classList.add("ep-moved"); mv.addEventListener("animationend",function(e){ if(e.animationName==="ep-moved") mv.classList.remove("ep-moved"); }); }
  if((window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)||typeof list.animate!=="function") return;
  var D=200, E="cubic-bezier(.2,.8,.2,1)";
  order.forEach(function(k){ var n=a[k].n, o=b.m[k]; if(!o){ n.animate([{opacity:0},{opacity:1}],{duration:D,easing:"ease-out"}); return; } var dy=o.y-(a[k].top-s); if(Math.abs(dy)>=1) n.animate([{transform:"translateY("+dy+"px)"},{transform:"none"}],{duration:D,easing:E}); });
  b.order.forEach(function(k){ var o=b.m[k]; if(a[k]||!o.n.matches(".mh,.ep-sep")) return; var g=o.n.cloneNode(true); g.removeAttribute("data-k"); g.classList.remove("ep-sel-h"); g.classList.add("ep-ghost"); g.setAttribute("aria-hidden","true"); g.style.cssText+=";position:absolute;margin:0;pointer-events:none;top:"+(o.y+s)+"px;left:"+o.x+"px;width:"+o.w+"px"; list.appendChild(g); var f=g.animate([{opacity:1},{opacity:0}],{duration:180,easing:"ease-out",fill:"forwards"}); f.onfinish=function(){ g.remove(); }; });
  if(Math.abs(lr.height-b.h)>=1){ var ov=list.style.overflowY; list.style.overflowY="hidden"; var ha=list._epH=list.animate([{height:b.h+"px"},{height:lr.height+"px"}],{duration:D,easing:E}); ha.onfinish=ha.oncancel=function(){ list.style.overflowY=ov; if(list._epH===ha) list._epH=null; }; }
}
Object.assign(UI_ID,{"active":"aktif","risk":"berisiko","done":"selesai","archived":"diarsipkan","Search…":"Cari…","Search":"Cari","Selected":"Dipilih","Suggested":"Disarankan","Assigned to me":"Ditugaskan ke saya","More":"Lainnya","Recent":"Terbaru","Active projects":"Project aktif","In this conversation":"Di percakapan ini","Workspace":"Workspace","No results":"Tidak ada hasil","Nothing to show":"Tidak ada yang ditampilkan","Notify everyone in this conversation":"Beri tahu semua orang di percakapan ini"});
</script>
<style>
/* a task's project picker (epSettle): what a heading or line that goes fades from sits in the list; the moved row
   passes over the others, lit (tinted, with a ring) for a moment; with reduced motion only a quiet ring */
.ep-pin .ep-list{position:relative}
.ep-pin .ep-row.ep-moved{position:relative;z-index:1;animation:ep-moved .9s cubic-bezier(.3,0,.3,1)}
@keyframes ep-moved{0%,30%{background-color:color-mix(in srgb,var(--color-primary) 20%,var(--color-surface));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--color-primary) 60%,transparent)}}
@media (prefers-reduced-motion:reduce){.ep-pin .ep-row.ep-moved{animation:none;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--color-primary) 60%,transparent)}}
</style>
