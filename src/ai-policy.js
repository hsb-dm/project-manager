<script>
/* ============================================================
   AI RESOURCE POLICY — v17 §P0-6 / §P0-7 / §P0-8 / §8
   ONE policy resolver for every AI limit in the product (§15).
   Business rules live here; they are never re-stated as magic
   numbers at the call site. The server stays authoritative —
   standalone simply resolves the same interface locally.
   ============================================================ */

/* §P0-6 the recommended defaults an admin starts from. */
var DEFAULT_AI_POLICY = {
  hub: {
    maxLayers: 40,
    maxImageLayers: 10,
    maxHistoryPerUser: 24,
    maxCanvasWidth: 4096,
    maxCanvasHeight: 4096
  },
  gallery: {
    maxDesignsPerUser: 30,
    maxNewDesignsPerDay: 5,
    maxDuplicatesPerDay: 10,
    maxDesignMB: 15,
    archivedCountsTowardQuota: true
  }
};

/* §8 Hard safety caps. Admin-configurable does not mean physically unlimited:
   an admin can lower a limit freely but can never raise it past these. They
   exist to stop a corrupt or hostile document from exhausting memory, and are
   NOT the numbers any UI copy quotes (§P0-6). */
var SYSTEM_AI_LIMITS = {
  MAX_LAYERS: 150,
  MAX_IMAGE_LAYERS: 50,
  MAX_DESIGNS_PER_USER: 5000,
  MAX_NEW_GALLERY_PER_DAY: 100,
  MAX_DUPLICATES_PER_DAY: 200,
  MAX_DESIGN_BYTES: 50 * 1024 * 1024,
  MAX_CANVAS: 4096,
  MAX_HISTORY: 200,
  MAX_GUIDES: 100
};
/* §8 the resolver: effectiveLimit = min(workspaceLimit, systemHardLimit) */
function aiEffectiveLimit(workspaceLimit, systemHardLimit, fallback){
  var v = Math.round(Number(workspaceLimit));
  if (!isFinite(v) || v <= 0) v = fallback;
  return Math.max(1, Math.min(v, systemHardLimit));
}
/* Kept for call sites that only need the raw ceiling. */
var AI_SAFETY_CEILING = { layers: SYSTEM_AI_LIMITS.MAX_LAYERS, guides: SYSTEM_AI_LIMITS.MAX_GUIDES };

