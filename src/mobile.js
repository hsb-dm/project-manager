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
</script>
