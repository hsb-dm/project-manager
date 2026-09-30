/* Bilingual stage and field names, through the real settings screens and every screen that shows
   them. Sentinel names make a missed display site obvious: in Indonesian nothing may show the
   "...EN" name, and in English nothing may show the "...ID" one. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);
const STAGE = { en: "ReadyForPrintEN", id: "SiapCetakID" };
const FIELD = { en: "CostCentreEN", id: "PusatBiayaID" };
const PRIO_ID = "PrioritasID";
let taskId = null;

async function signIn(page, target) {
  await page.goto(target || "/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const go = async (page, url) => { await page.goto(url); await ready(page); };
/* fill() alone fires no change event; the settings inputs save on change */
async function setInput(loc, value) { await loc.fill(value); await loc.dispatchEvent("change"); }
/* All the text a person could reach, not only what is on screen this instant: innerText skips
   collapsed sections and menu options, and once let an English field label through. Scripts and
   styles are dropped so source code cannot match. */
const bodyText = page => page.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll("script,style,noscript,template").forEach(n => n.remove()); return c.textContent; });

test("an admin names a stage, a field and a built-in field in both languages", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => setLanguage("en"));

  /* a stage, created with both names at once */
  await go(page, "/settings/workflow");
  await page.evaluate(() => addStageModal());
  await expect(page.locator("#st_name")).toBeFocused();
  await page.locator("#st_name").fill(STAGE.en);
  await page.locator("#st_name_id").fill(STAGE.id);
  await page.locator("#modal .btn.primary").click();
  await expect(page.locator(`input.bi-en[value="${STAGE.en}"]`)).toHaveCount(1);

  /* a custom field, both names, set to Primary */
  await go(page, "/settings/fields");
  await page.evaluate(() => addFieldModal());
  await expect(page.locator("#cf_name")).toBeFocused();
  await page.locator("#cf_name").fill(FIELD.en);
  await page.locator("#cf_name_id").fill(FIELD.id);
  await page.locator("#modal .btn.primary").click();
  const row = page.locator(".custom-field", { has: page.locator(`input.bi-en[value="${FIELD.en}"]`) });
  await row.locator('select[aria-label="Display mode"]').selectOption("primary");

  /* a built-in field renamed only in Indonesian */
  const prio = page.locator(".builtin-field", { has: page.locator('input.bi-en[value="Priority"]') });
  await setInput(prio.locator("input.bi-id"), PRIO_ID);

  /* everything survives a reload */
  await expect.poll(() => page.evaluate(() => JSON.stringify([
    (WS.workflow.find(s => s.name === "ReadyForPrintEN") || {}).nameId,
    (WS.customFields.find(f => f.name === "CostCentreEN") || {}).nameId
  ]))).toBe(JSON.stringify([STAGE.id, FIELD.id]));
  await page.reload(); await ready(page);
  const saved = await page.evaluate(() => ({
    stage: WS.workflow.find(s => s.name === "ReadyForPrintEN"),
    field: WS.customFields.find(f => f.name === "CostCentreEN"),
    prio: taskFields().find(f => f.id === "prio")
  }));
  expect(saved.stage.nameId).toBe(STAGE.id);
  expect(saved.field.nameId).toBe(FIELD.id);
  expect(saved.field.displayMode).toBe("primary");            /* this choice used to be lost on reload */
  expect(saved.prio.nameId).toBe(PRIO_ID);
  expect(saved.prio.name).toBe("Priority");                    /* the English name is untouched */

  /* a project and a task, so the drawer and the board have something to show */
  await go(page, "/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Bilingual project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Bilingual project"))).toBe(true);
  const stageId = saved.stage.id;
  await page.evaluate(([sid]) => { newTaskModal({ title: "Bilingual task", proj: PROJECTS.find(p => p.name === "Bilingual project").id, status: sid, assignee: ME }); createDraft(); }, [stageId]);
  await expect.poll(() => page.evaluate(() => (TASKS.find(t => t.title === "Bilingual task" && !t._draft && t.id !== "T-new") || {}).id || "")).not.toBe("");
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Bilingual task" && !t._draft).id);
});

test("in Indonesian every screen shows the Indonesian names, and no English one leaks", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => setLanguage("id"));
  const screens = [["board", "/tasks"], ["home", "/"], ["analytics", "/analytics"], ["task", "/tasks?task=" + taskId]];
  const leaks = [];
  for (const [name, url] of screens) {
    await go(page, url);
    if (url.includes("task=")) await expect(page.locator("body")).toContainText("Bilingual task");
    await page.waitForTimeout(600);
    const text = await bodyText(page);
    [STAGE.en, FIELD.en].forEach(en => { if (text.includes(en)) leaks.push(name + " shows " + en); });
  }
  expect(leaks).toEqual([]);

  await go(page, "/tasks");
  await expect(page.locator(".kcol-head", { hasText: STAGE.id })).toHaveCount(1);
  await go(page, "/tasks?task=" + taskId);
  const drawer = page.locator("#drawer, .drawer").first();
  await expect(drawer).toContainText(FIELD.id);
  await expect(drawer).toContainText(PRIO_ID);
  await expect(drawer).toContainText(STAGE.id);
  await page.evaluate(() => setLanguage("en"));
});

