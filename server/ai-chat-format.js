"use strict";
/* ============================================================
   AI INTELLIGENCE: THE REQUEST AND THE REPLY, PER PROVIDER
   Anthropic (Messages API), Google Gemini (generateContent), and everything OpenAI-style: Chat Completions
   (/v1/chat/completions — OpenAI, SumoPod, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Azure OpenAI,
   Gemini's and others' OpenAI-compatible endpoints) and OpenAI's Responses API (/v1/responses).
   The endpoint decides the shape, not the provider picked in Settings (a provider left on "Anthropic" with an
   OpenRouter URL is OpenRouter). A path ending in /responses is sent as Responses — instructions + input, the
   answer in output[].content[]; it used to go as Chat Completions and OpenAI answered 400 "Unsupported
   parameter: 'messages'". A base URL with no path (…/v1, …/openai/v1, …/api/v1) gets /chat/completions.

   A chat model from Settings → AI → Models → Chat models (Oct 2026, server/ai-chat-models.js) can say more than the
   endpoint does: its format, the token field it takes, how many output tokens, a reasoning effort, a temperature and
   extra body parameters (shared/ai-chat-models.js). Each one left on "auto" (or blank) is what is detected here, as it
   always was; one set explicitly wins. chatRequest(c, system, msgs, entry) — entry, or else c.entry, else nothing.
   ============================================================ */
const chatModels = require("../shared/ai-chat-models");
const parse = s => { try { return new URL(String(s)); } catch (e) { return null; } };
function isResponsesEndpoint(endpoint) { const u = parse(endpoint); return !!u && /\/responses\/?$/.test(u.pathname); }
/* a base URL people paste from a provider's docs: complete it with the Chat Completions path */
function chatCompletionsUrl(endpoint) {
  const u = parse(endpoint); if (!u) return endpoint;
  const p = u.pathname.replace(/\/+$/, "");
  if (/\/(chat\/completions|completions|responses|messages)$/.test(p) || /:(generateContent|streamGenerateContent)$/.test(p)) return endpoint;
  if (p === "") { u.pathname = "/v1/chat/completions"; return u.toString(); }
  if (/\/v\d+([a-z]+\d*)?$/.test(p) || /\/(openai|api|compatibility\/v\d+)$/.test(p)) { u.pathname = p + "/chat/completions"; return u.toString(); }
  return endpoint;
}
/* a format chosen explicitly: the endpoint is completed for it — a base URL gets the format's own path, and the other
   OpenAI path is swapped (Chat Completions ↔ Responses) so the shape and the address agree */
function explicitUrl(endpoint, format) {
  const u = parse(endpoint); if (!u) return endpoint;
  const p = u.pathname.replace(/\/+$/, ""), base = p === "" ? "/v1" : p;
  const isBase = p === "" || /\/v\d+([a-z]+\d*)?$/.test(p) || /\/(openai|api|compatibility\/v\d+)$/.test(p);
  if (format === "chat_completions") {
    if (/\/responses$/.test(p)) { u.pathname = p.replace(/\/responses$/, "/chat/completions"); return u.toString(); }
    return chatCompletionsUrl(endpoint);
  }
  if (format === "responses") {
    if (/\/responses$/.test(p)) return endpoint;
    if (/\/chat\/completions$/.test(p)) { u.pathname = p.replace(/\/chat\/completions$/, "/responses"); return u.toString(); }
    if (isBase) { u.pathname = base + "/responses"; return u.toString(); }
    return endpoint;
  }
  if (format === "anthropic") {
    if (/\/messages$/.test(p)) return endpoint;
    if (p === "" || /\/v\d+$/.test(p)) { u.pathname = base + "/messages"; return u.toString(); }
    return endpoint;
  }
  if (format === "gemini") {
    if (/:(generateContent|streamGenerateContent)$/.test(p)) return endpoint;
    if (p === "" || /\/v\d+(beta|alpha)?\d*$/.test(p)) return u.origin + (p === "" ? "/v1beta" : p) + "/models/{model}:generateContent" + u.search;
    return endpoint;
  }
  return endpoint;
}
const isAzure = host => /\.(openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)$/.test(host);
/* o-series, GPT-5 and every GPT after it (GPT-6 Astra, Sol, Luna — Oct 2026) think before they answer: they need the
   newer token field and room to think, or the official API refuses max_tokens / the visible answer comes back empty */
