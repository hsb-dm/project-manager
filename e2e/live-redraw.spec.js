/* A colleague's change redraws the screen without losing the reader's place (Oct 2026). Every task saved anywhere
   in the workspace redraws the board (the live board); the board jumped back to its first column and a long
   column to its top every few seconds, and a field being typed in Settings went back to what was saved — the SMTP
   password to empty, so Test connection sent none. Here a second browser is the colleague. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("a colleague's save keeps the board where it was scrolled, and what is typed in Settings", async ({ browser, page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await signIn(page);
  const ids = await page.evaluate(async () => {
    const out = [], st = WS.workflow[1].id;
    for (let i = 0; i < 22; i++) { const d = await apiFetch("POST", "/api/tasks", { title: "Live " + i, status: st, prio: "medium", assignee: ME, assignees: [ME] }); out.push(d.id); }
    await reloadAll(); return out;
  });
  const colleague = await (await browser.newContext()).newPage();
  await signIn(colleague);
  const change = async (id, title) => colleague.evaluate(async o => { const d = await apiFetch("GET", "/api/tasks/" + o.id); d.title = o.title; await apiFetch("PUT", "/api/tasks/" + o.id, d); }, { id, title });
  try {
    /* the board, scrolled sideways and down a long column */
    await page.evaluate(() => { S.taskView = "kanban"; S.taskScope = "all"; go("tasks"); });
    const board = page.locator("#content .kanban"), col = page.locator('#content .kcol[data-status="' + (await page.evaluate(() => WS.workflow[1].id)) + '"] .kcol-body');
    await expect(col.locator(".kcard").first()).toBeVisible();
    await board.evaluate(el => { el.scrollLeft = 260; });
    await col.evaluate(el => { el.scrollTop = 300; });
    const before = { left: await board.evaluate(el => el.scrollLeft), top: await col.evaluate(el => el.scrollTop) };
    expect(before.left, "the board can scroll sideways").toBeGreaterThan(100);
    expect(before.top, "the column can scroll down").toBeGreaterThan(100);
    /* a colleague renames a task: it shows here, and the board stays where it was */
    await change(ids[3], "Live 3 — renamed by a colleague");
    await expect(page.locator("#content .kcard", { hasText: "Live 3 — renamed by a colleague" })).toHaveCount(1, { timeout: 10000 });
    expect(await board.evaluate(el => el.scrollLeft), "sideways").toBe(before.left);
    expect(await col.evaluate(el => el.scrollTop), "down the column").toBe(before.top);

    /* the Grid's table, scrolled down and sideways (Oct 2026: only the app's own scrollers are measured now) */
    await page.evaluate(() => { S.taskView = "grid"; go("tasks", "grid"); });
    const table = page.locator("#content .tbl-wrap").first();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await table.evaluate(el => { el.scrollTop = 200; el.scrollLeft = 120; });
    const was = await table.evaluate(el => [el.scrollTop, el.scrollLeft]);
    expect(was[0], "the table scrolls down").toBeGreaterThan(100);
    await change(ids[5], "Live 5 — renamed while the Grid is scrolled");
    await expect(page.locator('#content .tbl-wrap input[value="Live 5 — renamed while the Grid is scrolled"]')).toHaveCount(1, { timeout: 10000 });
    expect(await page.locator("#content .tbl-wrap").first().evaluate(el => [el.scrollTop, el.scrollLeft]), "the table stays where it was").toEqual(was);
    await page.evaluate(() => { S.taskView = "kanban"; });

    /* Settings: the SMTP password being typed survives a colleague's save, and goes out with Test connection */
    await page.goto("/settings/notifications"); await ready(page);
    const sent = [];
    await page.route("**/api/mail/smtp/test", r => { sent.push(r.request().postDataJSON()); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, encryption: "STARTTLS", authenticated: true }) }); });
    await page.locator("#smtp_host").fill("smtp.gmail.com");
    await page.locator("#smtp_pass").fill("abcd efgh ijkl mnop");
    const renders = await page.evaluate(() => { window.__r = 0; const f = renderScreen; renderScreen = function () { window.__r++; return f.apply(this, arguments); }; return 0; });
    await change(ids[4], "Live 4 — renamed while the admin types");
    await expect.poll(() => page.evaluate(() => window.__r), { timeout: 10000 }).toBeGreaterThan(renders);
    await expect(page.locator("#smtp_pass")).toHaveValue("abcd efgh ijkl mnop");
    await expect(page.locator("#smtp_host")).toHaveValue("smtp.gmail.com");
    await expect(page.locator("#smtp_pass"), "still being typed in").toBeFocused();
    await page.locator("#smtpTestBtn").click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].pass).toBe("abcd efgh ijkl mnop");
    /* the admin's own redraw (another tab and back) starts from what is saved */
    await page.evaluate(() => { S.settingsTab = "profile"; renderScreen(false); S.settingsTab = "notifications"; renderScreen(false); });
    await expect(page.locator("#smtp_pass")).toHaveValue("");
  } finally {
    await colleague.close();
    await page.evaluate(async ids => { for (const id of ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, ids);
  }
});
