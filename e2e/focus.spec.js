/* A dialog puts the cursor in its first field a moment after it opens — but never pulls it back from
   a field the person already went to. It used to: someone who clicked the note field of "Attach a
   link as Version" straight away had the note typed into the link (…/BannerFigma%20frame). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("a field the person went to keeps the cursor", async ({ page }) => {
  await signIn(page);
  /* any dialog */
  const generic = await page.evaluate(() => new Promise(done => {
    openModal("Two fields", '<input id="ff_a"><input id="ff_b">');
    document.getElementById("ff_b").focus();
    setTimeout(() => { done(document.activeElement && document.activeElement.id); closeModal(); }, 200);
  }));
  expect(generic).toBe("ff_b");
  /* the dialog that lost a version's note into its link */
  const taskId = await page.evaluate(() => apiFetch("POST", "/api/tasks", { title: "Focus target", status: WS.workflow[0].id, assignee: ME }).then(d => { TASKS.push(hTask(d)); return d.id; }));
  const typed = await page.evaluate(id => new Promise(done => {
    S.drawerTask = id;
    linkVersionModal();
    const note = document.getElementById("lv_note"); note.focus();
    setTimeout(() => { const r = { active: document.activeElement && document.activeElement.id, url: document.getElementById("lv_url").value }; closeModal(); done(r); }, 200);
  }), taskId);
  expect(typed.active).toBe("lv_note");
  await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id), taskId);
  /* and with nothing chosen yet, the first field still gets the cursor */
  const first = await page.evaluate(() => new Promise(done => {
    openModal("Two fields", '<input id="ff_c"><input id="ff_d">');
    setTimeout(() => { done(document.activeElement && document.activeElement.id); closeModal(); }, 200);
  }));
  expect(first).toBe("ff_c");
});
