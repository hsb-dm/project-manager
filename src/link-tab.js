<script>
/* A GOOGLE LINK READS AS ITS NAME — in a chat message and in a task comment.

   A Drive link is a hundred characters nobody can read. Pasted, it turns into the folder's or file's
   name ("Q4 Campaign") as soon as the name is read; a link typed by hand turns with Tab, the caret
   just after it. The name shows in the link colour while writing. When the
   message is sent, the name is stored as a link to the address — [Q4 Campaign](https://…) — so it
   is read as the name and still opens the folder. It works like an @mention: the box holds what
   is read, a list on the side holds where it points.

   Tab does nothing new anywhere else: not away from a link, not on an ordinary web link, and not
   while the @ picker is open, where it picks a person. If the name cannot be read (the link is not
   shared with everyone who has it) the link reads as what it is, "Google Drive Folder", which is
   still short and can be typed over. And if someone edits the name out of the text, the address is
   put back at the end on sending rather than lost. */

var MDLINK_RE=/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)/g;
/* [name](url) pairs in a stored text, by address */
function mdLinkNames(text){ var out={}, m; MDLINK_RE.lastIndex=0; while((m=MDLINK_RE.exec(String(text||"")))) out[m[2]]=m[1]; return out; }
/* the same text with each [name](url) back to its bare address, for code that finds links by address */
function mdLinkStrip(text){ return String(text||"").replace(MDLINK_RE,function(_,n,u){ return u; }); }
/* Box text → stored text: each named link becomes [name](url); one whose name was edited away
   keeps its address, added at the end. */
function linkTokensExpand(text,tokens){
  var s=String(text||""), tail=[];
  (tokens||[]).forEach(function(t){
    if(!t||!t.display||!t.url) return;
    var i=s.indexOf(t.display);
    if(i<0){ if(s.indexOf(t.url)<0) tail.push(t.url); return; }
    s=s.slice(0,i)+"["+t.display+"]("+t.url+")"+s.slice(i+t.display.length);
  });
  return tail.length?s.replace(/\s*$/,"")+" "+tail.join(" "):s;
}

/* ---------- which box, and where its named links are kept ---------- */
function linkTabBox(ta){
  if(!ta) return null;
  if(ta.id==="cmtText"){ window._cmtLinks=window._cmtLinks||[]; return {list:window._cmtLinks,picker:function(){ return typeof cmtPicker==="function"&&!!cmtPicker(); }}; }
  if(ta.id==="msgInput"&&typeof msgDraft==="function"&&S.messageConversationId){ var d=msgDraft(S.messageConversationId); d.links=d.links||[]; return {list:d.links,picker:function(){ return !!(CHAT_RUNTIME.mentionOpen&&document.getElementById("entityPicker")); }}; }
  return null;
}
/* the Google link the caret is at the end of (a space after it is allowed) */
function linkAtCaret(ta){
  var pos=ta.selectionStart, v=ta.value;
  if(ta.selectionEnd!==pos) return null;
  var hit=null;
  (typeof messageUrls==="function"?messageUrls(v):[]).forEach(function(x){
    if(isGoogleLink(x.url)&&(pos===x.end||(pos===x.end+1&&/\s/.test(v.charAt(x.end))))) hit=x;
  });
  return hit;
}
/* Swap one Google link in the box for its name. The name is read first (at most 4 s); meanwhile the
   person may go on typing, so the link is found again by its text, and the caret — or a selection —
   keeps its place relative to the text around it. The box is never focused from here: someone who
   moved on to another field keeps it. */
