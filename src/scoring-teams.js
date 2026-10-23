<script>
/* ============================================================
   SMART SCORING ON THE TEAMS SCREEN (Oct 2026)
   The owner asked for the team to see its Smart Scoring numbers where it already looks at its workload: "tampilkan
   juga di team … bentuknya bar juga dibawah effort hour". So, while Smart Scoring is on, small bars sit right under
   the effort-hours (utilization) bar — on each team card of the Teams screen, under each person's workload bar (the
   Teams screen's "Workload by person", a team page's "Workload"), and as a strip of the team's own bars under a
   team page's figures:
   - points done against points planned, one bar per points module switched on (Story Points, Weighted Points, Asset
     points): the points of the tasks due in the last 4 weeks (Declined left out), and how much of them is done.
     Text beside it: "34 / 40 pts · 85%"; nothing planned says so instead of drawing an empty bar;
   - estimate accuracy (while Effort Hours is on): of the tasks completed in the last 4 weeks with a locked estimate
     and time logged in the time log, how many took within ±20 % — "7 of 9 tasks within ±20% · 78%"; without such a
     task "no data yet", never 0 %.
   Each bar says what it counts on hover, and a tap opens the same words under it (the rest of the card or row still
   opens the team or the person). The numbers are the server's (GET /api/scoring/teams, server/scoring-teams.js),
   which also decides whose bars are sent: every team's to every member; a person's to themselves, to the lead of
   their team and to whoever holds scoring_view_analytics — or to everyone, when an admin chooses that in Settings →
   Smart Scoring → Teams screen (the section is drawn here too). Stakeholders see none. People keep their order:
   nothing is sorted or ranked by these numbers.
   Nothing blinks: the screen is drawn with the bars of the last answer at once, the answer is fetched again in the
   background at most every 30 s (at once when the Smart Scoring settings change), and a block is painted again only
   when its markup changed. Smart Scoring off, or the offline demo (which has no server to count with): the Teams
   screen is exactly as before. Bilingual through tr() and this file's Indonesian entries.
   ============================================================ */
var SCR_TB={cache:null,at:0,loading:false,owner:null,cv:null,open:{}};
var SCR_TB_BARS=["story","weighted","assets","accuracy"];
var SCR_TB_LABEL={story:"Story Points",weighted:"Weighted Points",assets:"Asset points",accuracy:"Estimate accuracy"};
var SCR_TB_MODES={self_and_leads:"Themselves, their team's lead and analytics holders",everyone:"Everyone in the workspace"};
/* what each bar counts, for a team and for a person */
var SCR_TB_WHY={
  team:{story:"The story points of this team's tasks due in the last 4 weeks (Declined left out), and how much of them is done: the task completed in a completed stage.",
    weighted:"The weighted points of this team's tasks due in the last 4 weeks (Declined left out), and how much of them is done: the task completed in a completed stage.",
    assets:"The asset points of this team's tasks due in the last 4 weeks (Declined left out), by the kind of work, and how much of them is done: the task completed in a completed stage.",
    accuracy:"Of this team's tasks completed in the last 4 weeks with a locked estimate and time logged in the time log, how many took within 20% of the estimate."},
  person:{story:"The story points of the tasks this person is assigned to, due in the last 4 weeks (Declined left out), and how much of them is done. A task shared by several people counts an equal share for each.",
    weighted:"The weighted points of the tasks this person is assigned to, due in the last 4 weeks (Declined left out), and how much of them is done. A task shared by several people counts an equal share for each.",
    assets:"The asset points credited to this person on the tasks due in the last 4 weeks (Declined left out), and how much of them is done.",
    accuracy:"Of the tasks this person is assigned to, completed in the last 4 weeks with a locked estimate and time logged in the time log, how many took within 20% of the estimate."}};

