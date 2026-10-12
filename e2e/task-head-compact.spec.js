/* The task panel's top on a laptop: on a 768px-high screen the tabs started 400px down — the fields'
   grid, a "More details" line, then Tags under their own divider. Tags and More details now share one
   row, the grid is tighter, people and labels stay small, and a long project name stays on one line.
   What More details opens comes under that row. Phones keep their own layout (mobile-task-panel.spec). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("on a laptop the tabs start near the top; Tags and More details share a row; a long project name is one line", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const ids = await page.evaluate(async () => {
    const pj = (await apiFetch("POST", "/api/projects", { name: "Insurance Campaign for the whole year, every channel", status: "active", owner: ME, teams: [] }));
    PROJECTS = pj.map ? pj.map(hProject) : PROJECTS;
    const p = PROJECTS.find(x => x.name.indexOf("Insurance Campaign for the whole year") === 0);
    const d = await apiFetch("POST", "/api/tasks", { title: "Hero KV compact", status: WS.workflow[2].id, prio: "high", proj: p && p.id, assignee: ME, assignees: [ME], reviewers: [ME], reviewer: ME, labels: (WS.labels || []).slice(0, 2).map(l => l.id) });
    TASKS.push(hTask(d)); openTask(d.id); return { task: d.id, project: p && p.id };
  });
  try {
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const box = s => { const e = document.querySelector("#drawer " + s); return e ? e.getBoundingClientRect() : null; };
      const d = box(""), tabs = box(".tabs"), tags = box(".task-tags-bottom"), more = box(".task-more-toggle"), meta = box(".task-meta-primary"), proj = box('[data-meta="proj"] .task-read-value');
      return { tabsFromTop: tabs.top - d.top, tagsTop: tags.top, moreTop: more.top, tagsBelowMeta: tags.top >= meta.bottom - 1, projH: proj.height, moreRight: more.right, tagsRight: tags.right }; });
    expect(m.tabsFromTop, "the tabs used to start 394px down").toBeLessThan(300);
    expect(Math.abs(m.tagsTop - m.moreTop), "one row").toBeLessThan(2);
    expect(m.tagsBelowMeta, "the row is under the fields, not beside them").toBe(true);
    expect(m.moreRight > m.tagsRight, "More details at the end of the row").toBe(true);
    expect(m.projH, "a long project name stays on one line").toBeLessThan(32);
    await expect(page.locator('#drawer [data-meta="proj"] .trv-text')).toHaveCSS("text-overflow", "ellipsis");
    /* the foot: a done stage shows a drawn tick (it was filled solid by the favourites' star rule), and the
       stage buttons and actions are low */
    await page.evaluate(id => { task(id).status = "progress"; renderDrawer(); }, ids.task);
    const f = await page.evaluate(() => { const done = document.querySelector("#drawer .task-stage-rail button.done"), svg = done && done.querySelector("svg"), foot = document.querySelector("#drawer .dr-foot");
      return { done: !!done, fill: svg && getComputedStyle(svg).fill, stageH: done && done.getBoundingClientRect().height, footH: foot.getBoundingClientRect().height, star: !!document.querySelector("#drawer .task-stage-rail button.star") }; });
    expect(f.done, "stages before the current one are done").toBe(true);
    expect(f.star, "not the favourites' class").toBe(false);
    expect(f.fill).toBe("none");
    expect(f.stageH).toBeLessThanOrEqual(30);
    expect(f.footH, "stages and actions together").toBeLessThanOrEqual(95);
    /* what More details opens comes under the row, before the tabs */
    await page.locator("#drawer .task-more-toggle").click();
    const o = await page.evaluate(() => { const b = s => document.querySelector("#drawer " + s).getBoundingClientRect(); return { sec: b(".task-meta-secondary"), tags: b(".task-tags-bottom"), tabs: b(".tabs") }; });
    expect(o.sec.top).toBeGreaterThanOrEqual(o.tags.bottom - 1);
    expect(o.tabs.top).toBeGreaterThanOrEqual(o.sec.bottom - 1);
  } finally {
    await page.evaluate(async ids => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + ids.task).catch(() => {}); if (ids.project) await apiFetch("DELETE", "/api/projects/" + ids.project).catch(() => {}); }, ids);
  }
});
