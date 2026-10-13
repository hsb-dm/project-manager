/* Settings opens on My profile (the top of the list) — from the user menu, the command list and the phone's More
   menu. And one rhythm: a row of fields is a clear gap from the next row's labels, wherever it sits (inside My
   profile's sections the rows touched); a section's line has the same room above and below it; My profile's
   Workspace read-outs are labelled like fields and its capacity box is drawn like one. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
}

test("Settings opens on My profile, from every way in", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page);
  expect(await page.evaluate(() => S.settingsTab), "the default").toBe("profile");
  /* the user menu's All settings, after another tab was open */
  await page.evaluate(() => { S.settingsTab = "workspace"; go("tasks"); });
  const menuGo = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = userMenuHtml(); const b = [...d.querySelectorAll("button,a")].find(x => /settings/.test(x.getAttribute("onclick") || "") && /All settings|Settings/.test(x.textContent)); return b ? b.getAttribute("onclick") : ""; });
  expect(menuGo).toContain("go('settings','profile')");
  await page.evaluate(code => { new Function(code)(); }, menuGo);
  expect(await page.evaluate(() => S.settingsTab)).toBe("profile");
  await expect(page.locator(".settings .snav button.on")).toHaveText("My profile");
  /* a way in that names its tab still lands there */
  await page.evaluate(() => go("settings", "integrations"));
  expect(await page.evaluate(() => S.settingsTab)).toBe("integrations");
});

test("one rhythm: rows of fields apart, section lines with even room, Workspace read-outs like fields", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1100 });
  await signIn(page);
  await page.evaluate(() => { go("settings", "profile"); renderScreen(); });
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".settings .pf-section .field-row")], gaps = [];
    for (let i = 0; i + 1 < rows.length; i++) if (rows[i].parentElement === rows[i + 1].parentElement) gaps.push(Math.round(rows[i + 1].getBoundingClientRect().top - rows[i].getBoundingClientRect().bottom));
    const secs = [...document.querySelectorAll(".settings .pf-section")].slice(0, -1).map(s => { const r = s.getBoundingClientRect(), cs = getComputedStyle(s), first = s.firstElementChild.getBoundingClientRect(), last = s.lastElementChild.getBoundingClientRect(), next = s.nextElementSibling.firstElementChild.getBoundingClientRect();
      return { above: Math.round(r.bottom - last.bottom), below: Math.round(next.top - r.bottom), line: cs.borderBottomStyle }; });
    const ws = document.querySelector(".settings .pf-ws"), lab = ws && ws.querySelector(".hint"), cap = document.getElementById("pf_cap");
    return { gaps, secs, labelCase: lab && getComputedStyle(lab).textTransform, capRadius: cap && parseFloat(getComputedStyle(cap).borderTopLeftRadius), capBorder: cap && getComputedStyle(cap).borderTopStyle };
  });
  expect(m.gaps.length).toBeGreaterThan(1);
  for (const g of m.gaps) expect(g, "a clear gap between rows of fields").toBeGreaterThanOrEqual(14);
  for (const s of m.secs) { expect(s.line).toBe("solid"); expect(s.above).toBeGreaterThanOrEqual(16); expect(s.below).toBeGreaterThanOrEqual(16); expect(Math.abs(s.above - s.below), "even room around the line").toBeLessThanOrEqual(6); }
  expect(m.labelCase).toBe("uppercase");
  expect(m.capRadius).toBeGreaterThanOrEqual(8); expect(m.capBorder).toBe("solid");
  /* a toggle row and the fields after it are apart (Workspace → Access) */
  await page.evaluate(() => { go("settings", "workspace"); renderScreen(); });
  const pref = await page.evaluate(() => { const p = [...document.querySelectorAll(".settings .pref")].find(x => x.nextElementSibling && x.nextElementSibling.matches(".field,.field-row")); if (!p) return null; return Math.round(p.nextElementSibling.getBoundingClientRect().top - p.getBoundingClientRect().bottom); });
  if (pref !== null) expect(pref).toBeGreaterThanOrEqual(14);
});
