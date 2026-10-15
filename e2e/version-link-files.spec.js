/* A version attached as a link is delivered work, filed under Final files as an uploaded version always was
   (Oct 2026): the row says which version it is and whether that is final. Revised with a new link files that one
   too, the same link kept through Revised is not filed again, changing the version's link moves its row with it,
   a row filed before its name could be read gets the name from Drive, and a link counts once among the task's asset
   links. The links attached before this are filed when the server starts: tests/version-link-files.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const FOLDER = "https://drive.google.com/drive/folders/1E2eFolderOne", FOLDER2 = "https://drive.google.com/drive/folders/1E2eFolderTwo";
const FIG = "https://www.figma.com/design/Zz9/Hero-Banner", FIG2 = "https://www.figma.com/design/Yy8/Hero-Banner-B";

test("a version attached as a link is under Final files, once, and follows its link", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.route(/^https:\/\/(drive|docs)\.google\.com\/|^https:\/\/www\.figma\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.route("**/api/links/title?*", r => { const u = new URL(r.request().url()).searchParams.get("url"); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: /FolderOne/.test(u) ? "Banner Promo Oktober" : /FolderTwo/.test(u) ? "Final Banner Set" : "" }) }); });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async () => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Version links " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME] });
    TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "files"; renderDrawer(); return d.id;
  });
  const saved = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
  const finals = page.locator("#drawer section.av-sec", { has: page.locator("h3", { hasText: /^(Final files|File final)$/ }) });
  const row = name => finals.locator(".file", { hasText: name });
  const revised = async (url, n) => {
    await page.evaluate(() => startRevision());
    await expect.poll(async () => (await saved()).versions.slice(-1)[0].state).toBe("revision");
    await page.locator("#drBody .av-decision .btn", { hasText: "Revised" }).click();
    if (url) await page.locator("#rvd_url").fill(url);
    await page.locator("#modal .btn.primary", { hasText: "Create Version " + n }).click();
    await expect.poll(async () => (await saved()).versions.length).toBe(n);
  };
  try {
    /* attached as Version 1: under Final files too, by the name read from the link */
    await page.evaluate(() => linkVersionModal());
    await page.locator("#lv_url").fill(FOLDER);
    await expect(page.locator("#lv_note")).toHaveValue("Banner Promo Oktober");
    await page.locator("#modal .btn.primary").click();
    await expect(row("Banner Promo Oktober").locator(".av-state")).toHaveText("Version 1 · Not final yet");
    await expect.poll(async () => (await saved()).files.map(f => [f.name, f.url, f.source, f.driveId].join(" | "))).toEqual(["Banner Promo Oktober | " + FOLDER + " | gdrive | 1E2eFolderOne"]);

    /* Revised in the same folder: Version 2, and still the one row */
    await revised(null, 2);
    await expect(row("Banner Promo Oktober").locator(".av-state")).toHaveText("Version 2 · Not final yet");
    expect((await saved()).files.length, "the same link is not filed twice").toBe(1);

    /* Revised with a Figma file: that is filed too */
    await revised(FIG, 3);
    await expect(row("Hero Banner").locator(".av-state")).toHaveText("Version 3 · Not final yet");
    await expect.poll(async () => (await saved()).files.map(f => f.url)).toEqual([FOLDER, FIG]);

    /* the version's link changed: its row follows, named after the new link */
    await page.locator("#drawer .ver-edit-link").click();
    await page.locator("#el_url").fill(FIG2);
    await page.locator("#modal .btn.primary").click();
    await expect.poll(async () => (await saved()).files.map(f => f.name + " | " + f.url)).toEqual(["Banner Promo Oktober | " + FOLDER, "Hero Banner B | " + FIG2]);
    await expect(row("Hero Banner B").locator(".av-state")).toHaveText("Version 3 · Not final yet");

    /* filed before its name was read: the stand-in, then Drive's name */
    await revised(FOLDER2, 4);
    await expect.poll(async () => ((await saved()).files.find(f => f.url === FOLDER2) || {}).name, { timeout: 10000 }).toBe("Final Banner Set");
    await expect(row("Final Banner Set").locator(".av-state")).toHaveText("Version 4 · Not final yet");

    /* one link, counted once: as its version */
    const links = await page.evaluate(i => taskAssetLinks(task(i)).map(l => l.kind + " " + l.url), id);
    expect(links.filter(l => l.startsWith("file ")), "no second copy of a version's link").toEqual([]);
    expect(links.length).toBe(4);

    /* approved: the row says it is the final one, in Indonesian too */
    await page.evaluate(i => editTaskWith(task(i), t => { t.versions[t.versions.length - 1].state = "approved"; }), id);
    await expect.poll(async () => (await saved()).versions[3].state).toBe("approved");
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    await expect(row("Final Banner Set").locator(".av-state")).toHaveText("Versi 4 · Final");
    await expect(row("Hero Banner B").locator(".av-state")).toHaveText("Versi 3 · Belum final");
  } finally {
    await page.evaluate(async i => { UI_LANG = "en"; closeModal(); closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});
