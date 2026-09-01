// Live end-to-end test of Meeting Records (Phase 5a, extended for the Word/PDF export
// rework), run against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml)
// or a local dev server.
//
// What it does, through the actual UI + real API calls:
//   1. Ensures a dedicated fixture deck exists (created via a raw deck.create API call if
//      missing — not shared with any other suite's fixture). Has two services (one to keep
//      opted in, one to deselect) and three discovery questions (one general, one mapped to
//      each service) so the exports below have real, known-asymmetric content to check.
//   2. Opens the deck, fills Discovery Notes (client name, driver value, the general
//      question's answer, deselects the "Removed" service, answers the "Kept" service's
//      question), clicks "Save Meeting Record", fills the outcome dialog, and saves it — a
//      real meeting.complete call, which freezes that moment's pricing into pricingSnapshot
//      AND that moment's visible discovery Q&A into discoverySnapshot.
//   3. Confirms the new record appears on /meeting-records (with a "Meeting Date" column),
//      and that the search box (by client name), the deck filter, and the date-range filter
//      all actually narrow the list rather than always showing everything.
//   4. Downloads the Word export and confirms: it's a real, valid .docx (real zip/docx
//      magic bytes, and its word/document.xml actually parses), it contains only the
//      Discovery Notes answers — the general question's answer and the kept service's
//      question/answer, but NOT the removed service's name or question, and no pricing
//      figures at all — and that its filename follows "{Meeting ID}_{Org Name}".
//   5. Downloads the regenerated PDF and confirms it's a real PDF (starts with the %PDF
//      magic bytes, nonzero size) whose actual extracted text contains only the kept
//      service (with its price) and excludes the removed service, that its filename also
//      follows "{Meeting ID}_{Org Name}", that its header shows the actual client name
//      recorded on the meeting rather than the fixture deck's own companyName, and that
//      its letterhead footer carries Aeon's own real contact info rather than the fixture
//      deck's own (deliberately empty) staticContent.qa.
//   6. THE CORE GUARANTEE: edits the fixture deck's pricing via a raw deck.update call
//      (same service, new band price) AFTER the record was saved, then re-checks the
//      record's listed total and its regenerated PDF both still show the OLD price — never
//      recomputed from the deck's current (now-changed) config.
//   7. Confirms an Operations Manager is blocked from /meeting-records entirely (gated on
//      the meetingRecords permission, deliberately narrower than discoveryNotes).
//
// Idempotent by design: the fixture deck is created once and re-used. Each run creates a
// fresh Meeting Record rather than trying to reuse one (Discovery Notes sessions are
// naturally one-per-page-load via useDeckSession), so re-runs simply add another record —
// harmless, and the search/filter checks below target this run's own freshly-created
// record by a client name unique to it.
//
// Env: BASE_URL + API_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo
// user), OM_EMAIL/OM_PASSWORD (default: the QA Operations Manager created by
// role-enforcement-e2e.mjs, which this suite also depends on running first), CHROMIUM_PATH
// (optional executable override; CI uses Playwright's own install), OUT_DIR (screenshots +
// downloaded artifacts, default ./e2e-artifacts).

import AdmZip from "adm-zip";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
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

function extractDocxText(bytes) {
  const xml = new AdmZip(bytes).readAsText("word/document.xml");
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}

