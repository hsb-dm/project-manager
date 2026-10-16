<script>
/* ============================================================
   A FONT, THEN ITS STYLE (Oct 2026)
   Choosing a font in AI Hub was one long list: every uploaded file its own entry (Stolzl Regular, Stolzl Bold,
   Stolzl Book…) beside the workspace's Google fonts, with no way to ask for a Google font's Light or SemiBold. Now
   the family comes first, then its style:
   • a brand font's files are grouped by the family their names say ("Stolzl Bold" → Stolzl, Bold; "Gilroy Black
     Italic" → Gilroy, Black Italic); a name that says no style is a family of its own, Regular. Each style is still
     its own file (src/brand-fonts.js), so what is stored is unchanged: the file's name;
   • a Google font offers the weights Google really has for it — asked for every weight, the list is what came
     back (document.fonts); a font Google does not have (a system one) offers Regular and Bold.
   What a design keeps is the same as before — a font name — plus the weight: AIF.headlineWeight, AIF.subWeight,
   a text layer's weight, and a template's headlineWeight / subWeight.
   ============================================================ */
var FONT_STYLE_WORDS=[[/^(thin|hairline)$/i,100],[/^(extra|ultra)\s?light$/i,200],[/^light$/i,300],[/^book$/i,350],[/^(regular|normal|roman)$/i,400],[/^medium$/i,500],[/^(semi|demi)\s?bold$/i,600],[/^bold$/i,700],[/^(extra|ultra)\s?bold$/i,800],[/^(black|heavy)$/i,900]];
var FONT_WEIGHT_NAMES={100:"Thin",200:"ExtraLight",300:"Light",400:"Regular",500:"Medium",600:"SemiBold",700:"Bold",800:"ExtraBold",900:"Black"};
var FONT_ALL_WEIGHTS=[100,200,300,400,500,600,700,800,900];
/* what a font file's name says: its family, its weight, italic or not, and the style as written */
function fontFaceParts(name){
  var t=String(name||"").trim().split(/\s+/), italic=false, weight=null, label="";
  var match=function(s){ for(var i=0;i<FONT_STYLE_WORDS.length;i++) if(FONT_STYLE_WORDS[i][0].test(s)) return FONT_STYLE_WORDS[i][1]; return null; };
  if(t.length>1&&/^(italic|oblique)$/i.test(t[t.length-1])){ italic=true; t.pop(); }
  if(t.length>2){ var w2=match(t[t.length-2]+" "+t[t.length-1]); if(w2!==null){ weight=w2; label=t.splice(t.length-2,2).join(" "); } }
  if(weight===null&&t.length>1){ var w1=match(t[t.length-1]); if(w1!==null){ weight=w1; label=t.pop(); } }
  if(weight===null) weight=400;
  return {family:t.join(" "),weight:weight,italic:italic,label:((label||(italic?"":"Regular"))+(italic?" Italic":"")).trim()};
}

