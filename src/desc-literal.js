<script>
/* ============================================================
   WHAT IS TYPED IS WHAT IS SHOWN (Oct 2026)
   The description and the progress note keep their writing as Markdown, and read it back as Markdown — so text typed
   or pasted as text changed on the way: "5 * 3 * 2" came back with " 3 " in italics, "# Promo" as a heading, "- item"
   and "1. item" as lists, "> kutipan" as a quote, `x` as code. Formatting chosen with the toolbar (bold, italic,
   strike, a heading, a list, a quote, a link) is what Markdown is for; the characters a person typed are not.
   So on the way in, a typed character that Markdown would read as formatting is written with a backslash before it,
   the usual Markdown escape (\*, \_, \#, \>, \-, 1\.) — only where it would otherwise change something, so
   "file_name_v2" and "C:\Users" stay as they are — and on the way out a backslash-escaped character is shown as itself.
   Plain text pasted into either editor is taken the same way, and the description's paste is handled again (it was
   lost when the editor became a WYSIWYG one). Readers of the plain text (search, AI Hub's brief) drop the backslashes.
   Loaded after every other wrapper of the two (src/ref-chips.js above all): it marks what a person typed before any
   chip is turned into its token, so a task or project chip is never taken for typing.
   ============================================================ */
var DL_CHARS="\\*_~`[]#>-+.)!|";
var DL_IN={}, DL_OUT={};
(function(){ for(var i=0;i<DL_CHARS.length;i++){ var c=DL_CHARS.charAt(i); DL_IN[c]=String.fromCharCode(0xE100+i); DL_OUT[String.fromCharCode(0xE100+i)]=c; } })();
var DL_ANY=new RegExp("["+Object.keys(DL_OUT).join("")+"]","g");
var DL_ESC_RE=/\\([\\*_~`\[\]#>\-+.)!|])/g;   /* a backslash before one of these is an escape */
/* a typed text's special characters as placeholders, so the serializer passes them through untouched */
function dlMark(text){ var out=""; for(var i=0;i<text.length;i++){ var c=text.charAt(i); out+=DL_IN[c]||c; } return out; }
/* placeholders back to characters: escaped only where Markdown would otherwise read them */
function dlFinish(md){
  var lines=String(md).split("\n");
  return lines.map(function(line){
    var out="", started=false;
    for(var i=0;i<line.length;i++){
      var ch=line.charAt(i), c=DL_OUT[ch];
      if(!c){ out+=ch; if(!/\s/.test(ch)) started=true; continue; }
      var prev=i?(DL_OUT[line.charAt(i-1)]||line.charAt(i-1)):"", next=i+1<line.length?(DL_OUT[line.charAt(i+1)]||line.charAt(i+1)):"", lead=!started;
      var esc=false;
      if(c==="*"||c==="`") esc=true;
      else if(c==="\\") esc=DL_CHARS.indexOf(next)>=0;
      else if(c==="_") esc=!(/[\p{L}\p{N}]/u.test(prev)&&/[\p{L}\p{N}]/u.test(next));
      else if(c==="~") esc=prev==="~"||next==="~";
      else if(c==="[") esc=false;
      else if(c==="]") esc=next==="(";
      else if(c==="!") esc=next==="[";
      else if(c==="#"||c===">") esc=lead;
      else if(c==="-"||c==="+") esc=lead&&(next===" "||next==="-"&&c==="-");
      else if(c==="."||c===")") esc=/^\s*\d+$/.test(out)&&(next===" "||next==="");
      else if(c==="|") esc=false;
      out+=(esc?"\\":"")+c; started=true;
    }
    return out;
  }).join("\n");
}
/* text, as Markdown that reads back as exactly that text */
function dlLiteral(text){ return dlFinish(dlMark(String(text==null?"":text))); }
/* Markdown's escapes, dropped: what a reader of the plain text sees */
function descPlainText(md){ return String(md==null?"":md).replace(DL_ESC_RE,"$1"); }

/* the way in: the editor's writing, every typed character marked, then serialized */
function dlMarkHtml(html){
  if(!html||typeof document==="undefined") return html;
  var d=document.createElement("div"); d.innerHTML=html; var n=0;
  var walker=document.createTreeWalker(d,NodeFilter.SHOW_TEXT,null), nodes=[], t;
  while((t=walker.nextNode())) nodes.push(t);
  nodes.forEach(function(node){ var p=node.parentNode; if(p&&p.closest&&p.closest("code,pre")) return;
    /* a link that reads as its own address: its words are the address, not typing */
    if(p&&p.closest&&p.closest("a")&&/^(https?:|ftp:|www.)/i.test(String(node.nodeValue).trim())) return; var v=node.nodeValue, m=dlMark(v); if(m!==v){ node.nodeValue=m; n++; } });
  return n?d.innerHTML:html;
}
/* the way out: each escaped character kept as itself through the reader, shown as itself */
function dlProtect(md){ return String(md==null?"":md).replace(/\\\\|\\([*_~`\[\]#>\-+.)!|])/g,function(all,c){ return c?DL_IN[c]:DL_IN["\\"]; }); }
function dlRestoreHtml(html){ return String(html).replace(DL_ANY,function(ch){ var c=DL_OUT[ch]; return c===">"?"&gt;":c; }); }

(function(){
  if(typeof descHtmlToMd==="function"){ var save=descHtmlToMd; descHtmlToMd=function(html,opts){ return dlFinish(save.call(this,dlMarkHtml(html),opts)); }; }
  if(typeof descMdHtml==="function"){ var view=descMdHtml; descMdHtml=function(src){ return dlRestoreHtml(view.call(this,dlProtect(src))); }; }
  /* Pasted text is text: the browser puts it where the caret is, and saving takes it as typed. Pasted HTML (a page,
     Google Docs, Word) keeps its formatting, not its fonts and colours, and its characters as typed; one line of it
     goes into the line, not onto a new one. */
  function dlPasteHtml(e,after){ var cd=e.clipboardData; if(!cd) return; if(cd.files&&cd.files.length) return; var html=cd.getData("text/html"); if(!html) return;
    var md=descHtmlToMd(html,{paste:true}); if(!md) return; e.preventDefault();
    var h=descMdHtml(md); if(md.indexOf("\n")<0) h=h.replace(/^<div>([\s\S]*)<\/div>$/,"$1");
    document.execCommand("insertHTML",false,h); if(typeof after==="function") after(); }
  descPaste=function(e){ dlPasteHtml(e,typeof descWysiwygInput==="function"?descWysiwygInput:null); };
  if(typeof pnPaste==="function") pnPaste=function(e){ dlPasteHtml(e,typeof pnInput==="function"?pnInput:null); };
  /* the description's paste, handled again: the editor lost its onpaste when it became a WYSIWYG one */
  if(typeof document!=="undefined") document.addEventListener("paste",function(e){ var el=e.target&&e.target.closest?e.target.closest("#descSrc"):null; if(!el||e.defaultPrevented) return; descPaste(e); });
})();
</script>
