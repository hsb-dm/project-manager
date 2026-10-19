<script>
/* ============================================================
   CHAT MODELS — ANOTHER MODEL FROM SETTINGS, NOT FROM CODE (Oct 2026)
   Settings → AI → Models gets a "Chat models" section beside the image models, with the same look: each chat model
   the workspace may use, whether it is on, which features use it, a Test that shows the answer (or what went wrong,
   in plain words, with a one-click fix where there is one) and Edit. Adding one is a provider preset first — it fills
   the endpoint and the format — then the model ID, the endpoint and an API key (write-only: blank keeps the stored
   one, or uses the key saved for the same provider). "Advanced" holds what a preset cannot know: the format, the
   token field, the maximum output tokens, a reasoning effort, a temperature and extra body parameters as JSON,
   checked as it is typed with the rules the server applies (shared/ai-chat-models.js). "Used for" chooses the model
   behind AI Intelligence, Smart Scoring's suggestions, the effort estimate on Create, Refine with AI and the report
   summary — each the AI Intelligence model unless chosen. The server does all of it (server/ai-chat-models.js):
   the page sends only what a question is for. The last active model cannot be switched off or removed; removing
   or switching off one in use says which features now use the AI Intelligence model.
   Rendered from the workspace the page already has (WS.ai.chatModels), then refreshed in the background, so
   nothing blinks. In the standalone demo (no server) the section says it is the server's.
   aiChatReady(purpose) tells AI Intelligence, Refine with AI and the estimate on Create whether their model is ready.
   ============================================================ */
var CM_TESTS={}, CM_REFRESHED=0, CM_LOADING=false;
var CM_PURPOSES=[["intelligence","AI Intelligence chat"],["scoring","Smart Scoring AI suggestions"],["estimate","Effort estimate on Create"],["brief","Brief refine (AI Hub)"],["report","Report summary"]];
var CM_FORMATS=[["auto","Auto — from the endpoint"],["chat_completions","Chat Completions"],["responses","Responses (OpenAI)"],["anthropic","Anthropic Messages"],["gemini","Gemini generateContent"]];
var CM_TOKENS=[["auto","Auto"],["max_tokens","max_tokens"],["max_completion_tokens","max_completion_tokens (reasoning models)"],["max_output_tokens","max_output_tokens (Responses API)"]];
var CM_EFFORTS=[["auto","Auto — not sent"],["none","None"],["minimal","Minimal"],["low","Low"],["medium","Medium"],["high","High"]];
var CM_PRESET_HINTS={
  openai:"OpenAI's Chat Completions. A GPT-5, GPT-6 or o-series model is sent max_completion_tokens by itself.",
  openai_responses:"OpenAI's Responses API: instructions and input instead of messages.",
  anthropic:"Anthropic's Messages API. Use a Claude model ID, such as claude-sonnet-4-6.",
  gemini:"Gemini's generateContent. {model} in the address is replaced with the model ID.",
  openrouter:"OpenRouter: a model ID names its maker, such as anthropic/claude-sonnet-4.6 or openai/gpt-6-luna.",
  azure:"Azure OpenAI: replace YOUR-RESOURCE and YOUR-DEPLOYMENT in the endpoint; the model ID is the deployment's name.",
  custom:"Any service that speaks one of the formats. The server sends keys only to known providers: another host is added to COS_AI_ALLOWED_HOSTS by the server admin."
};
var CM_COMPAT_HINT="An OpenAI-compatible endpoint: Chat Completions with a bearer key.";
var CM_HINTS={
  host:"The server sends AI keys only to known providers. To use {host}, the server admin adds it to COS_AI_ALLOWED_HOSTS (comma-separated) and restarts the server — it cannot be allowed from the browser.",
  https:"The endpoint must start with https://.",
  endpoint_invalid:"The endpoint is not a valid web address.",
  external_off:"External AI processing is off: switch on Allow external AI providers in Settings → AI → Permissions.",
  no_key:"There is no API key for this model: add one, or save one for the same provider.",
  token_param:"This model takes {to}, not {param}.",
  token_auto:"This endpoint does not take max_output_tokens: let the token field be chosen automatically.",
  format_responses:"This endpoint speaks OpenAI's Responses API: set the format to Responses.",
  format_chat:"This endpoint speaks Chat Completions: set the format to Chat Completions.",
  temperature:"This model does not take a temperature: leave it blank so the provider's default is used.",
  effort:"This model does not take a reasoning effort: set it back to Auto.",
  extra:"The provider refuses the extra parameter {param}: remove it.",
  parameter:"The provider refuses {param}.",
  max_tokens:"The model allows at most {max} output tokens: set Max output tokens to {max}.",
  model:"The provider does not know this model ID: check its exact spelling in the provider's model list.",
  key:"The provider refused the API key: paste a new key for this provider.",
  forbidden:"The provider refused the request: the key may not have access to this model.",
  rate_limit:"The provider's rate limit or quota is used up: wait a little, or check the provider account's plan and billing.",
  not_found:"The provider answered 404: check the endpoint's path and the model ID.",
  provider_down:"The provider had a problem of its own: try again in a moment.",
  timeout:"The provider did not answer in time: check the endpoint, or try again.",
  endpoint:"The endpoint answered with a web page, not the API: check the address (it usually ends in /chat/completions, /responses, /messages or :generateContent).",
  unreachable:"The server could not reach the endpoint: check the address.",
  empty:"The model answered with no text — a reasoning model may have spent every output token thinking: allow more output tokens (or a lower reasoning effort)."
};
var CM_EXTRA_MSG={invalid_json:"Not valid JSON yet.",not_object:"Write one JSON object, like {\"top_p\": 0.9}.",too_large:"Too long: at most 4000 characters.",too_deep:"Nested too deeply: at most 6 levels.",too_many:"Too many keys: at most 60.",protected:"{key} is part of every request and cannot be set here.",unsafe_key:"The key {key} is not allowed.",bad_value:"Only JSON values."};

