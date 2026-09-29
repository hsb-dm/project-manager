<script>
/* ============================================================
   AI HUB — GENERATIVE EXPAND
   Adobe-style "canvas size" control: drag the frame around the current
   generated image outward (or type exact numbers) to grow the canvas,
   then the model paints only the new, transparent border. Reuses the
   "reference" model capability — a model that can accept an image is
   the same model that can expand one.
   ============================================================ */
var AI_EXPAND = null;
var AI_EXPAND_STAGE = 520; /* px — the box the image itself is scaled to fit; expansion grows past it */
var AI_EXPAND_RATIOS = [["orig","Original"],["1:1","1:1"],["4:5","4:5"],["16:9","16:9"],["9:16","9:16"],["free","Freeform"]];

/* What to expand. AI_LAST only survives a generation in this tab — a design
   reopened from AI Gallery or a reloaded page keeps the picture in an image
   layer with AI_LAST empty, so the layer is the real source of truth. The
   selected layer wins, so expanding follows whatever the member is working on. */
function aiExpandSource(){
  var layers = (AIF.extraLayers||[]).filter(function(x){ return x.type==="image" && x.src; });
  var selected = String(AIF.selectedLayer||"").indexOf("extra_")===0 ? AIF.selectedLayer.slice(6) : "";
  var hit = layers.filter(function(x){ return x.id===selected; })[0]
         || layers.filter(function(x){ return x.generated; })[0]
         || layers[0];
  if (hit) return { url: hit.src, layerId: hit.id };
  if (AI_LAST && AI_LAST.imgUrl) return { url: AI_LAST.imgUrl, layerId: "" };
  return null;
}
function aiExpandDisabledReason(){
  if (typeof API==="undefined" || !API.on) return tr("Generative Expand needs the connected server — not available in the standalone demo.");
  if (!aiExpandSource()) return tr("Generate a visual first, then expand it.");
  var model = aiExpandEffectiveModel();
  if (model && !aiModelCan(model,"reference")) return aiExpandModel()
    ? tr("The model pinned for Expand cannot accept an input image. An admin can change it in Settings → AI → Models.")
    : tr("This model does not support Generative Expand. Pick another model, or ask an admin to pin one for Expand in Settings → AI → Models.");
  /* Magnific outpaints through its own image-expand models; its generation models cannot,
     whatever they are called. Say so here rather than after a failed round trip. */
  if (aiExpandProvider()==="magnific" && AI_EXPAND_MAGNIFIC_MODELS.indexOf(String((model&&model.modelId)||""))<0)
    return tr("This workspace generates through Magnific, which expands only with its own expand models. Register one with the Model ID flux-pro or seedream-v4-5, then pick it under Settings → AI → Models → Generative Expand.");
  return "";
}
function aiExpandOpen(){
  var reason = aiExpandDisabledReason();
  if (reason) return toast(reason, "bad");
  var src = aiExpandSource();
  var im = new Image(); im.crossOrigin = "anonymous";
  im.onload = function(){
    AI_EXPAND = { srcUrl: src.url, layerId: src.layerId, baseW: im.naturalWidth, baseH: im.naturalHeight, top:0, right:0, bottom:0, left:0, ratio:"free", busy:false };
    aiExpandModal();
  };
  im.onerror = function(){ toast(tr("Could not load the current visual to expand."), "bad"); };
  im.src = src.url;
}
function aiExpandScale(){
  var e = AI_EXPAND; if (!e) return 1;
  return Math.min(1, AI_EXPAND_STAGE / Math.max(e.baseW, e.baseH));
}
/* A side is pixels added (positive) or trimmed (negative), like dragging a crop frame in or
   out. `crop` is the surviving piece of the source; `dx/dy` is where it lands on the new canvas. */
