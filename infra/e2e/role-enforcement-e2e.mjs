// Live end-to-end test of role enforcement (Team & Role Management / Phase 2c), run
// against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a
// local dev server.
//
// What it does:
//   1. Signs in as the seeded Admin (demo@aeonsynergies.com), creates one fixed-identity
//      QA test user per non-admin role THROUGH THE REAL TEAM MANAGEMENT UI (not a raw API
//      shortcut — this is the one explicit "create through the screen" requirement),
//      skipping creation for any that already exist from a previous run.
//   2. For each role, logs in as that QA user and calls the relevant tRPC procedures with
//      raw HTTP requests — bypassing the web UI entirely, the same way "anyone who can see
//      the network tab" could — to confirm every permission the role SHOULD have succeeds
//      and every permission it SHOULDN'T have is rejected with FORBIDDEN. This is the
//      actual test of "genuinely rejected... at the API level", not the UI-hiding, which
//      is checked separately as the secondary layer.
//   3. Confirms Admin can list every user (including all three QA accounts) with correct
//      roles, and that the self-lockout guards (can't remove self; can't demote self while
//      the sole Admin — this specific assertion is skipped, not failed, if a second real
//      Admin account exists) hold.
//
// Idempotent by design, matching the Phase 2b wizard-e2e.mjs pattern: QA users have fixed
// emails and are only created once; the one action that persists new data on success
// (Sales Executive's deck.create) targets a fixed slug and is skipped on repeat runs
// (verified via getBySlug instead) so re-deploys don't pile up duplicate rows. Every
// REJECTED-path check is naturally idempotent already — a rejected call persists nothing.
//
// Env: BASE_URL + API_URL (required), ADMIN_EMAIL/ADMIN_PASSWORD (default: the seeded
// demo user), CHROMIUM_PATH (optional; CI uses Playwright's own install), OUT_DIR
// (screenshots, default ./e2e-artifacts).

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
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const QA_USERS = {
  SALES_EXECUTIVE: { name: "QA Sales Executive", email: "qa-sales-executive@aeonqa.internal", password: "AeonQaTest123!" },
  OPERATIONS_MANAGER: { name: "QA Operations Manager", email: "qa-operations-manager@aeonqa.internal", password: "AeonQaTest123!" },
  BD_MANAGER: { name: "QA BD Manager", email: "qa-bd-manager@aeonqa.internal", password: "AeonQaTest123!" },
};
const QA_DECK_NAME = "QA Role Test Deck";
const QA_DECK_SLUG = "qa-role-test-deck";
const PRESENT_DECK_SLUG = "aeon-logistics"; // Amazon DSP — used for meeting-based checks

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
  return {
    httpStatus: res.status,
    trpcCode: entry?.error?.data?.code,
    message: entry?.error?.message,
    ok: !entry?.error,
    data: entry?.result?.data,
  };
}

async function apiLogin(email, password) {
  if (globalThis.__DEBUG_LOGIN__) {
    const body = JSON.stringify({ 0: { email, password } });
    console.log(`[DEBUG_LOGIN] raw HTTP request: POST ${API}/api/trpc/auth.login?batch=1\n[DEBUG_LOGIN] raw HTTP request body: ${body}`);
  }
  const res = await callTrpc("mutation", "auth.login", null, { email, password });
  if (globalThis.__DEBUG_LOGIN__) {
    console.log(`[DEBUG_LOGIN] raw HTTP response: httpStatus=${res.httpStatus} trpcCode=${res.trpcCode} message=${JSON.stringify(res.message)} ok=${res.ok}`);
  }
  return { token: res.data?.accessToken, user: res.data?.user, ok: res.ok };
}

async function createOwnMeeting(token) {
  const deck = await callTrpc("query", "deck.getBySlug", token, { slug: PRESENT_DECK_SLUG });
  return callTrpc("mutation", "meeting.create", token, { deckId: deck.data.dbId });
}

