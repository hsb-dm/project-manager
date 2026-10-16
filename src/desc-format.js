<script>
/* ============================================================
   PASTED WRITING KEEPS THE FORMAT IT CAME WITH (Oct 2026)
   Writing pasted into a description or a progress note (the same editor) keeps the formatting it had where it came
   from — bold, italic, strikethrough, underline, headings, lists, quotes, links, code — and still leaves its fonts,
   sizes and colours behind. Some of it was lost on the way:
   - Google Docs marks strikethrough and underline with a style, not a tag, and both were dropped. A bold or italic
     word with its space in the same run ("Bold ") lost the space: it was saved as "**Bold**then". The space now goes
     outside the marks — for typed writing too (bold switched off after a space).
   - Word's lists arrive as paragraphs with the bullet or the number written in front ("· Item one", "1. First"), and
     the white space between Word's paragraphs came along as empty lines. The lists are lists again, the gaps are gone.
   - Underline was not kept at all. It is now, written <u>…</u> in the text (Markdown takes that bit of HTML as it is),
     read back as underline, and Ctrl+U makes it (there is no button). Underlined link text is just the link.
   - x² and H₂O written with <sup>/<sub> became "x2": they are the superscript and subscript characters, when there is
     one for every character. A code block and a line (---) were dropped on the next save; they stay.
   - Plain text that carries formatting marks is that formatting when it is pasted: Markdown, as the Copy buttons of
     ChatGPT and Claude give it or a .md file holds it, and WhatsApp's *bold*, _italic_, ~strike~ and ```mono```.
     Which one is told from the text: Markdown when it has something only Markdown writes (**bold**, __bold__,
     ~~strike~~, a "# heading" line, [a link](https://…), a ``` line), WhatsApp otherwise — so *x* is bold in WhatsApp
     text and italic in Markdown. A mark counts only where it opens and closes words, so 5 * 3 * 2, file_name_v2 and
     2*3*4 stay as they are, and plain text with nothing to format is pasted the way it always was.
   What is typed stays exactly as typed (src/desc-literal.js): a typed "<u>" is text. Loaded after src/desc-emoji.js,
   inside src/ref-chips.js and src/desc-literal.js — what reaches it has every typed character marked already, so the
   <u> it writes is never taken for typing.
   ============================================================ */
/* a typed character desc-literal.js has marked, as itself (marks are what the serializer must pass through) */
function dfPlain(s){ s=String(s==null?"":s); return typeof DL_OUT==="undefined"?s:s.replace(/[\uE100-\uE1FF]/g,function(c){ return DL_OUT[c]||c; }); }
function dfStyle(el){ return String(el.getAttribute&&el.getAttribute("style")||"").toLowerCase(); }

