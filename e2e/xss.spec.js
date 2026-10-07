/* A value with quotes or markup in it — a link, a file name, a group name, a task title — is shown as
   text and never runs. Before the audit (Oct 2026) a link like https://x/'),alert(1),(' ran when
   its Open button was pressed: attr() turned ' into &#39;, and the page decoded it back before the
   click handler ran. Values in handlers now go through jsq(). The server's side: tests/security-audit.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.route(/^https:\/\/evil\.example\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>x</title>" }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const pwned = page => page.evaluate(() => !!(window.__pwned || window.__pwned2 || window.__pwned3 || window.__pwned4));

test("a value in a click handler arrives exactly as it is", async ({ page }) => {
  await signIn(page);
  const value = `a'b"c\\d</script><img src=x onerror="window.__pwned=1">'),window.__pwned=1,('`;
  const got = await page.evaluate(v => { const b = document.createElement("button"); document.body.appendChild(b); b.outerHTML = '<button id="jsqProbe" onclick="window.__got=' + jsq(v) + '">x</button>'; document.getElementById("jsqProbe").click(); const r = window.__got; document.getElementById("jsqProbe").remove(); return r; }, value);
  expect(got).toBe(value);
  expect(await pwned(page)).toBe(false);
});

test("a link with quotes in it opens the link popup, and runs nothing", async ({ page }) => {
  await signIn(page);
  const url = "https://evil.example/'),window.__pwned=1,('";
  const tid = await page.evaluate(async u => {
    const d = await apiFetch("POST", "/api/tasks", { title: "XSS link " + Date.now(), status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] });
    const t = hTask(d); TASKS.push(t); await editTaskWith(t, x => { x.files.push(F("evil.png", "link", "link", "—", 0, u)); }); return t.id;
  }, url);
  try {
    await page.evaluate(id => { openTask(id); S.drawerTab = "files"; renderDrawer(); }, tid);
    const btn = page.locator('#drawer [onclick*="openExternal"]').first();
    await expect(btn).toBeAttached();
    await btn.evaluate(b => b.click());
    await expect(page.locator("#modal")).toContainText("evil.example/'),window.__pwned=1,('");
    expect(await pwned(page)).toBe(false);
    await page.evaluate(() => closeModal());
  } finally { await page.evaluate(id => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, tid); }
});

test("names and titles in confirmations, chat and pages are text", async ({ page }) => {
  await signIn(page);
  const html = '<img src=x onerror="window.__pwned2=1">';
  /* a group's name, when leaving it */
  await page.evaluate(h => { CONVERSATIONS.push({ id: "cv_xss", type: "GROUP", name: h, members: [ME, Object.keys(PEOPLE).find(x => x !== ME)], createdBy: ME, createdAt: new Date().toISOString(), pins: [], starredBy: [], readState: {}, notificationLevel: {} }); convLeave("cv_xss"); }, html);
  await expect(page.locator("#modal h3")).toContainText("<img");
  await expect(page.locator("#modal h3 img")).toHaveCount(0);
  await page.evaluate(() => { closeModal(); CONVERSATIONS.splice(CONVERSATIONS.findIndex(c => c.id === "cv_xss"), 1); });
  /* the titles of the tasks a deleted task was blocking */
  await page.evaluate(async () => { if (!TASKS.some(t => !t._draft)) { const d = await apiFetch("POST", "/api/tasks", { title: "XSS target " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(d)); } });
  await page.evaluate(h => { const target = TASKS.find(t => !t._draft); TASKS.push({ id: "T-xss", title: h.replace("__pwned2", "__pwned3"), dependencies: [{ taskId: target.id }], versions: [], files: [], comments: [], activity: [] }); deleteTask(target.id); }, html);
  await expect(page.locator("#modal")).toContainText("<img");
  await expect(page.locator("#modal img")).toHaveCount(0);
  await page.evaluate(() => { closeModal(); TASKS.splice(TASKS.findIndex(t => t.id === "T-xss"), 1); });
  /* a mention next to a link does not break into the link's markup */
  const body = await page.evaluate(() => msgBodyHtml({ body: "see https://evil.example/@sarah and @sarah", mentions: [{ userId: "sarah", display: "sarah" }] }));
  expect(body).toContain('href="https://evil.example/@sarah"');
  expect(body).toContain('<span class="msg-mention');
  /* a page link is the web or mail, never javascript: */
  expect(await page.evaluate(() => mdToHtml("[click](javascript:window.__pwned4=1) and [site](https://example.org)"))).not.toContain("javascript:");
  expect(await page.evaluate(() => mdToHtml("[site](https://example.org)"))).toContain('href="https://example.org"');
  /* a priority the page does not know */
  expect(await page.evaluate(() => prioL('x"><img src=x>'))).toBe("Medium");
  await page.waitForTimeout(300);
  expect(await pwned(page)).toBe(false);
});
