<script>
/* ============================================================
   AI HUB — PROPERTIES PANEL, REBUILT  (v16 §11–§33, v17 §P1-2)

   The previous panel was a single string builder whose output three other
   files re-parsed and re-grouped by regex-matching English label text. That
   is why it drifted: a renamed label silently moved a control to the wrong
   section. This file replaces the property body with a real object inspector.

   What it owns:
     · the reusable control primitives (§69) — one shape for every row
     · the selected-layer header with quick actions (§13)
     · section order per layer type (§29) and collapsible state (§31)
     · px / % for X, Y, W, H, padding and safe area (§17) and a real
       px font size (§22) via an adapter, so the renderer is untouched (§18)
     · icon-first controls and the alignment toolbar (§15, §33)
     · multi-selection (§32) and the empty state (§76)

   What it deliberately does NOT touch: the Layer panel (§34, §18 of the
   v17 audit) — it is considered good and is preserved as built.
   ============================================================ */

/* ---------- persisted section state (§31) ---------- */
var AI_PROP_OPEN = { transform:true, content:true, typography:true, fill:true, size:true,
                     appearance:true, stroke:false, background:false, radius:true,
                     opacity:true, effects:false, advanced:false, safe:true, guides:false, canvasbg:true, export:false };
try { var _po=JSON.parse(localStorage.getItem("cos.ai.props.open")||"null"); if(_po) Object.assign(AI_PROP_OPEN,_po); } catch(e){}
function aipToggleSection(key,open){
  AI_PROP_OPEN[key]=!!open;
  try { localStorage.setItem("cos.ai.props.open",JSON.stringify(AI_PROP_OPEN)); } catch(e){}
}

