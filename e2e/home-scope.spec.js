/* Home cards (Oct 2026). Needs your review is personal: the work I am named to review, my own work waiting for its
   review, and — with nobody named — the work of a team I lead; not everything an admin is allowed to review. Every other card shows Mine or All, Mine
   first; the choice is remembered per card, for the person. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("Needs your review is mine only; the other cards show Mine or All, Mine first", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36);
  /* what is made is recorded as it is made, so it is cleaned up even when making it fails part way */
  const setup = () => page.evaluate(async tag => {
    const out = window.__scope = { tasks: {}, teams: ["tmine" + tag, "tother" + tag], projects: ["pmine" + tag, "ptheirs" + tag], dina: null };
    await apiFetch("POST", "/api/members", { id: "dina" + tag, name: "Dina Scope", email: "dina." + tag + "@e2e.test", perm: "member", ini: "DS", teams: [] });
    await reloadAll();
    const dina = out.dina = Object.keys(PEOPLE).find(k => PEOPLE[k].email === "dina." + tag + "@e2e.test");
    await apiFetch("POST", "/api/teams", { id: out.teams[0], name: "Mine team " + tag, color: "blue", lead: ME, members: [ME, dina] });
    await apiFetch("POST", "/api/teams", { id: out.teams[1], name: "Other team " + tag, color: "orange", lead: dina, members: [dina] });
    for (const [who, tid] of [[ME, out.teams[0]], [dina, out.teams[0]], [dina, out.teams[1]]]) await apiFetch("POST", "/api/members/" + who + "/team", { teamId: tid }).catch(() => {});
    await apiFetch("POST", "/api/projects", { id: out.projects[0], name: "Scope proj mine " + tag, status: "active", owner: ME });
    await apiFetch("POST", "/api/projects", { id: out.projects[1], name: "Scope proj theirs " + tag, status: "active", owner: dina, team: [dina] });
    const rv = WS.workflow.find(s => s.kind === "review").id, s0 = WS.workflow[1].id, tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    /* due in a month unless said otherwise: the deadlines card shows six, and only the two meant for it should be there */
    const far = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const mk = async (k, o) => { const d = await apiFetch("POST", "/api/tasks", Object.assign({ title: k + " " + tag, prio: "high", dueDate: far }, o)); out.tasks[k] = d.id; };
    await mk("Scope review mine", { status: rv, assignee: dina, assignees: [dina], reviewer: ME, reviewers: [ME] });
    await mk("Scope review theirs", { status: rv, assignee: dina, assignees: [dina], reviewer: dina, reviewers: [dina] });
    await mk("Scope review my work", { status: rv, assignee: ME, assignees: [ME], reviewer: dina, reviewers: [dina] });
    /* with nobody named — possible where the stage does not require a reviewer; here the name is taken off below */
    await mk("Scope review lead", { status: rv, team: out.teams[0], assignee: dina, assignees: [dina], reviewer: dina, reviewers: [dina] });
    await mk("Scope review nobody", { status: rv, team: out.teams[1], assignee: dina, assignees: [dina], reviewer: dina, reviewers: [dina] });
    await mk("Scope due mine", { status: s0, assignee: ME, assignees: [ME], dueDate: tomorrow });
    await mk("Scope due theirs", { status: s0, assignee: dina, assignees: [dina], dueDate: tomorrow });
    return out;
  }, tag);
  /* what Dina made: the admin created them through the API, so they are marked as hers here; and two reviews have
     nobody named */
  let made = null;
  const asDina = () => page.evaluate(m => { ["Scope review theirs", "Scope review lead", "Scope review nobody", "Scope due theirs"].forEach(k => { const t = task(m.tasks[k]); if (t) t.createdBy = m.dina; }); ["Scope review lead", "Scope review nobody"].forEach(k => { const t = task(m.tasks[k]); if (t) { t.reviewer = null; t.reviewers = []; } }); }, made);
  const home = async () => { await page.evaluate(() => { const p = myPrefs(); delete p.dashScope; saveMyPrefs(); }); await page.reload(); await ready(page); await asDina(); await page.evaluate(() => { S.railFilter = null; go("home"); }); };
  const card = k => page.locator('#content [data-sec="' + k + '"]');
  const scopeOn = k => card(k).locator(".dash-scope button.on");
  const pick = (k, label) => card(k).locator(".dash-scope button", { hasText: label }).click();
  try {
    made = await setup();
    await home();
    /* Needs your review: mine to review, my own work in review, and my team's with nobody named — not Dina's,
       not a team I do not lead */
    const review = card("review");
    await expect(review.getByText("Scope review mine " + tag)).toBeVisible();
    await expect(review.getByText("Scope review lead " + tag)).toBeVisible();
    await expect(review.getByText("Scope review my work " + tag), "my own work waiting for its review").toBeVisible();
    await expect(review.getByText("Scope review theirs " + tag)).toHaveCount(0);
    await expect(review.getByText("Scope review nobody " + tag)).toHaveCount(0);
    await expect(review.locator(".dash-scope"), "personal: no Mine / All").toHaveCount(0);
    /* empty, the dark card's message can be read: light text on the dark card (it used to be dark on dark) */
    const ink = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = panel("x", 0, emptyBox("Nothing waiting for your review", ""), null, null, I.eye, "ink"); document.body.appendChild(d); const lum = c => { const m = c.match(/[\d.]+/g).map(Number), k = /^color\(/.test(c) ? 1 : 255; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / k; }; const r = { text: lum(getComputedStyle(d.querySelector(".empty .h")).color), bg: lum(getComputedStyle(d.querySelector(".panel")).backgroundColor) }; d.remove(); return r; });
    expect(Math.abs(ink.text - ink.bg), "the empty message stands out from the card").toBeGreaterThan(0.5);
    const n = await page.evaluate(() => openTasks().filter(t => isReview(t) && reviewMine(t)).length);
    await expect(page.locator("#content .pagehead .muted")).toContainText(n + " waiting for your review");
    expect(await page.evaluate(m => reviewMine(task(m.tasks["Scope review theirs"])), made), "an admin may review it, but it is not theirs to").toBe(false);
    /* every other card: Mine / All, Mine on */
    for (const k of ["rail", "priorities", "workload", "projects", "deadlines", "requests", "activity"]) await expect(scopeOn(k), k).toHaveText("Mine");
    /* Upcoming deadlines */
    const dl = card("deadlines");
    await expect(dl.getByText("Scope due mine " + tag)).toBeVisible();
    await expect(dl.getByText("Scope due theirs " + tag)).toHaveCount(0);
    await pick("deadlines", "All");
    await expect(dl.getByText("Scope due theirs " + tag)).toBeVisible();
    await expect(scopeOn("deadlines")).toHaveText("All");
    await expect(scopeOn("projects"), "per card: the others stay Mine").toHaveText("Mine");
    /* Active projects */
    const pj = card("projects");
    await expect(pj.getByText("Scope proj mine " + tag)).toBeVisible();
    await expect(pj.getByText("Scope proj theirs " + tag)).toHaveCount(0);
    await pick("projects", "All");
    await expect(pj.getByText("Scope proj theirs " + tag)).toBeVisible();
    /* Team workload */
    const wl = card("workload");
    await expect(wl.getByText("Mine team " + tag)).toBeVisible();
    await expect(wl.getByText("Other team " + tag)).toHaveCount(0);
    await pick("workload", "All");
    await expect(wl.getByText("Other team " + tag)).toBeVisible();
    /* Workflow pipeline: the count follows */
    const counts = await page.evaluate(() => ({ mine: visibleBoardTasks().filter(t => involved(t, ME)).length, all: visibleBoardTasks().length }));
    expect(counts.all).toBeGreaterThan(counts.mine);
    await expect(card("rail").locator(".rail-head .sub")).toHaveText(counts.mine + " tasks");
    await pick("rail", "All");
    await expect(card("rail").locator(".rail-head .sub")).toHaveText(counts.all + " tasks");
    /* the card's own controls (shown on hover) sit after the switch, not over it */
    await card("rail").hover();
    const railBoxes = await card("rail").evaluate(c => { const s = c.querySelector(".dash-scope").getBoundingClientRect(), d = c.querySelector(".dctl").getBoundingClientRect(); return { segRight: s.right, ctlLeft: d.left, sameRow: Math.abs((s.top + s.bottom) / 2 - (d.top + d.bottom) / 2) < 6 }; });
    expect(railBoxes.segRight, "Mine / All ends before the controls start").toBeLessThanOrEqual(railBoxes.ctlLeft);
    expect(railBoxes.sameRow).toBe(true);
    /* My priorities → Priorities, with everyone's work */
    await pick("priorities", "All");
    await expect(card("priorities").locator(".panel-head h2")).toHaveText("Priorities");
    /* remembered for the person, through a reload */
    await page.reload(); await ready(page); await page.evaluate(() => go("home"));
    await expect(scopeOn("deadlines")).toHaveText("All");
    await expect(scopeOn("projects")).toHaveText("All");
    await expect(scopeOn("requests")).toHaveText("Mine");
    expect(await page.evaluate(() => myPrefs().dashScope)).toMatchObject({ deadlines: "all", projects: "all", workload: "all", rail: "all", priorities: "all" });
    /* an empty Mine offers Show all */
    const reqEmpty = await card("requests").locator(".empty").count();
    if (reqEmpty) { await card("requests").getByRole("button", { name: "Show all" }).click(); await expect(scopeOn("requests")).toHaveText("All"); }
    /* on a phone the switch fits in the card's head */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => go("home"));
    for (const k of ["deadlines", "projects", "activity"]) {
      const fit = await card(k).evaluate(c => { const s = c.querySelector(".dash-scope").getBoundingClientRect(), b = c.getBoundingClientRect(); return s.right <= b.right + 0.5 && s.left >= b.left - 0.5 && s.height < 40; });
      expect(fit, k + ": the switch stays inside the card, on one line").toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    /* Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(card("deadlines").locator(".dash-scope button").first()).toHaveText("Milik saya");
    await expect(card("deadlines").locator(".dash-scope button").nth(1)).toHaveText("Semua");
    await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
  } finally {
    /* a reload forgets window.__scope; what setup returned is passed back */
    await page.evaluate(async m0 => {
      const m = m0 || window.__scope; if (!m) return;
      const p = myPrefs(); delete p.dashScope; saveMyPrefs();
      for (const id of Object.values(m.tasks)) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      for (const id of m.projects) await apiFetch("DELETE", "/api/projects/" + id).catch(() => {});
      for (const id of m.teams) await apiFetch("DELETE", "/api/teams/" + id).catch(() => {});
      if (m.dina) await apiFetch("DELETE", "/api/members/" + m.dina).catch(() => {});
    }, made);
  }
});