// Mirrors apps/api/src/routers/meeting.ts's safeFilenamePart exactly, to predict the
// "{Meeting ID}_{Org Name}" filename a download should have.
function safeFilenamePart(v) {
  return v.replace(/[^a-zA-Z0-9-]+/g, "_");
}

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
if (!BASE || !API) {
  console.error("BASE_URL and API_URL are required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OM_EMAIL = process.env.OM_EMAIL || "qa-operations-manager@aeonqa.internal";
const OM_PASSWORD = process.env.OM_PASSWORD || "AeonQaTest123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const DECK_NAME = "QA Meeting Records Test Deck";
const DECK_SLUG = "qa-meeting-records-test-deck";
const KEPT_SERVICE_NAME = "QA Records Service Kept";
const REMOVED_SERVICE_NAME = "QA Records Service Removed";
const GENERAL_Q_LABEL = "QA General Discovery Question";
const KEPT_SERVICE_Q_LABEL = "QA Kept Service Discovery Question";
const REMOVED_SERVICE_Q_LABEL = "QA Removed Service Discovery Question";
const RUN_TAG = Date.now().toString(36);
const CLIENT_NAME = `QA Records Client ${RUN_TAG}`;
const GENERAL_ANSWER = `QA general answer ${RUN_TAG}`;
const KEPT_SERVICE_ANSWER = `QA kept-service answer ${RUN_TAG}`;
const ORIGINAL_BAND_PRICE = 100;
const CHANGED_BAND_PRICE = 999;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
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

async function apiLogin(email, password) {
  const res = await callTrpc("mutation", "auth.login", null, { email, password });
  return { token: res.data?.accessToken, user: res.data?.user, ok: res.ok };
}

function fixtureConfig(bandPrice) {
  return {
    industry: "QA",
    companyName: DECK_NAME,
    tagline: "Dedicated fixture for the live meeting-records E2E suite — not used by any other suite.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Routes", unit: "routes", questionText: "How many routes per day?", isPrimary: true }],
    services: [
      {
        id: "qaRecordsServiceKept",
        name: KEPT_SERVICE_NAME,
        team: "QA Team",
        category: "major",
        pricingModelId: "primary",
        bandLabel: "Route-based · 2 bands",
        handle: ["Seed bullet for the meeting-records E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [
          { upTo: 5, price: bandPrice },
          { upTo: null, price: bandPrice * 2 },
        ],
      },
      {
        id: "qaRecordsServiceRemoved",
        name: REMOVED_SERVICE_NAME,
        team: "QA Team",
        category: "major",
        pricingModelId: "primary",
        bandLabel: "Flat",
        handle: ["Deselected during the test — must never appear in either export"],
        stats: [],
        dashboards: [],
        priceBands: [{ upTo: null, price: 54321 }],
      },
    ],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Meeting Records Fixture", sub: "" },
      about: { title1: "QA", title2: "Deck", body: "", bullets: [] },
      how: { steps: [{ t: "QA", d: "" }] },
      challenges: { items: [] },
      benefits: { items: [] },
      qa: { title: "Questions?", sub: "", email: "", phone: "", web: "", address: "" },
    },
    discoveryQuestions: [
      { id: "qaGeneralQ", section: "general", label: GENERAL_Q_LABEL, type: "text", placeholder: "" },
      { id: "qaKeptServiceQ", section: "general", relatedService: "qaRecordsServiceKept", label: KEPT_SERVICE_Q_LABEL, type: "text" },
      { id: "qaRemovedServiceQ", section: "general", relatedService: "qaRecordsServiceRemoved", label: REMOVED_SERVICE_Q_LABEL, type: "text" },
    ],
  };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

async function uiLogin(email, password) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const signOutBtn = page.locator(".app-header button", { hasText: "Sign out" });
  if (await signOutBtn.count()) {
    await Promise.all([page.waitForURL("**/login"), signOutBtn.click()]);
  } else {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  }
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid", { timeout: 15000 });
}

// ========== Setup: ensure the fixture deck exists ==========
console.log("\n=== Setup ===");
const adminLogin = await apiLogin(EMAIL, PASSWORD);
check("setup: admin API login succeeds", adminLogin.ok);

