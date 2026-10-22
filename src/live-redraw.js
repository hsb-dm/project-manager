<script>
/* ============================================================
   A REDRAW FROM ELSEWHERE KEEPS WHAT YOU ARE DOING (Oct 2026)
   The screen is drawn again when the workspace changes under it — a colleague saves a task (the live board,
   src/v34.js), a server event arrives, a list finishes loading — and each redraw rebuilt the page from what is
   saved: a board scrolled sideways jumped back to its first column, a long column to its top, and a field being
   typed in went back to what was saved. The SMTP password, never sent back to the page, went back to empty, so
   Test connection sent pass:"" and the server tried the stored one ("535 Username and Password not accepted").
   - Any redraw of the same view keeps where each inner scroller was: the board, its columns, lists and tables.
   - A redraw from elsewhere (bgRedraw) also keeps what is typed in fields somebody changed, and the field being
     typed in with its caret. A redraw after the person's own action — a save, an add — is left alone, so a field
     that empties after adding still does.
   - Only a redraw of the same view keeps them (Oct 2026). S is changed before the screen is drawn, so what was
     measured belonged to the view being left: a project's board scrolled 150 px opened the next project's board at
     150 px, a column down the same, on a desktop and on a phone. What is on the screen is now kept (REDRAW_DRAWN)
     and compared with what is about to be drawn, and the places are carried over only when the two are the same:
       · the same view — a colleague's save, one's own save, a filter, a sort, a group, Mine or All — keeps them all;
         a filter changed on a saved view too (the saved view is let go of, the list is the same one);
       · another screen, project, team, person or Knowledge page, search results, another tab of a project, another
         Tasks view (Kanban, List, Grid…), a saved view applied, another Settings tab starts at the top.
     A project's tabs keep their place on a phone through all of it, the tab chosen in sight (src/mobile.js). Going
     back (navBack) puts the page where it was, as it always has (src/core.js navRestore); a project, a team or a
     person opened from somewhere else opens at the top of the page too (core.js restoreScroll).
   ============================================================ */
var BG_REDRAW=0;
function bgRedraw(fn){ BG_REDRAW++; try{ return fn(); } finally{ BG_REDRAW--; } }
/* what a view is: the screen and the one thing it shows (search results are a view of their own), which of its views
   (a project's tab, the Tasks view, the Projects list's Active/Archived/All, a Settings tab) and, on Tasks, the saved
   view applied */
function redrawIdentity(){ var s=S.screen;
  if(S.search) return {place:"search|"+S.search,view:"",saved:""};
  return {place:s+"|"+((s==="projects"?S.projectId:s==="teams"?S.teamId:s==="team"?S.memberId:s==="knowledge"?S.kbPage:"")||""),
    view:(s==="tasks"?S.taskView:s==="projects"?(S.projectId?S.projectTab:S.projView):s==="settings"?S.settingsTab:"")||"",
    saved:s==="tasks"?S.activeView||"":""}; }
/* what #content shows: set each time renderScreen draws it. A screen drawn on its own leaves it as it was: a
   conversation opened in Messages is the same view, and search results as they are typed have no scroller of their own */
var REDRAW_DRAWN=null;
function redrawSame(was,now){ return !!was&&!!now&&was.place===now.place&&was.view===now.view&&(was.saved===now.saved||!now.saved); }
/* classes that say how something looks right now, not what it is */
var REDRAW_STATE=/^(on|open|drag|over|active|hover|sel|selected|focus|focused|dim|empty|collapsed|full|expanded|kb-grabbed|loading)$/;
function redrawKey(el,root){ var parts=[], n=el;
  while(n&&n!==root&&parts.length<7){
    var cls=typeof n.className==="string"?n.className.split(/\s+/).filter(function(c){ return c&&!REDRAW_STATE.test(c); }).sort().join("."):"";
    var d=n.getAttribute?(n.getAttribute("data-status")||n.getAttribute("data-sec")||n.getAttribute("data-col")||n.getAttribute("data-team")||n.getAttribute("data-day")||""):"";
    parts.unshift(n.tagName+(n.id?"#"+n.id:"")+(cls?"."+cls:"")+(d?"["+d+"]":"")); n=n.parentElement; }
  return parts.join(">"); }
/* The app's scrollers, by name: the board and its columns, tables, the timeline, the calendar's lists, Messages,
   the rows of tabs, chips and buttons that scroll sideways on a phone, the AI Hub's panels, text boxes. Any other
   element keeps its place too when it carries data-keep-scroll. Every element on the screen used to be measured
   four ways before and after each redraw to find the ones that scroll. */
