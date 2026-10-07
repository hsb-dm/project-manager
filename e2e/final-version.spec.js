/* A file under Final files becomes the task's final version in one step: the next version, made from
   the file as it is, approved by whoever can approve the task (the task moves to its closed stage), or
   sent to review by someone who cannot. The row then says "Version N · Final". */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const SLIDES = "https://docs.google.com/presentation/d/1FinalDeck/edit";
const FOLDER = "https://drive.google.com/drive/folders/1FinalFolder";

test("a final file becomes the approved final version, or goes to review", async ({ page }) => {
  await page.route(/^https:\/\/(drive|docs)\.google\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>x</title>" }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const id = await page.evaluate(async ([a, b]) => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Final files " + Date.now(), status: WS.workflow[0].id, prio: "medium" });
    const t = hTask(d); TASKS.push(t);
    await editTaskWith(t, x => { x.files.push(F("Insurance Campaign", "link", "link", "—", 0, a)); x.files.push(F("Badge Award", "link", "gdrive", "—", 0, b)); });
    return t.id;
  }, [SLIDES, FOLDER]);
  const server = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "files"; renderDrawer(); }, id);
    const row = name => page.locator("#drawer .file", { hasText: name });
    await expect(row("Insurance Campaign").locator(".av-make-final")).toHaveText("Make final version");

    /* the admin can approve: one step to the final version */
    await row("Insurance Campaign").locator(".av-make-final").click();
    await expect(page.locator("#modal h3")).toContainText("Make this the final version?");
    await expect(page.locator("#modal")).toContainText("becomes Version 1 and is approved as the final version");
    await page.locator("#modal .btn.primary", { hasText: "Make Version 1 final" }).click();
    await expect.poll(async () => { const s = await server(); const v = s.versions[0]; return v ? v.n + ":" + v.state + ":" + v.driveUrl : ""; }).toBe("1:approved:" + SLIDES);
    const closed = await page.evaluate(() => (WS.workflow.find(s => s.kind === "closed") || {}).id);
    if (closed) await expect.poll(async () => (await server()).status).toBe(closed);
    await expect(row("Insurance Campaign").locator(".av-is-ver")).toHaveText("Version 1 · Final");

    /* someone who cannot approve: it becomes the next version and goes to review */
    await page.evaluate(() => { window._review = canI.reviewTask; canI.reviewTask = () => false; renderDrawer(); });
    await row("Badge Award").locator(".av-make-final").click();
    await expect(page.locator("#modal")).toContainText("goes to review");
    await page.locator("#modal .btn.primary", { hasText: "Create Version 2 and submit for review" }).click();
    await expect.poll(async () => { const s = await server(); const v = s.versions.find(x => x.n === 2); return v ? v.state + ":" + v.driveUrl : ""; }).toBe("pending:" + FOLDER);
    const review = await page.evaluate(() => (WS.workflow.find(s => s.kind === "review") || {}).id);
    if (review) await expect.poll(async () => (await server()).status).toBe(review);
    await expect(row("Badge Award").locator(".av-is-ver")).toHaveText("Version 2");
    await page.evaluate(() => { canI.reviewTask = window._review; });

    /* in Indonesian */
    await page.evaluate(i => editTaskWith(task(i), t => { t.files.push(F("Poster", "link", "link", "—", 0, "https://example.org/poster.png")); }), id);
    await page.evaluate(() => { setLanguage("id"); renderDrawer(); });
    await expect(row("Poster").locator(".av-make-final")).toHaveText("Jadikan versi final");
    await page.evaluate(() => setLanguage("en"));
  } finally { await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id); }
});
