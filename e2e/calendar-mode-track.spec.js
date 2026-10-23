/* The calendar's Month / Week / Day is one control on a track that shows, apart from whose tasks (Oct 2026). The owner's
   phone showed "Tim  Bulan  Minggu  Hari" as one row of loose pills: the period's track was the page's own grey and
   whose tasks was a black pill like the chosen period, so people took the period for the Mine / All filter.
   Checked on a phone (390 px) and a laptop (1366 px), in English and Indonesian, light and dark, on the Calendar screen,
   the Tasks calendar and a project's calendar: the period is a radio group named "Calendar view" / "Tampilan kalender"
   whose three options sit inside one box on one line; its track differs from what is behind it; whose tasks is its own
   control (a button with an icon named "Show: …" / "Tampilkan: …" on a phone, a radio group named "Show" /
   "Tampilkan" with its own track on a laptop) with space between the two; nothing scrolls sideways; and the arrow keys
   move the period with the focus kept on it. One project is made through the API and removed after; the language,
   the look and the remembered calendar choices are put back. */
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
    const pid = "p" + tag;
    await apiFetch("POST", "/api/projects", { id: pid, name: "Calendar track " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20) });
    await reloadAll();
    return { pid, was: { calMode: S.calMode, calScope: S.calScope, taskScope: S.taskScope, taskView: S.taskView, projectTab: S.projectTab } };
  }, TAG);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => {
    setLanguage("en"); document.documentElement.removeAttribute("data-theme");
    Object.assign(S, m.was); go("home");
    await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {});
  }, M);
  await page.close();
});

const SCENES = {
  calendar: () => { S.calMode = "month"; S.calScope = "all"; go("calendar"); },
  tasks: () => { S.calMode = "month"; S.taskScope = "all"; S.taskView = "calendar"; go("tasks"); },
  project: pid => { S.calMode = "month"; S.projectTab = "calendar"; go("projects", pid); }
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
    if (where.startsWith("project")) { expect(m.scope, at + ": a project has no whose tasks").toBeNull(); continue; }
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
            await page.evaluate(SCENES[where], M.pid);
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
