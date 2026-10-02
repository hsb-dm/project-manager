/* Assets & versions, simplified — one version box, notes instead of pins.

   The tab reads top to bottom: the version (always the latest, its preview, its notes, the one
   decision to make now), Final files, then From comments: screenshots and links shared while
   talking about the work. Those are kept in sight but are not deliverables — not in the asset
   links, the dashboard or the export — until someone marks one as final.

   The round trip: the reviewer writes notes on the version (a pasted screenshot goes with one) and
   sends them back; they land in the comments as one message. The designer ticks them off and
   "Revised" turns V1 into V2 in the same box, which is submitted for review as its own step; V1's
   notes are a button away. A link handed over in a comment can be the next version as it is. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const PNG = color => `(() => { const c = document.createElement("canvas"); c.width = 320; c.height = 200; const x = c.getContext("2d"); x.fillStyle = "${color}"; x.fillRect(0, 0, 320, 200); return c.toDataURL("image/png"); })()`;
const FOLDER = "https://drive.google.com/drive/folders/1YujA_GjKigwSJXbRJTkO1l2p1gMmm8ai";
const ROUND4 = "https://drive.google.com/file/d/1Round4File/view";
let taskId = null;
let storageBefore;   /* what storage was set to before this spec changed it */

async function signIn(page) {
  /* the previews are Google's and Figma's own pages; the test does not need them to load */
  await page.route(/^https:\/\/(drive|docs)\.google\.com\/|^https:\/\/www\.figma\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const openTab = (page, tab) => page.evaluate(([id, t]) => { openTask(id); S.drawerTab = t; renderDrawer(); }, [taskId, tab]);
const taskNow = page => page.evaluate(id => JSON.parse(JSON.stringify(task(id))), taskId);
const saved = page => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id), taskId);
/* The page shows a change before its save has reached the server: read the server once it has it. */
async function savedWhen(page, has) { let s = null; await expect.poll(async () => { s = await saved(page); return !!has(s); }, { timeout: 10000 }).toBe(true); return s; }

test("a task with a version waiting for review", async ({ page }) => {
  await signIn(page);
  storageBefore = await page.evaluate(() => (typeof stoCfg === "function" ? stoCfg().storage || null : null));
  await page.evaluate(() => { if (typeof stoSet === "function" && storageMode() !== "server") stoSet("server"); });
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Assets tab project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Assets tab project"))).toBe(true);
  await page.evaluate(() => { newTaskModal({ title: "Assets tab target", proj: PROJECTS.find(p => p.name === "Assets tab project").id, assignee: ME }); createDraft(); });
  await expect.poll(() => page.evaluate(() => TASKS.some(t => t.title === "Assets tab target" && !t._draft)), { timeout: 10000 }).toBe(true);
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Assets tab target").id);
  await page.evaluate(`(async () => { openTask("${taskId}"); await pushVersion(task("${taskId}"), ${PNG("#0F766E")}, "First layout", true); })()`);
  await expect.poll(() => page.evaluate(id => task(id).versions.length, taskId)).toBe(1);
  await page.evaluate(id => { openTask(id); submitReview(); }, taskId);
  await expect.poll(() => page.evaluate(id => isReview(task(id)), taskId)).toBe(true);
  /* a delivered file, so there is something under Final files */
  await page.evaluate(id => editTaskWith(task(id), t => { t.files.push(F("Banner_final.png", "image", "link", "0.4 MB", 0, "https://example.org/files/Banner_final.png")); }), taskId);
  await page.waitForTimeout(400);
});

test("the tab reads as one story: the version, final files, the reporting count", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  const heads = await page.locator("#drBody .av-head h3").allInnerTexts();
  expect(heads[0]).toMatch(/^Version 1/);
  expect(heads).toContain("Final files");
  await expect(page.locator("#drBody .av-count")).toContainText("Assets produced");
  /* the old duplicate parts are gone, and so are the pins */
  expect(await page.locator("#drBody .panel-head h2", { hasText: "Assets" }).count(), "no separate Assets link panel").toBe(0);
  expect(await page.locator("#drBody").innerText()).not.toContain("Versions & approval");
  await expect(page.locator("#drBody .pin, #drBody .annots, #drBody [onclick*='addAnnot']")).toHaveCount(0);
  expect(await page.locator("#drBody").innerText()).not.toContain("annotation");
  /* the notes, under the preview */
  await expect(page.locator("#verNotes .vn-head")).toContainText("Notes");
  await expect(page.locator("#verNoteText")).toBeVisible();
  /* the one decision to make now, beside the version */
  await expect(page.locator("#drBody .av-decision.ask")).toContainText("Waiting for your review");
  await expect(page.locator("#drBody .av-decision.ask").getByRole("button", { name: "Approve" })).toBeVisible();
});

