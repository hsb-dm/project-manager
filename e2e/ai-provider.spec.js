/* Settings → AI → the chat model: the note under API endpoint, the model and key placeholders follow the provider
   picked (they always spoke of Gemini). OpenAI gets a preset; a URL typed by hand (SumoPod) is not replaced when
   the provider changes. An address the server does not send keys to is named in the error, with what to do. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the chat provider's note, endpoint and model follow the provider; an unknown host is named", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const before = await page.evaluate(() => JSON.stringify((WS.ai && WS.ai.chat) || {}));
  await page.evaluate(() => { S.settingsTab = "ai"; S.aiSettingsSection = "providers"; go("settings"); renderScreen(); });
  await expect(page.locator("#ai_c_prov")).toBeVisible();
  try {
    /* OpenAI: the preset fills an empty endpoint and model; the note says any OpenAI-compatible service works */
    await page.locator("#ai_c_ep").fill(""); await page.locator("#ai_c_model").fill("");
    await page.locator("#ai_c_prov").selectOption("openai");
    await expect(page.locator("#ai_c_ep_hint")).toContainText("OpenAI-compatible");
    await expect(page.locator("#ai_c_ep_hint")).toContainText("/responses");
    await expect(page.locator("#ai_c_ep")).toHaveValue("https://api.openai.com/v1/chat/completions");
    await expect(page.locator("#ai_c_model")).toHaveValue("gpt-5-mini");
    /* Gemini, Anthropic: their own notes */
    await page.locator("#ai_c_prov").selectOption("gemini");
    await expect(page.locator("#ai_c_ep_hint")).toContainText("GenerateContent");
    await page.locator("#ai_c_prov").selectOption("anthropic");
    await expect(page.locator("#ai_c_ep_hint")).toContainText("Messages API");
    await expect(page.locator("#ai_c_model")).toHaveAttribute("placeholder", "claude-sonnet-4-6");
    /* a SumoPod URL typed by hand stays when OpenAI-compatible is picked */
    await page.locator("#ai_c_ep").fill("https://ai.sumopod.com/v1/chat/completions"); await page.locator("#ai_c_model").fill("my-sumopod-model");
    await page.locator("#ai_c_prov").selectOption("openai");
    await expect(page.locator("#ai_c_ep")).toHaveValue("https://ai.sumopod.com/v1/chat/completions");
    await expect(page.locator("#ai_c_model")).toHaveValue("my-sumopod-model");
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; aiChatProviderPreset("gemini"); });
    await expect(page.locator("#ai_c_ep_hint")).toContainText("generateContent resmi");
    await page.evaluate(() => { UI_LANG = "en"; });

    /* an address the server does not send the key to: refused, and the error names it and says what to do */
    await page.evaluate(() => { aiChatProviderPreset("custom"); });
    await page.locator("#ai_c_prov").selectOption("custom");
    await page.locator("#ai_c_ep").fill("https://llm.unknown-provider.example/v1/chat/completions");
    await page.locator("#ai_c_model").fill("any-model"); await page.locator("#ai_c_key").fill("sk-e2e-not-a-real-key");
    await page.evaluate(() => saveAI());
    await expect.poll(() => page.evaluate(() => WS.ai && WS.ai.chat && WS.ai.chat.endpoint)).toBe("https://llm.unknown-provider.example/v1/chat/completions");
    const r = await page.evaluate(() => apiFetch("POST", "/api/ai/test", { kind: "chat" }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("llm.unknown-provider.example");
    expect(r.error).toContain("COS_AI_ALLOWED_HOSTS");
  } finally {
    /* put the chat settings back as they were (the key included: "clear" removes the test one) */
    await page.evaluate(b => { const prev = JSON.parse(b); S.settingsTab = "ai"; S.aiSettingsSection = "providers"; go("settings"); renderScreen();
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
      set("ai_c_prov", prev.provider || "anthropic"); set("ai_c_ep", prev.endpoint || ""); set("ai_c_model", prev.model || ""); set("ai_c_key", prev.hasKey || prev.key ? "" : "clear"); return saveAI(); }, before).catch(() => {});
  }
});
