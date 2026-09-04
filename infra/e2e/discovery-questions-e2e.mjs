// Live end-to-end test of two Discovery Questions changes, run against a real deployment
// (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev server:
//
//   1. Toggle answers used to be hardcoded to exactly two options (two fixed TextFields in
//      the wizard, two fixed .toggle-opt divs in Discovery Notes). They now use the same
//      add/remove option-list UI Select already had, and can have more than two.
//   2. Four new answer types: Multiple Select (checkbox list, captures an array), Date (a
//      real date picker), Email and Phone (validated text inputs) — plus Number, which
//      turned out to already exist end-to-end (DiscoveryQuestionType, the zod schema, the
//      wizard dropdown, and QuestionField.tsx's rendering all already had it), included here
//      for the same live regression coverage as the genuinely new types.
//
// What it does, through the actual UI + real API calls:
//   1. A raw deck.create call with a toggle question given only one option confirms the
//      server still rejects that (relaxed from "exactly two" to "at least two", not
//      "any number including zero or one").
//   2. Creates a fresh fixture deck, then in the wizard's Discovery Questions step adds one
//      general question of each type — including a toggle carried to 3 options via the
//      wizard's "+ Add option" button — using the step's own live interactive preview
//      (WizardPreview in "notes" mode, the real DiscoveryNotesPanel) to confirm each renders
//      as the right kind of input immediately. Saves the deck.
//   3. On the live deck, opens the REAL popped-out Discovery Notes window (same mechanism
//      notes-window-e2e.mjs exercises) and actually answers every new question: picks the
//      toggle's 3rd option (not one of the original two), checks two of three multi-select
//      boxes, fills a date/email/phone/number. Confirms the phone/email fields flag an
//      obviously-invalid value and clear that flag once corrected.
//   4. After the debounced autosave, reads the meeting back via a raw meeting.get call and
//      confirms every answer actually persisted as the right shape — including that the
//      toggle's underlying boolean (toggles[id], what surcharge pricing and dependsOn
//      gating actually read) came out true for a non-first option, and that the
//      multi-select answer is a real string array, not a delimited string.
//
// Env: BASE_URL + API_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo
// user), CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (screenshots, default ./e2e-artifacts/discovery-questions).

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
if (!BASE || !API) {
  console.error("BASE_URL and API_URL are required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts/discovery-questions";
mkdirSync(OUT, { recursive: true });

const RUN_TAG = Date.now().toString(36);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}
async function section(label, fn) {
  try {
    await fn();
  } catch (e) {
    check(label, false, `THREW: ${e?.message?.split("\n")[0] || e}`);
  }
}

async function callTrpc(kind, path, token, input) {
  const url =
    kind === "query"
      ? `${API}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: input ?? {} }))}`
      : `${API}/api/trpc/${path}?batch=1`;
  const res = await fetch(url, {
    method: kind === "query" ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: kind === "query" ? undefined : JSON.stringify({ 0: input ?? {} }),
  });
  const body = await res.json().catch(() => null);
  const entry = Array.isArray(body) ? body[0] : body;
  return { ok: !entry?.error, data: entry?.result?.data, message: entry?.error?.message };
}

function baseDeckConfig(suffix) {
  return {
    industry: "QA",
    companyName: `QA Discovery Questions ${suffix}`,
    tagline: "Throwaway fixture for the live discovery-questions E2E suite.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Units", unit: "units", questionText: "How many units?", isPrimary: true }],
    services: [
      {
        id: "qaService",
        name: "QA Service",
        team: "QA Team",
        category: "major",
        pricingModelId: "primary",
        bandLabel: "Flat",
        handle: ["Seed bullet for the discovery-questions E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [{ upTo: null, price: 100 }],
      },
    ],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Discovery Questions", sub: "" },
      about: { title1: "QA", title2: "Deck", body: "", bullets: [] },
      how: { steps: [{ t: "QA", d: "" }] },
      challenges: { items: [] },
      benefits: { items: [] },
      qa: { title: "Questions?", sub: "", email: "", phone: "", web: "", address: "" },
    },
    discoveryQuestions: [],
  };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext();
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid");
}

console.log("\n=== Setup ===");
const loginRes = await callTrpc("mutation", "auth.login", null, { email: EMAIL, password: PASSWORD });
check("setup: admin API login succeeds", loginRes.ok);
const token = loginRes.data?.accessToken;

await section("setup: server still rejects a toggle with fewer than two options", async () => {
  const badConfig = baseDeckConfig(`${RUN_TAG}-bad`);
  badConfig.discoveryQuestions = [{ id: "onlyOneOption", section: "general", label: "Bad toggle", type: "toggle", options: ["Just one"] }];
  const res = await callTrpc("mutation", "deck.create", token, { config: badConfig });
  check("setup: one-option toggle rejected by deck.create", !res.ok && /at least two options/i.test(res.message || ""), res.message);
});

