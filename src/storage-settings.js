<script>
/* FILE STORAGE — Settings → Integrations (admins only).
   The manual switch between Google Drive and this server, for when Google sign-in cannot be made
   to work. Only new uploads follow the switch: files already uploaded keep the link they have,
   whichever side they live on.

   Everything shown comes from WS, which is already loaded, so the panel renders in one pass and a
   language switch cannot make it flash. */
function stoCfg(){ var c=cloudOf("gdrive"); c.config=c.config||{}; return c.config; }
function stoPanel(){
  if(typeof canI==="undefined"||!canI||typeof canI.manageWorkspace!=="function"||!canI.manageWorkspace()) return "";
  return sp("File storage",'<div id="stoBody">'+stoMarkup()+'</div>',"",I.cloud);
}
function stoSeg(mode,label,on){ return '<button type="button" class="'+(on?"on":"")+'" aria-pressed="'+(on?"true":"false")+'" data-storage="'+mode+'" onclick="stoSet(\''+mode+'\')">'+tr(label)+'</button>'; }
function stoMarkup(){
  var mode=storageMode(), cfg=stoCfg(), preset=imgPresetName(), max=Math.round(serverMaxBytes()/1048576), out="";
  out+='<p class="hint" style="margin-bottom:10px">'+tr("Where new uploads go. Switch to this server if Google sign-in cannot be made to work.")+'</p>';
  out+='<div class="seg" role="group" aria-label="'+esc(tr("File storage"))+'" style="margin-bottom:12px">'+stoSeg("drive","Google Drive",mode==="drive")+stoSeg("server","This server",mode==="server")+'</div>';
  if(mode==="legacy") out+='<p class="hint">'+tr("Nothing is chosen yet, so only image previews can be uploaded. Pick one to accept PDFs, decks and spreadsheets.")+'</p>';
  if(mode==="drive"&&!gdReady()) out+='<div class="errbox" style="margin:8px 0;background:var(--color-warning-soft);color:var(--color-warning)">'+tr("Google Drive is not connected, so uploads will fail. Connect it below, or switch to This server to keep working.")+'</div>';
  if(mode==="server"){
    out+='<div class="field"><label for="sto_opt">'+tr("Image optimisation")+'</label>'
      + '<select id="sto_opt" onchange="stoSetPreset(this.value)">'
      + [["balanced","Balanced — up to 2048 px, JPEG 85%"],["smaller","Smaller — up to 1600 px, JPEG 78%"],["full","Full size — re-encode only"],["off","Off — keep files exactly as uploaded"]]
          .map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===preset?" selected":"")+'>'+esc(tr(o[1]))+'</option>'; }).join("")
      + '</select>'
      + '<div class="hint" style="margin-top:4px">'+(preset==="off"
          ? tr("Images are stored exactly as uploaded.")
          : tr("Photos become JPEG; flat graphics and anything transparent become PNG — whichever is smaller. A file is never made heavier than it was. GIFs keep their animation. The original is not kept, so choose Off if your team needs pixel-exact finals."))+'</div></div>';
    out+='<div class="pref"><div class="pl"><b>'+tr("Size limit")+'</b><span>'+max+' MB '+tr("per file. PDF, PowerPoint, Excel, Word and other files are accepted.")+'</span></div></div>';
  }
  out+='<p class="hint">'+tr("Switching only affects new uploads. Files already uploaded stay where they are.")+'</p>';
  return out;
}
function stoRender(){ var el=document.getElementById("stoBody"); if(el) el.innerHTML=stoMarkup(); }
function stoSave(msg){
  var r=typeof persistWS==="function"?persistWS():null;
  var done=function(){ stoRender(); if(msg) toast(msg); };
  if(r&&typeof r.then==="function") r.then(done,function(e){ toast(e.message,"bad"); stoRender(); }); else done();
}
function stoSet(mode){
  if(mode!=="drive"&&mode!=="server") return;
  var c=stoCfg(); if(c.storage===mode) return;
  c.storage=mode;
  stoSave(mode==="server"?tr("New uploads are stored on this server"):tr("New uploads go to Google Drive"));
}
function stoSetPreset(p){
  if(!Object.prototype.hasOwnProperty.call(IMG_PRESETS,p)) return;
  stoCfg().imageOptimize=p; stoSave(tr("Image optimisation updated"));
}
(function(){ if(typeof setIntegrations!=="function") return; var base=setIntegrations;
  setIntegrations=function(){ var h=base.apply(this,arguments); return typeof h==="string"?stoPanel()+h:h; }; })();
</script>