test("in English the English names show, and no Indonesian one leaks", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => setLanguage("en"));
  const leaks = [];
  for (const [name, url] of [["board", "/tasks"], ["home", "/"], ["task", "/tasks?task=" + taskId]]) {
    await go(page, url);
    if (url.includes("task=")) await expect(page.locator("body")).toContainText("Bilingual task");
    await page.waitForTimeout(600);
    const text = await bodyText(page);
    [STAGE.id, FIELD.id, PRIO_ID].forEach(idn => { if (text.includes(idn)) leaks.push(name + " shows " + idn); });
  }
  expect(leaks).toEqual([]);
  await go(page, "/tasks");
  await expect(page.locator(".kcol-head", { hasText: STAGE.en })).toHaveCount(1);
});

test("the menus that list stages and fields follow the language too", async ({ page }) => {
  await signIn(page, "/tasks?task=" + taskId);
  await page.evaluate(() => setLanguage("id"));
  await go(page, "/tasks?task=" + taskId);
  const opts = await page.evaluate(id => ({
    status: taskSelectOptions("status").map(o => o[1]),
    fields: (WS.customFields || []).map(f => locName(f)),
    stages: localStages().map(s => s.name),
    cell: stageName(task(id).status)
  }), taskId);
  expect(opts.status).toContain(STAGE.id);
  expect(opts.status).not.toContain(STAGE.en);
  expect(opts.fields).toContain(FIELD.id);
  expect(opts.stages).toContain(STAGE.id);
  expect(opts.cell).toBe(STAGE.id);
  await page.evaluate(() => setLanguage("en"));
});

test("saving while in Indonesian never writes Indonesian into the English name", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => setLanguage("id"));
  /* an ordinary workspace save, made while every screen is showing Indonesian */
  await page.evaluate(() => { WS.tagline = "saved in Indonesian " + Date.now(); return persistWS(); });
  await page.reload(); await ready(page);
  const back = await page.evaluate(() => ({
    stage: WS.workflow.find(s => s.nameId === "SiapCetakID"),
    field: WS.customFields.find(f => f.nameId === "PusatBiayaID"),
    prio: taskFields().find(f => f.id === "prio")
  }));
  expect(back.stage.name).toBe(STAGE.en);
  expect(back.field.name).toBe(FIELD.en);
  expect(back.prio.name).toBe("Priority");
  await page.evaluate(() => setLanguage("en"));
});

test("a stage left without an Indonesian name reads exactly as before", async ({ page }) => {
  await signIn(page);
  const plain = await page.evaluate(() => { setLanguage("id"); const s = WS.workflow.find(x => !x.nameId && x.name !== "ReadyForPrintEN"); return { en: s.name, shown: stageName(s.id), dict: tr(s.name) }; });
  expect(plain.shown).toBe(plain.dict);          /* the dictionary word, as it was before this change */
  await page.evaluate(() => setLanguage("en"));
});

test("a name given only in Indonesian also shows in English", async ({ page }) => {
  await signIn(page, "/settings/workflow");
  await page.evaluate(() => setLanguage("en"));
  const row = page.locator(".workflow-stage", { has: page.locator(`input.bi-en[value="${STAGE.en}"]`) });
  await setInput(row.locator("input.bi-en"), "");
  await expect.poll(() => page.evaluate(() => { const s = WS.workflow.find(x => x.nameId === "SiapCetakID"); return s && s.name; })).toBe(STAGE.id);
  await page.reload(); await ready(page);
  expect(await page.evaluate(() => stageName(WS.workflow.find(x => x.nameId === "SiapCetakID").id))).toBe(STAGE.id);
});

test("either language is enough to add a stage", async ({ page }) => {
  await signIn(page, "/settings/workflow");
  await page.evaluate(() => addStageModal());
  await expect(page.locator("#st_name")).toBeFocused();
  await page.locator("#st_name_id").fill("HanyaIndonesia");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!WS.workflow.find(s => s.nameId === "HanyaIndonesia" && s.name === "HanyaIndonesia"))).toBe(true);
  /* and neither is refused, with a message */
  await page.evaluate(() => addStageModal());
  await page.locator("#modal .btn.primary").click();
  await expect(page.locator("#modal")).toBeVisible();
});

test("the settings rows show both fields, with the fallback as the placeholder", async ({ page }) => {
  await signIn(page, "/settings/workflow");
  const todo = page.locator(".workflow-stage").filter({ has: page.locator('input.bi-en[value="To Do"]') });
  const idInput = todo.locator("input.bi-id");
  await expect(idInput).toHaveValue("");
  const shownIfEmpty = await page.evaluate(() => trIdOf("To Do"));
  await expect(idInput).toHaveAttribute("placeholder", shownIfEmpty);
  await expect(todo.locator(".bi-tag")).toHaveText(["EN", "ID"]);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    await page.evaluate(() => {
      setLanguage("en");
      WS.workflow = WS.workflow.filter(s => ["ReadyForPrintEN", "SiapCetakID", "HanyaIndonesia"].indexOf(s.name) < 0 && s.nameId !== "SiapCetakID");
      WS.customFields = WS.customFields.filter(f => f.name !== "CostCentreEN");
      WS.taskFields = null;
      return persistWS();
    });
  } catch {} finally { await page.close(); }
});