const isReasoning = model => /^(o[1-9]|gpt-([5-9]|[1-9]\d))/i.test(String(model || ""));
/* the shape the endpoint (and, without a URL, the provider) says — what "auto" has always meant */
function detectFormat(c) {
  const u = parse(c.endpoint), host = u ? u.hostname.toLowerCase() : "", path = u ? u.pathname : "";
  const openaiShape = /\/(chat\/completions|completions|responses)\/?$/.test(path) || /\/openai(\/|$)/.test(path);
  if (!openaiShape && (host === "api.anthropic.com" || (!u && c.provider === "anthropic") || (c.provider === "anthropic" && /\/messages\/?$/.test(path)))) return "anthropic";
  if (!openaiShape && (host === "generativelanguage.googleapis.com" || (!u && c.provider === "gemini"))) return "gemini";
  return isResponsesEndpoint(c.endpoint) ? "responses" : "chat_completions";
}
const KIND = { chat_completions: "chat", responses: "responses", anthropic: "anthropic", gemini: "gemini" };
const isPlain = v => !!v && typeof v === "object" && !Array.isArray(v);
/* extra parameters, last: plain objects merged into what is there, a top-level null removes a field; never a key the
   request is made of, never one that reaches a prototype */
function mergeExtra(body, extra) {
  const deep = (into, from) => {
    Object.keys(from).forEach(k => {
      if (k === "__proto__" || k === "constructor" || k === "prototype") return;
      const v = from[k];
      if (isPlain(v) && isPlain(into[k])) { into[k] = Object.assign({}, into[k]); deep(into[k], v); } else into[k] = isPlain(v) || Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : v;
    });
  };
  Object.keys(extra || {}).forEach(k => {
    if (chatModels.PROTECTED.indexOf(k) >= 0 || k === "__proto__" || k === "constructor" || k === "prototype") return;
    if (extra[k] === null) { delete body[k]; return; }
    const one = {}; one[k] = extra[k]; deep(body, one);
  });
  return body;
}

/* c: { provider, endpoint, key, model, entry? }; system: the instructions; msgs: [{ role: user|assistant, content }];
   entry: a chat model's settings (format, tokenParam, maxOutputTokens, reasoningEffort, temperature, extraParams) */
function chatRequest(c, system, msgs, entry) {
  const e = chatModels.normalizeAdvanced(entry || c.entry || null);
  const format = e.format === "auto" ? detectFormat(c) : e.format, kind = KIND[format];
  const u = parse(c.endpoint), host = u ? u.hostname.toLowerCase() : "";
  /* room to think: a model the name says is a reasoning one, or one an admin says takes the newer field or an effort */
  const explicitThinking = e.tokenParam === "max_completion_tokens" || ["low", "medium", "high"].indexOf(e.reasoningEffort) >= 0;
  const thinking = isReasoning(c.model) || explicitThinking;
  const headers = { "Content-Type": "application/json" };
  let body, endpoint = e.format === "auto" ? c.endpoint : explicitUrl(c.endpoint, format);
  if (kind === "anthropic") {
    endpoint = endpoint || "https://api.anthropic.com/v1/messages"; headers["x-api-key"] = c.key; headers["anthropic-version"] = "2023-06-01";
    /* Anthropic always takes max_tokens */
    body = { model: c.model || "claude-sonnet-4-6", max_tokens: e.maxOutputTokens || (explicitThinking ? 4000 : 1500), system, messages: msgs };
    if (e.temperature !== null) body.temperature = e.temperature;
  } else if (kind === "gemini") {
    endpoint = (endpoint || "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent").replace("{model}", encodeURIComponent(c.model || "gemini-3.5-flash")).replace("%7Bmodel%7D", encodeURIComponent(c.model || "gemini-3.5-flash"));
    headers["x-goog-api-key"] = c.key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) };
    /* Gemini's own field, only when an admin set a number, a token field or a temperature (it was never sent before) */
    const gc = {};
    if (e.maxOutputTokens || e.tokenParam !== "auto") gc.maxOutputTokens = e.maxOutputTokens || (thinking ? 4000 : 1500);
    if (e.temperature !== null) gc.temperature = e.temperature;
    if (Object.keys(gc).length) body.generationConfig = gc;
  } else {
    /* Azure OpenAI takes the key as api-key; everyone else as a bearer token */
    if (isAzure(host)) headers["api-key"] = c.key; else headers["Authorization"] = "Bearer " + c.key;
    const tokens = e.maxOutputTokens || (thinking ? 4000 : 1500);
    if (kind === "responses") {
      body = { model: c.model, instructions: system, input: msgs.map(m => ({ role: m.role, content: m.content })) };
      body[e.tokenParam === "auto" ? "max_output_tokens" : e.tokenParam] = tokens;
      if (e.reasoningEffort !== "auto") body.reasoning = { effort: e.reasoningEffort };
    } else {
      /* 500 tokens cut summaries off mid-sentence once attachments made longer answers worth asking for */
      endpoint = chatCompletionsUrl(endpoint);
      body = { model: c.model, messages: [{ role: "system", content: system }].concat(msgs) };
      body[e.tokenParam === "auto" ? (isReasoning(c.model) ? "max_completion_tokens" : "max_tokens") : e.tokenParam] = tokens;
      if (e.reasoningEffort !== "auto") body.reasoning_effort = e.reasoningEffort;
    }
    /* never a default: a temperature goes only where an admin wrote one (reasoning models refuse it) */
    if (e.temperature !== null) body.temperature = e.temperature;
  }
  mergeExtra(body, e.extraParams);
  return { kind, endpoint, headers, body };
}

