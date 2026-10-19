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
  var list=estKindList(), pick=ScoringEngine.kindPick(tk,list), auto=ScoringEngine.kindOf(tk.title,list), lab=tr("Kind of work"), nm=function(id){ return id?estKindName(id):tr("none recognised"); };
  return '<label class="scr-kpick" data-scr-in="kind">'+lab+' <select'+(ed?' onchange="kindPick('+jsq(tk.id)+',this.value)"':' disabled')+'><option value="">'+esc(tr("Auto")+" ("+nm(auto)+")")+'</option>'
    +list.filter(function(k){ return k.active!==false; }).map(function(k){ return '<option value="'+attr(k.id)+'"'+(k.id===pick?' selected':'')+'>'+esc(nm(k.id))+'</option>'; }).join("")+'</select></label>'; }
function kindPick(id,v){ var t=task(id); if(!t||!canI.editTask(t)) return;
  editTaskWith(t,function(x){ var m=taskMeta(x), e; if(v) m.kind=v; else delete m.kind;
    if(!m.effortManual&&(m.effortAuto||!(+x.effort>0))&&!isClosed(x)&&!scoringEstimateLock(x)&&(e=effortEstimate(x))) effortApply(x,e); }); }

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
function skHit(k){ var q=String(SK.find||"").trim().toLowerCase(); if(!q) return true;
  return [k.name,k.nameId].concat(skWords(k)).some(function(x){ return String(x||"").toLowerCase().split("*").join("").indexOf(q)>=0; }); }
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
  "Low, high and each next":"Terendah, tertinggi, dan tiap berikutnya","No kind of work has “{q}” in its name or words.":"Tidak ada jenis pekerjaan dengan “{q}” di nama atau katanya."
});
</script>
<style>
.scr-kpick{display:inline-flex;align-items:center;gap:6px}
.scr-kpick select{font-size:12px;max-width:200px;border-radius:6px}
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
