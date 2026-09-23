<script>
/* ============================================================
   SETTINGS — workspace · theme · workflow · briefs · fields · tags · members · roles · teams · notifications/email · cloud · backup
   ============================================================ */
function enableHorizontalDrag(el){
  if(!el||el.dataset.dragScroll)return;
  el.dataset.dragScroll="1";
  var pointer=null,startX=0,startY=0,startLeft=0,dragging=false,suppressClick=false;
  el.addEventListener("pointerdown",function(e){
    suppressClick=false;
    if(e.pointerType!=="mouse"||e.button!==0||el.scrollWidth<=el.clientWidth+1)return;
    pointer=e.pointerId;startX=e.clientX;startY=e.clientY;startLeft=el.scrollLeft;dragging=false;
    // Let ordinary presses reach the button. Capture only after horizontal dragging starts.
  });
  el.addEventListener("pointermove",function(e){
    if(pointer!==e.pointerId)return;
    if(!(e.buttons&1)){pointer=null;return;}
    var dx=e.clientX-startX,dy=e.clientY-startY;
    if(!dragging){
      if(Math.abs(dx)<6)return;
      if(Math.abs(dy)>Math.abs(dx)){pointer=null;return;}
      dragging=true;suppressClick=true;el.setPointerCapture(e.pointerId);el.classList.add("dragging");
    }
    el.scrollLeft=startLeft-dx;e.preventDefault();
  },{passive:false});
  function endDrag(e){
    if(pointer!==e.pointerId)return;
    if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);
    pointer=null;dragging=false;el.classList.remove("dragging");
    if(e.type==="pointercancel")suppressClick=false;
  }
  el.addEventListener("pointerup",endDrag);
  el.addEventListener("pointercancel",endDrag);
  el.addEventListener("lostpointercapture",function(){pointer=null;dragging=false;el.classList.remove("dragging");});
  el.addEventListener("click",function(e){
    if(suppressClick&&e.detail!==0){suppressClick=false;e.preventDefault();e.stopPropagation();}
  },true);
}
/* One flat tab list — no category headers. The ORDER groups related settings
   so neighbours belong together: personal, then workspace identity, then the
   things that shape a task, then taxonomy, then people, then systems. */
function renderSettings(){ var tabs=[
  ["profile","My profile"],["layout","Menu & home layout"],
  ["workspace","Workspace"],["theme","Theme & appearance"],
  /* one word keeps the sidebar item on a single line */
  ["workflow","Workflow stages"],["automation","Automation"],["briefs","Brief templates"],
  ["fields","Custom fields"],["labels","Labels"],["tags","Tags"],
  ["members","Members"],["roles","Roles & permissions"],["teams","Teams"],
  ["ai","AI & integrations"],["notifications","Notifications & email"],["integrations","Cloud storage"],["backup","Backup & data"]];
  var h='<div class="pagehead"><div><h1>'+tr("Settings")+'</h1><div class="muted" style="margin-top:4px">'+""+(canI.manageWorkspace()?'':' · <span class="badge">'+I.lock+tr("read-only for your role")+'</span>')+'</div></div></div><div class="settings"><select class="settings-mobile-select mobile-only" aria-label="'+attr(tr("Settings"))+'" onchange="S.settingsTab=this.value;renderScreen(false)">'+tabs.map(function(t){ return '<option value="'+t[0]+'"'+(S.settingsTab===t[0]?" selected":"")+'>'+esc(tr(t[1]))+'</option>'; }).join("")+'</select><div class="snav">'+tabs.map(function(t){ return '<button class="'+(S.settingsTab===t[0]?"on":"")+'" onclick="S.settingsTab=\''+t[0]+'\';renderScreen(false)">'+tr(t[1])+'</button>'; }).join("")+'</div><div style="display:flex;flex-direction:column;gap:var(--sp-4)">'+({profile:setProfile,workspace:setWorkspace,theme:setThemeTab,workflow:setWorkflow,briefs:setBriefs,fields:setFields,labels:setLabels,tags:setTags,ai:setAI,automation:setAutomation,layout:setLayout,members:setMembers,roles:setRoles,teams:setTeamsTab,notifications:setNotifications,integrations:setIntegrations,backup:setBackup})[S.settingsTab]()+'</div></div>';
  document.getElementById("content").innerHTML=h; setTimeout(function(){enableHorizontalDrag(document.querySelector(".settings .snav"));},0); }
function sp(title,body,foot,icon,cls){ return '<section class="panel'+(cls?' '+cls:'')+'"><div class="panel-head">'+(icon?'<span class="sq">'+icon+'</span>':'')+'<h2>'+tr(title)+'</h2></div><div class="panel-body pad">'+body+'</div>'+(foot?'<div class="panel-foot">'+foot+'</div>':'')+'</section>'; }
function saveWS(msg){ persistWS().then(function(saved){ if(saved===false)return false; toast(msg||"Saved"); }); }
/* workspace */
/* v19.4 the profile is fully self-service: photo, avatar colour, name, initials, title, email, pronouns, phone, location, time zone, about — plus the status shown across chat and pickers. Extra fields live in prefs.profile (no schema change). */
function myProfileExtra(){ var pf=myPrefs(); pf.profile=pf.profile||{}; return pf.profile; }
function profileStatusHtml(){ if(typeof availabilityOf!=="function") return ""; var cur=availabilityOf(ME); return '<div class="pf-status-row"><span class="eyebrow">'+tr("Status")+'</span>'+availabilityMenuHtml()+(cur.state!=="available"?'<button class="btn xs ghost" onclick="setAvailability(\'available\')">'+I.x+tr("Clear")+'</button>':'')+'</div>'; }
function setProfile(){ var p=PEOPLE[ME]||{}; var r=byId(ROLES,p.perm); var x=myProfileExtra(); var tz=["Asia/Jakarta","Asia/Makassar","Asia/Jayapura","Asia/Singapore","Asia/Kuala_Lumpur","Asia/Bangkok","Asia/Manila","Asia/Tokyo","Asia/Kolkata","Asia/Dubai","Europe/London","Europe/Berlin","America/New_York","America/Los_Angeles","Australia/Sydney","UTC"]; var colors=[0,1,2,3,4,5,6];
  var sec=function(t,inner){ return '<div class="pf-section"><div class="eyebrow">'+tr(t)+'</div>'+inner+'</div>'; };
  var avatar='<span class="mp-avatar" title="'+attr(tr("Change photo"))+'" onclick="typeof avatarEditMenu===\'function\'?avatarEditMenu(this,ME):pickAvatar()">'+av(ME,"xl")+'<span class="mp-avatar-edit" aria-hidden="true">'+I.edit+'</span></span>';
  var head='<div class="pf-head">'+avatar+'<div class="pf-head-main"><b data-no-translate>'+esc(p.name||"")+'</b><span data-no-translate>'+esc([p.role,r?r.name:p.perm].filter(Boolean).join(" · "))+'</span>'+(p.avatar?'<div class="hint" style="margin-top:4px">'+tr("Hover the photo to change or remove it. Square JPG, PNG or WebP, up to 2 MB.")+'</div>':'<div class="pf-colors"><span class="hint">'+tr("Avatar colour")+'</span>'+colors.map(function(c){ return '<button class="av c'+c+(p.c===c?" on":"")+'" title="'+tr("Avatar colour")+' '+(c+1)+'" onclick="setAvatarColor('+c+')"></button>'; }).join("")+'</div>')+'</div>'+profileStatusHtml()+'</div>';
  var body=head
    +sec("Identity",'<div class="field-row">'+fieldHtml("pf_name","Full name",'<input id="pf_name" value="'+attr(p.name||"")+'" oninput="var i=document.getElementById(\'pf_ini\');if(i&&!i.dataset.touched)i.value=this.value.split(\' \').filter(Boolean).map(function(s){return s.charAt(0).toUpperCase()}).join(\'\').slice(0,2)">')+fieldHtml("pf_ini","Initials",'<input id="pf_ini" maxlength="2" value="'+attr(p.ini||"")+'" oninput="this.dataset.touched=1" placeholder="AB">')+'</div><div class="field-row">'+fieldHtml("pf_role","Job title",'<input id="pf_role" value="'+attr(p.role||"")+'" placeholder="Designer">')+fieldHtml("pf_pronouns","Pronouns",'<input id="pf_pronouns" value="'+attr(x.pronouns||"")+'" placeholder="'+attr(tr("optional"))+'">')+'</div>')
    +sec("Contact",'<div class="field-row">'+fieldHtml("pf_email","Email (used to sign in)",'<input id="pf_email" type="email" value="'+attr(p.email||"")+'">')+fieldHtml("pf_phone","Phone / WhatsApp",'<input id="pf_phone" type="tel" value="'+attr(x.phone||"")+'" placeholder="+62…">')+'</div><div class="field-row">'+fieldHtml("pf_location","Location",'<input id="pf_location" value="'+attr(x.location||"")+'" placeholder="Jakarta">')+fieldHtml("pf_tz","Time zone",selectHtml("pf_tz",[["",tr("Workspace default")+" ("+(WS.timeZone||"Asia/Jakarta")+")"]].concat(tz.map(function(z){ return [z,z]; })),x.tz||""))+'</div>')
    +sec("About me",'<div class="field"><textarea id="pf_bio" rows="3" maxlength="280" placeholder="'+attr(tr("What you work on, how you like to collaborate…"))+'">'+esc(x.bio||"")+'</textarea></div>')
    +sec("Workspace",'<div class="pf-ws"><div><span class="hint">'+tr("Permission role")+'</span><div><span class="badge">'+esc(r?r.name:p.perm)+'</span> <span class="hint">'+tr(canI.manageMembers()?"change it under Members":"ask an admin to change it")+'</span></div></div><div><span class="hint">'+tr("Capacity (h / week)")+'</span><div>'+(canI.manageMembers()?'<input id="pf_cap" type="number" min="0" value="'+(p.cap||0)+'" style="width:90px">':'<b>'+(p.cap||0)+'</b> <span class="hint">'+tr("ask an admin to change it")+'</span>')+'</div></div><div><span class="hint">'+tr("Teams")+'</span><div style="display:flex;gap:4px;flex-wrap:wrap">'+((p.teams||[]).map(function(t){ return teamBadge(t[0]); }).join("")||'<span class="hint">'+tr("No team yet")+'</span>')+'</div></div></div>');
  return sp("My profile",body,(API.on?'<button class="btn" onclick="changePasswordModal()">'+I.lock+'Change password</button>':'')+'<span class="spacer"></span><button class="btn primary" onclick="saveProfile()">Save profile</button>',I.user)+shortcutPreferencePanel(); }
function setAvatarColor(c){ var p=PEOPLE[ME]; if(!p) return; p.c=c; applyShell(); renderScreen(false); persistPerson(ME).then(function(saved){ if(saved===false) return false; toast(tr("Avatar colour updated")); }); }
function shortcutPreferencePanel(){var pref=myPrefs().shortcutStyle||"auto",autoLabel=tr("Automatic")+" — "+shortcutModifier();return sp("Keyboard shortcuts",fieldHtml("pf_shortcuts","Shortcut display",selectHtml("pf_shortcuts",[["auto",autoLabel],["ctrl","Windows / Linux — Ctrl"],["mac","macOS — ⌘"]],pref,'onchange="setShortcutStyle(this.value)"'))+'<div class="hint" style="margin-top:6px">'+tr("Comment shortcut")+': <b>'+esc(shortcutCombo("Enter"))+'</b></div>',null,I.settings,"desktop-only");}
function saveProfile(){ if (!require(["pf_name","pf_email"])) return; var em=val("pf_email").toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("Enter a valid email","bad"); var dup=Object.keys(PEOPLE).filter(function(id){ return id!==ME&&(PEOPLE[id].email||"").toLowerCase()===em; })[0]; if(dup) return toast(tr("That email is already used by another member"),"bad"); var p=PEOPLE[ME]; var name=val("pf_name").trim(); p.name=name; var ini=(val("pf_ini")||"").trim().toUpperCase().slice(0,2); p.ini=ini||name.split(" ").filter(Boolean).map(function(s){ return s.charAt(0).toUpperCase(); }).join("").slice(0,2); p.role=val("pf_role").trim(); p.email=em; if (canI.manageMembers()) p.cap=+val("pf_cap")||0; var x=myProfileExtra(); x.pronouns=val("pf_pronouns").trim(); x.phone=val("pf_phone").trim(); x.location=val("pf_location").trim(); x.tz=val("pf_tz"); x.bio=(val("pf_bio")||"").trim(); saveMyPrefs(); applyShell(); renderScreen(false); persistPerson(ME).then(function(saved){ if(saved===false)return false; toast("Profile saved"); }); }
function canEditPhoto(id){ return id===ME||canI.manageMembers(); }
function pickAvatar(id){ id=id||ME; if (!canEditPhoto(id)) return toast("Only an admin can change someone else\u2019s photo","bad");
  var inp=document.getElementById("fileInput"); inp.accept="image/*"; inp.multiple=false; inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if (!f) return; if (f.size>2*1048576) return toast("Keep the photo under 2 MB","bad");
    shrinkImage(f,256,256,function(u){ PEOPLE[id].avatar=u; applyShell(); refresh(); persistPerson(id,false).then(function(saved){ if(saved===false)return false; applyShell(); refresh(); toast("Profile photo updated for "+first(id)); }); }); }; inp.click(); }
