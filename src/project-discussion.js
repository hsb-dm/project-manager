<script>
/* PROJECT DISCUSSION (Oct 2026) — the conversation about a project as a whole.

   Two places show it: a Discussion tab (between Files and Activity) with every thread, twenty at a time, and a
   card at the foot of Overview with the newest three and a box to write in. Both read and change one collection
   per project (PD), so a comment posted on Overview is in the tab, and the other way round.

   It is a task's comments, not a new kind of comment: each comment is drawn by cmtItemHtml and the box is
   cmtBoxHtml (src/drawer.js), with the same @ picker, attachments, links read as their names, pasted pictures,
   Enter to send and editing in place (src/comment-mention.js, comment-attach.js, link-tab.js). What is written
   in a project's box belongs to that project: it is put aside under "project:<id>" when another box — another
   project's, or a task's — is used, and comes back when this one is.

   The server (server/project-discussion.js) decides who reads what: a stakeholder never receives an internal
   comment; an archived project only reads; whoever is named, answered or owns the project is told. Here, the
   Internal / Stakeholder-visible switch is per project and starts at Internal each time, so a choice made on one
   project cannot carry over to another. */
var PD={}, PD_VIS={}, PD_BUSY={}, PD_FOCUS=null;
var PD_ICON='<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg>';
function pdKey(pid){ return "project:"+pid; }
function pdState(pid){ return PD[pid]||(PD[pid]={items:[],total:0,hasMore:false,mode:null,loading:null,err:null}); }
function pdHydrate(c){ var x=clone(c); x.ago=minAgo(c.createdAt); return x; }
function pdBoxVis(pid){ return person(ME).stakeholder?"client":(PD_VIS[pid]||"internal"); }
function pdArchived(p){ return !!p&&p.status==="archived"; }
/* who may write: as on the server — anyone who sees all work, whoever runs or is on the project, a stakeholder */
function pdCanPost(p){ if(!p) return false; if(!API.on) return true; var me=person(ME); return !!(me.stakeholder||has("view_all")||has("edit_any_project")||p.owner===ME||(p.team||[]).indexOf(ME)>=0); }
/* the people offered first by the @ picker: the project's team and owner, and whoever has written here */
function pdPeople(pid){ var p=project(pid), ids=[]; var add=function(x){ if(x&&x!==ME&&PEOPLE[x]&&ids.indexOf(x)<0) ids.push(x); };
  if(p){ add(p.owner); (p.team||[]).forEach(add); } pdState(pid).items.forEach(function(c){ add(c.by); }); return ids; }

/* ---------- reading ---------- */
function pdByTime(a,b){ return String(a.createdAt||"").localeCompare(String(b.createdAt||""))||String(a.id).localeCompare(String(b.id)); }
function pdRoots(st){ return st.items.filter(function(c){ return !c.parent||!byId(st.items,c.parent); }).sort(pdByTime); }
function pdReplies(st,id){ return st.items.filter(function(c){ return c.parent===id; }).sort(pdByTime); }
/* the switch shows what that audience sees: Internal shows everything, Stakeholder-visible only what stakeholders see */
function pdShown(pid,list){ return pdBoxVis(pid)==="internal"?list:list.filter(function(c){ return c.vis==="client"; }); }
function pdUrl(pid,rest){ return "/api/projects/"+encodeURIComponent(pid)+"/comments"+(rest||""); }
/* full: the tab's threads with their replies (as many as are on show, at least twenty); otherwise the Overview's three */
function pdLoad(pid,full){ var st=pdState(pid); if(st.loading) return st.loading;
  if(!API.on){ st.mode=full?"full":(st.mode||"preview"); return Promise.resolve(st); }
  var n=full?Math.min(50,Math.max(20,pdRoots(st).length)):3;
  st.loading=apiFetch("GET",pdUrl(pid,"?limit="+n+(full?"":"&view=preview"))).then(function(d){
    st.loading=null; st.err=null; st.items=(d.comments||[]).map(pdHydrate); st.total=d.total||0; st.hasMore=!!d.hasMore; st.mode=full?"full":"preview"; return st;
  },function(e){ st.loading=null; st.err=e&&e.message||tr("Could not load the discussion"); return st; });
  return st.loading; }
