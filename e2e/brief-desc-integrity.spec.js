/* A task's description and brief stay that task's, whatever happens while they are being written.
   - An image pasted into task A's description finishes uploading after the person has moved to task
     B and opened its editor: A keeps A's words, B keeps B's (the upload used to write whichever
     editor was open into A, or A's text into B's editor).
   - Brief fields being edited are kept when the person moves to another task or closes the panel
     (they used to vanish), and they are saved to the task they were typed in.
   - A new task keeps what was typed in its description right before Create.
   Related: e2e/task-mixup.spec.js (switching tasks with the editor open). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const make = (page, title, description, brief) => page.evaluate(async ([title, description, brief]) => {
  const d = await apiFetch("POST", "/api/tasks", { title, description, brief: brief || null, status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] });
  const t = hTask(d); if (!task(t.id)) TASKS.push(t); return t.id;
}, [title, description, brief || null]);
const server = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
const drop = (page, ids) => page.evaluate(ids => Promise.all(ids.map(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}))), ids);

test("an image pasted into A, finishing while B's editor is open, mixes nothing", async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const a = await make(page, "Integrity A " + tag, "Words of A " + tag), b = await make(page, "Integrity B " + tag, "Words of B " + tag);
  try {
    /* the upload waits until the test lets it go */
    await page.evaluate(() => { window._upload = uploadAny; uploadAny = () => new Promise(r => { window.__release = () => r({ size: "1 KB", preview: null, url: "https://example.org/pasted.png", driveId: null }); }); });
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, a);
    await page.locator("#descSrc").click();
    await page.evaluate(() => { const f = new File([new Uint8Array([137, 80, 78, 71])], "pasted.png", { type: "image/png" }); briefPasteImage(f, { key: PASTE_DESC_KEY }); });
    /* to B, with its editor open */
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, b);
    await expect(page.locator("#descSrc")).toContainText("Words of B " + tag);
    await page.evaluate(() => window.__release());
    await page.waitForTimeout(1800);
    await expect(page.locator("#descSrc"), "B's editor still holds B").toContainText("Words of B " + tag);
    await expect(page.locator("#descSrc")).not.toContainText("Words of A");
    expect(await page.evaluate(i => task(i).description, b)).toContain("Words of B " + tag);
    await expect.poll(async () => (await server(page, a)).description).toContain("Words of A " + tag);
    expect((await server(page, a)).description).not.toContain("Words of B");
    expect((await server(page, b)).description).not.toContain("Words of A");
    expect((await server(page, a)).comments.some(c => (c.attachments || []).some(x => x.name === "pasted.png")), "the image is on A").toBe(true);
  } finally {
    await page.evaluate(() => { if (window._upload) uploadAny = window._upload; closeDrawer(); });
    await drop(page, [a, b]);
  }
});

test("brief fields being edited are kept when moving to another task or closing", async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const brief = await page.evaluate(() => { const t = WS.briefTemplates[0]; const b = { tpl: t.id }; t.fields.forEach(f => { b[f] = ""; }); return b; });
  const a = await make(page, "Brief A " + tag, "", brief), b = await make(page, "Brief B " + tag, "", brief);
  try {
    const field = await page.evaluate(() => WS.briefTemplates[0].fields[0]);
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.briefEdit = true; renderDrawer(); }, a);
    await page.locator('[data-bf="' + field + '"]').fill("Typed into A " + tag);
    /* a redraw (a colleague's update, a posted comment) keeps it */
    await page.evaluate(() => renderDrawer());
    await expect(page.locator('[data-bf="' + field + '"]')).toHaveValue("Typed into A " + tag);
    /* straight to B: A keeps what was typed, B gets none of it */
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, b);
    await expect.poll(async () => ((await server(page, a)).brief || {})[field]).toBe("Typed into A " + tag);
    expect(((await server(page, b)).brief || {})[field] || "").toBe("");
    /* editing B, then closing the panel */
    await page.evaluate(() => { S.briefEdit = true; renderDrawer(); });
    await page.locator('[data-bf="' + field + '"]').fill("Typed into B " + tag);
    await page.evaluate(() => closeDrawer());
    await expect.poll(async () => ((await server(page, b)).brief || {})[field]).toBe("Typed into B " + tag);
    expect(((await server(page, a)).brief || {})[field]).toBe("Typed into A " + tag);
  } finally { await drop(page, [a, b]); }
});

test("a new task keeps what was typed in its description right before Create", async ({ page }) => {
  await signIn(page);
  const title = "Fresh " + Date.now().toString(36);
  await page.evaluate(t => { newTaskModal({ title: t, assignee: ME }); }, title);
  await page.locator("#descSrc").click();
  await page.keyboard.type("Last words before create");
  await page.evaluate(() => createDraft());   /* no blur, no wait: as a keyboard shortcut would */
  await expect.poll(() => page.evaluate(t => { const x = TASKS.find(y => y.title === t && !y._draft && !y._creating); return x ? x.id : null; }, title), { timeout: 10000 }).not.toBe(null);
  const id = await page.evaluate(t => TASKS.find(y => y.title === t && !y._draft).id, title);
  try {
    await expect.poll(async () => (await server(page, id)).description).toBe("Last words before create");
  } finally { await page.evaluate(() => closeDrawer()); await drop(page, [id]); }
});
