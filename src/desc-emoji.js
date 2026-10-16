<script>
/* ============================================================
   AN EMOJI IS A LETTER, NOT A PICTURE (Oct 2026)
   Many sites put emoji on the clipboard as small pictures (<img alt="✅" src="…/emoji/…png">): Gmail, Google Chat,
   WhatsApp Web, X, Slack. Pasted into a description (or a progress note — the same editor) each became a picture: a
   framed block on a line of its own, as large as the picture file, with its words pushed below it.
   Now an emoji picture becomes the emoji itself, where it was, when it is pasted and when the writing is saved; one
   already stored as a picture is shown as the emoji, on the line it belongs to, and is stored that way when the
   description is next saved. A picture that is not an emoji is untouched.
   ============================================================ */
var DESC_EMOJI_HOSTS=/(^|\.)(fonts\.gstatic\.com|twemoji\.maxcdn\.com|abs\.twimg\.com|emoji\.slack-edge\.com|a\.slack-edge\.com|github\.githubassets\.com|static\.xx\.fbcdn\.net|static\.whatsapp\.net|web\.whatsapp\.com|cdn\.jsdelivr\.net|emojipedia-us\.s3\.amazonaws\.com|em-content\.zobj\.net)$/i;
/* the emoji a picture stands for: its alt when that is emoji (✅, 👍🏽, 🇮🇩, 1️⃣), or a ":name:" from an emoji host */
function descEmojiOf(alt,src){
  var a=String(alt||"").trim(); if(!a||a.length>24) return "";
  try{
    if(/^[\p{Extended_Pictographic}\p{Emoji_Component}\p{Regional_Indicator}‍️⃣\s]+$/u.test(a)&&/[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u.test(a)) return a;
  }catch(e){ return ""; }
  var host=""; try{ host=new URL(String(src||""),location.href).hostname; }catch(e){}
  if(/^:[\w+-]{1,40}:$/.test(a)&&(DESC_EMOJI_HOSTS.test(host)||/emoji/i.test(String(src||"")))) return a;
  return "";
}
/* pasted or saved: each emoji picture in the HTML becomes its letter, in place */
function descEmojiPictures(html){
  if(!html||String(html).indexOf("<img")<0||typeof document==="undefined") return html;
  var d=document.createElement("div"); d.innerHTML=html; var n=0;
  d.querySelectorAll("img").forEach(function(im){
    var e=descEmojiOf(im.getAttribute("alt")||im.getAttribute("aria-label")||im.getAttribute("data-emoji")||"",im.getAttribute("src")||"");
    if(!e) return; im.parentNode.replaceChild(document.createTextNode(e),im); n++;
  });
  return n?d.innerHTML:html;
}
/* stored before: an emoji picture on a line of its own, its words on the next — the emoji, on that line */
function descEmojiLines(md){
  var s=String(md==null?"":md); if(s.indexOf("![")<0) return s;
  var lines=s.split("\n"), out=[];
  for(var i=0;i<lines.length;i++){
    var m=/^\s*!\[([^\]\n]{1,60})\]\(((?:https?:\/\/|zc-att:)[^\s)]+)(?:\s+=\s*\d{1,3}%)?\)\s*$/.exec(lines[i]), e=m&&descEmojiOf(m[1],m[2]);
    if(e){ if(i+1<lines.length&&lines[i+1].trim()&&!/^\s*!\[/.test(lines[i+1])){ out.push(e+" "+lines[i+1].replace(/^\s+/,"")); i++; } else out.push(e); continue; }
    /* within a line: the letter in place of the picture */
    out.push(lines[i].replace(/!\[([^\]\n]{1,60})\]\(((?:https?:\/\/|zc-att:)[^\s)]+)(?:\s+=\s*\d{1,3}%)?\)/g,function(all,alt,src){ return descEmojiOf(alt,src)||all; }));
  }
  return out.join("\n");
}
(function(){
  if(typeof descHtmlToMd==="function"){ var save=descHtmlToMd; descHtmlToMd=function(html,opts){ return descEmojiLines(save.call(this,descEmojiPictures(html),opts)); }; }
  if(typeof descMdHtml==="function"){ var view=descMdHtml; descMdHtml=function(src){ return view.call(this,descEmojiLines(src)); }; }
})();
</script>
