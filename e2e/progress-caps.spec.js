/* Progress notes in Roles & permissions: see them, write them. Every member may by default — on any task they can
   see, not only their own (only admins could write on most tasks before). A Viewer reads them. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("a member writes progress notes on someone else's task; a viewer reads; both are set in Roles", async ({ browser }) => {
  const tag = Date.now().toString(36), MEM = { email: "pnmem-" + tag + "@e2e.test", pw: "Pn!Member-2026x" }, VIEW = { email: "pnview-" + tag + "@e2e.test", pw: "Pn!Viewer-2026x" };
  const admin = await (await browser.newContext()).newPage(); await signIn(admin, ADMIN);
  const x = await admin.evaluate(async o => {
    const out = {};
    for (const [k, p, perm] of [["mem", o.mem, "member"], ["view", o.view, "viewer"]]) { await apiFetch("POST", "/api/members", { name: k + " " + o.tag, email: p.email, perm, cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people; out[k] = Object.keys(people).find(id => people[id].email === p.email); await apiFetch("POST", "/api/members/" + out[k] + "/password", { password: p.pw }); }
    out.task = (await apiFetch("POST", "/api/tasks", { title: "Not theirs " + o.tag, status: WS.workflow[0].id, prio: "medium" })).id;
    return out;
  }, { mem: MEM, view: VIEW, tag });
  try {
    /* Roles & permissions lists both, on for Member */
    await admin.evaluate(() => roleModal("member"));
    await expect(admin.locator('#modal [data-cap="view_progress_notes"]')).toHaveClass(/on/);
    await expect(admin.locator('#modal [data-cap="write_progress_notes"]')).toHaveClass(/on/);
    await expect(admin.locator("#modal")).toContainText("Write progress notes on any task they can see");
    await admin.evaluate(() => closeModal());
    await admin.evaluate(() => roleModal("viewer"));
    await expect(admin.locator('#modal [data-cap="view_progress_notes"]')).toHaveClass(/on/);
    await expect(admin.locator('#modal [data-cap="write_progress_notes"]')).not.toHaveClass(/on/);
    await admin.evaluate(() => closeModal());
    /* a member, on a task that is not theirs */
    const mem = await (await browser.newContext()).newPage(); await signIn(mem, MEM);
    await mem.evaluate(id => { openTask(id); S.drawerTab = "progress"; renderDrawer(); }, x.task);
    await mem.getByRole("button", { name: "Write the first note" }).click();
    await mem.keyboard.type("Helping from the side " + tag);
    await mem.locator("#pnSave").click();
    await expect.poll(() => mem.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(t => (t.progress || []).map(p => p.text)), x.task)).toEqual(["Helping from the side " + tag]);
    await mem.context().close();
    /* a viewer reads it, has nothing to write with */
    const view = await (await browser.newContext()).newPage(); await signIn(view, VIEW);
    await view.evaluate(id => { openTask(id); S.drawerTab = "progress"; renderDrawer(); }, x.task);
    await expect(view.locator("#drBody .pn-view")).toContainText("Helping from the side " + tag);
    await expect(view.getByRole("button", { name: "New version" })).toHaveCount(0);
    await expect(view.getByRole("button", { name: "Edit" })).toHaveCount(0);
    expect(await view.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = tr("Write progress notes on any task they can see"); UI_LANG = was; return r; })).toBe("Menulis catatan progres di task mana pun yang bisa mereka lihat");
    await view.context().close();
  } finally {
    await admin.evaluate(o => apiFetch("DELETE", "/api/tasks/" + o.task).catch(() => {}).then(() => Promise.all([o.mem, o.view].map(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {})))), x);
    await admin.context().close();
  }
});
