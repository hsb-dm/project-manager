/* A creative brief can be taken back. Most people keep the brief in the description, so a brief added by
   mistake goes away with Cancel, and one that is there can be removed (asking first when its fields hold
   something). And the decision log is gone from every place it used to appear. */
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
}
let id = null;
const brief = page => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.brief), id);

test("Cancel right after adding a brief takes it away again", async ({ page }) => {
  await signIn(page);
  id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Brief or not " + Date.now(), description: "All of it is here", status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(d)); return d.id; });
  await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.briefOptOpen = true; renderDrawer(); }, id);
  const tpl = page.locator("#drBody .brief-opt .btn.sm").first();
  await tpl.click();
  await expect(page.locator("#drBody [data-bf]").first()).toBeVisible();
  await expect.poll(() => brief(page)).not.toBe(null);
  await page.locator("#drBody").getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => brief(page)).toBe(null);
  await expect(page.locator("#drBody .brief-opt")).toBeVisible();
  expect(await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.description), id)).toBe("All of it is here");
});

test("a brief that is there can be removed — asking first when it holds something", async ({ page }) => {
  await signIn(page);
  await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.briefOptOpen = true; renderDrawer(); }, id);
  await page.locator("#drBody .brief-opt .btn.sm").first().click();
  /* nothing beyond the description it started from: removed without asking */
  await page.locator("#drBody").getByRole("button", { name: "Save brief" }).click();
  await expect.poll(() => brief(page)).not.toBe(null);
  await page.locator("#drBody").getByRole("button", { name: "Remove brief" }).click();
  await expect(page.locator("#modalWrap.open")).toHaveCount(0);
  await expect.poll(() => brief(page)).toBe(null);
  /* written in: asks first */
  await page.locator("#drBody").getByRole("button", { name: "Show" }).click().catch(() => {});
  await page.locator("#drBody .brief-opt .btn.sm").first().click();
  await page.locator("#drBody [data-bf]").last().fill("Only on Instagram");
  await page.locator("#drBody").getByRole("button", { name: "Save brief" }).click();
  await expect.poll(() => brief(page).then(b => b && Object.values(b).includes("Only on Instagram"))).toBe(true);
  await page.locator("#drBody").getByRole("button", { name: "Remove brief" }).click();
  await expect(page.locator("#modal .modal-head h3")).toHaveText("Remove the creative brief?");
  await page.locator("#modal").getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => brief(page)).toBe(null);
  await page.evaluate(() => { S.drawerTab = "activity"; renderDrawer(); });
  await expect(page.locator("#drBody")).toContainText("removed the creative brief");
  expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("Remove brief"), ATEXT_ID.brief_removed]; UI_LANG = was; return r; })).toEqual(["Hapus brief", "<b>{who}</b> menghapus creative brief"]);
});

test("the decision log is gone: no button, menu item, tab, command or route", async ({ page }) => {
  await signIn(page);
  await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
  await expect(page.locator("#drBody .related")).toBeVisible();
  await expect(page.locator("#drBody .related").getByRole("button", { name: /Decision/ })).toHaveCount(0);
  expect(await page.evaluate(() => ["decisionModal", "decisionsTabHtml", "DECISIONS"].filter(n => typeof window[n] !== "undefined"))).toEqual([]);
  expect(await page.evaluate(() => (typeof paletteActions === "function" ? paletteActions("") : []).map(a => a[0]).filter(n => /decision/i.test(n)))).toEqual([]);
  const route = await page.evaluate(() => fetch("/api/decisions", { credentials: "same-origin" }).then(r => r.status));
  expect(route).toBe(404);
  const pj = await page.evaluate(() => (liveProjects()[0] || {}).id);
  if (pj) { await page.evaluate(p => { S.projectTab = "overview"; go("projects", p); }, pj); await expect(page.locator("#content .ptabs")).toBeVisible(); await expect(page.locator('#content .ptabs [data-tab="decisions"]')).toHaveCount(0); }
  await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
});
