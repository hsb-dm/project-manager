<script>
/* GOOGLE LINKS AS CHIPS, WHILE WRITING TOO.

   A Google link shows as a chip — the Drive mark and the file's or folder's own name (driveChipHtml
   in comment-attach.js) — in comments, chat and the description. In the comment and chat boxes a
   pasted link turns into its name at once (link-tab.js). In the description editor it turns into
   the chip itself, right where it was pasted, the way Trello does it: the chip is one piece, so
   Backspace takes it away whole and the caret steps over it, and the name fills in once read.
   Saving writes the link back (descHtmlToMd, data-auto), never the name that was looked up.

   Hovering a chip — anywhere — opens a small card: the name, what it is, and Open preview (for what
   has an official embed, src/version-preview.js), Open link and Copy link. */

/* ---------- the description editor ---------- */
function lcGoogleUrls(text){ var re=/https:\/\/(?:drive|docs)\.google\.com\/[^\s<>"']+/g, out=[], m; while((m=re.exec(text))){ var u=m[0].replace(/[.,;:!?)\]]+$/,""); if(isGoogleLink(u)) out.push({url:u,index:m.index}); } return out; }
function lcChipNode(url){ var t=document.createElement("span"); t.innerHTML=descLinkHtml(esc(url),""); return t.firstChild; }
/* Turn the Google links in the editor into chips: a bare link in the text, or a link whose text is
   its own address or a stand-in like "Google Drive". The caret, if it was in or after a link that
   turned, lands just after its chip. Returns whether anything turned. */
function descChipify(root){
  if(!root||typeof descLinkHtml!=="function"||typeof isGoogleLink!=="function") return false;
  var sel=window.getSelection(), caret=sel&&sel.rangeCount&&root.contains(sel.anchorNode)?{node:sel.anchorNode,off:sel.anchorOffset}:null, after=null, changed=false;
  Array.prototype.forEach.call(root.querySelectorAll("a[href]:not(.drive-chip)"),function(a){
    var href=a.getAttribute("href"), t=a.textContent.trim();
    if(!isGoogleLink(href)||!(t===href||/^https?:/i.test(t)||descStandIn(t))) return;
    var chip=lcChipNode(href); a.parentNode.replaceChild(chip,a); changed=true;
    if(caret&&(caret.node===a||a.contains(caret.node))) after=chip;
  });
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null), nodes=[], n;
  while((n=walker.nextNode())) if(!(n.parentNode&&n.parentNode.closest&&n.parentNode.closest("a"))&&lcGoogleUrls(n.nodeValue).length) nodes.push(n);
  nodes.forEach(function(node){
    var text=node.nodeValue, frag=document.createDocumentFragment(), last=0;
    lcGoogleUrls(text).forEach(function(x){
      if(x.index>last) frag.appendChild(document.createTextNode(text.slice(last,x.index)));
      var chip=lcChipNode(x.url); frag.appendChild(chip);
      var end=x.index+x.url.length;
      if(caret&&caret.node===node&&caret.off>x.index&&caret.off>=end) after=chip;
      last=end;
    });
    var tail=text.slice(last);
    /* something to put the caret in after the chip */
    frag.appendChild(document.createTextNode(tail||" "));
    node.parentNode.replaceChild(frag,node); changed=true;
  });
  if(after&&after.isConnected){
    var next=after.nextSibling; if(!next||next.nodeType!==3){ next=document.createTextNode(" "); after.parentNode.insertBefore(next,after.nextSibling); }
    var r=document.createRange(); r.setStart(next,Math.min(1,next.nodeValue.length)); r.collapse(true);
    if(!/^\s/.test(next.nodeValue)) r.setStart(next,0);
    sel.removeAllRanges(); sel.addRange(r);
  }
  return changed;
}
document.addEventListener("paste",function(e){
  var el=e.target&&e.target.closest?e.target.closest("#descSrc"):null; if(!el) return;
  var text=(e.clipboardData&&(e.clipboardData.getData("text/plain")||e.clipboardData.getData("text/html")))||"";
  if(!/(?:drive|docs)\.google\.com\//i.test(text)) return;
  setTimeout(function(){ var live=document.getElementById("descSrc"); if(live&&descChipify(live)&&typeof descWysiwygInput==="function") descWysiwygInput(); },0);
});

/* ---------- the card on a chip ---------- */
var LINK_CARD={el:null,chip:null,show:null,hide:null};
function linkCardClose(){ clearTimeout(LINK_CARD.show); clearTimeout(LINK_CARD.hide); if(LINK_CARD.el) LINK_CARD.el.classList.remove("open"); LINK_CARD.chip=null; }
function linkCardOpen(chip){
  var url=chip.getAttribute("href"); if(!url) return;
  var p=typeof detectProvider==="function"?detectProvider(url):null, s=chip.querySelector("span"), name=(s?s.textContent:chip.textContent).trim();
  var kind=p&&typeof smartSubtitle==="function"?tr(smartSubtitle(p)):"", e=typeof embedFor==="function"?embedFor(url):null;
  var el=LINK_CARD.el;
  if(!el){
    el=LINK_CARD.el=document.createElement("div"); el.className="link-card"; el.setAttribute("role","dialog");
    el.addEventListener("mouseenter",function(){ clearTimeout(LINK_CARD.hide); });
    el.addEventListener("mouseleave",function(){ LINK_CARD.hide=setTimeout(linkCardClose,220); });
    document.body.appendChild(el);
  }
  el.setAttribute("aria-label",name);
  el.innerHTML='<div class="lc-head">'+(typeof driveIcon==="function"?driveIcon():I.link)+'<b>'+esc(name)+'</b></div>'+(kind?'<div class="lc-kind">'+esc(kind)+'</div>':'')
    + '<div class="lc-acts">'
    + (e?'<button type="button" data-act="preview">'+I.eye+tr("Open preview")+'</button>':'')
    + '<button type="button" data-act="open">'+I.ext+tr("Open link")+'</button>'
    + '<button type="button" data-act="copy">'+I.link+tr("Copy link")+'</button></div>';
  el.onclick=function(ev){
    var b=ev.target.closest&&ev.target.closest("button[data-act]"); if(!b) return;
    var act=b.getAttribute("data-act"); linkCardClose();
    if(act==="preview") previewModal({title:name,name:name,url:url});
    else if(act==="open") openExternal(url);
    else (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(url):Promise.reject()).then(function(){ toast(tr("Link copied")); },function(){ prompt(tr("Copy link"),url); });
  };
  LINK_CARD.chip=chip; el.classList.add("open");
  if(typeof place==="function") place(el,chip);
}
/* hover only where there is hover; a tap on a phone opens the link as before */
if(window.matchMedia&&window.matchMedia("(hover: hover)").matches){
  document.addEventListener("mouseover",function(ev){
    var chip=ev.target&&ev.target.closest?ev.target.closest(".drive-chip"):null;
    if(!chip){ return; }
    clearTimeout(LINK_CARD.hide);
    if(LINK_CARD.chip===chip) return;
    clearTimeout(LINK_CARD.show); LINK_CARD.show=setTimeout(function(){ if(chip.isConnected&&chip.matches(":hover")) linkCardOpen(chip); },350);
  });
  document.addEventListener("mouseout",function(ev){
    var chip=ev.target&&ev.target.closest?ev.target.closest(".drive-chip"):null; if(!chip) return;
    if(ev.relatedTarget&&chip.contains(ev.relatedTarget)) return;
    clearTimeout(LINK_CARD.show); LINK_CARD.hide=setTimeout(linkCardClose,220);
  });
  document.addEventListener("scroll",function(){ if(LINK_CARD.chip) linkCardClose(); },true);
}

Object.assign(UI_ID,{"Open preview":"Buka pratinjau"});
</script>
