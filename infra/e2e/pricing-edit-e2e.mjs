// Live end-to-end test of pricing editing in Edit Deck (Phase 5b), run against a real
// deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev server.
//
// Edit Deck reuses the exact same DeckWizard/StepServices/StepPricingModel components the
// Create wizard uses (editingSlug + initialDraft), so this suite exercises real, persisted
// editing through that one shared implementation — not a second pricing UI that could
// drift out of sync. What it does, through the actual UI:
//   1. Signs in as the seeded demo Admin, ensures its own dedicated fixture deck exists
//      (created via a raw deck.create API call if missing — deliberately NOT
//      harbor-lane-dental or any other suite's fixture: this suite repeatedly overwrites
//      pricing on its target deck, and wizard-e2e.mjs's behavior checks hard-assert exact
//      dollar amounts on harbor-lane-dental forever after creation, so sharing a fixture
//      across suites would make one permanently break the other).
//   2. Edits the deck's pricing driver itself (label, unit, discovery question text) and an
//      existing tiered service's band amounts — saves, then confirms the real pricing slide
//      and Discovery Notes question text reflect the change.
//   3. Adds two brand-new services from scratch — one flat-priced, one tiered — including
//      wiring one of them to a per-service alternate pricing driver (the same mechanism
//      FedEx's Driver Payroll already uses) — saves, then confirms both price and render
//      correctly on the real pricing slide.
//   4. Adds a throwaway service, confirms it appears on the live pricing slide, then removes
//      it via Edit Deck and confirms it's gone — proving service removal actually persists.
//   5. Confirms the pricing section inherits Edit Deck's existing role check (Phase 2c) by
//      loading the edit URL directly as the QA Operations Manager (created by
//      role-enforcement-e2e.mjs, which this suite also depends on running first) and
//      confirming the same "doesn't include editing decks" gate — not a second check.
//
// Idempotent by design: the fixture deck is created once and re-used; every edit always
// sets fixed target values (deterministic overwrites, not toggles), so re-runs land on the
// same state instead of drifting. New services are added only if a fixed-name service
// isn't already present. Step 4's add-then-remove always ends with the throwaway absent.
//
// Env: BASE_URL + API_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo
// user), CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (screenshots, default ./e2e-artifacts).

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
const OM_EMAIL = process.env.OM_EMAIL || "qa-operations-manager@aeonqa.internal";
const OM_PASSWORD = process.env.OM_PASSWORD || "AeonQaTest123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const DECK_NAME = "QA Pricing Edit Test Deck";
const DECK_SLUG = "qa-pricing-edit-test-deck";
const SEED_SERVICE_NAME = "Seed Tiered Service";
const SEED_DRIVER_QUESTION_ID = "qaFieldTechCount";
const SEED_DRIVER_QUESTION_LABEL = "How many field technicians work this account?";
const NEW_DRIVER_LABEL = "QA Routes";
const NEW_DRIVER_QUESTION = "How many QA routes does this account run per day?";
const FLAT_SERVICE_NAME = "QA Edit Flat Service";
const TIERED_SERVICE_NAME = "QA Edit Tiered Service";
const REMOVABLE_SERVICE_NAME = "QA Edit Removable Service";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
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

async function apiLogin(email, password) {
  const res = await callTrpc("mutation", "auth.login", null, { email, password });
  return { token: res.data?.accessToken, user: res.data?.user, ok: res.ok };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

async function uiLogin(email, password) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const signOutBtn = page.locator(".app-header button", { hasText: "Sign out" });
  if (await signOutBtn.count()) {
    await Promise.all([page.waitForURL("**/login"), signOutBtn.click()]);
  } else {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  }
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid", { timeout: 15000 });
}

async function openEditDeck() {
  await page.goto(`${BASE}/decks/${DECK_SLUG}/edit`, { waitUntil: "networkidle" });
  await page.waitForSelector(".builder-form-pane", { timeout: 15000 });
}

