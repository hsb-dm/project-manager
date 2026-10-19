/* Chat models (Oct 2026: server/ai-chat-models.js, shared/ai-chat-models.js, server/ai-chat-format.js). An admin plugs in
   another chat model from Settings → AI → Models → Chat models without code. Pinned here: every explicit setting in every
   format; extra parameters that never override the request; "auto" sending exactly what was sent before; the once-only
   migration, lossless and idempotent; which model answers which purpose (Smart Scoring asks for "scoring"); keys that
   never leave the server; the safeguards and the permissions; Test and the hints it reads from provider errors — in
   process, and on the real server with a stand-in provider (tests/fake-chat-provider.js), so nothing leaves the machine. */
process.env.COS_SECRET_KEY = process.env.COS_SECRET_KEY || "chat-models-test-secret-key-longer-than-32!!";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const format = require("../server/ai-chat-format");
const { chatRequest, chatCompletionsUrl, isResponsesEndpoint } = format;
const shared = require("../shared/ai-chat-models");
const chatModels = require("../server/ai-chat-models");
const { hintFor, maskState, publicState, migrateAI, scrub } = chatModels.pure;
const secrets = require("../server/secrets");
const sz = require("../server/serialize");
const { tx, now } = require("../server/db");
const seed = require("../server/seed");
const { can } = require("../server/permissions");
const root = path.join(__dirname, "..");
const WS = "ws_zencrevia";
const msgs = [{ role: "user", content: "Apa yang terlambat?" }, { role: "assistant", content: "T-101." }, { role: "user", content: "Dan minggu ini?" }];
const AUTO = { format: "auto", tokenParam: "auto", maxOutputTokens: null, reasoningEffort: "auto", temperature: null, extraParams: {} };
const C = (endpoint, model, provider) => ({ provider: provider || "openai", endpoint, key: "k", model });
const OA = "https://api.openai.com/v1/chat/completions", RESP = "https://api.openai.com/v1/responses", AN = "https://api.anthropic.com/v1/messages", GE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";
const FOUR = { chat: C(OA, "gpt-4.1"), responses: C(RESP, "gpt-4.1"), anthropic: C(AN, "claude-sonnet-4-6", "anthropic"), gemini: C(GE, "gemini-3.5-flash", "gemini") };
const TOKEN_KEYS = ["max_tokens", "max_completion_tokens", "max_output_tokens"];
const tokenKeys = body => TOKEN_KEYS.filter(k => k in body);

/* the request as it was built before chat models (b061e75), line for line: "auto" must send exactly this */
function legacyChatRequest(c, system, msgs) {
  const parse = s => { try { return new URL(String(s)); } catch (e) { return null; } };
  const isAzure = host => /\.(openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)$/.test(host);
  const isReasoning = model => /^(o[1-9]|gpt-([5-9]|[1-9]\d))/i.test(String(model || ""));
  const u = parse(c.endpoint), host = u ? u.hostname.toLowerCase() : "", path = u ? u.pathname : "";
  const openaiShape = /\/(chat\/completions|completions|responses)\/?$/.test(path) || /\/openai(\/|$)/.test(path);
  const anthropic = !openaiShape && (host === "api.anthropic.com" || (!u && c.provider === "anthropic") || (c.provider === "anthropic" && /\/messages\/?$/.test(path)));
  const gemini = !openaiShape && !anthropic && (host === "generativelanguage.googleapis.com" || (!u && c.provider === "gemini"));
  const headers = { "Content-Type": "application/json" };
  let body, endpoint = c.endpoint, kind;
  if (anthropic) {
    kind = "anthropic"; endpoint = endpoint || "https://api.anthropic.com/v1/messages"; headers["x-api-key"] = c.key; headers["anthropic-version"] = "2023-06-01";
    body = { model: c.model || "claude-sonnet-4-6", max_tokens: 1500, system, messages: msgs };
  } else if (gemini) {
    kind = "gemini";
    endpoint = (endpoint || "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent").replace("{model}", encodeURIComponent(c.model || "gemini-3.5-flash"));
    headers["x-goog-api-key"] = c.key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) };
  } else {
    if (isAzure(host)) headers["api-key"] = c.key; else headers["Authorization"] = "Bearer " + c.key;
    if (isResponsesEndpoint(endpoint)) {
      kind = "responses";
      body = { model: c.model, instructions: system, input: msgs.map(m => ({ role: m.role, content: m.content })), max_output_tokens: isReasoning(c.model) ? 4000 : 1500 };
    } else {
      kind = "chat"; endpoint = chatCompletionsUrl(endpoint);
      body = { model: c.model, messages: [{ role: "system", content: system }].concat(msgs) };
      body[isReasoning(c.model) ? "max_completion_tokens" : "max_tokens"] = isReasoning(c.model) ? 4000 : 1500;
    }
  }
  return { kind, endpoint, headers, body };
}

/* ---------- the request ---------- */

test('"auto" everywhere sends exactly what was sent before, for every provider shape and model', () => {
  const endpoints = [[OA, "openai"], [RESP, "openai"], ["https://api.openai.com/v1", "openai"], ["https://api.openai.com", "openai"], ["https://openrouter.ai/api/v1", "anthropic"], ["https://openrouter.ai/api/v1/chat/completions", "openai"],
    ["https://api.groq.com/openai/v1", "openai"], ["https://ai.sumopod.com/v1/chat/completions", "custom"], ["https://ai.sumopod.com/v1/responses", "openai"], [AN, "anthropic"], ["", "anthropic"], [GE, "gemini"], ["", "gemini"],
    ["https://generativelanguage.googleapis.com/v1beta/openai", "gemini"], ["https://acme.openai.azure.com/openai/deployments/x/chat/completions?api-version=2024-10-21", "openai"], ["not a url", "custom"]];
  const models = ["gpt-4o-mini", "gpt-4.1", "gpt-5", "gpt-6-luna", "gpt-6.1-sol", "o3", "claude-sonnet-4-6", "gemini-3.5-flash", "", "anthropic/claude-sonnet-4.6"];
  let n = 0;
  for (const [ep, provider] of endpoints) for (const model of models) {
    const c = C(ep, model, provider), before = legacyChatRequest(c, "sys", msgs);
    assert.deepEqual(chatRequest(c, "sys", msgs), before, "no entry: " + ep + " " + model);
    assert.deepEqual(chatRequest(c, "sys", msgs, AUTO), before, "all auto: " + ep + " " + model);
    assert.deepEqual(chatRequest(Object.assign({ entry: AUTO }, c), "sys", msgs), before, "auto from c.entry: " + ep + " " + model);
    assert.deepEqual(chatRequest(c, "sys", msgs, { format: "bogus", tokenParam: "nope", maxOutputTokens: "", temperature: "", reasoningEffort: 7, extraParams: "" }), before, "unknown values are auto");
    n++;
  }
  assert.equal(n, endpoints.length * models.length);
  /* the GPT-6 rule stays the automatic default */
  assert.equal(chatRequest(C(OA, "gpt-6-luna"), "s", msgs, AUTO).body.max_completion_tokens, 4000);
  assert.equal(chatRequest(C(OA, "gpt-4o-mini"), "s", msgs, AUTO).body.max_tokens, 1500);
});