/* asked for by whatever is drawn: once, then drawn again when it arrives */
function pdEnsure(pid,full){ var st=pdState(pid); if(st.loading||st.err) return; if(full?st.mode==="full":st.mode) return; pdLoad(pid,full).then(function(){ if(S.screen==="projects"&&S.projectId===pid) pdRedraw(); }); }
function pdMore(pid){ var st=pdState(pid), roots=pdRoots(st); if(!roots.length||st.loading) return;
  if(!API.on){ st.hasMore=false; return pdRedraw(); }
  st.loading=apiFetch("GET",pdUrl(pid,"?limit=20&before="+encodeURIComponent(roots[0].id))).then(function(d){ st.loading=null;
    (d.comments||[]).map(pdHydrate).forEach(function(c){ if(!byId(st.items,c.id)) st.items.push(c); }); st.hasMore=!!d.hasMore; st.total=d.total||st.total; pdRedraw(); },
    function(e){ st.loading=null; toast(e.message||tr("Could not load the discussion"),"bad"); });
  pdRedraw(); }
/* a colleague's comment: the discussion on show is asked for again and drawn without losing the reader's place */
function pdRefresh(pid){ var st=pdState(pid); if(!st.mode||st.loading) return; pdLoad(pid,st.mode==="full").then(function(){ if(S.screen==="projects"&&S.projectId===pid) pdRedraw(); }); }
/* one comment in, or changed: a reply counts on its thread */
function pdUpsert(pid,c){ var st=pdState(pid), old=byId(st.items,c.id);
  if(old){ st.items=st.items.map(function(x){ return x.id===c.id?Object.assign({},x,c,{replyCount:c.replyCount!=null?c.replyCount:x.replyCount}):x; }); return; }
  st.items.push(c); if(c.parent){ var r=byId(st.items,c.parent); if(r) r.replyCount=(r.replyCount||0)+1; } }

/* ---------- drawing ---------- */
/* Internal / Stakeholder-visible: small, in the head beside the title, so it never stands between the comments and the
   box. What each means is said when pointed at. It is also what the list shows: Internal shows everything,
   Stakeholder-visible only what stakeholders see. A stakeholder has no choice and no switch. */
function pdVisToggle(pid){ if(person(ME).stakeholder) return ""; var v=pdBoxVis(pid), b=function(k,icon,label,tip){ return '<button type="button" class="'+(v===k?"on":"")+'" aria-pressed="'+(v===k)+'" title="'+attr(tr(tip))+'" onclick="pdSetVis('+jsq(pid)+',\''+k+'\')">'+icon+tr(label)+'</button>'; };
  return '<div class="seg pd-vis" role="group" aria-label="'+attr(tr("Who can see it"))+'">'+b("internal",I.lock,"Internal","Internal comments are only visible to the creative team.")+b("client",I.eye,"Stakeholder-visible","Stakeholder-visible comments can be seen by requesters like Marketing.")+'</div>'; }
/* the panel, with the switch beside its title */
function pdPanel(p,count,body,extra,cls){ return '<section class="panel pd-box '+cls+'"><div class="panel-head"><span class="sq">'+PD_ICON+'</span><h2>'+tr("Discussion")+'</h2>'+(count!=null?'<span class="cnt">'+count+'</span>':"")+pdVisToggle(p.id)+'<span class="spacer"></span>'+(extra||"")+'</div><div class="panel-body pad">'+body+'</div></section>'; }
function pdSetVis(pid,v){ PD_VIS[pid]=v==="client"?"client":"internal"; pdRedraw(); }
/* the box to write in, or why there is none */
function pdComposer(p){
  if(pdArchived(p)) return '<p class="pd-note pd-archived">'+I.lock+'<span>'+tr("This project is archived. Restore the project to add comments.")+'</span></p>';
  if(!pdCanPost(p)) return '';
  if(S.cmtEdit&&S.cmtEdit.project===p.id) return '';   /* the comment being edited has the box, in its place */
  var key=pdKey(p.id);
  return cmtBoxHtml({key:key,inputId:"pdText",vis:pdBoxVis(p.id),editing:false,draft:cmtDraftOf(key),post:"pdSubmit("+jsq(p.id)+")"}); }
/* the audience of a box: the project's switch; a reply is never more widely visible than the comment it answers */
function pdBoxVisFor(key){ var pid=cmtKeyProject(key), vis=pdBoxVis(pid), cid=cmtKeyReply(key), c=cid?byId(pdState(pid).items,cid):null;
  return c&&c.vis==="internal"?"internal":vis; }