function removeAvatar(id){ id=id||ME; if (!canEditPhoto(id)) return toast("Only an admin can change someone else\u2019s photo","bad"); PEOPLE[id].avatar=""; applyShell(); refresh(); persistPerson(id,false).then(function(saved){ if(saved===false)return false; applyShell(); refresh(); toast("Photo removed"); }); }
function photoBtns(id,sm){ if (!canEditPhoto(id)) return ""; var c=sm?" xs":" sm"; return '<button class="btn'+c+'" onclick="event.stopPropagation();pickAvatar(\''+id+'\')">'+I.up+(person(id).avatar?"Change photo":"Upload photo")+'</button>'+(person(id).avatar?'<button class="btn'+c+' ghost" onclick="event.stopPropagation();removeAvatar(\''+id+'\')">Remove</button>':''); }
/* ---------- AI providers ---------- */
function setAIProviders(){
  var ed=canI.manageWorkspace(), ro=ed?"":" disabled", c=aiCfg();
  var imgOn=aiConfigured("image"), chatOn=aiConfigured("chat");
  function status(on){ return on?'<span class="badge approved">connected</span>':'<span class="badge">not set</span>'; }
  var img=sp("AI image generation",
    '<div style="margin-bottom:8px">'+status(imgOn)+'</div><p class="hint" style="margin-bottom:10px">Generates images in AI Hub. In server mode, the key is encrypted with the server secret. In standalone demo mode, it lasts only in this tab and is cleared when the page closes.</p>'
    +'<div class="field-row">'+fieldHtml("ai_i_ep","API endpoint",'<input'+ro+' id="ai_i_ep" value="'+attr(c.image.endpoint)+'" placeholder="Your image-generation API endpoint">')
    /* §6.4 the default is chosen from the registry, never typed — a free-text
       model ID here could name something the registry does not allow. */
    +fieldHtml("ai_i_model","Default model",aiDefaultModelSelect(ro))+'</div>'
    +'<div class="field"><label>API key</label><input'+ro+' id="ai_i_key" type="password" placeholder="'+(imgOn?"\u2022\u2022\u2022\u2022 stored \u2014 leave blank to keep it":"sk-\u2026")+'" autocomplete="off"><div class="hint">Leave blank to keep the existing key. To remove it, type: <code>clear</code></div></div>'
    +'<div class="field"><label for="ai_i_style">Brand default prompt</label><textarea'+ro+' id="ai_i_style" rows="7" maxlength="4000" placeholder="Describe your brand voice, visual direction, required colors, and things to avoid.">'+esc(c.image.defaultStyle)+'</textarea><p class="hint">Included with every AI Hub generation, including custom prompts and templates. Only workspace administrators can change it. Review generated visuals before publishing.</p></div>',
    ed?'<button class="btn" onclick="aiTest(\'image\')">'+I.sync+'Test connection</button><span class="spacer"></span><button class="btn primary" onclick="saveAI()">Save</button>':'',I.image);

  var chat=sp("AI Intelligence \u2014 chat model",
    '<div style="margin-bottom:8px">'+status(chatOn)+'</div><p class="hint" style="margin-bottom:10px">Enables the AI assistant. Without an API key, it can answer supported questions using the current workspace data.</p>'
    +'<div class="field-row">'+fieldHtml("ai_c_prov","Provider",selectHtml("ai_c_prov",[["anthropic","Anthropic (Claude)"],["gemini","Google Gemini Flash"],["openai","OpenAI-compatible"],["custom","Custom"]],c.chat.provider,ro+' onchange="aiChatProviderPreset(this.value)"'))
    +fieldHtml("ai_c_model","Model",'<input'+ro+' id="ai_c_model" value="'+attr(c.chat.model)+'" placeholder="claude-sonnet-4-6">')+'</div>'
    +'<div class="field"><label>API endpoint</label><input'+ro+' id="ai_c_ep" value="'+attr(c.chat.endpoint)+'" placeholder="https://api.anthropic.com/v1/messages"><div class="hint">Gemini uses the official GenerateContent endpoint. Availability and free-tier limits depend on the Google AI project.</div></div>'
    +'<div class="field"><label>API key</label><input'+ro+' id="ai_c_key" type="password" placeholder="'+(chatOn?"\u2022\u2022\u2022\u2022 stored \u2014 leave blank to keep it":"sk-ant-\u2026")+'" autocomplete="off"><div class="hint">Leave blank to keep the existing key. To remove it, type: <code>clear</code></div></div>'
    +'<div class="field"><label>Extra system instructions</label><textarea'+ro+' id="ai_c_sys" rows="3" placeholder="e.g. Always answer in Bahasa Indonesia. Flag anything that needs compliance review.">'+esc(c.chat.systemExtra)+'</textarea></div>',
    ed?'<button class="btn" onclick="aiTest(\'chat\')">'+I.sync+'Test connection</button><span class="spacer"></span><button class="btn primary" onclick="saveAI()">Save</button>':'',I.analytics);

  var logo=sp("AI Hub brand logo",
    '<p class="hint" style="margin-bottom:12px">Uses the workspace logo.</p>'
    +'<div class="ai-logo-settings" style="display:flex;align-items:center;gap:14px"><span class="ws-logo" style="width:56px;height:56px;border-radius:16px">'+(WS.logoImg?'<img src="'+attr(WS.logoImg)+'">':esc(WS.logo||"CO"))+'</span><div class="hint" style="flex:1">Upload a PNG, JPG, WebP, or SVG logo. A short text logo is used until you upload one.</div>'
    +(ed?'<button class="btn" onclick="pickImage(\'logoImg\')">'+I.up+'Upload company logo</button>'+(WS.logoImg?'<button class="btn ghost" onclick="WS.logoImg=null;applyShell();renderScreen(false);saveWS(\'AI Hub logo removed\')">Remove</button>':''):'')+'</div>',null,I.assets);
  return img+chat+logo+setPromptTemplates()+setChatTemplates();
}
/* §P1-3 Permissions — who may use AI, kept apart from credentials. */
function setAIPermissions(){
  var ed=canI.manageWorkspace(), c=aiCfg();
  return sp("Permissions",
    '<p class="hint" style="margin-bottom:10px">'+tr("AI features follow the same roles as the rest of the workspace. These two switches decide whether anything may leave it at all.")+'</p>'
    + '<div class="pref"><div class="pl"><b>'+tr("Allow external AI providers")+'</b><span>'+tr("Prompts and selected inputs may be sent to the configured provider. Keep this off until your organization accepts the AI data-processing terms.")+'</span></div><button class="switch'+(c.processing.externalEnabled?' on':'')+'" id="ai_external" '+(ed?'onclick="this.classList.toggle(\'on\');if(!this.classList.contains(\'on\'))document.getElementById(\'ai_context\').classList.remove(\'on\')"':'disabled')+' aria-label="'+attr(tr("Allow external AI providers"))+'"></button></div>'
    + '<div class="pref"><div class="pl"><b>'+tr("Allow workspace context")+'</b><span>'+tr("When enabled, task titles, projects, people, deadlines, asset metadata, and current workload can be included with an AI question. File contents are not attached automatically.")+'</span></div><button class="switch'+(c.processing.workspaceContextEnabled?' on':'')+'" id="ai_context" '+(ed?'onclick="if(document.getElementById(\'ai_external\').classList.contains(\'on\'))this.classList.toggle(\'on\');else toast(tr(\'Enable external AI providers first\'),\'bad\')"':'disabled')+' aria-label="'+attr(tr("Allow workspace context"))+'"></button></div>'
    + '<div class="pref"><div class="pl"><b>'+tr("Use external AI for report recommendations")+'</b><span>'+tr("When on, the AI recommendations slide asks your configured provider. If the call fails the deck falls back to ZenCrevia AI Intelligence and says so.")+'</span></div><button class="switch'+(c.processing.allowReporting?' on':'')+'" id="ai_reporting" '+(ed?'onclick="if(document.getElementById(\'ai_external\').classList.contains(\'on\'))this.classList.toggle(\'on\');else toast(tr(\'Enable external AI providers first\'),\'bad\')"':'disabled')+'></button></div>',
    ed?'<button class="btn primary" onclick="saveAI()">'+tr("Save AI permissions")+'</button>':'', I.lock);
}
/* §P1-3 Data & Privacy — the record of what was accepted, and by whom. */
function setAIPrivacy(){
  var c=aiCfg();
  return sp("Data & Privacy",
    '<p class="hint" style="margin-bottom:10px">'+tr("What leaves the workspace when AI is used, and the acceptance on record.")+'</p>'
    + '<div class="pref"><div class="pl"><b>'+tr("Sent with an image generation")+'</b><span>'+tr("The prompt, the negative prompt, the canvas size, and a reference image if the member attached one.")+'</span></div></div>'
    + '<div class="pref"><div class="pl"><b>'+tr("Sent with an AI question")+'</b><span>'+tr("The question, plus workspace context only if that permission is on. File contents are never attached automatically.")+'</span></div></div>'
    + '<div class="pref"><div class="pl"><b>'+tr("Never sent")+'</b><span>'+tr("API keys of other integrations, member passwords, and anything stored in Backup & Data.")+'</span></div></div>'
    + (c.processing.acceptedAt
        ? '<div class="hint">'+tr("Accepted")+' '+esc(new Date(c.processing.acceptedAt).toLocaleString())+(c.processing.acceptedBy?' '+tr("by")+' '+esc(person(c.processing.acceptedBy).name||c.processing.acceptedBy):'')+'.</div>'
        : '<div class="hint">'+tr("No external AI processing has been approved for this workspace.")+'</div>'),
    null, I.lock);
}
/* ---------- editable prompt templates ---------- */
function setPromptTemplates(){
  var ed=canI.manageWorkspace(), list=aiPromptTemplates(), custom=!!(WS.ai&&WS.ai.promptTemplates&&WS.ai.promptTemplates.length);
  var rows=list.map(function(t,i){
    return '<div class="alink" style="align-items:flex-start"><span class="ficon" style="background:var(--color-primary)">'+(i+1)+'</span>'
      + '<div style="min-width:0;flex:1"><div class="t">'+esc(t.name)+'</div>'
      + '<div class="m"><span class="mono">'+esc(tr((byId(AI_SIZES,t.size||"web_hero")||{}).name||t.size||"Website hero"))+'</span><span class="mono">'+esc(tr((byId(AI_LAYOUTS,t.layout||"left")||{}).name||t.layout||"Left aligned"))+'</span>'+(t.headline?'<span>\u201c'+esc(t.headline)+'\u201d</span>':'')+'</div>'
      + '<div class="u">'+esc((t.brief||"").slice(0,130))+'</div></div>'
      + '<div style="display:flex;gap:4px">'+(ed?'<button class="btn xs" onclick="promptTplModal(\''+t.id+'\')">'+I.edit+'Edit</button><button class="btn xs ghost" onclick="delPromptTpl(\''+t.id+'\')">'+I.trash+'</button>':'')
      + '<button class="btn xs" onclick="aiApplyTemplate(\''+t.id+'\');go(\'aihub\')">Use</button></div></div>'; }).join("");
  return sp("AI Hub \u2014 prompt templates",
    '<p class="hint" style="margin-bottom:10px">Templates fill the AI Hub brief, style, size, layout, and text fields. Editing a built-in template creates your own copy.</p>'
    + '<div class="panel" style="margin:0"><div class="panel-body">'+(rows||'<div class="pad hint">No templates.</div>')+'</div></div>',
    ed?'<button class="btn" onclick="promptTplModal()">'+I.plus+'New template</button>'+(custom?'<span class="spacer"></span><button class="btn ghost" onclick="WS.ai=WS.ai||{};WS.ai.promptTemplates=null;saveWS(\'Prompt templates reset\');renderScreen(false)">'+I.sync+'Reset to default</button>':''):'',
    I.sparkle);
}
function promptTplModal(id){
  var list=clone(aiPromptTemplates()), t=null;
  for (var i=0;i<list.length;i++) if (list[i].id===id) t=list[i];
  var isNew=!t; if (!t) t={id:"",name:"",brief:"",style:"",negative:"",headline:"",sub:"",cta:"",badge:"",size:"web_hero",customW:1200,customH:628,layout:"left",background:"",textColor:"#FFFFFF",accentColor:"",logoPosition:"top_left",safeMargin:8};
  openModal(isNew?"New prompt template":"Edit prompt template",
    fieldHtml("pt_name","Template name",'<input id="pt_name" value="'+attr(t.name)+'" placeholder="Product hero">')
    + '<div class="field"><label>Brief (becomes the prompt)</label><textarea id="pt_brief" rows="4" placeholder="Describe the scene, not the words.">'+esc(t.brief)+'</textarea></div>'
    + '<div class="field-row">'+fieldHtml("pt_size","Banner size",selectHtml("pt_size",AI_SIZES.map(function(x){ return [x.id,x.name+" \u00b7 "+x.w+"\u00d7"+x.h]; }).concat([["custom","Custom size…"]]),t.size,'onchange="document.getElementById(\'pt_custom_size\').style.display=this.value===\'custom\'?\'grid\':\'none\'"'))
    + fieldHtml("pt_layout","Layout",selectHtml("pt_layout",AI_LAYOUTS.map(function(x){ return [x.id,x.name]; }),t.layout,""))+'</div>'
    + '<div id="pt_custom_size" class="field-row" style="display:'+(t.size==="custom"?"grid":"none")+'">'+fieldHtml("pt_w","Custom width (px)",'<input id="pt_w" type="number" min="64" max="4096" value="'+(+t.customW||1200)+'">')+fieldHtml("pt_h","Custom height (px)",'<input id="pt_h" type="number" min="64" max="4096" value="'+(+t.customH||628)+'">')+'</div>'
    + '<div class="field-row">'+fieldHtml("pt_style","Style keywords",'<input id="pt_style" value="'+attr(t.style)+'">')
    + fieldHtml("pt_neg","Avoid",'<input id="pt_neg" value="'+attr(t.negative)+'">')+'</div>'
    + '<div class="field-row">'+fieldHtml("pt_head","Headline",'<input id="pt_head" value="'+attr(t.headline)+'">')
    + fieldHtml("pt_badge","Badge",'<input id="pt_badge" value="'+attr(t.badge)+'">')+'</div>'
    + fieldHtml("pt_sub","Subheadline",'<input id="pt_sub" value="'+attr(t.sub)+'">')
    + fieldHtml("pt_cta","Call to action",'<input id="pt_cta" value="'+attr(t.cta)+'">')
    + '<div class="field-row">'+fieldHtml("pt_bg","Background fallback",'<input id="pt_bg" type="color" value="'+attr(t.background||"#0B2A5B")+'">')+fieldHtml("pt_text","Text color",'<input id="pt_text" type="color" value="'+attr(t.textColor||"#FFFFFF")+'">')+'</div>'
    + '<div class="field-row">'+fieldHtml("pt_accent","Accent / CTA",'<input id="pt_accent" type="color" value="'+attr(t.accentColor||"#C6F24E")+'">')+fieldHtml("pt_logo","Logo position",selectHtml("pt_logo",[["top_left","Top left"],["top_right","Top right"],["bottom_left","Bottom left"],["bottom_right","Bottom right"]],t.logoPosition||"top_left",""))+'</div>'
    + fieldHtml("pt_safe","Safe-zone margin (%)",'<input id="pt_safe" type="number" min="0" max="25" value="'+(+t.safeMargin||8)+'" placeholder="8">')+'<div class="hint">Keep text and logo away from edges or social-media interface overlays. 8–10% is a good starting point.</div>',
    '<button class="btn primary" onclick="savePromptTpl(\''+(t.id||"")+'\')">Save template</button>');
}
function savePromptTpl(id){
  if (!require(["pt_name"])) return;
  var list=clone(aiPromptTemplates());
  var t={ id:id||("p_"+Math.random().toString(36).slice(2,7)), name:val("pt_name"), brief:val("pt_brief"), style:val("pt_style"),
          negative:val("pt_neg"), headline:val("pt_head"), sub:val("pt_sub"), cta:val("pt_cta"), badge:val("pt_badge"),
          size:val("pt_size"), customW:Math.max(64,Math.min(4096,+val("pt_w")||1200)), customH:Math.max(64,Math.min(4096,+val("pt_h")||628)), layout:val("pt_layout"), background:val("pt_bg"), textColor:val("pt_text"), accentColor:val("pt_accent"), logoPosition:val("pt_logo"), safeMargin:Math.max(0,Math.min(25,+val("pt_safe")||8)) };
  var found=false;
  list=list.map(function(x){ if (x.id===id){ found=true; if(x.editorFields){t.editorFields=clone(x.editorFields);Object.keys(t).forEach(function(k){if(k!=="editorFields"&&k!=="id"&&k!=="name")t.editorFields[k]=t[k];});if(t.editorFields.canvasBg)t.editorFields.canvasBg.color=t.background;if(t.editorFields.layerStyles&&t.editorFields.layerStyles.headline)t.editorFields.layerStyles.headline.textFill=t.textColor;} return t; } return x; });
  if (!found) list.push(t);
  WS.ai=WS.ai||{}; WS.ai.promptTemplates=list;
  closeModal(); saveWS("Template saved"); renderScreen(false);
}
function delPromptTpl(id){
  confirmModal("Delete template?","It disappears from the picker in AI Hub.",function(){
    WS.ai=WS.ai||{}; WS.ai.promptTemplates=aiPromptTemplates().filter(function(t){ return t.id!==id; });
    saveWS("Template deleted"); renderScreen(false);
  });
}

