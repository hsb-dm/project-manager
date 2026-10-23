<script>
/* ============================================================
   AI HUB TEMPLATES FROM THE CANVAS (Oct 2026)
   A role with "Save AI Hub canvases as templates for everyone" (save_ai_templates; an admin chooses the roles)
   saves what is on the canvas as a template everyone can start from: the size, layout, layers, pictures, colours,
   fonts, characters and copy, exactly as they are. A template opened in AI Hub can be changed there and saved back
   over itself. Its maker changes or removes their own; an admin any, the built-in ones too. Pictures are stored
   as files on the server (large ones made lighter first; a picture still on the AI provider's site is fetched
   first), so templates never weigh down the workspace. The server keeps the list (/api/ai/templates); in the
   standalone demo it stays in the page.
   ============================================================ */
/* two permissions (Oct 2026): templates for everyone, and templates for oneself (the everyone one covers both) */
canI.saveAiTemplates=function(){ return !API.on||has("save_ai_templates"); };
canI.saveOwnAiTemplates=function(){ return !API.on||has("save_own_ai_templates")||has("save_ai_templates"); };
function aiTemplateCanSave(){ return canI.saveAiTemplates()||canI.saveOwnAiTemplates(); }
function aiTemplateMayKeep(isPrivate){ return isPrivate?canI.saveOwnAiTemplates():canI.saveAiTemplates(); }
function aiTemplateCanEdit(t){ if(!t) return false; if(!API.on||canI.manageWorkspace()) return true; return !!t.owner&&t.owner===ME&&aiTemplateMayKeep(!!t.private); }
/* the template being worked on: the one opened last, even after its brief was changed */
function aiTemplateOpen(){ var id=AIF.template||AIF.templateSource; return id?byId(aiPromptTemplates(),id):null; }
/* the canvas as a template */
function aiTemplateFromCanvas(name){
  var f=clone(AIF);
  ["selectedLayer","selectedLayers","panels","showSafeZones","editMode","reference","referenceName","template","templateSource","styleMode"].forEach(function(k){ delete f[k]; });
  var hex=function(v){ return /^#[0-9a-f]{6}$/i.test(String(v||""))?v:undefined; };
  return { name:name, brief:AIF.brief||"", style:AIF.style||"", negative:AIF.negative||"", headline:AIF.headline||"", sub:AIF.sub||"", cta:AIF.cta||"", badge:AIF.badge||"",
    size:AIF.size, customW:+AIF.customW||undefined, customH:+AIF.customH||undefined, layout:AIF.layout,
    background:hex((AIF.canvasBg||{}).color||AIF.background), textColor:hex(aiLayerStyle("headline").textFill), subColor:hex(aiLayerStyle("sub").textFill),
    accentColor:hex(AIF.accentColor), badgeColor:hex(AIF.badgeColor), ctaColor:hex(AIF.ctaColor), ctaStroke:!!AIF.ctaStroke, ctaStrokeColor:hex(AIF.ctaStrokeColor), ctaRadius:+AIF.ctaRadius||0,
    textAlign:AIF.textAlign||"auto", disclaimerText:AIF.disclaimer?String(AIF.disclaimerText||""):"", headlineFont:AIF.headlineFont||"", subFont:AIF.subFont||"", headlineWeight:+AIF.headlineWeight||0, subWeight:+AIF.subWeight||0,
    people:typeof aiCharactersOn==="function"&&aiCharactersOn()?Math.min(2,(AIF.characters||[]).length):0, characterPrompt:String(AIF.characterRole||""), logoPosition:AIF.logoPosition, safeUnit:AIF.safeUnit, safeLocked:AIF.safeLocked!==false,
    safeMargin:+AIF.safeTop||0, safeTop:+AIF.safeTop||0, safeRight:+AIF.safeRight||0, safeBottom:+AIF.safeBottom||0, safeLeft:+AIF.safeLeft||0, editorFields:f };
}
/* a picture the server can store: our own file as it is; a data URL, made lighter when it is large; anything
   else (a provider's link) fetched first */
function aiTemplatePicture(src){
  src=String(src||""); if(!src||/^\/files\//.test(src)) return Promise.resolve(src);
  var redo=function(url){ return new Promise(function(res,rej){ var im=new Image(); im.onload=function(){ var s=Math.min(1,2048/Math.max(im.width,im.height)), cv=document.createElement("canvas"); cv.width=Math.max(1,Math.round(im.width*s)); cv.height=Math.max(1,Math.round(im.height*s)); cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height); var out=cv.toDataURL("image/webp",0.9); res(/^data:image\/webp/.test(out)?out:cv.toDataURL("image/jpeg",0.9)); }; im.onerror=rej; im.src=url; }); };
  var fit=function(url){ return /^data:image\/(png|jpeg|webp|gif);base64,/.test(url)&&url.length<=2600000?url:redo(url); };
  if(/^data:image\//.test(src)) return Promise.resolve(fit(src));
  return fetch(src).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.blob(); })
    .then(function(blob){ return new Promise(function(res,rej){ var rd=new FileReader(); rd.onload=function(){ res(rd.result); }; rd.onerror=rej; rd.readAsDataURL(blob); }); })
    .then(fit);
}
function aiTemplatePrepare(t){
  var x=clone(t), f=x.editorFields||{}, jobs=[];
  if(f.logoImg) jobs.push(aiTemplatePicture(f.logoImg).then(function(v){ f.logoImg=v; }));
  (f.extraLayers||[]).forEach(function(l){ if(l&&l.type==="image"&&l.src) jobs.push(aiTemplatePicture(l.src).then(function(v){ l.src=v; })); });
  return Promise.all(jobs).then(function(){ return x; }, function(){ throw new Error(tr("A picture in this design could not be saved. Download it and add it again as an image layer.")); });
}
/* new or changed; resolves to the template's id, or null when it could not be saved */
function aiTemplatePut(t,isNew){
  WS.ai=WS.ai||{};
  if(!API.on){ var list=(WS.ai.promptTemplates||[]).filter(function(x){ return x&&x.id!==t.id; }); if(isNew){ t.id="p_"+Math.random().toString(36).slice(2,9); t.owner=ME; } list.push(t); WS.ai.promptTemplates=list; saveWS(isNew?"Template saved for everyone":"Template updated"); renderScreen(false); return Promise.resolve(t.id); }
  toast(tr("Saving template…"));
  return aiTemplatePrepare(t).then(function(ready){ return apiFetch(isNew?"POST":"PUT",isNew?"/api/ai/templates":"/api/ai/templates/"+encodeURIComponent(t.id),{template:ready}); })
    .then(function(r){ WS.ai.promptTemplates=r.promptTemplates; toast(tr(!isNew?"Template updated":t.private?"Template saved for you":"Template saved for everyone")); renderScreen(false); return r.id||t.id; })
    .catch(function(e){ toast(tr("Couldn't save the template")+": "+e.message,"bad"); return null; });
}
function aiTemplateDelete(id){
  var t=byId(aiPromptTemplates(),id); if(!t) return;
  confirmModal(tr("Delete template?"),tr("It disappears from AI Hub for everyone. Designs already made from it are not changed."),function(){
    var done=function(){ if(AIF.template===id) AIF.template=""; if(AIF.templateSource===id) AIF.templateSource=""; toast(tr("Template deleted")); renderScreen(false); };
    if(!API.on){ WS.ai=WS.ai||{}; var list=(WS.ai.promptTemplates||[]).filter(function(x){ return x&&x.id!==id; }); if(!t.owner) list.push({id:id,deleted:true}); WS.ai.promptTemplates=list; saveWS(); done(); return; }
    apiFetch("DELETE","/api/ai/templates/"+encodeURIComponent(id)).then(function(r){ WS.ai.promptTemplates=r.promptTemplates; done(); }).catch(function(e){ toast(tr("Couldn't delete the template")+": "+e.message,"bad"); });
  },true);
}