function aiExpandTotals(){
  var e = AI_EXPAND, cut = function(v){ return Math.max(0, -Math.round(v)); }, add = function(v){ return Math.max(0, Math.round(v)); };
  var cropW = Math.round(e.baseW) - cut(e.left) - cut(e.right), cropH = Math.round(e.baseH) - cut(e.top) - cut(e.bottom);
  return { w: Math.round(e.baseW + e.left + e.right), h: Math.round(e.baseH + e.top + e.bottom),
           cropX: cut(e.left), cropY: cut(e.top), cropW: cropW, cropH: cropH,
           dx: add(e.left), dy: add(e.top),
           grows: add(e.left)+add(e.right)+add(e.top)+add(e.bottom) > 0,
           trims: cut(e.left)+cut(e.right)+cut(e.top)+cut(e.bottom) > 0 };
}
function aiExpandModal(){
  var e = AI_EXPAND, t = aiExpandTotals();
  var model = aiExpandEffectiveModel(), modelName = model ? model.name : "";
  var ratios = '<div class="seg ai-expand-ratios">' + AI_EXPAND_RATIOS.map(function(r){ return '<button class="'+(e.ratio===r[0]?"on":"")+'" onclick="aiExpandApplyRatio(\''+r[0]+'\')">'+tr(r[1])+'</button>'; }).join("") + '</div>';
  var sides = [["top","Top"],["right","Right"],["bottom","Bottom"],["left","Left"]].map(function(s){
    return '<div><label for="aiExpandN_'+s[0]+'">'+tr(s[1])+'</label><input type="number" id="aiExpandN_'+s[0]+'" value="'+Math.round(e[s[0]])+'" oninput="aiExpandSetSide(\''+s[0]+'\',this.value)"><span>px</span></div>';
  }).join("");
  var body = '<div class="ai-expand-tool">'
    + '<div class="field"><label>'+tr("Aspect ratio")+'</label>'+ratios+'</div>'
    + '<div class="ai-expand-stage-wrap"><div class="ai-expand-frame" id="aiExpandFrame">'
    +   '<div class="ai-expand-clip"><img class="ai-expand-img" id="aiExpandImg" src="'+attr(e.srcUrl)+'" alt=""></div>'
    +   ["n","s","e","w","ne","nw","se","sw"].map(function(d){ return '<span class="ai-expand-handle '+d+'" data-dir="'+d+'"></span>'; }).join("")
    + '</div></div>'
    + '<div class="ai-expand-dims">'+tr("New size")+': <b id="aiExpandDims">'+t.w+' × '+t.h+'</b><button class="btn xs ghost" onclick="aiExpandResetSides()">'+I.sync+tr("Reset")+'</button></div>'
    + '<div class="safe-zone-grid ai-expand-sides">'+sides+'</div>'
    + '<div class="field"><label>'+tr("Describe the new area (optional)")+'</label><textarea id="aiExpandPrompt" rows="2" placeholder="'+attr(tr("e.g. continue the sky, extend the background smoothly"))+'"></textarea></div>'
    + '<p class="hint" id="aiExpandHint">'+tr("Drag the edges or corners: inward to crop, outward to expand. Cropping is applied instantly; only a new, empty area is generated by AI.")+(modelName?' · '+tr("Model")+': '+esc(modelName):'')+'</p>'
    + '</div>';
  var foot = '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="aiExpandGo" onclick="aiExpandGenerate()">'+I.sparkle+tr("Generate expand")+'</button>';
  openModal(tr("Crop & expand canvas"), body, foot, true);
  setTimeout(function(){ aiExpandLayout(); aiExpandBindHandles(); }, 0);
}
function aiExpandLayout(keepFields){
  var e = AI_EXPAND; if (!e) return;
  var scale = aiExpandScale(), t = aiExpandTotals();
  var frame = document.getElementById("aiExpandFrame"), img = document.getElementById("aiExpandImg");
  if (!frame || !img) return;
  frame.style.width = Math.round(t.w*scale)+"px"; frame.style.height = Math.round(t.h*scale)+"px";
  img.style.left = Math.round(e.left*scale)+"px"; img.style.top = Math.round(e.top*scale)+"px";
  img.style.width = Math.round(e.baseW*scale)+"px"; img.style.height = Math.round(e.baseH*scale)+"px";
  aiExpandLabel();
  var dims = document.getElementById("aiExpandDims"); if (dims) dims.textContent = t.w+" × "+t.h;
  var chips = document.querySelectorAll(".ai-expand-ratios button");
  for (var i=0;i<chips.length;i++) chips[i].classList.toggle("on", !!AI_EXPAND_RATIOS[i] && AI_EXPAND_RATIOS[i][0]===e.ratio);
  if (!keepFields) ["top","right","bottom","left"].forEach(function(s){ var n=document.getElementById("aiExpandN_"+s); if (n) n.value = Math.round(e[s]); });
}
var AI_EXPAND_MIN = 64;   /* never let a crop eat the picture entirely */
function aiExpandClamp(){
  var e = AI_EXPAND;
  ["top","right","bottom","left"].forEach(function(s){ e[s] = Math.round(+e[s]||0); });
  /* per axis: the two cuts together may not take the picture below the minimum */
  function limitCrop(a,b,base){
    var room = Math.max(0, Math.round(base) - AI_EXPAND_MIN);
    var cutA = Math.max(0,-e[a]), cutB = Math.max(0,-e[b]), total = cutA + cutB;
    if (total <= room) return;
    if (!room){ if (e[a]<0) e[a]=0; if (e[b]<0) e[b]=0; return; }
    var keep = room / total;
    if (e[a] < 0) e[a] = -Math.floor(cutA * keep);
    if (e[b] < 0) e[b] = -Math.floor(cutB * keep);
  }
  /* per axis: the two additions together may not push the canvas past the pixel ceiling */
  function limitGrow(a,b,base){
    var room = Math.max(0, 4096 - (Math.round(base) - Math.max(0,-e[a]) - Math.max(0,-e[b])));
    var addA = Math.max(0,e[a]), addB = Math.max(0,e[b]), total = addA + addB;
    if (total <= room) return;
    var keep = room / total;
    if (e[a] > 0) e[a] = Math.floor(addA * keep);
    if (e[b] > 0) e[b] = Math.floor(addB * keep);
  }
  limitCrop("left","right",e.baseW); limitCrop("top","bottom",e.baseH);
  limitGrow("left","right",e.baseW); limitGrow("top","bottom",e.baseH);
}
function aiExpandSetSide(side,value){
  if (!AI_EXPAND) return;
  AI_EXPAND[side] = Math.round(+value||0); AI_EXPAND.ratio = "free";
  aiExpandClamp(); aiExpandLayout(true);
}
function aiExpandResetSides(){
  if (!AI_EXPAND) return;
  AI_EXPAND.top = AI_EXPAND.right = AI_EXPAND.bottom = AI_EXPAND.left = 0; AI_EXPAND.ratio = "free";
  aiExpandLayout();
}
function aiExpandApplyRatio(key){
  var e = AI_EXPAND; if (!e) return;
  e.ratio = key;
  if (key === "free") { aiExpandLayout(); return; }
  if (key === "orig") { e.top=e.right=e.bottom=e.left=0; aiExpandLayout(); return; }
  var map = {"1:1":1, "4:5":4/5, "16:9":16/9, "9:16":9/16}, target = map[key];
  var targetW = e.baseW, targetH = e.baseH;
  if (e.baseW/e.baseH < target) targetW = Math.round(e.baseH*target); else targetH = Math.round(e.baseW/target);
  var addW = Math.max(0,targetW-e.baseW), addH = Math.max(0,targetH-e.baseH);
  e.left = Math.round(addW/2); e.right = addW-e.left;
  e.top = Math.round(addH/2); e.bottom = addH-e.top;
  aiExpandClamp(); aiExpandLayout();
}
function aiExpandBindHandles(){
  var frame = document.getElementById("aiExpandFrame"); if (!frame || frame.dataset.bound) return; frame.dataset.bound = "1";
  frame.querySelectorAll(".ai-expand-handle").forEach(function(h){
    h.addEventListener("pointerdown", function(ev){ aiExpandDragStart(ev, h.getAttribute("data-dir")); });
  });
}
function aiExpandDragStart(ev,dir){
  ev.preventDefault(); ev.stopPropagation();
  var e = AI_EXPAND; if (!e) return;
  var scale = aiExpandScale();
  var start = { x:ev.clientX, y:ev.clientY, top:e.top, right:e.right, bottom:e.bottom, left:e.left };
  function move(mv){
    var dx = (mv.clientX-start.x)/scale, dy = (mv.clientY-start.y)/scale;
    if (dir.indexOf("e")>=0) e.right = start.right+dx;
    if (dir.indexOf("w")>=0) e.left = start.left-dx;
    if (dir.indexOf("s")>=0) e.bottom = start.bottom+dy;
    if (dir.indexOf("n")>=0) e.top = start.top-dy;
    e.ratio = "free"; aiExpandClamp(); aiExpandLayout();
  }
  function up(){ window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up); }
  window.addEventListener("pointermove",move); window.addEventListener("pointerup",up,{once:true});
}
/* Trimming alone needs no model, so the button says so and the run stays local and free. */
function aiExpandLabel(){
  var btn = document.getElementById("aiExpandGo"); if (!btn || !AI_EXPAND || AI_EXPAND.busy) return;
  var t = aiExpandTotals();
  btn.disabled = false;
  btn.innerHTML = t.grows ? I.sparkle+tr("Generate expand") : (t.trims ? I.expand+tr("Apply crop") : I.sparkle+tr("Generate expand"));
}
function aiExpandSetBusy(on){
  var btn = document.getElementById("aiExpandGo"); if (!btn) return;
  if (on){ btn.disabled = true; btn.innerHTML = '<i class="ai-button-spinner" aria-hidden="true"></i>'+tr("Expanding…"); return; }
  aiExpandLabel();
}
/* Mirrors aiImageProvider() on the server, where the configured endpoint host outranks the
   registry entry's provider — one workspace has one image credential, so the host is what the
   request will actually reach. The two must agree or the payload arrives in the wrong shape. */