test("a format chosen explicitly decides the shape, and the endpoint is completed for it", () => {
  let r = chatRequest(C(RESP, "gpt-4.1"), "sys", msgs, { format: "chat_completions" });
  assert.equal(r.kind, "chat"); assert.equal(r.endpoint, OA); assert.deepEqual(r.body.messages[0], { role: "system", content: "sys" }); assert.equal(r.headers.Authorization, "Bearer k");
  r = chatRequest(C("https://llm.fake-provider.test/v1", "m"), "sys", msgs, { format: "chat_completions" });
  assert.equal(r.endpoint, "https://llm.fake-provider.test/v1/chat/completions");
  r = chatRequest(C(OA, "gpt-4.1"), "sys", msgs, { format: "responses" });
  assert.equal(r.kind, "responses"); assert.equal(r.endpoint, RESP); assert.equal(r.body.instructions, "sys"); assert.ok(!("messages" in r.body)); assert.equal(r.body.input.length, 3);
  assert.equal(chatRequest(C("https://llm.fake-provider.test/v1", "m"), "s", msgs, { format: "responses" }).endpoint, "https://llm.fake-provider.test/v1/responses");
  assert.equal(chatRequest(C("https://llm.fake-provider.test", "m"), "s", msgs, { format: "responses" }).endpoint, "https://llm.fake-provider.test/v1/responses");
  /* Anthropic's shape on an address the endpoint alone would not call Anthropic */
  r = chatRequest(C("https://api.anthropic.com", "claude-x", "openai"), "sys", msgs, { format: "anthropic" });
  assert.equal(r.kind, "anthropic"); assert.equal(r.endpoint, "https://api.anthropic.com/v1/messages"); assert.equal(r.headers["x-api-key"], "k"); assert.equal(r.headers["anthropic-version"], "2023-06-01"); assert.ok(!r.headers.Authorization);
  assert.equal(r.body.system, "sys"); assert.equal(r.body.messages.length, 3);
  assert.equal(chatRequest(C("https://llm.fake-provider.test/v1", "c"), "s", msgs, { format: "anthropic" }).endpoint, "https://llm.fake-provider.test/v1/messages");
  /* Gemini's: a base address gets the model's generateContent path */
  r = chatRequest(C("https://generativelanguage.googleapis.com", "gemini-3.5-flash", "custom"), "sys", msgs, { format: "gemini" });
  assert.equal(r.kind, "gemini"); assert.equal(r.endpoint, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent");
  assert.equal(r.headers["x-goog-api-key"], "k"); assert.equal(r.body.systemInstruction.parts[0].text, "sys"); assert.equal(r.body.contents[1].role, "model");
  assert.equal(chatRequest(C("https://generativelanguage.googleapis.com/v1beta", "g"), "s", msgs, { format: "gemini" }).endpoint, "https://generativelanguage.googleapis.com/v1beta/models/g:generateContent");
  /* an address that already says where to go is left as it is */
  assert.equal(chatRequest(C(GE, "gemini-x"), "s", msgs, { format: "gemini" }).endpoint, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
  /* Azure keeps its own header and its query whatever the format */
  const az = chatRequest(C("https://acme.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-10-21", "d"), "s", msgs, { format: "chat_completions" });
  assert.equal(az.headers["api-key"], "k"); assert.match(az.endpoint, /api-version=2024-10-21$/);
});

test("the token field: as chosen in OpenAI-style formats, Anthropic's always max_tokens, Gemini's maxOutputTokens", () => {
  for (const tp of TOKEN_KEYS) {
    for (const f of ["chat", "responses"]) {
      const b = chatRequest(FOUR[f], "s", msgs, { tokenParam: tp }).body;
      assert.deepEqual(tokenKeys(b), [tp], f + " " + tp + ": that field and no other");
      assert.equal(b[tp], tp === "max_completion_tokens" ? 4000 : 1500, f + " " + tp + ": the newer field leaves room to think");
    }
    const an = chatRequest(FOUR.anthropic, "s", msgs, { tokenParam: tp }).body;
    assert.deepEqual(tokenKeys(an), ["max_tokens"], "Anthropic requires max_tokens");
    const ge = chatRequest(FOUR.gemini, "s", msgs, { tokenParam: tp }).body;
    assert.deepEqual(tokenKeys(ge), [], "Gemini has its own field"); assert.ok(ge.generationConfig.maxOutputTokens > 0);
  }
  /* the newer field chosen for a model the name does not give away */
  const own = chatRequest(C(OA, "luna-preview"), "s", msgs, { tokenParam: "max_completion_tokens" }).body;
  assert.equal(own.max_completion_tokens, 4000); assert.ok(!("max_tokens" in own));
  /* and the older one for a GPT-6 model behind a gateway that wants it */
  const old = chatRequest(C(OA, "gpt-6-luna"), "s", msgs, { tokenParam: "max_tokens" }).body;
  assert.equal(old.max_tokens, 4000); assert.ok(!("max_completion_tokens" in old));
  /* Gemini sends no generationConfig unless asked (it never did) */
  assert.ok(!("generationConfig" in chatRequest(FOUR.gemini, "s", msgs, AUTO).body));
});

test("max output tokens: the number set, held to 64–128 000, in every format; blank is automatic", () => {
  for (const f of Object.keys(FOUR)) {
    const pickTokens = b => (f === "gemini" ? b.generationConfig.maxOutputTokens : f === "anthropic" ? b.max_tokens : b[tokenKeys(b)[0]]);
    assert.equal(pickTokens(chatRequest(FOUR[f], "s", msgs, { maxOutputTokens: 2048 }).body), 2048, f);
    assert.equal(pickTokens(chatRequest(FOUR[f], "s", msgs, { maxOutputTokens: "3000" }).body), 3000, f + " as typed");
    assert.equal(pickTokens(chatRequest(FOUR[f], "s", msgs, { maxOutputTokens: 10 }).body), 64, f + " at least 64");
    assert.equal(pickTokens(chatRequest(FOUR[f], "s", msgs, { maxOutputTokens: 999999 }).body), 128000, f + " at most 128 000");
  }
  assert.equal(shared.normalizeAdvanced({ maxOutputTokens: "auto" }).maxOutputTokens, null);
  assert.equal(shared.normalizeAdvanced({ maxOutputTokens: "" }).maxOutputTokens, null);
  assert.equal(chatRequest(FOUR.chat, "s", msgs, { maxOutputTokens: "" }).body.max_tokens, 1500);
});

test("a reasoning effort goes only in the form the format takes, and only when it is not auto", () => {
  for (const e of ["none", "minimal", "low", "medium", "high"]) {
    const ch = chatRequest(C(OA, "gpt-6-luna"), "s", msgs, { reasoningEffort: e }).body;
    assert.equal(ch.reasoning_effort, e); assert.ok(!("reasoning" in ch));
    const rs = chatRequest(C(RESP, "gpt-6-luna"), "s", msgs, { reasoningEffort: e }).body;
    assert.deepEqual(rs.reasoning, { effort: e }); assert.ok(!("reasoning_effort" in rs));
    for (const f of ["anthropic", "gemini"]) { const b = chatRequest(FOUR[f], "s", msgs, { reasoningEffort: e }).body; assert.ok(!("reasoning" in b) && !("reasoning_effort" in b), f + " " + e); }
  }
  for (const f of Object.keys(FOUR)) { const b = chatRequest(FOUR[f], "s", msgs, AUTO).body; assert.ok(!("reasoning" in b) && !("reasoning_effort" in b), f + " auto"); }
  /* an effort that thinks leaves room to think, whatever the model is called */
  assert.equal(chatRequest(C(OA, "thinker"), "s", msgs, { reasoningEffort: "high" }).body.max_tokens, 4000);
  assert.equal(chatRequest(C(OA, "thinker"), "s", msgs, { reasoningEffort: "none" }).body.max_tokens, 1500);
});

test("a temperature only where one is written — never a default, so reasoning models are not refused", () => {
  for (const f of Object.keys(FOUR)) {
    const none = chatRequest(FOUR[f], "s", msgs, AUTO).body;
    assert.ok(!("temperature" in none) && !(none.generationConfig && "temperature" in none.generationConfig), f + ": blank sends none");
    const set = chatRequest(FOUR[f], "s", msgs, { temperature: 0.3 }).body;
    assert.equal(f === "gemini" ? set.generationConfig.temperature : set.temperature, 0.3, f);
    const zero = chatRequest(FOUR[f], "s", msgs, { temperature: 0 }).body;
    assert.equal(f === "gemini" ? zero.generationConfig.temperature : zero.temperature, 0, f + ": 0 is a temperature too");
  }
  for (const model of ["gpt-6-luna", "gpt-5", "o3"]) for (const ep of [OA, RESP]) assert.ok(!("temperature" in chatRequest(C(ep, model), "s", msgs, { tokenParam: "max_completion_tokens" }).body), model);
  assert.equal(chatRequest(FOUR.chat, "s", msgs, { temperature: 9 }).body.temperature, 2, "held to 0–2");
});

test("extra parameters are merged last and never override what the request is made of", () => {
  let b = chatRequest(FOUR.chat, "sys", msgs, { extraParams: { top_p: 0.9, response_format: { type: "text" } } }).body;
  assert.equal(b.top_p, 0.9); assert.deepEqual(b.response_format, { type: "text" }); assert.equal(b.model, "gpt-4.1");
  /* merged into what is there (Gemini's generationConfig keeps the token number) */
  b = chatRequest(FOUR.gemini, "s", msgs, { maxOutputTokens: 2048, extraParams: { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } } }).body;
  assert.deepEqual(b.generationConfig, { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } });
  /* null leaves a field out (a provider that refuses one) */
  b = chatRequest(FOUR.chat, "s", msgs, { extraParams: { max_tokens: null } }).body;
  assert.ok(!("max_tokens" in b));
  /* an extra parameter wins over an advanced setting it names — it is the last word */
  assert.equal(chatRequest(FOUR.chat, "s", msgs, { temperature: 0.2, extraParams: { temperature: 0.8 } }).body.temperature, 0.8);
  /* the request's own keys: refused when saved, and never merged even if they reach the request */
  for (const k of ["model", "messages", "input", "instructions", "stream", "tools", "system", "contents", "systemInstruction", "tool_choice"]) {
    const x = {}; x[k] = k === "stream" ? true : "evil"; x.top_k = 5;
    const chk = shared.checkExtraParams(x); assert.equal(chk.ok, false, k); assert.equal(chk.code, "protected"); assert.equal(chk.key, k);
    for (const f of Object.keys(FOUR)) {
      const body = chatRequest(FOUR[f], "sys", msgs, { extraParams: x }).body;
      assert.ok(!("top_k" in body), f + " " + k + ": nothing of a refused object is merged");
      assert.notEqual(body[k], x[k], f + " " + k);
      assert.ok(!("stream" in body), f);
    }
  }
  const viaProto = chatRequest(FOUR.chat, "s", msgs, { extraParams: JSON.parse('{"__proto__": {"polluted": true}}') }).body;
  assert.equal(viaProto.polluted, undefined); assert.equal({}.polluted, undefined);
});

