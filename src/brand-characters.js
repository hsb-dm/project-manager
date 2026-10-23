<script>
/* ============================================================
   BRAND CHARACTERS (Oct 2026)
   People an admin sets up once (Settings → AI → Providers → Brand characters) as the main
   reference whenever someone in AI Hub generates a person: a name, a short description and one
   to three photos each. Members choose up to two in AI Hub; a template with people (`people: n`)
   chooses the first n itself. The photos only go to a model with the "reference" capability, and
   on a server they travel as ids: the server reads the files from the workspace, so a generation
   can never be pointed at some other picture.
   ============================================================ */
var AI_CHAR_MAX = 6, AI_CHAR_PHOTOS = 3, AI_CHAR_PICK = 2;
function aiCharPhotoOk(u){ u=String(u||""); return /^\/files\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(u) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(u); }
function aiCharactersAll(){ return ((typeof WS!=="undefined"&&WS.ai&&WS.ai.characters)||[]).filter(function(c){ return c&&c.id; }); }
/* the ones a generation can use: those with at least one photo */
function aiCharacters(){ return aiCharactersAll().filter(function(c){ return (c.photos||[]).some(aiCharPhotoOk); }); }
function aiCharactersFor(n){ n=Math.max(0,Math.min(AI_CHAR_PICK,+n||0)); return aiCharacters().slice(0,n).map(function(c){ return c.id; }); }
/* Characters are optional (Oct 2026): a switch in AI Hub puts them in or leaves them out. A template with people
   turns it on and chooses them; any other starts with it off. A design from before the switch counts as on when it
   has characters chosen. */
function aiCharactersOn(){ if(typeof AIF==="undefined") return false; return AIF.useCharacters!==undefined?!!AIF.useCharacters:(AIF.characters||[]).length>0; }
/* Which provider a generation really goes to, as the server decides it (aiImageProvider): the workspace's image
   endpoint first (a Magnific one sends everything to Mystic, whatever the model is called), then the model. */
function aiImageRoute(){
  var c=(typeof aiCfg==="function"?aiCfg().image:{})||{}, m=typeof aiResolveModel==="function"?aiResolveModel(AIF&&AIF.modelRegistryId):null, host="";
  try{ host=new URL(c.endpoint).hostname; }catch(e){}
  if(/^(api\.)?magnific\.(com|ai)$|(^|\.)freepik\.com$/.test(host)) return "magnific";
  if(host==="api.openai.com") return "openai"; if(host==="generativelanguage.googleapis.com") return "gemini";
  var id=(m&&m.modelId)||c.model||""; if(/^(gpt-image|dall-e)/i.test(id)) return "openai"; if(/^(gemini|imagen)/i.test(id)) return "gemini";
  return (m&&m.provider)||c.provider||"magnific";
}
/* a person's likeness from photos needs a model that takes reference pictures; Magnific Mystic never does */
function aiCharactersCan(){ return aiImageRoute()!=="magnific"&&(typeof aiSelectedModelCan!=="function"||aiSelectedModelCan("reference")); }
function aiSelectedCharacters(){
  if (!aiCharactersOn()) return [];
  if (!aiCharactersCan()) return [];
  var list=aiCharacters();
  return ((AIF&&AIF.characters)||[]).map(function(id){ return byId(list,id); }).filter(Boolean).slice(0,AI_CHAR_PICK);
}
/* what they do in this visual, when nobody wrote it */
var AI_CHAR_ROLE_DEFAULT="placed naturally in the scene next to the hero subject, facing the camera, and kept clear of the text area";
/* what the model is told about them; the photos themselves go with the request */
function aiCharactersPrompt(){
  var list=aiSelectedCharacters(); if(!list.length) return "";
  var who=list.map(function(c){ return c.name+(c.description?" ("+c.description+")":""); }).join(" and ");
  var role=String(AIF.characterRole||"").trim()||AI_CHAR_ROLE_DEFAULT;
  return "People: the reference photos show "+who+". "+(list.length>1?"They are the main people":"This person is the main person")+" in this visual — keep each face, hairstyle, skin tone and build true to the photos, and change only pose, clothing and expression as described. In this visual: "+role+". Do not add any other recognisable person.";
}

