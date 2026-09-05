// Live end-to-end test of explicit Save + Discard-confirmation in Edit Deck, run against a
// real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev server.
//
// Context: every add/remove-list step in the wizard (Pricing Model's category discounts +
// bundle tiers, Services, Team, Content's focus areas/challenges/benefits, Discovery
// Questions) used to only commit changes when the flow reached Review or navigated away —
// there was no way to save a single section's edits explicitly, and Discard silently threw
// away in-progress work with zero confirmation. This suite covers the fix:
//   1. A per-step Save button appears on every list-pattern step (using Team here, the
//      simplest list) and is disabled until something is actually edited (dirty).
//   2. Clicking it saves the WHOLE draft in one round trip (there is no partial-save
//      endpoint) and the change survives a reload.
//   3. Discard with unsaved changes shows a confirmation dialog ("You have unsaved changes.
//      Discard them, or save first?") instead of leaving immediately.
//   4. Choosing "Discard changes" in that dialog genuinely discards — the edit is gone.
//   5. Choosing "Save" in that dialog genuinely saves — the edit survives — and still leaves
//      the wizard (same as Review's own Create/Save action).
//   6. Discard with NO unsaved changes is frictionless — no dialog, immediate navigation —
//      so the confirmation never adds friction where there is nothing to lose.
//
// Creates its own dedicated fixture deck via a raw API call (kept separate from
// wizard-e2e.mjs's Harbor Lane Dental fixture, since this suite repeatedly edits + reloads
// it) and cleans up nothing else — the fixture is reused idempotently across runs the same
// way discount-rules-e2e.mjs's does.
//
// Env: BASE_URL + API_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo
// user), CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (screenshots, default ./e2e-artifacts/explicit-save).

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
const OUT = process.env.OUT_DIR || "./e2e-artifacts/explicit-save";
mkdirSync(OUT, { recursive: true });

const RUN_TAG = Date.now().toString(36);
const FIXTURE_SLUG = "qa-explicit-save-fixture";

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

function fixtureConfig() {
  const svc = (id, name, price) => ({
    id,
    name,
    team: "QA Team",
    category: "major",
    pricingModelId: "primary",
    bandLabel: "Flat monthly rate",
    handle: [`Seed bullet for ${name}`],
    stats: [],
    dashboards: [],
    priceBands: [{ upTo: null, price }],
  });
  return {
    industry: "QA",
    companyName: "QA Explicit Save Fixture",
    tagline: "Throwaway fixture for the live explicit-save E2E suite.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Units", unit: "units", questionText: "How many units?", isPrimary: true }],
    services: [svc("svcA", "Service A", 100)],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Explicit Save", sub: "" },
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
const page = await browser.newPage();
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

// companyName "QA Explicit Save Fixture" slugifies deterministically to FIXTURE_SLUG
// (deck.create always derives the slug from companyName — there is no override input).
const existing = await callTrpc("query", "deck.getBySlug", token, { slug: FIXTURE_SLUG });
if (!existing.ok) {
  const created = await callTrpc("mutation", "deck.create", token, { config: fixtureConfig() });
  check("setup: fixture deck created", created.ok, created.message);
  check("setup: fixture deck slug matches the expected constant", created.data?.slug === FIXTURE_SLUG, created.data?.slug);
} else {
  check("setup: fixture deck already exists (idempotent re-run)", true);
}

await login();

const goToTeamStep = async () => {
  await page.goto(`${BASE}/decks/${FIXTURE_SLUG}/edit`, { waitUntil: "networkidle" });
  await page.waitForSelector(".builder-form-pane");
  await page.click('.builder-step-chip:has-text("Team")');
  await page.waitForSelector(".builder-subcard");
};

const teamNames = () =>
  page.$$eval(".builder-subcard", (cards) => cards.map((c) => c.querySelector("input")?.value ?? ""));
const addTeamMember = async (name) => {
  await page.click('button:has-text("＋ Add team member")');
  await page.locator(".builder-subcard").last().locator("input").first().fill(name);
};
const removeTeamMember = async (name) => {
  const cards = page.locator(".builder-subcard");
  const count = await cards.count();
  for (let i = count - 1; i >= 0; i--) {
    if ((await cards.nth(i).locator("input").first().inputValue()) === name) {
      await cards.nth(i).locator("button", { hasText: "Remove" }).click();
      return;
    }
  }
};

