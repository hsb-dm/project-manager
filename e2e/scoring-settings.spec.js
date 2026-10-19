/* Settings → Smart Scoring (Oct 2026, src/scoring-settings.js, docs/SMART-SCORING.md). The admin turns Smart Scoring
   and a module on and off and it stays across a reload; weights that do not add up to 100% are never saved. The tab is
   there only for whoever may set it up (or see it): a member has none, a role given scoring_manage_workspace has it.
   In Roles & permissions a role that can both change scores and approve them is warned. Team Lead and Creative Lead
   get the approval and analytics permissions in one click. The tab is seven groups in a menu (chips on a phone), one
   shown at a time and named in the address, Back and Forward stepping through them; one Save bar counts the changes,
   Discard puts the saved values back, and leaving Settings with changes asks first; the Advanced folds stay as each
   person left them. Everything is put back as it was. The server side: tests/scoring-settings-route.test.js. */
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
const putBack = (page, original) => page.evaluate(async o => { const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o, configVersion: cur.settings.configVersion }); WS.scoring = (await apiFetch("GET", "/api/scoring/settings")).settings; if (typeof SC !== "undefined") { SC.draft = null; SC.saved = null; } }, original);
const group = (page, g) => page.locator('.scr-nav a[data-g="' + g + '"]').click();
const saveBar = page => page.locator("#scrBar");

test("the admin turns Smart Scoring and a module on and off, it stays across a reload, and weights must add up to 100%", async ({ page }) => {
  await signIn(page, ADMIN);
  const original = await stored(page);
  expect(original.enabled).toBe(false);
  try {
    await page.evaluate(() => go("settings", "scoring/overview"));
    const t = await tabs(page);
    expect(t.indexOf("scoring")).toBe(t.indexOf("automation") + 1);
    await expect(page.locator("#content section.panel h2").first()).toHaveText("Smart Scoring");
    const master = page.locator('[data-sc="enabled"]'), story = page.locator('[data-sc="modules.story.on"]'), okr = page.locator('[data-sc="modules.okr.on"]');
    await expect(master).not.toHaveClass(/\bon\b/);
    await expect(page.locator('[data-sc="modules.hours.on"]')).toHaveClass(/\bon\b/);
    await expect(page.locator("#scrMasterState")).toHaveText("Off — nothing changes for anyone.");
    expect(await page.evaluate(() => scoringOn())).toBe(false);
    /* a module on while Smart Scoring itself is off: Overview says why nothing shows, until the main switch is on */
    const masterOff = page.locator(".scr-master-off");
    await expect(masterOff).toBeVisible();
    await expect(masterOff).toContainText("Smart Scoring for this workspace");
    /* on, with Story Points (hybrid) and OKR */
    await master.click(); await expect(masterOff).toBeHidden();
    await expect(page.locator("#scrMasterState")).toHaveText("On — the modules below appear for the people allowed to use them.");
    await story.click(); await okr.click();
    await page.locator("#sc_mode_story").selectOption("hybrid");
    await expect(saveBar(page).locator(".scr-bar-n")).toHaveText("4 unsaved changes");
    await saveBar(page).getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await expect(saveBar(page)).toBeHidden();
    await page.reload(); await ready(page);
    await expect(page).toHaveURL(/\/settings\/scoring\/overview$/);
    await expect(master).toHaveClass(/\bon\b/); await expect(story).toHaveClass(/\bon\b/); await expect(okr).toHaveClass(/\bon\b/);
    await expect(page.locator('[data-sc="modules.kpi.on"]')).not.toHaveClass(/\bon\b/);
    await expect(page.locator("#sc_mode_story")).toHaveValue("hybrid");
    expect(await page.evaluate(() => [scoringOn(), scoringModuleOn("story"), scoringModuleOn("okr"), scoringModuleOn("kpi")])).toEqual([true, true, true, false]);
    await group(page, "history");
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Story Points");

    /* weights that do not add up to 100%: the total says so and nothing is saved */
    const version = (await stored(page)).configVersion;
    await group(page, "estimating");
    await page.locator('[data-adv="weighted"] summary').click();
    await page.locator("#sc_weighted_w_complexity").fill("30");
    await expect(page.locator("#sc_total_weighted")).toHaveText(/90%/);
    await expect(page.locator("#sc_total_weighted")).toHaveClass(/\bbad\b/);
    await group(page, "overview");   /* Save from another group takes the person to the weights */
    await saveBar(page).getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toContainText("The weights must add up to 100% before saving");
    await expect(page).toHaveURL(/\/settings\/scoring\/estimating$/);
    await expect(page.locator("#sc_total_weighted")).toBeVisible();
    expect((await stored(page)).configVersion).toBe(version);
    await page.locator("#sc_weighted_w_scope").fill("40");
    await expect(page.locator("#sc_total_weighted")).toHaveText(/100%/);
    await expect(page.locator("#sc_total_weighted")).toHaveClass(/\bok\b/);

    /* and off again (the weights as they now are: 30/40/20/10) */
    await group(page, "overview");
    await master.click(); await story.click(); await okr.click();
    await saveBar(page).getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await page.reload(); await ready(page);
    await expect(master).not.toHaveClass(/\bon\b/); await expect(story).not.toHaveClass(/\bon\b/); await expect(okr).not.toHaveClass(/\bon\b/);
    await group(page, "estimating");
    await expect(page.locator("#sc_weighted_w_complexity")).toHaveValue("30");
    const now = await stored(page);
    expect([now.enabled, now.modules.story.on, now.modules.okr.on, now.weighted.weights.complexity, now.weighted.weights.scope]).toEqual([false, false, false, 0.3, 0.4]);
    expect(await page.evaluate(() => scoringOn())).toBe(false);
    /* Indonesian */
    await group(page, "overview");
    await page.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(page.locator("#content section.panel h2").nth(1)).toHaveText("Modul");
    await expect(page.locator('.scr-nav a[data-g="estimating"]')).toHaveText("Estimasi");
    await expect(page.locator("#scrGh")).toHaveText("Ringkasan");
    await page.evaluate(() => { setLanguage("en"); renderScreen(false); });
  } finally {
    await putBack(page, original);
  }
  const back = await stored(page);
  expect(back.enabled).toBe(false); expect(back.weighted.weights).toEqual(original.weighted.weights);
});