const created = await callTrpc("mutation", "deck.create", token, { config: baseDeckConfig(RUN_TAG) });
check("setup: fixture deck created", created.ok, created.message);
const deckSlug = created.data?.slug;

// ========== Wizard: add one question of each new/changed type ==========
console.log("\n=== Wizard: add Toggle (3 options), Multi-select, Date, Email, Phone, Number ===");
await login();
await page.goto(`${BASE}/decks/${deckSlug}/edit`, { waitUntil: "networkidle" });
const form = page.locator(".builder-form-pane");
await form.locator(".builder-step-chip", { hasText: "Discovery Questions" }).click();

const preview = () => page.locator(".builder-notes-preview");
const editableCards = () => form.locator(".builder-subcard").filter({ has: page.locator("input") });

async function addQuestion(type, label, options) {
  await form.locator(".mini-btn", { hasText: "Add general question" }).click();
  const card = editableCards().last();
  await card.locator(".q-block", { hasText: "Question label" }).locator("input").fill(label);
  await card.locator(".q-block", { hasText: "Answer type" }).locator("select").selectOption(type);
  if (options) {
    const optionsBlock = card.locator(".q-block", { hasText: "Options" });
    for (let i = 0; i < options.length; i++) {
      let rows = optionsBlock.locator(".builder-list-row");
      if (i >= (await rows.count())) await optionsBlock.locator(".mini-btn", { hasText: "Add option" }).click();
      rows = optionsBlock.locator(".builder-list-row");
      await rows.nth(i).locator("input").fill(options[i]);
    }
  }
  await page.waitForTimeout(150);
  return card;
}

await section("wizard: add a 3-option toggle question", async () => {
  await addQuestion("toggle", "Billing cadence", ["Weekly", "Bi-weekly", "Monthly"]);
  const opts = preview().locator(".q-block", { hasText: "Billing cadence" }).locator(".toggle-opt");
  check("wizard preview: toggle renders all 3 options", (await opts.count()) === 3, String(await opts.count()));
  check("wizard preview: toggle's 3rd option label is correct", (await opts.nth(2).innerText()) === "Monthly");
});

await section("wizard: add a multi-select question", async () => {
  await addQuestion("multiselect", "Which channels does the client use?", ["Email", "Phone", "SMS"]);
  const chips = preview().locator(".q-block", { hasText: "Which channels" }).locator(".chip");
  check("wizard preview: multi-select renders all 3 checkboxes", (await chips.count()) === 3, String(await chips.count()));
});

await section("wizard: add a date question", async () => {
  await addQuestion("date", "Target go-live date");
  check(
    "wizard preview: date question renders a real date input",
    (await preview().locator(".q-block", { hasText: "Target go-live date" }).locator('input[type="date"]').count()) === 1,
  );
});

await section("wizard: add an email question", async () => {
  await addQuestion("email", "Best contact email");
  check(
    "wizard preview: email question renders a real email input",
    (await preview().locator(".q-block", { hasText: "Best contact email" }).locator('input[type="email"]').count()) === 1,
  );
});

await section("wizard: add a phone question", async () => {
  await addQuestion("phone", "Best contact phone");
  check(
    "wizard preview: phone question renders a real tel input",
    (await preview().locator(".q-block", { hasText: "Best contact phone" }).locator('input[type="tel"]').count()) === 1,
  );
});

await section("wizard: add a number question", async () => {
  await addQuestion("number", "How many locations?");
  check(
    "wizard preview: number question renders a real number input",
    (await preview().locator(".q-block", { hasText: "How many locations?" }).locator('input[type="number"]').count()) === 1,
  );
});

await section("wizard: save the deck", async () => {
  await form.locator(".builder-step-chip", { hasText: "Review" }).click();
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.update")), page.locator(".btn-primary", { hasText: "Save changes" }).click()]);
});

