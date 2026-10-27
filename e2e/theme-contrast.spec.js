const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("theme text on primary and secondary colors keeps WCAG AA contrast", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);

  const contrast = await page.evaluate(() => {
    const original = WS.theme;
    const ratio = (fg, bg) => {
      const lum = color => {
        const [r, g, b] = color.match(/\d+/g).slice(0, 3).map(Number);
        const linear = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      };
      const a = lum(fg), b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    try {
      WS.theme = Object.assign({}, original, { appearance: "light", accent: "#00ff00", secondary: "#2F5BFF" });
      applyTheme();
      const primary = document.createElement("span");
      primary.style.cssText = "background:var(--color-primary);color:var(--color-primary-ink)";
      document.body.appendChild(primary);
      document.getElementById("nav").innerHTML = '<button class="nav-item active"><span>My Tasks</span><span class="cnt">8</span></button>';
      const primaryStyle = getComputedStyle(primary);
      const badge = document.querySelector("#nav .cnt");
      const badgeStyle = getComputedStyle(badge);
      return {
        primary: ratio(primaryStyle.color, primaryStyle.backgroundColor),
        secondary: ratio(badgeStyle.color, badgeStyle.backgroundColor),
        badgeForeground: badgeStyle.color,
        secondaryInk: getComputedStyle(document.documentElement).getPropertyValue("--color-secondary-ink").trim()
      };
    } finally {
      WS.theme = original;
      applyTheme();
    }
  });

  expect(contrast.primary, "text on a bright custom accent").toBeGreaterThanOrEqual(4.5);
  expect(contrast.secondary, "the active navigation count on a blue custom secondary").toBeGreaterThanOrEqual(4.5);
  expect(contrast.badgeForeground).toBe("rgb(255, 255, 255)");
  expect(contrast.secondaryInk).toBe("#fff");
});
