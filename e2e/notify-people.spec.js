/* Everyone a task concerns hears what happens to it — in the app and by email: its assignees, its
   reviewers and its owner (who created it). It used to be one role each: a stage change told nobody
   (or, on the board, the first reviewer), an approval or a revision only the assignee, a new version or
   a file only the reviewers, and the owner nothing at all. Someone made a reviewer is told so. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path"), os = require("os");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tag = Date.now().toString(36);
const DOER = { name: "Doer " + tag, email: "doer-" + tag + "@e2e.test", pw: "Doer!Notify-2026x" };
const CHECKER = { name: "Checker " + tag, email: "checker-" + tag + "@e2e.test", pw: "Checker!Notify-2026x" };
let ids = {};
/* the kinds of this task's notifications someone has, oldest first */
const kinds = page => page.evaluate(t => apiFetch("GET", "/api/bootstrap").then(d => d.notifs.filter(n => n.t === t).map(n => n.k).reverse()), ids.task);
/* the subjects of the emails someone was sent about this task */
const OUTBOX = path.join(os.tmpdir(), "zencrevia-e2e-" + (process.env.E2E_PORT || "3310"), "outbox");
function mails(email, title) {
  if (!fs.existsSync(OUTBOX)) return [];
  return fs.readdirSync(OUTBOX).filter(f => f.includes(email.replace(/[^a-z0-9@.]/gi, "_"))).map(f => {
    const raw = fs.readFileSync(path.join(OUTBOX, f), "utf8");
    const text = raw.split(/\r?\n\r?\n/).map(part => { try { return Buffer.from(part.replace(/\s+/g, ""), "base64").toString("utf8"); } catch { return ""; } }).join("\n") + raw;
    const subj = (raw.match(/^Subject: (.*)$/m) || [])[1] || "";
    const dec = /=\?UTF-8\?B\?([^?]+)\?=/i.exec(subj); return { subject: dec ? Buffer.from(dec[1], "base64").toString("utf8") : subj, text };
  }).filter(m => m.text.includes(title));
}
let admin, doer, checker;

test("setup: an owner (admin), an assignee and a reviewer", async ({ browser }) => {
  admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN);
  ids = await admin.evaluate(async o => {
    const out = {};
    for (const [k, p] of [["doer", o.doer], ["checker", o.checker]]) {
      await apiFetch("POST", "/api/members", { name: p.name, email: p.email, perm: "member", cap: 40 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; out[k] = Object.keys(people).find(id => people[id].email === p.email);
      await apiFetch("POST", "/api/members/" + out[k] + "/password", { password: p.pw });
    }
    await reloadAll(); out.owner = ME; return out;
  }, { doer: DOER, checker: CHECKER });
  doer = await (await browser.newContext()).newPage(); await signIn(doer, DOER);
  checker = await (await browser.newContext()).newPage(); await signIn(checker, CHECKER);
});

test("a new task: the assignee is assigned it, the reviewer is asked to review it", async () => {
  ids.task = await admin.evaluate(async x => {
    newTaskModal({}); const tk = task(S.drawerTask);
    /* the owner here is not also a reviewer (a new task makes its creator one by default) */
    tk.title = "Notify people " + x.tag; editDraft(tk, "assignee", x.doer); editDraft(tk, "reviewer", x.checker); tk.reviewers = [x.checker];
    await createDraft();
    for (let i = 0; i < 40; i++) { const made = TASKS.find(t => !t._draft && t.title === "Notify people " + x.tag); if (made && /^T-/.test(made.id)) return made.id; await new Promise(r => setTimeout(r, 100)); }
    return null;
  }, { tag, doer: ids.doer, checker: ids.checker });
  expect(ids.task).toMatch(/^T-/);
  expect(await admin.evaluate(id => task(id).createdBy, ids.task)).toBe(ids.owner);
  await expect.poll(() => kinds(doer)).toEqual(["assigned"]);
  await expect.poll(() => kinds(checker)).toEqual(["reviewer"]);
  /* in words, both languages */
  expect(await checker.evaluate(() => [ntext("reviewer"), (UI_LANG = "id", ntext("reviewer")), (UI_LANG = "en")][0])).toBe("{who} asked you to review “{t}”");
  expect(await checker.evaluate(() => { UI_LANG = "id"; const r = ntext("reviewer"); UI_LANG = "en"; return r; })).toBe("{who} memintamu me-review “{t}”");
  await expect.poll(() => mails(CHECKER.email, "Notify people " + tag).map(m => m.subject).join("|")).toContain("asked you to review");
});

test("the assignee moves it: the owner and the reviewer hear of it, the assignee does not", async () => {
  await doer.reload(); await ready(doer);
  const stage = await doer.evaluate(() => (WS.workflow.find(s => s.kind === "work") || WS.workflow[1]).id);
  await doer.evaluate(x => new Promise(r => setStatus(x.id, x.stage, r)), { id: ids.task, stage });
  await expect.poll(() => kinds(admin)).toEqual(["status"]);
  await expect.poll(() => kinds(checker)).toEqual(["reviewer", "status"]);
  expect(await kinds(doer)).toEqual(["assigned"]);
  /* a plain stage change is not emailed unless the workspace turns that on (Settings → Notifications) */
  expect(await admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.ws.notifPrefs || {}).status))).toBe(false);
  await admin.waitForTimeout(500);
  expect(mails(ADMIN.email, "Notify people " + tag).map(m => m.subject).join("|")).not.toContain("moved");
});

