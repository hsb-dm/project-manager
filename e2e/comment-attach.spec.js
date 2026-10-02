/* Attaching in the comment box, the way Assets & versions does.

   • the same five ways in: Upload images, Upload file, Link Google Drive, Attach link, Attach from library
   • what is an asset is filed under Assets & versions too; a link to a reference page is not
   • a Drive link — attached or written into the comment — is shown by its name, not its URL

   The test server cannot reach Google, so /api/links/title is answered here with what Google's page
   gives: a name for a folder shared with anyone who has the link, nothing for a private one. The
   route itself is covered by tests/link-title.test.js. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const SHARED = "https://drive.google.com/drive/folders/Q4SHAREDFOLDER";
const PRIVATE = "https://drive.google.com/drive/folders/PRIVATEFOLDER";
let taskId = null;
let storageBefore;   /* what storage was set to before this spec changed it */

async function signIn(page) {
  await page.route("**/api/links/title**", route => {
    const url = new URL(route.request().url()).searchParams.get("url") || "";
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ title: url.includes("Q4SHAREDFOLDER") ? "Q4 Campaign" : "" }) });
  });
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });   /* no remembered Drive names */
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const openComments = page => page.evaluate(id => { openTask(id); S.drawerTab = "comments"; renderDrawer(); }, taskId);
const filesOf = page => page.evaluate(id => JSON.parse(JSON.stringify(task(id).files)), taskId);
async function post(page, text) {
  if (text != null) await page.locator("#cmtText").fill(text);
  const before = await page.evaluate(id => task(id).comments.length, taskId);
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).comments.length, taskId), { timeout: 10000 }).toBe(before + 1);
  await page.waitForTimeout(500);
}

test("a task to comment on", async ({ page }) => {
  await signIn(page);
  storageBefore = await page.evaluate(() => (typeof stoCfg === "function" ? stoCfg().storage || null : null));
  await page.evaluate(() => { if (typeof stoSet === "function" && storageMode() !== "server") stoSet("server"); });
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Comment project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Comment project"))).toBe(true);
  await page.evaluate(() => { newTaskModal({ title: "Comment target", proj: PROJECTS.find(p => p.name === "Comment project").id, assignee: ME }); createDraft(); });
  await expect.poll(() => page.evaluate(() => TASKS.some(t => t.title === "Comment target" && !t._draft)), { timeout: 10000 }).toBe(true);
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Comment target").id);
});

test("the comment box has the same five ways in as Assets & versions", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  const labels = await page.locator("#drawer .composer .cmt-tools .btn").allInnerTexts();
  expect(labels.map(s => s.trim())).toEqual(["Upload images", "Upload file", "Link Google Drive", "Attach link", "Attach from library"]);
  await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
  const id = await page.locator("#drawer .composer .cmt-tools .btn").allInnerTexts();
  expect(id.map(s => s.trim())).toEqual(["Unggah gambar", "Unggah file", "Tautkan Google Drive", "Lampirkan tautan", "Lampirkan dari pustaka"]);
  await page.evaluate(() => { UI_LANG = "en"; });
});

test("a shared Drive folder is named by itself, shown short, and filed under Assets", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#drawer .composer .cmt-tools .btn", { hasText: "Link Google Drive" }).click();
  await page.locator("#cmt_url").fill(SHARED);
  await expect(page.locator("#cmt_name"), "the name is read from Drive").toHaveValue("Q4 Campaign", { timeout: 5000 });
  await page.locator("#modal .btn.primary").click();
  await expect(page.locator("#drawer .composer .att"), "staged under its name").toContainText("Q4 Campaign");
  await post(page, "Final files are here");

  const f = (await filesOf(page)).find(x => x.url === SHARED);
  expect(f, "filed under Assets & versions").toBeTruthy();
  expect(f.name).toBe("Q4 Campaign");
  expect(f.source).toBe("gdrive");
  /* the comment shows the name, not the URL (comments are listed oldest first, so find this one) */
  const c = page.locator("#drawer .cmt", { hasText: "Final files are here" });
  await expect(c.locator(".drive-chip")).toContainText("Q4 Campaign");
  expect(await c.innerText()).not.toContain("drive.google.com");
});

