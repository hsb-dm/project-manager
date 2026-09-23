<script>
/* ============================================================
   AI MODEL REGISTRY + AI ADMIN IA — v17 §P1-1 / §P1-3
   The registry is the ONE list of models the product knows about (§15).
   Users never type a model ID; they choose a registry entry, and the
   request carries modelRegistryId so the server resolves provider,
   real model ID, endpoint, credential and capability itself.
   ============================================================ */

var AI_PROVIDERS = [
  ["openai",    "OpenAI"],
  ["gemini",    "Google Gemini"],
  ["magnific",  "Magnific / Mystic"],
  ["anthropic", "Anthropic"],
  ["custom",    "Custom endpoint"]
];
function providerName(id){ var f=AI_PROVIDERS.filter(function(p){ return p[0]===id; })[0]; return f?f[1]:(id||"Custom endpoint"); }

/* Seed registry — what the workspace starts with before an admin edits it. */
var AI_MODELS_DEFAULT = [
  { id:"m_gptimage2",  name:"GPT Image 2",    modelId:"gpt-image-2",             provider:"openai", active:true,  isDefault:true,  capabilities:["reference"], sortOrder:10 },
  { id:"m_nanobanana", name:"Nano Banana Pro", modelId:"gemini-3-pro-image",     provider:"gemini", active:true,  isDefault:false, capabilities:["reference"], sortOrder:20 },
  { id:"m_fastimage",  name:"Fast Image",     modelId:"gemini-2.5-flash-image",  provider:"gemini", active:false, isDefault:false, capabilities:[],            sortOrder:30 }
];

function aiModelRecord(m,order){
  return {
    id: m.id || ("m_"+Math.random().toString(36).slice(2,8)),
    name: String(m.name||"").trim(),
    modelId: String(m.modelId||"").trim(),
    provider: m.provider||"custom",
    active: m.active!==false,
    isDefault: !!m.isDefault,
    capabilities: Array.isArray(m.capabilities)?m.capabilities.slice():[],
    sortOrder: typeof order==="number"?order:(typeof m.sortOrder==="number"?m.sortOrder:10)
  };
}
/* §P1-1 one registry accessor. Everything else reads through it. */
function aiModels(){
  var raw=(typeof WS!=="undefined"&&WS.ai&&WS.ai.models);
  var list=(Array.isArray(raw)&&raw.length?raw:AI_MODELS_DEFAULT).map(function(m,i){ return aiModelRecord(m,typeof m.sortOrder==="number"?m.sortOrder:(i+1)*10); });
  list.sort(function(a,b){ return a.sortOrder-b.sortOrder; });
  /* exactly one default, and it must be an active model */
  var def=list.filter(function(m){ return m.isDefault&&m.active; })[0]||list.filter(function(m){ return m.active; })[0];
  list.forEach(function(m){ m.isDefault=!!def&&m.id===def.id; });
  return list;
}
/* §P1-1 the user only ever sees models the admin left active. */
function aiActiveModels(){ return aiModels().filter(function(m){ return m.active; }); }
function aiModelById(id){ return aiModels().filter(function(m){ return m.id===id; })[0]||null; }
function aiDefaultModel(){ return aiModels().filter(function(m){ return m.isDefault; })[0]||aiActiveModels()[0]||null; }
/* Resolve a stored selection to a model the user is still allowed to use. */
function aiResolveModel(registryId){
  var m=registryId?aiModelById(registryId):null;
  if(m&&m.active) return m;
  return aiDefaultModel();
}
/* §43 capability lookups. The UI asks the registry what a model can do — it
   never branches on a provider name, so adding a provider needs no UI change. */