/* ---------- x², H₂O: a character for each, or the text as it is ---------- */
var DF_SUP={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","−":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ"};
var DF_SUB={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","−":"₋","=":"₌","(":"₍",")":"₎"};
function dfScript(text,up){ var map=up?DF_SUP:DF_SUB, s=String(text||""), out=""; if(!s) return "";
  for(var i=0;i<s.length;i++){ var c=map[s.charAt(i)]; if(!c) return ""; out+=c; } return out; }

/* ---------- the way in: the HTML of the editor (or of a pasted page), before it is serialized ---------- */
/* what the serializer starts a line for (a table's cells are not: they run on in their row) */
var DF_BLOCKS=/^(p|div|li|ul|ol|h[1-6]|blockquote|pre|table|tr|section|article|header|footer|figure|hr|br)$/i;
function dfIsBlock(n){ return !!(n&&n.nodeType===1&&DF_BLOCKS.test(n.tagName)); }
function dfSib(n,dir){ n=dir<0?n.previousSibling:n.nextSibling; while(n&&n.nodeType===8) n=dir<0?n.previousSibling:n.nextSibling; return n; }
/* pasted: white space between blocks is the page's layout (Word puts a line break between its paragraphs), not writing */
function dfBlockGaps(d){
  /* what is not writing goes first (the serializer drops it anyway), so the white space around it is one gap */
  d.querySelectorAll("script,style,meta,title,link,xml").forEach(function(n){ n.parentNode.removeChild(n); });
  var cw=document.createTreeWalker(d,NodeFilter.SHOW_COMMENT,null), notes=[], cm; while((cm=cw.nextNode())) notes.push(cm);
  notes.forEach(function(n){ n.parentNode.removeChild(n); }); d.normalize();
  var w=document.createTreeWalker(d,NodeFilter.SHOW_TEXT,null), dead=[], t;
  while((t=w.nextNode())){ if(!/^[ \t\n\r\f]*$/.test(t.nodeValue)) continue; var p=t.parentNode, edge=p===d||dfIsBlock(p), a=dfSib(t,-1), b=dfSib(t,1);
    if((a?dfIsBlock(a):edge)||(b?dfIsBlock(b):edge)) dead.push(t); }
  dead.forEach(function(x){ x.parentNode.removeChild(x); }); return dead.length; }
/* Word's list paragraph: its bullet or number, taken out — between <![if !supportLists]> and <![endif]>, in a
   mso-list:Ignore span, or failing both written in front of the words */
function dfWordMarker(p){
  var it=document.createNodeIterator(p,NodeFilter.SHOW_COMMENT,null), c, start=null;
  while((c=it.nextNode())) if(/^\[if !supportLists\]$/i.test(String(c.data).trim())){ start=c; break; }
  if(start){ var text="", n=start.nextSibling;
    while(n&&!(n.nodeType===8&&/^\[endif\]$/i.test(String(n.data).trim()))){ var nx=n.nextSibling; if(n.nodeType!==8) text+=n.textContent; n.parentNode.removeChild(n); n=nx; }
    if(n) n.parentNode.removeChild(n); start.parentNode.removeChild(start); return dfPlain(text).trim(); }
  var ig=Array.prototype.filter.call(p.querySelectorAll("span"),function(s){ return /mso-list\s*:\s*ignore/.test(dfStyle(s)); })[0];
  if(ig){ var t=ig.textContent; ig.parentNode.removeChild(ig); return dfPlain(t).trim(); }
  var m=/^\s*([·•▪§oØü*–-]|\(?(?:\d{1,3}(?:\.\d{1,3})*|[a-z]|[ivxlcdm]{1,7})[.)])\s+/i.exec(dfPlain(p.textContent));
  if(!m) return null;
  /* the marker's characters, from the first text nodes on */
  var left=m[0].length, w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT,null), tn;
  while(left>0&&(tn=w.nextNode())){ var k=Math.min(left,tn.nodeValue.length); tn.nodeValue=tn.nodeValue.slice(k); left-=k; }
  return m[1]; }
function dfWordLists(d){ var n=0;
  Array.prototype.slice.call(d.querySelectorAll("p")).forEach(function(p){
    if(!/mso-list\s*:\s*l\d/.test(dfStyle(p))||!p.parentNode) return;
    var marker=dfWordMarker(p); if(marker===null) return;
    var tag=/^\(?(?:\d{1,3}(?:\.\d{1,3})*|[a-z]|[ivxlcdm]{1,7})[.)]$/i.test(marker)?"ol":"ul";
    var li=document.createElement("li"); while(p.firstChild) li.appendChild(p.firstChild);
    /* the list the paragraph before started, when it is the same kind; what lies between them was only spacing */
    var prev=p.previousSibling; while(prev&&(prev.nodeType===8||prev.nodeType===3&&!prev.nodeValue.trim())) prev=prev.previousSibling;
    var list=prev&&prev.nodeType===1&&prev.getAttribute("data-df-list")===tag?prev:null;
    if(list){ while(list.nextSibling&&list.nextSibling!==p) list.parentNode.removeChild(list.nextSibling); }
    else { list=document.createElement(tag); list.setAttribute("data-df-list",tag); p.parentNode.insertBefore(list,p); }
    list.appendChild(li); p.parentNode.removeChild(p); n++; });
  return n; }
