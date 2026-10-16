/* Smart Scoring in Analytics (Oct 2026, src/scoring-analytics.js, server/scoring-analytics.js). With Smart Scoring on,
   the Analytics screen gets a "Smart Scoring" section — operational metrics, not compensation or a ranking — with the
   real figures of the tasks completed: the locked estimate against the time logged, the unverified ones counted apart,
   the typical miss and the share within ±20 %, velocity, first-pass approval ("no data" when nothing was reviewed), and
   each figure explains itself on a tap. A filter narrows it to a project. Redrawn and switched to Indonesian it never
   shows its loading line again (it draws from what it has); at phone width nothing runs off the page. A member sees
   only their own figures, on their own page, and is refused anyone else's. Off again, the section is gone. Everything
   made here is removed and the settings are put back. The server side: tests/scoring-analytics.test.js. */
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
const setScoring = (page, patch) => page.evaluate(async patch => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings, next = JSON.parse(JSON.stringify(cur));
  (function merge(a, b) { Object.keys(b).forEach(k => { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") merge(a[k], b[k]); else a[k] = b[k]; }); })(next, patch);
  const r = await apiFetch("PUT", "/api/scoring/settings", { settings: next, configVersion: cur.configVersion }); WS.scoring = r.settings; return r.settings; }, patch);

test("the Smart Scoring section shows real figures with their explanations, filters by project, never blinks, fits a phone; a member sees only their own", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  await signIn(page, ADMIN);
  const original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
  expect(original.enabled).toBe(false);
  const tag = Date.now().toString(36), MEMBER = { email: "metrics-" + tag + "@e2e.test", pw: "Metrics!Member-2026" };
  let o = {}, ctx = null;
  try {
    await setScoring(page, { enabled: true, hours: { lockPolicy: "approve" } });
    o = await page.evaluate(async x => {
      const o = { me: ME, tasks: [] };
      await apiFetch("POST", "/api/members", { name: "Mira Metrics " + x.tag, email: x.email, perm: "member", cap: 40 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; o.member = Object.keys(people).find(id => people[id].email === x.email);
      await apiFetch("POST", "/api/members/" + o.member + "/password", { password: x.pw });
      o.proj = (await apiFetch("POST", "/api/projects", { name: "Analytics e2e " + x.tag, owner: ME, status: "active" })).find(p => p.name === "Analytics e2e " + x.tag).id;
      const open = WS.workflow.find(s => s.kind === "queue" || s.kind === "work").id;
      const make = async (title, who, effort) => { const t = await apiFetch("POST", "/api/tasks", { title: title + " " + x.tag, status: open, prio: "medium", proj: o.proj, assignee: who, assignees: [who], reviewer: ME, reviewers: [ME] });
        o.tasks.push(t.id); const d = await apiFetch("GET", "/api/tasks/" + t.id); d.effort = effort; await apiFetch("PUT", "/api/tasks/" + t.id, d); return t.id; };
      /* the member's feed posts: estimated 4 h, approved by the admin (not assigned) */
      o.feed = await make("Feed post launch", o.member, 4);
      const v = await apiFetch("GET", "/api/tasks/" + o.feed + "/scoring"); await apiFetch("POST", "/api/tasks/" + o.feed + "/scoring/hours/approve", { rev: v.rows.hours.rev });
      /* the admin's own logo: 2 h, never locked, 2 h logged by the admin */
      o.logo = await make("Logo concept", ME, 2);
      await apiFetch("POST", "/api/tasks/" + o.logo + "/time", { workDate: scoringTimeToday(), minutes: 120, kind: "work" });
      return o;
    }, { tag, email: MEMBER.email, pw: MEMBER.pw });
    /* the member logs 3 h on the feed posts, in their own browser */
    ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    const mp = await ctx.newPage();
    await signIn(mp, MEMBER);
    await mp.evaluate(id => apiFetch("POST", "/api/tasks/" + id + "/time", { workDate: scoringTimeToday(), minutes: 180, kind: "work" }), o.feed);
    const closed = await page.evaluate(() => WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id);
    await page.evaluate(async x => { for (const id of [x.o.feed, x.o.logo]) await apiFetch("POST", "/api/tasks/" + id + "/move", { type: "MOVE_TASK_STATUS", toStatusId: x.closed }); await reloadAll(); }, { o, closed });

    /* the Analytics screen: the section, narrowed to the project */
    await page.evaluate(() => go("analytics"));
    const sec = page.locator("#scrAn"), fig = id => sec.locator('[data-fig="' + id + '"]');
    await expect(sec).toBeVisible();
    await expect(sec.locator(".scr-an-title")).toContainText("Operational metrics, not compensation or a ranking.");
    await sec.locator("#scan_project").selectOption(o.proj);
    await expect(fig("thr").locator(".scr-an-v")).toHaveText("2");
    await expect(fig("est").locator(".scr-an-v")).toHaveText("4 h → 3 h");
    await expect(fig("est").locator(".scr-an-s")).toHaveText("1 task");
    await expect(fig("miss").locator(".scr-an-v")).toHaveText("25%");
    await expect(fig("within").locator(".scr-an-v")).toHaveText("0%");
    await expect(fig("within").locator(".scr-an-s")).toHaveText("0 took longer · 1 took less");
    await expect(fig("vel").locator(".scr-an-v")).toHaveText("6 h");
    await expect(fig("fp").locator(".scr-an-v"), "nothing reviewed: no data, not 0 %").toHaveText("no data");
    await expect(sec.locator(".scr-an-line").filter({ hasText: "Unverified, counted apart" })).toContainText("1 task · 2 h → 2 h");
    await expect(sec.locator(".scr-an-line").filter({ hasText: "Unverified, counted apart" })).toContainText("1 estimate never locked");
    /* each figure explains itself: on hover (title) and on a tap */
    await expect(fig("miss").locator("summary")).toHaveAttribute("title", /median of \|actual − estimate\| ÷ estimate/);
    await expect(fig("miss").locator(".scr-an-why")).toBeHidden();
    await fig("miss").locator("summary").click();
    await expect(fig("miss").locator(".scr-an-why")).toBeVisible();
    /* people in name order, never ranked */
    const names = await sec.locator(".scr-an-person .scr-an-pn").allTextContents();
    expect(names.length).toBe(2);
    expect(names).toEqual(names.slice().sort((a, b) => a.localeCompare(b)));
    /* the numbers are the server's */
    const served = await page.evaluate(p => apiFetch("GET", "/api/scoring/analytics?weeks=" + S.range + "&project=" + p), o.proj);
    expect([served.throughput.tasks, served.estimates.verified.estimateHours, served.estimates.verified.actualHours, served.estimates.verified.accuracy.medianError, served.velocity.total]).toEqual([2, 4, 3, 0.25, 6]);

    /* nothing blinks: drawn again and in Indonesian, the loading line never comes back */
    await page.evaluate(() => { window.__scanBlinks = 0; window.__scanObs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && (n.matches(".scr-an-loading") || n.querySelector(".scr-an-loading"))) window.__scanBlinks++; }))); window.__scanObs.observe(document.getElementById("content"), { childList: true, subtree: true }); });
    /* each redraw also fetches the figures again in the background (the 5-second pause is lifted here) */
    await page.evaluate(() => { SCAN.at = {}; renderScreen(false); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { SCAN.at = {}; renderScreen(false); SCAN.at = {}; setLanguage("id"); renderScreen(false); });
    await expect(sec.locator(".scr-an-title")).toContainText("Metrik operasional, bukan kompensasi atau peringkat.");
    await expect(fig("fp").locator(".scr-an-v")).toHaveText("tidak ada data");
    await expect(fig("est").locator(".scr-an-v")).toHaveText("4 jam → 3 jam");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => { window.__scanObs.disconnect(); return window.__scanBlinks; })).toBe(0);
    await page.evaluate(() => { setLanguage("en"); renderScreen(false); });
    /* at phone width nothing runs off the page */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => renderScreen(false));
    await expect(fig("thr")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const box = await fig("vel").boundingBox(); expect(box.x + box.width).toBeLessThanOrEqual(391);
    await page.setViewportSize({ width: 1366, height: 1000 });

    /* the member: no team analytics; their own figures on their own page; nobody else's */
    await mp.evaluate(() => reloadAll());
    expect(await mp.evaluate(p => apiFetch("GET", "/api/scoring/analytics?project=" + p).then(r => [r.scope, r.throughput.tasks, r.people === undefined], e => e.message), o.proj)).toEqual(["own", 1, true]);
    expect(await mp.evaluate(id => apiFetch("GET", "/api/scoring/analytics?person=" + id).then(() => "allowed", e => e.message), o.me)).toMatch(/permission/);
    await mp.evaluate(id => go("team", id), o.member);
    const mine = mp.locator("#scrAnMember");
    await expect(mine).toBeVisible();
    await expect(mine.locator("h2")).toHaveText("Your Smart Scoring figures");
    await expect(mine.locator('[data-fig="thr"] .scr-an-v')).toHaveText("1");
    await expect(mine.locator('[data-fig="est"] .scr-an-v')).toHaveText("4 h → 3 h");
    await expect(mine.locator(".scr-an-person"), "no one else's figures").toHaveCount(0);
    await mp.evaluate(id => go("team", id), o.me);
    await expect(mp.locator("#content h1")).toBeVisible();
    await expect(mp.locator("#scrAnMember"), "someone else's page: no figures").toHaveCount(0);
    await mp.setViewportSize({ width: 390, height: 844 });
    await mp.evaluate(id => go("team", id), o.member);
    await expect(mine).toBeVisible();
    expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    /* the admin sees the member's figures on the member's page */
    await page.evaluate(id => go("team", id), o.member);
    await expect(page.locator("#scrAnMember h2")).toContainText("Smart Scoring figures of Mira Metrics");

    /* off again: the section is gone */
    await setScoring(page, { enabled: false });
    await page.evaluate(() => go("analytics"));
    await expect(page.locator("#content .an-head")).toBeVisible();
    await expect(page.locator("#scrAn")).toHaveCount(0);
  } finally {
    if (ctx) await ctx.close();
    await page.evaluate(async x => { if (UI_LANG !== "en") setLanguage("en");
      for (const id of x.o.tasks || []) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      if (x.o.proj) await apiFetch("DELETE", "/api/projects/" + x.o.proj).catch(() => {});
      if (x.o.member) await apiFetch("DELETE", "/api/members/" + x.o.member).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings"); const r = await apiFetch("PUT", "/api/scoring/settings", { settings: x.original, configVersion: cur.settings.configVersion }); WS.scoring = r.settings; }, { o, original });
  }
  const back = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
  expect([back.enabled, back.hours.lockPolicy]).toEqual([false, original.hours.lockPolicy]);
  await page.close();
});