const form = () => page.locator(".builder-form-pane");
const fieldInput = (label) => form().locator(".q-block", { hasText: label }).first().locator('input[type="text"]').first();
const chip = (label) => form().locator(".builder-step-chip", { hasText: label });
const svcCard = (name) => form().locator(".builder-svc-card", { hasText: name });
const svcBody = () => form().locator(".builder-svc-card.open .builder-svc-body");
const sIn = (label) => svcBody().locator(".q-block", { hasText: label }).first().locator('input[type="text"]').first();
const bandsBlock = () => svcBody().locator(".q-block", { hasText: "Pricing structure" });

async function openService(name) {
  const card = svcCard(name);
  if (!(await card.locator(".builder-svc-body").count())) {
    await card.locator(".builder-svc-head").click();
  }
}

async function switchToTiered() {
  const tieredRadio = bandsBlock().locator(".builder-pricing-mode-option", { hasText: "Tiered" }).locator('input[type="radio"]');
  if (await tieredRadio.isChecked()) return;
  await tieredRadio.click();
}

async function saveChanges(expectedUrlPart) {
  await chip("Review").click();
  const issueCount = await form().locator(".builder-issues li").count();
  check(`edit: no validation issues before saving (${expectedUrlPart})`, issueCount === 0);
  await Promise.all([
    page.waitForURL(`**/decks/${DECK_SLUG}`, { timeout: 20000 }),
    form().locator(".btn-primary", { hasText: "Save changes" }).click(),
  ]);
}

async function priceCard(name) {
  return page.locator(".price-card", { hasText: name });
}

// ========== 1. Ensure this suite's own dedicated fixture deck exists, then open it ==========
console.log("\n=== Setup ===");
const adminLogin = await apiLogin(EMAIL, PASSWORD);
check("setup: admin API login succeeds", adminLogin.ok);

const existingFixture = await callTrpc("query", "deck.getBySlug", adminLogin.token, { slug: DECK_SLUG });
if (existingFixture.ok) {
  console.log(`"${DECK_NAME}" already exists (created on a previous run) — skipping creation.`);
} else {
  const seedConfig = {
    industry: "QA",
    companyName: DECK_NAME,
    tagline: "Dedicated fixture for the live pricing-edit E2E suite — not used by any other suite.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingDriver: { label: "Routes", unit: "routes", questionText: "How many routes per day?" },
    services: [
      {
        id: "seedTiered",
        name: SEED_SERVICE_NAME,
        team: "QA Team",
        category: "major",
        bandLabel: "Route-based · 2 bands",
        handle: ["Seed bullet for the pricing-edit E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [
          { upTo: 5, price: 100 },
          { upTo: null, price: 200 },
        ],
      },
    ],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Pricing Edit Fixture", sub: "" },
      about: { title1: "QA", title2: "Deck", body: "", bullets: [] },
      how: { steps: [{ t: "QA", d: "" }] },
      challenges: { items: [] },
      benefits: { items: [] },
      qa: { title: "Questions?", sub: "", email: "", phone: "", web: "", address: "" },
    },
    discoveryQuestions: [{ id: SEED_DRIVER_QUESTION_ID, section: "general", label: SEED_DRIVER_QUESTION_LABEL, type: "number" }],
  };
  const created = await callTrpc("mutation", "deck.create", adminLogin.token, { config: seedConfig });
  check("setup: fixture deck.create succeeds", created.ok && created.data?.slug === DECK_SLUG, created.message);
}

await uiLogin(EMAIL, PASSWORD);
await openEditDeck();
const gateVisible = await page.locator(".auth-shell", { hasText: "Deck not found" }).count();
check("setup: fixture deck exists and Edit Deck loads", gateVisible === 0);

// ========== 2. Edit the deck's pricing driver + an existing tiered service's bands ==========
console.log("\n=== Edit driver + existing service pricing ===");
await chip("Pricing Model").click();
await fieldInput("Driver label").fill(NEW_DRIVER_LABEL);
await fieldInput("Discovery question text").fill(NEW_DRIVER_QUESTION);

