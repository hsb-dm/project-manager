/* This round, end to end:
   • a Google link followed by Tab reads as its name — in task comments and in chat — and is stored
     as [name](url) so it still opens the folder;
   • every time shown is a date and a time, with how long ago in brackets;
   • a task's Activity is kept by the server — created, comments, links, files, versions — and
     shows names as text, never as markup;
   • a version can be any link, and "Link Google Drive" no longer needs a name typed in.

   /api/links/title is answered here (one shared link has a name, a private one has none); the
   route itself was checked against Google and is covered by tests/link-title.test.js. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const SHARED = "https://drive.google.com/drive/folders/Q4TABFOLDER";
const PRIVATE = "https://drive.google.com/drive/folders/PRIVTABFOLDER";
let taskId = null, convId = null;

async function signIn(page) {
  await page.route("**/api/links/title**", route => {
    const url = new URL(route.request().url()).searchParams.get("url") || "";
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ title: url.includes("Q4TAB") ? "Q4 Campaign" : "" }) });
  });
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const openTab = (page, tab) => page.evaluate(([id, t]) => { openTask(id); S.drawerTab = t; renderDrawer(); }, [taskId, tab]);
const taskNow = page => page.evaluate(id => JSON.parse(JSON.stringify(task(id))), taskId);
async function postComment(page) {
  const before = await page.evaluate(id => task(id).comments.length, taskId);
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).comments.length, taskId), { timeout: 10000 }).toBe(before + 1);
  await page.waitForTimeout(400);
}

test("a task, and someone to chat with", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Links project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Links project"))).toBe(true);
  await page.evaluate(() => { newTaskModal({ title: "Links target", proj: PROJECTS.find(p => p.name === "Links project").id, assignee: ME }); createDraft(); });
  await expect.poll(() => page.evaluate(() => TASKS.some(t => t.title === "Links target" && !t._draft)), { timeout: 10000 }).toBe(true);
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Links target").id);
  convId = await page.evaluate(async () => {
    let id = Object.keys(PEOPLE).find(k => PEOPLE[k].email === "linkpeer@e2e.test");
    if (!id) id = (await apiFetch("POST", "/api/members", { id: "linkpeer", name: "Link Peer", email: "linkpeer@e2e.test", perm: "member", ini: "LP", teams: [] })).id;
    return (await apiFetch("POST", "/api/messages/conversations", { type: "DM", members: [id] })).id;
  }).catch(e => { console.log("SETUP-ERROR " + e.message); return null; });
  expect(convId, "a conversation to write in").toBeTruthy();
});

/* ---------- Tab ---------- */

test("in a comment, Tab after a Drive link puts its name in its place", async ({ page }) => {
  await signIn(page);
  await openTab(page, "comments");
  await page.locator("#cmtText").click();
  await page.keyboard.type("Folder ada di " + SHARED);
  await page.keyboard.press("Tab");
  await expect(page.locator("#cmtText")).toHaveValue("Folder ada di Q4 Campaign");
  await expect(page.locator("#cmtText"), "the caret stays in the box").toBeFocused();
  await expect(page.locator("#drawer .cmt-ta-mirror .msg-linkname")).toHaveText("Q4 Campaign");
  await postComment(page);

  const c = (await taskNow(page)).comments.slice(-1)[0];
  expect(c.text, "stored as a link with its name").toBe("Folder ada di [Q4 Campaign](" + SHARED + ")");
  const body = page.locator("#drawer .cmt", { hasText: "Folder ada di" }).locator(".body");
  await expect(body.locator(".drive-chip")).toHaveText("Q4 Campaign");
  expect(await body.innerText()).not.toContain("drive.google.com");
  /* filed under Assets by that name */
  expect((await taskNow(page)).files.find(f => f.url === SHARED).name).toBe("Q4 Campaign");
});

test("Tab anywhere else is still Tab", async ({ page }) => {
  await signIn(page);
  await openTab(page, "comments");
  await page.locator("#cmtText").click();
  await page.keyboard.type("no link here");
  await page.keyboard.press("Tab");
  await expect(page.locator("#cmtText")).toHaveValue("no link here");
  await expect(page.locator("#cmtText"), "focus moved on, as Tab does").not.toBeFocused();
  /* nor on an ordinary web link */
  await page.evaluate(() => { const t = document.getElementById("cmtText"); t.value = ""; });
  await page.locator("#cmtText").click();
  await page.keyboard.type("see https://example.org/page");
  await page.keyboard.press("Tab");
  await expect(page.locator("#cmtText")).toHaveValue("see https://example.org/page");
  await page.evaluate(() => { const t = document.getElementById("cmtText"); t.value = ""; window._cmtDraft = ""; });
});

