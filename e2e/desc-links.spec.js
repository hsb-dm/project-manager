/* A Google link in a task description reads as the file's own name, as it does in comments.

   Every save used to write the label shown — "Google Drive" — into the text as [Google Drive](url),
   so the real name never appeared. Now the link is drawn as the Drive chip with the looked-up name;
   a stand-in label already saved is treated as no name at all, and the next save writes the bare
   link back. A name someone wrote with the link is kept. The test server cannot reach Google, so
   /api/links/title is answered here. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const FOLDER = "https://drive.google.com/drive/folders/1InsuranceKVfolder";
const SHEET = "https://docs.google.com/spreadsheets/d/1SizesSheet/edit";
const NAMED = "https://docs.google.com/presentation/d/1DeckName/edit";
let taskId = null;

async function signIn(page) {
  await page.route("**/api/links/title**", r => {
    const url = new URL(r.request().url()).searchParams.get("url") || "";
    const title = url.includes("1InsuranceKVfolder") ? "Insurance Campaign KV" : url.includes("1SizesSheet") ? "Resize list — Q4" : "";
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ title }) });
  });
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });   /* no remembered names */
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("the description shows each Google link by its own name", async ({ page }) => {
  await signIn(page);
  /* as saved by the old editor: the stand-in label written into the text */
  const description = "Hi team, the hero KV is here: [Google Drive](" + FOLDER + ")\nSizes: " + SHEET + "\nDeck: [Pitch deck](" + NAMED + ")";
  taskId = await page.evaluate(d => apiFetch("POST", "/api/tasks", { title: "Desc links target", status: WS.workflow[0].id, assignee: ME, description: d }).then(t => { TASKS.push(hTask(t)); return t.id; }), description);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, taskId);
  const chips = page.locator("#drBody .drive-chip");
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveText("Insurance Campaign KV");
  await expect(chips.nth(1)).toHaveText("Resize list — Q4");
  await expect(chips.nth(2), "a name written with the link is kept").toHaveText("Pitch deck");
  await expect(page.locator("#drBody").getByText("Google Drive", { exact: true })).toHaveCount(0);
});

test("saving writes the link, not the name that was looked up", async ({ page }) => {
  await signIn(page);
  const md = await page.evaluate(([f, s, n]) => descHtmlToMd(descMdHtml("Here: [Google Drive](" + f + ")\nSizes: " + s + "\nDeck: [Pitch deck](" + n + ")")), [FOLDER, SHEET, NAMED]);
  expect(md).toContain("Here: " + FOLDER);
  expect(md).not.toContain("[Google Drive]");
  expect(md).toContain("Sizes: " + SHEET);
  expect(md).toContain("[Pitch deck](" + NAMED + ")");
  /* and an ordinary link still keeps its text */
  const plain = await page.evaluate(() => descHtmlToMd(descMdHtml("See [the guide](https://example.org/guide)")));
  expect(plain).toContain("[the guide](https://example.org/guide)");
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});
