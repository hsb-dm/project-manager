/* The task panel's Due field: the date is one line always, and the relative note beside it ("29 hari terlambat",
   "120d overdue") is what wraps, between its words ("29 hari" / "terlambat"). The date and the note are centred on
   each other ("bikin rata tengah"): a two-line note hangs half above and half below the date's line, and the date
   stays level with the values of the fields beside it (Project, Label), whether the note takes one line or two.
   Before, in the panel's 4-column header the date broke into "23 Sep" / "2026" — "24" / "Jun" / "2026" beside
   "120 hari terlambat" — while the note stayed on one line; then the note's first line sat level with the date and
   its second hung below. Where the note cannot sit beside the date (a 320px phone) it goes under the date, still in
   whole words and never over it. Clicking the field or pressing Enter on it still opens the date picker. The List's
   Due column keeps its date on one line above the note. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

/* What the Due field of the open task looks like, from the text itself (the note's box is one line tall on purpose,
   its lines hang out of it): the date's lines, the note's lines, whether the note is beside or under the date, the
   distance between their vertical centres, whether any word of the note was split over two lines, whether any of
   the text overlaps (the date and the note, the field's name above it, the field's box), the date's top against the
   Project value's top when Project is in the same row, and overflow. Also used by the sweep below. */
const MEASURE = () => {
  const cell = document.querySelector('#drawer [data-meta="due"]'), lab = cell.querySelector(".task-date-read"), day = lab.querySelector(".due-day"), note = lab.querySelector(".due");
  const rect = e => e.getBoundingClientRect();
  const textRects = (node, a, b) => { const r = document.createRange(); r.setStart(node, a); r.setEnd(node, b); return [...r.getClientRects()].filter(x => x.width > 0); };
  const lines = rs => new Set(rs.map(x => Math.round(x.top))).size;
  const dayRects = textRects(day.firstChild, 0, day.firstChild.length), d = dayRects[0];
  const text = note.firstChild.data, noteRects = textRects(note.firstChild, 0, text.length), words = []; let at = 0;
  text.split(" ").forEach(w => { words.push({ w, lines: lines(textRects(note.firstChild, at, at + w.length)) }); at += w.length + 1; });
  const n = { top: Math.min(...noteRects.map(x => x.top)), bottom: Math.max(...noteRects.map(x => x.bottom)), left: Math.min(...noteRects.map(x => x.left)), right: Math.max(...noteRects.map(x => x.right)) };
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const k = rect(cell.querySelector(".k")), box = rect(lab), cs = getComputedStyle(lab), inner = { left: box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), right: box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) };
  const proj = document.querySelector('#drawer [data-meta="proj"]'), projValue = proj && proj.querySelector(".task-read-value .trv-text, .task-read-value");
  let projTop = null;
  if (projValue && getComputedStyle(proj).display !== "none" && Math.abs(rect(proj).top - rect(cell).top) < 2) { const w = document.createTreeWalker(projValue, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && !t.data.trim()); if (t) projTop = textRects(t, 0, t.data.length)[0].top; }
  return { date: day.textContent, note: text, dayLines: lines(dayRects), noteLines: lines(noteRects), beside: n.left >= d.right - 0.5, under: n.top >= d.bottom - 0.5,
    centre: Math.abs((d.top + d.bottom) / 2 - (n.top + n.bottom) / 2), splitWords: words.filter(x => x.lines > 1).map(x => x.w),
    overlap: noteRects.some(r => hit(r, d)), underName: Math.min(d.top, n.top) - k.bottom, outOfBox: Math.max(box.top - Math.min(d.top, n.top), Math.max(d.bottom, n.bottom) - box.bottom),
    outSideways: Math.max(d.right, n.right) - inner.right, vsProject: projTop === null ? null : Math.abs(d.top - projTop),
    overflow: lab.scrollWidth > lab.clientWidth + 1, sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth };
};
const dueField = page => page.evaluate(`(${MEASURE})()`);
/* what is wrong with the field, if anything, whatever the note and the date say: the date on more than one line, a
   word of the note split, the note over the date, anything reaching up into the field's name or out of the field's
   box or out sideways, and, beside the date, more than two lines or the two not centred on each other (used here and
   in the page for the sweep) */
