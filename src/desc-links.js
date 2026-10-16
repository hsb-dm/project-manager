<script>
/* ============================================================
   A LINK WRITTEN AS ITS OWN ADDRESS, KEPT ONE LINK (Oct 2026)
   In the description (and progress notes, the same editor), a link whose words are its own address — a Figma link,
   whose name is not read — was linked a second time when drawn: the address in its words was taken for a bare one,
   and the browser split the link-in-a-link into an empty link and a full one. The empty one was saved as
   "[](address)", which reads as text, so every save (one on each pause in typing) wrapped the address again, and the
   description filled up with "[]([](https://…".
   Now: a link inside a link is never made (descMdInline), a link whose words are empty or its own address is saved as
   the bare address (descHtmlToMd), and a description already filled that way reads — and is saved — as the one
   address it was (descLinkRepair; server.js cleans what is stored, once).
   ============================================================ */
var DESC_URL="https?:\\/\\/[^\\s\\[\\]()<>]+";
function descLinkRepair(md){
  var s=String(md==null?"":md), url=new RegExp(DESC_URL,"g");
  /* a run of "[](" and addresses, nothing else in it, back to its addresses — each once, a space apart */
  s=s.replace(new RegExp("(?:[\\[\\]()]*"+DESC_URL+"[\\[\\]()]*)+","g"),function(run,off,all){
    if(off>0&&all.charAt(off-1)==="!") return run;
    /* only the old bug's mark: brackets around a proper link are the writing's own (a link reading as its address
       is made the address below, without them) */
    if(run.indexOf("[](")<0) return run;
    var urls=run.match(url)||[];
    return urls.length?urls.filter(function(u,i){ return urls.indexOf(u)===i; }).join(" "):run;
  });
  /* what is left: an empty link, or one whose words are its address, as the address (a picture's ![](…) stays) */
  s=s.replace(/(^|[^!])\[\]\((https?:\/\/[^\s)]+)\)/g,"$1$2").replace(/(^|[^!])\[(https?:\/\/[^\]\s]+)\]\(\2\)/g,"$1$2");
  return s;
}
/* a link inside a link: the inner one's tags go, its words stay in the outer one */
function descUnnestLinks(html){
  var depth=0, drop=[];
  return String(html).replace(/<a\b[^>]*>|<\/a>/gi,function(tag){
    if(tag.charAt(1)!=="/"){ depth++; if(depth>1){ drop.push(depth); return ""; } return tag; }
    if(depth>1&&drop.length&&drop[drop.length-1]===depth){ drop.pop(); depth--; return ""; }
    depth=Math.max(0,depth-1); return tag;
  });
}
(function(){
  if(typeof descMdInline==="function"){ var inline=descMdInline; descMdInline=function(s){ return descUnnestLinks(inline.apply(this,arguments)); }; }
  if(typeof descMdHtml==="function"){ var view=descMdHtml; descMdHtml=function(src){ return view.call(this,descLinkRepair(src)); }; }
  if(typeof descHtmlToMd==="function"){ var save=descHtmlToMd; descHtmlToMd=function(){ return descLinkRepair(save.apply(this,arguments)); }; }
})();
</script>