function cmShared(){ return typeof AiChatModels!=="undefined"?AiChatModels:null; }
function cmList(){ var l=typeof WS!=="undefined"&&WS&&WS.ai&&WS.ai.chatModels; return Array.isArray(l)?l:[]; }
function cmById(id){ return cmList().filter(function(m){ return m.id===id; })[0]||null; }
function cmUse(){ return (typeof WS!=="undefined"&&WS&&WS.ai&&WS.ai.chatUse)||{}; }
function cmFill(s,v){ return String(s).replace(/\{(\w+)\}/g,function(a,k){ return v&&v[k]!=null?String(v[k]):a; }); }
function cmPurposeName(p){ var x=CM_PURPOSES.filter(function(r){ return r[0]===p; })[0]; return x?tr(x[1]):p; }
function cmName(m){ return m&&m.linked&&(!m.name||m.name==="Workspace connection")?tr("Workspace connection"):((m&&m.name)||""); }
function cmPresetName(id){ var p=cmShared()&&cmShared().presetById(id); return p?tr(p.name):tr("Custom"); }
function cmPresetHint(id){ return tr(CM_PRESET_HINTS[id]||CM_COMPAT_HINT); }
/* the model a feature uses: its own if chosen and on, else the AI Intelligence model (as the server picks it) */
function aiChatModelFor(purpose){
  var on=cmList().filter(function(m){ return m.active!==false; }); if(!on.length) return null;
  var u=cmUse(), p=CM_PURPOSES.some(function(r){ return r[0]===purpose; })?purpose:"intelligence";
  var pickOn=function(id){ return on.filter(function(m){ return m.id===id; })[0]||null; };
  var intel=pickOn(u.intelligence)||on[0];
  return p==="intelligence"?intel:(pickOn(u[p])||intel);
}
/* whether a feature's chat model can be asked: a model of the list with a key of its own (or one it shares); the
   workspace connection — and everything without the list — as the connection always said */
function aiChatReady(purpose){
  var conn=typeof aiConfigured==="function"?aiConfigured("chat"):false;
  if(typeof API==="undefined"||!API.on||!cmList().length) return conn;
  var m=aiChatModelFor(purpose); return !m||m.linked?conn:!!m.keyReady;
}

/* ---------- the section ---------- */
function setAIChatModels(){
  var ed=canI.manageWorkspace(), list=cmList();
  if(typeof API==="undefined"||!API.on) return sp("Chat models",'<p class="hint">'+tr("Chat models are set up on the server version. In this standalone demo, AI Intelligence uses the connection in Providers.")+'</p>',null,I.analytics);
  if(ed) cmRefreshSoon();
  var body='<p class="hint" style="margin-bottom:10px">'+tr("AI Intelligence, Smart Scoring's suggestions, the effort estimate on Create, Refine with AI and the report summary each use a chat model from this list. To add one, pick its provider and type its model ID — no code needed. Keys are stored encrypted on the server and never shown again.")+'</p>'
    +'<div class="cm-rows">'+list.map(function(m){ return cmRowHtml(m,ed); }).join("")+'</div>'+cmUseHtml(ed);
  var foot=ed?'<button class="btn" id="cmAdd" onclick="cmModal()">'+I.plus+tr("Add chat model")+'</button>'+(list.some(function(m){ return m.linked; })?'':'<button class="btn ghost" onclick="cmAddConnection()">'+tr("Add the Providers connection")+'</button>'):'';
  return '<div id="cmSection">'+sp("Chat models",body,foot,I.analytics)+'</div>';
}
function cmRowHtml(m,ed){
  var on=m.active!==false;
  var badges=(on?'<span class="badge approved">'+tr("Active")+'</span>':'<span class="badge">'+tr("Disabled")+'</span>')
    +(m.isDefault?' <span class="badge">'+tr("AI Intelligence")+'</span>':'')
    +(m.linked?' <span class="badge">'+tr("Providers connection")+'</span>':'')
    +(m.host&&m.hostAllowed===false?' <span class="badge warn">'+tr("Host not allowed on this server")+'</span>':'');
  var key={own:"Own key",connection:"Key of the Providers connection",shared:"Key of another model on this provider",none:"No key yet"}[m.keySource];
  var used=(m.usedFor||[]).map(cmPurposeName).join(", ");
  var lc=m.lastCheck;
  var check=lc?'<span class="cm-last '+(lc.ok?'ok':'bad')+'">'+tr(lc.ok?"Last test passed":"Last test failed")+(lc.at&&!isNaN(Date.parse(lc.at))?' · '+esc(new Date(lc.at).toLocaleString()):'')+(lc.ms!=null?' · '+lc.ms+' ms':'')+'</span>':'';
  var id=jsq(m.id);
  return '<div class="pref cm-row" data-cm-row="'+attr(m.id)+'"><span class="sq">'+I.sparkle+'</span>'
    +'<div class="pl"><b><bdi data-no-translate>'+esc(cmName(m))+'</bdi> '+badges+'</b>'
    +'<span><bdi class="mono" data-no-translate>'+esc(m.modelId||tr("not set up yet"))+'</bdi> · '+esc(cmPresetName(m.provider))+(key?' · '+tr(key):'')+'</span>'
    +(used?'<span class="cm-used">'+tr("Used for")+': '+esc(used)+'</span>':'')+check+'</div>'
    +(ed?'<div class="cm-acts"><button class="switch'+(on?' on':'')+'" role="switch" aria-checked="'+(on?'true':'false')+'" aria-label="'+attr(tr("Active"))+'" title="'+attr(tr("Active"))+'" onclick="cmToggle('+id+','+(on?'false':'true')+')"></button>'
      +'<button class="btn sm" data-cm-test="'+attr(m.id)+'" onclick="cmTest('+id+')">'+I.sync+tr("Test")+'</button>'
      +'<button class="btn sm" data-cm-edit="'+attr(m.id)+'" onclick="cmModal('+id+')">'+I.edit+tr("Edit")+'</button></div>':'')
    +'</div><div class="cm-test" id="cmTest_'+attr(m.id)+'">'+cmTestHtml(m.id)+'</div>';
}
function cmUseHtml(ed){
  var on=cmList().filter(function(m){ return m.active!==false; }), u=cmUse();
  return '<div class="cm-use"><div class="eyebrow">'+tr("Used for")+'</div><p class="hint">'+tr("Which chat model answers each feature. One left on Same as AI Intelligence follows the AI Intelligence model.")+'</p>'
    +CM_PURPOSES.map(function(p){
      var cur=p[0]==="intelligence"?(u.intelligence||""):(u[p[0]]||"");
      var opts=(p[0]==="intelligence"?[]:[["",tr("Same as AI Intelligence")]]).concat(on.map(function(m){ return [m.id,cmName(m)+(m.modelId?" — "+m.modelId:"")]; }));
      return '<div class="cm-use-row"><label for="cmUse_'+p[0]+'">'+tr(p[1])+'</label>'+selectHtml("cmUse_"+p[0],opts,cur,(ed?'':'disabled ')+'data-no-translate onchange="cmSetUse('+jsq(p[0])+',this.value)"')+'</div>';
    }).join("")+'</div>';
}
/* only this section is drawn again, so nothing else on the page moves */
function cmRepaint(){
  var el=document.getElementById("cmSection");
  if(!el){ if(typeof S!=="undefined"&&S.screen==="settings") renderScreen(false); return; }
  var box=document.createElement("div"); box.innerHTML=setAIChatModels(); var next=box.firstElementChild;
  if(next&&next.outerHTML!==el.outerHTML) el.replaceWith(next);
}
function cmTake(r){ if(!r||!Array.isArray(r.models)) return; WS.ai=WS.ai||{}; WS.ai.chatModels=r.models; WS.ai.chatUse=r.use||{}; CM_REFRESHED=Date.now(); }
/* the list as the server has it now, in the background; drawn again only if it changed */
function cmRefreshSoon(){
  if(CM_LOADING||Date.now()-CM_REFRESHED<5000) return;
  CM_LOADING=true; CM_REFRESHED=Date.now();
  apiFetch("GET","/api/ai/chat-models").then(function(r){ CM_LOADING=false; var before=JSON.stringify([cmList(),cmUse()]); cmTake(r); if(JSON.stringify([cmList(),cmUse()])!==before) cmRepaint(); }).catch(function(){ CM_LOADING=false; });
}
function cmFellBack(fb){
  if(!fb||!fb.purposes||!fb.purposes.length) return;
  var to=fb.to?cmById(fb.to.id):null, name=to?cmName(to):(fb.to&&fb.to.name)||tr("the AI Intelligence model");
  toast(cmFill(tr("Now using {name}: {list}."),{name:name,list:fb.purposes.map(cmPurposeName).join(", ")}));
}

