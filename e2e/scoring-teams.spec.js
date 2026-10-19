/* Smart Scoring on the Teams screen (Oct 2026, src/scoring-teams.js, server/scoring-teams.js). With Smart Scoring on,
   small bars sit right under the utilization (effort-hours) bar: on each team card, as the team's strip on its own page,
   and under each person's workload bar — points done against points planned over the last 4 weeks, and estimate
   accuracy ("no data yet" until something is measured). Each bar explains itself on hover and on a tap, without
   opening the team. A member sees the team bars and their own row's bars, not a colleague's — until the admin chooses
   "Everyone in the workspace" in Settings → Smart Scoring, which reaches the member's open tab by itself; chosen back,
   the colleague's bars go again. Redrawn, the bars are there at once and a background refresh paints nothing that did
   not change. At phone width nothing runs off the page. Off, the Teams screen is exactly as it was. Everything made
   here is removed and the settings are put back. The server side: tests/scoring-teams.test.js. */
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
const setScoring = (page, patch) => page.evaluate(async patch => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings, next = JSON.parse(JSON.stringify(cur));
  (function merge(a, b) { Object.keys(b).forEach(k => { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") merge(a[k], b[k]); else a[k] = b[k]; }); })(next, patch);
  const r = await apiFetch("PUT", "/api/scoring/settings", { settings: next, configVersion: cur.configVersion }); WS.scoring = r.settings; return r.settings; }, patch);

test("the Teams bars sit under the utilization bars, explain themselves, follow who may see them and the admin's setting, never blink, fit a phone; off, nothing changes", async ({ browser }) => {
  test.setTimeout(150000);
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  await signIn(page, ADMIN);
  const original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
  expect(original.enabled).toBe(false);
  /* the Teams screen as it is with Smart Scoring off, before anything is made */
  await page.evaluate(() => go("teams"));
  await expect(page.locator("#content h1")).toHaveText("Teams");
  const before = await page.evaluate(() => document.getElementById("content").innerHTML);
  const tag = Date.now().toString(36), MEMBER = { email: "bars-" + tag + "@e2e.test", pw: "Bars!Member-2026" };
  let o = {}, ctx = null;
  try {
    o = await page.evaluate(async x => {
      const o = { tasks: [], people: [] };
      const add = async (name, email) => { await apiFetch("POST", "/api/members", { name: name + " " + x.tag, email, perm: "member", cap: 40 }); const ppl = (await apiFetch("GET", "/api/bootstrap")).people; const id = Object.keys(ppl).find(k => ppl[k].email === email); o.people.push(id); return id; };
      o.member = await add("Mila Bars", x.email); await apiFetch("POST", "/api/members/" + o.member + "/password", { password: x.pw });
      o.colleague = await add("Coco Bars", "coco-" + x.tag + "@e2e.test");
      o.team = "bars_" + x.tag;
      await apiFetch("POST", "/api/teams", { id: o.team, name: "Bars " + x.tag, color: "green", icon: "palette", lead: null, description: "" });
      for (const id of [o.member, o.colleague]) await apiFetch("POST", "/api/members/" + id + "/team", { teamId: o.team, isPrimary: true });
      await reloadAll();
      return o;
    }, { tag, email: MEMBER.email, pw: MEMBER.pw });
    await setScoring(page, { enabled: true, modules: { story: { on: true } } });
    o.tasks = await page.evaluate(async o => {
      const open = WS.workflow.find(s => s.kind === "queue").id, closed = WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id;
      const due = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
      const make = async (title, who, pts, n) => { const t = await apiFetch("POST", "/api/tasks", { title: title + " " + o.team, status: open, prio: "medium", team: o.team, assignee: who, assignees: [who], reviewer: ME, reviewers: [ME], dueDate: due(n) }); o.tasks.push(t.id);
        await apiFetch("PUT", "/api/tasks/" + t.id + "/scoring/story", { value: pts, reason: "e2e", rev: 0 }); return t.id; };
      const done = await make("Feed post", o.member, 5, 2);
      await make("Logo concept", o.colleague, 3, 1);
      await apiFetch("POST", "/api/tasks/" + done + "/move", { type: "MOVE_TASK_STATUS", toStatusId: closed });
      await reloadAll();
      return o.tasks;
    }, o);

    /* the Teams screen: under the team card's utilization bar */
    await page.evaluate(() => { SCR_TB.at = 0; go("teams"); });
    const card = page.locator('.tcard[data-team="' + o.team + '"]'), block = card.locator('[data-scr-tb="team:' + o.team + '"]');
    await expect(block.locator('[data-bar="story"] .scr-tb-n')).toHaveText("5 / 8 pts · 63%");
    expect(await block.evaluate(el => el.previousElementSibling && el.previousElementSibling.classList.contains("track") && !!el.closest(".wl"))).toBe(true);
    await expect(block.locator(".scr-tb-h")).toContainText("Smart Scoring · last 4 weeks");
    await expect(block.locator('[data-bar="accuracy"] .scr-tb-n')).toHaveText("no data yet");
    await expect(block.locator('[data-bar="weighted"]'), "a module that is off has no bar").toHaveCount(0);
    /* it explains itself: on hover, and on a tap that does not open the team */
    await expect(block.locator('[data-bar="story"]')).toHaveAttribute("title", /story points of this team's tasks due in the last 4 weeks/);
    await block.locator(".scr-tb-i").click();
    await expect(block.locator(".scr-tb-why")).toContainText("Operational figures for learning, not a ranking.");
    expect(await page.evaluate(() => S.teamId || null)).toBe(null);
    /* each person's workload row, the admin seeing everyone */
    await expect(page.locator('[data-scr-tb="person:' + o.member + '"] [data-bar="story"] .scr-tb-n')).toHaveText("5 / 5 pts · 100%");
    await expect(page.locator('[data-scr-tb="person:' + o.colleague + '"] [data-bar="story"] .scr-tb-n')).toHaveText("0 / 3 pts · 0%");

    /* the team's page: its strip under the figures, and each member's bars under their workload bar */
    await page.evaluate(t => go("teams", t), o.team);
    const strip = page.locator(".scr-tb-panel");
    await expect(strip.locator('[data-scr-tb="team:' + o.team + '"] [data-bar="story"] .scr-tb-n')).toHaveText("5 / 8 pts · 63%");
    expect(await strip.evaluate(el => el.previousElementSibling.classList.contains("team-kpis"))).toBe(true);
    const mineRow = page.locator('.wl:has([data-scr-tb="person:' + o.member + '"])');
    await expect(mineRow.locator('[data-bar="story"] .scr-tb-n')).toHaveText("5 / 5 pts · 100%");
    expect(await mineRow.locator(".scr-tb").evaluate(el => el.previousElementSibling.classList.contains("track"))).toBe(true);
    /* nothing blinks: a redraw has the bars at once, a background refresh with the same numbers paints nothing */
    expect(await page.evaluate(t => { renderScreen(false); return document.querySelector('[data-scr-tb="team:' + t + '"] [data-bar="story"] .scr-tb-n').textContent; }, o.team)).toBe("5 / 8 pts · 63%");
    await page.evaluate(t => { window.__scrTbNode = document.querySelector('[data-scr-tb="team:' + t + '"] .scr-tb-row'); SCR_TB.at = 0; scrTbLoad(true); }, o.team);
    await page.waitForFunction(() => !SCR_TB.loading && SCR_TB.at > 0);
    expect(await page.evaluate(t => document.querySelector('[data-scr-tb="team:' + t + '"] .scr-tb-row') === window.__scrTbNode, o.team), "the same element: not painted again").toBe(true);
    /* in Indonesian */
    await page.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(strip.locator(".scr-tb-h")).toContainText("Smart Scoring · 4 minggu terakhir");
    await expect(strip.locator('[data-bar="story"] .scr-tb-n')).toHaveText("5 / 8 poin · 63%");
    await expect(strip.locator('[data-bar="accuracy"] .scr-tb-n')).toHaveText("belum ada data");
    await page.evaluate(() => { setLanguage("en"); renderScreen(false); });

    /* the member: the team's bars and their own row's, not the colleague's */
    ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    const mp = await ctx.newPage();
    await signIn(mp, MEMBER);
    await mp.evaluate(() => go("teams"));
    await expect(mp.locator('.tcard[data-team="' + o.team + '"] [data-bar="story"] .scr-tb-n')).toHaveText("5 / 8 pts · 63%");
    await mp.evaluate(t => go("teams", t), o.team);
    await expect(mp.locator('[data-scr-tb="person:' + o.member + '"] [data-bar="story"] .scr-tb-n')).toHaveText("5 / 5 pts · 100%");
    await expect(mp.locator('.wl[onclick*="' + o.colleague + '"]'), "the colleague's workload row is there").toHaveCount(1);
    await expect(mp.locator('[data-scr-tb="person:' + o.colleague + '"]'), "but not their bars").toHaveCount(0);

    /* the admin lets everyone see everyone's bars, in Settings → Smart Scoring: the member's open tab follows */
    await page.evaluate(() => go("settings", "scoring"));
    const section = page.locator("#content section.panel", { has: page.locator("h2", { hasText: "Teams screen" }) });
    await expect(section.locator("#sc_tm_bars")).toHaveValue("self_and_leads");
    await expect(section).toContainText("people may compare and rank one another");
    await section.locator("#sc_tm_bars").selectOption("everyone");
    await section.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await expect(mp.locator('[data-scr-tb="person:' + o.colleague + '"] [data-bar="story"] .scr-tb-n')).toHaveText("0 / 3 pts · 0%", { timeout: 15000 });
    await expect(page.locator("#scAudit")).toContainText("Who sees each person's bars on Teams");
    await expect(page.locator("#scAudit")).toContainText("Everyone in the workspace");
    /* and back: the colleague's bars go again */
    await page.evaluate(() => go("settings", "scoring"));
    await section.locator("#sc_tm_bars").selectOption("self_and_leads");
    await section.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await expect(mp.locator('[data-scr-tb="person:' + o.colleague + '"]')).toHaveCount(0, { timeout: 15000 });
    await expect(mp.locator('[data-scr-tb="person:' + o.member + '"] [data-bar="story"]')).toHaveCount(1);

    /* at phone width: the card's bars fit, nothing runs off the page */
    await mp.setViewportSize({ width: 390, height: 844 });
    await mp.evaluate(() => go("teams"));
    const phoneBlock = mp.locator('.tcard[data-team="' + o.team + '"] .scr-tb');
    await expect(phoneBlock.locator('[data-bar="story"] .scr-tb-n')).toHaveText("5 / 8 pts · 63%");
    expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    for (const el of await phoneBlock.locator(".scr-tb-row").all()) { const b = await el.boundingBox(); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(391); }
    await mp.evaluate(t => go("teams", t), o.team);
    await expect(mp.locator(".scr-tb-panel [data-bar=\"story\"] .scr-tb-n")).toHaveText("5 / 8 pts · 63%");
    expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    /* off: no bars anywhere */
    await setScoring(page, { enabled: false });
    await page.evaluate(() => go("teams"));
    await expect(page.locator('.tcard[data-team="' + o.team + '"]')).toBeVisible();
    await expect(page.locator(".scr-tb, .scr-tb-panel")).toHaveCount(0);
    expect(await page.locator('.tcard[data-team="' + o.team + '"] .wl > div').evaluate(el => el.children.length), "the card's bar is alone again").toBe(1);
  } finally {
    if (ctx) await ctx.close();
    await page.evaluate(async x => { if (UI_LANG !== "en") setLanguage("en");
      for (const id of x.o.tasks || []) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      if (x.o.team) await apiFetch("DELETE", "/api/teams/" + x.o.team).catch(() => {});
      for (const id of x.o.people || []) await apiFetch("DELETE", "/api/members/" + id).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings"); const r = await apiFetch("PUT", "/api/scoring/settings", { settings: x.original, configVersion: cur.settings.configVersion }); WS.scoring = r.settings;
      await reloadAll(); }, { o, original });
  }
  const back = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
  expect([back.enabled, back.modules.story.on, back.teams.memberBars]).toEqual([false, original.modules.story.on, "self_and_leads"]);
  /* with everything removed and Smart Scoring off, the Teams screen is exactly as it was */
  await page.evaluate(() => go("teams"));
  await expect(page.locator("#content h1")).toHaveText("Teams");
  expect(await page.evaluate(() => document.getElementById("content").innerHTML)).toBe(before);
  await page.close();
});
