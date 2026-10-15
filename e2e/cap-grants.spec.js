/* Extra permissions for one person (Oct 2026): from a person's row in Members, permissions on top of their role until
   an optional last day; Roles & permissions lists who has them; the page counts them (has()). And the Save as
   template dialog offers only what a role may do: for everyone, for oneself, or both. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("extra permissions are given from Members, listed in Roles, and counted by the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const tag = Date.now().toString(36);
  const id = await page.evaluate(async tag => { await apiFetch("POST", "/api/members", { name: "Grant " + tag, email: "grant-" + tag + "@e2e.test", perm: "member", cap: 40 }); await reloadAll(); return Object.keys(PEOPLE).find(k => PEOPLE[k].email === "grant-" + tag + "@e2e.test"); }, tag);
  try {
    await page.evaluate(() => { S.settingsTab = "members"; go("settings"); });
    const row = page.locator("tr", { hasText: "Grant " + tag });
    const chip = row.locator(".cap-grant-chip");
    await expect(chip).toHaveText("Extra permissions");
    await chip.click();
    /* the role's own permissions are there, not to be given again */
    await expect(page.locator(".cap-grant-row.own", { hasText: "Open AI Hub and generate visuals" }).locator("input")).toBeDisabled();
    await page.locator(".cap-grant-row", { hasText: "Save AI Hub canvases as templates for everyone" }).locator("input").check();
    const until = await page.evaluate(() => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
    await page.locator("#cap_grant_until").fill(until);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(chip).toContainText("+1 extra permission");
    await expect(chip).toContainText("until");
    expect(await page.evaluate(id => PEOPLE[id].perm, id)).toBe("member");   /* the role stays */
    /* Roles & permissions lists it */
    await page.evaluate(() => { S.settingsTab = "roles"; go("settings"); });
    const listed = page.locator(".pref", { hasText: "Grant " + tag });
    await expect(listed).toContainText("Save AI Hub canvases as templates for everyone");
    await listed.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Remove all" }).click();
    await expect(page.locator(".pref", { hasText: "Grant " + tag })).toHaveCount(0);
    /* the page counts what a person was given, while it lasts */
    expect(await page.evaluate(() => { const r = ROLES.find(x => x.id === "member"); const was = [ME, MY_GRANTS]; ME = Object.keys(PEOPLE).find(k => PEOPLE[k].perm === "member") || ME; const before = has("manage_backups"); MY_GRANTS = [{ cap: "manage_backups", expiresAt: null }]; const on = has("manage_backups"); MY_GRANTS = [{ cap: "manage_backups", expiresAt: "2000-01-01" }]; const off = has("manage_backups"); ME = was[0]; MY_GRANTS = was[1]; return [before, on, off]; })).toEqual([false, true, false]);
    /* Save as template: a role with templates for oneself only */
    await page.evaluate(() => { window.__has = has; has = c => c === "save_ai_templates" ? false : window.__has(c); go("aihub"); });
    await page.locator(".ai-template-card", { hasText: "Educational feed" }).click();
    await page.getByRole("button", { name: "Save as template" }).click();
    await page.getByLabel("Save as a new template").check();
    await expect(page.getByLabel("Everyone in the workspace")).toBeDisabled();
    await expect(page.getByLabel("Only me")).toBeChecked();
    await expect(page.locator("#ai_tpl_aud_hint")).toHaveText("Your role saves templates for yourself only.");
    await page.evaluate(() => { closeModal(); has = window.__has; });
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; S.settingsTab = "members"; go("settings"); });
    await expect(page.locator("tr", { hasText: "Grant " + tag }).locator(".cap-grant-chip")).toHaveText("Izin tambahan");
  } finally {
    await page.evaluate(async id => { UI_LANG = "en"; await apiFetch("PUT", "/api/members/" + id + "/cap-grants", { caps: [] }).catch(() => {}); await apiFetch("DELETE", "/api/members/" + id).catch(() => {}); }, id);
  }
});
