/* The newest notification is always on top — in the bell and on the Notifications page. The list used to be
   split, "Needs action" first and "Updates" after, so a new update sat under older action items; and its order
   came from minutes-ago figures frozen when the list loaded. One list now, by when each was made; what needs
   action has a filter of its own. One that arrives while the bell is open shows at the top at once. */
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

test("the newest notification is on top, whatever its kind; one arriving while the bell is open joins at the top", async ({ browser }) => {
  const tag = Date.now().toString(36), M = { name: "Notifier " + tag, email: "notifier-" + tag + "@e2e.test", pw: "Notify!Order-2026x" };
  const admin = await (await browser.newContext()).newPage(); await signIn(admin, ADMIN);
  const x = await admin.evaluate(async o => {
    await apiFetch("POST", "/api/members", { name: o.name, email: o.email, perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email);
    await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw });
    const d = await apiFetch("POST", "/api/tasks", { title: "Order " + o.tag, status: WS.workflow[0].id, prio: "medium" });
    await apiFetch("POST", "/api/notifications/read", { all: true });
    return { member: id, task: d.id, admin: ME };
  }, Object.assign({ tag }, M));
  const mem = await (await browser.newContext()).newPage(); await signIn(mem, M);
  const send = k => mem.evaluate(o => apiFetch("POST", "/api/notifications", { k: o.k, recipients: [o.admin], t: o.task, entityType: "task" }), Object.assign({ k }, x));
  try {
    await send("assigned");                 /* an older one that needs action */
    await mem.waitForTimeout(1200);
    await send("comment");                  /* a newer update */
    await admin.reload(); await ready(admin);
    const rows = () => admin.locator("#notifList .notif").allInnerTexts();
    await admin.locator("#notifBtn").click();
    await expect(admin.locator("#notifPop")).toHaveClass(/open/);
    await expect.poll(async () => (await rows()).slice(0, 2).map(t => /commented/.test(t) ? "comment" : /assigned/.test(t) ? "assigned" : "?")).toEqual(["comment", "assigned"]);
    await expect(admin.locator("#notifList .notif-sec")).toHaveCount(0);
    /* one arriving now, with the bell open: at the top at once */
    await admin.waitForTimeout(800);
    await send("file");
    await expect.poll(async () => (await rows())[0] || "", { timeout: 8000 }).toMatch(/attached a file/);
    /* what needs action has its own filter */
    await admin.locator("#notifList .notif-filters button", { hasText: "Needs action" }).click();
    const acting = await rows();
    expect(acting.some(t => /assigned/.test(t))).toBe(true);
    expect(acting.some(t => /commented|attached a file/.test(t))).toBe(false);
    await admin.evaluate(() => { NOTIF_FILTER = "all"; closePops(); go("notifications"); });
    await expect.poll(async () => (await admin.locator("#content .notif").allInnerTexts())[0] || "").toMatch(/attached a file/);
    expect(await admin.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = tr("Needs action"); UI_LANG = was; return r; })).toBe("Perlu tindakan");
  } finally {
    await admin.evaluate(o => Promise.all([apiFetch("DELETE", "/api/tasks/" + o.task).catch(() => {}), apiFetch("DELETE", "/api/members/" + o.member).catch(() => {})]), x);
    await admin.context().close(); await mem.context().close();
  }
});
