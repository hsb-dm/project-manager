<script>
/* ============================================================
   EXPORT — client-side ZIP writer → .xlsx / .pptx, plus CSV & JSON backup
   No libraries: both Office formats are plain XML inside a ZIP.
   ============================================================ */
var CRC_T=(function(){ var t=[]; for (var n=0;n<256;n++){ var c=n; for (var k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
function crc32(u8){ var c=0xFFFFFFFF; for (var i=0;i<u8.length;i++) c=CRC_T[(c^u8[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipBytes(entries){ var enc=new TextEncoder(); var parts=[], cd=[], off=0; var dosTime=(12<<11)|(0<<5)|0, dosDate=((2026-1980)<<9)|(8<<5)|26;
  var u16=function(v){ return [v&255,(v>>8)&255]; }, u32=function(v){ return [v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255]; };
  entries.forEach(function(e){ var name=enc.encode(e.name); var data=typeof e.data==="string"?enc.encode(e.data):e.data; var crc=crc32(data);
    var lh=new Uint8Array([].concat(u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0)));
    parts.push(lh,name,data);
    cd.push(new Uint8Array([].concat(u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off))),name);
    off+=lh.length+name.length+data.length; });
  var cdLen=0; cd.forEach(function(p){ cdLen+=p.length; });
  var eocd=new Uint8Array([].concat(u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(cdLen),u32(off),u16(0)));
  var total=off+cdLen+eocd.length; var out=new Uint8Array(total); var p=0; parts.concat(cd,[eocd]).forEach(function(a){ out.set(a,p); p+=a.length; }); return out; }
function xml(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fileStamp(){ return WS.name.replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-creative-report-"+iso(0); }

/* §593-611 recommendation engine. External AI is preferred when it is
   configured and reachable; otherwise the internal engine runs on exactly the
   same metrics (§611) so the slide never contradicts the rest of the deck. */
/* §P0-5 configured AND allowed AND permitted for reporting. Eligibility alone
   never changes the source label — only a successful response does. */
function externalAiEligible(){
  if(typeof aiCfg!=="function") return false;
  var c=aiCfg();
  if(!c.processing.externalEnabled) return false;
  if(!c.processing.allowReporting) return false;
  return !!(c.chat.keySet||(typeof aiKey==="function"&&aiKey("chat"))||(typeof API!=="undefined"&&API.on));
}
/* §P0-5 the label the deck prints. Internal and external are different
   sentences, and the external one names the model the Admin registered. */
function internalAiLabel(){ return "Generated with ZenCrevia AI Intelligence"; }
function externalAiLabel(){
  var m=(typeof aiDefaultModel==="function"&&aiDefaultModel())||null;
  var name=(m&&m.name)||(typeof aiCfg==="function"&&aiCfg().chat.model)||"your AI provider";
  return "Generated with "+name;
}
function reportRecommendations(d){
  /* §P0-5 this function is the INTERNAL engine. It never claims an external
     source — only a validated provider response may relabel the slide. */
  var out={items:[],source:"internal",sourceLabel:internalAiLabel(),sample:0,confidence:"Indicative only"};
  var m=d.m||{}, people=d.people||[], projects=d.projects||[];
  out.sample=(typeof reportTasks==="function"?reportTasks().length:0);
  /* §603 be explicit about how much the numbers can carry */
  out.confidence=out.sample>=60?"High confidence":out.sample>=20?"Moderate confidence":"Low confidence — small sample";

  var add=function(title,detail){ out.items.push({title:title,detail:detail}); };
  /* §597 categories: delivery, quality, load, risk, process */
  if(m.overdueNow>0) add("Clear the overdue backlog first",
    m.overdueNow+" task(s) are past their due date. Re-date or reassign them before adding new work, otherwise the next sprint inherits the debt.");
  if(m.liveRevRate>35) add("Tighten the brief before production",
    "Revision rate is "+m.liveRevRate+"%. Most rework starts at the brief — an approval checkpoint on the brief usually costs less than a second production round.");
  var stretched=people.filter(function(p){ return p.cap&&p.assigned/p.cap>1; });
  if(stretched.length) add("Rebalance overloaded assignees",
    stretched.map(function(p){ return p.name; }).slice(0,3).join(", ")+" are booked above capacity. Move lower-priority work to people below 60% before the next planning round.");
  var slow=people.filter(function(p){ return p.completionRate!==null&&p.completionRate<40&&p.assignedTotal>=3; });
  if(slow.length) add("Check what is blocking slow-moving work",
    slow.map(function(p){ return p.name; }).slice(0,3).join(", ")+" are completing under 40% of assigned tasks. Look for dependencies or review queues rather than assuming a throughput problem.");
  var atRisk=projects.filter(function(p){ return p.status==="risk"||p.overdue>0; });
  if(atRisk.length) add("Review at-risk projects",
    atRisk.map(function(p){ return p.name; }).slice(0,3).join(", ")+" carry overdue work. Confirm scope and dates with the owners before the next status update.");
  if(m.approvalRate!==undefined&&m.approvalRate>=80&&m.liveRevRate<=20) add("Keep the current review pattern",
    "Approval rate is "+m.approvalRate+"% with a "+m.liveRevRate+"% revision rate. Whatever the review flow is doing now is working — document it before the team changes.");
  return out;
}

/* ============================================================
   §P1-6 PER-PERSON ASSET ATTRIBUTION
   Apportioning a task's assets evenly across its assignees is only an
   approximation: if one person made all four assets, splitting them 2/2 is
   simply wrong. Real creator metadata is used whenever it exists, and the
   report records whether the number is exact or attributed.

   Priority, highest first:
     1. version.createdBy   (who uploaded the deliverable)
     2. asset.createdBy     (who owns the linked asset record)
     3. producedByUserId    (explicit override on the task)
     4. task ownership      — approximate, and labelled as such
   ============================================================ */
function assetCreatorOf(v){ return (v&&(v.createdBy||v.producedByUserId||v.by))||null; }

/* Returns { by: {userId: count}, exact: bool } for one task. */
function taskAssetCredit(t){
  var total=+t.assetCount||0;
  if(!total) return {by:{},exact:true};
  var by={},add=function(id,n){ if(!id)return; by[id]=(by[id]||0)+n; };

  /* 3. an explicit override wins over anything inferred */
  var explicit=t.producedByUserId||t.producedBy;
  if(explicit){
    var ids=Array.isArray(explicit)?explicit.filter(Boolean):[explicit];
    if(ids.length){ ids.forEach(function(id){ add(id,total/ids.length); }); return {by:by,exact:true}; }
  }
  /* 1. version creators — the strongest signal we actually store */
  var creators=(t.versions||[]).map(assetCreatorOf).filter(Boolean);
  /* 2. linked asset records, for tasks that never carried a version */
  if(!creators.length&&typeof ASSETS!=="undefined"){
    creators=(ASSETS||[]).filter(function(a){ return a&&a.taskId===t.id; }).map(assetCreatorOf).filter(Boolean);
  }
  if(creators.length){
    /* weight by how many deliverables each person actually produced, so one
       person uploading every version is credited with every asset */
    var tally={},n=0;
    creators.forEach(function(id){ tally[id]=(tally[id]||0)+1; n++; });
    Object.keys(tally).forEach(function(id){ add(id,total*tally[id]/n); });
    return {by:by,exact:true};
  }
  /* 4. nothing to go on — fall back to task ownership and say so */
  var owners=(typeof assigneesOf==="function"?assigneesOf(t):[]).filter(Boolean);
  if(!owners.length) return {by:{},exact:false};
  owners.forEach(function(id){ add(id,total/owners.length); });
  return {by:by,exact:false};
}
/* Credit for one person across a task list. */
function personAssetCredit(userId,tasks){
  var n=0,approx=false;
  (tasks||[]).forEach(function(t){
    var c=taskAssetCredit(t), got=c.by[userId]||0;
    if(got){ n+=got; if(!c.exact) approx=true; }
  });
  return {count:Math.round(n),attributed:approx};
}

/* ============================================================
   §P0-5 EXTERNAL AI RECOMMENDATIONS — actually external
   The old flow could stamp "your configured AI provider" on advice that came
   from the local rules. Now the label is only applied after a real request
   returns a result that passes validation. Any failure falls back to the
   internal engine, keeps the internal label, and never blocks the export.
   ============================================================ */
var REPORT_REC_CACHE=null;

function reportRecPrompt(d){
  var m=d.m||{}, people=(d.people||[]).slice(0,12), projects=(d.projects||[]).slice(0,12);
  return "You are advising a creative operations team. Using ONLY the figures below, write between 3 and 5 recommendations.\n"
    + "Return STRICT JSON, no prose and no code fences: {\"items\":[{\"title\":\"...\",\"detail\":\"...\"}]}\n"
    + "title: max 60 characters, imperative. detail: 1-2 sentences, max 240 characters, quote the relevant number.\n\n"
    + "Period: "+reportPeriod()+"\n"
    + "Tasks completed: "+(m.totalCompleted||0)+", created: "+(m.totalCreated||0)+", overdue now: "+(m.overdueNow||0)+"\n"
    + "Revision rate: "+(m.liveRevRate||0)+"%, approval rate: "+(m.approvalRate||0)+"%, utilisation: "+(m.utilization||0)+"%\n"
    + "People: "+people.map(function(p){ return p.name+" (assigned "+p.assigned+"h of "+p.cap+"h, open "+p.open+", overdue "+p.overdue+", completion "+(p.completionRate===null?"n/a":p.completionRate+"%")+")"; }).join("; ")+"\n"
    + "Projects: "+projects.map(function(p){ return p.name+" ("+p.status+", open "+p.open+", overdue "+p.overdue+")"; }).join("; ");
}
/* §P0-5 a response is only usable if it really parses into the shape we asked
   for. A provider that returns prose, an empty list or junk counts as a
   failure and we fall back rather than printing whatever came back. */
function validateRecPayload(text){
  if(!text||typeof text!=="string") return null;
  var body=text.trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
  var start=body.indexOf("{"), stop=body.lastIndexOf("}");
  if(start<0||stop<=start) return null;
  var j; try{ j=JSON.parse(body.slice(start,stop+1)); }catch(e){ return null; }
  var raw=j&&Array.isArray(j.items)?j.items:null;
  if(!raw||!raw.length) return null;
  var items=raw.map(function(it){
      return {title:String((it&&it.title)||"").trim().slice(0,90),
              detail:String((it&&it.detail)||"").trim().slice(0,320)}; })
    .filter(function(it){ return it.title&&it.detail; })
    .slice(0,5);
  return items.length>=1?items:null;
}
function reportExternalRecommendations(d){
  var prompt=reportRecPrompt(d);
  var call;
  if(typeof API!=="undefined"&&API.on){
    call=apiFetch("POST","/api/ai/chat",{messages:[{role:"user",content:prompt}],context:""})
      .then(function(res){ return (res&&(res.text||res.reply))||""; });
  } else if(typeof aiDirectChatOnce==="function"){
    call=aiDirectChatOnce(prompt);
  } else {
    return Promise.reject(new Error("No external AI transport available"));
  }
  /* the deck must never hang on a slow provider (§11 AI failure never blocks
     core PPT generation) */
  var timeout=new Promise(function(_,rej){ setTimeout(function(){ rej(new Error("AI provider timed out")); },20000); });
  return Promise.race([call,timeout]).then(function(text){
    var items=validateRecPayload(text);
    if(!items) throw new Error("The AI provider returned an unusable result");
    return items;
  });
}
/* Resolve the recommendations for an export. Always resolves — never rejects. */
function resolveReportRecommendations(d){
  var internal=reportRecommendations(d);
  if(!externalAiEligible()) return Promise.resolve(internal);
  return reportExternalRecommendations(d).then(function(items){
    /* §P0-5 only NOW may the label say external */
    return {items:items,source:"external",sourceLabel:externalAiLabel(),
            sample:internal.sample,confidence:internal.confidence};
  }).catch(function(e){
    /* §11 fall back to internal intelligence; the label stays truthful */
    if(typeof console!=="undefined"&&console.warn) console.warn("External AI recommendations unavailable:",e&&e.message);
    internal.fallbackFrom=(e&&e.message)||"unavailable";
    return internal;
  });
}

/* ---------- report data (shared by PPT & Excel) ---------- */
function reportTasks(){ return exportTasks(); }
function reportData(){ var m=metrics(); var live=reportTasks(); var open=live.filter(function(t){ return !isClosed(t); }); var stages=WS.workflow.map(function(s){ return {name:s.name,kind:s.kind,n:live.filter(function(t){ return t.status===s.id; }).length}; });
  var people=Object.keys(PEOPLE).filter(function(k){ return !PEOPLE[k].stakeholder&&PEOPLE[k].cap>0&&(!EXPORT||live.some(function(t){return isAssignee(t,k);})); }).map(function(id){ var p=person(id); var mine=live.filter(function(t){ return isAssignee(t,id)&&!isClosed(t); }); return {id:id,name:p.name,role:p.role,team:teamName(primaryTeam(id)),cap:p.cap,assigned:Math.round(mine.reduce(function(n,t){return n+(+t.effort||0)/assigneesOf(t).length;},0)*100)/100,open:mine.length,review:mine.filter(isReview).length,overdue:mine.filter(function(t){ return t.due<0; }).length}; });
  var projects=liveProjects().filter(function(p){return !EXPORT||live.some(function(t){return t.proj===p.id;});}).map(function(p){ var o=live.filter(function(t){return t.proj===p.id&&!isClosed(t);}); return {id:p.id,name:p.name,owner:person(p.owner).name,status:p.status,progress:projectProgress(p,live),due:iso(p.due),start:iso(p.start),open:o.length,overdue:o.filter(function(t){ return t.due<0; }).length,total:live.filter(function(t){ return t.proj===p.id; }).length,team:p.team.map(function(x){ return first(x); }).join(", ")}; });
  /* §591 one canonical dataset — the per-person block reuses `live`, so the
     PPT, the Excel workbook and the AI slide can never disagree. */
  people.forEach(function(p){
    var all=live.filter(function(t){ return isAssignee(t,p.id); });
    var done=all.filter(isClosed);
    var share=function(t){ return 1/Math.max(1,assigneesOf(t).length); };
    p.assignedTotal=all.length;
    p.completed=done.length;
    /* §603 rates need a denominator; without one the metric is left null
       rather than shown as a fake zero (§570). */
    p.completionRate=all.length?Math.round(done.length/all.length*100):null;
    /* §P1-6 use real creator metadata where it exists; only fall back to task
       ownership when nothing else is recorded, and flag it when we do. */
    var credit=personAssetCredit(p.id,done);
    p.assetsProduced=credit.count;
    p.assetsAttributed=credit.attributed;
    var projIds={}; all.forEach(function(t){ if(t.proj) projIds[t.proj]=1; });
    p.projects=Object.keys(projIds);
    p.projectsInvolved=p.projects.length;
    p.topProjects=Object.keys(projIds).map(function(id){
        return {name:(project(id)||{name:id}).name,n:all.filter(function(t){ return t.proj===id; }).length}; })
      .sort(function(a,b){ return b.n-a.n; }).slice(0,3);
    /* §617 review metrics are version-based: each uploaded version is one
       reviewable outcome, which is more reliable than parsing the activity log. */
    var approvals=0,revisions=0,firstPass=0,reviewed=0;
    all.forEach(function(t){
      var vs=(t.versions||[]).filter(function(v){ return v.by===p.id; });
      var got=false;
      vs.forEach(function(v){
        if(v.state==="approved"){ approvals++; if(!got){ firstPass++; } got=true; }
        else if(v.state==="revision"){ revisions++; got=true; }
      });
      if(vs.some(function(v){ return v.state==="approved"||v.state==="revision"; })) reviewed++;
    });
    /* §581 first-pass approval — approved without a revision round first */
    p.tasksReviewed=reviewed;
    p.firstPassRate=reviewed?Math.round(firstPass/reviewed*100):null;
    p.reviewOutcomes=approvals+revisions;
    p.approvalRate=p.reviewOutcomes?Math.round(approvals/p.reviewOutcomes*100):null;
    p.revisionRate=p.reviewOutcomes?Math.round(revisions/p.reviewOutcomes*100):null;
    p.pendingReview=p.review;
    p.estimateTotal=Math.round(all.reduce(function(n,t){ return n+(+t.effort||0)*share(t); },0)*10)/10;
    p.estimateAvg=all.length?Math.round(p.estimateTotal/all.length*10)/10:null;
  });
  return {m:m,stages:stages,people:people,projects:projects,overdue:sortTasks(open.filter(function(t){ return t.due<0; })),upcoming:sortTasks(open.filter(function(t){ return t.due>=0&&t.due<=7; })),review:sortTasks(open.filter(isReview))}; }

/* ---------- CSV ---------- */
/* v31: a cell that starts with = + - @ (or tab/CR) is executed as a formula by Excel and
   Sheets ("CSV injection"). Text cells get a leading apostrophe; real numbers are kept. */
function csvSafe(v){ if(typeof v==="number") return String(v); v=String(v==null?"":v); return /^[=+\-@\t\r]/.test(v)&&!/^[-+]?\d+([.,]\d+)?%?$/.test(v)?"'"+v:v; }
function csvRows(rows){ return rows.map(function(r){ return r.map(function(v){ v=csvSafe(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); }).join("\r\n"); }
function taskRows(list){ var head=["ID","Title","Project","Team","Status","Priority","Assignee","Reviewer","Start","Due","Days to due","Effort (h)","Assets produced","Asset links","Final asset link","All asset links","Tags","Versions","Latest version state","Files","Comments"].map(tr).concat(WS.customFields.map(function(f){ return f.name; })); return [head].concat(list.map(function(t){ var lv=t.versions[t.versions.length-1]; var ls=taskAssetLinks(t); var fin=finalAssetLink(t); return [t.id,t.title,projName(t),teamName(t.team),stageName(t.status),prioL(t.prio),assigneesOf(t).map(function(id){return person(id).name;}).join("; "),reviewersOf(t).map(function(id){return person(id).name;}).join("; "),iso(t.due-t.span),iso(t.due),t.due,t.effort,assetCount(t),ls.length,fin?fin.url:"",ls.map(function(l){ return l.name+" -> "+l.url; }).join(" | "),t.tags.join("; "),t.versions.length,lv?lv.state:"",t.files.length,t.comments.length].concat(WS.customFields.map(function(f){ var v=t.custom[f.id]; return v===true?tr("Yes"):v===false?tr("No"):(v==null?"":v); })); })); }
var EXPORT=null; /* {from,to (day offsets), weeks, an} — set by exportModal, cleared after the export */
function exportTasks(){
  var base=TASKS.filter(function(t){ return !t._draft&&!t.tutorial&&!t.hidden&&!projArchived(t.proj); });
  if (!EXPORT) return base;
  var f=EXPORT;
  return base.filter(function(t){
    if (t.due<f.from||t.due>f.to) return false;
    if (f.teams&&f.teams.length&&f.teams.indexOf(t.team)<0) return false;
    if (f.projects&&f.projects.length&&f.projects.indexOf(t.proj)<0) return false;
    if (f.labels&&f.labels.length&&!(t.labels||[]).some(function(l){ return f.labels.indexOf(l)>=0; })) return false;
    if (f.people&&f.people.length&&!f.people.some(function(p){ return isAssignee(t,p); })) return false;
    if (f.status==="open"&&isClosed(t)) return false;
    if (f.status==="closed"&&!isClosed(t)) return false;
    return true;
  });
}
/* which sheets / slides the person asked for; everything when unset */
function exInc(key){ return !EXPORT||!EXPORT.include||EXPORT.include[key]!==false; }
function exScopeLine(){
  if (!EXPORT) return "";
  var bits=[];
  if (EXPORT.teams&&EXPORT.teams.length) bits.push(EXPORT.teams.map(function(id){ return teamName(id); }).join(", "));
  if (EXPORT.projects&&EXPORT.projects.length) bits.push(EXPORT.projects.length+" "+tr(EXPORT.projects.length===1?"project":"projects"));
  if (EXPORT.labels&&EXPORT.labels.length) bits.push(EXPORT.labels.map(function(id){ return (label(id)||{}).name; }).filter(Boolean).join(", "));
  if (EXPORT.people&&EXPORT.people.length) bits.push(EXPORT.people.map(function(id){ return person(id).name; }).join(", "));
  if (EXPORT.status&&EXPORT.status!=="all") bits.push(tr(EXPORT.status==="open"?"open only":"completed only"));
  return bits.length?bits.join(" \u00b7 "):tr("All teams");
}
var EX_SHEETS=[["summary","Summary"],["tasks","Tasks"],["taskassets","Task assets"],["projects","Projects"],["teams","Teams"],["workload","Workload"],["weekly","Weekly"],["pipeline","Pipeline"],["assets","Asset library"]];
var EX_SLIDES=[["kpis","Headline metrics"],["pipeline","Creative pipeline"],["throughput","Throughput"],["projects","Projects"],["teamload","Workload by team"],["workload","Workload by person"],["people","Performance by person"],["attention","Needs attention"],["airecs","AI recommendations"]];
var EXF={teams:[],projects:[],labels:[],people:[],status:"all",include:{}};

function exToggle(group,id,btn){
  var a=EXF[group], i=a.indexOf(id);
  if (i>=0) a.splice(i,1); else a.push(id);
  btn.classList.toggle("on",a.indexOf(id)>=0);
  exUpdateCount();
}
function exToggleInc(key,on){ EXF.include[key]=on; exUpdateCount(); }
function exAllInc(on){
  var list=window._exKind==="ppt"?EX_SLIDES:EX_SHEETS;
  list.forEach(function(x){ EXF.include[x[0]]=on; });
  document.querySelectorAll("[data-inc]").forEach(function(c){ c.checked=on; });
  exUpdateCount();
}
function exClearScope(){
  EXF.teams=[]; EXF.projects=[]; EXF.labels=[]; EXF.people=[]; EXF.status="all";
  document.querySelectorAll("[data-scope]").forEach(function(b){ b.classList.remove("on"); });
  var st=document.getElementById("ex_status"); if (st) st.value="all";
  exUpdateCount();
}
/* live preview of how many rows the current scope actually yields */
function exUpdateCount(){
  var el=document.getElementById("ex_count"); if (!el) return;
  var from=offsetFromIso(val("ex_from")), to=offsetFromIso(val("ex_to"));
  if (to<from){ var x=from; from=to; to=x; }
  var st=document.getElementById("ex_status"); EXF.status=st?st.value:"all";
  var save=EXPORT;
  EXPORT={from:from,to:to,teams:EXF.teams,projects:EXF.projects,labels:EXF.labels,people:EXF.people,status:EXF.status};
  var n=exportTasks().length, a=assetsProduced(exportTasks());
  EXPORT=save;
  var list=window._exKind==="ppt"?EX_SLIDES:EX_SHEETS;
  var inc=list.filter(function(x){ return EXF.include[x[0]]!==false; }).length;
  el.innerHTML='<b>'+n+'</b> '+tr(n===1?"task":"tasks")+' \u00b7 <b>'+a+'</b> '+tr("assets")+' \u00b7 '
    /* §P2-2 one selected option (e.g. Performance by person) can produce several
       physical pages, so counting "9 / 9 slides" is misleading. Count sections. */
    + (window._exKind==="csv"?'1 '+tr("file"):'<b>'+inc+'</b> '+tr("of")+' '+list.length+' '+tr(window._exKind==="ppt"?"report sections":"sheets"))
    + (n?'':' \u2014 <span style="color:var(--color-danger);font-weight:700">'+tr("nothing matches this scope")+'</span>');
}

function exportModal(kind){
  var titles={ppt:"PowerPoint report",xlsx:"Excel workbook",csv:"Tasks CSV"};
  var presets=[["4w","Last 4 weeks"],["8w","Last 8 weeks"],["month","This month"],["lastmonth","Last month"],["quarter","This quarter"],["custom","Custom"]];
  window._exKind=kind;
  EXF={teams:[],projects:[],labels:[],people:[],status:"all",include:{}};

  var period='<div class="field"><label>Period</label><div class="seg" id="ex_presets">'
    + presets.map(function(p,i){ return '<button class="'+(i===1?"on":"")+'" onclick="exportPreset(\''+p[0]+'\',this)">'+p[1]+'</button>'; }).join("")
    + '</div></div><div class="field-row">'
    + fieldHtml("ex_from","From",'<input id="ex_from" type="date" value="'+iso(-55)+'" onchange="exUpdateCount()">')
    + fieldHtml("ex_to","To",'<input id="ex_to" type="date" value="'+iso(0)+'" onchange="exUpdateCount()">')+'</div>';

  var chips=function(group,items){ return '<div class="chips">'+items.map(function(it){
    return '<button class="chipx" data-no-translate data-scope onclick="exToggle(\''+group+'\',\''+attr(it[0])+'\',this)">'+esc(it[1])+'</button>'; }).join("")+'</div>'; };

  var scope='<div class="field"><label>Teams <span class="hint" style="font-weight:400">\u00b7 none selected means every team</span></label>'
    + chips("teams",activeTeams().map(function(t){ return [t.id,t.name]; }))+'</div>'
    + '<div class="field"><label>Projects</label>'+chips("projects",liveProjects().map(function(p){ return [p.id,p.name]; }))+'</div>'
    + '<div class="field"><label>Labels</label>'+chips("labels",allLabels().map(function(l){ return [l.id,l.name]; }))+'</div>'
    + '<div class="field"><label>People</label>'+chips("people",Object.keys(PEOPLE).filter(function(id){ return PEOPLE[id].cap; }).map(function(id){ return [id,PEOPLE[id].name]; }))+'</div>'
    + fieldHtml("ex_status","Task state",selectHtml("ex_status",[["all","Everything in the period"],["open","Open tasks only"],["closed","Completed tasks only"]],"all",'onchange="exUpdateCount()"'));

  var list=kind==="ppt"?EX_SLIDES:EX_SHEETS;
  var include=kind==="csv"?'<p class="hint">A CSV is always a single table of tasks with every column. Use the scope above to narrow the rows.</p>'
    : '<div class="field"><label>'+(kind==="ppt"?"Slides":"Sheets")+' to include</label><div class="report-slide-options">'
      + list.map(function(x){ return '<label class="report-slide-chip"><input type="checkbox" data-inc checked onchange="exToggleInc(\''+x[0]+'\',this.checked)"><span class="report-slide-chip-label">'+esc(x[1])+'</span></label>'; }).join("")
      + '</div><div class="report-slide-actions"><button class="btn xs" onclick="exAllInc(true)">Select all</button><button class="btn xs ghost" onclick="exAllInc(false)">Clear all</button></div>'
      + (kind==="ppt"?'<div class="hint" style="margin-top:6px">The cover slide is always included.</div>':'')+'</div>';

  openModal("Export "+titles[kind],
    period
    + '<div class="eyebrow" style="margin:14px 0 8px">Scope</div>'+scope
    + '<div class="eyebrow" style="margin:16px 0 8px">Contents</div>'+include
    + '<div id="ex_count" class="hint" style="margin-top:12px;padding:9px 12px;border-radius:var(--radius);background:var(--color-surface-sunken)"></div>'
    + '<p class="hint" style="margin-top:8px">Includes tasks due within the selected period. Manually hidden tasks and archived projects are excluded.</p>',
    '<button class="btn ghost" onclick="exClearScope()">Reset scope</button><span class="spacer"></span><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="runExport()">'+I.download+'Export</button>', true);
  exUpdateCount();
}
function exportPreset(p,btn){ var d=new Date(TODAY); var from,to=0; if (p==="4w") from=-27; else if (p==="8w") from=-55; else if (p==="month"){ from=-(d.getDate()-1); to=Math.round((new Date(d.getFullYear(),d.getMonth()+1,0)-TODAY)/86400000); } else if (p==="lastmonth"){ var s=new Date(d.getFullYear(),d.getMonth()-1,1), en=new Date(d.getFullYear(),d.getMonth(),0); from=Math.round((s-TODAY)/86400000); to=Math.round((en-TODAY)/86400000); } else if (p==="quarter"){ var q=Math.floor(d.getMonth()/3)*3; var qs=new Date(d.getFullYear(),q,1), qe=new Date(d.getFullYear(),q+3,0); from=Math.round((qs-TODAY)/86400000); to=Math.round((qe-TODAY)/86400000); } else return; document.getElementById("ex_from").value=iso(from); document.getElementById("ex_to").value=iso(to); [].forEach.call(btn.parentNode.children,function(b){ b.classList.remove("on"); }); btn.classList.add("on"); exUpdateCount(); }
function runExport(){ var from=offsetFromIso(val("ex_from")), to=offsetFromIso(val("ex_to")); if (to<from){ var x=from; from=to; to=x; } var weeks=Math.max(1,Math.min(26,Math.ceil((to-from+1)/7))); var kind=window._exKind; closeModal();
  var go_=function(an){ EXPORT={from:from,to:to,weeks:weeks,an:an,label:dueDate(from)+" \u2192 "+dueDate(to),teams:EXF.teams.slice(),projects:EXF.projects.slice(),labels:EXF.labels.slice(),people:EXF.people.slice(),status:EXF.status,include:clone(EXF.include)}; EXPORT.an=demoAnalytics(); try { if (kind==="ppt") exportPPT(); else if (kind==="xlsx") exportXLSX(); else exportCSV(); } finally { EXPORT=null; } };
  go_(null); }
function exportCSV(){ download(fileStamp().replace("creative-report","tasks")+".csv",new Blob(["\uFEFF"+csvRows(taskRows(exportTasks()))],{type:"text/csv;charset=utf-8"})); toast("CSV exported"); }
function exportTaskCSV(id){ download(id+".csv",new Blob(["\uFEFF"+csvRows(taskRows([task(id)]))],{type:"text/csv;charset=utf-8"})); toast(id+" exported"); }

/* ---------- XLSX ---------- */
function colName(n){ var s=""; n++; while (n>0){ var r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; }
function buildXLSX(){ var d=reportData(), m=d.m;
  var summary=[["Metric","Value"]];
  var stages=[["Stage","Kind","Tasks"]].concat(d.stages.map(function(s){ return [s.name,s.kind,s.n]; }));
  var projects=[["Project","Owner","Status","Progress (%)","Start","Deadline","Open tasks","Overdue","Total tasks","Assets produced","Assets delivered","Asset links","Team"]].concat(d.projects.map(function(p){ var pt=exportTasks().filter(function(t){ return t.proj===p.id; }); return [p.name,p.owner,tr(p.status==="risk"?"At risk":p.status==="done"?"Done":"Active"),p.progress,p.start,p.due,p.open,p.overdue,p.total,assetsProduced(pt),assetsProduced(pt.filter(isClosed)),assetLinks(pt).length,p.team]; }));
  var workload=[["Member","Role","Team","Capacity (h)","Assigned (h)","Utilization (%)","Open tasks","In review","Overdue","Assets delivered"]].concat(d.people.map(function(p){ return [p.name,p.role,p.team,p.cap,p.assigned,p.cap?Math.round(p.assigned/p.cap*100):0,p.open,p.review,p.overdue,assetsProduced(exportTasks().filter(function(t){ return isAssignee(t,p.id)&&isClosed(t); }))]; }));
  var weekly=[["Week","Created","Completed","Overdue","Avg completion (d)","Revision rate (%)","Approval time (h)"]].concat(m.weeks.map(function(w,i){ return [w,m.created[i],m.completed[i],m.overdue[i],m.avgDays[i],Math.round(m.revisionRate[i]*100),m.approvalHrs[i]]; }));
  var assets=[["Asset","Type","Folder","Source","Location","Size","Version","Tags","Uploaded by"]].concat(ASSETS.map(function(a){ return [a.name,a.type,(byId(ASSET_FOLDERS,a.folder)||{name:""}).name,(SRC[srcOf(a)]||SRC.local).l,a.url,a.size,a.ver,a.tags.join("; "),person(a.by).name]; }));
  var teams=[["Team","Color","Members","Open tasks","Completed","Capacity (h)","Assigned (h)","Utilization (%)"]].concat(m.byTeam.map(function(t){ return [t.name,t.color,teamMembers(t.id).length,t.open,t.completed,t.capacity,t.assigned,t.utilization]; }));
  var taskAssets=[["Task ID","Task","Project","Team","Status","Completed","Assets produced","Link type","Version","Asset name","Asset link","Final"]];
  exportTasks().forEach(function(t){ var ls=taskAssetLinks(t); var fin=finalAssetLink(t);
    if (!ls.length){ taskAssets.push([t.id,t.title,projName(t),teamName(t.team),stageName(t.status),tr(isClosed(t)?"Yes":"No"),assetCount(t),"","","","",""]); return; }
    ls.forEach(function(l){ taskAssets.push([t.id,t.title,projName(t),teamName(t.team),stageName(t.status),tr(isClosed(t)?"Yes":"No"),assetCount(t),l.kind,l.v||"",l.name,l.url,(fin&&fin.url===l.url)?"final":""]); }); });
  summary=summary.map(function(r){return r.map(function(v){return typeof v==="string"?tr(v):v;});}); [stages,projects,workload,weekly,assets,teams,taskAssets].forEach(function(rows){rows[0]=rows[0].map(tr);});
  var allSheets=[["summary",tr("Summary"),summary,[26,22,34]],["tasks",tr("Tasks"),taskRows(exportTasks()),[8,42,24,16,14,10,16,16,12,12,10,10,14,10,52,64,22,9,16,7,9]],["taskassets",tr("Task assets"),taskAssets,[9,38,22,14,13,10,14,10,8,34,56,7]],["projects",tr("Projects"),projects,[26,16,10,12,12,12,11,9,11,14,14,11,30]],["teams",tr("Teams"),teams,[20,10,10,10,10,12,12,14]],["workload",tr("Workload"),workload,[20,18,16,12,12,14,11,10,9,15]],["weekly",tr("Weekly"),weekly,[10,9,10,9,16,14,16]],["pipeline",tr("Pipeline"),stages,[18,10,8]],["assets",tr("Asset library"),assets,[36,11,16,10,44,10,8,24,16]]];
  var sheets=allSheets.filter(function(x){ return exInc(x[0]); }).map(function(x){ return [x[1],x[2],x[3],x[0]]; });
  if (!sheets.length) sheets=[[tr("Summary"),summary,[26,22,34],"summary"]];
  var summaryIndex=sheets.findIndex(function(x){return x[3]==="summary";}), summaryName=summaryIndex>=0?sheets[summaryIndex][0]:null;
  var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map(function(s,i){ return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("")+'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
  var wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map(function(s,i){ return '<sheet name="'+xml(s[0])+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>'; }).join("")+'</sheets><definedNames>'+sheets.map(function(x,i){var sheet=xml("'"+x[0].replace(/'/g,"''")+"'!");return '<definedName name="_xlnm.Print_Area" localSheetId="'+i+'">'+sheet+(x[3]==='summary'?'$A$1:$O$43':'$A$1:$'+colName(x[1][0].length-1)+'$'+(x[1].length+3))+'</definedName>'+(x[3]==='summary'?'':'<definedName name="_xlnm.Print_Titles" localSheetId="'+i+'">'+sheet+'$1:$4</definedName>');}).join('')+'</definedNames></workbook>';
  var wbrels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map(function(s,i){ return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>'; }).join("")+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  var styles=REPORT_TEMPLATE.styles.replace(/1F4FD8/g,WS.theme.accent.slice(1).toUpperCase());
  var now=new Date().toISOString().replace(/\.\d+Z$/,"Z");
  var core='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xml(WS.name)+' — '+tr("Creative report")+'</dc:title><dc:creator>ZenCrevia</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+now+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+now+'</dcterms:modified></cp:coreProperties>';
  var app='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ZenCrevia</Application></Properties>';
  var entries=[{name:"[Content_Types].xml",data:ct},{name:"_rels/.rels",data:rels},{name:"docProps/core.xml",data:core},{name:"docProps/app.xml",data:app},{name:"xl/workbook.xml",data:wb},{name:"xl/_rels/workbook.xml.rels",data:wbrels},{name:"xl/styles.xml",data:styles}];
  var dashboard=summaryIndex>=0?reportDashboardXml(d,sheets):null;
  sheets.forEach(function(s,i){ entries.push({name:"xl/worksheets/sheet"+(i+1)+".xml",data:s[3]==="summary"?dashboard.xml:reportDetailXml(s[3],s[0],s[1],s[2],summaryName)}); });
  if(summaryIndex>=0){
    var chartData=dashboard,relNS='http://schemas.openxmlformats.org/package/2006/relationships',docNS='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    entries[0].data=ct.replace('</Types>','<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'+[1,2].map(function(i){return '<Override PartName="/xl/charts/chart'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';}).join('')+'</Types>');
    entries.push({name:'xl/worksheets/_rels/sheet'+(summaryIndex+1)+'.xml.rels',data:'<Relationships xmlns="'+relNS+'"><Relationship Id="rId1" Type="'+docNS+'drawing" Target="../drawings/drawing1.xml"/></Relationships>'});
    entries.push({name:'xl/drawings/drawing1.xml',data:reportDrawingXml()});
    entries.push({name:'xl/drawings/_rels/drawing1.xml.rels',data:'<Relationships xmlns="'+relNS+'">'+[1,2].map(function(i){return '<Relationship Id="rId'+i+'" Type="'+docNS+'chart" Target="../charts/chart'+i+'.xml"/>';}).join('')+'</Relationships>'});
    [0,1].forEach(function(i){entries.push({name:'xl/charts/chart'+(i+1)+'.xml',data:reportChartXml(i,summaryName,m,chartData.teams)});});
  }
  return zipBytes(entries); }
function exportXLSX(){ try { var bytes=buildXLSX(); download(fileStamp()+".xlsx",new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})); toast("Excel workbook exported"); } catch(e){ toast("Export failed: "+e.message,"bad"); } }

/* ---------- PPTX ---------- */
var EMU=914400; var SW=12192000, SH=6858000; var NS='xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
function pxE(inch){ return Math.round(inch*EMU); }
function ppRun(text,o){ o=o||{}; return '<a:r><a:rPr lang="en-US" sz="'+((o.sz||14)*100)+'"'+(o.b?' b="1"':'')+' dirty="0"><a:solidFill><a:srgbClr val="'+(o.color||"14171C")+'"/></a:solidFill><a:latin typeface="Poppins"/><a:cs typeface="Poppins"/></a:rPr><a:t>'+xml(text)+'</a:t></a:r>'; }
function ppPara(runs,o){ o=o||{}; return '<a:p><a:pPr algn="'+(o.algn||"l")+'"'+(o.bullet?'':' marL="0" indent="0"')+'>'+(o.bullet?'<a:buChar char="•"/>':'<a:buNone/>')+'</a:pPr>'+runs+'</a:p>'; }
function ppShape(id,x,y,w,h,o){ o=o||{}; var fill=o.fill?'<a:solidFill><a:srgbClr val="'+o.fill+'"/></a:solidFill>':'<a:noFill/>'; var ln=o.line?'<a:ln w="9525"><a:solidFill><a:srgbClr val="'+o.line+'"/></a:solidFill></a:ln>':'<a:ln><a:noFill/></a:ln>';
  var paras=o.paras||(o.text!==undefined?[ppPara(ppRun(o.text,o),o)]:[]);
  var tx=paras.length?'<p:txBody><a:bodyPr wrap="square" lIns="'+(o.inset===undefined?91440:o.inset)+'" tIns="45720" rIns="'+(o.inset===undefined?91440:o.inset)+'" bIns="45720" rtlCol="0" anchor="'+(o.anchor||"t")+'"><a:normAutofit/></a:bodyPr><a:lstStyle/>'+paras.join("")+'</p:txBody>':'<p:txBody><a:bodyPr rtlCol="0"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>';
  return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="Shape '+id+'"/><p:cNvSpPr'+(o.txBox?' txBox="1"':'')+'/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+pxE(x)+'" y="'+pxE(y)+'"/><a:ext cx="'+pxE(w)+'" cy="'+pxE(h)+'"/></a:xfrm>'+(o.geom==="ellipse"?'<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>':(o.fill||o.line)&&o.sharp!==true?'<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val '+(o.adj!=null?o.adj:(h<=0.5?50000:h<=1?25000:10000))+'"/></a:avLst></a:prstGeom>':'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>')+fill+ln+'</p:spPr>'+tx+'</p:sp>'; }
function slideXml(shapes,bg){ return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld '+NS+'><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+(bg||"EEF0F3")+'"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'+shapes.join("")+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'; }
var PPT_ICONS={}; var PPT_IMGS=[]; var CUR_IMGS=[];
function iconPng(name,color){ var key=name+"_"+color; if (PPT_ICONS[key]) return Promise.resolve(PPT_ICONS[key]); var raw=(I[name]||I.tasks).replace(/^<svg[^>]*>/,"").replace(/<\/svg>$/,""); var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="'+color+'" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+raw+'</svg>';
  return new Promise(function(res){ var img=new Image(); img.onload=function(){ var cv=document.createElement("canvas"); cv.width=96; cv.height=96; cv.getContext("2d").drawImage(img,0,0,96,96); var b64=cv.toDataURL("image/png").split(",")[1]; var bin=atob(b64); var u8=new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); PPT_ICONS[key]=u8; res(u8); }; img.onerror=function(){ PPT_ICONS[key]=null; res(null); }; img.src="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(svg))); }); }
function preparePptIcons(){ var names=["tasks","check","plus","bell","calendar","edit","eye","sync","team","kanban","analytics","projects","assets","image","link"]; var jobs=[]; names.forEach(function(n){ jobs.push(iconPng(n,"#FFFFFF")); jobs.push(iconPng(n,"#111214")); }); return Promise.all(jobs); }
function ppPic(id,x,y,w,h,name,color){ var key=name+"_"+(color||"#FFFFFF"); if (!PPT_ICONS[key]) return ""; if (PPT_IMGS.indexOf(key)<0) PPT_IMGS.push(key); if (CUR_IMGS.indexOf(key)<0) CUR_IMGS.push(key); var rid="rIdImg"+(PPT_IMGS.indexOf(key)+1);
  return '<p:pic><p:nvPicPr><p:cNvPr id="'+id+'" name="Icon '+id+'"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="'+pxE(x)+'" y="'+pxE(y)+'"/><a:ext cx="'+pxE(w)+'" cy="'+pxE(h)+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'; }
function iconSq(s,sid,x,y,size,fill,name,iconColor,radiusAdj){ s.push(ppShape(sid,x,y,size,size,{fill:fill,adj:radiusAdj||16667})); var p=ppPic(sid+1,x+size*0.24,y+size*0.24,size*0.52,size*0.52,name,iconColor); if (p) s.push(p); }
function buildPPTX(){ PPT_IMGS=[]; CUR_IMGS=[]; var d=reportData(), m=d.m; var AC=WS.theme.accent.replace("#","").toUpperCase(), SC=WS.theme.secondary.replace("#","").toUpperCase(); var INK="14171C", MUTED="6A717D", LINE="DDE0E6", SUNK="F1F2F5", RED="D63B3B", AMB="C77A06", GRN="178A5D";
  var slides=[]; var sid; var pushSlide=function(xml){ slides.push({xml:xml,imgs:CUR_IMGS}); CUR_IMGS=[]; };
  var yr=new Date().getFullYear(); var frame=function(title,sub,icon){ sid=2; var s=[]; iconSq(s,sid,0.6,0.3,0.52,SUNK,icon||"analytics","#111214"); sid+=2; s.push(ppShape(sid++,1.28,0.28,8.1,0.6,{text:tr(title),sz:24,b:true,color:INK,txBox:true,inset:0})); s.push(ppShape(sid++,1.28,0.85,9,0.4,{text:tr(sub||""),sz:11,color:MUTED,txBox:true,inset:0})); s.push(ppShape(sid++,9.7,0.38,3.05,0.42,{fill:"FFFFFF",line:LINE,adj:50000,paras:[ppPara(ppRun(WS.name+" · "+dueDate(0)+" "+yr,{sz:10,b:true,color:INK}),{algn:"ctr"})],anchor:"ctr"})); s.push(ppShape(sid++,0.6,7.05,12,0.3,{text:"ZenCrevia · "+iso(0),sz:9,color:MUTED,txBox:true,inset:0})); return s; };
  var card=function(s,x,y,w,h,fill){ s.push(ppShape(sid++,x,y,w,h,{fill:fill||"FFFFFF",line:fill?null:LINE,adj:Math.round(0.22/Math.min(w,h)*50000)})); };
  /* A slide-foot note. It used to be hard-placed at y=6.62, which on the
     per-person slide is INSIDE a card that runs to 6.9 — the text rendered on
     top of the card. This anchors the note to the bottom of the slide, sizes it
     for the number of lines the text will actually wrap to, and never lets it
     run off the 7.5in page. */
  /* Every slide already carries a "ZenCrevia · date" stamp at y=7.05, so a note
     has to finish above that band — not merely inside the 7.5in page. */
  var NOTE_BOTTOM=6.98;
  var noteLines=function(text,w,pt){
    /* deliberately conservative so a note is never under-measured and clipped */
    var perLine=Math.max(20,Math.floor(w*72/(pt*0.5)));
    return Math.max(1,Math.ceil(String(text||"").length/perLine));
  };
  var footNote=function(s,text,x,w,pt){
    pt=pt||8.5; x=x==null?0.4:x; w=w||12.5;
    var lines=noteLines(text,w,pt), lineH=pt/72*1.35, h=Math.max(0.3,lines*lineH+0.06);
    var y=NOTE_BOTTOM-h;
    s.push(ppShape(sid++,x,y,w,h,{text:text,sz:pt,color:MUTED,txBox:true,inset:0}));
    return y;
  };
  /* 1 · title */
  (function(){ sid=2; var s=[ppShape(sid++,0.5,0.5,12.333,6.5,{fill:INK,adj:6000}), ppShape(sid++,1.1,1.1,1.1,1.1,{fill:AC,adj:22000}), ppShape(sid++,1.1,1.1,1.1,1.1,{paras:[ppPara(ppRun(WS.logo||"C",{sz:24,b:true,color:inkFor(WS.theme.accent)==="#fff"?"FFFFFF":"111111"}),{algn:"ctr"})],txBox:true,inset:0,anchor:"ctr"}),
    ppShape(sid++,1.1,2.7,3.2,0.5,{fill:SC,adj:50000,paras:[ppPara(ppRun(tr("Creative report").toUpperCase(),{sz:11,b:true,color:"111111"}),{algn:"ctr"})],anchor:"ctr"}),
    ppShape(sid++,1.1,3.3,10.5,1.2,{text:WS.name,sz:44,b:true,color:"FFFFFF",txBox:true,inset:0}), ppShape(sid++,1.1,4.5,10.5,0.6,{text:WS.tagline||"",sz:18,color:"C9CDD6",txBox:true,inset:0}),
    ppShape(sid++,1.1,5.4,10.5,0.75,{text:reportPeriod()+" · "+exScopeLine()+"\n"+tr("Prepared by")+" "+person(ME).name+" · "+iso(0),sz:12,color:"9AA0AB",txBox:true,inset:0}), ppShape(sid++,1.1,6.3,6,0.4,{text:"ZenCrevia",sz:10,color:"6A717D",txBox:true,inset:0})]; pushSlide(slideXml(s,"EEF0F3")); })();
  /* 2 · KPIs */
  if (exInc("kpis")) (function(){ var s=frame("Headline metrics",reportPeriod(),"analytics"); var k=[[String(m.totalCompleted),"Tasks completed",GRN],[String(m.totalCreated),"Tasks created",INK],[String(m.overdueNow),"Overdue now",m.overdueNow?RED:GRN],[m.avgCompletion+(UI_LANG==="id"?" hari":"d"),"Avg completion",INK],[m.liveRevRate+"%","Revision rate",m.liveRevRate>35?AMB:INK],[m.approvalRate+"%","Approval rate",AC],[m.avgApproval+(UI_LANG==="id"?" jam":"h"),"Approval time",INK],[m.utilization+"%","Team utilization",m.utilization>100?RED:AC],[String(assetsProduced(reportTasks().filter(isClosed))),"Assets delivered",GRN],[String(assetsProduced(reportTasks().filter(function(t){ return !isClosed(t); }))),"Assets in production",AC],[String(assetLinks(reportTasks()).length),"Asset links",INK],[(function(){ var c=reportTasks().filter(isClosed); return c.length?String(Math.round(assetsProduced(c)/c.length*10)/10):"0"; })(),"Assets / completed task",INK]];
    k.forEach(function(x,i){ var col=i%4, row=Math.floor(i/4), X=0.6+col*3.1, Y=1.48+row*1.78; card(s,X,Y,2.9,1.6); var ic=["check","plus","bell","calendar","edit","eye","sync","team","assets","image","link","check"][i]; var sq=i%4===0?AC:i%4===1?SC:i%4===2?INK:SUNK; iconSq(s,sid,X+0.2,Y+0.2,0.36,sq,ic,(sq===SC||sq===SUNK)?"#111214":"#FFFFFF"); sid+=2; s.push(ppShape(sid++,X+0.68,Y+0.15,2.02,0.5,{text:tr(x[1]),sz:10.5,b:true,color:INK,txBox:true,inset:0,anchor:"ctr"})); s.push(ppShape(sid++,X+0.2,Y+0.72,2.5,0.7,{text:x[0],sz:34,b:true,color:x[2],txBox:true,inset:0})); });
    pushSlide(slideXml(s)); })();
  function pages(items,size){var out=[];for(var i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out.length?out:[[]];}
  function pageTitle(title,i,total){return tr(title)+(total>1?" · "+(i+1)+"/"+total:"");}
  /* 3 · pipeline */
  if (exInc("pipeline")) pages(d.stages,12).forEach(function(group,pi,all){ var s=frame(pageTitle("Creative pipeline",pi,all.length),tr("Tasks per workflow stage")+" · "+reportTasks().length+" "+tr("tasks"),"kanban"); card(s,0.6,1.35,12.1,5.5); var max=1; d.stages.forEach(function(x){ if (x.n>max) max=x.n; }); var n=Math.max(1,group.length); var gw=12.1/n; group.forEach(function(x,i){ var X=0.6+i*gw; var bh=4*(x.n/max); var col=x.kind==="closed"?GRN:x.kind==="review"?AMB:x.kind==="revision"?RED:x.kind==="work"?AC:"9AA0AB"; s.push(ppShape(sid++,X+0.25,2.0+(4-bh),gw-0.5,bh,{fill:col,adj:15000})); s.push(ppShape(sid++,X,1.5+(4-bh),gw,0.5,{paras:[ppPara(ppRun(String(x.n),{sz:18,b:true,color:INK}),{algn:"ctr"})],txBox:true,inset:0})); s.push(ppShape(sid++,X,6.1,gw,0.5,{paras:[ppPara(ppRun(x.name,{sz:11,color:MUTED}),{algn:"ctr"})],txBox:true,inset:0})); }); s.push(ppShape(sid++,0.6,6.05,12.1,0.02,{fill:LINE})); pushSlide(slideXml(s)); });
  /* 4 · throughput: reserve a padded legend row above the plot. */
  if (exInc("throughput")) pages(m.weeks,10).forEach(function(group,pi,all){
    var s=frame(pageTitle("Throughput",pi,all.length),"Created vs completed per week","analytics");card(s,0.6,1.35,12.1,5.5);
    [["Created",SC],["Completed",AC]].forEach(function(item,i){var x=0.95+i*1.9;s.push(ppShape(sid++,x,1.73,0.18,0.18,{fill:item[1],geom:"ellipse"}));s.push(ppShape(sid++,x+0.3,1.62,1.45,0.4,{text:tr(item[0]),sz:11,color:MUTED,txBox:true,inset:0,anchor:"ctr"}));});
    var max=1;m.created.concat(m.completed).forEach(function(v){if(v>max)max=v;});var n=Math.max(1,group.length),left=0.95,width=11.4,gw=width/n,baseline=6.1,plotHeight=3.55;
    s.push(ppShape(sid++,left,baseline,width,0.015,{fill:LINE,sharp:true}));
    group.forEach(function(w,j){var i=pi*10+j,X=left+j*gw,barWidth=Math.min(0.62,gw*0.27),gap=Math.min(0.16,gw*0.12),start=X+(gw-2*barWidth-gap)/2;
      [m.created[i]||0,m.completed[i]||0].forEach(function(value,k){var x=start+k*(barWidth+gap),barHeight=plotHeight*value/max;if(value>0)s.push(ppShape(sid++,x,baseline-barHeight,barWidth,barHeight,{fill:k?AC:SC,adj:10000}));s.push(ppShape(sid++,x-0.08,baseline-barHeight-0.37,barWidth+0.16,0.32,{paras:[ppPara(ppRun(String(value),{sz:10.5,color:k?AC:MUTED}),{algn:"ctr"})],txBox:true,inset:0,anchor:"ctr"}));});
      s.push(ppShape(sid++,X,6.22,gw,0.4,{paras:[ppPara(ppRun(w,{sz:11,color:MUTED}),{algn:"ctr"})],txBox:true,inset:0,anchor:"ctr"}));
    });pushSlide(slideXml(s));
  });
  /* 5 · projects */
  if (exInc("projects")) pages(d.projects,7).forEach(function(group,pi,all){ var s=frame(pageTitle("Projects",pi,all.length),"Progress, deadline and open work per project","projects"); card(s,0.4,1.4,12.5,5.5); var Y=1.6; ["Project","Owner","Status","Open","Overdue","Deadline","Progress"].forEach(function(hh,i){ var xs=[0.6,4.0,5.8,7.2,8.2,9.3,10.7], ws=[3.3,1.7,1.3,0.9,1.0,1.3,2.2]; s.push(ppShape(sid++,xs[i],Y,ws[i],0.35,{text:tr(hh).toUpperCase(),sz:9,b:true,color:MUTED,txBox:true,inset:0})); }); Y+=0.45;
    group.forEach(function(p){ s.push(ppShape(sid++,0.6,Y-0.05,12.1,0.02,{fill:LINE})); var vals=[p.name,p.owner,tr(p.status==="risk"?"At risk":p.status==="done"?"Done":"Active"),String(p.open),String(p.overdue),p.due]; var xs=[0.6,4.0,5.8,7.2,8.2,9.3], ws=[3.3,1.7,1.3,0.9,1.0,1.3]; vals.forEach(function(v,i){ s.push(ppShape(sid++,xs[i],Y,ws[i],0.5,{text:v,sz:12,b:i===0,color:i===2&&p.status==="risk"?RED:i===4&&p.overdue?RED:INK,txBox:true,inset:0,anchor:"ctr"})); });
      s.push(ppShape(sid++,10.7,Y+0.17,1.6,0.16,{fill:SUNK})); s.push(ppShape(sid++,10.7,Y+0.17,Math.max(0.02,1.6*Math.min(100,Math.max(0,p.progress))/100),0.16,{fill:p.status==="risk"?RED:AC})); s.push(ppShape(sid++,12.35,Y,0.6,0.5,{text:p.progress+"%",sz:11,color:MUTED,txBox:true,inset:0,anchor:"ctr"})); Y+=0.62; });
    pushSlide(slideXml(s)); });
  /* 6 · team workload (by team, team colors) */
  if (exInc("teamload")) pages(m.byTeam,7).forEach(function(group,pi,all){ var s=frame(pageTitle("Team workload by team",pi,all.length),"Capacity vs assigned hours per team","team"); card(s,0.4,1.4,12.5,5.5); var Y=1.7; var tstep=0.72; var TC={purple:"7C3AED",blue:"2563EB",green:"16A34A",orange:"EA580C",red:"DC2626",pink:"DB2777",teal:"0D9488",yellow:"CA8A04",gray:"6B7280"}; group.forEach(function(t){ var pct=t.capacity?t.assigned/t.capacity:0; s.push(ppShape(sid++,0.6,Y+0.12,0.22,0.22,{fill:TC[t.color]||AC,geom:"ellipse"})); s.push(ppShape(sid++,0.95,Y,2.7,0.32,{text:t.name,sz:13,b:true,color:INK,txBox:true,inset:0,anchor:"ctr"})); s.push(ppShape(sid++,0.95,Y+0.36,2.7,0.25,{text:teamMembers(t.id).length+" "+tr("people")+" · "+t.open+" "+tr("open"),sz:10,color:MUTED,txBox:true,inset:0})); s.push(ppShape(sid++,3.8,Y+0.15,7,0.26,{fill:SUNK})); s.push(ppShape(sid++,3.8,Y+0.15,Math.max(0.02,7*Math.min(1,pct)),0.26,{fill:TC[t.color]||AC})); s.push(ppShape(sid++,11,Y,1.7,0.5,{text:t.assigned+"h / "+t.capacity+"h · "+t.utilization+"%",sz:10.5,color:INK,txBox:true,inset:0,anchor:"ctr"})); Y+=tstep; }); pushSlide(slideXml(s)); });
  /* 7 · workload by person */
  if (exInc("workload")) pages(d.people,7).forEach(function(group,pi,all){ var s=frame(pageTitle("Team workload",pi,all.length),tr("Assigned hours vs weekly capacity")+" · "+m.utilization+"%","team"); card(s,0.4,1.4,12.5,5.5); var Y=1.7; var step=0.72; group.forEach(function(p){ var pct=p.cap?p.assigned/p.cap:0; var col=pct>1?RED:pct>=0.9?AMB:pct<0.6?GRN:AC; s.push(ppShape(sid++,0.6,Y,3,0.32,{text:p.name,sz:13,b:true,color:INK,txBox:true,inset:0,anchor:"ctr"})); s.push(ppShape(sid++,0.6,Y+0.36,3,0.25,{text:p.role,sz:10,color:MUTED,txBox:true,inset:0})); s.push(ppShape(sid++,3.8,Y+0.15,7,0.26,{fill:SUNK})); s.push(ppShape(sid++,3.8,Y+0.15,Math.max(0.02,7*Math.min(1,pct)),0.26,{fill:col})); s.push(ppShape(sid++,11,Y,1.7,0.5,{text:p.assigned+"h / "+p.cap+"h · "+Math.round(pct*100)+"%",sz:10.5,color:INK,txBox:true,inset:0,anchor:"ctr"})); Y+=step; }); pushSlide(slideXml(s)); });
  /* §569-585 per-person performance — two people per slide so nothing shrinks */
  if (exInc("people")) pages(d.people,2).forEach(function(group,pi,all){
    var s=frame(pageTitle("Performance by person",pi,all.length),tr("Contribution across the selected period"),"user");
    group.forEach(function(p,gi){
      var X=0.4+gi*6.35;
      /* ends at 6.55, leaving room for the slide note above the footer band */
      card(s,X,1.4,6.1,5.15);
      s.push(ppShape(sid++,X+0.35,1.65,5.4,0.4,{text:p.name,sz:17,b:true,color:INK,txBox:true,inset:0}));
      s.push(ppShape(sid++,X+0.35,2.05,5.4,0.32,{text:p.role+(p.team?" \u00b7 "+p.team:""),sz:10.5,color:MUTED,txBox:true,inset:0}));
      /* §570 a metric with no denominator prints as "—", never as a made-up 0 */
      var na=tr("n/a");
      var stats=[
        [p.completed+" / "+p.assignedTotal, "Tasks completed", AC],
        [p.completionRate===null?na:p.completionRate+"%", "Completion rate", p.completionRate===null?MUTED:(p.completionRate>=70?GRN:AMB)],
        /* §P1-6 an approximated number must not read like a measured one. In a
           narrow stat card "(attributed)" wraps badly, so it is marked with an
           asterisk and explained in the note at the foot of the slide. */
        [String(p.assetsProduced)+(p.assetsAttributed?" *":""), "Assets produced", INK],
        [String(p.projectsInvolved), "Projects involved", INK],
        [p.approvalRate===null?na:p.approvalRate+"%", "Approval rate", p.approvalRate===null?MUTED:(p.approvalRate>=70?GRN:AMB)],
        [p.revisionRate===null?na:p.revisionRate+"%", "Revision rate", p.revisionRate===null?MUTED:(p.revisionRate>35?AMB:INK)]
      ];
      /* Each figure sits in its own tinted card, matching the headline-metrics
         slide, so the six numbers read as a scorecard instead of loose text. */
      stats.forEach(function(st,i){
        var col=i%3, row=Math.floor(i/3), sx=X+0.35+col*1.85, sy=2.6+row*1.12;
        card(s,sx,sy,1.7,1.0,SUNK);
        s.push(ppShape(sid++,sx+0.14,sy+0.13,1.42,0.46,{text:st[0],sz:19,b:true,color:st[2],txBox:true,inset:0}));
        s.push(ppShape(sid++,sx+0.14,sy+0.58,1.42,0.34,{text:tr(st[1]),sz:8.5,color:MUTED,txBox:true,inset:0}));
      });
      /* §584 top projects give the numbers their context (§588) */
      s.push(ppShape(sid++,X+0.35,4.92,5.4,0.3,{text:tr("Top projects").toUpperCase(),sz:8.5,b:true,color:MUTED,txBox:true,inset:0}));
      var tp=p.topProjects||[];
      if(tp.length) tp.forEach(function(x,i){
        s.push(ppShape(sid++,X+0.35,5.26+i*0.40,4.3,0.34,{text:x.name,sz:10.5,color:INK,txBox:true,inset:0}));
        s.push(ppShape(sid++,X+4.7,5.26+i*0.40,1.05,0.34,{text:x.n+" "+tr(x.n===1?"task":"tasks"),sz:9.5,color:MUTED,txBox:true,inset:0,algn:"r"}));
      });
      else s.push(ppShape(sid++,X+0.35,5.26,5.4,0.34,{text:tr("No project activity in this period"),sz:10.5,color:MUTED,txBox:true,inset:0}));
    });
    /* §587 ranking caution — the deck should not read as a leaderboard */
    var anyAttributed=group.some(function(p){ return p.assetsAttributed; });
    footNote(s,tr("Volume depends on task size, role and availability — read alongside project context, not as a ranking.")
      +(anyAttributed?"  "+tr("* attributed from task ownership because no asset creator was recorded."):""));
    pushSlide(slideXml(s));
  });

  /* §592-611 AI recommendations */
  if (exInc("airecs")) (function(){
    /* §P0-5 resolved before the build so the label matches what actually ran */
    var rec=REPORT_REC_CACHE||reportRecommendations(d);
    var s=frame("AI recommendations",tr("Generated from this report's data")+" \u00b7 "+reportPeriod(),"sparkle");
    card(s,0.4,1.4,12.5,5.2);
    /* §605 the reader must always know where the advice came from */
    s.push(ppShape(sid++,0.6,1.6,12.1,0.32,{text:tr(rec.sourceLabel).toUpperCase(),sz:8.5,b:true,color:MUTED,txBox:true,inset:0}));
    var Y=2.05;
    rec.items.slice(0,5).forEach(function(it,i){
      s.push(ppShape(sid++,0.6,Y,0.34,0.34,{fill:i%2?SC:AC,adj:50000,paras:[ppPara(ppRun(String(i+1),{sz:11,b:true,color:"111111"}),{algn:"ctr"})],anchor:"ctr"}));
      s.push(ppShape(sid++,1.08,Y-0.02,11.5,0.36,{text:tr(it.title),sz:13,b:true,color:INK,txBox:true,inset:0}));
      /* the row advanced by a fixed 0.95in whatever the detail said, so a
         two-line detail ran into the next recommendation. Measure it. */
      var detail=tr(it.detail), lines=noteLines(detail,11.5,10.5);
      var detailH=Math.max(0.34,lines*(10.5/72*1.35)+0.08);
      s.push(ppShape(sid++,1.08,Y+0.34,11.5,detailH,{text:detail,sz:10.5,color:MUTED,txBox:true,inset:0}));
      Y+=0.34+detailH+0.22;
    });
    if(!rec.items.length) s.push(ppShape(sid++,0.6,2.2,12.1,0.5,{text:tr("Not enough data in this period to make a reliable recommendation."),sz:12,color:MUTED,txBox:true,inset:0}));
    /* §603 say plainly how much data this is based on */
    footNote(s,tr("Based on")+" "+rec.sample+" "+tr("tasks")+" \u00b7 "+tr(rec.confidence),0.6,12.5);
    pushSlide(slideXml(s));
  })();

  /* 8 · attention: four tasks per panel; continuation panels fill the next slide. */
  if (exInc("attention")) (function(){ var cols=[["Overdue",d.overdue,RED],["In review",d.review,AMB],["Due in 7 days",d.upcoming,AC]],blocks=[];
    cols.forEach(function(c){blocks.push({col:c,start:0});});cols.forEach(function(c){for(var n=4;n<c[1].length;n+=4)blocks.push({col:c,start:n});});
    pages(blocks,3).forEach(function(group,page,all){var s=frame(pageTitle("Needs attention",page,all.length),"Overdue · waiting for review · due within 7 days","bell");group.forEach(function(block,ci){var c=block.col,X=0.6+ci*4.1,items=c[1].slice(block.start,block.start+4),count=c[1].length>4?(block.start+1)+"–"+(block.start+items.length)+" / "+c[1].length:String(c[1].length);s.push(ppShape(sid++,X,1.5,3.9,0.5,{fill:c[2],adj:50000,text:tr(c[0])+" · "+count,sz:12,b:true,color:"FFFFFF",anchor:"ctr"}));card(s,X,2.15,3.9,4.65);if(!items.length)s.push(ppShape(sid++,X+0.2,2.35,3.5,0.6,{text:tr("No items"),sz:11,color:MUTED,txBox:true,inset:0}));items.forEach(function(t,j){var Y=2.3+j*1.1;s.push(ppShape(sid++,X+0.2,Y,3.5,0.62,{text:t.id+"  "+t.title,sz:11,b:true,color:INK,txBox:true,inset:0}));s.push(ppShape(sid++,X+0.2,Y+0.64,3.5,0.32,{text:first(t.assignee)+" · "+dueTxt(t.due),sz:9.5,color:MUTED,txBox:true,inset:0}));if(j<3&&j<items.length-1)s.push(ppShape(sid++,X+0.2,Y+1.02,3.5,0.01,{fill:LINE}));});});pushSlide(slideXml(s));});
  })();
  /* package */
  var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+slides.map(function(x,i){ return '<Override PartName="/ppt/slides/slide'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'; }).join("")+'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
  var pres='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation '+NS+' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+slides.map(function(x,i){ return '<p:sldId id="'+(256+i)+'" r:id="rId'+(i+2)+'"/>'; }).join("")+'</p:sldIdLst><p:sldSz cx="'+SW+'" cy="'+SH+'" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>';
  var presRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'+slides.map(function(x,i){ return '<Relationship Id="rId'+(i+2)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide'+(i+1)+'.xml"/>'; }).join("")+'<Relationship Id="rId'+(slides.length+2)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>';
  var master='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster '+NS+'><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>';
  var masterRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
  var layout='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout '+NS+' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  var layoutRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>';
  var slideRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';
  var fillStyles='<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>';
  var theme='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ZenCrevia"><a:themeElements><a:clrScheme name="ZenCrevia"><a:dk1><a:srgbClr val="14171C"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="6A717D"/></a:dk2><a:lt2><a:srgbClr val="F1F2F5"/></a:lt2><a:accent1><a:srgbClr val="'+AC+'"/></a:accent1><a:accent2><a:srgbClr val="'+SC+'"/></a:accent2><a:accent3><a:srgbClr val="178A5D"/></a:accent3><a:accent4><a:srgbClr val="C77A06"/></a:accent4><a:accent5><a:srgbClr val="D63B3B"/></a:accent5><a:accent6><a:srgbClr val="9AA0AB"/></a:accent6><a:hlink><a:srgbClr val="'+AC+'"/></a:hlink><a:folHlink><a:srgbClr val="6D3BF5"/></a:folHlink></a:clrScheme><a:fontScheme name="ZenCrevia"><a:majorFont><a:latin typeface="Poppins"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Poppins"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="ZenCrevia">'+fillStyles+'<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  var now=new Date().toISOString().replace(/\.\d+Z$/,"Z");
  var core='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xml(WS.name)+' — Creative report</dc:title><dc:creator>ZenCrevia</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+now+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+now+'</dcterms:modified></cp:coreProperties>';
  var app='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ZenCrevia</Application><Slides>'+slides.length+'</Slides></Properties>';
  var entries=[{name:"[Content_Types].xml",data:ct},{name:"_rels/.rels",data:rels},{name:"docProps/core.xml",data:core},{name:"docProps/app.xml",data:app},{name:"ppt/presentation.xml",data:pres},{name:"ppt/_rels/presentation.xml.rels",data:presRels},{name:"ppt/slideMasters/slideMaster1.xml",data:master},{name:"ppt/slideMasters/_rels/slideMaster1.xml.rels",data:masterRels},{name:"ppt/slideLayouts/slideLayout1.xml",data:layout},{name:"ppt/slideLayouts/_rels/slideLayout1.xml.rels",data:layoutRels},{name:"ppt/theme/theme1.xml",data:theme}];
  PPT_IMGS.forEach(function(key,i){ entries.push({name:"ppt/media/icon"+(i+1)+".png",data:PPT_ICONS[key]}); });
  slides.forEach(function(x,i){ entries.push({name:"ppt/slides/slide"+(i+1)+".xml",data:x.xml}); var rels=slideRels.replace("</Relationships>",x.imgs.map(function(key){ var n=PPT_IMGS.indexOf(key)+1; return '<Relationship Id="rIdImg'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/icon'+n+'.png"/>'; }).join("")+"</Relationships>"); entries.push({name:"ppt/slides/_rels/slide"+(i+1)+".xml.rels",data:rels}); });
  return zipBytes(entries); }
function exportPPT(){ var ex=EXPORT;
  return preparePptIcons().then(function(){
    EXPORT=ex;
    /* §P0-5 ask the external provider (if it is genuinely configured) before
       the synchronous slide build, so the source badge is truthful. */
    if(!exInc("airecs")) return null;
    var d; try{ d=reportData(); }catch(e){ return null; }
    return resolveReportRecommendations(d).then(function(r){ REPORT_REC_CACHE=r; }).catch(function(){ REPORT_REC_CACHE=null; });
  }).then(function(){ EXPORT=ex; try { var bytes=buildPPTX(); download(fileStamp()+".pptx",new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.presentationml.presentation"})); toast("PowerPoint report exported"); } catch(e){ toast("Export failed: "+e.message,"bad"); } finally { EXPORT=null; REPORT_REC_CACHE=null; } }); }

/* ---------- JSON backup / restore ---------- */
function exportJSON(){ var ws=clone(WS); delete ws.people; var data={version:3,baseDate:iso(0),exportedAt:new Date().toISOString(),ws:ws,teams:TEAMS,people:PEOPLE,roles:ROLES,projects:PROJECTS,tasks:TASKS,requests:REQUESTS,folders:ASSET_FOLDERS,assets:ASSETS,knowledge:KNOWLEDGE,views:VIEWS,notifs:NOTIFS,activity:ACTIVITY}; download(fileStamp().replace("creative-report","backup")+".json",new Blob([JSON.stringify(data,null,2)],{type:"application/json"})); toast("Backup downloaded"); }
function importJSON(){ var inp=document.getElementById("fileInput"); inp.accept=".json,application/json"; inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if (!f) return; var rd=new FileReader(); rd.onload=function(){ try { var d=JSON.parse(rd.result); if (!d.ws||!Array.isArray(d.tasks)||!Array.isArray(d.projects)) throw new Error("not a ZenCrevia backup");var shift=offsetFromIso(d.baseDate||(d.exportedAt?d.exportedAt.slice(0,10):iso(0)));d.tasks.forEach(function(t){t.due+=shift;});d.projects.forEach(function(p){p.start+=shift;p.due+=shift;(p.milestones||[]).forEach(function(m){m.due+=shift;});}); if (API.on) throw new Error("snapshot restore is for demo mode — the server database is the source of truth"); for (var k in d.ws) WS[k]=d.ws[k]; if (d.teams) TEAMS=d.teams; if (d.people){ PEOPLE=d.people; WS.people=PEOPLE; } if (d.roles) ROLES=d.roles; if (d.requests) REQUESTS=d.requests; if (d.views) VIEWS=d.views; PROJECTS.length=0; d.projects.forEach(function(x){ PROJECTS.push(x); }); TASKS.length=0; d.tasks.forEach(function(x){ TASKS.push(x); }); ASSET_FOLDERS.length=0; (d.folders||[]).forEach(function(x){ ASSET_FOLDERS.push(x); }); ASSETS.length=0; (d.assets||[]).forEach(function(x){ ASSETS.push(x); }); KNOWLEDGE.length=0; (d.knowledge||[]).forEach(function(x){ KNOWLEDGE.push(x); }); NOTIFS.length=0; (d.notifs||[]).forEach(function(x){ NOTIFS.push(x); }); ACTIVITY.length=0; (d.activity||[]).forEach(function(x){ ACTIVITY.push(x); }); applyTheme(); applyShell(); refresh(); toast("Workspace restored"); } catch(e){ toast("Restore failed: "+e.message,"bad"); } }; rd.readAsText(f); }; inp.click(); }
</script>
