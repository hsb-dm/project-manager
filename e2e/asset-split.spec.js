/* Assets produced, per person (Oct 2026). A task with more than one person on it takes each one's own count under
   Assets & versions, and its total is their sum — not a total shared out. Until the counts are typed, the ones shown
   are the reports' estimate, and say so; a total typed anywhere else is refused while there are counts to add up.
   Settings → Teams chooses how they add up: by default a team's lead also has the team's figure — what the people of
   the teams they lead produced, them included — beside their own, on their page and in the report; "Per member
   only" keeps everyone to their own. The server keeps the counts whole and the total their sum. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("each person's count, the total as their sum, and a team lead's team figure", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const tag = Date.now().toString(36);
  const o = await page.evaluate(async t => {
    const o = { team: "tas" + t, me: ME };
    await apiFetch("POST", "/api/members", { name: "Rina Split " + t, email: "rina-" + t + "@e2e.test", perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people; o.rina = Object.keys(people).find(id => people[id].email === "rina-" + t + "@e2e.test");
    await apiFetch("POST", "/api/teams", { id: o.team, name: "Assets " + t, color: "blue", lead: ME });
    await apiFetch("POST", "/api/members/" + o.rina + "/team", { teamId: o.team, isPrimary: true });
    o.task = (await apiFetch("POST", "/api/tasks", { title: "Split " + t, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME, o.rina] })).id;
    await reloadAll(); openTask(o.task); S.drawerTab = "files"; renderDrawer(); return o;
  }, tag);
  const saved = () => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(d => ({ count: d.assetCount, split: (d.meta || {}).assetSplit || null })), o.task);
  const rows = page.locator("#drawer .av-split-row");
  const count = async (i, n) => { const el = rows.nth(i).locator("input.count-input"); await el.click(); await page.keyboard.type(String(n)); await page.keyboard.press("Enter"); };
  try {
    /* folded at first: one line with who, how many and the total; opened, it stays open */
    const head = page.locator("#drawer .av-split-head");
    await expect(head).toHaveAttribute("aria-expanded", "false");
    await expect(rows).toHaveCount(0);
    await expect(head).toContainText("Total 0");
    await expect(head.locator(".av-split-sum")).toContainText("Rina 0");
    await head.click();
    await expect(head).toHaveAttribute("aria-expanded", "true");
    /* two people on it: a count each, the total their sum */
    await expect(rows).toHaveCount(2);
    await expect(page.locator("#drawer .av-split-guess")).toContainText("Type what each person produced");
    await expect(page.locator("#drawer .av-split-total b")).toHaveText("0");
    await count(0, 3);
    await expect.poll(saved).toEqual({ count: 3, split: { [o.me]: 3, [o.rina]: 0 } });
    await count(1, 2);
    await expect.poll(saved).toEqual({ count: 5, split: { [o.me]: 3, [o.rina]: 2 } });
    await expect(page.locator("#drawer .av-split-total b")).toHaveText("5");
    await expect(page.locator("#drawer .av-split-guess")).toHaveCount(0);
    /* a team's lead (here, an admin) validates the counts; they count the same before */
    const badge = page.locator("#drawer .av-split-badge"), okRow = page.locator("#drawer .av-split-ok");
    await expect(badge).toHaveText("Not validated yet");
    await okRow.getByRole("button", { name: "Approve counts" }).click();
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(d => d.meta.assetSplitOk && [d.meta.assetSplitOk.by, d.meta.assetSplitOk.split]), o.task)).toEqual([o.me, { [o.me]: 3, [o.rina]: 2 }]);
    await expect(badge).toHaveText("Validated");
    await expect(okRow).toContainText("Validated by");
    /* a count changed afterwards: changed since, to approve again */
    await count(1, 4);
    await expect(badge).toHaveText("Changed since validated");
    await okRow.getByRole("button", { name: "Approve again" }).click();
    await expect(badge).toHaveText("Validated");
    expect((await saved()).count).toBe(7);
    /* a member sees none of it */
    expect(await page.evaluate(o => { const was = ME; ME = o.rina; renderDrawer(); const r = [document.querySelectorAll("#drawer .av-split-badge").length, document.querySelectorAll("#drawer .av-split-ok").length, document.querySelectorAll("#drawer .av-split-head").length]; ME = was; renderDrawer(); return r; }, o)).toEqual([0, 0, 1]);
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    await expect(badge).toHaveText("Divalidasi");
    await expect(okRow).toContainText("Divalidasi oleh");
    await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });
    /* the reports credit each with their own, exactly — not 3.5 each */
    expect(await page.evaluate(id => { const c = taskAssetCredit(task(id)); return [c.by, c.exact, c.how]; }, o.task)).toEqual([{ [o.me]: 3, [o.rina]: 4 }, true, "split"]);
    /* a total typed elsewhere is refused while there are counts to add up */
    await page.evaluate(() => editTask("assetCount", "9"));
    await expect(page.locator("#toasts")).toContainText("Type each person's count under Assets & versions");
    expect((await saved()).count).toBe(7);

    /* the team's lead: the team's figure beside their own (the default) */
    const teamNow = () => page.evaluate(() => { const tm = leadTeamAssets(ME); return tm && tm.total; });
    const fig = await page.evaluate(o => ({ ppl: leadTeamPeople(ME).indexOf(ME) >= 0 && leadTeamPeople(ME).indexOf(o.rina) >= 0, rina: leadTeamAssets(o.rina), team: leadTeamAssets(ME).total, report: leadTeamCredit(ME, memberAssetSets().all).count }), o);
    expect(fig.ppl, "the lead and the people of the team").toBe(true);
    expect(fig.rina, "a member who leads nothing has no team figure").toBeNull();
    expect(fig.team).toBeGreaterThanOrEqual(5);
    expect(fig.report, "the report counts it the same way").toBe(fig.team);
    /* a task of 3 shared out between the two (nothing typed): 1.5 each, and the team gains 3, not 2 + 2 */
    o.task2 = await page.evaluate(async o => { const id = (await apiFetch("POST", "/api/tasks", { title: "Shared " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME, o.rina], assetCount: 3 })).id; await reloadAll(); return id; }, o);
    await expect.poll(teamNow).toBe(fig.team + 3);
    await page.evaluate(() => { closeDrawer(); go("team", ME); });
    await expect(page.locator(".team-kpis")).toContainText("Team assets");
    await expect(page.locator(".team-kpis")).toContainText("Assets " + tag);
    await page.evaluate(() => go("home"));
    expect(await page.evaluate(() => memberAssetsChip(ME))).toContain("wl-team-assets");

    /* Settings → Teams: per member only — no team figure anywhere */
    await page.evaluate(() => go("settings", "teams"));
    const setting = page.locator("section.panel", { has: page.locator("h2", { hasText: "Assets produced, per person" }) });
    await expect(setting.locator("input[value=team]")).toBeChecked();
    await setting.locator("label", { hasText: "Per member only" }).click();
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => ((b.workspace || b.ws || {}).autoHide || {}).assets))).toEqual({ lead: "manual" });
    expect(await page.evaluate(() => [leadTeamAssets(ME), leadTeamCredit(ME, TASKS), /wl-team-assets/.test(memberAssetsChip(ME))])).toEqual([null, null, false]);
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(page.locator("section.panel h2", { hasText: "Aset dihasilkan, per orang" })).toBeVisible();
    await expect(page.locator("label.asset-lead-opt", { hasText: "Team lead ikut terhitung dari aset timnya" })).toBeVisible();
    await page.locator("label.asset-lead-opt", { hasText: "Team lead ikut terhitung dari aset timnya" }).click();
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => ((b.workspace || b.ws || {}).autoHide || {}).assets))).toEqual({ lead: "team" });

    /* the server keeps the counts whole, and the total their sum, whatever is sent */
    const fixed = await page.evaluate(async o => { const d = await apiFetch("GET", "/api/tasks/" + o.task); d.meta = Object.assign({}, d.meta, { assetSplit: { [o.me]: 2.6, [o.rina]: -4, "bad key!": 9 } }); d.assetCount = 99; await apiFetch("PUT", "/api/tasks/" + o.task, d); const s = await apiFetch("GET", "/api/tasks/" + o.task); return { count: s.assetCount, split: s.meta.assetSplit }; }, o);
    expect(fixed).toEqual({ count: 3, split: { [o.me]: 3, [o.rina]: 0 } });

    /* one person on the task: one number, validated the same way */
    o.task3 = await page.evaluate(async () => { UI_LANG = "en"; const id = (await apiFetch("POST", "/api/tasks", { title: "One person " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], assetCount: 4 })).id; await reloadAll(); openTask(id); S.drawerTab = "files"; renderDrawer(); return id; });
    const row = page.locator("#drawer .av-count");
    await expect(row.locator(".av-split-badge")).toHaveText("Not validated yet");
    await row.locator(".av-count-approve").click();
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(d => d.meta.assetSplitOk && [d.meta.assetSplitOk.by, d.meta.assetSplitOk.total]), o.task3)).toEqual([o.me, 4]);
    await expect(row.locator(".av-split-badge")).toHaveText("Validated");
    await expect(row.locator(".av-count-approve")).toHaveCount(0);
    expect(await row.locator(".av-split-badge").getAttribute("title")).toContain("Validated by");
    /* the number changed afterwards: changed since, to approve again */
    await row.locator("input.count-input").click(); await page.keyboard.type("6"); await page.keyboard.press("Enter");
    await expect(row.locator(".av-split-badge")).toHaveText("Changed since validated");
    await expect(row.locator(".av-count-approve")).toHaveText("Approve again");
    /* a member sees none of it */
    expect(await page.evaluate(o => { const was = ME; ME = o.rina; renderDrawer(); const r = [document.querySelectorAll("#drawer .av-split-badge").length, document.querySelectorAll("#drawer .av-count-approve").length]; ME = was; renderDrawer(); return r; }, o)).toEqual([0, 0]);
  } finally {
    await page.evaluate(async o => { UI_LANG = "en"; closeDrawer(); WS.autoHide = Object.assign({}, WS.autoHide, { assets: { lead: "team" } }); await persistWS();
      await apiFetch("DELETE", "/api/tasks/" + o.task).catch(() => {}); if (o.task2) await apiFetch("DELETE", "/api/tasks/" + o.task2).catch(() => {}); if (o.task3) await apiFetch("DELETE", "/api/tasks/" + o.task3).catch(() => {}); await apiFetch("DELETE", "/api/members/" + o.rina).catch(() => {}); await apiFetch("DELETE", "/api/teams/" + o.team).catch(() => {}); }, o);
  }
});
