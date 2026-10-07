<script>
/* ============================================================
   CUSTOM EMOJI
   A workspace's own emoji, made from a PNG or JPG. The picture is made small in the browser (128px on
   its long side, its shape kept, a PNG keeps its transparency), stored by the server like any file, and
   named — :like-this:. They sit in the emoji picker under Custom, are found by name in its search, and
   work wherever emoji do: messages, reactions, comments, a status.
   ============================================================ */
var CUSTOM_EMOJI=[], CE_NEW=null;
var CUSTOM_EMOJI_RE=/^:([a-z][a-z0-9_-]{1,31}):$/;
function customEmojiLoad(list){ CUSTOM_EMOJI=(Array.isArray(list)?list:[]).filter(function(x){ return x&&x.name&&x.url; }); }
function customEmoji(token){ var m=CUSTOM_EMOJI_RE.exec(String(token||"")); if(!m) return null; for(var i=0;i<CUSTOM_EMOJI.length;i++) if(CUSTOM_EMOJI[i].name===m[1]) return CUSTOM_EMOJI[i]; return null; }
/* without a server (the standalone demo) they are kept in this browser */
function customEmojiLocal(){ try{ return JSON.parse(localStorage.getItem("cos.customEmoji")||"[]"); }catch(e){ return []; } }
function customEmojiLocalSave(l){ try{ localStorage.setItem("cos.customEmoji",JSON.stringify(l)); }catch(e){} customEmojiLoad(l); }
customEmojiLoad(customEmojiLocal());
(function(){
  if(typeof loadBootstrap==="function"){ var lb=loadBootstrap; loadBootstrap=function(d){ customEmojiLoad(d&&d.customEmoji!==undefined?d.customEmoji:customEmojiLocal()); return lb.apply(this,arguments); }; }
  /* one picture for an emoji everywhere emojiHtml draws one (reactions, status, the picker) */
  var eh=emojiHtml; emojiHtml=function(e,cls){ if(CUSTOM_EMOJI_RE.test(String(e||""))){ var c=customEmoji(e); return c?'<img class="emj custom'+(cls?" "+cls:"")+'" src="'+attr(c.url)+'" alt="'+attr(e)+'" title="'+attr(e)+'" draggable="false" loading="lazy">':'<span class="emj'+(cls?" "+cls:"")+'">'+esc(e)+'</span>'; } return eh.apply(this,arguments); };
  /* written in a message or a comment as :name: */
  if(typeof msgBodyHtml==="function"){ var mb=msgBodyHtml; msgBodyHtml=function(){ return customEmojiInText(mb.apply(this,arguments)); }; }
  if(typeof cmtMentionsHtml==="function"){ var cm=cmtMentionsHtml; cmtMentionsHtml=function(){ return customEmojiInText(cm.apply(this,arguments)); }; }
})();
/* :name: in the text of some HTML (never inside a tag) becomes the picture, when there is such an emoji */
function customEmojiInText(html){ html=String(html==null?"":html); if(!CUSTOM_EMOJI.length||html.indexOf(":")<0) return html; return html.split(/(<[^>]*>)/).map(function(part,i){ return i%2?part:part.replace(/:([a-z][a-z0-9_-]{1,31}):/g,function(m){ return customEmoji(m)?emojiHtml(m,"inline"):m; }); }).join(""); }

/* ---------- in the picker ---------- */
function customEmojiTab(){ return ["custom",CUSTOM_EMOJI.length?":"+CUSTOM_EMOJI[0].name+":":"✨",tr("Custom")]; }
function customEmojiItems(){ return CUSTOM_EMOJI.map(function(c){ return {e:":"+c.name+":"}; }); }
function customEmojiFind(q){ q=String(q||"").toLowerCase().replace(/^:|:$/g,""); if(!q) return []; return CUSTOM_EMOJI.filter(function(c){ return c.name.indexOf(q)>=0; }).map(function(c){ return {e:":"+c.name+":"}; }); }
function customEmojiCanAdd(){ var p=PEOPLE[ME]; return !!p&&!p.stakeholder; }
function customEmojiAddTile(){ return customEmojiCanAdd()?'<button class="ce-add" title="'+attr(tr("Add emoji"))+'" aria-label="'+attr(tr("Add emoji"))+'" onclick="customEmojiAdd()">'+I.plus+'</button>':''; }