/* the answer's text, whichever shape it came back in ("" when there is none) */
function chatText(kind, j) {
  j = j || {};
  if (kind === "gemini") return (j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).map(p => p.text || "").join("")) || "";
  if (kind === "responses" || Array.isArray(j.output)) {
    const out = Array.isArray(j.output) ? j.output.filter(o => o && o.type === "message").map(o => (o.content || []).filter(x => x && (x.type === "output_text" || x.type === "text")).map(x => x.text || "").join("")).join("\n") : "";
    if (out || kind === "responses") return out || (typeof j.output_text === "string" ? j.output_text : "");
  }
  const direct = typeof j.content === "string" ? j.content : Array.isArray(j.content) ? j.content.filter(x => x && x.type === "text").map(x => x.text || "").join("\n") : "";
  const choice = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return direct || (typeof choice === "string" ? choice : Array.isArray(choice) ? choice.map(x => x && (x.text || x.content || "")).join("") : "");
}

/* The tokens a reply cost, where the provider says (Oct 2026, Smart Scoring's cost log, server/scoring-ai.js):
   { in, out } — whole numbers, null when the provider did not give one. Anthropic usage.input_tokens / output_tokens,
   Gemini usageMetadata.promptTokenCount / candidatesTokenCount (+ thoughtsTokenCount, which is billed as output),
   Responses usage.input_tokens / output_tokens, Chat Completions usage.prompt_tokens / completion_tokens; a reply of
   another shape is read by whichever of those names it carries. */
function chatUsage(kind, j) {
  j = j || {};
  const n = v => { const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v; return typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x) : null; };
  const sum = (a, b) => (a === null && b === null ? null : (a || 0) + (b || 0));
  const g = j.usageMetadata, u = j.usage && typeof j.usage === "object" ? j.usage : null;
  if ((kind === "gemini" || !u) && g && typeof g === "object") return { in: n(g.promptTokenCount), out: sum(n(g.candidatesTokenCount), n(g.thoughtsTokenCount)) };
  if (!u) return { in: null, out: null };
  const first = (...ks) => { for (const k of ks) { const v = n(u[k]); if (v !== null) return v; } return null; };
  if (kind === "chat") return { in: first("prompt_tokens", "input_tokens"), out: first("completion_tokens", "output_tokens") };
  return { in: first("input_tokens", "prompt_tokens"), out: first("output_tokens", "completion_tokens") };
}

/* The hosts the server sends a workspace's AI key to: the providers people use, any Azure OpenAI resource, and
   whatever the server's COS_AI_ALLOWED_HOSTS adds. Nothing else — an admin cannot point the key at any address. */
const AI_HOSTS = ["api.anthropic.com", "generativelanguage.googleapis.com", "api.openai.com", "ai.sumopod.com", "openrouter.ai",
  "api.groq.com", "api.deepseek.com", "api.mistral.ai", "api.together.xyz", "api.x.ai", "api.perplexity.ai", "api.fireworks.ai",
  "api.cerebras.ai", "api.moonshot.ai", "api.cohere.com", "api.magnific.ai", "api.magnific.com", "api.freepik.com"];
function allowedAIHost(hostname, extra) { const h = String(hostname || "").toLowerCase(); return AI_HOSTS.includes(h) || isAzure(h) || (extra || []).includes(h); }

module.exports = { chatRequest, chatText, chatUsage, isResponsesEndpoint, chatCompletionsUrl, explicitUrl, detectFormat, isReasoning, allowedAIHost, AI_HOSTS };
