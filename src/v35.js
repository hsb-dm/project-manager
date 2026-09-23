<script>
/* ZenCrevia v35 — chat consistency and accessibility.
   1. Composer: 4,000-character limit with a counter once you get close (the server refuses
      longer messages instead of cutting them).
   2. Screen readers: new messages from other people in the open conversation are announced
      through a polite live region (the timeline itself re-renders, so it is not live).
   3. Readable errors for the new send rate limit. */
(function(){
  var LIMIT=4000;
  function counter(){ var t=document.getElementById("msgInput"); if(!t) return; var c=document.getElementById("zcMsgCount");
    var n=t.value.length; if(n<LIMIT*0.9){ if(c) c.remove(); return; }
    if(!c){ c=document.createElement("div"); c.id="zcMsgCount"; c.className="zc-msg-count"; c.setAttribute("aria-live","polite"); t.parentNode.appendChild(c); }
    c.textContent=n.toLocaleString()+" / "+LIMIT.toLocaleString(); c.classList.toggle("full",n>=LIMIT); }
  document.addEventListener("input",function(e){ if(e.target&&e.target.id==="msgInput") counter(); },true);

  var live=null;
  function announce(text){ if(!live){ live=document.createElement("div"); live.id="zcLive"; live.className="sr-only zc-sr"; live.setAttribute("aria-live","polite"); live.setAttribute("role","status"); document.body.appendChild(live); } live.textContent=""; setTimeout(function(){ live.textContent=text; },50); }
  if(typeof msgIncoming==="function"){ var base=msgIncoming;
    msgIncoming=function(m){ var r=base.apply(this,arguments);
      try{ if(m&&m.senderId!==ME&&S.screen==="messages"&&S.messageConversationId===m.conversationId) announce(tr("New message from")+" "+(person(m.senderId)||{}).name+": "+String(m.body||"").slice(0,200)); }catch(e){}
      return r; }; }
  Object.assign(UI_ID,{"New message from":"Pesan baru dari","Message":"Pesan",
    "You are sending messages too fast. Wait a few seconds.":"Kamu mengirim pesan terlalu cepat. Tunggu beberapa detik.",
    "Messages can be up to 4,000 characters.":"Pesan maksimal 4.000 karakter.","Not sent":"Belum terkirim","Retry":"Coba lagi","Discard":"Buang"});
})();
</script>