test("Request revision with no notes asks for one first and sends nothing", async ({ page }) => {
  await signIn(page);
  await openTab(page, "brief");
  /* the footer's button goes the same way as the one beside the version */
  await page.locator("#drawer .dr-foot .btn", { hasText: "Request revision" }).click();
  await expect(page.locator("#drHead .tab.on")).toContainText("Assets");
  await expect(page.locator("#verNoteText")).toBeFocused();
  await expect(page.locator("#modalWrap.open")).toHaveCount(0);
  expect((await taskNow(page)).versions[0].state).not.toBe("revision");
});

test("a note is written on the version; a pasted screenshot goes with it", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#verNoteText").fill("Headline too small");
  await page.locator("#verNoteText").press("Enter");
  await expect(page.locator("#verNotes .vn-row")).toHaveCount(1);
  await expect(page.locator("#verNoteText")).toHaveValue("");
  /* paste a screenshot into the note box */
  await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 320; c.height = 200; const x = c.getContext("2d"); x.fillStyle = "#B91C1C"; x.fillRect(0, 0, 320, 200);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "image.png", { type: "image/png" }));
    const ta = document.getElementById("verNoteText"); ta.focus();
    ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#verNoteImg .vn-pending img")).toBeVisible();
  /* nothing else took the paste: no version upload opened */
  await expect(page.locator("#modalWrap.open")).toHaveCount(0);
  await page.locator("#verNoteText").fill("Logo goes top right");
  await page.locator("#verNotes .vn-add .btn", { hasText: "Add note" }).click();
  await expect(page.locator("#verNotes .vn-row")).toHaveCount(2);
  await expect(page.locator("#verNotes .vn-row").nth(1).locator("img.vn-img")).toBeVisible();
  await expect(page.locator("#drBody .av-decision .btn", { hasText: "Request revision" })).toContainText("2");

  const me = await page.evaluate(() => ME);
  const notes = (await savedWhen(page, x => x.versions[0].annots.length === 2)).versions[0].annots;
  expect(notes.map(n => n.text)).toEqual(["Headline too small", "Logo goes top right"]);
  expect(notes.every(n => n.by === me && n.at && n.done === false)).toBe(true);
  expect(notes[1].img, "the screenshot is stored on the server").toMatch(/^\/files\//);
  /* the text box is left where it was typed in a re-render */
  await page.locator("#verNoteText").fill("half a thought");
  await page.evaluate(() => renderDrawer());
  await expect(page.locator("#verNoteText")).toHaveValue("half a thought");
  await page.locator("#verNoteText").fill("");
  await page.locator("#verNoteText").dispatchEvent("input");
});

test("Request revision sends the notes back, and into the comments as one message", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#drBody .av-decision .btn", { hasText: "Request revision" }).click();
  await expect(page.locator("#modal .vn-sum li")).toHaveCount(2);
  await page.locator("#rv_prio").selectOption("urgent");
  await page.locator("#modal .btn", { hasText: "Send revision request" }).click();
  await expect.poll(async () => (await taskNow(page)).versions[0].state, { timeout: 10000 }).toBe("revision");

  const t = await taskNow(page);
  expect(["revision", "work"]).toContain(await page.evaluate(id => stageKind(task(id).status), taskId));
  expect(t.prio, "the revision priority chosen").toBe("urgent");
  const c = t.comments[t.comments.length - 1];
  expect(c.text).toBe("1. Headline too small\n2. Logo goes top right");
  expect(c.attachments.length, "the note's screenshot goes with it").toBe(1);
  expect(t.versions[0].reason, "the version carries the request").toBe(c.text);
  const s = await savedWhen(page, x => x.versions[0].state === "revision");
  expect(s.comments.some(x => x.text === c.text && (x.attachments || []).length === 1)).toBe(true);
  /* the comment says what it is */
  await page.evaluate(() => setTab("comments"));
  await expect(page.locator("#drawer .cmt", { hasText: "Headline too small" }).locator(".badge.revision")).toHaveText("Revision request · V1");
});

