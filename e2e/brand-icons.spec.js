/* A link to a known service shows that service's mark (Simple Icons, CC0 — src/brand-icons.js), not Google
   Drive's: in the card a chip opens on hover, on a comment's link chip, on an Assets & versions row and on a
   chat link card. The card's name is the link's name (it read the chip's "FIG" badge before). Brands that are in
   no open icon set show their initials on their colour. A near-black mark follows the text colour (dark mode). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("known services show their own mark; the card names the link; Drive's mark only for Google", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  /* which service a link is */
  const map = await page.evaluate(() => [
    "https://www.figma.com/design/AbC/KV", "https://figma.com/file/x", "https://youtu.be/abc", "https://acme.notion.site/brief", "https://www.canva.com/design/D/view",
    "https://lnkd.in/abc", "https://acme.atlassian.net/wiki/spaces/X", "https://acme.atlassian.net/browse/ZC-1", "https://docs.google.com/forms/d/e/abc/viewform",
    "https://notfigma.com/x", "https://figma.com.evil.io/x", "https://example.org/brief", "https://drive.google.com/drive/folders/abc", "/files/d/abc.pdf"
  ].map(u => { const b = brandOf(u); return b ? b.key + (b.mono ? ":mono" : "") : null; }));
  expect(map).toEqual(["figma", "figma", "youtube", "notion", "canva:mono", "linkedin:mono", "confluence", "jira", "googleforms", null, null, null, null, null]);

  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Brand marks", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "comments"; renderDrawer(); return d.id; });
  try {
    await page.evaluate(() => {
      cmtStage({ name: "Figma KV Insurance", url: "https://www.figma.com/design/AbC/KV", type: "link", kind: "link", named: true });
      cmtStage({ name: "canva.com", url: "https://www.canva.com/design/DAF/view", type: "link", kind: "link" });
      cmtStage({ name: "github.com", url: "https://github.com/acme/site", type: "link", kind: "link" });
      cmtStage({ name: "example.org", url: "https://example.org/brief", type: "link", kind: "link" });
      document.getElementById("cmtText").value = "Referensi"; postComment();
    });
    const chips = page.locator("#drawer .cmt .cmt-links .drive-chip");
    await expect(chips).toHaveCount(4);
    await expect(chips.nth(0).locator("svg.brand-ico")).toHaveCSS("color", "rgb(242, 78, 30)");   /* Figma's colour */
    await expect(chips.nth(1).locator(".brand-mono")).toHaveText("Ca");
    await expect(chips.nth(3).locator(".link-chip-ico svg:not(.brand-ico)")).toBeVisible();      /* an unknown site keeps the link mark */
    /* the card: Figma's mark, the link's own name, "Figma" under it — no Drive mark */
    await chips.nth(0).hover();
    const card = page.locator(".link-card.open");
    await expect(card).toBeVisible();
    await expect(card.locator(".lc-head b")).toHaveText("Figma KV Insurance");
    await expect(card.locator(".lc-kind")).toHaveText("Figma");
    await expect(card.locator(".lc-head svg.brand-ico")).toBeVisible();
    await expect(card.locator(".drive-logo, img")).toHaveCount(0);
    /* an unknown site: the link mark, and its site under the name */
    await page.mouse.move(5, 5); await expect(card).toHaveCount(0, { timeout: 3000 }).catch(() => {});
    await chips.nth(3).hover();
    await expect(page.locator(".link-card.open .lc-kind")).toHaveText("example.org");
    await expect(page.locator(".link-card.open .lc-head .lc-link svg")).toBeVisible();
    await page.mouse.move(5, 5);
    /* GitHub's near-black mark follows the text colour in dark mode */
    const dark = await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); const s = document.querySelectorAll("#drawer .cmt .cmt-links .drive-chip")[2].querySelector("svg.brand-ico"), c = getComputedStyle(s).color; document.documentElement.removeAttribute("data-theme"); return c; });
    expect(dark, "not black on a dark panel").not.toBe("rgb(24, 23, 23)");
    expect(dark).not.toBe("rgb(0, 0, 0)");
    /* an Assets & versions row for a Figma link: Figma's mark, not "OTHER" */
    await page.evaluate(() => setTab("files"));
    const row = page.locator("#drawer .av-from-comments .file", { hasText: "Figma KV Insurance" });
    await expect(row.locator(".ficon-brand svg.brand-ico")).toBeVisible();
    await expect(row.locator(".ficon")).not.toContainText("OTHER");
    /* chat: a link card with no site icon shows the mark, not an emoji */
    const chat = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = smartCardHtml({ type: "URL", provider: "FIGMA", url: "https://www.figma.com/file/x", title: "KV" }); return { mark: !!d.querySelector("svg.brand-ico"), emoji: d.textContent.includes("🎨") }; });
    expect(chat).toEqual({ mark: true, emoji: false });
  } finally {
    await page.evaluate(async id => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});
