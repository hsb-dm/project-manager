<script>
/* ============================================================
   v19.9 CLIPBOARD — paste images / files from the OS clipboard
   (Windows Snipping Tool, Print Screen, macOS ⌘⇧4 / ⌘⇧5, copied
   image from a browser or Finder/Explorer) into the place you are
   working in. Text paste is native and untouched.
   Targets, in order of specificity:
     1. Messages composer         → staged FILE attachment (same as "Lampiran")
     2. Task comment box          → comment attachment with thumbnail
     3. "Upload version" modal    → the version file
     4. "Upload asset" modal      → the asset file
     5. Task drawer open (editor) → opens Upload version with the image
     6. Assets screen (manager)   → opens Upload asset with the image
   The "Paste from clipboard" menu entry uses the async Clipboard API
   for devices where Ctrl/⌘+V is awkward (permission prompt applies).
   ============================================================ */
function clipboardFiles(e){ var dt=e&&(e.clipboardData||window.clipboardData); if(!dt) return []; var out=[], seen={};
  var push=function(f){ if(!f) return; var k=f.name+"|"+f.size+"|"+f.type; if(seen[k]) return; seen[k]=1; out.push(clipboardNameFile(f)); };
  try{ if(dt.items&&dt.items.length){ for(var i=0;i<dt.items.length;i++){ var it=dt.items[i]; if(it.kind==="file") push(it.getAsFile()); } } }catch(x){}
  try{ if(!out.length&&dt.files&&dt.files.length){ for(var j=0;j<dt.files.length;j++) push(dt.files[j]); } }catch(x){}
  return out; }
/* screenshots arrive as "image.png" (or no name) — give them a readable, unique name */
function clipboardNameFile(f){ if(!f) return f; var generic=!f.name||/^(image|blob|clipboard)(\.\w+)?$/i.test(f.name); if(!generic) return f; var ext=(f.type.split("/")[1]||"png").replace("jpeg","jpg"); var d=new Date(), pad=function(n){ return (n<10?"0":"")+n; }; var name=tr("Pasted image")+" "+d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+"."+pad(d.getMinutes())+"."+pad(d.getSeconds())+"."+ext; try{ return new File([f],name,{type:f.type||"image/png"}); }catch(x){ try{ Object.defineProperty(f,"name",{value:name}); }catch(y){} return f; } }
function clipboardTarget(e){ var t=e&&e.target, tag=t&&t.tagName; var editing=t&&(tag==="INPUT"||tag==="TEXTAREA"||t.isContentEditable);
  if(t&&t.closest&&(t.id==="msgInput"||t.closest(".msg-composer"))) return "message";
  if(t&&t.closest&&(t.id==="cmtText"||t.closest("#drawer .composer"))) return "comment";
  var modal=document.getElementById("modalWrap"), modalOpen=!!(modal&&modal.classList.contains("open")); /* closed modals keep their DOM, so only an OPEN modal counts */
  if(modalOpen&&document.getElementById("uv_file")) return "version-modal";
  if(modalOpen&&document.getElementById("ua_file")) return "asset-modal";
  if(editing) return null; /* typing somewhere else: leave the paste alone */
  if(modalOpen) return null;
  if(document.getElementById("entityPicker")||document.getElementById("palette")) return null;
  if(S.screen==="messages"&&document.getElementById("msgInput")) return "message";
  if(S.drawerTask&&!(task(S.drawerTask)||{})._draft&&canI.editTask(task(S.drawerTask))) return "drawer";
  if(S.screen==="assets"&&canI.manageAssets()) return "assets";
  return null; }