test("a screenshot posted in a comment is kept under From comments, not counted as delivered", async ({ page }) => {
  await signIn(page);
  await openTab(page, "comments");
  await page.locator("#cmtText").fill("Here is the crop I mean.");
  await page.evaluate(`(() => { window._cmtDraft = document.getElementById("cmtText").value; window._cmtAtt = [{ name: "fix-this.png", size: "0.1 MB", type: "image", preview: ${PNG("#9333EA")} }]; renderDrawer(); })()`);
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(async () => (await taskNow(page)).files.some(f => f.name === "fix-this.png"), { timeout: 10000 }).toBe(true);
  await openTab(page, "files");
  const group = page.locator("#drBody .av-from-comments");
  await expect(group).toBeVisible();
  await expect(group.locator(".file", { hasText: "fix-this.png" })).toContainText("in a comment");
  const links = await page.evaluate(id => taskAssetLinks(task(id)).map(l => l.name), taskId);
  expect(links).toContain("Banner_final.png");
  expect(links.some(n => /fix-this/.test(n)), "the reviewer's screenshot is not a deliverable").toBe(false);
  const count = await page.locator("#drHead .tab", { hasText: "Assets & versions" }).locator(".cnt").innerText();
  expect(+count).toBe(2);   /* 1 version + 1 final file */
});

test("View comment opens the comment it came from", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#drBody .av-from-comments .file", { hasText: "fix-this.png" }).getByRole("button", { name: "View comment" }).click();
  await expect(page.locator("#drHead .tab.on")).toContainText("Comments");
  await expect(page.locator("#drawer .cmt.cmt-flash")).toContainText("crop I mean");
});

test("Mark as final moves it, counts it, and outlives a reload; Not final moves it back", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#drBody .av-from-comments .file", { hasText: "fix-this.png" }).getByRole("button", { name: "Mark as final" }).click();
  await expect.poll(() => page.evaluate(id => (task(id).meta && (task(id).meta.finalFiles || []).length) || 0, taskId)).toBe(1);
  await expect(page.locator("#drBody .av-from-comments")).toHaveCount(0);
  const finalRow = page.locator("#drBody .av-sec .file", { hasText: "fix-this.png" });
  await expect(finalRow.locator(".badge", { hasText: "from a comment" }), "marked as having come from a comment").toBeVisible();

  await page.reload(); await ready(page);
  await openTab(page, "files");
  await expect(page.locator("#drBody .av-from-comments"), "still final after a reload").toHaveCount(0);
  await page.locator("#drBody .file", { hasText: "fix-this.png" }).getByRole("button", { name: "Not final" }).click();
  await expect(page.locator("#drBody .av-from-comments .file", { hasText: "fix-this.png" })).toBeVisible();
});

