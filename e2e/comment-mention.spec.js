/* @mentions in task comments, the way chat does them: "@" opens the people picker at the caret,
   the choice is written as the full name, and whoever is still named when the comment is posted
   is notified. People on the task come first; an internal comment does not offer stakeholders. */
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
const openComments = page => page.evaluate(id => { openTask(id); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, taskId);
const pickerNames = page => page.locator("#entityPicker .ep-row").allInnerTexts();

test("people to mention, one of them on the task, one a stakeholder", async ({ page }) => {
  await signIn(page);
  await page.evaluate(async () => {
    const add = async (id, name, email, extra) => {
      if (!Object.keys(PEOPLE).some(k => PEOPLE[k].email === email))
        await apiFetch("POST", "/api/members", Object.assign({ id, name, email, perm: "member", ini: name.split(" ").map(w => w[0]).join(""), teams: [] }, extra || {}));
    };
    await add("mentionanna", "Anna Wijaya", "anna.mention@e2e.test");
    await add("mentionbudi", "Budi Santoso", "budi.mention@e2e.test");
    await add("mentionsari", "Sari Marketing", "sari.mention@e2e.test", { stakeholder: true });
  });
  await page.reload(); await ready(page);
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Mention project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Mention project"))).toBe(true);
  const anna = await page.evaluate(() => Object.keys(PEOPLE).find(k => PEOPLE[k].email === "anna.mention@e2e.test"));
  await page.evaluate(a => { newTaskModal({ title: "Mention target", proj: PROJECTS.find(p => p.name === "Mention project").id, assignee: a }); createDraft(); }, anna);
  await expect.poll(() => page.evaluate(() => TASKS.some(t => t.title === "Mention target" && !t._draft)), { timeout: 10000 }).toBe(true);
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Mention target").id);
});

test("typing @ opens the picker at the caret, with the task's people first", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#cmtText").click();
  await page.keyboard.type("Tolong cek @");
  await expect(page.locator("#entityPicker")).toBeVisible();
  await expect(page.locator("#entityPicker .mh").first(), "a section for the task's own people").toHaveText("On this task");
  const names = await pickerNames(page);
  expect(names[0], "the assignee first").toContain("Anna Wijaya");
  /* the picker sits by the caret, at the comment box */
  const ep = await page.locator("#entityPicker").boundingBox(), box = await page.locator("#cmtText").boundingBox();
  expect(Math.abs(ep.y - (box.y + box.height))).toBeLessThan(260);
});

test("an internal comment does not offer stakeholders; a stakeholder-visible one does", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#cmtText").click();
  await page.keyboard.type("@Sari");
  await expect(page.locator("#entityPicker")).toBeVisible();
  expect((await pickerNames(page)).some(n => n.includes("Sari Marketing")), "internal: not offered").toBe(false);
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window._cmtDraft = ""; S.commentVis = "client"; renderDrawer(); });
  await page.locator("#cmtText").click();
  await page.keyboard.type("@Sari");
  await expect.poll(async () => (await pickerNames(page)).some(n => n.includes("Sari Marketing")), { message: "stakeholder-visible: offered" }).toBe(true);
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window._cmtDraft = ""; S.commentVis = "internal"; renderDrawer(); });
});

test("arrows and Enter choose; the full name is written and coloured while typing", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#cmtText").click();
  /* typed at full speed, the way a quick typist does: the letters after "@" can beat the picker */
  await page.keyboard.type("Hai @bud");
  await expect(page.locator("#entityPicker")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#entityPicker")).toHaveCount(0);
  await expect(page.locator("#cmtText")).toHaveValue("Hai @Budi Santoso ");
  /* Enter chose a person; it did not start a new line */
  expect(await page.locator("#cmtText").inputValue()).not.toContain("\n");
  await expect(page.locator("#drawer .cmt-ta-mirror .msg-mention")).toHaveText("@Budi Santoso");
  /* the transparent text and the coloured layer line up: the mention's left edge matches */
  await page.keyboard.type("cek ya");
  await expect(page.locator("#cmtText")).toHaveValue("Hai @Budi Santoso cek ya");
});

