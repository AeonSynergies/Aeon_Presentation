// Live end-to-end test of the Deck Builder wizard, run against a real deployment
// (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev server.
//
// What it does, through the actual UI — no API shortcuts:
//   1. Signs in as the seeded demo user.
//   2. If the test deck ("Harbor Lane Dental") doesn't exist yet: creates it through
//      every wizard step from the blank-slate path — basics, pricing model, two services
//      (one with a surcharge toggle, one priced by an alternate driver question), team,
//      content, three-tier discovery questions — and saves it via deck.create.
//   3. Verifies the created deck behaves identically to the seeded decks in the REAL
//      player: per-deck colors, band math, surcharge math, alternate-driver math, and
//      tier-3 Discovery gating.
//   4. Verifies Home lists it with its own accent colors, that Create Deck's start screen
//      no longer offers cloning any live deck (Phase 5c removed that entirely) and instead
//      lists purpose-built templates, and that picking one prefills the wizard with that
//      template's structure — no real company name attached.
//
// Idempotent by design: on re-runs (every push to main redeploys) the creation phase is
// skipped when the deck already exists, and only the behavior checks run — so this is a
// permanent live regression test, not a one-shot that would pile up harbor-lane-dental-2,
// -3… in production.
//
// Env: BASE_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo user),
// CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (screenshots, default ./e2e-artifacts).

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("BASE_URL is required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const DECK_NAME = "Harbor Lane Dental";
const DECK_SLUG = "harbor-lane-dental";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push("PAGE ERROR: " + e.message));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid");
}

async function homeDeckNames() {
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".deck-grid");
  await page.waitForTimeout(400);
  return page.$$eval(".deck-card .dc-name", (els) => els.map((el) => el.textContent));
}

