/* The look is personal. An admin choosing a colour used to recolour everyone, and every pick (each step of a
   drag through the picker) made every open copy reload the workspace and redraw — people saw their screen
   refresh by itself. Now each person's colours, density, corners and font are theirs; the workspace look is
   only the starting point, which an admin can set on purpose. A hex code can be typed or pasted. */
const { test, expect } = require("@playwright/test");
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
const MEM = { name: "Tema " + tag, email: "tema-" + tag + "@e2e.test", pw: "Tema!Personal-2026x" };
const NEW = { name: "Baru " + tag, email: "baru-" + tag + "@e2e.test", pw: "Baru!Personal-2026x" };
const primary = page => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim().toLowerCase());
let ids = {}, wsOrig = null;

test("setup", async ({ page }) => {
  await signIn(page, ADMIN);
  ids = await page.evaluate(async o => {
    const out = {};
    for (const [k, p] of [["mem", o.mem], ["neu", o.neu]]) { await apiFetch("POST", "/api/members", { name: p.name, email: p.email, perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people; out[k] = Object.keys(people).find(id => people[id].email === p.email); await apiFetch("POST", "/api/members/" + out[k] + "/password", { password: p.pw }); }
    return out;
  }, { mem: MEM, neu: NEW });
  wsOrig = await page.evaluate(() => Object.assign({}, WS.theme));
});

test("an admin's colour is the admin's alone: nobody else is recoloured, told, or redrawn", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage(); await signIn(admin, ADMIN);
  /* in dark mode a dark accent is lightened to stay readable: compare colours in light mode */
  await admin.evaluate(() => setAppearance("light"));
  await expect.poll(() => admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.people[ME].prefs || {}).appearance))).toBe("light");
  const mem = await (await browser.newContext()).newPage(); await signIn(mem, MEM);
  await mem.evaluate(() => { S.projectId = null; go("projects"); document.getElementById("content").setAttribute("data-mark", "untouched"); });
  const before = await primary(mem);
  const wsWrites = []; admin.on("request", r => { if (r.method() !== "GET" && /\/api\/workspace$/.test(r.url())) wsWrites.push(r.url()); });
  /* a drag through the picker, then letting go */
  await admin.evaluate(async () => { openPop("themePop", document.getElementById("themeBtn")); await new Promise(r => setTimeout(r, 50)); const el = document.querySelector("#quickTheme input[type=color]"); for (const v of ["#c00000", "#d01010", "#e02020"]) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 80)); } el.dispatchEvent(new Event("change", { bubbles: true })); });
  await expect.poll(() => primary(admin)).toBe("#e02020");
  await expect.poll(() => admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME].prefs || {}).theme || {}).accent)), { timeout: 5000 }).toBe("#e02020");
  await mem.waitForTimeout(1500);
  expect(wsWrites, "nothing is written to the workspace").toEqual([]);
  expect(await primary(mem), "the colleague keeps their colour").toBe(before);
  expect(await mem.evaluate(() => document.getElementById("content").getAttribute("data-mark")), "and their screen was not redrawn").toBe("untouched");
  /* the colleague picks their own; both stay as chosen, after a reload too */
  await mem.evaluate(() => setAccent("#0a8f3c"));
  await expect.poll(() => mem.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME].prefs || {}).theme || {}).accent)), { timeout: 5000 }).toBe("#0a8f3c");
  await mem.reload(); await ready(mem); await admin.reload(); await ready(admin);
  expect(await primary(mem)).toBe("#0a8f3c");
  expect(await primary(admin)).toBe("#e02020");
  await admin.context().close(); await mem.context().close();
});

test("a hex code can be typed or pasted beside the swatches", async ({ page }) => {
  await signIn(page, MEM);
  await page.evaluate(() => go("settings", "theme"));
  const hex = page.locator("#content .swatches .sw-hex").first();
  await expect(hex).toHaveValue("#0a8f3c");
  await hex.fill("1F4FD8");
  await expect.poll(() => primary(page)).toBe("#1f4fd8");
  await expect(hex).not.toHaveClass(/bad/);
  /* a paste, short form */
  await hex.fill("");
  await hex.evaluate(el => { el.focus(); const dt = new DataTransfer(); dt.setData("text/plain", "#a3c"); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
  await page.keyboard.insertText("#a3c");
  await page.keyboard.press("Enter");
  await expect.poll(() => primary(page)).toBe("#aa33cc");
  await expect(page.locator("#content .swatches .sw-hex").first()).toHaveValue("#aa33cc");
  /* not a colour: marked, nothing changes */
  const again = page.locator("#content .swatches .sw-hex").first();
  await again.fill("zz12");
  await expect(again).toHaveClass(/bad/);
  expect(await primary(page)).toBe("#aa33cc");
  /* back to the workspace look */
  await page.evaluate(() => { const b = [...document.querySelectorAll("#content button")].find(x => /Use the workspace look/.test(x.textContent)); b.click(); });
  await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME].prefs || {}).theme || null)))).toBe(null);
  expect(await primary(page)).toBe((wsOrig.accent || "#2f5bff").toLowerCase());
  expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = tr("Use the workspace look"); UI_LANG = was; return r; })).toBe("Pakai tampilan workspace");
});

test("an admin makes their look the workspace default on purpose: who has not chosen gets it, who has keeps theirs", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage(); await signIn(admin, ADMIN);
  await admin.evaluate(() => go("settings", "theme"));
  await admin.getByRole("button", { name: "Make my look the workspace default" }).click();
  await admin.locator("#modal").getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => admin.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => d.ws.theme.accent))).toBe("#e02020");
  const neu = await (await browser.newContext()).newPage(); await signIn(neu, NEW);
  expect(await primary(neu), "someone who never chose").toBe("#e02020");
  const mem = await (await browser.newContext()).newPage(); await signIn(mem, MEM);
  await mem.evaluate(() => setAccent("#0a8f3c"));
  await expect.poll(() => mem.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME].prefs || {}).theme || {}).accent))).toBe("#0a8f3c");
  await mem.reload(); await ready(mem);
  expect(await primary(mem), "someone who chose their own").toBe("#0a8f3c");
  await Promise.all([admin, neu, mem].map(p => p.context().close()));
});

test("cleanup", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.evaluate(async o => { WS.theme = Object.assign(WS.theme, o.ws); saveWS(); resetMyTheme(); await Promise.all([o.ids.mem, o.ids.neu].map(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}))); }, { ws: wsOrig, ids });
  await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => d.ws.theme.accent))).toBe(wsOrig.accent);
});
