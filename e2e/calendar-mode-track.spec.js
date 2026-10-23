/* The calendar's Month / Week / Day is one control on a track that shows, apart from whose tasks (Oct 2026). The owner's
   phone showed "Tim  Bulan  Minggu  Hari" as one row of loose pills: the period's track was the page's own grey and
   whose tasks was a black pill like the chosen period, so people took the period for the Mine / All filter.
   Checked on a phone (390 px) and a laptop (1366 px), in English and Indonesian, light and dark, on the Calendar screen,
   the Tasks calendar and a project's calendar: the period is a radio group named "Calendar view" / "Tampilan kalender"
   whose three options sit inside one box on one line; its track differs from what is behind it; whose tasks is its own
   control (a button with an icon named "Show: …" / "Tampilkan: …" on a phone, a radio group named "Show" /
   "Tampilkan" with its own track on a laptop) with space between the two; nothing scrolls sideways; and the arrow keys
   move the period with the focus kept on it. One project is made through the API and removed after; the language,
   the look and the remembered calendar choices are put back.
   A team's calendar on a phone (Oct 2026) had no controls at all (it is drawn without filters, which also left out the
   phone's bar, and the desktop's row is hidden up to 760 px), so it could not leave the month: it now has the month
   with previous and next, Today and Month / Week / Day (no whose tasks, filters or saved views: it is one team's
   tasks), which work, inside the panel, without a sideways scroll, at 320, 390 and 430 px. A team and two of its tasks
   are made through the API and removed (the team archived) after. */
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
const TAG = "cmt" + Date.now().toString(36);
let M = null;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async tag => {
    const pid = "p" + tag, team = "team" + tag, st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), tids = [];
    await apiFetch("POST", "/api/projects", { id: pid, name: "Calendar track " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20) });
    await apiFetch("POST", "/api/teams", { id: team, name: "Calendar team " + tag, color: "blue" });
    for (const d of [0, 9]) tids.push((await apiFetch("POST", "/api/tasks", { title: "Team calendar task " + d + " " + tag, status: st[0], prio: "medium", assignee: ME, assignees: [ME], team, proj: pid, startDate: iso(d), dueDate: iso(d) })).id);
    await reloadAll();
    return { pid, team, tids, was: { calMode: S.calMode, calScope: S.calScope, taskScope: S.taskScope, taskView: S.taskView, projectTab: S.projectTab, teamView: S.teamView } };
  }, TAG);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => {
    setLanguage("en"); document.documentElement.removeAttribute("data-theme");
    Object.assign(S, m.was); go("home");
    for (const id of m.tids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
    await apiFetch("DELETE", "/api/teams/" + m.team).catch(() => {});
    await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {});
  }, M);
  await page.close();
});

const SCENES = {
  calendar: () => { S.calMode = "month"; S.calScope = "all"; go("calendar"); },
  tasks: () => { S.calMode = "month"; S.taskScope = "all"; S.taskView = "calendar"; go("tasks"); },
  project: m => { S.calMode = "month"; S.projectTab = "calendar"; go("projects", m.pid); },
  team: m => { S.calMode = "month"; S.teamView = "calendar"; go("teams", m.team); }
};
const WORDS = { en: { label: "Calendar view", modes: ["Month", "Week", "Day"], show: "Show" }, id: { label: "Tampilan kalender", modes: ["Bulan", "Minggu", "Hari"], show: "Tampilkan" } };