test("extra parameters as typed: a small plain JSON object, checked with the same rules in the page and the server", () => {
  const ok = (v, value) => { const r = shared.checkExtraParams(v); assert.equal(r.ok, true, JSON.stringify(v)); if (value) assert.deepEqual(r.value, value); };
  const bad = (v, code) => { const r = shared.checkExtraParams(v); assert.equal(r.ok, false, JSON.stringify(v)); assert.equal(r.code, code, JSON.stringify(v)); assert.ok(r.error); };
  ok("", {}); ok("   ", {}); ok(null, {}); ok(undefined, {}); ok({}, {});
  ok('{"top_p": 0.9, "stop": ["\\n\\n"], "metadata": {"team": "design"}}', { top_p: 0.9, stop: ["\n\n"], metadata: { team: "design" } });
  ok({ thinking: { type: "enabled", budget_tokens: 2000 } });
  bad("{top_p: 0.9}", "invalid_json"); bad("[1, 2]", "not_object"); bad("0.9", "not_object"); bad([1], "not_object");
  bad('{"model": "gpt-x"}', "protected"); bad({ messages: [] }, "protected"); bad({ input: "x" }, "protected"); bad({ instructions: "x" }, "protected"); bad({ stream: true }, "protected"); bad({ tools: [] }, "protected");
  bad('{"__proto__": {"x": 1}}', "unsafe_key"); bad({ a: { constructor: 1 } }, "unsafe_key");
  bad({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }, "too_deep");
  const many = {}; for (let i = 0; i < 61; i++) many["k" + i] = i; bad(many, "too_many");
  bad({ text: "x".repeat(4100) }, "too_large"); bad("{\"a\": \"" + "x".repeat(4100) + "\"}", "too_large");
});

test("a provider's error is read into a hint and, where it can be, a fix that changes something", () => {
  const rows = [
    ["Chat provider error (400): Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", {}, "token_param", { tokenParam: "max_completion_tokens" }],
    ["Chat provider error (400): Unsupported parameter: 'max_completion_tokens' is not supported with this model. Use 'max_tokens' instead.", {}, "token_param", { tokenParam: "max_tokens" }],
    ["Chat provider error (400): Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", { tokenParam: "max_completion_tokens" }, "parameter", null],
    ["Chat provider error (400): Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.", { temperature: 0.2 }, "temperature", { temperature: null }],
    ["Chat provider error (400): temperature is not supported for this model", { extraParams: { temperature: 0.5, top_p: 1 } }, "temperature", { temperature: null, extraParams: { top_p: 1 } }],
    ["Chat provider error (400): Unrecognized request argument supplied: reasoning_effort", { reasoningEffort: "high" }, "effort", { reasoningEffort: "auto" }],
    ["Chat provider error (400): Unsupported parameter: 'messages'. In the Responses API, this parameter has moved to 'input'.", {}, "format", { format: "responses" }],
    ["Chat provider error (400): Unsupported parameter: 'input'.", { format: "responses" }, "format", { format: "chat_completions" }],
    ["Chat provider error (400): Unknown parameter: 'top_k'.", { extraParams: { top_k: 5, top_p: 0.9 } }, "extra", { extraParams: { top_p: 0.9 } }],
    ["Chat provider error (400): max_tokens: 200000 > 64000, which is the maximum allowed number of output tokens for claude-sonnet-4-6", { maxOutputTokens: 128000 }, "max_tokens", { maxOutputTokens: 64000 }],
    ["Chat provider error (400): max_tokens is too large: 200000. This model supports at most 16384 completion tokens, whereas you provided 200000.", {}, "max_tokens", { maxOutputTokens: 16384 }],
    ["Chat provider error (404): The model `gpt-6-lunaa` does not exist or you do not have access to it.", {}, "model", { focus: "modelId" }],
    ["Chat provider error (404): The model `gpt-4.1x` does not exist or you do not have access to it.", {}, "model", { focus: "modelId" }],
    ["Chat provider error (404): models/gemini-9 is not found for API version v1beta, or is not supported for generateContent.", {}, "model", { focus: "modelId" }],
    ["Chat provider error (401): Incorrect API key provided: sk-proj-****abcd. You can find your API key at …", {}, "key", { focus: "key" }],
    ["Chat provider error (400): API key not valid. Please pass a valid API key.", {}, "key", { focus: "key" }],
    ["Chat provider error (401): invalid x-api-key", {}, "key", { focus: "key" }],
    ["Chat provider error (403): Project does not have access", {}, "forbidden", { focus: "key" }],
    ["Chat provider error (429): Rate limit reached for requests", {}, "rate_limit", null],
    ["Chat provider error (503): overloaded", {}, "provider_down", null],
    ["Chat provider error (404): the provider answered with an HTML page instead of JSON (wrong endpoint?)", {}, "endpoint", { focus: "endpoint" }],
    ["Chat provider error (404): Not Found", {}, "not_found", { focus: "endpoint" }],
    ["Chat provider timed out — check the endpoint in Settings → AI.", {}, "timeout", { focus: "endpoint" }],
    ["Chat request failed: fetch failed (ENOTFOUND)", {}, "unreachable", { focus: "endpoint" }],
    ["The AI provider endpoint (llm.example.org) is not on the server allowlist. Known providers work as they are; for another one, the server admin adds its host to COS_AI_ALLOWED_HOSTS.", {}, "host", null],
    ["The AI provider endpoint must start with https://", {}, "https", { focus: "endpoint" }],
    ["External AI processing is disabled. An admin must enable it in Settings → AI.", {}, "external_off", null],
    ["No chat API key configured. Add one in Settings → AI.", {}, "no_key", { focus: "key" }],
    ["The model returned no text.", { maxOutputTokens: 4000 }, "empty", { maxOutputTokens: 8000 }]
  ];
  for (const [msg, entry, code, fix] of rows) {
    const h = hintFor(msg, entry);
    assert.ok(h, msg); assert.equal(h.code, code, msg); assert.deepEqual(h.fix, fix, msg); assert.ok(h.text.length > 10, msg);
  }
  assert.equal(hintFor("The AI provider endpoint (llm.example.org) is not on the server allowlist. … COS_AI_ALLOWED_HOSTS.", {}).vars.host, "llm.example.org");
  assert.match(hintFor("The AI provider endpoint (llm.example.org) is not on the server allowlist.", {}).text, /COS_AI_ALLOWED_HOSTS/);
  assert.equal(hintFor("something nobody has seen before", {}), null);
  assert.equal(hintFor("", {}), null);
  /* a key that came back in an error is never repeated */
  assert.equal(scrub("Key used: sk-live-abcdefghijklmnop.", "sk-live-abcdefghijklmnop"), "Key used: [key].");
  assert.equal(scrub("Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz", ""), "Incorrect API key provided: sk-proj-…");
  assert.equal(scrub("bad AIzaSyA1234567890abcdefgh", ""), "bad AIza…");
});