function linkNameSwap(ta,x,o){
  o=o||{}; var id=ta.id, url=x.url, raw=x.raw, known=driveLinkKnown(url);
  if(!known&&o.tell) toast(tr("Reading the name from Google Drive…"));
  var wait=new Promise(function(r){ setTimeout(function(){ r(""); },4000); });
  return Promise.race([known?Promise.resolve(driveLinkLabel(url)):driveLinkName(url),wait]).then(function(name){
    var live=document.getElementById(id); if(!live) return;
    var at=live.value.indexOf(raw); if(at<0) return;   /* the link was edited away meanwhile */
    var display=name||driveLinkLabel(url), d=display.length-raw.length, end=at+raw.length;
    var focused=document.activeElement===live, s0=live.selectionStart, s1=live.selectionEnd;
    live.value=live.value.slice(0,at)+display+live.value.slice(end);
    var b=linkTabBox(live);
    if(b&&!b.list.some(function(t){ return t.display===display&&t.url===url; })) b.list.push({display:display,url:url});
    if(focused){ var fix=function(p){ return p>=end?p+d:(p>at?at+display.length:p); }; live.setSelectionRange(fix(s0),fix(s1)); }
    live.dispatchEvent(new Event("input",{bubbles:true}));
    if(!name) toast(tr("The name could not be read — the link is probably not shared with anyone who has it. It will show as")+" “"+display+"”.");
  });
}
document.addEventListener("keydown",function(e){
  if(e.key!=="Tab"||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey) return;
  var ta=e.target, box=linkTabBox(ta); if(!box||box.picker()) return;
  var x=linkAtCaret(ta); if(!x) return;
  e.preventDefault(); e.stopPropagation();
  linkNameSwap(ta,x,{tell:true});
},true);
/* Pasted: every Google link in what was pasted, once the paste is in the box. */
var LINK_PASTED_AT=0;
document.addEventListener("paste",function(e){
  var ta=e.target, box=linkTabBox(ta); if(!box) return;
  var text=(e.clipboardData&&e.clipboardData.getData("text/plain"))||"";
  if(!/https?:\/\//i.test(text)) return;
  LINK_PASTED_AT=Date.now();
  setTimeout(function(){
    var live=document.getElementById(ta.id); if(!live) return;
    (typeof messageUrls==="function"?messageUrls(live.value):[]).forEach(function(x){
      if(isGoogleLink(x.url)&&text.indexOf(x.raw)>=0) linkNameSwap(live,x);
    });
  },0);
});

/* A hint the first time a Google link lands in either box, since nothing on screen says Tab can do this. */
var LINK_TAB_HINTED=false;
document.addEventListener("input",function(e){
  if(LINK_TAB_HINTED||Date.now()-LINK_PASTED_AT<1500) return;
  var ta=e.target; if(!linkTabBox(ta)) return;
  if((typeof messageUrls==="function"?messageUrls(ta.value):[]).some(function(x){ return isGoogleLink(x.url); })){
    LINK_TAB_HINTED=true; toast(tr("Tip: press Tab after a Google Drive link to show it by its name"));
  }
});

/* ---------- while writing: the named link in the link colour ----------
   Same letters, same widths — only colour — so the caret stays on the text. */
function linkTabMark(html,tokens){
  (tokens||[]).slice().sort(function(a,b){ return b.display.length-a.display.length; }).forEach(function(t){
    var d=esc(t.display); html=html.split(d).join('<span class="msg-linkname">'+d+'</span>');
  });
  return html;
}
(function(){
  if(typeof cmtMirrorSync==="function"){
    var baseC=cmtMirrorSync;
    cmtMirrorSync=function(){ var r=baseC.apply(this,arguments); var m=document.querySelector("#drawer .cmt-ta-mirror"); if(m&&(window._cmtLinks||[]).length){ var keep=m.innerHTML; try{ m.innerHTML=linkTabMark(keep,window._cmtLinks); }catch(x){ m.innerHTML=keep; } } return r; };
  }
  if(typeof msgMirrorSync==="function"){
    var baseM=msgMirrorSync;
    msgMirrorSync=function(c){ var r=baseM.apply(this,arguments); var m=document.getElementById("msgMirror"), d=c&&msgDraft(c.id); if(m&&d&&(d.links||[]).length) m.innerHTML=linkTabMark(m.innerHTML,d.links); return r; };
  }
})();

/* ---------- sending ---------- */
(function(){
  /* chat: the stored message carries [name](url); the box's list is cleared with the draft */
  if(typeof msgBuildFromDraft==="function"){
    var baseB=msgBuildFromDraft;
    msgBuildFromDraft=function(c){
      var d=msgDraft(c.id), links=d.links||[];
      if(!links.length) return baseB.apply(this,arguments);
      var shown=d.text; d.text=linkTokensExpand(shown,links);
      try{ var m=baseB.apply(this,arguments); if(m) d.links=[]; else d.text=shown; return m; }
      catch(x){ d.text=shown; throw x; }
    };
  }
  /* chat keeps a card for each link in the text; a named link is still a link in the text */
  if(typeof msgSyncDraftUrlsCore==="function"){
    var baseS=msgSyncDraftUrlsCore;
    msgSyncDraftUrlsCore=function(id){
      var d=msgDraft(id), links=d.links||[];
      if(!links.length) return baseS.apply(this,arguments);
      var shown=d.text; d.text=linkTokensExpand(shown,links);
      try{ return baseS.apply(this,arguments); } finally{ d.text=shown; }
    };
  }
})();

/* ---------- reading: a stored [name](url) shows the name ----------
   Chat messages here; comments in comment-attach.js's richLinkText, which already draws Drive
   links as chips. */
(function(){
  if(typeof msgBodyHtml!=="function") return;
  var base=msgBodyHtml;
  msgBodyHtml=function(m){
    var names=mdLinkNames(m&&m.body);
    if(!Object.keys(names).length) return base.apply(this,arguments);
    var html=base.call(this,Object.assign({},m,{body:mdLinkStrip(m.body)}));
    return html.replace(/<a href="([^"]+)"([^>]*)>([^<]*)<\/a>/g,function(whole,href,rest,text){
      var url=typeof pasteUnesc==="function"?pasteUnesc(href):href, name=names[url];
      if(!name) return whole;
      return isGoogleLink(url)?driveChipHtml(url,name):'<a href="'+href+'"'+rest+'>'+esc(name)+'</a>';
    });
  };
})();

Object.assign(UI_ID,{
  "Tip: press Tab after a Google Drive link to show it by its name":"Tips: tekan Tab setelah tautan Google Drive untuk menampilkannya dengan namanya"
});
</script>
