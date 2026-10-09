/* AI Intelligence speaks each provider's own shape. OpenAI's Responses API (/v1/responses) takes instructions and
   input, not messages — sent as Chat Completions it answered 400 "Unsupported parameter: 'messages'. In the
   Responses API, this parameter has moved to 'input'". Its answer is read from output[].content[]. Chat Completions,
   Anthropic and Gemini are as they were. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { chatRequest, chatText, isResponsesEndpoint } = require("../server/ai-chat-format.js");
const msgs = [{ role: "user", content: "Apa yang terlambat?" }, { role: "assistant", content: "T-101." }, { role: "user", content: "Dan minggu ini?" }];

test("an endpoint ending in /responses is OpenAI's Responses API", () => {
  for (const ep of ["https://api.openai.com/v1/responses", "https://api.openai.com/v1/responses/", "https://ai.sumopod.com/v1/responses"]) assert.equal(isResponsesEndpoint(ep), true, ep);
  for (const ep of ["https://api.openai.com/v1/chat/completions", "https://api.openai.com/v1/responses/abc", "not a url", ""]) assert.equal(isResponsesEndpoint(ep), false, ep);
});

test("Responses: instructions and input, never messages; the answer read from output", () => {
  const r = chatRequest({ endpoint: "https://api.openai.com/v1/responses", key: "sk-test", model: "gpt-4.1" }, "You are AI Intelligence.", msgs);
  assert.equal(r.kind, "responses"); assert.equal(r.endpoint, "https://api.openai.com/v1/responses");
  assert.equal(r.headers.Authorization, "Bearer sk-test");
  assert.ok(!("messages" in r.body), "the parameter OpenAI rejects is not sent");
  assert.equal(r.body.instructions, "You are AI Intelligence.");
  assert.deepEqual(r.body.input, msgs.map(m => ({ role: m.role, content: m.content })));
  assert.equal(r.body.max_output_tokens, 1500); assert.ok(!("max_tokens" in r.body) && !("max_completion_tokens" in r.body));
  assert.equal(chatRequest({ endpoint: "https://api.openai.com/v1/responses", key: "k", model: "gpt-5" }, "s", msgs).body.max_output_tokens, 4000, "room for a reasoning model to think");
  /* a reply: reasoning first, then the message; only the message's text is the answer */
  const reply = { id: "resp_1", object: "response", status: "completed", output: [
    { type: "reasoning", id: "rs_1", summary: [] },
    { type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text: "Minggu ini: T-104 dan T-105.", annotations: [] }] }] };
  assert.equal(chatText("responses", reply), "Minggu ini: T-104 dan T-105.");
  assert.equal(chatText("responses", { output_text: "From the SDK shape" }), "From the SDK shape");
  assert.equal(chatText("responses", { output: [] }), "", "no text is no text — the route then says so");
});

test("Chat Completions, Anthropic and Gemini are as they were", () => {
  const cc = chatRequest({ endpoint: "https://api.openai.com/v1/chat/completions", key: "k", model: "gpt-4.1" }, "sys", msgs);
  assert.equal(cc.kind, "chat"); assert.deepEqual(cc.body.messages[0], { role: "system", content: "sys" }); assert.equal(cc.body.messages.length, 4);
  assert.equal(chatText("chat", { choices: [{ message: { content: "Halo" } }] }), "Halo");
  const an = chatRequest({ provider: "anthropic", endpoint: "https://api.anthropic.com/v1/messages", key: "k", model: "claude-sonnet-4-6" }, "sys", msgs);
  assert.equal(an.kind, "anthropic"); assert.equal(an.body.system, "sys"); assert.equal(an.headers["x-api-key"], "k");
  assert.equal(chatText("anthropic", { content: [{ type: "text", text: "Hi" }] }), "Hi");
  const ge = chatRequest({ provider: "gemini", endpoint: "", key: "k", model: "gemini-3.5-flash" }, "sys", msgs);
  assert.equal(ge.kind, "gemini"); assert.match(ge.endpoint, /gemini-3\.5-flash:generateContent$/); assert.equal(ge.body.contents[1].role, "model");
  assert.equal(chatText("gemini", { candidates: [{ content: { parts: [{ text: "Ok" }] } }] }), "Ok");
});