/* ---------- in process: the module as server.js wires it ---------- */

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const forbid = (ok, what) => { if (!ok) throw new HttpError(403, "You don't have permission to " + what); };
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  for (const m of fs.readFileSync(path.join(root, "server", "db.js"), "utf8").matchAll(/"(ALTER TABLE [^"]+)"/g)) { try { db.exec(m[1]); } catch (e) { /* already there */ } }
  seed.run(db);
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
  return db;
}
const readAI = db => sz.readAIRaw(db, WS);
const writeAI = (db, ai) => db.prepare("UPDATE workspaces SET ai_settings=? WHERE id=?").run(JSON.stringify(ai), WS);
const CONN = () => ({ provider: "openai", endpoint: OA, model: "gpt-4o-mini", key: secrets.encrypt("sk-conn-SECRET-0001"), systemExtra: "Answer briefly.", lastCheck: { ok: true, at: "2026-10-01T00:00:00Z", by: "admin", ms: 200 } });
/* o.provider(url, body, headers) → the provider's JSON, or throws as aiFetch does */
function boot(db, o) {
  o = o || {};
  const routes = {}, fetched = [], logs = [];
  const route = (m, p, h) => { routes[m + " " + p] = h; };
  let mod;
  /* as server.js aiConf does it: processing, the model for the purpose, its key, https, the allowlist */
  const aiConf = (kind, purpose, id) => {
    const settings = sz.readAIRaw(db, WS) || {};
    if (settings.processing && settings.processing.externalEnabled === false) throw new HttpError(403, "External AI processing is disabled. An admin must enable it in Settings → AI.");
    const c = mod.configFor(settings, purpose, id);
    if (!c.key) throw new HttpError(400, "No chat API key configured. Add one in Settings → AI.");
    c.key = secrets.decrypt(c.key);
    let u; try { u = new URL(String(c.endpoint || "")); } catch (e) { throw new HttpError(400, "The AI provider endpoint is invalid"); }
    if (u.protocol !== "https:") throw new HttpError(400, "The AI provider endpoint must start with https://");
    if (!format.allowedAIHost(u.hostname, ["llm.fake-provider.test"])) throw new HttpError(400, "The AI provider endpoint (" + u.hostname + ") is not on the server allowlist. Known providers work as they are; for another one, the server admin adds its host to COS_AI_ALLOWED_HOSTS.");
    return c;
  };
  const aiFetch = async (url, init) => { const body = JSON.parse(init.body); fetched.push({ url, body, headers: init.headers }); if (!o.provider) return { choices: [{ message: { content: "ready" } }], usage: { prompt_tokens: 12, completion_tokens: 1 } }; return o.provider(url, body, init.headers); };
  mod = chatModels(db, WS, { route, HttpError, forbid, can, now, tx, sz, secrets, aiConf, aiFetch, security: { log: (e, x) => logs.push([e, x]) }, act: () => {} });
  const user = id => {
    const m = db.prepare("SELECT role_id FROM workspace_members WHERE workspace_id=? AND user_id=?").get(WS, id);
    const caps = {}; JSON.parse(db.prepare("SELECT permissions FROM roles WHERE id=?").get(m.role_id).permissions).forEach(c => { caps[c] = true; });
    return { id, role: m.role_id, caps };
  };
  const call = (method, p, u, params, body) => { const h = routes[method + " " + p]; if (!h) throw new Error("no route " + method + " " + p); return h(u, params || {}, {}, body === undefined ? {} : body, { ip: "test" }); };
  return { db, mod, routes, fetched, logs, call, admin: user("admin"), member: user("sarah"), aiConf };
}
const refused = async (p, status, re) => { await assert.rejects(async () => p(), e => { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return true; }); };
const LUNA = { name: "GPT-6 Luna", provider: "openai", modelId: "gpt-6-luna", endpoint: OA, format: "chat_completions", tokenParam: "auto", key: "" };

test("once, at start-up: the connection becomes the first chat model, used for everything — losing nothing, twice is once", () => {
  const db = freshDb();
  const before = { chat: CONN(), image: { endpoint: "https://api.magnific.ai/v1/mystic", key: secrets.encrypt("img-key"), defaultStyle: "Lime." }, models: [{ id: "m_x", modelId: "gpt-image-2" }], processing: { externalEnabled: true, workspaceContextEnabled: false }, promptTemplates: [{ id: "p1", name: "Mine" }], chatTemplates: null };
  writeAI(db, before);
  db.prepare("DELETE FROM app_meta WHERE key=?").run(chatModels.pure.META_KEY);
  const k = boot(db);
  const after = readAI(db);
  for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], key + " untouched");
  assert.equal(after.chatModels.length, 1);
  const e = after.chatModels[0];
  assert.equal(e.id, "cm_connection"); assert.equal(e.linked, true); assert.equal(e.active, true); assert.equal(e.migrated, true);
  for (const f of ["format", "tokenParam", "reasoningEffort"]) assert.equal(e[f], "auto", f);
  assert.equal(e.maxOutputTokens, null); assert.equal(e.temperature, null); assert.deepEqual(e.extraParams, {});
  assert.ok(!("key" in e) && !("endpoint" in e) && !("modelId" in e), "the connection is read, never copied");
  assert.deepEqual(after.chatUse, { intelligence: "cm_connection", scoring: "", estimate: "", brief: "", report: "" });
  assert.equal(JSON.parse(db.prepare("SELECT value FROM app_meta WHERE key=?").get(chatModels.pure.META_KEY).value).moved, 1);
  /* every purpose asks exactly what it asked before, with the same key */
  for (const p of shared.PURPOSES.concat(["bogus", undefined, null, {}, 7])) {
    const c = k.aiConf("chat", p);
    assert.equal(c.key, "sk-conn-SECRET-0001"); assert.equal(c.model, "gpt-4o-mini"); assert.equal(c.endpoint, OA); assert.equal(c.provider, "openai"); assert.equal(c.systemExtra, "Answer briefly.");
    assert.deepEqual(chatRequest(c, "sys", msgs), legacyChatRequest(Object.assign({}, before.chat, { key: "sk-conn-SECRET-0001" }), "sys", msgs), String(p));
  }
  /* again: nothing changes — with the mark, and without it */
  boot(db); assert.deepEqual(readAI(db), after);
  db.prepare("DELETE FROM app_meta WHERE key=?").run(chatModels.pure.META_KEY);
  boot(db); assert.deepEqual(readAI(db), after, "a workspace that has its list keeps it");
  assert.deepEqual(migrateAI(after, "x"), { ai: after, changed: false });
  /* a workspace never migrated (or restored from before) answers as it always did: its connection, as one entry */
  const old = Object.assign({}, after); delete old.chatModels; delete old.chatUse; writeAI(db, old);
  const c = k.aiConf("chat", "scoring"); assert.equal(c.model, "gpt-4o-mini"); assert.equal(c.key, "sk-conn-SECRET-0001");
  const st = maskState(old); assert.equal(st.models.length, 1); assert.equal(st.models[0].linked, true); assert.equal(st.models[0].modelId, "gpt-4o-mini"); assert.equal(st.use.intelligence, "cm_connection");
  /* an empty workspace gets the entry too, and asks nothing until the connection has a key */
  const db2 = freshDb(); writeAI(db2, {}); db2.prepare("DELETE FROM app_meta WHERE key=?").run(chatModels.pure.META_KEY);
  const k2 = boot(db2); assert.equal(readAI(db2).chatModels[0].id, "cm_connection");
  assert.throws(() => k2.aiConf("chat", "intelligence"), /No chat API key configured/);
});