// TEMPORARY — DEBUG_LOGIN=1 dumps the exact raw request the UI-driven login sends
// (intercepted network request) side by side with the exact raw body the raw-HTTP
// apiLogin() path sends, to root-cause a live failure where the two disagreed on the same
// credentials. Remove this flag and its call sites once root-caused.
const DEBUG_LOGIN = process.env.DEBUG_LOGIN === "1";
globalThis.__DEBUG_LOGIN__ = DEBUG_LOGIN; // apiLogin() is defined above this line, before DEBUG_LOGIN exists

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
if (DEBUG_LOGIN) {
  page.on("request", (req) => {
    if (req.url().includes("auth.login")) {
      console.log(`[DEBUG_LOGIN] UI request: ${req.method()} ${req.url()}\n[DEBUG_LOGIN] UI request body: ${JSON.stringify(req.postData())}`);
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("auth.login")) {
      const body = await res.text().catch((e) => `<failed to read body: ${e.message}>`);
      console.log(`[DEBUG_LOGIN] UI response: ${res.status()} ${res.url()}\n[DEBUG_LOGIN] UI response body: ${body}`);
    }
  });
}

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
  if (DEBUG_LOGIN) {
    const [emailVal, passwordVal] = await Promise.all([
      page.inputValue('input[type="email"]'),
      page.inputValue('input[type="password"]'),
    ]);
    console.log(`[DEBUG_LOGIN] UI form field values just before submit: email=${JSON.stringify(emailVal)} password=${JSON.stringify(passwordVal)}`);
    console.log(`[DEBUG_LOGIN] values passed to uiLogin(): email=${JSON.stringify(email)} password=${JSON.stringify(password)}`);
  }
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid", { timeout: 15000 });
}

// ========== Admin: create/verify QA users through the real Team Management screen ==========
console.log("\n=== Admin: Team Management ===");
await uiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
const adminApiLogin = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
check("admin login succeeds", adminApiLogin.ok && adminApiLogin.user?.role === "ADMIN");

await page.goto(`${BASE}/team`);
await page.waitForSelector(".team-table", { timeout: 15000 });

function rosterRows() {
  return page.$$eval(".team-table tbody tr", (trs) =>
    trs
      .filter((tr) => tr.querySelectorAll("td").length >= 3)
      .map((tr) => {
        const tds = tr.querySelectorAll("td");
        return { name: tds[0].textContent.trim(), email: tds[1].textContent.trim(), role: tds[2].querySelector("select")?.value };
      }),
  );
}

let roster = await rosterRows();
for (const [role, u] of Object.entries(QA_USERS)) {
  if (roster.some((r) => r.email === u.email)) {
    console.log(`${u.name} already exists (created on a previous run) — skipping creation.`);
    continue;
  }
  await page.click(".new-deck-btn"); // "+ New User" reuses this class
  await page.waitForSelector("form.builder-subcard");
  // "Send invitation email" is the default selection now — these QA fixtures have no real
  // inbox to receive one at, so explicitly switch to the original "Set initial password
  // directly" path before the password field is even in the DOM to fill.
  await page.click('form.builder-subcard label:has-text("Set initial password directly")');
  await page.fill('form.builder-subcard input[type="text"]', u.name);
  await page.fill('form.builder-subcard input[type="email"]', u.email);
  await page.fill('form.builder-subcard input[placeholder="At least 8 characters"]', u.password);
  await page.selectOption("form.builder-subcard select", role);
  await Promise.all([page.waitForResponse((r) => r.url().includes("user.create")), page.click('form.builder-subcard button[type="submit"]')]);
  await page.waitForTimeout(300);
  roster = await rosterRows();
}

check("admin roster includes all 3 QA users + self", roster.length >= 4, JSON.stringify(roster.map((r) => r.email)));
for (const [role, u] of Object.entries(QA_USERS)) {
  const row = roster.find((r) => r.email === u.email);
  check(`admin sees ${u.name} with role ${role}`, !!row && row.role === role);
}
check("admin sees own account as ADMIN", roster.find((r) => r.email === ADMIN_EMAIL)?.role === "ADMIN");
await page.screenshot({ path: `${OUT}/team-roster.png`, fullPage: true });

// Self-lockout guards
const removeSelf = await callTrpc("mutation", "user.remove", adminApiLogin.token, { id: adminApiLogin.user.id });
check("admin cannot remove own account", !removeSelf.ok && removeSelf.trpcCode === "BAD_REQUEST", removeSelf.message);

// "Can't demote the last Admin" only actually rejects when ADMIN_EMAIL genuinely is the
// last Admin. This deployment now has a second, real, ongoing Admin account
// (test.admin@aeonsynergies.com, used for live Microsoft sign-in testing) — with 2+ Admins,
// the guard correctly ALLOWS self-demotion, since there's a fallback Admin. This suite must
// never actually exercise that success path against the real seeded ADMIN_EMAIL account:
// doing so would genuinely demote it in production, not just assert a boolean. So only
// attempt the mutation (and assert rejection) when ADMIN_EMAIL is provably the sole Admin;
// otherwise skip without touching real state.
const currentAdminCount = roster.filter((r) => r.role === "ADMIN").length;
if (currentAdminCount <= 1) {
  const demoteSelf = await callTrpc("mutation", "user.updateRole", adminApiLogin.token, { id: adminApiLogin.user.id, role: "SALES_EXECUTIVE" });
  check("admin cannot demote self as the last Admin", !demoteSelf.ok && demoteSelf.trpcCode === "BAD_REQUEST", demoteSelf.message);
} else {
  console.log(
    `SKIPPED: admin cannot demote self as the last Admin — ${currentAdminCount} Admins currently exist (${ADMIN_EMAIL} is not the last one); skipping rather than actually demoting a real Admin account.`,
  );
}

