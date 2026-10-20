<script>
/* ============================================================
   KINDS OF WORK, THE WORKSPACE'S OWN (Oct 2026): a task's kind chosen by hand (kindPickHtml, meta.kind) and the
   Settings section (scoringKindsSettingsHtml, through the tab's draft).
   ============================================================ */
var SK={test:"",find:"",open:{}}, SK_FIELD={name:"Name",nameId:"Name in Indonesian",keywords:"Words in the title",active:"On"};
var SK_INTRO="Read from whole words of the title, top of the list first (\"copy\" is not \"copywriter\"; video* also finds videografi). A kind chosen on a task wins. Also used by the estimate on Create, even with Smart Scoring off.";
var SK_EG="add Podcast with the words podcast, siniar — a task titled “Siniar eps 4” is then estimated with Podcast's hours.";
var SK_LINE="The kinds of work a task can be, each with the words its titles use, its hours and its points per asset.";
function skName(k){ return k?(UI_LANG==="id"?k.nameId:k.name)||k.name||"":""; }

/* ---------- on the task ---------- */
function kindPickHtml(tk,ed){ if(!tk||tk._draft) return "";
  var list=estKindList(), id=tk.id;
  return '<span class="scr-kpick" data-scr-in="kind"><span class="scr-kpick-l">'+tr("Kind of work")+'</span>'+kindDropdownHtml({key:"task:"+id,value:ScoringEngine.kindPick(tk,list)||"",hasAuto:true,auto:ScoringEngine.kindOf(tk.title,list),ro:!ed,pick:function(v){ kindPick(id,v); }})+'</span>'; }
function kindPick(id,v){ var t=task(id); if(!t||!canI.editTask(t)) return;
  editTaskWith(t,function(x){ var m=taskMeta(x), e; if(v) m.kind=v; else delete m.kind;
    if(!m.effortManual&&(m.effortAuto||!(+x.effort>0))&&!isClosed(x)&&!scoringEstimateLock(x)&&(e=effortEstimate(x))) effortApply(x,e); }); }

/* ---------- the kind of work, a dropdown of the app's own (Oct 2026) ----------
   kindDropdownHtml(o) draws the trigger, a chip like the fields beside it: the kind chosen, in the person's language; on
   Auto a small "auto" mark and the kind the title gives; read-only the same chip, still, without the chevron.
   o: {key, value, pick(v), hasAuto, auto (the title's kind), placeholder, label, ro, id, field (a form field's size),
   kinds (the ids to offer; else the workspace's active kinds)}.
   One popover for the page (#scrKdd, in <body>): Auto first, with what the title gives, then each kind in detection order
   with its usual hours for one deliverable, a ✓ on the chosen one, "custom" on the workspace's own; over 8 kinds a box to
   find one (focused on a computer, not on a phone). Below the trigger or above, kept in the window, at most 320 px tall.
   The keys of a listbox: ↑ ↓ Home End Enter, Esc back to the trigger, Tab on, letters jump when there is no box. Opening
   and closing draw nothing else; a redraw of what holds the trigger keeps it open beside the new one (the same key, the
   same place among them), and closes it when there is none. */
var KDD={cfg:{},open:null,buf:"",bufT:0,quiet:0};
var KDD_FIND='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
function kddName(id){ var k=estKindList().filter(function(x){ return x.id===id; })[0]; return k?skName(k)||k.id:id; }
function kddKinds(o){ var all=estKindList(), by={}; all.forEach(function(k){ by[k.id]=k; });
  return o.kinds?o.kinds.map(function(id){ return by[id]||{id:id,name:id}; }):all.filter(function(k){ return k.active!==false; }); }
/* the hours one deliverable of a kind usually takes, from the workspace's estimating templates ("4–16 h"); none known: "" */
function kddHours(id){ var s=estSettings(), all=s&&s.hours&&s.hours.templates||ScoringEngine.ENGINE_DEFAULTS.hours.templates, t=all[id]; if(!t) return "";
  var n=function(x){ return +x>0?String(Math.round(x*100)/100):""; }, lo=n(t.low), hi=n(t.high), one=n(t.perUnit)||lo||hi;
  return lo&&hi&&lo!==hi?fmt(tr("{a}–{b} h"),{a:lo,b:hi}):one?fmt(tr("{h} h"),{h:one}):""; }
function kddHit(k,q){ return [k.name,k.nameId].concat(skWords(k)).some(function(x){ return String(x||"").toLowerCase().split("*").join("").indexOf(q)>=0; }); }
function kddValHtml(o){ var nm=function(id){ return '<span class="scr-kdd-n" data-no-translate>'+esc(kddName(id))+'</span>'; };
  if(o.value) return nm(o.value);
  if(o.hasAuto) return '<span class="scr-kdd-mk">'+esc(tr("Auto"))+'</span><span class="scr-kdd-sr"> · </span>'+(o.auto?nm(o.auto):'<span class="scr-kdd-n mut">'+esc(tr("none recognised"))+'</span>');
  return '<span class="scr-kdd-n mut">'+esc(o.placeholder||"")+'</span>'; }
