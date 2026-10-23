/* Reply opens its box where the reply will be (Oct 2026). The owner: "komentar yang terbuka text editornya di tepat
   dimana dia balas jangan dibawah" — the box used to be the one at the bottom of the comments, saying "Replying to".
   Now Reply opens a compact box under the comment's thread, after its replies, indented as they are (the whole width
   under the comment on a phone), with everything the box at the bottom has: the @ picker at its caret, attachments,
   named links, pasted pictures, Enter or Ctrl+Enter to send, Esc or Cancel to let it go. One box is open at a time;
   each comment keeps its own unsent reply. Sent, the reply is drawn in its place — nothing blinks — and the focus is
   back on Reply. A colleague's comment arriving keeps the box, what is in it and the caret. Someone who may comment
   but not edit the task (a Viewer) replies the same way; their reply goes through the comment route, which now keeps
   the comment it answers (tests/comments-route.test.js). Both languages. The project discussion: project-discussion.spec. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tag = Date.now().toString(36);
const VIEWER = { name: "Vina Viewer " + tag, email: "vina-" + tag + "@e2e.test", pw: "Vina!Reply-2026x" };
let admin, viewer, ids = {};
const openComments = (page, id) => page.evaluate(i => { openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
const saved = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => d.comments), id || ids.task);
/* what the comments list holds, in order: each comment's id, and "box" for the reply box */
const order = page => page.locator("#drawer .cmts > *").evaluateAll(els => els.map(e => e.getAttribute("data-cid") || (e.classList.contains("cmt-reply-box") ? "box" : e.className)));
const cmt = (page, id) => page.locator('#drawer .cmt[data-cid="' + id + '"]');
const replyBtn = (page, id) => cmt(page, id).locator(":scope > div > .acts .cmt-reply-btn");

/* a real clipboard paste of a picture: a PNG the page makes, on a DataTransfer, dispatched at the field */
const pasteImage = (page, sel, name) => page.evaluate(async ([s, n]) => {
  const c = document.createElement("canvas"); c.width = 200; c.height = 120; const x = c.getContext("2d"); x.fillStyle = "#0F766E"; x.fillRect(0, 0, 200, 120);
  const blob = await new Promise(r => c.toBlob(r, "image/png")), dt = new DataTransfer(); dt.items.add(new File([blob], n, { type: "image/png" }));
  const el = document.querySelector(s); el.focus(); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, [sel, name]);
const FOLDER = "https://drive.google.com/drive/folders/1ReplyFolderKV", KV = "Reply Campaign KV", CHIP = String.fromCharCode(0x2001);

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] })).newPage();
  /* the test server cannot reach Google: a Drive link's name is answered here */
  await admin.route("**/api/links/title**", r => { const u = new URL(r.request().url()).searchParams.get("url") || ""; r.fulfill({ contentType: "application/json", body: JSON.stringify({ title: u.includes("1ReplyFolderKV") ? KV : "" }) }); });
  await admin.route(/^https:\/\/(drive|docs)\.google\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await signIn(admin, ADMIN);
  ids = await admin.evaluate(async o => {
    await apiFetch("POST", "/api/members", { name: o.v.name, email: o.v.email, perm: "viewer", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people, vid = Object.keys(people).find(id => people[id].email === o.v.email);
    await apiFetch("POST", "/api/members/" + vid + "/password", { password: o.v.pw });
    const t = await apiFetch("POST", "/api/tasks", { title: "Inline reply " + o.tag, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] });
    const c = { a: "cm_ira_" + o.tag, a1: "cm_ira1_" + o.tag, b: "cm_irb_" + o.tag };
    await apiFetch("POST", "/api/tasks/" + t.id + "/comments", { id: c.a, text: "Which logo do we use?" });
    await apiFetch("POST", "/api/tasks/" + t.id + "/comments", { id: c.a1, text: "The blue one", parent: c.a });
    await apiFetch("POST", "/api/tasks/" + t.id + "/comments", { id: c.b, text: "Deadline is Friday" });
    await reloadAll();
    return Object.assign({ viewer: vid, task: t.id, me: ME }, c);
  }, { v: VIEWER, tag });
});
test.afterAll(async () => {
  if (viewer) await viewer.context().close().catch(() => {});
  if (admin) await admin.evaluate(async x => { try { setLanguage("en"); closeDrawer(); } catch (e) {} window._cmtDraft = ""; window._cmtAtt = []; window._cmtMentions = []; CMT_DRAFTS = {}; CMT_REPLY_OPEN = {}; await apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {}); await apiFetch("DELETE", "/api/members/" + x.viewer).catch(() => {}); }, ids).catch(() => {});
});

