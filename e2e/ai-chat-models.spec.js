/* Settings → AI → Models → Chat models (Oct 2026, src/ai-chat-models.js): an admin adds a chat model from a preset, sees
   the advanced fields (extra parameters checked as they are typed), runs Test — the provider's answer stood in for with
   page.route — takes the one-click fix the failed test offers, assigns the model to Smart Scoring, removes it and is
   told what falls back; in Indonesian and at phone width too. Everything made here is removed again. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
}
const openModels = page => page.evaluate(() => { S.settingsTab = "ai"; S.aiSettingsSection = "models"; go("settings"); renderScreen(); });
const serverState = page => page.evaluate(() => apiFetch("GET", "/api/ai/chat-models"));

test("add a chat model from a preset, test it, take the fix, use it for Smart Scoring, remove it", async ({ page }) => {
  await signIn(page);
  const start = await serverState(page);
  const made = [];
  try {
    await openModels(page);
    const section = page.locator("#cmSection");
    await expect(section).toContainText("Chat models");
    /* the workspace connection is the list's first entry, used for everything */
    const conn = section.locator('[data-cm-row="cm_connection"]');
    await expect(conn).toContainText("Workspace connection");
    await expect(conn).toContainText("Used for: AI Intelligence chat, Smart Scoring AI suggestions, Effort estimate on Create, Brief refine (AI Hub), Report summary");
    await expect(section.locator("#cmUse_scoring")).toHaveValue("");

    /* the preset first: it fills the endpoint and the format */
    await page.locator("#cmAdd").click();
    const modal = page.locator("#modal");
    await expect(modal).toContainText("Add chat model");
    const firstField = await modal.locator(".modal-body .field").first().getAttribute("id");
    expect(firstField).toBe("f_cm_preset");
    await page.locator("#cm_preset").selectOption("anthropic");
    await expect(page.locator("#cm_ep")).toHaveValue("https://api.anthropic.com/v1/messages");
    await expect(page.locator("#cm_format")).toHaveValue("anthropic");
    await expect(page.locator("#cm_preset_hint")).toContainText("Messages API");
    await page.locator("#cm_preset").selectOption("openai");
    await expect(page.locator("#cm_ep")).toHaveValue("https://api.openai.com/v1/chat/completions");
    await expect(page.locator("#cm_format")).toHaveValue("chat_completions");
    await expect(page.locator("#cm_model")).toHaveAttribute("placeholder", "gpt-6-luna");
    await page.locator("#cm_name").fill("GPT-6 Luna E2E");
    await page.locator("#cm_model").fill("gpt-6-luna");
    await expect(page.locator("#cm_key")).toHaveAttribute("placeholder", "Leave blank to use the key saved for this provider");

    /* Advanced: every field, and extra parameters checked as they are typed */
    await page.locator("#cm_adv summary").click();
    for (const id of ["#cm_format", "#cm_token", "#cm_max", "#cm_effort", "#cm_temp", "#cm_extra"]) await expect(page.locator(id)).toBeVisible();
    await page.locator("#cm_token").selectOption("max_tokens");
    await page.locator("#cm_extra").fill('{"model": "something-else"}');
    await expect(page.locator("#cm_extra_msg")).toContainText("model is part of every request and cannot be set here.");
    await expect(page.locator("#cm_extra")).toHaveClass(/cm-bad-input/);
    await page.locator("#cm_extra").fill('{"top_p": 0.9');
    await expect(page.locator("#cm_extra_msg")).toContainText("Not valid JSON yet.");
    await page.locator("#cmSave").click();
    await expect(modal).toBeVisible(); /* refused until the parameters are right */
    await page.locator("#cm_extra").fill('{"top_p": 0.9}');
    await expect(page.locator("#cm_extra_msg")).toContainText("Valid");
    await page.locator("#cmSave").click();
    await expect(page.locator("#modalWrap")).not.toHaveClass(/open/);

    let st = await serverState(page);
    const luna = st.models.find(m => m.name === "GPT-6 Luna E2E"); expect(luna).toBeTruthy(); made.push(luna.id);
    expect(luna.modelId).toBe("gpt-6-luna"); expect(luna.provider).toBe("openai"); expect(luna.tokenParam).toBe("max_tokens"); expect(luna.extraParams).toEqual({ top_p: 0.9 }); expect(luna.keySet).toBe(false);
    const row = section.locator('[data-cm-row="' + luna.id + '"]');
    await expect(row).toContainText("GPT-6 Luna E2E"); await expect(row).toContainText("gpt-6-luna"); await expect(row).toContainText("Active");

    /* Test: the provider refuses max_tokens; the hint offers the fix; one click saves it and tests again */
    let calls = 0;
    await page.route("**/api/ai/chat-models/*/test", async route => {
      calls++;
      const fail = { ok: false, ms: 210, model: "gpt-6-luna", format: "chat", endpoint: "https://api.openai.com/v1/chat/completions", fields: ["model", "max_tokens", "top_p"], usage: { in: null, out: null }, sample: "", at: new Date().toISOString(), by: "admin",
        error: "Chat provider error (400): Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
        hint: { code: "token_param", text: "This model takes max_completion_tokens, not max_tokens.", fix: { tokenParam: "max_completion_tokens" }, vars: { param: "max_tokens", to: "max_completion_tokens" } } };
      const ok = { ok: true, ms: 180, model: "gpt-6-luna", format: "chat", endpoint: "https://api.openai.com/v1/chat/completions", fields: ["model", "max_completion_tokens", "top_p"], usage: { in: 12, out: 2 }, sample: "ready", error: null, hint: null, at: new Date().toISOString(), by: "admin" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(calls === 1 ? fail : ok) });
    });
    await row.locator('[data-cm-test]').click();
    const result = page.locator("#cmTest_" + luna.id);
    await expect(result).toContainText("Test failed");
    await expect(result).toContainText("This model takes max_completion_tokens, not max_tokens.");
    const fix = result.locator("[data-cm-fix]");
    await expect(fix).toHaveText(/Use max_completion_tokens/);
    await fix.click();
    await expect(result.locator('[data-cm-result="ok"]')).toBeVisible();
    await expect(result).toContainText("Works"); await expect(result).toContainText("“ready”"); await expect(result).toContainText("max_completion_tokens");
    expect(calls).toBe(2);
    st = await serverState(page);
    expect(st.models.find(m => m.id === luna.id).tokenParam).toBe("max_completion_tokens");

    /* Used for: Smart Scoring's suggestions from GPT-6 Luna */
    await section.locator("#cmUse_scoring").selectOption(luna.id);
    await expect.poll(async () => (await serverState(page)).use.scoring).toBe(luna.id);
    await expect(section.locator('[data-cm-row="' + luna.id + '"]')).toContainText("Used for: Smart Scoring AI suggestions");
    await expect(section.locator('[data-cm-row="cm_connection"]')).not.toContainText("Smart Scoring AI suggestions");

    /* Indonesian, and phone width: nothing runs off the page */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(page.locator("#cmSection")).toContainText("Model chat");
    await expect(page.locator("#cmSection")).toContainText("Dipakai untuk");
    await expect(page.locator("#cmSection")).toContainText("Saran AI Smart Scoring");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { renderScreen(false); });
    await expect(page.locator("#cmSection")).toBeVisible();
    const over = await page.evaluate(() => { const s = document.getElementById("cmSection"); const r = s.getBoundingClientRect(); return { right: r.right, width: window.innerWidth, scroll: document.documentElement.scrollWidth }; });
    expect(over.right).toBeLessThanOrEqual(over.width + 1); expect(over.scroll).toBeLessThanOrEqual(over.width + 1);
    await page.setViewportSize({ width: 1360, height: 860 });
    await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });

    /* removed while in use: it says what falls back to the AI Intelligence model */
    await page.locator('[data-cm-edit="' + luna.id + '"]').click();
    await expect(modal).toContainText("Edit chat model");
    await expect(page.locator("#cm_model")).toHaveValue("gpt-6-luna");
    await expect(page.locator("#cm_adv")).toHaveAttribute("open", "");
    await modal.getByRole("button", { name: "Remove" }).click();
    await expect(modal).toContainText("Remove this chat model?");
    await modal.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(".toast").filter({ hasText: "Now using Workspace connection: Smart Scoring AI suggestions." })).toBeVisible();
    await expect(page.locator('[data-cm-row="' + luna.id + '"]')).toHaveCount(0);
    st = await serverState(page);
    expect(st.models.some(m => m.id === luna.id)).toBe(false); expect(st.use.scoring).toBe("");
    made.splice(made.indexOf(luna.id), 1);
    await expect(section.locator('[data-cm-row="cm_connection"]')).toContainText("Smart Scoring AI suggestions");
  } finally {
    await page.unroute("**/api/ai/chat-models/*/test").catch(() => {});
    /* put everything back as it was */
    await page.evaluate(async ({ ids, use }) => {
      for (const id of ids) await apiFetch("DELETE", "/api/ai/chat-models/" + encodeURIComponent(id)).catch(() => {});
      await apiFetch("PUT", "/api/ai/chat-use", { use }).catch(() => {});
    }, { ids: made, use: start.use }).catch(() => {});
    const end = await serverState(page);
    expect(end.models.map(m => m.id)).toEqual(start.models.map(m => m.id));
    expect(end.use).toEqual(start.use);
  }
});
