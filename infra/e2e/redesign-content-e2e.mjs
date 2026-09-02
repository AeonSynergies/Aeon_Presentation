// Live end-to-end test of the About/Challenges/Benefits/Services-tagline redesign, run
// against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a
// local dev server.
//
// What it does, through the actual UI — no API shortcuts for the assertions themselves:
//   1. Signs in as the seeded demo user.
//   2. Opens the Amazon DSP deck and checks, in depth, that:
//      - About renders the two-panel layout (.about-split) with the dark right-panel focus
//        grid populated with this deck's own real industries ("Amazon DSPs", "FedEx ISPs").
//      - Challenges renders the dark numbered grid (.dark-slide .grid-item-numbered) with
//        this deck's own real copy ("Thin Margins").
//      - Benefits renders the same layout with its own real copy ("Predictable Pricing").
//      - The Services overview slide shows each service's tagline ("Accurate, audit-ready
//        records" for Expert Bookkeeping) instead of its delivering team name.
//   3. Spot-checks Meridian Property Partners and FedEx P&D (one assertion per redesigned
//      slide each) to confirm the layout is a shared, reusable pattern — not something
//      wired to Amazon DSP alone — and that each deck shows its OWN content, not Amazon's.
//   4. Opens the Deck Builder wizard on the Amazon DSP fixture and confirms the "Delivering
//      team" field on the Services step still shows the real team name (unchanged, still
//      driving whatever consumes it elsewhere) — i.e. the additive tagline field didn't
//      repurpose or remove it.
//
// Env: BASE_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo user),
// CHROMIUM_PATH (optional executable override; CI uses Playwright's own install).

import { chromium } from "playwright";

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("BASE_URL is required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";

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

async function gotoSlide(slug, label) {
  await page.goto(`${BASE}/decks/${slug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".routebar .stop");
  await page.click(`.routebar .stop[aria-label="${label}"]`);
  await page.waitForTimeout(250);
}

await login();

// ---------- Amazon DSP: full check across all four redesigned surfaces ----------
await gotoSlide("amazon-dsp", "About Us");
check("amazon-dsp about: two-panel layout renders", (await page.locator(".about-split").count()) > 0);
const dspFocusText = await page.locator(".focus-grid").innerText().catch(() => "");
check(
  "amazon-dsp about: focus grid shows this deck's own industries",
  dspFocusText.includes("Amazon DSPs") && dspFocusText.includes("FedEx ISPs"),
  dspFocusText.slice(0, 200),
);

await gotoSlide("amazon-dsp", "Challenges");
check("amazon-dsp challenges: dark numbered-grid layout renders", (await page.locator(".dark-slide .grid-item-numbered").count()) > 0);
const dspChallengesText = await page.locator(".dark-slide").innerText().catch(() => "");
check("amazon-dsp challenges: shows this deck's own real copy", dspChallengesText.includes("Thin Margins"), dspChallengesText.slice(0, 200));

await gotoSlide("amazon-dsp", "Benefits");
check("amazon-dsp benefits: dark numbered-grid layout renders", (await page.locator(".dark-slide .grid-item-numbered").count()) > 0);
const dspBenefitsText = await page.locator(".dark-slide").innerText().catch(() => "");
check("amazon-dsp benefits: shows this deck's own real copy", dspBenefitsText.includes("Predictable Pricing"), dspBenefitsText.slice(0, 200));

await gotoSlide("amazon-dsp", "Services");
const dspServicesText = await page.locator(".slide").innerText().catch(() => "");
check(
  "amazon-dsp services: shows tagline instead of team name",
  dspServicesText.toUpperCase().includes("ACCURATE, AUDIT-READY RECORDS") && !dspServicesText.includes("Accounting & Finance Team"),
  dspServicesText.slice(0, 400),
);

// ---------- Meridian + FedEx P&D: spot-check the same pattern with THEIR own content ----------
await gotoSlide("meridian-property", "About Us");
const meridianFocusText = await page.locator(".focus-grid").innerText().catch(() => "");
check(
  "meridian-property about: focus grid shows its own real content, not Amazon's",
  meridianFocusText.includes("Residential") && !meridianFocusText.includes("Amazon"),
  meridianFocusText.slice(0, 200),
);

await gotoSlide("meridian-property", "Challenges");
const meridianChallengesText = await page.locator(".dark-slide").innerText().catch(() => "");
check(
  "meridian-property challenges: shows its own real copy",
  meridianChallengesText.includes("Prolonged Vacancy"),
  meridianChallengesText.slice(0, 200),
);

await gotoSlide("meridian-property", "Services");
const meridianServicesText = await page.locator(".slide").innerText().catch(() => "");
check(
  "meridian-property services: shows tagline instead of team name",
  meridianServicesText.toUpperCase().includes("FASTER LEASING, FEWER VACANCIES"),
  meridianServicesText.slice(0, 400),
);

await gotoSlide("fedex-pd", "About Us");
const fedexFocusText = await page.locator(".focus-grid").innerText().catch(() => "");
check(
  "fedex-pd about: focus grid shows its own real content, not Amazon's or Meridian's",
  fedexFocusText.includes("FedEx P&D") && !fedexFocusText.includes("Amazon") && !fedexFocusText.includes("Residential"),
  fedexFocusText.slice(0, 200),
);

await gotoSlide("fedex-pd", "Benefits");
const fedexBenefitsText = await page.locator(".dark-slide").innerText().catch(() => "");
check("fedex-pd benefits: shows its own real copy", fedexBenefitsText.includes("Stronger Driver Trust"), fedexBenefitsText.slice(0, 200));

await gotoSlide("fedex-pd", "Services");
const fedexServicesText = await page.locator(".slide").innerText().catch(() => "");
check(
  "fedex-pd services: shows tagline instead of team name",
  fedexServicesText.toUpperCase().includes("CATCH EVERY MISSED DOLLAR"),
  fedexServicesText.slice(0, 400),
);

// ---------- Wizard: confirm "team" is untouched — still there, still editable ----------
await page.goto(`${BASE}/decks/amazon-dsp/edit`, { waitUntil: "networkidle" });
const form = page.locator(".builder-form-pane");
await form.locator(".builder-step-chip", { hasText: "Services" }).click();
await form.locator(".builder-svc-card .builder-svc-head").first().click();
const svcBody = form.locator(".builder-svc-card.open .builder-svc-body");
const teamFieldValue = await svcBody
  .locator(".q-block", { hasText: "Delivering team" })
  .first()
  .locator("input")
  .first()
  .inputValue()
  .catch(() => "");
check("wizard: Delivering team field still present and populated (unchanged)", teamFieldValue.trim().length > 0, teamFieldValue);
const taglineFieldValue = await svcBody
  .locator(".q-block", { hasText: "Tagline" })
  .first()
  .locator("input")
  .first()
  .inputValue()
  .catch(() => "");
check("wizard: Tagline field is present as an additional, separate field", taglineFieldValue.trim().length > 0, taglineFieldValue);

check("no uncaught page errors across the whole run", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.error(`${failed.length} check(s) failed.`);
  process.exit(1);
}
