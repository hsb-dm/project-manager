/* A checklist item is edited where it stands (double-click its text; Enter or clicking away keeps it, Esc leaves it
   as it was) and dragged by its whole row to another place — or moved from the keyboard: Space on the handle, then
   ↑ / ↓. The text cursor shows only over the words; anywhere else on the row is a hand, for dragging. Typing survives
   a redraw; Esc never closes the panel; a done item stays done wherever it goes. The progress note shows the
   checklist in one line. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("checklist items: edit in place, drag and keyboard reorder", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const id = await page.evaluate(async () => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Checklist " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); const tk = hTask(d); TASKS.push(tk);
    await editTaskWith(tk, t => { taskMeta(t).checklist = [{ text: "One", done: false }, { text: "Two", done: true }, { text: "Three", done: false }]; });
    return d.id;
  });
  const saved = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => ((t.meta || {}).checklist || []).map(x => x.text + (x.done ? " ✓" : ""))), id);
  const row = i => page.locator('#drawer .chk-item[data-index="' + i + '"]');
  const words = i => row(i).locator(".chk-t");
  const edit = page.locator("#chkEdit");
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
    await expect(page.locator("#drawer .chk-item")).toHaveCount(3);

    /* the text cursor over the words only; a hand over the rest of the row */
    await row(0).scrollIntoViewIfNeeded();
    const cursors = await page.evaluate(() => {
      const r = document.querySelector('#drawer .chk-item[data-index="0"]'), w = r.querySelector(".chk-t"), rb = r.getBoundingClientRect(), wb = w.getBoundingClientRect();
      const at = (x, y) => { const el = document.elementFromPoint(x, y); return r.contains(el) ? getComputedStyle(el).cursor : "outside: " + (el && (el.id || el.className)); };
      return { words: at(wb.left + wb.width / 2, wb.top + wb.height / 2), after: at(wb.right + 30, wb.top + wb.height / 2), edge: at(rb.left + 2, rb.top + 2) };
    });
    expect(cursors).toEqual({ words: "text", after: "grab", edge: "grab" });

    /* one click does nothing; a double-click edits, Enter keeps it — the done mark stays */
    await words(1).click();
    await expect(edit).toHaveCount(0);
    await words(1).dblclick();
    await expect(edit).toBeFocused(); await expect(edit).toHaveValue("Two");
    await edit.fill("Two, edited"); await edit.press("Enter");
    await expect.poll(saved).toEqual(["One", "Two, edited ✓", "Three"]);
    await expect(words(1)).toHaveText("Two, edited");

    /* Esc leaves it as it was, the panel stays open, and the words get the focus back */
    await words(0).dblclick();
    await edit.fill("nope"); await edit.press("Escape");
    await expect(edit).toHaveCount(0);
    await expect(words(0)).toHaveText("One");
    await expect(words(0)).toBeFocused();
    expect(await page.evaluate(() => S.drawerTask)).toBe(id);

    /* clicking away keeps what was typed */
    await words(2).dblclick();
    await edit.fill("Three b");
    await page.locator("#drawer .chk-head b").click();
    await expect.poll(saved).toEqual(["One", "Two, edited ✓", "Three b"]);

    /* typing survives a redraw (a colleague's update): same box, caret where it was */
    await words(0).dblclick();
    await page.keyboard.press("End"); await page.keyboard.type(" x");
    await page.evaluate(() => renderDrawer());
    await expect(edit).toBeFocused(); await expect(edit).toHaveValue("One x");
    await page.keyboard.type("y"); await page.keyboard.press("Enter");
    await expect.poll(saved).toEqual(["One xy", "Two, edited ✓", "Three b"]);

    /* the row being typed in is not dragged (the text in its box can be selected); the others are */
    await words(1).dblclick();
    await expect(row(1)).not.toHaveAttribute("draggable", "true");
    await expect(row(0)).toHaveAttribute("draggable", "true");
    await edit.press("Escape");

    /* drag the first item below the last — taken by the empty part of its row, away from the words and the handle */
    const box = await row(0).boundingBox();
    await row(0).dragTo(row(2), { sourcePosition: { x: box.width - 60, y: box.height / 2 }, targetPosition: { x: 40, y: 20 } });
    await expect.poll(saved).toEqual(["Two, edited ✓", "Three b", "One xy"]);
    await expect(words(2)).toHaveText("One xy");

    /* from the keyboard: Space grabs, ↓ moves, the handle keeps focus, Esc lets go without closing the panel */
    await row(0).locator(".drag-handle").focus();
    await page.keyboard.press("Space"); await page.keyboard.press("ArrowDown");
    await expect.poll(saved).toEqual(["Three b", "Two, edited ✓", "One xy"]);
    await expect(row(1).locator(".drag-handle")).toBeFocused();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => S.drawerTask)).toBe(id);
    await expect(row(1).locator(".chk-box")).toBeChecked();

    /* adding keeps the box in focus, so several items go in one after another */
    await page.locator("#chkAdd").fill("Four"); await page.keyboard.press("Enter");
    await expect.poll(saved).toEqual(["Three b", "Two, edited ✓", "One xy", "Four"]);
    await expect(page.locator("#chkAdd")).toBeFocused();
    await page.keyboard.type("Five"); await page.keyboard.press("Enter");
    await expect.poll(saved).toEqual(["Three b", "Two, edited ✓", "One xy", "Four", "Five"]);

    /* the progress note shows it in one line — how far, what is next — and the line opens the checklist */
    await page.evaluate(() => { S.drawerTab = "progress"; renderDrawer(); });
    const line = page.locator("#drawer .pn-chk");
    await expect(line).toContainText("1/5"); await expect(line).toContainText("Next: Three b");
    await expect(page.locator("#drawer .chk-item")).toHaveCount(0);
    await line.click();
    expect(await page.evaluate(() => S.drawerTab)).toBe("brief");
    await expect(page.locator("#drawer .chk-item")).toHaveCount(5);
    expect(await page.evaluate(() => [pnChecklistLine({ meta: {} }), /All done/.test(pnChecklistLine({ meta: { checklist: [{ text: "a", done: true }] } }))])).toEqual(["", true]);

    /* checklist, effort and related items live on the Brief tab only — not under Assets & versions or Activity */
    for (const [tab, label] of [["files", "Assets & versions"], ["activity", "Activity"]]) {
      await page.evaluate(t => { S.drawerTab = t; renderDrawer(); }, tab);
      await expect(page.locator("#drawer .tab.on")).toContainText(label);
      await expect(page.locator("#drawer .chk, #drawer .effort, #drawer .related")).toHaveCount(0);
    }
    await page.evaluate(() => { S.drawerTab = "brief"; renderDrawer(); });
    await expect(page.locator("#drawer .chk, #drawer .effort, #drawer .related")).toHaveCount(3);

    /* someone who cannot edit the task gets neither */
    const ro = await page.evaluate(i => checklistHtml(task(i), false), id);
    expect(ro).not.toContain("drag-handle"); expect(ro).not.toContain("checklistEdit"); expect(ro).not.toContain("draggable");
    expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("Double-click to edit"), tr("Drag to reorder, or press Space and use the arrow keys"), tr("All done")]; UI_LANG = was; return r; })).toEqual(["Klik dua kali untuk mengedit", "Seret untuk mengubah urutan, atau tekan Spasi lalu pakai tombol panah", "Semua selesai"]);
  } finally {
    await page.evaluate(i => { CHK.edit = null; closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});
