/* Kinds of work, the workspace's own (Oct 2026, src/scoring-kinds.js, shared/scoring-engine.js kindOfTask). The admin
   adds "Podcast" in Settings → Smart Scoring → Kinds of work — the words "podcast, siniar", 3 h for the first
   deliverable, 2 points an asset — and the server gives it its own id; the box under the list recognises a title with
   it; a new task "Siniar HSB eps 4" gets 3 h from the automatic estimate, while Smart Scoring itself is off; a task's
   kind is chosen by hand on its Effort line and the estimate follows; a built-in switched off is no longer recognised;
   the kind deleted, the task that chose it goes back to its title's kind (audited). In Indonesian and at phone width.
   Everything is put back as it was. The rules themselves: tests/scoring-kinds.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const stored = page => page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
const saved = (page, id) => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id), id);

test("the admin adds a kind of work, a title finds it, a new task gets its hours, a task chooses it by hand, a built-in is switched off and the kind deleted", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const original = await stored(page);
  expect(original.enabled, "Smart Scoring itself stays off: the kinds work all the same").toBe(false);
  const made = [];
  const section = page.locator("#content section.panel").filter({ has: page.locator("#skList") });
  const row = id => page.locator('#skList [data-kind="' + id + '"]');
  const save = async () => { await page.locator("#scrBar").getByRole("button", { name: "Save" }).click(); await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved"); };
  const tryTitle = async t => { await page.locator("#skTest").fill(t); return page.locator("#skTestOut"); };
  try {
    await page.evaluate(() => go("settings", "scoring/estimating"));
    await expect(section.locator("h2")).toHaveText("Kinds of work");
    await expect(section).toContainText("Example: add Podcast with the words podcast, siniar — a task titled “Siniar eps 4”");
    await expect(page.locator("#skList .scr-krow")).toHaveCount(14);
    await expect(row("feed").locator('[data-sc="kinds.6.keywords"]')).toHaveValue(/^feed, feeds, post, posts, posting\*/);
    await expect(row("feed").locator(".badge")).toHaveText("Built-in");
    await expect(row("feed").locator('button[title="Delete"]'), "a built-in is never deleted").toHaveCount(0);

    /* 1. Podcast, added and saved: the server gives it its id, its numbers move with it */
    await section.getByRole("button", { name: "Add kind of work" }).click();
    const fresh = page.locator("#skList .scr-krow").last(), temp = await fresh.getAttribute("data-kind");
    await expect(fresh.locator("#sk14_name")).toBeFocused();
    await fresh.locator("#sk14_name").fill("Podcast");
    await fresh.locator("#sk14_nameId").fill("Siniar");
    await fresh.locator("#sk14_keywords").fill("podcast, Siniar");
    await fresh.locator('[data-sc$=".perUnit"]').fill("3");
    await fresh.locator('[data-sc^="assets.perKind."]').fill("2");
    /* the box tries the list as edited, before it is saved */
    await expect(await tryTitle("Podcast episode 12")).toHaveText('Detected: Podcast (keyword "podcast")');
    await save();
    const s1 = await stored(page), pod = s1.kinds.find(k => k.name === "Podcast");
    expect(pod).toMatchObject({ nameId: "Siniar", keywords: ["podcast", "siniar"], builtIn: false, active: true, order: 14 });
    expect(pod.id).toMatch(/^k_[a-z0-9]+$/); expect(pod.id, "the id is the server's").not.toBe(temp);
    expect(s1.hours.templates[pod.id]).toEqual({ perUnit: 3, low: 1.5, high: 4.5, nextUnitFactor: 0.5 });
    expect(s1.assets.perKind[pod.id]).toBe(2);
    expect(s1.hours.templates[temp]).toBeUndefined();
    await page.evaluate(() => go("settings", "scoring/history"));
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Kinds of work");
    await page.evaluate(() => go("settings", "scoring/estimating"));
    await expect(row(pod.id)).toHaveCount(1);
    await expect(await tryTitle("Siniar HSB eps 4")).toHaveText('Detected: Podcast (keyword "siniar")');
    await expect(await tryTitle("Weekly sync")).toHaveText("No kind recognised");
    await expect(await tryTitle("Feed post Monday")).toHaveText('Detected: feed post (keyword "feed")');

    /* 2. a new task named for it: 3 h from the automatic estimate, Smart Scoring off */
    const effort = page.locator('#drawer [data-meta="effort"] input'), badge = page.locator('#drawer [data-meta="effort"] .est-auto');
    await page.evaluate(() => { myPrefs().taskMoreDetailsOpen = true; newTaskModal({}); S.drawerTask = "T-new"; renderDrawer(); });
    await page.locator("#drHead .dr-title").click(); await page.keyboard.type("Siniar HSB eps 4");
    await expect(effort).toHaveValue("3");
    await expect(badge).toHaveAttribute("title", "Typical for a Podcast (1.5–4.5 h). Type a number to set your own.");
    const created = await page.evaluate(async () => { const t = await createDraft(); return t && t.id; }); made.push(created);
    const t1 = await saved(page, created);
    expect(t1.effort).toBe(3); expect(t1.meta.effortAuto).toMatchObject({ src: "kind", kind: pod.id, items: 1 });

    /* 3. a task whose title names nothing: its kind chosen by hand on the Effort line, and the estimate follows */
    const other = await page.evaluate(async () => (await apiFetch("POST", "/api/tasks", { title: "Episode recording HSB", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] })).id);
    made.push(other);
    await page.evaluate(async id => { await reloadAll(); openTask(id); S.drawerTab = "brief"; renderDrawer(); }, other);
    const pick = page.locator("#drawer .enh-blocks .effort .scr-kpick select");
    await expect(pick.locator("option").first()).toHaveText("Auto (none recognised)");
    await expect(pick.locator('option[value="' + pod.id + '"]')).toHaveText("Podcast");
    await pick.selectOption(pod.id);
    await expect.poll(async () => (await saved(page, other)).meta.kind).toBe(pod.id);
    const t2 = await saved(page, other);
    expect(t2.effort, "estimated again, as a new title would be").toBe(3);
    expect(t2.meta.effortAuto).toMatchObject({ src: "kind", kind: pod.id });
    await expect(page.locator("#drawer .enh-blocks .effort .scr-kpick select")).toHaveValue(pod.id);
    /* a kind that is not one of the workspace's is never kept */
    const odd = await page.evaluate(async id => { const d = await apiFetch("GET", "/api/tasks/" + id); d.meta.kind = "made_up"; return (await apiFetch("PUT", "/api/tasks/" + id, d)).meta.kind; }, created);
    expect(odd).toBeUndefined();
    /* a typed number is never overwritten by choosing a kind */
    await page.evaluate(async id => { const t = task(id); await editTaskWith(t, x => { x.effort = 5; effortManual(x); }); }, other);
    await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, other);
    await pick.selectOption("");
    await expect.poll(async () => (await saved(page, other)).meta.kind).toBeUndefined();
    expect((await saved(page, other)).effort).toBe(5);
    await pick.selectOption(pod.id);
    await expect.poll(async () => (await saved(page, other)).meta.kind).toBe(pod.id);

    /* 4. a built-in switched off is no longer recognised — in the box, and by the estimate */
    await page.evaluate(() => { closeDrawer(); go("settings", "scoring/estimating"); });
    await row("feed").locator('[data-sc="kinds.6.active"]').click();
    await expect(row("feed")).toHaveClass(/\boff\b/);
    await expect(await tryTitle("Feed post Monday")).toHaveText("No kind recognised");
    await save();
    expect((await stored(page)).kinds.find(k => k.id === "feed").active).toBe(false);
    expect(await page.evaluate(() => [estKindOf({ title: "Feed post Monday" }), estKind("Feed post Monday")])).toEqual([null, null]);

    /* 5. Podcast deleted: the task that chose it goes back to its title's kind, and that is in its history */
    await row(pod.id).locator('button[title="Delete"]').click();
    await expect(page.locator("#modal")).toContainText("Tasks that chose it (1) go back to their title's kind.");
    await page.locator("#modal .btn.danger").click();
    await expect(row(pod.id)).toHaveCount(0);
    await save();
    const s2 = await stored(page);
    expect(s2.kinds.some(k => k.id === pod.id)).toBe(false);
    expect(s2.hours.templates[pod.id]).toBeUndefined(); expect(s2.assets.perKind[pod.id]).toBeUndefined();
    await expect.poll(async () => (await saved(page, other)).meta.kind).toBeUndefined();
    const audit = await page.evaluate(id => apiFetch("GET", "/api/tasks/" + id + "/scoring").then(r => r.audit), other);
    expect(audit.find(a => a.action === "kind_fallback")).toMatchObject({ module: "kinds" });

    /* Indonesian, and at phone width nothing runs off the page */
    await page.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(section.locator("h2")).toHaveText("Jenis pekerjaan");
    await expect(await tryTitle("Weekly sync")).toHaveText("Tidak ada jenis yang dikenali");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => renderScreen(false));
    await expect(section.locator("h2")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.evaluate(() => { setLanguage("en"); renderScreen(false); });
  } finally {
    await page.evaluate(async x => { if (UI_LANG !== "en") setLanguage("en"); if (task("T-new")) discardDraft(); closeDrawer();
      for (const id of x.made) if (id) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings"); const r = await apiFetch("PUT", "/api/scoring/settings", { settings: x.original, configVersion: cur.settings.configVersion }); WS.scoring = r.settings; }, { made, original });
  }
  const back = await stored(page);
  expect(back.kinds.map(k => [k.id, k.active])).toEqual(original.kinds.map(k => [k.id, k.active]));
  expect(errors, "no errors in the page").toEqual([]);
});
