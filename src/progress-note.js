<script>
/* ============================================================
   PROGRESS NOTE
   A tab beside Comments: where the task stands, in free text written the way the description is.
   It is kept as versions, like an asset's: V1, V2, V3… Saving changes the latest version (a typo, a
   new line); "New version" starts the next one from the latest text, and the ones before stay as they
   were, to be read. Internal — stakeholders do not see it. A new version tells the people the task
   concerns. The latest version goes into the Excel export.
   ============================================================ */
var PN={ edit:null, view:{} };   /* edit: {key, mode:"edit"|"new", v, draft}; view: task id → the version shown */
function pnList(tk){ return ((tk&&tk.progress)||[]).slice().sort(function(a,b){ return a.v-b.v; }); }
function pnLatest(tk){ var l=pnList(tk); return l[l.length-1]||null; }
/* who sees and writes them is set per role (Roles & permissions); the server decides, this only shapes the tab */
function pnCanSee(){ var p=PEOPLE[ME]; return !(p&&p.stakeholder)&&(has("view_progress_notes")||has("write_progress_notes")); }
function pnCanWrite(tk){ return !!tk&&!tk._draft&&pnCanSee()&&has("write_progress_notes"); }
function pnWhen(iso){ if(!iso) return ""; var d=new Date(iso); if(isNaN(d)) return ""; return d.toLocaleString(UI_LANG==="id"?"id-ID":"en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
/* the text of a note, plain: for the Excel export (links keep their address) */
function pnPlain(md){ var d=document.createElement("div"); d.innerHTML=descMdHtml(md||"").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi,"$&\n");
  d.querySelectorAll("a[href]").forEach(function(a){ var h=a.getAttribute("href")||""; if(/^\//.test(h)) h=location.origin+h; if(h&&a.textContent.indexOf(h)<0) a.textContent=a.textContent+" ("+h+")"; });
  return d.textContent.replace(/ /g," ").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim(); }

function progressView(tk){
  var list=pnList(tk), last=list[list.length-1], ed=pnCanWrite(tk), e=PN.edit&&PN.edit.key===tk.id?PN.edit:null;
  var sel=null; if(!e){ list.forEach(function(x){ if(x.v===PN.view[tk.id]) sel=x; }); sel=sel||last; }
  /* a few versions are chips; past PN_CHIPS they fold into one dropdown, as an asset's versions do */
  var chips=(list.length>PN_CHIPS?pnPicker(tk,list,sel,e):list.map(function(x){ var on=e?(e.mode==="edit"&&x.v===e.v):(sel&&x.v===sel.v); return '<button type="button" class="pn-chip'+(on?" on":"")+'" aria-pressed="'+on+'" '+(e?'disabled':'onclick="pnShow('+jsq(tk.id)+','+x.v+')"')+'>V'+x.v+'</button>'; }).join(""))+(e&&e.mode==="new"?'<span class="pn-chip on new">V'+e.v+' · '+tr("new")+'</span>':'');
  var acts="";
  if(e) acts='<button class="btn xs" onclick="pnCancel()">'+tr("Cancel")+'</button><button class="btn xs primary" id="pnSave" onmousedown="event.preventDefault()" onclick="pnSave()">'+I.check+tr(e.mode==="new"?"Save new version":"Save")+'</button>';
  else if(ed&&list.length) acts=(sel===last?'<button class="btn xs" onclick="pnStart(\'edit\')">'+I.edit+tr("Edit")+'</button>':'')+'<button class="btn xs primary" onclick="pnStart(\'new\')">'+I.plus+tr("New version")+'</button>';
  var h='<div class="pn"><div class="pn-head"><span class="eyebrow">'+tr("Progress note")+'</span>'+(chips?'<span class="pn-chips">'+chips+'</span>':'')+'<span class="spacer"></span>'+acts+'</div>'+pnChecklistLine(tk);
  if(e){
    var b=function(act,label,html){ return '<button type="button" class="md-btn" title="'+attr(tr(label))+'" aria-label="'+attr(tr(label))+'" onmousedown="event.preventDefault()" onclick="pnFormat(\''+act+'\')">'+html+'</button>'; };
    h+='<div class="md-editor"><div class="md-toolbar">'+b("bold","Bold","<b>B</b>")+b("italic","Italic","<i>I</i>")+b("strike","Strikethrough","<s>S</s>")+'<span class="md-sep"></span>'+b("h","Heading","H")+b("ul","Bullet list","•&thinsp;≡")+b("ol","Numbered list","1.&thinsp;≡")+b("quote","Quote","❝")+'</div>'
      +'<div class="md-src md-wysiwyg pn-src" id="pnSrc" data-for="'+attr(tk.id)+'" contenteditable="true" role="textbox" aria-multiline="true" aria-label="'+attr(tr("Progress note"))+'" data-placeholder="'+attr(tr("Where does this task stand? What is done, what is next, what is blocking it…"))+'" oninput="pnInput()" onpaste="pnPaste(event)" onkeydown="if((event.metaKey||event.ctrlKey)&&event.key===\'Enter\'){event.preventDefault();pnSave();}">'+(e.draft?descMdHtml(e.draft):"")+'</div>'
      +'<div class="hint pn-hint">'+(e.mode==="new"?tr("Saving creates")+' V'+e.v+'. '+(e.v>1?tr("The earlier versions stay as they are."):""):tr("Saving changes")+' V'+e.v+'. '+tr("To keep this version as it is, start a new version instead."))+' '+tr("Ctrl+Enter saves.")+'</div></div>';
  } else if(!list.length){
    h+='<div class="pn-empty">'+emptyBox(tr("No progress note yet"),tr("Write where the task stands — what is done, what is next. Each update can be kept as a new version."),I.edit,ed?'<button class="btn primary" onclick="pnStart(\'new\')">'+I.plus+tr("Write the first note")+'</button>':'')+'</div>';
  } else {
    var canDel=sel.by===ME||canI.manageWorkspace();
    h+='<div class="pn-meta"><b>V'+sel.v+'</b> · <span data-no-translate>'+esc(person(sel.by).name||"")+'</span> · '+esc(pnWhen(sel.at))+(sel.editedAt?' · '+tr("edited")+' '+esc(pnWhen(sel.editedAt))+(sel.editedBy&&sel.editedBy!==sel.by?' '+tr("by")+' <span data-no-translate>'+esc(person(sel.editedBy).name||"")+'</span>':''):'')
      +(canDel&&ed?'<span class="spacer"></span><button class="btn xs ghost pn-del" title="'+attr(tr("Delete this version"))+'" onclick="pnDelete('+jsq(tk.id)+','+sel.v+')">'+I.trash+tr("Delete version")+'</button>':'')+'</div>'
      +(sel!==last?'<div class="hint pn-old">'+tr("An earlier version — it stays as it was.")+' <a href="#" onclick="event.preventDefault();pnShow('+jsq(tk.id)+','+last.v+')">'+tr("See the latest")+' (V'+last.v+')</a></div>':'')
      +'<div class="md-view pn-view"'+(ed&&sel===last?' ondblclick="pnStart(\'edit\')" title="'+attr(tr("Double-click to edit"))+'"':'')+'>'+descMdHtml(sel.text)+'</div>';
  }
  return h+'</div>'; }

/* The checklist beside the note, in one line: how far it is and what comes next — what a note is written from.
   The list itself stays on the Brief tab; the line opens it there. */
function pnChecklistLine(tk){ var items=(tk.meta&&tk.meta.checklist)||[]; if(!items.length) return ""; var done=items.filter(function(x){ return x.done; }).length, next=items.filter(function(x){ return !x.done; })[0];
  return '<button type="button" class="pn-chk" title="'+attr(tr("Open the checklist"))+'" onclick="pnToChecklist()"><b>'+tr("Checklist")+'</b><span class="pn-chk-n">'+done+'/'+items.length+'</span><span class="pn-chk-bar"><i style="width:'+Math.round(done/items.length*100)+'%"></i></span><span class="pn-chk-next">'+(next?tr("Next")+': <span data-no-translate>'+esc(next.text)+'</span>':tr("All done"))+'</span></button>'; }
function pnToChecklist(){ S.drawerTab="brief"; renderDrawer(); var c=document.querySelector("#drawer .chk"); if(c) c.scrollIntoView({block:"nearest"}); }

/* many versions: one button showing the version on screen, and a list of them all (newest first) */
var PN_CHIPS=5;
function pnPicker(tk,list,sel,e){ var last=list[list.length-1], cur=e?(e.mode==="edit"?e.v:last.v):(sel?sel.v:last.v);   /* writing a new one: the latest it starts from */
  return '<button type="button" class="pn-pick" data-menu aria-haspopup="listbox" '+(e?'disabled':'onclick="pnPickMenu(this,'+jsq(tk.id)+')"')+' title="'+attr(tr("All versions")+" ("+list.length+")")+'"><b>V'+cur+'</b>'+(cur===last.v?'<span>'+tr("latest")+'</span>':'')+'<span class="pn-pick-n">'+list.length+' '+tr("versions")+'</span>'+I.chevd+'</button>'; }
function pnPickMenu(a,id){ var tk=task(id); if(!tk) return; var list=pnList(tk).slice().reverse(), last=list[0], cur=PN.view[id]||last.v;
  ctxMenu(a,'<div class="pn-menu" role="listbox"><div class="mh">'+tr("All versions")+' ('+list.length+')</div>'+list.map(function(p){ var first=pnPlain(p.text).split("\n")[0].slice(0,70);
    return '<button type="button" role="option" aria-selected="'+(p.v===cur)+'" class="pn-menu-row'+(p.v===cur?" on":"")+'" onclick="closePops();pnShow('+jsq(id)+','+p.v+')"><b>V'+p.v+'</b><span class="pn-menu-main"><span class="pn-menu-meta"><span data-no-translate>'+esc(person(p.by).name||"")+'</span> · '+esc(pnWhen(p.editedAt||p.at))+(p===last?' · <em>'+tr("latest")+'</em>':'')+'</span><span class="pn-menu-snip" data-no-translate>'+esc(first)+'</span></span></button>'; }).join("")+'</div>'); }
function pnTask(){ return S.drawerTask?task(S.drawerTask):null; }
function pnShow(id,v){ PN.view[id]=v; renderDrawer(); }
function pnStart(mode){ var tk=pnTask(); if(!pnCanWrite(tk)) return toast(tr("You don't have permission to edit this task"),"bad"); var last=pnLatest(tk);
  PN.edit=mode==="edit"&&last?{key:tk.id,mode:"edit",v:last.v,draft:last.text}:{key:tk.id,mode:"new",v:(last?last.v:0)+1,draft:last?last.text:""};
  renderDrawer(); setTimeout(function(){ var el=document.getElementById("pnSrc"); if(!el) return; el.focus(); try{ var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(x){} },0); }
function pnCancel(){ PN.edit=null; renderDrawer(); }
var _pnT=null; function pnInput(){ clearTimeout(_pnT); _pnT=setTimeout(function(){ var el=document.getElementById("pnSrc"); if(el&&PN.edit&&el.getAttribute("data-for")===PN.edit.key) PN.edit.draft=descHtmlToMd(el.innerHTML); },300); }
function pnPaste(e){ var cd=e.clipboardData; if(!cd) return; if(cd.files&&cd.files.length) return; var html=cd.getData("text/html"), md=html?descHtmlToMd(html,{paste:true}):cd.getData("text/plain"); if(!md) return; e.preventDefault(); document.execCommand("insertHTML",false,descMdHtml(md)); pnInput(); }
function pnFormat(act){ var el=document.getElementById("pnSrc"); if(!el) return; el.focus(); var cmd={bold:"bold",italic:"italic",strike:"strikeThrough",h:"formatBlock",ul:"insertUnorderedList",ol:"insertOrderedList",quote:"formatBlock"}[act]; if(!cmd) return; if(act==="h"||act==="quote") document.execCommand(cmd,false,act==="h"?"<h3>":"<blockquote>"); else document.execCommand(cmd,false,null); pnInput(); }
function pnSave(){ var tk=pnTask(), e=PN.edit, el=document.getElementById("pnSrc"); if(!tk||!e||e.key!==tk.id||!el) return; var md=descHtmlToMd(el.innerHTML); e.draft=md;
  if(!md.trim()) return toast(tr("Write something first"),"bad"); var last=pnLatest(tk);
  if(e.mode==="edit"&&last&&last.text===md){ PN.edit=null; renderDrawer(); return; }
  var btn=document.getElementById("pnSave"); if(btn) btn.disabled=true;
  var done=function(doc){ if(doc) replaceInto(tk,hTask(doc)); PN.edit=null; PN.view[tk.id]=(pnLatest(tk)||{}).v; refresh(); if(e.mode==="new"){ if(typeof notifyTask==="function") notifyTask("progress",tk); toast(tr("Progress note saved as")+" V"+e.v); } else toast(tr("Progress note updated")); };
  if(!API.on){ tk.progress=pnList(tk); var now=new Date().toISOString(); if(e.mode==="new") tk.progress.push({v:e.v,text:md,by:ME,at:now,editedBy:null,editedAt:null}); else { last.text=md; last.editedBy=ME; last.editedAt=now; } log(tk,e.mode==="new"?"progress":"progress_edited",{v:e.v}); return done(null); }
  apiFetch(e.mode==="new"?"POST":"PUT","/api/tasks/"+encodeURIComponent(tk.id)+"/progress"+(e.mode==="new"?"":"/"+e.v),{text:md}).then(done).catch(function(err){ if(btn) btn.disabled=false; toast(err.message||tr("Could not save the progress note"),"bad"); }); }
function pnDelete(id,v){ var tk=task(id); if(!tk) return;
  confirmModal(tr("Delete progress note")+" V"+v+"?",tr("This version is removed for everyone. The other versions stay."),function(){
    var done=function(doc){ if(doc) replaceInto(tk,hTask(doc)); PN.view[id]=(pnLatest(tk)||{}).v; refresh(); toast(tr("Version removed")); };
    if(!API.on){ tk.progress=pnList(tk).filter(function(x){ return x.v!==v; }); log(tk,"progress_removed",{v:v}); return done(null); }
    apiFetch("DELETE","/api/tasks/"+encodeURIComponent(id)+"/progress/"+v).then(done).catch(function(err){ toast(err.message,"bad"); }); },true); }

/* What is being written survives a redraw (a colleague's update, a save elsewhere): the editor is put back
   as the very same element, caret and all — it is not saved until Save, so nothing else holds it. */
(function(){ if(typeof renderDrawer!=="function") return; var base=renderDrawer;
  renderDrawer=function(){ var el=document.getElementById("pnSrc"), ae=document.activeElement, had=!!(el&&ae&&el.contains(ae)), rng=null;
    if(el&&PN.edit&&el.getAttribute("data-for")===PN.edit.key){ PN.edit.draft=descHtmlToMd(el.innerHTML); if(had){ var s=window.getSelection(), r0=s&&s.rangeCount?s.getRangeAt(0):null; if(r0&&el.contains(r0.startContainer)&&el.contains(r0.endContainer)) rng={sc:r0.startContainer,so:r0.startOffset,ec:r0.endContainer,eo:r0.endOffset}; } } else el=null;
    var out=base.apply(this,arguments);
    if(el){ var fresh=document.getElementById("pnSrc"); if(fresh&&fresh!==el&&fresh.getAttribute("data-for")===el.getAttribute("data-for")){ fresh.replaceWith(el); if(had){ try{ el.focus({preventScroll:true}); }catch(x){ el.focus(); } if(rng){ try{ var r=document.createRange(); r.setStart(rng.sc,rng.so); r.setEnd(rng.ec,rng.eo); var s2=window.getSelection(); s2.removeAllRanges(); s2.addRange(r); }catch(x){} } } } }
    return out; };
})();

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"Progress note":"Catatan progres","New version":"Versi baru","Save new version":"Simpan versi baru","new":"baru","Where does this task stand? What is done, what is next, what is blocking it…":"Bagaimana posisi task ini? Apa yang sudah selesai, apa berikutnya, apa yang menghambat…","Saving creates":"Menyimpan akan membuat","The earlier versions stay as they are.":"Versi sebelumnya tetap seperti semula.","Saving changes":"Menyimpan akan mengubah","To keep this version as it is, start a new version instead.":"Untuk mempertahankan versi ini apa adanya, buat versi baru.","Ctrl+Enter saves.":"Ctrl+Enter untuk menyimpan.","No progress note yet":"Belum ada catatan progres","Write where the task stands — what is done, what is next. Each update can be kept as a new version.":"Tulis posisi task ini — apa yang sudah selesai, apa berikutnya. Setiap pembaruan bisa disimpan sebagai versi baru.","Write the first note":"Tulis catatan pertama","edited":"diubah","by":"oleh","Delete this version":"Hapus versi ini","Delete version":"Hapus versi","An earlier version — it stays as it was.":"Versi sebelumnya — tetap seperti semula.","See the latest":"Lihat yang terbaru","Double-click to edit":"Klik dua kali untuk mengedit","Write something first":"Tulis sesuatu dulu","Progress note saved as":"Catatan progres disimpan sebagai","Progress note updated":"Catatan progres diperbarui","Could not save the progress note":"Catatan progres tidak bisa disimpan","Delete progress note":"Hapus catatan progres","This version is removed for everyone. The other versions stay.":"Versi ini dihapus untuk semua orang. Versi lainnya tetap ada.","Version removed":"Versi dihapus","Note version":"Versi catatan","Note updated":"Catatan diperbarui","latest":"terbaru","versions":"versi","All versions":"Semua versi"});
</script>