test("the assignee submits a version for review: the reviewer is asked to review it (and emailed), the owner hears of it", async () => {
  await doer.evaluate(id => { openTask(id); submitReview(); }, ids.task);
  await expect.poll(() => kinds(checker)).toEqual(["reviewer", "status", "upload", "review"]);
  await expect.poll(() => kinds(admin)).toEqual(["status", "upload", "status"]);
  expect(await kinds(doer)).toEqual(["assigned"]);
  await expect.poll(() => mails(CHECKER.email, "Notify people " + tag).map(m => m.subject).join("|")).toContain("for your review");
  await expect.poll(() => mails(ADMIN.email, "Notify people " + tag).map(m => m.subject).join("|")).toContain("uploaded a new version");
  expect(await checker.evaluate(() => { UI_LANG = "id"; const r = ntext("review"); UI_LANG = "en"; return r; })).toBe("{who} mengirim “{t}” untuk kamu review");
});

test("the reviewer approves it: the assignee and the owner hear of it", async () => {
  await checker.reload(); await ready(checker);
  await checker.evaluate(id => { openTask(id); approveTask(); }, ids.task);
  await expect.poll(() => kinds(doer)).toEqual(["assigned", "approved"]);
  await expect.poll(() => kinds(admin)).toEqual(["status", "upload", "status", "approved"]);
  await expect.poll(() => mails(ADMIN.email, "Notify people " + tag).map(m => m.subject).join("|")).toContain("approved");
});

test("a comment by the assignee reaches the owner and the reviewer", async () => {
  await doer.reload(); await ready(doer);
  await doer.evaluate(id => { openTask(id); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, ids.task);
  await doer.locator("#cmtText").fill("Done, have a look " + tag);
  await doer.evaluate(() => postComment());
  await expect.poll(() => kinds(admin)).toContain("comment");
  await expect.poll(() => kinds(checker)).toContain("comment");
  expect(await kinds(doer)).not.toContain("comment");
});

test("someone added as a reviewer later is told they will review it", async () => {
  const third = await admin.evaluate(async t => { await apiFetch("POST", "/api/members", { name: "Late Reviewer " + t, email: "late-" + t + "@e2e.test", perm: "member", cap: 40 }); await reloadAll(); return Object.keys(PEOPLE).find(k => PEOPLE[k].email === "late-" + t + "@e2e.test"); }, tag);
  ids.third = third;
  await admin.evaluate(x => { openTask(x.id); addPerson("reviewers", x.third); }, { id: ids.task, third });
  await expect.poll(() => mails("late-" + tag + "@e2e.test", "Notify people " + tag).map(m => m.subject).join("|")).toContain("asked you to review");
});

test("cleanup", async () => {
  await admin.evaluate(x => Promise.all([apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {})].concat([x.doer, x.checker, x.third].filter(Boolean).map(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {})))), ids);
  await Promise.all([admin, doer, checker].map(p => p.context().close()));
});
