/* A task's row keeps its stage whole and its right-hand side in line (Oct 2026). "Internal Review" was cut off on Home's
   My priorities when a task had two labels beside its due date, and the dates, files and people stood wherever each
   row's mix of labels left them. Now the project's name (then the team) gives way on the meta line; a narrow row (a
   Home card) puts the due date and the people flush right with the first label (+N) under them; a wide one lines up
   slots — labels stacked two high, files, due date, people. taskRow draws every such list. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const stageWhole = row => row.evaluate(r => { const m = r.querySelector(".m"), b = [...m.querySelectorAll(".badge")].pop(); const mb = m.getBoundingClientRect(), bb = b.getBoundingClientRect(); return { inside: bb.right <= mb.right + 0.5, clipped: b.scrollWidth > b.clientWidth + 1 }; });
/* within the one list a row is in */
const edges = (row, sel, side) => row.evaluate((r, a) => [...r.closest(".panel").querySelectorAll(a.sel)].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect()[a.side])), { sel, side });

test("the stage stays whole and the right-hand side lines up, in a narrow card and a wide list", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36);
  const ids = await page.evaluate(async tag => {
    const ws = (await apiFetch("GET", "/api/bootstrap")).ws, before = ws.labels || [];
    const add = [["Graphic Designer", "#3B82F6"], ["Copywriter", "#EC4899"], ["Motion " + tag, "#10B981"]].map((x, i) => ({ id: "lbl_" + tag + i, name: x[0], color: x[1] }));
    await apiFetch("PUT", "/api/workspace", Object.assign({}, ws, { labels: before.concat(add) }));
    const pid = "p_row_" + tag; await apiFetch("POST", "/api/projects", { id: pid, name: "Insurance Campaign with a rather long project name " + tag, status: "active", owner: ME, teams: [] });
    /* a team with a long name: the meta line is tight, and the stage must still not give way */
    const team = "tm_row_" + tag; await apiFetch("POST", "/api/teams", { id: team, name: "Performance Marketing & Growth Partnerships", color: "#2563EB" });
    const review = WS.workflow.find(s => s.kind === "review").id, work = WS.workflow.find(s => s.kind === "work").id, d = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const mk = (title, st, labels, due, assets) => apiFetch("POST", "/api/tasks", { title: title + " " + tag, status: st, prio: "high", proj: pid, team, assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], labels, dueDate: d(due), assetCount: assets });
    const a = await mk("Copywriting & Visual Design In-Article CTA Banner & Playstore", review, add.map(l => l.id), 1, 3);
    const b = await mk("SEO - LP Milestone", work, [], 0, 0);
    const c = await mk("Roadshow backdrop", review, [add[0].id], -22, 2);
    await reloadAll(); go("home");
    return { before, pid, team, tasks: [a.id, b.id, c.id], task: a.id };
  }, tag);
  try {
    /* a narrow card: the stage whole; the first label and +2; due dates flush right, one under the other */
    const row = page.locator('#content .task-row[data-id="' + ids.task + '"]').first();
    await expect(row).toBeVisible();
    expect(await row.evaluate(r => r.getBoundingClientRect().width)).toBeLessThan(880);
    expect(await stageWhole(row)).toEqual({ inside: true, clipped: false });
    await expect(row.locator(".lbls-stack .lbl").first()).toHaveText("Graphic Designer");
    await expect(row.locator(".lbls-line")).toBeHidden();
    await expect(row.locator(".lbl-more-narrow")).toHaveText("+2");
    await expect(row.locator(".lbl-more-narrow")).toHaveAttribute("title", "Copywriter, Motion " + tag);
    const dueRight = await edges(row, ".task-row .rcell-due .due", "right");
    expect(dueRight.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...dueRight) - Math.min(...dueRight)).toBeLessThanOrEqual(1);
    /* a wide list: labels stacked two high with +1, slots in line */
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.evaluate(x => { S.projectTab = "overview"; go("projects", x.pid); }, ids);
    const wide = page.locator('#content .task-row[data-id="' + ids.task + '"]').first();
    await expect(wide).toBeVisible();
    expect(await wide.evaluate(r => r.getBoundingClientRect().width)).toBeGreaterThan(880);
    expect(await stageWhole(wide)).toEqual({ inside: true, clipped: false });
    await expect(wide.locator(".lbls-stack .lbl")).toHaveText(["Graphic Designer", "Copywriter"]);
    await expect(wide.locator(".lbl-more-wide")).toHaveText("+1");
    const lines = await wide.locator(".lbls-stack").evaluate(s => [...s.children].filter(c => c.offsetParent).map(c => Math.round(c.getBoundingClientRect().top)));
    expect(lines.length).toBe(2); expect(lines[1]).toBeGreaterThan(lines[0]);
    const dueLeft = await edges(wide, ".task-row .rcell-due", "left");
    expect(dueLeft.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...dueLeft) - Math.min(...dueLeft)).toBeLessThanOrEqual(1);
  } finally {
    await page.evaluate(async x => { for (const t of x.tasks) await apiFetch("DELETE", "/api/tasks/" + t).catch(() => {}); await apiFetch("DELETE", "/api/projects/" + x.pid).catch(() => {}); await apiFetch("DELETE", "/api/teams/" + x.team).catch(() => {}); const ws = (await apiFetch("GET", "/api/bootstrap")).ws; await apiFetch("PUT", "/api/workspace", Object.assign({}, ws, { labels: x.before })); }, ids);
  }
});
