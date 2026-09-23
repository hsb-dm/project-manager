<script>
/* ============================================================
   GLOBAL TAG PICKER (§329-373)
   One component for every tag field: tasks, projects, requests,
   assets, gallery, knowledge, saved views and filters.
   ============================================================ */

/* §347 Settings → Tags stays the source of truth. Entries may be a plain
   string (legacy) or {id,name,color}; both read through this registry. */
var TAG_SEARCH_ICON='<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
/* v17 §1/§17 — Tags have NO colours. Labels, Workflow stages and Teams keep
   theirs; Tags are organisational metadata rendered as a neutral pill. Legacy
   records may still carry a `color` key: it is read tolerantly, never rendered,
   and stripped on the next normalised save (§P0-1 legacy compatibility). */
function tagSlug(name){ return String(name||"").trim().toLowerCase().replace(/\s+/g," "); }
/* v17 §7.5 manual order is the single source of truth for how tags are listed. */
function tagRegistry(){
  var raw=(typeof WS!=="undefined"&&WS.tags)||[], out=[], seen={};
  raw.forEach(function(t,i){
    var name=typeof t==="string"?t:(t&&t.name)||"";
    var key=tagSlug(name); if(!key||seen[key]) return; seen[key]=1;
    out.push({
      id:(t&&t.id)||key,
      name:name,
      archived:!!(t&&t.archived),
      sortOrder:(t&&typeof t.sortOrder==="number")?t.sortOrder:(i+1)*10
    });
  });
  out.sort(function(a,b){ return a.sortOrder-b.sortOrder; });
  return out;
}
/* §P0-1 the one shape a tag is ever written back as — no colour key survives. */
function tagRecord(t,order){
  return {id:t.id||tagSlug(t.name),name:t.name,archived:!!t.archived,
    sortOrder:typeof order==="number"?order:(typeof t.sortOrder==="number"?t.sortOrder:10)};
}
/* §7.7 archived tags stay attached to old records but leave the picker. */
function activeTags(){ return tagRegistry().filter(function(t){ return !t.archived; }); }
function tagByName(name){ var k=tagSlug(name); var f=tagRegistry().filter(function(t){ return tagSlug(t.name)===k; }); return f[0]||null; }
function tagDisplayName(name){ var t=tagByName(name); return t?t.name:name; }
/* §364 usage count across every tagged entity */
function tagUsageCount(name){
  var k=tagSlug(name), n=0;
  var scan=function(list){ (list||[]).forEach(function(x){ (x&&x.tags||[]).forEach(function(v){ if(tagSlug(v)===k) n++; }); }); };
  scan(typeof TASKS!=="undefined"?TASKS:[]); scan(typeof PROJECTS!=="undefined"?PROJECTS:[]); scan(typeof ASSETS!=="undefined"?ASSETS:[]);
  return n;
}
/* ============================================================
   §P0-2 / §15 — ONE canonical tag creation function.
   Settings → Tags, the picker's "Create new", import migration and any
   future inline creation all call this. There is deliberately no second
   addTag() anywhere in the codebase.
   ============================================================ */
function createWorkspaceTag(name,opts){
  opts=opts||{};
  name=String(name==null?"":name).trim().replace(/\s+/g," ");
  if(!name) return {ok:false,reason:"Enter a tag name."};
  if(name.length>60) return {ok:false,reason:"Tag names are limited to 60 characters."};
  if(typeof canCreateTag==="function"&&!canCreateTag()) return {ok:false,reason:"Only an admin can create new tags."};
  var dupe=tagByName(name);
  if(dupe) return {ok:false,reason:"That tag already exists",tag:dupe};
  var reg=tagRegistry();
  var next=reg.length?reg[reg.length-1].sortOrder+10:10;
  var rec=tagRecord({id:tagSlug(name),name:name,archived:false},next);
  if(typeof WS==="undefined") return {ok:false,reason:"Workspace is not ready."};
  /* normalise the whole list on write so legacy colour keys are stripped (§P0-1) */
  WS.tags=reg.map(function(t,i){ return tagRecord(t,(i+1)*10); }).concat([tagRecord(rec,next)]);
  if(typeof saveWS==="function") saveWS(opts.silent?null:"Tag created");
  return {ok:true,tag:rec};
}
/* §P0-1 legacy compatibility: rewrite the stored list in the colour-free shape
   without changing order or membership. Safe to call at any time. */
