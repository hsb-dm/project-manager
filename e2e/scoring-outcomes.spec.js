/* KPIs and OKRs (Oct 2026, src/scoring-outcomes.js, server/outcomes.js, docs/SMART-SCORING.md §11). With Smart Scoring,
   KPI and OKR switched on, the admin defines "Approved assets this month" in Settings → Smart Scoring, counted from the
   assets a lead validated on finished tasks (which tasks count and the baseline under the editor's "Advanced"; the
   section has an example and no Save button: what is changed there is saved at once). A task's count is validated as
   admin in its panel and the task finished:
   the KPI's bar moves, from evidence, and its details list the task. The task's own row says what it adds and links it
   by hand through the shared picker. Reopened, the task's count is taken back. The section draws from what the page has
   when the language changes, and fits a phone. Everything is put back as it was. The server side: tests/outcomes.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const settings = page => page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
const putBack = (page, original) => page.evaluate(async o => { const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o, configVersion: cur.settings.configVersion }); WS.scoring = (await apiFetch("GET", "/api/scoring/settings")).settings; }, original);
/* Settings → Smart Scoring, opened afresh (as someone coming back to it) */
/* Settings → Smart Scoring, at the group KPIs and OKRs are in, picked in the row of tabs above the content */
const openTab = async page => { await page.evaluate(() => { go("home"); go("settings", "scoring"); });
  await page.locator("#content").getByRole("tablist", { name: "Smart Scoring" }).getByRole("tab", { name: /^Output/ }).click(); };