test("Reply opens a box under the comment's thread; @ picks someone there; sent, the reply is in its place and nothing blinks", async () => {
  await openComments(admin, ids.task);
  const dr = admin.locator("#drawer"), box = dr.locator(".cmt-reply-box");
  await expect(box).toHaveCount(0);
  await replyBtn(admin, ids.a).click();
  await expect(box).toHaveCount(1);
  await expect(box.locator("#cmtReplyText")).toBeFocused();
  await expect(box.locator(".cmt-reply-to")).toHaveText("Replying to Admin E2E");
  await expect(replyBtn(admin, ids.a)).toHaveAttribute("aria-expanded", "true");
  await expect(replyBtn(admin, ids.b)).toHaveAttribute("aria-expanded", "false");
  /* after the thread's reply, before the next thread — indented as that reply is */
  expect(await order(admin)).toEqual([ids.a, ids.a1, "box", ids.b]);
  const geo = await admin.evaluate(o => { const r = document.querySelector('#drawer .cmt[data-cid="' + o.a1 + '"]').getBoundingClientRect(), b = document.querySelector("#drawer .cmt-reply-box").getBoundingClientRect(), root = document.querySelector('#drawer .cmt[data-cid="' + o.a + '"]').getBoundingClientRect(); return { reply: Math.round(r.left), box: Math.round(b.left), root: Math.round(root.left), right: Math.round(b.right), rootRight: Math.round(root.right) }; }, ids);
  expect(geo.box).toBe(geo.reply);
  expect(geo.box).toBeGreaterThan(geo.root);
  expect(Math.abs(geo.right - geo.rootRight)).toBeLessThanOrEqual(1);
  /* the box at the bottom stays, for new comments, and says nothing of a reply */
  const bottom = dr.locator(".cmts + .composer");
  await expect(bottom.locator("#cmtText")).toBeVisible();
  await expect(bottom).not.toContainText("Replying to");
  /* the box has what the one at the bottom has: the paperclip, @, Cancel, and it sends as a reply */
  await expect(box.locator(".m-attach")).toHaveCount(1);
  await expect(box.locator(".cmt-at")).toHaveCount(1);
  await expect(box.locator(".cmt-reply-cancel")).toHaveText("Cancel");
  await expect(box.locator(".bar .btn.primary")).toHaveText("Reply");
  await expect(box.locator(".bar .hint")).toContainText("Esc cancels");
  /* @: the picker opens at this box's caret, and the name is written and coloured here */
  await admin.keyboard.type("Agreed, @Vina");
  const picker = admin.locator("#entityPicker.ep-mention");
  await expect(picker).toContainText(VIEWER.name);
  const at = await admin.evaluate(() => { const p = document.getElementById("entityPicker").getBoundingClientRect(), t = document.getElementById("cmtReplyText").getBoundingClientRect(); return { top: p.top, bottom: p.bottom, tTop: t.top, tBottom: t.bottom, vh: innerHeight }; });
  const below = at.top >= at.tTop && at.top <= at.tBottom + 24, above = at.bottom <= at.tBottom && at.bottom >= at.tTop - 24;
  expect(below || above, "the picker is at the reply box: " + JSON.stringify(at)).toBe(true);
  expect(at.bottom).toBeLessThanOrEqual(at.vh);
  await admin.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(box.locator("#cmtReplyText")).toHaveValue("Agreed, @" + VIEWER.name + " ");
  await expect(box.locator(".cmt-ta-mirror .msg-mention")).toHaveText("@" + VIEWER.name);
  await expect(bottom.locator("#cmtText")).toHaveValue("");
  await admin.keyboard.type("thanks");
  /* every frame from here: the thread is on show, and the panel keeps its place */
  await admin.evaluate(rid => { const sc = (() => { let n = document.querySelector("#drawer .cmts"); while (n && n !== document.body) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; } return document.scrollingElement; })();
    const w = window.__irWatch = { frames: 0, missing: 0, jumps: 0, top: sc.scrollTop, stop: false };
    const tick = () => { if (w.stop) return; w.frames++; const el = document.querySelector('#drawer .cmt[data-cid="' + rid + '"] > div > .body'); if (!el || !el.textContent.trim()) w.missing++; if (Math.abs(sc.scrollTop - w.top) > 2) w.jumps++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick); }, ids.a);
  await admin.keyboard.press("Control+Enter");
  await expect(box).toHaveCount(0);
  const mine = dr.locator(".cmt.reply", { hasText: "thanks" });
  await expect(mine).toBeVisible();
  await expect(replyBtn(admin, ids.a)).toBeFocused();
  await expect.poll(async () => ((await saved(admin)).find(c => /thanks$/.test(c.text)) || {}).parent).toBe(ids.a);
  const sent = (await saved(admin)).find(c => /thanks$/.test(c.text));
  await expect.poll(() => order(admin)).toEqual([ids.a, ids.a1, sent.id, ids.b]);
  await admin.waitForTimeout(400);
  await expect(replyBtn(admin, ids.a), "the focus stays on Reply after the server's answer is drawn").toBeFocused();
  const w = await admin.evaluate(() => { window.__irWatch.stop = true; return window.__irWatch; });
  expect(w.frames).toBeGreaterThan(5);
  expect(w.missing, "frames without the thread").toBe(0);
  expect(w.jumps, "frames where the panel scrolled").toBe(0);
  await expect(mine.locator(".msg-mention")).toHaveText("@" + VIEWER.name);
  await expect(bottom).not.toContainText("Replying to");
});