test("any provider: a base URL is completed, the endpoint decides the shape, Azure gets its own header", () => {
  const ep = e => chatRequest({ provider: "openai", endpoint: e, key: "k", model: "m" }, "s", msgs);
  /* base URLs as providers' docs give them */
  assert.equal(ep("https://api.openai.com/v1").endpoint, "https://api.openai.com/v1/chat/completions");
  assert.equal(ep("https://api.openai.com").endpoint, "https://api.openai.com/v1/chat/completions");
  assert.equal(ep("https://api.groq.com/openai/v1").endpoint, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(ep("https://openrouter.ai/api/v1/").endpoint, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(ep("https://ai.sumopod.com/v1/chat/completions").endpoint, "https://ai.sumopod.com/v1/chat/completions", "a full URL is left as it is");
  /* Gemini's OpenAI-compatible endpoint speaks the OpenAI shape */
  const gc = chatRequest({ provider: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", key: "k", model: "gemini-3.5-flash" }, "s", msgs);
  assert.equal(gc.kind, "chat"); assert.equal(gc.endpoint, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"); assert.equal(gc.headers.Authorization, "Bearer k");
  /* the endpoint wins over the provider picked: "Anthropic" with an OpenRouter URL is OpenRouter */
  const mixed = chatRequest({ provider: "anthropic", endpoint: "https://openrouter.ai/api/v1/chat/completions", key: "k", model: "anthropic/claude-sonnet-4.6" }, "s", msgs);
  assert.equal(mixed.kind, "chat"); assert.equal(mixed.headers.Authorization, "Bearer k"); assert.ok(!mixed.headers["x-api-key"]);
  /* Azure OpenAI: api-key, the URL (and its api-version) untouched */
  const az = chatRequest({ provider: "openai", endpoint: "https://acme.openai.azure.com/openai/deployments/gpt4o/chat/completions?api-version=2024-10-21", key: "azk", model: "gpt-4o" }, "s", msgs);
  assert.equal(az.headers["api-key"], "azk"); assert.ok(!az.headers.Authorization); assert.match(az.endpoint, /api-version=2024-10-21$/);
});

test("the key goes only to AI providers: the known ones, Azure resources, and what the server adds", () => {
  const { allowedAIHost } = require("../server/ai-chat-format.js");
  for (const h of ["api.openai.com", "ai.sumopod.com", "openrouter.ai", "api.groq.com", "api.deepseek.com", "api.mistral.ai", "api.x.ai", "api.anthropic.com", "generativelanguage.googleapis.com", "acme.openai.azure.com", "API.OPENAI.COM"]) assert.equal(allowedAIHost(h, []), true, h);
  for (const h of ["evil.example.com", "api.openai.com.evil.com", "localhost", "127.0.0.1", "openai.azure.com.attacker.io"]) assert.equal(allowedAIHost(h, []), false, h);
  assert.equal(allowedAIHost("llm.internal.example", ["llm.internal.example"]), true, "COS_AI_ALLOWED_HOSTS adds a host");
});

test("the chat route sends what the format module builds", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../server/server.js"), "utf8");
  const route = src.slice(src.indexOf('route("POST", "/api/ai/chat"'), src.indexOf("/* v39 Generative Expand"));
  assert.match(route, /aiChatFormat\.chatRequest\(c, system, msgs\)/);
  assert.match(route, /aiChatFormat\.chatText\(req\.kind, j\)/);
  assert.ok(!/messages: \[\{ role: "system"/.test(route), "no second copy of the request shape in the route");
});
