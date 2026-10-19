/* Points for the assets people produce (Oct 2026, src/scoring-assets.js, docs/SMART-SCORING.md §11). With Smart Scoring
   and its "assets" module on, a task's row shows each person's count, the points it earns by the kind of work (a logo
   concept: 5 points an asset) and whether a lead has validated it — not validated yet, validated, changed since. The
   Settings tab has the "Asset points" section, with an example: whether counts not validated yet count, and the points
   per asset of each kind beside the hours a piece typically takes, and no Save button of its own; a value changed
   there is saved (as the tab's Save bar saves) and used. The figures over a period
   come from GET /api/scoring/assets, people in name order. Off, nothing shows. Everything is put back as it was. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const stored = page => page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
/* the settings with a change merged in, saved through PUT /api/scoring/settings whatever version it is on now, and the
   page given the result */
const setScoring = (page, change) => page.evaluate(async patch => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings, next = JSON.parse(JSON.stringify(cur));
  (function merge(a, b) { Object.keys(b).forEach(k => { if (b[k] && typeof b[k] === "object" && a[k] && typeof a[k] === "object") merge(a[k], b[k]); else a[k] = b[k]; }); })(next, patch);
  const r = await apiFetch("PUT", "/api/scoring/settings", { settings: next, configVersion: cur.configVersion }); WS.scoring = r.settings; return r.settings; }, change);
/* Settings → Smart Scoring shows one group at a time once it has its sub-menu: the group is picked by its name (without
   the sub-menu every section is on the page); saved as the tab saves (its Save bar calls the same function) */
const group = async (page, name) => { const c = page.locator("#content"), b = c.getByRole("button", { name }).or(c.getByRole("link", { name })); if (await b.count()) await b.first().click(); };
const save = page => page.evaluate(() => scSaveClick());