test("a private link reads as what it is, and an edited-away name keeps its address", async ({ page }) => {
  await signIn(page);
  await openTab(page, "comments");
  await page.locator("#cmtText").click();
  await page.keyboard.type("Private: " + PRIVATE);
  await page.keyboard.press("Tab");
  await expect(page.locator("#cmtText")).toHaveValue("Private: Google Drive Folder");
  /* the name is typed over entirely */
  await page.evaluate(() => { const t = document.getElementById("cmtText"); t.value = "Private: the shoot files"; t.dispatchEvent(new Event("input", { bubbles: true })); });
  await postComment(page);
  const c = (await taskNow(page)).comments.slice(-1)[0];
  expect(c.text, "the address is not lost").toBe("Private: the shoot files " + PRIVATE);
});

test("in chat, Tab does the same, and the message shows the name", async ({ page }) => {
  await signIn(page);
  await page.goto("/messages/" + convId); await ready(page);
  const box = page.locator("#msgInput");
  await box.click();
  await page.keyboard.type("Cek " + SHARED);
  await page.keyboard.press("Tab");
  await expect(box).toHaveValue("Cek Q4 Campaign");
  await expect(page.locator("#msgMirror .msg-linkname")).toHaveText("Q4 Campaign");
  await box.press("Enter");
  await expect.poll(() => page.evaluate(id => (convMsgs(id).slice(-1)[0] || {}).body, convId), { timeout: 10000 }).toBe("Cek [Q4 Campaign](" + SHARED + ")");
  const last = page.locator("#msgTimeline .msg").last();
  await expect(last.locator(".drive-chip")).toHaveText("Q4 Campaign");
  expect(await last.locator(".msg-text").innerText()).not.toContain("drive.google.com");
});

/* A link to a chat opened a different one when other chats existed: the conversation list was
   still loading when the link was followed, and the screen fell back to another chat. */
test("a link to a chat opens that chat, with other chats around", async ({ page }) => {
  await signIn(page);
  const other = await page.evaluate(async () => {
    let id = Object.keys(PEOPLE).find(k => PEOPLE[k].email === "linkpeer2@e2e.test");
    if (!id) id = (await apiFetch("POST", "/api/members", { id: "linkpeertwo", name: "Link Peer Two", email: "linkpeer2@e2e.test", perm: "member", ini: "L2", teams: [] })).id;
    return (await apiFetch("POST", "/api/messages/conversations", { type: "DM", members: [id] })).id;
  });
  for (const want of [other, convId, other, convId]) {
    await page.goto("/messages/" + want); await ready(page);
    await expect.poll(() => page.evaluate(() => S.messageConversationId), { timeout: 5000 }).toBe(want);
    await expect(page).toHaveURL(new RegExp("/messages/" + want));
  }
});

/* ---------- dates ---------- */

test("times read as a date and a time, with how long ago in brackets", async ({ page }) => {
  await signIn(page);
  await openTab(page, "comments");
  const when = await page.locator("#drawer .cmt .when").first().innerText();
  expect(when).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?(AM|PM) \((just now|\d+ minutes? ago|today)\)$/);
  /* in Indonesian, the Indonesian way */
  await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
  const id = await page.locator("#drawer .cmt .when").first().innerText();
  expect(id).toMatch(/^\d{1,2} [A-Za-z]{3} \d{4},? \d{2}[.:]\d{2} \((baru saja|\d+ menit lalu|hari ini)\)$/);
  await page.evaluate(() => { UI_LANG = "en"; });
});

test("the relative part counts calendar days", async ({ page }) => {
  await signIn(page);
  const out = await page.evaluate(() => {
    const d = n => { const t = new Date(); t.setDate(t.getDate() - n); t.setHours(12, 0, 0, 0); return t; };
    return [whenRelative(d(1)), whenRelative(d(3)), whenRelative(d(14)), whenRelative(d(90)), whenRelative(d(800))];
  });
  expect(out).toEqual(["yesterday", "3 days ago", "2 weeks ago", "3 months ago", "2 years ago"]);
});

/* "minutes ago" is measured when the data loads; a page left open for hours would print the
   wrong clock time from it, so the real timestamp wins whenever there is one */
test("the real timestamp is used, not the minutes counted at load", async ({ page }) => {
  await signIn(page);
  const shown = await page.evaluate(() => {
    const three = new Date(Date.now() - 3 * 86400000);
    return { text: ago(0, three.toISOString()), want: whenStamp(three) };
  });
  expect(shown.text).toBe(shown.want + " (3 days ago)");
});

/* ---------- activity ---------- */