test("each purpose is answered by its model; an unknown one by AI Intelligence's; one switched off or removed falls back, and says so", async () => {
  const db = freshDb(); writeAI(db, { chat: CONN(), processing: { externalEnabled: true } });
  const k = boot(db);
  const a = await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: LUNA });
  const luna = a.id; assert.match(luna, /^cm_[0-9a-f]{10}$/);
  const claude = (await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: { name: "Claude", provider: "anthropic", modelId: "claude-sonnet-4-6", endpoint: AN, format: "anthropic", key: "sk-ant-SECRET-0003" } })).id;
  const own = (await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: { name: "Own LLM", provider: "custom", modelId: "own-1", endpoint: "https://llm.fake-provider.test/v1", key: "sk-own-SECRET-0002" } })).id;
  let r = await k.call("PUT", "/api/ai/chat-use", k.admin, {}, { use: { scoring: luna, estimate: claude, report: own } });
  assert.deepEqual(r.use, { intelligence: "cm_connection", scoring: luna, estimate: claude, brief: "", report: own });
  const model = p => k.aiConf("chat", p).model;
  assert.equal(model("scoring"), "gpt-6-luna"); assert.equal(model("estimate"), "claude-sonnet-4-6"); assert.equal(model("report"), "own-1");
  for (const p of ["intelligence", "brief", "bogus", "", undefined, null, { entry: luna }, ["scoring"]]) assert.equal(model(p), "gpt-4o-mini", JSON.stringify(p) + " → AI Intelligence");
  /* the key each one sends: its own, or the one saved for the same host — never another host's */
  assert.equal(k.aiConf("chat", "scoring").key, "sk-conn-SECRET-0001"); assert.equal(k.aiConf("chat", "scoring").keySource, "connection");
  assert.equal(k.aiConf("chat", "estimate").key, "sk-ant-SECRET-0003"); assert.equal(k.aiConf("chat", "report").key, "sk-own-SECRET-0002");
  assert.equal(k.aiConf("chat", "estimate").provider, "anthropic", "the preset tells the request which provider it is");
  /* AI Intelligence moves: what follows it moves with it */
  r = await k.call("PUT", "/api/ai/chat-use", k.admin, {}, { use: { intelligence: claude } });
  assert.equal(model("brief"), "claude-sonnet-4-6"); assert.equal(model("intelligence"), "claude-sonnet-4-6"); assert.equal(model("scoring"), "gpt-6-luna");
  assert.deepEqual(r.models.find(m => m.id === claude).usedFor, ["intelligence", "estimate", "brief"]);
  /* switched off: what it was used for falls back to the AI Intelligence model */
  r = await k.call("PUT", "/api/ai/chat-models/:id", k.admin, { id: luna }, { model: { active: false } });
  assert.deepEqual(r.fellBack, { purposes: ["scoring"], to: { id: claude, name: "Claude" } });
  assert.equal(model("scoring"), "claude-sonnet-4-6"); assert.equal(r.use.scoring, "");
  /* removed, AI Intelligence's own model: the first one left takes over */
  r = await k.call("DELETE", "/api/ai/chat-models/:id", k.admin, { id: claude });
  assert.deepEqual(r.fellBack.purposes, ["intelligence", "scoring", "estimate", "brief"]); assert.equal(r.fellBack.to.id, "cm_connection");
  assert.equal(r.use.intelligence, "cm_connection"); assert.equal(model("estimate"), "gpt-4o-mini"); assert.equal(model("report"), "own-1");
  /* an assignment names an active model; AI Intelligence always one */
  await refused(() => k.call("PUT", "/api/ai/chat-use", k.admin, {}, { use: { scoring: luna } }), 400, /not active/);
  await refused(() => k.call("PUT", "/api/ai/chat-use", k.admin, {}, { use: { intelligence: "" } }), 400, /AI Intelligence needs an active chat model/);
  await refused(() => k.call("PUT", "/api/ai/chat-use", k.admin, {}, { use: { report: "cm_nothere00" } }), 400);
  await refused(() => k.call("PUT", "/api/ai/chat-use", k.admin, {}, {}), 400);
});

