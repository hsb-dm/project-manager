/* On a phone nothing is squeezed: in every settings tab, the main screens and the export dialog, no text is
   folded a word or a letter per line, no field shrinks below a tap, nothing runs off the screen. It used to:
   the legal pages' "Now showing" read one letter per line, a label's name field was 20px wide, a task field's
   place a sliver, teams and AI models a word per line; the activity time pushed its sentence into a column; a
   wrapped group of choices read as one lumpy shape. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
test.setTimeout(180000);

const scan = page => page.evaluate(() => {
  const vw = innerWidth, out = [];
  const desc = e => "." + String(e.className || e.tagName).split(" ").filter(Boolean).slice(0, 2).join(".") + " <" + String((e.parentElement && e.parentElement.className) || "").split(" ")[0] + ">";
  document.querySelectorAll("#content *, #modal *").forEach(e => {
    if (!e.offsetParent || e.closest(".ptabs,.tabs,.snav,svg,.cal,.cal-grid,.kanban,.board,.tbl-wrap,.gantt,table")) return;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const text = [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim().length > 3) ? e.textContent.trim() : "";
    const lh = parseFloat(getComputedStyle(e).lineHeight) || 16;
    if (text.length >= 12 && r.width < 125 && r.height > lh * 2.6 && text.length * 6 > r.width * 2.4) out.push("squeezed text " + Math.round(r.width) + "px " + desc(e) + " “" + text.slice(0, 30) + "”");
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !/^(checkbox|radio|color|file|hidden)$/.test(e.type) && r.width < 44) out.push("squeezed field " + Math.round(r.width) + "px " + desc(e));
    if (r.right > vw + 2 && getComputedStyle(e).position !== "fixed") { let p = e.parentElement, inScroller = false; while (p && p.id !== "content" && p.id !== "modal") { if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) { inScroller = true; break; } p = p.parentElement; } if (!inScroller) out.push("off screen " + Math.round(r.right) + "px " + desc(e)); }
  });
  return [...new Set(out)];
});

test("settings, screens and the export dialog fit a phone", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const made = await page.evaluate(async () => {
    const tag = Date.now().toString(36), teams = [], tasks = [];
    for (const [n, c] of [["Design", "blue"], ["Motion & Video", "orange"]]) { await apiFetch("POST", "/api/teams", { name: n + " " + tag, color: c, description: "Brand, product UI, campaign and print design", lead: ME, members: [ME] }); }
    const b = await apiFetch("GET", "/api/bootstrap"); (b.teams || []).filter(t => t.name.endsWith(tag)).forEach(t => teams.push(t.id));
    const d = await apiFetch("POST", "/api/tasks", { title: "Settings sweep task " + tag, status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] }); tasks.push(d.id);
    await apiFetch("PUT", "/api/tasks/" + d.id, Object.assign({}, d, { status: WS.workflow[1].id }));
    return { teams, tasks };
  });
  try {
    await page.reload(); await page.waitForFunction(() => window.ZC_READY === true && API.on);
    const found = {};
    for (const t of ["profile", "layout", "workspace", "theme", "workflow", "automation", "briefs", "fields", "labels", "tags", "members", "roles", "teams", "notifications", "integrations", "backup"]) {
      await page.evaluate(t => { S.settingsTab = t; go("settings"); renderScreen(); }, t); found["settings:" + t] = await scan(page);
    }
    for (const sec of ["overview", "models", "limits", "prompts", "providers", "permissions", "privacy"]) {
      await page.evaluate(s => { S.settingsTab = "ai"; S.aiSettingsSection = s; go("settings"); renderScreen(); }, sec); found["settings:ai:" + sec] = await scan(page);
    }
    for (const s of ["home", "tasks", "projects", "calendar", "teams", "assets", "analytics", "knowledge"]) { await page.evaluate(s => go(s), s); await page.waitForTimeout(150); found[s] = await scan(page); }
    await page.evaluate(() => { go("tasks"); exportModal("excel"); }); found["export dialog"] = await scan(page); await page.evaluate(() => closeModal());
    const bad = Object.entries(found).filter(([, v]) => v.length).map(([k, v]) => k + ": " + v.slice(0, 4).join(" | "));
    expect(bad, bad.join("\n")).toEqual([]);
    /* the activity time is under what happened */
    await page.evaluate(() => { S.actScope = "mine"; go("home"); });
    const act = await page.evaluate(() => { const a = document.querySelector("#content .act"); if (!a) return null; const t = a.children[1].getBoundingClientRect(), w = a.querySelector(".when").getBoundingClientRect(); return w.top >= t.bottom - 1; });
    expect(act, "the time sits under the sentence").toBe(true);
  } finally {
    await page.evaluate(m => Promise.all(m.tasks.map(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {})).concat(m.teams.map(i => apiFetch("DELETE", "/api/teams/" + i).catch(() => {})))), made);
  }
});
