/* A stand-in for the AI providers, preloaded into a server under test (node -r tests/fake-chat-provider.js server/server.js):
   fetch to api.openai.com, api.anthropic.com, generativelanguage.googleapis.com and llm.fake-provider.test is answered here
   — nothing leaves the machine — and each request is written to FAKE_CHAT_LOG, one JSON line: the address, the model, the
   body's fields, the key it carried and the start of its instructions. A GPT-6 model sent max_tokens is refused as OpenAI
   refuses it; the model "no-such-model" is unknown (and the error repeats the key, as some providers do); a Smart
   Scoring prompt gets an estimate; anything else gets "ready from <model>". Used by tests/ai-chat-models.test.js.
   Not a test file itself (no .test.js). */
const fs = require("fs");
const real = globalThis.fetch;
const HOSTS = /^https:\/\/(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|llm\.fake-provider\.test)\//;
const json = (status, o) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const SCORE = { kind: "feed", deliverables: 5, factors: { complexity: 3, scope: 3, uncertainty: 2, dependencies: 1 }, hours: 6.5, storyPoints: 3, weightedPoints: 4.6, confidence: 0.82, assumptions: [], missing: [], comparables: [], outcomes: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!HOSTS.test(u)) return real(url, init);
  init = init || {};
  let b = {}; try { b = JSON.parse(init.body || "{}"); } catch (e) { /* not JSON */ }
  const h = init.headers || {};
  const key = h.Authorization ? String(h.Authorization).replace(/^Bearer /, "") : (h["x-api-key"] || h["x-goog-api-key"] || h["api-key"] || "");
  const model = b.model || (u.match(/models\/([^:/]+):/) || [])[1] || "";
  const first = Array.isArray(b.messages) && b.messages[0] && b.messages[0].role === "system" ? b.messages[0].content : "";
  const system = String(first || b.instructions || b.system || (b.systemInstruction && b.systemInstruction.parts && b.systemInstruction.parts[0].text) || "");
  if (process.env.FAKE_CHAT_LOG) fs.appendFileSync(process.env.FAKE_CHAT_LOG, JSON.stringify({ url: u, model, fields: Object.keys(b), key, system: system.slice(0, 60) }) + "\n");
  if (/^gpt-6/.test(model) && "max_tokens" in b) return json(400, { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", type: "invalid_request_error", param: "max_tokens", code: "unsupported_parameter" } });
  if (model === "no-such-model") return json(404, { error: { message: "The model `no-such-model` does not exist or you do not have access to it. Key used: " + key, code: "model_not_found" } });
  const text = /You estimate creative production work/.test(system) ? JSON.stringify(Object.assign({ explanation: "Estimated by " + model }, SCORE)) : "ready from " + model;
  if (u.includes("api.anthropic.com")) return json(200, { content: [{ type: "text", text }], usage: { input_tokens: 11, output_tokens: 3 } });
  if (u.includes("generativelanguage.googleapis.com")) return json(200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } });
  if (/\/responses$/.test(new URL(u).pathname)) return json(200, { output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 9, output_tokens: 2 } });
  return json(200, { choices: [{ message: { content: text } }], usage: { prompt_tokens: 12, completion_tokens: 2 } });
};