test("the designer ticks notes off; Revised turns V1 into V2 in the same box, then submits it", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await expect(page.locator("#drBody .av-decision.rev")).toContainText("Sent back for revision");
  await page.locator("#verNotes .vn-row").first().locator(".vn-tick").click();
  await expect(page.locator("#verNotes .vn-row.done")).toHaveCount(1);
  const me = await page.evaluate(() => ME);
  await expect.poll(async () => (await saved(page)).versions[0].annots[0].doneBy).toBe(me);

  await page.locator("#drBody .av-decision .btn", { hasText: "Revised" }).click();
  /* one note is still open: said, not blocked */
  await expect(page.locator("#modal .vn-warn")).toContainText("1 note is not ticked off yet.");
  /* V1 was an upload, so there is no link to reuse: one is asked for */
  await page.locator("#modal .btn.primary").click();
  await expect(page.locator("#modalWrap.open")).toHaveCount(1);
  await page.locator("#rvd_url").fill(FOLDER);
  await page.locator("#rvd_note").fill("Bigger headline");
  await expect(page.locator("#modal .btn.primary")).toHaveText("Create Version 2");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).versions.length, taskId), { timeout: 10000 }).toBe(2);

  /* one box, now Version 2, with a clean page of notes — made, but not in review until it is sent */
  await expect(page.locator("#drBody .av-version")).toHaveCount(1);
  await expect(page.locator("#drBody .av-head h3").first()).toHaveText("Version 2");
  await expect(page.locator("#verNotes .vn-row")).toHaveCount(0);
  await expect(page.locator("#drBody .av-head .badge")).toHaveText("Not submitted yet");
  await expect(page.locator("#drBody .av-steps li.now")).toHaveText("Submitted for review");
  await expect(page.locator("#drBody .av-decision.ready")).toContainText("Version 2 is ready");
  await expect(page.locator("#drBody .av-decision .btn", { hasText: "Approve" })).toHaveCount(0);
  expect(await page.evaluate(id => isReview(task(id)), taskId)).toBe(false);
  const s = await savedWhen(page, x => x.versions.length === 2);
  expect(s.versions[1].driveUrl).toBe(FOLDER);
  expect(s.versions[1].note).toBe("Bigger headline");
  expect(s.versions[1].state).toBe("pending");
  expect(s.activity.some(a => a.k === "upload" && a.a && a.a.v === 2)).toBe(true);

  /* submitted: now it is in review, and it says by whom */
  await page.locator("#drBody .av-decision .btn", { hasText: "Submit for review" }).click();
  await expect.poll(() => page.evaluate(id => isReview(task(id)), taskId), { timeout: 10000 }).toBe(true);
  await expect(page.locator("#drBody .av-head .badge")).toHaveText("In review");
  await expect(page.locator("#drBody .av-steps li.now")).toHaveText("Reviewer's decision");
  await expect(page.locator("#drBody .av-decision.ask")).toContainText("Submitted for review by");
  await expect(page.locator("#drBody .av-decision.ask .btn", { hasText: "Approve" })).toBeVisible();
});

test("the Drive folder previews as its file list, in a sandboxed frame", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  const frame = page.locator("#drBody .av-version .vp-frame iframe");
  await expect(frame).toHaveAttribute("src", "https://drive.google.com/embeddedfolderview?id=1YujA_GjKigwSJXbRJTkO1l2p1gMmm8ai#grid");
  const sandbox = await frame.getAttribute("sandbox");
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox, "an embed never navigates the app").not.toContain("allow-top-navigation");
  /* Full view shows the same, larger */
  await page.locator("#drBody .pbar-foot .btn", { hasText: "Full view" }).click();
  await expect(page.locator("#modal .vp-frame.full iframe")).toHaveAttribute("src", /embeddedfolderview/);
  await page.locator("#modal .btn.primary", { hasText: "Close" }).click();
  /* the server lets these frames in, and no others */
  const csp = await page.evaluate(() => fetch("/").then(r => r.headers.get("content-security-policy")));
  const frameSrc = csp.match(/frame-src ([^;]*)/)[1].split(" ");
  expect(frameSrc).toEqual(expect.arrayContaining(["https://drive.google.com", "https://www.figma.com", "https://www.youtube-nocookie.com"]));
  expect(frameSrc).not.toContain("*");
  expect(frameSrc).not.toContain("https:");
});