test("the groups: one at a time, named in the address, Back and Forward step through them, and the last one opens again", async ({ page }) => {
  await signIn(page, ADMIN);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.evaluate(() => go("settings", "scoring/overview"));
  await expect(page).toHaveURL(/\/settings\/scoring\/overview$/);
  const nav = page.locator(".scr-nav");
  await expect(nav.locator("a")).toHaveText(["Overview", "Estimating", "Output & goals", "AI", "Review & bonus", "Access & visibility", "History"]);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("data-g", "overview");
  await expect(page.locator('[data-scr-sec="master"]')).toBeVisible();
  await expect(page.locator('[data-scr-sec="story"]')).toHaveCount(0);   /* only the chosen group is drawn */
  /* a group is drawn in place: the rest of Settings is not redrawn, the heading takes the focus */
  await page.evaluate(() => { document.querySelector(".settings .snav").dataset.kept = "1"; });
  await nav.locator('a[data-g="estimating"]').click();
  await expect(page).toHaveURL(/\/settings\/scoring\/estimating$/);
  await expect(page.locator("#scrGh")).toBeFocused();
  await expect(page.locator("#scrGh")).toHaveText("Estimating");
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("data-g", "estimating");
  await expect(page.locator('[data-scr-sec="hours"]')).toBeVisible(); await expect(page.locator('[data-scr-sec="story"]')).toBeVisible();
  await expect(page.locator('[data-scr-sec="master"]')).toHaveCount(0);
  await nav.locator('a[data-g="history"]').click();
  await expect(page).toHaveURL(/\/settings\/scoring\/history$/);
  await expect(page.locator("#scAudit")).toBeVisible();
  /* "Set up →" on a module card opens its group at its section */
  await nav.locator('a[data-g="overview"]').click();
  await page.locator('.scr-card[data-module="weighted"] .scr-setup').click();
  await expect(page).toHaveURL(/\/settings\/scoring\/estimating$/);
  await expect(page.locator('[data-scr-sec="weighted"]')).toBeInViewport();
  /* Back and Forward */
  await page.goBack(); await expect(page).toHaveURL(/\/settings\/scoring\/overview$/);
  await expect(page.locator('[data-scr-sec="master"]')).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/settings\/scoring\/history$/);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("data-g", "history");
  await page.goForward(); await expect(page).toHaveURL(/\/settings\/scoring\/overview$/);
  await expect(page.locator('[data-scr-sec="modules"]')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector(".settings .snav").dataset.kept)).toBe("1");
  /* a link opens its group */
  await page.goto("/settings/scoring/ai"); await ready(page);
  await expect(page.locator('[data-scr-sec="ai"]')).toBeVisible();
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("data-g", "ai");
  await expect(page.locator('[data-scr-sec="ai"]')).toContainText("Settings → AI & integrations → Models → Chat models");
  /* the last group opens again, from the Settings menu and from an old link without one */
  await page.evaluate(() => { go("home"); go("settings", "profile"); });
  await page.locator('.settings .snav button[onclick*="scoring"]').click();
  await expect(page).toHaveURL(/\/settings\/scoring\/ai$/);
  await page.goto("/settings/scoring"); await ready(page);
  await expect(page).toHaveURL(/\/settings\/scoring\/ai$/);
  await expect(page.locator('[data-scr-sec="ai"]')).toBeVisible();
  await page.evaluate(() => go("settings", "scoring/overview"));
  expect(errors).toEqual([]);
});

