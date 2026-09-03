// Live verification of the report-card-grid consolidation, run against a real deployment
// (post-deploy job in .github/workflows/deploy-aws.yml).
//
// Background: a service with more than one of its own already-assigned reports used to get
// one nav slide PER report; it now gets ONE slide with all of its reports rendered together
// as a card grid (see getSlides.tsx / ServiceReportSlide.tsx). This is a layout-only change
// — which service a report belongs to must never move — so this suite checks both things
// explicitly, not just "looks reasonable":
//   - Slide COUNT actually went down: every service that has any reportSlides now
//     contributes exactly one "Sample:" nav entry, regardless of how many reports it has.
//   - Service ASSIGNMENT is unchanged: for each service's group slide, every one of ITS OWN
//     report titles renders there, and — the direct before/after check — titles that
//     belong to a DIFFERENT service are confirmed absent (e.g. Worker Comp Validation must
//     never reappear on Invoice Dispute Management's slide, the exact regression the
//     original Worker Comp move was verified against).
// It also screenshots every consolidated grid so the layout, highlighting, and the new
// Dispatch Tracking "Planned vs. Executed" summary can actually be looked at, the same way
// every prior redesign round was verified — a passing structural check here is not proof
// the grid looks right, only the screenshot is.
//
// Env: BASE_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo user),
// CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (default ./e2e-artifacts/report-screenshots).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("BASE_URL is required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts/report-screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push("PAGE ERROR: " + e.message));

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

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid");
}

async function getLabels() {
  return page.$$eval(".routebar .stop", (els) => els.map((el) => el.getAttribute("aria-label")));
}

async function clickLabel(label) {
  await page.$$eval(".routebar .stop", (els, target) => els.find((e) => e.getAttribute("aria-label") === target)?.click(), label);
  await page.waitForTimeout(300);
}

