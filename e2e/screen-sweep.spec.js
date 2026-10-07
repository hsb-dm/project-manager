/* Every screen, on a desktop and a phone, in English and Indonesian: nothing throws, no request
   fails on the server, no screen falls back to "Something went wrong", a phone never scrolls
   sideways, and in Indonesian no label is left in English when it has a translation. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const SCREENS = [["home"], ["tasks", "kanban"], ["tasks", "list"], ["tasks", "grid"], ["tasks", "calendar"], ["projects"], ["calendar"], ["teams"], ["team"], ["assets"], ["knowledge"], ["aihub"], ["aigallery"], ["messages"], ["analytics"], ["notifications"]];
const SETTINGS = ["profile", "notifications", "theme", "layout", "workspace", "members", "roles", "teams", "workflow", "automation", "fields", "labels", "tags", "briefs", "integrations", "ai", "backup"];

async function sweep(page, lang) {
  const problems = [];
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/net::ERR_|Failed to load resource|favicon/i.test(m.text())) problems.push("console: " + m.text().slice(0, 200)); });
  page.on("response", r => { if (r.url().includes("/api/") && r.status() >= 500) problems.push("http " + r.status() + " " + r.request().method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "")); });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await page.evaluate(l => setLanguage(l), lang);  /* as the language menu does */
  const check = async where => {
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const out = [];
      { const eb = [...document.querySelectorAll("#content .errbox")].find(x => /went wrong rendering/i.test(x.textContent)); if (eb) out.push("render failed: " + eb.textContent.slice(0, 160)); }
      const se = document.scrollingElement; if (innerWidth < 700 && se.scrollWidth > innerWidth + 1) out.push("sideways scroll: " + se.scrollWidth + " > " + innerWidth);
      if (UI_LANG === "id" && typeof UI_ID === "object") {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const seen = new Set();
        while ((n = w.nextNode())) {
          const t = n.nodeValue.trim(); if (!t || t.length < 3 || seen.has(t)) continue;
          const el = n.parentElement; if (!el || el.closest("[data-no-translate],script,style,code,pre,textarea,.toast,.lbl")  /* a label is the workspace own word */ || !el.offsetParent) continue;
          if (Object.prototype.hasOwnProperty.call(UI_ID, t) && UI_ID[t] && UI_ID[t] !== t) { seen.add(t); out.push("english: \"" + t + "\" in " + el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "") + " within #" + ((el.closest("[id]") || {}).id || "?")); }
        }
      }
      return out;
    });
    r.forEach(x => problems.push(where + " — " + x));
  };
  for (const [s, sub] of SCREENS) { await page.evaluate(([s, sub]) => { closeDrawer && closeDrawer(); closeModal && closeModal(); go(s, sub); }, [s, sub || null]); await check(s + (sub ? "/" + sub : "")); }
  for (const tab of SETTINGS) { await page.evaluate(t => go("settings", t), tab); await check("settings/" + tab); }
  /* a task's panel, every tab */
  const tid = await page.evaluate(() => (TASKS.find(t => !t._draft) || {}).id || null);
  if (tid) for (const tab of ["details", "comments", "files", "activity", "brief", "versions"]) { await page.evaluate(([id, t]) => { openTask(id); S.drawerTab = t; renderDrawer(); }, [tid, tab]); await check("task/" + tab); }
  await page.evaluate(() => { closeDrawer(); setLanguage("en"); });
  return problems;
}

for (const [label, size] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
  for (const lang of ["en", "id"]) {
    test(`every screen works on a ${label} in ${lang === "en" ? "English" : "Indonesian"}`, async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize(size);
      const problems = await sweep(page, lang);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
