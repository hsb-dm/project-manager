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
   ============================================================ */
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
const isAzure = host => /\.(openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)$/.test(host);
/* o-series and GPT-5 think before they answer: they need the newer token field and room to think, or the
   visible answer comes back empty */
const isReasoning = model => /^(o[1-9]|gpt-5)/i.test(String(model || ""));

/* c: { provider, endpoint, key, model }; system: the instructions; msgs: [{ role: user|assistant, content }] */
function chatRequest(c, system, msgs) {
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
    /* Azure OpenAI takes the key as api-key; everyone else as a bearer token */
    if (isAzure(host)) headers["api-key"] = c.key; else headers["Authorization"] = "Bearer " + c.key;
    if (isResponsesEndpoint(endpoint)) {
      kind = "responses";
      body = { model: c.model, instructions: system, input: msgs.map(m => ({ role: m.role, content: m.content })), max_output_tokens: isReasoning(c.model) ? 4000 : 1500 };
    } else {
      /* 500 tokens cut summaries off mid-sentence once attachments made longer answers worth asking for */
      kind = "chat"; endpoint = chatCompletionsUrl(endpoint);
      body = { model: c.model, messages: [{ role: "system", content: system }].concat(msgs) };
      body[isReasoning(c.model) ? "max_completion_tokens" : "max_tokens"] = isReasoning(c.model) ? 4000 : 1500;
    }
  }
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

/* The hosts the server sends a workspace's AI key to: the providers people use, any Azure OpenAI resource, and
   whatever the server's COS_AI_ALLOWED_HOSTS adds. Nothing else — an admin cannot point the key at any address. */
const AI_HOSTS = ["api.anthropic.com", "generativelanguage.googleapis.com", "api.openai.com", "ai.sumopod.com", "openrouter.ai",
  "api.groq.com", "api.deepseek.com", "api.mistral.ai", "api.together.xyz", "api.x.ai", "api.perplexity.ai", "api.fireworks.ai",
  "api.cerebras.ai", "api.moonshot.ai", "api.cohere.com", "api.magnific.ai", "api.magnific.com", "api.freepik.com"];
function allowedAIHost(hostname, extra) { const h = String(hostname || "").toLowerCase(); return AI_HOSTS.includes(h) || isAzure(h) || (extra || []).includes(h); }

module.exports = { chatRequest, chatText, isResponsesEndpoint, chatCompletionsUrl, allowedAIHost, AI_HOSTS };