async function gotoDeck(slug) {
  await page.goto(`${BASE}/decks/${slug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".routebar .stop", { timeout: 15000 });
}

// Clicks a service's report group slide, confirms every title that belongs to it is
// present and every title from `mustNotContain` (another service's reports) is absent, then
// screenshots the whole slide. `reportCount` is the number of actual reports (report
// cards) the service has — separate from `ownTitles`, which may also include text that
// only appears inside one card (e.g. a summary heading), not a distinct report of its own.
async function checkGroupSlide(deckLabel, groupLabel, reportCount, ownTitles, mustNotContain, filename) {
  await clickLabel(groupLabel);
  const slideText = await page.locator(".slide").innerText().catch(() => "");
  for (const title of ownTitles) {
    check(`${deckLabel} "${groupLabel}": contains its own report "${title}"`, slideText.includes(title));
  }
  for (const title of mustNotContain) {
    check(`${deckLabel} "${groupLabel}": does NOT contain "${title}" (belongs to a different service)`, !slideText.includes(title));
  }
  if (reportCount > 1) {
    check(`${deckLabel} "${groupLabel}": grid renders ${reportCount} report cards`, (await page.locator(".report-card").count()) === reportCount);
  } else {
    check(`${deckLabel} "${groupLabel}": single report stays full-size, no grid wrapper`, (await page.locator(".report-card-grid").count()) === 0);
  }
  await page.locator(".slide").screenshot({ path: `${OUT}/${filename}.png` });
  console.log(`Saved ${filename}.png`);
}

await section("setup: sign in as demo user", login);

await section("aeon-logistics: nav slide count actually reduced", async () => {
  await gotoDeck("aeon-logistics");
  const labels = await getLabels();
  const sampleLabels = labels.filter((l) => l && l.startsWith("Sample:"));
  // 7 services each have their own reportSlides (2, 3, 3, 1, 2, 2, 3 = 16 individual
  // reports before this change) — every one now contributes exactly one nav slide.
  check("aeon-logistics: exactly 7 report nav slides (one per service, down from 16 individual report slides)", sampleLabels.length === 7, `got ${sampleLabels.length}: ${sampleLabels.join(" | ")}`);
});

await section("aeon-logistics: Payroll Compliance Management grid", async () => {
  await checkGroupSlide(
    "aeon-logistics",
    "Sample: Payroll Compliance",
    2,
    ["Payroll vs Revenue", "Overtime Analysis"],
    ["Worker Comp Validation", "Unemployment Claims"],
    "01-payroll-grid",
  );
});

await section("aeon-logistics: Invoice Dispute Management grid — confirms Worker Comp really did move off this service, not just get relabeled", async () => {
  await checkGroupSlide(
    "aeon-logistics",
    "Sample: Invoice Dispute",
    3,
    ["Route Invoice Validation", "Vehicle Invoice Validation", "Vehicle Rental Validation"],
    ["Worker Comp Validation", "Unemployment Claims"],
    "02-invoice-grid",
  );
});

await section("aeon-logistics: Driver Compliance Management grid — Worker Comp Validation + Unemployment Claims present, genuinely distinct content", async () => {
  await checkGroupSlide(
    "aeon-logistics",
    "Sample: Driver Compliance",
    3,
    ["Workers' Comp Claim Snapshot", "Worker Comp Validation", "Unemployment Claims"],
    ["Route Invoice Validation", "Vehicle Invoice Validation"],
    "03-compliance-grid",
  );
});

await section("aeon-logistics: Expert Bookkeeping stays a single full-size slide (only 1 report)", async () => {
  await checkGroupSlide("aeon-logistics", "Sample: Profitability Metrics", 1, ["Profitability Metrics"], [], "04-bookkeeping-single");
});

await section("aeon-logistics: Driver Recruitment Management grid — width and stacking order (was cropped and side-by-side)", async () => {
  await checkGroupSlide(
    "aeon-logistics",
    "Sample: Driver Recruitment",
    2,
    ["Recruitment Tracking System", "Recruitment Funnel Summary"],
    ["Dispatch Tracking", "End-of-Day Dispatch Summary"],
    "05-recruitment-grid",
  );
  // The confirmed bug: Recruitment Tracking System's operational table was cropped
  // (scrollWidth > clientWidth) inside a half-width grid cell, cutting off "Current
  // Status". Fixed by stacking any grid containing an operational table full-width.
  const scrollInfo = await page.locator(".report-operational-table").first().evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  check(
    "aeon-logistics recruitment grid: Recruitment Tracking System's table has no horizontal overflow",
    scrollInfo.scrollWidth <= scrollInfo.clientWidth + 1,
    JSON.stringify(scrollInfo),
  );
  check(
    "aeon-logistics recruitment grid: stacked full-width (not the 2-column side-by-side grid)",
    (await page.locator(".report-card-grid.stacked").count()) === 1,
  );
  const cardTitles = await page.locator(".report-card-title").allInnerTexts();
  check(
    "aeon-logistics recruitment grid: Recruitment Funnel Summary appears BELOW Recruitment Tracking System (array/DOM order)",
    cardTitles[0]?.includes("Recruitment Tracking System") && cardTitles[1]?.includes("Recruitment Funnel Summary"),
    JSON.stringify(cardTitles),
  );
});

await section("aeon-logistics: Virtual Dispatch Operator grid — Dispatch Tracking's new Planned vs. Executed summary", async () => {
  await checkGroupSlide(
    "aeon-logistics",
    "Sample: Virtual Dispatch",
    2,
    ["End-of-Day Dispatch Summary", "Dispatch Tracking", "Planned vs. Executed"],
    ["Recruitment Tracking System"],
    "06-dispatch-grid",
  );
});

await section("aeon-logistics: Route Performance Management grid — CDF, DSB, Weekly Scorecard Snapshot", async () => {
  await checkGroupSlide("aeon-logistics", "Sample: Route Performance", 3, ["CDF", "DSB", "Weekly Scorecard Snapshot"], [], "07-performance-grid");
});

await section("fedex-pd: Recruitment Assistance grid", async () => {
  await gotoDeck("fedex-pd");
  await checkGroupSlide(
    "fedex-pd",
    "Sample: Recruitment Assistance",
    2,
    ["Recruitment Pipeline Tracker", "Pipeline Summary, This Period"],
    [],
    "08-fedex-recruitment-grid",
  );
});

await section("fedex-pd: single-report services (Settlement Reconciliation) unaffected", async () => {
  const labels = await getLabels();
  const sampleLabels = labels.filter((l) => l && l.startsWith("Sample:"));
  // settlement(1) + driverpay(1) + expenserecon(1) + recruitAssist(2) = 5 individual
  // reports before this change, now 4 nav slides (one per service).
  check("fedex-pd: exactly 4 report nav slides (one per service, down from 5 individual report slides)", sampleLabels.length === 4, `got ${sampleLabels.length}: ${sampleLabels.join(" | ")}`);
});

// Wizard: Route Performance Management should still list all 3 reports (the wizard's own
// list is per-report regardless of on-slide grouping — that's a separate concern).
await section("wizard: Route Performance Management still lists all 3 reports", async () => {
  await page.goto(`${BASE}/decks/aeon-logistics/edit`, { waitUntil: "networkidle" });
  const form = page.locator(".builder-form-pane");
  await form.locator(".builder-step-chip", { hasText: "Services" }).click();
  await form.locator(".builder-svc-card", { hasText: "Route Performance Management" }).locator(".builder-svc-head").click();
  await page.waitForTimeout(300);
  const svcCard = form.locator(".builder-svc-card.open");
  const text = await svcCard.innerText();
  check("wizard: Route Performance Management lists CDF", text.includes("CDF"));
  check("wizard: Route Performance Management lists DSB", text.includes("DSB"));
  check("wizard: Route Performance Management lists Weekly Scorecard Snapshot", text.includes("Weekly Scorecard Snapshot"));
  await svcCard.screenshot({ path: `${OUT}/09-wizard-performance-reports.png` });
  console.log("Saved 09-wizard-performance-reports.png");
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
console.log("\nPage errors:", pageErrors.length ? pageErrors : "none");
await browser.close();
if (failed.length > 0 || pageErrors.length > 0) process.exit(1);
