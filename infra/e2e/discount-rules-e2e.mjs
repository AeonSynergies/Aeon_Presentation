// Live end-to-end test of Discount Rules — pre-decided, deck-build-time discount
// configuration (Edit Deck) plus the presenter's own manual override in Discovery Notes —
// run against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a
// local dev server.
//
// Context: DiscountConfig (packages/types/src/session.ts) already drove pricing end to
// end, but had no control surface — nothing in Discovery Notes let a presenter see or set
// it, and nothing in the wizard let a deck author pre-decide one. This adds:
//   1. Discovery Notes: a manual "additional discount" control (enable toggle, scope,
//      service picker, type, value) — the in-call override path.
//   2. Edit Deck's Pricing Model step: Discount Rules — category discounts (named,
//      presenter-checked) and bundle tiers (a table of thresholds keyed to the live
//      selected-service count, applied automatically).
//   3. All three ADD TOGETHER into one live discount stack: the active bundle tier, EVERY
//      category discount the presenter has checked (any number, none auto-selected), and
//      the manual override, all combine additively — see computeDiscountBreakdown/
//      discountItemsForService (packages/types/src/pricing.ts). None replaces another.
//
// Regression note #1: an earlier version of this suite passed while a real deployed user
// saw a manually-enabled discount do nothing to any total. Root cause: discountApplies()
// checked `discount.services.includes(svcId)` even for scope "all" — but "all" is the
// DEFAULT scope, so a presenter who just checks "Apply a discount" and sets a value (never
// touching the already-correct scope dropdown) left `services` at its default `[]`, and the
// discount silently applied to nothing. Fixed by treating scope "all" as universal
// regardless of `services`' contents — the "Regression #1" section below still covers this
// exact path on a deck with no discountRules configured at all.
//
// Regression note #2: the ORIGINAL discount-rules design had category discounts and the
// bundle tier compete for a single scalar `DiscountConfig` slot — a category discount
// checked "won" over the bundle tier, and if a presenter checked a SECOND category
// discount, the system silently kept applying whichever one was configured FIRST, ignoring
// the presenter's actual second selection (this is what "category discounts were
// auto-applying instead of being presenter-selected" meant in practice — reproduced live in
// a real browser before this fix: checking two category discounts showed both chips as
// selected, but the computed total only ever reflected the first-configured one's value).
// Fixed by replacing the single-scalar model with the additive stack this suite now tests:
// bundle tier + every checked category discount + the manual override, summed.
//
// What it does, through the actual UI + real API calls, against a 4-service fixture deck
// priced at $100/$200/$300/$400 (so every discount below lands on a distinctive, checkable
// total):
//   1. Creates the fixture deck via a raw deck.create call, then in the wizard's Pricing
//      Model step (Edit Deck) adds TWO category discounts ("Women-owned DSPs" 10%, "Local
//      Business" 5%) and three bundle tiers (2 services=5%, 3=10%, 4=15%) — the real
//      add/edit UI, not a direct API payload. Saves the deck.
//   2. Opens a real live session (the popped-out Discovery Notes window). Confirms neither
//      category discount is ever pre-checked, and that the bundle tier (4 services start
//      opted in) is already active automatically — same as before this change.
//   3. Deselects one service (3 selected) and confirms the bundle tier recomputes to 10%
//      automatically, unchanged behavior.
//   4. Checks ONE category discount and confirms it ADDS to the active bundle tier (not
//      replaces it) — 10% + 10% = 20% off. Checks the SECOND category discount and confirms
//      it adds again — 10% + 10% + 5% = 25% off — the core regression check: both
//      contribute independently, neither silently overrides the other. Unchecks one to
//      confirm the removal is just as independent, then re-checks it.
//   5. Enables the manual "additional discount" override (5%, scope all) on top of the
//      above and confirms it adds again — 10% + 10% + 5% + 5% = 30% off — confirming the
//      manual control genuinely stacks rather than replacing the pre-decided discounts.
//   6. Confirms the Discovery Notes "discount breakdown" block lists every active
//      contributing source with its own value at each step, not just a final number.
//   7. Confirms the resulting $420 total (3 services, 30% off $600) is correctly reflected
//      on the real Pricing slide (total + per-card discounted price), in a downloaded Send
//      to Client PDF (via the real pdfjs-dist text extraction other e2e suites use), and in
//      a saved Meeting Record's frozen snapshot (the real /meeting-records list, not a raw
//      API read).
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
const CATEGORY_A = "Women-owned DSPs";
const CATEGORY_B = "Local Business";

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
// lands on a distinctive, checkable total.
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