test("one box at a time, each comment keeps its unsent reply; Esc and Cancel let it go and give the focus back to Reply", async () => {
  await openComments(admin, ids.task);
  const dr = admin.locator("#drawer"), box = dr.locator(".cmt-reply-box"), ta = box.locator("#cmtReplyText");
  await replyBtn(admin, ids.a).click();
  await admin.keyboard.type("Draft for A");
  /* another comment's Reply: the box moves there, empty; A's words wait for A */
  await replyBtn(admin, ids.b).click();
  await expect(box).toHaveCount(1);
  expect((await order(admin)).slice(-2)).toEqual([ids.b, "box"]);
  await expect(ta).toBeFocused();
  await expect(ta).toHaveValue("");
  await expect(replyBtn(admin, ids.a)).toHaveText("Reply (draft)");
  /* Esc: the box closes, the task panel stays, the focus is on that comment's Reply */
  await admin.keyboard.type("Never mind");
  await admin.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await expect(dr).toHaveClass(/\bopen\b/);
  await expect(replyBtn(admin, ids.b)).toBeFocused();
  await expect(replyBtn(admin, ids.b)).toHaveText("Reply");
  /* back to A: A's words, the caret after them */
  await replyBtn(admin, ids.a).click();
  await expect(ta).toHaveValue("Draft for A");
  expect(await ta.evaluate(t => t.selectionStart === t.value.length && document.activeElement === t)).toBe(true);
  /* Esc with the @ picker open closes the picker only */
  await admin.keyboard.type(" @");
  await expect(admin.locator("#entityPicker.ep-mention")).toBeVisible();
  await admin.keyboard.press("Escape");
  await expect(admin.locator("#entityPicker")).toHaveCount(0);
  await expect(box).toHaveCount(1);
  await expect(ta).toHaveValue("Draft for A @");
  /* Cancel: closed, and what was written in it is let go */
  await box.locator(".cmt-reply-cancel").click();
  await expect(box).toHaveCount(0);
  await expect(replyBtn(admin, ids.a)).toBeFocused();
  await expect(replyBtn(admin, ids.a)).toHaveText("Reply");
  await replyBtn(admin, ids.a).click();
  await expect(ta).toHaveValue("");
  /* a reply to a reply: the box goes where that reply will be, at the end of the thread, and names whom it answers */
  await replyBtn(admin, ids.a1).click();
  expect((await order(admin)).indexOf("box")).toBe((await order(admin)).indexOf(ids.b) - 1);
  await expect(replyBtn(admin, ids.a1)).toHaveAttribute("aria-expanded", "true");
  await expect(box.locator(".cmt-reply-to")).toHaveText("Replying to Admin E2E");
  /* the box at the bottom keeps its own words through all of it */
  await dr.locator("#cmtText").click();
  await admin.keyboard.type("A new thought");
  await ta.click();
  await admin.keyboard.type("Same here");
  await expect(dr.locator("#cmtText")).toHaveValue("A new thought");
  await admin.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  await expect.poll(async () => ((await saved(admin)).find(c => c.text === "Same here") || {}).parent).toBe(ids.a);
  await expect(dr.locator("#cmtText")).toHaveValue("A new thought");
  /* and sends a comment of its own */
  await dr.locator("#cmtText").press("Enter");
  await expect.poll(async () => (await saved(admin)).some(c => c.text === "A new thought" && !c.parent)).toBe(true);
  await expect(dr.locator("#cmtText")).toHaveValue("");
});