function aiModelCan(model,capability){
  return !!(model && (model.capabilities||[]).indexOf(capability) >= 0);
}
function aiSelectedModelCan(capability){
  var m = (typeof aiResolveModel==="function") ? aiResolveModel(AIF && AIF.modelRegistryId) : null;
  /* a workspace with no registry configured keeps the old permissive behaviour */
  if(!m) return true;
  return aiModelCan(m,capability);
}
/* §44 what state the Generate button should be in, and why. */
function aiGenerateState(){
  if(typeof AI_BUSY!=="undefined" && AI_BUSY) return {kind:"busy",label:"Generating visual…",disabled:true};
  /* `reason` is the headline on the notice card, which sits next to a button
     that navigates there — so it does not repeat the menu path. `detail` is the
     long form, used for the Generate button's tooltip where there is no button
     to follow. */
  if(!aiActiveModels().length)
    return {kind:"nomodel",label:"Generate visual",disabled:true,
            reason:tr("No image model is active yet."),
            detail:tr("No image model is active. Ask an admin to enable one in Settings → AI & Integrations → Models.")};
  if(typeof aiConfigured==="function" && !aiConfigured("image"))
    return {kind:"unconfigured",label:"Generate visual",disabled:true,
            reason:tr("Image generation is not connected yet."),
            detail:tr("Image generation is not connected yet. An admin can add the provider key in Settings → AI & Integrations → Providers.")};
  return {kind:"ready",label:"Generate visual",disabled:false};
}
function aiSaveModels(list,msg){
  if(typeof WS==="undefined") return;
  WS.ai=WS.ai||{};
  WS.ai.models=list.map(function(m,i){ return aiModelRecord(m,(i+1)*10); });
  if(typeof renderScreen==="function") renderScreen(false);
  if(typeof saveWS==="function") saveWS(msg||"AI models saved");
}
/* §P2-1 models join the shared reorder engine — order is meaningful here
   because it is the order the AI Hub picker offers them in. */
if(typeof registerReorderList==="function") registerReorderList("aimodels",function(from,to){
  if(!canI.manageWorkspace()) return false;
  var list=aiModels(); if(!moveInArray(list,from,to)) return false;
  aiSaveModels(list,"Model order saved"); return true;
});

/* The Default model field now holds a registry id. Resolve it back to the
   provider's real model string for the legacy `WS.ai.image.model` slot, and
   tolerate a workspace that still has a hand-typed value there. */
function aiModelStringFromField(fallback){
  var el=document.getElementById("ai_i_model");
  if(!el) return fallback||"";
  var hit=aiModelById(el.value);
  return hit?hit.modelId:(el.value||fallback||"");
}
/* §6.4 / §6.5 the Providers tab picks its default from the registry. Selecting
   one here is the same action as "Make default" on the Models tab — there is no
   second place a default can be stored, and no free-text model ID. */
