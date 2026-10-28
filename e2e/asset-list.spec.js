/* The Assets page in List view. A rule meant for the task list's check and drag handles
   (".tbl thead th:first-child": 44 px, no padding, centred) also sized this table's first column, the
   name: a long name broke into four lines, its icon was squeezed to a sliver, its header sat in the
   middle, and the brand mark floated away from it. Settings → Members, which also starts with its
   content, had the same centred header. Now the name has the room (two lines at most), the other
   columns stay on one line, and below 1200 px, where seven columns do not fit, a row is the name with
   the rest in one line under it. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const LONG = "Motion Freelance Campaign Q4 — final cut with subtitles and the long export name of the year.mp4";
const BRAND = "⭐New Brand Guideline 2026⭐.pdf";
let ids = [];

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
}
async function showList(page, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.evaluate(() => { S.assetView = "list"; go("assets"); });
  await expect(page.locator("#assetsBody .asset-tbl")).toBeVisible();
}
const row = (page, name) => page.locator("#assetsBody .asset-tbl tbody tr", { hasText: name });

test.beforeEach(async ({ page }) => {
  await signIn(page);
  ids = await page.evaluate(async ([LONG, BRAND]) => {
    const mk = [
      { name: BRAND, type: "logo", brand: true, size: "13.1 MB", source: "gdrive", url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view" },
      { name: "Badge Award list", type: "logo", source: "gdrive", url: "https://drive.google.com/file/d/1BbCdEfGhIjKlMnOpQrStUvWxYz0123456/view" },
      { name: LONG, type: "video", size: "248.6 MB", source: "gdrive", url: "https://drive.google.com/file/d/1DbCdEfGhIjKlMnOpQrStUvWxYz0123456/view" }
    ];
    const out = [];
    for (const m of mk) { const id = uid("as"); out.push(id); await apiFetch("POST", "/api/assets", Object.assign({ id, color: "#16A34A", ver: 1 }, m)); }
    return out;
  }, [LONG, BRAND]);
  await page.reload(); await page.waitForFunction(() => window.ZC_READY === true && API.on);
});
test.afterEach(async ({ page }) => {
  await page.evaluate(async ids => { for (const id of ids) await apiFetch("DELETE", "/api/assets/" + id).catch(() => {}); if (UI_LANG !== "en" && typeof setLanguage === "function") setLanguage("en"); }, ids);
});

test("a wide screen: the name has the room, its icon its size, its header its place, the rest one line each", async ({ page }) => {
  for (const width of [1366, 1240]) {
    await showList(page, width);
    const m = await page.evaluate(([LONG, BRAND]) => {
      const tbl = document.querySelector("#assetsBody .asset-tbl"), wrap = tbl.closest(".tbl-wrap");
      const th = tbl.querySelector("thead th"), cs = getComputedStyle(th);
      const rowOf = n => [...tbl.querySelectorAll("tbody tr")].find(r => r.textContent.includes(n));
      const long = rowOf(LONG), brand = rowOf(BRAND);
      const nameT = long.querySelector(".asset-nm-t"), lh = parseFloat(getComputedStyle(nameT).lineHeight);
      const icon = long.querySelector(".ficon").getBoundingClientRect();
      /* where the name's words end, not its box: a box stretched to the cell's end would leave the mark far
         from the words while touching the box */
      const nr = document.createRange(); nr.selectNodeContents(brand.querySelector(".asset-nm-t")); const nrs = [...nr.getClientRects()];
      const bName = { right: Math.max(...nrs.map(b => b.right)), top: Math.min(...nrs.map(b => b.top)), bottom: Math.max(...nrs.map(b => b.bottom)) }, badge = brand.querySelector(".asset-nm-row .badge").getBoundingClientRect();
      const others = [...long.querySelectorAll("td:not(.asset-name-c)")].filter(td => !td.classList.contains("asset-when")).map(td => td.getBoundingClientRect().height);
      const when = long.querySelector("td.asset-when");
      return {
        scroll: wrap.scrollWidth - wrap.clientWidth,
        headAlign: cs.textAlign, headWidth: th.getBoundingClientRect().width, headText: th.getBoundingClientRect().left + parseFloat(cs.paddingLeft),
        cellText: long.querySelector(".asset-cell").getBoundingClientRect().left,
        lines: Math.round(nameT.getBoundingClientRect().height / lh), title: nameT.getAttribute("title"),
        icon: [Math.round(icon.width), Math.round(icon.height)],
        /* one line: right after its last word; wrapped (a wrapped box is as wide as it may be): right after the box */
        brandLines: new Set(nrs.filter(b => b.height).map(b => Math.round(b.top / 6))).size,
        badgeGap: badge.left - bName.right, badgeBoxGap: badge.left - brand.querySelector(".asset-nm-t").getBoundingClientRect().right,
        badgeMiddle: Math.abs((badge.top + badge.bottom) / 2 - (bName.top + bName.bottom) / 2),
        tallestOther: Math.max(...others), rowHeight: long.getBoundingClientRect().height,
        when: [...when.children].map(s => s.textContent), sub: getComputedStyle(long.querySelector(".asset-sub")).display,
        head: getComputedStyle(tbl.querySelector("thead")).display
      };
    }, [LONG, BRAND]);
    expect(m.scroll, width + ": no sideways scroll").toBe(0);
    expect(m.head, width + ": the header row shows").not.toBe("none");
    expect(m.headAlign, width + ": Name is set left, like the other headers").toBe("left");
    expect(m.headWidth, width + ": the name column is not the drag handle's 44 px").toBeGreaterThan(250);
    expect(Math.abs(m.headText - m.cellText), width + ": the header starts where the name's row starts").toBeLessThanOrEqual(2);
    expect(m.lines, width + ": a long name takes two lines at most").toBeLessThanOrEqual(2);
    expect(m.title, width + ": its whole name in the tooltip").toBe(LONG);
    expect(m.icon, width + ": the icon keeps its size").toEqual([28, 28]);
    const gap = m.brandLines === 1 ? m.badgeGap : m.badgeBoxGap;
    expect(gap, width + ": the brand mark sits right after its name (" + m.brandLines + " line)").toBeGreaterThanOrEqual(0);
    expect(gap, width + ": the brand mark sits right after its name (" + m.brandLines + " line)").toBeLessThanOrEqual(12);
    if (width === 1366) expect(m.brandLines, "1366: a name this long fits on one line").toBe(1);
    expect(m.badgeMiddle, width + ": on the name's line").toBeLessThanOrEqual(3);
    expect(m.tallestOther, width + ": type, folder, source, size and version stay on one line").toBeLessThanOrEqual(m.rowHeight);
    expect(m.when[0], width + ": Updated: when…").toMatch(/2026|2027/);
    expect(m.when[1], width + ": …over how long ago").toBe("just now");
    expect(m.sub, width + ": the line under the name is for narrow screens").toBe("none");
    for (const td of await row(page, LONG).locator("td:not(.asset-name-c):not(.asset-when)").all()) {
      /* lines, not boxes: a badge's icon and its words are two boxes on one line */
      const h = await td.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); const tops = []; for (const b of r.getClientRects()) if (b.height && !tops.some(t => Math.abs(t - b.top) < 6)) tops.push(b.top); return tops.length; });
      expect(h, width + ": one line").toBeLessThanOrEqual(1);
    }
  }
  /* the old chip in the list is still the asset's icon */
  await expect(row(page, "Badge Award list").locator(".ficon")).toBeVisible();
});

