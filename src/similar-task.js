<script>
/* ============================================================
   SIMILAR TASKS — so the same work is not asked for twice.
   While a new task's title (and description) is written, the tasks already there that read alike are
   listed under the title: open ones, and ones finished in the last 60 days, across every project this
   person can see. Pressing Create when one is very close asks first: open it, or create anyway.
   Text only, in the browser — no cost, no wait. Both texts are lower-cased, stripped of accents,
   punctuation and the common English and Indonesian words ("the", "for", "untuk", "yang"…); the score
   blends the words they share with the three-letter pieces they share (which forgives a typo or another
   word order), and the descriptions when both have one. Calling createDraft() directly (the AI chat, a
   message turned into a task) is not stopped; only the Create button asks.
   ============================================================ */
var SIM_STOP=("a an the and or of for to in on at by with from into about as is are be this that these those it its new task tasks make create please need "+
  "dan atau yang di ke dari untuk dengan pada ini itu ada akan buat bikin tolong mohon jadi sebagai oleh dalam juga agar supaya bisa harus baru minta").split(" ").reduce(function(o,w){ o[w]=1; return o; },{});
var SIM_CACHE={};
function simWords(s){ return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(function(w){ return w.length>1&&!SIM_STOP[w]; }); }
function simGrams(words){ var s=" "+words.join(" ")+" ", g={}; for(var i=0;i<s.length-2;i++) g[s.substr(i,3)]=1; return g; }
function simPrep(s){ var k=String(s||""); if(SIM_CACHE[k]) return SIM_CACHE[k]; var w=simWords(k), o={words:w,set:w.reduce(function(m,x){ m[x]=1; return m; },{}),grams:simGrams(w)}; SIM_CACHE[k]=o; return o; }
function simJaccard(a,b){ var n=0,u=0,k; for(k in a) if(b[k]) n++; u=Object.keys(a).length+Object.keys(b).length-n; return u?n/u:0; }
function simDice(a,b){ var n=0,la=0,lb=Object.keys(b).length,k; for(k in a){ la++; if(b[k]) n++; } return la+lb?2*n/(la+lb):0; }
/* 0..1: how alike two tasks read */
function simScore(title,desc,t){ var A=simPrep(title), B=simPrep(t.title); if(!A.words.length||!B.words.length) return 0;
  if(A.words.join(" ")===B.words.join(" ")) return 1;
  var s=0.6*simDice(A.grams,B.grams)+0.4*simJaccard(A.set,B.set);
  /* one title inside the other ("Hero KV" in "Hero KV — insurance campaign") */
  var short=A.words.length<=B.words.length?A:B, long=short===A?B:A;
  if(short.words.length>=2&&short.words.every(function(w){ return long.set[w]; })) s=Math.max(s,0.62);
  var D=simPrep(desc), E=t.description?simPrep(t.description):null;
  if(D.words.length>=3&&E&&E.words.length>=3) s=0.75*s+0.25*simJaccard(D.set,E.set);
  return Math.min(1,s); }
var SIM_SHOW=0.45, SIM_ASK=0.75;
/* the tasks a new one is compared with: open, or finished in the last 60 days */
function simPool(){ var since=Date.now()-60*864e5; return TASKS.filter(function(t){ if(t._draft||t._creating||!t.title) return false; if(!isClosed(t)) return true; var at=Date.parse(t.updatedAt||"")||(typeof t.due==="number"?Date.now()+t.due*864e5:0); return at>=since; }); }
function simFind(title,desc,limit){ return simPool().map(function(t){ return {t:t,s:simScore(title,desc,t)}; }).filter(function(x){ return x.s>=SIM_SHOW; }).sort(function(a,b){ return b.s-a.s; }).slice(0,limit||3); }
function simLine(x){ var t=x.t; return '<button type="button" class="sim-row" onclick="openTask('+jsq(t.id)+')"><span class="mono sim-id">'+esc(t.id)+'</span><span class="sim-t" data-no-translate>'+esc(t.title)+'</span><span class="sim-m">'+esc(stageName(t.status))+(t.assignee?' · <span data-no-translate>'+esc(first(t.assignee))+'</span>':'')+' · '+Math.round(x.s*100)+'%</span></button>'; }
/* what is written now, read from the panel (the editors save on their own clock) */
function simRead(tk){ var el=document.querySelector("#drHead .dr-title"), d=document.getElementById("descSrc"); return { title:String((el&&el.textContent)||tk.title||"").trim(), desc:String((d&&d.innerText)||tk.description||"") }; }
function simRender(){ var tk=S.drawerTask?task(S.drawerTask):null, head=document.getElementById("drHead"); if(!head) return; var box=head.querySelector(".sim-box");
  if(!tk||!tk._draft){ if(box) box.remove(); return; }
  var r=simRead(tk), hits=simFind(r.title,r.desc,3);
  if(!hits.length){ if(box) box.remove(); return; }
  var html='<div class="sim-box" role="status"><div class="sim-head">'+I.list+'<b>'+tr("Similar tasks already exist")+'</b><span class="hint">'+tr("Check before creating another")+'</span></div>'+hits.map(simLine).join("")+'</div>';
  if(box) box.outerHTML=html; else { var at=head.querySelector(".dr-title"); if(at) at.insertAdjacentHTML("afterend",html); } }
var SIM_T=null;
document.addEventListener("input",function(e){ var el=e.target; if(!el||!el.closest||!(el.closest("#drHead .dr-title")||el.closest("#descSrc"))) return; var tk=S.drawerTask?task(S.drawerTask):null; if(!tk||!tk._draft) return; clearTimeout(SIM_T); SIM_T=setTimeout(simRender,250); },true);
(function(){ if(typeof renderDrawer!=="function") return; var base=renderDrawer; renderDrawer=function(){ var out=base.apply(this,arguments); try{ simRender(); }catch(e){ console.error(e); } return out; }; })();
/* the Create button: a near-identical task asks first */
function createDraftChecked(){ var tk=task("T-new"); if(!tk) return createDraft(); var r=simRead(tk), top=simFind(r.title,r.desc,1)[0];
  if(!top||top.s<SIM_ASK||tk._dupOk) return createDraft();
  var t=top.t; window._simCreate=function(){ tk._dupOk=true; createDraft(); };
  openModal(tr("This looks like a task that already exists"),'<p>'+tr("It is very close to")+' <b class="mono">'+esc(t.id)+'</b> “<span data-no-translate>'+esc(t.title)+'</span>” — '+esc(stageName(t.status))+(t.assignee?' · <span data-no-translate>'+esc(person(t.assignee).name)+'</span>':'')+' ('+Math.round(top.s*100)+'%).</p><p class="hint">'+tr("Open it to add to it, or create this one anyway.")+'</p>',
    '<button class="btn" onclick="closeModal();openTask('+jsq(t.id)+')">'+tr("Open")+' '+esc(t.id)+'</button><span class="spacer"></span><button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" id="simCreateAnyway" onclick="closeModal();window._simCreate()">'+tr("Create anyway")+'</button>'); }
</script>