/* ---------- AI Hub: Save as template ---------- */
function aiTemplateSaveModal(){
  if(!aiTemplateCanSave()) return toast(tr("Your role cannot save templates for everyone."),"bad");
  var cur=aiTemplateOpen(), upd=!!cur&&aiTemplateCanEdit(cur);
  openModal(tr("Save as template"),
    '<p class="hint" style="margin-bottom:12px">'+tr("Saves the size, layout, layers, pictures, colours, fonts and copy, exactly as on the canvas.")+'</p>'
    + (upd?'<div class="ai-tpl-choice" role="radiogroup" aria-label="'+attr(tr("Save as template"))+'"><label><input type="radio" name="ai_tpl_mode" value="update" checked onchange="aiTemplateModeSync()"> <span>'+tr("Update")+' “<span data-no-trans>'+esc(cur.name)+'</span>”</span></label><label><input type="radio" name="ai_tpl_mode" value="new" onchange="aiTemplateModeSync()"> <span>'+tr("Save as a new template")+'</span></label></div>':'')
    + fieldHtml("ai_tpl_name","Template name",'<input id="ai_tpl_name" maxlength="80" value="'+attr(upd?cur.name:"")+'" placeholder="'+attr(tr("e.g. Testimonial thumbnail"))+'">')
    /* who can start from it: everyone, or only the one saving it */
    + '<div class="field"><label>'+tr("Who can use it")+'</label><div class="ai-tpl-choice ai-tpl-audience" role="radiogroup" aria-label="'+attr(tr("Who can use it"))+'"><label><input type="radio" name="ai_tpl_aud" value="everyone"'+((upd?cur.private:!canI.saveAiTemplates())?'':' checked')+'> <span>'+tr("Everyone in the workspace")+'</span></label><label><input type="radio" name="ai_tpl_aud" value="me"'+((upd?cur.private:!canI.saveAiTemplates())?' checked':'')+'> <span>'+tr("Only me")+'</span></label></div><p class="hint" id="ai_tpl_aud_hint"></p></div>',
    (upd?'<button class="btn ghost" onclick="closeModal();aiTemplateDelete('+jsq(cur.id)+')">'+I.trash+tr("Delete template")+'</button><span class="spacer"></span>':'')
    + '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" onclick="aiTemplateSaveFromModal()">'+tr("Save template")+'</button>');
  aiTemplateModeSync();
}
/* a new template starts without the old one's name; going back to Update brings it back */
/* who sees it is the maker's to say: updating a built-in or someone else's template keeps whom it is for */
function aiTemplateModeSync(){ var el=document.querySelector('input[name="ai_tpl_mode"]:checked'), cur=aiTemplateOpen(), name=document.getElementById("ai_tpl_name"), aud=document.querySelectorAll('input[name="ai_tpl_aud"]'), hint=document.getElementById("ai_tpl_aud_hint");
  var updating=!!(el&&el.value==="update"&&cur), fixed=updating&&!(cur.owner&&cur.owner===ME);
  /* and each choice takes its own permission */
  Array.prototype.forEach.call(aud,function(r){ r.disabled=fixed||!aiTemplateMayKeep(r.value==="me"); });
  /* then which is chosen: the template's own when it is fixed, else one the role may use */
  Array.prototype.forEach.call(aud,function(r){ if(fixed) r.checked=r.value===(cur.private?"me":"everyone"); else if(r.checked&&r.disabled){ r.checked=false; var o=Array.prototype.filter.call(aud,function(x){ return x!==r&&!x.disabled; })[0]; if(o) o.checked=true; } });
  if(hint) hint.textContent=fixed?tr(cur.owner?"Only its maker decides who can use it.":"A built-in template is for everyone."):!canI.saveAiTemplates()?tr("Your role saves templates for yourself only."):!canI.saveOwnAiTemplates()?tr("Your role saves templates for everyone only."):"";
  if(!name||!cur) return;
  if(el&&el.value==="new"&&name.value===cur.name) name.value=""; else if(el&&el.value==="update"&&!name.value.trim()) name.value=cur.name; }
