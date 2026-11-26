/* What AI Intelligence is told about output (Nov 2026, src/ai-insights.js), on the real server: how many assets each
   person has, what they produced in a project in a given month, and Home's and Analytics' figures beside it. A new
   member and a project of their own, three finished tasks made through the API — one this month with a version, one
   this month with each person's count typed, one finished two months ago, which the server sends slim (no versions)
   — and one still open. The snapshot the page sends carries the exact counts, equal to the person page's own
   (memberAssets) and Home's (dashCounts) and Analytics' (metrics); the answer without a model gives the same number in
   Indonesian and English; the request to /api/ai/chat carries it. Everything made here is removed. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the snapshot counts each person's assets by month and project, slim tasks included, as the app's screens do", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const tag = Date.now().toString(36);
  const o = { tag, tasks: [], member: null, project: null };
  try {
    Object.assign(o, await page.evaluate(async t => {
      const o = { tasks: [] };
      await apiFetch("POST", "/api/members", { name: "Rina Output " + t, email: "rina-out-" + t + "@e2e.test", perm: "member", cap: 20 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; o.member = Object.keys(people).find(id => people[id].email === "rina-out-" + t + "@e2e.test");
      o.project = "pout" + t;
      await apiFetch("POST", "/api/projects", { id: o.project, name: "Output project " + t, status: "active", owner: ME, startDate: iso(-90), dueDate: iso(30) });
      const done = WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id, first = WS.workflow[0].id;
      const mk = b => apiFetch("POST", "/api/tasks", Object.assign({ status: first, prio: "medium", proj: o.project, reviewer: ME, reviewers: [ME] }, b)).then(d => { o.tasks.push(d.id); return d.id; });
      const move = id => apiFetch("POST", "/api/tasks/" + id + "/move", { type: "MOVE_TASK_STATUS", toStatusId: done });
      /* this month: mine, four assets, my version on it */
      o.a = await mk({ title: "Output A " + t, assignee: ME, assignees: [ME], assetCount: 4, versions: [{ n: 1, state: "pending", color: "#123A6B", note: "" }] }); await move(o.a);
      /* this month: shared, each one's count typed — 2 mine, 4 hers */
      o.b = await mk({ title: "Output B " + t, assignee: ME, assignees: [ME, o.member], assetCount: 6, meta: { assetSplit: { [ME]: 2, [o.member]: 4 } } }); await move(o.b);
      /* two months ago (the 10th, at noon): finished long enough ago that the server sends it slim */
      const n = new Date(); o.oldAt = new Date(n.getFullYear(), n.getMonth() - 2, 10, 12).toISOString();
      o.c = await mk({ title: "Output C " + t, status: done, completedAt: o.oldAt, assignee: o.member, assignees: [o.member], assetCount: 3 });
      /* still open: counts in what she has produced, not in what was delivered */
      o.d = await mk({ title: "Output D " + t, assignee: o.member, assignees: [o.member], assetCount: 2, effort: 30, dueDate: iso(2) });
      return o;
    }, tag));
    await page.reload();
    await page.waitForFunction(() => window.ZC_READY === true && API.on);
    const r = await page.evaluate(o => {
      const c = task(o.c), cur = aiMonthKey(TODAY), prev = aiMonthShift(cur, -1), m3 = aiMonthShift(cur, -2), t0 = performance.now(), ctx = aiContext(60), took = performance.now() - t0;
      return { slim: !!c._slim, versionsLoaded: (c.versions || []).length, cur, prev, m3, ctx, took, ma: memberAssets(o.member), me: person(ME).name, dc: dashCounts(), mt: metrics(),
        id: aiLocalAnswer("berapa asset Rina Output " + o.tag + " bulan ini"), en: aiLocalAnswer("How many assets did Rina Output " + o.tag + " produce this month?"),
        old: aiLocalAnswer("how many assets did Rina Output " + o.tag + " produce in " + aiMonthName(m3).split(" ")[0]),
        monthCur: aiMonthTag(cur), monthM3: aiMonthTag(m3), max: AI_CTX_MAX };
    }, o);
    /* the old task really is slim, without its versions: its assets still count */
    expect(r.slim).toBe(true);
    expect(r.versionsLoaded).toBe(0);
    const ctx = r.ctx, name = "Rina Output " + tag, proj = "Output project " + tag;
    expect(ctx.length).toBeLessThanOrEqual(r.max);
    /* ASSETS BY PERSON: 4 typed this month + 3 two months ago (hers as the assignee: an estimate) + 2 on the open task */
    expect(ctx).toContain("- " + name + ": produced=9* delivered=7* " + r.cur + "=4 " + r.prev + "=0 | tasks finished: all=2 " + r.cur + "=1 " + r.prev + "=0");
    /* the person page's own count, for the same data */
    expect(r.ma).toEqual({ total: 9, delivered: 7, month: 4, attributed: true });
    /* her project, month by month, and her line in each month */
    expect(ctx).toContain("- " + proj + ": " + r.cur + " tasks=2 assets=10; " + r.m3 + " tasks=1 assets=3 | all time: tasks=3 assets=13");
    const px = ctx.slice(ctx.indexOf("MONTHLY OUTPUT BY PERSON x PROJECT"), ctx.indexOf("\nOPEN TASKS ("));
    expect(px).toContain("- " + name + ": tasks=1 assets=4 | all in " + proj);
    expect(px).toContain("- " + name + ": tasks=1 assets=3* | all in " + proj);
    expect(px.indexOf(r.monthCur)).toBeLessThan(px.indexOf(r.monthM3));
    /* Home's and Analytics' figures, as their screens have them, all ahead of the open tasks */
    expect(ctx).toContain("HOME DASHBOARD (as the viewer's Home shows it): my tasks=" + r.dc.mine.length + ", due today=" + r.dc.today.length + ", in review=" + r.dc.inrev.length);
    expect(ctx).toContain("assets delivered=" + r.dc.assetsDone + " (from completed tasks: every done stage, Declined included, so it can differ from ASSETS IN ALL), assets in production=" + r.dc.assetsOpen);
    expect(ctx).toContain("- totals: created=" + r.mt.totalCreated + " completed=" + r.mt.totalCompleted + " avg completion=" + r.mt.avgCompletion + " days");
    expect(ctx).toMatch(/OVER CAPACITY \(open hours above their weekly capacity, as Team workload shows\): .*Rina Output \w+ 150% \(30h of 20h\)/);
    for (const h of ["HOME DASHBOARD", "RISK:", "PIPELINE", "ANALYTICS (", "ACTIVITY IN THE LAST 7 DAYS", "ASSETS BY PERSON", "MONTHLY OUTPUT BY PERSON x PROJECT"]) expect(ctx.indexOf(h), h).toBeLessThan(ctx.indexOf("\nOPEN TASKS ("));
    /* the answer without a model: the same number, in the question's language */
    expect(r.id).toContain("**" + name + "** menghasilkan **4** aset pada ");
    expect(r.id).toContain("(bulan ini), dari **1** task selesai.");
    expect(r.en).toContain("**" + name + "** produced **4** asset(s) in ");
    expect(r.old).toContain("**" + name + "** produced **3*** asset(s) in ");
    /* it stays quick in the browser */
    expect(r.took).toBeLessThan(1500);

    /* what the chat sends the server carries it, and the server tells the model where to look */
    await page.route("**/api/ai/chat", async route => { const body = route.request().postDataJSON(); await page.evaluate(b => { window.__ask = b; }, body); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "ok" }) }); });
    await page.evaluate(() => { window.aiConfigured = () => true; aiChatToggle(true); aiAsk("berapa aset Rina bulan ini?"); });
    await expect.poll(() => page.evaluate(() => !!window.__ask && !AI_CHAT.busy)).toBe(true);
    const body = await page.evaluate(() => window.__ask);
    expect(body.purpose).toBe("intelligence");
    expect(body.context).toContain("- " + name + ": produced=9* delivered=7* ");
  } finally {
    await page.evaluate(async o => {
      for (const id of o.tasks) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      if (o.project) await apiFetch("DELETE", "/api/projects/" + o.project).catch(() => {});
      if (o.member) await apiFetch("DELETE", "/api/members/" + o.member).catch(() => {});
    }, o).catch(() => {});
  }
});
