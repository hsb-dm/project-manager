<script>
/* COMMENTS: AN ASSET THAT IS ALREADY HERE, ATTACHED AS IT IS (Oct 2026).

   Beside Task and Project, the comment box has Asset (on a phone, in its one attach menu, which lists the same
   buttons). It opens a picker with search:
   - in a task's comments: this task's own assets first — its versions and its Final files, with their previews —
     then the other tasks' assets in its project, then the Asset library;
   - in a project's discussion: every asset of the project — what its Assets and Files tabs list: each task's
     versions and files — then the Asset library.
   Picking one attaches that file as it is. Nothing is uploaded again or copied: the attachment carries what is
   needed to show and open it (name, type, url, driveId, preview, size, source) and where it came from
   (from: {kind:"version", task, v} · {kind:"file", task, id} · {kind:"library", id}). It has the shape an uploaded
   file has, so the comment's own drawing draws it — the picture preview, or the file chip
   (commentAttachmentsHtml, cmtAttChipHtml, cmtStagedChipHtml) — and it opens the same way. Only a picture brings
   its preview; any other file is a chip, as an uploaded one is.
   It is a reference, like a picked task: it is not filed under the task's Assets & versions again (cmtAssetsFrom,
   below), and the file it points to does not become one "from the comments" (fileFromComment, src/core.js), so a
   Final file picked into its own task's comments stays final.
   Only what the person may see is offered: the tasks this page was given (the server's choice), each gated the way
   the project's Files tab gates opening one (canI.viewTask, where there is one); the library, which every member
   receives. A task's files from its own comments are left out of "This task": they are in this thread already. */

var CMA_MAX=30;   /* rows per section; the search reaches the rest */
var CMA_PIC=/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
function cmaPicture(type,name){ return /^(image|logo|icon)$/.test(String(type||""))||CMA_PIC.test(String(name||"")); }
function cmaTaskSeen(t){ return !!t&&!t._draft&&(typeof canI==="undefined"||typeof canI.viewTask!=="function"||!!canI.viewTask(t)); }
function cmaLibraryShown(){ return typeof ASSETS!=="undefined"&&Array.isArray(ASSETS); }
function cmaKey(from){ return !from?"":from.kind==="version"?"v:"+from.task+":"+from.v:from.kind==="file"?"f:"+from.task+":"+from.id:"a:"+from.id; }
function cmaSource(url,driveId){ return driveId||(url&&typeof isGoogleLink==="function"&&isGoogleLink(url))?"gdrive":/^[/]files[/]/.test(String(url||""))?"server":url?"link":"local"; }

/* ---------- a row of the picker: something that can be shown or opened, or nothing ---------- */
function cmaItem(o){
  var url=String(o.url||""), preview=o.preview||"";
  if(!url&&!preview) return null;   /* a placeholder version, a file kept nowhere: nothing to show or open */
  var pic=cmaPicture(o.type,o.name)||!url;
  return {id:cmaKey(o.from),name:String(o.name||"").trim()||url,type:pic?"image":(o.type||"other"),url:url,driveId:o.driveId||null,preview:preview,pic:pic,
    size:o.size&&o.size!=="—"?String(o.size):"",source:o.source||cmaSource(url,o.driveId),from:o.from,ago:+o.ago||0,
    _icon:o.icon||cmaIcon({url:url,preview:preview,name:o.name,badge:o.badge}),_sub:o.sub||"",_find:String(o.find||"").toLowerCase()};
}
/* the square beside its name: the picture itself, the Google or brand mark, the version's colour, the file's type */
function cmaIcon(o){
  if(o.preview) return '<span class="sq cma-thumb"><img src="'+attr(o.preview)+'" alt="" loading="lazy"></span>';
  if(o.url&&typeof isGoogleLink==="function"&&isGoogleLink(o.url)) return '<span class="sq cma-ico cma-g">'+(typeof googleIcon==="function"?googleIcon(o.url):I.link)+'</span>';
  var bi=o.url&&typeof brandIconHtml==="function"?brandIconHtml(o.url,18):""; if(bi) return '<span class="sq cma-ico">'+bi+'</span>';
  if(o.badge) return '<span class="sq cma-badge" style="background:'+attr(o.badge[1])+'">'+esc(o.badge[0])+'</span>';
  var e=typeof DESC_FILE_EXT!=="undefined"&&typeof descFileExt==="function"?DESC_FILE_EXT[descFileExt(o.name)]:null;
  if(e) return '<span class="sq cma-badge" style="background:'+e[1]+'">'+esc(e[0])+'</span>';
  return '<span class="sq">'+(o.url&&!/^[/]files[/]/.test(o.url)?I.link:I.assets)+'</span>';
}
function cmaSub(parts){ return parts.filter(Boolean).join(" · "); }
function cmaTaskSub(t){ return '<span data-no-translate>'+esc(t.id)+' · '+esc(t.title||"")+'</span>'; }

