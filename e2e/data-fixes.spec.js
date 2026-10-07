/* What the page says happened is what the server kept (audit, Oct 2026).
   - A refused move does not say "Moved"; the task goes back.
   - A same-day task keeps its start date through any save, and no "changed the dates" appears.
   - A Drive version linked after a removed one gets the next free number.
   - A reply to a reply joins the thread (it used to be saved and never shown).
   - Someone who cannot edit the task still comments; what was typed comes back if it is refused. */
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
const make = (page, extra) => page.evaluate(async x => { const d = await apiFetch("POST", "/api/tasks", Object.assign({ title: "Data fix " + Date.now(), status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] }, x || {})); const t = hTask(d); TASKS.push(t); return t.id; }, extra || {});
const saved = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
const drop = (page, id) => page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id);

test("a refused move says so and puts the task back", async ({ page }) => {
  await signIn(page);
  const id = await make(page);
  try {
    await page.route("**/api/tasks/*/move", r => r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "You don't have permission to move this task." }) }));
    /* every toast shown, as it is shown — they fade, so looking afterwards proves nothing */
    await page.evaluate(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__toasts.push(n.textContent)))).observe(document.getElementById("toasts"), { childList: true }); });
    const to = await page.evaluate(i => { const st = WS.workflow[1].id; setStatus(i, st); return st; }, id);
    await expect.poll(() => page.evaluate(() => window.__toasts.some(t => /Couldn't update task/.test(t)))).toBe(true);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__toasts.filter(t => /Moved to/.test(t))), "no success toast").toEqual([]);
    expect(await page.evaluate(i => task(i).status, id)).not.toBe(to);
    await page.unroute("**/api/tasks/*/move");
  } finally { await drop(page, id); }
});

test("a same-day task keeps its dates through a save", async ({ page }) => {
  await signIn(page);
  const day = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const id = await make(page, { startDate: day, dueDate: day });
  try {
    await page.evaluate(i => editTaskWith(task(i), t => { t.title = t.title + " (renamed)"; }), id);
    await expect.poll(async () => (await saved(page, id)).title).toContain("(renamed)");
    const s = await saved(page, id);
    expect(s.startDate).toBe(day); expect(s.dueDate).toBe(day);
    expect(s.activity.some(a => a.k === "deadline"), "no false date change in the history").toBe(false);
  } finally { await drop(page, id); }
});

test("a Drive version after a removed one takes the next free number", async ({ page }) => {
  await signIn(page);
  const id = await make(page);
  try {
    /* V2 alone (V1 was removed with its file) */
    await page.evaluate(i => editTaskWith(task(i), t => { t.versions.push(V(1, ME, 0, "pending", "#7C3AED", "one")); t.versions.push(V(2, ME, 0, "pending", "#0F766E", "two")); }), id);
    await expect.poll(async () => (await saved(page, id)).versions.length).toBe(2);
    await page.evaluate(i => editTaskWith(task(i), t => { t.versions = t.versions.filter(v => v.n !== 1); }), id);
    await expect.poll(async () => (await saved(page, id)).versions.map(v => v.n).join()).toBe("2");
    await page.evaluate(i => { openTask(i); linkDriveVersionModal(); }, id);
    await page.locator("#ldv_url").fill("https://drive.google.com/file/d/1NextVersion/view");
    await page.evaluate(() => saveDriveVersion());
    await expect.poll(async () => (await saved(page, id)).versions.map(v => v.n).join()).toBe("2,3");
  } finally { await page.evaluate(() => closeDrawer()); await drop(page, id); }
});

test("a reply to a reply joins the thread; a comment without edit rights is posted on its own", async ({ page }) => {
  await signIn(page);
  const id = await make(page);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "comments"; renderDrawer(); }, id);
    const post = async (text, replyTo) => { await page.evaluate(([t, r]) => { S.replyTo = r || null; document.getElementById("cmtText").value = t; postComment(); }, [text, replyTo]); await expect.poll(async () => (await saved(page, id)).comments.some(c => c.text === text)).toBe(true); return (await saved(page, id)).comments.find(c => c.text === text); };
    const rootC = await post("Root comment");
    const r1 = await post("First reply", rootC.id);
    const r2 = await post("Reply to the reply", r1.id);
    expect(r2.parent, "joins the thread").toBe(rootC.id);
    await page.evaluate(() => renderDrawer());
    await expect(page.locator("#drawer", { hasText: "Reply to the reply" })).toHaveCount(1);
    /* as someone who may comment but not edit the task */
    const calls = []; page.on("request", r => { if (r.url().includes("/api/tasks/" + id)) calls.push(r.method() + " " + r.url().replace(/^.*\/api/, "/api")); });
    await page.evaluate(() => { window._canEdit = canI.editTask; canI.editTask = () => false; renderDrawer(); });
    await post("From a viewer");
    expect(calls.some(c => c === "POST /api/tasks/" + id + "/comments")).toBe(true);
    expect(calls.some(c => c.startsWith("PUT "))).toBe(false);
    /* refused: what was typed comes back */
    await page.route("**/api/tasks/*/comments", r => r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "No" }) }));
    await page.evaluate(() => { document.getElementById("cmtText").value = "Do not lose me"; postComment(); });
    await expect(page.locator(".toast").last()).toContainText("Couldn't post comment");
    await expect(page.locator("#cmtText")).toHaveValue("Do not lose me");
    await page.unroute("**/api/tasks/*/comments");
    await page.evaluate(() => { canI.editTask = window._canEdit; });
  } finally { await page.evaluate(() => closeDrawer()); await drop(page, id); }
});
