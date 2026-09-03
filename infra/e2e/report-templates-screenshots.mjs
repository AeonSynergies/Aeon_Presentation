// Live visual verification of the report-sample template redesign (Templates A/B/C — see
// packages/types/src/deck.ts ReportTemplate), run against a real deployment (post-deploy
// job in .github/workflows/deploy-aws.yml). Unlike the other live-e2e suites, this one
// makes no pass/fail assertions of its own — its only job is to produce real screenshots
// of the affected slides, uploaded as a build artifact ("live-report-screenshots") so a
// human/reviewing agent can visually confirm the templates render correctly against actual
// production data, the same way a screenshot verified the branding fix earlier in this
// project's history. Exits non-zero only on a genuine crash (page error, navigation
// failure) — there's nothing here for it to "fail" a check against.
//
// Screenshots the specific slides the Amazon DSP reassignment task called out:
//   - Driver Compliance Management now carrying Worker Comp Validation (moved off Invoice
//     Dispute Management) and a new Unemployment Claims report.
//   - Route Performance Management's two new incident-breakdown reports, CDF and DSB.
//   - Virtual Dispatch Operator's new Dispatch Tracking report.
//   - The wizard's Services step showing all three reports on Route Performance
//     Management, to confirm the multi-report list renders there too.
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

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
await page.waitForSelector(".deck-grid");

async function clickReportByLabelSubstring(substring) {
  const labels = await page.$$eval(".routebar .stop", (els) => els.map((el) => el.getAttribute("aria-label")));
  const match = labels.find((l) => l && l.includes(substring));
  if (!match) {
    console.log(`NOT FOUND: no "Sample:" slide containing "${substring}" — labels were: ${labels.join(" | ")}`);
    return false;
  }
  await page.$$eval(
    ".routebar .stop",
    (els, targetLabel) => els.find((e) => e.getAttribute("aria-label") === targetLabel)?.click(),
    match,
  );
  await page.waitForTimeout(300);
  return true;
}

async function screenshotSlug(slug, wanted) {
  await page.goto(`${BASE}/decks/${slug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".routebar .stop", { timeout: 15000 });
  for (const { substring, filename } of wanted) {
    const found = await clickReportByLabelSubstring(substring);
    if (found) {
      await page.locator(".slide").screenshot({ path: `${OUT}/${filename}.png` });
      console.log(`Saved ${filename}.png`);
    }
  }
}

await screenshotSlug("aeon-logistics", [
  { substring: "Worker Comp Validation", filename: "01-compliance-worker-comp-validation" },
  { substring: "Unemployment Claims", filename: "02-compliance-unemployment-claims" },
  { substring: "CDF", filename: "03-performance-cdf" },
  { substring: "DSB", filename: "04-performance-dsb" },
  { substring: "Dispatch Tracking", filename: "05-dispatch-tracking" },
]);

// Confirm Invoice Dispute Management's own nav labels no longer include Worker Comp —
// screenshot the Services overview list of "Sample:" labels isn't a thing, so instead
// screenshot the Invoice Dispute Management service slide itself plus log its own report
// labels for the record.
await page.goto(`${BASE}/decks/aeon-logistics`, { waitUntil: "networkidle" });
await page.waitForSelector(".routebar .stop");
const allLabels = await page.$$eval(".routebar .stop", (els) => els.map((el) => el.getAttribute("aria-label")));
console.log("All aeon-logistics nav labels:", allLabels.join(" | "));
const workerCompLabels = allLabels.filter((l) => l && l.toLowerCase().includes("worker comp"));
console.log(`Worker Comp related labels (${workerCompLabels.length}): ${workerCompLabels.join(" | ")}`);

// Wizard: Route Performance Management should list all 3 reports (CDF, DSB, Weekly
// Scorecard Snapshot).
await page.goto(`${BASE}/decks/aeon-logistics/edit`, { waitUntil: "networkidle" });
const form = page.locator(".builder-form-pane");
await form.locator(".builder-step-chip", { hasText: "Services" }).click();
await form.locator(".builder-svc-card", { hasText: "Route Performance Management" }).locator(".builder-svc-head").click();
await page.waitForTimeout(300);
await form.locator(".builder-svc-card.open").screenshot({ path: `${OUT}/06-wizard-performance-reports.png` });
console.log("Saved 06-wizard-performance-reports.png");

console.log("\nPage errors:", pageErrors.length ? pageErrors : "none");
await browser.close();
if (pageErrors.length) process.exit(1);
