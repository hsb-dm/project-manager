/* What reaches me (Oct 2026): in Settings → Notifications each person turns kinds of notification on or off — in the
   bell, by e-mail, in the browser. The bell keeps to it at once. Whoever's role lacks choose_notifications sees the
   table locked; an admin gives or takes the choice per role in Roles & permissions. The server side:
   tests/notif-choices.test.js. */
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

test("each person chooses what reaches them; the bell keeps to it; a role without the choice sees it locked", async ({ browser }) => {
  const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await signIn(admin, ADMIN);
  const tag = Date.now().toString(36), other = { email: "nc-" + tag + "@e2e.test", pw: "Choose!Member-2026x" };
  const ids = await admin.evaluate(async o => {
    await apiFetch("POST", "/api/members", { name: "Choosy Member " + o.tag, email: o.email, perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email);
    await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw });
    const t = await apiFetch("POST", "/api/tasks", { title: "Choice task " + o.tag, status: WS.workflow[0].id, prio: "medium" });
    return { member: id, task: t.id };
  }, Object.assign({ tag }, other));
  const role = await admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => b.roles.find(r => r.id === "member")));
  try {
    /* the admin's page: one table, the old Chat / Tasks / Projects lists are its Browser column now */
    await admin.evaluate(() => go("settings", "notifications"));
    const table = admin.locator(".nc-panel .nc-table");
    await expect(admin.locator(".nc-panel h2")).toHaveText("What reaches me");
    await expect(table.locator(".nc-head .nc-way")).toHaveText(["In the bell", "Email", "Browser"]);
    await expect(table.locator('.nc-row[data-cat="signup"]')).toHaveCount(1);   /* an approver has sign-ups */
    await expect(table.locator('.nc-row[data-cat="chat_reply"] .nc-na')).toHaveCount(1);   /* not e-mailed at all */
    await expect(admin.locator(".nc-panel .nc-hint")).toContainText("browser notifications are on");
    await expect(table.locator('.nc-row[data-cat="task_assigned"] input[data-way="push"]')).toBeDisabled();
    expect(await admin.locator("#content section.panel h2").allTextContents()).not.toContain("Chat");
    /* in Roles & permissions, every role has the choice to begin with */
    await admin.evaluate(() => { go("settings", "roles"); roleModal("member"); });
    await expect(admin.locator('#modal [data-cap="choose_notifications"]')).toHaveClass(/\bon\b/);
    await admin.evaluate(() => closeModal());

    /* the member has been shown around before: the Workspace Quest welcome opens 180 ms after a first sign-in and
       would cover the checkbox below when the spec reaches it first */
    const first = await browser.newContext(), fp = await first.newPage();
    await signIn(fp, other);
    await fp.evaluate(() => { myPrefs().onboardingDone = true; return saveMyPrefs(); });
    await first.close();
    /* the member turns "Assigned to me" off in the bell; it goes from the bell at once */
    const two = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    await signIn(two, other);
    await admin.evaluate(x => apiFetch("POST", "/api/notifications", { k: "assigned", recipients: [x.member], t: x.task }), ids);
    await expect.poll(() => two.evaluate(t => NOTIFS.filter(n => n.t === t).map(n => n.k), ids.task), { timeout: 8000 }).toEqual(["assigned"]);
    await two.evaluate(() => go("settings", "notifications"));
    const box = two.locator('.nc-row[data-cat="task_assigned"] input[data-way="app"]');
    await expect(box).toBeChecked();
    await box.uncheck();
    await expect.poll(() => two.evaluate(t => NOTIFS.filter(n => n.t === t).length, ids.task)).toBe(0);
    await expect.poll(() => admin.evaluate(id => apiFetch("GET", "/api/bootstrap").then(b => ((b.people[id].prefs || {}).notif || {})["task_assigned:app"]), ids.member)).toBe(false);
    /* new ones of that kind stay out; another kind comes in */
    await admin.evaluate(x => Promise.all([apiFetch("POST", "/api/notifications", { k: "assigned", recipients: [x.member], t: x.task }), apiFetch("POST", "/api/notifications", { k: "mention", recipients: [x.member], t: x.task })]), ids);
    await expect.poll(() => two.evaluate(t => NOTIFS.filter(n => n.t === t).map(n => n.k), ids.task), { timeout: 8000 }).toEqual(["mention"]);
    /* back on: the bell has them again */
    await box.check();
    await expect.poll(() => two.evaluate(t => NOTIFS.filter(n => n.t === t).map(n => n.k).sort(), ids.task)).toEqual(["assigned", "assigned", "mention"]);
    /* a role without the choice: the table is locked, and says why */
    await admin.evaluate(r => apiFetch("PUT", "/api/roles/member", Object.assign({}, r, { permissions: r.permissions.filter(c => c !== "choose_notifications") })), role);
    await two.reload(); await ready(two);
    await two.evaluate(() => go("settings", "notifications"));
    await expect(two.locator(".nc-panel .nc-note")).toContainText("Your role receives every notification the workspace sends");
    await expect(two.locator('.nc-row[data-cat="task_assigned"] input[data-way="app"]')).toBeDisabled();
    /* Indonesian */
    await two.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(two.locator(".nc-panel h2")).toHaveText("Yang ingin saya terima");
    await expect(two.locator(".nc-head .nc-way").first()).toHaveText("Di lonceng");
  } finally {
    await admin.evaluate(r => apiFetch("PUT", "/api/roles/member", r).catch(() => {}), role);
    await admin.evaluate(x => Promise.all([apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {}), apiFetch("DELETE", "/api/members/" + x.member).catch(() => {})]), ids);
  }
});
