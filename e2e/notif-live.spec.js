/* Notifications read, everywhere at once (Oct 2026). The owner's case: two tabs open, notifications read in one, and
   the other still showed them unread until a refresh. Now a task opened, a chat read and Mark all read in one tab
   reach the other tab and another device at once: the bell's number, the tab's red dot, the open bell, the
   Notifications screen and the conversation's unread count, patched in place (no reload, nothing drawn again). A
   page whose live stream dropped asks once when it is back, and catches up. The server: tests/notif-live.test.js. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const live = p => p.waitForFunction(() => !!(CHAT_RUNTIME.connection && CHAT_RUNTIME.connection.readyState === 1), null, { timeout: 15000 });
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
let ctx, tabA, tabB, peerCtx, peer, liveAsks = 0;
const ids = {};
const unread = p => p.evaluate(() => NOTIFS.filter(n => !n.read).length);
/* the colleague tells the admin something about a task */
const tell = (k, t) => peer.evaluate(([k, t, to]) => apiFetch("POST", "/api/notifications", { k, recipients: [to], t, entityType: "task" }), [k, t, ids.admin]);
const row = (p, root, t) => p.locator(root + ' .notif[onclick*="' + t + '"]');

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext(); tabA = await ctx.newPage(); await signIn(tabA, ADMIN);
  const tag = Date.now().toString(36), who = { email: "nl-" + tag + "@e2e.test", pw: "Notif!Live-2026x" };
  Object.assign(ids, await tabA.evaluate(async o => {
    await apiFetch("POST", "/api/notifications/read", { all: true });
    await apiFetch("POST", "/api/members", { name: "Notif Live " + o.tag, email: o.email, perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email);
    await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw });
    const a = await apiFetch("POST", "/api/tasks", { title: "Read live A " + o.tag, status: WS.workflow[0].id, prio: "medium" });
    const b = await apiFetch("POST", "/api/tasks", { title: "Read live B " + o.tag, status: WS.workflow[0].id, prio: "medium" });
    return { admin: ME, member: id, taskA: a.id, taskB: b.id };
  }, Object.assign({ tag }, who)));
  peerCtx = await browser.newContext(); peer = await peerCtx.newPage(); await signIn(peer, who);
  ids.dm = await peer.evaluate(async to => { const c = await apiFetch("POST", "/api/messages/conversations", { type: "DM", members: [to] }); await apiFetch("POST", "/api/messages/conversations/" + c.id + "/messages", { body: "Lihat brief ini ya" }); return c.id; }, ids.admin);
  await tell("assigned", ids.taskA); await tell("review", ids.taskB);
  /* the admin's two tabs, sharing the session, opened now: each has the three unread from its start */
  await tabA.reload(); await ready(tabA);
  tabB = await ctx.newPage();
  tabB.on("request", r => { if (new URL(r.url()).pathname === "/api/live/notifs") liveAsks++; });
  await tabB.goto("/"); await ready(tabB);
  await live(tabA); await live(tabB);
});

test.afterAll(async () => {
  if (tabA) await tabA.evaluate(x => Promise.all([apiFetch("DELETE", "/api/tasks/" + x.taskA).catch(() => {}), apiFetch("DELETE", "/api/tasks/" + x.taskB).catch(() => {}), apiFetch("DELETE", "/api/members/" + x.member).catch(() => {}), apiFetch("POST", "/api/notifications/read", { all: true }).catch(() => {})]), ids).catch(() => {});
  if (peerCtx) await peerCtx.close(); if (ctx) await ctx.close();
});