test("the Save bar counts the changes in every group, Discard puts the saved values back, and leaving Settings asks first", async ({ page }) => {
  await signIn(page, ADMIN);
  const original = await stored(page), bar = saveBar(page), lock = page.locator("#sc_lock");
  try {
    await page.evaluate(() => { go("home"); go("settings", "scoring/estimating"); });
    await expect(bar).toBeHidden();
    await lock.selectOption("approve");
    await expect(bar).toBeVisible(); await expect(bar.locator(".scr-bar-n")).toHaveText("1 unsaved change");
    /* the browser's Back to the Home screen asks first, and the address stays */
    await page.goBack();
    await expect(page.locator("#modal .modal-head h3")).toHaveText("Leave without saving?");
    await expect(page.locator("#modal")).toContainText("1 change to Smart Scoring is not saved yet.");
    await expect(page).toHaveURL(/\/settings\/scoring\/estimating$/);
    expect(await page.evaluate(() => S.screen)).toBe("settings");
    await page.locator("#modal").getByRole("button", { name: "Keep editing" }).click();
    await expect(lock).toHaveValue("approve");
    /* a change in another group: the draft is kept while switching */
    await group(page, "ai");
    await page.locator("#sc_ai_user").fill("25");
    await expect(bar.locator(".scr-bar-n")).toHaveText("2 unsaved changes");
    await page.locator("#sc_ai_user").fill(String(original.ai.perUserDaily));   /* typed back: no longer a change */
    await expect(bar.locator(".scr-bar-n")).toHaveText("1 unsaved change");
    await group(page, "estimating");
    await expect(lock).toHaveValue("approve");
    /* Discard: the saved values, in place */
    await bar.getByRole("button", { name: "Discard" }).click();
    await expect(bar).toBeHidden(); await expect(lock).toHaveValue(original.hours.lockPolicy);
    expect(await page.evaluate(() => scCount())).toBe(0);
    /* another Settings tab keeps the draft without asking; leaving Settings asks, and leaving drops the change */
    await lock.selectOption("approve");
    await page.evaluate(() => go("settings", "profile"));
    await expect(page.locator("#modalWrap")).not.toHaveClass(/\bopen\b/);
    await page.evaluate(() => go("settings", "scoring"));
    await expect(lock).toHaveValue("approve"); await expect(bar).toBeVisible();
    await page.evaluate(() => go("home"));
    await expect(page.locator("#modal .modal-head h3")).toHaveText("Leave without saving?");
    expect(await page.evaluate(() => S.screen)).toBe("settings");
    await page.locator("#scLeaveGo").click();
    expect(await page.evaluate(() => S.screen)).toBe("home");
    expect((await stored(page)).configVersion).toBe(original.configVersion);   /* nothing was saved */
    await page.evaluate(() => go("settings", "scoring"));
    await expect(lock).toHaveValue(original.hours.lockPolicy); await expect(bar).toBeHidden();
    /* Save from the bar */
    await lock.selectOption("approve");
    await bar.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await expect(bar).toBeHidden();
    expect((await stored(page)).hours.lockPolicy).toBe("approve");
    await page.evaluate(() => go("home"));
    expect(await page.evaluate(() => S.screen)).toBe("home");   /* saved: nothing to ask */
  } finally {
    await putBack(page, original);
  }
  expect((await stored(page)).hours.lockPolicy).toBe(original.hours.lockPolicy);
});

