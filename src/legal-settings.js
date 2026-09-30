<script>
/* LEGAL PAGES — Settings → Workspace (admins only).
   The contact address, legal entity and jurisdiction shown on the public /privacy and /terms pages
   (server/legal.js). They sit next to the workspace name because that name already drives the
   pages: rename the workspace and the pages follow, set a legal entity here and it takes over.

   Saved through PUT /api/workspace/legal, never through the workspace save: that one rewrites the
   whole row, so any client that did not know these fields would wipe them.

   Paints from LEG.view so a language switch, which re-renders the whole screen, does not flash a
   loading line (the same fix the Drive panel needed). */
var LEG = { view: null };
function legPanel(){
  if(typeof canI==="undefined"||!canI||typeof canI.manageWorkspace!=="function"||!canI.manageWorkspace()) return "";
  setTimeout(legRefresh,0);
  return sp("Legal pages",'<div id="legBody">'+(LEG.view?legMarkup(LEG.view):'<p class="hint">'+tr("Checking…")+'</p>')+'</div>',"",I.lock);
}
function legRefresh(){
  if(!document.getElementById("legBody")) return;
  apiFetch("GET","/api/workspace/legal").then(function(v){ LEG.view=v; legPaint(legMarkup(v)); },
    function(e){ legPaint('<p class="hint">'+esc(e.message)+'</p>'); });
}
/* Only rewrite when something changed: a blind rewrite would blink and would throw away anything
   typed but not yet saved. */
function legPaint(html){ var el=document.getElementById("legBody"); if(el&&el.innerHTML!==html) el.innerHTML=html; }
function legField(id,label,value,placeholder,hint,type){
  return '<div class="field"><label for="'+id+'">'+tr(label)+'</label>'
    + '<input id="'+id+'" type="'+(type||"text")+'" autocomplete="off" value="'+esc(value||"")+'" placeholder="'+esc(placeholder||"")+'">'
    + (hint?'<div class="hint" style="margin-top:4px">'+hint+'</div>':'')+'</div>';
}
function legMarkup(v){
  var s=v.saved||{}, e=v.effective||{}, out="";
  var localish=/@(localhost|127\.0\.0\.1)$/i.test(e.contact||"")||/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(e.appUrl||"");
  out+='<p class="hint" style="margin-bottom:12px">'+tr("Shown publicly at /privacy and /terms, with no sign-in. Google checks both before an OAuth app can leave Testing.")+'</p>';
  out+=legField("leg_contact","Contact email",s.contact,e.contact,tr("Required by Google. Use an address someone actually reads."),"email");
  out+='<div class="field-row">'
    + legField("leg_entity","Legal entity",s.entity,e.entity,tr("Leave empty to use the workspace name."))
    + legField("leg_juris","Jurisdiction",s.jurisdiction,e.jurisdiction||"Indonesia","")
    + '</div>';
  /* Say plainly what Google will reject, instead of letting the admin find out from a review email. */
  if(localish) out+='<div class="errbox" style="margin:10px 0;background:var(--color-warning-soft);color:var(--color-warning)">'
    + tr("The pages currently point at localhost. Google rejects that: set a real contact email here, and set APP_URL to your public address on the server.")+'</div>';
  out+='<div class="pref"><div class="pl"><b>'+tr("Now showing")+'</b><span>'+esc(e.entity||"")+' · '+esc(e.contact||"")+' · '+esc(e.jurisdiction||"")+'</span></div>'
    + '<div class="pr"><a class="btn ghost" href="/privacy" target="_blank" rel="noopener">'+tr("Open privacy policy")+'</a>'
    + '<a class="btn ghost" href="/terms" target="_blank" rel="noopener">'+tr("Open terms")+'</a>'
    + '<button class="btn primary" onclick="legSave()">'+tr("Save")+'</button></div></div>';
  return out;
}
function legSave(){
  var body={ contact:(document.getElementById("leg_contact")||{}).value||"", entity:(document.getElementById("leg_entity")||{}).value||"", jurisdiction:(document.getElementById("leg_juris")||{}).value||"" };
  apiFetch("PUT","/api/workspace/legal",body).then(function(v){
    LEG.view=v;
    /* the fields were typed into, so the markup differs; repaint to show the saved values */
    var el=document.getElementById("legBody"); if(el) el.innerHTML=legMarkup(v);
    toast(tr("Legal pages updated"));
  },function(e){ toast(e.message,"bad"); });
}
(function(){ if(typeof setWorkspace!=="function") return; var base=setWorkspace;
  setWorkspace=function(){ var h=base.apply(this,arguments); return typeof h==="string"?h+legPanel():h; }; })();
</script>