function scrTbReady(){ return !!(API.on&&typeof scoringOn==="function"&&scoringOn()&&!scoringStakeholder()); }
function scrTbMode(){ var s=scoringSettings(); return s&&s.teams&&s.teams.memberBars==="everyone"?"everyone":"self_and_leads"; }
function scrTbFill(key,vars){ var s=tr(key); return typeof ScoringEngine!=="undefined"?ScoringEngine.fill(s,vars||{}):s; }
function scrTbNum(v,dec){ try{ return (+v).toLocaleString(UI_LANG==="id"?"id-ID":"en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec}); }catch(e){ return (+v).toFixed(dec); } }
/* whole points as whole numbers; any part of a point and both carry two decimals */
function scrTbPts(a,b){ var dec=Math.abs(a%1)>1e-9||Math.abs(b%1)>1e-9?2:0; return [scrTbNum(a,dec),scrTbNum(b,dec)]; }
/* a bar module switched on now (the answer may be older than the settings) */
function scrTbOn(k){ return k==="accuracy"?scoringModuleOn("hours"):scoringModuleOn(k); }
/* the page's own copy of the server's rule, so an answer from before a change of the setting never shows a colleague */
function scrTbMaySee(id){ if(id===ME||scrTbMode()==="everyone"||canI.scoringViewAnalytics()) return true;
  return activeTeams().some(function(t){ return t.lead===ME&&teamMembers(t.id).indexOf(id)>=0; }); }

/* ---------- the answer, kept and fetched in the background ---------- */
function scrTbCv(){ var s=scoringSettings(); return s?s.configVersion:null; }
/* someone else signed in, or acting as someone else, on this page: nothing of the last person's answer is drawn */
function scrTbOwner(){ if(SCR_TB.owner!==ME){ SCR_TB.cache=null; SCR_TB.at=0; SCR_TB.open={}; SCR_TB.owner=ME; } }
function scrTbLoad(force){ if(!scrTbReady()) return; scrTbOwner();
  var cv=scrTbCv(); if(SCR_TB.at&&SCR_TB.cv!==cv) force=true;
  if(SCR_TB.loading||(!force&&SCR_TB.at&&Date.now()-SCR_TB.at<30000)) return;
  SCR_TB.loading=true; var me=ME;
  apiFetch("GET","/api/scoring/teams").then(function(r){ SCR_TB.loading=false; if(me!==ME) return; SCR_TB.at=Date.now(); SCR_TB.cv=cv; SCR_TB.cache=r; scrTbDecorate(); },
    function(){ SCR_TB.loading=false; if(me!==ME) return; SCR_TB.at=Date.now(); SCR_TB.cv=cv; scrTbDecorate(); }); }

/* ---------- a block of bars ---------- */
function scrTbRow(k,b,ctx){
  var why=tr(SCR_TB_WHY[ctx][k]), n=k==="accuracy"?0:b.notScored||0, text, w=null;
  if(n) why+=" "+scrTbFill(n===1?"{n} task without a score is left out.":"{n} tasks without a score are left out.",{n:n});
  if(k==="accuracy"){ if(b.tasks>0&&b.share!=null){ w=b.share; text=scrTbFill(b.tasks===1?"{within} of {tasks} task within ±20% · {pct}%":"{within} of {tasks} tasks within ±20% · {pct}%",{within:b.within,tasks:b.tasks,pct:b.share}); } else text=tr("no data yet"); }
  else if(b.planned>0&&b.pct!=null){ var p=scrTbPts(b.done,b.planned); w=b.pct; text=scrTbFill("{done} / {planned} pts · {pct}%",{done:p[0],planned:p[1],pct:b.pct}); }
  else text=tr("nothing planned yet"); /* the period is in the heading: the card is narrow */
  return '<button type="button" class="scr-tb-row'+(w===null?' nd':'')+'" data-bar="'+k+'" title="'+attr(why)+'" onclick="event.stopPropagation();scrTbToggle(this)"><span class="scr-tb-g"><span class="scr-tb-k">'+esc(tr(SCR_TB_LABEL[k]))+'</span>'
    + (w===null?'':'<span class="track scr-tb-track" role="img" aria-label="'+attr(tr(SCR_TB_LABEL[k])+": "+text)+'"><i style="width:'+Math.max(0,Math.min(100,w))+'%"></i></span>')
    + '<span class="scr-tb-n">'+esc(text)+'</span></span></button>'; }
/* the inside of a block: its bars (each module on), and what they count once opened; "" = nothing to show */
function scrTbInner(key,bars,ctx,head){
  var ks=SCR_TB_BARS.filter(function(k){ return bars&&bars[k]&&scrTbOn(k); }); if(!ks.length) return "";
  var open=!!SCR_TB.open[key];
  var h=head?'<div class="scr-tb-h"><span>'+esc(tr("Smart Scoring · last 4 weeks"))+'</span><button type="button" class="scr-tb-i" aria-expanded="'+open+'" aria-label="'+attr(tr("What these bars count"))+'" title="'+attr(tr("What these bars count"))+'" onclick="event.stopPropagation();scrTbToggle(this)">?</button></div>':'';
  h+='<div class="scr-tb-rows">'+ks.map(function(k){ return scrTbRow(k,bars[k],ctx); }).join("")+'</div>';
  if(open) h+='<div class="scr-tb-why" onclick="event.stopPropagation()">'+ks.map(function(k){ return '<p><b>'+esc(tr(SCR_TB_LABEL[k]))+'</b> — '+esc(tr(SCR_TB_WHY[ctx][k]))+'</p>'; }).join("")
    + '<p>'+esc(tr(head?"Over the last 4 weeks. Operational figures for learning, not a ranking.":"Over the last 4 weeks (Smart Scoring). Operational figures for learning, not a ranking."))+'</p></div>';
  return h; }
function scrTbToggle(el){ var box=el.closest("[data-scr-tb]"); if(!box) return; var k=box.getAttribute("data-scr-tb"); SCR_TB.open[k]=!SCR_TB.open[k]; scrTbDecorate(); }

/* ---------- where the blocks go: under each utilization bar ---------- */
function scrTbTargets(){ var out=[], c=document.getElementById("content"); if(!c||S.screen!=="teams") return out;
  if(S.teamId){ var t=team(S.teamId), k=c.querySelector(".kpis.team-kpis"); if(t&&k) out.push({key:"team:"+t.id,ctx:"team",id:t.id,after:k,strip:true,tc:teamColorCss(t.color)}); }
  else Array.prototype.forEach.call(c.querySelectorAll(".tcard[data-team]"),function(card){ var tr_=card.querySelector(".wl .track"); if(tr_) out.push({key:"team:"+card.getAttribute("data-team"),ctx:"team",id:card.getAttribute("data-team"),after:tr_}); });
  /* each person's workload row (workloadRows: a .wl that opens the person) */
  Array.prototype.forEach.call(c.querySelectorAll(".wl.click"),function(row){ var m=/go\('team','([^']+)'\)/.exec(row.getAttribute("onclick")||""), tr_=row.querySelector(".track"); if(m&&tr_) out.push({key:"person:"+m[1],ctx:"person",id:m[1],after:tr_}); });
  return out; }
function scrTbInnerFor(x){ var r=SCR_TB.cache; if(!r) return "";
  if(x.ctx==="team"){ var t=(r.teams||[]).filter(function(y){ return y.id===x.id; })[0]; return t?scrTbInner(x.key,t.bars,"team",true):""; }
  var p=r.people&&r.people[x.id]; return p&&scrTbMaySee(x.id)?scrTbInner(x.key,p.bars,"person",false):""; }
/* puts each block in place, or paints it again only when its markup changed; removes one with nothing to show */
function scrTbDecorate(){ if(!scrTbReady()) return; scrTbOwner();
  scrTbTargets().forEach(function(x){
    var inner=scrTbInnerFor(x), next=x.after.nextElementSibling, wrap=next&&next.matches(x.strip?".scr-tb-panel":".scr-tb")?next:null, box=wrap?(x.strip?wrap.querySelector(".scr-tb"):wrap):null;
    if(!inner){ if(wrap) wrap.remove(); return; }
    if(box){ if(box.__scrTb!==inner){ box.innerHTML=inner; box.__scrTb=inner; } return; }
    var h='<div class="scr-tb'+(x.ctx==="person"?' scr-tb-person':'')+'" data-scr-tb="'+attr(x.key)+'">'+inner+'</div>';
    if(x.strip) h='<section class="panel scr-tb-panel" style="--tc:'+attr(x.tc)+'"><div class="panel-body">'+h+'</div></section>';
    x.after.insertAdjacentHTML("afterend",h);
    var made=x.after.nextElementSibling; box=x.strip?made.querySelector(".scr-tb"):made; if(box) box.__scrTb=inner; }); }

/* the Teams screen and a team's page, wrapped: drawn with the bars at once, the answer refreshed behind */
(function(){ if(typeof renderTeams!=="function") return; var base=renderTeams; renderTeams=function(){ var out=base.apply(this,arguments); try{ if(scrTbReady()){ scrTbDecorate(); scrTbLoad(false); } }catch(e){ console.error(e); } return out; }; })();
(function(){ if(typeof renderTeamDetail!=="function") return; var base=renderTeamDetail; renderTeamDetail=function(){ var out=base.apply(this,arguments); try{ if(scrTbReady()){ scrTbDecorate(); scrTbLoad(false); } }catch(e){ console.error(e); } return out; }; })();

/* ---------- Settings → Smart Scoring: who sees each person's bars ---------- */
/* the two choices as cards, each with what it costs */
function scoringTeamsSettingsHtml(ro,ed){
  if(typeof scGet!=="function"||typeof sp!=="function"||typeof scSection!=="function") return "";
  if(ed===undefined) ed=canI.scoringConfigure(); if(ro===undefined) ro=!ed;
  var cur=scGet("teams.memberBars")==="everyone"?"everyone":"self_and_leads";
  var card=function(v,why,tag){ return '<label class="scr-radio"><input type="radio" name="sc_tm_bars" id="sc_tm_bars_'+v+'" value="'+v+'" data-sc="teams.memberBars" data-k="str"'+(cur===v?' checked':'')+(ro?' disabled':' onchange="scInput(this)"')+'><span><b>'+tr(SCR_TB_MODES[v])+(tag?' <span class="badge">'+tag+'</span>':'')+'</b><span class="hint">'+why+'</span></span></label>'; };
  return scSection("teams",tr("Teams screen"),tr("While Smart Scoring is on, the Teams screen shows small bars under each workload bar: points done against planned, and how close estimates were."),
    '<fieldset class="scr-radios"><legend>'+tr("Who sees each person's bars on Teams")+'</legend>'
    + card("self_and_leads",tr("Safer: the numbers stay a tool for learning, and nobody compares colleagues."),tr("Recommended"))
    + card("everyone",tr("More open, but people may compare and rank one another."))+'</fieldset>'
    + scHelp(tr("Every member always sees each team's bars; stakeholders never see any.")),
    {icon:I.team,example:tr("with the safer choice, a designer sees their own bars, and their team's lead sees each member's.")}); }
/* the setting's changes in the tab's history, in words */
(function(){ if(typeof scPathLabel!=="function") return; var base=scPathLabel; scPathLabel=function(p){ if(p==="teams.memberBars") return tr("Teams screen")+" · "+tr("Who sees each person's bars on Teams"); return base.apply(this,arguments); }; })();
(function(){ if(typeof scVal!=="function") return; var base=scVal; scVal=function(path,v){ if(path==="teams.memberBars"&&SCR_TB_MODES[v]) return tr(SCR_TB_MODES[v]); return base.apply(this,arguments); }; })();

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Story Points":"Story Points","Weighted Points":"Weighted Points","Asset points":"Poin aset","Estimate accuracy":"Akurasi estimasi",
  "Smart Scoring · last 4 weeks":"Smart Scoring · 4 minggu terakhir","What these bars count":"Apa yang dihitung bar ini",
  "{done} / {planned} pts · {pct}%":"{done} / {planned} poin · {pct}%","nothing planned yet":"belum ada yang direncanakan",
  "{within} of {tasks} task within ±20% · {pct}%":"{within} dari {tasks} task dalam ±20% · {pct}%","{within} of {tasks} tasks within ±20% · {pct}%":"{within} dari {tasks} task dalam ±20% · {pct}%",
  "no data yet":"belum ada data",
  "{n} task without a score is left out.":"{n} task tanpa skor tidak dihitung.","{n} tasks without a score are left out.":"{n} task tanpa skor tidak dihitung.",
  "The story points of this team's tasks due in the last 4 weeks (Declined left out), and how much of them is done: the task completed in a completed stage.":"Story Points dari task tim ini yang tenggatnya dalam 4 minggu terakhir (kecuali Declined), dan berapa yang sudah selesai: task-nya selesai di tahap selesai.",
  "The weighted points of this team's tasks due in the last 4 weeks (Declined left out), and how much of them is done: the task completed in a completed stage.":"Weighted Points dari task tim ini yang tenggatnya dalam 4 minggu terakhir (kecuali Declined), dan berapa yang sudah selesai: task-nya selesai di tahap selesai.",
  "The asset points of this team's tasks due in the last 4 weeks (Declined left out), by the kind of work, and how much of them is done: the task completed in a completed stage.":"Poin aset dari task tim ini yang tenggatnya dalam 4 minggu terakhir (kecuali Declined), menurut jenis pekerjaannya, dan berapa yang sudah selesai: task-nya selesai di tahap selesai.",
  "Of this team's tasks completed in the last 4 weeks with a locked estimate and time logged in the time log, how many took within 20% of the estimate.":"Dari task tim ini yang selesai dalam 4 minggu terakhir dengan estimasi terkunci dan waktu tercatat di catatan waktu, berapa yang selesai dalam selisih 20% dari estimasinya.",
  "The story points of the tasks this person is assigned to, due in the last 4 weeks (Declined left out), and how much of them is done. A task shared by several people counts an equal share for each.":"Story Points dari task yang ditugaskan kepada orang ini dan tenggatnya dalam 4 minggu terakhir (kecuali Declined), dan berapa yang sudah selesai. Task yang dikerjakan beberapa orang dihitung sama rata untuk tiap orang.",
  "The weighted points of the tasks this person is assigned to, due in the last 4 weeks (Declined left out), and how much of them is done. A task shared by several people counts an equal share for each.":"Weighted Points dari task yang ditugaskan kepada orang ini dan tenggatnya dalam 4 minggu terakhir (kecuali Declined), dan berapa yang sudah selesai. Task yang dikerjakan beberapa orang dihitung sama rata untuk tiap orang.",
  "The asset points credited to this person on the tasks due in the last 4 weeks (Declined left out), and how much of them is done.":"Poin aset yang dikreditkan kepada orang ini pada task yang tenggatnya dalam 4 minggu terakhir (kecuali Declined), dan berapa yang sudah selesai.",
  "Of the tasks this person is assigned to, completed in the last 4 weeks with a locked estimate and time logged in the time log, how many took within 20% of the estimate.":"Dari task yang ditugaskan kepada orang ini dan selesai dalam 4 minggu terakhir dengan estimasi terkunci dan waktu tercatat di catatan waktu, berapa yang selesai dalam selisih 20% dari estimasinya.",
  "Over the last 4 weeks. Operational figures for learning, not a ranking.":"Selama 4 minggu terakhir. Angka operasional untuk belajar, bukan peringkat.",
  "Over the last 4 weeks (Smart Scoring). Operational figures for learning, not a ranking.":"Selama 4 minggu terakhir (Smart Scoring). Angka operasional untuk belajar, bukan peringkat.",
  "Teams screen":"Layar Tim","Who sees each person's bars on Teams":"Siapa yang melihat bar tiap orang di Tim",
  "Themselves, their team's lead and analytics holders":"Dirinya sendiri, lead timnya, dan pemegang analitik","Everyone in the workspace":"Semua orang di workspace",
  "While Smart Scoring is on, the Teams screen shows small bars under each workload bar: points done against planned, and how close estimates were.":"Selama Smart Scoring menyala, layar Tim menampilkan bar kecil di bawah setiap bar beban kerja: poin yang selesai dibanding yang direncanakan, dan seberapa dekat estimasinya.",
  "Recommended":"Disarankan","Safer: the numbers stay a tool for learning, and nobody compares colleagues.":"Lebih aman: angkanya tetap menjadi alat belajar, dan tidak ada yang membandingkan rekan kerja.",
  "More open, but people may compare and rank one another.":"Lebih terbuka, tetapi orang bisa saling membandingkan dan memeringkat.",
  "Every member always sees each team's bars; stakeholders never see any.":"Setiap anggota selalu melihat bar tiap tim; stakeholder tidak pernah melihatnya.",
  "with the safer choice, a designer sees their own bars, and their team's lead sees each member's.":"dengan pilihan yang lebih aman, seorang desainer melihat bar miliknya sendiri, dan lead timnya melihat bar setiap anggota."
});
</script>
<style>
.scr-tb{margin-top:8px;display:flex;flex-direction:column;gap:4px;min-width:0}
.scr-tb-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:650;color:var(--color-text-tertiary);letter-spacing:.01em}
.scr-tb-i{flex:none;width:18px;height:18px;border-radius:50%;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-secondary);font:inherit;font-size:10.5px;font-weight:750;line-height:16px;padding:0;cursor:pointer}
.scr-tb-i[aria-expanded="true"]{background:var(--color-surface-sunken);color:var(--color-text-primary)}
.scr-tb-rows{display:flex;flex-direction:column;gap:4px;min-width:0}
/* each bar: label and numbers on a line with the bar under them where it is narrow (a card, a phone); all on one line
   where there is room (a person's workload row) */