await chip("Services").click();
await openService(SEED_SERVICE_NAME);
check(
  "edit: existing multi-band service shows in Tiered mode",
  await bandsBlock().locator(".builder-pricing-mode-option", { hasText: "Tiered" }).locator('input[type="radio"]').isChecked(),
);
await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(0).fill("5");
await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(1).fill("420");
await bandsBlock().locator(".builder-band-row").nth(1).locator("input").nth(1).fill("900");

// ========== 3. Add a brand-new flat-priced service and a brand-new tiered service ==========
console.log("\n=== Add new services (flat + tiered) ===");
if (!(await svcCard(FLAT_SERVICE_NAME).count())) {
  await form().locator(".mini-btn", { hasText: "Add service" }).click();
  await sIn("Service name").fill(FLAT_SERVICE_NAME);
  await sIn("Delivering team").fill("Operations Team");
  await sIn("Band label").fill("Flat monthly rate");
  await svcBody().locator(".q-block", { hasText: "What we handle" }).locator(".builder-list-row input").first().fill("Onboarding curriculum and milestone tracking");
  const stats = svcBody().locator(".q-block", { hasText: "Impact stats" });
  await stats.locator(".builder-list-row").nth(0).locator("input").nth(0).fill("↓ 30%");
  await stats.locator(".builder-list-row").nth(0).locator("input").nth(1).fill("Faster ramp-up");
  await stats.locator(".builder-list-row").nth(1).locator(".mini-btn-danger").click();
}
await openService(FLAT_SERVICE_NAME);
check(
  "edit: brand-new service starts in flat pricing mode",
  await bandsBlock().locator(".builder-pricing-mode-option", { hasText: "Single flat" }).locator('input[type="radio"]').isChecked(),
);
await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(0).fill("350");

if (!(await svcCard(TIERED_SERVICE_NAME).count())) {
  await form().locator(".mini-btn", { hasText: "Add service" }).click();
  await sIn("Service name").fill(TIERED_SERVICE_NAME);
  await sIn("Delivering team").fill("Front Office Team");
  await sIn("Band label").fill("Field-tech-based · 2 bands");
  await svcBody().locator(".q-block", { hasText: "What we handle" }).locator(".builder-list-row input").first().fill("Coverage scaled to field technician headcount");
  const stats2 = svcBody().locator(".q-block", { hasText: "Impact stats" });
  await stats2.locator(".builder-list-row").nth(0).locator("input").nth(0).fill("↑ 20%");
  await stats2.locator(".builder-list-row").nth(0).locator("input").nth(1).fill("Coverage capacity");
  await stats2.locator(".builder-list-row").nth(1).locator(".mini-btn-danger").click();
}
await openService(TIERED_SERVICE_NAME);
await switchToTiered();
await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(0).fill("3");
await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(1).fill("200");
await bandsBlock().locator(".builder-band-row").nth(1).locator("input").nth(1).fill("300");

// Wire the new tiered service to the per-service alternate pricing driver — the same
// mechanism FedEx's Driver Payroll already uses, here set up on a service that never had
// one before, per the requirement that this not be limited to the one deck already using it.
const pricedBy = svcBody().locator(".q-block", { hasText: "Priced by" }).locator("select");
const altOptions = await pricedBy.locator("option").allTextContents();
const altDriverIdx = altOptions.findIndex((t) => t.includes("field technicians"));
check("edit: number question available as alternate pricing driver for a new service", altDriverIdx > 0, altOptions.join(" | "));
await pricedBy.selectOption({ index: altDriverIdx });
await svcBody().locator(".q-block", { hasText: "Driver label shown next" }).locator("input").fill("Number of field technicians (QA tiered)");

