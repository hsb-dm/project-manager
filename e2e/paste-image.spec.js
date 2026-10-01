/* Pasting an image into a brief field, the description or the comment box.

   Neither a textarea nor the description editor can hold a picture, and embedding one as a data URL
   would put it inside the task record. So the image is uploaded, posted as a comment — which files
   it under References too — and left in the text as a chip that opens Comments. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
let taskId = null;

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* A real clipboard paste: a PNG the page makes, put on a DataTransfer and dispatched at the field. */
async function pasteImage(page, selector, name) {
  return page.evaluate(async ([sel, fname]) => {
    const c = document.createElement("canvas"); c.width = 240; c.height = 160;
    const x = c.getContext("2d"); x.fillStyle = "#1F4FD8"; x.fillRect(0, 0, 240, 160);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const file = new File([blob], fname, { type: "image/png" });
    const dt = new DataTransfer(); dt.items.add(file);
    const el = document.querySelector(sel); el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return true;
  }, [selector, name]);
}
const taskNow = page => page.evaluate(id => JSON.parse(JSON.stringify(task(id))), taskId);

test("open a task with a brief", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Paste project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Paste project"))).toBe(true);
  await page.evaluate(() => { newTaskModal({ title: "Paste target", proj: PROJECTS.find(p => p.name === "Paste project").id, assignee: ME }); createDraft(); });
  await expect.poll(() => page.evaluate(() => (TASKS.find(t => t.title === "Paste target" && !t._draft && t.id !== "T-new") || {}).id || "")).not.toBe("");
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Paste target" && !t._draft).id);
  /* give it a brief and open it for editing */
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); addBrief("general"); }, taskId);
  await expect(page.locator("[data-bf]").first()).toBeVisible();
});

test("an image pasted into a brief field is uploaded, not embedded in the task", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.briefEdit = true; renderDrawer(); }, taskId);
  await expect(page.locator("[data-bf]").first()).toBeVisible();

  const before = await taskNow(page);
  await pasteImage(page, "[data-bf]", "moodboard.png");
  await expect.poll(() => page.evaluate(id => task(id).comments.length, taskId), { timeout: 15000 }).toBe(before.comments.length + 1);

  const t = await taskNow(page);
  const c = t.comments[t.comments.length - 1];
  expect(c.attachments).toHaveLength(1);
  expect(c.attachments[0].name).toBe("moodboard.png");
  expect(c.text).toMatch(/Pasted into/);
  /* it also lands under References, which is what the comment path does for any attachment */
  expect(t.files.some(f => f.name === "moodboard.png")).toBe(true);

  /* The picture must never be stored as bytes inside the task. With Drive or server storage the
     attachment carries a link; with neither configured it is a preview, which the server writes to
     disk on save and replaces with a /files/ path. Either way, no base64 survives the round trip. */
  const saved = await page.evaluate(id => apiFetch("GET", "/api/tasks/" + id), taskId);
  const savedComment = saved.comments[saved.comments.length - 1];
  const att = savedComment.attachments[0];
  const points = att.url || att.preview || "";
  expect(points, "a link, not bytes: " + points.slice(0, 40)).toMatch(/^(\/files\/|https:\/\/)/);
  expect(JSON.stringify(saved), "nothing base64 in the stored task").not.toContain("data:image");
});

test("the brief shows the picture itself, and it opens full size", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.briefEdit = false; renderDrawer(); }, taskId);
  const thumb = page.locator(".paste-thumb").first();
  await expect(thumb).toBeVisible();
  await expect(thumb.locator(".paste-thumb-cap")).toHaveText("moodboard.png");
  /* a real picture, with real pixels */
  const size = await thumb.locator("img").evaluate(i => [i.naturalWidth, i.naturalHeight]);
  expect(size[0]).toBeGreaterThan(0);
  expect(size[1]).toBeGreaterThan(0);
  /* the raw text keeps a readable marker rather than a buried URL */
  const raw = await page.evaluate(id => JSON.stringify(task(id).brief), taskId);
  expect(raw).toContain("[[img:moodboard.png]]");
  expect(raw).not.toContain("/files/");
  await thumb.click();
  await expect(page.locator("#modal")).toContainText("moodboard.png");
  await page.evaluate(() => closeModal());
});

test("a picture removed from the task degrades to a label, not a broken image", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.briefEdit = false; renderDrawer(); }, taskId);
  /* render with the attachment gone, without touching the saved task */
  const html = await page.evaluate(() => {
    const tk = JSON.parse(JSON.stringify(task(S.drawerTask)));
    tk.files = []; tk.comments = [];
    return pasteMarkersToThumbs(esc("see [[img:moodboard.png]] here"), tk);
  });
  expect(html).toContain("paste-thumb missing");
  expect(html).not.toContain("<img");
});

test("text pasted into a brief field still pastes normally", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.briefEdit = true; renderDrawer(); }, taskId);
  const before = await page.evaluate(id => task(id).comments.length, taskId);
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData("text/plain", "just some words");
    const el = document.querySelector("[data-bf]"); el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(600);
  expect(await page.evaluate(id => task(id).comments.length, taskId)).toBe(before);
});

test("unsaved brief edits survive the paste", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.briefEdit = true; renderDrawer(); }, taskId);
  const key = await page.evaluate(() => document.querySelector("[data-bf]").getAttribute("data-bf"));
  await page.evaluate(() => { const el = document.querySelector("[data-bf]"); el.value = "TYPED BUT NOT SAVED"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await pasteImage(page, "[data-bf]", "second.png");
  await expect.poll(() => page.evaluate(id => task(id).files.some(f => f.name === "second.png"), taskId), { timeout: 15000 }).toBe(true);
  expect(await page.evaluate(([id, k]) => task(id).brief[k], [taskId, key])).toContain("TYPED BUT NOT SAVED");
});

test("pasting into the description works the same way", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.briefEdit = false; renderDrawer(); }, taskId);
  if (!(await page.locator("#descSrc").count())) test.skip(true, "no description editor here");
  const before = await page.evaluate(id => task(id).comments.length, taskId);
  await pasteImage(page, "#descSrc", "from-description.png");
  await expect.poll(() => page.evaluate(id => task(id).comments.length, taskId), { timeout: 15000 }).toBe(before + 1);
  expect(await page.evaluate(id => task(id).comments.slice(-1)[0].text, taskId)).toMatch(/description/i);
});

/* The comment box is handled by src/clipboard.js, not by this feature. Checked here so adding the
   brief branch cannot quietly take it over and attach the image twice. */
test("the comment box keeps its own paste, and attaches exactly once", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "comments"; renderDrawer(); }, taskId);
  if (!(await page.locator("#cmtText").count())) test.skip(true, "no comment box here");
  await pasteImage(page, "#cmtText", "into-comment.png");
  await page.waitForTimeout(900);
  const staged = await page.evaluate(() => (window._cmtAtt || []).length);
  expect(staged, "staged on the composer, once").toBe(1);
  /* and nothing was posted behind the composer's back */
  expect(await page.evaluate(id => task(id).comments.filter(c => (c.attachments || []).some(a => a.name === "into-comment.png")).length, taskId)).toBe(0);
  await page.evaluate(() => { window._cmtAtt = []; });
});

test("a signed-out page does not upload anything on paste", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await page.waitForTimeout(800);
  let posted = 0;
  page.on("request", r => { if (/\/api\/(files\/upload|cloud\/gdrive\/upload)/.test(r.url())) posted++; });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500);
  expect(posted).toBe(0);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});