/* The reply being written in this project: which comment it answers and the thread that comment is in (shown: the
   comments on show), or nothing — none open, the comment not on show (it waits), the project only read, or a
   comment being edited here (the edit has the box; the reply waits). */
function pdReplyTarget(p,shown){ if(pdArchived(p)||!pdCanPost(p)||(S.cmtEdit&&S.cmtEdit.project===p.id)) return null; return cmtReplyTarget(pdKey(p.id),shown,null); }
function pdReplyBox(p,rt){ var key=cmtReplyKey(pdKey(p.id),rt.cid); return cmtReplyBoxHtml(pdKey(p.id),rt,{inputId:"pdReplyText",vis:pdBoxVisFor(key),post:"pdSubmit("+jsq(p.id)+","+jsq(key)+")"}); }
/* what can be done with a comment — answer it; change or remove one's own — all of it where the comment is, on
   Overview as on the tab: nothing moves the page to another tab */
function pdActs(p,c,rt){ if(pdArchived(p)) return null; var pid=jsq(p.id), cid=jsq(c.id);
  return (pdCanPost(p)?cmtReplyBtnHtml(pdKey(p.id),c.id,rt,"pdReply("+pid+","+cid+")"):'')+(c.by===ME?'<button class="cmt-edit-btn" onclick="pdEditStart('+pid+','+cid+')">'+tr("Edit")+'</button><button onclick="pdDelete('+pid+','+cid+')">'+tr("Delete")+'</button>':''); }
/* one comment, or — being edited — the box, in its place; extra: more buttons after its own (Overview's replies);
   rt: the reply being written here, which says whose Reply button opened it */
function pdItem(p,c,isReply,extra,rt){ var key=pdKey(p.id), ed=!!(S.cmtEdit&&S.cmtEdit.project===p.id&&S.cmtEdit.id===c.id), acts=pdActs(p,c,rt);
  return cmtItemHtml(c,isReply,{editing:ed,editor:ed?cmtBoxHtml({key:key,inputId:"pdText",vis:c.vis,editing:true,draft:cmtDraftOf(key),post:"pdSubmit("+jsq(p.id)+")"}):"",acts:acts==null&&!extra?null:(acts||"")+(extra||"")}); }
function pdLoading(st){ return st.err?'<p class="pd-note pd-err">'+esc(st.err)+' <button class="btn xs" onclick="pdRetry('+jsq(S.projectId)+')">'+tr("Try again")+'</button></p>':'<div class="pd-loading" aria-busy="true">'+tr("Loading…")+'</div>'; }
function pdRetry(pid){ pdState(pid).err=null; pdRedraw(); }
/* Overview: the newest three threads, each on two lines at most (the rest on request), how many replies each has —
   which open under it, there; then the box. Replying, editing and removing happen here too. */
var PD_OPEN={};   /* threads opened on Overview: project id → {comment id: true} */
function pdOverviewHtml(p){ var st=pdState(p.id); pdEnsure(p.id,false);
  var body, open=PD_OPEN[p.id]||{};
  if(!st.mode) body=pdLoading(st);
  else { var roots=pdShown(p.id,pdRoots(st)).slice(-3);
    /* a reply box on Overview: under its thread there, which it opened (its comment one of these, or one of their replies) */
    var onShow=roots.slice(); roots.forEach(function(c){ if(open[c.id]) onShow=onShow.concat(pdShown(p.id,pdReplies(st,c.id))); });
    var rt=pdReplyTarget(p,onShow);
    body=roots.length?'<div class="cmts pd-preview">'+roots.map(function(c){ var have=pdReplies(st,c.id), n=Math.max(c.replyCount||0,have.length), shown=!!open[c.id]&&n>0;
        var toggle=n?'<button class="pd-replies" aria-expanded="'+shown+'" onclick="pdThread('+jsq(p.id)+','+jsq(c.id)+')">'+(shown?tr("Hide replies"):n+' '+tr(n===1?"reply":"replies"))+'</button>':'';
        return pdItem(p,c,false,toggle,rt)+(shown?pdShown(p.id,have).map(function(r){ return pdItem(p,r,true,null,rt); }).join("")+(have.length<n?'<div class="pd-thread-loading" aria-busy="true">'+tr("Loading…")+'</div>':''):'')+(rt&&rt.root===c.id?pdReplyBox(p,rt):''); }).join("")+'</div>'
      :'<p class="pd-empty">'+tr(pdArchived(p)?"No discussion yet.":"No comments yet. Start the project discussion.")+'</p>'; }
  var all='<button type="button" class="link pd-all" onclick="pdOpen('+jsq(p.id)+')">'+tr("View all discussion")+' →</button>';
  return pdPanel(p,st.mode?st.total:null,body+pdComposer(p),all,"pd-overview"); }
