/* Settings → Smart Scoring (Oct 2026, src/scoring-settings.js, docs/SMART-SCORING.md). The admin turns Smart Scoring
   and a module on and off and it stays across a reload; weights that do not add up to 100% are never saved. The tab is
   there only for whoever may set it up (or see it): a member has none, a role given scoring_manage_workspace has it.
   In Roles & permissions a role that can both change scores and approve them is warned. Team Lead and Creative Lead
   get the approval and analytics permissions in one click. Everything is put back as it was. The server side:
   tests/scoring-settings-route.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tabs = page => page.locator(".settings .snav button").evaluateAll(b => b.map(x => x.getAttribute("onclick").match(/settingsTab='([a-z]+)'/)[1]));
const stored = page => page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
/* back to what it was, whatever version it is on now */
const putBack = (page, original) => page.evaluate(async o => { const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o, configVersion: cur.settings.configVersion }); }, original);

test("the admin turns Smart Scoring and a module on and off, it stays across a reload, and weights must add up to 100%", async ({ page }) => {
  await signIn(page, ADMIN);
  const original = await stored(page);
  expect(original.enabled).toBe(false);
  try {
    await page.evaluate(() => go("settings", "scoring"));
    const t = await tabs(page);
    expect(t.indexOf("scoring")).toBe(t.indexOf("automation") + 1);
    await expect(page.locator("#content section.panel h2").first()).toHaveText("Smart Scoring");
    const master = page.locator('[data-sc="enabled"]'), story = page.locator('[data-sc="modules.story.on"]'), okr = page.locator('[data-sc="modules.okr.on"]');
    await expect(master).not.toHaveClass(/\bon\b/);
    await expect(page.locator('[data-sc="modules.hours.on"]')).toHaveClass(/\bon\b/);
    expect(await page.evaluate(() => scoringOn())).toBe(false);
    /* a module on while Smart Scoring itself is off: the Modules panel says why nothing shows, until the main switch is on */
    const masterOff = page.locator(".scr-master-off");
    await expect(masterOff).toBeVisible();
    await expect(masterOff).toContainText("Smart Scoring for this workspace");
    /* on, with Story Points (hybrid) and OKR */
    await master.click(); await expect(masterOff).toBeHidden();
    await story.click(); await okr.click();
    await page.locator("#sc_mode_story").selectOption("hybrid");
    await page.locator("#content section.panel").first().getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await page.reload(); await ready(page);
    await page.evaluate(() => go("settings", "scoring"));
    await expect(master).toHaveClass(/\bon\b/); await expect(story).toHaveClass(/\bon\b/); await expect(okr).toHaveClass(/\bon\b/);
    await expect(page.locator('[data-sc="modules.kpi.on"]')).not.toHaveClass(/\bon\b/);
    await expect(page.locator("#sc_mode_story")).toHaveValue("hybrid");
    expect(await page.evaluate(() => [scoringOn(), scoringModuleOn("story"), scoringModuleOn("okr"), scoringModuleOn("kpi")])).toEqual([true, true, true, false]);
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Story Points");

    /* weights that do not add up to 100%: the total says so and nothing is saved */
    const version = (await stored(page)).configVersion;
    await page.locator("#sc_weighted_w_complexity").fill("30");
    await expect(page.locator("#sc_total_weighted")).toHaveText(/90%/);
    await expect(page.locator("#sc_total_weighted")).toHaveClass(/\bbad\b/);
    await page.locator("#content section.panel").filter({ has: page.locator("#sc_total_weighted") }).getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toContainText("The weights must add up to 100% before saving");
    expect((await stored(page)).configVersion).toBe(version);
    await page.locator("#sc_weighted_w_scope").fill("40");
    await expect(page.locator("#sc_total_weighted")).toHaveText(/100%/);
    await expect(page.locator("#sc_total_weighted")).toHaveClass(/\bok\b/);

    /* and off again (the weights as they now are: 30/40/20/10) */
    await master.click(); await story.click(); await okr.click();
    await page.locator("#content section.panel").first().getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await page.reload(); await ready(page);
    await page.evaluate(() => go("settings", "scoring"));
    await expect(master).not.toHaveClass(/\bon\b/); await expect(story).not.toHaveClass(/\bon\b/); await expect(okr).not.toHaveClass(/\bon\b/);
    await expect(page.locator("#sc_weighted_w_complexity")).toHaveValue("30");
    const now = await stored(page);
    expect([now.enabled, now.modules.story.on, now.modules.okr.on, now.weighted.weights.complexity, now.weighted.weights.scope]).toEqual([false, false, false, 0.3, 0.4]);
    expect(await page.evaluate(() => scoringOn())).toBe(false);
    /* Indonesian */
    await page.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(page.locator("#content section.panel h2").nth(1)).toHaveText("Modul");
    await page.evaluate(() => { setLanguage("en"); renderScreen(false); });
  } finally {
    await putBack(page, original);
  }
  const back = await stored(page);
  expect(back.enabled).toBe(false); expect(back.weighted.weights).toEqual(original.weighted.weights);
});

