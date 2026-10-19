/* The efficiency bonus in the page (Oct 2026, src/scoring-awards.js, server/scoring-awards.js). Smart Scoring and the
   bonus are turned on here through PUT /api/scoring/settings (Weighted Points too, for a base of 8 points) and put back
   at the end. The spec's case on the real server: an estimate of 8 h approved before the work, 5 h logged by the person
   assigned, the version approved, the task done. The admin — not assigned, not credited — sees in the task's Scoring &
   Intelligence panel "Estimated 8 h · Actual 5 h · Saved 3 h · Base 8.00 pts · Efficiency Bonus +1.10 pts · Earned 9.10
   pts · Pending review", how it is worked out, and approves it with a quality score; the person credited sees their
   approved award, with no buttons, at phone width too, in Indonesian as well, and reads that it is an operational
   metric, not compensation or a ranking. In Settings, the bonus policy's worked example follows the fields as they are
   typed. The member and the task are made and removed here. The server side: tests/scoring-awards.test.js. */
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
const openDrawer = (page, id) => page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, id);
/* the panel opened (it is folded at first, per person) */
const openPanel = page => page.evaluate(() => { const head = document.querySelector("#drawer .scr-panel .scr-head"); if (head && head.getAttribute("aria-expanded") !== "true") head.click(); });