function normaliseWorkspaceTags(){
  if(typeof WS==="undefined"||!WS.tags) return false;
  var reg=tagRegistry();
  var had=(WS.tags||[]).some(function(t){ return t&&typeof t==="object"&&"color" in t; })
       || (WS.tags||[]).some(function(t){ return typeof t==="string"; });
  WS.tags=reg.map(function(t,i){ return tagRecord(t,(i+1)*10); });
  return had;
}
/* §P0-4 / §7.5 tags join the one shared reorder engine — no second drag system. */
function commitTagOrder(from,to){
  if(typeof canCreateTag==="function"&&!canCreateTag()) return false;
  var reg=tagRegistry();
  if(!moveInArray(reg,from,to)) return false;
  WS.tags=reg.map(function(t,i){ return tagRecord(t,(i+1)*10); });
  if(typeof renderScreen==="function") renderScreen(false);
  if(typeof saveWS==="function") saveWS("Tag order saved");
  return true;
}
if(typeof registerReorderList==="function") registerReorderList("tags",commitTagOrder);
/* §P0-4 accessibility fallback for the kebab menu */
function moveTag(i,where){
  var reg=tagRegistry(), to=where==="up"?i-1:where==="down"?i+1:where==="top"?0:reg.length-1;
  if(to<0||to>=reg.length||to===i) return;
  commitTagOrder(i,to);
}

/* §334 permission to create tags from inside the dropdown */
function canCreateTag(){ return typeof canI!=="undefined"&&canI.manageWorkspace?canI.manageWorkspace():true; }
/* §357 keep a sane ceiling per entity */
var TAG_LIMIT=12;

/* ---------- rendering ---------- */
var TAGPICK={id:null,onchange:null,values:[],limit:TAG_LIMIT,readonly:false,q:"",active:-1};

function tagChip(name,onRemove){
  return '<span class="tag-chip"><span class="tag-chip-label">'+esc(tagDisplayName(name))+'</span>'
    + (onRemove?'<button type="button" class="tag-chip-x" aria-label="'+attr(tr("Remove")+" "+tagDisplayName(name))+'" onclick="event.stopPropagation();'+onRemove+'">'+I.x+'</button>':'')
    + '</span>';
}
/* §338 compact read-only presentation for tables and cards */
function tagChips(values,max){
  values=values||[]; max=max||3;
  if(!values.length) return '<span class="hint">'+tr("No tags")+'</span>';
  var shown=values.slice(0,max), rest=values.length-shown.length;
  return '<span class="tag-chips">'+shown.map(function(v){ return tagChip(v,null); }).join("")
    + (rest>0?'<span class="tag-chip more" title="'+attr(values.slice(max).map(tagDisplayName).join(", "))+'">+'+rest+'</span>':'')+'</span>';
}

/* §353 component API: onchange is a function receiving (value, id). Keeping
   executable source out of component state avoids unsafe-eval and prevents a
   stored identifier from ever becoming JavaScript. */
function tagPicker(id,values,onchange,opts){
  opts=opts||{};
  window.TAG_PICKERS=window.TAG_PICKERS||{};
  window.TAG_PICKERS[id]={values:(values||[]).slice(),onchange:typeof onchange==="function"?onchange:null,limit:opts.limit||TAG_LIMIT,readonly:!!opts.readonly,compact:!!opts.compact,placeholder:opts.placeholder||tr("Add tag")};
  return '<div class="tag-picker" id="'+id+'" data-tag-picker>'+tagPickerField(id)+'</div>';
}
function tagPickerState(id){ return (window.TAG_PICKERS||{})[id]; }
/* §P0-3 read a picker back at submit time. Every editable Tag field in the
   product goes through tagPicker()/tagPickerValues() — no free-text, no
   comma-splitting, anywhere. */
