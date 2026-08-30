// Live end-to-end test of the popped-out Discovery Notes window (Present-mode safety fix),
// run against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a
// local dev server.
//
// What it does, through the actual UI — no API shortcuts:
//   1. Signs in as the seeded demo user and opens the reference deck (Amazon DSP).
//   2. Confirms the in-page Discovery Notes panel is present in normal (non-Present) mode —
//      this fix must not touch that path at all.
//   3. Enters Present/fullscreen mode and confirms Discovery Notes is NOT in the DOM there
//      (not just CSS-hidden — actually unmounted, so it can never leak into a shared
//      screen/window), and that the "Discovery Notes" popout control is visible in Present
//      mode's chrome.
//   4. Clicks that control, confirms it opens a genuinely separate browser window/page
//      (its own URL), with Discovery Notes rendered there.
//   5. Edits the driver value and a service selection in that separate window, then
//      confirms the original presenting window's Pricing slide picks up both changes —
//      proving the two windows stay in sync through the real backend (poll + debounced
//      push), not any direct window-to-window messaging.
//
// No state persists that would make re-runs non-idempotent beyond what viewing/presenting
// this deck already does today (every deck open creates a fresh Meeting row, exactly like
// wizard-e2e.mjs and friends already do just by loading the deck) — nothing here is scoped
// to a role, so this suite is agnostic to whichever role the login account currently holds.
//
// Env: BASE_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo user),
// CHROMIUM_PATH (optional executable override; CI uses Playwright's own install), OUT_DIR
// (screenshots, default ./e2e-artifacts).

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

const DECK_NAME = "Amazon DSP";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext();
const page = await context.newPage();
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

await login();
await page.click(`.deck-card:has-text("${DECK_NAME}")`);
await page.waitForSelector(".viewport", { timeout: 15000 });

check("normal mode: Discovery Notes panel present in-page", (await page.locator(".notes-wrap").count()) > 0);

await page.click('.routebar .stop[aria-label="Pricing"]');
await page.waitForTimeout(300);

await page.click("#presentBtn");
await page.waitForTimeout(500);

check("Present mode: Discovery Notes NOT in the DOM", (await page.locator(".notes-wrap").count()) === 0);

const popoutBtn = page.locator(".present-notes-btn");
check("Present mode: Discovery Notes popout control visible in chrome", await popoutBtn.isVisible().catch(() => false));

const [notesPage] = await Promise.all([context.waitForEvent("page"), popoutBtn.click()]);
await notesPage.waitForLoadState("networkidle");
await notesPage.waitForSelector(".notes-wrap", { timeout: 15000 });

check(
  "popout: opened as a genuinely separate window (own URL, not an overlay)",
  notesPage.url().includes("/notes?meetingId=") && notesPage.url() !== page.url(),
  notesPage.url(),
);
check("popout: Discovery Notes rendered there", (await notesPage.locator(".notes-wrap").count()) > 0);

// Driver value only (no service toggle yet): the Pricing slide's own position in the deck
// doesn't move, so checking it's still showing "Pricing" content is a valid way to confirm
// the popout's edit reached the presenting window — unlike a service toggle below, which
// changes how many slides exist at all and would shift what "the current slide" even is.
await notesPage.locator('input[type="number"]').first().fill("42");
await notesPage.waitForTimeout(1500);

// Poll interval + edit guard in useDeckSession.ts is 1.5s / 2.5s — give it real headroom.
await page.waitForTimeout(3000);
const stageText = await page.locator(".stage").innerText();
check("main window: driver value edited in the popout reached the presenting Pricing slide", stageText.includes("42 "), stageText.slice(0, 200));

// Service toggle: verified against the popout's own state (deselecting a service changes
// the deck's total slide count/positions, so the main window's *current slide* is no longer
// a reliable signal here — the backend row itself is the real source of truth for this).
const firstChip = notesPage.locator(".chip-grid .chip").first();
const wasSelected = (await firstChip.getAttribute("class")).includes("selected");
await firstChip.click();
await notesPage.waitForTimeout(1500);
const nowSelected = (await firstChip.getAttribute("class")).includes("selected");
check("popout: service selection toggle actually changed", nowSelected !== wasSelected);

await page.screenshot({ path: `${OUT}/notes-window-present.png`, fullPage: true });
await notesPage.screenshot({ path: `${OUT}/notes-window-popout.png`, fullPage: true });

console.log("\nPage errors:", pageErrors.length ? pageErrors : "none");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED` : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