/* a thread's replies, opened or closed on Overview; the replies are fetched the first time */
function pdThread(pid,cid){ var o=PD_OPEN[pid]=PD_OPEN[pid]||{}; o[cid]=!o[cid]; if(o[cid]&&pdState(pid).mode!=="full") pdLoad(pid,true).then(function(){ pdRedraw(); }); pdRedraw(); }
/* a long comment on Overview shows two lines and "Show more", which shows it all, there */
function pdClampMarks(){ Array.prototype.forEach.call(document.querySelectorAll("#content .pd-preview .cmt:not(.cmt-editing):not(.pd-expanded) > div > .body"),function(b){ if(b.scrollHeight<=b.clientHeight+1||(b.nextElementSibling&&b.nextElementSibling.classList.contains("pd-more-text"))) return;
  var m=document.createElement("button"); m.type="button"; m.className="pd-more-text"; m.textContent=tr("Show more"); m.onclick=function(){ var c=m.closest(".cmt"); if(c) c.classList.add("pd-expanded"); m.remove(); }; b.insertAdjacentElement("afterend",m); }); }
/* the Discussion tab: every thread, oldest first, each with its replies; earlier ones on request; the box below */
function pdTabHtml(p){ var st=pdState(p.id); pdEnsure(p.id,true);
  var rt=st.mode?pdReplyTarget(p,pdShown(p.id,st.items)):null;
  var one=function(c,isReply){ return pdItem(p,c,isReply,null,rt); };
  var list;
  if(!st.mode) list=pdLoading(st);
  else { var roots=pdShown(p.id,pdRoots(st));
    list=(st.hasMore?'<div class="pd-more-row"><button class="btn sm pd-more" onclick="pdMore('+jsq(p.id)+')"'+(st.loading?' disabled':'')+'>'+tr(st.loading?"Loading…":"Load earlier comments")+'</button></div>':'')
      +'<div class="cmts">'+(roots.length?roots.map(function(c){ return one(c,false)+pdShown(p.id,pdReplies(st,c.id)).map(function(r){ return one(r,true); }).join("")+(rt&&rt.root===c.id?pdReplyBox(p,rt):''); }).join(""):'<div class="empty" style="padding:20px"><div class="h">'+tr(pdArchived(p)?"No discussion yet.":"No comments yet")+'</div></div>')+'</div>'; }
  return pdPanel(p,st.mode?st.total:null,'<p class="hint pd-sub">'+tr("Project-level coordination and decisions")+'</p>'+list+pdComposer(p),"","pd-full"); }
/* Drawn again in place — the rest of the page is left alone; someone writing keeps writing (focus, caret, scroll). */
function pdRedraw(){ if(S.screen!=="projects"||!S.projectId) return; var box=document.querySelector("#content .pd-box"), p=project(S.projectId); if(!box||!p) return;
  var ta=document.activeElement, keep=ta&&cmtIsInput(ta)&&box.contains(ta)?{a:ta.selectionStart,b:ta.selectionEnd,top:ta.scrollTop}:null, btn=cmtReplyBtnKeep(box);
  var tmp=document.createElement("div"); tmp.innerHTML=S.projectTab==="discussion"?pdTabHtml(p):pdOverviewHtml(p);
  if(tmp.firstElementChild) box.replaceWith(tmp.firstElementChild);
  pdAfterRender(keep); if(btn) cmtReplyBtnBack(btn,pdKey(p.id)); }
/* each box gets its layer (the one at the bottom and a reply box); the one being written in, its focus and caret back */
function pdAfterRender(keep){ var n=cmtInput();
  if(n&&cmtIsProjectKey(CMT_DRAFT_FOR)&&n.getAttribute("data-cmt-key")===CMT_DRAFT_FOR&&keep){ n.focus(); try{ n.setSelectionRange(keep.a,keep.b); }catch(e){} n.scrollTop=keep.top; }
  cmtMirrorAll(document.querySelector("#content .pd-box"));
  pdClampMarks(); pdFocusComment(); }
