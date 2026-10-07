/* The "Open external link" window offers the original file as a download when the link is a file: a
   Slides/Docs/Sheets file is exported in the format it was uploaded as (a .pptx turned into Slides comes
   back a .pptx), a Drive file through Drive's download link. A folder or a web page has no download.
   In Indonesian the button reads "Unduh file asli". */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("a file link can be downloaded as the original; a folder or a page cannot", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await page.evaluate(() => { window.__dl = []; fileDownloadNow = u => window.__dl.push(u); });
  const pop = async (url, name) => { await page.evaluate(([u, n]) => externalLinkPop(u, n), [url, name || ""]); return page.locator("#modal"); };
  const download = async () => { await page.locator("#modal .link-download").click(); return page.evaluate(() => window.__dl[window.__dl.length - 1]); };

  /* the .pptx uploaded to Drive, opened as Slides */
  let m = await pop("https://docs.google.com/presentation/d/1K8ZJZ-1zpuCgTF/edit?usp=drivesdk", "HSB_MILESTONE_-Wireframe_Draft.pptx");
  await expect(m.locator(".msg-linkpop-body b")).toHaveText("HSB_MILESTONE_-Wireframe_Draft.pptx");
  await expect(m.locator(".link-download")).toHaveText(/Download original \(\.pptx\)/);
  expect(await download()).toBe("https://docs.google.com/presentation/d/1K8ZJZ-1zpuCgTF/export/pptx");
  /* Docs and Sheets, in the format they came as */
  await pop("https://docs.google.com/document/d/1DocId/edit", "Copy.docx");
  expect(await download()).toBe("https://docs.google.com/document/d/1DocId/export?format=docx");
  await pop("https://docs.google.com/spreadsheets/d/1SheetId/edit#gid=0", "Rates.csv");
  expect(await download()).toBe("https://docs.google.com/spreadsheets/d/1SheetId/export?format=csv");
  /* a file in Drive */
  await pop("https://drive.google.com/file/d/1FileId/view?usp=sharing");
  expect(await download()).toBe("https://drive.google.com/uc?export=download&id=1FileId");
  /* a folder, a web page: no download */
  await pop("https://drive.google.com/drive/folders/1FolderId");
  await expect(page.locator("#modal .link-download")).toHaveCount(0);
  await page.evaluate(() => closeModal());
  await pop("https://example.org/campaign");
  await expect(page.locator("#modal .link-download")).toHaveCount(0);
  await page.evaluate(() => closeModal());
  /* a file chip in a description passes its name along */
  const name = await page.evaluate(() => { const box = document.createElement("div"); box.innerHTML = descMdInline(esc("[Deck.pptx](https://docs.google.com/presentation/d/1ChipDeck/edit)")); document.body.appendChild(box); box.querySelector(".file-chip").click(); box.remove(); return document.querySelector("#modal .msg-linkpop-body b").textContent; });
  expect(name).toBe("Deck.pptx");
  expect(await download()).toBe("https://docs.google.com/presentation/d/1ChipDeck/export/pptx");
  /* in Indonesian */
  await page.evaluate(() => { setLanguage("id"); externalLinkPop("https://drive.google.com/file/d/1FileId/view", "Brief.pdf"); });
  await expect(page.locator("#modal .link-download")).toHaveText(/Unduh file asli \(\.pdf\)/);
  await page.evaluate(() => { closeModal(); setLanguage("en"); });
});
