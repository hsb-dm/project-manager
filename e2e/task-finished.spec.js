/* A task finished (Oct 2026): moved into Done or Delivered, everyone it concerns hears it is finished — not that it
   moved — and the people on each task that depended on it hear it can start. The server side:
   tests/notif-choices.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("finishing a task tells those it concerns, and those who waited on it", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36);
  const ids = await page.evaluate(async tag => {
    const mk = async (name, email) => { await apiFetch("POST", "/api/members", { name, email, perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people; return Object.keys(people).find(k => people[k].email === email); };
    const doer = await mk("Finisher " + tag, "fin-" + tag + "@e2e.test"), waiter = await mk("Waiter " + tag, "wait-" + tag + "@e2e.test");
    const work = WS.workflow.find(s => s.kind === "work").id;
    const a = await apiFetch("POST", "/api/tasks", { title: "First " + tag, status: work, prio: "medium", assignee: doer, assignees: [doer], reviewer: ME, reviewers: [ME] });
    const b = await apiFetch("POST", "/api/tasks", { title: "Waits " + tag, status: work, prio: "medium", assignee: waiter, assignees: [waiter], dependencies: [{ taskId: a.id }] });
    await reloadAll();
    const done = WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id;
    return { doer, waiter, a: a.id, b: b.id, done };
  }, tag);
  const sent = []; page.on("request", r => { if (r.method() === "POST" && /\/api\/notifications$/.test(r.url())) { try { sent.push(JSON.parse(r.postData() || "{}")); } catch (e) {} } });
  try {
    expect(await page.evaluate(x => blockingTasksOf(task(x.a)).map(t => t.id), ids)).toEqual([ids.b]);
    await page.evaluate(x => { openTask(x.a); }, ids);
    await page.locator('.task-stage-rail button[title="Move to Done"]').click();
    await expect.poll(() => sent.map(n => n.k + ":" + n.t)).toContain("completed:" + ids.a);
    await expect.poll(() => sent.map(n => n.k + ":" + n.t)).toContain("blocker:" + ids.b);
    expect(sent.find(n => n.k === "completed").recipients).toContain(ids.doer);
    expect(sent.find(n => n.k === "blocker").recipients).toEqual([ids.waiter]);
    expect(sent.some(n => n.k === "status" && n.t === ids.a), "finished, not merely moved").toBe(false);
  } finally {
    await page.evaluate(x => { closeDrawer(); return Promise.all([apiFetch("DELETE", "/api/tasks/" + x.b).catch(() => {}), apiFetch("DELETE", "/api/tasks/" + x.a).catch(() => {}), apiFetch("DELETE", "/api/members/" + x.doer).catch(() => {}), apiFetch("DELETE", "/api/members/" + x.waiter).catch(() => {})]); }, ids);
  }
});
