/* CHAT MODELS — ANOTHER MODEL WITHOUT WRITING CODE (Oct 2026). Settings → AI → Models → Chat models; docs/ADMIN-OPS.md §5

   What it is. The workspace's chat models: one list an admin manages, beside the image models. Each entry is a display
   name, a provider preset (OpenAI, OpenAI's Responses API, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek,
   Mistral, xAI, Together, Azure OpenAI, SumoPod or Custom — it fills the endpoint and the format), the model ID sent to
   the provider, the endpoint, an API key of its own or none, whether it is active, notes, and the advanced settings a
   preset cannot know: the format, the token field, the maximum output tokens, a reasoning effort, a temperature and
   extra body parameters (shared/ai-chat-models.js; server/ai-chat-format.js builds the request from them). "auto"
   everywhere is the detection that was always there, so nothing changes for a workspace that never opens the list.

   The workspace connection. The chat connection in Settings → AI → Providers (ai_settings.chat) is the list's first
   entry, "Workspace connection" (linked): its provider, endpoint, model and key are read from the connection — edited
   there, never copied — and only its name, its advanced settings, its switch and its notes live on the entry. A
   workspace from before (or restored from a backup of before) has that one entry without anything stored, so it
   asks exactly what it asked. Once, at start-up (app_meta 'ai_chat_models', in a transaction), every workspace gets
   the entry written down, used for everything: the connection itself is not touched.

   Which model does what (ai_settings.chatUse). AI Intelligence chat, Smart Scoring's AI suggestions, the effort
   estimate on Create, Refine with AI (the brief) and the report summary: each an entry, or "Same as AI Intelligence"
   (""). The server picks the entry from what the request is for — the page sends only a purpose on /api/ai/chat,
   never a model ID or an endpoint; server/scoring-ai.js asks for "scoring"; anything unknown is AI Intelligence. An
   entry switched off or removed is no longer used: what it was used for falls back to the AI Intelligence model, and
   the answer says so. The last active entry cannot be switched off or removed. AI Intelligence itself always names
   an active entry (the first one left, when its own goes).

   Keys. An entry's own key is encrypted with the server secret (server/secrets.js) and never leaves the server: the
   list says only whether one is set and where the key it would use comes from — its own, the workspace connection's
   (same host), another entry's on the same host ("shared"), or none. A key is only ever sent to the host it was saved
   for. An address may not carry a key or a password in itself (?key=…, user:pass@): the key belongs in its field.

   Every request still goes through aiConf (server/server.js): external AI processing on, a key, https only, and the
   host on the server's allowlist (the known providers, Azure, and COS_AI_ALLOWED_HOSTS) — exactly as strict as it was;
   nothing here can allow a host.

   Test. POST /api/ai/chat-models/:id/test sends a tiny prompt with the entry's own settings and answers {ok, ms, model,
   format, endpoint, fields, usage, sample (≤ 120 characters), error, hint}: a provider error people meet often is read
   into a hint with, where it can be, a one-click fix (the token field, the format, a temperature or a reasoning effort
   the model refuses, a maximum it is over) — or the field to look at (the model ID, the key, the endpoint), or what
   the server admin does (COS_AI_ALLOWED_HOSTS). Ten tests a minute per person. The outcome is kept on the entry
   (the connection's on the connection, where Providers shows it).

   Whoever may change the workspace's settings (manage_workspace — the AI tab's own permission) manages the list; the
   page of everyone else gets each entry's name and whether it is ready, nothing more (server.js workspaceFor). */
const shared = require("../shared/ai-chat-models");
const chatFormat = require("./ai-chat-format");
const { PURPOSES, LIMITS, FORMATS, TOKEN_PARAMS, EFFORTS } = shared;

