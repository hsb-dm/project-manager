/* One dropdown chevron everywhere: the user menu's (I.chevd, "M6 9l6 6 6-6"). Every select draws it — it was a
   filled wedge made of two gradients, and some selects (a workflow stage's kind and colour, a field's type, a
   member's role, the AI usage filters, the phone's Settings and Assets pickers) had none at all. The pill pickers
   and the phone's stage picker draw it too (they were a turned square's two borders). Checked on every Settings
   tab and screen, in light and dark. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("every select and picker shows the same chevron, in light and dark", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const bad = [];
  const scan = async where => { const r = await page.evaluate(() => [...document.querySelectorAll("select")].filter(s => s.offsetParent && !s.multiple && !s.closest(".pillsel")).map(s => ({ bg: getComputedStyle(s).backgroundImage, where: (s.id || s.parentElement.className || s.parentElement.tagName).toString().slice(0, 40) })).filter(x => !/M6 9l6 6 6-6/.test(decodeURIComponent(x.bg)))); r.forEach(x => bad.push(where + ": " + x.where + " → " + x.bg.slice(0, 60))); };
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
    const tabs = await page.evaluate(() => { go("settings"); renderScreen(); return [...document.querySelectorAll(".settings .snav button")].map(b => (b.getAttribute("onclick").match(/settingsTab='([^']+)'/) || [])[1]).filter(Boolean); });
    for (const t of tabs) { await page.evaluate(t => { S.settingsTab = t; go("settings"); renderScreen(); }, t); await scan(theme + " settings:" + t); }
    for (const s of ["tasks", "projects", "calendar", "teams", "assets", "analytics"]) { await page.evaluate(s => { go(s); renderScreen(); }, s); await scan(theme + " " + s); }
    for (const k of ["ppt", "xlsx"]) { await page.evaluate(k => exportModal(k), k); await scan(theme + " export:" + k); await page.evaluate(() => closeModal()); }
  }
  expect(bad, "selects without the shared chevron").toEqual([]);
  /* the colour follows the theme */
  const colours = await page.evaluate(() => { const s = document.createElement("select"); document.body.appendChild(s); const get = () => decodeURIComponent(getComputedStyle(s).backgroundImage).match(/stroke='([^']+)'/)[1]; document.documentElement.setAttribute("data-theme", "light"); const l = get(); document.documentElement.setAttribute("data-theme", "dark"); const d = get(); document.documentElement.setAttribute("data-theme", "light"); s.remove(); return [l, d]; });
  expect(colours[0]).not.toBe(colours[1]);
  /* a pill picker draws the same chevron in the text colour */
  const pill = await page.evaluate(() => { go("tasks"); renderScreen(); const p = document.querySelector(".pillsel:has(select)"); if (!p) return "no pill"; const cs = getComputedStyle(p, "::after"); return (cs.webkitMaskImage || cs.maskImage || "") + "|" + cs.borderRightStyle; });
  if (pill !== "no pill") { expect(decodeURIComponent(pill)).toMatch(/M6 9l6 6 6-6/); expect(pill).toMatch(/\|none$/); }
  /* the upgraded pill pickers (Sort, Group…) too */
  const custom = await page.evaluate(() => { const c = document.querySelector(".pillsel-custom .pillsel-chevron"); if (!c) return "none"; const cs = getComputedStyle(c); return (cs.webkitMaskImage || cs.maskImage || "") + "|" + cs.borderRightStyle; });
  expect(decodeURIComponent(custom)).toMatch(/M6 9l6 6 6-6/); expect(custom).toMatch(/\|none$/);
});

test("the phone: the Settings picker and the task's stage picker show the chevron", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  await page.evaluate(() => { go("settings"); renderScreen(); });
  expect(decodeURIComponent(await page.locator("select.settings-mobile-select").evaluate(s => getComputedStyle(s).backgroundImage))).toMatch(/M6 9l6 6 6-6/);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Chevron", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); openTask(d.id); return d.id; });
  try {
    const stage = await page.locator("#drawer .dr-foot .task-stage-select").evaluate(l => { const cs = getComputedStyle(l, "::after"); return (cs.webkitMaskImage || cs.maskImage || "") + "|" + cs.borderRightStyle; });
    expect(decodeURIComponent(stage)).toMatch(/M6 9l6 6 6-6/);
    expect(stage).toMatch(/\|none$/);
  } finally { await page.evaluate(async id => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id); }
});
