// Live end-to-end test of "Download PDF" inside the Send to Client dialog, run against a
// real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev
// server.
//
// Context: Send to Client previously only offered a mailto: email draft. This adds a
// second, independent action in the same dialog — meeting.generateLiveQuotePdf — which
// reuses the exact buildQuoteSnapshot/buildQuotePdfBuffer pair Meeting Records (Phase 5a)
// already built, fed with the meeting's LIVE session state rather than a frozen
// pricingSnapshot. Same content scope as the email draft (the client-facing deck as
// currently configured) — deliberately not the Export menu's internal rate-card CSV.
//
// The PDF itself was redesigned from a bare itemized price list into an actual proposal
// document: a real Aeon logo and brand colors, an opening headed by the actual client's
// name (not the deck's own companyName), each selected service explained with the deck's
// own "what we handle" bullets (not invented copy), a pricing table with promo notes
// called out where the deck carries one, a generic closing line, a subtle brand watermark,
// and an Aeon-letterhead-style footer with Aeon's own real, hardcoded contact info (never
// the deck's staticContent.qa — that's the in-deck Q&A slide content about the SERVICE
// being pitched, not "who sent this document"). This suite checks that real structure and
// the real branding, not just that a PDF comes back — a text-only assertion pass had
// previously missed a visual regression a human catches immediately on sight (garbled
// line-wrapping from a leaked pdfkit cursor position, and the deck's own qa contact
// leaking into what should be Aeon's own letterhead).
//
// What it does, through the actual UI — no API shortcuts for the assertions themselves:
//   1. Signs in as the seeded demo user and opens the reference deck (Amazon DSP), which
//      starts every service opted in by default.
//   2. Sets a distinctive driver value, a real client name in Discovery Notes' "Client
//      name" field, and deselects one specific service, leaving another specific service
//      selected — so the PDF's content can be checked against a known, asymmetric
//      configuration.
//   3. Opens Send to Client, clicks "Download PDF", captures the real browser download.
//   4. Confirms the download has real PDF magic bytes and nonzero size (not an error page).
//   5. Extracts the PDF's actual text (via pdfjs-dist, the real Mozilla PDF.js — pdfkit's
//      output is FlateDecode compressed, so this can't be a raw byte/substring check) and
//      confirms: the selected service's name IS present, the deselected service's name is
//      NOT present, and the driver value IS present — i.e. the PDF reflects the actual
//      current session state, not some cached or default configuration.
//   6. Confirms the redesigned content structure itself: a real explanatory bullet from
//      the kept service's own "what we handle" list is present (proof this is an actual
//      service explanation, not a bare price line), and the promo note on a service that
//      has one (and stays selected) appears in the pricing table, while the promo note
//      belonging to the deselected service does not.
//   7. Confirms the header/footer branding fix: the actual client name appears in the
//      header (not the deck's own companyName), and the footer carries Aeon's own real
//      email/website rather than the deck's own staticContent.qa contact.
//
//      Uses pdfjs-dist directly rather than the `pdf-parse` wrapper package: pdf-parse
//      bundles a long-abandoned pdf.js build (v1.10.100, circa 2016) that throws "bad XRef
//      entry" on some perfectly valid PDFs pdfkit produces (confirmed against the current
//      pdfkit version — pdfjs-dist parses the exact same bytes without any issue), so it
//      isn't reliable test tooling here.
//
// Idempotent by design: every deck open creates a fresh Meeting row (same as
// notes-window-e2e.mjs and friends already rely on), so this suite's edits never touch the
// shared Amazon DSP deck's own config — safe to reuse that seeded deck rather than needing
// a dedicated fixture. Nothing here is scoped to a role beyond sendToClient, which the
// seeded demo/admin account already has.
//
// Env: BASE_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo user),
// CHROMIUM_PATH (optional executable override; CI uses Playwright's own install), OUT_DIR
// (downloaded artifacts, default ./e2e-artifacts).

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
if (!BASE) {
  console.error("BASE_URL is required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const DECK_NAME = "Amazon DSP";
const DECK_SLUG = "aeon-logistics";
const KEEP_SERVICE = "Payroll Compliance Management";
const DROP_SERVICE = "Invoice Dispute Management";
const DRIVER_VALUE = "37";
// A real "what we handle" bullet on the kept service (packages/database/prisma/seed-data/
// amazon-dsp.ts) — its presence is what proves the PDF now explains the service rather than
// just naming it next to a price.
const KEEP_SERVICE_BULLET = "missing-punch";
// promoNote on Driver Compliance Management, which stays selected (only DROP_SERVICE gets
// deselected below) — proves the pricing table surfaces a service's promo note.
const KEPT_PROMO_NOTE = "Free Trial: 30 Days";
// promoNote on the DROPPED service — must NOT appear once it's deselected.
const DROPPED_PROMO_NOTE = "Free Trial: 3 Months";
const CLIENT_NAME = "Coleman Logistics LLC";
// Word-boundary regex, not a plain substring: the footer's own real tagline legitimately
// contains "Amazon DSPs" (plural), which would falsely match a bare .includes("Amazon DSP").
const DECK_COMPANY_NAME_STANDALONE = /\bAmazon DSP\b/;
// The deck's own staticContent.qa contact (its in-deck Q&A slide, about the service being
// pitched) — must never leak into the letterhead footer, which is Aeon's own identity.
const DECK_QA_EMAIL = "info@amazondsp.com";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid");
}

console.log("\n=== Set up a live session with a known driver value + service selection ===");
await login();
await page.click(`.deck-card:has-text("${DECK_NAME}")`);
await page.waitForSelector(".viewport", { timeout: 15000 });

await page.waitForSelector(".notes-btn");
const [notesPage] = await Promise.all([page.context().waitForEvent("page"), page.locator(".notes-btn").click()]);
await notesPage.waitForSelector(".chip-grid", { timeout: 15000 });

await notesPage.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill(DRIVER_VALUE);
await notesPage.locator('input[placeholder="e.g. Coleman Logistics LLC"]').first().fill(CLIENT_NAME);

const keepChip = notesPage.locator(".chip-grid .chip", { hasText: KEEP_SERVICE });
const dropChip = notesPage.locator(".chip-grid .chip", { hasText: DROP_SERVICE });
check("setup: reference deck has the expected known services", (await keepChip.count()) === 1 && (await dropChip.count()) === 1);
check("setup: both services start opted-in by default", (await keepChip.getAttribute("class")).includes("selected") && (await dropChip.getAttribute("class")).includes("selected"));

await dropChip.click();
await notesPage.waitForTimeout(1500); // clear useNotesWindowSession's debounce so the server has the real current state before we ask it for a PDF
check("setup: dropped service is now deselected", !(await dropChip.getAttribute("class")).includes("selected"));
check("setup: kept service is still selected", (await keepChip.getAttribute("class")).includes("selected"));
await notesPage.close();

console.log("\n=== Trigger Download PDF from Send to Client ===");
const sendBtn = page.locator(".icon-btn", { hasText: "Send to Client" });
check("player: Send to Client button is visible", (await sendBtn.count()) === 1);
await sendBtn.click();
await page.waitForSelector(".modal-card:has-text('Send to Client')", { timeout: 5000 });

const downloadBtn = page.locator(".modal-card button", { hasText: "Download PDF" });
check("dialog: Download PDF button is present alongside the email draft action", (await downloadBtn.count()) === 1);

const [pdfDownload] = await Promise.all([page.waitForEvent("download"), downloadBtn.click()]);
const pdfPath = `${OUT}/send-to-client-live-quote-${Date.now()}.pdf`;
await pdfDownload.saveAs(pdfPath);
const pdfBytes = readFileSync(pdfPath);
check("download: response has real PDF magic bytes (not an error page)", pdfBytes.slice(0, 5).toString("latin1") === "%PDF-");
check("download: response has nonzero size", pdfBytes.length > 200, String(pdfBytes.length));

console.log("\n=== Confirm the PDF reflects the actual current session state ===");
const text = await extractPdfText(pdfBytes);
check("content: PDF includes the currently-selected service", text.includes(KEEP_SERVICE));
check("content: PDF excludes the currently-deselected service", !text.includes(DROP_SERVICE), text.slice(0, 400));
check("content: PDF includes the current driver value", text.includes(DRIVER_VALUE));

console.log("\n=== Confirm the redesigned proposal content structure ===");
check("content: PDF explains the kept service with its real 'what we handle' bullets, not just a price line", text.includes(KEEP_SERVICE_BULLET));
check("content: pricing table surfaces the promo note for a service that has one", text.includes(KEPT_PROMO_NOTE));
check("content: pricing table excludes the promo note for the deselected service", !text.includes(DROPPED_PROMO_NOTE));

console.log("\n=== Confirm the header/footer branding: real client, real Aeon identity ===");
check("content: header shows the actual client name captured in Discovery Notes", text.includes(CLIENT_NAME));
check("content: header does not show the deck's own companyName", !DECK_COMPANY_NAME_STANDALONE.test(text), text.slice(0, 200));
check("content: footer carries Aeon's own real email", text.includes("info@aeonsynergies.com"));
check("content: footer carries Aeon's own real website", text.includes("aeonsynergies.com"));
check("content: footer does not leak the deck's own staticContent.qa contact info", !text.includes(DECK_QA_EMAIL));

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