const existingFixture = await callTrpc("query", "deck.getBySlug", adminLogin.token, { slug: DECK_SLUG });
if (existingFixture.ok) {
  console.log(`"${DECK_NAME}" already exists (created on a previous run) — resetting its pricing to the original value.`);
  const reset = await callTrpc("mutation", "deck.update", adminLogin.token, {
    slug: DECK_SLUG,
    config: fixtureConfig(ORIGINAL_BAND_PRICE),
  });
  check("setup: fixture deck pricing reset to original value", reset.ok, reset.message);
} else {
  const created = await callTrpc("mutation", "deck.create", adminLogin.token, { config: fixtureConfig(ORIGINAL_BAND_PRICE) });
  check("setup: fixture deck.create succeeds", created.ok && created.data?.slug === DECK_SLUG, created.message);
}

// ========== 1. Run a live Discovery Notes session and save it as a Meeting Record ==========
console.log("\n=== Save a Meeting Record ===");
await uiLogin(EMAIL, PASSWORD);
await page.goto(`${BASE}/decks/${DECK_SLUG}`, { waitUntil: "networkidle" });
await page.waitForSelector(".chip-grid");
await page.waitForTimeout(300);

await page.locator('.q-block:has-text("Client name") input[type="text"]').fill(CLIENT_NAME);
await page.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("3");
await page.locator(`.q-block:has-text("${GENERAL_Q_LABEL}") input[type="text"]`).fill(GENERAL_ANSWER);

// Deselect the "Removed" service — both its price and its discovery question must be
// absent from every export below, proving the exports reflect this exact opted-in set.
const removedChip = page.locator(".chip-grid .chip", { hasText: REMOVED_SERVICE_NAME });
await removedChip.click();
await page.waitForTimeout(300);
check("setup: removed service is deselected before saving the record", !(await removedChip.getAttribute("class")).includes("selected"));

await page.locator(`.q-block:has-text("${KEPT_SERVICE_Q_LABEL}") input[type="text"]`).fill(KEPT_SERVICE_ANSWER);
await page.waitForTimeout(1200); // exceeds useDeckSession's 800ms debounce — let meeting.updateState actually land before completing

const saveBtn = page.locator(".icon-btn", { hasText: "Save Meeting Record" });
check("player: Save Meeting Record button is visible for Admin", (await saveBtn.count()) === 1);
await saveBtn.click();
await page.waitForSelector(".modal-card:has-text('Save Meeting Record')", { timeout: 5000 });
await page.locator(".modal-card select").selectOption("Won");
await page.locator(".modal-card textarea").fill(`E2E run ${RUN_TAG} — automated record.`);
const [completeResponse] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("meeting.complete")),
  page.locator(".modal-card button[type=submit]", { hasText: "Save record" }).click(),
]);
check("player: record-saved confirmation shows on the button", (await page.locator(".icon-btn", { hasText: "Record Saved" }).count()) === 1);

const completeBody = await completeResponse.json().catch(() => null);
const completeEntry = Array.isArray(completeBody) ? completeBody[0] : completeBody;
const meetingId = completeEntry?.result?.data?.id;
check("setup: captured the saved meeting's own id from meeting.complete's response", !!meetingId, String(meetingId));
const expectedOrgPart = safeFilenamePart(CLIENT_NAME);

// ========== 2. Confirm it appears on /meeting-records, and filters actually narrow it ==========
console.log("\n=== Meeting Records list + filters ===");
await page.goto(`${BASE}/meeting-records`, { waitUntil: "networkidle" });
await page.waitForSelector(".team-table, .empty-state", { timeout: 15000 });

check("records: list has a visible \"Meeting Date\" column", (await page.locator(".team-table th", { hasText: "Meeting Date" }).count()) === 1);

let row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
check("records: newly-saved record appears in the list", (await row.count()) === 1);
const totalCell = await row.locator("td").nth(4).textContent();
check("records: listed total reflects the saved pricing ($100 for 3 routes)", totalCell?.trim() === "$100", totalCell ?? "");
const outcomeCell = await row.locator("td").nth(3).textContent();
check("records: outcome status is shown", outcomeCell?.trim() === "Won", outcomeCell ?? "");
const meetingDateCell = await row.locator("td").nth(2).textContent();
check("records: Meeting Date column shows the record's save date (completedAt)", !!meetingDateCell?.trim(), meetingDateCell ?? "");