/* ---------- add / edit ---------- */
function cmModal(id,focus){
  var m=id?cmById(id):null; if(id&&!m) return;
  var sh=cmShared(); if(!sh) return;
  var linked=!!(m&&m.linked), first=sh.presetById("openai");
  var v=m||{provider:"openai",name:"",modelId:"",endpoint:first.endpoint,format:first.format,tokenParam:"auto",maxOutputTokens:null,reasoningEffort:"auto",temperature:null,extraParams:{},active:true,notes:"",keySet:false};
  var pre=sh.presetById(v.provider)||sh.presetById("custom"), ro=linked?' disabled':'';
  var advSet=(v.format&&v.format!=="auto"&&!(!m&&v.format===pre.format))||v.tokenParam!=="auto"||v.maxOutputTokens!=null||v.reasoningEffort!=="auto"||v.temperature!=null||Object.keys(v.extraParams||{}).length;
  var openAdv=advSet||/^(format|tokenParam|maxOutputTokens|reasoningEffort|temperature|extraParams)$/.test(focus||"");
  var keyPh=linked?tr("Set in Providers"):(v.keySet?"•••• "+tr("stored — leave blank to keep it"):tr("Leave blank to use the key saved for this provider"));
  var extra=Object.keys(v.extraParams||{}).length?JSON.stringify(v.extraParams,null,2):"";
  var tsel=function(rows){ return rows.map(function(r){ return [r[0],tr(r[1])]; }); };
  var body=(linked?'<div class="banner cm-linked">'+I.lock+'<div>'+tr("This is the workspace connection from Providers. Its provider, endpoint, model and key are changed there; its name, switch, notes and advanced settings here.")+' <button class="btn xs" onclick="cmOpenProviders()">'+tr("Open Providers")+'</button></div></div>':'')
    +fieldHtml("cm_preset","Provider",selectHtml("cm_preset",sh.PRESETS.map(function(p){ return [p.id,tr(p.name)]; }),pre.id,ro+' onchange="cmPreset(this.value)"'))
    +'<div class="hint cm-preset-hint" id="cm_preset_hint">'+esc(cmPresetHint(pre.id))+'</div>'
    +'<div class="field-row">'+fieldHtml("cm_name","Display name",'<input id="cm_name" maxlength="80" value="'+attr(linked?cmName(m):v.name)+'" placeholder="'+attr(tr("e.g. GPT-6 Luna"))+'">')
    +fieldHtml("cm_model","Model ID",'<input id="cm_model"'+ro+' maxlength="200" value="'+attr(v.modelId)+'" placeholder="'+attr(pre.model||"model-id")+'" autocomplete="off" spellcheck="false">',"Required")+'</div>'
    +fieldHtml("cm_ep","Endpoint",'<input id="cm_ep"'+ro+' maxlength="500" value="'+attr(v.endpoint)+'" placeholder="https://…" autocomplete="off" spellcheck="false">',"Required")
    +fieldHtml("cm_key","API key",'<input id="cm_key"'+ro+' type="password" autocomplete="new-password" placeholder="'+attr(keyPh)+'">')
    +(linked?'':'<div class="hint cm-key-hint">'+tr("Stored encrypted on the server and never shown again. Blank keeps the stored key — or, with none stored, uses the key saved for the same provider (the Providers connection, or another chat model on the same host). To remove a stored key, type: clear")+'</div>')
    +'<div class="pref"><div class="pl"><b>'+tr("Active")+'</b><span>'+tr("Switched off, it is not used: what it was used for falls back to the AI Intelligence model.")+'</span></div><button class="switch'+(v.active!==false?' on':'')+'" id="cm_active" role="switch" aria-label="'+attr(tr("Active"))+'" onclick="this.classList.toggle(\'on\')"></button></div>'
    +'<details class="ai-details cm-adv" id="cm_adv"'+(openAdv?' open':'')+'><summary>'+tr("Advanced")+'</summary><div class="ai-details-body">'
    +'<div class="field-row">'+fieldHtml("cm_format","Format",selectHtml("cm_format",tsel(CM_FORMATS),v.format||"auto",""))+fieldHtml("cm_token","Token field",selectHtml("cm_token",tsel(CM_TOKENS),v.tokenParam||"auto",""))+'</div>'
    +'<p class="hint">'+tr("Auto reads the request's shape from the endpoint, and the token field from the model's name: max_completion_tokens for o-series, GPT-5, GPT-6 and later, max_tokens before them. Anthropic always takes max_tokens, Gemini maxOutputTokens.")+'</p>'
    +'<div class="field-row">'+fieldHtml("cm_max","Max output tokens",'<input id="cm_max" type="number" min="64" max="128000" step="1" value="'+(v.maxOutputTokens!=null?attr(v.maxOutputTokens):'')+'" placeholder="'+attr(tr("auto — 1500 / 4000"))+'">')
    +fieldHtml("cm_effort","Reasoning effort",selectHtml("cm_effort",tsel(CM_EFFORTS),v.reasoningEffort||"auto",""))+'</div>'
    +'<p class="hint">'+tr("Blank: 1500 output tokens, or 4000 for a reasoning model. A reasoning effort is sent only when it is not Auto: as reasoning_effort to Chat Completions, as reasoning.effort to the Responses API.")+'</p>'
    +fieldHtml("cm_temp","Temperature",'<input id="cm_temp" type="number" min="0" max="2" step="0.1" value="'+(v.temperature!=null?attr(v.temperature):'')+'" placeholder="'+attr(tr("blank — the provider's default"))+'">')
    +'<p class="hint">'+tr("Blank sends none, which reasoning models need: they refuse a temperature.")+'</p>'
    +fieldHtml("cm_extra","Extra parameters (JSON)",'<textarea id="cm_extra" rows="4" spellcheck="false" placeholder="{&quot;top_p&quot;: 0.9}" oninput="cmExtraCheck()">'+esc(extra)+'</textarea>')
    +'<div class="hint" id="cm_extra_msg">'+tr("Merged into every request last. A field set to null is left out. The model, the messages, the instructions, streaming and tools cannot be set here.")+'</div>'
    +'</div></details>'
    +fieldHtml("cm_notes","Notes",'<textarea id="cm_notes" rows="2" maxlength="500" placeholder="'+attr(tr("For the admins: what it is for, its plan, who set it up"))+'">'+esc(v.notes||"")+'</textarea>');
  openModal(id?"Edit chat model":"Add chat model",body,
    (id?'<button class="btn danger-soft" onclick="cmDelete('+jsq(id)+')">'+I.trash+tr("Remove")+'</button>':'')
    +'<span class="spacer"></span><button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button>'
    +'<button class="btn primary" id="cmSave" onclick="cmSave('+(id?jsq(id):'null')+')">'+tr("Save")+'</button>');
  var f={modelId:"cm_model",key:"cm_key",endpoint:"cm_ep",format:"cm_format",tokenParam:"cm_token",maxOutputTokens:"cm_max",reasoningEffort:"cm_effort",temperature:"cm_temp",extraParams:"cm_extra"}[focus||""];
  if(f&&!(linked&&/^(cm_model|cm_key|cm_ep)$/.test(f))) setTimeout(function(){ var el=document.getElementById(f); if(el){ try{ el.focus(); el.select&&el.select(); }catch(e){} } },80);
}
/* a preset fills the endpoint (one typed by hand stays) and the format; the placeholders and the note follow it */
function cmPreset(id){
  var sh=cmShared(), p=sh&&sh.presetById(id); if(!p) return;
  var ep=document.getElementById("cm_ep"), model=document.getElementById("cm_model"), fmt=document.getElementById("cm_format"), hint=document.getElementById("cm_preset_hint");
  var known=function(v){ return !v||sh.PRESETS.some(function(x){ return x.endpoint&&x.endpoint===v; }); };
  if(ep&&known(ep.value.trim())) ep.value=p.endpoint;
  if(fmt) fmt.value=p.format;
  if(model) model.placeholder=p.model||"model-id";
  if(hint) hint.textContent=cmPresetHint(id);
}
/* extra parameters, checked as they are typed with the server's own rules */
function cmExtraCheck(){
  var el=document.getElementById("cm_extra"), msg=document.getElementById("cm_extra_msg"), sh=cmShared();
  if(!el||!sh) return {ok:true,value:{}};
  var r=sh.checkExtraParams(el.value);
  el.classList.toggle("cm-bad-input",!r.ok);
  if(msg){ msg.className="hint "+(r.ok?(el.value.trim()?"cm-ok":""):"cm-bad"); msg.textContent=r.ok?(el.value.trim()?tr("Valid — merged into every request last."):tr("Merged into every request last. A field set to null is left out. The model, the messages, the instructions, streaming and tools cannot be set here.")):cmFill(tr(CM_EXTRA_MSG[r.code]||r.error),{key:r.key||""}); }
  return r;
}
function cmSave(id){
  var m=id?cmById(id):null, linked=!!(m&&m.linked);
  if(!linked&&!require(["cm_model","cm_ep"])) return;
  var ex=cmExtraCheck();
  if(!ex.ok){ var d=document.getElementById("cm_adv"); if(d) d.open=true; var t=document.getElementById("cm_extra"); if(t) t.focus(); return toast(tr("Fix the extra parameters first"),"bad"); }
  var num=function(k){ var x=val(k); return x===""?null:+x; };
  var body={ name:val("cm_name"), active:document.getElementById("cm_active").classList.contains("on"), notes:(document.getElementById("cm_notes").value||"").trim(),
    format:val("cm_format"), tokenParam:val("cm_token"), maxOutputTokens:num("cm_max"), reasoningEffort:val("cm_effort"), temperature:num("cm_temp"), extraParams:ex.value };
  if(!linked){ body.provider=val("cm_preset"); body.modelId=val("cm_model"); body.endpoint=val("cm_ep"); var k=val("cm_key"); if(k) body.key=k; }
  var btn=document.getElementById("cmSave"); if(btn) btn.disabled=true;
  (id?apiFetch("PUT","/api/ai/chat-models/"+encodeURIComponent(id),{model:body}):apiFetch("POST","/api/ai/chat-models",{model:body})).then(function(r){
    cmTake(r); if(id) delete CM_TESTS[id]; closeModal(); cmRepaint(); toast(id?"Chat model saved":"Chat model added"); cmFellBack(r.fellBack);
  }).catch(function(e){ if(btn) btn.disabled=false; toast(e.message,"bad"); });
}
function cmDelete(id){
  var m=cmById(id); if(!m) return;
  confirmModal(tr("Remove this chat model?"),esc(cmFill(tr("{name} is removed from the list. What it is used for falls back to the AI Intelligence model."),{name:cmName(m)})),function(){
    apiFetch("DELETE","/api/ai/chat-models/"+encodeURIComponent(id)).then(function(r){ cmTake(r); delete CM_TESTS[id]; cmRepaint(); toast("Chat model removed"); cmFellBack(r.fellBack); }).catch(function(e){ toast(e.message,"bad"); });
  },true);
}
function cmToggle(id,on){
  if(!on&&cmList().filter(function(m){ return m.active!==false&&m.id!==id; }).length===0) return toast(tr("At least one chat model must stay active."),"bad");
  apiFetch("PUT","/api/ai/chat-models/"+encodeURIComponent(id),{model:{active:!!on}}).then(function(r){ cmTake(r); cmRepaint(); toast(on?"Chat model switched on":"Chat model switched off"); cmFellBack(r.fellBack); }).catch(function(e){ toast(e.message,"bad"); cmRepaint(); });
}
function cmSetUse(purpose,id){
  var use={}; use[purpose]=id||"";
  apiFetch("PUT","/api/ai/chat-use",{use:use}).then(function(r){ cmTake(r); cmRepaint(); toast("Saved"); }).catch(function(e){ toast(e.message,"bad"); cmRepaint(); });
}
function cmAddConnection(){ apiFetch("POST","/api/ai/chat-models",{model:{linked:true}}).then(function(r){ cmTake(r); cmRepaint(); toast("Chat model added"); }).catch(function(e){ toast(e.message,"bad"); }); }
function cmOpenProviders(){ closeModal(); S.aiSettingsSection="providers"; renderScreen(false); }

