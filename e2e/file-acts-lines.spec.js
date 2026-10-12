/* A file's actions in Assets & versions: one line held both kinds of button, and the file's name and details
   were squeezed into what was left (the name cut short, the date and link broken over four lines). Now, when a
   file has both kinds, they are two lines: first what it is to the task (Use as new version, Mark as final /
   Make final version, Not final), then the file itself (View comment, Preview, Save, Open, Remove). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const FIGMA = "https://www.figma.com/design/LX5o1jcOcP2rc7mOa1kF7V/%25F0%259F%2593%25B1APPMS_Banner?node-id=7728-62&p=f&t=fPu6sS18WDJDV1jd-0";

test("final files and files from comments: task actions on one line, file actions on the next; the name has room", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "File actions", status: WS.workflow[2].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "comments"; renderDrawer(); return d.id; });
  try {
    await page.evaluate(f => { cmtStage({ name: "Figma KV Insurance", url: f, named: true }); cmtStage({ name: "Key visual final.pdf", url: "https://example.org/files/kv-final.pdf" }); document.getElementById("cmtText").value = "Referensi"; postComment(); }, FIGMA);
    await expect.poll(() => page.evaluate(id => task(id).files.length, id), { timeout: 10000 }).toBe(2);
    await page.evaluate(() => { const tk = task(S.drawerTask); markFileFinal(tk.files.find(x => /kv-final/.test(x.url || "")).id, true); setTab("files"); });
    const finalRow = page.locator("#drawer .av-sec .file", { hasText: "Key visual final.pdf" });
    const fromRow = page.locator("#drawer .av-from-comments .file", { hasText: "Figma KV Insurance" });
    await expect(finalRow).toBeVisible(); await expect(fromRow).toBeVisible();

    const lines = async row => row.evaluate(r => { const acts = r.querySelector(".file-acts"), task = acts.querySelector(".fa-task"), file = acts.querySelector(".fa-file"), txt = el => [...el.querySelectorAll(".btn")].map(b => b.textContent.trim()).filter(Boolean);
      return { two: acts.classList.contains("two"), task: txt(task), file: txt(file), stacked: task.getBoundingClientRect().bottom <= file.getBoundingClientRect().top + 1, trash: !!file.querySelector('[aria-label="Remove file"]') }; });
    const fin = await lines(finalRow), from = await lines(fromRow);
    expect(fin.two && from.two).toBe(true);
    expect(fin.task.join("|")).toMatch(/Not final/);
    expect(fin.file.join("|")).toMatch(/Open/);
    expect(from.task).toEqual(expect.arrayContaining(["Use as new version", "Mark as final"]));
    expect(from.task.join("|")).not.toMatch(/View comment|Preview|Open/);
    expect(from.file[0], "the comment it came from leads the file's line").toBe("View comment");
    expect(from.file.join("|")).toMatch(/Preview.*Save.*Open/);
    expect(from.stacked && fin.stacked, "two lines, the task's first").toBe(true);
    expect(from.trash).toBe(true);
    /* the grey shape is rounded, with room inside; Remove stands apart at the far right, centred top to bottom;
       the two lines end together (Mark as final above Open) */
    const shape = await fromRow.evaluate(r => { const b = x => x.getBoundingClientRect(), cs = getComputedStyle(r), row = b(r), del = b(r.querySelector(".file-del")), t = b(r.querySelector(".fa-task")), lastLine = [...r.querySelectorAll(".fa-file .btn")].pop();
      return { radius: parseFloat(cs.borderTopLeftRadius), padL: parseFloat(cs.paddingLeft), padT: parseFloat(cs.paddingTop), delApart: del.left >= Math.max(t.right, b(lastLine).right) - 1, delCentre: Math.abs((del.top + del.bottom) / 2 - (row.top + row.bottom) / 2), delRight: row.right - del.right, linesEnd: Math.abs(t.right - b(lastLine).right) }; });
    expect(shape.radius).toBeGreaterThanOrEqual(10);
    expect(shape.padL).toBeGreaterThanOrEqual(12); expect(shape.padT).toBeGreaterThanOrEqual(10);
    expect(shape.delApart, "Remove is not in a line of buttons").toBe(true);
    expect(shape.delCentre, "Remove centred top to bottom").toBeLessThanOrEqual(2);
    expect(shape.delRight, "Remove at the far right").toBeLessThanOrEqual(20);
    expect(shape.linesEnd, "the two lines end together").toBeLessThanOrEqual(1);
    /* the name has room now, and the long link stays inside its row */
    const room = await fromRow.evaluate(r => { const t = r.querySelector(".t"), mono = r.querySelector(".m .mono"), info = t.parentElement; return { nameCut: t.scrollWidth > t.clientWidth + 1, monoInside: mono.getBoundingClientRect().right <= info.getBoundingClientRect().right + 1 }; });
    expect(room.nameCut, "Figma KV Insurance is not cut short").toBe(false);
    expect(room.monoInside, "the link is cut short inside the row").toBe(true);
  } finally {
    await page.evaluate(async id => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});
