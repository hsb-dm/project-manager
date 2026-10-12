/* People, tasks and projects in the writing, as chat has them: in a task's description, its progress
   note and its brief's fields, "@" opens the people picker at the caret and the @ / Task / Project
   buttons put a person, a task or a project in as a chip. Saved, a chip is a token in the text
   ([T-101](#task=T-101)); read, it is drawn from the task or project as it is now and opens it.
   Whoever is newly named is told. A progress note is internal: no stakeholder is offered there. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const ids = {};

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* the mention notifications the page sends */
function watchMentions(page) {
  const sent = [];
  page.on("request", r => { if (r.method() === "POST" && /\/api\/notifications$/.test(r.url())) { try { const b = JSON.parse(r.postData() || "{}"); if (b.k === "mention") sent.push(b); } catch (e) {} } });
  return sent;
}
const openOn = (page, tab) => page.evaluate(([id, tab]) => { openTask(id); S.drawerTab = tab; renderDrawer(); }, [ids.task, tab]);

test("setup: two people (one a stakeholder), a task to write in, a task and a project to link", async ({ page }) => {
  await signIn(page);
  Object.assign(ids, await page.evaluate(async () => {
    const add = async (id, name, email, extra) => {
      if (!Object.keys(PEOPLE).some(k => PEOPLE[k].email === email))
        await apiFetch("POST", "/api/members", Object.assign({ id, name, email, perm: "member", ini: name.split(" ").map(w => w[0]).join(""), teams: [] }, extra || {}));
    };
    await add("refrara", "Rara Pratiwi", "rara.ref@e2e.test");
    await add("refsinta", "Sinta Klien", "sinta.ref@e2e.test", { stakeholder: true });
    const mk = async title => { const d = await apiFetch("POST", "/api/tasks", { title, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); return d.id; };
    const list = await apiFetch("POST", "/api/projects", { name: "Ref launch project", status: "active", owner: ME, teams: [] }).catch(() => null);
    return { task: await mk("Ref target task"), other: await mk("Logo refresh for the ref test") };
  }));
  await page.reload(); await ready(page);
  Object.assign(ids, await page.evaluate(() => ({
    rara: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "rara.ref@e2e.test"),
    sinta: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "sinta.ref@e2e.test"),
    project: (PROJECTS.find(p => p.name === "Ref launch project") || {}).id })));
  expect(ids.rara && ids.sinta && ids.project && ids.task && ids.other).toBeTruthy();
});

test("description: @ names someone, Task and Project put chips in; saved as tokens, read as live chips", async ({ page }) => {
  await signIn(page); const sent = watchMentions(page);
  await openOn(page, "brief");
  await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
  const ed = page.locator("#descSrc");
  await ed.click();
  await page.keyboard.type("Minta tolong @Rar");
  await expect(page.locator("#entityPicker.ep-mention")).toBeVisible();
  await expect(page.locator("#entityPicker .ep-row").first()).toContainText("Rara Pratiwi");
  /* the typing stays in the writing */
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("descSrc");
  await page.keyboard.press("Enter");
  await expect(page.locator("#entityPicker")).toHaveCount(0);
  await expect(ed.locator('.msg-mention[data-uid][contenteditable="false"]')).toHaveText("@Rara Pratiwi");
  await page.keyboard.type("cek ");
  /* Task: the picker by the button, the chip at the caret */
  await page.locator('#drawer .md-toolbar .ref-btn[data-ref-kind="task"]').click();
  await expect(page.locator("#entityPicker")).toBeVisible();
  await page.locator("#entityPicker .ep-search").fill("Logo refresh");
  await page.locator("#entityPicker .ep-row").first().click();
  await expect(ed.locator(`a.ref-chip[data-ref="task:${ids.other}"]`)).toContainText("Logo refresh for the ref test");
  await page.keyboard.type("untuk ");
  await page.locator('#drawer .md-toolbar .ref-btn[data-ref-kind="project"]').click();
  await page.locator("#entityPicker .ep-search").fill("Ref launch");
  await page.locator("#entityPicker .ep-row").first().click();
  await expect(ed.locator(`a.ref-chip[data-ref="project:${ids.project}"]`)).toContainText("Ref launch project");
  /* the order in the text is the order written */
  await expect.poll(() => page.evaluate(id => task(id).description || "", ids.task), { timeout: 8000 })
    .toMatch(new RegExp("^Minta tolong @Rara Pratiwi\\s+cek \\[" + ids.other + "\\]\\(#task=" + ids.other + "\\)\\s+untuk \\[Ref launch project\\]\\(#project=" + ids.project + "\\)"));
  /* told once */
  await expect.poll(() => sent.filter(b => (b.recipients || []).includes(ids.rara)).length).toBe(1);
  /* saved on the server */
  await expect.poll(() => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).description || "", ids.task)).toContain("(#task=" + ids.other + ")");

  /* read: chips from what the task is now (renamed), a name, and the chip opens the task */
  await page.evaluate(id => { task(id).title = "Logo refresh, renamed"; S.descMode = "viewer"; renderDrawer(); }, ids.other);
  const view = page.locator("#drawer .md-view");
  await expect(view.locator(`a.ref-chip[data-ref="task:${ids.other}"]`)).toContainText("Logo refresh, renamed");
  await expect(view.locator(`.msg-mention[data-uid="${ids.rara}"]`)).toHaveText("@Rara Pratiwi");
  await view.locator(`a.ref-chip[data-ref="task:${ids.other}"]`).click();
  await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(ids.other);
  /* a project chip goes to the project */
  await openOn(page, "brief");
  await page.locator(`#drawer .md-view a.ref-chip[data-ref="project:${ids.project}"]`).click();
  await expect.poll(() => page.evaluate(() => S.screen + "|" + (S.project || S.projectId || ""))).toContain("projects");
});

