// Live verification of the three-pattern slide visual system (dark-gradient /
// light / split light+dark), run against a real deployment (post-deploy job in
// .github/workflows/deploy-aws.yml).
//
// Audit that prompted this: About/Challenges/Benefits got redesigned onto three
// consistent patterns, but Cover, How We Work, the per-service slide, and Q&A were left on
// an older, flatter treatment — "How We Work" specifically read as visibly inconsistent
// next to the redesigned slides. This suite checks every one of those against its intended
// pattern, structurally (cheap DOM/computed-style checks that catch a real regression —
// e.g. the gradient class present but its background rule missing) AND visually: it
// screenshots each affected slide so a human/reviewing agent can actually look at the
// rendered output, the same way the report-template redesign was verified. A passing
// structural check is not proof the slide looks right — only the screenshot is.
//
// Resilience: every check runs through `section()`, which catches any exception instead of
// letting it kill the whole process, so one bad assumption can't hide the rest of this
// suite's results — and this suite itself is one of several independent live-e2e steps in
// deploy-aws.yml (continue-on-error + a final summarize step), so its own crash can't hide
// whether other suites passed either.
//
// Env: BASE_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo user),
// CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (default ./e2e-artifacts/slide-system-screenshots).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("BASE_URL is required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts/slide-system-screenshots";
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

// Cheap structural signal that a "dark-gradient" element's background rule is actually
// applied, not just its class name present in the markup.
async function hasGradientBg(selector) {
  return page.$eval(selector, (el) => getComputedStyle(el).backgroundImage.includes("gradient")).catch(() => false);
}

async function screenshot(filename) {
  await page.locator(".slide").screenshot({ path: `${OUT}/${filename}.png` });
  console.log(`Saved ${filename}.png`);
}

async function checkDeck(slug, deckLabel, n) {
  await page.goto(`${BASE}/decks/${slug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".routebar .stop", { timeout: 15000 });
  const labels = await getLabels();

  await section(`${deckLabel}: Cover is dark-gradient`, async () => {
    await clickLabel("Welcome");
    check(`${deckLabel} cover: .cover-wrap gradient background applied`, await hasGradientBg(".cover-wrap"));
    await screenshot(`${n}-${slug}-01-cover`);
  });

  await section(`${deckLabel}: How We Work is dark-gradient`, async () => {
    await clickLabel("How We Work");
    check(`${deckLabel} how-we-work: .dark-slide gradient background applied`, await hasGradientBg(".dark-slide"));
    await screenshot(`${n}-${slug}-02-how-we-work`);
  });

  await section(`${deckLabel}: per-service intro + detail`, async () => {
    const detailIdx = labels.findIndex((l) => l && l.endsWith(" Details"));
    if (detailIdx < 1) {
      check(`${deckLabel} service slides: found an intro+detail pair`, false, `labels were: ${labels.join(" | ")}`);
      return;
    }
    const introLabel = labels[detailIdx - 1];
    const detailLabel = labels[detailIdx];
    await clickLabel(introLabel);
    check(`${deckLabel} service intro "${introLabel}": .dark-slide gradient background applied`, await hasGradientBg(".dark-slide"));
    await screenshot(`${n}-${slug}-03-service-intro`);
    await clickLabel(detailLabel);
    check(`${deckLabel} service detail "${detailLabel}": split panels present`, (await page.locator(".about-split-left, .about-split-right").count()) === 2);
    await screenshot(`${n}-${slug}-04-service-detail`);
  });

  await section(`${deckLabel}: Q&A (Thank You) is split light+dark`, async () => {
    await clickLabel("Q&A");
    check(`${deckLabel} qa: split panels present`, (await page.locator(".split-panel-dark, .split-panel-light").count()) === 2);
    await screenshot(`${n}-${slug}-05-qa`);
  });
}

await section("setup: sign in as demo user", login);

await checkDeck("aeon-logistics", "amazon-dsp", "01");
await checkDeck("meridian-property", "meridian", "02");
await checkDeck("fedex-pd", "fedex-pd", "03");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
console.log("\nPage errors:", pageErrors.length ? pageErrors : "none");
await browser.close();
if (failed.length > 0 || pageErrors.length > 0) process.exit(1);