test("the efficiency bonus: the line with 1.10 and 9.10, approved by someone independent, read by the person credited; the policy's worked example follows the fields", async ({ browser }) => {
  const errors = [];
  const page = await browser.newPage(); page.on("pageerror", e => errors.push(e.message));
  await signIn(page, ADMIN);
  const tag = Date.now().toString(36), MEMBER = { email: "bonus-" + tag + "@e2e.test", pw: "Bonus!Member-2026" };
  const original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
  expect(original.enabled).toBe(false);
  let o = {}, ctx = null;
  try {
    o = await page.evaluate(async x => {
      const o = { me: ME };
      await apiFetch("POST", "/api/members", { name: "Bima Bonus " + x.tag, email: x.email, perm: "member", cap: 40 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; o.member = Object.keys(people).find(id => people[id].email === x.email);
      await apiFetch("POST", "/api/members/" + o.member + "/password", { password: x.pw });
      /* Smart Scoring, Weighted Points and the bonus on */
      const cur = await apiFetch("GET", "/api/scoring/settings"), next = JSON.parse(JSON.stringify(cur.settings));
      next.enabled = true; next.modules.weighted.on = true; next.bonus.on = true;
      WS.scoring = (await apiFetch("PUT", "/api/scoring/settings", { settings: next, configVersion: cur.settings.configVersion })).settings;
      const queue = WS.workflow.find(s => s.kind === "queue").id;
      o.task = (await apiFetch("POST", "/api/tasks", { title: "Feed post bonus " + x.tag, status: queue, prio: "medium", assignee: o.member, assignees: [o.member], reviewer: ME, reviewers: [ME], effort: 8, assetCount: 5 })).id;
      /* the base: 8 Weighted Points; the estimate approved by the admin, who is not on the task, before the work */
      await apiFetch("PUT", "/api/tasks/" + o.task + "/scoring/weighted", { value: 8, reason: "agreed", rev: 0 });
      await apiFetch("POST", "/api/tasks/" + o.task + "/scoring/weighted/approve", {});
      await apiFetch("POST", "/api/tasks/" + o.task + "/scoring/hours/approve", {});
      await reloadAll(); return o;
    }, { tag, email: MEMBER.email, pw: MEMBER.pw });

    /* the person assigned starts, logs 5 h and uploads the work */
    ctx = await browser.newContext(); const mp = await ctx.newPage(); mp.on("pageerror", e => errors.push(e.message));
    await signIn(mp, MEMBER);
    await mp.evaluate(() => { if (typeof WorkspaceQuest !== "undefined" && WorkspaceQuest.skipAll) WorkspaceQuest.skipAll(); });
    await mp.evaluate(async id => {
      const work = WS.workflow.find(s => s.kind === "work").id;
      await apiFetch("POST", "/api/tasks/" + id + "/move", { type: "MOVE_TASK_STATUS", toStatusId: work });
      await apiFetch("POST", "/api/tasks/" + id + "/time", { workDate: scoringTimeToday(), minutes: 300, kind: "work" });
      const d = await apiFetch("GET", "/api/tasks/" + id); d.versions.push({ id: "ver_" + id + "_1", n: 1, annots: [] });
      await apiFetch("PUT", "/api/tasks/" + id, d);
    }, o.task);
    /* the admin approves the version and marks it done */
    await page.evaluate(async id => {
      const d = await apiFetch("GET", "/api/tasks/" + id); d.versions[0].state = "approved"; await apiFetch("PUT", "/api/tasks/" + id, d);
      await apiFetch("POST", "/api/tasks/" + id + "/move", { type: "MOVE_TASK_STATUS", toStatusId: "done" });
      await reloadAll();
    }, o.task);

    /* the admin's panel: the line, the breakdown, the review */
    await openDrawer(page, o.task); await openPanel(page);
    const box = page.locator('#drawer [data-scr-eff="' + o.task + '"]');
    await expect(box).toBeVisible();
    const line = box.locator(".scr-eff-line");
    for (const part of ["Estimated 8 h", "Actual 5 h", "Saved 3 h", "Base 8.00 pts", "Efficiency Bonus +1.10 pts", "Earned 9.10 pts", "Pending review"]) await expect(line).toContainText(part);
    expect(await line.getAttribute("title")).toContain("Bonus: 8.00 × 13.75% = 1.10 points. Earned: 8.00 + 1.10 = 9.10 points.");
    await expect(box).toContainText("Operational metric, not compensation or a ranking.");
    await box.getByRole("button", { name: "How it is worked out" }).click();
    await expect(box.locator(".scr-steps")).toContainText("Time saved: (8 − 5) ÷ 8 = 37.5% of the estimate.");
    await expect(box.getByRole("button", { name: "Hide how it is worked out" })).toBeVisible();
    await box.getByRole("button", { name: "Approve bonus" }).click();
    const modal = page.locator("#modal");
    await expect(modal).toContainText("Approving also verifies the time the people credited logged on this task.");
    await modal.locator("#sceQ").selectOption("4");
    await modal.locator("#sceReason").fill("Clean first pass");
    await modal.getByRole("button", { name: "Approve bonus" }).click();
    await expect(line).toContainText("Approved");
    await expect(box).toContainText("Approved by Admin E2E");
    await expect(box).toContainText("quality 4/5");
    await expect(box.getByRole("button", { name: "Approve bonus" })).toHaveCount(0);
    const verified = await page.evaluate(id => apiFetch("GET", "/api/tasks/" + id + "/time").then(r => r.entries.filter(e => e.source === "manual").map(e => e.verified)), o.task);
    expect(verified).toEqual([true]);

    /* the person credited: their own approved award, no buttons; at phone width; in Indonesian */
    await mp.setViewportSize({ width: 390, height: 820 });
    await mp.evaluate(() => reloadAll());
    await openDrawer(mp, o.task); await openPanel(mp);
    const mine = mp.locator('#drawer [data-scr-eff="' + o.task + '"]');
    await expect(mine.locator(".scr-eff-line")).toContainText("Earned 9.10 pts");
    await expect(mine.locator(".scr-eff-line")).toContainText("Approved");
    await expect(mine).toContainText("Your share: 100%");
    await expect(mine.getByRole("button", { name: "Approve bonus" })).toHaveCount(0);
    await expect(mine.getByRole("button", { name: "Reject" })).toHaveCount(0);
    expect(await mp.evaluate(() => { const b = document.querySelector("#drawer .scr-eff-box"); return [b.scrollWidth <= b.clientWidth + 1, document.documentElement.scrollWidth <= window.innerWidth + 1]; })).toEqual([true, true]);
    await mp.evaluate(() => { UI_LANG = "id"; renderDrawer(); if (typeof localizeVisibleText === "function") localizeVisibleText(document.getElementById("drawer")); });
    await expect(mine.locator(".scr-eff-line")).toContainText("Diperoleh 9.10 poin");
    await expect(mine).toContainText("Metrik operasional, bukan kompensasi atau peringkat.");
    await mp.evaluate(() => { UI_LANG = "en"; renderDrawer(); });

    /* Settings → Smart Scoring → Efficiency bonus: the worked example follows the fields */
    await page.evaluate(() => { closeDrawer(); go("settings", "scoring/review"); });
    const example = page.locator("#sceExample");
    await expect(example).toContainText("E 8 h, A 5 h, B 8 pts → bonus +1.10, earned 9.10");
    await page.locator("#sc_b_grace").fill("20");
    await expect(example).toContainText("bonus +0.70, earned 8.70");
    await page.locator("#sc_b_grace").fill("40");
    await expect(example).toContainText("within the 40% grace, so no bonus");
    await page.locator("#sc_b_grace").fill("10"); await page.locator("#sc_b_max").fill("10");
    await expect(example).toContainText("bonus +0.80, earned 8.80");
    for (const fixed of ["An independent approver, always", "Nobody approves their own bonus", "No cap per person or period in this version", "Never negative", "No retroactive awards"]) await expect(page.locator(".scr-pinned", { hasText: fixed })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    await page.evaluate(async x => {
      if (typeof SC !== "undefined") { SC.dirty = false; SC.draft = null; }
      if (x.o.task) await apiFetch("DELETE", "/api/tasks/" + x.o.task).catch(() => {});
      if (x.o.member) await apiFetch("DELETE", "/api/members/" + x.o.member).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings");
      await apiFetch("PUT", "/api/scoring/settings", { settings: x.original, configVersion: cur.settings.configVersion });
    }, { o, original });
    const back = (await page.evaluate(() => apiFetch("GET", "/api/scoring/settings"))).settings;
    expect(back.enabled).toBe(false); expect(back.bonus.on).toBe(false); expect(back.modules.weighted.on).toBe(false);
    await page.close();
  }
});