/* ---------- a Google font's weights, as Google has them ---------- */
var FONT_WEB={};
function fontWebLoad(name){
  if(!name||FONT_WEB[name]||typeof document==="undefined") return;
  var rec=FONT_WEB[name]={state:"loading",weights:[]};
  try{
    var link=document.createElement("link"); link.rel="stylesheet"; link.setAttribute("data-font-family",name);
    /* the first CSS API leaves out a weight a family does not have; the second refuses the whole request */
    link.href="https://fonts.googleapis.com/css?family="+encodeURIComponent(name).replace(/%20/g,"+")+":"+FONT_ALL_WEIGHTS.join(",")+"&display=swap";
    link.onload=function(){ rec.state="ok"; rec.weights=fontWeightsInDocument(name); fontWebChanged(); };
    link.onerror=function(){ rec.state="none"; fontWebChanged(); };
    document.head.appendChild(link);
  }catch(e){ rec.state="none"; }
}
function fontWeightsInDocument(name){
  var seen={}; try{ document.fonts.forEach(function(f){ if(String(f.family).replace(/^["']|["']$/g,"")!==name) return; String(f.weight).split(/\s+/).forEach(function(w){ w=+w; if(w>=1&&w<=1000) seen[Math.round(w/100)*100||100]=1; }); }); }catch(e){}
  return Object.keys(seen).map(Number).sort(function(a,b){ return a-b; });
}
/* the style list follows the weights once they are known: the open panel is drawn again, nothing else */
var FONT_WEB_T=null;
function fontWebChanged(){ clearTimeout(FONT_WEB_T); FONT_WEB_T=setTimeout(function(){ if(typeof S!=="undefined"&&S.screen==="aihub"&&typeof aiRefreshProperties==="function"&&document.querySelector(".ai-props .fp-family")) aiRefreshProperties(); fontPickRefreshAll(); },60); }
function fontWebWeights(name){
  fontWebLoad(name);
  var rec=FONT_WEB[name]||{}, w=rec.state==="ok"&&rec.weights.length?rec.weights:fontWeightsInDocument(name);
  return w.length?w:rec.state==="loading"?[400,500,600,700]:[400,700];
}

/* ---------- the families on offer ---------- */
function fontFamilies(){
  var out=[], byKey={}, uploaded={};
  (typeof aiUploadedFonts==="function"?aiUploadedFonts():[]).forEach(function(f){
    uploaded[f.name]=1;
    var p=fontFaceParts(f.name), key="u:"+p.family.toLowerCase(), fam=byKey[key];
    if(!fam){ fam=byKey[key]={key:key,name:p.family,brand:true,styles:[]}; out.push(fam); }
    fam.styles.push({value:f.name,label:p.label,weight:p.weight,italic:p.italic});
  });
  out.forEach(function(f){ f.styles.sort(function(a,b){ return a.weight-b.weight||(a.italic?1:0)-(b.italic?1:0); }); });
  (typeof aiWorkspaceFonts==="function"?aiWorkspaceFonts():[]).forEach(function(n){
    if(uploaded[n]||byKey["g:"+n.toLowerCase()]) return;
    out.push(byKey["g:"+n.toLowerCase()]=fontWebFamily(n));
  });
  return out;
}
function fontWebFamily(n){ return {key:"g:"+n.toLowerCase(),name:n,brand:false,styles:fontWebWeights(n).map(function(w){ return {value:String(w),label:FONT_WEIGHT_NAMES[w]||String(w),weight:w}; })}; }
/* the family a stored font name belongs to, and which of its styles it is */
function fontFind(font,weight){
  var fams=fontFamilies(), w=+weight||400;
  if(font){
    for(var i=0;i<fams.length;i++){ var f=fams[i];
      if(f.brand){ for(var j=0;j<f.styles.length;j++) if(f.styles[j].value===font) return {fam:f,style:f.styles[j]}; }
      else if(f.name===font) return {fam:f,style:fontNearest(f.styles,w)};
    }
    var gone=fontWebFamily(font); return {fam:gone,style:fontNearest(gone.styles,w),missing:true};
  }
  return {fam:null,style:null};
}
function fontNearest(styles,w,italic){
  var best=null; (styles||[]).forEach(function(s){ var d=Math.abs(s.weight-w)+((!!s.italic)!==(!!italic)?1000:0); if(!best||d<best.d) best={s:s,d:d}; });
  return best?best.s:null;
}

/* ---------- the picker: a family, then its style ----------
   Two selects and the values they stand for, tied by data-fp. A target ("headline", "sub", "x:<id>") applies the
   choice to the design at once; without one (the template editor) the hidden inputs are read on Save:
   <id>_font and <id>_weight. The empty family is the workspace's font, whose styles are offered. */
var FONT_PICK_N=0;
function fontPickerParts(o){
  var uid="fp"+(++FONT_PICK_N), found=fontFind(o.font,o.weight), fams=fontFamilies();
  var cur=found.fam, base=cur||fontWebFamily(o.defaultFamily||"Poppins"), style=found.style||fontNearest(base.styles,+o.weight||o.defaultWeight||400);
  var weight=style?style.weight:(+o.weight||o.defaultWeight||400);
  var dis=o.disabled?" disabled":"", data=' data-fp="'+uid+'"'+(o.target?' data-target="'+attr(o.target)+'"':'')+' data-default="'+attr(o.defaultFamily||"Poppins")+'"';
  var brand=fams.filter(function(f){ return f.brand; }), web=fams.filter(function(f){ return !f.brand; });
  if(found.missing) web=web.concat([cur]);
  var opt=function(f){ return '<option value="'+attr(f.key)+'"'+(cur&&cur.key===f.key?" selected":"")+'>'+esc(f.name)+'</option>'; };
  var family='<select class="ai-prop-select fp-family"'+data+' aria-label="'+attr(tr(o.label||"Font"))+'" onchange="fontPickFamily(this)"'+dis+'>'
    + '<option value=""'+(cur?"":" selected")+'>'+esc(tr(o.placeholder||"Workspace font"))+'</option>'
    + (brand.length?'<optgroup label="'+attr(tr("Brand fonts"))+'">'+brand.map(opt).join("")+'</optgroup>':'')
    + '<optgroup label="'+attr(tr("Fonts"))+'">'+web.map(opt).join("")+'</optgroup></select>';
  var styles='<select class="ai-prop-select fp-style"'+data+' aria-label="'+attr(tr("Font style"))+'" onchange="fontPickStyle(this)"'+dis+'>'+fontStyleOptions(base,style)+'</select>';
  var hidden=o.id?'<input type="hidden" id="'+attr(o.id)+'_font" data-fp-font="'+uid+'" value="'+attr(o.font||"")+'"><input type="hidden" id="'+attr(o.id)+'_weight" data-fp-weight="'+uid+'" value="'+attr(o.weight?String(weight):"")+'">':'';
  return {family:family,style:styles,hidden:hidden,uid:uid};
}
function fontStyleOptions(fam,style){ return (fam?fam.styles:[]).map(function(s){ return '<option value="'+attr(s.value)+'"'+(style&&style.value===s.value?" selected":"")+'>'+esc(tr(s.label))+'</option>'; }).join(""); }
/* one block: the family over its style, for a form */
function fontPickerHtml(o){ var p=fontPickerParts(o); return '<div class="font-pick">'+p.family+p.style+p.hidden+'</div>'; }
function fontPickEls(el){ var uid=el.getAttribute("data-fp"); return {family:document.querySelector('.fp-family[data-fp="'+uid+'"]'),style:document.querySelector('.fp-style[data-fp="'+uid+'"]')}; }
function fontPickFamily(sel){
  var els=fontPickEls(sel), key=sel.value, fams=fontFamilies(), fam=null;
  for(var i=0;i<fams.length;i++) if(fams[i].key===key) fam=fams[i];
  if(!fam&&key.indexOf("g:")===0) fam=fontWebFamily(sel.options[sel.selectedIndex].text);
  var before=fontPickCurrent(els), base=fam||fontWebFamily(sel.getAttribute("data-default")||"Poppins");
  var style=fontNearest(base.styles,before.weight,before.italic);
  if(els.style) els.style.innerHTML=fontStyleOptions(base,style);
  fontPickApply(sel,fam?(fam.brand?style.value:fam.name):"",style?style.weight:before.weight);
}
function fontPickStyle(sel){
  var els=fontPickEls(sel), key=els.family?els.family.value:"", fams=fontFamilies(), fam=null;
  for(var i=0;i<fams.length;i++) if(fams[i].key===key) fam=fams[i];
  var base=fam||fontWebFamily(key?els.family.options[els.family.selectedIndex].text:(sel.getAttribute("data-default")||"Poppins")), style=null;
  base.styles.forEach(function(s){ if(s.value===sel.value) style=s; });
  if(!style) return;
  fontPickApply(sel,fam?(fam.brand?style.value:fam.name):"",style.weight);
}
/* the weight and slant chosen now, to keep across a change of family */
function fontPickCurrent(els){
  var w=400, it=false, s=els.style;
  if(s&&s.options.length){ var t=s.options[s.selectedIndex]; var p=fontFaceParts("X "+t.text); w=isFinite(+s.value)&&+s.value>0?+s.value:p.weight; it=p.italic; }
  return {weight:w,italic:it};
}
function fontPickApply(el,font,weight){
  var target=el.getAttribute("data-target")||"", uid=el.getAttribute("data-fp");
  var hidF=document.querySelector('[data-fp-font="'+uid+'"]'), hidW=document.querySelector('[data-fp-weight="'+uid+'"]');
  if(hidF) hidF.value=font; if(hidW) hidW.value=String(weight||"");
  if(target&&typeof aiFontApply==="function") aiFontApply(target,font,weight);
}
/* a style list drawn while the weights were still on their way, put right in place (the template editor) */
function fontPickRefreshAll(){
  document.querySelectorAll(".fp-family").forEach(function(sel){
    if(sel.closest&&sel.closest(".ai-props")) return;
    var els=fontPickEls(sel); if(!els.style||sel.value.indexOf("u:")===0) return;
    var name=sel.value?sel.options[sel.selectedIndex].text:(sel.getAttribute("data-default")||"Poppins"), base=fontWebFamily(name), cur=fontPickCurrent(els);
    els.style.innerHTML=fontStyleOptions(base,fontNearest(base.styles,cur.weight,cur.italic));
  });
}

/* ---------- AI Hub: the choice, applied ---------- */
function aiFontApply(target,font,weight){
  if(typeof aiHistoryBefore==="function") aiHistoryBefore();
  weight=+weight||null;
  if(target==="headline"){ AIF.headlineFont=font; AIF.headlineWeight=weight; }
  else if(target==="sub"){ AIF.subFont=font; AIF.subWeight=weight; }
  else if(target.indexOf("x:")===0&&typeof aiExtraSet==="function"){ var id=target.slice(2); aiExtraSet(id,"font",font); if(weight) aiExtraSet(id,"weight",weight); }
  fontEnsure(font||null,weight);
  if(typeof aiPreviewSoon==="function") aiPreviewSoon();
}
function aiHeadlineWeight(){ return +AIF.headlineWeight||700; }
function aiSubWeight(){ return +AIF.subWeight||400; }
/* a weight is drawn on the canvas only once the browser has it: asked for, then drawn again */
var FONT_ENSURED={};
function fontEnsure(font,weight){
  var fam=font||(WS&&WS.brand&&WS.brand.headlineFont)||"Poppins", key=fam+"|"+(weight||400);
  if(FONT_ENSURED[key]||typeof document==="undefined"||!document.fonts) return; FONT_ENSURED[key]=1;
  if(!(typeof aiUploadedFontNames==="function"&&aiUploadedFontNames().indexOf(fam)>=0)) fontWebLoad(fam);
  try{ document.fonts.load((weight||400)+' 32px "'+fam.replace(/"/g,"")+'"').then(function(){ if(typeof S!=="undefined"&&S.screen==="aihub"&&typeof aiPreviewSoon==="function") aiPreviewSoon(); }).catch(function(){}); }catch(e){}
}
/* what the design uses, made ready whenever it is drawn */
(function(){ if(typeof aiPreview!=="function") return; var base=aiPreview; aiPreview=function(){ var r=base.apply(this,arguments);
  try{ if(typeof AIF!=="undefined"){ fontEnsure(AIF.headlineFont,aiHeadlineWeight()); fontEnsure(AIF.subFont||(WS.brand&&WS.brand.bodyFont)||null,aiSubWeight()); (AIF.extraLayers||[]).forEach(function(x){ if(x&&x.type==="text") fontEnsure(x.font||null,x.weight||700); }); } }catch(e){}
  return r; }; })();

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"Font style":"Gaya huruf","Brand fonts":"Font brand","Fonts":"Font","Style":"Gaya"});
</script>
