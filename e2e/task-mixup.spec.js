/* Tasks never take on each other's content.
   - Opening another task used to copy the description editor of the task just left into it (and
     save it there): the editor's text belongs to the task it was drawn for.
   - The description opens read-only; Edit on one task no longer leaves every task open in the editor.
   - A task being created carries the number the browser proposed until the server answers; someone
     else's task given that number in the meantime used to be merged into it.
   The server never hands out a deleted task's number again: tests/task-id-reuse.test.js. */
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
const make = (page, title, description) => page.evaluate(async ([title, description]) => {
  const d = await apiFetch("POST", "/api/tasks", { title, description, status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] });
  const t = hTask(d); if (!task(t.id)) TASKS.push(t); return t.id;
}, [title, description]);
const serverDesc = (page, id) => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).description, id);

test("opening another task keeps each description its own, and opens it read-only", async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const a = await make(page, "Mixup A " + tag, ""), b = await make(page, "Mixup B " + tag, "Brief for B " + tag);
  try {
    /* A has no description: it opens read-only all the same, with a way in */
    await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, a);
    await expect(page.locator("#descSrc")).toHaveCount(0);
    await expect(page.locator("#drawer .md-preview")).toContainText("No description yet.");
    await page.locator("#drawer .md-head .btn", { hasText: "Edit" }).click();
    await expect(page.locator("#drawer .md-editor .hint")).toHaveText("Type to see the formatting. Formatted text you paste keeps its formatting.");
    await page.locator("#descSrc").click();
    await page.keyboard.type("Text for A " + tag);
    /* straight to B, before A's text has been saved */
    await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, b);
    await expect(page.locator("#descSrc"), "B opens read-only though A was being edited").toHaveCount(0);
    await expect(page.locator("#drawer .md-preview")).toContainText("Brief for B " + tag);
    expect(await page.evaluate(id => task(id).description, b)).toBe("Brief for B " + tag);
    await expect.poll(() => serverDesc(page, a), { timeout: 10000 }).toBe("Text for A " + tag);
    /* a full save of B (a comment) sends B's own description */
    await page.evaluate(id => editTaskWith(task(id), t => { t.comments.push({ id: uid("cm"), by: ME, text: "ping", createdAt: new Date().toISOString(), vis: "team", parent: null, attachments: [] }); }), b);
    await page.waitForTimeout(600);
    expect(await serverDesc(page, b)).toBe("Brief for B " + tag);
    /* in Indonesian */
    await page.evaluate(() => { setLanguage("id"); S.descMode = "editor"; renderDrawer(); });
    await expect(page.locator("#drawer .md-editor .hint")).toHaveText("Tulis langsung untuk melihat format. Paste teks berformat akan dipertahankan.");
    await page.evaluate(() => { S.descMode = "viewer"; setLanguage("en"); closeDrawer(); });
  } finally {
    await page.evaluate(ids => Promise.all(ids.map(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}))), [a, b]);
  }
});

test("two people creating tasks at the same moment keep their own tasks", async ({ browser }) => {
  const one = await (await browser.newContext()).newPage(), two = await (await browser.newContext()).newPage();
  await signIn(one); await signIn(two);
  const tag = Date.now().toString(36);
  /* one's save is held on the way, so two's task takes the number one proposed */
  let release; const held = new Promise(r => { release = r; });
  await one.route("**/api/tasks", async r => { if (r.request().method() === "POST") await held; await r.continue(); });
  const num = "T-" + (5000 + Math.floor(Math.random() * 4000));   /* never used: both browsers propose it */
  const proposed = await one.evaluate(([t, num]) => { const tk = { id: num, title: t, description: "", status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME], reviewers: [], versions: [], files: [], comments: [], activity: [], tags: [], labels: [], dependencies: [], custom: {}, meta: {} }; createTask(tk); return tk.id; }, ["From one " + tag, num]);
  const twoId = await two.evaluate(async ([t, num]) => { const d = await apiFetch("POST", "/api/tasks", { id: num, title: t, status: WS.workflow[0].id, prio: "medium" }); return d.id; }, ["From two " + tag, num]);
  expect(twoId, "two got the number one proposed").toBe(proposed);
  await one.waitForTimeout(1200);   /* two's task reaches one live while one's save is still held */
  release();
  await expect.poll(() => one.evaluate(t => { const l = TASKS.filter(x => x.title.indexOf(t) >= 0 && !x._creating); return l.length + ":" + new Set(l.map(x => x.id)).size; }, tag), { timeout: 10000 }).toBe("2:2");
  const seen = await one.evaluate(t => TASKS.filter(x => x.title.indexOf(t) >= 0).map(x => ({ id: x.id, title: x.title })), tag);
  expect(seen.length, JSON.stringify(seen)).toBe(2);
  expect(seen.find(x => x.title.startsWith("From two")).id).toBe(twoId);
  expect(seen.find(x => x.title.startsWith("From one")).id).not.toBe(twoId);
  await one.evaluate(ids => Promise.all(ids.map(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}))), seen.map(x => x.id));
});
