// Live end-to-end test of the Archive system (soft-delete for decks + meeting records, the
// Home 3-dot menu, Meeting Records' Delete, and the Admin-only Archived Files screen), run
// against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a
// local dev server.
//
// What it does, through the actual UI + real API calls:
//   1. Creates a fresh, uniquely-named throwaway deck via a raw deck.create call — this
//      suite genuinely destroys its own fixture by the end (permanent delete), so unlike
//      every other suite's fixture it is never reused across runs.
//   2. Home: opens that deck's 3-dot menu, clicks Remove, confirms it disappears from the
//      deck grid and 404s via deck.getBySlug — then confirms it appears in Archived Files
//      (Admin, Archived Decks tab), clicks Restore, and confirms it's back on Home.
//   3. Discovery Notes → Save Meeting Record on the (now-restored) fixture deck, then on
//      /meeting-records clicks Delete, confirms the record disappears from that list and
//      appears in Archived Files' Archived Meeting Records tab, clicks Restore, and
//      confirms it's back on /meeting-records.
//   4. Deletes both the meeting record and the deck again, this time clicking
//      Delete Permanently in Archived Files (auto-accepting the browser confirm()) —
//      confirms each is gone from Archived Files for good (not just archived), the real
//      hard-delete path.
//   5. Confirms a non-Admin (the QA Sales Executive account created by
//      role-enforcement-e2e.mjs, which this suite depends on running first) is genuinely
//      rejected with FORBIDDEN at the API level for every archive-management procedure —
//      archive.listDecks/listMeetings, deck.restore/deletePermanent,
//      meeting.restore/deletePermanent — not just kept off the /archived screen.
//
// Env: BASE_URL + API_URL (required), ADMIN_EMAIL/ADMIN_PASSWORD (default: the seeded demo
// user), SE_EMAIL/SE_PASSWORD (default: the QA Sales Executive created by
// role-enforcement-e2e.mjs), CHROMIUM_PATH (optional executable override; CI uses
// Playwright's own install), OUT_DIR (screenshots, default ./e2e-artifacts).

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
if (!BASE || !API) {
  console.error("BASE_URL and API_URL are required");
  process.exit(2);
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "demo@aeonsynergies.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AeonDemo123!";
const SE_EMAIL = process.env.SE_EMAIL || "qa-sales-executive@aeonqa.internal";
const SE_PASSWORD = process.env.SE_PASSWORD || "AeonQaTest123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const RUN_TAG = Date.now().toString(36);
const DECK_NAME = `QA Archive Test Deck ${RUN_TAG}`;
const CLIENT_NAME = `QA Archive Client ${RUN_TAG}`;

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
  return { ok: !entry?.error, trpcCode: entry?.error?.data?.code, data: entry?.result?.data, message: entry?.error?.message };
}

async function apiLogin(email, password) {
  const res = await callTrpc("mutation", "auth.login", null, { email, password });
  return { token: res.data?.accessToken, user: res.data?.user, ok: res.ok };
}

function fixtureConfig() {
  return {
    industry: "QA",
    companyName: DECK_NAME,
    tagline: "Throwaway fixture for the live archive E2E suite — destroyed by the end of this run.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Routes", unit: "routes", questionText: "How many routes per day?", isPrimary: true }],
    services: [
      {
        id: "qaArchiveService",
        name: "QA Archive Service",
        team: "QA Team",
        category: "major",
        pricingModelId: "primary",
        bandLabel: "Route-based · 1 band",
        handle: ["Seed bullet for the archive E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [{ upTo: null, price: 100 }],
      },
    ],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Archive Fixture", sub: "" },
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
page.on("dialog", (d) => d.accept()); // Delete Permanently's window.confirm()

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

async function homeDeckNames() {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".deck-grid");
  await page.waitForTimeout(300);
  return page.$$eval(".deck-card .dc-name", (els) => els.map((el) => el.textContent));
}

async function archivedDeckNames() {
  await page.goto(`${BASE}/archived`, { waitUntil: "networkidle" });
  await page.locator(".builder-step-chip", { hasText: "Archived Decks" }).click();
  await page.waitForTimeout(400);
  return page.$$eval("table.team-table tbody tr td:first-child", (els) => els.map((el) => el.textContent));
}

