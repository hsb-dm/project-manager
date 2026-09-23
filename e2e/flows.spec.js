/* The eight flows that must work on every release. They run against a clean production-mode
   workspace (no demo data), exactly like the live server. Order matters: later flows reuse the
   project, members and task created earlier, so the file runs serially. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path");
test.describe.configure({ mode: "serial" });

const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const RINA = { email: "rina@e2e.test", pw: "Rina!Reviewer-2026", name: "Rina Reviewer" };
const RED = path.join(__dirname, "fixtures", "red.png"), WIDE = path.join(__dirname, "fixtures", "wide.png");
let taskId = null;

async function signIn(page, who, target) {
  await page.goto(target || "/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/\bauth\b/);
  await ready(page);
}
/* the bundled demo data is in memory for a moment while the page boots; wait for the real workspace */
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);
const reload = async page => { await page.reload(); await ready(page); };
const api = (page, method, url, body) => page.evaluate(([m, u, b]) => apiFetch(m, u, b), [method, url, body]);

test("1 · sign in: wrong password is refused, right one opens Home", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#au_err")).toContainText(/incorrect/i);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Admin/ })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  /* the demo workspace must never appear on a clean install */
  expect(await page.evaluate(() => Object.keys(PEOPLE))).toEqual(["admin"]);
});

test("2 · create a project and a task; it survives a reload", async ({ page }) => {
  await signIn(page, ADMIN, "/projects");
  await expect(page).toHaveURL(/\/projects$/);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Campaign Q4");
  await page.locator("#modal .btn.primary").click();
  await expect(page.locator("body")).toContainText("Campaign Q4");
  const added = await api(page, "POST", "/api/members", { id: "rina", name: RINA.name, email: RINA.email, perm: "member", ini: "RR", teams: [] });
  await api(page, "POST", "/api/members/" + added.id + "/password", { password: RINA.pw });

  await page.goto("/tasks"); await ready(page);
  await page.getByRole("button", { name: "New task" }).first().click();
  await page.locator(".dr-title").click(); await page.keyboard.type("Banner promo Q4");
  await page.locator("#drFoot .btn.primary").last().click();
  await expect(page.locator(".toast").filter({ hasText: /Task created/ })).toBeVisible();
  await expect(page.locator("#drawer")).not.toHaveClass(/\bopen\b/);   /* v38 #5: panel closes */
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Banner promo Q4").id);
  await reload(page);
  await expect(page.locator("body")).toContainText("Banner promo Q4");
});

test("3 · move the task to another stage from its panel; clean URL keeps it open on refresh", async ({ page }) => {
  await signIn(page, ADMIN, "/tasks?task=" + taskId);
  await expect(page.locator("#drawer")).toHaveClass(/\bopen\b/);
  await expect(page).toHaveURL(new RegExp("task=" + taskId));
  await page.locator("#drawer").getByRole("button", { name: "In Progress", exact: true }).click();
  await expect.poll(() => page.evaluate(id => task(id).status, taskId)).toBe("progress");
  await reload(page);
  await expect(page.locator("#drawer")).toHaveClass(/\bopen\b/);
  expect(await page.evaluate(id => task(id).status, taskId)).toBe("progress");
});

test("4 · upload two versions at once; the asset shows at full size; removing it removes the version", async ({ page }) => {
  await signIn(page, ADMIN, "/tasks?task=" + taskId);
  await page.evaluate(() => { S.drawerTab = "versions"; renderDrawer(); uploadVersion(); });
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
  await (await chooser).setFiles([WIDE, RED]);
  await expect(page.locator("#uv_file")).toContainText(/2/);
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).versions.map(v => v.n), taskId)).toEqual([1, 2]);
  await page.evaluate(() => { S.drawerVer = 1; renderDrawer(); });
  const size = await page.locator(".canvas-img img").evaluate(i => [i.naturalWidth, i.clientWidth]);
  expect(size[1]).toBe(size[0]);                                      /* 100% zoom, not cropped */
  const idx = await page.evaluate(id => task(id).files.findIndex(f => f.name === "wide.png"), taskId);
  await page.evaluate(i => removeFile(i), idx);
  await page.locator("#modal .btn.danger").click();
  await expect.poll(() => page.evaluate(id => task(id).versions.map(v => v.n), taskId)).toEqual([2]);
  await expect.poll(() => api(page, "GET", "/api/tasks/" + taskId).then(t => t.versions.map(v => v.n))).toEqual([2]);   /* saved on the server */
  await reload(page);
  expect(await page.evaluate(id => JSON.stringify([task(id).versions.map(v => v.n), !!task(id)._slim]), taskId)).toBe(JSON.stringify([[2], false]));
});