// ========== Live deck: actually answer every question in the real popped-out notes window ==========
console.log("\n=== Live deck: answering every new question type in the real Discovery Notes window ===");
let meetingId = null;
await section("live deck: open the real popped-out Discovery Notes window", async () => {
  await page.goto(`${BASE}/decks/${deckSlug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".notes-btn", { timeout: 15000 });
  const [notesPage] = await Promise.all([context.waitForEvent("page"), page.locator(".notes-btn").click()]);
  await notesPage.waitForLoadState("networkidle");
  await notesPage.waitForSelector(".notes-wrap", { timeout: 15000 });
  const url = new URL(notesPage.url());
  meetingId = url.searchParams.get("meetingId");
  check("live deck: popout has a meetingId", !!meetingId, notesPage.url());

  await section("live: pick the toggle's 3rd option (not one of the original two)", async () => {
    const block = notesPage.locator(".q-block", { hasText: "Billing cadence" });
    await block.locator(".toggle-opt", { hasText: "Monthly" }).click();
    await notesPage.waitForTimeout(200);
    const selected = block.locator(".toggle-opt.selected");
    check("live: exactly one toggle option selected", (await selected.count()) === 1, String(await selected.count()));
    check("live: the selected option is the 3rd one (Monthly)", (await selected.innerText()) === "Monthly");
  });

  await section("live: check two of three multi-select boxes", async () => {
    const block = notesPage.locator(".q-block", { hasText: "Which channels" });
    await block.locator(".chip", { hasText: "Email" }).click();
    await block.locator(".chip", { hasText: "SMS" }).click();
    await notesPage.waitForTimeout(200);
    check("live: exactly two chips selected", (await block.locator(".chip.selected").count()) === 2);
    check("live: Phone (not checked) stayed unselected", !(await block.locator(".chip", { hasText: "Phone" }).getAttribute("class")).includes("selected"));
  });

  await section("live: fill the date question", async () => {
    await notesPage.locator(".q-block", { hasText: "Target go-live date" }).locator('input[type="date"]').fill("2027-01-15");
  });

  await section("live: email question flags an invalid address, clears once fixed", async () => {
    const block = notesPage.locator(".q-block", { hasText: "Best contact email" });
    const input = block.locator('input[type="email"]');
    await input.fill("not-an-email");
    await notesPage.waitForTimeout(150);
    check("live: invalid email shows an inline error", (await block.locator(".q-error").count()) === 1);
    await input.fill("client@example.com");
    await notesPage.waitForTimeout(150);
    check("live: valid email clears the error", (await block.locator(".q-error").count()) === 0);
  });

  await section("live: phone question flags an invalid number, clears once fixed", async () => {
    const block = notesPage.locator(".q-block", { hasText: "Best contact phone" });
    const input = block.locator('input[type="tel"]');
    await input.fill("call me maybe");
    await notesPage.waitForTimeout(150);
    check("live: invalid phone shows an inline error", (await block.locator(".q-error").count()) === 1);
    await input.fill("+1 (555) 123-4567");
    await notesPage.waitForTimeout(150);
    check("live: valid phone clears the error", (await block.locator(".q-error").count()) === 0);
  });

  await section("live: fill the number question", async () => {
    await notesPage.locator(".q-block", { hasText: "How many locations?" }).locator('input[type="number"]').fill("7");
  });

  await notesPage.screenshot({ path: `${OUT}/discovery-questions-live.png`, fullPage: true });
  console.log("Saved discovery-questions-live.png");

  // useNotesWindowSession.ts debounces the save 800ms after the last edit.
  await notesPage.waitForTimeout(1500);
  await notesPage.close();
});

await section("live: every answer actually persisted (raw meeting.get, not just the DOM)", async () => {
  const res = await callTrpc("query", "meeting.get", token, { id: meetingId });
  check("persist: meeting.get succeeds", res.ok, res.message);
  const m = res.data;
  const answers = m?.answers || {};
  const toggles = m?.toggles || {};

  // Question ids are derived server-side from the label ("billingcadence1", etc. via
  // idFromName) — rather than hardcode that derivation, find them by matching the captured
  // values instead, which is what actually matters here.
  const toggleEntry = Object.entries(answers).find(([, v]) => v === "Monthly");
  check("persist: toggle's captured answer is the 3rd option's label (\"Monthly\")", !!toggleEntry, JSON.stringify(answers));
  if (toggleEntry) {
    check("persist: toggle's underlying boolean is true for a non-first option", toggles[toggleEntry[0]] === true, JSON.stringify(toggles));
  }

  const multiEntry = Object.entries(answers).find(([, v]) => Array.isArray(v));
  check("persist: multi-select answer is a real array", !!multiEntry, JSON.stringify(answers));
  if (multiEntry) {
    const arr = multiEntry[1];
    check("persist: multi-select array has exactly the 2 checked options", arr.length === 2 && arr.includes("Email") && arr.includes("SMS"), JSON.stringify(arr));
  }

  check("persist: date answer captured", Object.values(answers).includes("2027-01-15"), JSON.stringify(answers));
  check("persist: email answer captured", Object.values(answers).includes("client@example.com"), JSON.stringify(answers));
  check("persist: phone answer captured", Object.values(answers).includes("+1 (555) 123-4567"), JSON.stringify(answers));
  check("persist: number answer captured as a real number", Object.values(answers).includes(7), JSON.stringify(answers));
});

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