test("the Advanced folds stay as each person left them; on a phone the groups are chips and the Save bar sits above the tab bar", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.evaluate(() => go("settings", "scoring/estimating"));
  const fold = page.locator('[data-adv="story"]');
  await expect(fold).not.toHaveAttribute("open");
  await expect(page.locator("#sc_story_w_complexity")).toBeHidden();
  await fold.locator("summary").click();
  await expect(page.locator("#sc_story_w_complexity")).toBeVisible();
  await page.reload(); await ready(page);
  await expect(page.locator('[data-adv="story"]')).toHaveAttribute("open", "");
  await expect(page.locator('[data-adv="weighted"]')).not.toHaveAttribute("open");
  await page.locator('[data-adv="story"] summary').click();
  await page.reload(); await ready(page);
  await expect(page.locator('[data-adv="story"]')).not.toHaveAttribute("open");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => go("settings", "scoring/overview"));
  const ul = page.locator(".scr-nav ul");
  expect(await ul.evaluate(u => getComputedStyle(u).flexDirection)).toBe("row");
  expect(await ul.evaluate(u => u.scrollWidth > u.clientWidth)).toBe(true);   /* a row that scrolls sideways */
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => go("settings", "scoring/history"));
  /* the chosen chip is scrolled into sight within the row */
  await expect.poll(() => page.evaluate(() => { const u = document.querySelector(".scr-nav ul").getBoundingClientRect(), a = document.querySelector('.scr-nav a[data-g="history"]').getBoundingClientRect(); return a.left >= u.left - 1 && a.right <= u.right + 1; })).toBe(true);
  await page.locator('.scr-nav a[data-g="overview"]').click();
  await expect(page).toHaveURL(/\/settings\/scoring\/overview$/);
  await page.locator('[data-sc="modules.story.on"]').click();
  const bar = saveBar(page);
  await expect(bar).toBeInViewport();
  const r = await page.evaluate(() => { const b = document.getElementById("scrBar").getBoundingClientRect(), t = document.querySelector(".tabbar").getBoundingClientRect(); return [b.bottom, t.top, b.right, innerWidth]; });
  expect(r[0]).toBeLessThanOrEqual(r[1]); expect(r[2]).toBeLessThanOrEqual(r[3]);
  await bar.getByRole("button", { name: "Discard" }).click();
  await expect(bar).toBeHidden();
  await expect(page.locator('[data-sc="modules.story.on"]')).not.toHaveClass(/\bon\b/);
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
    await two.evaluate(() => go("settings", "scoring/overview"));
    expect(await tabs(two)).toEqual(["profile", "layout", "theme", "scoring", "notifications"]);
    await expect(two.locator('[data-sc="enabled"]')).toBeEnabled();
    await expect(two.locator("#scrBar")).toHaveCount(1);
    await expect(two.locator(".scr-ro")).toHaveCount(0);
    await two.evaluate(() => go("settings", "scoring/access"));
    await expect(two.locator("#content section.panel h2", { hasText: "Teams screen" })).toBeVisible();
    expect(await two.locator("#content section.panel h2", { hasText: "Who holds the Smart Scoring permissions" }).count()).toBe(0);   /* that is for whoever manages roles */
    /* seeing the analytics only: the tab, read-only, no Save bar */
    await setRole(role.permissions.concat(["scoring_view_analytics"]));
    await two.reload(); await ready(two);
    await two.evaluate(() => go("settings", "scoring/overview"));
    expect(await tabs(two)).toContain("scoring");
    await expect(two.locator(".scr-ro")).toBeVisible();
    await expect(two.locator('[data-sc="enabled"]')).toBeDisabled();
    await expect(two.locator("#scrBar")).toHaveCount(0);
    for (const g of ["overview", "estimating", "ai", "review"]) {
      await two.evaluate(g => go("settings", "scoring/" + g), g);
      expect(await two.locator("#content [data-sc]:not([disabled])").count(), g).toBe(0);
      await expect(two.locator(".scr-off button")).toHaveCount(0);   /* no "Turn on" */
    }

    /* Roles & permissions: the Smart Scoring group, and the warning when one role both changes and approves scores */
    await admin.evaluate(() => { go("settings", "roles"); roleModal("member"); });
    const modal = admin.locator("#modal"), grp = modal.locator(".cap-group").filter({ has: admin.locator(".cap-group-head b", { hasText: /^Smart Scoring$/ }) });
    await expect(grp.locator(".cap-row")).toHaveCount(8);
    await expect(modal.locator(".scr-duty-warn")).toHaveCount(0);
    await grp.locator('[data-cap="scoring_edit_task"]').click();
    await expect(modal.locator(".scr-duty-warn")).toHaveCount(0);
    await grp.locator('[data-cap="scoring_approve_completion"]').click();
    await expect(grp.locator(".scr-duty-warn")).toBeVisible();
    await expect(grp.locator(".scr-duty-warn")).toContainText("both change scores and approve them");
    await grp.locator('[data-cap="scoring_approve_completion"]').click();
    await expect(modal.locator(".scr-duty-warn")).toHaveCount(0);
    await grp.locator(".cap-all").click();   /* all on */
    await expect(grp.locator(".scr-duty-warn")).toBeVisible();
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
    await page.evaluate(() => go("settings", "scoring/access"));
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
    await group(page, "history");
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Gave the approval and analytics permissions to");
  } finally {
    await page.evaluate(list => Promise.all(list.map(r => apiFetch("PUT", "/api/roles/" + r.id, r))), before);
  }
});