test("only official embeds are framed; any other link stays a card", async ({ page }) => {
  await signIn(page);
  const got = await page.evaluate(() => [
    "https://docs.google.com/spreadsheets/d/abc_123/edit#gid=0",
    "https://www.figma.com/design/ABC123/Banner?node-id=1-2",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://vimeo.com/76979871",
    "https://www.loom.com/share/0123456789abcdef",
    "https://www.canva.com/design/DAF1abc/xyz987/view?utm_content=x",
    "https://example.org/brief.pdf",
    "https://example.org/hero.png",
    "https://example.org/page",
    "http://drive.google.com/drive/folders/abc",
    "https://evil.example/drive.google.com/file/d/abc",
    "https://evil.example/file/d/abc?from=drive.google.com",
    "https://www.figma.com.evil.example/design/ABC123/x",
    "javascript:alert(1)",
  ].map(u => { const e = embedFor(u); return e ? e.src : null; }));
  expect(got).toEqual([
    "https://docs.google.com/spreadsheets/d/abc_123/preview",
    "https://www.figma.com/embed?embed_host=share&url=" + encodeURIComponent("https://www.figma.com/design/ABC123/Banner?node-id=1-2"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://player.vimeo.com/video/76979871",
    "https://www.loom.com/embed/0123456789abcdef",
    "https://www.canva.com/design/DAF1abc/xyz987/view?embed",
    "https://docs.google.com/viewer?url=" + encodeURIComponent("https://example.org/brief.pdf") + "&embedded=true",
    "https://example.org/hero.png",
    null, null, null, null, null, null,
  ]);
  /* whatever is framed is framed from a host the server allows (a picture is an <img>, not a frame) */
  const csp = await page.evaluate(() => fetch("/").then(r => r.headers.get("content-security-policy")));
  const allowed = csp.match(/frame-src ([^;]*)/)[1].split(" ");
  const framed = await page.evaluate(() => ["https://drive.google.com/file/d/abc/view", "https://drive.google.com/open?id=abc", "https://docs.google.com/presentation/d/abc/edit",
    "https://miro.com/app/board/uXjVabc=/", "https://vimeo.com/123/abcdef", "https://www.youtube.com/shorts/abcDEF12345", "https://example.org/deck.pptx"]
    .map(embedFor).filter(e => e && e.kind !== "image").map(e => new URL(e.src).origin));
  expect(framed.length).toBe(7);
  for (const o of framed) expect(allowed, o).toContain(o);
});

test("V1's notes are a button away, with what was decided", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#drBody .av-earlier .btn", { hasText: "View V1 notes" }).click();
  await expect(page.locator("#modal")).toContainText("Notes · Version 1");
  await expect(page.locator("#modal .vn-row")).toHaveCount(2);
  await expect(page.locator("#modal .vn-row.done")).toHaveCount(1);
  await expect(page.locator("#modal .vn-ver-dec")).toContainText("Sent back for revision");
  /* to read, not to change */
  await expect(page.locator("#modal .vn-tick").first()).toBeDisabled();
  await expect(page.locator("#modal .vn-x")).toHaveCount(0);
  await page.locator("#modal .btn.primary", { hasText: "Close" }).click();
});

test("the next round keeps the same link", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#verNoteText").fill("Move the date up");
  await page.locator("#verNoteText").press("Enter");
  await expect(page.locator("#verNotes .vn-row")).toHaveCount(1);
  await page.locator("#drBody .av-decision .btn", { hasText: "Request revision" }).click();
  await page.locator("#modal .btn", { hasText: "Send revision request" }).click();
  await expect.poll(async () => (await taskNow(page)).versions[1].state, { timeout: 10000 }).toBe("revision");
  await expect(page.locator("#drBody .av-steps li.done.bad")).toHaveText("Revision requested");
  await page.locator("#drBody .av-decision .btn", { hasText: "Revised" }).click();
  await expect(page.locator("#rvd_url")).toHaveValue(FOLDER);
  await expect(page.locator("#modal")).toContainText("uses the same link");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).versions.length, taskId), { timeout: 10000 }).toBe(3);
  const v3 = (await savedWhen(page, x => x.versions.length === 3)).versions[2];
  expect(v3.driveUrl).toBe(FOLDER);
  await expect(page.locator("#drBody .av-version")).toHaveCount(1);
  await expect(page.locator("#drBody .av-earlier .btn")).toHaveCount(2);
  await expect(page.locator("#drBody .av-head .badge")).toHaveText("Not submitted yet");
});