function dfSupSub(d){ var n=0;
  Array.prototype.slice.call(d.querySelectorAll("sup,sub,span")).forEach(function(el){
    var t=el.tagName.toLowerCase(), st=dfStyle(el), up=t==="sup"||t==="span"&&/vertical-align\s*:\s*super/.test(st), down=t==="sub"||t==="span"&&/vertical-align\s*:\s*sub\b/.test(st);
    if(!up&&!down||el.children.length||el.closest("code,pre")) return;
    var m=/^(\s*)(\S+)(\s*)$/.exec(dfPlain(el.textContent)), out=m&&dfScript(m[2],up); if(!out) return;
    el.textContent=m[1]+out+m[3]; n++; });
  return n; }
/* Docs' strikethrough is a style: it is struck text as a tag says it */
function dfStrikeSpans(d){ var n=0;
  Array.prototype.slice.call(d.querySelectorAll("*")).forEach(function(el){
    if(/^(s|del|strike)$/i.test(el.tagName)||!/text-decoration(?:-line)?\s*:[^;]*line-through/.test(dfStyle(el))||el.closest("s,del,strike,code,pre")) return;
    var s=document.createElement("s"); while(el.firstChild) s.appendChild(el.firstChild); el.appendChild(s); n++; });
  return n; }
/* a line (---) and a code block are written as Markdown writes them: they used to be dropped on the next save */
function dfPreText(pre){ var out="";
  (function walk(n){ Array.prototype.forEach.call(n.childNodes,function(c){
    if(c.nodeType===3){ out+=c.nodeValue; return; } if(c.nodeType!==1) return; var t=c.tagName.toLowerCase();
    if(t==="br"){ out+="\n"; return; } var blk=/^(div|p|li|tr)$/.test(t); if(blk&&out&&!/\n$/.test(out)) out+="\n"; walk(c); if(blk&&out&&!/\n$/.test(out)) out+="\n"; }); })(pre);
  return out.replace(/\u00a0/g," ").replace(/\r/g,"").replace(/\n+$/,""); }
function dfBlocksAsText(d,paste){ var n=0;
  Array.prototype.slice.call(d.querySelectorAll("hr")).forEach(function(hr){ var box=document.createElement("div"); box.appendChild(document.createTextNode("---")); hr.parentNode.replaceChild(box,hr); n++; });
  Array.prototype.slice.call(d.querySelectorAll("pre")).forEach(function(pre){ if(!pre.parentNode||pre.parentNode.closest&&pre.parentNode.closest("pre")) return;
    var text=dfPreText(pre); if(!text.trim()) return;
    var box=document.createElement("div"), lines=["```"].concat(text.split("\n"),["```"]);
    /* pasted, white space is collapsed: the code's own spaces are kept apart until the text is written */
    lines.forEach(function(l,i){ if(i) box.appendChild(document.createElement("br")); if(l) box.appendChild(document.createTextNode(paste?l.replace(/ /g,"\uE0F0").replace(/\t/g,"\uE0F1"):l)); });
    pre.parentNode.replaceChild(box,pre); n++; });
  return n; }
/* "**Bold **then": the space at either end of a bold, italic, struck or underlined run goes outside it */
function dfSpaceOut(d){ var n=0;
  Array.prototype.slice.call(d.querySelectorAll("b,strong,i,em,s,del,strike,u,ins,span,a,font,mark,small")).reverse().forEach(function(el){
    if(!el.parentNode||el.closest('code,pre,[contenteditable="false"]')) return;
    var f=el.firstChild, m=f&&f.nodeType===3&&/^\s+/.exec(f.nodeValue);
    if(m){ el.parentNode.insertBefore(document.createTextNode(m[0]),el); f.nodeValue=f.nodeValue.slice(m[0].length); if(!f.nodeValue) el.removeChild(f); n++; }
    var l=el.lastChild, k=l&&l.nodeType===3&&/\s+$/.exec(l.nodeValue);
    if(k){ el.parentNode.insertBefore(document.createTextNode(k[0]),el.nextSibling); l.nodeValue=l.nodeValue.slice(0,l.nodeValue.length-k[0].length); if(!l.nodeValue) el.removeChild(l); n++; } });
  return n; }