// ---------- creation phase (skipped when the deck already exists) ----------
async function createViaWizard() {
  const form = page.locator(".builder-form-pane");
  const fieldInput = (label) => form.locator(".q-block", { hasText: label }).first().locator('input[type="text"]').first();
  const fieldTextarea = (label) => form.locator(".q-block", { hasText: label }).first().locator("textarea").first();
  const chip = (label) => form.locator(".builder-step-chip", { hasText: label });
  const svcBody = () => form.locator(".builder-svc-card.open .builder-svc-body");
  const sIn = (label) => svcBody().locator(".q-block", { hasText: label }).first().locator('input[type="text"]').first();
  const bandsBlock = () => svcBody().locator(".q-block", { hasText: "Pricing structure" });
  // New services start in flat mode (blankService()'s single uncapped band) — switch to
  // Tiered before touching band rows, or nth(0)'s single input targets the flat price
  // field instead of a tier's "up to" boundary. Idempotent: a no-op if already tiered.
  // The toggle leaves 2 bands (a single band with upTo:null is indistinguishable from
  // flat pricing, so the app can't land on a 1-band "tiered" state) — the fill sequences
  // below fill both of those bands directly instead of "Add band"-ing the second one.
  const switchToTiered = async () => {
    const tieredRadio = bandsBlock().locator(".builder-pricing-mode-option", { hasText: "Tiered" }).locator('input[type="radio"]');
    if (await tieredRadio.isChecked()) return;
    await tieredRadio.click();
  };

  await page.click(".new-deck-btn");
  await page.waitForSelector(".builder-blank-card");
  await page.click(".builder-blank-card");
  await page.waitForSelector(".builder-form-pane");

  // Basics
  await fieldInput("Company / deck name").fill(DECK_NAME);
  await fieldInput("Industry").fill("Dental Practice Management");
  await fieldTextarea("Tagline").fill("Back-office support for growing dental practices.");
  await form.locator(".q-block", { hasText: "Primary accent" }).locator('input[type="text"]').fill("#7C5CBF");
  await form.locator(".q-block", { hasText: "Secondary accent" }).locator('input[type="text"]').fill("#2E8B74");
  await page.waitForTimeout(300);
  const previewVars = await page.$eval(".builder-preview-pane", (el) => el.getAttribute("style"));
  check("wizard: preview picks up accent colors live", previewVars.includes("#7C5CBF") && previewVars.includes("#2E8B74"));

  // Pricing Model — a blank deck starts with exactly one (primary) model in the library.
  await chip("Pricing Model").click();
  await fieldInput("Model label").fill("Operatories");
  await fieldInput("Unit (short, plural)").fill("operatories");
  await fieldInput("Discovery question text").fill("How many operatories does the practice run?");

  // Services — service 1 with surcharge. The first service starts open; close and
  // reopen it so the open action (which snaps the preview to that service's slide)
  // deterministically fires before the preview-follow check below.
  await chip("Services").click();
  const firstHead = form.locator(".builder-svc-card .builder-svc-head").first();
  if (await svcBody().count()) await firstHead.click();
  await firstHead.click();
  await sIn("Service name").fill("Insurance Billing & Claims");
  await sIn("Delivering team").fill("Billing Team");
  await sIn("Band label").fill("Operatory-based · 3 bands");
  await svcBody().locator(".q-block", { hasText: "What we handle" }).locator(".builder-list-row input").first().fill("Claims submission and tracking end-to-end");
  const statsBlock = svcBody().locator(".q-block", { hasText: "Impact stats" });
  await statsBlock.locator(".builder-list-row").nth(0).locator("input").nth(0).fill("↓ 40%");
  await statsBlock.locator(".builder-list-row").nth(0).locator("input").nth(1).fill("Fewer rejected claims");
  await statsBlock.locator(".builder-list-row").nth(1).locator(".mini-btn-danger").click();
  await svcBody().locator(".q-block", { hasText: "Dashboards / reports" }).locator(".mini-btn", { hasText: "Add dashboard" }).click();
  await svcBody().locator(".q-block", { hasText: "Dashboards / reports" }).locator(".builder-list-row input").first().fill("Claims Aging Dashboard");
  check("wizard: new services start in flat pricing mode", await bandsBlock().locator(".builder-pricing-mode-option", { hasText: "Single flat" }).locator('input[type="radio"]').isChecked());
  await switchToTiered();
  await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(0).fill("5");
  await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(1).fill("400");
  await bandsBlock().locator(".builder-band-row").nth(1).locator("input").nth(0).fill("10");
  await bandsBlock().locator(".builder-band-row").nth(1).locator("input").nth(1).fill("600");
  await bandsBlock().locator(".mini-btn", { hasText: "Add band" }).click();
  await bandsBlock().locator(".builder-band-row").nth(2).locator("input").nth(1).fill("800");
  await svcBody().locator(".mini-btn", { hasText: "Add surcharge toggle" }).click();
  await svcBody().locator(".q-block", { hasText: "Amount added" }).locator("input").fill("250");
  await svcBody().locator(".q-block", { hasText: "Toggle question label" }).locator("input").fill("Does the practice need aged-claims cleanup (claims older than 90 days)?");
  await svcBody().locator(".q-block", { hasText: "“Off” option label" }).locator("input").fill("Current claims only");
  await svcBody().locator(".q-block", { hasText: "“On” option label" }).locator("input").fill("Yes, cleanup needed");
  await page.waitForTimeout(400);
  const slideTitle = await page.$eval(".builder-preview-canvas .slide-title", (el) => el.textContent).catch(() => "");
  check("wizard: preview follows to the real service slide", slideTitle.includes("Insurance Billing"), slideTitle);

  // Services — service 2 (alternate driver wired after its question exists)
  await form.locator(".mini-btn", { hasText: "Add service" }).click();
  await sIn("Service name").fill("Patient Scheduling Support");
  await sIn("Delivering team").fill("Front Office Team");
  await svcBody().locator(".q-block", { hasText: "Category" }).locator("select").selectOption("strategic");
  await sIn("Band label").fill("Hygienist-based · 2 bands");
  await svcBody().locator(".q-block", { hasText: "What we handle" }).locator(".builder-list-row input").first().fill("Recall scheduling and no-show follow-up");
  const stats2 = svcBody().locator(".q-block", { hasText: "Impact stats" });
  await stats2.locator(".builder-list-row").nth(0).locator("input").nth(0).fill("↓ 25%");
  await stats2.locator(".builder-list-row").nth(0).locator("input").nth(1).fill("Fewer no-shows");
  await stats2.locator(".builder-list-row").nth(1).locator(".mini-btn-danger").click();
  await switchToTiered();
  await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(0).fill("3");
  await bandsBlock().locator(".builder-band-row").nth(0).locator("input").nth(1).fill("300");
  await bandsBlock().locator(".builder-band-row").nth(1).locator("input").nth(1).fill("450");

  // Discovery — general + tier-3 number question; verify live gating in the notes preview
  await chip("Discovery Questions").click();
  await form.locator(".mini-btn", { hasText: "Add general question" }).click();
  let lastCard = form.locator(".builder-subcard").filter({ has: page.locator("input") }).last();
  await lastCard.locator(".q-block", { hasText: "Question label" }).locator("input").fill("What practice management software do you use?");
  await form.locator(".mini-btn", { hasText: "Add question for Patient Scheduling Support" }).click();
  lastCard = form.locator(".builder-subcard").filter({ has: page.locator("input") }).last();
  await lastCard.locator(".q-block", { hasText: "Question label" }).locator("input").fill("How many hygienists does the practice employ?");
  await lastCard.locator(".q-block", { hasText: "Answer type" }).locator("select").selectOption("number");
  const notesPreview = page.locator(".builder-notes-preview");
  check("wizard: discovery preview is the real Notes panel (3 tiers)", (await notesPreview.locator(".tier-heading").count()) === 3);
  const hygBefore = await notesPreview.locator(".q-label", { hasText: "hygienists" }).count();
  await notesPreview.locator(".chip", { hasText: "Patient Scheduling Support" }).click();
  await page.waitForTimeout(200);
  const hygAfter = await notesPreview.locator(".q-label", { hasText: "hygienists" }).count();
  check("wizard: tier-3 gating works live in preview", hygBefore === 1 && hygAfter === 0, `${hygBefore} -> ${hygAfter}`);
  await notesPreview.locator(".chip", { hasText: "Patient Scheduling Support" }).click();
  check("wizard: surcharge toggle shown locked in tier 3", (await form.locator(".builder-locked", { hasText: "aged-claims cleanup" }).count()) === 1);

  // Back to Services: a second pricing model, created from the "Priced by" dropdown's
  // "+ Create new model" round trip rather than a pre-existing question. Which service
  // card is open is now lifted state that survives navigating away and back (that's what
  // makes the round trip below land back in the right place), so it's still open here from
  // when it was added — only click its head if it isn't.
  await chip("Services").click();
  const patientSchedulingCard = form.locator(".builder-svc-card", { hasText: "Patient Scheduling Support" });
  if (!(await patientSchedulingCard.locator(".builder-svc-body").count())) {
    await patientSchedulingCard.locator(".builder-svc-head").click();
  }
  const pricedBy = svcBody().locator(".q-block", { hasText: "Priced by" }).locator("select");
  check("wizard: Priced by dropdown offers the primary model plus '+ Create new model'", (await pricedBy.locator("option").count()) === 2);
  await pricedBy.selectOption({ label: "+ Create new model" });

  // Should land on Step 2 with a new blank model ready and a banner naming the return path.
  check("wizard: '+ Create new model' jumps to Step 2", (await chip("Pricing Model").getAttribute("class")).includes("active"));
  check(
    "wizard: Step 2 banner names the service the new model is for",
    (await form.locator(".builder-locked", { hasText: "Patient Scheduling Support" }).count()) === 1,
  );
  const newModelCard = form.locator(".builder-subcard").last();
  await newModelCard.locator(".q-block", { hasText: "Model label" }).locator("input").fill("Number of hygienists");
  await newModelCard.locator(".q-block", { hasText: "Unit" }).locator("input").fill("hygienists");
  await newModelCard.locator(".q-block", { hasText: "Discovery question text" }).locator("input").fill("How many hygienists does the practice employ?");
  await form.locator(".mini-btn", { hasText: "Back to Services" }).click();

  // Round trip lands back on exactly the service that asked for it, already assigned to
  // the model just created (no manual re-selection needed).
  check("wizard: round trip returns to the Services step", (await chip("Services").getAttribute("class")).includes("active"));
  check(
    "wizard: Patient Scheduling Support is still open after the round trip",
    (await form.locator(".builder-svc-card.open", { hasText: "Patient Scheduling Support" }).count()) === 1,
  );
  const pricedBySelectedLabel = await pricedBy.evaluate((el) => el.options[el.selectedIndex]?.text || "");
  check(
    "wizard: the new model is already assigned to the service that created it",
    pricedBySelectedLabel.includes("Number of hygienists"),
    pricedBySelectedLabel,
  );

  // Team
  await chip("Team").click();
  await fieldInput("Name").fill("Rowan Patel");
  await fieldInput("Title").fill("Practice Operations Lead");
  await fieldInput("Email").fill("rowan@harborlanedental.com");
  await fieldInput("Phone").fill("+1 (555) 010-2030");
  check("wizard: initials auto-derived from name", (await fieldInput("Initials").inputValue()) === "RP");

  // Content
  await chip("Content").click();
  await fieldTextarea("Subtitle").fill("We run the back office so your clinical team runs the practice.");
  await form.locator(".builder-svc-head", { hasText: "ABOUT US" }).click();
  await fieldTextarea("Body").fill("Harbor Lane Dental is a dedicated back-office team for dental practices.");
  await form.locator(".q-block", { hasText: "Bullets" }).locator(".mini-btn", { hasText: "Add bullet" }).click();
  await form.locator(".q-block", { hasText: "Bullets" }).locator(".builder-list-row input").first().fill("One team across billing, scheduling, and reporting");
  await form.locator(".builder-svc-head", { hasText: "CHALLENGES" }).click();
  const challenges = form.locator(".q-block", { hasText: "Challenge items" });
  await challenges.locator(".mini-btn", { hasText: "Add challenge" }).click();
  await challenges.locator(".builder-list-row input").nth(0).fill("Rejected insurance claims sitting unworked");
  await challenges.locator(".mini-btn", { hasText: "Add challenge" }).click();
  await challenges.locator(".builder-list-row input").nth(1).fill("Front desk overwhelmed by recall scheduling");
  await form.locator(".builder-svc-head", { hasText: "BENEFITS" }).click();
  const benefits = form.locator(".q-block", { hasText: "Benefit items" });
  await benefits.locator(".mini-btn", { hasText: "Add benefit" }).click();
  await benefits.locator(".builder-list-row input").nth(0).fill("Cleaner claims and faster reimbursement");
  await benefits.locator(".mini-btn", { hasText: "Add benefit" }).click();
  await benefits.locator(".builder-list-row input").nth(1).fill("Fuller schedules with fewer no-shows");
  await form.locator(".builder-svc-head", { hasText: "Q&A / CONTACT" }).click();
  await form.locator(".q-block", { hasText: "Email" }).locator("input").fill("hello@harborlanedental.com");
  await form.locator(".q-block", { hasText: "Phone" }).locator("input").fill("+1 (555) 010-2000");
  await form.locator(".q-block", { hasText: "Website" }).locator("input").fill("www.harborlanedental.com");
  await form.locator(".q-block", { hasText: "Address" }).locator("input").fill("12 Harbor Lane, Portland, ME 04101");

  // Review + create
  await chip("Review").click();
  const issueCount = await form.locator(".builder-issues li").count();
  check("wizard: no validation issues on a fully-filled deck", issueCount === 0);
  await page.screenshot({ path: `${OUT}/wizard-review.png`, fullPage: true });
  await Promise.all([
    page.waitForURL(`**/decks/${DECK_SLUG}`, { timeout: 20000 }),
    form.locator(".btn-primary", { hasText: "Create deck" }).click(),
  ]);
  check("wizard: deck created and opened in the real player", page.url().includes(`/decks/${DECK_SLUG}`));
}