test("a member does not see the tab, a role given scoring_manage_workspace does; a role that changes and approves scores is warned", async ({ browser }) => {
  const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await signIn(admin, ADMIN);
  const tag = Date.now().toString(36), other = { email: "sc-" + tag + "@e2e.test", pw: "Scoring!Member-2026x" };
  const member = await admin.evaluate(async o => { await apiFetch("POST", "/api/members", { name: "Scoring Member " + o.tag, email: o.email, perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email); await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw }); return id; }, Object.assign({ tag }, other));
  const role = await admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => b.roles.find(r => r.id === "member")));
  const setRole = perms => admin.evaluate(p => apiFetch("PUT", "/api/roles/member", p), Object.assign({}, role, { permissions: perms }));
  try {
    const two = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    await signIn(two, other);
    await two.evaluate(() => { S.settingsTab = "scoring"; go("settings"); });
    expect(await tabs(two)).not.toContain("scoring");
    expect(await two.evaluate(() => S.settingsTab)).toBe("profile");
    /* the role is given the permission to set up Smart Scoring: the tab, and it can be saved */
    await setRole(role.permissions.concat(["scoring_manage_workspace"]));
    await two.reload(); await ready(two);
    await two.evaluate(() => go("settings", "scoring"));
    expect(await tabs(two)).toEqual(["profile", "layout", "theme", "scoring", "notifications"]);
    await expect(two.locator('[data-sc="enabled"]')).toBeEnabled();
    await expect(two.locator("#content section.panel").first().getByRole("button", { name: "Save" })).toBeVisible();
    await expect(two.locator(".scr-ro")).toHaveCount(0);
    expect(await two.locator("#content section.panel h2", { hasText: "Who holds the Smart Scoring permissions" }).count()).toBe(0);   /* that is for whoever manages roles */
    /* seeing the analytics only: the tab, read-only */
    await setRole(role.permissions.concat(["scoring_view_analytics"]));
    await two.reload(); await ready(two);
    await two.evaluate(() => go("settings", "scoring"));
    expect(await tabs(two)).toContain("scoring");
    await expect(two.locator(".scr-ro")).toBeVisible();
    await expect(two.locator('[data-sc="enabled"]')).toBeDisabled();
    expect(await two.locator("#content section.panel").getByRole("button", { name: "Save" }).count()).toBe(0);

    /* Roles & permissions: the Smart Scoring group, and the warning when one role both changes and approves scores */
    await admin.evaluate(() => { go("settings", "roles"); roleModal("member"); });
    const modal = admin.locator("#modal"), group = modal.locator(".cap-group").filter({ has: admin.locator(".cap-group-head b", { hasText: /^Smart Scoring$/ }) });
    await expect(group.locator(".cap-row")).toHaveCount(8);
    await expect(modal.locator(".scr-duty-warn")).toHaveCount(0);
    await group.locator('[data-cap="scoring_edit_task"]').click();
    await expect(modal.locator(".scr-duty-warn")).toHaveCount(0);
    await group.locator('[data-cap="scoring_approve_completion"]').click();
    await expect(group.locator(".scr-duty-warn")).toBeVisible();
    await expect(group.locator(".scr-duty-warn")).toContainText("both change scores and approve them");
    await group.locator('[data-cap="scoring_approve_completion"]').click();
    await expect(modal.locator(".scr-duty-warn")).toHaveCount(0);
    await group.locator(".cap-all").click();   /* all on */
    await expect(group.locator(".scr-duty-warn")).toBeVisible();
    await admin.evaluate(() => closeModal());   /* not saved */
    /* one person's extra permissions offer them too */
    await admin.reload(); await ready(admin);
    await admin.evaluate(id => { go("settings", "members"); capGrantModal(id); }, member);
    await expect(admin.locator("#modal .cap-grant-group").filter({ has: admin.locator("b", { hasText: /^Smart Scoring$/ }) }).locator('input[name="cap_grant"]')).toHaveCount(8);
    await admin.evaluate(() => closeModal());
  } finally {
    await setRole(role.permissions);
    await admin.evaluate(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}), member);
  }
});

test("Team Lead and Creative Lead get the approval and analytics permissions in one click", async ({ page }) => {
  await signIn(page, ADMIN);
  const LEAD = ["scoring_approve_estimate", "scoring_approve_completion", "scoring_view_analytics"];
  const before = await page.evaluate(() => apiFetch("GET", "/api/roles").then(r => r.roles.filter(x => x.id === "team_lead" || x.id === "creative_lead")));
  expect(before.length).toBe(2);
  try {
    await page.evaluate(() => go("settings", "scoring"));
    const holders = page.locator("#content section.panel").filter({ has: page.locator("h2", { hasText: "Who holds the Smart Scoring permissions" }) });
    await expect(holders.locator(".scr-holder")).toHaveCount(8);
    await expect(holders.locator('.scr-holder[data-cap="scoring_approve_estimate"] .badge')).toHaveText(["Admin"]);
    await page.locator("#scLeadsBtn").click();
    await page.locator("#modal").getByRole("button", { name: "Confirm" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Team Lead and Creative Lead have the approval and analytics permissions now");
    const roles = await page.evaluate(() => apiFetch("GET", "/api/roles").then(r => r.roles));
    for (const r of before) expect(roles.find(x => x.id === r.id).permissions).toEqual(r.permissions.concat(LEAD.filter(c => r.permissions.indexOf(c) < 0)));
    await expect(holders.locator('.scr-holder[data-cap="scoring_approve_estimate"] .badge')).toHaveText(["Admin", "Creative Lead", "Team Lead"]);
    await expect(page.locator("#scLeadsBtn")).toBeDisabled();
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Gave the approval and analytics permissions to");
  } finally {
    await page.evaluate(list => Promise.all(list.map(r => apiFetch("PUT", "/api/roles/" + r.id, r))), before);
  }
});
