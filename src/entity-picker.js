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
function epOutside(e){ var el=document.getElementById("entityPicker"); if(EP.open&&EP.open.inline) return; if(el&&!el.contains(e.target)&&!(EP.open&&EP.open.anchor&&EP.open.anchor.contains&&EP.open.anchor.contains(e.target))) epClose(); }
/* ---------- indexes (§44.1 / §137) — minimal fields only ---------- */
function epTaskRank(tk,q,ctx){ var s=0, ql=q.toLowerCase(); if(ql&&tk.id.toLowerCase()===ql) s+=100; if(ctx&&ctx.projectId&&tk.proj===ctx.projectId) s+=40; if(isAssignee(tk,ME)||(tk.reviewers||[]).indexOf(ME)>=0||tk.reviewer===ME) s+=30; if((EP.recentTasks||[]).indexOf(tk.id)>=0) s+=20; if(ql&&tk.title.toLowerCase().indexOf(ql)===0) s+=10; if(!isClosed(tk)) s+=5; return s; }
function epTaskItems(q,ctx){ var ql=(q||"").toLowerCase(); var list=TASKS.filter(function(t){ return !t._draft&&(!ql||t.id.toLowerCase().indexOf(ql)>=0||t.title.toLowerCase().indexOf(ql)>=0||((project(t.proj)||{}).name||"").toLowerCase().indexOf(ql)>=0||assigneesOf(t).some(function(a){ return person(a).name.toLowerCase().indexOf(ql)>=0; })||(t.tags||[]).join(" ").toLowerCase().indexOf(ql)>=0); }); list.sort(function(a,b){ return epTaskRank(b,q||"",ctx)-epTaskRank(a,q||"",ctx); }); return list.slice(0,20); }
function epPersonItems(q,ctx){ var ql=(q||"").toLowerCase(), members=(ctx&&ctx.members)||null; var ids=Object.keys(PEOPLE).filter(function(id){ return id!==ME||(ctx&&ctx.includeMe); }); ids=ids.filter(function(id){ var p=person(id), teamText=(p.teams||[]).map(function(x){return teamName(Array.isArray(x)?x[0]:x);}).join(" ").toLowerCase(); return !ql||p.name.toLowerCase().indexOf(ql)>=0||(p.role||"").toLowerCase().indexOf(ql)>=0||teamText.indexOf(ql)>=0||id.indexOf(ql)>=0; }); ids.sort(function(a,b){ var ra=(members&&members.indexOf(a)>=0?50:0)+((EP.recentPeople||[]).indexOf(a)>=0?20:0), rb=(members&&members.indexOf(b)>=0?50:0)+((EP.recentPeople||[]).indexOf(b)>=0?20:0); return rb-ra||person(a).name.localeCompare(person(b).name); }); if(ctx&&ctx.everyone&&(!ql||"everyone".indexOf(ql)>=0)) ids.unshift("@everyone"); return ids.slice(0,20); }
function epProjectItems(q){ var ql=(q||"").toLowerCase(); return liveProjects().filter(function(p){ var teams=(p.teams||[]).map(teamName).join(" ").toLowerCase(); return !ql||p.name.toLowerCase().indexOf(ql)>=0||String(p.id||"").toLowerCase().indexOf(ql)>=0||teams.indexOf(ql)>=0; }).sort(function(a,b){ return (EP.recentProjects||[]).indexOf(a.id)-(EP.recentProjects||[]).indexOf(b.id)||a.name.localeCompare(b.name); }).slice(0,20); }
function epAssetItems(q){ var ql=(q||"").toLowerCase(); return ASSETS.filter(function(a){ return !ql||(a.name||"").toLowerCase().indexOf(ql)>=0||(a.tags||[]).join(" ").toLowerCase().indexOf(ql)>=0; }).slice(0,20); }
/* ---------- rows (§44.2 show enough context to avoid the wrong pick) ---------- */
function epRow(kind,item){
  if(kind==="task"){ var tk=item, pj=project(tk.proj); return '<span class="ep-id">'+esc(tk.id)+'</span><div class="ep-main"><b data-no-translate>'+esc(tk.title)+'</b><span>'+(pj?'<span data-no-translate>'+esc(pj.name)+'</span> · ':'')+esc(tr(stageName(tk.status)))+(tk.assignee?' · '+esc(first(tk.assignee)):'')+' · '+esc(dueTxt(tk.due))+'</span></div>'+(tk.assignee?av(tk.assignee):''); }
  if(kind==="person"){ if(item==="@everyone") return '<span class="av" style="background:var(--color-ink)">@</span><div class="ep-main"><b>@everyone</b><span>'+tr("Notify everyone in this conversation")+'</span></div>'; var p=person(item); return av(item)+'<div class="ep-main"><b data-no-translate>'+esc(p.name)+(typeof availabilityDot==="function"?availabilityDot(item):"")+'</b><span>'+esc(p.role||"")+(p.teams&&p.teams.length?' · '+esc(teamName(p.teams[0][0])):'')+'</span></div>'; }
  if(kind==="project"){ return '<span class="sq">'+I.projects+'</span><div class="ep-main"><b data-no-translate>'+esc(item.name)+'</b><span>'+esc(tr(item.status||""))+'</span></div>'; }
  if(kind==="asset"){ return '<span class="sq">'+I.assets+'</span><div class="ep-main"><b data-no-translate>'+esc(item.name)+'</b><span>'+esc(item.type||"")+(item.size?' · '+esc(item.size):'')+'</span></div>'; }
  if(kind==="conversation"){ return (item.type==="DM"?av(item.peer):'<span class="sq">'+I.team+'</span>')+'<div class="ep-main"><b data-no-translate>'+esc(item.title)+'</b><span>'+esc(item.subtitle||"")+'</span></div>'; }
  return '<div class="ep-main"><b>'+esc(String(item))+'</b></div>';
}
function epKey(kind,item){ return kind==="person"?item:kind==="task"?item.id:(item.id||String(item)); }
/* ---------- the picker ---------- */
/* opts: {kind, anchor, title, placeholder, context, multi, selected, onSelect(item), onClose, inline:elementToRenderInto, search(q)->items (override)} */
function entityPicker(opts){
  /* A picker opened from a click must outlive the document-level closePops()
     that runs when that same click bubbles, so anchored pickers are created
     on the next tick; inline pickers (inside a modal) can render at once. */
  if(!opts.inline&&!opts._deferred){ opts._deferred=true; setTimeout(function(){ entityPicker(opts); },0); return null; }
  /* pressing the same button again closes the picker instead of re-opening it */
  if(EP.open&&!opts.inline&&EP.open.anchor===opts.anchor&&EP.open.kind===opts.kind){ epClose(); return null; }
  epClose(); EP.open=opts; var kind=opts.kind, host;
  var el=document.createElement("div"); el.id="entityPicker"; el.className="menu ep open"+(opts.inline?" ep-inline":""); el.setAttribute("role","listbox"); if(opts.align) el.setAttribute("data-align",opts.align);
  el.innerHTML='<div class="ep-head"><input class="ep-search" placeholder="'+attr(opts.placeholder||tr("Search…"))+'" aria-label="'+attr(opts.title||tr("Search"))+'"></div><div class="ep-list"></div>';
  if(opts.inline){ opts.inline.innerHTML=""; opts.inline.appendChild(el); } else { document.body.appendChild(el); place(el,opts.anchor); }
  var input=el.querySelector(".ep-search"), list=el.querySelector(".ep-list"), sel=0, items=[];
  var sections=function(q){ var fn=opts.search||{task:function(q){ return epTaskItems(q,opts.context); },person:function(q){ return epPersonItems(q,opts.context); },project:epProjectItems,asset:epAssetItems,conversation:function(q){ return (opts.items||[]).filter(function(c){ return !q||c.title.toLowerCase().indexOf(q.toLowerCase())>=0; }); }}[kind]; var all=fn(q)||[]; if(kind==="task"&&!q){ var mine=all.filter(function(t){ return isAssignee(t,ME); }), rest=all.filter(function(t){ return !isAssignee(t,ME); }); return [{title:tr("Suggested"),items:rest.slice(0,4)},{title:tr("Assigned to me"),items:mine.slice(0,6)},{title:tr("More"),items:rest.slice(4,12)}].filter(function(s){ return s.items.length; }); } if(kind==="person"&&!q&&opts.context&&opts.context.members){ var inC=all.filter(function(id){ return opts.context.members.indexOf(id)>=0||id==="@everyone"; }), out=all.filter(function(id){ return opts.context.members.indexOf(id)<0&&id!=="@everyone"; }); return [{title:tr("In this conversation"),items:inC},{title:tr("Workspace"),items:out}].filter(function(s){ return s.items.length; }); } if(kind==="project"&&!q){ var recent=(EP.recentProjects||[]).map(function(id){return byId(all,id);}).filter(Boolean), rest=all.filter(function(p){return recent.indexOf(p)<0;}); return [{title:tr("Recent"),items:recent},{title:tr("Active projects"),items:rest}].filter(function(s){return s.items.length;}); } return [{title:"",items:all}]; };
  var render=function(){ var q=input.value.trim(), secs=sections(q); items=[]; var h=""; secs.forEach(function(s){ if(s.title) h+='<div class="mh">'+esc(s.title)+'</div>'; s.items.forEach(function(it){ var i=items.length; items.push(it); var chosen=opts.selected&&opts.selected.indexOf(epKey(kind,it))>=0; h+='<button type="button" role="option" class="ep-row'+(i===sel?" on":"")+(chosen?" chosen":"")+'" data-i="'+i+'" aria-selected="'+(i===sel?"true":"false")+'">'+epRow(kind,it)+(chosen?'<span class="ep-check">'+I.check+'</span>':'')+'</button>'; }); }); if(!items.length) h='<div class="ep-empty">'+tr(q?"No results":"Nothing to show")+'</div>'; list.innerHTML=h; localizeVisibleText(list); var on=list.querySelector(".ep-row.on"); if(on) on.scrollIntoView({block:"nearest"}); };
  var choose=function(i){ var it=items[i]; if(it===undefined) return; if(kind==="task"){ EP.recentTasks=[it.id].concat((EP.recentTasks||[]).filter(function(x){ return x!==it.id; })).slice(0,10); } if(kind==="person"&&it!=="@everyone"){ EP.recentPeople=[it].concat((EP.recentPeople||[]).filter(function(x){ return x!==it; })).slice(0,10); } if(kind==="project"){ EP.recentProjects=[it.id].concat((EP.recentProjects||[]).filter(function(x){return x!==it.id;})).slice(0,8); } var keep=opts.onSelect(it,input.value); if(!opts.multi&&keep!==true) epClose(); else { render(); input.focus(); } };
  input.addEventListener("input",function(){ sel=0; render(); if(opts.onInput) opts.onInput(input.value); });
  input.addEventListener("keydown",function(e){ if(e.key==="ArrowDown"){ e.preventDefault(); sel=Math.min(items.length-1,sel+1); render(); } else if(e.key==="ArrowUp"){ e.preventDefault(); sel=Math.max(0,sel-1); render(); } else if(e.key==="Enter"||e.key==="Tab"){ if(items.length){ e.preventDefault(); choose(sel); } } else if(e.key==="Escape"){ e.preventDefault(); epClose(); } });
  list.addEventListener("click",function(e){ var b=e.target.closest(".ep-row"); if(b) choose(+b.getAttribute("data-i")); });
  list.addEventListener("mousemove",function(e){ var b=e.target.closest(".ep-row"); if(b&&+b.getAttribute("data-i")!==sel){ sel=+b.getAttribute("data-i"); list.querySelectorAll(".ep-row").forEach(function(x,i){ x.classList.toggle("on",i===sel); }); } });
  if(opts.initial){ input.value=opts.initial; }
  /* re-place after every render: the list height decides whether the picker sits below or above the anchor (§43.2 — never clipped by the viewport) */
  var reposition=function(){ if(!opts.inline&&opts.anchor&&document.body.contains(el)) place(el,opts.anchor); };
  var render0=render; render=function(){ render0(); reposition(); };
  render(); setTimeout(function(){ input.focus(); document.addEventListener("mousedown",epOutside,true); },10);
  el._epResize=reposition; window.addEventListener("resize",reposition);
  /* the picker exposes a tiny API so a caret-anchored mention popover can feed it the text typed in the composer */
  el._ep={setQuery:function(q){ input.value=q; sel=0; render(); },move:function(d){ sel=Math.max(0,Math.min(items.length-1,sel+d)); render(); },choose:function(){ choose(sel); },count:function(){ return items.length; }};
  return el;
}
Object.assign(UI_ID,{"Search…":"Cari…","Search":"Cari","Suggested":"Disarankan","Assigned to me":"Ditugaskan ke saya","More":"Lainnya","Recent":"Terbaru","Active projects":"Project aktif","In this conversation":"Di percakapan ini","Workspace":"Workspace","No results":"Tidak ada hasil","Nothing to show":"Tidak ada yang ditampilkan","Notify everyone in this conversation":"Beri tahu semua orang di percakapan ini"});
</script>
