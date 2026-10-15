/* A refresh puts the page back (Oct 2026): Settings → AI & Integrations → Data & Privacy came back as Overview.
   Now the sub-tab, an open task's panel tab, the calendar's month, a search box, the scroll and the AI Hub design
   all return after a reload of the same browser tab; opening ZenCrevia afresh still starts clean. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const reload = async p => { await p.reload(); await ready(p); };

test("a refresh keeps sub-tabs, the task panel, the calendar, searches, the scroll and the AI Hub design", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36);
  const ids = await page.evaluate(async tag => {
    const out = [];
    for (let i = 0; i < 40; i++) out.push((await apiFetch("POST", "/api/tasks", { title: "Refresh " + tag + " " + i, status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] })).id);
    await reloadAll(); return out;
  }, tag);
  try {
    /* Settings → AI & Integrations → Data & Privacy */
    await page.evaluate(() => { S.aiSettingsSection = "privacy"; go("settings", "ai"); });
    await expect(page.getByRole("tab", { name: "Data & Privacy" })).toHaveAttribute("aria-selected", "true");
    await reload(page);
    expect(new URL(page.url()).pathname).toBe("/settings/ai");
    await expect(page.getByRole("tab", { name: "Data & Privacy" })).toHaveAttribute("aria-selected", "true");

    /* a task's panel on a tab other than its first */
    await page.evaluate(id => { go("tasks", "list"); openTask(id); S.drawerTab = "activity"; renderDrawer(); }, ids[0]);
    await reload(page);
    expect(await page.evaluate(() => [S.drawerTask, S.drawerTab])).toEqual([ids[0], "activity"]);
    await page.evaluate(() => closeDrawer());

    /* the calendar three months ahead, in week view */
    const month = await page.evaluate(() => { go("calendar", "month"); S.calMonth = (TODAY.getMonth() + 3) % 12; S.calYear = TODAY.getFullYear() + (TODAY.getMonth() + 3 > 11 ? 1 : 0); renderScreen(false); return [S.calMonth, S.calYear]; });
    await reload(page);
    expect(await page.evaluate(() => [S.calMonth, S.calYear])).toEqual(month);

    /* a search typed into Assets */
    await page.evaluate(() => { S.assetQuery = "brand kit"; go("assets"); });
    await reload(page);
    expect(await page.evaluate(() => S.assetQuery)).toBe("brand kit");

    /* scrolled down a long list */
    await page.evaluate(() => { S.assetQuery = ""; S.taskScope = "all"; go("tasks", "list"); });
    await page.waitForFunction(() => { const el = appScrollEl(); return el.scrollHeight > el.clientHeight + 600; });
    await page.evaluate(() => appScrollTop(500));
    const y = await page.evaluate(() => appScrollTop());
    expect(y).toBeGreaterThan(400);
    await reload(page);
    await expect.poll(() => page.evaluate(() => appScrollTop())).toBeGreaterThan(y - 40);

    /* a design in AI Hub */
    await page.evaluate(() => go("aihub"));
    await page.locator(".ai-template-card", { hasText: "Educational feed" }).click();
    await page.evaluate(() => { AIF.headline = "Kept across a refresh"; aiPreview(); });
    await page.waitForTimeout(800);   /* written down half a second after the change */
    await reload(page);
    expect(await page.evaluate(() => [S.screen, AIF.template, AIF.headline, AIF.layout])).toEqual(["aihub", "p_feed_edu", "Kept across a refresh", "poster"]);
    await expect(page.locator(".ai-template-card.on")).toContainText("Educational feed");

    /* opened afresh (not a refresh): the defaults */
    await page.evaluate(() => { S.aiSettingsSection = "privacy"; go("settings", "ai"); });
    await page.goto("/settings/ai"); await ready(page);
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => AIF.headline)).toBe("");
  } finally {
    await page.evaluate(async ids => { for (const id of ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, ids);
  }
});