test("the reply box has the tools of the box at the bottom: the paperclip, a pasted picture, a pasted Drive link read as its name", async () => {
  await openComments(admin, ids.task);
  const dr = admin.locator("#drawer"), box = dr.locator(".cmt-reply-box"), ta = box.locator("#cmtReplyText"), bottom = dr.locator(".cmts + .composer");
  await replyBtn(admin, ids.b).click();
  await admin.keyboard.type("Files: ");
  /* a Drive link pasted: its name, a capsule in this box's layer */
  await admin.evaluate(t => navigator.clipboard.writeText(t), FOLDER);
  await admin.keyboard.press("Control+V");
  await admin.keyboard.type(" ok");
  await expect(ta).toHaveValue("Files: " + CHIP + KV + " ok");
  await expect(box.locator(".cmt-ta-mirror .cmt-chip-name")).toHaveText(KV);
  /* the paperclip: Attach link, from this box, lands in this box */
  await box.locator(".m-attach").click();
  await admin.locator("#ctxMenu.m-attach-menu button", { hasText: /^\s*Attach link\s*$/ }).click();
  await admin.locator("#cmt_url").fill("https://example.org/files/reply-brief.pdf");
  await admin.locator("#modal .btn.primary").click();
  await expect(box.locator(".att.att-chip")).toHaveCount(1);
  await expect(bottom.locator(".att")).toHaveCount(0);
  /* a picture pasted into it */
  await pasteImage(admin, "#cmtReplyText", "reply-shot.png");
  await expect(box.locator(".att.att-img")).toHaveCount(1);
  await expect(ta).toBeFocused();
  await expect(ta).toHaveValue("Files: " + CHIP + KV + " ok");
  await expect(box.locator(".cmt-ta-mirror .cmt-chip-name")).toHaveText(KV);
  /* sent: one reply, in its thread, with its link written by name and both attachments */
  await admin.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  await expect.poll(async () => { const c = (await saved(admin)).find(x => /^Files:/.test(x.text)); return c ? [c.parent, c.text, c.attachments.length] : null; }).toEqual([ids.b, "Files: [" + KV + "](" + FOLDER + ") ok", 2]);
  await expect(dr.locator(".cmt.reply", { hasText: "Files:" }).locator(".drive-chip").first()).toHaveText(KV);
});