function setChatTemplates(){
  var ed=canI.manageWorkspace(), list=aiChatTemplates(), custom=!!(WS.ai&&WS.ai.chatTemplates&&WS.ai.chatTemplates.length);
  var rows=list.map(function(t,i){
    return '<div class="alink" style="align-items:flex-start"><span class="ficon" style="background:var(--color-ink)">'+(i+1)+'</span>'
      + '<div style="min-width:0;flex:1"><div class="t">'+esc(t.name)+'</div><div class="u">'+esc(t.prompt)+'</div></div>'
      + (ed?'<div style="display:flex;gap:4px"><button class="btn xs" onclick="chatTplModal(\''+t.id+'\')">'+I.edit+'Edit</button><button class="btn xs ghost" onclick="delChatTpl(\''+t.id+'\')">'+I.trash+'</button></div>':'')+'</div>'; }).join("");
  return sp("AI Intelligence \u2014 chat templates",
    '<p class="hint" style="margin-bottom:10px">These prompts appear as shortcuts in the assistant. Editing a built-in prompt creates your own copy.</p>'
    + '<div class="panel" style="margin:0"><div class="panel-body">'+(rows||'<div class="pad hint">No templates.</div>')+'</div></div>',
    ed?'<button class="btn" onclick="chatTplModal()">'+I.plus+'New template</button>'+(custom?'<span class="spacer"></span><button class="btn ghost" onclick="WS.ai=WS.ai||{};WS.ai.chatTemplates=null;saveWS(\'Chat templates reset\');renderScreen(false)">'+I.sync+'Reset to default</button>':''):'',
    I.sparkle);
}
function chatTplModal(id){
  var list=aiChatTemplates(), t=null;
  for (var i=0;i<list.length;i++) if (list[i].id===id) t=list[i];
  var isNew=!t; if (!t) t={id:"",name:"",prompt:""};
  openModal(isNew?"New chat template":"Edit chat template",
    fieldHtml("ct_name","Button label",'<input id="ct_name" value="'+attr(t.name)+'" placeholder="Project risk check">')
    + '<div class="field"><label>Prompt sent to the assistant</label><textarea id="ct_prompt" rows="4" placeholder="Which projects are at risk of missing their deadline?">'+esc(t.prompt)+'</textarea><div class="hint">The workspace snapshot is attached automatically \u2014 just write the question.</div></div>',
    '<button class="btn primary" onclick="saveChatTpl(\''+(t.id||"")+'\')">Save template</button>');
}
function saveChatTpl(id){
  if (!require(["ct_name","ct_prompt"])) return;
  var list=clone(aiChatTemplates());
  var t={ id:id||("c_"+Math.random().toString(36).slice(2,7)), name:val("ct_name"), prompt:val("ct_prompt") };
  var found=false;
  list=list.map(function(x){ if (x.id===id){ found=true; return t; } return x; });
  if (!found) list.push(t);
  WS.ai=WS.ai||{}; WS.ai.chatTemplates=list;
  closeModal(); saveWS("Template saved"); renderScreen(false);
}
function delChatTpl(id){
  confirmModal("Delete template?","It disappears from the assistant's quick prompts.",function(){
    WS.ai=WS.ai||{}; WS.ai.chatTemplates=aiChatTemplates().filter(function(t){ return t.id!==id; });
    saveWS("Template deleted"); renderScreen(false);
  });
}

function aiChatProviderPreset(provider){
  var ep=document.getElementById("ai_c_ep"), model=document.getElementById("ai_c_model");
  if (provider==="gemini") { ep.value="https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"; model.value="gemini-3.5-flash"; }
  else if (provider==="anthropic") { ep.value="https://api.anthropic.com/v1/messages"; model.value="claude-sonnet-4-6"; }
}
function saveAI(){
  var c=aiCfg();
  var ik=val("ai_i_key"), ck=val("ai_c_key");
  var keepP=(WS.ai&&WS.ai.promptTemplates)||null, keepC=(WS.ai&&WS.ai.chatTemplates)||null;
  /* §15 saveAI rebuilds WS.ai wholesale — the model registry and the resource
     policy must survive that, or saving a key would silently reset both. */
  var keepModels=(WS.ai&&WS.ai.models)||null, keepPolicy=(WS.ai&&WS.ai.policy)||null;
  var external=document.getElementById("ai_external")&&document.getElementById("ai_external").classList.contains("on");
  var context=external&&document.getElementById("ai_context")&&document.getElementById("ai_context").classList.contains("on");
  var reporting=external&&document.getElementById("ai_reporting")&&document.getElementById("ai_reporting").classList.contains("on");
  WS.ai={
    promptTemplates:keepP, chatTemplates:keepC, models:keepModels, policy:keepPolicy,
    processing:{externalEnabled:!!external,workspaceContextEnabled:!!context,allowReporting:!!reporting,acceptedAt:c.processing.acceptedAt||null,acceptedBy:c.processing.acceptedBy||null},
    /* §6.4 the Default model control holds a registry id; store the provider's
       real model string so the legacy `image.model` field stays meaningful. */
    image:{ provider:"magnific", endpoint:val("ai_i_ep")||c.image.endpoint, model:aiModelStringFromField(c.image.model), defaultStyle:val("ai_i_style"),
            key: ik==="clear"?null:(ik||undefined), keySet: ik==="clear"?false:(!!ik||c.image.keySet) },
    chat:{ provider:val("ai_c_prov"), endpoint:val("ai_c_ep")||c.chat.endpoint, model:val("ai_c_model"), systemExtra:val("ai_c_sys"),
           key: ck==="clear"?null:(ck||undefined), keySet: ck==="clear"?false:(!!ck||c.chat.keySet) }
  };
  if (!API.on){ /* standalone demo keeps provider keys in memory for this tab only */
    window.ZENCREVIA_DEMO_AI_KEYS=window.ZENCREVIA_DEMO_AI_KEYS||{};
    if (ik==="clear") delete window.ZENCREVIA_DEMO_AI_KEYS.image; else if (ik) window.ZENCREVIA_DEMO_AI_KEYS.image=ik;
    if (ck==="clear") delete window.ZENCREVIA_DEMO_AI_KEYS.chat; else if (ck) window.ZENCREVIA_DEMO_AI_KEYS.chat=ck;
    try{ localStorage.removeItem("cos.ai.image.key");localStorage.removeItem("cos.ai.chat.key"); }catch(e){}
    if(external&&!WS.ai.processing.acceptedAt){WS.ai.processing.acceptedAt=new Date().toISOString();WS.ai.processing.acceptedBy=ME;}
    WS.ai.image.key=""; WS.ai.chat.key="";
  }
  saveWS("AI settings saved"); renderScreen(false);
}
function aiTest(which){
  toast("Testing\u2026");
  if (which==="chat"){
    var probe={ messages:[{role:"user",content:"Reply with the single word: ready"}], context:"(connection test)" };
    (API.on?apiFetch("POST","/api/ai/chat",probe):aiDirectChat("ready?"))
      .then(function(r){ toast("Chat model responded: "+String(r.text||"").slice(0,40)); })
      .catch(function(e){ toast("Chat test failed: "+e.message,"bad"); });
  } else {
    /* the test must exercise the same model a member would actually get */
    var chosen=(typeof aiDefaultModel==="function"&&aiDefaultModel())||null;
    var body={ prompt:"a plain neutral grey gradient, no subject", width:512, height:512,
               modelRegistryId: chosen?chosen.id:null,
               model: aiModelStringFromField(aiCfg().image.model) };
    (API.on?apiFetch("POST","/api/ai/image",body):aiDirectImage(body))
      .then(function(saved){ if(saved===false)return false; toast("Image provider responded"); })
      .catch(function(e){ toast("Image test failed: "+e.message,"bad"); });
  }
}

/* ---------- automation: hide finished work automatically ---------- */
function setAutomation(){ var ed=canI.manageWorkspace(); var ro=ed?"":" disabled"; var c=autoHideCfg(); var modes=[["off","Never hide"],["month","When the month changes"],["quarter","When the quarter changes"],["days","After a number of days"]];
  var hid=autoHiddenCount(); var arch=PROJECTS.filter(function(p){ return p.status==="archived"; }).length;
  return sp("Auto-hide completed tasks",
    '<p class="hint" style="margin-bottom:10px">Hide completed tasks after the selected period. Use Show hidden tasks to see them again. Export results follow the selected report filters.</p>'
    +'<div class="field-row">'+fieldHtml("ah_mode","Hide done tasks",selectHtml("ah_mode",modes,c.tasks,ro+' onchange="document.getElementById(\'f_ah_days\').style.display=this.value===\'days\'?\'block\':\'none\'"'))
    +'<div class="field" id="f_ah_days" style="display:'+(c.tasks==="days"?"block":"none")+'"><label>After how many days</label><input'+ro+' id="ah_days" type="number" min="1" max="365" value="'+c.taskDays+'"><div class="err">Required</div></div></div>'
    +'<div class="field-row">'+fieldHtml("ap_mode","Archive done projects",selectHtml("ap_mode",modes,c.projects,ro+' onchange="document.getElementById(\'f_ap_days\').style.display=this.value===\'days\'?\'block\':\'none\'"'))
    +'<div class="field" id="f_ap_days" style="display:'+(c.projects==="days"?"block":"none")+'"><label>After how many days</label><input'+ro+' id="ap_days" type="number" min="1" max="365" value="'+c.projectDays+'"><div class="err">Required</div></div></div>'
    +'<div class="hint" style="margin-top:6px">Right now: <b>'+hid+'</b> task'+(hid===1?"":"s")+' auto-hidden ('+autoHideLabel()+') \u00b7 <b>'+arch+'</b> archived project'+(arch===1?"":"s")+'. <a href="#" style="color:var(--color-primary);font-weight:600" onclick="S.filters.hidden=\'show\';S.taskScope=\'all\';go(\'tasks\',\'list\');return false">Show hidden tasks</a></div>',
    ed?'<button class="btn ghost" onclick="WS.autoHide=clone(AUTOHIDE_DEFAULT);saveWS(\'Automation reset to default\');renderScreen(false)">'+I.sync+'Reset to default</button><span class="spacer"></span><button class="btn primary" onclick="saveAutomation()">Save</button>':'',I.sync); }
function saveAutomation(){ WS.autoHide={tasks:val("ah_mode"),taskDays:Math.max(1,+val("ah_days")||30),projects:val("ap_mode"),projectDays:Math.max(1,+val("ap_days")||30)}; sweepArchiveLocal(); saveWS("Automation saved"); refresh(); }

/* ---------- what shows in the top menu and on home ---------- */
function applyPresetNow(id){
  var p=null; presets().forEach(function(x){ if (x.id===id) p=x; });
  if (!p) return;
  var pf=myPrefs();
  pf.dashHidden=(p.dashHidden||[]).slice(); pf.navHidden=(p.navHidden||[]).slice();
  if (p.dashboard) pf.dashboard=p.dashboard; if (p.dashWide) pf.dashWide=p.dashWide;
  saveMyPrefs(); applyShell(); refresh(); toast('Switched to "'+p.name+'"');
}
function setLayout(){ var nh=navHidden(), dh=dashHidden();
  var navRows=NAV_ALL.map(function(it){ var on=nh.indexOf(it[0])<0; var lock=it[0]==="home";
    return '<label class="chipx" style="cursor:'+(lock?"not-allowed":"pointer")+';opacity:'+(lock?".6":"1")+'"><input type="checkbox" '+(on?"checked":"")+(lock?" disabled":"")+' onchange="toggleNavItem(\''+it[0]+'\')"> '+it[1]+'</label>'; }).join("");
  var cardRows=DASH_DEFAULT.map(function(k){ var on=dh.indexOf(k)<0;
    return '<label class="chipx" style="cursor:pointer"><input type="checkbox" '+(on?"checked":"")+' onchange="toggleDashHide(\''+k+'\')"> '+DASH_NAMES[k]+'</label>'; }).join("");
  var ps=presets();
  var presetRows=ps.length?ps.map(function(p){
      return '<div class="alink"><span class="ficon" style="background:var(--color-primary)">'+I.tiles+'</span>'
        + '<div style="min-width:0;flex:1"><div class="t">'+esc(p.name)+'</div><div class="m"><span>'+(DASH_DEFAULT.length-(p.dashHidden||[]).length)+' cards</span><span>'+(NAV_ALL.length-(p.navHidden||[]).length)+' menu items</span></div></div>'
        + '<button class="btn xs" onclick="applyPresetNow(\''+p.id+'\')">Use</button></div>'; }).join("")
    :'<p class="hint">No presets yet. Open <b>Customize layout</b> and save one.</p>';
  return sp("Task panel",
    '<p class="hint" style="margin-bottom:10px">'+tr("Task panel position")+'</p>'+taskPanelPicker(),
    null,I.list,"desktop-only")
  + sp("Layout presets",
    '<p class="hint" style="margin-bottom:10px">Save combinations of home cards and menu items for your account.</p>'+presetRows,
    '<button class="btn primary" onclick="customizeModal()">'+I.tiles+'Customize layout</button>',I.tiles)
  + sp("Top menu",'<p class="hint" style="margin-bottom:10px">Choose which menu items you see. This only affects your account.</p><div class="chips">'+navRows+'</div>'
    +(nh.length?'<div class="hint" style="margin-top:10px"><b>'+nh.length+'</b> menu item'+(nh.length===1?"":"s")+' hidden.</div>':''),
    '<button class="btn" onclick="resetNav()">'+I.sync+'Restore default menu</button>',I.grid)
  + sp("Home cards",'<p class="hint" style="margin-bottom:10px">Choose your home cards. Drag a card on Home to change its position.</p><div class="chips">'+cardRows+'</div>'
    +(dh.length?'<div class="hint" style="margin-top:10px"><b>'+dh.length+'</b> card'+(dh.length===1?"":"s")+' hidden.</div>':''),
    '<button class="btn" onclick="resetDashboard()">'+I.sync+'Restore default home layout</button><span class="spacer"></span><button class="btn primary" onclick="go(\'home\')">'+I.home+'Go to home</button>',I.home); }

