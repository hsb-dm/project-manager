/* Sign-ups wait for approval (Oct 2026): the switch in Access settings, who may approve (a capability in Roles &
   permissions — Team Lead has it, Member does not), the bell, turning someone away, everyone straight in when the
   switch is off, and the words in Indonesian. The whole way in — register, wait, be approved, sign in — is
   flows.spec.js 8. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const CODE = "APPROVE26";

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
async function register(browser, name, email) {
  const ctx = await browser.newContext(), p = await ctx.newPage();
  await p.goto("/register");
  await p.locator("#au_name").fill(name);
  await p.locator("#au_email").fill(email);
  await p.locator("#au_pw").fill("Signup!Passw0rd-26");
  await p.locator("#au_code").fill(CODE);
  await p.getByRole("button", { name: "Create account" }).click();
  return { ctx, p };
}

test("approval: the switch, who may approve, the bell, turning away, straight in, Indonesian", async ({ browser, page }) => {
  await signIn(page);
  const before = await page.evaluate(() => ({ allow: WS.allowRegistration, code: WS.joinCode, approval: WS.requireApproval }));
  const made = [];
  try {
    /* Access: registration on with a code; "New sign-ups wait for approval" is on unless turned off */
    await page.goto("/settings/workspace"); await ready(page);
    await expect(page.locator("#ws_approval")).toHaveClass(/\bon\b/);
    await expect(page.locator("#ws_approval").locator("xpath=ancestor::div[contains(@class,'pref')][1]")).toContainText("New sign-ups wait for approval");
    if (!(await page.locator("#ws_allowreg").getAttribute("class")).includes(" on")) await page.locator("#ws_allowreg").click();
    await page.locator("#ws_code").fill(CODE);
    await page.locator("#ws_allowreg").locator("xpath=ancestor::section[1]").getByRole("button", { name: "Save" }).click();
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => d.ws.allowRegistration && d.ws.joinCode))).toBe(CODE);
    /* Roles & permissions: a capability of its own — Team Lead has it, Member does not */
    await page.evaluate(() => roleModal("team_lead"));
    await expect(page.locator('#modal [data-cap="approve_members"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('#modal [data-cap="approve_members"]').locator("xpath=..")).toContainText("Approve or turn away people who sign up");
    await page.evaluate(() => { closeModal(); roleModal("member"); });
    await expect(page.locator('#modal [data-cap="approve_members"]')).not.toHaveClass(/\bon\b/);
    await page.evaluate(() => closeModal());

    /* someone signs up: the bell says so, and its line opens Settings → Members */
    const sari = await register(browser, "Sari Signup", "sari.signup@e2e.test");
    await expect(sari.p.locator(".auth-pending")).toBeVisible();
    await sari.p.evaluate(() => { UI_LANG = "id"; authPendingShow("Sari Signup"); });
    await expect(sari.p.locator(".auth-pending h3")).toHaveText("Akun Anda menunggu persetujuan");
    await sari.ctx.close();
    await page.goto("/"); await ready(page);
    const line = await page.evaluate(() => { const n = NOTIFS.find(x => x.k === "signup" && x.message === "Sari Signup"); const d = document.createElement("div"); d.id = "notifProbe"; d.innerHTML = notifRowHtml(n); document.body.appendChild(d); return d.textContent; });
    expect(line).toContain("Sari Signup signed up and is waiting for your approval");
    await page.locator("#notifProbe").locator("[onclick]").first().click();
    await expect(page).toHaveURL(/\/settings\/members/);
    await page.evaluate(() => { const d = document.getElementById("notifProbe"); if (d) d.remove(); });
    const row = page.locator(".pending-signups .pending-row", { hasText: "Sari Signup" });
    await expect(row).toBeVisible();
    /* an admin may choose another role */
    await expect(row.getByLabel("Role", { exact: true })).toBeVisible();
    await expect(row.getByLabel("Team", { exact: true })).toBeVisible();
    /* turned away: asked first; gone; the address can register again; the notice goes */
    await row.getByRole("button", { name: "Turn away" }).click();
    await expect(page.locator("#modal")).toContainText("Turn away this sign-up?");
    await page.locator("#modal .btn.danger, #modal .btn.primary").last().click();
    await expect(row).toHaveCount(0);
    expect(await page.evaluate(() => NOTIFS.some(n => n.k === "signup" && n.message === "Sari Signup"))).toBe(false);
    const again = await page.evaluate(code => fetch("/api/auth/register", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Sari Signup", email: "sari.signup@e2e.test", password: "Signup!Passw0rd-26", joinCode: code }) }).then(r => r.json()), CODE);
    expect(again, "the address is free again — and waits again").toEqual({ pending: true });

    /* Indonesian: on Home */
    await page.goto("/"); await ready(page);
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(page.locator("#zcPendingHome")).toContainText("1 pendaftar menunggu persetujuan Anda");
    await expect(page.locator("#zcPendingHome .pending-field").first()).toContainText("Peran");
    await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
    /* turned away again, through the API this time, so nothing is left */
    const sid = await page.evaluate(() => (PENDING.find(p => p.email === "sari.signup@e2e.test") || {}).id);
    await page.evaluate(id => apiFetch("POST", "/api/members/" + id + "/decline", {}), sid);

    /* the team they chose is reviewed too: changed on Home before approving */
    const teams = await page.evaluate(async () => { const a = "tchose" + Date.now().toString(36), b = a + "b"; await apiFetch("POST", "/api/teams", { id: a, name: "Chosen Team", color: "blue" }); await apiFetch("POST", "/api/teams", { id: b, name: "Better Team", color: "green" }); await reloadAll(); return { a, b }; });
    made.teams = teams;
    await page.evaluate(o => fetch("/api/auth/register", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Tomi Team", email: "tomi.signup@e2e.test", password: "Signup!Passw0rd-26", joinCode: o.code, teamId: o.team }) }), { code: CODE, team: teams.a });
    await page.goto("/"); await ready(page);
    const tomi = page.locator("#zcPendingHome .pending-row", { hasText: "Tomi Team" });
    await expect(tomi.locator(".pending-meta")).toContainText("chose Chosen Team");
    await expect(tomi.locator('select[id^="pt_"]')).toHaveValue(teams.a);
    await tomi.locator('select[id^="pt_"]').selectOption(teams.b);
    await tomi.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("#zcPendingHome")).toHaveCount(0);
    expect(await page.evaluate(() => { const id = Object.keys(PEOPLE).find(k => PEOPLE[k].email === "tomi.signup@e2e.test"); return id && PEOPLE[id].teams.map(t => t[0]); })).toEqual([teams.b]);
    made.push("tomi.signup@e2e.test");

    /* the switch off: straight in */
    await page.goto("/settings/workspace"); await ready(page);
    await page.locator("#ws_approval").click();
    await page.locator("#ws_allowreg").locator("xpath=ancestor::section[1]").getByRole("button", { name: "Save" }).click();
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => d.ws.requireApproval))).toBe(false);
    const tono = await register(browser, "Tono Direct", "tono.direct@e2e.test");
    await expect(tono.p.locator("body")).not.toHaveClass(/\bauth\b/);
    await tono.ctx.close();
    made.push("tono.direct@e2e.test");
  } finally {
    /* the people made here go; the access settings go back to how they were */
    await page.evaluate(async o => {
      const b = await apiFetch("GET", "/api/bootstrap");
      for (const email of o.made) { const id = Object.keys(b.people).find(k => b.people[k].email === email); if (id) await apiFetch("DELETE", "/api/members/" + id).catch(() => {}); }
      for (const p of b.pendingMembers || []) if (/@e2e\.test$/.test(p.email) && /signup|direct/.test(p.email)) await apiFetch("POST", "/api/members/" + p.id + "/decline", {}).catch(() => {});
      if (o.teams) for (const id of [o.teams.a, o.teams.b]) await apiFetch("DELETE", "/api/teams/" + id).catch(() => {});
      WS.allowRegistration = o.before.allow; WS.joinCode = o.before.code; WS.requireApproval = o.before.approval !== false; await persistWS();
    }, { made, before, teams: made.teams });
  }
});
