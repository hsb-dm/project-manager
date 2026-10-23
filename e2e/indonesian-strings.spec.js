/* English left in the Indonesian interface (the sweep of 23 Oct 2026, a Playwright walk of every screen in
   Indonesian). Checked here on the elements that showed it, not on the whole page:
   - the personal tick: "1 checked", "Clear checks", "Mark as checked", "Checked — click to clear";
   - a comment's audience chip: "visible" where the switch above says "Stakeholder";
   - a team's own name: a team called "Design" stayed "Design" in the List (a .tbadge, which the page-wide pass leaves
     alone) but became "Desain" in the task panel, a team's page and a project's settings (plain text that matched the
     dictionary's "Design"); what people typed is never translated now (src/i18n.js uiUserNames);
   - screens fixed then, which must not show the English again.
   Everything is made through the API and removed after: tasks deleted, projects deleted, the team renamed and archived. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const toId = page => page.evaluate(async () => { await setLanguage("id"); }).then(() => page.waitForFunction(() => UI_LANG === "id" && ZC_I18N.ready));
const TAG = "idw" + Date.now().toString(36);
const TEAM_NAME = "Design";   /* a dictionary word: UI_ID.Design is "Desain" */
let M = null;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async ([tag, teamName]) => {
    const pid = "p" + tag, pid2 = "pa" + tag, team = "team" + tag, st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id);
    await apiFetch("POST", "/api/projects", { id: pid, name: "Sweep project " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20), teams: [team] });
    await apiFetch("POST", "/api/projects", { id: pid2, name: "Sweep archived " + tag, status: "archived", owner: ME, startDate: iso(-30), dueDate: iso(-10) });
    await apiFetch("POST", "/api/teams", { id: team, name: teamName, color: "blue", lead: ME, members: [ME] });
    const tid = (await apiFetch("POST", "/api/tasks", { title: "Sweep task " + tag, status: st[1] || st[0], prio: "medium", assignee: ME, assignees: [ME], team, proj: pid, startDate: iso(1), dueDate: iso(4) })).id;
    await apiFetch("POST", "/api/tasks/" + tid + "/comments", { id: "cm_" + tag + "_c", text: "For the requester " + tag, vis: "client" });
    await apiFetch("POST", "/api/tasks/" + tid + "/comments", { id: "cm_" + tag + "_i", text: "Team only " + tag, vis: "internal" });
    await reloadAll();
    return { pid, pid2, team, tid };
  }, [TAG, TEAM_NAME]);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async ([m, tag]) => {
    setLanguage("en"); clearTaskChecks(); closeDrawer(); go("home");
    await apiFetch("DELETE", "/api/tasks/" + m.tid).catch(() => {});
    await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {});
    await apiFetch("DELETE", "/api/projects/" + m.pid2).catch(() => {});
    /* renamed first, so no archived team keeps a dictionary word for a name */
    await apiFetch("PUT", "/api/teams/" + m.team, { name: "Sweep team " + tag, color: "blue" }).catch(() => {});
    await apiFetch("DELETE", "/api/teams/" + m.team).catch(() => {});
  }, [M, TAG]);
  await page.close();
});

test("the personal tick speaks Indonesian, and English again after", async ({ page }) => {
  await signIn(page);
  try {
    await page.evaluate(() => clearTaskChecks());
    await toId(page);
    await page.evaluate(pid => { closeDrawer(); S.taskScope = "all"; S.taskView = "list"; S.filters = Object.assign(emptyTaskFilters(), { proj: pid }); go("tasks"); }, M.pid);
    const tick = page.locator(`.tcheck[data-check="${M.tid}"]`).first();
    await expect(tick).toHaveAttribute("title", "Tandai dicentang");
    await expect(tick).toHaveAttribute("aria-label", "Tandai dicentang");
    await expect(page.locator("#taskCheckChip")).not.toHaveClass(/\bon\b/);
    await tick.click();
    await expect(tick).toHaveAttribute("aria-checked", "true");
    await expect(tick).toHaveAttribute("title", "Dicentang — klik untuk menghapus centang");
    const chip = page.locator("#taskCheckChip.on");
    await expect(chip).toContainText("1 dicentang");
    await expect(chip.locator("button")).toHaveAttribute("title", "Hapus centang");
    await expect(chip.locator("button")).toHaveAttribute("aria-label", "Hapus centang");
    /* the same in the other views that carry the chip */
    for (const v of ["kanban", "calendar"]) {
      await page.evaluate(v => { S.taskView = v; renderScreen(false); }, v);
      await expect(page.locator("#taskCheckChip.on .tcheck-word")).toHaveText(/^\s*dicentang$/);
      await expect(page.locator("#taskCheckChip.on button")).toHaveAttribute("aria-label", "Hapus centang");
    }
    /* English is untouched */
    await page.evaluate(() => { setLanguage("en"); S.taskView = "list"; renderScreen(false); });
    await expect(page.locator("#taskCheckChip.on")).toContainText("1 checked");
    await expect(page.locator("#taskCheckChip.on button")).toHaveAttribute("aria-label", "Clear checks");
    await expect(page.locator(`.tcheck[data-check="${M.tid}"]`).first()).toHaveAttribute("title", "Checked — click to clear");
    await page.locator("#taskCheckChip.on button").click();
    await expect(page.locator("#taskCheckChip")).not.toHaveClass(/\bon\b/);
  } finally {
    await page.evaluate(() => { clearTaskChecks(); S.filters = emptyTaskFilters(); setLanguage("en"); });
  }
});

