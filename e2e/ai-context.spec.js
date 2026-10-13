/* What AI Intelligence reads (Oct 2026): a snapshot made to be read accurately. Nothing the answers depend on is
   cut off — the server kept 12 000 characters and lost the people and the overdue list in a busy workspace; the
   lists come first and the long task list last; every open task is there (past the limit, in short form); dates
   are written out with the weekday; a task names all its people; everyone is listed, capacity set or not; teams
   and the work finished lately are there too. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the AI snapshot holds every open task, the dates written out, all the people, teams and recent work", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  /* a busy workspace, in the browser only: 90 open tasks, one overdue, one with two people, one finished last week */
  const r = await page.evaluate(() => {
    const stage = WS.workflow[1].id, closed = WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id, review = WS.workflow.find(s => s.kind === "review").id;
    PEOPLE.ctxnina = { id: "ctxnina", name: "Nina Nocap", role: "Designer", ini: "NN", active: true, teams: [], cap: 0 };
    TEAMS.push({ id: "tctx", name: "Context Team", lead: ME, color: "blue", sort: 99, archived: false });
    const mk = (i, o) => Object.assign({ id: "T-9" + String(i).padStart(3, "0"), title: "Ctx task " + i, description: "", proj: null, team: null, status: stage, prio: "medium", assignee: ME, assignees: [ME], reviewer: null, reviewers: [], dependencies: [], hidden: false, assetCount: 0, labels: [], due: 30 + i, span: 1, effort: 4, sort: i, tags: [], brief: null, custom: {}, versions: [], files: [], comments: [], activity: [], ago: 0, createdBy: ME, meta: {} }, o || {});
    const made = [];
    for (let i = 1; i <= 90; i++) made.push(mk(i));
    made[0] = mk(1, { title: "Overdue poster", due: -3, prio: "high" });
    made[1] = mk(2, { title: "Shared banner", assignee: ME, assignees: [ME, "ctxnina"], effort: 6, team: "tctx" });
    made[2] = mk(3, { title: "Review me", status: review, reviewer: "ctxnina", reviewers: ["ctxnina"], due: 2 });
    made.push(made.shift());   /* the overdue one last in the workspace's own order: only urgency puts it first */
    made.push(mk(500, { title: "Finished leaflet", status: closed, completedAt: new Date(Date.now() - 5 * 864e5).toISOString(), effort: 4, meta: { actualEffort: 6 } }));
    made.forEach(t => TASKS.push(t));
    const full = aiContext(60, AI_CTX_MAX), narrow = aiContext(18, AI_CTX_MAX - 7000);
    const out = { full, narrow, max: AI_CTX_MAX, ids: made.filter(t => !isClosed(t)).map(t => t.id), overdueDay: iso(-3) + " " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateOf(-3).getDay()], me: person(ME).name };
    /* a much busier one: 600 open tasks still fits, and says what it left out */
    for (let i = 600; i < 1200; i++) TASKS.push(mk(i, { title: "Bulk task number " + i + " with a longer title to fill the line" }));
    out.huge = aiContext(60, AI_CTX_MAX);
    for (let i = TASKS.length - 1; i >= 0; i--) if (/^T-9\d{3}$/.test(TASKS[i].id) || /^T-9\d{3,}$/.test(TASKS[i].id) || /^T-\d{4}$/.test(TASKS[i].id) && TASKS[i].title.startsWith("Bulk task")) TASKS.splice(i, 1);
    delete PEOPLE.ctxnina; TEAMS.splice(TEAMS.findIndex(t => t.id === "tctx"), 1);
    return out;
  });
  const ctx = r.full;
  expect(ctx.length).toBeLessThanOrEqual(r.max);
  /* every open task is there, in full or in short form — also when an attachment narrows the full list */
  for (const id of r.ids) { expect(ctx, id).toContain(id + " \""); expect(r.narrow, id + " (narrow)").toContain(id + " \""); }
  expect(ctx).toContain("MORE OPEN TASKS (short form):");
  /* the lists first, the long task list last */
  const at = s => ctx.indexOf(s);
  for (const s of ["TODAY: ", "OVERDUE (", "DUE WITHIN 7 DAYS (", "AWAITING REVIEW (", "PEOPLE (", "TEAMS:", "PROJECTS:", "FINISHED IN THE LAST 30 DAYS ("]) { expect(at(s), s).toBeGreaterThan(-1); expect(at(s), s + " comes before the task list").toBeLessThan(at("OPEN TASKS (")); }
  /* most urgent first: the overdue one leads the list */
  expect(ctx.slice(at("OPEN TASKS (")).split("\n")[1]).toMatch(/^- T-9001 "Overdue poster"/);
  /* dates written out with the weekday */
  expect(ctx).toContain("due=" + r.overdueDay + " (");
  expect(ctx).toMatch(/OVERDUE \(\d+\): .*T-9001 "Overdue poster" \(\d{4}-\d\d-\d\d \w{3}/);
  /* a task names all its people, its team; review names the reviewer */
  expect(ctx).toMatch(new RegExp("- T-9002 \"Shared banner\" .*assignees=" + r.me + ", Nina Nocap .*team=Context Team"));
  expect(ctx).toMatch(/AWAITING REVIEW \(\d+\): .*T-9003 "Review me" reviewers=Nina Nocap/);
  /* everyone, capacity set or not; their share of shared work */
  expect(ctx).toMatch(/- Nina Nocap \(Designer\) capacity=not set assigned=3h open=1 overdue=0 reviewing=1/);
  expect(ctx).toMatch(/- Context Team lead=.+ open=1/);
  /* work finished lately: when, who, the hours it took */
  expect(ctx).toMatch(/T-9500 "Finished leaflet" .* on \d{4}-\d\d-\d\d by .* est=4h logged=6h/);
  /* 600 more: past the 12 000 characters the server used to keep, still within the room, and it says how many it
     could not list */
  expect(r.huge.length).toBeGreaterThan(12000);
  expect(r.huge.length).toBeLessThanOrEqual(r.max);
  expect(r.huge).toMatch(/…and \d+ more open tasks not listed here\./);
  expect(r.huge.indexOf("PEOPLE (")).toBeLessThan(r.huge.indexOf("OPEN TASKS ("));
});
