/* A project's discussion (Oct 2026): a card at the foot of Overview — the newest threads and a box to write in — and
   a Discussion tab with every thread. Both show one discussion; it is a task's comments in look and in use (reply,
   edit in place, remove, Enter to send); what is written belongs to its project; an archived project only reads; a
   notification or a link opens the comment it is about; a colleague's comment appears without a reload.
   The server side: tests/project-discussion.test.js. */
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
const newProject = (page, name) => page.evaluate(async n => { const id = "pd_" + Math.random().toString(36).slice(2, 9); await apiFetch("POST", "/api/projects", { id, name: n, status: "active", owner: ME, teams: [] }); await reloadAll(); return id; }, name);
const dropProjects = (page, ids) => page.evaluate(list => Promise.all(list.map(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {}))), ids);
const openProject = (page, id, tab) => page.evaluate(([i, t]) => { S.projectTab = t; go("projects", i); }, [id, tab || "overview"]);

test("Overview and the Discussion tab show one discussion: write, reply, edit, remove; each project keeps its own draft", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page, ADMIN);
  const tag = Date.now().toString(36);
  const a = await newProject(page, "Discuss A " + tag), b = await newProject(page, "Discuss B " + tag);
  const taskId = await page.evaluate(async x => { const t = await apiFetch("POST", "/api/tasks", { title: "Discuss task " + x.tag, status: WS.workflow[0].id, prio: "medium", proj: x.a }); TASKS.push(hTask(t)); return t.id; }, { a, tag });
  try {
    await openProject(page, a);
    const card = page.locator("#content .pd-overview");
    await expect(card).toBeVisible();
    /* the whole width, after Open tasks and Team; the tab between Files and Activity */
    const place = await page.evaluate(() => { const panels = [...document.querySelectorAll("#content section.panel")], pd = document.querySelector("#content .pd-overview"); return { last: panels[panels.length - 1] === pd, top: pd.parentElement.id, afterTeam: panels.findIndex(p => /Team/.test((p.querySelector("h2") || {}).textContent || "")) < panels.indexOf(pd) }; });
    expect(place).toEqual({ last: true, top: "content", afterTeam: true });
    expect(await page.locator(".ptabs .tab").evaluateAll(x => x.map(t => t.dataset.tab))).toEqual(["overview", "board", "list", "grid", "calendar", "timeline", "assets", "files", "discussion", "activity", "settings"]);
    await expect(card.locator(".pd-empty")).toContainText("No comments yet");
    /* who can see it: a small switch in the head, beside the title — not between the comments and the box */
    const sw = card.locator(".panel-head .seg.pd-vis");
    await expect(sw.locator("button")).toHaveText(["Internal", "Stakeholder-visible"]);
    expect(await card.locator(".panel-head > *").evaluateAll(x => x.map(e => e.tagName === "H2" ? "title" : e.classList.contains("pd-vis") ? "switch" : e.classList.contains("spacer") ? "spacer" : "").filter(Boolean))).toEqual(["title", "switch", "spacer"]);
    expect(await card.locator(".panel-body").textContent()).not.toContain("only visible to the creative team");
    expect(await card.locator(".panel-body .seg, .panel-body .cvis").count()).toBe(0);
    await sw.locator("button", { hasText: "Stakeholder-visible" }).click();
    await expect(card.locator(".composer .bar .hint")).toContainText("Stakeholder-visible ·");
    await card.locator(".panel-head .seg.pd-vis button", { hasText: "Internal" }).click();
    await expect(card.locator(".composer .bar .hint")).toContainText("Internal ·");
    /* written on Overview, Enter sends; it stays on Overview */
    await card.locator("#pdText").fill("Kickoff notes " + tag);
    await card.locator("#pdText").press("Enter");
    await expect(card.locator(".cmt .body")).toContainText("Kickoff notes " + tag);
    await expect(card.locator("#pdText")).toHaveValue("");
    await expect(card.locator(".panel-head .cnt")).toHaveText("1");
    const onOverview = async () => expect(await page.evaluate(() => S.projectTab)).toBe("overview");
    await onOverview();
    const cid = await card.locator(".cmt").first().getAttribute("data-cid");
    const ov = card.locator('.cmt[data-cid="' + cid + '"]');
    /* Reply on Overview stays on Overview: a box opens under the comment, there, and says whom it answers (the box
       at the bottom stays, for new comments); the reply shows under its comment, and the focus is back on Reply */
    const shape = loc => loc.locator(".cmts > *").evaluateAll(els => els.map(e => e.getAttribute("data-cid") || (e.classList.contains("cmt-reply-box") ? "box" : e.className)));
    await ov.locator(".acts .cmt-reply-btn").click();
    await onOverview();
    const rbox = card.locator(".cmt-reply-box");
    await expect(rbox.locator(".cmt-reply-to")).toHaveText("Replying to Admin E2E");
    await expect(rbox.locator("#pdReplyText")).toBeFocused();
    expect(await shape(card)).toEqual([cid, "box"]);
    await expect(card.locator(".cmts + .composer #pdText")).toBeVisible();
    await expect(card.locator(".cmts + .composer")).not.toContainText("Replying to");
    await page.keyboard.type("Agreed " + tag);
    await page.keyboard.press("Enter");
    await expect(card.locator(".cmt.reply")).toContainText("Agreed " + tag);
    await expect(rbox).toHaveCount(0);
    await expect(card.locator(".pd-replies")).toHaveText("Hide replies");
    await expect(ov.locator(".acts .cmt-reply-btn")).toBeFocused();
    await expect(card.locator(".composer .hint").first()).not.toContainText("Replying to");
    await onOverview();
    /* the thread closes and opens there */
    await card.locator(".pd-replies").click();
    await expect(card.locator(".cmt.reply")).toHaveCount(0);
    await expect(card.locator(".pd-replies")).toHaveText("1 reply");
    await card.locator(".pd-replies").click();
    await expect(card.locator(".cmt.reply")).toHaveCount(1);
    /* edited on Overview, in the same box, in its place */
    await ov.locator(".cmt-edit-btn").click();
    await expect(ov.locator("#pdText")).toHaveValue("Kickoff notes " + tag);
    expect(await card.locator(".composer").count()).toBe(1);
    await ov.locator("#pdText").fill("Kickoff notes, revised " + tag);
    await ov.locator("#pdText").press("Enter");
    await expect(ov.locator(".body")).toContainText("revised " + tag);
    await expect(ov.locator(".cmt-edited")).toBeVisible();
    await expect(card.locator(".composer")).toHaveCount(1);
    await onOverview();
    /* the same thread on the tab, with its reply; replied to there, a reply removed there */
    await card.locator(".pd-all").click();
    const tab = page.locator("#content .pd-full");
    await expect(page.locator('.ptabs .tab[data-tab="discussion"]')).toHaveClass(/\bon\b/);
    const item = tab.locator('.cmt[data-cid="' + cid + '"]');
    await expect(item.locator(".body")).toContainText("revised " + tag);
    await expect(tab.locator(".cmt.reply")).toContainText("Agreed " + tag);
    await item.locator(".acts .cmt-reply-btn").click();
    await expect(tab.locator(".cmt-reply-box .cmt-reply-to")).toHaveText("Replying to Admin E2E");
    await expect(page.locator("#pdReplyText")).toBeFocused();
    const first = await tab.locator(".cmt.reply").getAttribute("data-cid");
    expect(await shape(tab), "under the thread, after its reply").toEqual([cid, first, "box"]);
    /* Esc lets it go and gives the focus back; Reply again, and it is sent */
    await page.keyboard.type("Not this");
    await page.keyboard.press("Escape");
    await expect(tab.locator(".cmt-reply-box")).toHaveCount(0);
    await expect(item.locator(".acts .cmt-reply-btn")).toBeFocused();
    await item.locator(".acts .cmt-reply-btn").click();
    await expect(page.locator("#pdReplyText")).toHaveValue("");
    await page.keyboard.type("Second reply " + tag);
    await page.keyboard.press("Enter");
    await expect(tab.locator(".cmt.reply")).toHaveCount(2);
    await expect(tab.locator(".cmt-reply-box")).toHaveCount(0);
    await tab.locator(".cmt.reply").filter({ hasText: "Agreed " + tag }).locator(".acts button", { hasText: "Delete" }).click();
    await expect(tab.locator(".cmt.reply")).toHaveCount(1);
    await expect(tab.locator(".panel-head .cnt")).toHaveText("2");
    /* and removed on Overview */
    await page.locator('.ptabs .tab[data-tab="overview"]').click();
    await card.locator(".cmt.reply").filter({ hasText: "Second reply " + tag }).locator(".acts button", { hasText: "Delete" }).click();
    await expect(card.locator(".cmt.reply")).toHaveCount(0);
    await expect(card.locator(".pd-replies")).toHaveCount(0);
    await onOverview();
    const saved = await page.evaluate(id => apiFetch("GET", "/api/projects/" + id + "/comments"), a);
    expect(saved.comments.map(c => c.text)).toEqual(["Kickoff notes, revised " + tag]);
    /* what is being written belongs to its project, and a task's box has its own */
    await page.locator("#pdText").fill("Draft for A " + tag);
    await openProject(page, b, "discussion");
    await expect(page.locator("#pdText")).toHaveValue("");
    await page.locator("#pdText").fill("Draft for B " + tag);
    await page.evaluate(t => { openTask(t); S.drawerTab = "comments"; renderDrawer(); }, taskId);
    await expect(page.locator("#cmtText")).toHaveValue("");
    await page.locator("#cmtText").fill("Task draft " + tag);
    await page.evaluate(() => closeDrawer());
    await openProject(page, a, "discussion");
    await expect(page.locator("#pdText")).toHaveValue("Draft for A " + tag);
    await openProject(page, b, "overview");
    await expect(page.locator("#pdText")).toHaveValue("Draft for B " + tag);
    await page.evaluate(t => { openTask(t); S.drawerTab = "comments"; renderDrawer(); }, taskId);
    await expect(page.locator("#cmtText")).toHaveValue("Task draft " + tag);
    await page.evaluate(() => closeDrawer());
  } finally {
    await page.evaluate(t => apiFetch("DELETE", "/api/tasks/" + t).catch(() => {}), taskId);
    await dropProjects(page, [a, b]);
  }
});

