/* Addresses read like what they point at: /projects/<id>-<project-name> and ?task=<id>-<task-title>.
   The id leads, so a link made before a rename, or one with the id alone, still opens the same thing,
   and the address follows a rename without stacking history. */
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
const tag = Date.now().toString(36);
let ids = {};

test("a project's and a task's address carry their names", async ({ page }) => {
  await signIn(page);
  ids = await page.evaluate(async t => {
    const pid = "pslug" + t;
    PROJECTS = (await apiFetch("POST", "/api/projects", { id: pid, name: "Ramadan Campaign 2026", status: "active", owner: ME })).map(hProject);
    const d = await apiFetch("POST", "/api/tasks", { title: "Desain Banner Ramadhan — Hari Raya!", status: WS.workflow[0].id, prio: "medium", proj: pid });
    const e = await apiFetch("POST", "/api/tasks", { title: "Café Crème Brûlée", status: WS.workflow[0].id, prio: "medium" });
    TASKS.push(hTask(d), hTask(e));
    return { pid, tid: d.id, accent: e.id };
  }, tag);
  await page.evaluate(id => go("projects", id), ids.pid);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe("/projects/" + ids.pid + "-ramadan-campaign-2026");
  await page.evaluate(id => openTask(id), ids.tid);
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.search))).toBe("?task=" + ids.tid + "-desain-banner-ramadhan-hari-raya");
  await page.evaluate(() => closeDrawer());
  await page.evaluate(id => openTask(id), ids.accent);
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.search))).toBe("?task=" + ids.accent + "-cafe-creme-brulee");   /* accents written plainly */
  await page.evaluate(() => closeDrawer());
  /* a copied link carries the name too */
  expect(await page.evaluate(id => deepLink("task", id), ids.tid)).toContain("?task=" + ids.tid + "-desain-banner-ramadhan-hari-raya");
  expect(await page.evaluate(id => deepLink("project", id), ids.pid)).toContain("/projects/" + ids.pid + "-ramadan-campaign-2026");
});

test("an address with a name opens the thing, and so do one with the id alone and one made before a rename", async ({ page }) => {
  await signIn(page);
  /* with the name */
  await page.goto("/projects/" + ids.pid + "-ramadan-campaign-2026?task=" + ids.tid + "-desain-banner-ramadhan-hari-raya"); await ready(page);
  await expect.poll(() => page.evaluate(() => [S.screen, S.projectId, S.drawerTask].join("|"))).toBe("projects|" + ids.pid + "|" + ids.tid);
  /* the id alone: opens, and the address gains the name */
  await page.goto("/tasks?task=" + ids.tid); await ready(page);
  await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(ids.tid);
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.search))).toBe("?task=" + ids.tid + "-desain-banner-ramadhan-hari-raya");
  /* renamed while open: the address follows, replacing — Back does not walk through old names */
  const len = await page.evaluate(() => history.length);
  await page.evaluate(async id => { const t = task(id); t.title = "Banner Lebaran Final"; await persistTask(t, null).catch(() => {}); renderScreen(false); }, ids.tid);
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.search))).toBe("?task=" + ids.tid + "-banner-lebaran-final");
  expect(await page.evaluate(() => history.length)).toBe(len);
  /* the link made before the rename still opens it */
  await page.goto("/tasks?task=" + ids.tid + "-desain-banner-ramadhan-hari-raya"); await ready(page);
  await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(ids.tid);
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.search))).toBe("?task=" + ids.tid + "-banner-lebaran-final");
  /* a name that leads nowhere: said so, nothing opens */
  await page.goto("/tasks?task=T-nope-" + tag + "-ghost"); await ready(page);
  await expect(page.locator(".toast").last()).toContainText("not available");
  expect(await page.evaluate(() => S.drawerTask)).toBeFalsy();
});

test("a pasted link with a name is still recognised as the task or project (chat, comments)", async ({ page }) => {
  await signIn(page);
  const got = await page.evaluate(x => [internalEntityFromUrl(location.origin + "/tasks?task=" + x.tid + "-anything-at-all"), internalEntityFromUrl(location.origin + "/projects/" + x.pid + "-old-name")], ids);
  expect(got[0]).toMatchObject({ type: "TASK", id: ids.tid });
  expect(got[1]).toMatchObject({ type: "PROJECT", id: ids.pid });
});

test("ids that start alike: the longest one that fits is the one meant", async ({ page }) => {
  await signIn(page);
  const a = "pfit" + tag, b = "pfit" + tag + "-x";
  await page.evaluate(async x => { for (const [id, name] of [[x.a, "Short"], [x.b, "Longer one"]]) PROJECTS = (await apiFetch("POST", "/api/projects", { id, name, status: "active", owner: ME })).map(hProject); }, { a, b });
  try {
    expect(await page.evaluate(x => [routeIdFrom("project", x.b + "-longer-one"), routeIdFrom("project", x.a + "-short"), routeIdFrom("project", x.a)], { a, b })).toEqual([b, a, a]);
    await page.goto("/projects/" + b + "-longer-one"); await ready(page);
    await expect.poll(() => page.evaluate(() => S.projectId)).toBe(b);
  } finally {
    await page.evaluate(x => Promise.all([x.a, x.b].map(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {}))), { a, b });
  }
});

test("cleanup", async ({ page }) => {
  await signIn(page);
  await page.evaluate(x => Promise.all([apiFetch("DELETE", "/api/tasks/" + x.tid).catch(() => {}), apiFetch("DELETE", "/api/tasks/" + x.accent).catch(() => {}), apiFetch("DELETE", "/api/projects/" + x.pid).catch(() => {})]), ids);
});