function setWorkspace(){ var ed=canI.manageWorkspace(); var ro=ed?"":" disabled"; var days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; var tz=["Asia/Jakarta","Asia/Makassar","Asia/Jayapura","Asia/Singapore","Asia/Kuala_Lumpur","Asia/Bangkok","Asia/Tokyo","Australia/Sydney","Europe/London","Europe/Berlin","America/New_York","America/Los_Angeles","UTC"]; if (tz.indexOf(WS.timeZone)<0) tz.unshift(WS.timeZone);
  return sp("Workspace identity",'<div class="field-row">'+fieldHtml("ws_name","Workspace name",'<input'+ro+' id="ws_name" value="'+attr(WS.name)+'">')+fieldHtml("ws_tag","Tagline",'<input'+ro+' id="ws_tag" value="'+attr(WS.tagline)+'">')+'</div><div class="field-row">'+fieldHtml("ws_logo","Logo initials",'<input'+ro+' id="ws_logo" maxlength="3" value="'+attr(WS.logo)+'">')+'<div class="field"><label>Logo image</label><div style="display:flex;gap:8px;align-items:center"><span class="ws-logo">'+(WS.logoImg?'<img src="'+WS.logoImg+'">':esc(WS.logo))+'</span>'+(ed?'<button class="btn sm" onclick="pickImage(\'logoImg\')">Upload</button>'+(WS.logoImg?'<button class="btn sm ghost" onclick="WS.logoImg=null;applyShell();renderScreen(false);saveWS()">Remove</button>':''):'')+'</div></div></div><div class="field"><label>Favicon</label><div style="display:flex;gap:8px;align-items:center">'+(WS.favicon?'<img src="'+attr(WS.favicon)+'" style="width:20px;height:20px;border-radius:5px">':'<span style="width:20px;height:20px;border-radius:5px;background:var(--color-surface-sunken);display:grid;place-items:center;font-size:9px;font-weight:800;color:var(--color-text-tertiary)">'+esc((WS.logo||"?").slice(0,2))+'</span>')+''+(ed?'<button class="btn sm" onclick="pickImage(\'favicon\')">Upload</button>'+(WS.favicon?'<button class="btn sm ghost" onclick="WS.favicon=null;document.getElementById(\'favicon\').href=\'data:,\';location.reload()">Reset</button>':''):'')+'</div></div>',ed?'<button class="btn primary" onclick="WS.name=val(\'ws_name\')||WS.name;WS.tagline=val(\'ws_tag\');WS.logo=val(\'ws_logo\')||WS.logo;applyShell();saveWS(\'Workspace saved\')">Save</button>':'',I.home)+
  sp("Time & working hours",'<div class="field-row">'+fieldHtml("ws_tz","Time zone",selectHtml("ws_tz",tz.map(function(z){ return [z,z]; }),WS.timeZone||"Asia/Jakarta",ro))+'<div class="field"><label>Working days</label><div class="chips">'+days.map(function(d,i){ return '<label class="chipx'+((WS.workingDays||[]).indexOf(i)>=0?" on":"")+'" style="cursor:pointer"><input type="checkbox" data-wd="'+i+'" '+((WS.workingDays||[]).indexOf(i)>=0?"checked":"")+ro+' style="display:none" onchange="this.parentNode.classList.toggle(\'on\',this.checked)">'+d+'</label>'; }).join("")+'</div></div></div><div class="field-row">'+fieldHtml("ws_ws","Work starts",'<input'+ro+' id="ws_ws" type="time" value="'+attr(WS.workStart||"09:00")+'">')+fieldHtml("ws_we","Work ends",'<input'+ro+' id="ws_we" type="time" value="'+attr(WS.workEnd||"18:00")+'">')+'</div><p class="hint">Working hours are saved as a workspace reference. Set weekly capacity in each member’s profile. The calendar uses Saturday and Sunday as weekends.</p>',ed?'<button class="btn primary" onclick="WS.timeZone=val(\'ws_tz\');WS.workStart=val(\'ws_ws\');WS.workEnd=val(\'ws_we\');WS.workingDays=[].map.call(document.querySelectorAll(\'[data-wd]:checked\'),function(c){return +c.getAttribute(\'data-wd\')});saveWS(\'Working time saved\')">Save</button>':'',I.calendar)+
  (ed&&API.on?sp("Access",'<div class="pref"><div class="pl"><b>'+tr("Allow self-registration")+'</b><span>'+tr("Shows a Register tab on the sign-in page and the page")+' <span class="mono">'+esc(location.origin+(/^https?:$/.test(location.protocol)?"/register":location.pathname+"#/register"))+'</span>. '+tr("New accounts get the default role below.")+'</span></div><button class="switch'+(WS.allowRegistration?' on':'')+'" id="ws_allowreg" onclick="this.classList.toggle(\'on\')" aria-label="'+attr(tr("Allow self-registration"))+'"></button></div>'+"<div class=\"field-row\">"+fieldHtml("ws_code","Workspace join code (required to register)",'<input id="ws_code" value="'+attr(WS.joinCode||"")+'" placeholder="Leave empty to allow anyone with the link" style="font-family:var(--font-mono);text-transform:uppercase">')+fieldHtml("ws_role","Default role for new accounts",selectHtml("ws_role",ROLES.map(function(r){ return [r.id,r.name]; }),WS.defaultRole||"member"))+'</div><p class="hint">Share the join code with your team so they can register at <span class="mono">'+esc(location.origin)+'</span>. Change roles per person under Members.</p>','<button class="btn primary" onclick="WS.allowRegistration=document.getElementById(\'ws_allowreg\').classList.contains(\'on\');WS.joinCode=val(\'ws_code\').toUpperCase();if(WS.allowRegistration&&!WS.joinCode&&!confirm(tr(\'Registration is on without a join code: anyone who knows the address can create an account. Continue?\')))return;WS.defaultRole=val(\'ws_role\');saveWS(\'Access settings saved\')">Save</button>',I.lock):''); }
