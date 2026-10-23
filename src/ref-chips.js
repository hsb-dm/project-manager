<script>
/* ============================================================
   PEOPLE, TASKS AND PROJECTS IN THE WRITING
   The description and a progress note (the rich editors) and the brief's fields (plain boxes) take
   what chat takes: "@" names someone — the picker opens at the caret, as in chat and comments — and
   a task or a project goes in as a chip, from the @ / Task / Project buttons. Whoever is newly named
   is told ("mentioned you in …") when the writing is saved.

   Kept in the text as   @Full Name   ·   [T-101](#task=T-101)   ·   [Launch Q4](#project=p_ab12)
   and, in a brief's field, a task as its id alone (T-101) — readable wherever the text goes: the
   export, the AI's context, a search. A chip is drawn from what its task or project is now (a renamed
   task shows its new title); one that is gone, or out of the reader's sight, stays as its label.
   A task id written by hand (T-101) is a chip too, once the writing is read.
   ============================================================ */
var REF={ told:{} };   /* told: task id → the people the description already names (or was told about) */
var REF_TOKEN=/\[([^\]\n]{1,200})\]\(#(task|project)=([A-Za-z0-9_.:-]{1,80})\)/g;
function refUnesc(s){ return String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"); }
function refToken(kind,id,label){ return "["+(String(label||id).replace(/[\[\]\n]/g,"").trim()||id)+"](#"+kind+"="+id+")"; }
function refChipHtml(kind,id,label){
  var tk=kind==="task"?task(id):null, pj=kind==="project"?project(id):null, ok=!!((tk&&!tk._draft)||pj), text=tk?tk.id+" · "+tk.title:pj?pj.name:(label||id);
  return '<a class="msg-entity-link ref-chip'+(ok?"":" gone")+'" href="#'+kind+'='+attr(encodeURIComponent(id))+'" data-ref="'+kind+':'+attr(id)+'" data-label="'+attr(label||id)+'" contenteditable="false" title="'+attr(ok?text:tr("Not available"))+'" onclick="refChipClick(event,this)">'+(kind==="task"?I.tasks:I.projects)+'<span data-no-translate>'+esc(text)+'</span></a>'; }
function refMentionHtml(id,view){ return '<span class="msg-mention ref-mention'+(id===ME?" self":"")+'" data-uid="'+attr(id)+'"'+(view?' role="button" tabindex="0"':'')+' contenteditable="false" data-no-translate>@'+esc(person(id).name)+'</span>'; }
function refChipClick(e,a){ e.preventDefault(); if(a.closest('[contenteditable="true"],.composer')) return; e.stopPropagation();
  var r=String(a.getAttribute("data-ref")||""), i=r.indexOf(":"), kind=r.slice(0,i), id=r.slice(i+1);
  if(kind==="task"&&task(id)&&!task(id)._draft) openTask(id);
  else if(kind==="project"&&project(id)){ if(S.drawerTask) closeDrawer(); go("projects",id); } }

/* ---------- reading: chips and names in written text ---------- */
/* the people in the workspace, longest name first, so "@Anna Wijaya" is never read as "@Anna" */
function refPeopleByName(){ return Object.keys(PEOPLE).map(function(id){ return {id:id,name:person(id).name}; }).filter(function(p){ return p.name; }).sort(function(a,b){ return b.name.length-a.name.length; }); }
var REF_RX_ESC=/[.*+?^${}()|[\]\\]/g;
/* text that is already HTML-escaped: names, tokens and task ids become chips */
function refTextPart(s,people){
  s=s.replace(REF_TOKEN,function(m,label,kind,id){ return "\u0000r"+kind+":"+id+"\u0002"+label+"\u0001"; });
  s=s.replace(/(^|[\s(\[,;: ])(T-R?\d{1,7})(?=$|[\s).,;:!?\] ])/g,function(m,lead,id){ var tk=task(id); return tk&&!tk._draft?lead+"\u0000rtask:"+id+"\u0002"+id+"\u0001":m; });
  if(s.indexOf("@")>=0) people.forEach(function(p){ var e=esc("@"+p.name).replace(REF_RX_ESC,"\\$&");
    s=s.replace(new RegExp("(^|[\\s(\\u00a0])"+e+"(?=$|[\\s.,!?;:)\\u00a0])","g"),function(m,lead){ return lead+"\u0000m"+p.id+"\u0001"; }); });
  return s.replace(/\u0000r(task|project):([^\u0002]+)\u0002([^\u0001]*)\u0001/g,function(m,kind,id,label){ return refChipHtml(kind,id,refUnesc(label)); })
    .replace(/\u0000m([^\u0001]+)\u0001/g,function(m,id){ return refMentionHtml(id,true); }); }
/* HTML: only the text between tags, and none inside a link, code, or a name already drawn */
function refHtml(html){ html=String(html||""); if(!/[@#]|T-/.test(html)) return html; var people=refPeopleByName(), skip=0, after=false;
  return html.split(/(<[^>]+>)/).map(function(part,i){
    if(i%2){ if(/^<(a|code|pre|textarea)\b/i.test(part)) skip++; else if(/^<\/(a|code|pre|textarea)>/i.test(part)) skip=Math.max(0,skip-1); after=/^<span[^>]*\bmsg-mention\b/.test(part); return part; }
    if(skip||after){ after=false; return part; }
    return refTextPart(part,people); }).join(""); }

/* The rich editors' text: tokens become chips before the Markdown is read (a label's * or _ is not
   emphasis), names and hand-written ids after. */
(function(){
  if(typeof descMdInline==="function"){ var inl=descMdInline;
    descMdInline=function(s){ var keep=[]; s=String(s).replace(REF_TOKEN,function(m,label,kind,id){ keep.push(refChipHtml(kind,id,refUnesc(label))); return "\u0004"+(keep.length-1)+"\u0005"; });
      var out=inl(s); return keep.length?out.replace(/\u0004(\d+)\u0005/g,function(m,i){ return keep[+i]; }):out; }; }
  if(typeof descMdHtml==="function"){ var md=descMdHtml; descMdHtml=function(src){ return refHtml(md.apply(this,arguments)); }; }
  /* writing back: a chip is its token again; a name is its text ("@Full Name") */
  if(typeof descHtmlToMd==="function"){ var back=descHtmlToMd;
    descHtmlToMd=function(html,opts){ if(/data-ref=/.test(String(html||""))){ var d=document.createElement("div"); d.innerHTML=html;
        d.querySelectorAll("[data-ref]").forEach(function(a){ var r=String(a.getAttribute("data-ref")), i=r.indexOf(":"); a.replaceWith(document.createTextNode(refToken(r.slice(0,i),r.slice(i+1),a.getAttribute("data-label")||r.slice(i+1)))); });
        html=d.innerHTML; }
      return back.call(this,html,opts); }; }
})();

/* ---------- who is named ---------- */
function refMentionIds(text){ var s=String(text||""), out=[]; if(s.indexOf("@")<0) return out;
  refPeopleByName().forEach(function(p){ var re=new RegExp("(^|[\\s(\\u00a0\\[])@"+p.name.replace(REF_RX_ESC,"\\$&")+"(?=$|[\\s.,!?;:)\\u00a0\\]])","g");
    if(re.test(s)){ if(out.indexOf(p.id)<0) out.push(p.id); s=s.replace(re,"$1"); } });
  return out; }
/* tell whoever the new text names and the old one did not; a progress note is internal — no stakeholder */
function refNotify(tk,before,after,opts){ opts=opts||{}; if(!tk||tk._draft) return []; var was=refMentionIds(before);
  var now=refMentionIds(after).filter(function(id){ return id!==ME&&was.indexOf(id)<0&&!(opts.internal&&person(id).stakeholder)&&(opts.skip||[]).indexOf(id)<0; });
  if(now.length) notify("mention",now,tk.id); return now; }
function refBriefText(tk){ var b=(tk&&tk.brief)||{}; return Object.keys(b).filter(function(k){ return k!=="tpl"; }).map(function(k){ return b[k]||""; }).join("\n"); }

/* ---------- where the caret is, kept as a place in the text ----------
   A Range follows its editor out of the page, and the drawer redraws the description when it is
   saved while a picker has the focus. A count of characters from the start finds the same place in
   the editor drawn again from the same text. */
function refTextNodes(ed){ var out=[], w=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT,null), n; while((n=w.nextNode())) out.push(n); return out; }
function refCaretSave(ed){ var s=window.getSelection(); if(!ed||!s||!s.rangeCount) return null; var r=s.getRangeAt(0); if(!ed.contains(r.startContainer)) return null;
  var pre=document.createRange(); pre.selectNodeContents(ed); pre.setEnd(r.startContainer,r.startOffset); return {id:ed.id,off:pre.toString().length,range:r.cloneRange()}; }
function refCaretRestore(c){ var ed=c&&document.getElementById(c.id); if(!ed) return null; try{ ed.focus({preventScroll:true}); }catch(x){ ed.focus(); }
  var r=null;
  if(c.range&&ed.contains(c.range.startContainer)) r=c.range.cloneRange();
  else { var nodes=refTextNodes(ed), sum=0; r=document.createRange(); r.selectNodeContents(ed); r.collapse(false);
    for(var i=0;i<nodes.length;i++){ var n=nodes[i], len=n.nodeValue.length; if(sum+len>=c.off){ var lock=n.parentElement&&n.parentElement.closest('[contenteditable="false"]');
        if(lock&&ed.contains(lock)) r.setStartAfter(lock); else r.setStart(n,c.off-sum); r.collapse(true); break; } sum+=len; } }
  var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); return ed; }
/* nodes in at the caret (or at the end), the caret after them, and the editor told so it saves */
function refInsertNodes(ed,nodes){ var s=window.getSelection();
  if(!s.rangeCount||!ed.contains(s.getRangeAt(0).startContainer)){ var r0=document.createRange(); r0.selectNodeContents(ed); r0.collapse(false); s.removeAllRanges(); s.addRange(r0); }
  var r=s.getRangeAt(0); r.deleteContents(); nodes.forEach(function(n){ r.insertNode(n); r.setStartAfter(n); r.collapse(true); }); s.removeAllRanges(); s.addRange(r);
  ed.dispatchEvent(new Event("input",{bubbles:true})); }
function refNode(html){ var t=document.createElement("div"); t.innerHTML=html; return t.firstChild; }

/* ---------- which box, and who can be named in it ---------- */
function refRichEditor(t){ return t&&t.nodeType===1&&(t.id==="descSrc"||t.id==="pnSrc")&&t.getAttribute("contenteditable")==="true"?t:null; }
function refIsField(t){ return !!(t&&t.nodeType===1&&t.tagName==="TEXTAREA"&&t.hasAttribute("data-bf")&&t.closest&&t.closest("#drawer .brief")); }
function refField(bf){ var all=document.querySelectorAll("#drawer .brief textarea[data-bf]"); for(var i=0;i<all.length;i++) if(all[i].getAttribute("data-bf")===bf) return all[i]; return null; }
function refTask(){ return S.drawerTask?task(S.drawerTask):null; }
function refMentionable(where,id){ return !(where&&where.id==="pnSrc"&&person(id).stakeholder); }
function refTaskPeople(tk,where){ var ids=[], add=function(x){ if(x&&x!==ME&&PEOPLE[x]&&ids.indexOf(x)<0&&refMentionable(where,x)) ids.push(x); }; if(!tk) return ids;
  assigneesOf(tk).forEach(add); (typeof reviewersOf==="function"?reviewersOf(tk):[tk.reviewer]).forEach(add); add(tk.createdBy); return ids; }
function refPicker(){ var ep=document.getElementById("entityPicker"); return ep&&ep._ep&&typeof EP!=="undefined"&&EP.open&&EP.open._ref?ep:null; }
function refMentionPicker(){ var ep=refPicker(); return ep&&EP.open._refMention?ep:null; }

/* ---------- "@": the people picker at the caret ---------- */
function refRichQuery(ed){ var s=window.getSelection(); if(!s||!s.rangeCount) return null; var r=s.getRangeAt(0); if(!r.collapsed||!ed.contains(r.startContainer)||r.startContainer.nodeType!==3) return null;
  var n=r.startContainer, m=n.nodeValue.slice(0,r.startOffset).match(/(?:^|[\s (])@([^\s @]{0,40})$/); return m?{node:n,start:r.startOffset-m[1].length-1,end:r.startOffset,q:m[1]}:null; }
/* an anchor at the caret of a rich editor, for the picker to sit by; it keeps its last place while the caret is away */
function refCaretAnchor(id){ var last=null, cur=function(){ return document.getElementById(id); };
  return {contains:function(n){ var e=cur(); return !!(e&&e.contains(n)); },getBoundingClientRect:function(){ var e=cur(), rect=null;
    try{ var s=window.getSelection(); if(e&&s&&s.rangeCount){ var r=s.getRangeAt(0); if(e.contains(r.startContainer)){ var rs=r.getClientRects(); rect=rs.length?rs[0]:null; if(!rect||!rect.height){ var b=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement; rect=b.getBoundingClientRect(); } } } }catch(x){}
    if(rect&&rect.height) last={left:rect.left,right:rect.left+1,top:rect.top,bottom:rect.bottom,width:1,height:rect.height};
    return last||(e?e.getBoundingClientRect():{left:0,right:0,top:0,bottom:0,width:0,height:0}); }}; }
function refOpenMention(where,q,anchor){ REF.mention=where;
  var ctx={members:refTaskPeople(refTask(),where),membersTitle:"On this task"};
  /* _deferred: opened now, by typing — see comment-mention.js */
  entityPicker({_ref:true,_refMention:true,_deferred:true,kind:"person",anchor:anchor,align:"left",initial:q,placeholder:tr("Mention someone…"),context:ctx,
    search:function(query){ return epPersonItems(query,ctx).filter(function(id){ return id!=="@everyone"&&refMentionable(where,id); }); },
    onSelect:function(id){ refChooseMention(id); },
    onClose:function(){ REF.mention=null; }});
  var ep=document.getElementById("entityPicker"); if(ep){ ep.classList.add("ep-mention"); var sb=ep.querySelector(".ep-search"); if(sb) sb.setAttribute("tabindex","-1"); } }
function refChooseMention(id){ var w=REF.mention; if(!w||!PEOPLE[id]) return;
  if(w.mode==="rich"){ var ed=refCaretRestore(REF.caret)||document.getElementById(w.id); if(!ed) return; var at=refRichQuery(ed);
    if(at){ var r=document.createRange(); r.setStart(at.node,at.start); r.setEnd(at.node,at.end); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    REF.mention=null; refInsertNodes(ed,[refNode(refMentionHtml(id,false)),document.createTextNode(" ")]); return; }
  var ta=refField(w.bf); if(!ta) return; var pos=REF.pos!=null?Math.min(REF.pos,ta.value.length):ta.selectionStart;
  var before=ta.value.slice(0,pos).replace(/@[^\s@]*$/,""), after=ta.value.slice(pos), name=person(id).name;
  ta.value=before+"@"+name+" "+after.replace(/^ /,""); var p=before.length+name.length+2; ta.focus(); try{ ta.setSelectionRange(p,p); }catch(x){}
  REF.mention=null; ta.dispatchEvent(new Event("input",{bubbles:true})); }

/* typing: listened for on the document — the drawer redraws its boxes often */
document.addEventListener("input",function(e){ var t=e.target, ed=refRichEditor(t), ep=refMentionPicker();
  if(ed){ var at=refRichQuery(ed); if(at){ REF.caret=refCaretSave(ed); if(ep) ep._ep.setQuery(at.q); else refOpenMention({mode:"rich",id:ed.id},at.q,refCaretAnchor(ed.id)); } else if(ep) epClose(); return; }
  if(refIsField(t)){ REF.pos=t.selectionStart; var q=msgCaretMention(t); if(q!==null){ if(ep) ep._ep.setQuery(q); else refOpenMention({mode:"plain",bf:t.getAttribute("data-bf")},q,msgCaretAnchor(t)); } else if(ep) epClose(); } });
/* the keys choose in the picker, before the box's own handlers (Enter is not a new line then) */
document.addEventListener("keydown",function(e){ var t=e.target; if(!refRichEditor(t)&&!refIsField(t)) return; var ep=refMentionPicker(); if(!ep) return;
  var stop=function(){ e.preventDefault(); e.stopPropagation(); };
  if(e.key==="ArrowDown"){ stop(); ep._ep.move(1); } else if(e.key==="ArrowUp"){ stop(); ep._ep.move(-1); }
  else if((e.key==="Enter"||e.key==="Tab")&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){ if(ep._ep.count()){ stop(); ep._ep.choose(); } }
  else if(e.key==="Escape"){ stop(); epClose(); } },true);
document.addEventListener("keyup",function(e){ var ed=refRichEditor(e.target); if(ed&&refMentionPicker()) REF.caret=refCaretSave(ed)||REF.caret; else if(refIsField(e.target)) REF.pos=e.target.selectionStart; });
/* The picker focuses its own search box; for a name typed with "@" the typing has to stay in the
   writing, so the focus goes straight back, caret where it was (as comment-mention.js does). */
document.addEventListener("focusin",function(e){ var t=e.target;
  if(refIsField(t)) REF.lastBf=t.getAttribute("data-bf");
  if(!(typeof EP!=="undefined"&&EP.open&&EP.open._refMention)||!t||!t.closest||!t.closest("#entityPicker")) return; var w=REF.mention; if(!w) return;
  if(w.mode==="rich") refCaretRestore(REF.caret);
  else { var ta=refField(w.bf); if(ta){ ta.focus(); var p=REF.pos==null?ta.value.length:REF.pos; try{ ta.setSelectionRange(p,p); }catch(x){} } } });

/* ---------- the @ / Task / Project buttons ---------- */
function refBtn(kind,label,icon,cls){ /* data-menu: the click that opens a picker is not the click that closes open menus */
  return '<button type="button" class="'+cls+' ref-btn" data-menu aria-haspopup="listbox" data-ref-kind="'+kind+'" title="'+attr(tr(label))+'" aria-label="'+attr(tr(label))+'" onmousedown="event.preventDefault();refRemember(this)" onclick="refButton(this,\''+kind+'\')">'+icon+'</button>'; }
/* in a rich editor's toolbar */
function refToolbarHtml(){ return '<span class="md-sep"></span>'+refBtn("person","Mention someone",'<span class="ref-at">@</span>',"md-btn")+refBtn("task","Insert a task",I.tasks,"md-btn")+refBtn("project","Insert a project",I.projects,"md-btn"); }
/* above the brief's fields while they are edited: the buttons act on the field last written in */
function refBriefBarHtml(){ return '<div class="ref-bar"><span class="hint">'+tr("Type @ to mention someone. A task or a project goes in as a chip:")+'</span>'
  +refBtn("person","Mention someone",'<span class="ref-at">@</span><span>'+tr("Mention")+'</span>',"btn xs")+refBtn("task","Insert a task",I.tasks+'<span>'+tr("Task")+'</span>',"btn xs")+refBtn("project","Insert a project",I.projects+'<span>'+tr("Project")+'</span>',"btn xs")+'</div>'; }
/* mousedown, before the button can take the focus: where the caret was */
function refRemember(btn){ var host=btn.closest(".md-editor"), ed=host&&host.querySelector('[contenteditable="true"]');
  if(ed){ REF.where={mode:"rich",id:ed.id}; REF.caret=refCaretSave(ed)||{id:ed.id,off:Infinity}; return; }
  var ta=(REF.lastBf&&refField(REF.lastBf))||document.querySelector("#drawer .brief textarea[data-bf]");
  if(ta){ REF.where={mode:"plain",bf:ta.getAttribute("data-bf")}; REF.pos=ta.selectionStart; } else REF.where=null; }
function refButton(btn,kind){ var w=REF.where; if(!w) return;
  if(kind==="person"){
    if(w.mode==="rich"){ var ed=refCaretRestore(REF.caret); if(!ed) return; var s=window.getSelection(), r=s.rangeCount?s.getRangeAt(0):null, prev="";
      if(r&&r.startContainer.nodeType===3&&r.startOffset>0) prev=r.startContainer.nodeValue.charAt(r.startOffset-1);
      document.execCommand("insertText",false,(prev&&!/[\s (]/.test(prev)?" ":"")+"@"); return; }
    var ta=refField(w.bf); if(!ta) return; var p=Math.min(REF.pos==null?ta.value.length:REF.pos,ta.value.length); ta.focus();
    ta.setRangeText((p>0&&!/\s$/.test(ta.value.slice(0,p))?" ":"")+"@",p,p,"end"); ta.dispatchEvent(new Event("input",{bubbles:true})); return; }
  var tk=refTask();
  entityPicker({_ref:true,kind:kind,anchor:btn,placeholder:tr(kind==="task"?"Find a task…":"Find a project…"),context:{projectId:tk&&tk.proj},
    search:kind==="task"?function(q){ return epTaskItems(q,{projectId:tk&&tk.proj}).filter(function(t){ return !tk||t.id!==tk.id; }); }:undefined,
    onSelect:function(item){ refInsertRef(w,kind,item.id,kind==="task"?item.id:item.name); }}); }
function refInsertRef(w,kind,id,label){
  if(w.mode==="rich"){ var ed=refCaretRestore(REF.caret); if(!ed) return; refInsertNodes(ed,[refNode(refChipHtml(kind,id,label)),document.createTextNode(" ")]); return; }
  var ta=refField(w.bf); if(!ta) return; var p=Math.min(REF.pos==null?ta.value.length:REF.pos,ta.value.length), v=ta.value;
  /* in a plain field a task is its id (drawn as a chip when read); a project needs its token */
  var text=kind==="task"?id:refToken(kind,id,label), lead=p>0&&!/\s$/.test(v.slice(0,p))?" ":"", tail=/^\s/.test(v.slice(p))?"":" ";
  ta.focus(); ta.setRangeText(lead+text+tail,p,p,"end"); REF.pos=ta.selectionStart; ta.dispatchEvent(new Event("input",{bubbles:true})); }

/* ---------- telling the people named ---------- */
(function(){
  /* the description saves itself a beat after the typing: each person is told once, the first time
     they are named in it since it was opened for writing */
  if(typeof descSaveMd==="function"){ var save=descSaveMd;
    descSaveMd=function(tk,md){ var r=save.apply(this,arguments);
      if(tk&&!tk._draft){ var told=REF.told[tk.id]||(REF.told[tk.id]=[]), add=refMentionIds(md).filter(function(id){ return told.indexOf(id)<0; });
        add.forEach(function(id){ told.push(id); }); add=add.filter(function(id){ return id!==ME; }); if(add.length) notify("mention",add,tk.id); }
      return r; }; }
  /* the brief: on Save (and when the panel is left with it open) */
  ["saveBrief","briefFlush"].forEach(function(fn){ if(typeof window[fn]!=="function") return; var base=window[fn];
    window[fn]=function(arg){ var tk=fn==="briefFlush"?arg:task(S.drawerTask), before=tk?refBriefText(tk):""; var r=base.apply(this,arguments); if(tk) refNotify(tk,before,refBriefText(tk)); return r; }; });
  /* a new task: whoever its description or brief names, apart from those told they are on it */
  if(typeof createDraft==="function"){ var create=createDraft;
    createDraft=function(){ var nt=task("T-new"), p=create.apply(this,arguments);
      if(nt&&p&&typeof p.then==="function") p.then(function(t){ if(t&&t.id){ var text=(t.description||"")+"\n"+refBriefText(t); refNotify(t,"",text,{skip:assigneesOf(t).concat(typeof reviewersOf==="function"?reviewersOf(t):[])}); } });
      return p; }; }
  /* the description's "already named" starts from the text it was opened with; names in a field being
     read are drawn for reading, not for the keyboard, while writing */
  if(typeof renderDrawer==="function"){ var draw=renderDrawer;
    renderDrawer=function(){ var out=draw.apply(this,arguments), tk=refTask(), ed=document.getElementById("descSrc");
      if(tk&&!tk._draft){ if(ed&&!REF.told[tk.id]) REF.told[tk.id]=refMentionIds(tk.description||""); else if(!ed) delete REF.told[tk.id]; }
      document.querySelectorAll('#drawer [contenteditable="true"] .msg-mention[tabindex]').forEach(function(m){ m.removeAttribute("tabindex"); m.removeAttribute("role"); });
      return out; }; }
})();

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Mention someone":"Sebut seseorang","Insert a task":"Sisipkan task","Insert a project":"Sisipkan project","Not available":"Tidak tersedia",
  "Find a task…":"Cari task…","Find a project…":"Cari project…","Mention":"Mention",
  "Type @ to mention someone. A task or a project goes in as a chip:":"Ketik @ untuk menyebut seseorang. Task atau project masuk sebagai chip:"
});
</script>