test("server/scoring-ai.js asks for the model assigned to Smart Scoring", async () => {
  const { setup, reply } = require("./scoring-ai-harness");
  const asked = [];
  const k = setup({ aiConf: (kind, purpose) => { asked.push([kind, purpose]); return { provider: "openai", endpoint: OA, key: "k", model: "gpt-6-luna" }; },
    aiFetch: async () => ({ choices: [{ message: { content: reply() } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }) });
  await k.on(); const T = k.task();
  const a = await k.ask(T);
  assert.equal(a.aiResult.status, "ok"); assert.equal(a.aiResult.model, "gpt-6-luna");
  /* every call asks for Smart Scoring's own model: the one that asks the AI, and the cache's check of which model answers now */ assert.ok(asked.length >= 1 && asked.every(x => x[0] === "chat" && x[1] === "scoring"), JSON.stringify(asked));
  assert.match(fs.readFileSync(path.join(root, "server", "scoring-ai.js"), "utf8"), /d\.aiConf\("chat", "scoring"\)/);
  /* and the page asks each of its features by name, never by model */
  const src = f => fs.readFileSync(path.join(root, "src", f), "utf8");
  assert.match(src("ai.js"), /actions:true, purpose:"intelligence"/);
  assert.match(src("effort-estimate.js"), /purpose:"estimate"/);
  assert.match(src("ai-brief.js"), /purpose:"brief"/);
  assert.match(src("export.js"), /purpose:"report"/);
  for (const f of ["ai.js", "effort-estimate.js", "ai-brief.js", "export.js"]) { const s = src(f); let i = s.indexOf('"/api/ai/chat"'); while (i >= 0) { assert.ok(!/modelId|endpoint|chatModel/.test(s.slice(i, i + 260)), f + ": a purpose, never a model"); i = s.indexOf('"/api/ai/chat"', i + 1); } }
});

test("an entry as saved: checked field by field; keys are write-only, encrypted, and never in an answer", async () => {
  const db = freshDb(); writeAI(db, { chat: CONN(), processing: { externalEnabled: true } });
  const k = boot(db);
  const answers = [];
  const call = async (...a) => { const r = await k.call(...a); answers.push(JSON.stringify(r)); return r; };
  const r = await call("POST", "/api/ai/chat-models", k.admin, {}, { model: { name: "  Own   LLM ", provider: "nope", modelId: "own-1", endpoint: "https://llm.fake-provider.test/v1/chat/completions", key: "sk-own-SECRET-0002", maxOutputTokens: 10, temperature: 9, extraParams: '{"top_p": 0.9}', notes: "Line 1\nLine 2" } });
  const m = r.models.find(x => x.id === r.id);
  assert.equal(m.name, "Own LLM"); assert.equal(m.provider, "custom", "an unknown preset is Custom"); assert.equal(m.maxOutputTokens, 64); assert.equal(m.temperature, 2);
  assert.deepEqual(m.extraParams, { top_p: 0.9 }); assert.equal(m.notes, "Line 1\nLine 2"); assert.equal(m.keySet, true); assert.equal(m.keySource, "own"); assert.equal(m.keyReady, true);
  assert.equal(m.format, "auto"); assert.equal(m.tokenParam, "auto"); assert.equal(m.reasoningEffort, "auto"); assert.equal(m.active, true);
  assert.equal(m.hostAllowed, false, "the allowlist of this server (no COS_AI_ALLOWED_HOSTS here) — shown, never changed");
  const stored = readAI(db).chatModels.find(x => x.id === r.id);
  assert.match(stored.key, /^enc:v1:/); assert.equal(secrets.decrypt(stored.key), "sk-own-SECRET-0002");
  /* blank keeps the key, "clear" removes it */
  await call("PUT", "/api/ai/chat-models/:id", k.admin, { id: r.id }, { model: { key: "", name: "Own" } });
  assert.equal(readAI(db).chatModels.find(x => x.id === r.id).key, stored.key);
  let x = await call("PUT", "/api/ai/chat-models/:id", k.admin, { id: r.id }, { model: { key: "clear" } });
  assert.equal(x.models.find(e => e.id === r.id).keySet, false); assert.equal(readAI(db).chatModels.find(e => e.id === r.id).key, "");
  x = await call("PUT", "/api/ai/chat-models/:id", k.admin, { id: r.id }, { model: { key: "sk-own-SECRET-0002b" } });
  /* refused, each with what to do */
  const no = (model, re) => refused(() => k.call("POST", "/api/ai/chat-models", k.admin, {}, { model }), 400, re);
  await no(Object.assign({}, LUNA, { modelId: "" }), /model ID/);
  await no(Object.assign({}, LUNA, { modelId: "gpt 6 luna" }), /no spaces/);
  await no(Object.assign({}, LUNA, { endpoint: "" }), /endpoint/);
  await no(Object.assign({}, LUNA, { endpoint: "http://api.openai.com/v1/chat/completions" }), /https/);
  await no(Object.assign({}, LUNA, { endpoint: "not a url" }), /valid web address/);
  await no(Object.assign({}, LUNA, { endpoint: "https://user:pass@api.openai.com/v1" }), /user name or password/);
  await no(Object.assign({}, LUNA, { endpoint: GE.replace("{model}", "g") + "?key=AIzaSECRET" }), /cannot carry the key/);
  await no(Object.assign({}, LUNA, { format: "xml" }), /format is one of/);
  await no(Object.assign({}, LUNA, { tokenParam: "max_toks" }), /tokenParam is one of/);
  await no(Object.assign({}, LUNA, { reasoningEffort: "extreme" }), /reasoningEffort is one of/);
  await no(Object.assign({}, LUNA, { maxOutputTokens: "lots" }), /Max output tokens/);
  await no(Object.assign({}, LUNA, { temperature: "warm" }), /Temperature/);
  await no(Object.assign({}, LUNA, { extraParams: { model: "gpt-x" } }), /part of every request/);
  await no(Object.assign({}, LUNA, { extraParams: "{oops" }), /not valid JSON/);
  /* the workspace connection's provider, endpoint, model and key are the connection's: changed in Providers only */
  x = await call("PUT", "/api/ai/chat-models/:id", k.admin, { id: "cm_connection" }, { model: { name: "Main", modelId: "evil", endpoint: "https://evil.example/v1", key: "sk-evil-0000000000", provider: "custom", tokenParam: "max_tokens" } });
  const conn = x.models.find(e => e.id === "cm_connection");
  assert.equal(conn.name, "Main"); assert.equal(conn.modelId, "gpt-4o-mini"); assert.equal(conn.endpoint, OA); assert.equal(conn.tokenParam, "max_tokens");
  assert.equal(secrets.decrypt(readAI(db).chat.key), "sk-conn-SECRET-0001"); assert.equal(readAI(db).chat.model, "gpt-4o-mini");
  assert.equal(readAI(db).chat.lastCheck, undefined, "an advanced setting changed: the connection's earlier test says nothing about it");
  /* nothing that answers carries a key: the routes, the workspace as every page gets it, the list */
  answers.push(JSON.stringify(await k.call("GET", "/api/ai/chat-models", k.admin)));
  answers.push(JSON.stringify(sz.readWorkspace(db, WS).ai));
  for (const a of answers) for (const secret of ["sk-own-SECRET-0002", "sk-conn-SECRET-0001", "enc:v1:"]) assert.ok(!a.includes(secret), secret + " in " + a.slice(0, 120));
  /* a workspace save sends the list back masked: what is stored stays as it is, keys included */
  const ws = sz.readWorkspace(db, WS), saved = readAI(db).chatModels;
  ws.ai.chatModels = [{ id: "cm_forged", name: "Forged", modelId: "x", endpoint: "https://evil.example", key: "sk-forged" }]; ws.ai.chatUse = { intelligence: "cm_forged" };
  sz.writeWorkspace(db, WS, ws);
  assert.deepEqual(readAI(db).chatModels, saved); assert.equal(readAI(db).chatUse.intelligence, "cm_connection");
});

test("safeguards: one active model always; the workspace connection can leave the list and come back", async () => {
  const db = freshDb(); writeAI(db, { chat: CONN(), processing: { externalEnabled: true } });
  const k = boot(db);
  await refused(() => k.call("PUT", "/api/ai/chat-models/:id", k.admin, { id: "cm_connection" }, { model: { active: false } }), 400, /At least one chat model must stay active/);
  await refused(() => k.call("DELETE", "/api/ai/chat-models/:id", k.admin, { id: "cm_connection" }), 400, /at least one chat model/i);
  const luna = (await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: Object.assign({}, LUNA, { active: false }) })).id;
  await refused(() => k.call("DELETE", "/api/ai/chat-models/:id", k.admin, { id: "cm_connection" }), 400, /switch another one on first/);
  await k.call("PUT", "/api/ai/chat-models/:id", k.admin, { id: luna }, { model: { active: true } });
  let r = await k.call("DELETE", "/api/ai/chat-models/:id", k.admin, { id: "cm_connection" });
  assert.deepEqual(r.models.map(m => m.id), [luna]); assert.equal(r.use.intelligence, luna); assert.equal(r.fellBack.to.id, luna);
  await refused(() => k.call("PUT", "/api/ai/chat-models/:id", k.admin, { id: luna }, { model: { active: false } }), 400, /stay active/);
  await refused(() => k.call("DELETE", "/api/ai/chat-models/:id", k.admin, { id: luna }), 400, /Keep at least one/);
  await refused(() => k.call("PUT", "/api/ai/chat-models/:id", k.admin, { id: "cm_nothere00" }, { model: {} }), 404);
  /* the shared key still comes from the connection, which stays in Providers */
  assert.equal(k.aiConf("chat", "intelligence").key, "sk-conn-SECRET-0001");
  r = await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: { linked: true } });
  assert.equal(r.id, "cm_connection"); assert.equal(r.models.find(m => m.id === "cm_connection").linked, true);
  await refused(() => k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: { linked: true } }), 400, /already/);
  /* thirty at most */
  for (let i = r.models.length; i < 30; i++) await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: Object.assign({}, LUNA, { name: "M" + i }) });
  await refused(() => k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: LUNA }), 400, /30 chat models/);
});

test("only whoever manages the workspace's settings manages chat models; everyone else's page learns names and readiness", async () => {
  const db = freshDb(); writeAI(db, { chat: CONN(), processing: { externalEnabled: true } });
  const k = boot(db);
  assert.equal(can.manageWorkspace(k.member), false); assert.equal(can.manageWorkspace(k.admin), true);
  for (const [m, p, params] of [["GET", "/api/ai/chat-models"], ["POST", "/api/ai/chat-models"], ["PUT", "/api/ai/chat-models/:id", { id: "cm_connection" }], ["DELETE", "/api/ai/chat-models/:id", { id: "cm_connection" }], ["PUT", "/api/ai/chat-use"], ["POST", "/api/ai/chat-models/:id/test", { id: "cm_connection" }]])
    await refused(() => k.call(m, p, k.member, params, { model: LUNA, use: { scoring: "cm_connection" } }), 403);
  assert.equal(k.fetched.length, 0, "a refused test asks nothing");
  const pub = publicState(maskState(readAI(db)));
  assert.deepEqual(Object.keys(pub.models[0]).sort(), ["active", "id", "isDefault", "keyReady", "linked", "name", "usedFor"]);
  const src = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  assert.match(src, /if \(!can\.manageWorkspace\(u\) && w\.ai && Array\.isArray\(w\.ai\.chatModels\)\) w\.ai\.chatModels = require\("\.\/ai-chat-models"\)\.pure\.publicState/);
});