test("a task's asset points per person with their validation mark, the Settings section's table, and the figures over a period", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const original = await stored(page);
  expect(original.enabled).toBe(false);
  expect(original.modules.assets.on).toBe(false);
  const tag = Date.now().toString(36);
  const o = await page.evaluate(async t => {
    const o = { me: ME };
    await apiFetch("POST", "/api/members", { name: "Zara Points " + t, email: "zara-" + t + "@e2e.test", perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people; o.zara = Object.keys(people).find(id => people[id].email === "zara-" + t + "@e2e.test");
    const closed = WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id;
    o.task = (await apiFetch("POST", "/api/tasks", { title: "Logo concept " + t, status: closed, prio: "medium", reviewer: ME, reviewers: [ME], assignee: ME, assignees: [ME, o.zara], meta: { assetSplit: { [ME]: 2, [o.zara]: 1 } } })).id;
    await reloadAll(); return o;
  }, tag);
  /* the row, drawn by the page into a place of its own (and checked in the task panel too, once the panel calls it) */
  const row = page.locator("#e2eAssets .scr-ap");
  const draw = () => page.evaluate(id => { let el = document.getElementById("e2eAssets"); if (!el) { el = document.createElement("div"); el.id = "e2eAssets"; el.style.cssText = "position:fixed;left:16px;top:80px;width:420px;z-index:99999"; document.body.appendChild(el); } el.innerHTML = scoringAssetsRowHtml(task(id)); }, o.task);
  const who = id => row.locator('.scr-ap-row[data-person="' + id + '"]');
  try {
    /* off: nothing shows */
    await draw();
    await expect(row).toHaveCount(0);
    await setScoring(page, { enabled: true });
    await draw();
    await expect(row, "Smart Scoring on, the module still off").toHaveCount(0);
    const on = await setScoring(page, { modules: { assets: { on: true } } });
    expect([on.modules.assets.on, on.assets.on, on.assets.perKind.logo]).toEqual([true, true, 5]);
    await draw();
    await expect(row).toHaveCount(1);
    await expect(row.locator(".scr-ap-head")).toContainText("logo or brand identity · 5.00 pts per asset");
    await expect(row.locator(".scr-ap-total")).toHaveText("15.00 pts");
    await expect(who(o.me).locator(".scr-ap-calc")).toHaveText("2 × 5.00 = 10.00 pts");
    await expect(who(o.zara).locator(".scr-ap-calc")).toHaveText("1 × 5.00 = 5.00 pts");
    await expect(who(o.me).locator(".scr-ap-mark")).toHaveText("Not validated yet");
    await expect(row.locator(".scr-ap-total")).toHaveAttribute("title", /Zara Points .*: not validated by a lead yet; counted as entered\./);
    /* the lead validates (an admin here); then Zara's count changes: changed since, the admin's still validated */
    await page.evaluate(async id => { const d = await apiFetch("GET", "/api/tasks/" + id); d.meta.assetSplitOk = { split: d.meta.assetSplit }; await apiFetch("PUT", "/api/tasks/" + id, d); await reloadAll(); }, o.task);
    await draw();
    await expect(who(o.me).locator(".scr-ap-mark")).toHaveText("Validated");
    await expect(who(o.zara).locator(".scr-ap-mark")).toHaveText("Validated");
    await page.evaluate(async o => { const d = await apiFetch("GET", "/api/tasks/" + o.task); d.meta.assetSplit[o.zara] = 2; await apiFetch("PUT", "/api/tasks/" + o.task, d); await reloadAll(); }, o);
    await draw();
    await expect(who(o.zara).locator(".scr-ap-mark")).toHaveText("Changed since validation");
    await expect(who(o.zara).locator(".scr-ap-calc")).toHaveText("2 × 5.00 = 10.00 pts");
    await expect(who(o.me).locator(".scr-ap-mark")).toHaveText("Validated");
    await expect(row.locator(".scr-ap-total")).toHaveText("20.00 pts");
    /* someone who may not validate and does not see Smart Scoring's analytics — a member — sees counts and points
       without the validation marks, as the Assets tab shows it to them */
    await page.evaluate(() => { window.__v = assetSplitCanValidate; window.__a = canI.scoringViewAnalytics; assetSplitCanValidate = () => false; canI.scoringViewAnalytics = () => false; });
    await draw();
    await expect(row.locator(".scr-ap-mark"), "no validation marks for a member").toHaveCount(0);
    await expect(who(o.zara).locator(".scr-ap-calc")).toHaveText("2 × 5.00 = 10.00 pts");
    expect(await row.locator(".scr-ap-total").getAttribute("title")).not.toMatch(/validat/i);
    await page.evaluate(() => { assetSplitCanValidate = window.__v; canI.scoringViewAnalytics = window.__a; });
    await draw();
    await expect(who(o.me).locator(".scr-ap-mark")).toHaveText("Validated");
    /* in the task panel, where it shows the row */
    await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, o.task);
    const inPanel = page.locator('#drawer [data-scoring-assets="' + o.task + '"]');
    if (await inPanel.count()) await expect(inPanel.locator(".scr-ap-total")).toHaveText("20.00 pts");
    await page.evaluate(() => closeDrawer && closeDrawer());

    /* the figures over the period, from the server: both people, name order, the validation split */
    const sum = await page.evaluate(async () => { const r = await scoringAssetsLoad({ from: new Date().toISOString().slice(0, 10) }); return { r, cached: scoringAssetsCached({ from: new Date().toISOString().slice(0, 10) }) === r }; });
    expect(sum.cached).toBe(true);
    const mine = sum.r.people.find(p => p.userId === o.me), zara = sum.r.people.find(p => p.userId === o.zara);
    expect([mine.assets, mine.points, mine.validated.points, zara.assets, zara.points, zara.changed.points]).toEqual([2, 10, 10, 2, 10, 10]);
    await page.evaluate(r => { const el = document.getElementById("e2eAssets"); el.innerHTML = scoringAssetsSummaryHtml(r); }, sum.r);
    const names = await page.locator("#e2eAssets .scr-asum-row .scr-ap-name").allTextContents();
    expect(names).toEqual(names.slice().sort((a, b) => a.localeCompare(b)));
    await expect(page.locator('#e2eAssets .scr-asum-row[data-person="' + o.zara + '"]')).toContainText("Changed since validation 2 · 10.00 pts");

    /* Settings → Smart Scoring: the section, with the hours a piece takes beside each value */
    await page.evaluate(() => { document.getElementById("e2eAssets").innerHTML = ""; go("settings", "scoring"); });
    await group(page, /^Output/);
    const section = page.locator("#content section").filter({ has: page.locator('[data-sc="assets.countUnvalidated"]') }).last();
    await expect(section.locator("h2, h3").first()).toHaveText("Asset points");
    await expect(section).toContainText("Example: with a logo at 5 points, someone who makes 2 logos earns 2 × 5 = 10 points");
    expect(await page.evaluate(() => scGet("modules.assets.on")), "the module is on (its switch is the tab's Overview's once it has one)").toBe(true);
    await expect(section).not.toContainText("Asset points are off");
    await expect(section.locator('[data-sc="assets.countUnvalidated"]')).toHaveClass(/\bon\b/);
    await expect(section.locator('tr[data-kind="logo"]')).toContainText("10 h");
    await expect(section.locator('tr[data-kind="resize"] input')).toHaveValue("0.25");
    await expect(section.locator("#sc_ap_unknown")).toHaveValue("1");
    await expect(section.getByRole("button", { name: "Save" }), "no Save button of its own").toHaveCount(0);
    await section.locator("#sc_ap_logo").fill("6");
    await save(page);
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    expect((await stored(page)).assets.perKind.logo).toBe(6);
    await group(page, /^History/);
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Asset points · logo or brand identity");
    await group(page, /^Output/);
    await draw();
    await expect(who(o.me).locator(".scr-ap-calc")).toHaveText("2 × 6.00 = 12.00 pts");
    /* Indonesian, and at phone width nothing runs off the page */
    await page.evaluate(() => { document.getElementById("e2eAssets").innerHTML = ""; setLanguage("id"); renderScreen(false); });
    await expect(section.locator("h2, h3").first()).toHaveText("Poin aset");
    await expect(section).toContainText("Contoh: bila logo bernilai 5 poin");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => renderScreen(false));
    await expect(section.locator("h2, h3").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.evaluate(() => { setLanguage("en"); renderScreen(false); });
    await page.setViewportSize({ width: 1366, height: 1000 });
    /* the module off again: the row is gone */
    await setScoring(page, { modules: { assets: { on: false } } });
    await draw();
    await expect(row).toHaveCount(0);
  } finally {
    await page.evaluate(async x => { if (UI_LANG !== "en") setLanguage("en"); const el = document.getElementById("e2eAssets"); if (el) el.remove();
      await apiFetch("DELETE", "/api/tasks/" + x.o.task).catch(() => {}); await apiFetch("DELETE", "/api/members/" + x.o.zara).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings"); const r = await apiFetch("PUT", "/api/scoring/settings", { settings: x.original, configVersion: cur.settings.configVersion }); WS.scoring = r.settings; }, { o, original });
  }
  const back = await stored(page);
  expect([back.enabled, back.modules.assets.on, back.assets.perKind.logo]).toEqual([false, false, 5]);
});
