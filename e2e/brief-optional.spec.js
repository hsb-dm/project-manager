/* The creative brief is optional: many teams write it into the description. The empty section says
   "Optional" and folds away, and stays folded for that person. A new task's files tab has no
   "Upload reference images" any more — reference images go into the description. */
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
const openBrief = (page, id) => page.evaluate(t => { openTask(t); S.drawerTab = "brief"; renderDrawer(); }, id);

test("a task without a brief says the brief is optional, and it folds away and stays folded", async ({ page }) => {
  await signIn(page);
  taskId = await page.evaluate(() => apiFetch("POST", "/api/tasks", { title: "Brief optional target", status: WS.workflow[0].id, assignee: ME, description: "The brief is right here in the description." }).then(d => { TASKS.push(hTask(d)); return d.id; }));
  await openBrief(page, taskId);
  const sec = page.locator("#drBody .brief-opt");
  await expect(sec.locator(".brief-opt-head")).toContainText("Creative brief");
  await expect(sec.locator(".brief-opt-head .badge")).toHaveText("Optional");
  await expect(sec.locator(".empty .btn").first()).toBeVisible();   /* the templates */
  await sec.locator(".brief-opt-toggle").click();
  await expect(page.locator("#drBody .brief-opt.collapsed")).toBeVisible();
  await expect(page.locator("#drBody .brief-opt .empty")).toHaveCount(0);
  await expect(page.locator("#drBody .brief-opt-toggle")).toHaveText("Show");
  await expect(page.locator("#drBody .brief-opt-toggle")).toHaveAttribute("aria-expanded", "false");

  /* still folded after a reload, on another task too */
  await page.reload(); await ready(page);
  await openBrief(page, taskId);
  await expect(page.locator("#drBody .brief-opt.collapsed")).toBeVisible();
  /* and in Indonesian */
  await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
  await expect(page.locator("#drBody .brief-opt-head .badge")).toHaveText("Opsional");
  await expect(page.locator("#drBody .brief-opt-toggle")).toHaveText("Tampilkan");
  await page.locator("#drBody .brief-opt-toggle").click();
  await expect(page.locator("#drBody .brief-opt-toggle")).toHaveText("Sembunyikan");
  await expect(page.locator("#drBody .brief-opt .empty p")).toContainText("Brief terstruktur bersifat opsional");
  await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });
  await expect(page.locator("#drBody .brief-opt .empty .btn").first()).toBeVisible();
});

test("a new task's files tab has no Upload reference images", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { newTaskModal({ title: "Draft for files tab" }); S.drawerTab = "files"; renderDrawer(); });
  const tools = page.locator("#drBody .btn");
  await expect(tools.filter({ hasText: "Upload file" })).toBeVisible();
  await expect(tools.filter({ hasText: "Link Google Drive" })).toBeVisible();
  await expect(tools.filter({ hasText: /reference images/i })).toHaveCount(0);
  await expect(tools.filter({ hasText: "Upload images" })).toHaveCount(0);
  await expect(page.locator("#drBody .empty")).toContainText("Reference images go in the description.");
  await page.evaluate(() => closeDrawer());
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); await page.evaluate(() => { try { localStorage.removeItem("zc.briefOptHidden"); } catch (e) {} });
    if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});