function kddCls(o){ return "scr-kdd"+(o.field?" fld":"")+(o.ro?" ro":""); }
function kindDropdownHtml(o){ KDD.cfg[o.key]=o; var a=' data-kdd="'+attr(o.key)+'" data-value="'+attr(o.value||"")+'"';
  if(o.ro) return '<span class="'+kddCls(o)+'"'+a+'>'+kddValHtml(o)+'</span>';
  return '<button type="button" class="'+kddCls(o)+'"'+(o.id?' id="'+attr(o.id)+'"':'')+a+' role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="scrKddList" aria-label="'+attr(o.label||tr("Kind of work"))+'" onclick="kddToggle(this)" onkeydown="kddKey(event,this)">'+kddValHtml(o)+'<span class="scr-kdd-chev" aria-hidden="true"></span></button>'; }
function kddPaint(el,o){ el.className=kddCls(o)+(KDD.open&&KDD.open.el===el?" open":""); el.setAttribute("data-value",o.value||""); el.innerHTML=kddValHtml(o)+'<span class="scr-kdd-chev" aria-hidden="true"></span>'; }
function kddAll(key){ return [].filter.call(document.querySelectorAll("button[data-kdd]"),function(x){ return x.getAttribute("data-kdd")===key; }); }
function kddFind(key,i){ return kddAll(key)[i]||null; }
function kddPhone(){ return !!(window.matchMedia&&matchMedia("(pointer:coarse)").matches)||window.innerWidth<=640; }
function kddPop(){ var p=document.getElementById("scrKdd"); if(p) return p;
  p=document.createElement("div"); p.id="scrKdd"; p.className="scr-kdd-pop"; p.hidden=true; document.body.appendChild(p);
  p.addEventListener("mousedown",function(e){ if(e.target.tagName!=="INPUT") e.preventDefault(); });
  p.addEventListener("click",function(e){ var r=e.target.closest("[role=option]"); if(r&&KDD.open) kddChoose(KDD.open.rows[+r.getAttribute("data-i")]); });
  p.addEventListener("mousemove",function(e){ var r=e.target.closest("[role=option]"); if(r&&KDD.open&&+r.getAttribute("data-i")!==KDD.open.act) kddAct(+r.getAttribute("data-i"),1); });
  p.addEventListener("keydown",function(e){ if(KDD.open) kddNav(e); });
  p.addEventListener("input",function(e){ if(!KDD.open) return; KDD.open.q=e.target.value; kddRows("find"); kddPlace(); });
  return p; }