/* ---------- Test, its answer and its fix ---------- */
function cmTest(id){
  if(CM_TESTS[id]&&CM_TESTS[id].busy) return;
  CM_TESTS[id]={busy:true}; cmPaintTest(id);
  apiFetch("POST","/api/ai/chat-models/"+encodeURIComponent(id)+"/test",{}).then(function(r){
    CM_TESTS[id]={result:r}; var m=cmById(id); if(m) m.lastCheck={ok:r.ok,at:r.at,by:r.by,ms:r.ms,error:r.error||null,model:r.model}; cmRepaint(); cmPaintTest(id);
  }).catch(function(e){ CM_TESTS[id]={result:{ok:false,error:e.message,hint:null}}; cmPaintTest(id); });
}
function cmPaintTest(id){ var el=document.getElementById("cmTest_"+id); if(el) el.innerHTML=cmTestHtml(id); }
function cmHintText(h){
  var v=h.vars||{}, k=h.code;
  if(k==="token_param"&&v.to==="auto") k="token_auto";
  if(k==="format") k=v.to==="responses"?"format_responses":"format_chat";
  return CM_HINTS[k]?cmFill(tr(CM_HINTS[k]),v):(h.text||"");
}
/* the settings a fix changes (never where to look: that is "focus") */
function cmFixOf(h){ var f=h&&h.fix; if(!f) return null; var out={}; Object.keys(f).forEach(function(k){ if(k!=="focus") out[k]=f[k]; }); return Object.keys(out).length?out:null; }
function cmFixLabel(h){
  var f=cmFixOf(h)||{};
  if(f.tokenParam) return f.tokenParam==="auto"?tr("Set the token field to Auto"):cmFill(tr("Use {v}"),{v:f.tokenParam});
  if(f.format) return cmFill(tr("Set the format to {v}"),{v:tr((CM_FORMATS.filter(function(r){ return r[0]===f.format; })[0]||["",f.format])[1])});
  if(f.reasoningEffort) return tr("Set the reasoning effort to Auto");
  if(f.maxOutputTokens) return cmFill(tr("Set max output tokens to {v}"),{v:f.maxOutputTokens});
  if("temperature" in f) return tr("Clear the temperature");
  if(f.extraParams) return cmFill(tr("Remove {v}"),{v:(h.vars&&h.vars.param)||tr("the parameter")});
  return tr("Apply the fix");
}
function cmTestHtml(id){
  var t=CM_TESTS[id]; if(!t) return "";
  if(t.busy) return '<div class="cm-res busy">'+I.sync+'<span>'+tr("Testing…")+'</span></div>';
  var r=t.result||{}, m=cmById(id);
  if(r.ok) return '<div class="cm-res ok" data-cm-result="ok"><b>'+tr("Works")+'</b> · '+(r.ms!=null?r.ms+' ms · ':'')+'<bdi class="mono" data-no-translate>'+esc(r.model||"")+'</bdi>'
    +(r.usage&&(r.usage.in!=null||r.usage.out!=null)?' · '+tr("tokens")+' '+(r.usage.in==null?"?":r.usage.in)+' → '+(r.usage.out==null?"?":r.usage.out):'')
    +(r.sample?'<div class="cm-sample" data-no-translate>“'+esc(r.sample)+'”</div>':'')
    +(r.fields&&r.fields.length?'<div class="cm-sent">'+tr("Sent")+': <bdi class="mono" data-no-translate>'+esc(r.fields.join(", "))+'</bdi></div>':'')+'</div>';
  var h=r.hint, fix=cmFixOf(h), focus=h&&h.fix&&h.fix.focus;
  var look=focus?(m&&m.linked?'<button class="btn xs" onclick="S.aiSettingsSection=\'providers\';renderScreen(false)">'+tr("Open Providers")+'</button>'
    :'<button class="btn xs" data-cm-look="'+attr(focus)+'" onclick="cmModal('+jsq(id)+','+jsq(focus)+')">'+I.edit+tr({modelId:"Check the model ID",key:"Change the key",endpoint:"Check the endpoint"}[focus]||"Edit")+'</button>'):'';
  return '<div class="cm-res bad" data-cm-result="fail"><b>'+tr("Test failed")+'</b>'+(r.ms!=null?' · '+r.ms+' ms':'')
    +'<div class="cm-err" data-no-translate>'+esc(r.error||"")+'</div>'
    +(h?'<div class="cm-hint">'+esc(cmHintText(h))+'</div>':'')
    +(fix||look?'<div class="cm-res-acts">'+(fix?'<button class="btn xs primary" data-cm-fix="'+attr(id)+'" onclick="cmApplyFix('+jsq(id)+')">'+I.check+esc(cmFixLabel(h))+'</button>':'')+look+'</div>':'')+'</div>';
}
/* one click: the fix saved on the model, then tested again */
function cmApplyFix(id){
  var t=CM_TESTS[id], fix=t&&t.result&&cmFixOf(t.result.hint); if(!fix) return;
  apiFetch("PUT","/api/ai/chat-models/"+encodeURIComponent(id),{model:fix}).then(function(r){ cmTake(r); delete CM_TESTS[id]; cmRepaint(); toast("Fixed — testing again"); cmTest(id); }).catch(function(e){ toast(e.message,"bad"); });
}