/* everything about the period and whose tasks that can be measured, from the one on screen */
function measure() {
  const parse = s => { let m = s.match(/^rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = s.match(/^color\(srgb ([^)]+)\)/); if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; } return null; };
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const behind = el => { const stack = []; for (let n = el.parentElement; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } } let base = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* how far an element's own background stands out from what is behind it (1: not at all) */
  const shows = el => { const own = parse(getComputedStyle(el).backgroundColor), under = behind(el); return own && own[3] > 0 ? ratio(over(own, under), under) : 1; };
  const vis = sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent)[0] || null;
  const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const seg = vis(".cal-mode-seg"); if (!seg) return null;
  const own = parse(getComputedStyle(seg).backgroundColor);
  const s = box(seg), radios = [...seg.querySelectorAll('[role="radio"]')];
  const scope = vis(".cal-mobile-scope-toggle") || vis(".cal-scope-seg");
  let sc = null;
  if (scope) { const b = box(scope);
    sc = { kind: scope.classList.contains("cal-scope-seg") ? "seg" : "button", role: scope.getAttribute("role"), label: scope.getAttribute("aria-label"), icon: !!scope.querySelector("svg"), inside: seg.contains(scope) || scope.contains(seg),
      gapX: Math.max(b.l - s.r, s.l - b.r), gapY: Math.max(b.t - s.b, s.t - b.b), trackRatio: shows(scope) }; }
  return {
    role: seg.getAttribute("role"), label: seg.getAttribute("aria-label"), alpha: own ? own[3] : 0, ratio: shows(seg),
    texts: radios.map(b => b.textContent.trim()), checked: radios.map(b => b.getAttribute("aria-checked")), tabStops: radios.filter(b => b.tabIndex === 0).length,
    inBox: radios.every(b => { const r = box(b); return r.l >= s.l - 0.5 && r.r <= s.r + 0.5 && r.t >= s.t - 0.5 && r.b <= s.b + 0.5; }),
    oneLine: radios.every(b => Math.abs(box(b).t - box(radios[0]).t) < 2), onlyRadios: seg.children.length === radios.length,
    scope: sc, sideways: document.documentElement.scrollWidth - innerWidth
  };
}

async function check(page, lang, where) {
  const w = WORDS[lang];
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
    const m = await page.evaluate(measure);
    const at = `${where}, ${lang}, ${theme}`;
    expect(m, at + ": the period is on screen").not.toBeNull();
    expect(m.role, at).toBe("radiogroup");
    expect(m.label, at).toBe(w.label);
    expect(m.texts, at).toEqual(w.modes);
    expect(m.checked, at + ": Month is the chosen one").toEqual(["true", "false", "false"]);
    expect(m.tabStops, at + ": one Tab stop").toBe(1);
    expect(m.onlyRadios, at + ": nothing else inside the group").toBe(true);
    expect(m.inBox, at + ": the three options sit inside one box").toBe(true);
    expect(m.oneLine, at + ": on one line").toBe(true);
    expect(m.alpha, at + ": the track has a colour").toBeGreaterThan(0);
    expect(m.ratio, at + ": the track shows against what is behind it").toBeGreaterThan(1.1);
    expect(m.sideways, at + ": nothing scrolls sideways").toBeLessThanOrEqual(0);
    if (where.startsWith("project") || where.startsWith("team")) { expect(m.scope, at + ": a project or a team has no whose tasks").toBeNull(); continue; }
    expect(m.scope, at + ": whose tasks is there").not.toBeNull();
    expect(m.scope.inside, at + ": whose tasks is not part of the period").toBe(false);
    if (m.scope.kind === "button") {
      expect(m.scope.label, at).toMatch(new RegExp("^" + w.show + ": "));
      expect(m.scope.icon, at + ": whose tasks has its icon").toBe(true);
      expect(m.scope.gapX, at + ": space between whose tasks and the period").toBeGreaterThanOrEqual(8);
    } else {
      expect(m.scope.role, at).toBe("radiogroup");
      expect(m.scope.label, at).toBe(w.show);
      expect(m.scope.trackRatio, at + ": whose tasks has its own track").toBeGreaterThan(1.1);
      expect(Math.max(m.scope.gapX, m.scope.gapY), at + ": space between the two groups").toBeGreaterThanOrEqual(8);
    }
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
}

