/* Someone keeps typing while an attachment uploads. When it finishes ("Ready"), the box they are typing
   in stays theirs: same focus, same caret, and nothing typed meanwhile is lost — in chat, in a comment
   (both of its attach buttons), and in a task's description. The upload is held until they are mid-word. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await page.evaluate(() => { if (typeof stoSet === "function" && storageMode() !== "server") stoSet("server"); });
  await expect.poll(() => page.evaluate(() => storageMode())).toBe("server");
}
/* hold the next uploads until released */
async function holdUploads(page) {
  let release; const gate = new Promise(r => { release = r; });
  await page.route("**/api/files/upload*", async route => { await gate; await route.continue(); });
  return async () => { release(); };
}
const file = (name, type) => ({ name, mimeType: type, buffer: Buffer.from("content of " + name) });

test("chat: typing goes on while the attachment finishes", async ({ page }) => {
  await signIn(page);
  const cid = await page.evaluate(() => CONVERSATIONS.find(c => c.type === "WORKSPACE").id);
  await page.evaluate(id => { go("messages"); openConversation(id); }, cid);
  const box = page.locator("#msgInput");
  await expect(box).toBeVisible();
  const release = await holdUploads(page);
  try {
    await page.evaluate(() => msgStageFile(new File(["brief notes"], "brief.txt", { type: "text/plain" })));
    await expect(page.locator(".msg-staged-chip", { hasText: "brief.txt" })).toContainText("Uploading");
    await box.click();
    await page.keyboard.type("hello wor");
    await release();
    await expect(page.locator(".msg-staged-chip", { hasText: "brief.txt" })).toContainText("Ready");
    await page.keyboard.type("ld");
    await expect(box).toHaveValue("hello world");
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("msgInput");
  } finally {
    await page.unroute("**/api/files/upload*");
    await page.evaluate(id => { const d = msgDraft(id); d.text = ""; d.refs = []; renderMsgMain(true); }, cid);
  }
});

test("a comment: what was typed during the upload stays, and typing goes on (both attach buttons)", async ({ page }) => {
  await signIn(page);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Typing upload " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); const t = hTask(d); TASKS.push(t); return t.id; });
  try {
    await page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
    const box = page.locator("#cmtText");
    for (const [label, open] of [["the paperclip", () => page.evaluate(() => attachToComment())], ["the toolbar", () => page.evaluate(() => cmtUpload(false))]]) {
      await box.click(); await page.keyboard.press("Control+End");
      const before = await box.inputValue();
      await page.keyboard.type("Start ");
      const release = await holdUploads(page);
      const chooser = page.waitForEvent("filechooser");
      await open();
      await (await chooser).setFiles(file("notes-" + label.replace(/\W/g, "") + ".txt", "text/plain"));
      await box.click(); await page.keyboard.press("Control+End");
      await page.keyboard.type("middle");
      await release();
      await expect(page.locator("#drawer .composer .att", { hasText: "notes-" + label.replace(/\W/g, "") })).toBeVisible();
      await page.keyboard.type(" end");
      await expect(box, label).toHaveValue(before + "Start middle end");
      expect(await page.evaluate(() => document.activeElement && document.activeElement.id), label).toBe("cmtText");
      await page.unroute("**/api/files/upload*");
      await page.keyboard.type(" ");
    }
  } finally {
    await page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});

test("a task's description: a pause saves it, and the next keystrokes still land where the caret was", async ({ page }) => {
  await signIn(page);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Desc pause " + Date.now(), description: "Plan: shoot", status: WS.workflow[0].id, prio: "medium" }); const t = hTask(d); TASKS.push(t); return t.id; });
  const saved = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.description), id);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, id);
    await page.locator("#descSrc").click(); await page.keyboard.press("Control+End");
    await page.keyboard.type(" on Monday");
    await expect.poll(saved, { timeout: 6000 }).toBe("Plan: shoot on Monday");   /* the save after the pause */
    await page.keyboard.type(" at nine");
    /* a redraw from elsewhere (a colleague's update) does not take it either */
    await page.evaluate(() => renderDrawer());
    await page.keyboard.type(" sharp");
    await expect(page.locator("#descSrc")).toHaveText("Plan: shoot on Monday at nine sharp");
    await expect.poll(saved, { timeout: 6000 }).toBe("Plan: shoot on Monday at nine sharp");
    /* the middle of a word too: the caret stays put, it does not jump to the start or the end */
    await page.keyboard.press("Home");
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await page.evaluate(() => renderDrawer());
    await page.keyboard.type("!");
    await expect(page.locator("#descSrc")).toHaveText("Plan:! shoot on Monday at nine sharp");
  } finally {
    await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});

test("a comment being written: a redraw from elsewhere keeps the focus and the caret", async ({ page }) => {
  await signIn(page);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Comment redraw " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); const t = hTask(d); TASKS.push(t); return t.id; });
  try {
    await page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
    await page.locator("#cmtText").click();
    await page.keyboard.type("Looks good");
    await page.keyboard.press("Home");
    await page.evaluate(() => renderDrawer());
    await page.keyboard.type("Yes. ");
    await expect(page.locator("#cmtText")).toHaveValue("Yes. Looks good");
  } finally {
    await page.evaluate(i => { window._cmtDraft = ""; closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});

test("a task's description: typing goes on while an attached file finishes", async ({ page }) => {
  await signIn(page);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Desc typing " + Date.now(), description: "Notes:", status: WS.workflow[0].id, prio: "medium" }); const t = hTask(d); TASKS.push(t); return t.id; });
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, id);
    await page.locator("#descSrc").click(); await page.keyboard.press("Control+End");
    const release = await holdUploads(page);
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#drawer .md-attach").click();
    await (await chooser).setFiles(file("Plan.pdf", "application/pdf"));
    await expect(page.locator("#descSrc .file-chip.uploading")).toBeVisible();
    await page.locator("#descSrc").click(); await page.keyboard.press("Control+End");
    await page.keyboard.type(" then mor");
    await release();
    await expect(page.locator("#descSrc .file-chip", { hasText: "Plan.pdf" })).not.toHaveClass(/uploading/);
    await page.keyboard.type("e text");
    await expect(page.locator("#descSrc")).toContainText("then more text");
    expect(await page.evaluate(() => !!document.activeElement && document.activeElement.closest && !!document.activeElement.closest("#descSrc"))).toBe(true);
  } finally {
    await page.unroute("**/api/files/upload*");
    await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});