test("Test: a tiny prompt with the entry's own settings, its answer, and a hint with a fix that works", async () => {
  const db = freshDb(); writeAI(db, { chat: CONN(), processing: { externalEnabled: true } });
  const k = boot(db, { provider: (url, body, headers) => {
    if (/^gpt-6/.test(body.model) && "max_tokens" in body) throw new HttpError(424, "Chat provider error (400): Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.");
    if (body.model === "no-such-model") throw new HttpError(424, "Chat provider error (404): The model `no-such-model` does not exist. Key used: " + (headers.Authorization || "").replace("Bearer ", ""));
    return { choices: [{ message: { content: "ready\u0007 from " + body.model } }], usage: { prompt_tokens: 12, completion_tokens: 2 } };
  } });
  const luna = (await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: Object.assign({}, LUNA, { tokenParam: "max_tokens" }) })).id;
  let t = await k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: luna });
  assert.equal(t.ok, false); assert.equal(t.hint.code, "token_param"); assert.deepEqual(t.hint.fix, { tokenParam: "max_completion_tokens" });
  assert.equal(t.model, "gpt-6-luna"); assert.equal(t.format, "chat"); assert.equal(t.endpoint, OA); assert.ok(t.fields.includes("max_tokens")); assert.ok(!t.fields.includes("messages"), "what is sent, without the conversation");
  const sent = k.fetched[0]; assert.equal(sent.headers.Authorization, "Bearer sk-conn-SECRET-0001", "the key saved for the same host");
  assert.deepEqual(sent.body.messages[1], { role: "user", content: chatModels.pure.TEST_PROMPT });
  let list = maskState(readAI(db)).models; assert.equal(list.find(m => m.id === luna).lastCheck.ok, false);
  /* the fix, then again */
  await k.call("PUT", "/api/ai/chat-models/:id", k.admin, { id: luna }, { model: t.hint.fix });
  assert.equal(maskState(readAI(db)).models.find(m => m.id === luna).lastCheck, null, "a new setting: the old test result goes");
  t = await k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: luna });
  assert.equal(t.ok, true, t.error); assert.equal(t.sample, "ready from gpt-6-luna", "plain text, at most 120 characters"); assert.deepEqual(t.usage, { in: 12, out: 2 }); assert.equal(t.hint, null); assert.equal(t.error, null);
  assert.ok(t.fields.includes("max_completion_tokens") && !t.fields.includes("max_tokens")); assert.equal(typeof t.ms, "number"); assert.equal(t.by, "admin");
  assert.equal(maskState(readAI(db)).models.find(m => m.id === luna).lastCheck.ok, true);
  /* an unknown model: where to look; the key the provider repeated is not */
  const bad = (await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: Object.assign({}, LUNA, { modelId: "no-such-model", key: "sk-own-SECRET-0009" }) })).id;
  t = await k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: bad });
  assert.equal(t.hint.code, "model"); assert.deepEqual(t.hint.fix, { focus: "modelId" }); assert.ok(!t.error.includes("sk-own-SECRET-0009")); assert.match(t.error, /\[key\]/);
  assert.ok(!JSON.stringify(readAI(db)).includes("sk-own-SECRET-0009"), "nor in the stored test result");
  /* a host the server does not send keys to: refused before anything is sent, with what the server admin does */
  const n = k.fetched.length;
  const evil = (await k.call("POST", "/api/ai/chat-models", k.admin, {}, { model: Object.assign({}, LUNA, { endpoint: "https://llm.not-allowed.test/v1/chat/completions", key: "sk-x-000000000" }) })).id;
  t = await k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: evil });
  assert.equal(t.ok, false); assert.equal(t.hint.code, "host"); assert.equal(t.hint.vars.host, "llm.not-allowed.test"); assert.match(t.error, /COS_AI_ALLOWED_HOSTS/); assert.equal(k.fetched.length, n, "nothing sent");
  /* the workspace connection: the connection's own check, which Providers shows */
  t = await k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: "cm_connection" });
  assert.equal(t.ok, true); assert.equal(readAI(db).chat.lastCheck.ok, true); assert.equal(readAI(db).chat.lastCheck.model, "gpt-4o-mini");
  const conn = await k.mod.testConnection(k.admin); assert.equal(conn.ok, true); assert.equal(conn.model, "gpt-4o-mini");
  /* external processing off: nothing is sent */
  writeAI(db, Object.assign(readAI(db), { processing: { externalEnabled: false } }));
  t = await k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: luna });
  assert.equal(t.ok, false); assert.equal(t.hint.code, "external_off");
  assert.ok(k.logs.some(l => l[0] === "ai_chat_model_tested" && l[1].id === luna && !JSON.stringify(l[1]).includes("SECRET")));
});

test("ten tests a minute per person, then 429", async () => {
  const db = freshDb(); writeAI(db, { chat: CONN(), processing: { externalEnabled: true } });
  const k = boot(db);
  for (let i = 0; i < chatModels.pure.TEST_PER_MINUTE; i++) assert.equal((await k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: "cm_connection" })).ok, true);
  await refused(() => k.call("POST", "/api/ai/chat-models/:id/test", k.admin, { id: "cm_connection" }), 429, /Ten tests a minute/);
  assert.equal(k.fetched.length, chatModels.pure.TEST_PER_MINUTE);
});

/* ---------- on the real server, with a stand-in provider ---------- */

