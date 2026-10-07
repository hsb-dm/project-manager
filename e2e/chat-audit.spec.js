/* Chat in the browser (audit, Oct 2026).
   - A message notifies once: the bell entry is the server's, not one from the page and one from the server.
   - Unread counts survive a reload (they came from loaded messages only, which a reload empties).
   - "Mark all as read" is saved for every conversation (one shared timer kept only the last).
   - An update from someone else keeps this person's own read state and mute.
   The server side: tests/chat-audit.test.js. */
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

test("one notification per message; unread counts and mark-all-read survive a reload", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN);
  const tag = Date.now().toString(36), other = { email: "chat-" + tag + "@e2e.test", pw: "Chat!Audit-2026x" };
  const ids = await admin.evaluate(async o => {
    await apiFetch("POST", "/api/members", { name: "Chat Tester " + o.tag, email: o.email, perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people;
    const id = Object.keys(people).find(k => people[k].email === o.email);
    await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw });
    return { me: ME, other: id };
  }, Object.assign({ tag }, other));
  const two = await (await browser.newContext()).newPage();
  await signIn(two, other);
  /* a DM and a group, each with a message for the admin */
  const convs = await two.evaluate(async ([adminId, tag]) => {
    const dm = await apiFetch("POST", "/api/messages/conversations", { type: "DM", members: [ME, adminId] });
    const g = await apiFetch("POST", "/api/messages/conversations", { type: "GROUP", name: "Audit " + tag, members: [ME, adminId] }).catch(e => ({ error: e.message }));
    await apiFetch("POST", "/api/messages/conversations/" + dm.id + "/messages", { body: "Hi admin " + tag });
    if (g.id) await apiFetch("POST", "/api/messages/conversations/" + g.id + "/messages", { body: "Group hello " + tag });
    return { dm: dm.id, group: g.id || null };
  }, [ids.me, tag]);
  /* once in the bell */
  await expect.poll(() => admin.evaluate(id => NOTIFS.filter(n => n.t === id).length, convs.dm), { timeout: 8000 }).toBe(1);
  await admin.waitForTimeout(800);
  expect(await admin.evaluate(id => NOTIFS.filter(n => n.t === id).length, convs.dm), "not twice").toBe(1);

  /* after a reload, before any history is opened */
  await admin.goto("/"); await ready(admin);
  await admin.evaluate(() => msgLoad());
  await expect.poll(() => admin.evaluate(id => convUnreadCount(conv(id)), convs.dm)).toBe(1);
  if (convs.group) await expect.poll(() => admin.evaluate(id => convUnreadCount(conv(id)), convs.group)).toBe(1);

  /* mark all as read: saved for both */
  await admin.evaluate(() => msgMarkAllRead());
  await admin.waitForTimeout(2000);
  await admin.goto("/"); await ready(admin);
  await admin.evaluate(() => msgLoad());
  await expect.poll(() => admin.evaluate(c => [c.dm, c.group].filter(Boolean).map(id => convUnreadCount(conv(id))).join(), convs)).toBe(convs.group ? "0,0" : "0");

  /* someone else's update keeps my read state and mute */
  const kept = await admin.evaluate(() => { const cur = { id: "x", readState: { [ME]: { lastReadMessageId: "m9" } }, notificationLevel: { [ME]: "MUTED" }, unread: 0 }; convMergeShared(cur, { id: "x", name: "Renamed", readState: { other: { lastReadMessageId: "m1" } }, notificationLevel: { other: "ALL" }, unread: 7 }); return [cur.name, cur.readState[ME].lastReadMessageId, cur.notificationLevel[ME], cur.unread].join(); });
  expect(kept).toBe("Renamed,m9,MUTED,0");
  /* gone, not just deactivated: other specs expect the workspace's people as they found them */
  await admin.evaluate(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}), ids.other);
});