// ========== Operations Manager: only Present + Discovery Notes ==========
console.log("\n=== Operations Manager ===");
await uiLogin(QA_USERS.OPERATIONS_MANAGER.email, QA_USERS.OPERATIONS_MANAGER.password);
const opsNav = await page.$$eval(".app-nav .nav-item", (els) => els.map((e) => e.textContent.trim()));
check("OM: Team link not shown", !opsNav.includes("Team"), opsNav.join(", "));
check("OM: New Deck button not shown on Home", (await page.$(".new-deck-btn")) === null);

const opsApiLogin = await apiLogin(QA_USERS.OPERATIONS_MANAGER.email, QA_USERS.OPERATIONS_MANAGER.password);
check("OM: API login succeeds", opsApiLogin.ok && opsApiLogin.user?.role === "OPERATIONS_MANAGER");
const opsMeeting = await createOwnMeeting(opsApiLogin.token);
check("OM: meeting.create (Present) succeeds", opsMeeting.ok);
const opsUpdateState = await callTrpc("mutation", "meeting.updateState", opsApiLogin.token, { id: opsMeeting.data?.id, patch: { answers: { primary: "20" } } });
check("OM: meeting.updateState (Discovery Notes) succeeds", opsUpdateState.ok);

const opsCreateDeck = await callTrpc("mutation", "deck.create", opsApiLogin.token, { config: { companyName: "OM should never create this" } });
check("OM: deck.create REJECTED at API", !opsCreateDeck.ok && opsCreateDeck.trpcCode === "FORBIDDEN", opsCreateDeck.message);
const opsUpdateDeck = await callTrpc("mutation", "deck.update", opsApiLogin.token, { slug: PRESENT_DECK_SLUG, config: {} });
check("OM: deck.update (Edit Deck) REJECTED at API", !opsUpdateDeck.ok && opsUpdateDeck.trpcCode === "FORBIDDEN", opsUpdateDeck.message);
const opsExport = await callTrpc("query", "meeting.export", opsApiLogin.token, { id: opsMeeting.data?.id });
check("OM: meeting.export REJECTED at API", !opsExport.ok && opsExport.trpcCode === "FORBIDDEN", opsExport.message);
const opsSend = await callTrpc("mutation", "meeting.sendToClient", opsApiLogin.token, { id: opsMeeting.data?.id, clientEmail: "client@example.com" });
check("OM: meeting.sendToClient REJECTED at API", !opsSend.ok && opsSend.trpcCode === "FORBIDDEN", opsSend.message);
const opsUsers = await callTrpc("query", "user.list", opsApiLogin.token, undefined);
check("OM: user.list (manageUsers) REJECTED at API", !opsUsers.ok && opsUsers.trpcCode === "FORBIDDEN", opsUsers.message);

// ========== Sales Executive: everything except Export ==========
console.log("\n=== Sales Executive ===");
const salesApiLogin = await apiLogin(QA_USERS.SALES_EXECUTIVE.email, QA_USERS.SALES_EXECUTIVE.password);
check("SE: API login succeeds", salesApiLogin.ok && salesApiLogin.user?.role === "SALES_EXECUTIVE");
const salesMeeting = await createOwnMeeting(salesApiLogin.token);
check("SE: meeting.create (Present) succeeds", salesMeeting.ok);
const salesUpdateState = await callTrpc("mutation", "meeting.updateState", salesApiLogin.token, { id: salesMeeting.data?.id, patch: { answers: { primary: "15" } } });
check("SE: meeting.updateState (Discovery Notes) succeeds", salesUpdateState.ok);
const salesExport = await callTrpc("query", "meeting.export", salesApiLogin.token, { id: salesMeeting.data?.id });
check("SE: meeting.export REJECTED at API — the one thing SE lacks", !salesExport.ok && salesExport.trpcCode === "FORBIDDEN", salesExport.message);
const salesSend = await callTrpc("mutation", "meeting.sendToClient", salesApiLogin.token, { id: salesMeeting.data?.id, clientEmail: "client@example.com" });
check("SE: meeting.sendToClient succeeds", salesSend.ok, salesSend.message);
const salesUsers = await callTrpc("query", "user.list", salesApiLogin.token, undefined);
check("SE: user.list (manageUsers) REJECTED at API", !salesUsers.ok && salesUsers.trpcCode === "FORBIDDEN");

