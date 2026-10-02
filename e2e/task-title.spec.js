/* A task's title saves when its field loses focus. That blur can arrive after the panel has already
   moved on to another task — the panel is redrawn while the old title still has focus — and the
   save used to land on whichever task was open by then. Creating two tasks in a row gave the second
   one the first one's name; the same thing could rename an existing task. */
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
async function project(page, name) {
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill(name);
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(n => !!PROJECTS.find(p => p.name === n), name)).toBe(true);
}

test("two tasks created one after the other keep their own titles", async ({ page }) => {
  await signIn(page);
  await project(page, "Title project");
  for (const title of ["First of two", "Second of two"]) {
    await page.evaluate(t => { newTaskModal({ title: t, proj: PROJECTS.find(p => p.name === "Title project").id, assignee: ME }); }, title);
    /* the title field takes focus as a new task opens — that is what a person gets */
    await page.waitForTimeout(150);
    await page.evaluate(() => createDraft());
    await expect.poll(() => page.evaluate(t => TASKS.some(x => x.title === t && !x._draft), title), { timeout: 10000 }).toBe(true);
  }
  const titles = await page.evaluate(() => TASKS.filter(t => /of two$/.test(t.title)).map(t => t.title).sort());
  expect(titles).toEqual(["First of two", "Second of two"]);

  /* and the server has the same */
  const saved = await page.evaluate(async () => {
    const ids = TASKS.filter(t => /of two$/.test(t.title)).map(t => t.id);
    return (await Promise.all(ids.map(id => apiFetch("GET", "/api/tasks/" + id)))).map(t => t.title).sort();
  });
  expect(saved, "the server has one of each").toEqual(["First of two", "Second of two"]);
});

test("moving from one task to another does not carry the first one's title across", async ({ page }) => {
  await signIn(page);
  await project(page, "Rename project");
  const ids = [];
  for (const title of ["Keep me A", "Keep me B"]) {
    await page.evaluate(t => { newTaskModal({ title: t, proj: PROJECTS.find(p => p.name === "Rename project").id, assignee: ME }); createDraft(); }, title);
    await expect.poll(() => page.evaluate(t => TASKS.some(x => x.title === t && !x._draft), title), { timeout: 10000 }).toBe(true);
    ids.push(await page.evaluate(t => TASKS.find(x => x.title === t).id, title));
  }
  /* A's title has focus; B is opened without anything else taking focus first — a keyboard
     shortcut, a notification, a link */
  await page.evaluate(id => { openTask(id); renderDrawer(); }, ids[0]);
  await page.locator(".dr-title").click();
  await page.evaluate(id => openTask(id), ids[1]);
  await page.waitForTimeout(800);

  expect(await page.evaluate(id => task(id).title, ids[1]), "B is still B").toBe("Keep me B");
  expect(await page.evaluate(id => task(id).title, ids[0]), "and A is still A").toBe("Keep me A");
  await expect(page.locator(".dr-title")).toHaveText("Keep me B");
});

test("the title still saves the ordinary way", async ({ page }) => {
  await signIn(page);
  const id = await page.evaluate(() => TASKS.find(t => t.title === "Keep me A").id);
  await page.evaluate(i => { openTask(i); renderDrawer(); }, id);
  const title = page.locator(".dr-title");
  await title.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" (renamed)");
  await page.keyboard.press("Enter");   /* Enter blurs the field, which saves it */
  await expect.poll(() => page.evaluate(i => task(i).title, id)).toBe("Keep me A (renamed)");
  /* the page shows the new title before its save has reached the server */
  await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.title), id), { timeout: 10000 }).toBe("Keep me A (renamed)");
});

/* Clicking from the title into the comment box blurred the title, which saved it even unchanged; the
   save redrew the panel and replaced the comment box that had just been clicked into, so what was
   typed next went nowhere. */
test("clicking from the title into the comment box keeps what is typed", async ({ page }) => {
  await signIn(page);
  const id = await page.evaluate(() => TASKS.find(t => /^Keep me A/.test(t.title)).id);
  await page.evaluate(i => { openTask(i); S.drawerTab = "comments"; renderDrawer(); }, id);
  let saves = 0;
  page.on("request", r => { if (r.method() === "PUT" && r.url().includes("/api/tasks/" + id)) saves++; });
  await page.locator(".dr-title").click();
  await page.locator("#cmtText").click();
  await page.keyboard.type("Typed straight after the title");
  await page.waitForTimeout(400);
  await expect(page.locator("#cmtText")).toHaveValue("Typed straight after the title");
  expect(saves, "an unchanged title is not saved").toBe(0);
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(i => task(i).comments.some(c => c.text === "Typed straight after the title"), id)).toBe(true);
});