test("an archived project's discussion can be read but not added to; restored, it takes comments again", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page, ADMIN);
  const tag = Date.now().toString(36), c = await newProject(page, "Archived talk " + tag);
  try {
    const setStatus = s => page.evaluate(async ([id, st]) => { const doc = (await apiFetch("GET", "/api/bootstrap")).projects.find(p => p.id === id); await apiFetch("PUT", "/api/projects/" + id, Object.assign({}, doc, { status: st })); await reloadAll(); }, [c, s]);
    await page.evaluate(([id, t]) => apiFetch("POST", "/api/projects/" + id + "/comments", { text: "Before the archive " + t }), [c, tag]);
    await setStatus("archived");
    await openProject(page, c);
    const card = page.locator("#content .pd-overview");
    await expect(card.locator(".cmt .body")).toContainText("Before the archive " + tag);
    await expect(card.locator(".pd-archived")).toContainText("This project is archived. Restore the project to add comments.");
    expect(await card.locator("#pdText").count()).toBe(0);
    expect(await card.locator(".cmt .acts").count()).toBe(0);
    await openProject(page, c, "discussion");
    const tab = page.locator("#content .pd-full");
    await expect(tab.locator(".cmt .body")).toContainText("Before the archive " + tag);
    expect(await tab.locator(".cmt .acts").count()).toBe(0);
    expect(await tab.locator("#pdText").count()).toBe(0);
    await setStatus("active");
    await page.evaluate(() => renderScreen(false));
    await expect(page.locator("#content .pd-full #pdText")).toBeVisible();
    await expect(tab.locator(".cmt .acts button", { hasText: "Reply" })).toBeVisible();
  } finally { await dropProjects(page, [c]); }
});