async function archivedMeetingClients() {
  await page.goto(`${BASE}/archived`, { waitUntil: "networkidle" });
  await page.locator(".builder-step-chip", { hasText: "Archived Meeting Records" }).click();
  await page.waitForTimeout(400);
  return page.$$eval("table.team-table tbody tr td:first-child", (els) => els.map((el) => el.textContent));
}

// ========== Setup: a fresh, uniquely-named fixture deck this suite will destroy ==========
console.log("\n=== Setup ===");
const adminLogin = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
check("setup: admin API login succeeds", adminLogin.ok);

const created = await callTrpc("mutation", "deck.create", adminLogin.token, { config: fixtureConfig() });
check("setup: fixture deck created", created.ok, created.message);
const deckSlug = created.data?.slug;

// ========== 1. Home: Remove (soft-delete) a deck, find it in Archived Files, Restore ==========
console.log("\n=== Deck: Remove -> Archived Files -> Restore ===");
await uiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
let names = await homeDeckNames();
check("home: fixture deck is listed before removal", names.includes(DECK_NAME), names.join(", "));

await page.locator(".deck-card", { hasText: DECK_NAME }).locator(".deck-card-menu-btn").click();
await page.locator(".deck-card-menu-item", { hasText: "Remove" }).click();
await page.waitForTimeout(500);
names = await homeDeckNames();
check("home: fixture deck disappears from Home after Remove", !names.includes(DECK_NAME), names.join(", "));

const afterRemove = await callTrpc("query", "deck.getBySlug", adminLogin.token, { slug: deckSlug });
check("api: deck.getBySlug 404s for a removed deck", !afterRemove.ok && afterRemove.trpcCode === "NOT_FOUND", afterRemove.message);

let archivedDecks = await archivedDeckNames();
check("archived files: removed deck appears in Archived Decks", archivedDecks.includes(DECK_NAME), archivedDecks.join(", "));

await page.locator("table.team-table tbody tr", { hasText: DECK_NAME }).locator(".mini-btn", { hasText: "Restore" }).click();
await page.waitForTimeout(500);
archivedDecks = await archivedDeckNames();
check("archived files: restored deck leaves Archived Decks", !archivedDecks.includes(DECK_NAME), archivedDecks.join(", "));

names = await homeDeckNames();
check("home: restored deck is back on Home", names.includes(DECK_NAME), names.join(", "));

// ========== 2. Meeting Records: Delete (soft-delete) a record, find it, Restore ==========
console.log("\n=== Meeting record: Delete -> Archived Files -> Restore ===");
await page.goto(`${BASE}/decks/${deckSlug}`, { waitUntil: "networkidle" });
await page.waitForSelector(".notes-btn");
const [notesPage] = await Promise.all([page.context().waitForEvent("page"), page.locator(".notes-btn").click()]);
await notesPage.waitForSelector(".chip-grid");
await notesPage.waitForTimeout(300);
await notesPage.locator('.q-block:has-text("Client name") input[type="text"]').fill(CLIENT_NAME);
await notesPage.locator('.q-block:has-text("REQUIRED · DRIVES PRICING") input[type="number"]').first().fill("3");
await notesPage.waitForTimeout(1200); // exceeds useNotesWindowSession's 800ms save debounce
await notesPage.close();

const saveBtn = page.locator(".icon-btn", { hasText: "Save Meeting Record" });
await saveBtn.click();
await page.waitForSelector(".modal-card:has-text('Save Meeting Record')", { timeout: 5000 });
await page.locator(".modal-card select").selectOption("Won");
await Promise.all([
  page.waitForResponse((r) => r.url().includes("meeting.complete")),
  page.locator(".modal-card button[type=submit]", { hasText: "Save record" }).click(),
]);
check("player: record-saved confirmation shows on the button", (await page.locator(".icon-btn", { hasText: "Record Saved" }).count()) === 1);