/* ---------- adding one ---------- */
function customEmojiAdd(){ if(!customEmojiCanAdd()) return; closePops(); var inp=document.getElementById("fileInput"); inp.value=""; inp.accept="image/png,image/jpeg,image/webp"; inp.multiple=false; inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if(f) customEmojiPrepare(f); }; inp.click(); }
function customEmojiNameFrom(n){ var s=String(n||"").replace(/\.[^.]+$/,"").toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^[^a-z]+/,"").replace(/[-_]+$/,"").slice(0,32); return s.length>=2?s:"emoji"; }
function customEmojiPrepare(file){ if(!/^image\/(png|jpe?g|webp)$/i.test(file.type||"")) return toast(tr("Choose a PNG or JPG picture"),"bad"); if(file.size>5*1048576) return toast(tr("Keep the picture under 5 MB"),"bad");
  var rd=new FileReader(), bad=function(){ toast(tr("Could not read that picture"),"bad"); }; rd.onerror=bad;
  rd.onload=function(){ var img=new Image(); img.onerror=bad; img.onload=function(){ if(!img.naturalWidth||!img.naturalHeight) return bad();
      var k=Math.min(1,128/Math.max(img.naturalWidth,img.naturalHeight)), w=Math.max(1,Math.round(img.naturalWidth*k)), h=Math.max(1,Math.round(img.naturalHeight*k)), cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      var g=cv.getContext("2d"), png=!/jpe?g/i.test(file.type); g.imageSmoothingQuality="high"; if(!png){ g.fillStyle="#fff"; g.fillRect(0,0,w,h); } g.drawImage(img,0,0,w,h);
      var mime=png?"image/png":"image/jpeg"; CE_NEW={url:cv.toDataURL(mime,0.92),ext:png?"png":"jpg",blob:null}; cv.toBlob(function(b){ if(CE_NEW) CE_NEW.blob=b; },mime,0.92);
      customEmojiModal(customEmojiNameFrom(file.name)); };
    img.src=rd.result; };
  rd.readAsDataURL(file); }
function customEmojiModal(name){ if(!CE_NEW) return;
  openModal(tr("Add custom emoji"),'<div class="ce-new"><div class="ce-prev"><img src="'+attr(CE_NEW.url)+'" alt="" class="lg"><span class="ce-in-text">'+tr("Looks like")+' <img src="'+attr(CE_NEW.url)+'" alt="" class="emj"> '+tr("in a message")+'</span></div>'
    +'<div class="field"><label for="ceName">'+tr("Name")+'</label><div class="ce-name"><span>:</span><input id="ceName" maxlength="32" value="'+attr(name)+'" autocomplete="off" oninput="customEmojiNameCheck()" onkeydown="if(event.key===\'Enter\')customEmojiSave()"><span>:</span></div><div class="hint" id="ceHint"></div></div></div>',
    '<button class="btn" onclick="CE_NEW=null;closeModal()">'+tr("Cancel")+'</button><span class="spacer"></span><button class="btn primary" id="ceSave" onclick="customEmojiSave()">'+I.check+tr("Add emoji")+'</button>');
  customEmojiNameCheck(); }
function customEmojiName(){ return String(val("ceName")||"").trim().toLowerCase().replace(/^:+|:+$/g,""); }
function customEmojiNameCheck(){ var n=customEmojiName(), h=document.getElementById("ceHint"), bad=!/^[a-z][a-z0-9_-]{1,31}$/.test(n)?tr("Letters, numbers, - or _, starting with a letter: 2 to 32 long."):customEmoji(":"+n+":")?tr("That name is taken"):"";
  if(h){ h.textContent=bad||(tr("Write it as")+" :"+n+":"); h.classList.toggle("bad",!!bad); } var b=document.getElementById("ceSave"); if(b) b.disabled=!!bad; return !bad; }
function customEmojiSave(){ if(!CE_NEW||!customEmojiNameCheck()) return; var name=customEmojiName(), b=document.getElementById("ceSave"), item=CE_NEW; if(b) b.disabled=true;
  var done=function(list){ customEmojiLoad(list); CE_NEW=null; closeModal(); toast(tr("Emoji added")+" :"+name+":"); customEmojiRedraw(); };
  if(!API.on){ var l=customEmojiLocal(); l.push({name:name,url:item.url,by:ME,at:new Date().toISOString()}); customEmojiLocalSave(l); return done(l); }
  var send=function(blob){ var h={"Content-Type":"application/octet-stream"}; if(SESSION.user&&ME!==SESSION.user.id) h["x-act-as"]=ME;
    return fetch(API.base+"/api/files/upload?name="+encodeURIComponent(name+"."+item.ext),{method:"POST",credentials:"same-origin",headers:h,body:blob}).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error||("HTTP "+r.status)); return j; }); })
      .then(function(j){ return apiFetch("POST","/api/emoji",{name:name,url:j.url}); }); };
  var blob=item.blob?Promise.resolve(item.blob):new Promise(function(res){ var t=0, wait=function(){ if(item.blob||t++>40) return res(item.blob); setTimeout(wait,25); }; wait(); });
  blob.then(function(bl){ if(!bl) throw new Error(tr("Could not read that picture")); return send(bl); }).then(done).catch(function(e){ if(b) b.disabled=false; toast(e.message||tr("Could not add the emoji"),"bad"); }); }