/* Two bold runs with only white space between them were joined into one by the serializer, a line break and all —
   "**PROMO**" over "**Diskon**" was saved as "**PROMODiskon**". A mark after each bold run keeps them apart; once the
   text is written, runs that touch are one run and the mark goes. */
function dfBoldEnds(d){ var n=0;
  Array.prototype.slice.call(d.querySelectorAll("b,strong,span")).forEach(function(el){ var t=el.tagName.toLowerCase(), st=dfStyle(el);
    if(!((t==="b"||t==="strong")&&!/font-weight:\s*(normal|[1-5]00)/.test(st)||t==="span"&&/font-weight:\s*(bold|[6-9]00)/.test(st))) return;
    el.parentNode.insertBefore(document.createTextNode("\uE0F3"),el.nextSibling); n++; });
  return n; }
function dfBoldJoin(md){ return md.replace(/(^|[^*])\*\*\uE0F3\*\*(?!\*)/g,"$1").replace(/\uE0F3/g,""); }
/* Underline is written <u>…</u>, as text put in after the typing was marked, so it is never escaped. Inside a link it
   is the link's own look, not the writer's. Across a line break or a block, each run of words is underlined on its
   own line: the text is read a line at a time. */
function dfUnderlined(el){ var t=el.tagName.toLowerCase(); return t==="u"||t==="ins"||/text-decoration(?:-line)?\s*:[^;]*underline/.test(dfStyle(el)); }
function dfUnderline(d,paste){ var n=0;
  Array.prototype.slice.call(d.querySelectorAll("*")).forEach(function(el){
    if(/^a$/i.test(el.tagName)||!dfUnderlined(el)||el.closest('a,code,pre,[data-df-u],[contenteditable="false"]')) return;
    el.setAttribute("data-df-u","1");
    var runs=!!el.querySelector("a,br,img,hr,p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,blockquote,pre,table,tr")||!paste&&/\n/.test(el.textContent);
    if(!runs){ if(!el.textContent.trim()) return; el.insertBefore(document.createTextNode("<u>"),el.firstChild); el.appendChild(document.createTextNode("</u>")); n++; return; }
    var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null), nodes=[], t; while((t=w.nextNode())) nodes.push(t);
    nodes.forEach(function(tn){ if(tn.parentNode.closest('a,code,pre,[contenteditable="false"]')) return;
      /* typed, a line break in the text is one too; pasted, it is only spacing */
      var parts=paste?[tn.nodeValue]:tn.nodeValue.split("\n");
      var v=parts.map(function(part){ return part.replace(/^(\s*)([\s\S]*?)(\s*)$/,function(all,a,core,b){ return core?a+"<u>"+core+"</u>"+b:all; }); }).join("\n");
      if(v!==tn.nodeValue){ tn.nodeValue=v; n++; } }); });
  return n; }
function dfPrepare(html,paste){
  if(!html||typeof document==="undefined"||String(html).indexOf("<")<0) return {html:html,pre:0};
  var d=document.createElement("div"); d.innerHTML=html; var n=0, pre=0;
  if(paste&&/mso-list/i.test(html)) n+=dfWordLists(d);
  if(paste) n+=dfBlockGaps(d);
  n+=dfSupSub(d)+dfStrikeSpans(d); pre=dfBlocksAsText(d,paste); n+=pre+dfSpaceOut(d)+dfUnderline(d,paste)+dfBoldEnds(d);
  return {html:n?d.innerHTML:html,pre:paste&&pre}; }
/* the text as written, the marks above gone */
function dfFinish(md,pre){ md=String(md==null?"":md); if(pre) md=md.replace(/\uE0F0/g," ").replace(/\uE0F1/g,"\t"); return md.indexOf("\uE0F3")<0?md:dfBoldJoin(md); }