test("progress note: @ and chips; saving tells whoever is newly named, and never offers a stakeholder", async ({ page }) => {
  await signIn(page); const sent = watchMentions(page);
  await openOn(page, "progress");
  await page.evaluate(() => pnStart("new"));
  const ed = page.locator("#pnSrc");
  await ed.click();
  await page.keyboard.type("Menunggu @");
  await expect(page.locator("#entityPicker.ep-mention")).toBeVisible();
  const names = await page.locator("#entityPicker .ep-row").allInnerTexts();
  expect(names.join("|")).toContain("Rara Pratiwi");
  expect(names.join("|"), "a progress note is internal").not.toContain("Sinta Klien");
  await page.keyboard.type("Rara");
  await page.keyboard.press("Enter");
  await expect(ed.locator(`.msg-mention[data-uid="${ids.rara}"]`)).toBeVisible();
  await page.keyboard.type("soal ");
  await page.locator('#drawer .md-toolbar .ref-btn[data-ref-kind="task"]').click();
  await page.locator("#entityPicker .ep-search").fill(ids.other);
  await page.locator("#entityPicker .ep-row").first().click();
  /* @ from the button, too */
  await page.locator('#drawer .md-toolbar .ref-btn[data-ref-kind="person"]').click();
  await expect(page.locator("#entityPicker.ep-mention")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#entityPicker")).toHaveCount(0);
  await expect(page.locator("#drawer")).toBeVisible();
  await page.evaluate(() => pnSave());
  await expect.poll(() => page.evaluate(id => (pnLatest(task(id)) || {}).text || "", ids.task)).toContain("@Rara Pratiwi");
  expect(await page.evaluate(id => pnLatest(task(id)).text, ids.task)).toContain("[" + ids.other + "](#task=" + ids.other + ")");
  await expect.poll(() => sent.filter(b => (b.recipients || []).includes(ids.rara)).length).toBe(1);
  /* read: chips; the plain text for the export names the task */
  await expect(page.locator(`#drawer .pn-view a.ref-chip[data-ref="task:${ids.other}"]`)).toBeVisible();
  expect(await page.evaluate(id => pnPlain(pnLatest(task(id)).text), ids.task)).toContain(ids.other + " · ");
  /* editing it again without a new name tells nobody again */
  const before = sent.length;
  await page.evaluate(() => pnStart("edit"));
  await page.locator("#pnSrc").click(); await page.keyboard.press("End"); await page.keyboard.type(" ok");
  await page.evaluate(() => pnSave());
  await expect.poll(() => page.evaluate(id => pnLatest(task(id)).text, ids.task)).toContain(" ok");
  await page.waitForTimeout(400);
  expect(sent.length).toBe(before);
});

test("brief fields: @ in a field, Task and Project from the bar; read as chips; a stakeholder can be named here", async ({ page }) => {
  await signIn(page); const sent = watchMentions(page);
  await openOn(page, "brief");
  await page.evaluate(() => { const tk = task(S.drawerTask); if (!tk.brief) addBrief(WS.briefTemplates[0].id); S.briefEdit = true; renderDrawer(); });
  await expect(page.locator("#drawer .ref-bar")).toBeVisible();
  const field = page.locator("#drawer .brief textarea[data-bf]").first();
  /* a new brief starts from the description; this field is written from scratch */
  await field.fill("");
  await field.click();
  await page.keyboard.type("Hubungi @Sin");
  await expect(page.locator("#entityPicker.ep-mention")).toBeVisible();
  await expect(page.locator("#entityPicker .ep-row").first()).toContainText("Sinta Klien");
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue("Hubungi @Sinta Klien ");
  await page.keyboard.type("lihat ");
  await page.locator('#drawer .ref-bar .ref-btn[data-ref-kind="task"]').click();
  await page.locator("#entityPicker .ep-search").fill(ids.other);
  await page.locator("#entityPicker .ep-row").first().click();
  await expect(field).toHaveValue("Hubungi @Sinta Klien lihat " + ids.other + " ");
  await page.locator('#drawer .ref-bar .ref-btn[data-ref-kind="project"]').click();
  await page.locator("#entityPicker .ep-search").fill("Ref launch");
  await page.locator("#entityPicker .ep-row").first().click();
  await expect(field).toHaveValue("Hubungi @Sinta Klien lihat " + ids.other + " [Ref launch project](#project=" + ids.project + ") ");
  await page.evaluate(() => saveBrief());
  await expect.poll(() => sent.filter(b => (b.recipients || []).includes(ids.sinta)).length).toBe(1);
  /* read */
  const v = page.locator("#drawer .brief .v").first();
  await expect(v.locator(`.msg-mention[data-uid="${ids.sinta}"]`)).toHaveText("@Sinta Klien");
  await expect(v.locator(`a.ref-chip[data-ref="task:${ids.other}"]`)).toBeVisible();
  await expect(v.locator(`a.ref-chip[data-ref="project:${ids.project}"]`)).toContainText("Ref launch project");
  await expect(v).not.toContainText("#project=");
});

test("only real references become chips; one whose task is gone stays its label; Indonesian", async ({ page }) => {
  await signIn(page);
  const out = await page.evaluate(other => {
    const h = refHtml(esc("See " + other + ", T-9999999, and [Old](#task=T-9999998). Code: ") + "<code>" + other + "</code> <a href=\"https://x.test/" + other + "\">" + other + "</a>");
    const d = document.createElement("div"); d.innerHTML = h;
    return { chips: Array.from(d.querySelectorAll("a.ref-chip")).map(a => a.getAttribute("data-ref") + (a.classList.contains("gone") ? ":gone" : "")), code: d.querySelector("code").innerHTML };
  }, ids.other);
  expect(out.chips).toEqual(["task:" + ids.other, "task:T-9999998:gone"]);
  expect(out.code).toBe(ids.other);
  /* a token's label with Markdown in it is still the token */
  const md = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = descMdHtml("[My *bold* project](#project=nope_1)"); return d.querySelector("a.ref-chip") && d.querySelector("a.ref-chip").getAttribute("data-label"); });
  expect(md).toBe("My *bold* project");
  /* round trip: a chip is its token again */
  const rt = await page.evaluate(other => descHtmlToMd(descMdHtml("Lihat [" + other + "](#task=" + other + ") ya")), ids.other);
  expect(rt).toBe("Lihat [" + ids.other + "](#task=" + ids.other + ") ya");
  /* Indonesian */
  await openOn(page, "brief");
  await page.evaluate(() => { UI_LANG = "id"; S.briefEdit = true; renderDrawer(); });
  await expect(page.locator("#drawer .ref-bar .hint")).toHaveText("Ketik @ untuk menyebut seseorang. Task atau proyek masuk sebagai chip:");
  await expect(page.locator('#drawer .ref-bar .ref-btn[data-ref-kind="task"]')).toHaveAttribute("title", "Sisipkan task");
  await page.evaluate(() => { UI_LANG = "en"; S.briefEdit = false; renderDrawer(); });
});

test("a new task tells whoever its description names when it is created, not those told they are on it", async ({ page }) => {
  await signIn(page); const sent = watchMentions(page);
  await page.evaluate(rara => { newTaskModal({ title: "Ref new task" }); S.descMode = "editor"; renderDrawer(); document.getElementById("descSrc").innerHTML = descMdHtml("Untuk @Rara Pratiwi, lihat " + rara); }, ids.other);
  ids.created = await page.evaluate(async () => { const t = await createDraft(); return t && t.id; });
  expect(ids.created).toBeTruthy();
  await expect.poll(() => sent.filter(b => (b.recipients || []).includes(ids.rara) && b.t === ids.created).length).toBe(1);
});

test("cleanup", async ({ page }) => {
  await signIn(page);
  await page.evaluate(async ids => { for (const id of [ids.task, ids.other, ids.created].filter(Boolean)) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); if (ids.project) await apiFetch("DELETE", "/api/projects/" + ids.project).catch(() => {}); for (const m of [ids.rara, ids.sinta].filter(Boolean)) await apiFetch("DELETE", "/api/members/" + m).catch(() => {}); }, ids);
});