test("a link handed over in a comment becomes the next version, without uploading it again", async ({ page }) => {
  await page.route("**/api/links/title**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ title: "Hero banner round 4" }) }));
  await signIn(page);
  await openTab(page, "comments");
  await page.locator("#cmtText").fill("Round 4 is here " + ROUND4);
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(async () => (await taskNow(page)).files.some(f => f.url === ROUND4), { timeout: 10000 }).toBe(true);
  await openTab(page, "files");
  const row = page.locator("#drBody .av-from-comments .file", { hasText: "drive.google.com" }).or(page.locator("#drBody .av-from-comments .file").filter({ has: page.locator(".ficon-drive") })).first();
  await row.getByRole("button", { name: "Use as new version" }).click();
  await expect(page.locator("#modal")).toContainText("Use as Version 4");
  await expect(page.locator("#modal")).toContainText("nothing is uploaded again");
  await page.locator("#modal .btn.primary", { hasText: "Create Version 4" }).click();
  await expect.poll(() => page.evaluate(id => task(id).versions.length, taskId), { timeout: 10000 }).toBe(4);
  const s = await savedWhen(page, x => x.versions.length === 4);
  expect(s.versions[3].driveUrl, "the comment's link, as it is").toBe(ROUND4);
  expect(s.versions[3].driveId).toBe("1Round4File");
  expect(s.files.filter(f => f.url === ROUND4).length, "and no second copy of it").toBe(1);
  await expect(page.locator("#drBody .av-head h3").first()).toHaveText("Version 4");
  await expect(page.locator("#drBody .av-version .vp-frame iframe")).toHaveAttribute("src", "https://drive.google.com/file/d/1Round4File/preview");
  /* the row now says which version it is, instead of offering it again */
  const used = page.locator("#drBody .file").filter({ has: page.locator(".badge.av-is-ver", { hasText: "Version 4" }) });
  await expect(used).toHaveCount(1);
  await expect(used.getByRole("button", { name: "Use as new version" })).toHaveCount(0);
});

test("a screenshot from a comment works the same; past a few rounds, a list of every version", async ({ page }) => {
  await signIn(page);
  await openTab(page, "files");
  await page.locator("#drBody .av-from-comments .file", { hasText: "fix-this.png" }).getByRole("button", { name: "Use as new version" }).click();
  await page.locator("#modal .btn.primary", { hasText: "Create Version 5" }).click();
  await expect.poll(() => page.evaluate(id => task(id).versions.length, taskId), { timeout: 10000 }).toBe(5);
  const s = await savedWhen(page, x => x.versions.length === 5);
  expect(s.versions[4].img).toMatch(/^\/files\//);
  await expect(page.locator("#drBody .av-version .canvas-img img")).toBeVisible();

  /* five rounds: the two latest earlier ones, and all of them a click away */
  await expect(page.locator("#drBody .av-earlier .btn")).toHaveText(["View V3 notes", "View V4 notes", "All versions (5)"]);
  await page.locator("#drBody .av-earlier .btn", { hasText: "All versions (5)" }).click();
  await expect(page.locator("#modal .vh-row")).toHaveCount(5);
  await expect(page.locator("#modal .vh-row").first()).toContainText("V5");
  await page.locator("#modal .vh-row", { hasText: "V1" }).click();
  await expect(page.locator("#modal")).toContainText("Notes · Version 1");
  await page.locator("#modal .btn", { hasText: "All versions" }).click();
  await expect(page.locator("#modal .vh-row")).toHaveCount(5);
  await page.locator("#modal .btn.primary", { hasText: "Close" }).click();
});

test("the tab speaks Indonesian", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { UI_LANG = "id"; });
  await openTab(page, "files");
  const heads = await page.locator("#drBody .av-head h3").allInnerTexts();
  expect(heads).toContain("File final");
  await expect(page.locator("#verNotes .vn-head")).toContainText("Catatan");
  await expect(page.locator("#drBody .av-earlier .btn").first()).toHaveText(/^Lihat catatan V3/);
  await expect(page.locator("#drBody .av-earlier .btn").last()).toHaveText("Semua versi (5)");
  await expect(page.locator("#drBody .av-head .badge")).toHaveText("Belum dikirim");
  await expect(page.locator("#drBody .av-steps li").first()).toHaveText("Versi siap");
  await expect(page.locator("#drBody .av-decision.ready")).toContainText("Versi 5 siap");
  await expect(page.locator("#drBody .badge.av-is-ver").first()).toContainText("Versi");
  await expect(page.locator("#verNoteText")).toHaveAttribute("placeholder", "Tambah catatan — apa yang perlu diubah?");
  await page.evaluate(() => { UI_LANG = "en"; });
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page);
    /* leave storage as it was found: the storage spec starts from the workspace default */
    await page.evaluate(m => { if (typeof stoCfg !== "function" || m === undefined) return; const c = stoCfg(); if ((c.storage || null) === m) return; if (m) c.storage = m; else delete c.storage; return persistWS(); }, storageBefore);
    if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});