test("on the real server: the migration, the purposes, Smart Scoring, Test and its hints, and no key in any answer", { timeout: 120000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zencrevia-chat-models-"));
  const log = path.join(dir, "provider.log");
  const child = spawn(process.execPath, ["--no-warnings", "-r", path.join(__dirname, "fake-chat-provider.js"), "server/server.js"], { cwd: root, env: Object.assign({}, process.env, {
    NODE_ENV: "production", PORT: "0", COS_DATA_DIR: dir, COS_ADMIN_PASSWORD: "Chat!Admin234567", COS_ADMIN_EMAIL: "admin@zencrevia.demo", COS_DEMO_PASSWORD: "Chat!Member234567",
    COS_SECRET_KEY: "chat-secret-key-longer-than-32-characters!!", COS_BACKUP_KEY: "chat-backup-key-longer-than-32-characters!!", COS_SEED_DEMO: "1", COS_BACKUP_INTERVAL_HOURS: "0", COS_SCORING: "",
    COS_AI_ALLOWED_HOSTS: "llm.fake-provider.test", FAKE_CHAT_LOG: log }) });
  let out = ""; child.stdout.on("data", x => { out += x; }); child.stderr.on("data", x => { out += x; });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once("exit", r)); } fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 20000); const look = () => { const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }; child.stdout.on("data", look); child.once("exit", c => { clearTimeout(tm); rej(new Error("exit " + c + out)); }); });
  const base = "http://127.0.0.1:" + port, texts = [];
  const req = async (m, p, b, c) => { const r = await fetch(base + p, { method: m, headers: Object.assign({ "content-type": "application/json", origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) }); const text = await r.text(); texts.push(text); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ } return { status: r.status, json, text }; };
  const login = async (email, password) => { const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email, password }) }); assert.equal(r.status, 200); return r.headers.get("set-cookie").split(";")[0]; };
  const asked = () => fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
  const admin = await login("admin@zencrevia.demo", "Chat!Admin234567");
  const member = await login("sarah@zencrevia.demo", "Chat!Member234567");

  /* migrated at start-up: the connection is the list's first entry, used for everything */
  let ws = (await req("GET", "/api/bootstrap", undefined, admin)).json.ws;
  assert.equal(ws.ai.chatModels.length, 1); assert.equal(ws.ai.chatModels[0].id, "cm_connection"); assert.equal(ws.ai.chatUse.intelligence, "cm_connection");
  /* the connection, as Settings → AI → Providers saves it */
  ws.ai = Object.assign({}, ws.ai, { chat: { provider: "openai", endpoint: OA, model: "gpt-4o-mini", key: "sk-conn-SECRET-0001", systemExtra: "" } });
  let r = await req("PUT", "/api/workspace", ws, admin); assert.equal(r.status, 200, r.text);
  const ask = async (purpose, cookie) => { const x = await req("POST", "/api/ai/chat", Object.assign({ messages: [{ role: "user", content: "hello" }] }, purpose === undefined ? {} : { purpose }), cookie || admin); assert.equal(x.status, 200, x.text); return x.json.text; };
  assert.equal(await ask("intelligence"), "ready from gpt-4o-mini");
  assert.deepEqual(asked().pop().fields.sort(), ["max_tokens", "messages", "model"], "auto: exactly as before");

  /* GPT-6 Luna from a preset, the key left blank: the connection's, same host */
  r = await req("POST", "/api/ai/chat-models", { model: Object.assign({}, LUNA, { tokenParam: "max_tokens" }) }, admin); assert.equal(r.status, 200, r.text);
  const luna = r.json.id; assert.equal(r.json.models.find(m => m.id === luna).keySource, "connection");
  r = await req("POST", "/api/ai/chat-models/" + luna + "/test", {}, admin);
  assert.equal(r.json.ok, false); assert.equal(r.json.hint.code, "token_param"); assert.deepEqual(r.json.hint.fix, { tokenParam: "max_completion_tokens" });
  r = await req("PUT", "/api/ai/chat-models/" + luna, { model: r.json.hint.fix }, admin); assert.equal(r.status, 200);
  r = await req("POST", "/api/ai/chat-models/" + luna + "/test", {}, admin);
  assert.equal(r.json.ok, true, r.text); assert.equal(r.json.sample, "ready from gpt-6-luna"); assert.deepEqual(r.json.usage, { in: 12, out: 2 }); assert.ok(r.json.fields.includes("max_completion_tokens"));
  assert.equal(asked().pop().key, "sk-conn-SECRET-0001");
  /* a host of the server's own allowlist (COS_AI_ALLOWED_HOSTS), with its own key; and one that is not on it */
  r = await req("POST", "/api/ai/chat-models", { model: { name: "Own LLM", provider: "custom", modelId: "own-1", endpoint: "https://llm.fake-provider.test/v1", key: "sk-own-SECRET-0002" } }, admin);
  const own = r.json.id; assert.equal(r.json.models.find(m => m.id === own).hostAllowed, true);
  r = await req("POST", "/api/ai/chat-models/" + own + "/test", {}, admin); assert.equal(r.json.ok, true, r.text);
  assert.deepEqual(asked().pop(), { url: "https://llm.fake-provider.test/v1/chat/completions", model: "own-1", fields: ["model", "messages", "max_tokens"], key: "sk-own-SECRET-0002", system: "You are a connection test for ZenCrevia. Answer in one word." });
  r = await req("POST", "/api/ai/chat-models", { model: { name: "Elsewhere", provider: "custom", modelId: "x-1", endpoint: "https://llm.not-allowed.test/v1/chat/completions", key: "sk-else-SECRET-0004" } }, admin);
  const elsewhere = r.json.id; assert.equal(r.json.models.find(m => m.id === elsewhere).hostAllowed, false);
  const before = asked().length;
  r = await req("POST", "/api/ai/chat-models/" + elsewhere + "/test", {}, admin);
  assert.equal(r.json.ok, false); assert.equal(r.json.hint.code, "host"); assert.match(r.json.error, /COS_AI_ALLOWED_HOSTS/); assert.equal(asked().length, before, "nothing sent");
  /* an unknown model: the hint, and the key the provider repeated is not shown */
  r = await req("POST", "/api/ai/chat-models", { model: { name: "Typo", provider: "openai", modelId: "no-such-model", endpoint: OA, key: "sk-typo-SECRET-0005" } }, admin);
  r = await req("POST", "/api/ai/chat-models/" + r.json.id + "/test", {}, admin);
  assert.equal(r.json.hint.code, "model"); assert.match(r.json.error, /\[key\]/);

  /* which model does what: the page sends a purpose, the server picks */
  r = await req("PUT", "/api/ai/chat-use", { use: { scoring: luna, report: own } }, admin); assert.equal(r.status, 200, r.text);
  assert.equal(await ask("scoring"), "ready from gpt-6-luna");
  assert.equal(await ask("report"), "ready from own-1");
  assert.equal(await ask("brief"), "ready from gpt-4o-mini");
  assert.equal(await ask("bogus"), "ready from gpt-4o-mini");
  assert.equal(await ask(undefined), "ready from gpt-4o-mini");
  assert.equal(await ask({ id: luna }), "ready from gpt-4o-mini", "an object is no purpose");
  assert.equal(await ask("scoring", member), "ready from gpt-6-luna", "anyone who may use AI gets the model the admin chose");
  /* Smart Scoring's AI suggestions: its own model */
  const cur = (await req("GET", "/api/scoring/settings", undefined, admin)).json.settings;
  r = await req("PUT", "/api/scoring/settings", { settings: Object.assign({}, cur, { enabled: true }), configVersion: cur.configVersion }, admin); assert.equal(r.status, 200, r.text);
  const task = (await req("POST", "/api/tasks", { title: "Feed post Ramadan", status: "todo", prio: "medium", assignee: "sarah", assignees: ["sarah"], team: "design", assetCount: 5, effort: 0 }, admin)).json;
  r = await req("POST", "/api/tasks/" + task.id + "/scoring/ai", { module: "hours" }, admin);
  assert.equal(r.status, 200, r.text); assert.equal(r.json.aiResult.status, "ok"); assert.equal(r.json.aiResult.model, "gpt-6-luna");
  assert.match(asked().pop().system, /You estimate creative production work/);
  /* Providers → Test connection tests the connection itself, whichever model AI Intelligence uses */
  r = await req("PUT", "/api/ai/chat-use", { use: { intelligence: own } }, admin); assert.equal(r.status, 200);
  assert.equal(await ask("intelligence"), "ready from own-1");
  r = await req("POST", "/api/ai/test", { kind: "chat" }, admin); assert.equal(r.json.ok, true, r.text); assert.equal(r.json.sample, "ready from gpt-4o-mini");
  /* removed while in use: what it did falls back to the AI Intelligence model, and the answer says so */
  r = await req("DELETE", "/api/ai/chat-models/" + luna, undefined, admin);
  assert.deepEqual(r.json.fellBack.purposes, ["scoring"]); assert.equal(r.json.fellBack.to.id, own);
  assert.equal(await ask("scoring"), "ready from own-1");

  /* permissions: someone who does not manage the settings */
  for (const [m, p] of [["GET", "/api/ai/chat-models"], ["POST", "/api/ai/chat-models"], ["PUT", "/api/ai/chat-use"], ["POST", "/api/ai/chat-models/" + own + "/test"], ["DELETE", "/api/ai/chat-models/" + own]]) assert.equal((await req(m, p, m === "GET" || m === "DELETE" ? undefined : { model: LUNA, use: {} }, member)).status, 403, m + " " + p);
  const mine = (await req("GET", "/api/bootstrap", undefined, member)).json.ws.ai;
  assert.ok(mine.chatModels.every(m => !("endpoint" in m) && !("modelId" in m) && !("notes" in m)), "names and readiness only");
  /* the keys: encrypted where they are kept, and in no answer at all */
  ws = (await req("GET", "/api/bootstrap", undefined, admin)).json.ws;
  const db = new DatabaseSync(path.join(dir, "creative-os.db"));
  const ai = JSON.parse(db.prepare("SELECT ai_settings FROM workspaces").get().ai_settings); db.close();
  assert.ok(ai.chatModels.filter(m => m.key).every(m => /^enc:v1:/.test(m.key))); assert.match(ai.chat.key, /^enc:v1:/);
  for (const text of texts) for (const secret of ["sk-conn-SECRET-0001", "sk-own-SECRET-0002", "sk-else-SECRET-0004", "sk-typo-SECRET-0005", "enc:v1:"]) assert.ok(!text.includes(secret), secret + " in an answer: " + text.slice(0, 160));
  const security = fs.readFileSync(path.join(dir, "security.log"), "utf8");
  for (const secret of ["sk-conn-SECRET-0001", "sk-own-SECRET-0002", "sk-typo-SECRET-0005"]) assert.ok(!security.includes(secret), secret + " in the security log");
});