function tagPickerValues(id){ var st=tagPickerState(id); return st?st.values.slice():[]; }
/* §P0-3 migration helper for values that were stored as a raw string. */
function tagsFromLegacy(v){
  if(Array.isArray(v)) return v.map(function(x){ return String(x||"").trim(); }).filter(Boolean);
  return String(v||"").split(",").map(function(x){ return x.trim(); }).filter(Boolean);
}
function tagPickerField(id){
  var st=tagPickerState(id); if(!st) return "";
  var full=st.values.length>=st.limit, near=st.values.length>=Math.max(1,st.limit-2);
  return '<div class="tag-picker-field'+(st.readonly?" readonly":"")+'" role="group">'
    + st.values.map(function(v){ return tagChip(v,st.readonly?null:"tagPickerRemove('"+id+"','"+attr(v).replace(/'/g,"\\'")+"')"); }).join("")
    + (st.readonly?(st.values.length?"":'<span class="hint">'+tr("No tags")+'</span>')
        : '<button type="button" class="tag-picker-add" aria-haspopup="listbox" aria-expanded="false"'
          + (full?' disabled title="'+attr(tr("Tag limit reached"))+'"':'')
          + ' onclick="tagPickerOpen(\''+id+'\',this)">'+I.plus+esc(st.placeholder)+'</button>')
    + '</div>'
    + (st.readonly||st.compact||!near?"":'<p class="hint tag-picker-limit'+(full?" warn":"")+'">'+st.values.length+' / '+st.limit+(full?' · '+tr("Tag limit reached"):' '+tr("tags"))+'</p>');
}
function tagPickerRefresh(id){
  var host=document.getElementById(id); if(!host) return;
  host.innerHTML=tagPickerField(id);
}

/* ---------- dropdown ---------- */
function tagPickerOpen(id,anchor){
  TAGPICK.id=id; TAGPICK.q=""; TAGPICK.active=-1;
  var pop=tagPickerPop();
  pop.classList.add("open");
  tagPickerRender();
  place(pop,anchor);
  if(anchor) anchor.setAttribute("aria-expanded","true");
  setTimeout(function(){ var s=document.getElementById("tagPickSearch"); if(s) s.focus(); },30);
}
function tagPickerPop(){
  var pop=document.getElementById("tagPickPop");
  if(!pop){
    pop=document.createElement("div");
    /* deliberately not .pop — the global click handler closes those, which
       would shut the dropdown on every option click (§337). */
    pop.id="tagPickPop"; pop.className="tag-picker-pop"; pop.setAttribute("role","listbox");
    document.body.appendChild(pop);
  }
  return pop;
}
function tagPickerClose(){
  var pop=document.getElementById("tagPickPop"); if(pop) pop.classList.remove("open");
  document.querySelectorAll(".tag-picker-add[aria-expanded='true']").forEach(function(b){ b.setAttribute("aria-expanded","false"); });
  TAGPICK.id=null; TAGPICK.active=-1;
}
function tagPickerMatches(){
  var st=tagPickerState(TAGPICK.id); if(!st) return [];
  var q=tagSlug(TAGPICK.q);
  return activeTags().filter(function(t){ return !q||tagSlug(t.name).indexOf(q)>=0; });
}
function tagPickerRender(){
  var pop=document.getElementById("tagPickPop"), st=tagPickerState(TAGPICK.id);
  if(!pop||!st) return;
  var list=tagPickerMatches(), q=TAGPICK.q.trim();
  var exact=q&&activeTags().some(function(t){ return tagSlug(t.name)===tagSlug(q); });
  var full=st.values.length>=st.limit;
  var rows=list.length?list.map(function(t,i){
      var on=st.values.some(function(v){ return tagSlug(v)===tagSlug(t.name); });
      return '<button type="button" role="option" aria-selected="'+(on?"true":"false")+'" class="tag-opt'+(on?" on":"")+(i===TAGPICK.active?" active":"")+'"'
        + (!on&&full?' disabled title="'+attr(tr("Tag limit reached"))+'"':'')
        + ' onclick="tagPickerToggle(\''+attr(t.name).replace(/'/g,"\\'")+'\')">'
        + '<span class="tag-opt-label">'+esc(t.name)+'</span>'
        + '<span class="tag-opt-count">'+tagUsageCount(t.name)+'</span>'
        + '<span class="tag-opt-check">'+(on?I.check:"")+'</span></button>'; }).join("")
    /* §356 empty states tell the user what to do next */
    : '<div class="empty" style="padding:14px"><p>'+(q?tr("No tag matches"):tr("No tags yet"))+'</p><span>'
      + (canCreateTag()?tr("Create one below, or manage them in Settings → Tags."):tr("Ask an admin to add tags in Settings → Tags."))+'</span></div>';

  var foot="";
  if(canCreateTag()&&!full){
    foot=q&&!exact
      ? '<button type="button" class="tag-create" onclick="tagPickerCreate()">'+I.plus+tr("Create")+' “'+esc(q)+'”</button>'
      : '<button type="button" class="tag-create" onclick="tagPickerFocusSearch()">'+I.plus+tr("Create new tag")+'</button>';
  } else if(!canCreateTag()){
    /* §334 no permission: explain rather than hide silently */
    foot='<p class="hint" style="padding:9px 12px">'+tr("Only an admin can create new tags.")+'</p>';
  } else {
    foot='<p class="hint" style="padding:9px 12px">'+tr("Tag limit reached")+'</p>';
  }

  pop.innerHTML='<div class="tag-pick-search">'+TAG_SEARCH_ICON
    + '<input id="tagPickSearch" autocomplete="off" placeholder="'+attr(tr("Search tags…"))+'" value="'+attr(TAGPICK.q)+'"'
    + ' oninput="TAGPICK.q=this.value;TAGPICK.active=-1;tagPickerRender()" onkeydown="tagPickerKey(event)"></div>'
    + '<div class="tag-pick-list">'+rows+'</div>'
    + '<div class="tag-pick-foot">'+foot+'</div>';
  var s=document.getElementById("tagPickSearch");
  if(s&&document.activeElement!==s){ s.focus(); s.setSelectionRange(s.value.length,s.value.length); }
  var act=pop.querySelector(".tag-opt.active"); if(act) act.scrollIntoView({block:"nearest"});
}
function tagPickerFocusSearch(){ var s=document.getElementById("tagPickSearch"); if(s) s.focus(); }
/* §351 keyboard: arrows move, Enter picks or creates, Escape closes */
function tagPickerKey(e){
  var list=tagPickerMatches();
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    if(!list.length) return;
    TAGPICK.active=(TAGPICK.active+(e.key==="ArrowDown"?1:-1)+list.length+1)%(list.length+1)-0;
    if(TAGPICK.active>=list.length) TAGPICK.active=0;
    if(TAGPICK.active<0) TAGPICK.active=list.length-1;
    tagPickerRender(); return;
  }
  if(e.key==="Enter"){
    e.preventDefault();
    if(TAGPICK.active>=0&&list[TAGPICK.active]) return tagPickerToggle(list[TAGPICK.active].name);
    var q=TAGPICK.q.trim();
    if(!q) return;
    var hit=list.filter(function(t){ return tagSlug(t.name)===tagSlug(q); })[0];
    if(hit) return tagPickerToggle(hit.name);
    if(canCreateTag()) return tagPickerCreate();
    return;
  }
  if(e.key==="Escape"){ e.preventDefault(); tagPickerClose(); }
  if(e.key==="Backspace"&&!TAGPICK.q){
    var st=tagPickerState(TAGPICK.id);
    if(st&&st.values.length) tagPickerRemove(TAGPICK.id,st.values[st.values.length-1]);
  }
}
/* §337 multi-select: the dropdown stays open while picking */
function tagPickerToggle(name){
  var id=TAGPICK.id, st=tagPickerState(id); if(!st) return;
  var i=-1; st.values.forEach(function(v,n){ if(tagSlug(v)===tagSlug(name)) i=n; });
  if(i>=0) st.values.splice(i,1);
  else {
    if(st.values.length>=st.limit) return toast(tr("Tag limit reached"),"bad");
    st.values.push(tagDisplayName(name));
  }
  tagPickerCommit(id);
  tagPickerRender();
}
function tagPickerRemove(id,name){
  var st=tagPickerState(id); if(!st) return;
  st.values=st.values.filter(function(v){ return tagSlug(v)!==tagSlug(name); });
  tagPickerCommit(id);
}
/* §336 duplicate prevention is case- and whitespace-insensitive */
function tagPickerCreate(){
  var name=TAGPICK.q.trim(); if(!name) return tagPickerFocusSearch();
  /* §P0-2 every creation path goes through createWorkspaceTag — no second
     implementation, no string-vs-object drift. */
  var made=createWorkspaceTag(name,{source:"picker"});
  if(!made.ok){ if(made.tag){ toast(tr("That tag already exists")); TAGPICK.q=""; return tagPickerToggle(made.tag.name); } return toast(tr(made.reason),"bad"); }
  TAGPICK.q="";
  tagPickerToggle(made.tag.name);
}
function tagPickerCommit(id){
  var st=tagPickerState(id); if(!st) return;
  tagPickerRefresh(id);
  if(typeof st.onchange==="function"){
    try { st.onchange(st.values.slice(),id); }
    catch(e){ console.error("tag picker onchange",e); }
  }
}
/* Escape closes, matching every other overlay in the app (§351). */
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"&&TAGPICK.id) tagPickerClose();
});
/* close on outside click */
document.addEventListener("mousedown",function(e){
  var pop=document.getElementById("tagPickPop");
  if(!pop||!pop.classList.contains("open")) return;
  if(pop.contains(e.target)||(e.target.closest&&e.target.closest(".tag-picker-add"))) return;
  tagPickerClose();
});
</script>
