/* Assets: a task in an asset's "Used in" list opened behind the dialog — now the dialog closes and the task is in
   front. A closed task's row said "Approved" and "Completed" side by side — the stage alone says it now. An asset
   with no folder could not be given one (the select had nothing to change from); folders can be renamed and
   deleted from an edit button beside each. An icon can stand in for a thumbnail. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
}
/* an asset, two tasks that use it (one closed), and a folder */
async function setup(page) {
  return page.evaluate(async () => {
    const tasks = [];
    for (const [title, status] of [["Badge Award key visual", "approved"], ["Badge Award social post", "progress"]]) {
      const d = await apiFetch("POST", "/api/tasks", { title, status, prio: "medium", assignee: ME, assignees: [ME], reviewers: [ME], reviewer: ME });
      TASKS.push(hTask(d)); tasks.push(d.id);
    }
    const name = "Badge Award e2e " + Date.now().toString(36);
    ASSETS = (await apiFetch("POST", "/api/assets", { name, type: "logo", color: "#1FA463", tags: [], source: "local", size: "12 KB", ver: 1 })).map(hAsset);
    const asset = ASSETS.find(a => a.name === name).id;
    tasks.forEach(id => task(id).files.push({ name, size: "1 KB" }));
    ASSET_FOLDERS = await apiFetch("POST", "/api/folders", { name: "Motion e2e", type: "video" });
    const folder = ASSET_FOLDERS.find(f => f.name === "Motion e2e").id;
    S.assetFolder = "all"; S.assetView = "grid"; S.assetTab = "library"; go("assets"); renderScreen();
    return { tasks, asset, folder };
  });
}
async function cleanup(page, ids) {
  await page.evaluate(async ids => {
    for (const t of ids.tasks) await apiFetch("DELETE", "/api/tasks/" + t).catch(() => {});
    await apiFetch("DELETE", "/api/assets/" + ids.asset).catch(() => {});
    await apiFetch("DELETE", "/api/folders/" + ids.folder).catch(() => {});
  }, ids).catch(() => {});
}
const server = (page, id) => page.evaluate(async id => { await reloadAll(); const a = asset(id); return { folder: a.folder || null, icon: a.icon || "", folders: ASSET_FOLDERS.map(f => f.name) }; }, id);

test("a related task opens in front of the asset dialog; a closed task shows its stage, not Completed too", async ({ page }) => {
  await signIn(page); const ids = await setup(page);
  try {
    await page.evaluate(id => openAsset(id), ids.asset);
    const rows = page.locator("#modal .agenda .task-row");
    await expect(rows).toHaveCount(2);
    const closedRow = rows.filter({ hasText: "Badge Award key visual" });
    await expect(closedRow.locator(".badge", { hasText: /Approved/ })).toHaveCount(1);
    await expect(closedRow.locator('.badge[title="Completed"]')).toHaveCount(0);
    await expect(page.locator("#modal .eyebrow", { hasText: "Used in 2 tasks" })).toBeVisible();
    /* elsewhere a closed task with no stage shown still says Completed (the dashboard's review list hides the stage) */
    expect(await page.evaluate(id => /title="Completed"/.test(taskRow(task(id), { showStatus: false })), ids.tasks[0])).toBe(true);
    expect(await page.evaluate(id => /title="Completed"/.test(taskRow(task(id), { fixedMeta: true })), ids.tasks[0])).toBe(false);

    await closedRow.click();
    await expect(page.locator("#modalWrap")).not.toHaveClass(/open/);
    await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(ids.tasks[0]);
    await expect(page.locator("#drawer")).toBeVisible();
    /* a task opened by code while a dialog is up, with no click inside it, leaves the dialog alone */
    await page.evaluate(() => closeDrawer());
    await page.evaluate(([a, t]) => { openAsset(a); setTimeout(() => openTask(t), 0); }, [ids.asset, ids.tasks[1]]);
    await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(ids.tasks[1]);
    await expect(page.locator("#modalWrap")).toHaveClass(/open/);
  } finally { await cleanup(page, ids); }
});

test("an asset with no folder can be given one; folders are renamed and deleted from the list", async ({ page }) => {
  await signIn(page); const ids = await setup(page);
  try {
    await page.evaluate(id => openAsset(id), ids.asset);
    const sel = page.locator('#modal select[aria-label="Folder"]');
    await expect(sel).toHaveValue("");
    await expect(sel.locator("option").first()).toHaveText("No folder");
    await sel.selectOption(ids.folder);
    await expect.poll(async () => (await server(page, ids.asset)).folder).toBe(ids.folder);
    /* and back to none */
    await page.evaluate(id => openAsset(id), ids.asset);
    await page.locator('#modal select[aria-label="Folder"]').selectOption("");
    await expect.poll(async () => (await server(page, ids.asset)).folder).toBe(null);
    await page.evaluate(() => closeModal());
    await page.evaluate(([a, f]) => { asset(a).folder = f; persistAsset(asset(a), false); }, [ids.asset, ids.folder]);
    await expect.poll(async () => (await server(page, ids.asset)).folder).toBe(ids.folder);

    /* rename from the edit button beside the folder */
    await page.evaluate(() => { go("assets"); renderScreen(); });
    const edit = page.locator(`.folders .folder-edit[data-folder="${ids.folder}"]`);
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.locator("#modal h3")).toHaveText("Edit folder");
    await page.locator("#ef_name").fill("Motion graphics e2e");
    await page.locator("#modal").getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".folders .folder-item", { hasText: "Motion graphics e2e" })).toBeVisible();
    await expect.poll(async () => (await server(page, ids.asset)).folders).toContain("Motion graphics e2e");
    /* the edit button does not open the folder; the folder button still does */
    await page.locator(".folders .folder-item", { hasText: "Motion graphics e2e" }).locator("button").first().click();
    await expect.poll(() => page.evaluate(() => S.assetFolder)).toBe(ids.folder);

    /* delete: the asset stays, with no folder */
    await page.locator(`.folders .folder-edit[data-folder="${ids.folder}"]`).click();
    await page.locator("#modal").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#modal p")).toContainText("1 asset stay in the library, without a folder.");
    await page.locator("#modal .btn.danger").click();
    await expect(page.locator(".folders .folder-item", { hasText: "Motion graphics e2e" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => S.assetFolder)).toBe("all");
    const after = await server(page, ids.asset);
    expect(after.folder).toBe(null); expect(after.folders).not.toContain("Motion graphics e2e");
  } finally { await cleanup(page, ids); }
});