function clipboardPasteFiles(files,where){ if(!files.length) return false;
  if(where==="message"){ if(!msgCan("send_message")) return false; var c=conv(S.messageConversationId); if(!c||convArchived(c)) return false; files.forEach(msgStageFile); return true; }
  if(where==="comment"){ var ta=document.getElementById("cmtText"); if(ta) window._cmtDraft=ta.value; window._cmtAtt=window._cmtAtt||[]; files.forEach(function(f){ var att={name:f.name,size:(f.size/1048576).toFixed(1)+" MB"}; if(/^image\//.test(f.type)) shrinkImage(f,560,560,function(u){ att.preview=u; window._cmtAtt.push(att); renderDrawer(); clipboardRefocus("cmtText"); toast(tr("Image attached to your comment")); }); else { window._cmtAtt.push(att); renderDrawer(); clipboardRefocus("cmtText"); } }); return true; }
  if(where==="version-modal"){ versionFileChosen(files[0]); return true; }
  if(where==="asset-modal"){ assetFileChosen(files[0]); if(files[0]&&/^image\//.test(files[0].type)){ var n=document.getElementById("ua_name"); if(n&&!n.value) n.value=files[0].name.replace(/\.\w+$/,""); } return true; }
  if(where==="drawer"){ if(!/^image\//.test(files[0].type)) return false; S.drawerTab="versions"; uploadVersion(); setTimeout(function(){ versionFileChosen(files[0]); },30); return true; }
  if(where==="assets"){ uploadAssetModal(); setTimeout(function(){ assetFileChosen(files[0]); var n=document.getElementById("ua_name"); if(n&&!n.value) n.value=files[0].name.replace(/\.\w+$/,""); },30); return true; }
  return false; }
function clipboardRefocus(id){ setTimeout(function(){ var el=document.getElementById(id); if(el){ el.focus(); try{ el.setSelectionRange(el.value.length,el.value.length); }catch(x){} } },40); }
document.addEventListener("paste",function(e){ if(document.body.classList.contains("auth")) return; var files=clipboardFiles(e); if(!files.length) return; /* plain text keeps its native behaviour */ var where=clipboardTarget(e); if(!where) return; if(clipboardPasteFiles(files,where)) e.preventDefault(); });
/* explicit "Paste from clipboard" (async Clipboard API): images → attach, text → insert at the caret */
function clipboardReadInto(where){ if(!navigator.clipboard||!navigator.clipboard.read){ return toast(tr("Your browser does not allow reading the clipboard here — use")+" "+shortcutCombo("V"),"bad"); } navigator.clipboard.read().then(function(items){ var files=[], texts=[]; var jobs=[]; items.forEach(function(it){ var img=it.types.filter(function(t){ return /^image\//.test(t); })[0]; if(img) jobs.push(it.getType(img).then(function(b){ files.push(clipboardNameFile(new File([b],"image."+(img.split("/")[1]||"png"),{type:img}))); })); else if(it.types.indexOf("text/plain")>=0) jobs.push(it.getType("text/plain").then(function(b){ return b.text(); }).then(function(t){ texts.push(t); })); }); return Promise.all(jobs); }).then(function(){ if(files.length) clipboardPasteFiles(files,where); else if(texts.length){ var id=where==="message"?"msgInput":"cmtText", ta=document.getElementById(id); if(ta){ ta.focus(); ta.setRangeText(texts.join("\n"),ta.selectionStart,ta.selectionEnd,"end"); ta.dispatchEvent(new Event("input")); } } else toast(tr("Nothing to paste")); }).catch(function(){ toast(tr("Clipboard access was blocked — use")+" "+shortcutCombo("V"),"bad"); }); }
Object.assign(UI_ID,{"Pasted image":"Gambar tempelan","Image attached to your comment":"Gambar dilampirkan ke komentarmu","Paste from clipboard":"Tempel dari clipboard","Nothing to paste":"Tidak ada yang bisa ditempel","Your browser does not allow reading the clipboard here — use":"Browser tidak mengizinkan membaca clipboard di sini — pakai","Clipboard access was blocked — use":"Akses clipboard ditolak — pakai","pastes an image":"menempel gambar","Paste an image with":"Tempel gambar dengan"});
</script>