for (const [device, use] of [["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ["laptop", { viewport: { width: 1366, height: 860 } }]]) {
  test.describe(device, () => {
    test.use(use);
    test(`the period is one group on a visible track, apart from whose tasks (${device}, English and Indonesian)`, async ({ page }) => {
      await signIn(page);
      try {
        for (const lang of ["en", "id"]) {
          if (lang === "id") { await page.evaluate(() => setLanguage("id")); await page.waitForFunction(() => UI_LANG === "id"); }
          for (const where of Object.keys(SCENES)) {
            await page.evaluate(SCENES[where], M);
            await check(page, lang, where + " (" + device + ")");
          }
        }
      } finally { await page.evaluate(() => { setLanguage("en"); document.documentElement.removeAttribute("data-theme"); }); }
    });
  });
}

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("tapping a period chooses it; tapping whose tasks switches whose and leaves the period", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => { S.calMode = "month"; S.calScope = "all"; go("calendar"); });
    await page.locator('.calendar-mobile-controls .cal-mode-seg [data-v="week"]').tap();
    expect(await page.evaluate(() => S.calMode)).toBe("week");
    await expect(page.locator('.calendar-mobile-controls .cal-mode-seg [data-v="week"]')).toHaveAttribute("aria-checked", "true");
    await page.locator(".calendar-mobile-controls .cal-mobile-scope-toggle").tap();
    expect(await page.evaluate(() => [S.calScope, S.calMode])).toEqual(["mine", "week"]);
    await expect(page.locator(".calendar-mobile-controls .cal-mobile-scope-toggle")).toHaveAttribute("aria-label", "Show: Mine");
    await page.evaluate(() => { S.calMode = "month"; S.calScope = "all"; renderScreen(false); });
  });
});

