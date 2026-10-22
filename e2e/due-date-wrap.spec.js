/* The task panel's Due field: the date is one line always, and the relative note beside it ("29 hari terlambat",
   "120d overdue") is what wraps, between its words ("29 hari" / "terlambat"), its first line level with the date.
   Before, in the panel's 4-column header the date broke into "23 Sep" / "2026" — "24" / "Jun" / "2026" beside
   "120 hari terlambat" — while the note stayed on one line. Where even the note's longest word cannot sit beside the
   date (a 320px phone) the note goes under the date, still in whole words. Clicking the field or pressing Enter on it
   still opens the date picker. The List's Due column keeps its date on one line above the note. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

/* What the Due field of the open task looks like: heights against line heights, whether the note sits beside the
   date with its first line level with it, whether any word of the note was split over two lines, and overflow. */
const dueField = page => page.evaluate(() => {
  const lab = document.querySelector('#drawer [data-meta="due"] .task-date-read'), day = lab.querySelector(".due-day"), note = lab.querySelector(".due");
  const rect = e => e.getBoundingClientRect(), lh = e => parseFloat(getComputedStyle(e).lineHeight);
  const textBox = (node, a, b) => { const r = document.createRange(); r.setStart(node, a); r.setEnd(node, b); return r.getClientRects(); };
  const dayText = textBox(day.firstChild, 0, day.firstChild.length)[0];
  const text = note.firstChild.data, words = []; let at = 0;
  text.split(" ").forEach(w => { words.push({ w, rects: textBox(note.firstChild, at, at + w.length).length }); at += w.length + 1; });
  const firstWord = textBox(note.firstChild, 0, text.split(" ")[0].length)[0];
  const d = rect(day), n = rect(note);
  return { date: day.textContent, note: text, dayLines: d.height / lh(day), noteLines: n.height / lh(note), beside: n.left >= d.right - 0.5, under: n.top >= d.bottom - 0.5,
    level: Math.abs(firstWord.bottom - dayText.bottom), splitWords: words.filter(x => x.rects > 1).map(x => x.w),
    overflow: lab.scrollWidth > lab.clientWidth + 1 || note.scrollWidth > note.clientWidth + 1, sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});

test("the due date stays on one line and the relative note beside it wraps instead, between words", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const ids = await page.evaluate(async () => {
    const mk = async (title, due) => { const d = await apiFetch("POST", "/api/tasks", { title, status: WS.workflow[1].id, prio: "high", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], dueDate: iso(due), startDate: iso(due - 3) }); TASKS.push(hTask(d)); return d.id; };
    return { long: await mk("Due wrap 120 overdue", -120), month: await mk("Due wrap 29 overdue", -29), today: await mk("Due wrap today", 0) };
  });
  const open = async id => { await page.evaluate(id => openTask(id), id); await expect(page.locator('#drawer [data-meta="due"] .due-day')).toBeVisible(); };
  try {
    await page.evaluate(() => setLanguage("id"));
    /* the owner's case: a 183px column of the panel's 4-column header */
    for (const [id, note] of [[ids.long, "120 hari terlambat"], [ids.month, "29 hari terlambat"]]) {
      await open(id);
      const m = await dueField(page);
      expect(m.note).toBe(note);
      expect(m.dayLines, "the date is one line: " + m.date).toBeLessThan(1.5);
      expect(m.noteLines, "the note takes two lines").toBeGreaterThan(1.5);
      expect(m.noteLines, "not three").toBeLessThan(2.5);
      expect(m.beside, "the note stays beside the date").toBe(true);
      expect(m.level, "its first line level with the date").toBeLessThanOrEqual(4);
      expect(m.splitWords, "wrapped between words, never inside one").toEqual([]);
      expect(m.overflow).toBe(false);
      expect(m.sideways).toBe(false);
    }
    await open(ids.today);
    let m = await dueField(page);
    expect(m.note).toBe("hari ini");
    expect(m.dayLines).toBeLessThan(1.5);
    expect(m.noteLines, "a short note keeps one line").toBeLessThan(1.5);
    expect(m.beside).toBe(true);
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
    /* English too: "120d overdue" wraps after "120d", the date "Jun 24, 2026" stays whole */
    await page.evaluate(() => setLanguage("en"));
    await open(ids.long);
    m = await dueField(page);
    expect(m.note).toBe("120d overdue");
    expect(m.dayLines).toBeLessThan(1.5);
    expect(m.splitWords).toEqual([]);
    expect(m.beside).toBe(true);
    await page.evaluate(() => setLanguage("id"));
    /* a phone: two columns, the note still wraps beside the date */
    await page.setViewportSize({ width: 390, height: 844 });
    await open(ids.long);
    m = await dueField(page);
    expect(m.dayLines).toBeLessThan(1.5);
    expect(m.noteLines).toBeGreaterThan(1.5);
    expect(m.beside).toBe(true);
    expect(m.splitWords).toEqual([]);
    expect(m.sideways).toBe(false);
    /* a 320px phone: "terlambat" cannot sit beside the date, so the note goes under it, the date still one line */
    await page.setViewportSize({ width: 320, height: 700 });
    await open(ids.long);
    m = await dueField(page);
    expect(m.dayLines).toBeLessThan(1.5);
    expect(m.under, "the note under the date").toBe(true);
    expect(m.splitWords).toEqual([]);
    expect(m.overflow).toBe(false);
    expect(m.sideways).toBe(false);
    /* the List's Due column: the date over the note, the date one line */
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => { closeDrawer(); S.taskScope = "all"; go("tasks", "list"); });
    await expect(page.locator(".lcol-due .due-day").first()).toBeVisible();
    const list = await page.evaluate(() => [...document.querySelectorAll(".lcol-due .due-day")].map(e => ({ t: e.textContent, lines: e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight), ws: getComputedStyle(e).whiteSpace })));
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const x of list) { expect(x.lines, x.t).toBeLessThan(1.5); expect(x.ws).toBe("nowrap"); }
  } finally {
    await page.evaluate(async ids => { closeDrawer(); setLanguage("en"); for (const id of Object.values(ids)) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, ids);
  }
});
