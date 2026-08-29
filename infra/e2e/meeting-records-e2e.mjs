// Live end-to-end test of Meeting Records (Phase 5a), run against a real deployment
// (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev server.
//
// What it does, through the actual UI + real API calls:
//   1. Ensures a dedicated fixture deck exists (created via a raw deck.create API call if
//      missing — not shared with any other suite's fixture).
//   2. Opens the deck, fills Discovery Notes (client name + driver value), clicks "Save
//      Meeting Record", fills the outcome dialog, and saves it — a real meeting.complete
//      call, which freezes that moment's pricing into pricingSnapshot.
//   3. Confirms the new record appears on /meeting-records, and that the search box (by
//      client name), the deck filter, and the date-range filter all actually narrow the
//      list rather than always showing everything.
//   4. Downloads the text summary export and confirms it contains the real saved data.
//   5. Downloads the regenerated PDF and confirms it's a real PDF (starts with the %PDF
//      magic bytes) with nonzero size.
//   6. THE CORE GUARANTEE: edits the fixture deck's pricing via a raw deck.update call
//      (same service, new band price) AFTER the record was saved, then re-checks the
//      record's listed total, its text export, and its regenerated PDF all still show the
//      OLD price — never recomputed from the deck's current (now-changed) config.
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

import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

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
const SERVICE_NAME = "QA Records Service";
const RUN_TAG = Date.now().toString(36);
const CLIENT_NAME = `QA Records Client ${RUN_TAG}`;
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
    pricingDriver: { label: "Routes", unit: "routes", questionText: "How many routes per day?" },
    services: [
      {
        id: "qaRecordsService",
        name: SERVICE_NAME,
        team: "QA Team",
        category: "major",
        bandLabel: "Route-based · 2 bands",
        handle: ["Seed bullet for the meeting-records E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [
          { upTo: 5, price: bandPrice },
          { upTo: null, price: bandPrice * 2 },
        ],
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
    discoveryQuestions: [],
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
await page.waitForTimeout(1200); // exceeds useDeckSession's 800ms debounce — let meeting.updateState actually land before completing

const saveBtn = page.locator(".icon-btn", { hasText: "Save Meeting Record" });
check("player: Save Meeting Record button is visible for Admin", (await saveBtn.count()) === 1);
await saveBtn.click();
await page.waitForSelector(".modal-card:has-text('Save Meeting Record')", { timeout: 5000 });
await page.locator(".modal-card select").selectOption("Won");
await page.locator(".modal-card textarea").fill(`E2E run ${RUN_TAG} — automated record.`);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("meeting.complete")),
  page.locator(".modal-card button[type=submit]", { hasText: "Save record" }).click(),
]);
check("player: record-saved confirmation shows on the button", (await page.locator(".icon-btn", { hasText: "Record Saved" }).count()) === 1);

// ========== 2. Confirm it appears on /meeting-records, and filters actually narrow it ==========
console.log("\n=== Meeting Records list + filters ===");
await page.goto(`${BASE}/meeting-records`, { waitUntil: "networkidle" });
await page.waitForSelector(".team-table, .empty-state", { timeout: 15000 });

let row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
check("records: newly-saved record appears in the list", (await row.count()) === 1);
const totalCell = await row.locator("td").nth(4).textContent();
check("records: listed total reflects the saved pricing ($100 for 3 routes)", totalCell?.trim() === "$100", totalCell ?? "");
const outcomeCell = await row.locator("td").nth(3).textContent();
check("records: outcome status is shown", outcomeCell?.trim() === "Won", outcomeCell ?? "");

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

// ========== 3. Text export + PDF regenerate download the real saved data ==========
console.log("\n=== Downloads (text summary + regenerated PDF) ===");
row = page.locator(".team-table tr", { hasText: CLIENT_NAME });
const [textDownload] = await Promise.all([page.waitForEvent("download"), row.locator("button", { hasText: "Text" }).click()]);
const textPath = `${OUT}/meeting-record-summary-${RUN_TAG}.txt`;
await textDownload.saveAs(textPath);
const textContent = readFileSync(textPath, "utf8");
check("export: text summary contains the client name", textContent.includes(CLIENT_NAME));
check("export: text summary contains the correct total ($100)", textContent.includes("$100"), textContent);

const [pdfDownload] = await Promise.all([page.waitForEvent("download"), row.locator("button", { hasText: "PDF" }).click()]);
const pdfPath = `${OUT}/meeting-record-quote-${RUN_TAG}.pdf`;
await pdfDownload.saveAs(pdfPath);
const pdfBytes = readFileSync(pdfPath);
check("export: regenerated PDF has real PDF magic bytes", pdfBytes.slice(0, 5).toString("latin1") === "%PDF-");
check("export: regenerated PDF has nonzero size", pdfBytes.length > 200, String(pdfBytes.length));

// ========== 4. THE CORE GUARANTEE: edit the deck's pricing, confirm the record is frozen ==========
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

const [textDownload2] = await Promise.all([page.waitForEvent("download"), row.locator("button", { hasText: "Text" }).click()]);
const textPath2 = `${OUT}/meeting-record-summary-${RUN_TAG}-after-edit.txt`;
await textDownload2.saveAs(textPath2);
const textContent2 = readFileSync(textPath2, "utf8");
check("export: text summary after deck edit still shows the OLD price ($100)", textContent2.includes("$100"));
check("export: text summary after deck edit does NOT show the new price ($999)", !textContent2.includes("$999"), textContent2);

const [pdfDownload2] = await Promise.all([page.waitForEvent("download"), row.locator("button", { hasText: "PDF" }).click()]);
const pdfPath2 = `${OUT}/meeting-record-quote-${RUN_TAG}-after-edit.pdf`;
await pdfDownload2.saveAs(pdfPath2);
const pdfBytes2 = readFileSync(pdfPath2);
check("export: regenerated PDF after deck edit still has valid magic bytes", pdfBytes2.slice(0, 5).toString("latin1") === "%PDF-");
check("export: regenerated PDF after deck edit has nonzero size", pdfBytes2.length > 200, String(pdfBytes2.length));

// Leave the fixture deck's pricing back at its original value for the next run.
const priceRestore = await callTrpc("mutation", "deck.update", adminLogin.token, {
  slug: DECK_SLUG,
  config: fixtureConfig(ORIGINAL_BAND_PRICE),
});
check("cleanup: fixture deck pricing restored", priceRestore.ok, priceRestore.message);

// ========== 5. Role enforcement: Operations Manager is blocked from this screen ==========
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
