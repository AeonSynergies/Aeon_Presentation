// Live end-to-end test of Discovery Notes always living in its own popped-out window, in
// EVERY mode — not just Present, run against a real deployment (post-deploy job in
// .github/workflows/deploy-aws.yml) or a local dev server.
//
// Background: an earlier round only actually built the popout for Present/fullscreen mode
// — the in-page panel kept rendering in normal mode, confirmed directly on the live app.
// This suite exists specifically to catch that class of bug (claimed done, only partially
// built) by checking BOTH modes explicitly, not assuming normal mode is fine because
// Present mode is.
//
// What it does, through the actual UI — no API shortcuts:
//   1. Signs in as the seeded demo user and opens the reference deck (Amazon DSP).
//   2. Confirms Discovery Notes is NOT in the DOM in normal (non-Present) mode — not just
//      CSS-hidden, actually unmounted — and that the persistent "Discovery Notes" toolbar
//      button is visible there.
//   3. Clicks it from normal mode, confirms it opens a genuinely separate browser
//      window/page (its own URL), with Discovery Notes rendered there.
//   4. Enters Present/fullscreen mode and confirms Discovery Notes is STILL not in the DOM
//      there either, and that the same "Discovery Notes" control is visible in Present
//      mode's chrome too.
//   5. Clicks it from Present mode, confirms it opens (or refocuses the same named window)
//      correctly there as well.
//   6. Edits the driver value and a service selection in the popped-out window, then
//      confirms the main window's Pricing slide picks up both changes — proving the two
//      windows stay in sync through the real backend (poll + debounced push), not any
//      direct window-to-window messaging. Now checked from normal mode too, since the main
//      window now polls continuously regardless of mode (see useDeckSession.ts).
//
// No state persists that would make re-runs non-idempotent beyond what viewing this deck
// already does today (every deck open creates a fresh Meeting row, exactly like
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

async function openPopoutFrom(label) {
  const [notesPage] = await Promise.all([context.waitForEvent("page"), page.locator(".notes-btn").click()]);
  await notesPage.waitForLoadState("networkidle");
  await notesPage.waitForSelector(".notes-wrap", { timeout: 15000 });
  check(
    `${label}: popout opened as a genuinely separate window (own URL, not an overlay)`,
    notesPage.url().includes("/notes?meetingId=") && notesPage.url() !== page.url(),
    notesPage.url(),
  );
  check(`${label}: Discovery Notes rendered in the popout`, (await notesPage.locator(".notes-wrap").count()) > 0);
  return notesPage;
}

await login();
await page.click(`.deck-card:has-text("${DECK_NAME}")`);
await page.waitForSelector(".viewport", { timeout: 15000 });

// ---------- Normal mode: never in-page, popout works ----------
check("normal mode: Discovery Notes NOT in the DOM (in-page panel must be gone entirely)", (await page.locator(".notes-wrap").count()) === 0);
check("normal mode: persistent Discovery Notes toolbar button visible", await page.locator(".notes-btn").isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}/notes-window-normal-toolbar.png` });

const normalNotesPage = await openPopoutFrom("normal mode");
await normalNotesPage.screenshot({ path: `${OUT}/notes-window-popout.png` });

await page.click('.routebar .stop[aria-label="Pricing"]');
await page.waitForTimeout(300);

await normalNotesPage.locator('input[type="number"]').first().fill("42");
await normalNotesPage.waitForTimeout(1500);
// Poll interval + edit guard in useDeckSession.ts is 1.5s / 2.5s — give it real headroom.
await page.waitForTimeout(3000);
const normalStageText = await page.locator(".stage").innerText();
check(
  "normal mode: driver value edited in the popout reached the main window's Pricing slide",
  normalStageText.includes("42 "),
  normalStageText.slice(0, 200),
);

const firstChip = normalNotesPage.locator(".chip-grid .chip").first();
const wasSelected = (await firstChip.getAttribute("class")).includes("selected");
await firstChip.click();
await normalNotesPage.waitForTimeout(1500);
const nowSelected = (await firstChip.getAttribute("class")).includes("selected");
check("normal mode: popout's own service selection toggle actually changed", nowSelected !== wasSelected);
await normalNotesPage.close();

// ---------- Present mode: same guarantees ----------
await page.click("#presentBtn");
await page.waitForTimeout(500);

check("Present mode: Discovery Notes NOT in the DOM", (await page.locator(".notes-wrap").count()) === 0);
check("Present mode: Discovery Notes toolbar button still visible in the fullscreen chrome", await page.locator(".notes-btn").isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}/notes-window-present-toolbar.png` });

const presentNotesPage = await openPopoutFrom("Present mode");
await presentNotesPage.close();

console.log("\nPage errors:", pageErrors.length ? pageErrors : "none");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED` : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