/* a team's calendar on a phone: the bar is there, inside the panel, and does what it says */
const teamBar = () => {
  const vis = e => !!(e && e.offsetParent && e.getBoundingClientRect().width > 0);
  const panel = document.querySelector("#content .team-tasks-panel"), bar = panel && panel.querySelector(".calendar-mobile-controls");
  if (!vis(bar)) return null;
  const pb = panel.getBoundingClientRect(), body = panel.querySelector(".panel-body"), strong = bar.querySelector(".cal-mobile-date strong");
  const ctl = [...bar.querySelectorAll("button, strong, .seg")].filter(vis).map(e => { const b = e.getBoundingClientRect(); return { name: (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20), l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height }; });
  const date = [...bar.querySelectorAll(".cal-mobile-date>*")].filter(vis).map(e => e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2);
  return {
    prev: !!bar.querySelector('.cal-mobile-date [onclick="calNav(-1)"]'), next: !!bar.querySelector('.cal-mobile-date [onclick="calNav(1)"]'),
    prevName: bar.querySelector('[onclick="calNav(-1)"]').getAttribute("aria-label"), nextName: bar.querySelector('[onclick="calNav(1)"]').getAttribute("aria-label"),
    today: (bar.querySelector(".cal-mobile-today") || {}).textContent, title: strong.innerText, titleCut: strong.scrollWidth > strong.clientWidth + 1,
    period: [...bar.querySelectorAll('.cal-mode-seg[role="radiogroup"] [role="radio"]')].map(b => b.textContent.trim()), periodName: (bar.querySelector(".cal-mode-seg") || { getAttribute: () => null }).getAttribute("aria-label"),
    extras: bar.querySelectorAll(".cal-mobile-scope-toggle, .cal-scope-seg, [data-menu], [onclick^=\"filterModal\"], [data-tour]").length,
    desktopRow: vis(panel.querySelector(".calendar-toolbar")),
    inside: ctl.every(c => c.l >= pb.left - 0.5 && c.r <= pb.right + 0.5), ctl, dateOneLine: Math.max(...date) - Math.min(...date) < 4,
    sideways: document.scrollingElement.scrollWidth - innerWidth, bodySideways: body.scrollWidth - body.clientWidth
  };
};
const TEAM_WORDS = { en: { prev: "Previous", next: "Next", today: "Today" }, id: { prev: "Sebelumnya", next: "Berikutnya", today: "Hari ini" } };
test.describe("a team's calendar on a phone", () => {
  for (const w of [320, 390, 430]) {
    test.describe(w + " px", () => {
      test.use({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
      test(`a team's calendar has the month with previous and next, Today and the period, inside the panel, and they work (${w} px)`, async ({ page }) => {
        await signIn(page);
        try {
          /* there, named, inside the panel, no sideways scroll: English and Indonesian, light and dark */
          for (const lang of ["en", "id"]) {
            if (lang === "id") { await page.evaluate(() => setLanguage("id")); await page.waitForFunction(() => UI_LANG === "id"); }
            for (const theme of ["light", "dark"]) {
              await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
              await page.evaluate(m => { S.calMode = "month"; S.calMonth = TODAY.getMonth(); S.calYear = TODAY.getFullYear(); S.calDay = 0; S.teamView = "calendar"; go("teams", m.team); }, M);
              const r = await page.evaluate(teamBar), at = `team ${w}px ${lang} ${theme}`;
              expect(r, at + ": the phone's bar is on the team's calendar").not.toBeNull();
              expect(r.desktopRow, at + ": the desktop's row stays hidden").toBe(false);
              expect([r.prev, r.next], at + ": previous and next").toEqual([true, true]);
              expect([r.prevName, r.nextName], at + ": named").toEqual([TEAM_WORDS[lang].prev, TEAM_WORDS[lang].next]);
              expect(r.today, at + ": Today").toBe(TEAM_WORDS[lang].today);
              expect(r.title, at + ": the month").toBe(await page.evaluate(() => uiMol(TODAY.getMonth()) + " " + TODAY.getFullYear()));
              expect(r.titleCut, at + ": the month's name is whole").toBe(false);
              expect(r.periodName, at).toBe(WORDS[lang].label);
              expect(r.period, at + ": Month / Week / Day").toEqual(WORDS[lang].modes);
              expect(r.extras, at + ": no whose tasks, filters or saved views on one team's calendar").toBe(0);
              expect(r.dateOneLine, at + ": previous, the month, next and Today on one line").toBe(true);
              expect(r.inside, at + ": every control inside the panel — " + JSON.stringify(r.ctl)).toBe(true);
              expect(r.sideways, at + ": the page does not scroll sideways").toBeLessThanOrEqual(0);
              expect(r.bodySideways, at + ": nor does the panel").toBeLessThanOrEqual(1);
            }
          }
          await page.evaluate(() => { setLanguage("en"); document.documentElement.removeAttribute("data-theme"); });
          await page.waitForFunction(() => UI_LANG === "en");
          await page.evaluate(m => { S.calMode = "month"; S.calMonth = TODAY.getMonth(); S.calYear = TODAY.getFullYear(); S.calDay = 0; S.teamView = "calendar"; go("teams", m.team); }, M);
          const bar = page.locator("#content .team-tasks-panel .calendar-mobile-controls");
          const title = () => bar.locator(".cal-mobile-date strong").innerText();
          /* in the middle of the screen, away from the sticky top bar and the floating buttons */
          const tap = async loc => { await loc.evaluate(e => e.scrollIntoView({ block: "center" })); await loc.tap(); };
          const month = d => page.evaluate(d => { const x = new Date(TODAY.getFullYear(), TODAY.getMonth() + d, 1); return uiMol(x.getMonth()) + " " + x.getFullYear(); }, d);
          /* the team's own task due today is on the month */
          await expect(page.locator("#content .team-tasks-panel .cal-grid .chip", { hasText: "Team calendar task 0 " + TAG })).toHaveCount(1);
          /* next, previous (twice), Today */
          await tap(bar.locator('[onclick="calNav(1)"]'));
          expect(await title()).toBe(await month(1));
          await tap(bar.locator('[onclick="calNav(-1)"]'));
          await tap(bar.locator('[onclick="calNav(-1)"]'));
          expect(await title()).toBe(await month(-1));
          await tap(bar.locator(".cal-mobile-today"));
          expect(await title()).toBe(await month(0));
          /* Week: the week's days, the team's task among them; next goes a week on, Today back */
          await tap(bar.locator('.cal-mode-seg [data-v="week"]'));
          expect(await page.evaluate(() => S.calMode)).toBe("week");
          await expect(bar.locator('.cal-mode-seg [data-v="week"]')).toHaveAttribute("aria-checked", "true");
          await expect(page.locator("#content .team-tasks-panel .cal-week")).toBeVisible();
          await expect(page.locator("#content .team-tasks-panel .cal-week .chip", { hasText: "Team calendar task 0 " + TAG })).toHaveCount(1);
          expect(await title(), "the week's title (short in a team's bar up to 400 px)").toBe(await page.evaluate(() => innerWidth <= 400 ? calTitleShort() : calTitle()));
          const week0 = await title();
          await tap(bar.locator('[onclick="calNav(1)"]'));
          expect(await page.evaluate(() => S.calDay)).toBe(7);
          expect(await title()).not.toBe(week0);
          await tap(bar.locator(".cal-mobile-today"));
          expect(await title()).toBe(week0);
          /* and the week's bar still fits */
          const r = await page.evaluate(teamBar);
          expect(r.inside, "the week: every control inside the panel").toBe(true); expect(r.titleCut, "the week's title is whole: " + r.title).toBe(false); expect(r.sideways).toBeLessThanOrEqual(0); expect(r.bodySideways).toBeLessThanOrEqual(1);
          /* Day, then Month again */
          await tap(bar.locator('.cal-mode-seg [data-v="day"]'));
          expect(await page.evaluate(() => S.calMode)).toBe("day");
          await expect(page.locator("#content .team-tasks-panel .cal-dayv")).toBeVisible();
          await tap(bar.locator('.cal-mode-seg [data-v="month"]'));
          expect(await page.evaluate(() => S.calMode)).toBe("month");
        } finally {
          await page.evaluate(() => { setLanguage("en"); document.documentElement.removeAttribute("data-theme"); S.calMode = "month"; S.calMonth = TODAY.getMonth(); S.calYear = TODAY.getFullYear(); S.calDay = 0; });
        }
      });
    });
  }
});

test.describe("laptop", () => {
  test.use({ viewport: { width: 1366, height: 860 } });
  test("the keyboard: one Tab stop, the arrows move the period and the focus stays on it", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => { S.calMode = "month"; S.calScope = "all"; go("calendar"); });
    const seg = ".calendar-toolbar .cal-mode-seg";
    await page.locator(seg + ' [aria-checked="true"]').focus();
    const focused = () => page.evaluate(() => { const a = document.activeElement; return a && a.closest(".cal-mode-seg") && a.offsetParent ? a.getAttribute("data-v") + ":" + a.getAttribute("aria-checked") : null; });
    for (const [key, mode] of [["ArrowRight", "week"], ["ArrowRight", "day"], ["ArrowRight", "month"], ["ArrowLeft", "day"], ["Home", "month"], ["End", "day"], ["ArrowUp", "week"], ["ArrowDown", "day"]]) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => S.calMode), key).toBe(mode);
      expect(await focused(), key + ": the focus is on the chosen period").toBe(mode + ":true");
    }
    /* Space on the chosen period, and a click on another: the focus stays in the group */
    await page.keyboard.press("Home");
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => S.calMode)).toBe("month");
    expect(await focused()).toBe("month:true");
    await page.locator(seg + ' [data-v="week"]').click();
    expect(await page.evaluate(() => S.calMode)).toBe("week");
    expect(await focused()).toBe("week:true");
    /* whose tasks is its own radio group */
    await page.locator('.calendar-pagehead .cal-scope-seg [data-v="mine"]').click();
    expect(await page.evaluate(() => [S.calScope, S.calMode])).toEqual(["mine", "week"]);
    await expect(page.locator('.calendar-pagehead .cal-scope-seg [data-v="mine"]')).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => S.calScope)).toBe("all");
    /* the Tasks calendar: whose tasks in its toolbar is a radio group too */
    await page.evaluate(() => { S.taskScope = "all"; S.taskView = "calendar"; go("tasks"); });
    await page.locator('.calendar-toolbar .cal-scope-seg [data-v="mine"]').click();
    expect(await page.evaluate(() => S.taskScope)).toBe("mine");
    await page.evaluate(() => { S.calMode = "month"; S.calScope = "all"; S.taskScope = "all"; renderScreen(false); });
  });
});