/* a comment asked for (a notification, a link, "N replies"): scrolled to and lit; earlier pages are fetched to find it */
function pdFocusComment(){ var f=PD_FOCUS; if(!f||S.projectId!==f.pid||S.projectTab!=="discussion") return; var st=pdState(f.pid); if(st.mode!=="full") return;
  if(!f.cid){ PD_FOCUS=null; return; }
  var el=document.querySelector('#content .pd-box .cmt[data-cid="'+String(f.cid).replace(/["\\]/g,"")+'"]');
  if(el){ PD_FOCUS=null; el.scrollIntoView({block:"center"}); el.classList.add("cmt-flash"); setTimeout(function(){ el.classList.remove("cmt-flash"); },1900); return; }
  if(st.hasMore&&(f.tries=(f.tries||0)+1)<=5) return pdMore(f.pid);
  PD_FOCUS=null; }

/* ---------- doing ---------- */
function pdOpen(pid,cid){ if(!project(pid)) return toast(tr("That item is not available to you"),"bad"); S.projectTab="discussion"; PD_FOCUS={pid:pid,cid:cid||null}; if(S.screen==="projects"&&S.projectId===pid) renderScreen(false); else go("projects",pid); }
/* Reply: a box opens under the comment's thread, there, and takes the typing — on whichever tab this is. On Overview
   the thread opens, its replies above the box (fetched the first time). */
function pdReply(pid,cid){ var st=pdState(pid), root=byId(st.items,cid);
  for(var hop=0;root&&root.parent&&hop<20;hop++){ var up=byId(st.items,root.parent); if(!up) break; root=up; }
  if(root){ (PD_OPEN[pid]=PD_OPEN[pid]||{})[root.id]=true; if(API.on&&st.mode!=="full"&&(root.replyCount||0)>pdReplies(st,root.id).length) pdLoad(pid,true).then(function(){ var ae=document.activeElement, typing=ae&&cmtIsInput(ae); pdRedraw(); if(!typing) cmtFocusLive(); }); }
  cmtReplyOpen(pdKey(pid),cid); }
/* key: the box whose Post (or Enter) it was — the one at the bottom, a reply box, or the box editing a comment */
function pdSubmit(pid,key){ cmtActivate(key||pdKey(pid)); if(S.cmtEdit&&S.cmtEdit.project===pid) return pdEditSave(pid); pdPost(pid); }
function pdBusy(on){ Array.prototype.forEach.call(document.querySelectorAll("#content .pd-box .composer .bar .btn.primary"),function(b){ b.disabled=!!on; b.setAttribute("aria-busy",on?"true":"false"); }); }
function pdPost(pid){ var p=project(pid); if(!p||pdArchived(p)||PD_BUSY[pid]) return; var el=cmtInput(), key=el&&el.getAttribute("data-cmt-key"); if(!el||cmtKeyBase(key)!==pdKey(pid)) return;
  var txt=(typeof linkTokensExpand==="function"?linkTokensExpand(el.value,window._cmtLinks):el.value).trim(), att=(window._cmtAtt||[]).slice();
  if(!txt&&!att.length){ el.focus(); return; }
  /* a reply box answers the comment its key names; the box at the bottom, nothing */
  var st=pdState(pid), parent=cmtKeyReply(key)||null, vis=pdBoxVisFor(key);
  PD_BUSY[pid]=true; pdBusy(true);
  /* the box is emptied only once the comment is saved; a refusal leaves everything in it as it was. A reply's box then
     closes, and the focus — if it was in that box, or nowhere — goes back to the Reply button it was opened from. */
  var saved=function(c,total){ PD_BUSY[pid]=false;
    var ae=document.activeElement, refocus=parent&&(!ae||ae===document.body||ae===el||!ae.isConnected);
    if(parent) cmtReplyDrop(key);
    else if(CMT_DRAFT_FOR===key){ window._cmtDraft=""; window._cmtAtt=[]; window._cmtLinks=[]; cmtMentionsReset(); S.replyTo=null; } else delete CMT_DRAFTS[key];
    pdUpsert(pid,c); st.total=total!=null?total:st.total+1; if(!st.mode) st.mode="preview";
    /* a reply written on Overview is shown there, under its comment, with the rest of the thread */
    if(c.parent){ (PD_OPEN[pid]=PD_OPEN[pid]||{})[c.parent]=true; if(API.on&&st.mode!=="full") pdLoad(pid,true).then(function(){ pdRedraw(); }); }
    pdRedraw(); if(refocus) cmtReplyBtnFocus(pdKey(pid),parent); toast(tr("Comment posted")); };
  if(!API.on){ var pc=parent?byId(st.items,parent):null, root=pc&&pc.parent?pc.parent:parent; return saved(pdHydrate({id:uid("pc"),by:ME,vis:vis,text:txt,parent:root,attachments:att,createdAt:new Date().toISOString(),editedAt:null})); }
  apiFetch("POST",pdUrl(pid),{id:uid("pc"),text:txt,vis:vis,parent:parent,attachments:att}).then(function(d){ saved(pdHydrate(d.comment),d.total); })
    .catch(function(e){ PD_BUSY[pid]=false; pdBusy(false); toast(tr("Couldn't post comment. Try again.")+(e&&e.message?" "+e.message:""),"bad"); }); }
/* editing in place, as in a task: the same box opens where the comment is; what was being written waits */
function pdEditStart(pid,cid){ var c=byId(pdState(pid).items,cid); if(!c||c.by!==ME) return; cmtActivate(pdKey(pid));
  if(!S.cmtEdit) S.cmtEditStash={text:window._cmtDraft||"",att:(window._cmtAtt||[]).slice(),links:(window._cmtLinks||[]).slice(),mentions:(window._cmtMentions||[]).slice(),reply:S.replyTo||null};
  var shown=cmtEditLoad(c.text||""); window._cmtDraft=shown.text; window._cmtLinks=shown.links; window._cmtMentions=shown.mentions; window._cmtAtt=clone(c.attachments||[]); S.replyTo=null;
  S.cmtEdit={project:pid,id:cid}; pdRedraw(); cmtEditFocus(); }
function pdEditSave(pid){ var d=S.cmtEdit, st=pdState(pid), c=d&&byId(st.items,d.id), el=cmtInput(); if(!c||!el){ cmtEditCancel(); return; }
  var text=(typeof linkTokensExpand==="function"?linkTokensExpand(el.value,window._cmtLinks):el.value).trim(), att=(window._cmtAtt||[]).slice();
  if(!text&&!att.length) return toast(tr("Write something first"),"bad");
  if(text===(c.text||"")&&JSON.stringify(att)===JSON.stringify(c.attachments||[])){ cmtEditCancel(); return; }
  pdBusy(true);
  var ok=function(nc){ pdUpsert(pid,nc); cmtEditFinish(); pdRedraw(); toast(tr("Comment updated")); };
  if(!API.on) return ok(Object.assign({},c,{text:text,attachments:att,editedAt:new Date().toISOString()}));
  apiFetch("PUT",pdUrl(pid,"/"+encodeURIComponent(c.id)),{text:text,attachments:att}).then(function(r){ ok(pdHydrate(r.comment)); })
    .catch(function(e){ pdBusy(false); toast(e.message||tr("Could not save the comment"),"bad"); }); }
/* removed: its replies stay, on their own, as in a task */
function pdDelete(pid,cid){ var st=pdState(pid), c=byId(st.items,cid); if(!c) return;
  var gone=function(total){ st.items=st.items.filter(function(x){ return x.id!==cid; }).map(function(x){ return x.parent===cid?Object.assign({},x,{parent:null}):x; });
    if(c.parent){ var r=byId(st.items,c.parent); if(r&&r.replyCount) r.replyCount--; } st.total=total!=null?total:Math.max(0,st.total-1);
    if(S.cmtEdit&&S.cmtEdit.project===pid&&S.cmtEdit.id===cid) cmtEditFinish(); if(CMT_REPLY_OPEN[pdKey(pid)]===cid) cmtReplyDrop(cmtReplyKey(pdKey(pid),cid));
    pdRedraw(); toast(tr("Comment deleted")); };
  if(!API.on) return gone();
  apiFetch("DELETE",pdUrl(pid,"/"+encodeURIComponent(cid))).then(function(r){ gone(r.total); }).catch(function(e){ toast(e.message||tr("Could not delete the comment"),"bad"); }); }

/* ---------- hearing about it ---------- */
/* the live stream: a comment, change or removal in a discussion that is on show — someone else's, or one's own from
   another tab or device; only the tab it was written in skips it (src/core.js liveFromThisTab) */
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(ev){ var r=base.apply(this,arguments); try{ if(ev&&ev.type==="project_comments"&&!(typeof liveFromThisTab==="function"&&liveFromThisTab(ev))&&PD[ev.project]) pdRefresh(ev.project); }catch(e){} return r; }; })();
function pdNoticeInfo(n){ var info={}; try{ info=JSON.parse(n.message||"{}")||{}; }catch(e){} return info; }
function pdNoticeLine(n,info){ return n.k==="mention"?"{who} mentioned you in the discussion on {t}":info.reply?"{who} replied to you in the discussion on {t}":"{who} commented in the discussion on {t}"; }
/* the bell: says it is the project's discussion, quotes the comment, opens it */
(function(){ if(typeof notifRowHtml!=="function") return; var base=notifRowHtml; notifRowHtml=function(n,bundle){ if(!n||n.entityType!=="project") return base.apply(this,arguments);
  var p=project(n.t), info=pdNoticeInfo(n), text=fmt(tr(pdNoticeLine(n,info)),{who:n.who?esc(first(n.who)):"",t:esc(p?p.name:n.t)});
  return '<div class="notif'+(n.read?"":" unread")+'" onclick="closePops();markRead('+jsq(n.t)+');pdOpen('+jsq(n.t)+','+jsq(info.comment||"")+')">'+(n.who?av(n.who):'<span class="av" style="background:var(--color-primary)">!</span>')+'<div><div>'+text+(info.text?'<div class="notif-preview" data-no-translate>'+esc(String(info.text).slice(0,90))+'</div>':'')+'</div><div class="when">'+ago(n.ago,n.createdAt)+'</div></div></div>'; }; })();