test("Activity keeps what happened, after a reload", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.evaluate(() => attachTaskLinkModal());
  await page.locator("#atl_url").fill("https://example.org/brief.pdf");
  await page.locator("#atl_name").fill("Brief PDF");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).files.some(f => f.name === "Brief PDF"), taskId)).toBe(true);
  /* the page shows the link before its save has reached the server */
  const kindsNow = () => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(t => t.activity.map(a => a.k + (a.a && a.a.name ? ":" + a.a.name : ""))), taskId);
  await expect.poll(kindsNow, { timeout: 10000 }).toContain("link:Brief PDF");
  await page.reload(); await ready(page);
  const kinds = await kindsNow();
  expect(kinds).toContain("created");
  expect(kinds).toContain("comment");
  expect(kinds, "the link, by name").toContain("link:Brief PDF");
  await openTab(page, "activity");
  await expect(page.locator("#drBody .tl")).toContainText("attached the link Brief PDF");
  await expect(page.locator("#drBody .tl .when").first()).toContainText(/\d{4}/);
});

test("a name in Activity is text, never markup", async ({ page }) => {
  await signIn(page);
  const evil = '<img src=x onerror="window.__pwned=1">';
  await page.evaluate(([id, n]) => editTaskWith(task(id), t => { t.files.push(F(n, "document", "link", "Link", 0, "https://example.org/x.pdf")); }), [taskId, evil]);
  await page.waitForTimeout(600);
  await page.reload(); await ready(page);
  await openTab(page, "activity");
  await expect(page.locator("#drBody .tl")).toContainText(evil);
  expect(await page.evaluate(() => window.__pwned), "nothing ran").toBeUndefined();
  expect(await page.locator("#drBody .tl img").count()).toBe(0);
});

/* ---------- versions and Drive names ---------- */

test("a version can be any link; the empty state shows the Drive logo", async ({ page }) => {
  await page.route(/^https:\/\/www\.figma\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await signIn(page);
  await openTab(page, "files");
  await expect(page.locator("#drBody .empty .btn", { hasText: "Link Google Drive" }).locator(".drive-logo")).toBeVisible();
  await page.locator("#drBody .empty .btn", { hasText: "Attach link" }).click();
  await page.locator("#lv_url").fill("https://www.figma.com/design/ABC123/Banner");
  await page.locator("#lv_note").fill("Figma frame");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).versions.length, taskId)).toBe(1);
  const v = (await taskNow(page)).versions[0];
  expect(v.driveUrl).toBe("https://www.figma.com/design/ABC123/Banner");
  await expect(page.locator("#drBody .av-head h3").first()).toHaveText("Version 1");
  /* it opens as a link, not as "Drive" */
  await expect(page.locator("#drBody .pbar-foot")).toContainText("Link");
  /* and shows through Figma's own embed */
  await expect(page.locator("#drBody .vp-frame iframe")).toHaveAttribute("src", "https://www.figma.com/embed?embed_host=share&url=" + encodeURIComponent("https://www.figma.com/design/ABC123/Banner"));
  /* the page shows the version before its save has reached the server */
  await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(t => t.versions.length), taskId), { timeout: 10000 }).toBe(1);
  const saved = await page.evaluate(id => apiFetch("GET", "/api/tasks/" + id), taskId);
  expect(saved.versions[0].driveUrl, "kept by the server").toBe("https://www.figma.com/design/ABC123/Banner");
  expect(saved.activity.some(a => a.k === "upload"), "and recorded").toBe(true);
});

test("Link Google Drive fills the name in from Drive, and does not insist on one", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#drBody .av-tools .btn", { hasText: "Link Google Drive" }).click();
  await page.locator("#lc_url").fill(SHARED + "?usp=sharing");
  await expect(page.locator("#lc_name")).toHaveValue("Q4 Campaign", { timeout: 5000 });
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).files.some(f => f.name === "Q4 Campaign" && /usp=sharing/.test(f.url)), taskId)).toBe(true);
  /* a private link, saved straight away with no name typed: filed as what it is */
  await page.locator("#drBody .av-tools .btn", { hasText: "Link Google Drive" }).click();
  await page.locator("#lc_url").fill(PRIVATE + "?x=1");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => (task(id).files.find(f => /x=1/.test(f.url)) || {}).name, taskId), { timeout: 8000 }).toBe("Google Drive Folder");
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId);
    await page.evaluate(async () => { for (const e of ["linkpeer@e2e.test", "linkpeer2@e2e.test"]) { const id = Object.keys(PEOPLE).find(k => PEOPLE[k].email === e); if (id) await apiFetch("DELETE", "/api/members/" + id).catch(() => {}); } });
  } catch {} finally { await page.close(); }
});
