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
   ============================================================ */
var BG_REDRAW=0;
function bgRedraw(fn){ BG_REDRAW++; try{ return fn(); } finally{ BG_REDRAW--; } }
function redrawView(){ return [S.screen,S.sub||"",S.settingsTab||"",S.taskView||"",S.projectId||"",S.projectTab||"",S.projView||""].join("|"); }
/* classes that say how something looks right now, not what it is */
var REDRAW_STATE=/^(on|open|drag|over|active|hover|sel|selected|focus|focused|dim|empty|collapsed|full|expanded|kb-grabbed|loading)$/;
function redrawKey(el,root){ var parts=[], n=el;
  while(n&&n!==root&&parts.length<7){
    var cls=typeof n.className==="string"?n.className.split(/\s+/).filter(function(c){ return c&&!REDRAW_STATE.test(c); }).sort().join("."):"";
    var d=n.getAttribute?(n.getAttribute("data-status")||n.getAttribute("data-sec")||n.getAttribute("data-col")||n.getAttribute("data-team")||n.getAttribute("data-day")||""):"";
    parts.unshift(n.tagName+(n.id?"#"+n.id:"")+(cls?"."+cls:"")+(d?"["+d+"]":"")); n=n.parentElement; }
  return parts.join(">"); }
/* the elements that can scroll, each with its key and its place among those sharing the key */
function redrawScrollers(root,fn){ var seen={};
  Array.prototype.forEach.call(root.querySelectorAll("*"),function(el){
    if(el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1) return;
    var k=redrawKey(el,root); seen[k]=(seen[k]||0)+1; fn(el,k+"#"+seen[k]); }); }
function redrawFieldDirty(el){ if(el.type==="checkbox"||el.type==="radio") return el.checked!==el.defaultChecked;
  if(el.tagName==="SELECT"){ var d=Array.prototype.filter.call(el.options,function(o){ return o.defaultSelected; })[0]; return (d?d.value:(el.options[0]||{}).value)!==el.value; }
  return el.value!==el.defaultValue; }
function redrawCapture(){ var root=document.getElementById("content"); if(!root) return null;
  var st={view:redrawView(),scroll:{},any:false,fields:null,focus:null};
  redrawScrollers(root,function(el,k){ if(el.scrollTop||el.scrollLeft){ st.scroll[k]=[el.scrollTop,el.scrollLeft]; st.any=true; } });
  if(BG_REDRAW){ st.fields={};
    Array.prototype.forEach.call(root.querySelectorAll("input[id],select[id],textarea[id]"),function(el){ if(el.type==="file"||el.type==="hidden") return; if(redrawFieldDirty(el)) st.fields[el.id]={v:el.value,c:el.checked}; });
    var a=document.activeElement; if(a&&a.id&&root.contains(a)) st.focus={id:a.id,s:a.selectionStart,e:a.selectionEnd}; }
  return st; }
function redrawRestore(st){ var root=document.getElementById("content"); if(!st||!root||st.view!==redrawView()) return;
  if(st.any) redrawScrollers(root,function(el,k){ var p=st.scroll[k]; if(p){ el.scrollTop=p[0]; el.scrollLeft=p[1]; } });
  if(st.fields) Object.keys(st.fields).forEach(function(id){ var el=document.getElementById(id); if(!el||!root.contains(el)) return; if(el.type==="checkbox"||el.type==="radio") el.checked=st.fields[id].c; else el.value=st.fields[id].v; });
  var f=st.focus, el=f&&document.getElementById(f.id);
  if(el&&root.contains(el)&&document.activeElement!==el){ try{ el.focus({preventScroll:true}); if(f.s!=null&&el.setSelectionRange) el.setSelectionRange(f.s,f.e); }catch(x){} } }
(function(){ if(typeof renderScreen!=="function") return; var base=renderScreen;
  renderScreen=function(){ var st=null; try{ st=redrawCapture(); }catch(e){} var r=base.apply(this,arguments); try{ redrawRestore(st); }catch(e){ console.error(e); } return r; }; })();
/* whatever a server event redraws is a redraw from elsewhere */
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(){ var self=this, args=arguments; return bgRedraw(function(){ return base.apply(self,args); }); }; })();
/* The eye on a password field moves the field into a wrapper, and a field moved in the page loses its focus: a
   password being typed lost it at every redraw. It keeps it, and its caret. */
(function(){ if(typeof pwToggleAttach!=="function") return; var base=pwToggleAttach; pwToggleAttach=function(inp){ var had=document.activeElement===inp, s=had?inp.selectionStart:null, e=had?inp.selectionEnd:null, r=base.apply(this,arguments);
  if(had&&document.activeElement!==inp){ try{ inp.focus({preventScroll:true}); if(s!=null) inp.setSelectionRange(s,e); }catch(x){} } return r; }; })();
</script>
