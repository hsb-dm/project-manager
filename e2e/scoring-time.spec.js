/* The time log in the task (Oct 2026, src/scoring-time.js, server/scoring-time.js). With Smart Scoring off a task's
   Actual is typed as before. On (with its Effort Hours), the Actual box becomes the total of the time logged, read
   only, with "Log time": the person assigned logs a day's time — work, revision or blocked — changes and deletes it,
   and Actual follows (blocked time kept apart). A colleague on the task logs their own and has no buttons on anyone
   else's; the admin's open tab sees their time arrive. A correction of someone else's time needs a reason. In
   Indonesian too, and at phone width. The member is made and removed here, the task deleted, the settings put back.
   The server side: tests/scoring-time.test.js. */
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
const saved = (page, id) => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(d => (d.meta || {}).actualEffort || 0), id);

test("Actual becomes the time logged: logged, changed and deleted by the person assigned, blocked kept apart, a colleague only their own, a correction with a reason", async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page, ADMIN);
  const tag = Date.now().toString(36), MEMBER = { email: "time-" + tag + "@e2e.test", pw: "Time!Member-2026" };
  const original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
  expect(original.enabled).toBe(false);
  let o = {}, ctx = null;
  try {
    o = await page.evaluate(async x => {
      const o = { me: ME };
      await apiFetch("POST", "/api/members", { name: "Tari Time " + x.tag, email: x.email, perm: "member", cap: 40 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; o.member = Object.keys(people).find(id => people[id].email === x.email);
      await apiFetch("POST", "/api/members/" + o.member + "/password", { password: x.pw });
      o.task = (await apiFetch("POST", "/api/tasks", { title: "Time log " + x.tag, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME, o.member], effort: 4 })).id;
      await reloadAll(); return o;
    }, { tag, email: MEMBER.email, pw: MEMBER.pw });

    /* off: Actual is typed as before, and the log answers that it is off */
    await openDrawer(page, o.task);
    await expect(page.locator("#drawer .effort input")).toHaveCount(2);
    await expect(page.locator("#drawer .scr-time-actual")).toHaveCount(0);
    expect(await page.evaluate(id => apiFetch("POST", "/api/tasks/" + id + "/time", { workDate: "2026-10-01", minutes: 30 }).then(() => "saved", e => e.message), o.task)).toMatch(/Time logging is off/);

    /* on */
    await page.evaluate(async () => { const cur = await apiFetch("GET", "/api/scoring/settings"); const r = await apiFetch("PUT", "/api/scoring/settings", { settings: Object.assign({}, cur.settings, { enabled: true }), configVersion: cur.settings.configVersion }); WS.scoring = r.settings; renderDrawer(); });
    await expect(page.locator("#drawer .effort input"), "the Estimate is still typed").toHaveCount(1);
    await page.locator("#drawer .effort input").fill("5"); await page.locator("#drawer .effort input").dispatchEvent("change");
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(d => d.effort), o.task)).toBe(5);
    const actual = page.locator("#drawer .scr-time-actual"), modal = page.locator("#modal"), entries = modal.locator(".scr-time-entry");
    await expect(actual).toContainText("Actual 0 h");
    await actual.getByRole("button", { name: "Log time" }).click();
    await expect(modal.locator(".scr-time-empty")).toHaveText("No time logged yet.");
    await expect(modal.locator("#scrTimeDate")).toHaveValue(await page.evaluate(() => scoringTimeToday()));
    const add = async (len, kind, from, to) => {
      if (len !== null) await modal.locator("#scrTimeDur").fill(len);
      if (kind) await modal.locator('.scr-time-kind [data-kind="' + kind + '"]').click();
      if (from) { await modal.locator("#scrTimeFrom").fill(from); await modal.locator("#scrTimeTo").fill(to); }
      await modal.getByRole("button", { name: "Add entry" }).click();
    };
    await add("1:30");
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toContainText("1 h 30 min");
    await expect(actual).toContainText("Actual 1.5 h");
    expect(await saved(page, o.task)).toBe(1.5);
    /* blocked: logged, not in Actual */
    await add("45", "blocked");
    await expect(entries).toHaveCount(2);
    await expect(modal.locator("#scrTimeSum")).toContainText("Blocked 45 min");
    await expect(actual).toContainText("Actual 1.5 h");
    /* revision from 09:00 to 09:30: the half hour is the length */
    await add(null, "revision", "09:00", "09:30");
    await expect(entries).toHaveCount(3);
    await expect(actual).toContainText("Actual 2 h");
    await expect(modal.locator(".scr-time-entry", { hasText: "Revision" })).toContainText("09:00–09:30");
    /* changed: 1:30 becomes 2:00 */
    await modal.locator(".scr-time-entry", { hasText: "1 h 30 min" }).getByRole("button", { name: "Edit" }).click();
    await expect(modal.locator("#scrTimeDur")).toHaveValue("1:30");
    await modal.locator("#scrTimeDur").fill("2:00");
    await modal.getByRole("button", { name: "Save changes" }).click();
    await expect(actual).toContainText("Actual 2.5 h");
    await expect(modal.locator(".scr-time-entry", { hasText: "2 h" }).first()).toContainText("edited");
    /* deleted: the revision */
    await modal.locator(".scr-time-entry", { hasText: "Revision" }).getByRole("button", { name: "Delete" }).click();
    await modal.locator(".scr-time-del").getByRole("button", { name: "Delete" }).click();
    await expect(entries).toHaveCount(2);
    await expect(actual).toContainText("Actual 2 h");
    expect(await saved(page, o.task)).toBe(2);
    /* what is refused says why, there */
    await add("25:00", "work");
    await expect(modal.locator("#scrTimeMsg")).toHaveText("An entry is from 1 minute to 24 hours");
    await expect(entries).toHaveCount(2);
    /* in Indonesian */
    await page.evaluate(id => { UI_LANG = "id"; scoringTimeOpen(id); }, o.task);
    await expect(modal.locator(".scr-time-fhead")).toHaveText("Catat waktu");
    await expect(modal.getByRole("button", { name: "Tambah entri" })).toBeVisible();
    await expect(modal.locator("#scrTimeSum")).toContainText("Terblokir 45 mnt");
    await page.evaluate(id => { UI_LANG = "en"; closeModal(); renderDrawer(); }, o.task);
    /* at phone width nothing runs off the side */
    await page.setViewportSize({ width: 390, height: 820 });
    await page.evaluate(id => scoringTimeOpen(id), o.task);
    await expect(entries).toHaveCount(2);
    expect(await page.evaluate(() => { const m = document.getElementById("modal"), b = m.querySelector(".modal-body"); return [m.scrollWidth <= m.clientWidth + 1, b.scrollWidth <= b.clientWidth + 1, document.documentElement.scrollWidth <= window.innerWidth + 1]; })).toEqual([true, true, true]);
    await page.evaluate(() => closeModal());
    await page.setViewportSize({ width: 1360, height: 860 });

    /* the colleague on the task, in their own browser: they see everyone's time and log only their own */
    ctx = await browser.newContext(); const mp = await ctx.newPage();
    await signIn(mp, MEMBER);
    /* a new member is greeted by the Workspace Quest a moment after signing in; its welcome would take the log's place */
    await mp.evaluate(() => { if (typeof WorkspaceQuest !== "undefined" && WorkspaceQuest.skipAll) WorkspaceQuest.skipAll(); });
    await openDrawer(mp, o.task);
    await expect(mp.locator("#drawer .scr-time-actual")).toContainText("Actual 2 h");
    await mp.locator("#drawer .scr-time-actual").getByRole("button", { name: "Log time" }).click();
    const mm = mp.locator("#modal"), theirs = mm.locator(".scr-time-entry");
    await expect(theirs).toHaveCount(2);
    await expect(mm.locator(".scr-time-entry button"), "not theirs: no edit, no delete").toHaveCount(0);
    await mm.locator("#scrTimeDur").fill("60");
    await mm.getByRole("button", { name: "Add entry" }).click();
    await expect(theirs).toHaveCount(3);
    await expect(mm.locator(".scr-time-entry", { hasText: "Tari Time" }).locator("button")).toHaveCount(2);
    await expect(mp.locator("#drawer .scr-time-actual")).toContainText("Actual 3 h");
    const adminEntry = await page.evaluate(id => apiFetch("GET", "/api/tasks/" + id + "/time").then(r => r.entries.find(e => e.userId === ME).id), o.task);
    expect(await mp.evaluate(x => apiFetch("PUT", "/api/tasks/" + x.task + "/time/" + x.e, { minutes: 5 }).then(() => "saved", e => e.message), { task: o.task, e: adminEntry })).toMatch(/permission/);
    /* the admin's open drawer learns of it by itself */
    await expect(actual).toContainText("Actual 3 h");

    /* the admin corrects the colleague's hour: a reason first */
    await actual.getByRole("button", { name: "Log time" }).click();
    const row = modal.locator(".scr-time-entry", { hasText: "Tari Time" });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(modal.locator(".scr-time-fhead")).toContainText("Edit entry · Tari Time");
    await modal.locator("#scrTimeDur").fill("45");
    await modal.getByRole("button", { name: "Save changes" }).click();
    await expect(modal.locator("#scrTimeMsg")).toHaveText("Say why this time is corrected: a correction needs a reason");
    await modal.locator("#scrTimeReason").fill("Fifteen minutes were the stand-up");
    await modal.getByRole("button", { name: "Save changes" }).click();
    await expect(row).toContainText("corrected by Admin E2E");
    await expect(row).toContainText("45 min");
    await expect(actual).toContainText("Actual 2.75 h");
    expect(await saved(page, o.task)).toBe(2.75);
    await page.evaluate(() => closeModal());
    /* the line Smart Scoring's task panel shows: the totals and the button, from what was loaded */
    await page.evaluate(id => document.querySelector("#drawer .effort").insertAdjacentHTML("afterend", scoringTimeRowHtml(task(id))), o.task);
    const line = page.locator("#drawer .scr-time-row");
    await expect(line).toContainText("Logged 2.75 h");
    await expect(line).toContainText("Blocked 45 min (not in Actual)");
    await line.getByRole("button", { name: "Log time" }).click();
    await expect(entries).toHaveCount(3);
    await page.evaluate(() => closeModal());
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    await page.evaluate(async x => {
      if (x.o.task) await apiFetch("DELETE", "/api/tasks/" + x.o.task).catch(() => {});
      if (x.o.member) await apiFetch("DELETE", "/api/members/" + x.o.member).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings");
      await apiFetch("PUT", "/api/scoring/settings", { settings: x.original, configVersion: cur.settings.configVersion });
    }, { o, original });
    expect((await page.evaluate(() => apiFetch("GET", "/api/scoring/settings"))).settings.enabled).toBe(false);
    await page.close();
  }
});
