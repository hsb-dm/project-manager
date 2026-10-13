/* Estimated hours fill themselves in (Oct 2026). While a new task is written, its Estimate comes from finished tasks
   that read alike — the hours they actually took — marked "auto", with where it came from on hover. With fewer than
   three alike, the kind of work the title names (a feed post, a story…) gives what it usually takes, per deliverable
   for work made in sets: a feed post is not a ten-hour job, as the AI had it. Only when neither says enough, and the
   AI is allowed, is the AI asked once on Create, with the usual hours as a yardstick and its answer kept within a
   working week. A number typed by the person is theirs: never overwritten, and the mark goes. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the estimate fills in from finished work like it, then from the AI; a typed number is never overwritten", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  /* finished work: three carousels (5, 8 and 6 hours — two by their actual, one by its estimate), one audit report
     and one story set */
  const made = await page.evaluate(async () => {
    const out = []; const closed = WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id;
    for (const [title, effort, actual] of [["Carousel Instagram promo Ramadan", 6, 5], ["Carousel Instagram promo Natal", 8, 0], ["Carousel Instagram promo Imlek", 4, 6], ["Quarterly vendor audit report", 12, 0], ["Story set Ramadan", 4, 0]]) {
      const d = await apiFetch("POST", "/api/tasks", { title, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], effort });
      const t = hTask(d); t.status = closed; t.effort = effort; if (actual) taskMeta(t).actualEffort = actual; TASKS.push(t); out.push(d.id);
    }
    return out;
  });
  const effort = page.locator('#drawer [data-meta="effort"] input'), badge = page.locator('#drawer [data-meta="effort"] .est-auto');
  const draft = async title => { /* the Estimate is under More details: open */ await page.evaluate(() => { myPrefs().taskMoreDetailsOpen = true; newTaskModal({}); S.drawerTask = "T-new"; renderDrawer(); }); await page.locator("#drHead .dr-title").click(); await page.keyboard.type(title); };
  const create = () => page.evaluate(async () => { const t = await createDraft(); return t && t.id; });
  const saved = id => page.evaluate(async id => { const d = await apiFetch("GET", "/api/tasks/" + id); return { effort: d.effort, meta: d.meta || {} }; }, id);
  const aiAsked = []; await page.route("**/api/ai/chat", async route => { aiAsked.push(route.request().postDataJSON()); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: /Q3/.test(route.request().postDataJSON().messages[0].content) ? '{"hours": 90, "reason": "A big one"}' : '{"hours": 7.3, "reason": "Two sizes and one round of copy"}' }) }); });
  try {
    /* 1. three alike: filled in while typing, marked auto, the source on hover */
    await draft("Carousel Instagram promo Lebaran");
    await expect(effort).toHaveValue("6");
    await expect(badge).toHaveText("auto");
    await expect(badge).toHaveAttribute("title", "Filled in from 3 finished tasks like this one (5–8 h). Type a number to set your own.");
    /* the page did not redraw for it: the title is still being typed into */
    await expect(page.locator("#drHead .dr-title")).toBeFocused();
    let id = await create(); made.push(id);
    let s = await saved(id);
    expect(s.effort).toBe(6);
    expect(s.meta.effortAuto).toMatchObject({ src: "history", basis: "alike", n: 3, low: 5, high: 8 });
    expect(aiAsked.length, "three alike: no AI").toBe(0);
    /* the created task keeps the mark, in its Effort block too */
    await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, id);
    await expect(page.locator("#drawer .effort .est-auto")).toHaveText("auto");
    await expect(page.locator('#drawer [data-meta="effort"] .est-auto'), "and beside its Estimate").toHaveText("auto");

    /* 2. typed by the person: the mark goes, and more typing in the title does not change it */
    await draft("Carousel Instagram promo");
    await expect(badge).toBeVisible();
    await effort.fill("10"); await effort.dispatchEvent("change");
    await expect(badge).toHaveCount(0);
    await page.locator("#drHead .dr-title").click(); await page.keyboard.press("End"); await page.keyboard.type(" Lebaran");
    await page.waitForTimeout(500);
    await expect(effort).toHaveValue("10");
    id = await create(); made.push(id);
    s = await saved(id);
    expect(s.effort).toBe(10);
    expect(s.meta.effortManual).toBe(true);
    expect(s.meta.effortAuto).toBeUndefined();

    /* 3. nothing alike: the draft's own number, no mark */
    await draft("Annual budget approval meeting");
    await page.waitForTimeout(500);
    await expect(effort).toHaveValue("4");
    await expect(badge).toHaveCount(0);
    await page.evaluate(() => discardDraft());

    /* 4. one alike and the AI allowed: on Create the AI is asked, with the example; its answer fills the task */
    await page.evaluate(() => { WS.ai = Object.assign({}, WS.ai, { chat: Object.assign({}, (WS.ai || {}).chat, { keySet: true }), processing: { externalEnabled: true, workspaceContextEnabled: true } }); });
    /* three alike: history is enough, the AI is not asked even when allowed */
    await draft("Carousel Instagram promo Paskah");
    await expect(effort).toHaveValue("6");
    id = await create(); made.push(id);
    await page.waitForTimeout(400);
    expect(aiAsked.length, "three alike: no AI").toBe(0);
    /* the kind of work, with nothing finished like it: a feed post is two hours, and the AI is not asked */
    await draft("social media post feed");
    await expect(effort).toHaveValue("2");
    await expect(badge).toHaveAttribute("title", "Typical for a feed post (1–3 h). Type a number to set your own.");
    /* five of them: the first in full, each next one quicker */
    await page.locator('#drawer [data-meta="assetCount"] input').fill("5");
    await page.locator('#drawer [data-meta="assetCount"] input').dispatchEvent("change");
    await expect(effort).toHaveValue("7");
    await expect(badge).toHaveAttribute("title", "Typical for a feed post, 5 deliverables (3.5–10 h). Type a number to set your own.");
    id = await create(); made.push(id);
    await page.waitForTimeout(400);
    expect(aiAsked.length, "the kind of work says enough: no AI").toBe(0);
    s = await saved(id);
    expect(s.effort).toBe(7);
    expect(s.meta.effortAuto).toMatchObject({ src: "kind", kind: "feed", items: 5 });
    /* one finished like it, weighed with what a story usually takes (the kind counts as two): (4 + 2 × 1.5) / 3 */
    await draft("Story set Lebaran");
    await expect(effort).toHaveValue("2.5");
    await expect(badge).toHaveAttribute("title", "Typical for a story, weighed with 1 finished task like this one (1–4 h). Type a number to set your own.");
    await page.evaluate(() => discardDraft());
    /* one alike and no kind of work in the title: the AI */
    await draft("Quarterly vendor audit report Q4");
    await expect(effort).toHaveValue("12");
    id = await create(); made.push(id);
    await expect.poll(() => aiAsked.length).toBe(1);
    const prompt = aiAsked[0].messages[0].content;
    expect(prompt).toContain("Task title: Quarterly vendor audit report Q4");
    expect(prompt, "the workspace shares its data: the example goes along").toContain('"Quarterly vendor audit report": 12 h');
    expect(prompt, "the usual hours as a yardstick").toContain("feed post 1–3 h each");
    expect(prompt, "hands-on hours, not calendar time").toContain("not calendar time and not time waiting for feedback or approval");
    await expect.poll(async () => (await saved(id)).effort).toBe(7.5);
    s = await saved(id);
    expect(s.meta.effortAuto).toMatchObject({ src: "ai", n: 1, reason: "Two sizes and one round of copy" });
    await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, id);
    await expect(page.locator("#drawer .effort .est-auto.ai")).toHaveAttribute("title", "Estimated by AI: Two sizes and one round of copy · Examples: 1 similar task. Type a number to set your own.");

    /* 5. the AI is not asked when the person typed a number, nor when the workspace does not allow it */
    /* an answer past a working week is kept to one */
    await draft("Quarterly vendor audit report Q3");
    id = await create(); made.push(id);
    await expect.poll(() => aiAsked.length).toBe(2);
    await expect.poll(async () => (await saved(id)).effort).toBe(40);
    await draft("Quarterly vendor audit report Q1");
    await effort.fill("3"); await effort.dispatchEvent("change");
    id = await create(); made.push(id);
    await page.waitForTimeout(400);
    expect(aiAsked.length).toBe(2);
    expect((await saved(id)).effort).toBe(3);
    await page.evaluate(() => { WS.ai.processing.externalEnabled = false; });
    await draft("Quarterly vendor audit report Q2");
    id = await create(); made.push(id);
    await page.waitForTimeout(400);
    expect(aiAsked.length, "external AI off").toBe(2);
    expect((await saved(id)).effort).toBe(12);

    /* Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; });
    await draft("Carousel Instagram promo Waisak");
    await expect(badge).toHaveText("otomatis");
    await expect(badge).toHaveAttribute("title", "Diisi dari 3 task serupa yang sudah selesai (5–8 h). Ketik angka untuk menentukan sendiri.");
    await page.evaluate(() => { discardDraft(); UI_LANG = "en"; });
  } finally {
    await page.evaluate(async ids => { if (task("T-new")) discardDraft(); closeDrawer(); for (const id of ids) if (id) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, made);
  }
});