await page.fill('.q-block:has-text("Search") input', "zzz_no_such_client_zzz");
await page.waitForTimeout(400);
check("records: search narrows to zero for a non-matching term", (await page.locator(".empty-state").count()) === 1);

await page.fill('.q-block:has-text("Search") input', CLIENT_NAME);
await page.waitForTimeout(400);
row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
check("records: search by client name finds the record again", (await row.count()) === 1);

const deckSelect = page.locator('.q-block:has-text("Deck") select');
const deckOptionLabels = await deckSelect.locator("option").allTextContents();
check("records: deck filter dropdown lists the fixture deck", deckOptionLabels.some((t) => t.includes(DECK_NAME)), deckOptionLabels.join(" | "));
await deckSelect.selectOption({ label: DECK_NAME });
await page.waitForTimeout(400);
row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
check("records: deck filter keeps the record when its own deck is selected", (await row.count()) === 1);

const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
await page.fill('.q-block:has-text("From") input[type=date]', future);
await page.waitForTimeout(400);
check("records: a from-date in the future excludes today's record", (await page.locator(".empty-state").count()) === 1);
await page.fill('.q-block:has-text("From") input[type=date]', "");
await page.waitForTimeout(400);

// ========== 3. Word export: Discovery Notes answers only, nothing else ==========
console.log("\n=== Download: Word (Discovery Notes answers) ===");
row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
const [wordDownload] = await Promise.all([page.waitForEvent("download"), row.locator("button", { hasText: "Word" }).click()]);
const wordPath = `${OUT}/meeting-record-notes-${RUN_TAG}.docx`;
await wordDownload.saveAs(wordPath);
const wordBytes = readFileSync(wordPath);
check("export: Word file has real docx/zip magic bytes (not an error page)", wordBytes.slice(0, 2).toString("latin1") === "PK");
check("export: Word file has nonzero size", wordBytes.length > 500, String(wordBytes.length));

let wordText = "";
try {
  wordText = extractDocxText(wordBytes);
  check("export: Word file's document.xml actually parses as a real docx", true);
} catch (err) {
  check("export: Word file's document.xml actually parses as a real docx", false, err instanceof Error ? err.message : String(err));
}
check("export: Word doc contains the general discovery answer", wordText.includes(GENERAL_ANSWER));
check("export: Word doc contains the kept service's name and its discovery answer", wordText.includes(KEPT_SERVICE_NAME) && wordText.includes(KEPT_SERVICE_ANSWER));
check(
  "export: Word doc excludes the removed service's name and its discovery question entirely",
  !wordText.includes(REMOVED_SERVICE_NAME) && !wordText.includes(REMOVED_SERVICE_Q_LABEL),
  wordText.slice(0, 400),
);
check("export: Word doc contains no pricing figures (discovery answers only, not pricing)", !/\$[\d,]/.test(wordText), wordText.slice(0, 400));

const wordFilename = wordDownload.suggestedFilename();
check(
  "export: Word filename follows the {Meeting ID}_{Org Name} convention",
  wordFilename === `${meetingId}_${expectedOrgPart}.docx`,
  wordFilename,
);

// ========== 4. PDF export: the opted-in services' deck slides, with frozen pricing ==========
console.log("\n=== Download: PDF (deck slides, frozen pricing) ===");
const [pdfDownload] = await Promise.all([page.waitForEvent("download"), row.locator("button", { hasText: "PDF" }).click()]);
const pdfPath = `${OUT}/meeting-record-quote-${RUN_TAG}.pdf`;
await pdfDownload.saveAs(pdfPath);
const pdfBytes = readFileSync(pdfPath);
check("export: regenerated PDF has real PDF magic bytes", pdfBytes.slice(0, 5).toString("latin1") === "%PDF-");
check("export: regenerated PDF has nonzero size", pdfBytes.length > 200, String(pdfBytes.length));