test("a comment's audience chip says what the Internal / Stakeholder switch says", async ({ page }) => {
  await signIn(page);
  try {
    for (const [lang, words] of [["id", { client: "stakeholder", internal: "internal" }], ["en", { client: "visible", internal: "internal" }]]) {
      if (lang === "id") await toId(page); else await page.evaluate(() => setLanguage("en"));
      await page.evaluate(id => { go("tasks"); openTask(id); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, M.tid);
      const client = page.locator("#drawer .cmt.client .who .badge:not(.client)").first();
      const internal = page.locator("#drawer .cmt.internal .who .badge:not(.client)").first();
      await expect(client).toHaveText(words.client);
      await expect(internal).toHaveText(words.internal);
      /* the chip says the switch's word, and carries the switch's explanation */
      const sw = await page.evaluate(() => [...document.querySelectorAll("#drawer .cvis button")].map(b => b.textContent.trim()));
      if (lang === "id") {
        expect(sw.map(s => s.toLowerCase())).toEqual(["internal", "stakeholder"]);
        await expect(client).toHaveAttribute("title", await page.evaluate(() => UI_ID["Stakeholder-visible comments can be seen by requesters like Marketing."]));
        await expect(internal).toHaveAttribute("title", await page.evaluate(() => UI_ID["Internal comments are only visible to the creative team."]));
      } else {
        await expect(client).toHaveAttribute("title", "Stakeholder-visible comments can be seen by requesters like Marketing.");
      }
    }
  } finally {
    await page.evaluate(() => { closeDrawer(); setLanguage("en"); });
  }
});

test("a team's own name is never translated, in the List, the task panel, its page and a project's settings", async ({ page }) => {
  await signIn(page);
  try {
    await toId(page);
    expect(await page.evaluate(() => [UI_ID.Design, tr("Design")])).toEqual(["Desain", "Desain"]);   /* a built-in "Design" still is */
    await page.evaluate(pid => { closeDrawer(); S.taskScope = "all"; S.taskView = "list"; S.filters = Object.assign(emptyTaskFilters(), { proj: pid }); go("tasks"); }, M.pid);
    await expect(page.locator("#content .tbadge", { hasText: TEAM_NAME }).first()).toBeVisible();
    await page.evaluate(id => { openTask(id); S.drawerTab = "details"; renderDrawer(); }, M.tid);
    const meta = page.locator("#drawer .task-read-value", { hasText: /^\s*(Design|Desain)\s*$/ }).first();
    await expect(meta).toHaveText(TEAM_NAME);
    await page.evaluate(() => closeDrawer());
    await page.evaluate(t => go("teams", t), M.team);
    await expect(page.locator("#content .pagehead h1")).toHaveText(TEAM_NAME);
    await page.evaluate(p => { go("projects", p); S.projectTab = "settings"; renderScreen(false); }, M.pid);
    await expect(page.locator("#f_ep_teams")).toContainText(TEAM_NAME);
    await expect(page.locator("#f_ep_teams")).not.toContainText("Desain");
  } finally {
    await page.evaluate(() => { closeDrawer(); S.projectTab = "overview"; S.filters = emptyTaskFilters(); setLanguage("en"); });
  }
});

/* The screens the sweep fixed: none of these English texts may show there in Indonesian again. Each scene names the
   elements it reads (text, title, aria-label and placeholder), so a team's or a person's own words are not read. */
const COMMON = /\b(the|and|your|you|with|from|this|that|is|are|not|of|yet|here|what|where|whether)\b/i;
const SCENES = [
  { name: "a project's overview", go: m => { go("projects", m.pid); S.projectTab = "overview"; renderScreen(false); }, sel: "#content .kpi .d, #content .panel-head .badge",
    en: ["estimated", "progress", "delivered"], want: "estimasi · progres" },
  { name: "a project's files", go: m => { go("projects", m.pid); S.projectTab = "files"; renderScreen(false); }, sel: "#content .empty",
    en: ["No files yet", "Files attached to tasks"] },
  { name: "an archived project", go: m => { go("projects", m.pid2); S.projectTab = "overview"; renderScreen(false); }, sel: "#content .errbox",
    en: ["This project is archived", "Restore project"], want: "Pulihkan project" },
  { name: "a team's page", go: m => go("teams", m.team), sel: "#content .kpi .d", en: ["h of"] },
  { name: "Teams", go: () => { S.teamId = null; go("teams"); }, sel: "#content .pagehead .muted", en: ["drag a person", "creatives"] },
  { name: "the task panel's stages", go: m => { go("tasks"); openTask(m.tid); S.drawerTab = "details"; renderDrawer(); }, sel: "#drFoot .task-stage-rail button[title]",
    en: ["Move to"], want: "Pindahkan ke" },
  { name: "AI Hub's main button", go: () => { closeDrawer(); go("aihub"); }, sel: ".ai-head-primary-actions .btn.primary", en: ["Create visual"], want: "Buat visual" },
  { name: "Settings · Workspace", go: () => go("settings", "workspace"), sel: "#content .panel-head h2, #content p.hint, #content input#ws_code",
    en: ["Access", "Share the join code", "Change roles", "Leave empty"] },
  { name: "Settings · Members", go: () => go("settings", "members"), sel: "#content p.hint, #content td.hint, #content button[title]",
    en: ["New people register", "change their role", "never", "no password"] },   /* "Reset password" is the same in Indonesian */
  { name: "Settings · Fields", go: () => go("settings", "fields"), sel: "#content p.hint, #content select[aria-label]",
    en: ["Rename, reorder", "Custom fields use", "Display mode"] },
  { name: "Settings · AI", go: () => go("settings", "ai"), sel: "#content .panel-head h2, #content p.hint, #content .pref .pl b",
    en: ["AI overview", "What members can do", "Image generation", "Active Gallery items", "Your gallery designs", "Generations in your history"], want: "Ringkasan AI" },
  { name: "Settings · Backup", go: () => go("settings", "backup"), sel: "#content .panel-head h2, #content p.hint, #content .pref .pl b, #content .pref b.mono, #content .badge",
    en: ["Backup overview", "Whether this workspace", "Latest backup", "Backups kept", "Integrity", "all verified", "Checksums match", "none yet", "not configured", "same disk"], want: "Ringkasan cadangan" }
];
test("screens fixed in the sweep show no English in Indonesian", async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  try {
    await toId(page);
    for (const sc of SCENES) {
      await page.evaluate(([src, m]) => { closePops(); closeModal(); (new Function("m", "return (" + src + ")(m)"))(m); }, [sc.go.toString(), M]);
      const read = () => page.evaluate(sel => [...document.querySelectorAll(sel)].map(el => [el.textContent, el.getAttribute("title"), el.getAttribute("aria-label"), el.getAttribute("placeholder")].filter(Boolean).join(" | ")).join("\n"), sc.sel);
      await expect.poll(read, { message: sc.name + ": drawn", timeout: 15000 }).not.toBe("");
      if (sc.want) await expect.poll(read, { message: sc.name + ": in Indonesian", timeout: 15000 }).toContain(sc.want);
      const text = await read();
      const left = sc.en.filter(w => text.includes(w));
      const common = text.match(COMMON);
      expect(left, sc.name + ":\n" + text).toEqual([]);
      expect(common && common[0], sc.name + ": an English word in\n" + text).toBeFalsy();
    }
  } finally {
    await page.evaluate(() => { closeDrawer(); S.projectTab = "overview"; S.teamId = null; setLanguage("en"); go("home"); });
  }
});

test("the sign-in page is Indonesian before anyone signs in", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem("cos.language", "id"); } catch (e) { } });
  const page = await ctx.newPage();
  try {
    await page.goto("/");
    await expect(page.locator("#au_email")).toHaveAttribute("placeholder", "nama@perusahaan.com");
    await expect(page.locator(".authform")).toContainText("Hubungi admin workspace bila kamu belum punya akun.");
    await expect(page.locator(".authform")).not.toContainText("Contact your workspace administrator");
  } finally { await ctx.close(); }
});