function aiDefaultModelSelect(ro){
  var list=aiModels(), def=aiDefaultModel();
  if(!list.length) return '<select disabled><option>'+tr("No models registered yet")+'</option></select>'
    + '<div class="hint">'+tr("Add one in the Models tab first.")+'</div>';
  return '<select id="ai_i_model"'+(ro||"")+' onchange="aiSetDefaultModel(this.value)">'
    + list.map(function(m){
        return '<option value="'+attr(m.id)+'"'+(def&&def.id===m.id?" selected":"")+(m.active?"":" disabled")+'>'
          + esc(m.name)+' — '+esc(m.modelId)+(m.active?"":" · "+tr("disabled"))+'</option>'; }).join("")
    + '</select><div class="hint">'+tr("Used when a member has not chosen a model. Manage the list in the Models tab.")+'</div>';
}
function aiModelModal(id){
  var m=id?aiModelById(id):{name:"",modelId:"",provider:"openai",active:true,isDefault:false,capabilities:[]};
  if(!m) return;
  openModal(id?"Edit model":"Add model",
    '<div class="field-row">'
    + fieldHtml("am_name","Display name",'<input id="am_name" value="'+attr(m.name)+'" placeholder="e.g. GPT Image 2">')
    + fieldHtml("am_provider","Provider",selectHtml("am_provider",AI_PROVIDERS,m.provider))+'</div>'
    + fieldHtml("am_model","Model ID",'<input id="am_model" value="'+attr(m.modelId)+'" placeholder="gpt-image-2">',"Required")
    + '<p class="hint" style="margin:-6px 0 12px">'+tr("The model ID is sent to the provider. Members never see or type it — they pick the display name.")+'</p>'
    + '<div class="pref"><div class="pl"><b>'+tr("Active")+'</b><span>'+tr("Inactive models disappear from the AI Hub picker but stay configured here.")+'</span></div><button class="switch'+(m.active?" on":"")+'" id="am_active" onclick="this.classList.toggle(\'on\')"></button></div>'
    + '<div class="pref"><div class="pl"><b>'+tr("Default model")+'</b><span>'+tr("Used when a member has not chosen one.")+'</span></div><button class="switch'+(m.isDefault?" on":"")+'" id="am_default" onclick="this.classList.toggle(\'on\')"></button></div>'
    /* §43 capabilities drive the AI Hub UI, so each one says what it turns on. */
    + '<div class="field"><label>'+tr("Advanced capabilities")+'</label><div class="check-list">'
    + [["reference","Accepts a reference image","Members can attach a reference image when this model is selected."],
       ["transparent","Supports transparent background","Offers a transparent-background option on export."],
       ["upscale","Supports upscaling","Allows generating above the canvas size."]].map(function(c){
        return '<label><input type="checkbox" data-amcap="'+c[0]+'"'+(m.capabilities.indexOf(c[0])>=0?" checked":"")+'>'
          + '<span class="check-copy"><b>'+tr(c[1])+'</b><span>'+tr(c[2])+'</span></span></label>'; }).join("")
    + '</div></div>',
    (id?'<button class="btn danger-soft" onclick="aiDeleteModel(\''+id+'\')">'+I.trash+tr("Delete")+'</button>':'')
    + '<span class="spacer"></span><button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button>'
    + '<button class="btn primary" onclick="aiSaveModel('+(id?"'"+id+"'":"null")+')">'+tr("Save")+'</button>');
}
function aiSaveModel(id){
  if(!require(["am_name","am_model"])) return;
  var caps=[]; document.querySelectorAll("[data-amcap]").forEach(function(c){ if(c.checked) caps.push(c.getAttribute("data-amcap")); });
  var active=document.getElementById("am_active").classList.contains("on");
  var isDefault=document.getElementById("am_default").classList.contains("on");
  var body={name:val("am_name"),modelId:val("am_model"),provider:val("am_provider"),active:active,isDefault:isDefault&&active,capabilities:caps};
  var list=aiModels();
  if(isDefault&&active) list.forEach(function(m){ m.isDefault=false; });
  if(id){ var i=-1; list.forEach(function(m,n){ if(m.id===id) i=n; }); if(i<0) return; list[i]=aiModelRecord(Object.assign({},list[i],body,{id:id}),list[i].sortOrder); }
  else list.push(aiModelRecord(body,(list.length+1)*10));
  closeModal(); aiSaveModels(list,"Model saved");
}
function aiDeleteModel(id){
  var list=aiModels().filter(function(m){ return m.id!==id; });
  if(!list.length) return toast(tr("Keep at least one model in the registry."),"bad");
  closeModal(); aiSaveModels(list,"Model removed");
}
function aiToggleModel(id,on){
  var list=aiModels(); var hit=list.filter(function(m){ return m.id===id; })[0]; if(!hit) return;
  hit.active=!!on; if(!on) hit.isDefault=false;
  if(!list.some(function(m){ return m.active; })) { hit.active=true; return toast(tr("At least one model must stay active."),"bad"); }
  aiSaveModels(list,on?"Model activated":"Model disabled");
}
function aiSetDefaultModel(id){
  var list=aiModels(); list.forEach(function(m){ m.isDefault=m.id===id; if(m.id===id) m.active=true; });
  aiSaveModels(list,"Default model saved");
}

/* ============================================================
   §P1-3 AI & Integrations information architecture
   Overview / Models / Usage & Limits / Providers / Permissions / Data & Privacy
   ============================================================ */
var AI_SETTINGS_SECTIONS = [
  ["overview","Overview"],["models","Models"],["limits","Usage & Limits"],["prompts","Prompt rules"],
  ["providers","Providers"],["permissions","Permissions"],["privacy","Data & Privacy"]
];
function aiSection(){ var v=S.aiSettingsSection; return AI_SETTINGS_SECTIONS.some(function(x){ return x[0]===v; })?v:"overview"; }
function setAI(){
  var cur=aiSection();
  var nav='<div class="subnav" role="tablist">'+AI_SETTINGS_SECTIONS.map(function(x){
    return '<button role="tab" aria-selected="'+(cur===x[0]?"true":"false")+'" class="'+(cur===x[0]?"on":"")+'" onclick="S.aiSettingsSection=\''+x[0]+'\';renderScreen(false)">'+tr(x[1])+'</button>'; }).join("")+'</div>';
  var body={overview:setAIOverview,models:setAIModels,limits:setAILimits,prompts:setAIPromptRules,providers:setAIProviders,permissions:setAIPermissions,privacy:setAIPrivacy}[cur]();
  return nav+body;
}
/* §P1-3 the overview answers "is this working?" before any technical field. */
function setAIOverview(){
  var p=effectiveAiPolicy(), models=aiModels(), active=aiActiveModels().length;
  var row=function(label,value,ok,href){
    return '<div class="pref"><div class="pl"><b>'+tr(label)+'</b><span>'+(ok===null?'':(ok?'<span class="badge approved">'+tr("Ready")+'</span>':'<span class="badge warn">'+tr("Not configured")+'</span>'))+'</span></div>'
      + '<b class="mono">'+esc(value)+'</b>'
      + (href?'<button class="btn xs ghost" onclick="S.aiSettingsSection=\''+href+'\';renderScreen(false)">'+tr("Open")+'</button>':'')+'</div>'; };
  return sp("AI overview",
    '<p class="hint" style="margin-bottom:10px">'+tr("What members can do with AI right now, and where each setting lives.")+'</p>'
    + row("Image generation", aiConfigured("image")?tr("Connected"):tr("Not connected"), aiConfigured("image"), "providers")
    + row("AI Intelligence", aiConfigured("chat")?tr("Connected"):tr("Local only"), aiConfigured("chat"), "providers")
    + row("Active models", active+" / "+models.length, null, "models")
    + row("Layer limit", String(p.hub.maxLayers), null, "limits")
    + row("History", p.hub.maxHistoryPerUser+" "+tr("per member"), null, "limits")
    + row("Gallery limit", p.gallery.maxDesignsPerUser+" "+tr("per member"), null, "limits"),
    null, I.sparkle)
    + setAIUsage();
}
/* §47 Admin resource usage — what the workspace is actually consuming, so a
   limit can be set from evidence rather than from a guess. Figures the
   standalone can only estimate are labelled as estimates. */
