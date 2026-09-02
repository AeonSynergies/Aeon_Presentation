// Live end-to-end test of the About/Challenges/Benefits/Services-tagline redesign, run
// against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a
// local dev server.
//
// What it does, through the actual UI — no API shortcuts for the assertions themselves:
//   1. Signs in as the seeded demo user.
//   2. Opens the Amazon DSP deck (real slug "aeon-logistics" — the companyName/file are
//      "Amazon DSP" but the deck's own `id`, used as the DB slug, predates that branding
//      and was never renamed; that's a pre-existing quirk, not something this suite
//      should paper over) and checks, in depth, that:
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
// Resilience: every section below runs through `section()`, which catches ANY exception
// (a wrong selector, a navigation timeout, a bad assumption about the app) and records it
// as a single failed check rather than letting it escape uncaught. An uncaught exception
// here would kill the whole Node process — and because deploy-aws.yml's live-e2e steps
// used to stop at the first failing step, that would silently skip every suite after this
// one. Each section is independent, so one bad assumption in, say, the Amazon DSP checks
// can't prevent the Meridian/FedEx P&D checks or the wizard check from still running and
// reporting their own real pass/fail.
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

// Runs `fn`; if it throws (a selector timeout, a navigation failure, anything), records
// ONE failed check carrying the error message instead of letting the exception escape —
// so a bad assumption in one section never takes down the rest of the run.
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

async function gotoSlide(slug, label) {
  await page.goto(`${BASE}/decks/${slug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".routebar .stop", { timeout: 15000 });
  await page.click(`.routebar .stop[aria-label="${label}"]`);
  await page.waitForTimeout(250);
}

const AMAZON_DSP_SLUG = "aeon-logistics";

await section("setup: sign in as demo user", login);

// ---------- Amazon DSP: full check across all four redesigned surfaces ----------
await section("amazon-dsp about", async () => {
  await gotoSlide(AMAZON_DSP_SLUG, "About Us");
  check("amazon-dsp about: two-panel layout renders", (await page.locator(".about-split").count()) > 0);
  const dspFocusText = await page.locator(".focus-grid").innerText().catch(() => "");
  check(
    "amazon-dsp about: focus grid shows this deck's own industries",
    dspFocusText.includes("Amazon DSPs") && dspFocusText.includes("FedEx ISPs"),
    dspFocusText.slice(0, 200),
  );
});

await section("amazon-dsp challenges", async () => {
  await gotoSlide(AMAZON_DSP_SLUG, "Challenges");
  check("amazon-dsp challenges: dark numbered-grid layout renders", (await page.locator(".dark-slide .grid-item-numbered").count()) > 0);
  const dspChallengesText = await page.locator(".dark-slide").innerText().catch(() => "");
  check("amazon-dsp challenges: shows this deck's own real copy", dspChallengesText.includes("Thin Margins"), dspChallengesText.slice(0, 200));
});

await section("amazon-dsp benefits", async () => {
  await gotoSlide(AMAZON_DSP_SLUG, "Benefits");
  check("amazon-dsp benefits: dark numbered-grid layout renders", (await page.locator(".dark-slide .grid-item-numbered").count()) > 0);
  const dspBenefitsText = await page.locator(".dark-slide").innerText().catch(() => "");
  check("amazon-dsp benefits: shows this deck's own real copy", dspBenefitsText.includes("Predictable Pricing"), dspBenefitsText.slice(0, 200));
});

await section("amazon-dsp services", async () => {
  await gotoSlide(AMAZON_DSP_SLUG, "Services");
  const dspServicesText = await page.locator(".slide").innerText().catch(() => "");
  check(
    "amazon-dsp services: shows tagline instead of team name",
    dspServicesText.toUpperCase().includes("ACCURATE, AUDIT-READY RECORDS") && !dspServicesText.includes("Accounting & Finance Team"),
    dspServicesText.slice(0, 400),
  );
});

// ---------- Meridian + FedEx P&D: spot-check the same pattern with THEIR own content ----------
await section("meridian-property about", async () => {
  await gotoSlide("meridian-property", "About Us");
  const meridianFocusText = await page.locator(".focus-grid").innerText().catch(() => "");
  check(
    "meridian-property about: focus grid shows its own real content, not Amazon's",
    meridianFocusText.includes("Residential") && !meridianFocusText.includes("Amazon"),
    meridianFocusText.slice(0, 200),
  );
});

await section("meridian-property challenges", async () => {
  await gotoSlide("meridian-property", "Challenges");
  const meridianChallengesText = await page.locator(".dark-slide").innerText().catch(() => "");
  check(
    "meridian-property challenges: shows its own real copy",
    meridianChallengesText.includes("Prolonged Vacancy"),
    meridianChallengesText.slice(0, 200),
  );
});

await section("meridian-property services", async () => {
  await gotoSlide("meridian-property", "Services");
  const meridianServicesText = await page.locator(".slide").innerText().catch(() => "");
  check(
    "meridian-property services: shows tagline instead of team name",
    meridianServicesText.toUpperCase().includes("FASTER LEASING, FEWER VACANCIES"),
    meridianServicesText.slice(0, 400),
  );
});

await section("fedex-pd about", async () => {
  await gotoSlide("fedex-pd", "About Us");
  const fedexFocusText = await page.locator(".focus-grid").innerText().catch(() => "");
  check(
    "fedex-pd about: focus grid shows its own real content, not Amazon's or Meridian's",
    fedexFocusText.includes("FedEx P&D") && !fedexFocusText.includes("Amazon") && !fedexFocusText.includes("Residential"),
    fedexFocusText.slice(0, 200),
  );
});

await section("fedex-pd benefits", async () => {
  await gotoSlide("fedex-pd", "Benefits");
  const fedexBenefitsText = await page.locator(".dark-slide").innerText().catch(() => "");
  check("fedex-pd benefits: shows its own real copy", fedexBenefitsText.includes("Stronger Driver Trust"), fedexBenefitsText.slice(0, 200));
});

await section("fedex-pd services", async () => {
  await gotoSlide("fedex-pd", "Services");
  const fedexServicesText = await page.locator(".slide").innerText().catch(() => "");
  check(
    "fedex-pd services: shows tagline instead of team name",
    fedexServicesText.toUpperCase().includes("CATCH EVERY MISSED DOLLAR"),
    fedexServicesText.slice(0, 400),
  );
});

// ---------- Wizard: confirm "team" is untouched — still there, still editable ----------
await section("wizard: Delivering team + Tagline fields", async () => {
  await page.goto(`${BASE}/decks/${AMAZON_DSP_SLUG}/edit`, { waitUntil: "networkidle" });
  const form = page.locator(".builder-form-pane");
  await form.locator(".builder-step-chip", { hasText: "Services" }).click();
  // The Services step opens its first card by default (see DeckWizard.tsx's
  // effectiveOpenServiceId) — a single click on that card's head would CLOSE it, not open
  // it. Guarantee the open state regardless of starting condition, same as wizard-e2e.mjs.
  const firstHead = form.locator(".builder-svc-card .builder-svc-head").first();
  if (await form.locator(".builder-svc-card.open").count()) await firstHead.click();
  await firstHead.click();
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
});

check("no uncaught page errors across the whole run", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.error(`${failed.length} check(s) failed.`);
  process.exit(1);
}