function aiTemplateSaveFromModal(){
  var name=val("ai_tpl_name"); if(!name) return toast(tr("Give the template a name"),"bad");
  var mode=(document.querySelector('input[name="ai_tpl_mode"]:checked')||{}).value||"new", cur=aiTemplateOpen(), isNew=!(mode==="update"&&cur&&aiTemplateCanEdit(cur));
  var t=aiTemplateFromCanvas(name); if(!isNew){ t.id=cur.id; if(cur.owner) t.owner=cur.owner; }
  var aud=document.querySelector('input[name="ai_tpl_aud"]:checked'); if(aud&&aud.value==="me") t.private=true;
  closeModal();
  aiTemplatePut(t,isNew).then(function(id){ if(id){ AIF.template=id; AIF.templateSource=id; if(typeof aiProjectMarkSaved==="function") aiProjectMarkSaved(); renderScreen(false); } });
}
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Save AI Hub canvases as templates for everyone":"Menyimpan kanvas AI Hub sebagai template untuk semua orang",
  "Save as template":"Simpan sebagai template",
  "Everyone in the workspace can start from it in AI Hub: the size, layout, layers, pictures, colours, fonts and copy, exactly as on the canvas.":"Semua orang di workspace bisa memulai dari template ini di AI Hub: ukuran, tata letak, layer, gambar, warna, font, dan teksnya persis seperti di kanvas.",
  "Update":"Perbarui",
  "Save as a new template":"Simpan sebagai template baru",
  "Template name":"Nama template",
  "e.g. Testimonial thumbnail":"mis. Thumbnail testimoni",
  "Delete template":"Hapus template",
  "Delete template?":"Hapus template?",
  "It disappears from AI Hub for everyone. Designs already made from it are not changed.":"Template hilang dari AI Hub untuk semua orang. Desain yang sudah dibuat darinya tidak berubah.",
  "Save template":"Simpan template",
  "Give the template a name":"Beri nama template",
  "Saving template…":"Menyimpan template…",
  "Template saved for everyone":"Template tersimpan untuk semua orang",
  "Template updated":"Template diperbarui",
  "Template deleted":"Template dihapus",
  "Couldn't save the template":"Template tidak bisa disimpan",
  "Couldn't delete the template":"Template tidak bisa dihapus",
  "Your role cannot save templates for everyone.":"Peranmu tidak bisa menyimpan template untuk semua orang.",
  "A picture in this design could not be saved. Download it and add it again as an image layer.":"Ada gambar di desain ini yang tidak bisa disimpan. Unduh gambarnya lalu tambahkan lagi sebagai layer gambar.",
  "By":"Oleh",
  "Saves the size, layout, layers, pictures, colours, fonts and copy, exactly as on the canvas.":"Menyimpan ukuran, tata letak, layer, gambar, warna, font, dan teks persis seperti di kanvas.",
  "Who can use it":"Siapa yang bisa memakainya",
  "Everyone in the workspace":"Semua orang di workspace",
  "Only me":"Hanya saya",
  "Only you":"Hanya kamu",
  "Only its maker decides who can use it.":"Hanya pembuatnya yang menentukan siapa yang bisa memakainya.",
  "A built-in template is for everyone.":"Template bawaan berlaku untuk semua orang.",
  "Template saved for you":"Template tersimpan untuk kamu",
  "Save AI Hub canvases as templates for themselves":"Menyimpan kanvas AI Hub sebagai template untuk diri sendiri",
  "Your role saves templates for yourself only.":"Peranmu hanya bisa menyimpan template untuk diri sendiri.",
  "Your role saves templates for everyone only.":"Peranmu hanya bisa menyimpan template untuk semua orang."
});
</script>