test("a private Drive folder, whose name cannot be read, says what it is", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#drawer .composer .cmt-tools .btn", { hasText: "Link Google Drive" }).click();
  await page.locator("#cmt_url").fill(PRIVATE);
  await expect(page.locator("#cmt_name_hint"), "it explains why there is no name").toContainText("could not be read", { timeout: 5000 });
  await page.locator("#modal .btn.primary").click();
  await post(page, "Private one");
  const f = (await filesOf(page)).find(x => x.url === PRIVATE);
  expect(f.name, "short, and honest about what it is").toBe("Google Drive Folder");
});

test("a typed name is kept as typed", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#drawer .composer .cmt-tools .btn", { hasText: "Link Google Drive" }).click();
  await page.locator("#cmt_name").fill("Moodboard — final");
  await page.locator("#cmt_url").fill("https://drive.google.com/drive/folders/Q4SHAREDFOLDER2");
  await page.waitForTimeout(700);
  await expect(page.locator("#cmt_name"), "not replaced by the looked-up name").toHaveValue("Moodboard — final");
});

test("a link to a reference page stays on the comment; a link to a file is an asset", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  for (const url of ["https://example.org/blog/how-we-do-banners", "https://example.org/files/brand-guide.pdf"]) {
    await page.locator("#drawer .composer .cmt-tools .btn", { hasText: "Attach link" }).click();
    await page.locator("#cmt_url").fill(url);
    await page.locator("#modal .btn.primary").click();
  }
  await post(page, "Two links");
  const files = await filesOf(page);
  expect(files.some(f => f.url === "https://example.org/blog/how-we-do-banners"), "an article is not an asset").toBe(false);
  expect(files.some(f => f.url === "https://example.org/files/brand-guide.pdf"), "a PDF is").toBe(true);
  /* both are still on the comment */
  const att = await page.evaluate(id => task(id).comments.slice(-1)[0].attachments.map(a => a.url), taskId);
  expect(att).toHaveLength(2);
});

test("a Drive link written into the comment is attached too — once", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  const LINK = "https://drive.google.com/drive/folders/Q4SHAREDFOLDER3";
  await post(page, "Revisi ada di " + LINK + " ya");
  await post(page, "Sekali lagi: " + LINK);
  const files = (await filesOf(page)).filter(f => f.url === LINK);
  expect(files, "filed once, however often it is mentioned").toHaveLength(1);
  /* the text shows a chip, not the URL */
  const c = page.locator("#drawer .cmt", { hasText: "Revisi ada di" });
  await expect(c.locator(".body .drive-chip"), "the chip is in the written text itself").toBeVisible();
  await expect(c.locator(".drive-chip")).toBeVisible();
  expect(await c.locator(".body").innerText()).not.toContain("drive.google.com");
});

test("the Assets row says what a Drive link is instead of printing its URL", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "files"; renderDrawer(); }, taskId);
  const row = page.locator("#drBody .file", { hasText: "Q4 Campaign" }).first();
  await expect(row).toBeVisible();
  expect(await row.innerText()).not.toContain("drive.google.com");
  await expect(row).toContainText("Google Drive Folder");
});

test("Upload images from the comment box lands in Assets", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#drawer .composer .cmt-tools .btn", { hasText: "Upload images" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await (await chooser).setFiles({ name: "from-comment.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#drawer .composer .att")).toContainText("from-comment.png", { timeout: 5000 });
  await post(page, "Here is the image");
  expect((await filesOf(page)).some(f => f.name === "from-comment.png"), "filed under Assets").toBe(true);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page);
    /* leave storage as it was found: the storage spec starts from the workspace default */
    await page.evaluate(m => { if (typeof stoCfg !== "function" || m === undefined) return; const c = stoCfg(); if ((c.storage || null) === m) return; if (m) c.storage = m; else delete c.storage; return persistWS(); }, storageBefore);
    if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});