function setAIUsage(){
  if(!canI.manageWorkspace()) return "";
  var runs=(typeof AI_RUNS!=="undefined"?AI_RUNS.length:0), est=!API.on;
  var f=S.agUsageFilter||{role:"",level:""};
  var bar=function(used,limit,unl){ if(unl) return '<span class="ai-usage-bar"><i style="width:0"></i></span>'; var pct=Math.min(100,Math.round(used/Math.max(1,limit)*100)); return '<span class="ai-usage-bar"><i style="width:'+pct+'%"'+(pct>=100?' class="full"':pct>=80?' class="warn"':'')+'></i></span>'; };
  var rowsHtml='<div class="hint">'+tr("Loading usage…")+'</div>';
  var render=function(list){ var rows=list.filter(function(r){ return (!f.role||r.role===f.role)&&(!f.level||(f.level==="near"?(!r.unlimited&&r.percentage>=80&&r.percentage<100):f.level==="over"?(!r.unlimited&&r.percentage>=100):true)); }).sort(function(a,b){ return (b.unlimited?-1:b.percentage)-(a.unlimited?-1:a.percentage); });
    return '<table class="ag-usage-table"><thead><tr><th>'+tr("User")+'</th><th>'+tr("Role")+'</th><th>'+tr("Used")+'</th><th>'+tr("Limit")+'</th><th></th></tr></thead><tbody>'+(rows.length?rows.map(function(r){ return '<tr><td>'+av(r.id)+' <span data-no-translate>'+esc(person(r.id).name)+'</span></td><td>'+esc((byId(ROLES,r.role)||{name:r.role}).name)+'</td><td>'+(r.used===null?tr("Counted on the server"):r.used)+'</td><td>'+(r.unlimited?tr("Unlimited"):r.limit)+'</td><td style="min-width:120px">'+(r.used===null?'':bar(r.used,r.limit,r.unlimited)+(r.unlimited?'':' <span class="tiny">'+r.percentage+'%</span>'))+'</td></tr>'; }).join(""):'<tr><td colspan="5" class="hint">'+tr("No members match this filter.")+'</td></tr>')+'</tbody></table>'; };
  if(API.on){ apiFetch("GET","/api/ai/gallery/usage").then(function(list){ var el=document.getElementById("agUsageRows"); if(el) el.innerHTML=render(list); }).catch(function(e){ var el=document.getElementById("agUsageRows"); if(el) el.innerHTML='<div class="hint">'+esc(e.message)+'</div>'; }); }
  else { setTimeout(function(){ var list=Object.keys(PEOPLE).filter(function(k){ return !PEOPLE[k].stakeholder; }).map(function(id){ var lim=agRoleLimitFor(id), used=id===ME?agOwnedCount():0; return {id:id,role:person(id).perm||"member",used:used,limit:lim.unlimited?null:lim.limit,unlimited:lim.unlimited,percentage:lim.unlimited?0:lim.limit===0?100:Math.round(used/lim.limit*100)}; }); var el=document.getElementById("agUsageRows"); if(el) el.innerHTML=render(list); },0); }
  var filters='<div class="ag-usage-filters"><select onchange="S.agUsageFilter=S.agUsageFilter||{};S.agUsageFilter.role=this.value;renderScreen(false)"><option value="">'+tr("All roles")+'</option>'+ROLES.map(function(r){ return '<option value="'+r.id+'"'+(f.role===r.id?' selected':'')+'>'+esc(r.name)+'</option>'; }).join("")+'</select><select onchange="S.agUsageFilter=S.agUsageFilter||{};S.agUsageFilter.level=this.value;renderScreen(false)"><option value="">'+tr("Any usage")+'</option><option value="near"'+(f.level==="near"?' selected':'')+'>'+tr("Near limit (80%+)")+'</option><option value="over"'+(f.level==="over"?' selected':'')+'>'+tr("At or over limit")+'</option></select></div>';
  return sp("Gallery usage",
    '<p class="hint" style="margin-bottom:10px">'+tr(est?"Standalone demo mode can only measure this device, so these figures are estimates.":"Active Gallery items per member against the limit of their role.")+'</p>'
    + '<div class="ai-usage-grid"><div class="ai-usage-stat"><b>'+agOwnedCount()+'</b><span>'+tr("Your gallery designs")+(est?' · '+tr("estimated"):'')+'</span></div><div class="ai-usage-stat"><b>'+runs+'</b><span>'+tr("Generations in your history")+'</span></div><div class="ai-usage-stat"><b>'+aiActiveModels().length+'</b><span>'+tr("Active models")+'</span></div></div>'
    + filters+'<div id="agUsageRows">'+rowsHtml+'</div>',
    null, I.analytics);
}
/* §P1-1 the registry UI */
function setAIModels(){
  var ed=canI.manageWorkspace(), list=aiModels();
  var rows=list.map(function(m,i){
    return '<div class="pref'+(ed?" reorder-row":"")+'"'+(ed?' data-reorder="aimodels" data-index="'+i+'" ondragover="reorderOver(event,\'aimodels\','+i+')" ondragleave="reorderLeave(event)" ondrop="reorderDrop(event,\'aimodels\','+i+')"':'')+'>'
      + (ed?reorderHandle("aimodels",i,m.name):'<span class="sq">'+I.sparkle+'</span>')
      + '<div class="pl"><b>'+esc(m.name)+' '+(m.active?'<span class="badge approved">'+tr("Active")+'</span>':'<span class="badge">'+tr("Disabled")+'</span>')+(m.isDefault?' <span class="badge">'+tr("Default")+'</span>':'')+'</b>'
      + '<span><span class="mono">'+esc(m.modelId)+'</span> · '+esc(providerName(m.provider))+(m.capabilities.length?' · '+esc(m.capabilities.join(", ")):'')+'</span></div>'
      + (ed?'<button class="switch'+(m.active?" on":"")+'" title="'+attr(tr("Active"))+'" onclick="aiToggleModel(\''+m.id+'\','+(!m.active)+')"></button>'
          + (m.isDefault?'':'<button class="btn xs ghost" onclick="aiSetDefaultModel(\''+m.id+'\')">'+tr("Make default")+'</button>')
          + '<button class="btn sm" onclick="aiModelModal(\''+m.id+'\')">'+I.edit+tr("Edit")+'</button>':'')
      + '</div>'; }).join("");
  return sp("Models",
    '<p class="hint" style="margin-bottom:10px">'+tr("Members choose from this list by display name. They cannot enter a model ID, and the server rejects any ID that is not registered here.")+'</p>'+rows,
    ed?'<button class="btn" onclick="aiModelModal()">'+I.plus+tr("Add model")+'</button>':'', I.sparkle);
}
/* §P0-6 / §P0-7 / §P0-8 every AI limit, in one place, in plain language */
function setAILimits(){
  var ed=canI.manageWorkspace(), p=effectiveAiPolicy(), D=DEFAULT_AI_POLICY;
  var num=function(path,value,dflt,lo,hi,label,help){
    return '<div class="pref"><div class="pl"><b>'+tr(label)+'</b><span>'+tr(help)+' '+tr("Recommended")+': '+dflt+'.</span></div>'
      + '<input type="number" min="'+lo+'" max="'+hi+'" value="'+value+'" '+(ed?'':'disabled')
      + ' style="border:1px solid var(--color-border);border-radius:8px;padding:5px 9px;width:88px;background:var(--color-surface)"'
      + ' onchange="aiPolicySet(\''+path+'\',this.value);renderScreen(false);saveWS(\'AI limits saved\')"></div>'; };
  var hub=sp("AI Hub",
    num("hub.maxLayers",p.hub.maxLayers,D.hub.maxLayers,1,SYSTEM_AI_LIMITS.MAX_LAYERS,"Layers per design","How many extra layers a member can add to one design.")
    + num("hub.maxImageLayers",p.hub.maxImageLayers,D.hub.maxImageLayers,0,SYSTEM_AI_LIMITS.MAX_IMAGE_LAYERS,"Image layers per design","Image layers are the expensive ones — they are embedded in the saved design.")
    + num("hub.maxHistoryPerUser",p.hub.maxHistoryPerUser,D.hub.maxHistoryPerUser,1,SYSTEM_AI_LIMITS.MAX_HISTORY,"Saved generations per member","When a member passes this, the oldest generation is removed automatically. AI Gallery and Assets are never touched.")
    /* §46 canvas ceiling — the guard against a 20000px export request */
    + num("hub.maxCanvasWidth",p.hub.maxCanvasWidth,D.hub.maxCanvasWidth,64,SYSTEM_AI_LIMITS.MAX_CANVAS,"Maximum canvas width","Applies to custom canvas sizes and to export scaling.")
    + num("hub.maxCanvasHeight",p.hub.maxCanvasHeight,D.hub.maxCanvasHeight,64,SYSTEM_AI_LIMITS.MAX_CANVAS,"Maximum canvas height","Applies to custom canvas sizes and to export scaling.")
    + '<p class="hint" style="margin-top:10px">'+tr("These are workspace limits. The system will not go above")+' '
      + SYSTEM_AI_LIMITS.MAX_LAYERS+' '+tr("layers or")+' '+SYSTEM_AI_LIMITS.MAX_CANVAS+' px '+tr("whatever is entered here.")+'</p>'
    , null, I.image);
  /* v18 §65 the role quota table — one row per workspace role, custom roles included. */
  var table=agRoleQuotaTable();
  var roleRows=ROLES.map(function(r){ var v=table[r.id], isUnl=v==="unlimited", isAdmin=r.id==="admin"; var opts=GALLERY_QUOTA_PRESETS.map(function(pv){ return '<option value="'+pv+'"'+(String(pv)===String(v)?' selected':'')+'>'+(pv==="unlimited"?tr("Unlimited"):pv)+'</option>'; }).join(""); var custom=GALLERY_QUOTA_PRESETS.indexOf(isUnl?"unlimited":Number(v))<0;
    return '<div class="pref"><div class="pl"><b>'+esc(r.name)+(isAdmin?' <span class="badge">'+tr("always unlimited")+'</span>':'')+'</b><span>'+tr("Creation limit")+' · '+(isUnl?tr("Unlimited"):v+' '+tr("items"))+'</span></div>'
      + (ed&&!isAdmin?'<select style="border:1px solid var(--color-border);border-radius:8px;padding:5px 9px;background:var(--color-surface)" onchange="if(this.value===\'custom\'){var n=prompt(\''+attr(tr("Custom creation limit"))+'\','+(isUnl?100:Number(v))+');if(n===null){renderScreen(false);return;}agSetRoleQuota(\''+r.id+'\',n);}else agSetRoleQuota(\''+r.id+'\',this.value);renderScreen(false);saveWS(\'Gallery limits saved\')">'+opts+'<option value="custom"'+(custom?' selected':'')+'>'+tr("Custom…")+(custom?' ('+v+')':'')+'</option></select>':'<span class="badge">'+(isUnl?tr("Unlimited"):v)+'</span>')+'</div>'; }).join("");
  var gal=sp("AI Gallery limits",
    '<p class="hint" style="margin-bottom:10px">'+tr("How many active Gallery items a member of each role may create. At the limit a member can still view, edit, download, favourite, archive and delete — only new designs, save-as-new and duplicates are blocked. Lowering a role never deletes anything.")+'</p>'
    + roleRows
    + '<div class="eyebrow" style="margin:16px 0 4px">'+tr("Daily rate limits")+'</div>'
    + num("gallery.maxNewDesignsPerDay",p.gallery.maxNewDesignsPerDay,D.gallery.maxNewDesignsPerDay,1,SYSTEM_AI_LIMITS.MAX_NEW_GALLERY_PER_DAY,"New designs per day","Resets at midnight in the member's own time zone.")
    + num("gallery.maxDuplicatesPerDay",p.gallery.maxDuplicatesPerDay,D.gallery.maxDuplicatesPerDay,1,SYSTEM_AI_LIMITS.MAX_DUPLICATES_PER_DAY,"Duplicates per day","Copying someone else's design counts against this.")
    + num("gallery.maxDesignMB",p.gallery.maxDesignMB,D.gallery.maxDesignMB,1,Math.round(SYSTEM_AI_LIMITS.MAX_DESIGN_BYTES/1048576),"Maximum design size (MB)","Embedded images are what make a design large. Bigger designs are slower for everyone.")
    + '<div class="pref"><div class="pl"><b>'+tr("Archived designs count toward the quota")+'</b><span>'
      + tr("On: archiving tidies the gallery but does not free a slot — a member has to delete permanently. Off: archiving frees a slot while the design still uses storage.")+'</span></div>'
      + '<button class="switch'+(p.gallery.archivedCountsTowardQuota?" on":"")+'" role="switch" aria-checked="'+(p.gallery.archivedCountsTowardQuota?"true":"false")+'"'
      + (ed?' onclick="aiPolicySet(\'gallery.archivedCountsTowardQuota\',this.classList.contains(\'on\')?0:1);renderScreen(false);saveWS(\'AI limits saved\')"':' disabled')+'></button></div>'
    + '<p class="hint" style="margin-top:10px">'+tr("Members see their own usage in AI Gallery and in the save dialog. The server enforces the same limit on every save.")+'</p>'
    , ed?'<button class="btn ghost" onclick="WS.ai=WS.ai||{};WS.ai.policy=null;WS.ai.galleryRoleQuota=null;renderScreen(false);saveWS(\'AI limits reset\')">'+I.sync+tr("Reset to recommended")+'</button>':'', I.gallery);
  return hub+gal;
}
/* ============================================================
   v18 §109–124 PROMPT RULES — Admin Base Prompt (versioned, protected),
   per-tool Task-to-Prompt templates and required brief fields.
   ============================================================ */
