<script>
/* MOBILE: THE PAGE MUST NOT ZOOM WHEN A FIELD IS TAPPED.

   Safari on iOS zooms the whole page in whenever a field with text smaller than 16px takes focus,
   and then leaves it zoomed: half the screen is off to the side, the send button is gone, and you
   are typing a message you cannot see. Every compact control in here — the message box, the
   comment box, the task fields — is deliberately smaller than 16px, so this happened constantly.

   Raising all of them to 16px would undo the dense layout the phone screens are built around, so
   the page says instead that it is already at its intended scale while a field is focused, and
   says so only then: pinch-to-zoom works everywhere else, and comes back the moment the field is
   left. Browsers that do not auto-zoom are unaffected — the attribute means nothing to them.

   Only on touch. A mouse never triggers this, and a page that cannot be zoomed is a page somebody
   with poor eyesight cannot read. */
(function(){
  var meta=document.querySelector('meta[name="viewport"]');
  if(!meta) return;
  var BASE=meta.getAttribute("content")||"width=device-width, initial-scale=1.0";
  var LOCKED=BASE+", maximum-scale=1, user-scalable=no";
  var timer=null;
  function touch(){ return !!(window.matchMedia&&window.matchMedia("(pointer:coarse)").matches); }
  /* Which fields Safari zooms into: anything you can type in, plus a select. A button or a
     checkbox takes focus without ever opening a keyboard. */
  function typable(el){
    if(!el||!el.tagName) return false;
    var tag=el.tagName;
    if(tag==="TEXTAREA"||tag==="SELECT") return true;
    if(tag==="INPUT") return !/^(button|submit|reset|checkbox|radio|file|image|range|color)$/i.test(el.type||"text");
    return !!el.isContentEditable;
  }
  function lock(on){ var want=on?LOCKED:BASE; if(meta.getAttribute("content")!==want) meta.setAttribute("content",want); }
  document.addEventListener("focusin",function(e){ if(!touch()||!typable(e.target)) return; clearTimeout(timer); lock(true); });
  document.addEventListener("focusout",function(){
    clearTimeout(timer);
    /* Moving between two fields fires focusout before focusin; a beat avoids unlocking and
       relocking between them, which is what makes the page jump. */
    timer=setTimeout(function(){ if(!typable(document.activeElement)) lock(false); },200);
  });
})();

/* MOBILE: THE TASK PANEL IS ONE SCROLL (v38.css) — the details scroll away and the tabs stay at the top. A tab
   chosen down there starts at its own top, just under the tabs, not wherever the last tab was scrolled to; another
   task starts at the top; the chosen tab is scrolled into the row of tabs. */
(function(){
  var phone=function(){ return !!(window.matchMedia&&matchMedia("(max-width:760px)").matches); };
  var parts=function(){ var d=document.getElementById("drawer"); return { d:d, tabs:d&&d.querySelector(".dr-head>.tabs"), body:document.getElementById("drBody") }; };
  /* where the tabs reach the top: measured from the body under them, as the tabs themselves are stuck in place */
  var tabsTop=function(p){ return p.body&&p.tabs?p.body.offsetTop-p.tabs.offsetHeight:0; };
  var showTab=function(){ var p=parts(), on=p.tabs&&p.tabs.querySelector(".tab.on"); if(!on) return; var l=on.offsetLeft-12, r=on.offsetLeft+on.offsetWidth-p.tabs.clientWidth+12; if(p.tabs.scrollLeft>l) p.tabs.scrollLeft=Math.max(0,l); else if(p.tabs.scrollLeft<r) p.tabs.scrollLeft=r; };
  if(typeof setTab==="function"){ var st=setTab; setTab=function(){ var p=parts(), top=tabsTop(p), past=phone()&&p.d&&p.d.scrollTop>top; var out=st.apply(this,arguments); if(phone()){ if(past) parts().d.scrollTop=tabsTop(parts()); showTab(); } return out; }; }
  if(typeof openTask==="function"){ var ot=openTask; openTask=function(id){ var was=S.drawerTask, out=ot.apply(this,arguments); if(phone()&&was!==id){ var p=parts(); if(p.d) p.d.scrollTop=0; showTab(); } return out; }; }
})();

/* MOBILE: FIVE ATTACH BUTTONS ARE ONE. On a phone the row of ways to attach something (the comment box, a task's
   final files) is one button; its menu lists the same buttons, icon and name, and choosing one presses it — so
   each keeps doing exactly what it did, the file picker included (still the same tap). */
var M_TOOLS=[];
function mAttachMenu(btn,sel){ var scope=btn.closest(".composer,.av-sec")||document; M_TOOLS=[].slice.call(scope.querySelectorAll(sel+" .btn")); if(!M_TOOLS.length) return;
  ctxMenu(btn,M_TOOLS.map(function(b,i){ return '<button type="button" onclick="closePops();mAttachPick('+i+')">'+b.innerHTML+'</button>'; }).join("")); var m=document.getElementById("ctxMenu"); if(m) m.classList.add("m-attach-menu"); }
function mAttachPick(i){ var b=M_TOOLS[i]; M_TOOLS=[]; if(b) b.click(); }

/* MOBILE: A PROJECT'S TABS KEEP THEIR PLACE. They scroll sideways on a phone; choosing one redraws the page, and the
   row used to start over at Overview, the tab just chosen out of sight. It keeps where it was, the chosen tab in view. */
(function(){
  if(typeof renderScreen!=="function") return;
  var base=renderScreen;
  renderScreen=function(){ var was=document.querySelector("#content .ptabs"), left=was?was.scrollLeft:0, out=base.apply(this,arguments), row=document.querySelector("#content .ptabs");
    if(row&&row!==was&&row.scrollWidth>row.clientWidth){ row.scrollLeft=left; var on=row.querySelector(".tab.on"); if(on){ var l=on.offsetLeft-row.offsetLeft-12, r=l+on.offsetWidth+24-row.clientWidth; if(row.scrollLeft>l) row.scrollLeft=Math.max(0,l); else if(row.scrollLeft<r) row.scrollLeft=r; } }
    return out; };
})();
</script>
