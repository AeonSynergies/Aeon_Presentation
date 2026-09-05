// Live end-to-end test of Discount Rules — pre-decided, deck-build-time discount
// configuration (Edit Deck) that suggests/pre-populates the same manual DiscountConfig
// control this suite also exercises in Discovery Notes, run against a real deployment
// (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev server.
//
// Context: DiscountConfig (packages/types/src/session.ts) already drove pricing end to
// end, but had no control surface — nothing in Discovery Notes let a presenter see or set
// it, and nothing in the wizard let a deck author pre-decide one. This adds both:
//   1. Discovery Notes: a manual "Apply a discount" control (enable toggle, scope, service
//      picker, type, value) — the in-call override path.
//   2. Edit Deck's Pricing Model step: Discount Rules — category discounts (a named,
//      presenter-marked-applicable discount) and bundle tiers (a table of thresholds keyed
//      to the live selected-service count, applied automatically).
//   3. The two are wired together via computeAutoDiscount (packages/types/src/pricing.ts):
//      a bundle tier or a marked category discount pre-populates the live DiscountConfig
//      (auto: true) — but any manual edit in Discovery Notes takes precedence (auto: false)
//      and freezes the value until the presenter re-triggers a rule or clicks "Use
//      recommended". Category discounts outrank bundle tiers when both would apply.
//
// Regression note: an earlier version of this suite passed while a real deployed user saw
// a manually-enabled discount do nothing to any total. Root cause: discountApplies()
// (packages/types/src/pricing.ts) checked `discount.services.includes(svcId)` even for
// scope "all" — but "all" is the DEFAULT scope, so a presenter who just checks "Apply a
// discount" and sets a value (never touching the already-correct scope dropdown) left
// `services` at its freshSessionState default of `[]`, and the discount silently applied to
// nothing. This suite's own fixture deck never exercised that path because its manual-
// override section only ran after an auto bundle-tier discount had already populated
// `services` with every service id at scope "all" — so the very first "Regression" section
// below uses a SECOND, separate deck with no discountRules configured at all, to hit the
// same untouched-default-scope path a real user hits. Fixed by making discountApplies treat
// scope "all" as universal regardless of `services`' contents.
//
// What it does, through the actual UI + real API calls, against a 4-service fixture deck
// priced at $100/$200/$300/$400 (so every discount below lands on a distinctive, easy-to-
// verify total):
//   1. Creates the fixture deck via a raw deck.create call, then in the wizard's Pricing
//      Model step (Edit Deck) adds one category discount ("Women-owned DSPs", 20% off) and
//      three bundle tiers (2 services=5%, 3=10%, 4=15%) — the real add/edit UI, not a
//      direct API payload. Saves the deck.
//   2. Opens a real live session (the popped-out Discovery Notes window). Every service
//      starts opted in, so the bundle tier already auto-applies (15%) the moment the
//      meeting is created — confirms that immediately.
//   3. Deselects down to 2, then 3, then back to 4 services, confirming the manual
//      override control's own scope/type/value fields track the auto-recomputed tier at
//      each step (5% → 10% → 15%) without the presenter touching anything.
//   4. Marks the category discount applicable with all 4 services selected — confirms it
//      overrides the bundle tier (20%, not 15%) — then unmarks it and confirms the bundle
//      tier's 15% comes back.
//   5. Manually overrides the discount (scope: single, service A, flat $50 off) via the
//      same control — confirms toggling a service afterward does NOT recompute it (manual
//      freezes it), then confirms "Use recommended" resyncs it back to the current
//      auto-computed bundle tier (15%, 4 services).
//   6. Confirms the resulting $850 total (4 services, 15% off $1,000) is correctly
//      reflected on the real Pricing slide (total + per-card discounted price), in a
//      downloaded Send to Client PDF (via the real pdfjs-dist text extraction other e2e
//      suites use), and in a saved Meeting Record's frozen snapshot (the real
//      /meeting-records list, not a raw API read).
//
// Env: BASE_URL + API_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo
// user), CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (screenshots/PDF, default ./e2e-artifacts/discount-rules).

import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const STANDARD_FONT_DATA_URL = pathToFileURL(require.resolve("pdfjs-dist/package.json").replace("package.json", "standard_fonts/")).href;