test("an icon stands in for a thumbnail: picked, shown on the card, kept by the server, picked again to remove", async ({ page }) => {
  await signIn(page); const ids = await setup(page);
  try {
    await page.evaluate(id => openAsset(id), ids.asset);
    const opts = page.locator("#modal .asset-icon-opt");
    await expect(opts).toHaveCount(18);
    await expect(page.locator("#modal .asset-icon-pick .hint")).toHaveText("Or use an icon");
    await page.locator('#modal .asset-icon-opt[data-icon="award"]').click();
    await expect(page.locator('#modal .asset-icon-opt[data-icon="award"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#as_tile .asset-face svg.asset-glyph")).toBeVisible();
    await expect(page.locator("#as_tile .asset-face .ext")).toHaveText("SVG");
    await expect.poll(async () => (await server(page, ids.asset)).icon).toBe("award");
    /* the card in the grid and the chip in the list */
    await page.evaluate(() => { closeModal(); S.assetView = "grid"; renderScreen(false); });
    await expect(page.locator(".acard", { hasText: "Badge Award e2e" }).locator(".apv .asset-face svg")).toBeVisible();
    await page.evaluate(() => { S.assetView = "list"; renderScreen(false); });
    await expect(page.locator(".tbl tr", { hasText: "Badge Award e2e" }).locator(".ficon svg.asset-glyph")).toBeVisible();
    await page.evaluate(() => { S.assetView = "grid"; renderScreen(false); });
    /* another icon replaces it; the same icon again removes it */
    await page.evaluate(id => openAsset(id), ids.asset);
    await page.locator('#modal .asset-icon-opt[data-icon="video"]').click();
    await expect(page.locator("#modal .asset-icon-opt.on")).toHaveCount(1);
    await page.locator('#modal .asset-icon-opt[data-icon="video"]').click();
    await expect(page.locator("#modal .asset-icon-opt.on")).toHaveCount(0);
    await expect(page.locator("#as_tile svg")).toHaveCount(0);
    await expect(page.locator("#as_tile")).toHaveText("SVG");
    await expect.poll(async () => (await server(page, ids.asset)).icon).toBe("");
    /* with a thumbnail the icon choice is not offered */
    await page.evaluate(id => { asset(id).img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; openAsset(id); }, ids.asset);
    await expect(page.locator("#modal .asset-icon-pick")).toHaveCount(0);
    /* the server keeps only an icon name */
    const bad = await page.evaluate(async id => { const a = Object.assign({}, dAsset(asset(id)), { icon: "<img src=x onerror=alert(1)>" }); delete a.img; const list = await apiFetch("PUT", "/api/assets/" + id, a); return list.find(x => x.id === id).icon; }, ids.asset);
    expect(bad).toBe("");
  } finally { await cleanup(page, ids); }
});

test("in Indonesian, and on a phone the folder select has its edit button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page); const ids = await setup(page);
  try {
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(); });
    await page.evaluate(id => openAsset(id), ids.asset);
    await expect(page.locator('#modal select[aria-label="Folder"] option').first()).toHaveText("Tanpa folder");
    await expect(page.locator("#modal .asset-icon-pick .hint")).toHaveText("Atau pakai ikon");
    await expect(page.locator('#modal .asset-icon-opt[data-icon="award"]')).toHaveAttribute("title", "Penghargaan");
    await expect(page.locator("#modal .eyebrow", { hasText: "Dipakai di 2" })).toBeVisible();
    /* all 18 icons fit the dialog without a sideways scroll */
    const fits = await page.locator("#modal .asset-icon-grid").evaluate(g => g.scrollWidth <= g.clientWidth + 1 && g.getBoundingClientRect().right <= window.innerWidth);
    expect(fits).toBe(true);
    await page.evaluate(() => closeModal());
    /* phone: the folder is a select; once one is picked, its edit button sits beside it */
    await expect(page.locator(".asset-toolbar .folder-edit-m")).toHaveCount(0);
    await page.locator(".asset-folder-select").selectOption(ids.folder);
    await expect(page.locator(".asset-toolbar .folder-edit-m")).toBeVisible();
    await page.locator(".asset-toolbar .folder-edit-m").click();
    await expect(page.locator("#modal h3")).toHaveText("Ubah folder");
    await expect(page.locator("#ef_name")).toHaveValue("Motion e2e");
  } finally { await page.evaluate(() => { UI_LANG = "en"; }).catch(() => {}); await cleanup(page, ids); }
});