/* ---------- AI Hub: whether people appear, who, and as what ---------- */
function aiCharactersFieldHtml(){
  var list=aiCharacters(); if(!list.length) return "";
  var can=aiCharactersCan(), use=aiCharactersOn(), on=AIF.characters||[];
  var h='<div class="field ai-chars"><div class="ai-chars-head"><label for="aiCharsSwitch">'+tr("Include brand characters")+'</label><button type="button" id="aiCharsSwitch" class="switch'+(use?" on":"")+'" role="switch" aria-checked="'+(use?"true":"false")+'" onclick="aiCharactersSwitch()"></button></div>';
  /* on Magnific Mystic they cannot work at all: the switch says so rather than letting someone find out */
  if(aiImageRoute()==="magnific") return h.replace('onclick="aiCharactersSwitch()"','disabled aria-disabled="true"').replace(' on"','"').replace('aria-checked="true"','aria-checked="false"')+'<p class="hint">'+tr("This workspace makes pictures with Magnific Mystic, which cannot keep a person's face from photos. Brand characters need OpenAI (GPT Image) or Gemini (Nano Banana) as the image provider, in Settings → AI → Providers.")+'</p></div>';
  if(!use) return h+'<p class="hint">'+tr("Off: no people from your brand characters, and nothing about them in the prompt.")+'</p></div>';
  return h+'<div class="ai-char-picker" role="group" aria-label="'+attr(tr("Brand characters"))+'">'
    + list.map(function(c){ var sel=can&&on.indexOf(c.id)>=0, ph=(c.photos||[]).filter(aiCharPhotoOk)[0];
        return '<button type="button" class="ai-char-card'+(sel?' on':'')+'" aria-pressed="'+(sel?"true":"false")+'"'+(can?'':' disabled')+' title="'+attr(c.description||c.name)+'" onclick="aiToggleCharacter('+jsq(c.id)+')"><img src="'+attr(ph)+'" alt=""><span data-no-trans>'+esc(c.name)+'</span></button>'; }).join("")
    + '</div>'
    + (can?'<label class="ai-char-role-label" for="aiCharRole">'+tr("Character role")+'</label><textarea id="aiCharRole" rows="2" maxlength="400" placeholder="'+attr(tr("e.g. standing to the right of the trophy, smiling, holding a phone"))+'" oninput="AIF.characterRole=this.value">'+esc(AIF.characterRole||"")+'</textarea>':'')
    + '<p class="hint">'+(can?tr("Choose up to two. The role says where they are and what they do; empty, they stand naturally beside the main subject, clear of the text."):aiImageRoute()==="magnific"?tr("This workspace makes pictures with Magnific Mystic, which cannot keep a person's face from photos. Brand characters need OpenAI (GPT Image) or Gemini (Nano Banana) as the image provider, in Settings → AI → Providers."):tr("This model cannot use reference photos. Choose a model that accepts reference images to use brand characters."))+'</p></div>';
}
/* on: the first character is chosen if nobody is yet */
function aiCharactersSwitch(){
  aiHistoryBefore(); var use=!aiCharactersOn(); AIF.useCharacters=use;
  if(use&&!(AIF.characters||[]).some(function(id){ return byId(aiCharacters(),id); })) AIF.characters=aiCharactersFor(1);
  renderScreen(false);
}
function aiToggleCharacter(id){
  var on=(AIF.characters||[]).slice(), i=on.indexOf(id);
  if(i>=0) on.splice(i,1);
  else { if(on.length>=AI_CHAR_PICK) return toast(tr("Choose up to two people"),"bad"); on.push(id); }
  aiHistoryBefore(); AIF.characters=on; AIF.useCharacters=true; renderScreen(false);
}

/* ---------- the member's own reference picture (Oct 2026) ----------
   A model that takes reference pictures gets it as it is; Magnific Mystic follows either its style (colour, light,
   mood) or its structure (shape, composition), as strongly as the slider says, with the content still from the
   prompt. */
