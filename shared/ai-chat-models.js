/* CHAT MODELS — THE SHAPE THE SERVER AND THE PAGE SHARE (Oct 2026). server/ai-chat-models.js, src/ai-chat-models.js

   An admin plugs in another chat model from Settings → AI → Models → Chat models without anyone writing code: a
   provider preset fills the endpoint and the request format, the admin types the model ID, and anything the preset
   cannot know (which token field the model takes, how many output tokens, a reasoning effort, a temperature, extra
   body parameters) is an "Advanced" setting. "auto" everywhere keeps the detection server/ai-chat-format.js has always
   done, so a workspace that never touches it sends exactly what it sent before.

   Here: the presets, the allowed values, the limits, normalizeAdvanced(entry) (what a request may take from an entry,
   unknown values back to auto) and checkExtraParams(value) (extra body parameters: a plain JSON object, small, never
   overriding what the request itself is made of — the model, the messages, the instructions, streaming, tools).
   Used by server/ai-chat-format.js, server/ai-chat-models.js and, inlined by build.js, the page (window.AiChatModels),
   so the editor validates extra parameters as they are typed with the very rules the server applies. */
(function(root){
"use strict";
const FORMATS = ["auto", "chat_completions", "responses", "anthropic", "gemini"];
const TOKEN_PARAMS = ["auto", "max_tokens", "max_completion_tokens", "max_output_tokens"];
const EFFORTS = ["auto", "none", "minimal", "low", "medium", "high"];
/* what a chat request is for; anything else is the AI Intelligence model */
const PURPOSES = ["intelligence", "scoring", "estimate", "brief", "report"];
const LIMITS = Object.freeze({ entries: 30, name: 80, modelId: 200, endpoint: 500, notes: 500, key: 4000, tokensMin: 64, tokensMax: 128000, tempMin: 0, tempMax: 2, extraChars: 4000, extraDepth: 6, extraKeys: 60 });
/* the keys a request is made of: extra parameters never set them */
const PROTECTED = ["model", "messages", "input", "instructions", "stream", "stream_options", "tools", "tool_choice", "functions", "function_call", "system", "systemInstruction", "contents"];
const UNSAFE = ["__proto__", "constructor", "prototype"];
/* kind: what server/ai-chat-format.js reads as the provider (anthropic, gemini, everything OpenAI-style, custom) */
const PRESETS = [
  { id: "openai", name: "OpenAI", kind: "openai", endpoint: "https://api.openai.com/v1/chat/completions", format: "chat_completions", model: "gpt-6-luna", key: "sk-…" },
  { id: "openai_responses", name: "OpenAI — Responses API", kind: "openai", endpoint: "https://api.openai.com/v1/responses", format: "responses", model: "gpt-6-luna", key: "sk-…" },
  { id: "anthropic", name: "Anthropic (Claude)", kind: "anthropic", endpoint: "https://api.anthropic.com/v1/messages", format: "anthropic", model: "claude-sonnet-4-6", key: "sk-ant-…" },
  { id: "gemini", name: "Google Gemini", kind: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", format: "gemini", model: "gemini-3.5-flash", key: "AIza…" },
  { id: "openrouter", name: "OpenRouter", kind: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions", format: "chat_completions", model: "anthropic/claude-sonnet-4.6", key: "sk-or-…" },
  { id: "groq", name: "Groq", kind: "openai", endpoint: "https://api.groq.com/openai/v1/chat/completions", format: "chat_completions", model: "llama-3.3-70b-versatile", key: "gsk_…" },
  { id: "deepseek", name: "DeepSeek", kind: "openai", endpoint: "https://api.deepseek.com/chat/completions", format: "chat_completions", model: "deepseek-chat", key: "sk-…" },
  { id: "mistral", name: "Mistral", kind: "openai", endpoint: "https://api.mistral.ai/v1/chat/completions", format: "chat_completions", model: "mistral-large-latest", key: "…" },
  { id: "xai", name: "xAI (Grok)", kind: "openai", endpoint: "https://api.x.ai/v1/chat/completions", format: "chat_completions", model: "grok-4", key: "xai-…" },
  { id: "together", name: "Together AI", kind: "openai", endpoint: "https://api.together.xyz/v1/chat/completions", format: "chat_completions", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", key: "…" },
  { id: "azure", name: "Azure OpenAI", kind: "openai", endpoint: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT/chat/completions?api-version=2024-10-21", format: "chat_completions", model: "your-deployment", key: "…" },
  { id: "sumopod", name: "SumoPod", kind: "openai", endpoint: "https://ai.sumopod.com/v1/chat/completions", format: "chat_completions", model: "gpt-5-mini", key: "sk-…" },
  { id: "custom", name: "Custom", kind: "custom", endpoint: "", format: "auto", model: "", key: "…" }
];
const presetById = id => PRESETS.find(p => p.id === id) || null;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const num = v => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

/* what a request takes from an entry; a missing or unknown value is auto, a number is held to its range */
function normalizeAdvanced(e) {
  e = isObj(e) ? e : {};
  const pick = (v, list) => (list.indexOf(v) >= 0 ? v : "auto");
  const t = num(e.maxOutputTokens), temp = num(e.temperature);
  const extra = checkExtraParams(e.extraParams);
  return {
    format: pick(e.format, FORMATS),
    tokenParam: pick(e.tokenParam, TOKEN_PARAMS),
    maxOutputTokens: e.maxOutputTokens == null || e.maxOutputTokens === "" || e.maxOutputTokens === "auto" || !Number.isFinite(t) ? null : Math.max(LIMITS.tokensMin, Math.min(LIMITS.tokensMax, Math.round(t))),
    reasoningEffort: pick(e.reasoningEffort, EFFORTS),
    temperature: e.temperature == null || e.temperature === "" || !Number.isFinite(temp) ? null : Math.round(Math.max(LIMITS.tempMin, Math.min(LIMITS.tempMax, temp)) * 100) / 100,
    extraParams: extra.ok ? extra.value : {}
  };
}

/* Extra body parameters: blank, or a plain JSON object of at most LIMITS.extraChars characters, LIMITS.extraDepth deep
   and LIMITS.extraKeys keys in all, with no protected key at its top and no key that reaches an object's prototype.
   A top-level null removes that field from the request (a provider that refuses one the request would send).
   → {ok: true, value} or {ok: false, code, key?, error} — code: invalid_json, not_object, too_large, too_deep,
   too_many, protected, unsafe_key, bad_value. */
function checkExtraParams(value) {
  const fail = (code, error, key) => ({ ok: false, code, key: key || null, error });
  let v = value;
  if (v == null) return { ok: true, value: {} };
  if (typeof v === "string") {
    const s = v.trim(); if (!s) return { ok: true, value: {} };
    if (s.length > LIMITS.extraChars) return fail("too_large", "Extra parameters are longer than " + LIMITS.extraChars + " characters.");
    try { v = JSON.parse(s); } catch (e) { return fail("invalid_json", "Extra parameters are not valid JSON."); }
  }
  if (!isObj(v)) return fail("not_object", "Extra parameters must be a JSON object, like {\"top_p\": 0.9}.");
  let keys = 0, bad = null;
  const walk = (x, depth) => {
    if (bad) return;
    if (depth > LIMITS.extraDepth) { bad = fail("too_deep", "Extra parameters are nested more than " + LIMITS.extraDepth + " levels deep."); return; }
    if (Array.isArray(x)) { x.forEach(y => walk(y, depth + 1)); return; }
    if (isObj(x)) {
      Object.keys(x).forEach(k => {
        if (bad) return;
        if (UNSAFE.indexOf(k) >= 0) { bad = fail("unsafe_key", "Extra parameters cannot use the key \"" + k + "\".", k); return; }
        if (++keys > LIMITS.extraKeys) { bad = fail("too_many", "Extra parameters have more than " + LIMITS.extraKeys + " keys."); return; }
        walk(x[k], depth + 1);
      });
      return;
    }
    if (x === null || typeof x === "string" || typeof x === "boolean" || (typeof x === "number" && Number.isFinite(x))) return;
    bad = fail("bad_value", "Extra parameters hold only JSON values.");
  };
  walk(v, 1);
  if (bad) return bad;
  const hit = Object.keys(v).find(k => PROTECTED.indexOf(k) >= 0);
  if (hit) return fail("protected", "\"" + hit + "\" is part of every request and cannot be set in extra parameters.", hit);
  const clean = JSON.parse(JSON.stringify(v));
  if (JSON.stringify(clean).length > LIMITS.extraChars) return fail("too_large", "Extra parameters are longer than " + LIMITS.extraChars + " characters.");
  return { ok: true, value: clean };
}

const api = { FORMATS, TOKEN_PARAMS, EFFORTS, PURPOSES, LIMITS, PROTECTED, PRESETS, presetById, normalizeAdvanced, checkExtraParams };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.AiChatModels = api;
})(typeof window !== "undefined" ? window : this);