test("a colleague's comment arriving keeps the reply box, what is in it and the caret", async ({ browser }) => {
  viewer = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await signIn(viewer, VIEWER);
  /* a new member is welcomed with the workspace quest */
  await viewer.locator("#modalWrap.open").waitFor({ timeout: 4000 }).catch(() => {});
  await viewer.evaluate(() => closeModal());
  await openComments(admin, ids.task);
  const dr = admin.locator("#drawer"), box = dr.locator(".cmt-reply-box"), ta = box.locator("#cmtReplyText");
  await replyBtn(admin, ids.b).click();
  await admin.keyboard.type("Half thought");
  for (let i = 0; i < 8; i++) await admin.keyboard.press("ArrowLeft");
  /* a new comment, and a reply in this very thread, from someone else */
  await viewer.evaluate(o => apiFetch("POST", "/api/tasks/" + o.task + "/comments", { id: "cm_irl_" + o.tag, text: "Live from Vina" }), Object.assign({ tag }, ids));
  await expect(dr.locator(".cmt", { hasText: "Live from Vina" })).toBeVisible({ timeout: 15000 });
  await expect(box).toHaveCount(1);
  await expect(ta).toHaveValue("Half thought");
  await expect(ta).toBeFocused();
  expect(await ta.evaluate(t => [t.selectionStart, t.selectionEnd])).toEqual([4, 4]);
  await viewer.evaluate(o => apiFetch("POST", "/api/tasks/" + o.task + "/comments", { id: "cm_irl2_" + o.tag, text: "Friday works", parent: o.b }), Object.assign({ tag }, ids));
  await expect(dr.locator(".cmt.reply", { hasText: "Friday works" })).toBeVisible({ timeout: 15000 });
  const now = await order(admin), at = now.indexOf("cm_irl2_" + tag);
  expect(at).toBeGreaterThan(now.indexOf(ids.b));
  expect(now[at + 1], "the colleague's reply joins the thread, above the box").toBe("box");
  await expect(ta).toHaveValue("Half thought");
  await expect(ta).toBeFocused();
  await admin.keyboard.type(" a");
  await expect(ta).toHaveValue("Half a thought");
  await admin.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
});

test("someone who may comment but not edit the task replies in place; the reply stays under its comment", async () => {
  await openComments(viewer, ids.task);
  expect(await viewer.evaluate(i => canI.editTask(task(i)), ids.task)).toBe(false);
  const calls = []; viewer.on("request", r => { if (r.url().includes("/api/tasks/" + ids.task)) calls.push(r.method() + " " + r.url().replace(/^.*\/api/, "/api")); });
  const box = viewer.locator("#drawer .cmt-reply-box");
  await replyBtn(viewer, ids.a).click();
  await expect(box.locator("#cmtReplyText")).toBeFocused();
  await expect(box.locator(".cmt-reply-to")).toHaveText("Replying to Admin E2E");
  await viewer.keyboard.type("From the viewer");
  await viewer.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  await expect.poll(async () => ((await saved(admin)).find(c => c.text === "From the viewer") || {}).parent).toBe(ids.a);
  expect(calls).toContain("POST /api/tasks/" + ids.task + "/comments");
  expect(calls.some(c => c.startsWith("PUT "))).toBe(false);
  const mine = (await saved(admin)).find(c => c.text === "From the viewer");
  expect(mine.by).toBe(ids.viewer);
  /* drawn under its comment, in the viewer's panel and, once it arrives, in the admin's */
  await expect(viewer.locator('#drawer .cmt.reply[data-cid="' + mine.id + '"]')).toBeVisible();
  const thread = await order(viewer), at = thread.indexOf(ids.a);
  expect(thread.indexOf(mine.id)).toBeGreaterThan(at);
  expect(thread.indexOf(mine.id)).toBeLessThan(thread.indexOf(ids.b));
  await expect(replyBtn(viewer, ids.a)).toBeFocused();
  await expect(admin.locator('#drawer .cmt.reply[data-cid="' + mine.id + '"]')).toBeVisible({ timeout: 15000 });
});