function kddToggle(b){ if(Date.now()-KDD.quiet<300) return; if(KDD.open&&KDD.open.el===b) kddClose(1); else kddOpen(b); }
function kddOpen(b){ var key=b.getAttribute("data-kdd"), o=KDD.cfg[key]; if(!o) return; kddClose(0);
  /* one open at a time, the app's other menus too */
  if(typeof closePops==="function") closePops(); if(typeof EP!=="undefined"&&EP.open&&typeof epClose==="function") epClose();
  if(typeof pillSelClose==="function") document.querySelectorAll(".pillsel-custom.open").forEach(pillSelClose);
  var p=kddPop(), many=kddKinds(o).length>8, st=KDD.open={el:b,key:key,i:kddAll(key).indexOf(b),o:o,q:"",act:-1,rows:[]};
  p.innerHTML=(many?'<div class="scr-kdd-find">'+KDD_FIND+'<input type="text" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="scrKddList" autocomplete="off" spellcheck="false" aria-label="'+attr(tr("Find a kind"))+'" placeholder="'+attr(tr("Find a kind"))+'"></div>':'')
    +'<div class="scr-kdd-list" id="scrKddList" role="listbox" aria-label="'+attr(o.label||tr("Kind of work"))+'"></div><p class="scr-kdd-none" aria-live="polite" hidden></p>';
  p.hidden=false; b.setAttribute("aria-expanded","true"); b.classList.add("open"); kddRows(); kddPlace();
  var f=p.querySelector("input"); if(f&&!kddPhone()){ try{ f.focus({preventScroll:true}); }catch(e){ f.focus(); } }
  kddAct(st.act);
  document.addEventListener("pointerdown",kddOutside,true); document.addEventListener("scroll",kddScroll,true); window.addEventListener("resize",kddPlace);
  if(typeof MutationObserver!=="undefined"){ st.mo=new MutationObserver(kddCheck); st.mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","aria-hidden","hidden"]}); } }
function kddClose(back){ var st=KDD.open; if(!st) return; KDD.open=null; var p=document.getElementById("scrKdd"), had=!!(p&&p.contains(document.activeElement));
  if(st.mo) st.mo.disconnect(); document.removeEventListener("pointerdown",kddOutside,true); document.removeEventListener("scroll",kddScroll,true); window.removeEventListener("resize",kddPlace);
  var el=st.el.isConnected?st.el:kddFind(st.key,st.i);
  if(el){ el.setAttribute("aria-expanded","false"); el.classList.remove("open"); el.removeAttribute("aria-activedescendant"); if(back||had){ try{ el.focus({preventScroll:true}); }catch(e){} } }
  if(p){ p.hidden=true; p.innerHTML=""; } }
/* the rows: Auto, then the kinds (those that match what is typed); the active one is the chosen one, the first match
   while finding, or stays where it was when the trigger was drawn again */
function kddRows(how){ var st=KDD.open, o=st&&st.o, list=document.getElementById("scrKddList"); if(!list) return;
  var q=String(st.q||"").trim().toLowerCase(), cur=o.value||"", rows=o.hasAuto?[{v:"",auto:1}]:[], at=-1;
  kddKinds(o).forEach(function(k){ if(!q||kddHit(k,q)) rows.push({v:k.id,k:k}); });
  list.innerHTML=rows.map(function(r,i){ var on=r.v===cur, k=r.k, h=k&&kddHours(k.id); if(on) at=i;
    return '<div role="option" id="scrKddO'+i+'" class="scr-kdd-o'+(r.auto?' auto':'')+(on?' on':'')+'" data-i="'+i+'" data-v="'+attr(r.v)+'" aria-selected="'+on+'"><span class="scr-kdd-ck">'+(on?I.check:'')+'</span>'
      +(r.auto?'<span class="scr-kdd-l"><b>'+esc(tr("Auto"))+'</b> <span class="mut">— '+esc(o.auto?fmt(tr("from the title: {kind}"),{kind:kddName(o.auto)}):tr("none recognised"))+'</span></span>'
        :'<span class="scr-kdd-l" data-no-translate>'+esc(skName(k)||k.id)+'</span>'+(k.builtIn===false?'<span class="scr-kdd-tag">'+esc(tr("custom"))+'</span>':'')+(h?'<span class="scr-kdd-h" title="'+attr(tr("Usual hours for one deliverable"))+'">'+esc(h)+'</span>':''))+'</div>'; }).join("");
  st.rows=rows; var none=list.nextElementSibling, miss=q&&rows.length===(o.hasAuto?1:0);
  if(none){ none.hidden=!miss; none.textContent=miss?fmt(tr("No kind of work has “{q}” in its name or words."),{q:String(st.q).trim()}):""; }
  if(how==="find") at=q?(miss?-1:o.hasAuto?1:0):at; else if(how==="keep"&&st.act>=0&&st.act<rows.length) at=st.act;
  kddAct(at<0&&!(how==="find"&&miss)?0:at); }
function kddAct(i,mouse){ var st=KDD.open; if(!st) return; st.act=i<0||!st.rows.length?-1:Math.max(0,Math.min(st.rows.length-1,i));
  var cur=st.act>=0&&document.getElementById("scrKddO"+st.act), f=document.querySelector("#scrKdd input");
  [].forEach.call(document.querySelectorAll("#scrKddList [role=option]"),function(r){ r.classList.toggle("act",r===cur); });
  [st.el,f].forEach(function(x){ if(!x) return; if(cur) x.setAttribute("aria-activedescendant",cur.id); else x.removeAttribute("aria-activedescendant"); });
  if(cur&&!mouse) cur.scrollIntoView({block:"nearest"}); }
function kddPlace(){ var st=KDD.open, p=document.getElementById("scrKdd"); if(!st||!p) return;
  var r=st.el.getBoundingClientRect(), vw=document.documentElement.clientWidth||window.innerWidth, vh=window.innerHeight, m=8, g=4;
  if(r.bottom<0||r.top>vh){ kddClose(0); return; }
  var w=Math.min(vw-2*m,Math.max(260,Math.min(300,r.width))); if(p.style.width!==w+"px") p.style.width=w+"px";
  /* its full height without changing it (that would scroll the list back to its top) */
  var l=document.getElementById("scrKddList"), h=Math.min(320,p.offsetHeight-(l?l.clientHeight-l.scrollHeight:0)), below=vh-r.bottom-g-m, above=r.top-g-m;
  var down=h<=below||below>=above, hh=Math.max(Math.min(h,down?below:above),Math.min(h,120)), top=down?r.bottom+g:r.top-g-hh;
  p.style.maxHeight=hh+"px"; p.style.top=Math.max(m,Math.min(top,vh-m-hh))+"px"; p.style.left=Math.max(m,Math.min(r.left,vw-w-m))+"px"; p.classList.toggle("up",!down); }
function kddScroll(e){ var p=document.getElementById("scrKdd"); if(p&&e.target&&e.target.nodeType===1&&p.contains(e.target)) return; kddPlace(); }
function kddOutside(e){ var st=KDD.open, p=document.getElementById("scrKdd"); if(!st||(p&&p.contains(e.target))||st.el.contains(e.target)) return; kddClose(0); }
/* drawn again under it: the new trigger with the same key and place takes it over, or it closes; so it does when the
   trigger is hidden (the panel or the form closed) */
function kddCheck(){ var st=KDD.open; if(!st) return; if(st.el.isConnected){ if(!st.el.getClientRects().length||st.el.closest('[aria-hidden="true"]')) kddClose(0); return; } var nx=kddFind(st.key,st.i); if(!nx){ kddClose(0); return; }
  var lost=!document.activeElement||document.activeElement===document.body; st.el=nx; st.o=KDD.cfg[st.key]||st.o;
  nx.setAttribute("aria-expanded","true"); nx.classList.add("open"); if(lost){ try{ nx.focus({preventScroll:true}); }catch(e){} }
  kddRows("keep"); kddPlace(); }
function kddChoose(r){ var st=KDD.open; if(!st||!r) return; var o=st.o, el=st.el, key=st.key, i=st.i, v=r.v||"";
  kddClose(1); if(v===(o.value||"")) return;
  o.value=v; if(el.isConnected) kddPaint(el,o);
  o.pick(v); var nx=!el.isConnected&&kddFind(key,i); if(nx&&(!document.activeElement||document.activeElement===document.body)){ try{ nx.focus({preventScroll:true}); }catch(e){} } }
function kddChar(e){ return !!e.key&&e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key!==" "||!!KDD.buf&&Date.now()-KDD.bufT<600); }
/* letters jump to the next kind whose name starts so (the same letter again: the one after) */
function kddType(ch){ var st=KDD.open; if(!st||!st.rows.length) return; var now=Date.now(); KDD.buf=(now-KDD.bufT<600?KDD.buf:"")+ch.toLowerCase(); KDD.bufT=now;
  var b=KDD.buf, rep=b.split(b[0]).join("")==="", q=rep?b[0]:b, n=st.rows.length, from=rep?st.act+1:Math.max(0,st.act);
  for(var j=0;j<n;j++){ var x=(from+j)%n, r=st.rows[x], l=(r.auto?tr("Auto"):skName(r.k)||r.k.id).toLowerCase(); if(l.indexOf(q)===0){ kddAct(x); return; } } }
function kddKey(e,b){ var st=KDD.open, k=e.key;
  if(st&&st.el===b) return kddNav(e);
  if(k==="ArrowDown"||k==="ArrowUp"){ e.preventDefault(); kddOpen(b); }
  else if(kddChar(e)&&e.key!==" "){ var o=KDD.cfg[b.getAttribute("data-kdd")]; if(o&&kddKinds(o).length<=8){ e.preventDefault(); kddOpen(b); kddType(e.key); } } }
function kddNav(e){ var st=KDD.open, k=e.key, inp=!!(e.target&&e.target.tagName==="INPUT"), n=st.rows.length;
  if(k==="ArrowDown"||k==="ArrowUp"){ e.preventDefault(); if(e.altKey&&k==="ArrowUp") return kddChoose(st.rows[st.act]); kddAct(st.act<0?0:st.act+(k==="ArrowDown"?1:-1)); }
  else if(k==="Home"||k==="End"){ if(inp&&st.q) return; e.preventDefault(); kddAct(k==="Home"?0:n-1); }
  else if(k==="PageDown"||k==="PageUp"){ e.preventDefault(); kddAct(Math.max(0,st.act)+(k==="PageDown"?8:-8)); }
  else if(k==="Enter"||k===" "&&!inp&&!kddChar(e)){ e.preventDefault(); if(k===" ") KDD.quiet=Date.now(); kddChoose(st.rows[st.act]); }
  else if(k==="Escape"){ e.preventDefault(); e.stopPropagation(); kddClose(1); }
  else if(k==="Tab") kddClose(1);
  else if(!inp&&kddChar(e)){ var f=document.querySelector("#scrKdd input"); if(f) f.focus(); else { e.preventDefault(); kddType(e.key); } } }
/* a redraw after a choice (the task saved) keeps the focus on the trigger, where it was */
["renderDrawer","scrPaint"].forEach(function(n){ var base=window[n]; if(typeof base!=="function") return;
  window[n]=function(){ var a=document.activeElement, key=!KDD.open&&a&&a.getAttribute&&a.getAttribute("data-kdd"), i=key?kddAll(key).indexOf(a):-1, out=base.apply(this,arguments);
    if(key&&!a.isConnected&&(!document.activeElement||document.activeElement===document.body)){ var nx=kddFind(key,i); if(nx){ try{ nx.focus({preventScroll:true}); }catch(e){} } }
    return out; }; });

/* ---------- Settings → Smart Scoring → Kinds of work ----------
   One line a kind, in detection order; Edit opens its fields under it (only that row is drawn again). Over 8 kinds, Find
   hides the others, never removes them, so the order and paths (kinds.<i>…) hold. Switched off, a kind stays put, dimmed. */
function skKinds(){ return scGet("kinds")||[]; }
function scoringKindsSettingsHtml(ro,ed){ if(!SC.draft) return "";
  return scSection("kinds","Kinds of work",SK_LINE,scHelp(SK_INTRO)
    +'<div class="scr-ktools"><div class="field"><label for="skTest">'+tr("Try a title")+'</label><input id="skTest" value="'+attr(SK.test)+'" placeholder="Podcast episode 12" oninput="SK.test=this.value;skTestPaint()"><div id="skTestOut" class="scr-kout" aria-live="polite">'+esc(skTestText())+'</div></div>'
    +'<div class="field" id="skFindF"'+(skKinds().length>8?'':' hidden')+'><label for="skFind">'+tr("Find a kind")+'</label><input id="skFind" type="search" value="'+attr(SK.find)+'" placeholder="'+attr(tr("A name or a word"))+'" oninput="SK.find=this.value;skFilter()"></div></div>'
    +'<div id="skList">'+skListHtml(ro)+'</div>',{icon:I.tiles,example:SK_EG}); }
function skListHtml(ro){ var l=skKinds(), hits=l.filter(skHit).length, th=function(c,t){ return '<span class="scr-k'+c+'">'+tr(t)+'</span>'; };
  return '<div class="scr-klist'+(ro?' ro':'')+'"><div class="scr-khead" aria-hidden="true">'+th("n","Name")+th("w","Words in the title")+th("fi","First (h)")+th("pt","Points per asset")+'</div>'
    +l.map(function(k,i){ return skRowHtml(k,i,l.length,ro); }).join("")+'</div><p class="hint" id="skNone"'+(hits?' hidden':'')+'>'+esc(skNone(hits))+'</p>'
    +(ro?'':'<button type="button" class="btn sm" onclick="skAdd()"'+(l.length>=ScoringEngine.KIND_LIMITS.kinds?' disabled':'')+'>'+I.plus+tr("Add kind of work")+'</button>'); }
function skBtn(fn,ico,label,off){ return '<button type="button" class="iconbtn" onclick="'+fn+'" title="'+attr(tr(label))+'"'+(off?' disabled':'')+'>'+ico+'</button>'; }
function skRowHtml(k,i,n,ro){ var open=!!SK.open[k.id];
  return '<div class="scr-krow'+(k.active===false?' off':'')+(open?' open':'')+'" data-kind="'+attr(k.id)+'"'+(skHit(k)?'':' hidden')+'><div class="scr-ksum">'
    +(ro?'':'<span class="scr-kmv">'+skBtn("skMove("+i+",-1)",I.arrowup,"Move up",!i)+skBtn("skMove("+i+",1)",I.arrowdn,"Move down",i>=n-1)+'</span>')
    +'<span class="scr-kinfo" onclick="skOpen('+i+')">'+skCells(k,i)+'</span>'
    +'<span class="scr-ktg">'+(k.builtIn?'<span class="badge">'+tr("Built-in")+'</span>':ro?'':skBtn("skDel("+i+")",I.trash,"Delete"))+'</span>'
    +scSwitchHtml("kinds."+i+".active",tr("On")+" "+skName(k),ro).replace("scSwitch(this)","skSwitch(this)")
    +'<button type="button" class="btn sm scr-kopen" aria-expanded="'+open+'" aria-controls="skEd'+i+'" onclick="skOpen('+i+')">'+tr(open?(ro?"Close":"Done"):(ro?"View":"Edit"))+'</button></div>'
    +(open?skEditHtml(k,i,ro):'')+'</div>'; }
function skWords(k){ return (Array.isArray(k.keywords)?k.keywords:String(k.keywords||"").split(",")).map(function(x){ return String(x).trim(); }).filter(Boolean); }
/* up to three words as chips, fewer when long (about 24 letters fit), then how many more; a phone shows the first (m1) */
function skCells(k,i){ var nm=skName(k), other=UI_LANG==="id"?k.name:k.nameId, w=skWords(k), t=scGet("hours.templates."+k.id), pt=scGet("assets.perKind."+k.id), m=0, len=0;
  while(m<w.length&&m<3&&(!m||len+w[m].length<=24)) len+=w[m++].length;
  var val=function(c,label,x,txt){ return '<span class="scr-kv scr-k'+c+'"><i>'+tr(label)+'</i>'+(x==null||x===""?'—':txt)+'</span>'; };
  return '<span class="scr-kn" tabindex="0" onkeydown="skKey(event,'+i+')" data-no-translate><b>'+(nm?esc(nm):'<em>'+tr("New kind of work")+'</em>')+'</b>'+(other&&other!==nm?'<small>'+esc(other)+'</small>':'')+'</span>'
    +'<span class="scr-kw" data-no-translate title="'+attr(w.join(", "))+'">'+(w.length?w.slice(0,m).map(function(x){ return '<span class="scr-kchip">'+esc(x)+'</span>'; }).join("")+(w.length>m?'<span class="scr-kchip more">+'+(w.length-m)+'</span>':'')+(w.length>1?'<span class="scr-kchip more m1">+'+(w.length-1)+'</span>':''):'<em>'+tr("No words yet")+'</em>')+'</span>'
    +val("fi","First (h)",t&&t.perUnit,esc(fmt(tr("{n} h"),{n:t&&t.perUnit})))+val("pt","Points per asset",pt,esc(pt+" "+tr("pts"))); }
function skEditHtml(k,i,ro){ var p="kinds."+i, h="hours.templates."+k.id;
  var txt=function(f,label,v){ var id="sk"+i+"_"+f; return '<div class="field"><label for="'+id+'">'+tr(label)+'</label><input id="'+id+'" data-sc="'+p+'.'+f+'" data-k="str" value="'+attr(v)+'"'+(ro?' disabled':' oninput="scInput(this);skTestPaint()"')+'></div>'; };
  var num=function(path,label,o){ return scNumHtml("sk"+i+"_"+path.split(".").pop(),path,label,Object.assign({ro:ro,min:0.05,max:200,step:0.25},o)); };
  return '<div class="scr-kbody" id="skEd'+i+'"'+(ro?'':' oninput="skSum('+i+')"')+'><div class="scr-grid">'+txt("name","Name",k.name)+txt("nameId","Name in Indonesian",k.nameId)+'</div>'
    +txt("keywords","Words in the title",skWords(k).join(", "))
    +'<div class="scr-grid scr-knums">'+num(h+".perUnit","First (h)")+num("assets.perKind."+k.id,"Points per asset",{min:0,max:20})+'</div>'
    +scAdvanced('<div class="scr-grid scr-knums">'+num(h+".low","Low (h)")+num(h+".high","High (h)")+num(h+".nextUnitFactor","Each next (× first)",{min:0,max:1,step:0.05})+'</div>'+scHelp(SC_T.next,SC_T.nextEx),{title:"More",hint:"Low, high and each next"})+'</div>'; }
function skRow(id){ return document.querySelector('#skList [data-kind="'+id+'"]'); }
function skOpen(i){ var l=skKinds(), k=l[i], r=k&&skRow(k.id); if(!r) return;
  if(SK.open[k.id]) delete SK.open[k.id]; else SK.open[k.id]=1;
  r.outerHTML=skRowHtml(k,i,l.length,!canI.scoringConfigure()); skRow(k.id).querySelector(".scr-kopen").focus(); }
function skKey(e,i){ if(e.key==="Enter"){ e.preventDefault(); skOpen(i); } }
function skSum(i){ var k=skKinds()[i], r=k&&skRow(k.id), c=r&&r.querySelector(".scr-kinfo"), s=r&&r.querySelector(".scr-ksum>.switch");
  if(c) c.innerHTML=skCells(k,i); if(s) s.setAttribute("aria-label",tr("On")+" "+skName(k)); }
function skHit(k){ var q=String(SK.find||"").trim().toLowerCase(); return !q||kddHit(k,q); }
function skNone(n){ return n?"":fmt(tr("No kind of work has “{q}” in its name or words."),{q:String(SK.find||"").trim()}); }
function skFilter(){ var n=0, el=document.getElementById("skNone");
  skKinds().forEach(function(k){ var r=skRow(k.id), hit=skHit(k); if(r) r.hidden=!hit; if(hit) n++; });
  if(el){ el.hidden=!!n; el.textContent=skNone(n); } }
function skPaint(id,d){ var el=document.getElementById("skList"), f=document.getElementById("skFindF"); if(!el) return;
  if(f){ f.hidden=skKinds().length<=8; if(f.hidden) SK.find=document.getElementById("skFind").value=""; }
  el.innerHTML=skListHtml(!canI.scoringConfigure()); skTestPaint(); scBarPaint();
  var r=id&&skRow(id), b=r&&r.querySelectorAll(".scr-kmv .iconbtn")[d<0?0:1]; if(r&&(!b||b.disabled)) b=r.querySelector(".scr-ksum button:not([disabled])"); if(b) b.focus(); }
function skSwitch(b){ scSwitch(b); b.closest(".scr-krow").classList.toggle("off",!b.classList.contains("on")); skTestPaint(); }
function skMove(i,d){ var l=skKinds(), j=i+d; if(j<0||j>=l.length) return; var x=l[i]; l[i]=l[j]; l[j]=x; l.forEach(function(k,n){ k.order=n; }); SC.dirty=true; skPaint(x.id,d); }
function skAdd(){ var l=skKinds(), id="k_"+Math.random().toString(36).slice(2,10), f=document.getElementById("skFind"); if(l.length>=ScoringEngine.KIND_LIMITS.kinds) return;
  l.push({id:id,name:"",nameId:"",keywords:[],builtIn:false,active:true,order:l.length}); SC.dirty=true; SK.open[id]=1; SK.find=""; if(f) f.value="";
  skPaint(); document.getElementById("sk"+(l.length-1)+"_name").focus(); }
function skDel(i){ var l=skKinds(), k=l[i]; if(!k||k.builtIn) return; var n=TASKS.filter(function(t){ return (t.meta||{}).kind===k.id; }).length;
  confirmModal(fmt(tr("Delete {kind}?"),{kind:skName(k)}),esc(fmt(tr("Gone when you save. Tasks that chose it ({n}) go back to their title's kind."),{n:n})),function(){
    l.splice(i,1); l.forEach(function(x,j){ x.order=j; }); delete SK.open[k.id]; [scGet("hours.templates"),scGet("assets.perKind")].forEach(function(o){ if(o) delete o[k.id]; }); SC.dirty=true; skPaint(); },true); }
function skTestText(){ var t=String(SK.test||"").trim(); if(!t) return tr("Type a title to see its kind of work.");
  var l=ScoringSettings.normalizeSettings(SC.draft||{}).kinds, m=ScoringEngine.kindMatch(t,l), k=m&&l.filter(function(x){ return x.id===m.id; })[0];
  return k?fmt(tr("Detected: {kind} (keyword \"{word}\")"),{kind:skName(k),word:m.keyword}):tr("No kind recognised"); }
function skTestPaint(){ var el=document.getElementById("skTestOut"); if(el) el.textContent=skTestText(); }
(function(){ var base=scPathLabel; scPathLabel=function(p){ var s=String(p).split(".");
  if(s[0]==="kinds") return tr("Kinds of work")+(s[2]?" · "+estKindName(s[1])+" · "+tr(SK_FIELD[s[2]]||s[2]):"");
  if(s[0]==="hours"&&s[1]==="templates"&&!s[3]) return tr("Effort Hours")+" · "+estKindName(s[2]);
  return base.apply(this,arguments); }; })();
(function(){ var base=scVal; scVal=function(p,v){ var o=v&&typeof v==="object"&&!Array.isArray(v);
  return o&&/^kinds/.test(p)?skName(v)||v.id:o&&/^hours\.templates/.test(p)?v.perUnit+" h ("+v.low+"–"+v.high+" h)":base.apply(this,arguments); }; })();
SCR_ACTIONS.kind_fallback="Kind of work removed: read from the title again";

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  [SK_INTRO]:"Dibaca dari kata utuh di judul, dari atas daftar dulu (\"copy\" bukan \"copywriter\"; video* juga menemukan videografi). Jenis yang dipilih di task menang. Juga dipakai estimasi saat Create, meski Smart Scoring mati.",
  [SK_EG]:"tambahkan Podcast dengan kata podcast, siniar — task berjudul “Siniar eps 4” lalu diestimasi dengan jam Podcast.",
  [SK_LINE]:"Jenis pekerjaan yang bisa dimiliki sebuah task, masing-masing dengan kata yang dipakai judulnya, jamnya, dan poin per asetnya.","Points per asset":"Poin per aset",
  "Kinds of work":"Jenis pekerjaan","none recognised":"tidak dikenali","Name in Indonesian":"Nama (Indonesia)","Words in the title":"Kata di judul","On":"Nyala","Delete":"Hapus",
  "Add kind of work":"Tambah jenis pekerjaan","Try a title":"Coba sebuah judul",
  "Type a title to see its kind of work.":"Ketik judul untuk melihat jenis pekerjaannya.","Detected: {kind} (keyword \"{word}\")":"Terdeteksi: {kind} (kata kunci \"{word}\")","No kind recognised":"Tidak ada jenis yang dikenali",
  "Delete {kind}?":"Hapus {kind}?","Gone when you save. Tasks that chose it ({n}) go back to their title's kind.":"Terhapus saat disimpan. Task yang memilihnya ({n}) kembali ke jenis dari judulnya.",
  "Kind of work removed: read from the title again":"Jenis pekerjaan dihapus: dibaca dari judul lagi",
  "Find a kind":"Cari jenis","A name or a word":"Nama atau kata","New kind of work":"Jenis pekerjaan baru","No words yet":"Belum ada kata","View":"Lihat",
  "Low, high and each next":"Terendah, tertinggi, dan tiap berikutnya","No kind of work has “{q}” in its name or words.":"Tidak ada jenis pekerjaan dengan “{q}” di nama atau katanya.",
  "Auto":"Otomatis","from the title: {kind}":"dari judul: {kind}","custom":"khusus","{a}–{b} h":"{a}–{b} j","{h} h":"{h} j","Usual hours for one deliverable":"Jam biasa untuk satu deliverable"
});
</script>
<style>
.scr-kpick{display:inline-flex;align-items:center;gap:6px;max-width:100%}
.scr-kdd{position:relative;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:220px;min-height:25px;padding:3px 7px 3px 9px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text-primary);font:inherit;font-size:12px;font-weight:550;line-height:1.45;text-align:left;vertical-align:middle;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}
.scr-kdd:hover{border-color:var(--color-border-strong);background:var(--color-surface-hover)}
.scr-kdd:focus-visible,.scr-kdd.open{outline:none;border-color:var(--color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primary) 16%,transparent)}
.scr-kdd.ro{cursor:default;background:var(--color-surface-sunken);border-color:transparent;padding-right:9px}
.scr-kdd.fld{display:flex;width:100%;max-width:none;min-height:42px;padding:9px 12px;border-radius:12px;font-size:var(--fs-base);font-weight:500}
.scr-kdd-n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-kdd .mut,.scr-kdd-l .mut{color:var(--color-text-secondary);font-weight:450}
.scr-kdd-mk{flex:none;padding:0 6px;border-radius:var(--pill);background:var(--color-primary-soft);color:var(--color-primary);font-size:10.5px;font-weight:700;line-height:16px;letter-spacing:.02em;text-transform:lowercase}
.scr-kdd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.scr-kdd-chev{flex:none;width:12px;height:12px;margin-left:auto;background:currentColor;opacity:.55;-webkit-mask:var(--zc-chev-mask) center/contain no-repeat;mask:var(--zc-chev-mask) center/contain no-repeat;transition:transform .15s}
.scr-kdd.open .scr-kdd-chev{transform:rotate(180deg);opacity:.9}
.scr-kdd-pop{position:fixed;z-index:275;display:flex;flex-direction:column;box-sizing:border-box;max-height:320px;padding:5px;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:12px;box-shadow:var(--shadow-lg);color:var(--color-text-primary);font-family:var(--font-ui);font-size:12.5px;line-height:1.35;animation:scrKdd .12s ease-out}
.scr-kdd-pop[hidden]{display:none}
.scr-kdd-pop.up{animation-name:scrKddUp}
@keyframes scrKdd{from{opacity:0;transform:translateY(-3px)}}@keyframes scrKddUp{from{opacity:0;transform:translateY(3px)}}
.scr-kdd-find{position:relative;flex:none;padding:2px 2px 6px}
.scr-kdd-find svg{position:absolute;left:13px;top:11px;width:14px;height:14px;fill:none;stroke:var(--color-text-tertiary);stroke-width:2;stroke-linecap:round;pointer-events:none}
.scr-kdd-find input{width:100%;box-sizing:border-box;padding:7px 12px 7px 31px;border:1px solid var(--color-border);border-radius:var(--pill);background:var(--color-surface-sunken);color:inherit;font:inherit;outline:none}
.scr-kdd-find input:focus{border-color:var(--color-primary);background:var(--color-surface)}
.scr-kdd-list{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.scr-kdd-o{display:flex;align-items:center;gap:7px;padding:7px 10px 7px 7px;border-radius:8px;cursor:pointer;white-space:nowrap}
.scr-kdd-o.act,.scr-kdd-o.on{background:var(--color-primary-soft)}
.scr-kdd-o.on{color:var(--color-primary);font-weight:600}
.scr-kdd-o.auto{position:relative;margin-bottom:7px;white-space:normal}
.scr-kdd-o.auto::after{content:"";position:absolute;left:7px;right:7px;bottom:-4px;border-bottom:1px solid var(--color-border)}
.scr-kdd-ck{flex:none;display:inline-flex;width:14px;height:14px}
.scr-kdd-ck svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.scr-kdd-l{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.scr-kdd-tag{flex:none;padding:0 6px;border-radius:var(--pill);background:var(--color-surface-sunken);color:var(--color-text-secondary);font-size:10.5px;font-weight:600;line-height:16px}
.scr-kdd-h{flex:none;margin-left:auto;padding-left:6px;color:var(--color-text-tertiary);font-size:11.5px;font-weight:500;font-variant-numeric:tabular-nums}
.scr-kdd-o.on .scr-kdd-h{color:inherit;opacity:.75}
.scr-kdd-none{margin:0;padding:10px;text-align:center;color:var(--color-text-tertiary);font-size:12px}
@media(pointer:coarse){.scr-kdd-o{padding-top:10px;padding-bottom:10px}}
@media(prefers-reduced-motion:reduce){.scr-kdd-pop{animation:none}}
.scr-ktools{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 16px;margin:0 0 12px}
.scr-ktools .field{margin:0}
.scr-kout{margin-top:6px;font-weight:600}
.scr-klist{container-type:inline-size;border:1px solid var(--color-border);border-radius:var(--radius);margin-bottom:10px}
.scr-klist.ro{--skmv:0px}
.scr-khead,.scr-ksum{display:grid;grid-template-columns:var(--skmv,56px) minmax(0,1fr) minmax(0,1.7fr) 52px 62px 64px 36px 66px;grid-template-areas:"mv nm kw fi pt tg sw ed";align-items:center;gap:6px 8px;padding:7px 12px}
.scr-khead{font-size:11px;font-weight:650;letter-spacing:.03em;text-transform:uppercase;color:var(--color-text-secondary);border-bottom:1px solid var(--color-border)}
.scr-khead .scr-kfi,.scr-khead .scr-kpt,.scr-kv{text-align:right}
.scr-krow+.scr-krow{border-top:1px solid var(--color-border)}
.scr-krow.open{box-shadow:inset 3px 0 var(--color-primary)}
.scr-kmv{grid-area:mv;display:flex;gap:4px}
.scr-kmv .iconbtn{width:26px;height:26px}.scr-kmv svg{width:14px;height:14px}
.scr-kinfo{display:contents}
.scr-kn,.scr-kw,.scr-kv{min-width:0;cursor:pointer}
.scr-kn{grid-area:nm;display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px}
.scr-kn b,.scr-kn small,.scr-kchip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-kn b{font-weight:600}
.scr-kn small,.scr-kn em,.scr-kw em,.scr-kchip.more{font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-kw{grid-area:kw;display:flex;gap:4px;overflow:hidden}
.scr-kchip{flex:0 1 auto;min-width:0;padding:1px 7px;border-radius:var(--pill);background:var(--color-surface-sunken);font-size:12px}
.scr-kchip.more{flex:none;font-size:12px}.scr-kchip.m1{display:none}
.scr-kfi{grid-area:fi}.scr-kpt{grid-area:pt}.scr-ktg{grid-area:tg;display:flex}.scr-ksum>.switch{grid-area:sw}.scr-kopen{grid-area:ed;justify-self:end}
.scr-kv{white-space:nowrap;font-variant-numeric:tabular-nums;font-size:var(--fs-sm)}
.scr-kv i{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.scr-krow.off :is(.scr-kn,.scr-kw,.scr-kv){opacity:.5}
.scr-kbody{padding:4px 12px 12px}
.scr-kbody .scr-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:0 0 10px}
.scr-kbody .scr-knums{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
.scr-kbody>.field{margin:0 0 10px}
@container (max-width:640px){.scr-khead{display:none}.scr-ksum{grid-template-columns:auto minmax(0,1fr) auto auto auto;grid-template-areas:"mv nm nm sw ed" "mv kw fi pt tg";padding:8px 10px}.scr-kmv{flex-direction:column}.scr-kchip~.scr-kchip{display:none}.scr-kchip.m1{display:block}}
</style>