/* Providers: the chat connection says where it is in the list, and where each feature's model is chosen */
(function(){
  if(typeof setAIProviders!=="function") return;
  var base=setAIProviders;
  setAIProviders=function(){
    var h=base.apply(this,arguments); if(typeof h!=="string"||typeof API==="undefined"||!API.on) return h;
    var mark="Enables the AI assistant. Without an API key, it can answer supported questions using the current workspace data.</p>", at=h.indexOf(mark);
    if(at<0) return h;
    var note='<p class="hint cm-prov-note">'+tr("This connection is the Workspace connection in Models → Chat models, where other chat models are added and each feature's model is chosen.")+' <button class="btn xs ghost" onclick="S.aiSettingsSection=\'models\';renderScreen(false)">'+tr("Open Chat models")+'</button></p>';
    return h.slice(0,at+mark.length)+note+h.slice(at+mark.length);
  };
})();

Object.assign(UI_ID,{
  "Chat models":"Model chat","Chat models are set up on the server version. In this standalone demo, AI Intelligence uses the connection in Providers.":"Model chat diatur di versi server. Di demo mandiri ini, AI Intelligence memakai koneksi di Providers.",
  "AI Intelligence, Smart Scoring's suggestions, the effort estimate on Create, Refine with AI and the report summary each use a chat model from this list. To add one, pick its provider and type its model ID — no code needed. Keys are stored encrypted on the server and never shown again.":"AI Intelligence, saran Smart Scoring, estimasi effort saat Create, Refine with AI, dan ringkasan laporan masing-masing memakai model chat dari daftar ini. Untuk menambah model, pilih provider-nya lalu ketik model ID-nya — tanpa coding. Kunci disimpan terenkripsi di server dan tidak pernah ditampilkan lagi.",
  "Add chat model":"Tambah model chat","Edit chat model":"Edit model chat","Add the Providers connection":"Tambahkan koneksi Providers",
  "AI Intelligence chat":"Chat AI Intelligence","Smart Scoring AI suggestions":"Saran AI Smart Scoring","Effort estimate on Create":"Estimasi effort saat Create","Brief refine (AI Hub)":"Refine brief (AI Hub)","Report summary":"Ringkasan laporan",
  "Workspace connection":"Koneksi workspace","Providers connection":"Koneksi Providers","Host not allowed on this server":"Host tidak diizinkan di server ini",
  "Own key":"Kunci sendiri","Key of the Providers connection":"Kunci koneksi Providers","Key of another model on this provider":"Kunci model lain di provider ini","No key yet":"Belum ada kunci","not set up yet":"belum diatur",
  "Used for":"Dipakai untuk","Last test passed":"Tes terakhir berhasil","Last test failed":"Tes terakhir gagal","Test":"Tes",
  "Which chat model answers each feature. One left on Same as AI Intelligence follows the AI Intelligence model.":"Model chat mana yang menjawab tiap fitur. Fitur yang dibiarkan Sama dengan AI Intelligence mengikuti model AI Intelligence.",
  "Same as AI Intelligence":"Sama dengan AI Intelligence","the AI Intelligence model":"model AI Intelligence","Now using {name}: {list}.":"Sekarang memakai {name}: {list}.",
  "Model ID":"Model ID","Endpoint":"Endpoint","e.g. GPT-6 Luna":"mis. GPT-6 Luna",
  "Set in Providers":"Diatur di Providers","stored — leave blank to keep it":"tersimpan — kosongkan untuk mempertahankannya","Leave blank to use the key saved for this provider":"Kosongkan untuk memakai kunci yang tersimpan untuk provider ini",
  "Stored encrypted on the server and never shown again. Blank keeps the stored key — or, with none stored, uses the key saved for the same provider (the Providers connection, or another chat model on the same host). To remove a stored key, type: clear":"Disimpan terenkripsi di server dan tidak pernah ditampilkan lagi. Kosong berarti kunci yang tersimpan dipertahankan — atau, bila belum ada, memakai kunci yang tersimpan untuk provider yang sama (koneksi Providers, atau model chat lain di host yang sama). Untuk menghapus kunci yang tersimpan, ketik: clear",
  "This is the workspace connection from Providers. Its provider, endpoint, model and key are changed there; its name, switch, notes and advanced settings here.":"Ini koneksi workspace dari Providers. Provider, endpoint, model, dan kuncinya diubah di sana; nama, saklar, catatan, dan pengaturan lanjutannya di sini.",
  "Open Providers":"Buka Providers","Open Chat models":"Buka Model chat",
  "Switched off, it is not used: what it was used for falls back to the AI Intelligence model.":"Bila dimatikan, model ini tidak dipakai: fitur yang memakainya beralih ke model AI Intelligence.",
  "Advanced":"Lanjutan","Format":"Format","Token field":"Field token","Max output tokens":"Maks. token output","Reasoning effort":"Reasoning effort","Temperature":"Temperature","Extra parameters (JSON)":"Parameter tambahan (JSON)",
  "Auto — from the endpoint":"Otomatis — dari endpoint","Chat Completions":"Chat Completions","Responses (OpenAI)":"Responses (OpenAI)","Anthropic Messages":"Anthropic Messages","Gemini generateContent":"Gemini generateContent",
  "Auto":"Otomatis","max_completion_tokens (reasoning models)":"max_completion_tokens (model reasoning)","max_output_tokens (Responses API)":"max_output_tokens (Responses API)",
  "Auto — not sent":"Otomatis — tidak dikirim",
  "Auto reads the request's shape from the endpoint, and the token field from the model's name: max_completion_tokens for o-series, GPT-5, GPT-6 and later, max_tokens before them. Anthropic always takes max_tokens, Gemini maxOutputTokens.":"Otomatis membaca bentuk request dari endpoint, dan field token dari nama model: max_completion_tokens untuk seri o, GPT-5, GPT-6 dan sesudahnya, max_tokens untuk model sebelumnya. Anthropic selalu memakai max_tokens, Gemini maxOutputTokens.",
  "auto — 1500 / 4000":"otomatis — 1500 / 4000","Blank: 1500 output tokens, or 4000 for a reasoning model. A reasoning effort is sent only when it is not Auto: as reasoning_effort to Chat Completions, as reasoning.effort to the Responses API.":"Kosong: 1500 token output, atau 4000 untuk model reasoning. Reasoning effort hanya dikirim bila bukan Otomatis: sebagai reasoning_effort ke Chat Completions, sebagai reasoning.effort ke Responses API.",
    "blank — the provider's default":"kosong — default provider","Blank sends none, which reasoning models need: they refuse a temperature.":"Kosong berarti tidak dikirim, dan itu yang dibutuhkan model reasoning: mereka menolak temperature.",
  "Merged into every request last. A field set to null is left out. The model, the messages, the instructions, streaming and tools cannot be set here.":"Digabungkan terakhir ke setiap request. Field yang diisi null tidak dikirim. Model, pesan, instruksi, streaming, dan tools tidak bisa diatur di sini.",
  "Valid — merged into every request last.":"Valid — digabungkan terakhir ke setiap request.","Fix the extra parameters first":"Perbaiki parameter tambahan dulu",
  "Not valid JSON yet.":"Belum JSON yang valid.","Write one JSON object, like {\"top_p\": 0.9}.":"Tulis satu objek JSON, seperti {\"top_p\": 0.9}.","Too long: at most 4000 characters.":"Terlalu panjang: maksimal 4000 karakter.","Nested too deeply: at most 6 levels.":"Terlalu bertingkat: maksimal 6 tingkat.","Too many keys: at most 60.":"Terlalu banyak key: maksimal 60.","{key} is part of every request and cannot be set here.":"{key} adalah bagian dari setiap request dan tidak bisa diatur di sini.","The key {key} is not allowed.":"Key {key} tidak diizinkan.","Only JSON values.":"Hanya nilai JSON.",
  "For the admins: what it is for, its plan, who set it up":"Untuk admin: untuk apa, paketnya, siapa yang memasang",
  "Remove this chat model?":"Hapus model chat ini?","{name} is removed from the list. What it is used for falls back to the AI Intelligence model.":"{name} dihapus dari daftar. Fitur yang memakainya beralih ke model AI Intelligence.",
  "Chat model saved":"Model chat tersimpan","Chat model added":"Model chat ditambahkan","Chat model removed":"Model chat dihapus","Chat model switched on":"Model chat dinyalakan","Chat model switched off":"Model chat dimatikan","At least one chat model must stay active.":"Minimal satu model chat harus tetap aktif.",
  "Testing…":"Menguji…","Works":"Berfungsi","tokens":"token","Fixed — testing again":"Diperbaiki — menguji lagi",
  "Check the model ID":"Periksa model ID","Change the key":"Ganti kunci","Check the endpoint":"Periksa endpoint",
  "Set the token field to Auto":"Atur field token ke Otomatis","Use {v}":"Pakai {v}","Set the format to {v}":"Atur format ke {v}","Set the reasoning effort to Auto":"Atur reasoning effort ke Otomatis","Set max output tokens to {v}":"Atur maks. token output ke {v}","Clear the temperature":"Kosongkan temperature","Remove {v}":"Hapus {v}","the parameter":"parameter itu","Apply the fix":"Terapkan perbaikan",
  "This connection is the Workspace connection in Models → Chat models, where other chat models are added and each feature's model is chosen.":"Koneksi ini adalah Koneksi workspace di Models → Model chat, tempat model chat lain ditambahkan dan model tiap fitur dipilih.",
  "OpenAI — Responses API":"OpenAI — Responses API","Anthropic (Claude)":"Anthropic (Claude)","Google Gemini":"Google Gemini","xAI (Grok)":"xAI (Grok)","Together AI":"Together AI","Azure OpenAI":"Azure OpenAI",
  "OpenAI's Chat Completions. A GPT-5, GPT-6 or o-series model is sent max_completion_tokens by itself.":"Chat Completions OpenAI. Model GPT-5, GPT-6, atau seri o otomatis dikirimi max_completion_tokens.",
  "OpenAI's Responses API: instructions and input instead of messages.":"Responses API OpenAI: instructions dan input, bukan messages.",
  "Anthropic's Messages API. Use a Claude model ID, such as claude-sonnet-4-6.":"Messages API Anthropic. Pakai model ID Claude, misalnya claude-sonnet-4-6.",
  "Gemini's generateContent. {model} in the address is replaced with the model ID.":"generateContent Gemini. {model} di alamat diganti dengan model ID.",
  "OpenRouter: a model ID names its maker, such as anthropic/claude-sonnet-4.6 or openai/gpt-6-luna.":"OpenRouter: model ID menyebut pembuatnya, misalnya anthropic/claude-sonnet-4.6 atau openai/gpt-6-luna.",
  "Azure OpenAI: replace YOUR-RESOURCE and YOUR-DEPLOYMENT in the endpoint; the model ID is the deployment's name.":"Azure OpenAI: ganti YOUR-RESOURCE dan YOUR-DEPLOYMENT di endpoint; model ID adalah nama deployment-nya.",
  "Any service that speaks one of the formats. The server sends keys only to known providers: another host is added to COS_AI_ALLOWED_HOSTS by the server admin.":"Layanan apa pun yang memakai salah satu format ini. Server hanya mengirim kunci ke provider yang dikenal: host lain ditambahkan ke COS_AI_ALLOWED_HOSTS oleh admin server.",
  "An OpenAI-compatible endpoint: Chat Completions with a bearer key.":"Endpoint yang kompatibel dengan OpenAI: Chat Completions dengan bearer key.",
  "The server sends AI keys only to known providers. To use {host}, the server admin adds it to COS_AI_ALLOWED_HOSTS (comma-separated) and restarts the server — it cannot be allowed from the browser.":"Server hanya mengirim kunci AI ke provider yang dikenal. Untuk memakai {host}, admin server menambahkannya ke COS_AI_ALLOWED_HOSTS (dipisah koma) lalu me-restart server — ini tidak bisa diizinkan dari browser.",
  "The endpoint must start with https://.":"Endpoint harus diawali https://.","The endpoint is not a valid web address.":"Endpoint bukan alamat web yang valid.",
  "External AI processing is off: switch on Allow external AI providers in Settings → AI → Permissions.":"Pemrosesan AI eksternal mati: nyalakan Allow external AI providers di Settings → AI → Permissions.",
  "There is no API key for this model: add one, or save one for the same provider.":"Belum ada API key untuk model ini: tambahkan, atau simpan satu untuk provider yang sama.",
  "This model takes {to}, not {param}.":"Model ini memakai {to}, bukan {param}.",
  "This endpoint does not take max_output_tokens: let the token field be chosen automatically.":"Endpoint ini tidak menerima max_output_tokens: biarkan field token dipilih otomatis.",
  "This endpoint speaks OpenAI's Responses API: set the format to Responses.":"Endpoint ini memakai Responses API OpenAI: atur format ke Responses.",
  "This endpoint speaks Chat Completions: set the format to Chat Completions.":"Endpoint ini memakai Chat Completions: atur format ke Chat Completions.",
  "This model does not take a temperature: leave it blank so the provider's default is used.":"Model ini tidak menerima temperature: kosongkan agar default provider yang dipakai.",
  "This model does not take a reasoning effort: set it back to Auto.":"Model ini tidak menerima reasoning effort: kembalikan ke Otomatis.",
  "The provider refuses the extra parameter {param}: remove it.":"Provider menolak parameter tambahan {param}: hapus parameter itu.","The provider refuses {param}.":"Provider menolak {param}.",
  "The model allows at most {max} output tokens: set Max output tokens to {max}.":"Model ini mengizinkan maksimal {max} token output: atur Maks. token output ke {max}.",
  "The provider does not know this model ID: check its exact spelling in the provider's model list.":"Provider tidak mengenal model ID ini: periksa ejaan persisnya di daftar model provider.",
  "The provider refused the API key: paste a new key for this provider.":"Provider menolak API key: tempel kunci baru untuk provider ini.",
  "The provider refused the request: the key may not have access to this model.":"Provider menolak request: kunci ini mungkin tidak punya akses ke model ini.",
  "The provider's rate limit or quota is used up: wait a little, or check the provider account's plan and billing.":"Batas rate atau kuota provider habis: tunggu sebentar, atau periksa paket dan tagihan akun provider.",
  "The provider answered 404: check the endpoint's path and the model ID.":"Provider menjawab 404: periksa path endpoint dan model ID.",
  "The provider had a problem of its own: try again in a moment.":"Provider sedang bermasalah: coba lagi sebentar lagi.",
  "The provider did not answer in time: check the endpoint, or try again.":"Provider tidak menjawab tepat waktu: periksa endpoint, atau coba lagi.",
  "The endpoint answered with a web page, not the API: check the address (it usually ends in /chat/completions, /responses, /messages or :generateContent).":"Endpoint menjawab dengan halaman web, bukan API: periksa alamatnya (biasanya berakhir dengan /chat/completions, /responses, /messages, atau :generateContent).",
  "The server could not reach the endpoint: check the address.":"Server tidak bisa menjangkau endpoint: periksa alamatnya.",
  "The model answered with no text — a reasoning model may have spent every output token thinking: allow more output tokens (or a lower reasoning effort).":"Model menjawab tanpa teks — model reasoning mungkin menghabiskan semua token output untuk berpikir: naikkan maks. token output (atau turunkan reasoning effort)."
});
</script>
<style>
.cm-row{flex-wrap:wrap}
.cm-row .pl>span{display:block}
.cm-row bdi.mono{font-size:inherit}
.cm-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex-shrink:0}
.cm-used{color:var(--color-text-secondary)}
.cm-last{font-size:var(--fs-sm)}
.cm-last.ok{color:var(--color-success)}
.cm-last.bad{color:var(--color-danger)}
.cm-test:empty{display:none}
.cm-res{margin:0 0 12px 44px;padding:10px 12px;border-radius:10px;border:1px solid var(--color-border);background:var(--color-surface-sunken);font-size:var(--fs-sm);line-height:1.5;overflow-wrap:anywhere}
.cm-res.ok{border-color:var(--color-success);background:var(--color-success-soft)}
.cm-res.bad{border-color:var(--color-danger);background:var(--color-danger-soft)}
.cm-res.busy{display:flex;align-items:center;gap:8px;color:var(--color-text-secondary)}
.cm-res.busy svg{width:14px;height:14px}
.cm-sample,.cm-sent,.cm-err,.cm-hint{margin-top:4px}
.cm-err{color:var(--color-text-secondary)}
.cm-hint{color:var(--color-text-primary);font-weight:600}
.cm-res-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cm-use{margin-top:14px;padding-top:12px;border-top:1px solid var(--color-border)}
.cm-use .hint{margin:4px 0 8px}
.cm-use-row{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:10px;align-items:center;padding:5px 0}
.cm-use-row label{font-size:var(--fs-sm);font-weight:600;color:var(--color-text-primary)}
.cm-use-row select{width:100%;min-width:0;min-height:36px;border:1px solid var(--color-border);border-radius:10px;padding:7px 34px 7px 11px;background-color:var(--color-surface-sunken);color:var(--color-text-primary);font-size:var(--fs-sm)}
.cm-use-row select:focus{border-color:var(--color-primary);outline:none}
#cm_extra.cm-bad-input{border-color:var(--color-danger)}
.cm-linked{margin-bottom:12px}
.cm-preset-hint,.cm-key-hint{margin:-6px 0 12px}
.cm-adv{margin:10px 0 12px}
.cm-adv .hint{margin:-4px 0 10px}
#cm_extra{font-family:var(--font-mono,ui-monospace,monospace);font-size:12.5px}
#cm_extra_msg.cm-ok{color:var(--color-success)}
#cm_extra_msg.cm-bad{color:var(--color-danger)}
.cm-prov-note{margin:-4px 0 10px}
@media(max-width:640px){
  .cm-row .pl{flex-basis:calc(100% - 48px)}
  .cm-acts{width:100%;justify-content:flex-end}
  .cm-res{margin-left:0}
  .cm-use-row{grid-template-columns:1fr;gap:4px}
}
</style>