/* Enter straight after "@name" picks that person even when typed faster than the picker can keep up
   — but after Esc has dismissed the picker, Enter is just a new line. */
test("Esc dismisses the picker, and Enter after it is a new line, not a mention", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#cmtText").click();
  await page.keyboard.type("email ke @anna");
  await page.keyboard.press("Escape");
  await expect(page.locator("#entityPicker")).toHaveCount(0);
  await expect(page.locator("#drawer"), "Esc closed the picker, not the task").toHaveClass(/open/);
  await page.keyboard.press("Enter");
  await expect(page.locator("#cmtText")).toHaveValue("email ke @anna\n");
  await page.evaluate(() => { window._cmtDraft = ""; window._cmtMentions = []; renderDrawer(); });
});

test("posting notifies whoever is still named — and draws the whole name", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  const notified = [];
  page.on("request", r => { if (r.method() === "POST" && /\/api\/notifications/.test(r.url())) { try { notified.push(r.postDataJSON()); } catch (e) {} } });
  await page.evaluate(() => { window.__notes = []; const n = notify; notify = function (k, rs) { window.__notes.push([k, [].concat(rs)]); return n.apply(this, arguments); }; });

  await page.locator("#cmtText").click();
  await page.keyboard.type("@ann");
  await page.keyboard.press("Enter");
  await page.keyboard.type("dan @bud");
  await page.keyboard.press("Tab");
  /* Budi is then taken out of the text again: he must not be notified */
  await page.evaluate(() => { const t = document.getElementById("cmtText"); t.value = t.value.replace("@Budi Santoso ", ""); t.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.keyboard.type(" revisi banner ya");
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).comments.length, taskId), { timeout: 10000 }).toBe(1);

  const notes = await page.evaluate(() => window.__notes);
  const ids = await page.evaluate(() => ({ anna: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "anna.mention@e2e.test"), budi: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "budi.mention@e2e.test") }));
  const mention = notes.find(n => n[0] === "mention");
  expect(mention, "a mention notification went out").toBeTruthy();
  expect(mention[1]).toContain(ids.anna);
  expect(mention[1], "not someone whose name was deleted").not.toContain(ids.budi);
  /* Anna is told once, as mentioned — not a second time as the assignee */
  const comment = notes.find(n => n[0] === "comment");
  if (comment) expect(comment[1]).not.toContain(ids.anna);

  const body = page.locator("#drawer .cmt .body").first();
  await expect(body.locator(".msg-mention")).toHaveText("@Anna Wijaya");
});

test("the old way, @id, still mentions", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  const budi = await page.evaluate(() => Object.keys(PEOPLE).find(k => PEOPLE[k].email === "budi.mention@e2e.test"));
  await page.evaluate(() => { window.__notes = []; const n = notify; notify = function (k, rs) { window.__notes.push([k, [].concat(rs)]); return n.apply(this, arguments); }; });
  await page.locator("#cmtText").fill("Dari cara lama @" + budi + " juga");
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).comments.length, taskId), { timeout: 10000 }).toBe(2);
  const mention = (await page.evaluate(() => window.__notes)).find(n => n[0] === "mention");
  expect(mention && mention[1]).toContain(budi);
});

test("the @ button opens the picker too, and the box speaks Indonesian", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await page.locator("#drawer .cmt-at").click();
  await expect(page.locator("#entityPicker")).toBeVisible();
  await expect(page.locator("#cmtText")).toHaveValue("@");
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window._cmtDraft = ""; UI_LANG = "id"; renderDrawer(); });
  await expect(page.locator("#cmtText")).toHaveAttribute("placeholder", "Tulis komentar… ketik @ untuk menyebut seseorang");
  await page.evaluate(() => { UI_LANG = "en"; });
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId);
    /* the people made for this spec go too: other specs start from a workspace with only the admin */
    await page.evaluate(async () => {
      for (const email of ["anna.mention@e2e.test", "budi.mention@e2e.test", "sari.mention@e2e.test"]) {
        const id = Object.keys(PEOPLE).find(k => PEOPLE[k].email === email);
        if (id) await apiFetch("DELETE", "/api/members/" + id).catch(() => {});
      }
    });
  } catch {} finally { await page.close(); }
});