(function(){ if(typeof notifToast!=="function") return; var base=notifToast; notifToast=function(n){ if(!n||n.entityType!=="project"||document.body.classList.contains("auth")) return base.apply(this,arguments);
  var p=project(n.t), info=pdNoticeInfo(n), el=document.createElement("div"); el.className="toast ok msg-toast notif-toast";
  el.innerHTML=(n.who?av(n.who):'<span class="av" style="background:var(--color-primary)">!</span>')+'<div><span>'+fmt(tr(pdNoticeLine(n,info)),{who:n.who?esc(first(n.who)):"",t:esc(p?p.name:n.t)})+'</span></div>';
  el.onclick=function(){ el.remove(); markRead(n.t); pdOpen(n.t,info.comment||null); }; notifPopShow(el); }; })();
/* a link to a comment — /projects/<id>?tab=discussion&comment=<id>, as e-mails and push notifications send — opens it */
(function(){ if(typeof routeApply!=="function") return; var base=routeApply; routeApply=function(r){ if(r&&r.screen==="projects"&&r.sub&&r.query&&r.query.tab==="discussion"){ S.projectTab="discussion"; PD_FOCUS={pid:routeIdFrom("project",r.sub),cid:r.query.comment||null}; } return base.apply(this,arguments); }; })();

