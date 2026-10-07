/* A description keeps the shape it was written in: Enter and Shift+Enter are line breaks, empty
   lines stay, spaces stay. They used to close up after Done — "Arigathanks~" and the next line ran
   together — because a line break inside a paragraph was read as a space and empty lines vanished.
   Opening the editor again and saving changes nothing. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("Enter, Shift+Enter, empty lines and spaces survive Done, a reload and another edit", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Lines " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(d)); return d.id; });
  const server = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.description), id);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
    await page.locator("#drawer .md-head .btn", { hasText: "Edit" }).click();
    await page.locator("#descSrc").click();
    const k = page.keyboard;
    await k.type("Hi team, kindly assist me to create new logo. Arigathanks~");
    await k.press("Enter"); await k.press("Enter");
    await k.type("Bikin logo ginian kan ya? -zein");
    await k.press("Shift+Enter");
    await k.type("soft line");
    await k.press("Enter"); await k.press("Enter"); await k.press("Enter");
    await k.type("after two empty lines   with   spaces");
    await page.locator("#drawer .md-head .btn.primary", { hasText: "Done" }).click();

    const want = "Hi team, kindly assist me to create new logo. Arigathanks~\n\nBikin logo ginian kan ya? -zein\nsoft line\n\n\nafter two empty lines   with   spaces";
    await expect.poll(server).toBe(want);
    /* the view shows the lines as written */
    const view = page.locator("#drawer .md-preview");
    await expect(view.locator(":scope > div")).toHaveCount(7);
    await expect(view.locator(":scope > div").nth(0)).toHaveText("Hi team, kindly assist me to create new logo. Arigathanks~");
    await expect(view.locator(":scope > div").nth(2)).toHaveText("Bikin logo ginian kan ya? -zein");
    await expect(view.locator(":scope > div").nth(3)).toHaveText("soft line");
    expect(await view.evaluate(e => getComputedStyle(e).whiteSpace)).toBe("pre-wrap");
    const tops = await view.locator(":scope > div").evaluateAll(ds => ds.map(d => Math.round(d.getBoundingClientRect().top)));
    expect(tops[2] - tops[0], "an empty line between them").toBeGreaterThan(tops[3] - tops[2] + 4);

    /* opening the editor again and saving changes nothing */
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
    await page.evaluate(() => descSaveNow());
    await page.waitForTimeout(600);
    expect(await server()).toBe(want);
    /* nor does a reload */
    await page.goto("/"); await ready(page);
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
    await expect(page.locator("#drawer .md-preview > div")).toHaveCount(7);

    /* lists, headings and links keep their forms */
    const md = "## Deliverables\n- Logo\n- Icon\n\nSee [the guide](https://example.org/guide)\nplain line";
    expect(await page.evaluate(m => descHtmlToMd(descMdHtml(m)), md)).toBe(md);
    /* every heading level comes back as it was, again and again (h3 used to come back as ###) */
    const heads = "# One\n## Two\n### Three";
    expect(await page.evaluate(m => descHtmlToMd(descMdHtml(descHtmlToMd(descMdHtml(m)))), heads)).toBe(heads);
    expect(await page.evaluate(() => descHtmlToMd("<h1>Big</h1><h2>Smaller</h2>", { paste: true }))).toBe("# Big\n## Smaller");
    /* rich text pasted from elsewhere: its source line breaks are spacing, its paragraphs are lines */
    expect(await page.evaluate(() => descHtmlToMd("<p>First\n  paragraph</p><p><b>Bold</b> second</p>", { paste: true }))).toBe("First paragraph\n**Bold** second");
    expect(await page.evaluate(() => descHtmlToMd('<b style="font-weight:normal"><p>Docs line</p></b>', { paste: true }))).toBe("Docs line");
  } finally { await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id); }
});