var REDRAW_SCROLLERS=[".kanban",".kcol-body",".tbl-wrap",".tlw",".cal-more-list",".calendar-mobile-controls",".cal-mobile-actions",
  ".msg-timeline",".msg-nav-scroll",".msg-tabs",".msg-derived",".msg-dbody",".msg-shared-tabs",
  ".tabs",".ptabs",".snav",".scr-nav",".rail-track",".task-stage-rail",".seg",".actions",".toolbar",".wb-chips",".panel-body",
  ".ai-setup",".ai-props",".ai-layer-list",".ai-zoom-viewport",".ai-hs-track",".ai-expand-ratios",".ai-expand-stage-wrap",".ag-note p",
  ".md-view pre",".md-wysiwyg pre",".ce-list",".annot-scroll",".scr-time-list",".scr-kdd-list",".ann-preview",".ann-pick-list",".cap-grant-list",
  ".kb-folder-options",".tag-pick-list",".dependency-picker-results",".demo-user-list","textarea","[data-keep-scroll]"].join(",");
/* each scroller with its key and its place among those sharing the key */
function redrawScrollers(root,fn){ var seen={};
  Array.prototype.forEach.call(root.querySelectorAll(REDRAW_SCROLLERS),function(el){
    var k=redrawKey(el,root); seen[k]=(seen[k]||0)+1; fn(el,k+"#"+seen[k]); }); }
/* is any of them scrolled? (only then are keys worked out) */
function redrawAnyScrolled(root){ var l=root.querySelectorAll(REDRAW_SCROLLERS); for(var i=0;i<l.length;i++) if(l[i].scrollTop||l[i].scrollLeft) return true; return false; }
function redrawFieldDirty(el){ if(el.type==="checkbox"||el.type==="radio") return el.checked!==el.defaultChecked;
  if(el.tagName==="SELECT"){ var d=Array.prototype.filter.call(el.options,function(o){ return o.defaultSelected; })[0]; return (d?d.value:(el.options[0]||{}).value)!==el.value; }
  return el.value!==el.defaultValue; }
/* S already says what is about to be drawn, REDRAW_DRAWN what is on the screen: another view is not measured at all */
function redrawCapture(){ var root=document.getElementById("content"); if(!root||!redrawSame(REDRAW_DRAWN,redrawIdentity())) return null;
  var st={scroll:{},any:false,fields:null,focus:null};
  if(redrawAnyScrolled(root)) redrawScrollers(root,function(el,k){ if(el.scrollTop||el.scrollLeft){ st.scroll[k]=[el.scrollTop,el.scrollLeft]; st.any=true; } });
  if(BG_REDRAW){ st.fields={};
    Array.prototype.forEach.call(root.querySelectorAll("input[id],select[id],textarea[id]"),function(el){ if(el.type==="file"||el.type==="hidden") return; if(redrawFieldDirty(el)) st.fields[el.id]={v:el.value,c:el.checked}; });
    var a=document.activeElement; if(a&&a.id&&root.contains(a)) st.focus={id:a.id,s:a.selectionStart,e:a.selectionEnd}; }
  return st; }
function redrawRestore(st){ var root=document.getElementById("content"); if(!st||!root) return;
  if(st.any) redrawScrollers(root,function(el,k){ var p=st.scroll[k]; if(p){ el.scrollTop=p[0]; el.scrollLeft=p[1]; } });
  if(st.fields) Object.keys(st.fields).forEach(function(id){ var el=document.getElementById(id); if(!el||!root.contains(el)) return; if(el.type==="checkbox"||el.type==="radio") el.checked=st.fields[id].c; else el.value=st.fields[id].v; });
  var f=st.focus, el=f&&document.getElementById(f.id);
  if(el&&root.contains(el)&&document.activeElement!==el){ try{ el.focus({preventScroll:true}); if(f.s!=null&&el.setSelectionRange) el.setSelectionRange(f.s,f.e); }catch(x){} } }
(function(){ if(typeof renderScreen!=="function") return; var base=renderScreen;
  renderScreen=function(){ var st=null; try{ st=redrawCapture(); }catch(e){} var r=base.apply(this,arguments); REDRAW_DRAWN=redrawIdentity();
    try{ redrawRestore(st); }catch(e){ console.error(e); } return r; }; })();
/* whatever a server event redraws is a redraw from elsewhere */
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(){ var self=this, args=arguments; return bgRedraw(function(){ return base.apply(self,args); }); }; })();
/* The eye on a password field moves the field into a wrapper, and a field moved in the page loses its focus: a
   password being typed lost it at every redraw. It keeps it, and its caret. */
(function(){ if(typeof pwToggleAttach!=="function") return; var base=pwToggleAttach; pwToggleAttach=function(inp){ var had=document.activeElement===inp, s=had?inp.selectionStart:null, e=had?inp.selectionEnd:null, r=base.apply(this,arguments);
  if(had&&document.activeElement!==inp){ try{ inp.focus({preventScroll:true}); if(s!=null) inp.setSelectionRange(s,e); }catch(x){} } return r; }; })();
</script>