const pdfText = await extractPdfText(pdfBytes);
check("export: PDF includes the kept service and its frozen price ($100)", pdfText.includes(KEPT_SERVICE_NAME) && pdfText.includes("$100"), pdfText.slice(0, 400));
check("export: PDF excludes the removed (deselected) service entirely", !pdfText.includes(REMOVED_SERVICE_NAME), pdfText.slice(0, 400));
check("export: PDF header shows the actual client name recorded on this meeting", pdfText.includes(CLIENT_NAME));
check("export: PDF header does not show the deck's own companyName", !pdfText.includes(DECK_NAME));
check(
  "export: PDF footer carries Aeon's own real contact info, never the deck's own (empty) staticContent.qa",
  pdfText.includes("info@aeonsynergies.com") && pdfText.includes("aeonsynergies.com"),
);

const pdfFilename = pdfDownload.suggestedFilename();
check(
  "export: PDF filename follows the {Meeting ID}_{Org Name} convention",
  pdfFilename === `${meetingId}_${expectedOrgPart}.pdf`,
  pdfFilename,
);

// ========== 5. THE CORE GUARANTEE: edit the deck's pricing, confirm the record is frozen ==========
console.log("\n=== Frozen pricing survives a later deck edit ===");
const priceChange = await callTrpc("mutation", "deck.update", adminLogin.token, {
  slug: DECK_SLUG,
  config: fixtureConfig(CHANGED_BAND_PRICE),
});
check("setup: deck pricing changed after the record was saved", priceChange.ok, priceChange.message);

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".team-table, .empty-state", { timeout: 15000 });
row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
const totalAfterEdit = await row.locator("td").nth(4).textContent();
check("records: listed total is UNCHANGED after the deck's pricing was edited", totalAfterEdit?.trim() === "$100", totalAfterEdit ?? "");

const [pdfDownload2] = await Promise.all([page.waitForEvent("download"), row.locator("button", { hasText: "PDF" }).click()]);
const pdfPath2 = `${OUT}/meeting-record-quote-${RUN_TAG}-after-edit.pdf`;
await pdfDownload2.saveAs(pdfPath2);
const pdfBytes2 = readFileSync(pdfPath2);
check("export: regenerated PDF after deck edit still has valid magic bytes", pdfBytes2.slice(0, 5).toString("latin1") === "%PDF-");
check("export: regenerated PDF after deck edit has nonzero size", pdfBytes2.length > 200, String(pdfBytes2.length));

const pdfText2 = await extractPdfText(pdfBytes2);
check("export: PDF after deck edit still shows the OLD price ($100), never the current live one", pdfText2.includes("$100"));
check("export: PDF after deck edit does NOT show the new price ($999)", !pdfText2.includes("$999"), pdfText2.slice(0, 400));

// Leave the fixture deck's pricing back at its original value for the next run.
const priceRestore = await callTrpc("mutation", "deck.update", adminLogin.token, {
  slug: DECK_SLUG,
  config: fixtureConfig(ORIGINAL_BAND_PRICE),
});
check("cleanup: fixture deck pricing restored", priceRestore.ok, priceRestore.message);

// ========== 6. Role enforcement: Operations Manager is blocked from this screen ==========
console.log("\n=== Role enforcement ===");
await uiLogin(OM_EMAIL, OM_PASSWORD);
await page.goto(`${BASE}/meeting-records`, { waitUntil: "networkidle" });
const omGate = await page.locator(".empty-state", { hasText: "Meeting Records is only available to Sales Executive, BD Manager, and Admin accounts." }).count();
check("OM: Meeting Records blocked by the meetingRecords role check", omGate === 1);
check("OM: no records table leaks through the gate", (await page.locator(".team-table").count()) === 0);

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