/* ---------- the way out: <u>…</u> in the text (it reaches the reader escaped) is underline ---------- */
function dfUnderlineIn(s){ s=String(s==null?"":s); if(s.indexOf("&lt;u&gt;")<0) return s;
  /* not in code, which shows what it holds */
  var keep=[]; s=s.replace(/`[^`\n]+`/g,function(m){ keep.push(m); return "\u000e"+(keep.length-1)+"\u000f"; });
  s=s.replace(/&lt;u&gt;((?:(?!&lt;\/?u&gt;)[^\n])+?)&lt;\/u&gt;/g,"<u>$1</u>");
  return keep.length?s.replace(/\u000e(\d+)\u000f/g,function(m,i){ return keep[+i]; }):s; }

/* ---------- plain text with formatting marks, pasted ---------- */
var DF_MARKDOWN=[/\*\*[^\s*][^\n]*?\*\*/, /__[^\s_][^\n]*?__/, /~~[^\s~][^\n]*?~~/, /^ {0,3}#{1,6}[ \t]+\S/m, /\[[^\]\n]+\]\((?:https?|ftp):\/\/[^\s)]+\)/, /^ {0,3}```[\w+#.-]*[ \t]*$/m];
function dfIsMarkdown(text){ return DF_MARKDOWN.some(function(re){ return re.test(text); }); }
/* what a mark may stand next to and still open or close: an end, a space, punctuation, a symbol, a kept piece */
var DF_EDGE=/[\s\p{P}\p{S}\uE000\uE001]/u;
/* Markdown: * and _ once, twice or three times (italic, bold, both), ~~ struck; WhatsApp: *bold*, _italic_, ~struck~ */
function dfTags(ch,r,md){
  if(!md) return ch==="*"?["<strong>","</strong>"]:ch==="_"?["<em>","</em>"]:["<del>","</del>"];
  if(ch==="~") return ["<del>","</del>"];
  return r===1?["<em>","</em>"]:r===2?["<strong>","</strong>"]:["<strong><em>","</em></strong>"]; }
function dfRunOk(ch,r,md){ return md?(ch==="~"?r===2:r<=3):r===1; }
/* the first mark that opens and has a mark to close it; what is inside, and what follows, read the same way */
function dfEmph(s,md,hit,text){
  for(var i=0;i<s.length;i++){
    var ch=s.charAt(i); if(ch!=="*"&&ch!=="_"&&ch!=="~"||i&&s.charAt(i-1)===ch) continue;
    var r=1; while(s.charAt(i+r)===ch) r++;
    var after=s.charAt(i+r), before=i?s.charAt(i-1):"";
    if(!dfRunOk(ch,r,md)||!after||/\s/.test(after)||(!md||ch==="_")&&before&&!DF_EDGE.test(before)){ i+=r-1; continue; }
    for(var j=i+r+1;j<s.length;j++){
      if(s.charAt(j)!==ch||s.charAt(j-1)===ch) continue;
      var rr=1; while(s.charAt(j+rr)===ch) rr++;
      var nx=s.charAt(j+rr);
      if(rr!==r||/\s/.test(s.charAt(j-1))||nx&&!DF_EDGE.test(nx)){ j+=rr-1; continue; }
      hit.n++; var tags=dfTags(ch,r,md);
      return text(s.slice(0,i))+tags[0]+dfEmph(s.slice(i+r,j),md,hit,text)+tags[1]+dfEmph(s.slice(j+r),md,hit,text);
    }
    i+=r-1;
  }
  return text(s); }
/* code, a backslash escape (Markdown only), [a link](https://…) and a bare address are kept whole; the rest is read for
   its marks; every character is escaped */
var DF_PIECES=/\\([!-\/:-@\[-`{-~])|(?<!`)(`{1,3})(?!`)([^\n]+?)(?<!`)\2(?!`)|\[([^\]\n]+)\]\(((?:https?|ftp):\/\/[^\s)]+)\)|(?:https?|ftp):\/\/[^\s<>]*[^\s<>.,;:!?)\]'"*_~]|www\.[^\s<>]*[^\s<>.,;:!?)\]'"*_~]/g;
function dfInline(s,md,hit){
  var keep=[], put=function(h){ keep.push(h); return "\uE000"+(keep.length-1)+"\uE001"; };
  var text=function(t){ return esc(t).replace(/\uE000(\d+)\uE001/g,function(m,i){ return keep[+i]; }); };
  s=String(s).replace(DF_PIECES,function(all,escd,tick,code,label,url){
    if(escd!==undefined){ if(!md) return all; hit.n++; return put(esc(escd)); }
    if(tick){ hit.n++; if(/^ [\s\S]*\S[\s\S]* $/.test(code)) code=code.slice(1,-1); return put("<code>"+esc(code)+"</code>"); }
    if(label!==undefined){ if(!md) return all; hit.n++; var inner=dfInline(label,md,hit);
      if(/</.test(inner)&&typeof isGoogleLink==="function"&&isGoogleLink(url)) inner=esc(label);
      return put(descLinkHtml(esc(url),inner)); }
    return put(esc(all)); });
  return dfEmph(s,md,hit,text); }
/* Plain text as the editor's HTML, in the shapes descMdHtml draws: a block per line, lists, quotes, headings, code;
   "" when nothing in it is formatting. One line goes into the line, as a pasted page's line does. */
function descMarkedTextHtml(text){
  var src=String(text==null?"":text).replace(/\r\n?/g,"\n").replace(/[\uE000\uE001]/g,"").replace(/\n+$/,""); if(!src.trim()) return "";
  var md=dfIsMarkdown(src), lines=src.split("\n"), out=[], list=null, code=null, hit={n:0};
  var close=function(){ if(list){ out.push("</"+list+">"); list=null; } }, inl=function(s){ return dfInline(s,md,hit); };
  var fence=function(){ out.push("<pre><code>"+code.map(esc).join("\n")+"</code></pre>"); code=null; };
  lines.forEach(function(l){ var m;
    if(code!==null){ if(/^ {0,3}```[ \t]*$/.test(l)) fence(); else code.push(l); return; }
    if(md&&/^ {0,3}```[\w+#.-]*[ \t]*$/.test(l)){ close(); code=[]; hit.n++; return; }
    if(md&&(m=/^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(l))){ close(); var h=Math.min(m[1].length,3)+2; out.push("<h"+h+">"+inl(m[2])+"</h"+h+">"); hit.n++; return; }
    if(md&&/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(l)){ close(); out.push("<hr>"); hit.n++; return; }
    if((m=(md?/^\s*[-*+•][ \t]+(.*)$/:/^\s*[-*•][ \t]+(.*)$/).exec(l))){ if(list!=="ul"){ close(); out.push("<ul>"); list="ul"; } out.push("<li>"+inl(m[1])+"</li>"); hit.n++; return; }
    if((m=/^\s*\d{1,3}[.)][ \t]+(.*)$/.exec(l))){ if(list!=="ol"){ close(); out.push("<ol>"); list="ol"; } out.push("<li>"+inl(m[1])+"</li>"); hit.n++; return; }
    close();
    if((m=/^ {0,3}>(?:[ \t]+(.*))?$/.exec(l))){ out.push("<blockquote>"+inl(m[1]||"")+"</blockquote>"); hit.n++; return; }
    out.push(l.trim()?"<div>"+inl(l)+"</div>":"<div><br></div>"); });
  if(code!==null) fence(); close();
  if(!hit.n) return "";
  var html=out.join(""); return lines.length===1?html.replace(/^<div>([\s\S]*)<\/div>$/,"$1"):html; }

(function(){
  if(typeof descHtmlToMd==="function"){ var save=descHtmlToMd;
    descHtmlToMd=function(html,opts){ var r=dfPrepare(html,!!(opts&&opts.paste)); return dfFinish(save.call(this,r.html,opts),r.pre); }; }
  if(typeof descMdInline==="function"){ var inline=descMdInline; descMdInline=function(s){ return inline.call(this,dfUnderlineIn(s)); }; }
})();
</script>
