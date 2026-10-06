/* Each Google link shows its own product's mark — Docs, Sheets, Slides — a Drive folder a folder,
   and any other Drive file the Drive mark; not the Drive logo for all of them. The "Link Google
   Drive" buttons keep the Drive logo: they are about Drive itself. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const LINKS = [
  ["https://docs.google.com/spreadsheets/d/1IconSheet/edit", "Google Sheets"],
  ["https://docs.google.com/presentation/d/1IconSlides/edit", "Google Slides"],
  ["https://docs.google.com/document/d/1IconDoc/edit", "Google Docs"],
  ["https://drive.google.com/drive/folders/1IconFolder", "Google Drive Folder"],
  ["https://drive.google.com/file/d/1IconFile/view", "Google Drive"],
];
let taskId = null;

async function signIn(page) {
  await page.route("**/api/links/title**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ title: "" }) }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("each Google link wears its own product's mark", async ({ page }) => {
  await signIn(page);
  expect(await page.evaluate(l => l.map(x => (googleIcon(x[0]).match(/alt="([^"]+)"/) || [])[1]), LINKS)).toEqual(LINKS.map(x => x[1]));
  /* and not one of them is the Drive logo except the plain Drive file */
  const srcs = await page.evaluate(l => l.map(x => (googleIcon(x[0]).match(/src="([^"]+)"/) || [])[1]), LINKS);
  expect(new Set(srcs).size, "five different marks").toBe(5);
  expect(srcs[4]).toBe(await page.evaluate(() => DRIVE_LOGO_DATA));
});

test("in a comment, in Assets, on the card and in the open-link dialog", async ({ page }) => {
  await signIn(page);
  taskId = await page.evaluate(() => apiFetch("POST", "/api/tasks", { title: "Google icons target", status: WS.workflow[0].id, assignee: ME }).then(t => { TASKS.push(hTask(t)); return t.id; }));
  await page.evaluate(id => { openTask(id); S.drawerTab = "comments"; renderDrawer(); }, taskId);
  await page.locator("#cmtText").fill("Files: " + LINKS.map(x => x[0]).join(" "));
  await page.locator("#drawer .composer .bar .btn.primary").click();
  const chips = page.locator("#drawer .cmt .drive-chip img.drive-logo");
  await expect(chips).toHaveCount(5);
  expect(await chips.evaluateAll(els => els.map(e => e.alt))).toEqual(LINKS.map(x => x[1]));

  /* filed under Assets, each row with its own mark */
  await expect.poll(() => page.evaluate(id => task(id).files.length, taskId), { timeout: 10000 }).toBe(5);
  await page.evaluate(() => { S.drawerTab = "files"; renderDrawer(); });
  const rows = page.locator("#drBody .file .ficon-drive img");
  await expect(rows).toHaveCount(5);
  expect((await rows.evaluateAll(els => els.map(e => e.alt))).sort()).toEqual(LINKS.map(x => x[1]).sort());
  /* the buttons that are about Drive itself keep the Drive logo */
  const driveButtons = await page.locator("#drBody .btn", { hasText: /Google Drive/ }).locator("img").evaluateAll(els => els.map(e => e.alt));
  expect(driveButtons.length).toBeGreaterThan(0);
  expect(driveButtons.every(a => a === "Google Drive")).toBe(true);

  /* the card on a chip, and the dialog before a link opens */
  await page.evaluate(() => { S.drawerTab = "comments"; renderDrawer(); });
  await page.locator("#drawer .cmt .drive-chip").nth(1).hover();
  await expect(page.locator(".link-card.open .lc-head img")).toHaveAttribute("alt", "Google Slides");
  await page.evaluate(u => openExternal(u), LINKS[0][0]);
  await expect(page.locator("#modal .msg-card-ico img")).toHaveAttribute("alt", "Google Sheets");
  await page.evaluate(() => closeModal());
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});