// ---------- behavior verification (always runs) ----------
// Discovery Notes has no in-page panel anymore in any mode (see DeckPlayer.tsx) — every
// edit here goes through the real popped-out notes window, exactly like a real user would,
// and every check reads the main window's Pricing slide to confirm the two stay in sync
// through the real backend (save debounce + poll — see useNotesWindowSession.ts /
// useDeckSession.ts), not a shortcut back into the main page's own state.
const SYNC_WAIT_MS = 3000; // 800ms save debounce + 1500ms poll + margin
async function verifyDeckBehavior() {
  await page.goto(`${BASE}/decks/${DECK_SLUG}`);
  await page.waitForSelector(".notes-btn");
  await page.waitForTimeout(400);

  const playerVars = await page.$eval('[style*="--amber"]', (el) => el.getAttribute("style"));
  check("player: created deck uses its own colors", playerVars.includes("#7C5CBF") && playerVars.includes("#2E8B74"));

  check("player: Discovery Notes has no in-page panel — popout button visible instead", (await page.locator(".notes-wrap").count()) === 0 && (await page.locator(".notes-btn").isVisible()));

  const [notesPage] = await Promise.all([page.context().waitForEvent("page"), page.locator(".notes-btn").click()]);
  await notesPage.waitForLoadState("networkidle");
  await notesPage.waitForSelector(".chip-grid", { timeout: 15000 });

  await notesPage.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("7");
  await notesPage.locator(".q-block", { hasText: "How many hygienists" }).first().locator("input").fill("2");
  await notesPage.waitForTimeout(SYNC_WAIT_MS);
  await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
  await page.waitForTimeout(300);
  let total = await page.$eval(".tval", (el) => el.textContent.trim());
  check("player: band math (7 operatories → $600, 2 hygienists → $300)", total === "$900", total);

  await notesPage.locator(".q-block", { hasText: "aged-claims cleanup" }).first().locator(".toggle-opt").nth(1).click();
  await notesPage.waitForTimeout(SYNC_WAIT_MS);
  total = await page.$eval(".tval", (el) => el.textContent.trim());
  check("player: surcharge adds exactly $250 to its own service", total === "$1,150", total);

  await notesPage.locator(".q-block", { hasText: "How many hygienists" }).first().locator("input").fill("5");
  await notesPage.waitForTimeout(SYNC_WAIT_MS);
  total = await page.$eval(".tval", (el) => el.textContent.trim());
  check("player: alternate-driver band change (5 hygienists → $450)", total === "$1,300", total);

  // Deselecting removes that service's slide, shifting Pricing's index — re-navigate.
  await notesPage.locator(".chip", { hasText: "Patient Scheduling Support" }).click();
  await notesPage.waitForTimeout(SYNC_WAIT_MS);
  const hygVisible = await notesPage.locator(".q-block", { hasText: "How many hygienists" }).count();
  await page.locator(".routebar .stop", { hasText: "Pricing" }).click();
  await page.waitForTimeout(300);
  total = await page.$eval(".tval", (el) => el.textContent.trim());
  check("player: tier-3 gating + pricing after deselect", hygVisible === 0 && total === "$850", `q=${hygVisible} total=${total}`);
  await page.screenshot({ path: `${OUT}/player-pricing.png`, fullPage: true });
  await notesPage.close();
}