test("a KPI counted from approved assets moves when a lead-validated task is finished, and is taken back when it reopens", async ({ page }) => {
  await signIn(page, ADMIN);
  const original = await settings(page);
  expect(original.enabled).toBe(false);
  const o = { metric: null, task: null };
  try {
    await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings, n = JSON.parse(JSON.stringify(cur)); n.enabled = true; n.modules.kpi.on = true; n.modules.okr.on = true; await scoringSave(n, cur.configVersion); });
    await openTab(page);
    const panel = page.locator("#content section").filter({ has: page.locator("#scrOut") }).last();
    await expect(panel.locator("h2, h3").first()).toHaveText("KPIs and OKRs");
    await expect(panel).toContainText("Example: a KPI “Approved assets this month” with a target of 40");
    await expect(panel).toContainText("saved as soon as it is added or changed");
    await expect(panel.getByRole("button", { name: "Save" }), "no Save button of its own").toHaveCount(0);
    /* the admin defines the KPI: approved assets, this month, a target of 10 — which tasks count is under Advanced */
    await panel.locator("#scoNewKpi").click();
    await expect(page.locator("#modal .modal-head h3")).toHaveText("New KPI");
    await expect(page.locator("#sco_scope")).toBeHidden();
    await page.locator("#modal summary, #modal button").filter({ hasText: /^\s*Advanced/ }).first().click();
    await expect(page.locator("#sco_scope")).toHaveValue("matching");
    await expect(page.locator("#sco_base")).toBeVisible();
    await page.locator("#sco_title").fill("Approved assets this month");
    await expect(page.locator("#sco_rule")).toHaveValue("approved_assets");
    await page.locator("#sco_unit").fill("assets");
    await page.locator("#sco_target").fill("10");
    const month = await page.evaluate(() => { const d = new Date(), p = n => String(n).padStart(2, "0"), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return [d.getFullYear() + "-" + p(d.getMonth() + 1) + "-01", d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(last)]; });
    await page.locator("#sco_start").fill(month[0]); await page.locator("#sco_end").fill(month[1]);
    await page.locator("#sco_save").click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Saved");
    o.metric = await page.evaluate(() => SCO.data.metrics.find(m => m.title === "Approved assets this month").id);
    const row = panel.locator('.scr-out-m[data-metric="' + o.metric + '"]');
    await expect(row.locator(".scr-out-src")).toHaveText("from evidence");
    const base = await page.evaluate(id => SCO.data.metrics.find(m => m.id === id).actual, o.metric);
    await expect(row.locator(".scr-out-sub").first()).toContainText(base + " / 10 assets");
    await row.locator(".scr-out-why summary").click();
    await expect(row.locator(".scr-out-why li").first()).toHaveText("Counts: Approved assets · every task");

    /* a task with 3 assets: validated as admin in its panel, then finished */
    o.task = await page.evaluate(async () => { const t = await apiFetch("POST", "/api/tasks", { title: "Outcomes e2e", status: "progress", prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, assetCount: 3 }); await reloadAll(); openTask(t.id); S.drawerTab = "files"; renderDrawer(); return t.id; });
    await page.locator("#drawer .av-count-approve").click();
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(d => d.meta.assetSplitOk ? d.meta.assetSplitOk.total : null), o.task)).toBe(3);
    await page.evaluate(id => { closeDrawer(); return apiFetch("POST", "/api/tasks/" + id + "/move", { type: "MOVE_TASK_STATUS", toStatusId: "done" }); }, o.task);
    await openTab(page);
    await expect(row.locator(".scr-out-sub").first()).toContainText((base + 3) + " / 10 assets");
    await expect(row.locator(".scr-out-pct")).toHaveText(Math.round((base + 3) * 10) + "%");
    /* the details list the task and what it added */
    await row.getByRole("button", { name: "Details" }).click();
    const ev = page.locator('#scoDetail .scr-out-ev[data-state="counted"]').filter({ hasText: o.task });
    await expect(ev).toContainText("+3 assets");
    await page.evaluate(() => closeModal());

    /* the task's own row: what it adds, and a link made by hand through the picker */
    await page.evaluate(id => { document.body.insertAdjacentHTML("beforeend", '<div id="zzOutRow" style="position:fixed;left:8px;bottom:8px;width:360px;z-index:50">' + scoringOutcomesRowHtml(task(id)) + '</div>'); }, o.task);
    const item = page.locator('#zzOutRow .scr-out-item[data-metric="' + o.metric + '"]');
    await expect(item.locator(".scr-out-adds")).toContainText("+3 assets");
    await expect(item.locator(".scr-out-adds")).toContainText("by its rule");
    await page.locator("#zzOutRow .scr-out-pick").click();
    await page.locator("#entityPicker .ep-search").fill("Approved assets");
    await page.locator("#entityPicker .ep-row").first().click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Linked");
    await expect(item.locator(".scr-out-adds")).toContainText("linked");
    await item.getByRole("button", { name: "Remove the link" }).click();
    await expect(item.locator(".scr-out-adds")).toContainText("by its rule");
    await page.evaluate(() => document.getElementById("zzOutRow").remove());

    /* reopened: taken back */
    await page.evaluate(id => apiFetch("POST", "/api/tasks/" + id + "/move", { type: "MOVE_TASK_STATUS", toStatusId: "progress" }), o.task);
    await openTab(page);
    await expect(row.locator(".scr-out-sub").first()).toContainText(base + " / 10 assets");
    await row.getByRole("button", { name: "Details" }).click();
    await expect(page.locator('#scoDetail .scr-out-ev[data-state="revoked"]').filter({ hasText: o.task })).toContainText("taken back");
    await page.evaluate(() => closeModal());

    /* the language changes without the section going back to "Loading…" */
    const blinks = await page.evaluate(async () => { let n = 0; const ob = new MutationObserver(() => { const el = document.getElementById("scrOut"); if (el && /Memuat…|Loading…/.test(el.textContent)) n++; }); ob.observe(document.getElementById("content"), { childList: true, subtree: true, characterData: true }); setLanguage("id"); renderScreen(false); await new Promise(r => setTimeout(r, 400)); ob.disconnect(); return n; });
    expect(blinks).toBe(0);
    await expect(panel.locator("h2, h3").first()).toHaveText("KPI dan OKR");
    await expect(row.locator(".scr-out-src")).toHaveText("dari bukti");
    await page.evaluate(() => { setLanguage("en"); renderScreen(false); });
    /* a phone: nothing wider than the screen */
    await page.setViewportSize({ width: 390, height: 844 });
    await openTab(page);
    await expect(row).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const box = await row.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(391);
  } finally {
    await page.evaluate(async x => { if (x.metric) await apiFetch("DELETE", "/api/outcomes/metrics/" + x.metric).catch(() => {}); if (x.task) await apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {}); }, o);
    await putBack(page, original);
  }
  const back = await settings(page);
  expect([back.enabled, back.modules.kpi.on, back.modules.okr.on]).toEqual([original.enabled, original.modules.kpi.on, original.modules.okr.on]);
  expect(await page.evaluate(() => apiFetch("GET", "/api/outcomes").then(r => r.metrics.length + r.objectives.length))).toBe(0);
});