function pickImage(k){ var inp=document.getElementById("fileInput"); inp.accept="image/*"; inp.onchange=function(){ var f=inp.files[0]; inp.value=""; if (!f) return; if (f.size>400000) return toast("Keep images under 400 KB","bad"); var rd=new FileReader(); rd.onload=function(){ WS[k]=rd.result; applyShell(); applyTheme(); renderScreen(false); saveWS(k==="favicon"?"Favicon updated":"Logo updated"); }; rd.readAsDataURL(f); }; inp.click(); }
/* theme */
function addThemeGoogleFont(){
  if(document.getElementById('themeFontDialog'))return;
  var L=function(en,id){return UI_LANG==='id'?id:en;},opener=document.activeElement;
  var d=document.createElement('dialog');d.id='themeFontDialog';d.className='theme-font-dialog';
  d.setAttribute('aria-labelledby','themeFontTitle');d.setAttribute('aria-describedby','themeFontIntro');
  d.innerHTML='<form novalidate><header class="theme-font-head"><span class="theme-font-mark" aria-hidden="true">Aa</span><div><div class="eyebrow">'+L('Workspace typography','Tipografi workspace')+'</div><h2 id="themeFontTitle">'+L('Add Google Font','Tambah Google Font')+'</h2></div><button type="button" class="iconbtn" data-close aria-label="'+L('Close','Tutup')+'">'+I.x+'</button></header>'+
  '<div class="theme-font-body"><p id="themeFontIntro" class="muted">'+L('Give your workspace a new character. Add a font to use across your workspace and AI Hub.','Beri karakter baru pada workspace. Tambahkan font untuk digunakan di workspace dan AI Hub.')+'</p>'+
  '<a class="theme-font-catalog" href="https://fonts.google.com/" target="_blank" rel="noopener noreferrer">'+L('Browse all fonts on Google Fonts','Cek semua font di Google Fonts')+' <span aria-hidden="true">↗</span></a>'+
  '<div class="field"><label for="themeFontName">'+L('Font family','Nama keluarga font')+'</label><input id="themeFontName" placeholder="'+L('For example: DM Sans','Contoh: DM Sans')+'" maxlength="80" autocomplete="off" spellcheck="false" aria-describedby="themeFontHint themeFontError"><p id="themeFontHint" class="hint">'+L('Enter the family name as listed on Google Fonts.','Masukkan nama keluarga font sesuai yang tertera di Google Fonts.')+'</p><p id="themeFontError" class="theme-font-error" role="alert" hidden></p></div>'+
  '<div><div class="eyebrow">'+L('Try a popular font','Coba font populer')+'</div><div class="theme-font-options">'+['DM Sans','Inter','Poppins','Roboto','Open Sans','Montserrat','Manrope','Lora'].map(function(n){return '<button type="button" class="btn" data-font="'+n+'" aria-pressed="false">'+n+'</button>';}).join('')+'</div></div>'+
  '<section class="theme-font-preview" aria-label="'+L('Font preview','Pratinjau font')+'"><div class="theme-font-preview-top"><span class="eyebrow">'+L('Preview','Pratinjau')+'</span><span id="themeFontFamily" class="hint">'+L('Current font','Font saat ini')+'</span></div><div id="themeFontSample"><div class="theme-font-sample">'+L('Make room for ideas.','Ruang untuk ide baru.')+'</div><p>ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz · 0123456789</p></div></section>'+
  '<p id="themeFontStatus" class="hint" role="status">'+L('An internet connection is needed to load Google Fonts.','Koneksi internet diperlukan untuk memuat Google Fonts.')+'</p></div>'+
  '<footer class="theme-font-foot"><button type="button" class="btn" data-close>'+L('Cancel','Batal')+'</button><button type="submit" class="btn primary">'+I.plus+L('Add & apply font','Tambah & terapkan')+'</button></footer></form>';
  document.body.appendChild(d);
  var input=d.querySelector('input'),error=d.querySelector('#themeFontError'),sample=d.querySelector('#themeFontSample'),status=d.querySelector('#themeFontStatus'),timer,previewLink,revision=0,timeout;
  function name(){return input.value.trim().replace(/\s+/g,' ');}
  function valid(n){return /^[a-zA-Z0-9 ._-]{2,80}$/.test(n);}
  function reset(){revision++;clearTimeout(timer);clearTimeout(timeout);if(previewLink){previewLink.remove();previewLink=null;}sample.style.fontFamily='';}
  function update(){
    reset();var n=name(),version=revision;
    error.hidden=true;input.removeAttribute('aria-invalid');
    d.querySelector('#themeFontFamily').textContent=n||L('Current font','Font saat ini');
    d.querySelectorAll('[data-font]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.font.toLowerCase()===n.toLowerCase()));});
    status.textContent=L('An internet connection is needed to load Google Fonts.','Koneksi internet diperlukan untuk memuat Google Fonts.');
    if(!valid(n))return;
    status.textContent=L('Loading preview…','Memuat pratinjau…');
    timer=setTimeout(function(){
      var link=document.createElement('link');previewLink=link;link.rel='stylesheet';
      function failed(){if(version!==revision||!d.open)return;clearTimeout(timeout);status.textContent=L('Preview unavailable. Check the font name or your connection.','Pratinjau tidak tersedia. Periksa nama font atau koneksi internet.');}
      timeout=setTimeout(failed,10000);link.onerror=failed;
      link.onload=function(){document.fonts.load('400 24px "'+n+'"').then(function(fonts){if(version!==revision||!d.open)return;clearTimeout(timeout);if(!fonts.length)return failed();sample.style.fontFamily='"'+n+'", sans-serif';status.textContent=L('Preview ready. Apply this font to update your workspace.','Pratinjau siap. Terapkan font ini untuk memperbarui workspace.');},failed);};
      link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(n).replace(/%20/g,'+')+'&display=swap';document.head.appendChild(link);
    },400);
  }
  input.addEventListener('input',update);
  d.querySelectorAll('[data-font]').forEach(function(b){b.addEventListener('click',function(){input.value=b.dataset.font;update();input.focus();});});
  d.querySelectorAll('[data-close]').forEach(function(b){b.addEventListener('click',function(){d.close();});});
  d.addEventListener('keydown',function(e){e.stopPropagation();});
  d.addEventListener('click',function(e){if(e.target===d){var r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
  d.addEventListener('close',function(){reset();d.remove();if(opener&&opener.isConnected)opener.focus();});
  d.querySelector('form').addEventListener('submit',function(e){
    e.preventDefault();var n=name();
    if(!valid(n)){error.textContent=L('Use 2–80 letters, numbers, spaces, periods, hyphens or underscores.','Gunakan 2–80 huruf, angka, spasi, titik, tanda hubung, atau garis bawah.');error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
    WS.theme.customFonts=WS.theme.customFonts||[];
    var existing=WS.theme.customFonts.find(function(f){return f.toLowerCase()===n.toLowerCase();});
    if(existing)n=existing;else WS.theme.customFonts.push(n);
    WS.theme.font=n;applyTheme();saveWS(L('Google Font added','Google Font ditambahkan'));d.close();renderScreen(false);
    var trigger=document.querySelector('.theme-google-fonts > button');if(trigger)trigger.focus();
  });
  d.showModal();input.focus();
}

function removeThemeGoogleFont(name){ WS.theme.customFonts=(WS.theme.customFonts||[]).filter(function(f){return f!==name;}); if(WS.theme.font===name)WS.theme.font="system";applyTheme();saveWS("Google Font removed");renderScreen(false); }
function themeFontChoices(th){
  var presets=[["system","Poppins (default)"],["inter","Inter"],["humanist","Humanist"],["serif","Serif"]];
  var custom=th.customFonts||[];
  return '<div class="seg theme-font-choices" role="group" aria-label="'+attr(tr('Typography'))+'">'+
    presets.map(function(f){return '<button type="button" class="'+(th.font===f[0]?'on':'')+'" aria-pressed="'+(th.font===f[0])+'" onclick="'+attr('setFont('+JSON.stringify(f[0])+')')+'">'+esc(tr(f[1]))+'</button>';}).join('')+
    custom.map(function(f){return '<span class="theme-font-choice'+(th.font===f?' on':'')+'"><button type="button" class="theme-font-use" aria-pressed="'+(th.font===f)+'" onclick="'+attr('setFont('+JSON.stringify(f)+')')+'">'+esc(f)+'</button><button type="button" class="theme-font-remove" title="'+attr(tr('Remove')+' '+f)+'" aria-label="'+attr(tr('Remove')+' '+f)+'" onclick="'+attr('removeThemeGoogleFont('+JSON.stringify(f)+')')+'">'+I.x+'</button></span>';}).join('')+'</div>';
}
function themeGoogleFontPanel(th){return '<div class="theme-google-fonts"><div class="hint" style="margin:10px 0">Choose a family from Google Fonts—no font upload needed. It also appears in AI Hub.</div><button class="btn xs" style="margin-top:8px" onclick="addThemeGoogleFont()">'+I.plus+'Google Font</button></div>';}

function setThemeTab(){ var th=WS.theme, tc=WS.taskCardColors||{}, fontPanel=themeGoogleFontPanel(th); var pv=function(bg,sb,ac){ return '<div class="pv" style="background:'+bg+'"><i style="width:30%;background:'+sb+'"></i><i style="width:12%;background:'+ac+';margin:8px 4px;border-radius:3px"></i></div>'; };
  return sp("Colors",'<div class="field"><label>Accent color</label><div class="swatches">'+swatchHtml(th.accent,"setAccent")+'<span class="mono tiny muted">'+th.accent+'</span></div></div><div class="field"><label>Secondary (highlight) color</label><div class="swatches">'+swatchHtml(th.secondary,"setSecondary")+'<span class="mono tiny muted">'+th.secondary+'</span></div></div><p class="hint">Change team colors in Settings → Teams.</p>',null,I.edit)+
  sp("Appearance",'<div class="field"><label>Mode</label><div class="opt-cards"><button class="opt'+(th.appearance==="light"?" on":"")+'" onclick="setAppearance(\'light\')">'+pv("#fff","#f1f2f5",th.accent)+'Light</button><button class="opt'+(th.appearance==="dark"?" on":"")+'" onclick="setAppearance(\'dark\')">'+pv("#181B20","#14171C",th.accent)+'Dark</button><button class="opt'+(th.appearance==="system"?" on":"")+'" onclick="setAppearance(\'system\')">'+pv("linear-gradient(90deg,#fff 50%,#181B20 50%)","#888",th.accent)+'System</button></div></div><div class="field"><label>Density</label>'+segHtml([["comfortable","Comfortable"],["compact","Compact"]],th.density,"setDensity")+'</div><div class="field"><label>Corner radius</label>'+segHtml([["sharp","Sharp"],["medium","Medium"],["round","Round"]],th.radius,"setRadius")+'</div><div class="field"><label>Typography</label>'+themeFontChoices(th)+fontPanel+'</div>','<button class="btn" onclick="WS.theme={accent:\'#2F5BFF\',secondary:\'#C6F24E\',appearance:\'light\',density:\'comfortable\',radius:\'round\',font:\'system\'};applyTheme();renderScreen(false);saveWS(\'Theme reset\')">Reset to defaults</button>',I.settings)+
  sp("Task card colors",'<p class="hint" style="margin-bottom:12px">Color task cards by team or label.</p><div class="field-row">'+fieldHtml("tc_kanban","Kanban",selectHtml("tc_kanban",[["team","Team color"],["label","Label color"]],tc.kanban||"team"))+fieldHtml("tc_calendar","Calendar",selectHtml("tc_calendar",[["team","Team color"],["label","Label color"]],tc.calendar||"team"))+'</div>','<button class="btn primary" onclick="WS.taskCardColors={kanban:val(\'tc_kanban\'),calendar:val(\'tc_calendar\')};saveWS(\'Task card colors saved\');renderScreen(false)">Save card colors</button>',I.kanban); }
/* §470-478 colour fields show a live swatch and a Title Case name. */
var WORKFLOW_COLORS=["gray","blue","orange","red","green","purple","pink","teal","yellow"];
function colorName(c){ c=String(c||"gray"); return c.charAt(0).toUpperCase()+c.slice(1); }
function colorSelect(current,onchange,disabled){
  current=WORKFLOW_COLORS.indexOf(current)>=0?current:"gray";
  return '<span class="color-swatch-field" style="--sw:var(--team-'+current+')">'
    + '<span class="swatch" aria-hidden="true"></span>'
    + '<select '+(disabled?"disabled":"")+' aria-label="Colour"'
    + " onchange=\"this.parentNode.style.setProperty('--sw','var(--team-'+this.value+')');"+onchange+"\">"
    + WORKFLOW_COLORS.map(function(c){ return '<option value="'+c+'"'+(current===c?" selected":"")+'>'+tr(colorName(c))+'</option>'; }).join("")
    + '</select></span>';
}
/* workflow */
function setWorkflow(){ var ed=canI.manageWorkspace(); var kinds=[["queue","Queue"],["work","Work"],["review","Review"],["revision","Revision"],["closed","Closed"]]; var cols=["gray","blue","orange","red","green","purple","pink","teal","yellow"];
  return sp("Workflow stages",'<p class="hint" style="margin-bottom:8px">Stages define the task board and approval flow. Review allows approval or revision; Revision holds work sent back; Closed marks work as complete.</p>'+WS.workflow.map(function(s,i){ var inUse=TASKS.filter(function(t){ return t.status===s.id; }).length; return '<div class="stage-edit workflow-stage'+(ed?" reorder-row":"")+'" data-reorder="workflow" data-index="'+i+'" ondragover="reorderOver(event,\'workflow\','+i+')" ondragleave="reorderLeave(event)" ondrop="reorderDrop(event,\'workflow\','+i+')"><div class="ord" style="display:flex;align-items:center;gap:4px">'+(ed?reorderHandle("workflow",i,s.name):"")+'<span class="ord-num">'+(i+1)+'</span></div><input aria-label="'+attr(tr("Stage name"))+' '+(i+1)+'" '+(ed?"":"disabled")+' value="'+attr(s.name)+'" onchange="WS.workflow['+i+'].name=this.value;refresh();saveWS()"><select aria-label="'+attr(tr("Stage type")+" — "+s.name)+'" '+(ed?"":"disabled")+' onchange="WS.workflow['+i+'].kind=this.value;refresh();saveWS()">'+kinds.map(function(k){ return '<option value="'+k[0]+'"'+(s.kind===k[0]?" selected":"")+'>'+tr(k[1])+'</option>'; }).join("")+'</select>'+colorSelect(s.color||"gray","WS.workflow["+i+"].color=this.value;refresh();saveWS()",!ed)+'<div style="display:flex;align-items:center;gap:6px"><span class="hint mono">'+inUse+' task'+(inUse===1?"":"s")+'</span>'+(ed?'<button class="del" title="'+(inUse?"Move tasks out of this stage first":"Delete stage")+'" onclick="deleteStage('+i+')" '+(inUse?"disabled":"")+'>'+I.trash+'</button>':'')+'</div></div>'; }).join(""),ed?'<button class="btn" onclick="addStageModal()">'+I.plus+'Add stage</button><button class="btn ghost" onclick="resetWorkflow()">Reset to default</button>':'',I.kanban); }
function moveStage(i,d){ var w=WS.workflow; var j=i+d; if (j<0||j>=w.length) return; var t=w[i]; w[i]=w[j]; w[j]=t; refresh(); saveWS(); }
function deleteStage(i){ WS.workflow.splice(i,1); toast("Stage removed","bad"); refresh(); saveWS(); }
function addStageModal(){ openModal("Add stage",fieldHtml("st_name","Name",'<input id="st_name" placeholder="e.g. Legal check">')+fieldHtml("st_kind","Kind",selectHtml("st_kind",[["queue","Queue"],["work","Work"],["review","Review"],["revision","Revision"],["closed","Closed"]],"work","data-ui-translate"))+fieldHtml("st_pos","Insert after",selectHtml("st_pos",WS.workflow.map(function(s,i){ return [String(i),s.name]; }),String(Math.max(0,WS.workflow.length-4)))),'<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="if(require([\'st_name\'])){var id=val(\'st_name\').toLowerCase().replace(/[^a-z0-9]+/g,\'_\')+\'_\'+Date.now().toString(36);WS.workflow.splice(+val(\'st_pos\')+1,0,{id:id,kind:val(\'st_kind\'),name:val(\'st_name\'),color:\'blue\'});closeModal();toast(\'Stage added\');refresh();saveWS()}">Add</button>'); }
function resetWorkflow(){ WS.workflow=clone(CREATIVE_OS_DEMO.workflow); TASKS.forEach(function(t){ if (!byId(WS.workflow,t.status)) t.status="todo"; }); toast("Workflow reset"); refresh(); saveWS(); }
/* brief templates */
function setBriefs(){ var ed=canI.manageWorkspace(); return sp("Brief templates",'<p class="hint" style="margin-bottom:8px">Choose the fields for each brief template. Click the star to make a field required.</p>'+WS.briefTemplates.map(function(t,i){ t.required=t.required||[]; return '<div style="padding:10px 0;border-bottom:1px solid var(--color-border)"'+(ed?' class="reorder-row" data-reorder="brieftemplates" data-index="'+i+'" ondragover="reorderOver(event,\'brieftemplates\','+i+')" ondragleave="reorderLeave(event)" ondrop="reorderDrop(event,\'brieftemplates\','+i+')"':'')+'><div class="brief-template-head">'+(ed?reorderHandle("brieftemplates",i,t.name):"")+'<input '+(ed?"":"disabled")+' value="'+attr(t.name)+'" onchange="WS.briefTemplates['+i+'].name=this.value;saveWS()" style="border:1px solid transparent;border-radius:8px;padding:2px 6px;font-weight:700;background:transparent"><input '+(ed?"":"disabled")+' value="'+attr(t.description||"")+'" placeholder="description" onchange="WS.briefTemplates['+i+'].description=this.value;saveWS()" style="border:1px solid transparent;border-radius:8px;padding:2px 6px;background:transparent;color:var(--color-text-secondary);flex:1"><span class="hint mono">'+t.fields.length+' fields · '+t.required.length+' required</span>'+(ed?'<button class="iconbtn flat" style="width:26px;height:26px" onclick="WS.briefTemplates.splice('+i+',1);renderScreen(false);saveWS()">'+I.trash+'</button>':'')+'</div><div class="chips">'+WS.briefFields.map(function(f){ var on=t.fields.indexOf(f[0])>=0; var req=t.required.indexOf(f[0])>=0; return '<span class="chipx'+(on?" on":"")+'" style="'+(on?"":"opacity:.6")+'"><span style="cursor:pointer" onclick="'+(ed?'toggleBriefField('+i+',\''+f[0]+'\')':'')+'">'+esc(f[1])+'</span>'+(on&&ed?'<button title="Required" onclick="toggleBriefReq('+i+',\''+f[0]+'\')" style="color:'+(req?"var(--color-secondary)":"inherit")+'">★</button>':'')+'</span>'; }).join("")+'</div></div>'; }).join(""),ed?'<button class="btn" onclick="openModal(\'New template\',fieldHtml(\'bt_name\',\'Name\',\'<input id=bt_name placeholder=&quot;e.g. Packaging&quot;>\'),\'<button class=btn onclick=closeModal()>Cancel</button><button class=&quot;btn primary&quot; onclick=&quot;if(require([\\\'bt_name\\\'])){WS.briefTemplates.push({id:\\\'t\\\'+Date.now(),name:val(\\\'bt_name\\\'),description:\\\'\\\',fields:WS.briefFields.map(function(f){return f[0]}),required:[]});closeModal();renderScreen(false);saveWS()}&quot;>Create</button>\')">'+I.plus+'New template</button><button class="btn ghost" onclick="openModal(\'New brief field\',fieldHtml(\'bf_name\',\'Field label\',\'<input id=bf_name placeholder=&quot;e.g. Legal constraints&quot;>\'),\'<button class=btn onclick=closeModal()>Cancel</button><button class=&quot;btn primary&quot; onclick=&quot;if(require([\\\'bf_name\\\'])){WS.briefFields.push([\\\'f\\\'+Date.now(),val(\\\'bf_name\\\')]);closeModal();renderScreen(false);saveWS()}&quot;>Add</button>\')">Add brief field</button>':'',I.knowledge); }
function toggleBriefField(i,f){ var t=WS.briefTemplates[i]; var k=t.fields.indexOf(f); if (k>=0){ t.fields.splice(k,1); t.required=(t.required||[]).filter(function(x){ return x!==f; }); } else t.fields.push(f); renderScreen(false); saveWS(); }
function toggleBriefReq(i,f){ var t=WS.briefTemplates[i]; t.required=t.required||[]; var k=t.required.indexOf(f); if (k>=0) t.required.splice(k,1); else t.required.push(f); renderScreen(false); saveWS(); }
/* custom fields */
function setFields(){ var ed=canI.manageWorkspace(); return setBuiltinFields()+sp("Custom task fields",'<p class="hint" style="margin-bottom:8px">Custom fields use the same Primary / More details / Hidden layout as built-in fields.</p>'+(WS.customFields.length?WS.customFields.map(function(f,i){ var mode=["primary","secondary","hidden"].indexOf(f.displayMode)>=0?f.displayMode:"secondary"; return '<div class="stage-edit custom-field'+(ed?" reorder-row":"")+'" style="grid-template-columns:auto minmax(0,1fr) 120px 150px auto"'+(ed?' data-reorder="customfields" data-index="'+i+'" ondragover="reorderOver(event,\'customfields\','+i+')" ondragleave="reorderLeave(event)" ondrop="reorderDrop(event,\'customfields\','+i+')"':'')+'><span style="display:flex;align-items:center;gap:4px">'+(ed?reorderHandle("customfields",i,f.name):"")+'<span class="ord-num">'+(i+1)+'</span></span><input '+(ed?"":"disabled")+' value="'+attr(f.name)+'" onchange="WS.customFields['+i+'].name=this.value;saveWS()"><span class="badge">'+f.type+'</span><select '+(ed?"":"disabled")+' aria-label="Display mode" onchange="WS.customFields['+i+'].displayMode=this.value;saveWS();refresh()"><option value="primary"'+(mode==="primary"?" selected":"")+'>Primary</option><option value="secondary"'+(mode==="secondary"?" selected":"")+'>More details</option><option value="hidden"'+(mode==="hidden"?" selected":"")+'>Hidden</option></select>'+(ed?'<span style="display:flex;gap:2px"><button class="del" title="Edit options" onclick="editFieldModal('+i+')">'+I.edit+'</button><button class="del" onclick="WS.customFields.splice('+i+',1);renderScreen(false);saveWS()">'+I.trash+'</button></span>':'<span></span>')+'</div>'; }).join(""):emptyBox("No custom fields","Add a budget, channel or legal flag.")),ed?'<button class="btn" onclick="addFieldModal()">'+I.plus+'Add field</button>':'',I.grid); }
/* built-in fields are configurable too — rename, hide, reorder */
function setBuiltinFields(){
  var ed=canI.manageWorkspace(), fs=taskFields(), custom=!!(WS.taskFields&&WS.taskFields.length);
  var rows=fs.map(function(f,i){
    return '<div class="stage-edit builtin-field'+(ed?" reorder-row":"")+'" style="grid-template-columns:52px minmax(0,1fr) 150px" data-reorder="taskfields" data-index="'+i+'" ondragover="reorderOver(event,\'taskfields\','+i+')" ondragleave="reorderLeave(event)" ondrop="reorderDrop(event,\'taskfields\','+i+')">'
      + '<span style="display:flex;align-items:center;gap:4px">'+(ed?reorderHandle("taskfields",i,f.name):"")+'<span class="ord-num">'+(i+1)+'</span></span>'
      + '<input '+(ed?"":"disabled")+' value="'+attr(f.name)+'" onchange="renameField(\''+f.id+'\',this.value)">'
      + '<select '+(ed?"":"disabled")+' aria-label="Display mode" onchange="setFieldMode(\''+f.id+'\',this.value)"><option value="primary"'+(f.displayMode==="primary"?" selected":"")+'>Primary</option><option value="secondary"'+(f.displayMode==="secondary"?" selected":"")+'>More details</option><option value="hidden"'+(f.displayMode==="hidden"?" selected":"")+'>Hidden</option></select>'
      + '</div>'; }).join("");
  return sp("Task fields",
    '<p class="hint" style="margin-bottom:8px">Rename, reorder, or place task fields in Primary, More details, or Hidden. Hidden fields keep their data.</p>'+rows,
    ed?(custom?'<button class="btn ghost" onclick="WS.taskFields=null;saveWS(\'Task fields reset\');refresh()">'+I.sync+'Reset to default</button>':'')+'<span class="spacer"></span><span class="hint">Custom fields are added below.</span>':'',
    I.grid);
}
/* §432 every reorderable admin list goes through the shared engine. */
registerReorderList("workflow",function(from,to){
  if(!canI.manageWorkspace()) return false;
  if(!moveInArray(WS.workflow,from,to)) return false;
  refresh(); saveWS("Workflow order updated"); return true;
});
registerReorderList("taskfields",function(from,to){
  if(!canI.manageWorkspace()) return false;
  var c=fieldCfg(); if(!moveInArray(c,from,to)) return false;
  WS.taskFields=c; saveWS("Task field order updated"); refresh(); return true;
});
/* §P2-1 the shared reorder engine, extended only where manual order is
   genuinely meaningful. Resources that should sort alphabetically are left
   alone on purpose. */
registerReorderList("customfields",function(from,to){
  if(!canI.manageWorkspace()) return false;
  if(!moveInArray(WS.customFields,from,to)) return false;
  renderScreen(false); saveWS("Field order saved"); return true;
});
registerReorderList("brieftemplates",function(from,to){
  if(!canI.manageWorkspace()) return false;
  if(!moveInArray(WS.briefTemplates,from,to)) return false;
  renderScreen(false); saveWS("Template order saved"); return true;
});

function fieldCfg(){ var f=taskFields(); return f.map(function(x){ return {id:x.id,name:x.name,displayMode:x.displayMode,show:x.displayMode!=="hidden"}; }); }
function renameField(id,name){ var c=fieldCfg(); c.forEach(function(f){ if (f.id===id) f.name=name.trim()||f.id; }); WS.taskFields=c; saveWS("Field renamed"); refresh(); }
function setFieldMode(id,mode){ if(["primary","secondary","hidden"].indexOf(mode)<0)return; var c=fieldCfg(); c.forEach(function(f){ if(f.id===id){f.displayMode=mode;f.show=mode!=="hidden";} }); WS.taskFields=c; saveWS("Task field layout updated"); refresh(); }
function toggleField(id){ var c=fieldCfg(); c.forEach(function(f){ if (f.id===id){ f.displayMode=f.displayMode==="hidden"?"primary":"hidden"; f.show=f.displayMode!=="hidden"; } }); WS.taskFields=c; saveWS(); refresh(); }
function moveField(id,dir){
  var c=fieldCfg(), i=-1; c.forEach(function(f,n){ if (f.id===id) i=n; });
  var j=i+dir; if (i<0||j<0||j>=c.length) return;
  var t=c[i]; c[i]=c[j]; c[j]=t; WS.taskFields=c; saveWS(); refresh();
}

/* ---------- labels ---------- */
function setLabels(){
  var ed=canI.manageWorkspace(), ls=allLabels(), custom=!!(WS.labels&&WS.labels.length);
  var counts={}; TASKS.forEach(function(t){ (t.labels||[]).forEach(function(id){ counts[id]=(counts[id]||0)+1; }); });
  var rows=ls.map(function(l){
    return '<div class="stage-edit" style="grid-template-columns:minmax(0,1fr) 150px 90px auto">'
      + '<input '+(ed?"":"disabled")+' value="'+attr(l.name)+'" onchange="renameLabel(\''+l.id+'\',this.value)">'
      + '<span style="display:flex;gap:4px;flex-wrap:wrap">'+LABEL_COLORS.map(function(c){ return '<button title="'+c[0]+'" onclick="'+(ed?'setLabelColor(\''+l.id+'\',\''+c[1]+'\')':'')+'" style="width:16px;height:16px;border-radius:50%;border:'+(l.color.toLowerCase()===c[1].toLowerCase()?"2px solid var(--color-text-primary)":"1px solid var(--color-border)")+';background:'+c[1]+';cursor:'+(ed?"pointer":"default")+'"></button>'; }).join("")+'</span>'
      + '<span class="hint">'+(counts[l.id]||0)+' task'+((counts[l.id]||0)===1?"":"s")+'</span>'
      + (ed?'<button class="del" onclick="delLabel(\''+l.id+'\')">'+I.trash+'</button>':'<span></span>')
      + '</div>'; }).join("");
  var preview='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">'+ls.map(function(l){ return labelChip(l,false).replace('class="lbl"','class="lbl big"'); }).join("")+'</div>';
  return sp("Labels",
    '<p class="hint" style="margin-bottom:8px">Use labels to identify the type of work. Click a label on a task to filter the board.</p>'
    + (rows||'<div class="hint">No labels yet.</div>') + preview
    + (custom?'':'<div class="hint" style="margin-top:10px">You are on the built-in set; the first edit creates your own copy.</div>'),
    ed?'<button class="btn" onclick="addLabelModal()">'+I.plus+'New label</button>'+(custom?'<span class="spacer"></span><button class="btn ghost" onclick="WS.labels=null;saveWS(\'Labels reset\');refresh()">'+I.sync+'Reset to default</button>':''):'',
    I.tiles);
}
function labelCfg(){ return clone(allLabels()); }
function renameLabel(id,name){ var c=labelCfg(); c.forEach(function(l){ if (l.id===id) l.name=name.trim()||l.name; }); WS.labels=c; saveWS("Label renamed"); refresh(); }
function setLabelColor(id,hex){ var c=labelCfg(); c.forEach(function(l){ if (l.id===id) l.color=hex; }); WS.labels=c; saveWS(); refresh(); }
function delLabel(id){
  var used=TASKS.filter(function(t){ return (t.labels||[]).indexOf(id)>=0; }).length;
  confirmModal("Delete label?", used?("It is on "+used+" task"+(used===1?"":"s")+". They keep everything else \u2014 only the label goes."):"It is not used on any task.",function(){
    WS.labels=labelCfg().filter(function(l){ return l.id!==id; });
    TASKS.forEach(function(t){ if (t.labels) t.labels=t.labels.filter(function(x){ return x!==id; }); });
    saveWS("Label deleted"); refresh();
  },true);
}
function addLabelModal(){
  openModal("New label",
    fieldHtml("nl_name","Name",'<input id="nl_name" placeholder="e.g. Graphic Designer">')
    + '<div class="field"><label>Colour</label><div class="chips" id="nl_colors">'+LABEL_COLORS.map(function(c,i){ return '<label class="chipx" style="cursor:pointer"><input type="radio" name="nlc" value="'+c[1]+'"'+(i===0?" checked":"")+'> <i style="width:11px;height:11px;border-radius:50%;background:'+c[1]+';display:inline-block"></i> '+c[0]+'</label>'; }).join("")+'</div></div>',
    '<button class="btn primary" onclick="addLabel()">Add label</button>');
}
function addLabel(){
  if (!require(["nl_name"])) return;
  var col=(document.querySelector('input[name="nlc"]:checked')||{}).value||LABEL_COLORS[0][1];
  var c=labelCfg(); c.push({id:"lb_"+Math.random().toString(36).slice(2,7),name:val("nl_name"),color:col});
  WS.labels=c; closeModal(); saveWS("Label added"); refresh();
}

function editFieldModal(i){ var f=WS.customFields[i]; openModal("Edit field — "+esc(f.name),fieldHtml("cf_name","Label",'<input id="cf_name" value="'+attr(f.name)+'">')+fieldHtml("cf_type","Type",selectHtml("cf_type",[["text","Text"],["number","Number"],["select","Select"],["checkbox","Checkbox"]],f.type))+fieldHtml("cf_opts","Options (select only, one per line or comma separated)",'<textarea id="cf_opts" style="min-height:110px">'+esc(f.options.join("\\n"))+'</textarea>')+'<p class="hint">Tasks keep their current value even if you remove an option; e.g. the <b>Channel</b> field drives where a request will be published.</p>','<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="if(require([\'cf_name\'])){var f=WS.customFields['+i+'];f.name=val(\'cf_name\');f.type=val(\'cf_type\');f.options=document.getElementById(\'cf_opts\').value.split(/[\\n,]/).map(function(s){return s.trim()}).filter(Boolean);closeModal();toast(\'Field saved\');renderScreen(false);saveWS()}">Save</button>'); }
function addFieldModal(){ openModal("Add custom field",fieldHtml("cf_name","Label",'<input id="cf_name" placeholder="e.g. Cost centre">')+fieldHtml("cf_type","Type",selectHtml("cf_type",[["text","Text"],["number","Number"],["select","Select"],["checkbox","Checkbox"]],"text"))+fieldHtml("cf_opts","Options (select only, comma separated)",'<input id="cf_opts" placeholder="A, B, C">'),'<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="if(require([\'cf_name\'])){WS.customFields.push({id:\'c\'+Date.now(),name:val(\'cf_name\'),type:val(\'cf_type\'),options:val(\'cf_opts\').split(\',\').map(function(s){return s.trim()}).filter(Boolean),displayMode:\'secondary\'});closeModal();toast(\'Field added\');renderScreen(false);saveWS()}">Add</button>'); }
/* tags */
/* §7.1 Settings → Tags. No colour selector, no swatch, no coloured dot —
   Tags are organisational metadata (§1). Order is manual (§7.5). */
function setTags(){
  var ed=canI.manageWorkspace(), reg=tagRegistry();
  var q=tagSlug(S.tagQuery||"");
  var shown=reg.map(function(t,i){ return {t:t,i:i}; }).filter(function(r){ return !q||tagSlug(r.t.name).indexOf(q)>=0; });
  var rows=shown.length?shown.map(function(r){
    var t=r.t, i=r.i, used=tagUsageCount(t.name);
    return '<div class="stage-edit tag-row'+(ed?" reorder-row":"")+'" style="grid-template-columns:auto minmax(0,1fr) auto"'
      + (ed?' data-reorder="tags" data-index="'+i+'" ondragover="reorderOver(event,\'tags\','+i+')" ondragleave="reorderLeave(event)" ondrop="reorderDrop(event,\'tags\','+i+')"':'')
      + '><span class="ord" style="display:flex;align-items:center;gap:4px">'+(ed?reorderHandle("tags",i,t.name):"")+'<span class="ord-num">'+(i+1)+'</span></span>'
      + '<input '+(ed?"":"disabled")+' value="'+attr(t.name)+'" onchange="renameTag('+i+',this.value)"'+(t.archived?' style="opacity:.55"':'')+'>'
      + '<span style="display:flex;align-items:center;gap:8px">'
      + (t.archived?'<span class="badge done">'+tr("Archived")+'</span>':'')
      + '<span class="hint mono" title="'+attr(tr("Times used"))+'">'+used+' '+tr("uses")+'</span>'
      + (ed?'<button class="iconbtn flat" style="width:26px;height:26px" aria-haspopup="menu" title="'+attr(tr("More"))+'" onclick="tagRowMenu(this,'+i+')">'+I.settings+'</button>':'')
      + '</span></div>'; }).join("")
    : emptyBox(q?"No tag matches":"No tags yet","Tags help you slice tasks, projects and assets across teams.");
  var search=reg.length>6?'<input id="tagSearch" class="tag-settings-search" placeholder="'+attr(tr("Search tags…"))+'" value="'+attr(S.tagQuery||"")+'" oninput="S.tagQuery=this.value;renderScreen(false);var e=document.getElementById(\'tagSearch\');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}">':"";
  return sp("Tags",
    '<p class="hint" style="margin-bottom:10px">'+tr("Tags are shared across tasks, projects and assets. Renaming one updates it everywhere. Drag to set the order the picker uses.")+'</p>'+search+rows,
    ed?'<div style="display:flex;gap:8px;align-items:center"><input id="tag_new" placeholder="'+attr(tr("New tag"))+'" style="border:1px solid var(--color-border);border-radius:var(--pill);padding:6px 12px;background:var(--color-surface)" onkeydown="if(event.key===\'Enter\')addTag()"><button class="btn" onclick="addTag()">'+I.plus+tr("New tag")+'</button></div>':'',
    I.tag||I.grid);
}
/* §P0-4 accessibility fallback — the same moves the drag handle performs. */
function tagRowMenu(btn,i){
  var n=tagRegistry().length, t=tagRegistry()[i]; if(!t) return;
  ctxMenu(btn,
    '<div class="mh">'+tr("Move")+'</div>'
    + '<button '+(i===0?"disabled":"")+' onclick="closePops();moveTag('+i+',\'top\')">'+tr("Move to top")+'</button>'
    + '<button '+(i===0?"disabled":"")+' onclick="closePops();moveTag('+i+',\'up\')">'+tr("Move up")+'</button>'
    + '<button '+(i>=n-1?"disabled":"")+' onclick="closePops();moveTag('+i+',\'down\')">'+tr("Move down")+'</button>'
    + '<button '+(i>=n-1?"disabled":"")+' onclick="closePops();moveTag('+i+',\'bottom\')">'+tr("Move to bottom")+'</button>'
    + '<div class="mh">'+tr("Manage")+'</div>'
    + '<button onclick="closePops();archiveTag('+i+','+(!t.archived)+')">'+tr(t.archived?"Restore tag":"Archive tag")+'</button>'
    + '<button class="danger" onclick="closePops();deleteTag('+i+')">'+tr("Delete tag")+'</button>');
}
/* §P0-2 Settings creation calls the one canonical function. */
function addTag(){
  var made=createWorkspaceTag(val("tag_new")||"");
  if(!made.ok) return toast(tr(made.reason),"bad");
  S.tagQuery=""; renderScreen(false);
}
/* §7.7 archive is preferred over deletion: existing records keep the tag. */
function archiveTag(i,on){
  var reg=tagRegistry(); if(!reg[i]) return;
  reg[i].archived=!!on;
  WS.tags=reg.map(function(t,n){ return tagRecord(t,(n+1)*10); });
  renderScreen(false); saveWS(on?"Tag archived":"Tag restored");
}
/* §346 renaming keeps every tagged item pointing at the same tag */
function renameTag(i,name){
  name=(name||"").trim(); var reg=tagRegistry(), cur=reg[i]; if(!cur) return;
  if(!name) return renderScreen(false);
  var clash=tagByName(name);
  if(clash&&tagSlug(clash.name)!==tagSlug(cur.name)){ toast(tr("That tag already exists"),"bad"); return renderScreen(false); }
  var before=cur.name;
  WS.tags=reg.map(function(t,n){ return tagRecord(n===i?{id:t.id,name:name,archived:t.archived}:t,(n+1)*10); });
  retagEverything(before,name);
  renderScreen(false); saveWS("Tag renamed");
}
/* §359 deleting a global tag also clears it from everything that used it */
function deleteTag(i){
  var reg=tagRegistry(), t=reg[i]; if(!t) return;
  var used=tagUsageCount(t.name);
  var go=function(){ WS.tags=reg.filter(function(x,n){ return n!==i; }).map(function(x,n){ return tagRecord(x,(n+1)*10); });
    retagEverything(t.name,null); closeModal(); renderScreen(false); saveWS("Tag deleted"); };
  if(!used) return go();
  window._tagDelete=go;
  openModal("Delete tag?",
    '<p>'+tr("This tag is used on")+' <b>'+used+'</b> '+tr("items")+'. '+tr("Deleting it removes the tag from all of them. The items themselves are not deleted.")+'</p>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="window._tagDelete()">'+tr("Delete tag")+'</button>');
}
function retagEverything(from,to){
  var k=tagSlug(from);
  var walk=function(list){ (list||[]).forEach(function(x){
    if(!x||!x.tags) return;
    x.tags=x.tags.map(function(v){ return tagSlug(v)===k?to:v; }).filter(function(v){ return !!v; });
    var seen={}; x.tags=x.tags.filter(function(v){ var s=tagSlug(v); if(seen[s]) return false; seen[s]=1; return true; });
  }); };
  walk(typeof TASKS!=="undefined"?TASKS:[]); walk(typeof PROJECTS!=="undefined"?PROJECTS:[]); walk(typeof ASSETS!=="undefined"?ASSETS:[]);
  /* filters that pointed at the old name must not strand the user */
  if(typeof S!=="undefined"&&S.filters&&tagSlug(S.filters.tag)===k) S.filters.tag=to||"";
}
/* §P0-2 the second, string-based addTag() that used to live here was removed.
   createWorkspaceTag() in the tag picker is now the only creation path. */
/* members */
function setMembers(){ var ed=canI.manageMembers(); return sp("Members & roles",'<p class="hint" style="margin-bottom:8px">'+(API.on?'New people register with the join code (Workspace tab) and start as <b>'+esc((byId(ROLES,WS.defaultRole||"member")||{}).name||"Member")+'</b>; change their role, teams and capacity here.':'In demo mode there are no passwords.')+'</p><div class="tbl-wrap"><table class="tbl members-tbl"><thead><tr><th>Member</th><th>Role title</th><th>Permission role</th><th>Teams</th><th>Capacity</th><th>Login</th><th></th></tr></thead><tbody>'+Object.keys(PEOPLE).map(function(id){ var p=PEOPLE[id]; var ro=ed?"":" disabled"; return memberRowLabels('<tr style="cursor:default'+(p.active===false?";opacity:.5":"")+'"><td class="t"><span class="cell-flex">'+av(id)+'<span>'+esc(p.name)+(p.active===false?' <span class="badge bad">deactivated</span>':'')+'<div class="tiny muted" style="font-weight:400">'+(ed?'<input value="'+attr(p.email||"")+'" placeholder="email for sign-in" onchange="setEmail(\''+id+'\',this.value)" style="border:1px solid transparent;border-radius:6px;padding:1px 4px;background:transparent;width:100%;font-size:11.5px;color:var(--color-text-secondary)" onfocus="this.style.borderColor=\'var(--color-border)\'">':esc(p.email||""))+'</div></span></span></td><td><input'+ro+' value="'+attr(p.role)+'" onchange="PEOPLE[\''+id+'\'].role=this.value;persistPerson(\''+id+'\')" style="border:1px solid var(--color-border);border-radius:8px;padding:4px 8px;width:100%;background:var(--color-surface)"></td><td><select'+ro+' onchange="setPerm(\''+id+'\',this.value)" style="border:1px solid var(--color-border);border-radius:8px;padding:4px 8px;background:var(--color-surface)">'+ROLES.map(function(r){ return '<option value="'+r.id+'"'+(p.perm===r.id?" selected":"")+'>'+esc(r.name)+'</option>'; }).join("")+'</select></td><td><span style="display:flex;gap:4px;flex-wrap:wrap">'+(p.teams||[]).map(function(x){ return teamBadge(x[0]); }).join("")+(ed?'<button class="btn xs ghost" onclick="memberTeamsModal(\''+id+'\')">'+I.edit+'</button>':'')+'</span></td><td><input'+ro+' type="number" min="0" value="'+p.cap+'" onchange="PEOPLE[\''+id+'\'].cap=+this.value;persistPerson(\''+id+'\')" style="border:1px solid var(--color-border);border-radius:8px;padding:4px 8px;width:64px;background:var(--color-surface)"></td><td class="hint">'+(API.on?(p.hasPassword?(p.lastLogin?ago(minAgo(p.lastLogin)):"never"):"no password"):"demo")+'</td><td style="white-space:nowrap">'+(id!==ME&&ed?(API.on?'<button class="iconbtn flat" style="width:26px;height:26px" title="Reset password" onclick="resetPasswordModal(\''+id+'\')">'+I.lock+'</button>':'')+(API.on?'<button class="btn xs ghost member-active-toggle" title="'+(p.active===false?tr("Allow this member to sign in again"):tr("Block sign-in but keep their work and history"))+'" onclick="toggleMemberActive(\''+id+'\')">'+tr(p.active===false?"Reactivate":"Deactivate")+'</button>':'')+'<button class="iconbtn flat" style="width:26px;height:26px" title="Remove" onclick="removeMember(\''+id+'\')">'+I.trash+'</button>':'<span class="hint">you</span>')+'</td></tr>'); }).join("")+'</tbody></table></div>',ed?'<button class="btn" onclick="addMemberModal()">'+I.plus+'Add member</button>':'',I.team); }
/* v34 each member cell carries its column name, so the phone card layout can label it */
function memberRowLabels(html){ var heads=["Member","Role title","Permission role","Teams","Capacity","Login",""].map(function(x){ return x?tr(x):""; }), i=0; return html.replace(/<td(?=[ >])/g,function(){ return '<td data-l="'+attr(heads[i++]||"")+'"'; }); }
function setEmail(id,v){ v=v.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast("Enter a valid email","bad"); PEOPLE[id].email=v; persistPerson(id).then(function(saved){ if(saved===false)return false; toast("Email updated — "+first(id)+" signs in with "+v); }); }
function setPerm(id,v){ var p=PEOPLE[id]; p.perm=v; p.stakeholder=v==="viewer"; if (p.stakeholder) p.cap=0; else if (!p.cap) p.cap=40; refresh(); persistPerson(id).then(function(saved){ if(saved===false)return false; toast(first(id)+" is now "+(byId(ROLES,v)||{}).name); }); }
function memberTeamsModal(id){ var p=PEOPLE[id]; openModal("Teams for "+esc(p.name),'<div class="field"><label>Teams (★ = primary)</label>'+activeTeams().map(function(t){ var m=(p.teams||[]).filter(function(x){ return x[0]===t.id; })[0]; return '<div class="pref"><div class="pl"><b>'+teamBadge(t.id,"lg")+'</b></div><label class="hint" style="display:flex;gap:6px;align-items:center"><input type="radio" name="mt_primary" value="'+t.id+'" '+(m&&m[1]?"checked":"")+'> primary</label><button class="switch'+(m?" on":"")+'" data-mt="'+t.id+'" onclick="this.classList.toggle(\'on\')"></button></div>'; }).join("")+'</div>','<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveMemberTeams(\''+id+'\')">Save</button>'); }
function saveMemberTeams(id){ var p=PEOPLE[id]; var pr=(document.querySelector("[name=mt_primary]:checked")||{}).value; var teams=[]; document.querySelectorAll("[data-mt].on").forEach(function(b){ teams.push([b.getAttribute("data-mt"),b.getAttribute("data-mt")===pr]); }); if (teams.length&&!teams.some(function(x){ return x[1]; })) teams[0][1]=true; p.teams=teams; closeModal(); refresh(); persistPerson(id).then(function(saved){ if(saved===false)return false; toast("Teams updated"); }); }
function addMemberModal(){ openModal("Add member",fieldHtml("nm_name","Full name",'<input id="nm_name" placeholder="e.g. Dian Sastro">')+fieldHtml("nm_email","Email (used to sign in)",'<input id="nm_email" type="email" placeholder="name@company.com">')+'<div class="field-row">'+fieldHtml("nm_role","Role title",'<input id="nm_role" placeholder="Designer">')+fieldHtml("nm_perm","Permission role",selectHtml("nm_perm",ROLES.map(function(r){ return [r.id,r.name]; }),"member"))+'</div><div class="field-row">'+fieldHtml("nm_cap","Capacity (h/wk)",'<input id="nm_cap" type="number" value="40">')+fieldHtml("nm_team","Primary team",selectHtml("nm_team",teamOpts(true),""))+'</div>'+(API.on?fieldHtml("nm_pw","Temporary password (min 12)",'<input id="nm_pw" type="text" value="Welcome!'+Math.floor(10000+Math.random()*90000)+'Aa">'):''),'<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="addMember()">Add member</button>'); }
function addMember(){ if (!require(["nm_name"])) return; var name=val("nm_name"); var id=name.toLowerCase().replace(/[^a-z]/g,"").slice(0,10)||"m"+Date.now(); while (PEOPLE[id]) id+="2"; var ini=name.split(" ").map(function(s){ return s.charAt(0).toUpperCase(); }).join("").slice(0,2); var perm=val("nm_perm"); var team=val("nm_team"); PEOPLE[id]={name:name,ini:ini,c:Object.keys(PEOPLE).length%7,role:val("nm_role")||"Creative",perm:perm,stakeholder:perm==="viewer",cap:perm==="viewer"?0:+val("nm_cap")||40,email:val("nm_email"),teams:team?[[team,true]]:[],active:true}; var pw=val("nm_pw"); closeModal(); toast(name+" added"); refresh(); persistPerson(id,true).then(function(saved){ if(saved===false)return false; if (API.on&&pw) return apiFetch("POST","/api/members/"+id+"/password",{password:pw}).then(function(saved){ if(saved===false)return false; toast("Password set — share it with "+first(id)); }); }); }
function resetPasswordModal(id){ openModal("Reset password for "+esc(person(id).name),fieldHtml("rp_pw","New temporary password (min 12)",'<input id="rp_pw" type="text" value="Welcome!'+Math.floor(10000+Math.random()*90000)+'Aa">')+'<p class="hint">Their existing sessions are signed out.</p>','<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="apiFetch(\'POST\',\'/api/members/'+id+'/password\',{password:val(\'rp_pw\')}).then(function(saved){ if(saved===false)return false;closeModal();toast(\'Password reset\')}).catch(function(e){toast(e.message,\'bad\')})">Reset</button>'); }
function removeMember(id){ var n=TASKS.filter(function(t){ return t.assignee===id||t.reviewer===id; }).length; confirmModal("Remove "+esc(person(id).name)+"?",(n?"They are on "+n+" tasks — those will be reassigned to you. ":"")+"Their account can no longer sign in.",function(){ TASKS.forEach(function(t){ if (t.assignee===id) t.assignee=ME; if (t.reviewer===id) t.reviewer=ME; }); PROJECTS.forEach(function(p){ p.team=p.team.filter(function(m){ return m!==id; }); if (p.owner===id) p.owner=ME; }); delete PEOPLE[id]; toast("Member removed","bad"); refresh(); if (API.on) apiFetch("DELETE","/api/members/"+id).then(function(d){ PEOPLE=d; WS.people=PEOPLE; reloadAll(); }).catch(function(e){ fail(e); reloadAll(); }); },true); }
/* roles */
function setRoles(){ var ed=canI.manageRoles(); return sp("Roles & permissions",'<p class="hint" style="margin-bottom:10px">Roles control what each member can do. Admin has full access. Built-in roles can be edited but cannot be deleted.</p>'+ROLES.map(function(r){ var n=Object.keys(PEOPLE).filter(function(id){ return PEOPLE[id].perm===r.id; }).length; return '<div class="pref"><span class="sq '+(r.id==="admin"?"ink":"")+'">'+I.lock+'</span><div class="pl"><b>'+esc(r.name)+(r.system?' <span class="badge">system</span>':'')+'</b><span><span data-no-translate>'+esc(roleDescription(r))+'</span> · '+uiCount(n,"member","members")+' · '+(r.id==="admin"?tr("Full access"):uiCount((r.permissions||[]).length,"permission","permissions"))+'</span></div>'+(ed?'<button class="btn sm" onclick="roleModal(\''+r.id+'\')">'+I.edit+'Edit</button>':'')+'</div>'; }).join(""),ed?'<button class="btn" onclick="roleModal()">'+I.plus+'New role</button>':'',I.lock); }
function roleModal(id){ var r=id?byId(ROLES,id):{name:"",description:"",permissions:[]}; var all=id==="admin"; openModal(id?"Edit role":"New role",'<div class="field-row">'+fieldHtml("rl_name","Name",'<input id="rl_name" value="'+attr(r.name)+'" placeholder="e.g. Photographer">')+fieldHtml("rl_desc","Description",'<input id="rl_desc" value="'+attr(r.description||"")+'">')+'</div><div class="field"><label>Capabilities</label>'+CAPS.map(function(c){ var on=all||(r.permissions||[]).indexOf(c[0])>=0; return '<div class="pref" style="padding:7px 0"><div class="pl"><b style="font-family:var(--font-mono);font-size:12px">'+c[0]+'</b><span>'+esc(c[1])+'</span></div><button class="switch'+(on?" on":"")+'" data-cap="'+c[0]+'" '+(all?'disabled':'onclick="this.classList.toggle(\'on\')"')+'></button></div>'; }).join("")+'</div>',(id&&!r.system?'<button class="btn danger-soft" onclick="deleteRole(\''+id+'\')">Delete role</button>':'')+'<span class="spacer"></span><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveRole('+(id?"'"+id+"'":"null")+')">Save</button>',true); }
function saveRole(id){ if (!require(["rl_name"])) return; var perms=[]; document.querySelectorAll("[data-cap].on").forEach(function(b){ perms.push(b.getAttribute("data-cap")); }); var body={name:val("rl_name"),description:val("rl_desc"),permissions:perms}; closeModal();
  if (!API.on){ if (id){ Object.assign(byId(ROLES,id),body); } else { body.id="role_"+body.name.toLowerCase().replace(/[^a-z0-9]+/g,"_"); body.system=false; ROLES.push(body); } refresh(); return toast("Role saved (demo)"); }
  apiFetch(id?"PUT":"POST",id?"/api/roles/"+id:"/api/roles",body).then(function(list){ ROLES=list; refresh(); toast("Role saved"); }).catch(function(e){ fail(e); }); }
function deleteRole(id){ closeModal(); confirmModal("Delete role?","Members with this role become Member.",function(){ if (!API.on){ ROLES=ROLES.filter(function(r){ return r.id!==id; }); Object.keys(PEOPLE).forEach(function(u){ if (PEOPLE[u].perm===id) PEOPLE[u].perm="member"; }); return refresh(); } apiFetch("DELETE","/api/roles/"+id).then(function(list){ ROLES=list; reloadAll(); toast("Role deleted","bad"); }).catch(function(e){ fail(e); }); },true); }
/* teams */
function setTeamsTab(){ var ed=canI.manageTeams(); return sp("Teams",'<p class="hint" style="margin-bottom:8px">Edit team names, colors, icons, leads, and order. Team colors mark tasks on boards and calendars.</p>'+activeTeams().map(function(t,i){ var w=teamWorkload(t.id); return '<div class="pref">'+teamIcon(t,true)+'<div class="pl"><b>'+esc(t.name)+' <span class="tbadge" style="--tc:'+teamColorCss(t.color)+'"><i></i>'+tr(t.color)+'</span></b><span><span data-no-translate>'+esc(t.description||"")+'</span> · '+uiCount(teamMembers(t.id).length,"member","members")+' · '+w.open+' '+tr("open tasks")+(t.lead?' · '+tr("lead")+' <span data-no-translate>'+esc(first(t.lead))+'</span>':'')+'</span></div>'+(ed?'<div class="ord" style="display:flex;gap:2px"><button class="iconbtn flat" style="width:26px;height:26px" onclick="moveTeam('+i+',-1)" '+(i===0?"disabled":"")+'>'+I.up+'</button><button class="iconbtn flat" style="width:26px;height:26px;transform:rotate(180deg)" onclick="moveTeam('+i+',1)" '+(i===activeTeams().length-1?"disabled":"")+'>'+I.up+'</button></div><button class="btn sm" onclick="teamModal(\''+t.id+'\')">'+I.edit+'Edit</button>':'')+'</div>'; }).join("")+(TEAMS.some(function(t){ return t.archived; })?'<div class="eyebrow" style="margin:14px 0 6px">Archived teams</div>'+TEAMS.filter(function(t){ return t.archived; }).map(function(t){ return '<div class="pref">'+teamIcon(t,true)+'<div class="pl"><b>'+esc(t.name)+' <span class="badge done">archived</span></b><span>'+esc(t.description||"")+'</span></div>'+(ed?'<button class="btn sm" onclick="restoreTeam(\''+t.id+'\')">'+I.sync+'Restore</button>':'')+'</div>'; }).join(""):''),ed?'<button class="btn" onclick="teamModal()">'+I.plus+'New team</button><button class="btn ghost" onclick="go(\'teams\')">Open Teams screen</button>':'',I.team); }
function restoreTeam(id){ var t=team(id); t.archived=false; t.sort=activeTeams().length+1; refresh(); toast(t.name+" restored"); persistTeam(t,false); }
function moveTeam(i,d){ var order=activeTeams(); var j=i+d; if (j<0||j>=order.length) return; var t=order[i]; order[i]=order[j]; order[j]=t; order.forEach(function(x,k){ x.sort=k+1; }); refresh(); persistTeamOrder(); }
/* notifications & email */
function setNotifications(){ var ed=canI.manageWorkspace(); var items=[["assigned","Task assigned to me",""],["mention","I am @mentioned",""],["comment","New comment on my tasks",""],["revision","Revision requested on my work",""],["approved","My work approved",""],["upload","New version uploaded to a task I review",""],["status","Task moved to a new stage","Noisy — off by default"],["file","File attached",""],["request","New creative request (leads)",""],["request_status","My request changed status",""],["deadline","Deadline approaching (24h)",""],["missed","Deadline missed",""]];
  var mail='<div id="mailStatus" class="hint">Checking email transport…</div>'; if (API.on) setTimeout(loadMailStatus,10); else mail='<div class="hint">Email delivery needs the server (npm start). Configure SMTP or Resend with environment variables — see README.</div>';
  /* v18 §20–22 personal delivery preferences — per member, on top of the
     workspace-level event switches below. One sound exists: the ZenCrevia chime. */
  var np=notifPrefs(), perm=notifPermission(), sw=function(k,label,help){ return '<div class="pref"><div class="pl"><b>'+tr(label)+'</b>'+(help?'<span>'+tr(help)+'</span>':'')+'</div><button class="switch'+(np[k]!==false?" on":"")+'" role="switch" aria-checked="'+(np[k]!==false)+'" aria-label="'+attr(tr(label))+'" onclick="setNotifPref(\''+k+'\',!this.classList.contains(\'on\'));this.classList.toggle(\'on\')"></button></div>'; };
  var browser='<div class="pref"><div class="pl"><b>'+tr("Enable browser notifications")+'</b><span>'+tr("Status")+': <b>'+notifPermissionLabel()+'</b>'+(perm==="denied"?' · '+tr("Allow notifications for this site in the browser settings to turn them back on."):'')+'</span></div>'+(perm==="granted"?'<button class="switch'+(np.browser?" on":"")+'" role="switch" aria-checked="'+(!!np.browser)+'" onclick="setNotifPref(\'browser\',!this.classList.contains(\'on\'));this.classList.toggle(\'on\')"></button>':perm==="default"?'<button class="btn sm primary" onclick="notifPrePrompt(\'settings\',true)">'+I.bell+tr("Enable notifications")+'</button>':'<span class="badge">'+notifPermissionLabel()+'</span>')+'</div>'
    +'<div class="pref"><div class="pl"><b>'+tr("Notification sound")+'</b><span>'+tr("ZenCrevia chime — the one sound used for every notification. Plays only after you have interacted with the page, as browsers require.")+'</span></div><button class="btn sm ghost" onclick="zenSoundUnlock();zenSoundPlay(true)">'+I.bell+tr("Play")+'</button><button class="switch'+(np.sound!==false?" on":"")+'" role="switch" aria-checked="'+(np.sound!==false)+'" aria-label="'+attr(tr("Notification sound"))+'" onclick="setNotifPref(\'sound\',!this.classList.contains(\'on\'));this.classList.toggle(\'on\')"></button></div>';
  var personal=sp("Browser notifications & sound",'<p class="hint" style="margin-bottom:10px">'+tr("Personal to your account. In-app notifications in the bell always work; these decide whether the browser and the chime join in.")+'</p>'+browser,null,I.bell)
    + sp("Chat",sw("chat_dm","Direct messages","")+sw("chat_mention","Mentions","@you and @everyone")+sw("chat_reply","Replies to my messages","")+sw("chat_group","Group messages","")+sw("chat_team_general","Team #general messages","Per conversation you can still pick All / Mentions only / Mute."),null,'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg>')
    + sp("Tasks",sw("task_assigned","Assigned to me","")+sw("task_due","Due soon","")+sw("task_completed","Task completed","")+sw("blocker","Blocker update",""),null,I.tasks)
    + sp("Projects",sw("project_updates","Project updates","")+sw("approval","Approval requests",""),null,I.projects);
  return personal+sp("In-app & email notifications",'<div class="pref"><div class="pl"><b>Send emails to everyone involved</b><span>Assignee, reviewer, mentioned people and requesters get an email for the events below, in addition to the in-app notification.</span></div><button class="switch'+(WS.notifPrefs.email!==false?" on":"")+'" '+(ed?'onclick="WS.notifPrefs.email=!(WS.notifPrefs.email!==false);this.classList.toggle(\'on\');saveWS()"':'disabled')+'></button></div>'+items.map(function(it){ return '<div class="pref"><div class="pl"><b>'+it[1]+'</b><span>'+it[2]+'</span></div><button class="switch'+(WS.notifPrefs[it[0]]!==false?" on":"")+'" '+(ed?'onclick="WS.notifPrefs[\''+it[0]+'\']=!(WS.notifPrefs[\''+it[0]+'\']!==false);this.classList.toggle(\'on\');saveWS()"':'disabled')+' aria-label="'+it[1]+'"></button></div>'; }).join(""),null,I.bell)+sp("Email delivery",mail,API.on&&canI.manageWorkspace()?'<button class="btn" onclick="apiFetch(\'POST\',\'/api/mail/test\',{}).then(function(r){toast(\'Test email sent via \'+r.transport)}).catch(function(e){toast(e.message,\'bad\')});setTimeout(loadMailStatus,800)">'+I.sync+'Send me a test email</button>':'',I.sync)
    + setSmtp();
}
Object.assign(UI_ID,{"Browser notifications & sound":"Notifikasi browser & suara","Personal to your account. In-app notifications in the bell always work; these decide whether the browser and the chime join in.":"Berlaku untuk akunmu saja. Notifikasi in-app di lonceng selalu aktif; pengaturan ini menentukan apakah browser dan bunyi ikut.","Enable browser notifications":"Aktifkan notifikasi browser","Status":"Status","Allow notifications for this site in the browser settings to turn them back on.":"Izinkan notifikasi untuk situs ini di pengaturan browser untuk mengaktifkannya lagi.","Notification sound":"Suara notifikasi","ZenCrevia chime — the one sound used for every notification. Plays only after you have interacted with the page, as browsers require.":"Bunyi ZenCrevia — satu-satunya suara untuk semua notifikasi. Hanya berbunyi setelah kamu berinteraksi dengan halaman, sesuai aturan browser.","Play":"Putar","Chat":"Chat","Direct messages":"Pesan langsung","Mentions":"Mention","@you and @everyone":"@kamu dan @everyone","Replies to my messages":"Balasan ke pesanku","Group messages":"Pesan grup","Team #general messages":"Pesan #general tim","Per conversation you can still pick All / Mentions only / Mute.":"Per percakapan kamu tetap bisa memilih Semua / Hanya mention / Bisukan.","Assigned to me":"Ditugaskan ke saya","Due soon":"Segera jatuh tempo","Task completed":"Task selesai","Blocker update":"Update blocker","Project updates":"Update project","Approval requests":"Permintaan persetujuan"});
function loadMailStatus(){ apiFetch("GET","/api/mail/status").then(function(m){ var el=document.getElementById("mailStatus"); if (!el) return; el.innerHTML='<div class="pref"><div class="pl"><b>Transport: <span class="mono">'+esc(m.transport)+'</span></b><span>From '+esc(m.from)+(m.transport==="log"?' · emails are written as .eml files to <span class="mono">'+esc(m.outbox)+'</span> (set COS_MAIL_TRANSPORT=smtp or resend for real delivery)':'')+'</span></div></div><div class="pref"><div class="pl"><b>'+m.sent+' sent · '+m.failed+' failed</b><span>'+(m.lastAt?'Last: '+esc(m.lastTo)+' · '+ago(minAgo(m.lastAt)):'Nothing sent yet')+(m.lastError?' · <span style="color:var(--color-danger)">'+esc(m.lastError)+'</span>':'')+'</span></div></div>'; }).catch(function(){}); }
/* integrations */
/* Google Drive is the only storage destination exposed in Settings. */
function setIntegrations(){
  var c=typeof driveOnly==="function"?driveOnly():byId(WS.cloud,"gdrive"),ed=canI.manageWorkspace();
  var step=function(n,title,text){return '<div class="drive-step"><b>'+n+'</b><div><strong>'+esc(tr(title))+'</strong><span>'+esc(tr(text))+'</span></div></div>';};
  var access=function(who,result,tone){return '<div class="drive-access-row"><span>'+esc(tr(who))+'</span><b class="'+tone+'">'+esc(tr(result))+'</b></div>';};
  var body='<p class="hint" style="margin-bottom:14px">'+esc(tr("Files stay in Google Drive. ZenCrevia stores their links and displays previews when available."))+'</p>'
    +'<div class="drive-summary"><div class="drive-summary-mark">'+(typeof driveIcon==="function"?driveIcon():"G")+'</div><div class="pl"><b>Google Drive '+(c&&c.connected?'<span class="drive-status">'+esc(tr("Connected"))+'</span>':'<span class="badge">'+esc(tr("Not connected"))+'</span>')+'</b><span>'+(c&&c.connected?esc(c.account||"Google account")+' · '+esc(c.folder||"My Drive"):esc(tr("Connect it once, then new uploads can go directly to a private team folder.")))+'</span></div></div>'
    +'<div class="drive-setup-head"><div><b>'+esc(tr("Setup checklist"))+'</b><span>'+esc(tr("Complete these steps in order. You only need to repeat them when the domain, Google project, or team folder changes."))+'</span></div><span class="badge">8 '+esc(tr("steps"))+'</span></div>'
    +'<div class="drive-steps drive-settings-steps">'
    +step(1,"Create or select a Google Cloud project","Use one project owned by the organization, then record who is responsible for it.")
    +step(2,"Enable Google Drive API","In APIs & Services, open Library, find Google Drive API, and enable it.")
    +step(3,"Configure the OAuth consent screen","Enter the app and support details. While the app is in testing, add every account that needs to connect.")
    +step(4,"Create a Web OAuth Client ID","Add the exact dashboard origin under Authorized JavaScript origins. Include the protocol and port, with no page path.")
    +step(5,"Prepare the team folder","Create a dedicated Drive folder. Copy the Folder ID from its URL, then give uploaders Editor access and viewers Viewer access.")
    +step(6,"Connect ZenCrevia","Open Configure Google Drive, paste the Client ID and Folder ID, save, then sign in with an account that can access the folder.")
    +step(7,"Test an upload and preview","Upload a harmless test file from a task. Confirm it appears in the selected folder and opens from ZenCrevia.")
    +step(8,"Check access with a teammate","Ask one teammate to open the same file. If the task opens but the file does not, grant that Google account or group access in Drive.")
    +'</div>'
    +'<div class="drive-access"><div class="drive-quick-title">'+esc(tr("Who can open a private file?"))+'</div>'
    +access("Workspace member with Drive folder access","Can open","ok")
    +access("Workspace member without Drive folder access","Task only","warn")
    +access("External reviewer explicitly added in Drive","Can open","ok")
    +access("Anyone else","No access","muted")+'</div>'
    +'<div class="drive-preview-note"><b>'+esc(tr("Recommended sharing rule"))+'</b><span>'+esc(tr("Keep Anyone with the link off. Share the folder with a managed Google Group, then add or remove people through that group."))+'</span></div>';
  var footer=ed?'<button class="btn" onclick="cloudSettingsModal()">'+I.knowledge+esc(tr("Open detailed guide"))+'</button><span class="spacer"></span><button class="btn primary" onclick="editGDrive()">'+I.settings+esc(tr("Configure Google Drive"))+'</button>':'';
  return sp("Google Drive",body,footer,I.cloud);
}
/* backup */
/* §P1-5 Backup & Data moved to admin-ops.js: it is now a category area
   (Overview / History / Import-Export / Automatic / Retention / Storage)
   rather than a single flat panel. */
</script>