async function extractPdfText(bytes) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: STANDARD_FONT_DATA_URL, verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text;
}

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
if (!BASE || !API) {
  console.error("BASE_URL and API_URL are required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts/discount-rules";
mkdirSync(OUT, { recursive: true });

const RUN_TAG = Date.now().toString(36);
const CLIENT_NAME = `Discount QA Client ${RUN_TAG}`;
const CATEGORY_LABEL = "Women-owned DSPs";

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

// 4 flat-priced services on one pricing model, deliberately priced so every discount below
// (5/10/15/20%, or a flat $50 off just service A) lands on a distinctive, checkable total.
function fixtureConfig(suffix) {
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
    companyName: `QA Discount Rules ${suffix}`,
    tagline: "Throwaway fixture for the live discount-rules E2E suite.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Units", unit: "units", questionText: "How many units?", isPrimary: true }],
    services: [svc("svcA", "Service A", 100), svc("svcB", "Service B", 200), svc("svcC", "Service C", 300), svc("svcD", "Service D", 400)],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Discount Rules", sub: "" },
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

const created = await callTrpc("mutation", "deck.create", token, { config: fixtureConfig(RUN_TAG) });
check("setup: fixture deck created", created.ok, created.message);
const deckSlug = created.data?.slug;

// A SEPARATE deck that never gets discountRules configured (never opened in the wizard's
// Pricing Model step at all) — regression coverage for a real bug this suite's own fixture
// deck couldn't have caught, because by the time the fixture's manual-override section ran,
// discount.scope was already "all" with `services` already correctly populated by an auto
// bundle tier. A deck with NO discountRules starts with discount.enabled:false, scope:"all",
// services:[] (freshSessionState's literal default) — the scope a presenter never has a
// reason to touch, since it's already the default. discountApplies used to check
// `discount.services.includes(svcId)` even for scope "all", so a manual discount enabled
// this way silently discounted nothing anywhere (Pricing slide, PDF, Meeting Record) despite
// showing as "enabled" with a real value in Discovery Notes.
const createdNoRules = await callTrpc("mutation", "deck.create", token, { config: fixtureConfig(`${RUN_TAG}-norules`) });
check("setup: second fixture deck (no discountRules) created", createdNoRules.ok, createdNoRules.message);
const noRulesDeckSlug = createdNoRules.data?.slug;

// ========== Regression: manual discount at the untouched default scope ("all") on a deck with NO discountRules ==========
console.log("\n=== Regression: manual 'all'-scope discount on a deck with no discountRules — the real bug's exact path ===");
await login();
await page.goto(`${BASE}/decks/${noRulesDeckSlug}`, { waitUntil: "networkidle" });
await page.waitForSelector(".notes-btn", { timeout: 15000 });
await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
await page.waitForTimeout(300);

await section("regression: manual all-scope discount on a deck with no discountRules configured", async () => {
  const [notesPageCheck] = await Promise.all([context.waitForEvent("page"), page.locator(".notes-btn").click()]);
  await notesPageCheck.waitForLoadState("networkidle");
  await notesPageCheck.waitForSelector(".chip-grid", { timeout: 15000 });
  check(
    "regression: 'Pre-decided discounts' section is absent on a deck with no discountRules",
    (await notesPageCheck.locator(".q-num", { hasText: "PRE-DECIDED DISCOUNTS" }).count()) === 0
  );

  await notesPageCheck.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("1");
  await notesPageCheck.waitForTimeout(300);

  // The scope/type/value controls only render once the discount is enabled — the exact
  // real-user action is just checking this box, so that's the first thing touched.
  const noRulesDiscountBlock = notesPageCheck.locator(".q-block", { hasText: "MANUAL · IN-CALL OVERRIDE" });
  await noRulesDiscountBlock.locator('input[type="checkbox"]').click();
  await notesPageCheck.waitForTimeout(200);
  check(
    "regression: scope defaults to \"all\" once enabled, before the presenter ever touches the scope select",
    (await noRulesDiscountBlock.locator("select").nth(0).inputValue()) === "all"
  );

  // Never touch the scope select — it's already showing the right thing.
  await noRulesDiscountBlock.locator('input[type="number"]').fill("20");
  await notesPageCheck.waitForTimeout(1500);
  await notesPageCheck.close();
  await page.waitForTimeout(2000); // main window's own poll cycle

  const total = await page.locator(".total-row .tval").textContent();
  check("regression: Pricing slide total reflects the untouched-scope manual discount ($1,000 - 20% = $800)", total?.trim() === "$800", total ?? "");
  check(
    "regression: at least one price card shows a discounted (strike-through) price",
    (await page.locator(".price-card .kpi-price.strike").count()) > 0
  );
  check("regression: savings note is present", (await page.locator(".savings-note").count()) > 0);
});

// ========== Edit Deck: configure both rule types via the real wizard UI ==========
console.log("\n=== Edit Deck: add a category discount + three bundle tiers ===");
// Already logged in from the regression section above — logging in again would navigate to
// /login while an authenticated session is active, which redirects away before the form
// ever renders, hanging the fill() calls.
await page.goto(`${BASE}/decks/${deckSlug}/edit`, { waitUntil: "networkidle" });
const form = page.locator(".builder-form-pane");
await form.locator(".builder-step-chip", { hasText: "Pricing Model" }).click();

const preview = () => page.locator(".builder-notes-preview");

async function addCategoryDiscount(label, type, value) {
  await form.locator(".mini-btn", { hasText: "Add category discount" }).click();
  const card = form.locator(".builder-subcard").filter({ hasText: "CATEGORY DISCOUNT" }).last();
  await card.locator(".q-block").nth(0).locator("input").fill(label);
  if (type === "flat") await card.locator(".q-block").nth(1).locator("select").selectOption("flat");
  await card.locator(".q-block").nth(2).locator("input").fill(String(value));
  return card;
}

async function addBundleTier(minServices, type, value) {
  await form.locator(".mini-btn", { hasText: "Add bundle tier" }).click();
  const card = form.locator(".builder-subcard").filter({ hasText: "BUNDLE TIER" }).last();
  await card.locator(".q-block").nth(0).locator("input").fill(String(minServices));
  if (type === "flat") await card.locator(".q-block").nth(1).locator("select").selectOption("flat");
  await card.locator(".q-block").nth(2).locator("input").fill(String(value));
  return card;
}

await section("wizard: add a category discount", async () => {
  await addCategoryDiscount(CATEGORY_LABEL, "percent", 20);
});

await section("wizard: add three bundle tiers (2=5%, 3=10%, 4=15%)", async () => {
  await addBundleTier(2, "percent", 5);
  await addBundleTier(3, "percent", 10);
  await addBundleTier(4, "percent", 15);
});

// The interactive notes preview (real DiscoveryNotesPanel) only renders in "notes" mode,
// which is the Discovery Questions step's preview, not Pricing Model's own (that one shows
// the live slide deck instead) — switch steps to see the rules just configured render live.
await section("wizard preview: category discount + bundle tier ladder render live in Discovery Notes preview", async () => {
  await form.locator(".builder-step-chip", { hasText: "Discovery Questions" }).click();
  await page.waitForTimeout(150);
  const chip = preview().locator(".chip-grid .chip", { hasText: CATEGORY_LABEL });
  check("wizard preview: category discount renders as a checkbox in Pre-decided discounts", (await chip.count()) === 1);
  const hint = preview().locator(".q-hint", { hasText: "Bundle tiers:" });
  const hintText = (await hint.count()) ? await hint.first().textContent() : "";
  check(
    "wizard preview: bundle tier ladder lists all three thresholds",
    /2\+ services = 5%/.test(hintText || "") && /3\+ services = 10%/.test(hintText || "") && /4\+ services = 15%/.test(hintText || ""),
    hintText ?? ""
  );
});

await section("wizard: save the deck", async () => {
  await form.locator(".builder-step-chip", { hasText: "Review" }).click();
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.update")), page.locator(".btn-primary", { hasText: "Save changes" }).click()]);
});

// ========== Live session: bundle tier auto-applies as services are toggled ==========
console.log("\n=== Live session: bundle tier auto-applies on selection changes ===");
await page.goto(`${BASE}/decks/${deckSlug}`, { waitUntil: "networkidle" });
await page.waitForSelector(".notes-btn", { timeout: 15000 });
const [notesPage] = await Promise.all([context.waitForEvent("page"), page.locator(".notes-btn").click()]);
await notesPage.waitForLoadState("networkidle");
await notesPage.waitForSelector(".chip-grid", { timeout: 15000 });

await notesPage.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("1");
await notesPage.locator('input[placeholder="e.g. Coleman Logistics LLC"]').first().fill(CLIENT_NAME);

const svcChip = (name) => notesPage.locator(".q-block", { hasText: "Which services is the client opting into?" }).locator(".chip-grid .chip", { hasText: name });
const discountBlock = () => notesPage.locator(".q-block", { hasText: "MANUAL · IN-CALL OVERRIDE" });
const scopeSelect = () => discountBlock().locator("select").nth(0);
const typeSelect = () => discountBlock().locator("select").nth(1);
const valueInput = () => discountBlock().locator('input[type="number"]');

async function assertAutoDiscount(label, expectType, expectValue) {
  await notesPage.waitForTimeout(250);
  check(`${label}: discount is enabled`, await discountBlock().locator('input[type="checkbox"]').isChecked());
  check(`${label}: scope is "all"`, (await scopeSelect().inputValue()) === "all");
  check(`${label}: type is "${expectType}"`, (await typeSelect().inputValue()) === expectType);
  check(`${label}: value is ${expectValue}`, (await valueInput().inputValue()) === String(expectValue), await valueInput().inputValue());
}

await section("live: every service starts opted in, bundle tier(4)=15% already applied at meeting creation", async () => {
  const selectedCount = await notesPage.locator(".q-block", { hasText: "Which services is the client opting into?" }).locator(".chip.selected").count();
  check("live: all 4 services start selected", selectedCount === 4, String(selectedCount));
  await assertAutoDiscount("live (4 selected, initial)", "percent", 15);
});

await section("live: deselecting down to 2 services recomputes the tier to 5%", async () => {
  await svcChip("Service C").click();
  await svcChip("Service D").click();
  await assertAutoDiscount("live (2 selected)", "percent", 5);
});

await section("live: reselecting a 3rd service recomputes the tier to 10%", async () => {
  await svcChip("Service C").click();
  await assertAutoDiscount("live (3 selected)", "percent", 10);
});

await section("live: reselecting the 4th service recomputes the tier back to 15%", async () => {
  await svcChip("Service D").click();
  await assertAutoDiscount("live (4 selected)", "percent", 15);
});

// ========== Live session: category discount marked applicable overrides the bundle tier ==========
console.log("\n=== Live session: category discount overrides the bundle tier ===");
const categoryChip = () => notesPage.locator(".q-block", { hasText: "PRE-DECIDED DISCOUNTS" }).locator(".chip-grid .chip", { hasText: CATEGORY_LABEL });

await section("live: marking the category discount applicable overrides the 15% bundle tier with 20%", async () => {
  await categoryChip().click();
  await assertAutoDiscount("live (category applied, 4 selected)", "percent", 20);
  check("live: category discount chip shows as selected", (await categoryChip().getAttribute("class")).includes("selected"));
});

await section("live: unmarking the category discount reverts to the bundle tier's 15%", async () => {
  await categoryChip().click();
  await assertAutoDiscount("live (category unmarked, 4 selected)", "percent", 15);
});

// ========== Live session: manual override takes precedence over both ==========
console.log("\n=== Live session: manual override in Discovery Notes takes precedence ===");
await section("live: manually overriding to a flat $50 off Service A only sets auto:false", async () => {
  await scopeSelect().selectOption("single");
  await notesPage.waitForTimeout(150);
  await discountBlock().locator("select").nth(2).selectOption("svcA");
  await typeSelect().selectOption("flat");
  await valueInput().fill("50");
  await notesPage.waitForTimeout(250);
  check("live: manual-override hint appears once auto is false", (await discountBlock().locator("button", { hasText: "Use recommended" }).count()) === 1);
});

await section("live: toggling a service afterward does NOT recompute the manual override", async () => {
  await svcChip("Service D").click(); // deselect
  await notesPage.waitForTimeout(250);
  check("live: manual override's scope stayed \"single\" after a selection change", (await scopeSelect().inputValue()) === "single");
  check("live: manual override's value stayed 50", (await valueInput().inputValue()) === "50");
  await svcChip("Service D").click(); // reselect, back to all 4
  await notesPage.waitForTimeout(250);
});

await section("live: \"Use recommended\" resyncs to the current auto-computed bundle tier (15%, 4 selected)", async () => {
  await discountBlock().locator("button", { hasText: "Use recommended" }).click();
  await assertAutoDiscount("live (after Use recommended)", "percent", 15);
  check("live: manual-override hint is gone once auto is true again", (await discountBlock().locator("button", { hasText: "Use recommended" }).count()) === 0);
});

const meetingUrl = new URL(notesPage.url());
const meetingId = meetingUrl.searchParams.get("meetingId");
check("live: popout has a meetingId", !!meetingId, notesPage.url());
// 800ms useNotesWindowSession save debounce + the main window's own 1500ms poll cycle
// (useDeckSession's REMOTE_POLL_MS) + margin, before the main window is guaranteed current.
await notesPage.waitForTimeout(3000);
await notesPage.close();

// ========== Confirm the final discount ($850 total: 4 services, 15% off $1,000) everywhere ==========
console.log("\n=== Confirm the final discount reflects correctly on the Pricing slide ===");
await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
await page.waitForTimeout(300);

const priceCard = (name) => page.locator(".price-card", { hasText: name });
await section("pricing slide: total is $850 (4 services, 15% off $1,000)", async () => {
  const total = await page.locator(".total-row .tval").textContent();
  check("pricing slide: total shows $850", total?.trim().startsWith("$850"), total ?? "");
  check("pricing slide: savings note shows the $150 discount", (await page.locator(".savings-note", { hasText: "$150" }).count()) === 1);
});

await section("pricing slide: Service A's card shows the discounted price ($100 → $85)", async () => {
  const card = priceCard("Service A");
  check("pricing slide: strike-through original price is $100", (await card.locator(".kpi-price.strike").textContent())?.trim() === "$100");
  check("pricing slide: discounted price is $85", (await card.locator(".kpi-price").nth(1).textContent())?.trim() === "$85");
});

await page.screenshot({ path: `${OUT}/discount-rules-pricing-slide.png`, fullPage: true });
console.log("Saved discount-rules-pricing-slide.png");

console.log("\n=== Confirm the final discount reflects correctly in the Send to Client PDF ===");
await section("PDF: total and a discounted row both show $850 / 15% off math", async () => {
  const sendBtn = page.locator(".icon-btn", { hasText: "Send to Client" });
  await sendBtn.click();
  await page.waitForSelector(".modal-card:has-text('Send to Client')", { timeout: 5000 });
  const downloadBtn = page.locator(".modal-card button", { hasText: "Download PDF" });
  const [pdfDownload] = await Promise.all([page.waitForEvent("download"), downloadBtn.click()]);
  const pdfPath = `${OUT}/discount-rules-live-quote-${Date.now()}.pdf`;
  await pdfDownload.saveAs(pdfPath);
  const pdfBytes = readFileSync(pdfPath);
  check("PDF: real PDF magic bytes", pdfBytes.slice(0, 5).toString("latin1") === "%PDF-");
  const text = await extractPdfText(pdfBytes);
  check("PDF: total shows $850", text.includes("$850"), text.slice(0, 400));
  check("PDF: Service A's row shows $85 discounted from $100", /\$85\s*\(discounted\s+from\s+\$100\)/.test(text), text);
  await page.locator(".modal-card .icon-btn", { hasText: "✕" }).click();
  await page.waitForSelector(".modal-backdrop", { state: "detached", timeout: 5000 });
});

console.log("\n=== Confirm the final discount reflects correctly in a saved Meeting Record's frozen snapshot ===");
await section("Meeting Record: save it, then confirm the listed total is $850", async () => {
  const saveBtn = page.locator(".icon-btn", { hasText: "Save Meeting Record" });
  check("player: Save Meeting Record button is visible", (await saveBtn.count()) === 1);
  await saveBtn.click();
  await page.waitForSelector(".modal-card:has-text('Save Meeting Record')", { timeout: 5000 });
  await page.locator(".modal-card select").selectOption("Won");
  await page.locator(".modal-card textarea").fill(`Discount rules E2E run ${RUN_TAG} — automated record.`);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("meeting.complete")),
    page.locator(".modal-card button[type=submit]", { hasText: "Save record" }).click(),
  ]);
  await page.waitForTimeout(300);
  check("player: record-saved confirmation shows on the button", (await page.locator(".icon-btn", { hasText: "Record Saved" }).count()) === 1);

  await page.goto(`${BASE}/meeting-records`, { waitUntil: "networkidle" });
  await page.waitForSelector(".team-table, .empty-state", { timeout: 15000 });
  const row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
  check("meeting records: the saved record appears in the list", (await row.count()) === 1);
  const totalCell = await row.locator("td").nth(4).textContent();
  check("meeting records: frozen snapshot's total is $850 (bundle tier at time of save)", totalCell?.trim() === "$850", totalCell ?? "");
});

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