/* ---------- one task's assets ----------
   Its versions, newest first, then its files, newest first. A version's own file (the same address, Drive file or
   picture) is listed once, as the version, under the file's name. all: its files from the comments too (a
   project's Files tab lists them); other: say which task it is. */
function cmaTaskItems(t,all,other){
  var out=[], used={}, files=t.files||[], where=other?cmaTaskSub(t):"", find=function(x){ return [x,t.id,other?t.title:""].join(" "); };
  (t.versions||[]).slice().sort(function(a,b){ return (+b.n||0)-(+a.n||0); }).forEach(function(v){
    var url=v.driveUrl||v.url||"", f=null;
    files.forEach(function(x){ if(!f&&((url&&x.url===url)||(v.driveId&&x.driveId===v.driveId)||(v.img&&x.preview===v.img))) f=x; });
    var it=cmaItem({from:{kind:"version",task:t.id,v:v.n},name:(f&&f.name)||("V"+v.n+(v.note?" — "+v.note:"")),type:f?f.type:(v.img?"image":"document"),
      url:url,driveId:v.driveId||(f&&f.driveId),preview:v.img||(f&&f.preview),size:f&&f.size,source:f&&f.source,ago:v.ago,badge:["V"+v.n,v.color||"#546E7A"],
      sub:cmaSub([esc(tr("Version")+" "+v.n),v.state==="approved"?esc(tr("Approved")):"",where]),find:find("v"+v.n+" "+(f?f.name:"")+" "+(v.note||""))});
    if(f) used[f.id]=1; if(it) out.push(it);
  });
  files.filter(function(f){ return !used[f.id]&&(all||!(typeof fileFromComment==="function"&&fileFromComment(t,f))); }).sort(function(a,b){ return (a.ago||0)-(b.ago||0); }).forEach(function(f){
    var it=cmaItem({from:{kind:"file",task:t.id,id:f.id},name:f.name,type:f.type,url:f.url,driveId:f.driveId,preview:f.preview,size:f.size,source:f.source,ago:f.ago,
      sub:cmaSub([f.size&&f.size!=="—"?esc(f.size):"",where]),find:find(f.name)});
    if(it) out.push(it);
  });
  return out;
}
/* several tasks' assets, the newest first */
function cmaTasksItems(list){ var out=[]; list.forEach(function(t){ out=out.concat(cmaTaskItems(t,true,true)); }); return out.sort(function(a,b){ return a.ago-b.ago; }); }
function cmaProjectTasks(pids){ return TASKS.filter(function(t){ return cmaTaskSeen(t)&&pids.some(function(pid){ return inProject(t,pid); }); }); }
function cmaLibraryItem(a){
  var tile=a.img?"":'<span class="sq cma-badge" style="background:'+attr(a.color||"#546E7A")+'">'+(typeof assetChip==="function"?assetChip(a):esc(a.type||""))+'</span>';
  return cmaItem({from:{kind:"library",id:a.id},name:a.name,type:a.type,url:a.url,driveId:a.driveId,preview:a.img,size:a.size,source:a.source,icon:tile||null,
    sub:a.size?esc(a.size):"",find:[a.name,(a.tags||[]).join(" ")].join(" ")});
}