function aiPolicyClamp(v, lo, hi, dflt) {
  v = Math.round(Number(v));
  if (!isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
}

/* §P0-6 the resolver. Admin overrides live on WS.ai.policy; anything absent
   or out of range falls back to the default rather than to a stray literal. */
function effectiveAiPolicy() {
  var saved = (typeof WS !== "undefined" && WS.ai && WS.ai.policy) || {};
  var h = saved.hub || {}, g = saved.gallery || {};
  var D = DEFAULT_AI_POLICY;
  /* §8 every value is min(workspace, system hard cap) — an admin can lower a
     limit but never raise it beyond what the client can actually survive. */
  return {
    hub: {
      maxLayers:         aiEffectiveLimit(h.maxLayers,         SYSTEM_AI_LIMITS.MAX_LAYERS,        D.hub.maxLayers),
      maxImageLayers:    aiEffectiveLimit(h.maxImageLayers,    SYSTEM_AI_LIMITS.MAX_IMAGE_LAYERS,  D.hub.maxImageLayers),
      maxHistoryPerUser: aiEffectiveLimit(h.maxHistoryPerUser, SYSTEM_AI_LIMITS.MAX_HISTORY,       D.hub.maxHistoryPerUser),
      maxCanvasWidth:    aiEffectiveLimit(h.maxCanvasWidth,    SYSTEM_AI_LIMITS.MAX_CANVAS,        D.hub.maxCanvasWidth),
      maxCanvasHeight:   aiEffectiveLimit(h.maxCanvasHeight,   SYSTEM_AI_LIMITS.MAX_CANVAS,        D.hub.maxCanvasHeight)
    },
    gallery: {
      maxDesignsPerUser:   aiEffectiveLimit(g.maxDesignsPerUser,   SYSTEM_AI_LIMITS.MAX_DESIGNS_PER_USER,    D.gallery.maxDesignsPerUser),
      maxNewDesignsPerDay: aiEffectiveLimit(g.maxNewDesignsPerDay, SYSTEM_AI_LIMITS.MAX_NEW_GALLERY_PER_DAY, D.gallery.maxNewDesignsPerDay),
      maxDuplicatesPerDay: aiEffectiveLimit(g.maxDuplicatesPerDay, SYSTEM_AI_LIMITS.MAX_DUPLICATES_PER_DAY,  D.gallery.maxDuplicatesPerDay),
      maxDesignMB:         aiEffectiveLimit(g.maxDesignMB,         SYSTEM_AI_LIMITS.MAX_DESIGN_BYTES/1048576, D.gallery.maxDesignMB),
      archivedCountsTowardQuota: g.archivedCountsTowardQuota===undefined ? D.gallery.archivedCountsTowardQuota : !!g.archivedCountsTowardQuota
    }
  };
}
function aiPolicySet(path, value) {
  if (typeof WS === "undefined") return;
  WS.ai = WS.ai || {}; WS.ai.policy = WS.ai.policy || {};
  var parts = path.split("."), node = WS.ai.policy;
  for (var i = 0; i < parts.length - 1; i++) node = node[parts[i]] = node[parts[i]] || {};
  node[parts[parts.length - 1]] = Math.round(Number(value)) || 0;
}

/* ---------- AI Hub layers (§P0-6) ---------- */
function aiLayerCount()      { return ((typeof AIF !== "undefined" && AIF.extraLayers) || []).length; }
function aiImageLayerCount() { return ((typeof AIF !== "undefined" && AIF.extraLayers) || []).filter(function (x) { return x && x.type === "image"; }).length; }

/* Returns {ok, limit, used, message}. Callers show `message` — they never
   compose their own "Maximum N layers" string (§15 one source of truth). */
function aiCanAddLayers(n) {
  n = n || 1;
  var p = effectiveAiPolicy().hub, used = aiLayerCount();
  /* §53 a design saved before the limit was lowered stays fully editable —
     open, edit, reorder, delete, export and save all keep working. Only
     operations that ADD to the count are refused, and the wording says so
     rather than implying the design is broken. */
  if (used > p.maxLayers)
    return { ok: false, limit: p.maxLayers, used: used, legacy: true,
      message: tr("This design has") + " " + used + " " + tr("layers, above the current workspace limit of") + " " + p.maxLayers + ". "
             + tr("You can keep editing and deleting layers; new ones are paused until it is back under the limit.") };
  if (used + n > p.maxLayers)
    return { ok: false, limit: p.maxLayers, used: used,
      message: tr("This design is at its layer limit.") + " " + used + " / " + p.maxLayers + ". " + tr("An admin can raise it in Settings → AI & Integrations → Usage & Limits.") };
  return { ok: true, limit: p.maxLayers, used: used };
}
/* §53 true when the document predates the current limit. */
function aiIsLegacyOverLimit(){
  return aiLayerCount() > effectiveAiPolicy().hub.maxLayers;
}
function aiCanAddImageLayers(n) {
  n = n || 1;
  var base = aiCanAddLayers(n); if (!base.ok) return base;
  var p = effectiveAiPolicy().hub, used = aiImageLayerCount();
  if (used + n > p.maxImageLayers)
    return { ok: false, limit: p.maxImageLayers, used: used,
      message: tr("This design is at its image-layer limit.") + " " + used + " / " + p.maxImageLayers + ". " + tr("An admin can raise it in Settings → AI & Integrations → Usage & Limits.") };
  return { ok: true, limit: p.maxImageLayers, used: used };
}
/* Convenience for call sites that only need to bail out with a toast. */
function aiGuardLayers(n, imageOnly) {
  var r = imageOnly ? aiCanAddImageLayers(n) : aiCanAddLayers(n);
  if (!r.ok && typeof toast === "function") toast(r.message, "bad");
  return r.ok;
}

/* ---------- Generation history retention (§P0-7) ---------- */
function aiHistoryLimit() { return effectiveAiPolicy().hub.maxHistoryPerUser; }
/* Retention applies per workspace + member. Trimming History NEVER touches
   AI Gallery or Assets (§P0-7). */
function aiTrimHistory(list) {
  var limit = aiHistoryLimit();
  return (list || []).slice(0, limit);
}
function aiHistoryUsageLabel() {
  var used = (typeof AI_RUNS !== "undefined" ? AI_RUNS.length : 0), limit = aiHistoryLimit();
  return Math.min(used, limit) + " / " + limit;
}

/* ---------- AI Gallery quotas (§P0-8 → v18 §62–102 role-based) ---------- */
/* v18 §64 the creation limit is decided by the member's workspace ROLE, not
   by one flat number. "unlimited" is a real value. Admins edit this table in
   Settings → AI & Integrations → Usage & Limits → Gallery limits. Custom roles
   fall back to the Member default until an admin sets them. */
var DEFAULT_GALLERY_ROLE_QUOTA = { admin:"unlimited", creative_lead:500, team_lead:250, member:100, viewer:0 };
var GALLERY_QUOTA_PRESETS = [0,25,50,100,250,500,1000,"unlimited"];
function agRoleQuotaTable(){
  var saved=(typeof WS!=="undefined"&&WS.ai&&WS.ai.galleryRoleQuota)||{};
  var out={}; (typeof ROLES!=="undefined"?ROLES:[]).forEach(function(r){ out[r.id]=saved[r.id]!==undefined?saved[r.id]:(DEFAULT_GALLERY_ROLE_QUOTA[r.id]!==undefined?DEFAULT_GALLERY_ROLE_QUOTA[r.id]:DEFAULT_GALLERY_ROLE_QUOTA.member); });
  if(out.admin===undefined) out.admin="unlimited";
  return out;
}
/* Normalises one quota value: "unlimited" | non-negative integer (capped). */
function agNormQuota(v){
  if(v==="unlimited"||v===Infinity||v===-1||v==="-1") return "unlimited";
  var n=Math.round(Number(v)); if(!isFinite(n)||n<0) n=0;
  return Math.min(n, SYSTEM_AI_LIMITS.MAX_DESIGNS_PER_USER);
}
function agSetRoleQuota(roleId,v){
  if(typeof WS==="undefined") return; WS.ai=WS.ai||{}; WS.ai.galleryRoleQuota=WS.ai.galleryRoleQuota||{};
  WS.ai.galleryRoleQuota[roleId]=agNormQuota(v);
}
/* v18 §67/§68 effective limit for a member: the role quota; if the product
   ever grants several roles the highest one wins; admin is always unlimited. */
function agRoleLimitFor(userId){
  var p=typeof person==="function"?person(userId):{perm:"member"}, roles=[p.perm||"member"].concat(p.extraRoles||[]), table=agRoleQuotaTable();
  if(roles.indexOf("admin")>=0) return {limit:Infinity,unlimited:true,roleId:"admin"};
  var best=-1,bestRole=roles[0];
  roles.forEach(function(r){ var q=table[r]; if(q===undefined) q=DEFAULT_GALLERY_ROLE_QUOTA.member; if(q==="unlimited"){ best=Infinity; bestRole=r; } else if(best!==Infinity&&Number(q)>best){ best=Number(q); bestRole=r; } });
  if(best<0) best=0;
  return {limit:best,unlimited:best===Infinity,roleId:bestRole};
}
/* v29: the daily allowance resets at local midnight, as the admin help text says (toISOString() is UTC, i.e. 07:00 WIB). */
function agToday() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function agQuotaKey() { return "cos.ai.gallery.quota." + ((typeof WS !== "undefined" && WS.id) || "ws") + "." + (typeof ME !== "undefined" ? ME : "me"); }
function agQuotaState() {
  var empty = { day: agToday(), created: 0, duplicated: 0 };
  try {
    var raw = JSON.parse(localStorage.getItem(agQuotaKey()) || "null");
    if (!raw || raw.day !== agToday()) return empty;
    return { day: raw.day, created: +raw.created || 0, duplicated: +raw.duplicated || 0 };
  } catch (e) { return empty; }
}
function agQuotaBump(kind) {
  var st = agQuotaState();
  if (kind === "create") st.created++; else if (kind === "duplicate") st.duplicated++;
  try { localStorage.setItem(agQuotaKey(), JSON.stringify(st)); } catch (e) {}
  return st;
}
/* How many ACTIVE designs this member owns (§66 only active items count;
   archived items count only when the admin policy says so). Server mode gets
   the real count from the API; standalone counts the local store. */
var AG_OWNED_COUNT = null;
function agOwnedCount() {
  if (AG_OWNED_COUNT !== null) return AG_OWNED_COUNT;
  return typeof AG_LOCAL_OWNED==="number"?AG_LOCAL_OWNED:0;
}
/* v18 §88 the one usage object every UI reads. */
function agUsage(){
  var lim=agRoleLimitFor(typeof ME!=="undefined"?ME:null), used=agOwnedCount();
  var remaining=lim.unlimited?Infinity:Math.max(0,lim.limit-used), pct=lim.unlimited||lim.limit===0?(lim.unlimited?0:100):Math.round(used/lim.limit*100);
  return {used:used,limit:lim.limit,unlimited:lim.unlimited,remaining:remaining,percentage:pct,roleId:lim.roleId,over:!lim.unlimited&&used>lim.limit};
}
function agQuota() {
  var p = effectiveAiPolicy().gallery, st = agQuotaState(), u=agUsage();
  return {
    total:      { used: u.used, limit: u.unlimited?Infinity:u.limit, unlimited:u.unlimited },
    today:      { used: st.created,      limit: p.maxNewDesignsPerDay },
    duplicates: { used: st.duplicated,   limit: p.maxDuplicatesPerDay }
  };
}
function agLimitLabel(limit){ return limit===Infinity||limit==="unlimited"?tr("Unlimited"):String(limit); }
/* §P0-8 / §72 / §90 at full quota a member may still view, edit, download,
   favourite, archive and delete — only new/save-as-new/duplicate are blocked. */
function agCanCreate(kind) {
  var q = agQuota(), u=agUsage();
  if (!u.unlimited && u.limit===0)
    return { ok: false, code:"role_zero", message: tr("Your role cannot create AI Gallery items.")+" "+tr("Ask a workspace admin if you need capacity.") };
  if (u.over)
    return { ok: false, code:"over", message: tr("Your current Gallery usage exceeds the limit for your role.") + " " + u.used + " / " + u.limit + ". " + tr("You can keep using existing files, but cannot save new Gallery items until usage is below the limit.") };
  if (!u.unlimited && u.used >= u.limit)
    return { ok: false, code:"full", message: tr("Gallery limit reached.") + " " + tr("You've used all") + " " + u.limit + " " + tr("Gallery items available for your role.") + " " + tr("Delete unused items or contact your workspace admin if you need a higher limit.") };
  if (kind === "duplicate" && q.duplicates.used >= q.duplicates.limit)
    return { ok: false, code:"dup_day", message: tr("Daily duplicate limit reached.") + " " + q.duplicates.used + " / " + q.duplicates.limit + ". " + tr("Try again tomorrow.") };
  if (kind !== "duplicate" && q.today.used >= q.today.limit)
    return { ok: false, code:"new_day", message: tr("Daily new-design limit reached.") + " " + q.today.used + " / " + q.today.limit + ". " + tr("Try again tomorrow.") };
  return { ok: true };
}
function agQuotaLine(q) {
  q = q || agQuota(); var u=agUsage();
  return '<div class="ai-quota">'
    + '<div class="ai-quota-row"><span>' + tr("Gallery usage") + '</span><b' + (!u.unlimited&&u.used >= u.limit ? ' class="warn"' : '') + '>' + u.used + ' / ' + agLimitLabel(u.unlimited?Infinity:u.limit) + '</b></div>'
    + '<div class="ai-quota-row"><span>' + tr("Published today") + '</span><b' + (q.today.used >= q.today.limit ? ' class="warn"' : '') + '>' + q.today.used + ' / ' + q.today.limit + '</b></div>'
    + '<div class="ai-quota-row"><span>' + tr("Duplicates today") + '</span><b' + (q.duplicates.used >= q.duplicates.limit ? ' class="warn"' : '') + '>' + q.duplicates.used + ' / ' + q.duplicates.limit + '</b></div>'
    + '</div>';
}
/* v18 §69–72 the gallery-header usage indicator: subtle below 80%, a soft
   warning at 80%, a clear warning at 90%, and a blocking notice at 100%. */
function agUsageIndicator(){
  var u=agUsage(); if(u.unlimited) return '<span class="ag-usage subtle" title="'+attr(tr("Your role has no Gallery item limit."))+'">'+u.used+' '+tr("items")+' · '+tr("Unlimited")+'</span>';
  var cls=u.over||u.percentage>=100?"full":u.percentage>=90?"near":u.percentage>=80?"soft":"subtle";
  return '<span class="ag-usage '+cls+'">'+u.used+' / '+u.limit+' '+tr("items used")+'</span>';
}
function agUsageBanner(){
  var u=agUsage(); if(u.unlimited) return "";
  if(u.over) return '<div class="banner warn ag-quota-banner">'+I.lock+'<div><b>'+tr("Your current Gallery usage exceeds the limit for your role.")+'</b> '+u.used+' / '+u.limit+'<br><span class="tiny">'+tr("You can keep using existing files, but cannot save new Gallery items until usage is below the limit.")+'</span></div><span class="spacer"></span><button class="btn sm" onclick="AG.mode=\'mine\';AG.offset=0;renderAIGallery()">'+tr("Review files")+'</button></div>';
  if(u.percentage>=100) return '<div class="banner warn ag-quota-banner">'+I.lock+'<div><b>'+tr("Gallery limit reached.")+'</b> '+tr("You've used all")+' '+u.limit+' '+tr("Gallery items available for your role.")+'<br><span class="tiny">'+tr("Delete unused items or contact your workspace admin if you need a higher limit.")+'</span></div><span class="spacer"></span><button class="btn sm" onclick="AG.mode=\'mine\';AG.offset=0;renderAIGallery()">'+tr("Manage Gallery")+'</button></div>';
  if(u.percentage>=90) return '<div class="banner warn ag-quota-banner">'+I.gallery+'<div><b>'+tr("You're almost at your Gallery limit.")+'</b> '+u.used+' / '+u.limit+' '+tr("items used")+'</div><span class="spacer"></span><button class="btn sm" onclick="AG.mode=\'mine\';AG.offset=0;renderAIGallery()">'+tr("Review files")+'</button></div>';
  if(u.percentage>=80) return '<div class="banner ag-quota-banner soft">'+I.gallery+'<div>'+tr("You're using")+' '+u.used+' '+tr("of")+' '+u.limit+' '+tr("Gallery items.")+'</div><span class="spacer"></span><button class="btn sm ghost" onclick="AG.mode=\'mine\';AG.offset=0;renderAIGallery()">'+tr("Manage Gallery")+'</button></div>';
  return "";
}
/* v18 §94 in-app quota notifications at 80 / 90 / 100 — fired once per
   threshold per day so a member is not nagged on every save. */
function agQuotaNotify(){
  var u=agUsage(); if(u.unlimited||u.limit===0) return;
  var key="cos.ai.gallery.quotaNotified."+((typeof WS!=="undefined"&&WS.id)||"ws")+"."+ME, seen={}; try{ seen=JSON.parse(localStorage.getItem(key)||"{}")||{}; }catch(e){}
  var day=agToday(), level=u.percentage>=100?100:u.percentage>=90?90:u.percentage>=80?80:0; if(!level||seen[level]===day) return;
  seen[level]=day; try{ localStorage.setItem(key,JSON.stringify(seen)); }catch(e){}
  var text=level===100?tr("Your AI Hub Gallery limit has been reached."):level===90?tr("You're approaching your AI Hub Gallery limit."):tr("Your AI Hub Gallery is 80% full.");
  if(typeof NOTIFS!=="undefined"){ NOTIFS.unshift({id:uid("nt"),k:"gallery_quota",who:null,t:text,ago:0,read:false,entityType:"gallery"}); if(typeof syncNotifDot==="function")syncNotifDot(); }
  /* only the hard limit may reach the browser (§94) */
  if(typeof deliverNotification==="function") deliverNotification({type:"GALLERY_QUOTA",title:"AI Gallery",body:text,priority:level===100?"medium":"low",inApp:false,push:level===100,sound:level===100,target:{screen:"aigallery"}});
}
</script>