// ========== 4. Add a throwaway service, save, confirm it renders, then remove it ==========
console.log("\n=== Add + remove a service (persisted round trip) ===");
if (!(await svcCard(REMOVABLE_SERVICE_NAME).count())) {
  await form().locator(".mini-btn", { hasText: "Add service" }).click();
  await sIn("Service name").fill(REMOVABLE_SERVICE_NAME);
  await sIn("Delivering team").fill("QA Team");
  await sIn("Band label").fill("Flat monthly rate");
  await svcBody().locator(".q-block", { hasText: "What we handle" }).locator(".builder-list-row input").first().fill("Exists only to verify removal persists");
  const stats3 = svcBody().locator(".q-block", { hasText: "Impact stats" });
  await stats3.locator(".builder-list-row").nth(0).locator("input").nth(0).fill("N/A");
  await stats3.locator(".builder-list-row").nth(0).locator("input").nth(1).fill("Removable QA fixture");
  await stats3.locator(".builder-list-row").nth(1).locator(".mini-btn-danger").click();
  await openService(REMOVABLE_SERVICE_NAME);
  await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(0).fill("999");
}

await saveChanges("driver + existing service + new services + removable service");

// Verify the save actually landed: fresh meeting session so `selected` includes every
// service, including the ones just added.
await page.goto(`${BASE}/decks/${DECK_SLUG}`, { waitUntil: "networkidle" });
await page.waitForSelector(".chip-grid");
await page.waitForTimeout(300);

const driverQLabel = await page.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") .q-label').first().textContent();
check("player: edited pricing driver question text is live", driverQLabel?.trim() === NEW_DRIVER_QUESTION, driverQLabel ?? "");

await page.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("3");
await page.locator(".q-block", { hasText: "How many field technicians" }).first().locator("input").fill("4");
await page.waitForTimeout(200);
await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
await page.waitForTimeout(300);

const seedPrice = await (await priceCard(SEED_SERVICE_NAME)).locator(".kpi-price").first().textContent();
check("player: edited existing service band math (3 routes → $420)", seedPrice?.trim() === "$420", seedPrice ?? "");

const flatPrice = await (await priceCard(FLAT_SERVICE_NAME)).locator(".kpi-price").first().textContent();
check("player: new flat-priced service shows its fixed price regardless of driver value", flatPrice?.trim() === "$350", flatPrice ?? "");

const tieredPrice = await (await priceCard(TIERED_SERVICE_NAME)).locator(".kpi-price").first().textContent();
check("player: new tiered service on its own alternate driver (4 field technicians → $300)", tieredPrice?.trim() === "$300", tieredPrice ?? "");

const removableCountBefore = await (await priceCard(REMOVABLE_SERVICE_NAME)).count();
check("player: throwaway service renders on the pricing slide before removal", removableCountBefore === 1);
await page.screenshot({ path: `${OUT}/pricing-edit-before-removal.png`, fullPage: true });

// ========== Now remove the throwaway service and confirm it's gone ==========
console.log("\n=== Confirm removal persists ===");
await openEditDeck();
await chip("Services").click();
if (await svcCard(REMOVABLE_SERVICE_NAME).count()) {
  await svcCard(REMOVABLE_SERVICE_NAME).locator(".builder-svc-head").click();
  await svcBody().locator("button", { hasText: "Remove this service" }).click();
}
check("edit: removable service no longer in the Services list", (await svcCard(REMOVABLE_SERVICE_NAME).count()) === 0);
await saveChanges("removable service gone");

await page.goto(`${BASE}/decks/${DECK_SLUG}`, { waitUntil: "networkidle" });
await page.waitForSelector(".chip-grid");
await page.waitForTimeout(300);
await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
await page.waitForTimeout(300);
check("player: removed service no longer renders on the pricing slide", (await (await priceCard(REMOVABLE_SERVICE_NAME)).count()) === 0);

// ========== 5. Role enforcement: the pricing section inherits Edit Deck's existing gate ==========
console.log("\n=== Role enforcement inherited, not duplicated ===");
await uiLogin(OM_EMAIL, OM_PASSWORD);
await page.goto(`${BASE}/decks/${DECK_SLUG}/edit`, { waitUntil: "networkidle" });
const omGate = await page.locator(".auth-shell", { hasText: "Your role doesn't include editing decks." }).count();
check("OM: Edit Deck (and its pricing section) blocked by the existing editDeck role check", omGate === 1);
check("OM: no pricing wizard UI leaks through the gate", (await page.locator(".builder-form-pane").count()) === 0);

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
