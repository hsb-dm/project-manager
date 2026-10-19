<script>
/* ============================================================
   KINDS OF WORK, THE WORKSPACE'S OWN (Oct 2026): a task's kind chosen by hand (kindPickHtml, meta.kind) and the
   Settings section (scoringKindsSettingsHtml, through the tab's draft).
   ============================================================ */
var SK={test:""}, SK_FIELD={name:"Name",nameId:"Name in Indonesian",keywords:"Words in the title",active:"On"};
var SK_INTRO="Read from whole words of the title, top of the list first (\"copy\" is not \"copywriter\"; video* also finds videografi). A kind chosen on a task wins. Also used by the estimate on Create, even with Smart Scoring off.";
var SK_EG="add Podcast with the words podcast, siniar — a task titled “Siniar eps 4” is then estimated with Podcast's hours.";
var SK_LINE="The kinds of work a task can be, each with the words its titles use, its hours and its points per asset.";
function skName(k){ return k?(UI_LANG==="id"?k.nameId:k.name)||k.name||"":""; }

/* ---------- on the task ---------- */
function kindPickHtml(tk,ed){ if(!tk||tk._draft) return "";
  var list=estKindList(), pick=ScoringEngine.kindPick(tk,list), auto=ScoringEngine.kindOf(tk.title,list), lab=tr("Kind of work"), nm=function(id){ return id?estKindName(id):tr("none recognised"); };
  return '<label class="scr-kpick" data-scr-in="kind">'+lab+' <select'+(ed?' onchange="kindPick('+jsq(tk.id)+',this.value)"':' disabled')+'><option value="">'+esc(tr("Auto")+" ("+nm(auto)+")")+'</option>'
    +list.filter(function(k){ return k.active!==false; }).map(function(k){ return '<option value="'+attr(k.id)+'"'+(k.id===pick?' selected':'')+'>'+esc(nm(k.id))+'</option>'; }).join("")+'</select></label>'; }
function kindPick(id,v){ var t=task(id); if(!t||!canI.editTask(t)) return;
  editTaskWith(t,function(x){ var m=taskMeta(x), e; if(v) m.kind=v; else delete m.kind;
    if(!m.effortManual&&(m.effortAuto||!(+x.effort>0))&&!isClosed(x)&&!scoringEstimateLock(x)&&(e=effortEstimate(x))) effortApply(x,e); }); }

/* ---------- Settings → Smart Scoring → Kinds of work ---------- */
function skKinds(){ return scGet("kinds")||[]; }
function scoringKindsSettingsHtml(ro,ed){ if(!SC.draft) return "";
  return scSection("kinds","Kinds of work",SK_LINE,scHelp(SK_INTRO)+'<div id="skList">'+skListHtml(ro)+'</div>'+scHelp(SC_T.next,SC_T.nextEx)
    +'<div class="field scr-ktest"><label for="skTest">'+tr("Try a title")+'</label><input id="skTest" value="'+attr(SK.test)+'" placeholder="Podcast episode 12" oninput="SK.test=this.value;skTestPaint()"><div id="skTestOut" class="scr-kout" aria-live="polite">'+esc(skTestText())+'</div></div>',
    {icon:I.tiles,example:SK_EG}); }
function skListHtml(ro){ var l=skKinds();
  return l.map(function(k,i){ return skRowHtml(k,i,l.length,ro); }).join("")+(ro?'':'<button type="button" class="btn sm" onclick="skAdd()"'+(l.length>=ScoringEngine.KIND_LIMITS.kinds?' disabled':'')+'>'+I.plus+tr("Add kind of work")+'</button>'); }
