<script>
/* ============================================================
   BRAND FONTS (Oct 2026)
   Font files an admin uploads (Settings → AI → Providers → Brand fonts): TTF, OTF, WOFF or WOFF2, up to 5 MB.
   Each file is one font under its own name, so "Gilroy Black Italic" is that file exactly, never a weight or
   slant the browser makes up. They join every font list in AI Hub (headline, subheadline, text layers, the
   template editor) and draw on the canvas and in every export. Members use them; only admins add, rename or
   remove them. Stored on the server like pictures (/files/…, signed-in only); what a file is, the server reads
   from its first bytes.
   ============================================================ */
var AI_FONT_MAX = 20, AI_FONT_BYTES = 5000000, AI_FONT_FACES = {};
function aiFontUrlOk(u){ u=String(u||""); return /^\/files\/[a-f0-9]{64}\.(woff2|woff|ttf|otf)$/.test(u) || /^data:[a-z0-9.+\/-]*;base64,[A-Za-z0-9+\/=]+$/i.test(u); }
function aiFontsAll(){ return ((typeof WS!=="undefined"&&WS.ai&&WS.ai.fonts)||[]).filter(function(f){ return f&&f.id; }); }
function aiUploadedFonts(){ return aiFontsAll().filter(function(f){ return f.name&&aiFontUrlOk(f.url); }); }
function aiUploadedFontNames(){ aiFontsLoad(); return aiUploadedFonts().map(function(f){ return f.name; }); }
/* a name fit for font lists and CSS: letters, digits, spaces, dots, dashes, underscores */
function aiFontCleanName(s){ return String(s||"").replace(/[^\p{L}\p{N} ._-]+/gu," ").replace(/\s+/g," ").trim().slice(0,60); }
/* "Gilroy-BlackItalic.otf" → "Gilroy Black Italic", unique among the fonts already there */
function aiFontNameFrom(file){
  var n=aiFontCleanName(String(file||"").replace(/\.[a-z0-9]+$/i,"").replace(/[-_]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2"))||tr("Brand font"), taken={};
  aiFontsAll().forEach(function(f){ taken[String(f.name||"").toLowerCase()]=1; });
  for(var i=2,base=n.slice(0,56); taken[n.toLowerCase()]; i++) n=base+" "+i;
  return n;
}
/* each file as its own face, for any weight asked of it, so a Black file is never made bolder still. The faces are
   known to the browser once the workspace arrives, but a file is fetched only when something first needs it
   (Oct 2026): a canvas (AI Hub's, a download, an export — aiCompose waits for them, below), the previews in
   Settings → Brand fonts, or text on the page set in one. Not at every sign-in, for everyone: a file can be 5 MB. */
function aiFontsLoad(){
  if(typeof FontFace==="undefined"||typeof document==="undefined"||!document.fonts) return;
  var want={};
  aiUploadedFonts().forEach(function(f){ var key=f.name+"|"+f.url; want[key]=1; if(AI_FONT_FACES[key]) return;
    try{ var face=new FontFace(f.name,'url("'+f.url+'")',{weight:"1 1000",style:"normal",display:"swap"}); AI_FONT_FACES[key]=face; document.fonts.add(face);
      face.loaded.then(function(){ if(typeof S!=="undefined"&&S.screen==="aihub"&&typeof aiPreviewSoon==="function") aiPreviewSoon(); }).catch(function(){}); }catch(e){} });
  Object.keys(AI_FONT_FACES).forEach(function(key){ if(want[key]) return; try{ document.fonts.delete(AI_FONT_FACES[key]); }catch(e){} delete AI_FONT_FACES[key]; });
}
/* every brand font fetched: null when all are in already (or could not be read), else a promise of when they are */
function aiFontsReady(){
  aiFontsLoad(); var waits=[];
  Object.keys(AI_FONT_FACES).forEach(function(key){ var face=AI_FONT_FACES[key]; if(face.status==="loaded"||face.status==="error") return; try{ waits.push(face.load().catch(function(){})); }catch(e){} });
  return waits.length?Promise.all(waits):null;
}
/* the first bytes of a font file */
function aiFontKind(bytes){ var b=new Uint8Array(bytes), s=String.fromCharCode.apply(null,Array.prototype.slice.call(b,0,4));
  if(s==="wOF2") return "woff2"; if(s==="wOFF") return "woff"; if(s==="OTTO") return "otf"; if((b[0]===0&&b[1]===1&&b[2]===0&&b[3]===0)||s==="true") return "ttf"; return null; }

/* ---------- Settings: the admin's list ---------- */
function setAIFonts(){
  var ed=canI.manageWorkspace(), list=aiFontsAll(); aiFontsReady();   /* each row previews its font */
  var rows=list.map(function(f){ var id=jsq(f.id), ext=(String(f.url).match(/\.(woff2|woff|ttf|otf)$/)||[])[1]||f.kind||"";   /* kind: read from the file at upload, until the server's copy arrives */
    return '<div class="ai-font-row"><div class="ai-font-sample" style="font-family:\''+attr(aiFontCleanName(f.name))+'\',sans-serif" data-no-trans>Aa Bb 123 · TESTIMONI NASABAH</div>'
      + '<div class="field"><input value="'+attr(f.name||"")+'" maxlength="60" aria-label="'+attr(tr("Font name"))+'"'+(ed?'':' disabled')+' onchange="aiFontRename('+id+',this.value)"></div>'
      + (ext?'<span class="badge mono">'+esc(ext.toUpperCase())+'</span>':'<span></span>')
      + (ed?'<button type="button" class="iconbtn" title="'+attr(tr("Delete font"))+'" aria-label="'+attr(tr("Delete font"))+'" onclick="aiFontDelete('+id+')">'+I.trash+'</button>':'<span></span>')+'</div>'; }).join("");
  return sp("Brand fonts",
    '<p class="hint" style="margin-bottom:12px">'+tr("Fonts uploaded here appear in every font list in AI Hub and draw in every export. TTF, OTF, WOFF or WOFF2, up to 5 MB. Each file is one font: upload the weights you use as separate files (Bold, Black Italic…). Only upload fonts your licence lets the team use this way.")+'</p>'
    + (rows||'<div class="hint">'+tr("No brand fonts yet.")+'</div>'),
    ed&&list.length<AI_FONT_MAX?'<button class="btn" onclick="aiFontPick()">'+I.up+tr("Upload font")+'</button>':'', I.edit);
}
/* the server stores new files; its copy replaces ours so they are not sent again */
function aiFontSave(msg){
  return persistWS().then(function(ws){ if(ws===false) return false; if(ws&&ws.ai&&Array.isArray(ws.ai.fonts)) WS.ai.fonts=ws.ai.fonts; aiFontsLoad(); toast(tr(msg||"Brand fonts saved")); });
}
function aiFontPick(){
  var input=document.createElement("input"); input.type="file"; input.accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";
  input.onchange=function(){ var f=input.files&&input.files[0]; if(!f) return;
    if(f.size>AI_FONT_BYTES) return toast(tr("Keep each font under 5 MB"),"bad");
    f.slice(0,4).arrayBuffer().then(function(head){
      var kind=aiFontKind(head); if(!kind) return toast(tr("That file is not a TTF, OTF, WOFF or WOFF2 font"),"bad");
      var rd=new FileReader(); rd.onload=function(){
        WS.ai=WS.ai||{}; var list=aiFontsAll(); if(list.length>=AI_FONT_MAX) return;
        list.push({ id:"fn_"+Math.random().toString(36).slice(2,10), name:aiFontNameFrom(f.name), url:rd.result, kind:kind });
        WS.ai.fonts=list; aiFontsLoad(); renderScreen(false); aiFontSave("Font added"); };
      rd.readAsDataURL(f);
    }).catch(function(){ toast(tr("That file is not a TTF, OTF, WOFF or WOFF2 font"),"bad"); });
  };
  input.click();
}
/* a new name is carried into the templates and the open design that use the old one */
function aiFontRename(id,value){
  var f=aiFontsAll().filter(function(x){ return x.id===id; })[0]; if(!f) return;
  var name=aiFontCleanName(value); if(!name||name===f.name){ renderScreen(false); return; }
  if(aiFontsAll().some(function(x){ return x.id!==id&&String(x.name).toLowerCase()===name.toLowerCase(); })){ toast(tr("Another font already has that name"),"bad"); renderScreen(false); return; }
  var old=f.name; f.name=name;
  var swap=function(o){ if(!o) return; if(o.headlineFont===old) o.headlineFont=name; if(o.subFont===old) o.subFont=name; (o.extraLayers||[]).forEach(function(x){ if(x&&x.font===old) x.font=name; }); };
  ((WS.ai&&WS.ai.promptTemplates)||[]).forEach(function(t){ swap(t); swap(t.editorFields); });
  if(typeof AIF!=="undefined") swap(AIF);
  aiFontsLoad(); renderScreen(false); aiFontSave("Font renamed");
}
function aiFontDelete(id){
  confirmModal(tr("Delete font?"),tr("Designs and templates that use it fall back to the workspace font."),function(){
    WS.ai.fonts=aiFontsAll().filter(function(f){ return f.id!==id; }); aiFontsLoad(); renderScreen(false); aiFontSave("Font deleted");
  },true);
}
/* known to the browser as soon as the workspace arrives; fetched when first needed (aiFontsLoad) */
(function(){ if(typeof loadBootstrap!=="function") return; var base=loadBootstrap; loadBootstrap=function(){ var r=base.apply(this,arguments); try{ aiFontsLoad(); }catch(e){} return r; }; })();
/* a canvas is drawn once the brand fonts are in, so it never draws in a stand-in font, and they are fetched the first
   time one is drawn. A font that has not arrived after 8 s (30 s for a download or an export) does not hold the
   drawing up any longer; the preview is drawn again when it arrives (aiFontsLoad). */
(function(){ if(typeof aiCompose!=="function") return; var base=aiCompose;
  aiCompose=function(cb,previewOnly){ var self=this, args=arguments, wait=aiFontsReady(); if(!wait) return base.apply(self,args);
    var done=false, draw=function(){ if(done) return; done=true; base.apply(self,args); }; wait.then(draw); setTimeout(draw,previewOnly?8000:30000); }; })();
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Brand fonts":"Font brand",
  "Fonts uploaded here appear in every font list in AI Hub and draw in every export. TTF, OTF, WOFF or WOFF2, up to 5 MB. Each file is one font: upload the weights you use as separate files (Bold, Black Italic…). Only upload fonts your licence lets the team use this way.":"Font yang diunggah di sini muncul di semua pilihan font AI Hub dan ikut di setiap ekspor. TTF, OTF, WOFF, atau WOFF2, maksimal 5 MB. Satu file adalah satu font: unggah setiap ketebalan yang dipakai sebagai file terpisah (Bold, Black Italic…). Unggah hanya font yang lisensinya mengizinkan tim memakainya seperti ini.",
  "No brand fonts yet.":"Belum ada font brand.",
  "Upload font":"Unggah font",
  "Font name":"Nama font",
  "Delete font":"Hapus font",
  "Delete font?":"Hapus font?",
  "Designs and templates that use it fall back to the workspace font.":"Desain dan template yang memakainya kembali ke font workspace.",
  "Brand font":"Font brand",
  "Brand fonts saved":"Font brand tersimpan",
  "Font added":"Font ditambahkan",
  "Font renamed":"Nama font diubah",
  "Font deleted":"Font dihapus",
  "Keep each font under 5 MB":"Ukuran tiap font maksimal 5 MB",
  "That file is not a TTF, OTF, WOFF or WOFF2 font":"File itu bukan font TTF, OTF, WOFF, atau WOFF2",
  "Another font already has that name":"Sudah ada font lain dengan nama itu",
  "Headline font":"Font judul",
  "Subheadline font":"Font subjudul",
  "Workspace font":"Font workspace"
});
</script>