/* ---------- icons (§15 icon-first) ---------- */
var AIP_ICON = {
  text:'<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="9" cy="9" r="1.4"/>',
  shape:'<rect x="4" y="4" width="16" height="16" rx="3"/>',
  canvas:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:'<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.3A10.7 10.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.7M6.3 6.3A20 20 0 0 0 2 12s4 7 10 7a11 11 0 0 0 5.7-1.7"/>',
  lock:'<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock:'<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  trash:'<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  link:'<path d="M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1"/><path d="M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1"/>',
  unlink:'<path d="M9 12a3 3 0 0 1 3-3h1"/><path d="M15 12a3 3 0 0 1-3 3h-1"/><path d="m3 3 18 18"/>',
  reset:'<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/>',
  flipH:'<path d="M12 3v18M8 7 4 12l4 5zM16 7l4 5-4 5z"/>',
  flipV:'<path d="M3 12h18M7 8l5-4 5 4zM7 16l5 4 5-4z"/>',
  alignLeft:'<path d="M4 3v18M8 7h12v3H8zM8 14h8v3H8z"/>',
  alignCenter:'<path d="M12 3v18M4 7h16v3H4zM7 14h10v3H7z"/>',
  alignRight:'<path d="M20 3v18M4 7h12v3H4zM8 14h8v3H8z"/>',
  alignTop:'<path d="M3 4h18M7 8h3v12H7zM14 8h3v8h-3z"/>',
  alignMiddle:'<path d="M3 12h18M7 4h3v16H7zM14 7h3v10h-3z"/>',
  alignBottom:'<path d="M3 20h18M7 4h3v12H7zM14 8h3v8h-3z"/>',
  textLeft:'<path d="M4 6h16M4 11h10M4 16h13"/>',
  textCenter:'<path d="M4 6h16M7 11h10M5 16h14"/>',
  textRight:'<path d="M4 6h16M10 11h10M7 16h13"/>',
  rotate:'<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
function aipIcon(name,size){
  return '<svg viewBox="0 0 24 24" width="'+(size||16)+'" height="'+(size||16)+'" fill="none" stroke="currentColor" '
    + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(AIP_ICON[name]||AIP_ICON.rotate)+'</svg>';
}

/* ---------- primitives (§69) — every control is one of these ---------- */
function aipEsc(s){ return esc(String(s==null?"":s)); }
/* §72 icon-only controls always carry a tooltip AND an aria-label. */
function aipIconBtn(icon,label,onclick,opts){
  opts=opts||{};
  return '<button type="button" class="ai-prop-iconbtn'+(opts.on?" on":"")+(opts.danger?" danger":"")+'"'
    + (opts.disabled?' disabled':'')
    + ' title="'+attr(tr(label))+(opts.shortcut?" ("+opts.shortcut+")":"")+'" aria-label="'+attr(tr(label))+'"'
    + (opts.pressed!==undefined?' aria-pressed="'+(opts.pressed?"true":"false")+'"':'')
    + ' onclick="'+attr(onclick)+'">'+aipIcon(icon,opts.size)+'</button>';
}
function aipSection(key,title,body,opts){
  opts=opts||{};
  if(!body) return "";
  var open=opts.forceOpen||AI_PROP_OPEN[key];
  return '<details class="ai-prop-section" '+(open?"open":"")+' ontoggle="aipToggleSection(\''+key+'\',this.open)">'
    + '<summary class="ai-prop-section-head"><span class="ai-prop-section-title">'+tr(title)+'</span>'
    + (opts.action||'')+'</summary>'
    + '<div class="ai-prop-section-body">'+body+'</div></details>';
}
function aipRow(label,control,opts){
  opts=opts||{};
  return '<div class="ai-prop-row'+(opts.stack?" stack":"")+'">'
    + (label?'<span class="ai-prop-label"'+(opts.hint?' title="'+attr(tr(opts.hint))+'"':'')+'>'+tr(label)+'</span>':'')
    + '<span class="ai-prop-control">'+control+'</span></div>';
}
/* A number field. `unit` is a static suffix; `unitSelect` renders a live px/% switch. */
function aipNum(opts){
  var o=opts||{};
  return '<span class="ai-prop-number'+(o.wide?" wide":"")+'">'
    + (o.icon?'<span class="ai-prop-affix">'+(o.iconText||aipIcon(o.icon,13))+'</span>':(o.prefix?'<span class="ai-prop-affix">'+aipEsc(o.prefix)+'</span>':''))
    + '<input type="number" value="'+attr(o.value)+'"'
    + (o.min!==undefined?' min="'+o.min+'"':'')+(o.max!==undefined?' max="'+o.max+'"':'')
    + (o.step!==undefined?' step="'+o.step+'"':'')
    + (o.disabled?' disabled':'')
    + ' aria-label="'+attr(tr(o.label||o.prefix||"Value"))+'"'
    + ' oninput="'+attr(o.oninput||"")+'"'
    + (o.onchange?' onchange="'+attr(o.onchange)+'"':'')
    + '>'
    + (o.unit?'<span class="ai-prop-unit">'+aipEsc(o.unit)+'</span>':'')+'</span>';
}
function aipSelect(value,options,onchange,opts){
  opts=opts||{};
  return '<select class="ai-prop-select'+(opts.compact?" compact":"")+'" aria-label="'+attr(tr(opts.label||"Option"))+'"'+(opts.disabled?" disabled":"")
    + ' onchange="'+attr(onchange)+'">'
    + options.map(function(o){
        var v=Array.isArray(o)?o[0]:o, l=Array.isArray(o)?o[1]:o;
        return '<option value="'+attr(v)+'"'+(String(v)===String(value)?" selected":"")+'>'+aipEsc(tr(l))+'</option>'; }).join("")
    + '</select>';
}
/* §73 compact colour control: swatch + hex, one line. */
function aipColor(value,oninput,opts){
  opts=opts||{};
  var v=value||"#000000";
  return '<span class="ai-color-control">'
    + '<input type="color" value="'+attr(v)+'" aria-label="'+attr(tr(opts.label||"Colour"))+'" oninput="'+attr(oninput)+'">'
    + '<span class="ai-color-hex">'+aipEsc(String(v).toUpperCase())+'</span></span>';
}
function aipToggleSwitch(on,onclick,label){
  return '<button type="button" class="switch'+(on?" on":"")+'" role="switch" aria-checked="'+(on?"true":"false")+'"'
    + ' aria-label="'+attr(tr(label||"Toggle"))+'" onclick="'+attr(onclick)+'"></button>';
}
/* §17 a two-option px/% switch for a section header. Labelled with words
   rather than glyphs, because "px" and "%" are already the clearest icons. */
function aipUnitSwitch(current){
  var opt=function(value,label,help){
    var on=current===value;
    return '<button type="button" class="'+(on?"on":"")+'" aria-pressed="'+(on?"true":"false")+'"'
      + ' title="'+attr(tr(help))+'" aria-label="'+attr(tr(help))+'"'
      + ' onclick="event.stopPropagation();aipSetUnit(\'position\',\''+value+'\');aipSetUnit(\'size\',\''+value+'\')">'+label+'</button>'; };
  return '<span class="ai-prop-head-unit" onclick="event.stopPropagation()">'
    + opt("px","px","Show position and size in pixels")
    + opt("percent","%","Show position and size as a percentage of the canvas")
    + '</span>';
}
function aipSegment(items){
  return '<span class="ai-prop-segment">'+items.map(function(it){
    return '<button type="button" class="'+(it.on?"on":"")+'" title="'+attr(tr(it.label))+'" aria-label="'+attr(tr(it.label))+'"'
      + ' aria-pressed="'+(it.on?"true":"false")+'" onclick="'+attr(it.onclick)+'">'+aipIcon(it.icon,15)+'</button>'; }).join("")+'</span>';
}

/* ============================================================
   ADAPTERS (§18) — the UI speaks px; storage keeps its own units,
   so the renderer needs no migration and switching units never moves
   anything on the canvas.
   ============================================================ */
function aipIsExtra(id){ return String(id).indexOf("extra_")===0; }
function aipExtraOf(id){ return aipIsExtra(id)?aiExtra(String(id).slice(6)):null; }
function aipPosObj(id){ return aipIsExtra(id)?aipExtraOf(id):aiLayerPosition(id); }

/* §17 the DISPLAY unit. Storage stays internal (§71 — `offsetUnit` is an
   implementation detail and is never shown as a label). One selector covers
   the whole Transform section rather than one per field. */
function aipUnits(){
  AIF.units=AIF.units||{};
  if(AIF.units.position!=="percent") AIF.units.position="px";
  if(AIF.units.size!=="percent") AIF.units.size="px";
  return AIF.units;
}
function aipSetUnit(kind,unit){
  aipUnits()[kind]=unit==="percent"?"percent":"px";
  aiRefreshProperties();
}
/* px <-> display-unit conversion against the axis the value belongs to */
function aipToDisplay(px,span,unit){
  return unit==="percent" ? +((px/span)*100).toFixed(2) : Math.round(px);
}
function aipFromDisplay(v,span,unit){
  return unit==="percent" ? (+v||0)/100*span : (+v||0);
}
function aipUnitLabel(unit){ return unit==="percent"?"%":"px"; }

/* position, in canvas pixels */
function aipPosPx(id){
  var sz=aiActiveSize(), p=aipPosObj(id)||{x:0,y:0};
  return { x:Math.round(aiOffset(p.x,sz.w)), y:Math.round(aiOffset(p.y,sz.h)) };
}
function aipSetPosPx(id,axis,px){
  var sz=aiActiveSize(), p=aipPosObj(id); if(!p) return;
  if(aiLayerMeta(id).locked) return;
  var span=axis==="x"?sz.w:sz.h;
  p[axis]=(AIF.offsetUnit==="px")?Math.round(+px||0):+(((+px||0)/span)*100).toFixed(3);
  aiPreviewSoon();
}
/* size, in canvas pixels. Only extras carry an explicit size. */
function aipSizePx(id){
  var sz=aiActiveSize(), x=aipExtraOf(id); if(!x) return null;
  var w=x.w==null?null:Math.round((+x.w||0)/100*sz.w);
  var h=x.h==null?null:Math.round((+x.h||0)/100*sz.h);
  return { w:w, h:h };
}
function aipSetSizePx(id,axis,px){
  var sz=aiActiveSize(), x=aipExtraOf(id); if(!x) return;
  if(aiLayerMeta(id).locked) return;
  var span=axis==="w"?sz.w:sz.h;
  var next=Math.max(0.1,Math.min(100,(+px||0)/span*100));
  if(x.aspectLock&&x.w&&x.h){
    var ratio=(+x.h)/(+x.w);
    if(axis==="w"){ x.w=+next.toFixed(3); x.h=+(next*ratio).toFixed(3); }
    else { x.h=+next.toFixed(3); x.w=+(next/ratio).toFixed(3); }
  } else x[axis]=+next.toFixed(3);
  aiPreviewSoon();
}
/* §22 font size in REAL pixels. Built-in layers store a percentage scale, so
   the adapter converts against the size the renderer actually derives. */
function aipFontBasePx(id){
  var sz=aiActiveSize(), unit=Math.min(sz.w,sz.h);
  var h=Math.round(unit*(sz.w>sz.h?0.085:0.072));
  if(id==="headline") return h;
  if(id==="sub") return Math.max(1,Math.round(h*0.4));
  if(id==="cta"||id==="badge") return Math.max(1,Math.round(h*0.34));
  if(id==="disclaimer") return Math.max(11,Math.round(unit*0.016));
  return h;
}
function aipFontPx(id){
  var x=aipExtraOf(id);
  if(x) return Math.round(+x.size||36);
  return Math.round(aipFontBasePx(id)*(aiLayerScale(id)/100));
}
function aipSetFontPx(id,px){
  px=Math.max(6,Math.min(600,Math.round(+px||0)));
  var x=aipExtraOf(id);
  if(x){ x.size=px; aiPreviewSoon(); return; }
  var base=aipFontBasePx(id)||1;
  aiSetLayerScale(id,Math.round(px/base*100));
  aiPreviewSoon();
}
function aipFontRange(id){
  var base=aipFontBasePx(id)||1;
  /* the underlying scale is clamped 20–400%, so surface the same ceiling in px */
  return aipExtraOf(id)?{min:6,max:600}:{min:Math.max(6,Math.round(base*0.2)),max:Math.round(base*4)};
}

/* ---------- layer identity ---------- */
var AIP_BUILTIN = { canvas:["Canvas","canvas"], logo:["Logo","image"], badge:["Badge","text"],
                    headline:["Headline","text"], sub:["Subheadline","text"], cta:["Button","text"],
                    disclaimer:["Disclaimer","text"] };
function aipLayerKind(id){
  if(id==="canvas") return "canvas";
  var x=aipExtraOf(id); if(x) return x.type;
  return (AIP_BUILTIN[id]||["","text"])[1];
}
function aipLayerName(id){
  var x=aipExtraOf(id); if(x) return x.name||tr("Custom layer");
  return tr((AIP_BUILTIN[id]||[id])[0]);
}
function aipKindLabel(kind){
  return tr({text:"Text layer",image:"Image layer",shape:"Shape layer",canvas:"Canvas"}[kind]||"Layer");
}
function aipIsTextish(id){ return aipLayerKind(id)==="text"; }

/* ============================================================
   §13 SELECTED LAYER HEADER — identity plus the quick actions that
   used to be buried at the bottom of the panel.
   ============================================================ */
function aipHeader(id){
  var kind=aipLayerKind(id), meta=aiLayerMeta(id), locked=!!meta.locked, extra=aipExtraOf(id);
  var actions="";
  if(id!=="canvas"){
    actions=aipIconBtn(meta.visible===false?"eyeOff":"eye", meta.visible===false?"Show layer":"Hide layer",
              "aiMetaSet('"+id+"','visible',"+(meta.visible===false)+")",{pressed:meta.visible!==false})
      + aipIconBtn(locked?"lock":"unlock", locked?"Unlock layer":"Lock layer",
              "aiMetaSet('"+id+"','locked',"+(!locked)+")",{on:locked,pressed:locked,shortcut:"⌘⇧L"})
      + aipIconBtn("copy","Duplicate layer","aiDuplicateSelected()",{disabled:locked,shortcut:"⌘D"})
      + aipIconBtn("trash","Delete layer","aiRemoveLayer('"+id+"')",{danger:true,disabled:locked});
  }
  var name = extra
    ? '<input class="ai-prop-name" value="'+attr(extra.name||"")+'" aria-label="'+attr(tr("Layer name"))+'"'
      + ' oninput="aiExtraSet(\''+extra.id+'\',\'name\',this.value)" onchange="aiRefreshProperties()">'
    : '<span class="ai-prop-name static">'+aipEsc(aipLayerName(id))+'</span>';
  return '<div class="ai-prop-header">'
    + '<span class="ai-prop-type" aria-hidden="true">'+aipIcon(kind==="canvas"?"canvas":kind==="image"?"image":kind==="shape"?"shape":"text",16)+'</span>'
    + '<span class="ai-prop-identity">'+name+'<span class="ai-prop-kind">'+aipKindLabel(kind)+(locked?' · '+tr("locked"):'')+'</span></span>'
    + '<span class="ai-prop-actions">'+actions+'</span></div>';
}

/* ============================================================
   §16 / §19 / §20 TRANSFORM — position, size, rotation, alignment
   ============================================================ */
function aipTransform(id){
  var locked=!!aiLayerMeta(id).locked, pos=aipPosPx(id), size=aipSizePx(id), meta=aiLayerMeta(id);
  var sz=aiActiveSize(), u=aipUnits();
  var body='';

  body+=aipRow("Position",
    aipNum({value:aipToDisplay(pos.x,sz.w,u.position),prefix:"X",unit:aipUnitLabel(u.position),
            step:u.position==="percent"?0.1:1,label:"X position",disabled:locked,
            oninput:"aipSetPosPx('"+id+"','x',aipFromDisplay(this.value,aiActiveSize().w,aipUnits().position))"})
    + aipNum({value:aipToDisplay(pos.y,sz.h,u.position),prefix:"Y",unit:aipUnitLabel(u.position),
            step:u.position==="percent"?0.1:1,label:"Y position",disabled:locked,
            oninput:"aipSetPosPx('"+id+"','y',aipFromDisplay(this.value,aiActiveSize().h,aipUnits().position))"}));

  if(size&&size.w!=null){
    var x=aipExtraOf(id), showH=size.h!=null;
    var lockBtn=showH?aipIconBtn(x.aspectLock?"link":"unlink", x.aspectLock?"Aspect ratio locked":"Lock aspect ratio",
        "aiExtraSet('"+x.id+"','aspectLock',"+(!x.aspectLock)+");aiRefreshProperties()",{on:!!x.aspectLock,pressed:!!x.aspectLock,disabled:locked}):"";
    body+=aipRow(showH?"Size":"Width",
      aipNum({value:aipToDisplay(size.w,sz.w,u.size),prefix:"W",unit:aipUnitLabel(u.size),
              step:u.size==="percent"?0.1:1,label:"Width",disabled:locked,
              oninput:"aipSetSizePx('"+id+"','w',aipFromDisplay(this.value,aiActiveSize().w,aipUnits().size))"})
      + (showH?aipNum({value:aipToDisplay(size.h,sz.h,u.size),prefix:"H",unit:aipUnitLabel(u.size),
              step:u.size==="percent"?0.1:1,label:"Height",disabled:locked,
              oninput:"aipSetSizePx('"+id+"','h',aipFromDisplay(this.value,aiActiveSize().h,aipUnits().size))"}):"")
      + lockBtn);
  }
  body+=aipRow("Rotation",
    aipNum({value:Math.round(+meta.rotation||0),unit:"°",min:-360,max:360,label:"Rotation",disabled:locked,
            oninput:"aiLayerMeta('"+id+"').rotation=Number(this.value)||0;aiPreviewSoon()"})
    + aipIconBtn("reset","Reset rotation","aiHistoryBefore();aiLayerMeta('"+id+"').rotation=0;aiRefreshProperties()",{disabled:locked}));

  /* §33 icon-only alignment toolbar */
  body+=aipRow("Align",
    aipSegment([
      {icon:"alignLeft",label:"Align left",onclick:"aiAlignLayer('"+id+"','left')"},
      {icon:"alignCenter",label:"Align horizontal centres",onclick:"aiAlignLayer('"+id+"','center')"},
      {icon:"alignRight",label:"Align right",onclick:"aiAlignLayer('"+id+"','right')"},
      {icon:"alignTop",label:"Align top",onclick:"aiAlignLayer('"+id+"','top')"},
      {icon:"alignMiddle",label:"Align vertical centres",onclick:"aiAlignLayer('"+id+"','middle')"},
      {icon:"alignBottom",label:"Align bottom",onclick:"aiAlignLayer('"+id+"','bottom')"}
    ]),{stack:true});

  /* §17 ONE contextual unit selector for the section, in its header — it never
     competes for width with the numbers it governs. Position and size share it
     because they describe the same geometry. */
  return aipSection("transform","Transform",body,{action:aipUnitSwitch(u.position)});
}

/* ============================================================
   §21 CONTENT
   ============================================================ */
function aipContent(id){
  var x=aipExtraOf(id), locked=!!aiLayerMeta(id).locked, dis=locked?" disabled":"";
  if(x&&x.type==="text")
    return aipSection("content","Content",
      '<textarea class="ai-prop-textarea" rows="3"'+dis+' aria-label="'+attr(tr("Text"))+'"'
      + ' oninput="aiExtraSet(\''+x.id+'\',\'content\',this.value)">'+aipEsc(x.content||"")+'</textarea>');
  if(id==="headline"||id==="sub"){
    var key=id==="headline"?"headline":"sub";
    return aipSection("content","Content",
      '<textarea class="ai-prop-textarea" rows="3"'+dis+' aria-label="'+attr(tr("Text"))+'"'
      + ' oninput="AIF.'+key+'=this.value;aiPreviewSoon()">'+aipEsc(AIF[key]||"")+'</textarea>');
  }
  if(id==="cta") return aipSection("content","Content",
    aipRow("Button label",'<input class="ai-prop-text"'+dis+' value="'+attr(AIF.cta||"")+'" placeholder="'+attr(tr("Learn more"))+'" aria-label="'+attr(tr("Button label"))+'" oninput="AIF.cta=this.value;aiPreviewSoon()">',{stack:true}));
  if(id==="badge") return aipSection("content","Content",
    aipRow("Badge text",'<input class="ai-prop-text"'+dis+' value="'+attr(AIF.badge||"")+'" placeholder="'+attr(tr("Optional label"))+'" aria-label="'+attr(tr("Badge text"))+'" oninput="AIF.badge=this.value;aiPreviewSoon()">',{stack:true}));
  if(id==="disclaimer") return aipSection("content","Content",
    aipRow("Show disclaimer",aipToggleSwitch(!!AIF.disclaimer,"aiHistoryBefore();AIF.disclaimer=!AIF.disclaimer;aiRefreshProperties();aiPreviewSoon()","Show disclaimer"))
    + '<textarea class="ai-prop-textarea" rows="3"'+dis+' aria-label="'+attr(tr("Disclaimer text"))+'"'
    + ' oninput="AIF.disclaimerText=this.value;aiPreviewSoon()">'+aipEsc(AIF.disclaimerText||"")+'</textarea>');
  return "";
}

/* ============================================================
   §22 TYPOGRAPHY — font, weight, SIZE IN PX, line height, alignment
   ============================================================ */
function aipTypography(id){
  if(!aipIsTextish(id)) return "";
  var x=aipExtraOf(id), locked=!!aiLayerMeta(id).locked, range=aipFontRange(id), px=aipFontPx(id);
  var fontVal, fontSet, weight, lineH, align, alignSet;
  if(x){
    fontVal=x.font||""; fontSet="aiExtraSet('"+x.id+"','font',this.value);aiPreviewSoon()";
    weight=x.weight==null?700:x.weight;
    lineH=x.lineHeight==null?1.3:x.lineHeight;
    align=x.align||"center"; alignSet="aiExtraSet('"+x.id+"','align',ALIGN);aiRefreshProperties()";
  } else if(id==="headline"||id==="sub"){
    var fk=id==="headline"?"headlineFont":"subFont";
    fontVal=AIF[fk]||""; fontSet="AIF."+fk+"=this.value;aiPreviewSoon()";
  }
  var body="";
  if(fontVal!==undefined)
    body+=aipRow("Font",aipSelect(fontVal,[["",tr("Workspace font")]].concat(aiWorkspaceFonts().map(function(f){ return [f,f]; })),fontSet,{label:"Font",disabled:locked}),{stack:true});

  /* the requirement the old panel never met: a real px size, not a % scale */
  body+=aipRow("Size",
    aipNum({value:px,unit:"px",min:range.min,max:range.max,label:"Font size",disabled:locked,
            oninput:"aipSetFontPx('"+id+"',this.value)"})
    + (x?"":aipIconBtn("reset","Reset to the default size for this canvas","aiHistoryBefore();aiSetLayerScale('"+id+"',100);aiRefreshProperties()",{disabled:locked})));

  if(x&&x.type==="text"){
    body+=aipRow("Weight",aipSelect(weight,[[400,"Regular"],[500,"Medium"],[700,"Bold"],[900,"Black"]],
        "aiExtraSet('"+x.id+"','weight',Number(this.value));aiPreviewSoon()",{label:"Font weight",disabled:locked}));
    body+=aipRow("Line height",
      aipNum({value:lineH,step:0.05,min:0.7,max:3,unit:"×",label:"Line height",disabled:locked,
              oninput:"aiExtraSet('"+x.id+"','lineHeight',Number(this.value)||1.3);aiPreviewSoon()"}));
    body+=aipRow("Alignment",aipSegment([
        {icon:"textLeft",label:"Align text left",on:align==="left",onclick:"aiExtraSet('"+x.id+"','align','left');aiRefreshProperties()"},
        {icon:"textCenter",label:"Align text centre",on:align==="center",onclick:"aiExtraSet('"+x.id+"','align','center');aiRefreshProperties()"},
        {icon:"textRight",label:"Align text right",on:align==="right",onclick:"aiExtraSet('"+x.id+"','align','right');aiRefreshProperties()"}
      ]));
    body+=aipRow("Style",
      aipIconBtn("text",x.italic?"Remove italic":"Italic","aiHistoryBefore();aiExtraSet('"+x.id+"','italic',"+(!x.italic)+");aiRefreshProperties()",{on:!!x.italic,pressed:!!x.italic,disabled:locked})
      + aipIconBtn("alignLeft",x.underline?"Remove underline":"Underline","aiHistoryBefore();aiExtraSet('"+x.id+"','underline',"+(!x.underline)+");aiRefreshProperties()",{on:!!x.underline,pressed:!!x.underline,disabled:locked}));
  }
  return aipSection("typography","Typography",body);
}

/* ============================================================
   §23 FILL · §24 STROKE · §25 BACKGROUND · §27 RADIUS · §28 OPACITY & EFFECTS
   ============================================================ */
function aipFill(id){
  var x=aipExtraOf(id), locked=!!aiLayerMeta(id).locked, s=aiLayerStyle(id), set="aiLayerStyle('"+id+"')";
  var body="";
  if(x&&x.type==="shape"){
    body+=aipRow("Colour",aipColor(x.color||"#2F5BFF","aiExtraSet('"+x.id+"','color',this.value);aiPreviewSoon()",{label:"Fill colour"}));
    body+=aipRow("Second",aipColor(x.color2||"#C6F24E","aiExtraSet('"+x.id+"','color2',this.value);aiPreviewSoon()",{label:"Secondary colour"}));
  } else if(aipIsTextish(id)){
    body+=aipRow("Text colour",aipColor(s.textFill||"#FFFFFF",set+".textFill=this.value;aiPreviewSoon()",{label:"Text colour"}));
    body+=aipRow("Opacity",aipNum({value:+s.textOpacity||100,min:0,max:100,unit:"%",label:"Text opacity",disabled:locked,
        oninput:set+".textOpacity=this.value;aiPreviewSoon()"}));
    body+=aipRow("Gradient",aipToggleSwitch(!!s.textFillGradient,"aiHistoryBefore();"+set+".textFillGradient=!"+set+".textFillGradient;aiRefreshProperties()","Text gradient"));
    if(s.textFillGradient){
      body+=aipRow("To",aipColor(s.textFill2||"#7C3AED",set+".textFill2=this.value;aiPreviewSoon()",{label:"Gradient end colour"}));
      body+=aipRow("Angle",aipNum({value:+s.textFillAngle||0,min:0,max:360,unit:"°",label:"Gradient angle",
        oninput:set+".textFillAngle=this.value;aiPreviewSoon()"}));
    }
  }
  return aipSection("fill","Fill",body);
}
function aipStroke(id){
  var x=aipExtraOf(id), s=aiLayerStyle(id), set="aiLayerStyle('"+id+"')", body="";
  if(aipIsTextish(id)){
    body+=aipRow("Outline",aipToggleSwitch(!!s.textStroke,"aiHistoryBefore();"+set+".textStroke=!"+set+".textStroke;aiRefreshProperties()","Text outline"));
    if(s.textStroke){
      body+=aipRow("Colour",aipColor(s.textStrokeColor||"#FFFFFF",set+".textStrokeColor=this.value;aiPreviewSoon()",{label:"Outline colour"}));
      body+=aipRow("Width",aipNum({value:+s.textStrokeWidth||1,min:0,max:24,unit:"px",label:"Outline width",
        oninput:set+".textStrokeWidth=this.value;aiPreviewSoon()"}));
    }
  }
  if(x&&x.type!=="text"){
    body+=aipRow("Border",aipToggleSwitch(!!s.bgStroke,"aiHistoryBefore();"+set+".bgStroke=!"+set+".bgStroke;aiRefreshProperties()","Border"));
    if(s.bgStroke){
      body+=aipRow("Colour",aipColor(s.bgStrokeColor||"#FFFFFF",set+".bgStrokeColor=this.value;aiPreviewSoon()",{label:"Border colour"}));
      body+=aipRow("Width",aipNum({value:+s.bgStrokeWidth||1,min:0,max:24,unit:"px",label:"Border width",
        oninput:set+".bgStrokeWidth=this.value;aiPreviewSoon()"}));
    }
  }
  return aipSection("stroke","Stroke",body);
}
/* §25 / §26 text background box with linked padding in px */
function aipBackground(id){
  if(!aipIsTextish(id)) return "";
  var s=aiLayerStyle(id), set="aiLayerStyle('"+id+"')";
  var body=aipRow("Show background",aipToggleSwitch(!!s.bg,"aiHistoryBefore();"+set+".bg=!"+set+".bg;aiRefreshProperties()","Show background"));
  if(s.bg){
    body+=aipRow("Colour",aipColor(s.fill||"#172342",set+".fill=this.value;aiPreviewSoon()",{label:"Background colour"}));
    body+=aipRow("Opacity",aipNum({value:+s.opacity||100,min:0,max:100,unit:"%",label:"Background opacity",
      oninput:set+".opacity=this.value;aiPreviewSoon()"}));
    var linked=s.padLink!==false;
    body+=aipRow("Padding",
      aipNum({value:+s.padY||0,prefix:"V",unit:"px",min:0,max:400,label:"Vertical padding",
              oninput:set+".padY=this.value;"+(linked?set+".padX=this.value;":"")+"aiPreviewSoon()"})
      + aipNum({value:+s.padX||0,prefix:"H",unit:"px",min:0,max:400,label:"Horizontal padding",disabled:linked,
              oninput:set+".padX=this.value;aiPreviewSoon()"})
      + aipIconBtn(linked?"link":"unlink",linked?"Padding linked":"Link padding",
              "aiHistoryBefore();"+set+".padLink="+(!linked)+";aiRefreshProperties()",{on:linked,pressed:linked}));
    body+=aipRow("Radius",aipNum({value:+s.radius||0,min:0,max:999,unit:"px",label:"Corner radius",
      oninput:set+".radius=this.value;aiPreviewSoon()"}));
    body+='<div class="ai-quick-styles">'+["none","solid","gradient","pill","glass"].map(function(k){
      return '<button type="button" onclick="aiApplyQuickStyle(\''+id+'\',\''+k+'\')">'+tr(k.charAt(0).toUpperCase()+k.slice(1))+'</button>'; }).join("")+'</div>';
  }
  return aipSection("background","Background",body);
}
/* §27 one radius by default; the four corners live in Advanced */
function aipRadius(id){
  var x=aipExtraOf(id); if(!x||x.type==="text") return "";
  var body=aipRow("Radius",aipNum({value:+x.radius||0,min:0,max:999,unit:"px",label:"Corner radius",
    oninput:"aiExtraSet('"+x.id+"','radius',Number(this.value)||0);aiPreviewSoon()"}));
  return aipSection("radius","Corner",body);
}
function aipOpacity(id){
  var meta=aiLayerMeta(id), v=meta.opacity==null?100:+meta.opacity;
  return aipSection("opacity","Opacity",
    aipRow("Layer",
      '<input class="ai-prop-slider" type="range" min="0" max="100" value="'+v+'" aria-label="'+attr(tr("Layer opacity"))+'"'
      + ' oninput="aiLayerMeta(\''+id+'\').opacity=Number(this.value);document.getElementById(\'aipOpacityVal\').textContent=this.value+\'%\';aiPreviewSoon()">'
      + '<span class="ai-prop-unit" id="aipOpacityVal">'+v+'%</span>'));
}
/* §28 shadow, collapsed by default */
function aipEffects(id){
  var s=aiLayerStyle(id), set="aiLayerStyle('"+id+"')";
  var body=aipRow("Drop shadow",aipToggleSwitch(!!s.shadow,"aiHistoryBefore();"+set+".shadow=!"+set+".shadow;aiRefreshProperties()","Drop shadow"));
  if(s.shadow){
    body+=aipRow("Colour",aipColor(s.shadowColor||"#000000",set+".shadowColor=this.value;aiPreviewSoon()",{label:"Shadow colour"}));
    body+=aipRow("Opacity",aipNum({value:+s.shadowOpacity||0,min:0,max:100,unit:"%",label:"Shadow opacity",oninput:set+".shadowOpacity=this.value;aiPreviewSoon()"}));
    body+=aipRow("Offset",
      aipNum({value:+s.shadowAngle||0,prefix:"∠",unit:"°",min:0,max:360,label:"Shadow direction",oninput:set+".shadowAngle=this.value;aiPreviewSoon()"})
      + aipNum({value:+s.shadowDistance||0,prefix:"D",unit:"px",min:0,max:200,label:"Shadow distance",oninput:set+".shadowDistance=this.value;aiPreviewSoon()"}));
    body+=aipRow("Blur",aipNum({value:+s.shadowBlur||0,min:0,max:200,unit:"px",label:"Shadow blur",oninput:set+".shadowBlur=this.value;aiPreviewSoon()"}));
  }
  return aipSection("effects","Effects",body);
}
/* §12 image-specific appearance */
function aipAppearance(id){
  var x=aipExtraOf(id); if(!x||x.type!=="image") return "";
  var s=aiLayerStyle(id), set="aiLayerStyle('"+id+"')";
  var body=aipRow("Brightness",aipNum({value:s.brightness==null?100:+s.brightness,min:0,max:200,unit:"%",label:"Brightness",oninput:set+".brightness=this.value;aiPreviewSoon()"}))
    + aipRow("Contrast",aipNum({value:s.contrast==null?100:+s.contrast,min:0,max:200,unit:"%",label:"Contrast",oninput:set+".contrast=this.value;aiPreviewSoon()"}))
    + aipRow("Saturation",aipNum({value:s.saturation==null?100:+s.saturation,min:0,max:200,unit:"%",label:"Saturation",oninput:set+".saturation=this.value;aiPreviewSoon()"}));
  return aipSection("appearance","Appearance",body);
}
function aipAdvanced(id){
  var body=aipRow("Order",
      aipIconBtn("up","Bring forward","aiMoveLayer('"+id+"',1)")
    + aipIconBtn("down","Send backward","aiMoveLayer('"+id+"',-1)"));
  body+=aipRow("Reset",'<button type="button" class="btn xs ghost" onclick="aiResetStyle(\''+id+'\')">'+tr("Reset layer style")+'</button>',{stack:true});
  return aipSection("advanced","Advanced",body);
}

/* ============================================================
   CANVAS PROPERTIES (§12, §79) — Size, Background, Safe Area, Guides
   ============================================================ */
function aipCanvas(){
  var sz=aiActiveSize(), cbg=AIF.canvasBg||(AIF.canvasBg={type:"solid",color:"",color2:"#4F46E5",angle:135,stop:100,opacity:100});
  var b=WS.brand||{};
  var size=aipRow("Preset",aipSelect(AIF.size||"web_hero",
      AI_SIZES.map(function(s){ return [s.id,s.name+" · "+s.w+"×"+s.h]; }).concat([["custom",tr("Custom size…")]]),
      "AIF.size=this.value;aiRefreshProperties();aiPreviewSoon()",{label:"Canvas size"}),{stack:true})
    + (AIF.size==="custom"?aipRow("Size",
        aipNum({value:AIF.customW||1200,prefix:"W",unit:"px",min:64,max:4096,label:"Canvas width",oninput:"AIF.customW=this.value;aiPreviewSoon()"})
        + aipNum({value:AIF.customH||628,prefix:"H",unit:"px",min:64,max:4096,label:"Canvas height",oninput:"AIF.customH=this.value;aiPreviewSoon()"}))
      : aipRow("Pixels",'<span class="ai-prop-static">'+sz.w+' × '+sz.h+' px</span>'));

  var bg=aipRow("Type",aipSelect(cbg.type||"solid",[["solid","Solid"],["gradient","Gradient"]],
      "AIF.canvasBg.type=this.value;aiRefreshProperties();aiPreviewSoon()",{label:"Background type"}))
    + aipRow("Colour",aipColor(cbg.color||AIF.background||b.primary||"#0B2A5B","AIF.canvasBg.color=this.value;aiPreviewSoon()",{label:"Background colour"}))
    + (cbg.type==="gradient"
        ? aipRow("To",aipColor(cbg.color2||"#4F46E5","AIF.canvasBg.color2=this.value;aiPreviewSoon()",{label:"Gradient end"}))
          + aipRow("Angle",aipNum({value:+cbg.angle||135,min:0,max:360,unit:"°",label:"Gradient angle",oninput:"AIF.canvasBg.angle=this.value;aiPreviewSoon()"}))
        : "")
    + aipRow("Opacity",aipNum({value:cbg.opacity==null?100:+cbg.opacity,min:0,max:100,unit:"%",label:"Background opacity",oninput:"AIF.canvasBg.opacity=this.value;aiPreviewSoon()"}))
    + aipRow("Generated image",'<button type="button" class="btn xs ghost" onclick="aiHistoryBefore();AIF.hideGenerated=!AIF.hideGenerated;aiRefreshProperties();aiPreviewSoon()">'
        + tr(AIF.hideGenerated?"Show generated background":"Hide generated background")+'</button>',{stack:true});

  /* §79 safe area with its own px/% unit and a link control */
  var su=AIF.safeUnit==="px"?"px":"%", linked=AIF.safeLocked!==false;
  var sMax=su==="px"?Math.round(Math.min(sz.w,sz.h)*0.45):25;
  var safeField=function(side,label){
    var key="safe"+side.charAt(0).toUpperCase()+side.slice(1);
    return aipNum({value:+AIF[key]||0,prefix:label,unit:su,min:0,max:sMax,label:label+" safe area",
      oninput:(linked?"aiSetSafeAll(this.value)":"AIF."+key+"=this.value;aiPreviewSoon()")});
  };
  var safe=aipRow("Unit",aipSelect(AIF.safeUnit||"percent",[["percent","%"],["px","px"]],
      "aiSetSafeUnit(this.value);aiRefreshProperties()",{label:"Safe area unit"})
      + aipIconBtn(linked?"link":"unlink",linked?"All sides linked":"Link all sides","aiToggleSafeLock();aiRefreshProperties()",{on:linked,pressed:linked}))
    + aipRow("Top / Right",safeField("top","T")+safeField("right","R"))
    + aipRow("Bottom / Left",safeField("bottom","B")+safeField("left","L"))
    + aipRow("Show overlay",aipToggleSwitch(!!AIF.showSafeZones,"AIF.showSafeZones=!AIF.showSafeZones;aiRefreshProperties();aiPreviewSoon()","Show safe zones"));

  var guides=aipRow("Show guides",aipToggleSwitch(!!AIF.showGuides,"AIF.showGuides=!AIF.showGuides;aiRefreshProperties();aiPreviewSoon()","Show guides"))
    + aipRow("Snap to guides",aipToggleSwitch(AIF.snapGuides!==false,"AIF.snapGuides=AIF.snapGuides===false;aiRefreshProperties()","Snap to guides"))
    + aipRow("Protect text",aipToggleSwitch(AIF.protectText!==false,"aiHistoryBefore();AIF.protectText=AIF.protectText===false;aiRefreshProperties();aiPreviewSoon()","Keep AI image outside text areas"));

  return aipSection("size","Size",size,{forceOpen:true})
    + aipSection("canvasbg","Background",bg)
    + aipSection("safe","Safe area",safe)
    + aipSection("guides","Guides & snap",guides);
}

/* ============================================================
   §32 MULTI-SELECTION · §76 EMPTY STATE
   ============================================================ */
function aipMulti(ids){
  var body=aipRow("Align to",aipSelect(AIF.alignTarget||"selection",[["selection","Selection bounds"],["canvas","Canvas"]],
      "AIF.alignTarget=this.value",{label:"Align to"}),{stack:true})
    + aipRow("Align",aipSegment([
        {icon:"alignLeft",label:"Align left",onclick:"aiAlignSelected('left')"},
        {icon:"alignCenter",label:"Align horizontal centres",onclick:"aiAlignSelected('center')"},
        {icon:"alignRight",label:"Align right",onclick:"aiAlignSelected('right')"},
        {icon:"alignTop",label:"Align top",onclick:"aiAlignSelected('top')"},
        {icon:"alignMiddle",label:"Align vertical centres",onclick:"aiAlignSelected('middle')"},
        {icon:"alignBottom",label:"Align bottom",onclick:"aiAlignSelected('bottom')"}
      ]),{stack:true})
    + aipRow("Order",aipIconBtn("up","Bring forward","aiMoveSelected(1)")+aipIconBtn("down","Send backward","aiMoveSelected(-1)"))
    + aipRow("Actions",
        aipIconBtn("copy","Duplicate layers","aiDuplicateSelected()",{shortcut:"⌘D"})
      + aipIconBtn("trash","Delete layers","aiDeleteSelected()",{danger:true}));
  return '<div class="ai-prop-header"><span class="ai-prop-type">'+aipIcon("shape",16)+'</span>'
    + '<span class="ai-prop-identity"><span class="ai-prop-name static">'+ids.length+' '+tr("layers selected")+'</span>'
    + '<span class="ai-prop-kind">'+tr("Shared properties only")+'</span></span></div>'
    + aipSection("transform","Arrange",body,{forceOpen:true})
    + '<p class="ai-prop-note">'+tr("Locked layers stay in place.")+'</p>';
}
function aipEmpty(){
  return '<div class="ai-prop-empty">'+aipIcon("canvas",26)
    + '<b>'+tr("No layer selected")+'</b>'
    + '<span>'+tr("Select a layer on the canvas or in the Layers panel to edit its properties.")+'</span></div>';
}

/* ============================================================
   §29 THE INSPECTOR — section order is declared per layer type,
   not inferred from label text.
   ============================================================ */
function aipInspector(id){
  if(id==="canvas") return aipHeader(id)+aipCanvas();
  var kind=aipLayerKind(id);
  if(kind==="image")
    return aipHeader(id)+aipTransform(id)+aipAppearance(id)+aipStroke(id)+aipRadius(id)+aipOpacity(id)+aipEffects(id)+aipAdvanced(id);
  if(kind==="shape")
    return aipHeader(id)+aipTransform(id)+aipFill(id)+aipStroke(id)+aipRadius(id)+aipOpacity(id)+aipEffects(id)+aipAdvanced(id);
  /* text — the fullest case */
  return aipHeader(id)+aipTransform(id)+aipContent(id)+aipTypography(id)+aipFill(id)
       + aipBackground(id)+aipStroke(id)+aipOpacity(id)+aipEffects(id)+aipAdvanced(id);
}

/* ============================================================
   §9 LAYER COUNTER — reads the workspace policy, never a literal
   ============================================================ */
function aipLayerCounter(){
  var p=(typeof effectiveAiPolicy==="function"?effectiveAiPolicy().hub:{maxLayers:40});
  var used=(AIF.extraLayers||[]).length, max=p.maxLayers, left=max-used;
  var tone=used>=max?"bad":(used/max>=0.8?"warn":"");
  return '<span class="ai-layer-count '+tone+'" title="'+attr(used>=max
      ? tr("Layer limit reached. Delete a layer or ask a workspace admin to increase the limit.")
      : tr("Custom layers used in this design"))+'">'+used+' / '+max
    + (tone==="warn"?' · '+left+' '+tr("left"):'')+'</span>';
}

/* ============================================================
   Install: run the existing chain first so the Layer panel (§34) is built
   exactly as before, then replace the property body with this inspector.
   This is a replacement, not another layer of patching — nothing downstream
   re-parses what is produced here.
   ============================================================ */
var aiPolishInspectorPrev = aiPolishInspector;
aiPolishInspector = function(root,id){
  aiPolishInspectorPrev(root,id);
  try {
    var body=root.querySelector(".ai-prop-body"), title=root.querySelector(".ai-prop-title");
    if(!body) return;
    var ids=(typeof aiSelectedIds==="function"?aiSelectedIds():[]);
    if(title) title.remove();
    if(ids.length>1) body.innerHTML=aipMulti(ids);
    else if(!id) body.innerHTML=aipEmpty();
    else body.innerHTML=aipInspector(id);
    /* §9 the counter belongs on the Layers summary, which we preserved */
    var summary=root.querySelector(".ai-layer-browser > summary");
    if(summary&&!summary.querySelector(".ai-layer-count")){
      var host=summary.querySelector("span")||summary;
      host.insertAdjacentHTML("afterend",aipLayerCounter());
    }
    /* §9 disable the add controls when the design is at its limit */
    if(typeof aiCanAddLayers==="function"&&!aiCanAddLayers(1).ok){
      root.querySelectorAll(".ai-layer-add button").forEach(function(b){
        b.disabled=true; b.title=tr("Layer limit reached. Delete a layer or ask a workspace admin to increase the limit.");
      });
    }
  } catch(e){ console.error("properties inspector",e); }
};
</script>
