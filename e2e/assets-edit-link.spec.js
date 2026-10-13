/* Assets & versions (Oct 2026), in Indonesian: every delivered file says where it stands — the final version or not
   yet; making one final approves it with the right words ("Versi 1 disetujui", which was "Version 1 approved") and
   without telling the person to submit it for review; a link can be edited — a delivered link, and a version
   attached as a link while it is undecided; a Figma link reads as its file's words, not its key. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const FIG1 = "https://www.figma.com/design/Final999/KV-Final", FIG2 = "https://www.figma.com/design/New777/KV-v2";

test("final or not yet, making it final in Indonesian, and editing a link", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.route("**/api/links/title?*", r => { const u = new URL(r.request().url()).searchParams.get("url"); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: /Better55/.test(u) ? "KV Better" : "" }) }); });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async o => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Final or not", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME] });
    TASKS.push(hTask(d));
    await editTaskWith(task(d.id), t => { t.files.push(F("KV final export", "document", "link", "Link", 0, o.FIG1)); t.files.push(F("Brief deck", "document", "link", "Link", 0, "https://example.org/brief")); });
    UI_LANG = "id"; openTask(d.id); S.drawerTab = "files"; renderDrawer(); return d.id;
  }, { FIG1 });
  const row = name => page.locator("#drawer .file", { hasText: name });
  const toasts = page.locator("#toasts");
  try {
    /* a Figma link's words are its file's, not its key */
    expect(await page.evaluate(u => cmtLinkLabel(u), FIG2)).toBe("KV v2");
    /* where each delivered file stands */
    await expect(row("KV final export").locator(".av-state")).toHaveText("Belum final");
    await expect(row("KV final export").locator(".av-make-final")).toHaveText(/Jadikan versi final/);
    /* made final: approved, in Indonesian, without "submit it for review" */
    await row("KV final export").locator(".av-make-final").click();
    await page.locator("#modal .btn.primary").click();
    await expect(toasts).toContainText("Versi 1 disetujui");
    /* read at once: a negative expect waits, and a toast fades on its own */
    const said = await toasts.textContent();
    expect(said).not.toContain("Version 1 approved");
    expect(said, "made final: approved, not told to submit it").not.toContain("kirim untuk review");
    await expect(row("KV final export").locator(".av-state")).toHaveText("Versi 1 · Final");
    expect(await page.evaluate(id => stageKind(task(id).status), id)).toBe("closed");
    /* the approved version keeps its link: no Edit link on it */
    await expect(page.locator("#drawer .ver-edit-link")).toHaveCount(0);

    /* a delivered link is edited: the address, and its name read from it when the name was not typed */
    await row("KV final export").locator(".av-edit-link").click();
    await expect(page.locator("#modal")).toContainText("Edit tautan");
    await expect(page.locator("#el_url")).toHaveValue(FIG1);
    await page.locator("#el_url").fill("https://www.figma.com/design/Better55/KV-Better-File");
    await expect(page.locator("#el_name"), "a typed name stays").toHaveValue("KV final export");
    await page.locator("#modal .btn.primary").click();
    await expect.poll(() => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).files.map(f => f.url + " | " + f.name), id)).toContain("https://www.figma.com/design/Better55/KV-Better-File | KV final export");
    await expect(toasts).toContainText("Tautan diperbarui");
    /* to a Drive link: a Drive file now; the name left empty is read (stand-in when it cannot be) */
    await row("Brief deck").locator(".av-edit-link").click();
    await page.locator("#el_url").fill("https://drive.google.com/file/d/1AbCdEfGhIjK/view");
    await page.locator("#el_name").fill("");
    await page.locator("#modal .btn.primary").click();
    await expect.poll(() => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).files.find(f => /drive\.google/.test(f.url) || f.name === "Brief deck"), id)).toMatchObject({ url: "https://drive.google.com/file/d/1AbCdEfGhIjK/view", driveId: "1AbCdEfGhIjK" });

    /* a version attached as a link, still undecided, has Edit link; the note follows the link when it was not written */
    await page.evaluate(() => linkVersionModal());
    await page.locator("#lv_url").fill(FIG2);
    await page.locator("#modal .btn.primary").click();
    await expect.poll(() => page.evaluate(id => task(id).versions.map(v => v.note), id)).toContain("KV v2");
    await page.locator("#drawer .ver-edit-link").click();
    await expect(page.locator("#modal")).toContainText("Edit tautan Versi 2");
    await page.locator("#el_url").fill("https://www.figma.com/design/Better55/KV-Better-File");
    await expect(page.locator("#el_name"), "the note was the link's words: it follows the new link's name").toHaveValue("KV Better");
    await page.locator("#modal .btn.primary").click();
    await expect.poll(() => page.evaluate(async id => { const v = (await apiFetch("GET", "/api/tasks/" + id)).versions.find(x => x.n === 2); return v && v.driveUrl + " | " + v.note; }, id)).toBe("https://www.figma.com/design/Better55/KV-Better-File | KV Better");
    /* the approved version keeps the link it was approved with, even when asked directly */
    const v1 = await page.evaluate(async id => { const d = await apiFetch("GET", "/api/tasks/" + id); d.versions.find(v => v.n === 1).driveUrl = "https://example.org/other"; await apiFetch("PUT", "/api/tasks/" + id, d); return (await apiFetch("GET", "/api/tasks/" + id)).versions.find(v => v.n === 1).driveUrl; }, id);
    expect(v1).toBe(FIG1);
  } finally {
    await page.evaluate(async id => { UI_LANG = "en"; closeModal(); closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});