var AI_BASE_PROMPT_DEFAULT="You are an AI creative assistant for ZenCrevia.\nAlways preserve factual information provided in the task.\nDo not invent claims, pricing, product features, deadlines, brand rules, or approvals.\nFollow the configured brand and tool rules.\nReturn output in the required format.";
var AI_TOOL_PROMPT_DEFAULT={
  image_generator:{template:"Extract from the task: objective, audience, deliverable, visual direction, mandatory copy, constraints, references.\nConvert the information into one concise image-generation prompt.\nDo not invent missing brand information.",required:["objective","deliverables","dimensions"],recommended:["audience","brand","references"],allowIncomplete:true},
  template_composer:{template:"Extract the headline, sub-headline, CTA and mandatory elements from the task and map them to the template layers.\nKeep copy exactly as written in the task.",required:["objective","copy"],recommended:["cta","brand"],allowIncomplete:true}
};
function aiBasePrompt(){ var b=(WS.ai&&WS.ai.basePrompt)||null; if(!b) return {text:AI_BASE_PROMPT_DEFAULT,version:1,visible:false,versions:[{version:1,text:AI_BASE_PROMPT_DEFAULT,at:null,by:null}]}; return b; }
function aiToolPrompt(toolId){ var t=(WS.ai&&WS.ai.taskPromptTemplates&&WS.ai.taskPromptTemplates[toolId])||null; var d=AI_TOOL_PROMPT_DEFAULT[toolId]||AI_TOOL_PROMPT_DEFAULT.image_generator; return Object.assign({version:1},d,t||{}); }
function aiSaveBasePrompt(){ var text=val("aiBaseText"); if(!text) return toast(tr("Write the base prompt first"),"bad"); var b=clone(aiBasePrompt()); if(text===b.text){ b.visible=!!document.getElementById("aiBaseVisible").checked; } else { b.version=(b.version||1)+1; b.text=text; b.versions=(b.versions||[]).concat([{version:b.version,text:text,at:new Date().toISOString(),by:ME}]).slice(-20); b.visible=!!document.getElementById("aiBaseVisible").checked; } WS.ai=WS.ai||{}; WS.ai.basePrompt=b; saveWS("Base prompt saved as v"+b.version); renderScreen(false); }
function aiSaveToolPrompt(toolId){ var cur=aiToolPrompt(toolId), next={template:val("aiTpl_"+toolId),required:val("aiReq_"+toolId).split(",").map(function(x){return x.trim();}).filter(Boolean),recommended:val("aiRec_"+toolId).split(",").map(function(x){return x.trim();}).filter(Boolean),allowIncomplete:!!document.getElementById("aiInc_"+toolId).checked,version:cur.version||1}; if(next.template!==cur.template) next.version=(cur.version||1)+1; WS.ai=WS.ai||{}; WS.ai.taskPromptTemplates=WS.ai.taskPromptTemplates||{}; WS.ai.taskPromptTemplates[toolId]=next; saveWS("Tool prompt saved as v"+next.version); renderScreen(false); }
function setAIPromptRules(){
  var ed=canI.manageWorkspace(), b=aiBasePrompt();
  var base=sp("Admin base prompt",
    '<p class="hint" style="margin-bottom:10px">'+tr("Every AI Hub generation runs under this prompt. Members cannot remove or override it; Task content and their own instructions sit below it in the hierarchy. Saving a changed text creates a new version — older generations keep the version they used.")+'</p>'
    + '<div class="field"><label>'+tr("Base prompt")+' · v'+b.version+'</label><textarea id="aiBaseText" rows="7"'+(ed?'':' disabled')+'>'+esc(b.text)+'</textarea></div>'
    + '<label class="pref" style="cursor:pointer"><div class="pl"><b>'+tr("Show the base prompt to members as read-only")+'</b><span>'+tr("Off: members only see “This generation follows workspace AI rules.”")+'</span></div><input type="checkbox" id="aiBaseVisible"'+(b.visible?' checked':'')+(ed?'':' disabled')+'></label>'
    + (b.versions&&b.versions.length>1?'<details class="ai-details"><summary>'+tr("Version history")+' ('+b.versions.length+')</summary><div class="ai-details-body">'+b.versions.slice().reverse().map(function(v){ return '<div class="pref"><div class="pl"><b>v'+v.version+'</b><span>'+(v.at?new Date(v.at).toLocaleString():tr("Default"))+(v.by?' · '+esc(person(v.by).name):'')+'</span></div></div>'; }).join("")+'</div></details>':''),
    ed?'<button class="btn primary" onclick="aiSaveBasePrompt()">'+I.check+tr("Save base prompt")+'</button>':'', I.lock);
  var tools=agTools().map(function(t){ var tp=aiToolPrompt(t.id); return sp(tr(t.name)+' · '+tr("Task-to-prompt template")+' v'+(tp.version||1),
    '<div class="field"><label>'+tr("Template")+'</label><textarea id="aiTpl_'+t.id+'" rows="5"'+(ed?'':' disabled')+'>'+esc(tp.template)+'</textarea></div>'
    + '<div class="field-row"><div class="field"><label>'+tr("Required brief fields")+'</label><input id="aiReq_'+t.id+'" value="'+attr((tp.required||[]).join(", "))+'"'+(ed?'':' disabled')+'></div><div class="field"><label>'+tr("Recommended fields")+'</label><input id="aiRec_'+t.id+'" value="'+attr((tp.recommended||[]).join(", "))+'"'+(ed?'':' disabled')+'></div></div>'
    + '<p class="hint">'+tr("Field keys come from the brief template:")+' <span class="mono">'+esc((WS.briefFields||[]).map(function(f){return f[0];}).join(", "))+'</span></p>'
    + '<label class="pref" style="cursor:pointer"><div class="pl"><b>'+tr("Allow generating with an incomplete brief")+'</b><span>'+tr("Off: the member must add the missing required fields to the Task before generating.")+'</span></div><input type="checkbox" id="aiInc_'+t.id+'"'+(tp.allowIncomplete?' checked':'')+(ed?'':' disabled')+'></label>',
    ed?'<button class="btn" onclick="aiSaveToolPrompt(\''+t.id+'\')">'+I.check+tr("Save template")+'</button>':'', I.sparkle); }).join("");
  return base+tools;
}
Object.assign(UI_ID,{"Prompt rules":"Aturan prompt","Admin base prompt":"Base prompt admin","Base prompt":"Base prompt","Save base prompt":"Simpan base prompt","Version history":"Riwayat versi","Task-to-prompt template":"Template Task-ke-prompt","Template":"Template","Required brief fields":"Field brief wajib","Recommended fields":"Field yang disarankan","Save template":"Simpan template","Allow generating with an incomplete brief":"Izinkan generate dengan brief belum lengkap","Gallery usage":"Pemakaian Gallery","User":"Pengguna","Used":"Terpakai","Limit":"Batas","Any usage":"Semua pemakaian","Near limit (80%+)":"Mendekati batas (80%+)","At or over limit":"Mencapai/melebihi batas","No members match this filter.":"Tidak ada anggota yang cocok.","Loading usage…":"Memuat pemakaian…","AI Gallery limits":"Batas AI Gallery","Creation limit":"Batas pembuatan","always unlimited":"selalu tak terbatas","Custom…":"Kustom…","Custom creation limit":"Batas pembuatan kustom","Daily rate limits":"Batas harian","Write the base prompt first":"Tulis base prompt terlebih dahulu"});
</script>