test("a notification about a comment, or a link to it, opens the discussion at that comment — an older one too", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page, ADMIN);
  const tag = Date.now().toString(36), d = await newProject(page, "Linked talk " + tag);
  try {
    /* 23 threads: the oldest is not among the first twenty the tab loads */
    const ids = await page.evaluate(async ([id, t]) => { const out = []; for (let i = 1; i <= 23; i++) out.push((await apiFetch("POST", "/api/projects/" + id + "/comments", { text: "Thought " + i + " " + t })).comment.id); return out; }, [d, tag]);
    await page.evaluate(([id, cid, t]) => { NOTIFS.unshift(hNotif({ id: "nt_pd_" + t, k: "mention", who: ME, t: id, entityType: "project", message: JSON.stringify({ comment: cid, text: "Thought 1 " + t }), createdAt: new Date().toISOString(), read: false })); go("home"); openPop("notifPop", document.getElementById("notifBtn")); renderNotifs(); }, [d, ids[0], tag]);
    const row = page.locator("#notifList .notif").filter({ hasText: "in the discussion on" }).first();
    await expect(row).toContainText("Linked talk " + tag);
    await expect(row.locator(".notif-preview")).toHaveText("Thought 1 " + tag);
    await row.click();
    const first = page.locator('#content .pd-full .cmt[data-cid="' + ids[0] + '"]');
    await expect(first).toBeVisible();
    await expect(first).toBeInViewport();
    expect(await page.evaluate(() => [S.screen, S.projectTab])).toEqual(["projects", "discussion"]);
    /* a link, as e-mails and push notifications send */
    await page.goto("/projects/" + d + "?tab=discussion&comment=" + ids[10]);
    await ready(page);
    await expect(page.locator('#content .pd-full .cmt[data-cid="' + ids[10] + '"]')).toBeInViewport();
  } finally { await dropProjects(page, [d]); }
});