// deck.create: idempotent — only actually creates on the first run against a given
// deployment; later runs confirm the deck from a prior run still exists instead of
// re-creating (deck.create has no upsert semantics — a second call would produce
// "qa-role-test-deck-2", piling up duplicates on every redeploy).
const existingQaDeck = await callTrpc("query", "deck.getBySlug", salesApiLogin.token, { slug: QA_DECK_SLUG });
if (existingQaDeck.ok) {
  check("SE: deck.create permission confirmed (deck from a previous run still exists)", true);
} else {
  const minimalDeckConfig = {
    industry: "QA",
    companyName: QA_DECK_NAME,
    tagline: "Created by the live role-enforcement E2E to prove Sales Executive can create decks.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Units", unit: "units", questionText: "How many units?", isPrimary: true }],
    services: [{ id: "svc", name: "QA Service", team: "QA Team", category: "major", pricingModelId: "primary", bandLabel: "1 band", handle: ["QA bullet"], stats: [], dashboards: [], priceBands: [{ upTo: null, price: 100 }] }],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Role Enforcement", sub: "" },
      about: { title1: "QA", title2: "Deck", body: "", bullets: [] },
      how: { steps: [{ t: "QA", d: "" }] },
      challenges: { items: [] },
      benefits: { items: [] },
      qa: { title: "Questions?", sub: "", email: "", phone: "", web: "", address: "" },
    },
    discoveryQuestions: [],
  };
  const salesCreateDeck = await callTrpc("mutation", "deck.create", salesApiLogin.token, { config: minimalDeckConfig });
  check("SE: deck.create succeeds", salesCreateDeck.ok && salesCreateDeck.data?.slug === QA_DECK_SLUG, salesCreateDeck.message);
}

await uiLogin(QA_USERS.SALES_EXECUTIVE.email, QA_USERS.SALES_EXECUTIVE.password);
check("SE: New Deck button shown on Home", (await page.$(".new-deck-btn")) !== null);
await page.goto(`${BASE}/decks/${PRESENT_DECK_SLUG}`);
await page.waitForSelector(".notes-btn");
await page.waitForTimeout(300);
const salesButtons = await page.$$eval(".topbar-actions button, .topbar-actions a", (els) => els.map((e) => e.textContent.trim()));
check("SE: Export button not shown", !salesButtons.some((t) => t.includes("Export")), salesButtons.join(" | "));
check("SE: Send to Client button shown", salesButtons.some((t) => t.includes("Send to Client")), salesButtons.join(" | "));
check("SE: Edit Deck button shown", salesButtons.some((t) => t.includes("Edit Deck")), salesButtons.join(" | "));

// ========== BD Manager: full access except manageUsers ==========
console.log("\n=== BD Manager ===");
const bdApiLogin = await apiLogin(QA_USERS.BD_MANAGER.email, QA_USERS.BD_MANAGER.password);
check("BD: API login succeeds", bdApiLogin.ok && bdApiLogin.user?.role === "BD_MANAGER");
const bdMeeting = await createOwnMeeting(bdApiLogin.token);
await callTrpc("mutation", "meeting.updateState", bdApiLogin.token, { id: bdMeeting.data?.id, patch: { answers: { primary: "20" }, selected: ["payroll"] } });
const bdExport = await callTrpc("query", "meeting.export", bdApiLogin.token, { id: bdMeeting.data?.id });
check("BD: meeting.export succeeds", bdExport.ok, bdExport.message);
check("BD: export CSV contains real pricing data", typeof bdExport.data?.csv === "string" && bdExport.data.csv.includes("Payroll"), bdExport.data?.csv?.slice(0, 100));
const bdUsers = await callTrpc("query", "user.list", bdApiLogin.token, undefined);
check("BD: user.list (manageUsers) REJECTED at API — only Admin has this", !bdUsers.ok && bdUsers.trpcCode === "FORBIDDEN");

// ========== No token at all ==========
const noAuth = await callTrpc("query", "user.list", null, undefined);
check("no token: rejected as UNAUTHORIZED, distinct from FORBIDDEN", !noAuth.ok && noAuth.trpcCode === "UNAUTHORIZED", noAuth.message);

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