test("another tab: a task opened, a chat read and Mark all read show at once, in place", async () => {
  /* tab B shows the Notifications screen with the bell open over it */
  await tabB.evaluate(() => { go("notifications"); openPop("notifPop", document.getElementById("notifBtn")); window.__stayed = 1; });
  await expect(row(tabB, "#notifList", ids.taskA)).toHaveClass(/unread/);
  await expect(row(tabB, "#content", ids.taskA)).toHaveClass(/unread/);
  await expect(row(tabB, "#notifList", ids.dm)).toHaveClass(/unread/);
  expect(await unread(tabB)).toBe(3);
  await expect(tabB.locator("#notifDot")).toHaveText("3");
  await expect(tabB.locator("#content .pagehead .muted")).toHaveText("3 unread");
  /* what is on its screen now is marked: a patch keeps these elements, a redraw would not */
  await tabB.evaluate(() => { document.querySelectorAll("#notifList .notif, #content .notif, #content .pagehead").forEach(el => { el.__same = 1; }); });
  const kept = () => tabB.evaluate(() => Array.from(document.querySelectorAll("#notifList .notif, #content .notif, #content .pagehead")).every(el => el.__same === 1));

  /* 1. tab A opens the task the first one is about */
  await tabA.evaluate(t => openTask(t), ids.taskA);
  await expect(tabB.locator("#notifDot")).toHaveText("2");
  await expect(row(tabB, "#notifList", ids.taskA)).not.toHaveClass(/unread/);
  await expect(row(tabB, "#content", ids.taskA)).not.toHaveClass(/unread/);
  await expect(row(tabB, "#content", ids.taskB)).toHaveClass(/unread/);
  await expect(tabB.locator("#content .pagehead .muted")).toHaveText("2 unread");
  await expect(tabB.locator("#notifBtn")).toHaveAttribute("aria-label", "Notifications (2 unread)");
  expect(await kept(), "the rows were patched, not drawn again").toBe(true);

  /* 2. tab A reads the chat: tab B, which has its messages loaded and counts from its own read mark, follows */
  await tabB.evaluate(id => msgFetchPage(id), ids.dm);
  expect(await tabB.evaluate(id => convUnreadCount(conv(id)), ids.dm)).toBe(1);
  const msgsBefore = await tabB.evaluate(() => messagesUnreadTotal());
  await tabA.evaluate(id => openConversation(id), ids.dm);
  await expect.poll(() => tabB.evaluate(id => convUnreadCount(conv(id)), ids.dm), { timeout: 8000 }).toBe(0);
  expect(await tabB.evaluate(() => messagesUnreadTotal())).toBe(msgsBefore - 1);
  await expect(tabB.locator("#notifDot")).toHaveText("1");
  await expect(row(tabB, "#notifList", ids.dm)).not.toHaveClass(/unread/);
  await expect(row(tabB, "#content", ids.dm)).not.toHaveClass(/unread/);
  expect(await kept()).toBe(true);

  /* 3. Mark all read in tab A */
  await tabA.evaluate(() => { window.__echo = []; const base = msgOnEvent; msgOnEvent = function (ev) { window.__echo.push(ev.type); return base.apply(this, arguments); }; markAllRead(); });
  await expect(tabB.locator("#notifDot")).toBeHidden();
  await expect(tabB.locator("#notifList .notif.unread")).toHaveCount(0);
  await expect(tabB.locator("#content .notif.unread")).toHaveCount(0);
  await expect(tabB.locator("#content .pagehead .muted")).toHaveText("0 unread");
  await expect.poll(() => tabB.locator("#favicon").getAttribute("href")).not.toMatch(/^data:image\/png/);
  await expect(tabB.locator("#notifPop")).toHaveClass(/open/);
  expect(await kept()).toBe(true);
  expect(await tabB.evaluate(() => window.__stayed), "no reload").toBe(1);
  /* the tab that marked them read hears its own echo and has nothing left to change */
  await expect.poll(() => tabA.evaluate(() => window.__echo.includes("notifications_read"))).toBe(true);
  expect(await unread(tabA)).toBe(0);
});