.scr-tb-row{display:block;width:100%;min-width:0;padding:1px 0;margin:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:help;border-radius:4px;container-type:inline-size}
.scr-tb-row:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
.scr-tb-g{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);grid-template-areas:"k n" "t t";align-items:center;gap:2px 8px;min-width:0}
.scr-tb-k{grid-area:k;min-width:0;font-size:11px;font-weight:600;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.scr-tb .track,.wl .scr-tb .track{grid-area:t;min-width:0;height:5px;margin:0;border-radius:3px;background:var(--color-surface-sunken);overflow:hidden;display:block}
.scr-tb .track i,.wl .scr-tb .track i{display:block;height:100%;background:var(--tc,var(--color-primary));border-radius:3px;opacity:.8}
.scr-tb-n{grid-area:n;justify-self:end;text-align:right;min-width:0;font-size:11px;color:var(--color-text-secondary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.scr-tb-row.nd .scr-tb-n{grid-column:2/-1;justify-self:end;font-style:italic;color:var(--color-text-tertiary)}
@container (min-width:420px){.scr-tb-g{grid-template-columns:116px minmax(60px,1fr) minmax(0,auto);grid-template-areas:"k t n"}}
.wl:has(.scr-tb-person){align-items:start}
.scr-tb-why{margin-top:2px;padding:6px 8px;border-radius:8px;background:var(--color-surface-sunken);font-size:11.5px;color:var(--color-text-secondary);cursor:default}
.scr-tb-why p{margin:0 0 4px}.scr-tb-why p:last-child{margin:0;color:var(--color-text-tertiary)}
.scr-tb-why b{color:var(--color-text-primary);font-weight:650}
.scr-tb-person{margin-top:6px}
.scr-tb-panel{margin-bottom:0}
.scr-tb-panel .panel-body{padding:12px 16px}
.scr-tb-panel .scr-tb{margin-top:0;gap:8px}
.scr-tb-panel .scr-tb-h{font-size:var(--fs-sm);color:var(--color-text-secondary)}
.scr-tb-panel .scr-tb-rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:6px 24px}
.scr-radios{border:0;margin:0;padding:0;display:grid;gap:8px;min-width:0}
.scr-radios legend{padding:0;margin-bottom:6px;font-weight:650}
.scr-radio{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--color-border);border-radius:10px;cursor:pointer}
.scr-radio:has(:checked){border-color:var(--color-primary);background:var(--color-primary-soft)}
.scr-radio:focus-within{outline:2px solid var(--color-primary);outline-offset:1px}
.scr-radio input{flex:none;width:auto;margin:3px 0 0}
.scr-radio>span{display:flex;flex-direction:column;gap:2px;min-width:0}
</style>