function skRowHtml(k,i,n,ro){ var p="kinds."+i, h="hours.templates."+k.id, kw=Array.isArray(k.keywords)?k.keywords.join(", "):String(k.keywords||"");
  var txt=function(f,label,v){ var id="sk"+i+"_"+f; return '<div class="field"><label for="'+id+'">'+tr(label)+'</label><input id="'+id+'" data-sc="'+p+'.'+f+'" data-k="str" value="'+attr(v)+'"'+(ro?' disabled':' oninput="scInput(this);skTestPaint()"')+'></div>'; };
  var num=function(path,label,o){ return scNumHtml("sk"+i+"_"+path.split(".").pop(),path,label,Object.assign({ro:ro,min:0.05,max:200,step:0.25},o)); };
  var btn=function(fn,ico,label,off){ return '<button type="button" class="iconbtn" onclick="'+fn+'" title="'+attr(tr(label))+'"'+(off?' disabled':'')+'>'+ico+'</button>'; };
  return '<div class="scr-ap scr-krow'+(k.active===false?' off':'')+'" data-kind="'+attr(k.id)+'"><div class="scr-ktop">'
    +(ro?'':btn("skMove("+i+",-1)",I.arrowup,"Move up",!i)+btn("skMove("+i+",1)",I.arrowdn,"Move down",i>=n-1))
    +txt("name","Name",k.name)+txt("nameId","Name in Indonesian",k.nameId)
    +scSwitchHtml(p+".active",tr("On")+" "+skName(k),ro).replace("scSwitch(this)","skSwitch(this)")
    +(k.builtIn?'<span class="badge">'+tr("Built-in")+'</span>':ro?'':btn("skDel("+i+")",I.trash,"Delete"))+'</div>'
    +txt("keywords","Words in the title",kw)
    +'<div class="scr-grid scr-knums">'+num(h+".perUnit","First (h)")+num(h+".low","Low (h)")+num(h+".high","High (h)")
    +num(h+".nextUnitFactor","Each next (× first)",{min:0,max:1,step:0.05})+num("assets.perKind."+k.id,"Points per asset",{min:0,max:20})+'</div></div>'; }
function skPaint(id,d){ var el=document.getElementById("skList"); if(!el) return; el.innerHTML=skListHtml(!canI.scoringConfigure()); skTestPaint(); scBarPaint();
  var r=id&&el.querySelector('[data-kind="'+id+'"]'), b=r&&r.querySelectorAll(".scr-ktop .iconbtn")[d<0?0:1]; if(r&&(!b||b.disabled)) b=r.querySelector(".scr-ktop button:not([disabled])"); if(b) b.focus(); }
function skSwitch(b){ scSwitch(b); b.closest(".scr-krow").classList.toggle("off",!b.classList.contains("on")); skTestPaint(); }
function skMove(i,d){ var l=skKinds(), j=i+d; if(j<0||j>=l.length) return; var x=l[i]; l[i]=l[j]; l[j]=x; l.forEach(function(k,n){ k.order=n; }); SC.dirty=true; skPaint(x.id,d); }
function skAdd(){ var l=skKinds(); if(l.length>=ScoringEngine.KIND_LIMITS.kinds) return;
  l.push({id:"k_"+Math.random().toString(36).slice(2,10),name:"",nameId:"",keywords:[],builtIn:false,active:true,order:l.length}); SC.dirty=true; skPaint(); document.getElementById("sk"+(l.length-1)+"_name").focus(); }
function skDel(i){ var l=skKinds(), k=l[i]; if(!k||k.builtIn) return; var n=TASKS.filter(function(t){ return (t.meta||{}).kind===k.id; }).length;
  confirmModal(fmt(tr("Delete {kind}?"),{kind:skName(k)}),esc(fmt(tr("Gone when you save. Tasks that chose it ({n}) go back to their title's kind."),{n:n})),function(){
    l.splice(i,1); l.forEach(function(x,j){ x.order=j; }); [scGet("hours.templates"),scGet("assets.perKind")].forEach(function(o){ if(o) delete o[k.id]; }); SC.dirty=true; skPaint(); },true); }
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
  "Kind of work removed: read from the title again":"Jenis pekerjaan dihapus: dibaca dari judul lagi"
});
</script>
<style>
.scr-kpick{display:inline-flex;align-items:center;gap:6px}
.scr-kpick select{font-size:12px;max-width:200px;border-radius:6px}
.scr-krow{margin-bottom:8px}
.scr-krow.off{opacity:.65}
.scr-ktop{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px 10px}
.scr-ktop .field{flex:1 1 150px;min-width:0}
.scr-ktop .switch,.scr-ktop .badge{align-self:center}
.scr-krow .field,.scr-knums{margin:0}.scr-ktest{margin-top:12px}
.scr-knums{grid-template-columns:repeat(auto-fill,minmax(112px,1fr));align-items:end}
.scr-kout{margin-top:6px;font-weight:600}
</style>