test("only what was there by then, only forward, and a sign-up turned away is gone", async () => {
  const out = await tabB.evaluate(dm => {
    const at = new Date(Date.now() - 60000).toISOString();
    NOTIFS.unshift({ id: "nt_after", k: "comment", who: ME, t: "x", ago: 0, read: false, createdAt: new Date().toISOString() });
    msgOnEvent({ type: "notifications_read", all: true, at }); msgOnEvent({ type: "notifications_read", entityId: "x", at });
    const after = NOTIFS.find(x => x.id === "nt_after").read;
    /* by id it is that one, whenever it came */
    msgOnEvent({ type: "notifications_read", ids: ["nt_after"], at });
    const byId = NOTIFS.find(x => x.id === "nt_after").read;
    NOTIFS.splice(NOTIFS.findIndex(x => x.id === "nt_after"), 1);
    /* a conversation's read mark only moves forward */
    const was = Object.assign({}, conv(dm).readState[ME]);
    msgOnEvent({ type: "unread_count_changed", conversationId: dm, unread: 0, lastReadMessageId: "m_old", lastReadAt: "2020-01-01T00:00:00.000Z" });
    const kept = conv(dm).readState[ME].lastReadAt === was.lastReadAt && conv(dm).readState[ME].lastReadMessageId === was.lastReadMessageId;
    /* turned away: the sign-up's notification leaves the bell; another about a task with the same id stays */
    NOTIFS.unshift({ id: "nt_su", k: "signup", who: "u_gone", t: "u_gone", entityType: "user", message: "Gone", ago: 0, read: false, createdAt: at }, { id: "nt_same", k: "comment", who: ME, t: "u_gone", entityType: "task", ago: 0, read: true, createdAt: at });
    msgOnEvent({ type: "notifications_read", entityId: "u_gone", entityType: "user", removed: true, at: new Date().toISOString() });
    const gone = !NOTIFS.some(x => x.id === "nt_su"), other = NOTIFS.some(x => x.id === "nt_same");
    NOTIFS.splice(NOTIFS.findIndex(x => x.id === "nt_same"), 1); syncNotifDot();
    return { after, byId, kept, gone, other };
  }, ids.dm);
  expect(out).toEqual({ after: false, byId: true, kept: true, gone: true, other: true });
});

test("a tab in the background: the bell's number and the tab's dot at once, its lists once it is shown", async () => {
  await tabB.evaluate(() => { NOTIFS.unshift({ id: "nt_bg", k: "comment", who: ME, t: "x", ago: 0, read: false, createdAt: new Date(Date.now() - 60000).toISOString() }); syncNotifDot(); go("notifications"); openPop("notifPop", document.getElementById("notifBtn")); });
  try {
    await expect(tabB.locator("#notifDot")).toHaveText("1");
    await expect(tabB.locator("#content .pagehead .muted")).toHaveText("1 unread");
    await tabB.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); msgOnEvent({ type: "notifications_read", ids: ["nt_bg"], at: new Date().toISOString() }); });
    await expect(tabB.locator("#notifDot")).toBeHidden();
    await expect.poll(() => tabB.locator("#favicon").getAttribute("href")).not.toMatch(/^data:image\/png/);
    await expect(tabB.locator("#content .pagehead .muted"), "not drawn while hidden").toHaveText("1 unread");
    await tabB.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
    await expect(tabB.locator("#content .pagehead .muted")).toHaveText("0 unread");
    await expect(tabB.locator("#notifList .notif.unread")).toHaveCount(0);
  } finally { await tabB.evaluate(() => { delete document.hidden; const i = NOTIFS.findIndex(x => x.id === "nt_bg"); if (i >= 0) NOTIFS.splice(i, 1); syncNotifDot(); closePops(); }); }
});

test("another device follows too", async ({ browser }) => {
  const dctx = await browser.newContext(), dev = await dctx.newPage();
  try {
    await signIn(dev, ADMIN); await live(dev);
    await tell("mention", ids.taskB);
    await expect.poll(() => unread(dev)).toBe(1);
    await expect.poll(() => unread(tabA)).toBe(1);
    await expect(dev.locator("#notifDot")).toHaveText("1");
    /* its bell open on Unread: the row read elsewhere leaves it, the filter stays */
    await dev.evaluate(() => { openPop("notifPop", document.getElementById("notifBtn")); NOTIF_FILTER = "unread"; renderNotifs(); });
    await expect(row(dev, "#notifList", ids.taskB)).toHaveCount(1);
    await expect(row(dev, "#notifList", ids.taskB)).toHaveClass(/unread/);
    await tabA.evaluate(t => openTask(t), ids.taskB);
    await expect(dev.locator("#notifDot")).toBeHidden();
    await expect(dev.locator("#notifList .notif")).toHaveCount(0);
    await expect(dev.locator("#notifList .notif-filters button.on")).toHaveText("Unread");
    await expect(dev.locator("#notifList .empty")).toBeVisible();
    await expect(dev.locator("#notifPop")).toHaveClass(/open/);
    await expect(tabB.locator("#notifDot")).toBeHidden();
  } finally { await dctx.close(); }
});