await page.goto(`${BASE}/meeting-records`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
let recordRows = await page.$$eval("table.team-table tbody tr td:first-child", (els) => els.map((el) => el.textContent));
check("records: saved record appears before deletion", recordRows.includes(CLIENT_NAME), recordRows.join(", "));

await page.locator("table.team-table tbody tr", { hasText: CLIENT_NAME }).locator(".mini-btn", { hasText: "Delete" }).click();
await page.waitForTimeout(500);
recordRows = await page.$$eval("table.team-table tbody tr td:first-child", (els) => els.map((el) => el.textContent));
check("records: deleted record disappears from Meeting Records", !recordRows.includes(CLIENT_NAME), recordRows.join(", "));

let archivedMeetings = await archivedMeetingClients();
check("archived files: deleted record appears in Archived Meeting Records", archivedMeetings.includes(CLIENT_NAME), archivedMeetings.join(", "));

await page.locator("table.team-table tbody tr", { hasText: CLIENT_NAME }).locator(".mini-btn", { hasText: "Restore" }).click();
await page.waitForTimeout(500);
archivedMeetings = await archivedMeetingClients();
check("archived files: restored record leaves Archived Meeting Records", !archivedMeetings.includes(CLIENT_NAME), archivedMeetings.join(", "));

await page.goto(`${BASE}/meeting-records`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
recordRows = await page.$$eval("table.team-table tbody tr td:first-child", (els) => els.map((el) => el.textContent));
check("records: restored record is back on Meeting Records", recordRows.includes(CLIENT_NAME), recordRows.join(", "));

// ========== 3. Permanent delete: the real hard-delete path ==========
console.log("\n=== Permanent delete ===");
await page.locator("table.team-table tbody tr", { hasText: CLIENT_NAME }).locator(".mini-btn", { hasText: "Delete" }).click();
await page.waitForTimeout(500);
await archivedMeetingClients(); // navigates to /archived, Archived Meeting Records tab
await page.locator("table.team-table tbody tr", { hasText: CLIENT_NAME }).locator(".mini-btn-danger", { hasText: "Delete Permanently" }).click();
await page.waitForTimeout(500);
archivedMeetings = await archivedMeetingClients();
check("archived files: permanently-deleted record is gone for good", !archivedMeetings.includes(CLIENT_NAME), archivedMeetings.join(", "));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.locator(".deck-card", { hasText: DECK_NAME }).locator(".deck-card-menu-btn").click();
await page.locator(".deck-card-menu-item", { hasText: "Remove" }).click();
await page.waitForTimeout(500);
await archivedDeckNames(); // navigates to /archived, Archived Decks tab
await page.locator("table.team-table tbody tr", { hasText: DECK_NAME }).locator(".mini-btn-danger", { hasText: "Delete Permanently" }).click();
await page.waitForTimeout(500);
archivedDecks = await archivedDeckNames();
check("archived files: permanently-deleted deck is gone for good", !archivedDecks.includes(DECK_NAME), archivedDecks.join(", "));

// ========== 4. Non-Admin is genuinely blocked at the API level ==========
console.log("\n=== Non-Admin blocked at the API ===");
const seLogin = await apiLogin(SE_EMAIL, SE_PASSWORD);
check("setup: SE API login succeeds", seLogin.ok);

const seListDecks = await callTrpc("query", "archive.listDecks", seLogin.token, {});
check("SE: archive.listDecks REJECTED at API", !seListDecks.ok && seListDecks.trpcCode === "FORBIDDEN", seListDecks.message);
const seListMeetings = await callTrpc("query", "archive.listMeetings", seLogin.token, {});
check("SE: archive.listMeetings REJECTED at API", !seListMeetings.ok && seListMeetings.trpcCode === "FORBIDDEN", seListMeetings.message);
const seDeckRestore = await callTrpc("mutation", "deck.restore", seLogin.token, { id: "nonexistent" });
check("SE: deck.restore REJECTED at API", !seDeckRestore.ok && seDeckRestore.trpcCode === "FORBIDDEN", seDeckRestore.message);
const seDeckDelete = await callTrpc("mutation", "deck.deletePermanent", seLogin.token, { id: "nonexistent" });
check("SE: deck.deletePermanent REJECTED at API", !seDeckDelete.ok && seDeckDelete.trpcCode === "FORBIDDEN", seDeckDelete.message);
const seMeetingRestore = await callTrpc("mutation", "meeting.restore", seLogin.token, { id: "nonexistent" });
check("SE: meeting.restore REJECTED at API", !seMeetingRestore.ok && seMeetingRestore.trpcCode === "FORBIDDEN", seMeetingRestore.message);
const seMeetingDelete = await callTrpc("mutation", "meeting.deletePermanent", seLogin.token, { id: "nonexistent" });
check("SE: meeting.deletePermanent REJECTED at API", !seMeetingDelete.ok && seMeetingDelete.trpcCode === "FORBIDDEN", seMeetingDelete.message);

await page.screenshot({ path: `${OUT}/archive-final.png`, fullPage: true });

console.log("\nSUMMARY:");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED` : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