const PROBLEMS = m => {
  const why = [];
  if (m.dayLines !== 1) why.push("the date takes " + m.dayLines + " lines");
  if (m.splitWords.length) why.push("split inside a word: " + m.splitWords.join(" "));
  if (m.overlap) why.push("the note covers the date");
  if (m.underName < -0.5) why.push("reaches into the field's name by " + (-m.underName).toFixed(1) + "px");
  if (m.outOfBox > 1) why.push("out of the field's box by " + m.outOfBox.toFixed(1) + "px");
  if (m.outSideways > 0.5) why.push("out sideways by " + m.outSideways.toFixed(1) + "px");
  if (!m.beside && !m.under) why.push("neither beside the date nor under it");
  if (m.beside && m.noteLines > 2) why.push(m.noteLines + " lines beside the date");
  if (m.beside && m.centre > 2) why.push("centres " + m.centre.toFixed(1) + "px apart");
  return why;
};
const clean = (m, what) => expect(PROBLEMS(m), what).toEqual([]);

test("the due date stays on one line, the relative note beside it wraps between words, and the two are centred on each other", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const ids = await page.evaluate(async () => {
    const name = "Due wrap project " + Date.now(); await apiFetch("POST", "/api/projects", { name, status: "active", owner: ME, teams: [] });
    const proj = (await apiFetch("GET", "/api/bootstrap")).projects.find(p => p.name === name).id;
    const mk = async (title, due) => { const d = await apiFetch("POST", "/api/tasks", { title, status: WS.workflow[1].id, prio: "high", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], proj, dueDate: iso(due), startDate: iso(due - 3) }); return d.id; };
    const out = { proj, long: await mk("Due wrap 120 overdue", -120), month: await mk("Due wrap 29 overdue", -29), today: await mk("Due wrap today", 0) };
    await reloadAll(); return out;
  });
  const open = async id => { await page.evaluate(id => openTask(id), id); await expect(page.locator('#drawer [data-meta="due"] .due-day')).toBeVisible(); };
  try {
    await page.evaluate(() => setLanguage("id"));
    /* the owner's case: a 183px column of the panel's 4-column header, on a laptop and a smaller one */
    for (const width of [1366, 1100]) {
      await page.setViewportSize({ width, height: 768 });
      for (const [id, note] of [[ids.long, "120 hari terlambat"], [ids.month, "29 hari terlambat"]]) {
        await open(id);
        const m = await dueField(page);
        expect(m.note).toBe(note);
        clean(m, width + " " + note);
        expect(m.noteLines, "the note takes two lines").toBe(2);
        expect(m.beside, "the note stays beside the date").toBe(true);
        expect(m.centre, "the date at the note's vertical middle").toBeLessThanOrEqual(2);
        expect(m.vsProject, "the date level with the Project value beside it").not.toBeNull();
        expect(m.vsProject, "the date level with the Project value beside it").toBeLessThanOrEqual(2);
        expect(m.overflow).toBe(false);
        expect(m.sideways).toBe(false);
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await open(ids.today);
    let m = await dueField(page);
    expect(m.note).toBe("hari ini");
    clean(m, "hari ini");
    expect(m.noteLines, "a short note keeps one line").toBe(1);
    expect(m.beside).toBe(true);
    expect(m.centre, "a one-line note centred too").toBeLessThanOrEqual(2);
    expect(m.vsProject, "level with Project with a one-line note too, so the date never moves").toBeLessThanOrEqual(2);
    /* still the date picker's click target, by mouse and by keyboard */
    const picks = await page.evaluate(async () => {
      const proto = HTMLInputElement.prototype, had = Object.prototype.hasOwnProperty.call(proto, "showPicker"), orig = proto.showPicker; let n = 0;
      proto.showPicker = function () { if (this.type === "date") n++; };
      try {
        const lab = document.querySelector('#drawer [data-meta="due"] .task-date-read');
        lab.querySelector(".due").click();
        lab.focus(); lab.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        return n;
      } finally { if (had) proto.showPicker = orig; else delete proto.showPicker; }
    });
    expect(picks, "a click on the note and Enter on the field each open the picker").toBe(2);
    /* English too: "120d overdue" wraps after "120d", the date "Jun 24, 2026" stays whole, both centred */
    await page.evaluate(() => setLanguage("en"));
    await open(ids.long);
    m = await dueField(page);
    expect(m.note).toBe("120d overdue");
    clean(m, "120d overdue");
    expect(m.noteLines).toBe(2);
    expect(m.beside).toBe(true);
    expect(m.vsProject).toBeLessThanOrEqual(2);
    await page.evaluate(() => setLanguage("id"));
    /* dark mode changes colours only */
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await open(ids.long);
    m = await dueField(page);
    clean(m, "dark");
    expect(m.noteLines).toBe(2);
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    /* every kind of note the app writes, beside short and long dates in both languages, in a field from 120px to
       330px wide, a pixel at a time: nothing overlaps, nothing runs out, beside the date the note is two lines at most
       and centred on it, otherwise under it (the field's own width and texts set for the sweep, all put back after) */
    const sweep = () => page.evaluate(`(() => { const measure = ${MEASURE}, problems = ${PROBLEMS};
      const lab = document.querySelector('#drawer [data-meta="due"] .task-date-read'), day = lab.querySelector(".due-day").firstChild, note = lab.querySelector(".due").firstChild;
      const was = { day: day.data, note: note.data, width: lab.style.width, flex: lab.style.flex }, bad = [], seen = { beside: 0, under: 0, both: 0 };
      const notes = ["1000 hari terlambat", "120 hari terlambat", "29 hari terlambat", "120 hari lagi", "12 hari lagi", "5 hari lagi", "hari ini", "besok", "1000d overdue", "120d overdue", "in 120d", "in 5d", "tomorrow", "today"];
      try {
        for (const d of ["28 Agu 2026", "1 Mei 2026", "Dec 28, 2026", "May 1, 2026"]) for (const t of notes) for (let w = 120; w <= 330; w++) {
          day.data = d; note.data = t; lab.style.flex = "none"; lab.style.width = w + "px";
          const m = measure(), why = problems(m); if (m.beside) seen.beside++; if (m.under) seen.under++; if (m.beside && m.noteLines === 2) seen.both++;
          if (why.length) bad.push(w + "px field, " + d + " / " + t + ": " + why.join(", "));
        }
      } finally { day.data = was.day; note.data = was.note; lab.style.width = was.width; lab.style.flex = was.flex; }
      return { bad: bad.slice(0, 20), seen };
    })()`);
    for (const width of [1366, 780, 390]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 768 });
      await open(ids.long);
      const s = await sweep();
      expect(s.bad, width + "px screen").toEqual([]);
      expect(s.seen.beside, "the sweep saw the note beside the date").toBeGreaterThan(5000);
      expect(s.seen.both, "in two lines beside it").toBeGreaterThan(1000);
      expect(s.seen.under, "and under it").toBeGreaterThan(1000);
    }
    /* a phone: two columns, the note still wraps beside the date, centred on it */
    await page.setViewportSize({ width: 390, height: 844 });
    await open(ids.long);
    m = await dueField(page);
    clean(m, "390");
    expect(m.noteLines).toBe(2);
    expect(m.beside).toBe(true);
    expect(m.sideways).toBe(false);
    /* a 320px phone: the note cannot sit beside the date, so it goes under it, the date still one line */
    await page.setViewportSize({ width: 320, height: 700 });
    for (const id of [ids.long, ids.today]) {
      await open(id);
      m = await dueField(page);
      clean(m, "320 " + m.note);
      expect(m.under, "the note under the date").toBe(true);
      expect(m.noteLines).toBe(1);
      expect(m.overflow).toBe(false);
      expect(m.sideways).toBe(false);
    }
    /* the List's Due column: the date over the note, the date one line */
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => { closeDrawer(); S.taskScope = "all"; go("tasks", "list"); });
    await expect(page.locator(".lcol-due .due-day").first()).toBeVisible();
    const list = await page.evaluate(() => [...document.querySelectorAll(".lcol-due .due-day")].map(e => ({ t: e.textContent, lines: e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight), ws: getComputedStyle(e).whiteSpace })));
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const x of list) { expect(x.lines, x.t).toBeLessThan(1.5); expect(x.ws).toBe("nowrap"); }
  } finally {
    await page.evaluate(async ids => { closeDrawer(); setLanguage("en"); document.documentElement.removeAttribute("data-theme"); for (const k of ["long", "month", "today"]) await apiFetch("DELETE", "/api/tasks/" + ids[k]).catch(() => {}); await apiFetch("DELETE", "/api/projects/" + ids.proj).catch(() => {}); await reloadAll(); }, ids);
  }
});