/* ---------- the list, and removing one (whoever added it, or an admin) ---------- */
function customEmojiManage(){ closePops(); var admin=canI.manageWorkspace();
  openModal(tr("Custom emoji"),CUSTOM_EMOJI.length?'<div class="ce-list">'+CUSTOM_EMOJI.map(function(c){ var can=admin||c.by===ME; return '<div class="ce-row"><img src="'+attr(c.url)+'" alt="" class="emj"><b data-no-translate>:'+esc(c.name)+':</b><span class="ce-by" data-no-translate>'+(c.by&&PEOPLE[c.by]?esc(person(c.by).name):"")+'</span>'+(can?'<button class="iconbtn flat" title="'+attr(tr("Remove"))+'" aria-label="'+attr(tr("Remove")+" :"+c.name+":")+'" onclick="customEmojiRemove('+jsq(c.name)+')">'+I.trash+'</button>':'')+'</div>'; }).join("")+'</div>':emptyBox(tr("No custom emoji yet"),tr("Add one from a PNG or JPG picture."),I.image),
    (customEmojiCanAdd()?'<button class="btn primary" onclick="customEmojiAdd()">'+I.plus+tr("Add emoji")+'</button>':'')+'<span class="spacer"></span><button class="btn" onclick="closeModal()">'+tr("Close")+'</button>'); }
function customEmojiRemove(name){ var c=customEmoji(":"+name+":"); if(!c) return; if(!(canI.manageWorkspace()||c.by===ME)) return toast(tr("Only whoever added it, or an admin, can remove it"),"bad");
  var done=function(list){ customEmojiLoad(list); customEmojiManage(); toast(tr("Emoji removed")+" :"+name+":"); customEmojiRedraw(); };
  if(!API.on){ var l=customEmojiLocal().filter(function(x){ return x.name!==name; }); customEmojiLocalSave(l); return done(l); }
  apiFetch("DELETE","/api/emoji/"+encodeURIComponent(name)).then(done).catch(function(e){ toast(e.message,"bad"); }); }
/* a colleague's emoji arrives at once: nothing is redrawn but the messages, so it need not wait for
   an open dialog or a field being typed in, as other live updates do */
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(ev){ if(ev&&ev.type==="ws_changed"&&ev.kind==="emoji"&&API.on&&ev.by!==ME){ apiFetch("GET","/api/live/emoji").then(function(d){ customEmojiLoad(d&&d.customEmoji); customEmojiRedraw(); }).catch(function(){}); } return base.apply(this,arguments); }; })();
/* what is on screen picks up an emoji added or removed — by me, or (live) by a colleague */
function customEmojiRedraw(){ if(S.screen==="messages"&&typeof renderMsgTimeline==="function"&&document.getElementById("msgTimeline")) renderMsgTimeline(true); }

(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"Custom":"Kustom","Add emoji":"Tambah emoji","Add custom emoji":"Tambah emoji kustom","Custom emoji":"Emoji kustom","Manage":"Kelola","Your workspace's own emoji":"Emoji milik workspace kamu","Looks like":"Tampil seperti","in a message":"di pesan","Name":"Nama","Letters, numbers, - or _, starting with a letter: 2 to 32 long.":"Huruf, angka, - atau _, diawali huruf: 2 sampai 32 karakter.","That name is taken":"Nama itu sudah dipakai","Write it as":"Tulis sebagai","Emoji added":"Emoji ditambahkan","Emoji removed":"Emoji dihapus","Choose a PNG or JPG picture":"Pilih gambar PNG atau JPG","Keep the picture under 5 MB":"Ukuran gambar maksimal 5 MB","Could not read that picture":"Gambar itu tidak bisa dibaca","Could not add the emoji":"Emoji tidak bisa ditambahkan","No custom emoji yet":"Belum ada emoji kustom","Add one from a PNG or JPG picture.":"Tambahkan dari gambar PNG atau JPG.","Only whoever added it, or an admin, can remove it":"Hanya yang menambahkannya, atau admin, yang bisa menghapusnya","Remove":"Hapus","Close":"Tutup"});
</script>