// Phase 5c: a real client's live deck should never double as another client's template,
// so Create Deck's start screen no longer offers cloning ANY live deck — not the seeded
// ones, not the one this suite just created. Templates (packages/types/src/templates.ts)
// replace that entirely; this checks both the removal and the replacement.
const LIVE_DECK_NAMES = ["Amazon DSP", "Meridian Property Partners", "FedEx P&D", DECK_NAME];
const TEMPLATE_LABELS = [
  "IT Managed Services Provider",
  "Multi-Location Hospitality Group",
  "Staffing & Recruiting Agency Back Office",
  "Last-Mile Delivery Operations",
  "Property Management Back Office",
  "Contracted Delivery Operations",
];

// The three generic templates were rewritten to be structurally distinct from each other
// (not just reskinned): different pricing-driver units, different service mixes, and each
// with its own alternate-driver service priced by something other than the deck's default
// driver. Verified per-template below: blank company name (a template supplies structure,
// not a placeholder identity), its own driver label, its own service count, and that its
// alternate-driver service actually offers a second "Priced by" option.
const NEW_GENERIC_TEMPLATES = [
  { label: "IT Managed Services Provider", driverLabel: "Devices managed", serviceCount: 4, altDriverService: "Onboarding & Offboarding Support", altDriverFieldId: "employeeHeadcount" },
  { label: "Multi-Location Hospitality Group", driverLabel: "Active locations", serviceCount: 4, altDriverService: "Staff Recruiting & Onboarding", altDriverFieldId: "hiresPerQuarter" },
  { label: "Staffing & Recruiting Agency Back Office", driverLabel: "Active placements", serviceCount: 4, altDriverService: "Client Account Management", altDriverFieldId: "activeClientAccounts" },
];