/* ---------- the picker's sections, for the box it was opened from ---------- */
/* ctx: {task, pids (its projects)} in a task's comments, {project} in a project's discussion */
function cmaLists(ctx){
  var out=[];
  if(ctx.task){
    out.push({title:tr("This task"),items:cmaTaskItems(ctx.task,false,false)});
    if(ctx.pids.length) out.push({title:tr("Other tasks in this project"),items:cmaTasksItems(cmaProjectTasks(ctx.pids).filter(function(t){ return t.id!==ctx.task.id; }))});
  } else if(ctx.project) out.push({title:tr("This project"),items:cmaTasksItems(cmaProjectTasks([ctx.project]))});
  if(cmaLibraryShown()) out.push({title:tr("Asset library"),items:ASSETS.map(cmaLibraryItem).filter(Boolean)});
  return out;
}
function cmaFilter(lists,q){ var ql=String(q||"").trim().toLowerCase();
  return lists.map(function(s){ return {title:s.title,items:s.items.filter(function(it){ return !ql||it.name.toLowerCase().indexOf(ql)>=0||it._find.indexOf(ql)>=0; }).slice(0,CMA_MAX)}; }).filter(function(s){ return s.items.length; }); }
/* what goes with the comment: the shape an upload lands as (cmtUpStart, src/drawer.js), and where it came from */
function cmaAttachment(it){ var a={name:it.name,type:it.type};
  if(it.url) a.url=it.url; if(it.driveId) a.driveId=it.driveId; if(it.pic&&it.preview) a.preview=it.preview;
  a.size=it.size; a.source=it.source; a.from=it.from; return a; }

/* ---------- Asset ---------- */
function cmtAttachAsset(btn){
  var key=typeof CMT_DRAFT_FOR==="undefined"?null:CMT_DRAFT_FOR, pid=key&&typeof cmtIsProjectKey==="function"&&cmtIsProjectKey(key)?cmtKeyProject(key):null;
  var tk=pid?null:((key&&task(typeof cmtKeyBase==="function"?cmtKeyBase(key):key))||(S.drawerTask?task(S.drawerTask):null));
  if(!pid&&!tk) return;
  var box=btn&&btn.closest?btn.closest(".composer"):null, anchor=btn&&btn.offsetParent?btn:((box&&box.querySelector(".m-attach"))||document.querySelector("#drawer .composer .m-attach")||btn);
  var ctx=pid?{project:pid}:{task:tk,pids:[tk.proj].concat(tk.alsoIn||[]).filter(function(x,i,a){ return x&&a.indexOf(x)===i; })};
  var lists=null, staged=(window._cmtAtt||[]).filter(function(a){ return a&&a.from; }).map(function(a){ return cmaKey(a.from); });
  entityPicker({kind:"asset",anchor:anchor,placeholder:tr("Find an asset…"),title:tr("Attach an asset"),selected:staged,
    sections:function(q){ return cmaFilter(lists||(lists=cmaLists(ctx)),q); },
    onSelect:function(it){ cmaPick(it); }});
}
function cmaPick(it){
  if((window._cmtAtt||[]).some(function(a){ return a&&a.from&&cmaKey(a.from)===it.id; })) return toast(tr("Already attached"));
  cmtStage(cmaAttachment(it));
}

/* ---------- a reference, not filed again ---------- */
(function(){
  if(typeof cmtAssetsFrom!=="function") return;
  var base=cmtAssetsFrom;
  cmtAssetsFrom=function(att,text){ return base.call(this,(att||[]).filter(function(a){ return !(a&&a.from); }),text); };
})();

Object.assign(UI_ID,{
  "Asset":"Aset","Attach an asset":"Lampirkan aset","Find an asset…":"Cari aset…",
  "This task":"Task ini","Other tasks in this project":"Task lain di project ini","This project":"Project ini","Asset library":"Pustaka aset"
});
</script>
<style>
/* the picker's rows: a picture shows itself, a file its type, a version its colour (as the project's Files tab does) */
.ep-row .sq.cma-thumb{overflow:hidden;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface-sunken)}
.ep-row .sq.cma-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ep-row .sq.cma-badge{border-radius:8px;color:#fff;font-size:9px;font-weight:800;letter-spacing:.02em;font-family:var(--font-mono);text-transform:uppercase}
.ep-row .sq.cma-badge svg{width:15px;height:15px;stroke:#fff}
.ep-row .sq.cma-ico{border-radius:8px}
.ep-row .sq.cma-g{background:#fff;border:1px solid var(--color-border)}   /* Google's marks are drawn for a light tile: a Drive folder is grey */
.ep-row .sq.cma-ico .drive-logo{width:17px;height:17px;margin:0}
</style>