const CONNECTION_ID = "cm_connection";
/* the Providers card's own test: a purpose no request body can carry */
const CONNECTION = Symbol("the workspace chat connection");
const META_KEY = "ai_chat_models";
const TEST_PER_MINUTE = 10;
const TEST_TIMEOUT = 25000;
const TEST_SYSTEM = "You are a connection test for ZenCrevia. Answer in one word.";
const TEST_PROMPT = "Reply with the single word: ready";
const ADVANCED = ["format", "tokenParam", "maxOutputTokens", "reasoningEffort", "temperature", "extraParams"];
const SECRET_QUERY = /^(key|api[-_]?key|apikey|token|access[-_]?token|secret|password)$/i;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const hostOf = s => { try { return new URL(String(s)).hostname.toLowerCase(); } catch (e) { return ""; } };
const extraHosts = () => String(process.env.COS_AI_ALLOWED_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

/* ---------- the list, as stored or as it always was ---------- */
function connectionEntry(at) {
  return { id: CONNECTION_ID, linked: true, name: "Workspace connection", format: "auto", tokenParam: "auto", maxOutputTokens: null, reasoningEffort: "auto", temperature: null, extraParams: {}, active: true, notes: "", createdAt: at || null, createdBy: null };
}
/* the stored entries; nothing stored is the one entry a workspace always had — its connection */
function entriesOf(ai) {
  const list = Array.isArray(ai && ai.chatModels) ? ai.chatModels.filter(e => isObj(e) && typeof e.id === "string") : [];
  return list.length ? list : [connectionEntry()];
}
/* what each purpose uses: AI Intelligence always an active entry, every other one an active entry or "" (the same) */
function useOf(ai, list) {
  list = list || entriesOf(ai);
  const raw = isObj(ai && ai.chatUse) ? ai.chatUse : {}, active = list.filter(e => e.active !== false);
  const ok = id => typeof id === "string" && active.some(e => e.id === id);
  const out = { intelligence: ok(raw.intelligence) ? raw.intelligence : (active[0] ? active[0].id : null) };
  PURPOSES.forEach(p => { if (p !== "intelligence") out[p] = ok(raw[p]) ? raw[p] : ""; });
  return out;
}
const purposeOf = p => (typeof p === "string" && PURPOSES.indexOf(p) >= 0 ? p : "intelligence");
/* the entry a request for this purpose is answered by */
function pick(ai, purpose) {
  const list = entriesOf(ai), use = useOf(ai, list), p = purposeOf(purpose);
  const id = (p !== "intelligence" && use[p]) || use.intelligence;
  return list.find(e => e.id === id) || null;
}
/* the key an entry would use (still encrypted), and where it comes from: only ever one saved for the same host */
function keyFor(ai, e, list) {
  const chat = (ai && ai.chat) || {};
  if (e.linked) return { key: chat.key || "", source: chat.key ? "connection" : "none" };
  if (e.key) return { key: e.key, source: "own" };
  const h = hostOf(e.endpoint); if (!h) return { key: "", source: "none" };
  if (chat.key && hostOf(chat.endpoint) === h) return { key: chat.key, source: "connection" };
  const other = (list || entriesOf(ai)).find(x => x !== e && x.id !== e.id && !x.linked && x.key && hostOf(x.endpoint) === h);
  return other ? { key: other.key, source: "shared", from: other.id } : { key: "", source: "none" };
}
/* the preset a connection's endpoint reads as (shown for the linked entry; the connection keeps its own provider) */
function presetOfConnection(chat) {
  chat = chat || {}; const h = hostOf(chat.endpoint);
  const byHost = { "api.anthropic.com": "anthropic", "generativelanguage.googleapis.com": "gemini", "openrouter.ai": "openrouter", "api.groq.com": "groq", "api.deepseek.com": "deepseek", "api.mistral.ai": "mistral", "api.x.ai": "xai", "api.together.xyz": "together", "ai.sumopod.com": "sumopod" };
  if (h === "api.openai.com") return chatFormat.isResponsesEndpoint(chat.endpoint) ? "openai_responses" : "openai";
  if (byHost[h]) return byHost[h];
  if (/\.(openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)$/.test(h)) return "azure";
  if (!h && (chat.provider === "anthropic" || chat.provider === "gemini")) return chat.provider;
  return "custom";
}

/* ---------- what the page gets: never a key ---------- */
function maskEntry(ai, e, list, use) {
  const chat = (ai && ai.chat) || {}, adv = shared.normalizeAdvanced(e), k = keyFor(ai, e, list);
  const endpoint = String((e.linked ? chat.endpoint : e.endpoint) || ""), h = hostOf(endpoint);
  return {
    id: e.id, name: String(e.name || ""), linked: !!e.linked,
    provider: e.linked ? presetOfConnection(chat) : (shared.presetById(e.provider) ? e.provider : "custom"),
    modelId: String((e.linked ? chat.model : e.modelId) || ""), endpoint, host: h,
    hostAllowed: !!h && /^https:/i.test(endpoint) && chatFormat.allowedAIHost(h, extraHosts()),
    format: adv.format, tokenParam: adv.tokenParam, maxOutputTokens: adv.maxOutputTokens, reasoningEffort: adv.reasoningEffort, temperature: adv.temperature, extraParams: adv.extraParams,
    active: e.active !== false, notes: String(e.notes || ""),
    keySet: e.linked ? !!chat.key : !!e.key, keySource: k.source, keyReady: !!k.key,
    isDefault: use.intelligence === e.id,
    usedFor: PURPOSES.filter(p => (p === "intelligence" ? use.intelligence : (use[p] || use.intelligence)) === e.id),
    lastCheck: (e.linked ? chat.lastCheck : e.lastCheck) || null,
    createdAt: e.createdAt || null, updatedAt: e.updatedAt || null, updatedBy: e.updatedBy || null
  };
}
function maskState(ai) {
  ai = ai || {}; const list = entriesOf(ai), use = useOf(ai, list);
  return { models: list.map(e => maskEntry(ai, e, list, use)), use, purposes: PURPOSES.slice() };
}
/* for someone who does not manage the settings: which models there are and whether each is ready, nothing more */
function publicState(state) {
  return { models: state.models.map(m => ({ id: m.id, name: m.name, linked: m.linked, active: m.active, keyReady: m.keyReady, isDefault: m.isDefault, usedFor: m.usedFor })), use: state.use, purposes: state.purposes };
}

/* ---------- once: the connection written down as the first entry, used for everything ---------- */
function migrateAI(ai, at) {
  ai = isObj(ai) ? ai : {};
  if (Array.isArray(ai.chatModels) && ai.chatModels.length) return { ai, changed: false };
  const out = Object.assign({}, ai, { chatModels: [Object.assign(connectionEntry(at), { migrated: true })], chatUse: { intelligence: CONNECTION_ID, scoring: "", estimate: "", brief: "", report: "" } });
  return { ai: out, changed: true };
}

/* ---------- a provider's error, read into a hint and (where it can be) a fix ---------- */
const PARAM_FIELD = { max_tokens: "tokenParam", max_completion_tokens: "tokenParam", max_output_tokens: "tokenParam", messages: "format", input: "format", instructions: "format", temperature: "temperature", reasoning_effort: "reasoningEffort", "reasoning.effort": "reasoningEffort", reasoning: "reasoningEffort" };
function hintFor(error, e) {
  const m = String(error || ""); if (!m) return null;
  e = e || {}; const adv = shared.normalizeAdvanced(e), extra = adv.extraParams || {};
  const status = +((m.match(/provider error \((\d{3})\)/) || [])[1] || 0);
  const out = (code, text, fix, vars) => ({ code, text, fix: fix || null, vars: vars || {} });
  const without = k => { const x = Object.assign({}, extra); delete x[k]; return x; };
  let x = m.match(/endpoint \(([^)\s]+)\) is not on the server allowlist/);
  if (x) return out("host", "The server sends AI keys only to known providers. To use " + x[1] + ", the server admin adds it to COS_AI_ALLOWED_HOSTS (comma-separated) and restarts the server — it cannot be allowed from the browser.", null, { host: x[1] });
  if (/must start with https/i.test(m)) return out("https", "The endpoint must start with https://.", { focus: "endpoint" });
  if (/endpoint is invalid/i.test(m)) return out("endpoint_invalid", "The endpoint is not a valid web address.", { focus: "endpoint" });
  if (/external ai processing is disabled/i.test(m)) return out("external_off", "External AI processing is off: switch on Allow external AI providers in Settings → AI → Permissions.");
  if (/^no (chat )?api key|no api key for/i.test(m)) return out("no_key", "There is no API key for this model: add one, or save one for the same provider.", { focus: "key" });
  /* the parameter the provider names: "Unsupported parameter: 'max_tokens'…", "Unsupported value: 'temperature'…" */
  x = m.match(/unsupported (?:parameter|value)s?:?\s*['"`]?([A-Za-z_][\w.]*)/i) || m.match(/['"`]([A-Za-z_][\w.]*)['"`]\s+is (?:not supported|unsupported|not allowed|not permitted)/i) || m.match(/(?:unknown|unrecognized|unexpected) (?:parameter|field|argument|name)s?:?\s*['"`]?([A-Za-z_][\w.]*)/i);
  let param = x ? x[1] : null;
  if (!param && /(not supported|unsupported|not permitted|not allowed|does not support|extra inputs|unknown|unrecognized|only the default)/i.test(m)) {
    const named = ["max_completion_tokens", "max_output_tokens", "max_tokens", "reasoning_effort", "temperature"].concat(Object.keys(extra)).find(k => new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(m));
    if (named) param = named;
  }
  if (param) {
    if (param === "max_tokens") return adv.tokenParam === "max_completion_tokens" ? out("parameter", "The provider refuses max_tokens.", null, { param }) : out("token_param", "This model takes max_completion_tokens, not max_tokens.", { tokenParam: "max_completion_tokens" }, { param, to: "max_completion_tokens" });
    if (param === "max_completion_tokens") return adv.tokenParam === "max_tokens" ? out("parameter", "The provider refuses max_completion_tokens.", null, { param }) : out("token_param", "This model takes max_tokens, not max_completion_tokens.", { tokenParam: "max_tokens" }, { param, to: "max_tokens" });
    if (param === "max_output_tokens") return out("token_param", "This endpoint does not take max_output_tokens: let the token field be chosen automatically.", { tokenParam: "auto" }, { param, to: "auto" });
    if (param === "messages") return adv.format === "responses" ? out("parameter", "The provider refuses messages.", null, { param }) : out("format", "This endpoint speaks OpenAI's Responses API: set the format to Responses.", { format: "responses" }, { param, to: "responses" });
    if (param === "input" || param === "instructions") return out("format", "This endpoint speaks Chat Completions: set the format to Chat Completions.", { format: "chat_completions" }, { param, to: "chat_completions" });
    if (param === "temperature") return out("temperature", "This model does not take a temperature: leave it blank so the provider's default is used.", Object.assign({ temperature: null }, extra.temperature !== undefined ? { extraParams: without("temperature") } : {}), { param });
    if (PARAM_FIELD[param] === "reasoningEffort" || param === "reasoning_effort") return out("effort", "This model does not take a reasoning effort: set it back to Auto.", Object.assign({ reasoningEffort: "auto" }, extra[param] !== undefined ? { extraParams: without(param) } : {}), { param });
    if (extra[param] !== undefined) return out("extra", "The provider refuses the extra parameter " + param + ": remove it.", { extraParams: without(param) }, { param });
  }
  /* over the model's own maximum: "max_tokens: 200000 > 64000, which is the maximum", "supports at most 16384 completion tokens" */
  x = m.match(/(\d{2,7})\s*>\s*(\d{2,7}),?\s*which is the maximum/i) || m.match(/supports at most (\d{2,7})/i) || m.match(/maximum (?:allowed )?(?:value|output tokens?|number of (?:output )?tokens)[^\d]{0,24}(\d{2,7})/i);
  if (x) { const max = Math.max(LIMITS.tokensMin, Math.min(LIMITS.tokensMax, +x[x.length - 1])); return out("max_tokens", "The model allows at most " + max + " output tokens: set Max output tokens to " + max + ".", { maxOutputTokens: max }, { max }); }
  if (/model[^\n]{0,100}?(not found|does not exist|not exist|is not available|not available|no such|decommissioned|deprecated|not a valid)|model_not_found|no (?:such )?model|unknown model|invalid model/i.test(m)) return out("model", "The provider does not know this model ID: check its exact spelling in the provider's model list.", { focus: "modelId" });
  if (/html page instead of json/i.test(m)) return out("endpoint", "The endpoint answered with a web page, not the API: check the address (it usually ends in /chat/completions, /responses, /messages or :generateContent).", { focus: "endpoint" });
  if (status === 401 || /invalid[_ ]?(x-)?api[_ ]?key|incorrect api key|api key not valid|unauthori[sz]ed|authentication|invalid authentication|permission denied: api key/i.test(m)) return out("key", "The provider refused the API key: paste a new key for this provider.", { focus: "key" });
  if (status === 403) return out("forbidden", "The provider refused the request: the key may not have access to this model.", { focus: "key" });
  if (status === 429 || /rate limit|quota|too many requests|insufficient_quota|billing/i.test(m)) return out("rate_limit", "The provider's rate limit or quota is used up: wait a little, or check the provider account's plan and billing.");
  if (status === 404) return out("not_found", "The provider answered 404: check the endpoint's path and the model ID.", { focus: "endpoint" });
  if (status >= 500) return out("provider_down", "The provider had a problem of its own: try again in a moment.");
  if (/timed out/i.test(m)) return out("timeout", "The provider did not answer in time: check the endpoint, or try again.", { focus: "endpoint" });
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|getaddrinfo|fetch failed|certificate/i.test(m)) return out("unreachable", "The server could not reach the endpoint: check the address.", { focus: "endpoint" });
  if (/returned no text/i.test(m)) { const cur = adv.maxOutputTokens || 4000, more = Math.min(LIMITS.tokensMax, cur * 2); return out("empty", "The model answered with no text — a reasoning model may have spent every output token thinking: allow more output tokens (or a lower reasoning effort).", more > cur ? { maxOutputTokens: more } : null, { max: more }); }
  return null;
}
/* a key that came back in an error is never shown */
function scrub(text, key) {
  let s = String(text || "");
  if (key && key.length >= 6) s = s.split(key).join("[key]");
  return s.replace(/\b(sk-(?:ant-|or-|proj-)?|xai-|gsk_|AIza)[A-Za-z0-9_\-]{8,}/g, "$1…");
}
const cleanSample = t => Array.from(String(t || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, 120).join("");

module.exports = function aiChatModels(db, WS_ID, d) {
  const { route, HttpError, forbid, can, now } = d;
  const tx = d.tx || ((x, fn) => fn());
  const sz = d.sz || require("./serialize");
  const secrets = d.secrets || require("./secrets");
  const security = d.security || { log() {} };
  const act = d.act || (() => {});
  const uidOf = () => "cm_" + require("crypto").randomBytes(5).toString("hex");
  const tests = new Map();

  /* once, at start-up: every workspace's connection becomes its first chat model, used for everything */
  try {
    db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
    if (!db.prepare("SELECT 1 FROM app_meta WHERE key=?").get(META_KEY)) {
      tx(db, () => {
        let moved = 0;
        db.prepare("SELECT id, ai_settings FROM workspaces").all().forEach(w => {
          let a; try { a = JSON.parse(w.ai_settings || "{}") || {}; } catch (e) { return; }
          const r = migrateAI(a, now()); if (!r.changed) return;
          db.prepare("UPDATE workspaces SET ai_settings=? WHERE id=?").run(JSON.stringify(r.ai), w.id); moved++;
        });
        db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(META_KEY, JSON.stringify({ at: now(), moved }));
      });
    }
  } catch (e) { console.error("[ai] chat models: " + e.message); }

  const readAI = () => sz.readAIRaw(db, WS_ID) || {};
  const writeAI = ai => db.prepare("UPDATE workspaces SET ai_settings=? WHERE id=?").run(JSON.stringify(ai), WS_ID);
  const stored = ai => (Array.isArray(ai.chatModels) && ai.chatModels.length ? ai.chatModels.map(e => Object.assign({}, e)) : [connectionEntry(now())]);
  const bad = msg => new HttpError(400, msg);

  /* ---------- the configuration a request is sent with (aiConf in server/server.js checks it as it checks every one) ---------- */
  function configFor(ai, purpose, target) {
    ai = ai || {};
    const chat = Object.assign({}, ai.chat || {}), list = entriesOf(ai);
    let e;
    if (purpose === CONNECTION) e = list.find(x => x.linked) || null;
    else if (typeof target === "string") { e = list.find(x => x.id === target); if (!e) throw new HttpError(404, "That chat model is not in this workspace."); }
    else e = pick(ai, purpose);
    if (!e) return chat;
    const adv = shared.normalizeAdvanced(e);
    if (e.linked) return Object.assign(chat, { entry: adv, registryId: e.id, registryName: e.name || "Workspace connection" });
    const k = keyFor(ai, e, list), preset = shared.presetById(e.provider) || shared.presetById("custom");
    if (!k.key) throw new HttpError(400, "No API key for the chat model “" + (e.name || e.modelId) + "”. Add one in Settings → AI → Models → Chat models, or save a key for the same provider.");
    return { provider: preset.kind, endpoint: String(e.endpoint || ""), key: k.key, model: String(e.modelId || ""), systemExtra: chat.systemExtra || "", entry: adv, registryId: e.id, registryName: e.name || e.modelId, keySource: k.source };
  }

  /* ---------- an entry as sent: checked field by field; a blank key keeps the stored one, "clear" (or null) removes it ---------- */
  function cleanEntry(inp, old, u) {
    inp = isObj(inp) ? inp : {};
    const out = Object.assign({}, old || {}), linked = !!out.linked, isNew = !old;
    const has = k => Object.prototype.hasOwnProperty.call(inp, k) && inp[k] !== undefined;
    const text = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
    if (has("name") || isNew) out.name = text(inp.name, LIMITS.name);
    if (!linked) {
      if (has("provider") || isNew) out.provider = shared.presetById(inp.provider) ? inp.provider : "custom";
      if (has("modelId") || isNew) {
        const m = String(inp.modelId == null ? "" : inp.modelId).trim();
        if (!m) throw bad("Type the model ID the provider uses, such as gpt-6-luna.");
        if (m.length > LIMITS.modelId || !/^[A-Za-z0-9._:/@+-]+$/.test(m)) throw bad("A model ID is letters, digits and . _ : / @ + - only, with no spaces.");
        out.modelId = m;
      }
      if (has("endpoint") || isNew) {
        const ep = String(inp.endpoint == null ? "" : inp.endpoint).trim();
        if (!ep) throw bad("Fill in the endpoint (the provider preset fills it).");
        let url; try { url = new URL(ep); } catch (e) { throw bad("The endpoint is not a valid web address."); }
        if (ep.length > LIMITS.endpoint) throw bad("The endpoint is longer than " + LIMITS.endpoint + " characters.");
        if (url.protocol !== "https:") throw bad("The endpoint must start with https://.");
        if (url.username || url.password) throw bad("The endpoint cannot carry a user name or password. Put the key in the API key field.");
        for (const k of url.searchParams.keys()) if (SECRET_QUERY.test(k)) throw bad("The endpoint cannot carry the key (" + k + "=). Put the key in the API key field, where it is stored encrypted.");
        out.endpoint = ep;
      }
      if (has("key") || inp.key === null) {
        const raw = inp.key === null ? "clear" : String(inp.key).trim();
        if (raw.toLowerCase() === "clear") out.key = "";
        else if (raw) {
          if (raw.length > LIMITS.key) throw bad("That API key is too long.");
          try { out.key = secrets.encrypt(raw); } catch (e) { throw new HttpError(e.status || 400, e.message); }
        }
      }
    }
    const pickOne = (k, list) => { if (!has(k)) { if (isNew) out[k] = "auto"; return; } if (list.indexOf(inp[k]) < 0) throw bad(k + " is one of: " + list.join(", ") + "."); out[k] = inp[k]; };
    pickOne("format", FORMATS); pickOne("tokenParam", TOKEN_PARAMS); pickOne("reasoningEffort", EFFORTS);
    if (has("maxOutputTokens") || inp.maxOutputTokens === null || isNew) {
      const v = inp.maxOutputTokens;
      if (v == null || v === "" || v === "auto") out.maxOutputTokens = null;
      else { const n = Number(v); if (!Number.isFinite(n)) throw bad("Max output tokens is a number (or blank for automatic)."); out.maxOutputTokens = Math.max(LIMITS.tokensMin, Math.min(LIMITS.tokensMax, Math.round(n))); }
    }
    if (has("temperature") || inp.temperature === null || isNew) {
      const v = inp.temperature;
      if (v == null || v === "") out.temperature = null;
      else { const n = Number(v); if (!Number.isFinite(n)) throw bad("Temperature is a number from 0 to 2 (or blank for the provider's default)."); out.temperature = Math.round(Math.max(LIMITS.tempMin, Math.min(LIMITS.tempMax, n)) * 100) / 100; }
    }
    if (has("extraParams") || isNew) { const r = shared.checkExtraParams(inp.extraParams); if (!r.ok) throw bad(r.error); out.extraParams = r.value; }
    if (has("active") || isNew) out.active = inp.active === undefined ? true : inp.active !== false;
    if (has("notes") || isNew) out.notes = String(inp.notes == null ? "" : inp.notes).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, LIMITS.notes);
    if (!out.name) out.name = linked ? "Workspace connection" : out.modelId;
    if (isNew) { out.id = uidOf(); out.createdAt = now(); out.createdBy = u ? u.id : null; }
    out.updatedAt = now(); out.updatedBy = u ? u.id : null;
    /* a test passed with other settings says nothing about these */
    const changed = ["provider", "modelId", "endpoint", "key"].concat(ADVANCED).some(k => !same(out[k], (old || {})[k]));
    if (changed) delete out.lastCheck;
    return { entry: out, advancedChanged: !isNew && ADVANCED.some(k => !same(out[k], old[k])) };
  }

  /* what was used for what, before and after: the purposes that now fall back to the AI Intelligence model */
  function fallbacks(beforeAi, afterAi, goneId) {
    const before = useOf(beforeAi), after = useOf(afterAi), list = entriesOf(afterAi);
    const purposes = PURPOSES.filter(p => (p === "intelligence" ? before.intelligence : (before[p] || before.intelligence)) === goneId);
    const to = list.find(e => e.id === after.intelligence) || null;
    return purposes.length ? { purposes, to: to ? { id: to.id, name: to.name || to.modelId || "" } : null } : null;
  }
  /* the list and the assignments, written as one; AI Intelligence and every assignment name an active entry */
  function save(ai, list, use) {
    const next = Object.assign({}, ai, { chatModels: list });
    next.chatUse = useOf(Object.assign({}, next, { chatUse: use || ai.chatUse || {} }), list);
    writeAI(next);
    return next;
  }
  const answer = (u, ai, extra) => Object.assign(maskState(ai), extra || {});

  route("GET", "/api/ai/chat-models", u => { forbid(can.manageWorkspace(u), "manage chat models"); return maskState(readAI()); });

  route("POST", "/api/ai/chat-models", (u, p, q, b) => {
    forbid(can.manageWorkspace(u), "manage chat models");
    let id, ai;
    tx(db, () => {
      const cur = readAI(), list = stored(cur);
      if (list.length >= LIMITS.entries) throw bad("This workspace has " + LIMITS.entries + " chat models. Remove one before adding another.");
      /* {linked: true}: the workspace connection back in the list, after it was removed */
      const linked = !!(b && isObj(b.model) && b.model.linked === true);
      if (linked && list.some(e => e.linked)) throw bad("The workspace connection is in the list already.");
      const { entry } = linked ? cleanEntry(b.model, connectionEntry(now()), u) : cleanEntry(b && b.model, null, u);
      if (linked) { entry.id = CONNECTION_ID; entry.createdAt = now(); entry.createdBy = u.id; }
      id = entry.id; list.push(entry); ai = save(cur, list);
    });
    act(u, "created", "workspace", WS_ID, { what: "chat model" });
    security.log("ai_chat_model_saved", { userId: u.id, id, created: true });
    return answer(u, ai, { id });
  });

  route("PUT", "/api/ai/chat-models/:id", (u, p, q, b) => {
    forbid(can.manageWorkspace(u), "manage chat models");
    let ai, fell = null;
    tx(db, () => {
      const cur = readAI(), list = stored(cur), at = list.findIndex(e => e.id === p.id);
      if (at < 0) throw new HttpError(404, "That chat model is not in this workspace.");
      const { entry, advancedChanged } = cleanEntry(b && b.model, list[at], u);
      if (entry.active === false && !list.some((e, i) => i !== at && e.active !== false)) throw bad("At least one chat model must stay active.");
      list[at] = entry;
      let base = cur;
      if (entry.linked && advancedChanged && cur.chat && cur.chat.lastCheck) { base = Object.assign({}, cur, { chat: Object.assign({}, cur.chat) }); delete base.chat.lastCheck; }
      ai = save(base, list);
      if (entry.active === false) fell = fallbacks(cur, ai, entry.id);
    });
    act(u, "edited", "workspace", WS_ID, { what: "chat model" });
    security.log("ai_chat_model_saved", { userId: u.id, id: p.id, keyChanged: !!(b && b.model && b.model.key) });
    return answer(u, ai, { id: p.id, fellBack: fell });
  });

  route("DELETE", "/api/ai/chat-models/:id", (u, p) => {
    forbid(can.manageWorkspace(u), "manage chat models");
    let ai, fell = null;
    tx(db, () => {
      const cur = readAI(), list = stored(cur), at = list.findIndex(e => e.id === p.id);
      if (at < 0) throw new HttpError(404, "That chat model is not in this workspace.");
      const rest = list.filter((e, i) => i !== at);
      if (!rest.length) throw bad("Keep at least one chat model.");
      if (!rest.some(e => e.active !== false)) throw bad("At least one chat model must stay active: switch another one on first.");
      ai = save(cur, rest);
      fell = fallbacks(cur, ai, p.id);
    });
    act(u, "deleted", "workspace", WS_ID, { what: "chat model" });
    security.log("ai_chat_model_removed", { userId: u.id, id: p.id });
    return answer(u, ai, { fellBack: fell });
  });

  /* {use: {intelligence: id, scoring: id | "" (the same as AI Intelligence), …}} */
  route("PUT", "/api/ai/chat-use", (u, p, q, b) => {
    forbid(can.manageWorkspace(u), "choose which chat model does what");
    const want = isObj(b && b.use) ? b.use : null; if (!want) throw bad("Say which model does what.");
    let ai;
    tx(db, () => {
      const cur = readAI(), list = stored(cur), active = list.filter(e => e.active !== false), use = useOf(cur, list);
      Object.keys(want).forEach(k => {
        if (PURPOSES.indexOf(k) < 0) return;
        const v = want[k] == null ? "" : String(want[k]);
        if (v === "" && k !== "intelligence") { use[k] = ""; return; }
        if (!active.some(e => e.id === v)) throw bad(k === "intelligence" ? "AI Intelligence needs an active chat model." : "That chat model is not active in this workspace.");
        use[k] = v;
      });
      ai = save(cur, list, use);
    });
    act(u, "edited", "workspace", WS_ID, { what: "chat model assignments" });
    return answer(u, ai);
  });

  /* ---------- Test: a tiny prompt with the entry's own settings ---------- */
  async function runTest(u, e, purpose) {
    const t0 = Date.now(), ai0 = readAI(), modelId = String((e.linked ? (ai0.chat || {}).model : e.modelId) || "");
    let c = null, req = null, text = "", usage = { in: null, out: null }, error = null;
    try {
      c = purpose === CONNECTION ? d.aiConf("chat", CONNECTION) : d.aiConf("chat", null, e.id);
      req = chatFormat.chatRequest(c, TEST_SYSTEM, [{ role: "user", content: TEST_PROMPT }]);
      const j = await d.aiFetch(req.endpoint, { method: "POST", headers: req.headers, body: JSON.stringify(req.body) }, "Chat", TEST_TIMEOUT);
      text = chatFormat.chatText(req.kind, j); usage = chatFormat.chatUsage(req.kind, j);
      if (!text) error = "The model returned no text.";
    } catch (err) { error = String((err && err.message) || err || "The test failed."); }
    const secret = c && c.key ? String(c.key) : "";
    const safe = s => (s ? scrub(s, secret).slice(0, 600) : null);
    const endpoint = req ? (() => { try { const x = new URL(req.endpoint); return x.origin + x.pathname; } catch (er) { return null; } })() : null;
    const body = req ? Object.keys(req.body).filter(k => ["messages", "input", "instructions", "system", "systemInstruction", "contents"].indexOf(k) < 0) : [];
    return {
      ok: !error, ms: Date.now() - t0, model: (c && c.model) || modelId || null, format: req ? req.kind : null, endpoint, fields: body,
      usage, sample: error ? "" : scrub(cleanSample(text), secret), error: safe(error), hint: error ? hintFor(safe(error), e) : null, at: now(), by: u.id
    };
  }
  function record(e, result) {
    const check = { ok: result.ok, at: result.at, by: result.by, ms: result.ms, error: result.error || null, model: result.model };
    tx(db, () => {
      const ai = readAI();
      if (e.linked) ai.chat = Object.assign({}, ai.chat || {}, { lastCheck: check });
      else if (Array.isArray(ai.chatModels)) { const i = ai.chatModels.findIndex(x => x && x.id === e.id); if (i >= 0) ai.chatModels[i] = Object.assign({}, ai.chatModels[i], { lastCheck: check }); }
      writeAI(ai);
    });
  }
  function limited(u) {
    const t = Date.now(), seen = (tests.get(u.id) || []).filter(x => t - x < 60000);
    if (seen.length >= TEST_PER_MINUTE) { const e = new HttpError(429, "Ten tests a minute is the limit. Wait a moment and test again."); e.retryAfter = Math.ceil((60000 - (t - seen[0])) / 1000); throw e; }
    seen.push(t); tests.set(u.id, seen);
  }
  route("POST", "/api/ai/chat-models/:id/test", async (u, p) => {
    forbid(can.manageWorkspace(u), "test chat models");
    limited(u);
    const e = entriesOf(readAI()).find(x => x.id === p.id);
    if (!e) throw new HttpError(404, "That chat model is not in this workspace.");
    const result = await runTest(u, e);
    record(e, result);
    security.log("ai_chat_model_tested", { userId: u.id, id: e.id, ok: result.ok, ms: result.ms, model: result.model, hint: result.hint ? result.hint.code : null });
    return result;
  });
  /* Settings → AI → Providers → Test connection: the workspace connection, with its entry's settings */
  async function testConnection(u) {
    const e = entriesOf(readAI()).find(x => x.linked) || connectionEntry();
    return runTest(u, e, CONNECTION);
  }

  return { configFor, testConnection, state: () => maskState(readAI()), CONNECTION, CONNECTION_ID };
};
module.exports.pure = { entriesOf, useOf, pick, keyFor, maskEntry, maskState, publicState, migrateAI, hintFor, scrub, cleanSample, presetOfConnection, connectionEntry, CONNECTION_ID, META_KEY, TEST_PROMPT, TEST_PER_MINUTE };