test("below 1200 px and on a phone: the name, and the rest in one line under it", async ({ page }) => {
  for (const width of [1199, 1024, 820, 390]) {
    await showList(page, width);
    const m = await page.evaluate(([LONG, BRAND]) => {
      const tbl = document.querySelector("#assetsBody .asset-tbl"), wrap = tbl.closest(".tbl-wrap");
      const rowOf = n => [...tbl.querySelectorAll("tbody tr")].find(r => r.textContent.includes(n));
      const long = rowOf(LONG), brand = rowOf(BRAND), sub = brand.querySelector(".asset-sub");
      const visibleTds = [...long.children].filter(td => getComputedStyle(td).display !== "none").length;
      const sr = sub.getBoundingClientRect(), lh = parseFloat(getComputedStyle(sub).lineHeight) || 16;
      return { scroll: wrap.scrollWidth - wrap.clientWidth, head: getComputedStyle(tbl.querySelector("thead")).display, visibleTds, sub: sub.textContent, subLines: Math.round(sr.height / lh), icon: Math.round(long.querySelector(".ficon").getBoundingClientRect().width), lines: Math.round(long.querySelector(".asset-nm-t").getBoundingClientRect().height / parseFloat(getComputedStyle(long.querySelector(".asset-nm-t")).lineHeight)) };
    }, [LONG, BRAND]);
    expect(m.scroll, width + ": no sideways scroll").toBe(0);
    expect(m.head, width + ": no header row").toBe("none");
    expect(m.visibleTds, width + ": one cell per row").toBe(1);
    expect(m.sub, width + ": type, source, size, version, how long ago").toBe("logo · Google Drive · 13.1 MB · v1 · just now");
    expect(m.subLines, width + ": on one line").toBe(1);
    expect(m.icon, width + ": the icon keeps its size").toBe(28);
    expect(m.lines, width + ": the name two lines at most").toBeLessThanOrEqual(2);
  }
  /* a row still opens its asset */
  await row(page, "Badge Award list").click();
  await expect(page.locator("#modalWrap.open")).toBeVisible();
  await page.evaluate(() => closeModal());
});

test("Indonesian, and dark", async ({ page }) => {
  await page.evaluate(() => setLanguage("id"));
  await page.waitForFunction(() => UI_LANG === "id");
  await showList(page, 1366);
  await expect(page.locator("#assetsBody .asset-tbl thead th").first()).toHaveText(/nama/i);
  await expect(row(page, BRAND).locator("td.asset-when .rel")).toHaveText("baru saja");
  await showList(page, 390);
  await expect(row(page, BRAND).locator(".asset-sub")).toHaveText("logo · Google Drive · 13.1 MB · v1 · baru saja");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const c = await row(page, BRAND).locator(".asset-sub").evaluate(el => [getComputedStyle(el).color, getComputedStyle(el.closest(".panel")).backgroundColor]);
  expect(c[0]).not.toBe(c[1]);
});

test("Settings → Members: its first header sits left over its column, not in a 44 px handle", async ({ page }) => {
  await page.goto("/settings/members");
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const th = page.locator(".members-tbl thead th").first();
  await expect(th).toBeVisible();
  const m = await th.evaluate(el => ({ align: getComputedStyle(el).textAlign, width: el.getBoundingClientRect().width, pad: parseFloat(getComputedStyle(el).paddingLeft) }));
  expect(m.align).toBe("left");
  expect(m.width).toBeGreaterThan(100);
  expect(m.pad).toBeGreaterThan(0);
});