function aiRefUsable(){ return aiImageRoute()==="magnific"||(typeof aiSelectedModelCan!=="function"||aiSelectedModelCan("reference")); }
function aiRefMysticHtml(){
  if(!AIF.reference||aiImageRoute()!=="magnific") return "";
  var mode=AIF.referenceMode==="structure"?"structure":"style", k=AIF.referenceStrength==null?50:+AIF.referenceStrength;
  return '<div class="ai-ref-mode"><div class="seg ai-brief-seg" role="radiogroup" aria-label="'+attr(tr("Follow the picture's"))+'"><button type="button" role="radio" aria-checked="'+(mode==="style")+'" class="'+(mode==="style"?"on":"")+'" onclick="aiRefSet(\'referenceMode\',\'style\')"><span>'+tr("Style")+'</span></button><button type="button" role="radio" aria-checked="'+(mode==="structure")+'" class="'+(mode==="structure"?"on":"")+'" onclick="aiRefSet(\'referenceMode\',\'structure\')"><span>'+tr("Structure")+'</span></button></div>'
    + '<label class="ai-ref-strength"><span>'+tr("Strength")+'</span><input type="range" min="0" max="100" step="5" value="'+k+'" aria-label="'+attr(tr("Strength"))+'" oninput="AIF.referenceStrength=+this.value;this.nextElementSibling.textContent=this.value"><b>'+k+'</b></label>'
    + '<p class="hint">'+tr(mode==="style"?"Colour, light and mood follow the picture; what is in it comes from the prompt.":"Shape and composition follow the picture; what is in it comes from the prompt.")+'</p></div>';
}
function aiRefSet(key,value){ aiHistoryBefore(); AIF[key]=value; renderScreen(false); }

