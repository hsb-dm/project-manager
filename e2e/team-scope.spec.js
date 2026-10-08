/* A team's work is its own tasks and the other teams' tasks its people are assigned to. A Social Media
   task with a Creative designer on it stays Social Media's, and shows under Creative too: in the task
   filter, on the team's page and in its numbers, in Analytics and in a team report. For every team. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tag = Date.now().toString(36);
let x = {};

test("setup: Sosmed and Creative, a person in each, three tasks", async ({ page }) => {
  await signIn(page);
  x = await page.evaluate(async t => {
    const o = { sos: "tsos" + t, cre: "tcre" + t };
    await apiFetch("POST", "/api/teams", { id: o.sos, name: "Sosmed " + t, color: "blue" });
    await apiFetch("POST", "/api/teams", { id: o.cre, name: "Creative " + t, color: "pink" });
    for (const [k, name, teamId] of [["dina", "Dina Designer " + t, o.cre], ["sam", "Sam Social " + t, o.sos]]) {
      await apiFetch("POST", "/api/members", { name, email: k + "-" + t + "@e2e.test", perm: "member", cap: 40 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; o[k] = Object.keys(people).find(id => people[id].email === k + "-" + t + "@e2e.test");
      await apiFetch("POST", "/api/members/" + o[k] + "/team", { teamId, isPrimary: true });
    }
    const mk = async (title, team, who) => (await apiFetch("POST", "/api/tasks", { title: title + " " + t, status: WS.workflow[0].id, prio: "medium", team, assignee: who, assignees: [who], effort: 4 })).id;
    o.sosByDina = await mk("Sosmed post, designed by Creative", o.sos, o.dina);   /* Sosmed's, Creative works on it */
    o.sosBySam = await mk("Sosmed caption", o.sos, o.sam);                        /* Sosmed only */
    o.creBySam = await mk("Creative shoot, Sosmed helps", o.cre, o.sam);          /* Creative's, Sosmed works on it */
    await reloadAll(); return o;
  }, tag);
  expect(x.sosByDina && x.sosBySam && x.creBySam).toBeTruthy();
});

test("filtering Tasks by a team shows its own tasks and those its people are assigned to", async ({ page }) => {
  await signIn(page);
  const shown = team => page.evaluate(o => { S.filters = Object.assign({}, S.filters, { team: o.team }); S.taskScope = "all"; return filteredTasks().map(t => t.id).filter(id => [o.a, o.b, o.c].indexOf(id) >= 0).sort(); }, { team, a: x.sosByDina, b: x.sosBySam, c: x.creBySam });
  expect(await shown(x.cre)).toEqual([x.sosByDina, x.creBySam].sort());
  expect(await shown(x.sos)).toEqual([x.sosByDina, x.sosBySam, x.creBySam].sort());
  /* in the list: the Sosmed task under the Creative filter still says Sosmed */
  await page.evaluate(t => { S.filters = Object.assign({}, S.filters, { team: t }); S.taskScope = "all"; go("tasks", "list"); }, x.cre);
  await expect(page.locator("#content").getByText("Sosmed post, designed by Creative " + tag)).toBeVisible();
  await expect(page.locator("#content").getByText("Creative shoot, Sosmed helps " + tag)).toBeVisible();
  await expect(page.locator("#content").getByText("Sosmed " + tag, { exact: true })).toBeVisible();   /* its team badge */
  await expect(page.locator("#content").getByText("Sosmed caption " + tag)).toHaveCount(0);
  await expect(page.locator(".fchip", { hasText: "Creative " + tag })).toHaveAttribute("title", "Includes other teams' tasks assigned to its people");
  /* the task itself is unchanged */
  expect(await page.evaluate(id => task(id).team, x.sosByDina)).toBe(x.sos);
  await page.evaluate(() => { S.filters = Object.assign({}, S.filters, { team: "" }); });
});

test("a team's page counts the other teams' tasks its people work on, and says so", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => go("teams", id), x.cre);
  await expect(page.locator("#content")).toContainText("1 from other teams");
  await expect(page.locator("#content .team-scope-hint")).toBeVisible();
  for (const id of [x.sosByDina, x.creBySam]) await expect(page.locator('#content .task-row[data-id="' + id + '"]')).toBeVisible();
  await expect(page.locator('#content .task-row[data-id="' + x.sosBySam + '"]')).toHaveCount(0);
  expect(await page.evaluate(o => [teamWorkload(o.cre).open, teamWorkload(o.sos).open], x)).toEqual([2, 3]);
  /* in Indonesian */
  await page.evaluate(() => { setLanguage("id"); renderScreen(false); });
  await expect(page.locator("#content")).toContainText("1 dari tim lain");
  await expect(page.locator("#content .team-scope-hint")).toContainText("tetap milik timnya sendiri");
  await page.evaluate(() => setLanguage("en"));
  await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.people[ME].prefs || {}).language))).toBe("en");
});

