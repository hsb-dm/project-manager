/* A report has a language of its own: the export dialog asks for it (English or Bahasa Indonesia, the app's own to
   start with), and the file — PowerPoint, Excel or CSV — is written in it: its words, its dates, and what the AI is
   asked to write. The screen stays in the app's language. The strings that stayed English in an Indonesian report
   (Performance by person, AI recommendations, the confidence line, No team, Asset link) are translated. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the report's language: chosen in the dialog, written into the file, the screen left as it is", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const ids = await page.evaluate(async () => { const out = []; for (const t of ["Banner KV", "Logo refresh"]) { const d = await apiFetch("POST", "/api/tasks", { title: t, status: WS.workflow[2].id, prio: "high", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); out.push(d.id); } return out; });
  /* catch what the export would download */
  await page.evaluate(() => { window._dl = []; window.download = (name, blob) => { blob.arrayBuffer().then(b => window._dl.push({ name, text: new TextDecoder().decode(b) })); }; });
  const run = async (kind, lang) => {
    await page.evaluate(k => { window._dl = []; exportModal(k); }, kind);
    await expect(page.locator("#ex_lang button")).toHaveCount(2);
    await page.locator(`#ex_lang button[data-lang="${lang}"]`).click();
    await expect(page.locator(`#ex_lang button[data-lang="${lang}"]`)).toHaveAttribute("aria-pressed", "true");
    await page.locator("#modal .modal-foot .btn.primary").click();
    await expect.poll(() => page.evaluate(() => window._dl.length), { timeout: 15000 }).toBe(1);
    return page.evaluate(() => window._dl[0]);
  };
  try {
    /* the app is in English; the dialog starts on English */
    await page.evaluate(() => exportModal("ppt"));
    await expect(page.locator('#ex_lang button[data-lang="en"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".exm-lang b")).toHaveText("Report language");
    await page.evaluate(() => closeModal());
    /* an Indonesian PowerPoint from an English app */
    const ppt = await run("ppt", "id");
    expect(ppt.name).toMatch(/\.pptx$/);
    expect(ppt.text).toContain(">LAPORAN WORKSPACE<");
    expect(ppt.text).toContain(">Kinerja per orang<");
    expect(ppt.text).toContain(">Pipeline alur kerja<");
    expect(ppt.text).not.toContain(">WORKSPACE REPORT<");
    expect(await page.evaluate(() => UI_LANG), "the app keeps its language").toBe("en");
    await expect(page.locator(".snav, .pagehead h1").first()).not.toContainText("Laporan");
    /* Excel and CSV too */
    const xlsx = await run("xlsx", "id");
    expect(xlsx.text).toContain("Laporan workspace");
    expect(xlsx.text).not.toMatch(/>No team<|>Asset link</);
    const csv = await run("csv", "id");
    expect(csv.text.split("\n")[0]).not.toMatch(/\bTitle\b/);
    const csvEn = await run("csv", "en");
    expect(csvEn.text.split("\n")[0]).toMatch(/\bTitle\b/);
    expect(csvEn.text.split("\n")[0]).not.toBe(csv.text.split("\n")[0]);
    /* the other way: an English report from an Indonesian app */
    await page.evaluate(() => { UI_LANG = "id"; });
    await page.evaluate(() => exportModal("ppt"));
    await expect(page.locator('#ex_lang button[data-lang="id"]'), "the dialog starts on the app's language").toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => closeModal());
    const pptEn = await run("ppt", "en");
    expect(pptEn.text).toContain(">WORKSPACE REPORT<");
    expect(pptEn.text).toContain(">Performance by person<");
    expect(await page.evaluate(() => UI_LANG)).toBe("id");
    await page.evaluate(() => { UI_LANG = "en"; });
    /* the AI is asked for the report's language, about any team */
    const prompts = await page.evaluate(() => { const at = lang => { EXPORT = { from: -55, to: 0, weeks: 8, teams: [], projects: [], labels: [], people: [], status: "all", lang }; const p = exInLang(() => reportRecPrompt(reportData())); EXPORT = null; return p; }; return { id: at("id"), en: at("en") }; });
    expect(prompts.id).toContain("Write the title and detail in Bahasa Indonesia.");
    expect(prompts.en).toContain("Write the title and detail in English.");
    expect(prompts.en).not.toMatch(/creative operations/i);
    /* the workspace's tagline is a general one */
    expect(await page.evaluate(() => WS.tagline)).not.toMatch(/creative operations/i);
  } finally {
    await page.evaluate(async ids => { closeModal(); for (const id of ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, ids);
  }
});