console.log("\n=== Per-step Save button: appears, gates on dirty state, persists the change ===");
const saveName1 = `QA Save ${RUN_TAG}-1`;
await section("per-step save persists across a reload", async () => {
  await goToTeamStep();
  const saveBtn = page.locator(".builder-form-save-bar button.btn-primary");
  check("save bar: visible on the Team step", (await saveBtn.count()) === 1);
  check("save bar: reads 'Saved' before any edit", (await saveBtn.textContent())?.includes("Saved"));
  check("save bar: disabled before any edit (nothing to save)", await saveBtn.isDisabled());

  await addTeamMember(saveName1);
  check("save bar: enabled once dirty", await saveBtn.isEnabled());
  check("save bar: reads 'Save changes' once dirty", (await saveBtn.textContent())?.includes("Save changes"));

  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.update")), saveBtn.click()]);
  await page.waitForTimeout(400);
  check("save bar: reads 'Saved' again immediately after saving", (await saveBtn.textContent())?.includes("Saved"));

  await page.reload({ waitUntil: "networkidle" });
  await page.click('.builder-step-chip:has-text("Team")');
  await page.waitForSelector(".builder-subcard");
  const names = await teamNames();
  check("explicit save: change is present after a reload", names.includes(saveName1), JSON.stringify(names));
});

console.log("\n=== Discard confirmation: shown when dirty, 'Discard changes' genuinely discards ===");
const discardName = `QA Discard ${RUN_TAG}`;
await section("discard confirmation appears and discarding drops the change", async () => {
  await goToTeamStep();
  await addTeamMember(discardName);

  await page.click('button.back-home-btn:has-text("Discard")');
  const dialog = page.locator(".modal-card", { hasText: "Unsaved changes" });
  check("discard dialog: appears while dirty", await dialog.isVisible());
  check("discard dialog: states the unsaved-changes message", (await dialog.textContent())?.includes("You have unsaved changes"));

  await dialog.locator("button", { hasText: "Discard changes" }).click();
  await page.waitForURL(new RegExp(`/decks/${FIXTURE_SLUG}$`));
  check("discard dialog: 'Discard changes' navigates away", page.url().endsWith(`/decks/${FIXTURE_SLUG}`));

  await goToTeamStep();
  const names = await teamNames();
  check("discard dialog: discarded change is NOT persisted", !names.includes(discardName), JSON.stringify(names));
});

console.log("\n=== Discard confirmation: 'Save' option genuinely saves instead of losing the change ===");
const saveViaDialogName = `QA SaveViaDialog ${RUN_TAG}`;
await section("discard dialog's Save option saves the change and leaves", async () => {
  await goToTeamStep();
  await addTeamMember(saveViaDialogName);

  await page.click('button.back-home-btn:has-text("Discard")');
  const dialog = page.locator(".modal-card", { hasText: "Unsaved changes" });
  check("discard dialog: appears again while dirty", await dialog.isVisible());

  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.update")), dialog.locator("button", { hasText: "Save" }).click()]);
  await page.waitForURL(new RegExp(`/decks/${FIXTURE_SLUG}$`));
  check("discard dialog: 'Save' navigates away same as 'Discard changes' does", page.url().endsWith(`/decks/${FIXTURE_SLUG}`));

  await goToTeamStep();
  const names = await teamNames();
  check("discard dialog: change saved via 'Save' IS persisted (not lost)", names.includes(saveViaDialogName), JSON.stringify(names));
});

console.log("\n=== Discard with no unsaved changes is frictionless (no dialog) ===");
await section("discard with nothing dirty skips the confirmation entirely", async () => {
  await goToTeamStep();
  await page.click('button.back-home-btn:has-text("Discard")');
  await page.waitForTimeout(300);
  const dialogCount = await page.locator(".modal-card", { hasText: "Unsaved changes" }).count();
  check("no dialog shown when there is nothing unsaved", dialogCount === 0);
  check("navigated away immediately", page.url().endsWith(`/decks/${FIXTURE_SLUG}`) && !page.url().includes("/edit"));
});

console.log("\n=== Cleanup: remove the test-added team members so the fixture stays stable across re-runs ===");
await section("cleanup: fixture team list back to just the seeded member", async () => {
  await goToTeamStep();
  await removeTeamMember(saveName1);
  await removeTeamMember(saveViaDialogName);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("deck.update")),
    page.click(".builder-form-save-bar button.btn-primary"),
  ]);
  await page.waitForTimeout(300);
  const names = await teamNames();
  check("cleanup: fixture team reset to a single member", names.length === 1, JSON.stringify(names));
});

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
