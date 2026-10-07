/* Edit in place, like Trello: double-click the description or a brief field to edit it right there;
   click anywhere outside and it is saved and closed. Clicking inside a dialog or a menu opened from
   the editor is not outside, nor is a text selection that ends outside. Done works with one click
   right after typing — the editor losing focus used to save and redraw the panel under the pointer,
   and the click on Done was lost. */
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
const make = (page, description, brief) => page.evaluate(async ([description, brief]) => {
  const d = await apiFetch("POST", "/api/tasks", { title: "In place " + Date.now(), description, brief: brief || null, status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] });
  const t = hTask(d); TASKS.push(t); return t.id;
}, [description, brief || null]);
const server = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);

test("the description: double-click to edit, click outside to save; Done takes one click", async ({ page }) => {
  await signIn(page);
  const id = await make(page, "First line");
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
    await expect(page.locator("#descSrc")).toHaveCount(0);
    await page.locator("#drawer .md-preview").dblclick();
    await expect(page.locator("#descSrc")).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.type(" and more");
    /* a click on the task's title area: outside the editor */
    await page.locator("#drawer .dr-title").click();
    await expect(page.locator("#descSrc")).toHaveCount(0);
    await expect(page.locator("#drawer .md-preview")).toContainText("First line and more");
    await expect.poll(async () => (await server(page, id)).description).toBe("First line and more");

    /* a dialog opened from the editor (Link) is not outside */
    await page.locator("#drawer .md-preview").dblclick();
    await page.locator('#drawer .md-btn[aria-label="Link"]').click();
    await expect(page.locator("#modal")).toBeVisible();
    await page.locator("#modal").click({ position: { x: 20, y: 20 } });
    await expect(page.locator("#descSrc")).toHaveCount(1);
    await page.evaluate(() => closeModal());

    /* typing, then Done: one click */
    await page.locator("#descSrc").click();
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    await page.locator("#drawer .md-head .btn.primary", { hasText: "Done" }).click();
    await expect(page.locator("#descSrc")).toHaveCount(0);
    await expect.poll(async () => (await server(page, id)).description).toBe("First line and more!");
  } finally { await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id); }
});

test("an empty description opens for writing with one click", async ({ page }) => {
  await signIn(page);
  const id = await make(page, "");
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
    await page.locator("#drawer .md-empty-edit").click();
    await expect(page.locator("#descSrc")).toBeFocused();
  } finally { await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id); }
});

test("a brief field: double-click to edit it, click outside to save", async ({ page }) => {
  await signIn(page);
  const tpl = await page.evaluate(() => { const t = WS.briefTemplates[0]; const b = { tpl: t.id }; t.fields.forEach(f => { b[f] = ""; }); return { b, f: t.fields[1] || t.fields[0] }; });
  const id = await make(page, "", tpl.b);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
    await page.locator('#drawer .brief .v[data-k="' + tpl.f + '"]').dblclick();
    await expect(page.locator('#drawer [data-bf="' + tpl.f + '"]'), "the field that was double-clicked").toBeFocused();
    await page.keyboard.type("Written in place");
    await page.locator("#drawer .dr-title").click();
    await expect(page.locator("#drawer [data-bf]")).toHaveCount(0);
    await expect.poll(async () => ((await server(page, id)).brief || {})[tpl.f]).toBe("Written in place");
    await expect(page.locator('#drawer .brief .v[data-k="' + tpl.f + '"]')).toContainText("Written in place");
  } finally { await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id); }
});