test("in Indonesian the patched count reads in Indonesian", async () => {
  await tabB.evaluate(() => { setLanguage("id"); });
  await tabB.waitForFunction(() => UI_LANG === "id");
  await tabB.evaluate(() => go("notifications"));
  try {
    await tell("comment", ids.taskA);
    await expect(tabB.locator("#notifDot")).toHaveText("1");
    await expect.poll(() => unread(tabA)).toBe(1);
    await tabB.evaluate(() => renderScreen(false));
    await expect(tabB.locator("#content .pagehead .muted")).toHaveText("1 belum dibaca");
    await tabA.evaluate(t => openTask(t), ids.taskA);
    await expect(tabB.locator("#content .pagehead .muted")).toHaveText("0 belum dibaca");
    await expect(tabB.locator("#content .notif.unread")).toHaveCount(0);
  } finally { await tabB.evaluate(() => { setLanguage("en"); }); }
});

test("a page whose stream dropped asks once when it is back, and catches up", async () => {
  expect(liveAsks, "the first connection asks for nothing").toBe(0);
  /* one both tabs have, unread */
  await tell("deadline", ids.taskA);
  await expect.poll(() => unread(tabA)).toBe(1);
  await expect.poll(() => unread(tabB)).toBe(1);
  const known = await tabB.evaluate(() => NOTIFS.find(n => !n.read).id);
  await tabB.route("**/api/messages/stream", r => r.abort());
  await tabB.evaluate(() => { const es = CHAT_RUNTIME.connection; es.close(); es.dispatchEvent(new Event("error")); });
  await tabB.evaluate(() => go("notifications"));
  /* meanwhile: one comes, and it and the one both had are read in tab A; another comes and stays unread */
  await tell("comment", ids.taskA);
  await expect.poll(() => unread(tabA)).toBe(2);
  const missed = await tabA.evaluate(k => NOTIFS.find(n => !n.read && n.id !== k).id, known);
  await tabA.evaluate(() => markAllRead());
  await tell("upload", ids.taskB);
  await expect.poll(() => unread(tabA)).toBe(1);
  const fresh = await tabA.evaluate(() => NOTIFS.find(n => !n.read).id);
  await tabB.waitForTimeout(500);
  expect(await tabB.evaluate(x => NOTIFS.some(n => n.id === x[0] || n.id === x[1]), [missed, fresh]), "tab B heard none of it").toBe(false);
  expect(await tabB.evaluate(k => NOTIFS.find(n => n.id === k).read, known), "nor that it was read").toBe(false);
  await expect(tabB.locator("#notifDot")).toHaveText("1");
  /* one the server sent once and has no more (taken away meanwhile), and one only this page made */
  await tabB.evaluate(() => { NL.server.nt_ghost = 1; NOTIFS.unshift({ id: "nt_ghost", k: "comment", who: ME, t: "x", ago: 0, read: false, createdAt: new Date().toISOString() }, { id: "nt_local", k: "comment", who: ME, t: "x", ago: 0, read: true, createdAt: new Date().toISOString() }); });
  await tabB.unroute("**/api/messages/stream");
  await live(tabB);
  await expect.poll(() => tabB.evaluate(x => NOTIFS.some(n => n.id === x), fresh), { timeout: 8000 }).toBe(true);
  expect(await unread(tabB)).toBe(1);
  expect(await tabB.evaluate(x => x.map(id => NOTIFS.find(n => n.id === id).read), [known, missed, fresh]), "read there is read here; what came meanwhile is added, as it is").toEqual([true, true, false]);
  expect(await tabB.evaluate(() => [NOTIFS.some(n => n.id === "nt_ghost"), NOTIFS.some(n => n.id === "nt_local")]), "gone from the server: gone; made here: kept").toEqual([false, true]);
  await tabB.evaluate(() => { NOTIFS.splice(NOTIFS.findIndex(n => n.id === "nt_local"), 1); });
  await expect(tabB.locator("#notifDot")).toHaveText("1");
  await expect(row(tabB, "#content", ids.taskB).first()).toHaveClass(/unread/);
  await expect(tabB.locator("#content .pagehead .muted")).toHaveText("1 unread");
  await tabB.waitForTimeout(500);
  expect(liveAsks, "asked once").toBe(1);
});