async function verifyHomeAndTemplates() {
  const names = await homeDeckNames();
  check("home: created deck listed alongside the seeded three", names.includes(DECK_NAME) && names.length >= 4, names.join(", "));
  const badge = await page.$$eval(".deck-card", (els) => {
    const card = els.find((el) => el.querySelector(".dc-name")?.textContent === "Harbor Lane Dental");
    return card ? getComputedStyle(card.querySelector(".dc-badge")).backgroundImage : "NOT FOUND";
  });
  check("home: created deck badge uses its own colors", badge.includes("46, 139, 116") && badge.includes("124, 92, 191"), badge);
  await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });

  await page.click(".new-deck-btn");
  await page.waitForSelector(".builder-blank-card");
  const startNames = await page.$$eval(".deck-card .dc-name", (els) => els.map((el) => el.textContent));
  check(
    "wizard: start screen no longer offers cloning any live deck",
    LIVE_DECK_NAMES.every((n) => !startNames.includes(n)),
    startNames.join(", "),
  );
  check(
    "wizard: start screen lists all 6 purpose-built templates",
    TEMPLATE_LABELS.every((l) => startNames.includes(l)),
    startNames.join(", "),
  );

  await page.locator(".deck-card", { hasText: "Property Management Back Office" }).click();
  await page.waitForSelector(".builder-form-pane");
  const form = page.locator(".builder-form-pane");
  const templateCompanyName = await form.locator(".q-block", { hasText: "Company / deck name" }).locator('input[type="text"]').inputValue();
  const templateDriverLabel = await (async () => {
    await form.locator(".builder-step-chip", { hasText: "Pricing Model" }).click();
    return form.locator(".q-block", { hasText: "Model label" }).locator('input[type="text"]').first().inputValue();
  })();
  await form.locator(".builder-step-chip", { hasText: "Services" }).click();
  const templateSvcCount = await form.locator(".builder-svc-card").count();
  check(
    "wizard: picking a template prefills its structure with no real company name",
    templateCompanyName === "" && templateDriverLabel === "Units managed" && templateSvcCount === 4,
    `company="${templateCompanyName}" driver="${templateDriverLabel}" services=${templateSvcCount}`,
  );

  // The three generic templates specifically: each must be structurally its own thing, not
  // a reskin of the other two — different driver unit, different service count/mix, and a
  // working alternate-driver service in each.
  for (const tpl of NEW_GENERIC_TEMPLATES) {
    await page.goto(`${BASE}/`);
    await page.waitForSelector(".deck-grid");
    await page.click(".new-deck-btn");
    await page.waitForSelector(".builder-blank-card");
    await page.locator(".deck-card", { hasText: tpl.label }).click();
    await page.waitForSelector(".builder-form-pane");
    const tplForm = page.locator(".builder-form-pane");

    const tplCompanyName = await tplForm.locator(".q-block", { hasText: "Company / deck name" }).locator('input[type="text"]').inputValue();
    await tplForm.locator(".builder-step-chip", { hasText: "Pricing Model" }).click();
    const tplDriverLabel = await tplForm.locator(".q-block", { hasText: "Model label" }).locator('input[type="text"]').first().inputValue();
    await tplForm.locator(".builder-step-chip", { hasText: "Services" }).click();
    const tplSvcCount = await tplForm.locator(".builder-svc-card").count();
    check(
      `wizard: "${tpl.label}" template prefills its own distinct structure`,
      tplCompanyName === "" && tplDriverLabel === tpl.driverLabel && tplSvcCount === tpl.serviceCount,
      `company="${tplCompanyName}" driver="${tplDriverLabel}" services=${tplSvcCount}`,
    );

    await tplForm.locator(".builder-svc-card", { hasText: tpl.altDriverService }).locator(".builder-svc-head").click();
    const altSvcBody = tplForm.locator(".builder-svc-card.open .builder-svc-body");
    const pricedBySelect = altSvcBody.locator(".q-block", { hasText: "Priced by" }).locator("select");
    const pricedByValue = await pricedBySelect.inputValue();
    check(
      `wizard: "${tpl.label}" template's alternate-driver service ("${tpl.altDriverService}") is pre-wired to its own driver question, not the deck default`,
      pricedByValue === tpl.altDriverFieldId,
      pricedByValue,
    );
  }
}

// ---------- run ----------
await login();
const names = await homeDeckNames();
if (names.includes(DECK_NAME)) {
  console.log(`"${DECK_NAME}" already exists — skipping creation, running behavior checks only (idempotent re-run).`);
} else {
  await createViaWizard();
}
await verifyDeckBehavior();
await verifyHomeAndTemplates();

console.log("\nPage errors:", pageErrors.length ? pageErrors : "none");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED` : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
