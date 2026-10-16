/* Settings → Integrations → Storage & Deletion (Oct 2026): deletion sync stays off and cannot be turned on until the
   shared Google Drive account is connected; trash is the only behaviour; the safety controls are locked on. The files
   ZenCrevia put in Drive are listed with where each is used: one in use cannot be deleted, one that is not is deleted
   everywhere in ZenCrevia after a confirmation that says what happens in Drive — here, with sync off, nothing — and
   Undo keeps it. Google Drive is not reachable from the tests: Drive's side is tests/drive-trash.test.js. */
const { test, expect } = require("@playwright/test");
const path = require("path"), os = require("os");
const { DatabaseSync } = require("node:sqlite");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_e2e-del-01";
const dbFile = () => path.join(os.tmpdir(), "zencrevia-e2e-" + (process.env.E2E_PORT || "3310"), "creative-os.db");

test("Storage & Deletion: off until Drive is connected, a used file is kept, an unused one deleted and undone", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const ws = await page.evaluate(async () => { await apiFetch("GET", "/api/cloud/gdrive/deletion"); return WS.id; });
  /* a file ZenCrevia uploaded, as the upload route records it */
  let db = new DatabaseSync(dbFile());
  db.prepare("INSERT OR REPLACE INTO drive_uploads (drive_id, workspace_id, name, size_label, account, uploaded_by, created_at, status) VALUES (?, ?, 'campaign-hero.png', '1.2 MB', 'team@example.com', ?, ?, 'active')").run(ID, ws, await page.evaluate(() => ME), new Date().toISOString());
  db.close();
  let taskId = null;
  const panel = page.locator("section.panel", { has: page.locator("h2", { hasText: /^(Storage & Deletion|Penyimpanan & Penghapusan)$/ }) });
  const row = panel.locator(".dd-file", { hasText: "campaign-hero.png" });
  try {
    await page.evaluate(() => go("settings", "integrations"));
    await expect(panel).toBeVisible();
    await expect(panel.locator(".pref", { hasText: "Google Drive" }).first().locator(".badge")).toHaveText("Not connected");
    /* off, and cannot be turned on without Drive; trash only; the safety controls locked on */
    const sync = panel.getByRole("switch", { name: "Sync deleted files" });
    await expect(sync).toHaveAttribute("aria-checked", "false");
    await expect(sync).toBeDisabled();
    await expect(panel).toContainText("Connect the shared Google Drive account first");
    await expect(panel.locator(".dd-radio input")).toBeChecked();
    await expect(panel.locator(".dd-radio input")).toBeDisabled();
    await expect(panel.getByRole("switch", { name: "Protect files referenced elsewhere" })).toBeDisabled();
    await expect(panel.getByRole("switch", { name: "Require confirmation for global deletion" })).toBeDisabled();
    /* the errors setting is saved with Save changes */
    const save = panel.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();
    await panel.getByRole("switch", { name: "Show Drive sync errors to workspace admins" }).click();
    await expect(save).toBeEnabled(); await save.click();
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/cloud/gdrive/deletion").then(v => v.settings.showErrors))).toBe(false);

    /* used in a task: it says where, and cannot be deleted */
    taskId = await page.evaluate(async id => (await apiFetch("POST", "/api/tasks", { title: "Hero banner " + Date.now(), status: WS.workflow[0].id, prio: "medium", description: "Final: https://drive.google.com/file/d/" + id + "/view" })).id, ID);
    await page.evaluate(() => { DD.view = null; go("settings", "integrations"); });
    await expect(row.locator(".dd-used")).toHaveText("Used in 1 place");
    await expect(row.locator(".dd-del")).toBeDisabled();
    await row.locator(".dd-used").click();
    await expect(row.locator(".dd-usage")).toContainText("Description: Hero banner");

    /* removed there: deleted everywhere in ZenCrevia, after saying what Drive gets — nothing, sync is off */
    await page.evaluate(async i => { await apiFetch("DELETE", "/api/tasks/" + i); }, taskId); taskId = null;
    await page.evaluate(() => { DD.view = null; ddRefresh(); });
    await expect(row).toContainText("Not used anywhere");
    await row.locator(".dd-del").click();
    await expect(page.locator("#modal")).toContainText("Delete this file everywhere in ZenCrevia?");
    await expect(page.locator("#modal")).toContainText("Stays in Google Drive — deletion sync is off");
    await expect(page.locator("#modal")).toContainText("0 other locations");
    await page.locator("#modal .btn.danger").click();
    await expect(page.locator("#toasts")).toContainText("File deleted in ZenCrevia only.");
    await expect(row.locator(".dd-status")).toHaveText("Deleted in ZenCrevia only");
    /* Undo: kept */
    await row.locator(".dd-undo").click();
    await expect(row.locator(".dd-del")).toBeEnabled();
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/cloud/gdrive/deletion").then(v => v.files.find(f => f.driveId === id).status), ID)).toBe("active");
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(panel.locator("h2")).toHaveText("Penyimpanan & Penghapusan");
    await expect(row).toContainText("Tidak dipakai di mana pun");
    await expect(panel.getByRole("switch", { name: "Sinkronkan file yang dihapus" })).toBeDisabled();
  } finally {
    await page.evaluate(async t => { UI_LANG = "en"; closeModal(); if (t) await apiFetch("DELETE", "/api/tasks/" + t).catch(() => {}); await apiFetch("PUT", "/api/cloud/gdrive/deletion", { showErrors: true }).catch(() => {}); }, taskId);
    db = new DatabaseSync(dbFile()); db.prepare("DELETE FROM drive_uploads WHERE drive_id=?").run(ID); db.close();
  }
});
