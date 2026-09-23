<script>
/* Accurate Workspace Quest targeting for responsive and personalized layouts. */
(function(){
  function stepById(id){return WQ_STEPS.filter(function(step){return step[0]===id;})[0];}
  stepById("tasks.blockedFilter")[4]="[data-tour='task-dependency-filter']";
  stepById("welcome.intro")[4]="[data-tour='home-priorities'] .panel-head";
  stepById("home.priorities")[4]="[data-tour='home-priorities'] .panel-head";
  stepById("home.review")[4]="[data-tour='home-review'] .panel-head";
  stepById("workflow.practice")[4]="[data-id='T-ONB-101']";
  stepById("dependencies.blockedby")[4]="[data-tour='task-blocked-by']";
  stepById("dependencies.blocking")[4]="[data-tour='task-blocking']";

  window.wqRequiredNav=function(){var s=wqState(),step=s.status==="active"?wqCurrent(s):null,m=String(step&&step[4]||"").match(/nav-([a-z]+)/);return m?m[1]:null;};
  window.wqRequiredDashboard=function(){var s=wqState(),step=s.status==="active"?wqCurrent(s):null,m=String(step&&step[4]||"").match(/home-([a-z]+)/);return m?m[1]:null;};
  window.wqTagCompactNav=function(){if(innerWidth>980)return;var tabs=document.getElementById("tabbar"),sheet=document.getElementById("sheet");if(!tabs||!sheet)return;var hid=navHidden(),required=wqRequiredNav(),ids=NAV_ALL.filter(function(it){return hid.indexOf(it[0])<0||S.screen===it[0]||required===it[0];}).map(function(it){return it[0];}),tabButtons=tabs.querySelectorAll("button"),main=Math.min(4,ids.length);for(var a=0;a<tabButtons.length;a++)tabButtons[a].removeAttribute("data-tour");for(var i=0;i<main;i++)tabButtons[i].setAttribute("data-tour","nav-"+ids[i]);if(tabButtons[main])tabButtons[main].setAttribute("data-tour","nav-more");var sheetButtons=sheet.querySelectorAll("button"),rest=ids.slice(4);for(var b=0;b<sheetButtons.length;b++)sheetButtons[b].removeAttribute("data-tour");for(var j=0;j<rest.length&&j<sheetButtons.length;j++)sheetButtons[j].setAttribute("data-tour","nav-"+rest[j]);};
  function visible(el){if(!el)return false;var r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&cs.visibility!=="hidden"&&cs.display!=="none"&&cs.opacity!=="0";}
  window.wqVisibleAnchor=function(selector){if(!selector)return null;var all=document.querySelectorAll(selector);for(var i=0;i<all.length;i++)if(visible(all[i]))return all[i];return null;};
  window.wqAnchor=function(step){if(!step||!step[4])return null;wqTagCompactNav();return wqVisibleAnchor(step[4]);};
  function closeSheetQuietly(){var sheet=document.getElementById("sheet");if(sheet)sheet.classList.remove("open");if(!S.drawerTask){var overlay=document.getElementById("overlay");if(overlay)overlay.classList.remove("open");}}
  window.wqRevealTarget=function(step){
    if(!step)return null;var selector=String(step[4]||"");
    if(selector.indexOf("nav-")>=0){wqTagCompactNav();var direct=wqVisibleAnchor(selector);if(direct){if(innerWidth<=980&&!direct.closest("#sheet"))closeSheetQuietly();return direct;}renderNav();wqTagCompactNav();direct=wqVisibleAnchor(selector);if(direct){if(innerWidth<=980&&!direct.closest("#sheet"))closeSheetQuietly();return direct;}if(innerWidth<=980){var sheet=document.getElementById("sheet"),matches=document.querySelectorAll(selector),raw=null;for(var i=0;i<matches.length;i++)if(sheet&&sheet.contains(matches[i])){raw=matches[i];break;}if(raw){sheet.classList.add("open");document.getElementById("overlay").classList.add("open");return wqVisibleAnchor(selector);}}}
    if(selector==="#searchInput"&&!wqVisibleAnchor(selector))toggleSearchBar(true);var target=wqAnchor(step);if(target)return target;var raw=document.querySelector(selector);if(raw){var rr=raw.getBoundingClientRect(),cs=getComputedStyle(raw);if(rr.width>0&&rr.height>0&&cs.display!=="none"&&cs.visibility!=="hidden"){raw.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"});return wqAnchor(step)||raw;}}return null;
  };
  var prepareBase=wqPrepare;
  window.wqPrepare=function(step){
    if(!step)return;var selector=String(step[4]||"");
    if(selector.indexOf("nav-")>=0){closeDrawer();closePops();if(S.screen!==step[3])go(step[3]);}
    else if(step[0]==="workflow.practice"){closeDrawer();S.taskScope="mine";S.taskView="kanban";go("tasks");wqTraining();renderScreen(false);}
    /* The task drawer is left open by the workflow chapter and never closed on
       the way into the AI chapter, so the AI panel opened behind the drawer's
       overlay: the close button existed but was covered, the spotlight landed on
       nothing, and the step could never be completed. Close the drawer first. */
    else if(step[0]==="ai.close"){closeDrawer();closePops();if(S.screen!=="aihub")go("aihub");setTimeout(function(){var s=wqState();if(s.status==="active"&&wqCurrent(s)[0]==="ai.close"&&typeof AI_CHAT!=="undefined"&&!AI_CHAT.open)aiChatToggle(true);},0);}
    else if(step[0]==="ai.intelligence"||step[0]==="personal.search"){closeDrawer();closePops();if(typeof AI_CHAT!=="undefined"&&AI_CHAT.open)aiChatToggle(false);prepareBase(step);}
    else if(step[0]==="ai.hub"){closeDrawer();closePops();prepareBase(step);}
    else prepareBase(step);
    renderNav();setTimeout(function(){wqRevealTarget(step);},20);
  };
  var renderCoachBase=wqRenderCoach;
  window.wqRenderCoach=function(){var state=wqState(),step=state.status==="active"?wqCurrent(state):null;if(step)wqRevealTarget(step);renderCoachBase();var until=performance.now()+420;function sync(){var root=document.getElementById("workspaceQuestRoot"),target=step&&wqRevealTarget(step);if(!root||!root.children.length)return;var r=target&&target.getBoundingClientRect();root.classList.toggle("wq-target-bottom",!!r&&r.top+r.height/2>innerHeight/2);wqPosition(root,target);if(performance.now()<until)requestAnimationFrame(sync);}requestAnimationFrame(sync);};
  window.wqPosition=function(root,target){
    var card=root&&root.querySelector(".wq-card"),ring=root&&root.querySelector(".wq-ring"),svg=root&&root.querySelector(".wq-mask");if(!card||!ring||!svg)return;
    var w=innerWidth,h=innerHeight,margin=w<=640?14:24,gap=14,cw=Math.min(card.offsetWidth||470,w-margin*2),ch=Math.min(card.offsetHeight||330,h-margin*2),clamp=function(v,a,b){return Math.max(a,Math.min(b,v));};
    if(!visible(target)){ring.style.display="none";svg.setAttribute("viewBox","0 0 "+w+" "+h);svg.innerHTML='<rect width="100%" height="100%" fill="rgba(11,16,32,.48)"/>';card.style.left=clamp((w-cw)/2,margin,w-cw-margin)+"px";card.style.top=clamp((h-ch)/2,margin,h-ch-margin)+"px";return;}
    var r=target.getBoundingClientRect(),isControl=target.matches("button,input,select,textarea")||target.classList.contains("seg"),pad=isControl?4:7,edge=2,x1=clamp(r.left-pad,edge,w-edge),x2=clamp(r.right+pad,edge,w-edge),y1=clamp(r.top-pad,edge,h-edge),y2=clamp(r.bottom+pad,edge,h-edge),rw=Math.max(1,x2-x1),rh=Math.max(1,y2-y1);
    ring.style.display="block";ring.style.left=x1+"px";ring.style.top=y1+"px";ring.style.width=rw+"px";ring.style.height=rh+"px";svg.setAttribute("viewBox","0 0 "+w+" "+h);svg.innerHTML='<path fill="rgba(11,16,32,.54)" fill-rule="evenodd" d="M0 0H'+w+'V'+h+'H0Z M'+x1+' '+y1+'H'+x2+'V'+y2+'H'+x1+'Z"/>';
    var candidates=[{x:x2+gap,y:clamp(y1,margin,h-ch-margin),space:w-margin-(x2+gap)},{x:x1-cw-gap,y:clamp(y1,margin,h-ch-margin),space:x1-gap-margin},{x:clamp(x1,margin,w-cw-margin),y:y2+gap,space:h-margin-(y2+gap)},{x:clamp(x1,margin,w-cw-margin),y:y1-ch-gap,space:y1-gap-margin}],pick=null;
    for(var i=0;i<candidates.length;i++)if(candidates[i].space>=(i<2?cw:ch)){pick=candidates[i];break;}if(!pick)pick={x:clamp((w-cw)/2,margin,w-cw-margin),y:clamp((h-ch)/2,margin,h-ch-margin)};card.style.left=pick.x+"px";card.style.top=pick.y+"px";
  };
})();
</script>