Object.assign(UI_ID,{
  "Discussion":"Diskusi","View all discussion":"Lihat semua diskusi","Project-level coordination and decisions":"Koordinasi dan keputusan tingkat project",
  "No comments yet. Start the project discussion.":"Belum ada komentar. Mulai diskusi project.","No comments yet":"Belum ada komentar","No discussion yet.":"Belum ada diskusi.",
  "This project is archived. Restore the project to add comments.":"Project ini diarsipkan. Pulihkan project untuk menambah komentar.",
  "Load earlier comments":"Muat komentar sebelumnya","reply":"balasan","replies":"balasan","Reply":"Balas","Delete":"Hapus",
  "Comment posted":"Komentar terkirim","Who can see it":"Siapa yang bisa melihat","Hide replies":"Sembunyikan balasan","Show more":"Selengkapnya","Comment deleted":"Komentar dihapus","Couldn't post comment. Try again.":"Komentar tidak terkirim. Coba lagi.",
  "Could not load the discussion":"Diskusi tidak dapat dimuat","Could not delete the comment":"Komentar tidak dapat dihapus","Try again":"Coba lagi","Loading…":"Memuat…",
  "{who} mentioned you in the discussion on {t}":"{who} menyebutmu di diskusi {t}","{who} replied to you in the discussion on {t}":"{who} membalasmu di diskusi {t}","{who} commented in the discussion on {t}":"{who} berkomentar di diskusi {t}"
});
</script>