test("a colleague's comment appears on the page without a reload", async ({ browser }) => {
  const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await signIn(admin, ADMIN);
  const tag = Date.now().toString(36), other = { email: "pd-live-" + tag + "@e2e.test", pw: "Live!Discuss-2026x" };
  const p = await newProject(admin, "Live talk " + tag);
  const member = await admin.evaluate(async o => { await apiFetch("POST", "/api/members", { name: "Discuss Tester " + o.tag, email: o.email, perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email); await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw }); return id; }, Object.assign({ tag }, other));
  const two = await (await browser.newContext()).newPage();
  try {
    await signIn(two, other);
    await openProject(admin, p);
    await expect(admin.locator("#content .pd-overview .pd-empty")).toBeVisible();
    await admin.waitForTimeout(600);   /* its live stream is open */
    await two.evaluate(([id, t]) => apiFetch("POST", "/api/projects/" + id + "/comments", { text: "From a colleague " + t }), [p, tag]);
    await expect(admin.locator("#content .pd-overview .cmt .body")).toContainText("From a colleague " + tag, { timeout: 8000 });
    await expect(admin.locator("#content .pd-overview .panel-head .cnt")).toHaveText("1");
    /* a reply being written under it keeps its box, its words and its caret while more arrives */
    await admin.locator("#content .pd-overview .cmt .acts .cmt-reply-btn").click();
    const rta = admin.locator("#content .pd-overview .cmt-reply-box #pdReplyText");
    await expect(rta).toBeFocused();
    await admin.keyboard.type("Half typed");
    await admin.keyboard.press("ArrowLeft");
    await two.evaluate(([id, t]) => apiFetch("POST", "/api/projects/" + id + "/comments", { text: "And another " + t }), [p, tag]);
    await expect(admin.locator("#content .pd-overview .panel-head .cnt")).toHaveText("2", { timeout: 8000 });
    await expect(rta).toHaveValue("Half typed");
    await expect(rta).toBeFocused();
    expect(await rta.evaluate(t => t.selectionStart)).toBe(9);
    await admin.keyboard.press("Escape");
    await expect(admin.locator("#content .pd-overview .cmt-reply-box")).toHaveCount(0);
  } finally {
    await dropProjects(admin, [p]);
    await admin.evaluate(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}), member);
  }
});

test("on a phone the Discussion tab and its box fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ADMIN);
  const tag = Date.now().toString(36), m = await newProject(page, "Phone talk " + tag);
  try {
    await page.evaluate(([id, t]) => apiFetch("POST", "/api/projects/" + id + "/comments", { text: "A long first thought about the campaign direction and what still needs review before launch " + t }), [m, tag]);
    await openProject(page, m);
    /* on Overview a long comment shows two lines; "Show more" shows it all, there */
    const more = page.locator("#content .pd-overview .pd-more-text");
    await expect(more).toHaveText("Show more");
    await more.click();
    await expect(page.locator("#content .pd-overview .cmt.pd-expanded")).toHaveCount(1);
    await expect(more).toHaveCount(0);
    expect(await page.evaluate(() => S.projectTab)).toBe("overview");
    await page.locator('.ptabs .tab[data-tab="discussion"]').click();
    await expect(page.locator("#content .pd-full .cmt")).toHaveCount(1);
    await expect(page.locator("#content .pd-full #pdText")).toBeVisible();
    await expect(page.locator("#content .pd-full .composer .m-attach")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    /* Reply: the box is the whole width under the comment */
    await page.locator("#content .pd-full .cmt .acts .cmt-reply-btn").click();
    await expect(page.locator("#content .pd-full #pdReplyText")).toBeFocused();
    const g = await page.evaluate(() => { const c = document.querySelector("#content .pd-full .cmt").getBoundingClientRect(), b = document.querySelector("#content .pd-full .cmt-reply-box").getBoundingClientRect(); return [Math.round(b.left - c.left), Math.round(b.right - c.right), document.documentElement.scrollWidth <= window.innerWidth]; });
    expect(g).toEqual([0, 0, true]);
  } finally { await dropProjects(page, [m]); }
});