test("a team's page shows its work as a timeline and a calendar too", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { S.teamView = "list"; go("teams", id); }, x.cre);
  const panel = page.locator("#content .team-tasks-panel");
  await expect(panel.locator(".team-view-seg button")).toHaveText(["List", "Timeline", "Calendar"]);
  /* timeline: only what concerns the team — here none of it in a project — and nothing else */
  await panel.locator('.team-view-seg button[data-team-view="timeline"]').click();
  const tl = page.locator("#content .team-tasks-panel #tlGrid");
  await expect(tl).toBeVisible();
  for (const id of [x.sosByDina, x.creBySam]) await expect(tl.locator('.tl-row[data-id="' + id + '"]')).toBeVisible();
  await expect(tl.locator('.tl-row[data-id="' + x.sosBySam + '"]')).toHaveCount(0);
  await expect(tl.locator(".tl-row.group")).toHaveCount(1);
  await expect(tl.locator(".tl-row.group")).toHaveText("No project");
  await expect(page.locator("#content .team-scope-hint")).toBeVisible();
  /* calendar: the same tasks on their days, without the task screen's filter controls */
  await page.locator('#content .team-view-seg button[data-team-view="calendar"]').click();
  const cal = page.locator("#content .team-tasks-panel");
  await expect(cal.locator(".calendar-toolbar")).toBeVisible();
  await expect(cal.getByText("Sosmed post, designed by Creative " + tag).first()).toBeVisible();
  await expect(cal.getByText("Creative shoot, Sosmed helps " + tag).first()).toBeVisible();
  await expect(cal.getByText("Sosmed caption " + tag)).toHaveCount(0);
  await expect(cal.locator('[data-tour="task-filters"]')).toHaveCount(0);
  /* another project's deadline is not this team's business */
  const other = await page.evaluate(async t => { const id = "punrel" + t; PROJECTS = (await apiFetch("POST", "/api/projects", { id, name: "Unrelated launch " + t, status: "active", owner: ME, dueDate: new Date().toISOString().slice(0, 10) })).map(hProject); renderScreen(false); return id; }, tag);
  try {
    await expect(cal.getByText("Creative shoot, Sosmed helps " + tag).first()).toBeVisible();
    await expect(cal.getByText("Unrelated launch " + tag)).toHaveCount(0);
  } finally { await page.evaluate(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {}), other); }
  /* the choice stays while moving between teams */
  await page.evaluate(id => go("teams", id), x.sos);
  await expect(page.locator('#content .team-view-seg button[data-team-view="calendar"]')).toHaveClass(/on/);
  await expect(page.locator("#content .team-tasks-panel").getByText("Sosmed caption " + tag).first()).toBeVisible();
  /* the tasks screen's own timeline is as it was: every live project, filters and all */
  await page.evaluate(() => { S.teamView = "list"; S.filters = Object.assign({}, S.filters, { team: "" }); S.taskScope = "all"; go("tasks", "timeline"); });
  await expect(page.locator("#content #tlGrid")).toBeVisible();
  await expect(page.locator('#content [data-tour="task-filters"]').first()).toBeVisible();
});

test("Analytics and a team report count them too", async ({ page }) => {
  await signIn(page);
  const byTeam = await page.evaluate(() => apiFetch("GET", "/api/analytics?weeks=4").then(a => a.byTeam));
  const cre = byTeam.find(t => t.id === x.cre), sos = byTeam.find(t => t.id === x.sos);
  expect([cre.open, sos.open]).toEqual([2, 3]);
  expect(cre.workloadHours).toBe(8);
  /* a report for one team: exportTasks keeps what concerns it */
  const reported = await page.evaluate(o => { EXPORT = { from: -3650, to: 3650, teams: [o.cre], projects: [], labels: [], people: [], status: "" }; const ids = exportTasks().map(t => t.id); EXPORT = null; return [o.sosByDina, o.sosBySam, o.creBySam].map(id => ids.indexOf(id) >= 0); }, x);
  expect(reported).toEqual([true, false, true]);
});

test("cleanup", async ({ page }) => {
  await signIn(page);
  await page.evaluate(o => Promise.all([o.sosByDina, o.sosBySam, o.creBySam].map(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}))).then(() => Promise.all([o.dina, o.sam].map(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {})))).then(() => Promise.all([o.sos, o.cre].map(id => apiFetch("DELETE", "/api/teams/" + id).catch(() => {})))), x);
});
