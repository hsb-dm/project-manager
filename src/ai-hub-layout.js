<script>
/* ============================================================
   AI HUB FITS THE SCREEN (Oct 2026)
   The page scrolled and the Properties panel scrolled too, so a wheel turned outside a panel moved the canvas and
   the setup away while Properties stayed put. On a laptop or desktop (three columns: at least 1181 × 620) the page now stays still
   and each panel scrolls inside itself (v38.css): the header is one row, the "not connected" banner is a chip in
   it, the canvas fills its panel (Fit uses the panel's height), the generation history is a strip under the
   canvas, and Creative setup is in sections that fold (remembered per person). Smaller screens keep the page that
   scrolls, as before: a scroll inside a scroll is harder on a touch screen.
   ============================================================ */
function aiHubFits(){ try{ return window.matchMedia("(min-width:1181px) and (min-height:620px)").matches; }catch(e){ return false; } }
/* the canvas's room: its own panel when the page fits the screen, else as before */
function aiCanvasFitH(el){ if(!(aiHubFits()&&el&&el.clientHeight>120)) return Math.min(innerHeight*.62,620); return el.clientHeight-(el.closest(".ai-canvas-frame")?0:22); }   /* the rulers come in above it on the first draw */

/* ---------- sections that fold ---------- */
var AI_SEC_DEFAULT={ template:true, brief:true, characters:true, history:true };
function aiSecKey(){ return "cos.ai.sections."+((typeof ME!=="undefined"&&ME)||""); }
function aiSecState(){ var s={}; try{ s=JSON.parse(localStorage.getItem(aiSecKey())||"{}")||{}; }catch(e){} return Object.assign({},AI_SEC_DEFAULT,s); }
function aiSecIsOpen(id){ return !!aiSecState()[id]; }
function aiSecToggle(id,open){ var s=aiSecState(); s[id]=!!open; try{ localStorage.setItem(aiSecKey(),JSON.stringify(s)); }catch(e){} }
function aiSecOpenTag(id,title){ return '<details class="ai-details ai-sec" data-sec="'+id+'"'+(aiSecIsOpen(id)?' open':'')+' ontoggle="aiSecToggle(\''+id+'\',this.open)"><summary>'+esc(tr(title))+'</summary><div class="ai-details-body">'; }
function aiSecClose(){ return '</div></details>'; }
function aiSecCharacters(){ var h=typeof aiCharactersFieldHtml==="function"?aiCharactersFieldHtml():""; return h?aiSecOpenTag("characters","Brand characters")+h+aiSecClose():""; }

/* ---------- the header chip that was a banner ---------- */
function aiConnChip(gs){
  gs=gs||{}; var fix=gs.kind==="nomodel"?"models":"providers", why=(gs.reason||tr("Add an image API key to generate visuals."))+" "+tr("You can still compose and export the branded template.");
  return '<button type="button" class="ai-conn-chip" title="'+attr(why)+'" aria-label="'+attr(why)+'" onclick="S.aiSettingsSection=\''+fix+'\';go(\'settings\',\'ai\')"><i aria-hidden="true"></i>'+tr(gs.kind==="nomodel"?"No image model":"Image generation not connected")+'</button>';
}

/* a generation taken out of the history (kept in this browser, per workspace), with Undo for a few seconds; the
   picture stays wherever else it was kept — AI Gallery, Assets */
function aiDeleteRun(i){
  var r=AI_RUNS[i]; if(!r) return;
  AI_RUNS.splice(i,1); aiSaveRuns(); renderScreen(false);
  var back=function(){ AI_RUNS.splice(Math.min(i,AI_RUNS.length),0,r); aiSaveRuns(); renderScreen(false); };
  if(typeof undoToast==="function") undoToast("Removed from history",back); else toast("Removed from history");
}

/* ---------- generation history, a strip under the canvas ---------- */
function aiHistoryStrip(){
  var open=aiSecIsOpen("history"), runs=AI_RUNS.slice(0,typeof aiHistoryLimit==="function"?aiHistoryLimit():24);
  var items=runs.map(function(r,i){
    var label=(r.headline||tr("Generated visual"))+" · "+aiSettingsLabel(r.fields||{size:"custom",customW:r.w,customH:r.h,layout:"left",model:r.model})+(r.brief&&(r.brief.task_title||r.brief.task_id)?" · "+tr("Generated from Task")+": "+(r.brief.task_title||r.brief.task_id):"");
    /* a click puts the whole design back; the eye shows only its picture. A picture the provider no longer keeps
       shows the placeholder, not a broken image. */
    return '<div class="ai-hs-item"><button type="button" class="ai-hs-thumb" title="'+attr(label)+'" aria-label="'+attr((r.fields?tr("Use settings"):tr("Preview"))+": "+label)+'" onclick="'+(r.fields?'aiLoadRunSettings('+i+')':'aiReuse('+i+')')+'">'+(r.url?'<img src="'+attr(r.url)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="ai-history-placeholder" hidden>'+I.image+'</span>':'<span class="ai-history-placeholder">'+I.image+'</span>')+'</button>'
      + (r.fields&&r.url?'<button type="button" class="ai-hs-peek" title="'+attr(tr("Preview"))+'" aria-label="'+attr(tr("Preview")+": "+label)+'" onclick="aiReuse('+i+')">'+I.eye+'</button>':'')
      + '<button type="button" class="ai-hs-del" title="'+attr(tr("Remove from history"))+'" aria-label="'+attr(tr("Remove from history")+": "+label)+'" onclick="aiDeleteRun('+i+')">'+I.trash+'</button></div>'; }).join("");
  return '<div class="ai-history-strip'+(open?' open':'')+'"><div class="ai-hs-head"><button type="button" class="ai-hs-toggle" aria-expanded="'+(open?"true":"false")+'" onclick="aiSecToggle(\'history\',!aiSecIsOpen(\'history\'));renderScreen(false)">'+I.sync+'<span>'+tr("Generation history")+'</span><span class="cnt">'+(typeof aiHistoryUsageLabel==="function"?aiHistoryUsageLabel():AI_RUNS.length)+'</span>'
    + (typeof aiHistoryLimit==="function"&&AI_RUNS.length>=aiHistoryLimit()?'<span class="badge warn" title="'+attr(tr("Oldest generation is removed automatically."))+'">'+tr("At capacity")+'</span>':'')+(items?'':'<span class="hint ai-hs-empty">'+tr("No visuals generated yet.")+'</span>')+'<span class="ai-hs-caret" aria-hidden="true"></span></button>'
    + (AI_PREVIOUS_SETTINGS?'<button type="button" class="btn xs" onclick="aiRestoreRecentSettings()">'+tr("Restore recent")+'</button>':'')+'</div>'
    /* nothing generated yet: one line, so the canvas keeps the room */
    + (open&&items?'<div class="ai-hs-track">'+items+'</div>':'')+'</div>';
}

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Template":"Template",
  "Brief & style":"Brief & gaya",
  "Image generation not connected":"Generate gambar belum terhubung",
  "No image model":"Belum ada model gambar",
  "Generation history":"Riwayat generate",
  "Generated visual":"Visual hasil generate",
  "No visuals generated yet.":"Belum ada visual yang dibuat.",
  "Restore recent":"Kembalikan pengaturan terbaru",
  "Remove from history":"Hapus dari riwayat","Removed from history":"Dihapus dari riwayat",
  "At capacity":"Penuh",
  "Use settings":"Gunakan pengaturan",
  "Preview":"Pratinjau"
});
</script>
