/* Settings shows each tab only to whoever may do what it is for (Oct 2026): a member has their own — profile, menu &
   home, the look, notifications — and none of the workspace's, its cloud storage, AI, e-mail delivery or backups;
   each comes with its capability. In Roles & permissions the capabilities stand in groups, each with its mark, how
   many are on, and one button for all of them — choosing one's own notifications among them. The server side:
   tests/settings-access.test.js. */
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
const tabs = page => page.locator(".settings .snav button").evaluateAll(b => b.map(x => x.getAttribute("onclick").match(/settingsTab='([a-z]+)'/)[1]));

test("a member sees their own settings only; each system area comes with its capability; roles in groups", async ({ browser }) => {
  const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await signIn(admin, ADMIN);
  const tag = Date.now().toString(36), other = { email: "sa-" + tag + "@e2e.test", pw: "Access!Member-2026x" };
  const member = await admin.evaluate(async o => { await apiFetch("POST", "/api/members", { name: "Plain Member " + o.tag, email: o.email, perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email); await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw }); return id; }, Object.assign({ tag }, other));
  const role = await admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => b.roles.find(r => r.id === "member")));
  const setRole = perms => admin.evaluate(p => apiFetch("PUT", "/api/roles/member", p), Object.assign({}, role, { permissions: perms }));
  try {
    /* the admin: every tab */
    await admin.evaluate(() => go("settings", "profile"));
    expect(await tabs(admin)).toEqual(["profile", "layout", "workspace", "theme", "workflow", "automation", "scoring", "briefs", "fields", "labels", "tags", "members", "roles", "teams", "ai", "notifications", "integrations", "backup"]);
    /* Roles & permissions: in groups, each with its mark and count; choosing one's own notifications is there */
    await admin.evaluate(() => { go("settings", "roles"); roleModal("member"); });
    const modal = admin.locator("#modal");
    await expect(modal.locator(".cap-group-head b")).toHaveText(["Workspace & settings", "People & teams", "Notifications", "Projects", "Tasks", "Reviews & requests", "Progress notes", "Assets & knowledge", "AI Hub & gallery", "Insights", "Smart Scoring"]);
    await expect(modal.locator(".cap-group-head .cap-group-ico svg")).toHaveCount(11);
    const notif = modal.locator(".cap-group").filter({ has: admin.locator(".cap-group-head b", { hasText: /^Notifications$/ }) });
    await expect(notif.locator(".cap-row .pl b")).toHaveText(["Choose which notifications they receive, and how", "Set which events the workspace sends, in the app and by e-mail", "Send announcement emails to every member"]);
    await expect(notif.locator('[data-cap="choose_notifications"]')).toHaveClass(/\bon\b/);
    await expect(notif.locator(".cap-count")).toHaveText("1/3");
    /* one button for the whole group */
    await notif.locator(".cap-all").click();
    await expect(notif.locator(".cap-count")).toHaveText("3/3");
    await expect(notif.locator('[data-cap="send_announcements"]')).toHaveClass(/\bon\b/);
    await notif.locator(".cap-all").click();
    await expect(notif.locator(".cap-count")).toHaveText("0/3");
    await notif.locator('[data-cap="choose_notifications"]').click();
    await expect(notif.locator(".cap-count")).toHaveText("1/3");
    await admin.evaluate(() => closeModal());
    /* Indonesian */
    await admin.evaluate(() => { setLanguage("id"); roleModal("member"); });
    await expect(admin.locator("#modal .cap-group-head b").nth(2)).toHaveText("Notifikasi");
    await expect(admin.locator('#modal [data-cap="choose_notifications"]').locator("xpath=..").locator(".pl b")).toHaveText("Memilih notifikasi yang diterima, dan caranya");
    await admin.evaluate(() => { closeModal(); setLanguage("en"); });

    /* a member: their own tabs only — none of the system's */
    const two = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    await signIn(two, other);
    await two.evaluate(() => { S.settingsTab = "integrations"; go("settings"); });
    expect(await tabs(two)).toEqual(["profile", "layout", "theme", "notifications"]);
    expect(await two.evaluate(() => S.settingsTab)).toBe("profile");   /* a tab they may not see opens their profile */
    await two.evaluate(() => { S.settingsTab = "notifications"; renderScreen(false); });
    const heads = await two.locator("#content section.panel h2").allTextContents();
    expect(heads).toContain("What reaches me");
    for (const h of ["In-app & email notifications", "Email delivery", "SMTP", "Delivery log", "Announcement email"]) expect(heads.some(x => x.includes(h)), h).toBe(false);
    /* e-mail delivery handed to the role: that section, nothing else */
    await setRole(role.permissions.concat(["manage_email"]));
    await two.reload(); await ready(two);
    await two.evaluate(() => go("settings", "notifications"));
    await expect(two.locator("#content section.panel h2", { hasText: "Email delivery" })).toBeVisible();
    expect(await two.locator("#content section.panel h2", { hasText: "In-app & email notifications" }).count()).toBe(0);   /* not the workspace's switches */
    expect(await tabs(two)).toEqual(["profile", "layout", "theme", "notifications"]);
    /* the workspace's notifications handed to the role: its switches, saved without the rest of the workspace */
    await setRole(role.permissions.concat(["manage_notification_settings"]));
    await two.reload(); await ready(two);
    await two.evaluate(() => go("settings", "notifications"));
    const wsSec = two.locator("#content section.panel").filter({ has: two.locator("h2", { hasText: "In-app & email notifications" }) });
    await expect(wsSec).toBeVisible();
    const before = await admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => (b.ws.notifPrefs || {}).status === true));
    await wsSec.locator(".pref").filter({ hasText: "Task moved to a new stage" }).locator(".switch").click();
    await expect.poll(() => admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => (b.ws.notifPrefs || {}).status === true))).toBe(!before);
    await wsSec.locator(".pref").filter({ hasText: "Task moved to a new stage" }).locator(".switch").click();
    await expect.poll(() => admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => (b.ws.notifPrefs || {}).status === true))).toBe(before);
    /* and cloud storage: its tab */
    await setRole(role.permissions.concat(["manage_email", "manage_notification_settings", "manage_cloud_storage"]));
    await two.reload(); await ready(two);
    await two.evaluate(() => go("settings", "profile"));
    expect(await tabs(two)).toEqual(["profile", "layout", "theme", "notifications", "integrations"]);
  } finally {
    await setRole(role.permissions);
    await admin.evaluate(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}), member);
  }
});