// A SEPARATE deck that never gets discountRules configured at all — regression coverage
// for Regression #1 above (see the file header): a deck with NO discountRules starts with
// the manual override's scope already at its default "all", the scope a presenter never has
// a reason to touch — the exact path that used to silently discount nothing.
const createdNoRules = await callTrpc("mutation", "deck.create", token, { config: fixtureConfig(`${RUN_TAG}-norules`) });
check("setup: second fixture deck (no discountRules) created", createdNoRules.ok, createdNoRules.message);
const noRulesDeckSlug = createdNoRules.data?.slug;

// ========== Regression #1: manual discount at the untouched default scope ("all") on a deck with NO discountRules ==========
console.log("\n=== Regression #1: manual 'all'-scope discount on a deck with no discountRules ===");
await login();
await page.goto(`${BASE}/decks/${noRulesDeckSlug}`, { waitUntil: "networkidle" });
await page.waitForSelector(".notes-btn", { timeout: 15000 });
await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
await page.waitForTimeout(300);

await section("regression #1: manual all-scope discount on a deck with no discountRules configured", async () => {
  const [notesPageCheck] = await Promise.all([context.waitForEvent("page"), page.locator(".notes-btn").click()]);
  await notesPageCheck.waitForLoadState("networkidle");
  await notesPageCheck.waitForSelector(".chip-grid", { timeout: 15000 });
  check(
    "regression #1: 'Pre-decided discounts' section is absent on a deck with no discountRules",
    (await notesPageCheck.locator(".q-num", { hasText: "PRE-DECIDED DISCOUNTS" }).count()) === 0
  );

  await notesPageCheck.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("1");
  await notesPageCheck.waitForTimeout(300);

  // The scope/type/value controls only render once the discount is enabled — the exact
  // real-user action is just checking this box, so that's the first thing touched.
  const noRulesDiscountBlock = notesPageCheck.locator(".q-block", { hasText: "ADDITIONAL DISCOUNT" });
  await noRulesDiscountBlock.locator('input[type="checkbox"]').click();
  await notesPageCheck.waitForTimeout(200);
  check(
    "regression #1: scope defaults to \"all\" once enabled, before the presenter ever touches the scope select",
    (await noRulesDiscountBlock.locator("select").nth(0).inputValue()) === "all"
  );

  // Never touch the scope select — it's already showing the right thing.
  await noRulesDiscountBlock.locator('input[type="number"]').fill("20");
  await notesPageCheck.waitForTimeout(1500);
  await notesPageCheck.close();
  await page.waitForTimeout(2000); // main window's own poll cycle

  const total = await page.locator(".total-row .tval").textContent();
  check("regression #1: Pricing slide total reflects the untouched-scope manual discount ($1,000 - 20% = $800)", total?.trim() === "$800", total ?? "");
  check(
    "regression #1: at least one price card shows a discounted (strike-through) price",
    (await page.locator(".price-card .kpi-price.strike").count()) > 0
  );
  check("regression #1: savings note is present", (await page.locator(".savings-note").count()) > 0);
});

// ========== Edit Deck: configure both rule types via the real wizard UI ==========
console.log("\n=== Edit Deck: add two category discounts + three bundle tiers ===");
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

await section("wizard: add two category discounts", async () => {
  await addCategoryDiscount(CATEGORY_A, "percent", 10);
  await addCategoryDiscount(CATEGORY_B, "percent", 5);
});

await section("wizard: add three bundle tiers (2=5%, 3=10%, 4=15%)", async () => {
  await addBundleTier(2, "percent", 5);
  await addBundleTier(3, "percent", 10);
  await addBundleTier(4, "percent", 15);
});