test("on a phone the box is the whole width under the comment", async () => {
  await admin.setViewportSize({ width: 390, height: 844 });
  try {
    await openComments(admin, ids.task);
    await replyBtn(admin, ids.b).click();
    const box = admin.locator("#drawer .cmt-reply-box");
    await expect(box.locator("#cmtReplyText")).toBeFocused();
    const g = await admin.evaluate(b => { const r = document.querySelector('#drawer .cmt[data-cid="' + b + '"]').getBoundingClientRect(), x = document.querySelector("#drawer .cmt-reply-box").getBoundingClientRect(), t = document.getElementById("cmtReplyText").getBoundingClientRect(); return { left: Math.round(x.left), right: Math.round(x.right), cLeft: Math.round(r.left), cRight: Math.round(r.right), taW: Math.round(t.width), sw: document.documentElement.scrollWidth, vw: innerWidth, avatar: getComputedStyle(document.querySelector("#drawer .cmt-reply-box > .av")).display, bottom: x.bottom, vh: innerHeight }; }, ids.b);
    expect(Math.abs(g.left - g.cLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.right - g.cRight)).toBeLessThanOrEqual(1);
    expect(g.taW).toBeGreaterThan(g.cRight - g.cLeft - 40);
    expect(g.avatar).toBe("none");
    expect(g.sw, "no sideways scroll").toBeLessThanOrEqual(g.vw);
    await expect(box).toBeInViewport();
    await admin.keyboard.type("On the go");
    await admin.keyboard.press("Enter");
    await expect(box).toHaveCount(0);
    await expect.poll(async () => ((await saved(admin)).find(c => c.text === "On the go") || {}).parent).toBe(ids.b);
  } finally { await admin.setViewportSize({ width: 1366, height: 900 }); }
});

test("in dark mode what is typed in the reply box reads light on dark, as in the box at the bottom", async () => {
  try {
    for (const mode of ["dark", "light"]) {
      await admin.evaluate(m => setAppearance(m), mode);
      await openComments(admin, ids.task);
      await replyBtn(admin, ids.b).click();
      await admin.keyboard.type("Looks good");
      const l = await admin.evaluate(() => {
        const ta = document.getElementById("cmtReplyText"), m = ta.parentNode.querySelector(".cmt-ta-mirror"), box = ta.closest(".composer");
        const rgb = s => (s.match(/[\d.]+/g) || []).map(Number), alpha = c => c.length > 3 ? c[3] : 1;
        const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const mBg = rgb(getComputedStyle(m).backgroundColor), behind = alpha(mBg) ? mBg : rgb(getComputedStyle(box).backgroundColor), fg = rgb(getComputedStyle(m).color), a = lum(fg), b = lum(behind);
        return { covers: alpha(rgb(getComputedStyle(ta).backgroundColor)) > 0, text: m.textContent.replace(/\u200b/g, ""), contrast: ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) };
      });
      expect(l.covers, mode).toBe(false);
      expect(l.text, mode).toBe("Looks good");
      expect(l.contrast, mode + ": readable").toBeGreaterThan(7);
      await admin.keyboard.press("Escape");
    }
  } finally { await admin.evaluate(() => setAppearance("light")); }
});

test("in Indonesian", async () => {
  await admin.evaluate(() => setLanguage("id"));
  try {
    await openComments(admin, ids.task);
    const box = admin.locator("#drawer .cmt-reply-box");
    await expect(replyBtn(admin, ids.a)).toHaveText("Balas");
    await replyBtn(admin, ids.a).click();
    await expect(box.locator(".cmt-reply-to")).toHaveText("Membalas Admin E2E");
    await expect(box.locator(".cmt-reply-cancel")).toHaveText("Batal");
    await expect(box.locator(".bar .btn.primary")).toHaveText("Balas");
    await expect(box.locator("#cmtReplyText")).toHaveAttribute("placeholder", "Tulis balasan… ketik @ untuk menyebut seseorang");
    await expect(box.locator("#cmtReplyText")).toHaveAttribute("aria-label", "Balas Admin E2E");
    await admin.keyboard.type("Setuju");
    await replyBtn(admin, ids.b).click();
    await expect(replyBtn(admin, ids.a)).toHaveText("Balas (draft)");
    await admin.keyboard.press("Escape");
    await replyBtn(admin, ids.a).click();
    await box.locator(".cmt-reply-cancel").click();
    await expect(box).toHaveCount(0);
  } finally { await admin.evaluate(() => setLanguage("en")); }
});