var AI_EXPAND_MAGNIFIC_MODELS = ["flux-pro", "seedream-v4-5"];
function aiExpandProvider(){
  var m = aiExpandEffectiveModel(), c = aiCfg().image, host = "";
  try { host = new URL(c.endpoint||"").hostname; } catch(e){}
  if (/^(api\.)?magnific\.(com|ai)$|(^|\.)freepik\.com$/.test(host)) return "magnific";
  if (host === "api.openai.com") return "openai";
  if (host === "generativelanguage.googleapis.com") return "gemini";
  var id = String((m&&m.modelId)||"");
  if (/^(gpt-image|dall-e)/i.test(id)) return "openai";
  if (/^(gemini|imagen)/i.test(id)) return "gemini";
  return (m&&m.provider) || c.provider || "magnific";
}
/* Magnific expands from the untouched picture plus per-side pixels; every other provider
   fills whatever is transparent, so it gets the enlarged canvas with the border cleared. */
function aiExpandPadded(){ return aiExpandProvider() !== "magnific"; }
function aiExpandBuildComposite(cb,plainCrop){
  var e = AI_EXPAND, t = aiExpandTotals(), padded = !plainCrop && aiExpandPadded();
  var cv = document.createElement("canvas");
  /* padded: the full new canvas with the kept crop placed and the rest left transparent.
     plain: just the kept crop, which is what Magnific expands from and what a crop-only run is. */
  cv.width = padded ? t.w : t.cropW; cv.height = padded ? t.h : t.cropH;
  var g = cv.getContext("2d");
  var im = new Image(); im.crossOrigin = "anonymous";
  im.onload = function(){
    g.clearRect(0,0,cv.width,cv.height);
    g.drawImage(im, t.cropX, t.cropY, t.cropW, t.cropH, padded ? t.dx : 0, padded ? t.dy : 0, t.cropW, t.cropH);
    cb(cv,t);
  };
  im.onerror = function(){ toast(tr("Could not load the current visual to expand."), "bad"); aiExpandSetBusy(false); AI_EXPAND.busy=false; };
  im.src = e.srcUrl;
}
/* one place that lands a finished picture on the canvas, whether AI made it or a crop did */
function aiExpandApplyResult(url,w,h,promptText,modelId,recordRun){
  aiHistoryBefore();
  AI_LAST = { imgUrl:url, w:w, h:h, prompt:promptText||"", model:modelId||"", at:new Date().toISOString(), fields:clone(AIF) };
  AIF.size = "custom"; AIF.customW = w; AIF.customH = h;
  var layer = (AIF.extraLayers||[]).filter(function(x){ return x.id===AI_EXPAND.layerId; })[0];
  if (layer) layer.src = url; else aiAddGeneratedLayer(url, {w:w,h:h});
  if (recordRun){ AI_RUNS.unshift({ url:url, prompt:promptText||"", w:w, h:h, model:modelId||"", at:AI_LAST.at, headline:AIF.headline, fields:aiRunSettings() }); aiSaveRuns(); }
  AI_EXPAND = null; closeModal(); renderScreen(false);
}
function aiExpandGenerate(){
  var e = AI_EXPAND; if (!e || e.busy) return;
  var totals = aiExpandTotals();
  if (!totals.grows && !totals.trims) return toast(tr("Drag an edge first — inward to crop, outward to expand."), "bad");
  /* trimming only: no model, no cost, no waiting */
  if (!totals.grows) return aiExpandBuildComposite(function(cv,t){
    aiExpandApplyResult(cv.toDataURL("image/png"), t.cropW, t.cropH, "", "", false);
    toast(tr("Cropped — new size applied"));
  }, true);
  e.busy = true; aiExpandSetBusy(true);
  aiExpandBuildComposite(function(cv,t){
    var body;
    try {
      var chosen = aiExpandEffectiveModel();
      body = { image: cv.toDataURL("image/png"), width: t.w, height: t.h, padded: aiExpandPadded(),
        left: Math.max(0,Math.round(e.left)), right: Math.max(0,Math.round(e.right)),
        top: Math.max(0,Math.round(e.top)), bottom: Math.max(0,Math.round(e.bottom)),
        prompt: ((document.getElementById("aiExpandPrompt")||{}).value||"").trim(),
        negativePrompt: aiNegative(),
        modelRegistryId: chosen?chosen.id:null, model:(chosen?chosen.modelId:aiCfg().image.model||"").trim() };
    } catch(err){
      e.busy = false; aiExpandSetBusy(false);
      return toast(tr("Expand failed: ")+err.message, "bad");
    }
    apiFetch("POST","/api/ai/expand",body).then(function(res){
      e.busy = false;
      var url = res.imageUrl; if (!url) throw new Error("The provider returned no image.");
      aiExpandApplyResult(url, t.w, t.h, body.prompt, body.model, true);
      toast(tr("Canvas expanded — new size applied"));
    }).catch(function(err){
      e.busy = false; aiExpandSetBusy(false);
      toast(tr("Expand failed: ")+err.message, "bad");
    });
  });
}
</script>