// The interactive notes preview (real DiscoveryNotesPanel) only renders in "notes" mode,
// which is the Discovery Questions step's preview, not Pricing Model's own (that one shows
// the live slide deck instead) — switch steps to see the rules just configured render live.
await section("wizard preview: both category discounts + bundle tier ladder render live in Discovery Notes preview", async () => {
  await form.locator(".builder-step-chip", { hasText: "Discovery Questions" }).click();
  await page.waitForTimeout(150);
  check("wizard preview: category A renders as a checkbox in Pre-decided discounts", (await preview().locator(".chip-grid .chip", { hasText: CATEGORY_A }).count()) === 1);
  check("wizard preview: category B renders as a checkbox in Pre-decided discounts", (await preview().locator(".chip-grid .chip", { hasText: CATEGORY_B }).count()) === 1);
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

// ========== Live session: none of the pre-decided discounts ever auto-select ==========
console.log("\n=== Live session: category discounts never auto-select, bundle tier is still automatic ===");
await page.goto(`${BASE}/decks/${deckSlug}`, { waitUntil: "networkidle" });
await page.waitForSelector(".notes-btn", { timeout: 15000 });
const [notesPage] = await Promise.all([context.waitForEvent("page"), page.locator(".notes-btn").click()]);
await notesPage.waitForLoadState("networkidle");
await notesPage.waitForSelector(".chip-grid", { timeout: 15000 });

await notesPage.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("1");
await notesPage.locator('input[placeholder="e.g. Coleman Logistics LLC"]').first().fill(CLIENT_NAME);

const svcChip = (name) => notesPage.locator(".q-block", { hasText: "Which services is the client opting into?" }).locator(".chip-grid .chip", { hasText: name });
// Scoped by the .q-num heading span, not the whole .q-block's text — the manual-override
// block's own descriptive copy ("...on top of any pre-decided discounts above...") would
// otherwise case-insensitively match a plain hasText:"PRE-DECIDED DISCOUNTS" filter on
// .q-block too.
const preDecidedBlock = () => notesPage.locator(".q-block").filter({ has: notesPage.locator(".q-num", { hasText: "PRE-DECIDED DISCOUNTS" }) });
const categoryChip = (label) => preDecidedBlock().locator(".chip-grid .chip", { hasText: label });
const manualBlock = () => notesPage.locator(".q-block").filter({ has: notesPage.locator(".q-num", { hasText: "ADDITIONAL DISCOUNT" }) });
const breakdownBlock = () => notesPage.locator(".discount-breakdown");

async function pricingTotalOnNotesPopupParent() {
  await notesPage.waitForTimeout(1800); // clear the notes-window save debounce + main window's poll cycle
  await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
  await page.waitForTimeout(300);
  return (await page.locator(".total-row .tval").textContent())?.trim();
}

await section("live: neither category discount is pre-checked, bundle tier(4)=15% is already active automatically", async () => {
  const selectedCount = await notesPage.locator(".q-block", { hasText: "Which services is the client opting into?" }).locator(".chip.selected").count();
  check("live: all 4 services start selected", selectedCount === 4, String(selectedCount));
  check("live: category A is NOT pre-checked", !(await categoryChip(CATEGORY_A).getAttribute("class")).includes("selected"));
  check("live: category B is NOT pre-checked", !(await categoryChip(CATEGORY_B).getAttribute("class")).includes("selected"));
  check("live: bundle tier hint shows the 15% tier active (4 selected)", /15% tier active/.test((await preDecidedBlock().textContent()) || ""));
  const total = await pricingTotalOnNotesPopupParent();
  check("live: Pricing slide total is $850 (4 services, 15% off $1,000, bundle tier only)", total === "$850", total ?? "");
});

await section("live: deselecting one service recomputes the bundle tier to 10% automatically (unchanged behavior)", async () => {
  await svcChip("Service D").click();
  await notesPage.waitForTimeout(300);
  check("live: bundle tier hint shows the 10% tier active (3 selected)", /10% tier active/.test((await preDecidedBlock().textContent()) || ""));
  const total = await pricingTotalOnNotesPopupParent();
  check("live: Pricing slide total is $540 (3 services A+B+C=$600, 10% off, bundle tier only)", total === "$540", total ?? "");
});

// ========== Live session: category discounts stack additively on top of the bundle tier ==========
console.log("\n=== Live session: checked category discounts ADD to the active bundle tier (core regression check) ===");
await section("live: checking category A adds its 10% to the active 10% bundle tier (20% total)", async () => {
  await categoryChip(CATEGORY_A).click();
  await notesPage.waitForTimeout(300);
  check("live: category A chip shows as selected", (await categoryChip(CATEGORY_A).getAttribute("class")).includes("selected"));
  check("live: breakdown lists both the bundle tier and category A", /Bundle tier/.test((await breakdownBlock().textContent()) || "") && new RegExp(CATEGORY_A).test((await breakdownBlock().textContent()) || ""));
  check("live: breakdown's stacked total is 20% off", /20% off/.test((await breakdownBlock().textContent()) || ""), await breakdownBlock().textContent());
  const total = await pricingTotalOnNotesPopupParent();
  check("live: Pricing slide total is $480 (3 services, 20% off $600)", total === "$480", total ?? "");
});

await section("live: ALSO checking category B adds its 5% on top — the reported bug's exact scenario (both must count, not just the first configured)", async () => {
  await categoryChip(CATEGORY_B).click();
  await notesPage.waitForTimeout(300);
  check("live: category A is STILL checked (checking B did not clear it)", (await categoryChip(CATEGORY_A).getAttribute("class")).includes("selected"));
  check("live: category B shows as checked", (await categoryChip(CATEGORY_B).getAttribute("class")).includes("selected"));
  const breakdownText = await breakdownBlock().textContent();
  check("live: breakdown lists the bundle tier and BOTH category discounts", /Bundle tier/.test(breakdownText || "") && new RegExp(CATEGORY_A).test(breakdownText || "") && new RegExp(CATEGORY_B).test(breakdownText || ""));
  check("live: breakdown's stacked total is 25% off (10 + 10 + 5)", /25% off/.test(breakdownText || ""), breakdownText);
  const total = await pricingTotalOnNotesPopupParent();
  check(
    "live: Pricing slide total is $450 (3 services, 25% off $600) — NOT $480 (would mean category B was ignored)",
    total === "$450",
    total ?? ""
  );
});

await section("live: unchecking one category discount removes only its own contribution, independently", async () => {
  await categoryChip(CATEGORY_B).click();
  await notesPage.waitForTimeout(300);
  const total = await pricingTotalOnNotesPopupParent();
  check("live: Pricing slide total reverts to $480 (back to 20% off, category A alone)", total === "$480", total ?? "");
  // Restore category B before moving on to the manual-override step.
  await categoryChip(CATEGORY_B).click();
  await notesPage.waitForTimeout(300);
  const restoredTotal = await pricingTotalOnNotesPopupParent();
  check("live: re-checking category B restores $450", restoredTotal === "$450", restoredTotal ?? "");
});

// ========== Live session: the manual "additional discount" override stacks too, never replaces ==========
console.log("\n=== Live session: manual override ADDS on top of the pre-decided discounts ===");
await section("live: enabling a 5% manual override adds on top of the bundle tier + both categories (30% total)", async () => {
  await manualBlock().locator('input[type="checkbox"]').click();
  await notesPage.waitForTimeout(200);
  await manualBlock().locator('input[type="number"]').fill("5");
  await notesPage.waitForTimeout(300);
  const breakdownText = await breakdownBlock().textContent();
  check(
    "live: breakdown lists all four active sources (bundle tier, both categories, additional discount)",
    /Bundle tier/.test(breakdownText || "") &&
      new RegExp(CATEGORY_A).test(breakdownText || "") &&
      new RegExp(CATEGORY_B).test(breakdownText || "") &&
      /Additional discount/.test(breakdownText || "")
  );
  check("live: breakdown's stacked total is 30% off (10 + 10 + 5 + 5)", /30% off/.test(breakdownText || ""), breakdownText);
  const total = await pricingTotalOnNotesPopupParent();
  check("live: Pricing slide total is $420 (3 services, 30% off $600) — the full stack combined", total === "$420", total ?? "");
});

const meetingUrl = new URL(notesPage.url());
const meetingId = meetingUrl.searchParams.get("meetingId");
check("live: popout has a meetingId", !!meetingId, notesPage.url());
await notesPage.waitForTimeout(1500);
await notesPage.close();

// ========== Confirm the final combined discount ($420 total: 3 services, 30% off $600) everywhere ==========
console.log("\n=== Confirm the full stack reflects correctly on the Pricing slide ===");
await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
await page.waitForTimeout(300);

const priceCard = (name) => page.locator(".price-card", { hasText: name });
await section("pricing slide: total is $420 (3 services, 30% off $600 combined bundle+category+manual)", async () => {
  const total = await page.locator(".total-row .tval").textContent();
  check("pricing slide: total shows $420", total?.trim().startsWith("$420"), total ?? "");
  check("pricing slide: savings note shows the $180 discount", (await page.locator(".savings-note", { hasText: "$180" }).count()) === 1);
});

await section("pricing slide: Service A's card shows the discounted price ($100 → $70)", async () => {
  const card = priceCard("Service A");
  check("pricing slide: strike-through original price is $100", (await card.locator(".kpi-price.strike").textContent())?.trim() === "$100");
  check("pricing slide: discounted price is $70", (await card.locator(".kpi-price").nth(1).textContent())?.trim() === "$70");
});

await page.screenshot({ path: `${OUT}/discount-rules-pricing-slide.png`, fullPage: true });
console.log("Saved discount-rules-pricing-slide.png");

console.log("\n=== Confirm the full stack reflects correctly in the Send to Client PDF ===");
await section("PDF: total and a discounted row both show $420 / 30% off math", async () => {
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
  check("PDF: total shows $420", text.includes("$420"), text.slice(0, 400));
  check("PDF: Service A's row shows $70 discounted from $100", /\$70\s*\(discounted\s+from\s+\$100\)/.test(text), text);
  await page.locator(".modal-card .icon-btn", { hasText: "✕" }).click();
  await page.waitForSelector(".modal-backdrop", { state: "detached", timeout: 5000 });
});

console.log("\n=== Confirm the full stack reflects correctly in a saved Meeting Record's frozen snapshot ===");
await section("Meeting Record: save it, then confirm the listed total is $420", async () => {
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
  check("meeting records: frozen snapshot's total is $420 (full stack at time of save)", totalCell?.trim() === "$420", totalCell ?? "");
});

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
