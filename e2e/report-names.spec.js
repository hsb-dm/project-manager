/* General names, for any team's work (the owners of tasks are often not the creative team): the pipeline on Home
   and in the report is the "Workflow pipeline" (it was Creative pipeline), the report is a "Workspace report" (it
   was Creative report) — on its cover, in its file name and its document title — and the cover has a ZenCrevia
   footer that can be read (it was small grey on the dark card). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("Workflow pipeline on Home; the report is a Workspace report with a ZenCrevia footer on its cover", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  /* Home, and its name in Menu & home layout */
  await page.evaluate(() => { go("home"); renderScreen(); });
  await expect(page.locator(".rail-head").first()).toContainText("Workflow pipeline");
  expect(await page.evaluate(() => DASH_NAMES.rail)).toBe("Workflow pipeline");
  await page.evaluate(() => { UI_LANG = "id"; renderScreen(); });
  await expect(page.locator(".rail-head").first()).toContainText("Pipeline alur kerja");
  await page.evaluate(() => { UI_LANG = "en"; renderScreen(); });
  /* the export: the slide's name, the file's name */
  expect(await page.evaluate(() => EX_SLIDES.find(x => x[0] === "pipeline")[1])).toBe("Workflow pipeline");
  expect(await page.evaluate(() => fileStamp())).toMatch(/-workspace-report-\d{4}-\d{2}-\d{2}$/);
  /* the PowerPoint itself (its parts are stored, so their text can be read from the bytes) */
  const pptx = await page.evaluate(async () => {
    EXPORT = { from: -55, to: 0, weeks: 8, label: "x", teams: [], projects: [], labels: [], people: [], status: "all", include: { airecs: false }, an: demoAnalytics() };
    await preparePptIcons(); EXPORT.an = demoAnalytics();
    const bytes = buildPPTX(); EXPORT = null;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  });
  expect(pptx).toContain(">WORKSPACE REPORT<");
  expect(pptx).toContain(" — Workspace report</dc:title>");
  expect(pptx).toContain(">Workflow pipeline<");
  /* the cover's footer: ZenCrevia, bold and light on the dark card */
  expect(pptx).toMatch(/<a:rPr lang="en-US" sz="1200" b="1"[^>]*><a:solidFill><a:srgbClr val="E4E7EC"\/><\/a:solidFill>[\s\S]{0,200}<a:t>ZenCrevia<\/a:t>/);
  expect(pptx).not.toMatch(/creative report|creative pipeline/i);
  /* the Excel workbook's title too */
  const xlsx = await page.evaluate(() => { EXPORT = { from: -55, to: 0, weeks: 8, label: "x", teams: [], projects: [], labels: [], people: [], status: "all", include: {}, an: demoAnalytics() }; const b = buildXLSX(); EXPORT = null; return new TextDecoder("utf-8", { fatal: false }).decode(b); });
  expect(xlsx).toMatch(/Workspace report/);
  expect(xlsx).not.toMatch(/creative report/i);
  /* in Indonesian, the cover says so */
  const id = await page.evaluate(async () => { UI_LANG = "id"; EXPORT = { from: -55, to: 0, weeks: 8, label: "x", teams: [], projects: [], labels: [], people: [], status: "all", include: { airecs: false }, an: demoAnalytics() }; await preparePptIcons(); const b = buildPPTX(); EXPORT = null; UI_LANG = "en"; return new TextDecoder().decode(b); });
  expect(id).toContain(">LAPORAN WORKSPACE<");
});