/* ---------- Settings: the admin's list ---------- */
function setAICharacters(){
  var ed=canI.manageWorkspace(), list=aiCharactersAll();
  var cards=list.map(function(c){
    var photos=(c.photos||[]).filter(aiCharPhotoOk), id=jsq(c.id);
    return '<div class="ai-char-admin"><div class="ai-char-photos">'
      + photos.map(function(u,i){ return '<span class="ai-char-photo"><img src="'+attr(u)+'" alt="'+attr(tr("Photo")+" "+(i+1))+'">'+(ed?'<button type="button" class="ai-char-x" title="'+attr(tr("Remove photo"))+'" aria-label="'+attr(tr("Remove photo"))+'" onclick="aiCharPhotoRemove('+id+','+i+')">'+I.x+'</button>':'')+'</span>'; }).join("")
      + (ed&&photos.length<AI_CHAR_PHOTOS?'<button type="button" class="ai-char-add" onclick="aiCharPhotoPick('+id+')">'+I.up+'<span>'+tr("Add photo")+'</span></button>':'')
      + '</div><div class="ai-char-fields">'
      + '<div class="field"><label>'+tr("Name")+'</label><input value="'+attr(c.name||"")+'" maxlength="60"'+(ed?'':' disabled')+' onchange="aiCharSet('+id+',\'name\',this.value)"></div>'
      + '<div class="field"><label>'+tr("Description")+'</label><textarea rows="2" maxlength="400" placeholder="'+attr(tr("e.g. Indonesian woman, late 20s, long dark-brown hair, warm smile"))+'"'+(ed?'':' disabled')+' onchange="aiCharSet('+id+',\'description\',this.value)">'+esc(c.description||"")+'</textarea></div>'
      + (photos.length?'':'<p class="hint">'+tr("Add at least one photo; until then members do not see this character.")+'</p>')
      + '</div>'+(ed?'<button type="button" class="iconbtn ai-char-del" title="'+attr(tr("Delete character"))+'" aria-label="'+attr(tr("Delete character"))+'" onclick="aiCharDelete('+id+')">'+I.trash+'</button>':'')+'</div>';
  }).join("");
  return sp("Brand characters",
    '<p class="hint" style="margin-bottom:12px">'+tr("People added here are the main reference whenever someone generates a person in AI Hub. Members choose them in AI Hub, and templates with people choose them on their own. Use one to three clear, well-lit photos of the face and upper body. Only add people who agreed to appear in AI-generated visuals.")+'</p>'
    + (cards||'<div class="hint">'+tr("No brand characters yet.")+'</div>'),
    ed&&list.length<AI_CHAR_MAX?'<button class="btn" onclick="aiCharAdd()">'+I.plus+tr("Add character")+'</button>':'', I.user);
}
function aiCharFind(id){ return aiCharactersAll().filter(function(c){ return c.id===id; })[0]||null; }
/* the server turns new photos into stored files; its copy replaces ours so they are not sent again */
function aiCharSave(msg){
  return persistWS().then(function(ws){ if(ws===false) return false; if(ws&&ws.ai&&Array.isArray(ws.ai.characters)) WS.ai.characters=ws.ai.characters; toast(tr(msg||"Brand characters saved")); });
}
function aiCharAdd(){
  WS.ai=WS.ai||{}; var list=(WS.ai.characters||[]).slice(); if(list.length>=AI_CHAR_MAX) return;
  list.push({ id:"ch_"+Math.random().toString(36).slice(2,10), name:tr("New character"), description:"", photos:[] });
  WS.ai.characters=list; renderScreen(false); aiCharSave("Character added");
}
function aiCharSet(id,key,value){
  var c=aiCharFind(id); if(!c) return;
  c[key]=String(value||"").trim().slice(0,key==="name"?60:400);
  if(key==="name"&&!c.name) c.name=tr("New character");
  aiCharSave();
}
function aiCharDelete(id){
  confirmModal(tr("Delete character?"),tr("It disappears from AI Hub. Visuals already generated stay as they are."),function(){
    WS.ai.characters=aiCharactersAll().filter(function(c){ return c.id!==id; });
    if(typeof AIF!=="undefined"&&AIF.characters) AIF.characters=AIF.characters.filter(function(x){ return x!==id; });
    renderScreen(false); aiCharSave("Character deleted");
  },true);
}
/* a photo is scaled to 1024px on its long side and saved as JPEG: plenty for a likeness, light to send */
function aiCharPhotoData(file){
  return imgDecode(file).then(function(img){
    var w=img.width, h=img.height, s=Math.min(1,1024/Math.max(w,h)), cv=document.createElement("canvas");
    cv.width=Math.max(1,Math.round(w*s)); cv.height=Math.max(1,Math.round(h*s));
    var g=cv.getContext("2d"); g.fillStyle="#FFFFFF"; g.fillRect(0,0,cv.width,cv.height); g.drawImage(img,0,0,cv.width,cv.height);
    if(img.close) try{ img.close(); }catch(e){}
    return cv.toDataURL("image/jpeg",0.9);
  });
}
function aiCharPhotoPick(id){
  var input=document.createElement("input"); input.type="file"; input.accept="image/png,image/jpeg,image/webp";
  input.onchange=function(){ var f=input.files&&input.files[0]; if(!f) return;
    if(f.size>20*1048576) return toast(tr("Keep each photo under 20 MB"),"bad");
    aiCharPhotoData(f).then(function(url){
      var c=aiCharFind(id); if(!c) return;
      c.photos=(c.photos||[]).filter(aiCharPhotoOk); if(c.photos.length>=AI_CHAR_PHOTOS) return;
      c.photos.push(url); renderScreen(false); aiCharSave("Photo added");
    }).catch(function(){ toast(tr("This picture could not be read. Use PNG, JPEG or WebP."),"bad"); });
  };
  input.click();
}
function aiCharPhotoRemove(id,i){
  var c=aiCharFind(id); if(!c) return;
  c.photos=(c.photos||[]).filter(aiCharPhotoOk); c.photos.splice(i,1);
  renderScreen(false); aiCharSave("Photo removed");
}
/* only what is not translated already elsewhere */
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Brand characters":"Karakter brand",
  "The people you choose are the main reference whenever the visual shows a person. Choose up to two.":"Orang yang Anda pilih menjadi acuan utama setiap kali visual menampilkan orang. Pilih maksimal dua.",
  "This model cannot use reference photos. Choose a model that accepts reference images to use brand characters.":"Model ini tidak bisa memakai foto acuan. Pilih model yang menerima gambar referensi untuk memakai karakter brand.",
  "Choose up to two people":"Pilih maksimal dua orang",
  "This workspace makes pictures with Magnific Mystic, which cannot keep a person's face from photos. Brand characters need OpenAI (GPT Image) or Gemini (Nano Banana) as the image provider, in Settings → AI → Providers.":"Workspace ini membuat gambar dengan Magnific Mystic, yang tidak bisa mempertahankan wajah dari foto. Karakter brand butuh OpenAI (GPT Image) atau Gemini (Nano Banana) sebagai penyedia gambar, di Pengaturan → AI → Providers.",
  "Follow the picture's":"Ikuti gambar dari sisi",
  "Style":"Gaya",
  "Structure":"Struktur",
  "Strength":"Kekuatan",
  "Colour, light and mood follow the picture; what is in it comes from the prompt.":"Warna, cahaya, dan nuansa mengikuti gambar; isinya tetap dari prompt.",
  "Shape and composition follow the picture; what is in it comes from the prompt.":"Bentuk dan komposisi mengikuti gambar; isinya tetap dari prompt.",
  "Include brand characters":"Masukkan karakter brand",
  "Off: no people from your brand characters, and nothing about them in the prompt.":"Mati: tidak ada orang dari karakter brand, dan tidak ada kalimat tentang mereka di prompt.",
  "Character role":"Peran karakter",
  "e.g. standing to the right of the trophy, smiling, holding a phone":"mis. berdiri di kanan piala, tersenyum, memegang ponsel",
  "Choose up to two. The role says where they are and what they do; empty, they stand naturally beside the main subject, clear of the text.":"Pilih maksimal dua. Peran menjelaskan posisi dan kegiatannya; bila kosong, mereka berdiri natural di samping objek utama, tidak menutupi teks.",
  "Character prompt":"Prompt karakter",
  "What the brand characters do in this template when they are included. Empty: they stand beside the main subject, clear of the text.":"Apa yang dilakukan karakter brand di template ini saat dimasukkan. Kosong: mereka berdiri di samping objek utama, tidak menutupi teks.",
  "People added here are the main reference whenever someone generates a person in AI Hub. Members choose them in AI Hub, and templates with people choose them on their own. Use one to three clear, well-lit photos of the face and upper body. Only add people who agreed to appear in AI-generated visuals.":"Orang yang ditambahkan di sini menjadi acuan utama setiap kali seseorang membuat visual berisi orang di AI Hub. Member memilihnya di AI Hub, dan template yang berisi orang memilihnya otomatis. Gunakan satu sampai tiga foto wajah dan badan bagian atas yang jelas dan terang. Tambahkan hanya orang yang sudah setuju tampil di visual buatan AI.",
  "No brand characters yet.":"Belum ada karakter brand.",
  "Add character":"Tambah karakter",
  "New character":"Karakter baru",
  "Add photo":"Tambah foto",
  "Remove photo":"Hapus foto",
  "Photo":"Foto",
  "Description":"Deskripsi",
  "e.g. Indonesian woman, late 20s, long dark-brown hair, warm smile":"mis. Perempuan Indonesia, akhir 20-an, rambut panjang cokelat gelap, senyum hangat",
  "Add at least one photo; until then members do not see this character.":"Tambahkan minimal satu foto; sebelum itu member tidak melihat karakter ini.",
  "Delete character":"Hapus karakter",
  "Delete character?":"Hapus karakter?",
  "It disappears from AI Hub. Visuals already generated stay as they are.":"Karakter hilang dari AI Hub. Visual yang sudah dibuat tetap seperti semula.",
  "Brand characters saved":"Karakter brand tersimpan",
  "Character added":"Karakter ditambahkan",
  "Character deleted":"Karakter dihapus",
  "Photo added":"Foto ditambahkan",
  "Photo removed":"Foto dihapus",
  "Keep each photo under 20 MB":"Ukuran tiap foto maksimal 20 MB",
  "This picture could not be read. Use PNG, JPEG or WebP.":"Gambar ini tidak bisa dibaca. Gunakan PNG, JPEG, atau WebP."
});
</script>