test("5 · review: assignee submits, reviewer approves", async ({ browser, page }) => {
  await signIn(page, ADMIN, "/tasks?task=" + taskId);
  const rid = await page.evaluate(() => Object.keys(PEOPLE).find(id => PEOPLE[id].email === "rina@e2e.test"));
  await page.evaluate(([id, r]) => editTaskWith(task(id), t => { t.reviewer = r; t.reviewers = [r]; }), [taskId, rid]);
  await page.evaluate(() => { S.drawerTab = "versions"; renderDrawer(); });
  await page.locator("#drawer").getByRole("button", { name: "Submit for review" }).first().click();
  await expect.poll(() => page.evaluate(id => (WS.workflow.find(s => s.id === task(id).status) || {}).kind, taskId)).toBe("review");

  const rctx = await browser.newContext(); const rp = await rctx.newPage();
  await signIn(rp, RINA, "/tasks?task=" + taskId);
  await rp.evaluate(() => { S.drawerTab = "versions"; renderDrawer(); });
  await rp.locator("#drawer").getByRole("button", { name: "Approve", exact: true }).first().click();
  await expect.poll(() => rp.evaluate(id => task(id).versions.slice(-1)[0].state, taskId)).toBe("approved");
  await rctx.close();
});

test("6 · chat: a task link becomes the task card; refresh shows the newest message", async ({ page }) => {
  await signIn(page, ADMIN, "/messages");
  const rid = await page.evaluate(() => Object.keys(PEOPLE).find(id => PEOPLE[id].email === "rina@e2e.test"));
  const cid = (await api(page, "POST", "/api/messages/conversations", { type: "DM", members: [rid] })).id;
  await page.goto("/messages/" + cid); await ready(page);
  const link = await page.evaluate(id => deepLink("task", id), taskId);
  const box = page.locator("#msgComposer textarea, .msg-composer textarea, [contenteditable=true]").first();
  for (let i = 1; i <= 12; i++) { await box.fill("pesan " + i); await box.press("Enter"); }
  await box.fill("Tolong cek " + link + " ya"); await box.press("Enter");
  await expect(page.locator("#msgTimeline")).toContainText("Tolong cek ya");            /* URL gone from the text */
  await expect(page.locator("#msgTimeline")).toContainText("Banner promo Q4");          /* … the task card stays */
  await reload(page);
  await expect(page).toHaveURL(new RegExp("/messages/" + cid));
  const t = page.locator("#msgTimeline"); await expect(t).toContainText("Tolong cek ya");
  await expect.poll(() => t.evaluate(b => b.scrollHeight - b.scrollTop - b.clientHeight)).toBeLessThan(80);
});

test("7 · forgot password: email link → new password → sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.locator("#au_email").fill(RINA.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator(".auth-note")).toBeVisible();
  const outbox = path.join(require("os").tmpdir(), "zencrevia-e2e-" + (process.env.E2E_PORT || "3310"), "outbox");
  let token = null;
  await expect.poll(() => { const f = fs.existsSync(outbox) ? fs.readdirSync(outbox).filter(n => n.includes("rina@e2e.test")).sort().pop() : null; if (!f) return null; const raw = fs.readFileSync(path.join(outbox, f), "utf8"); const text = raw + (raw.match(/^[A-Za-z0-9+\/=\r\n]{60,}$/gm) || []).map(b => Buffer.from(b.replace(/\s/g, ""), "base64").toString("utf8")).join("\n"); const m = text.match(/reset=([a-f0-9]{64})/); token = m && m[1]; return token; }).not.toBeNull();
  await page.goto("/?reset=" + token);
  await expect(page).not.toHaveURL(/reset=/);                                            /* token leaves the address bar */
  RINA.pw = "Rina!NewPassword-2026";
  await page.locator("#rs_pw").fill(RINA.pw); await page.locator("#rs_pw2").fill(RINA.pw);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".auth-note")).toContainText("Password updated");
  await page.getByRole("button", { name: "Sign in" }).click();
  await signIn(page, RINA);
});

test("8 · self-registration: admin turns it on, a colleague signs up at /register", async ({ browser, page }) => {
  await signIn(page, ADMIN, "/settings/workspace");
  await page.locator("#ws_allowreg").click();
  await page.locator("#ws_code").fill("HSB2026");
  await page.locator("#ws_allowreg").locator("xpath=ancestor::section[1]").getByRole("button", { name: "Save" }).click();
  await expect.poll(() => api(page, "GET", "/api/bootstrap").then(d => d.ws.allowRegistration)).toBe(true);

  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto("/register");
  await expect(p.getByRole("button", { name: "Create account" })).toBeVisible();
  await p.locator("#au_name").fill("Budi Santoso");
  await p.locator("#au_email").fill("budi@e2e.test");
  await p.locator("#au_pw").fill("Budi!Passw0rd-2026");
  await p.locator(".pw-eye").click(); await expect(p.locator("#au_pw")).toHaveAttribute("type", "text");
  await p.locator("#au_code").fill("HSB2026");
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p.locator("body")).not.toHaveClass(/\bauth\b/);
  await expect(p).toHaveURL(/\/$/);
  await ctx.close();
});

test("extra · appearance is personal: admin dark does not make Rina dark", async ({ browser, page }) => {
  await signIn(page, ADMIN);
  await page.evaluate(() => setAppearance("dark"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await signIn(p, RINA, "/tasks?task=" + taskId);
  await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
  await ctx.close();
});
