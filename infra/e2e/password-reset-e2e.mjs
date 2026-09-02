// Live end-to-end test of Forgot Password + New User Invitation, run against a real
// deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a local dev server.
//
// Both flows share one single-use, expiring token primitive (packages/database
// PasswordSetToken + auth.setPasswordWithToken) — a password reset link and a new-account
// invitation only differ in which email copy gets sent and how the token was triggered.
// This suite exercises both through the REAL UI (the /forgot-password request screen, the
// shared /reset-password "set your password" screen, and Team Management's invitation
// toggle), with one necessary exception: since the raw token is only ever emailed — never
// returned by the public API, by design, so a leaked response can't be used to take over an
// account — this suite has no real inbox to read production email from. It uses
// auth.e2eRequestToken instead: a test-support-only tRPC procedure gated on a server-only
// shared secret (E2E_TEST_SECRET, generated once by infra/aws/deploy.sh) AND restricted to
// @aeonqa.internal addresses, so even a leaked secret could never touch a real account. That
// endpoint calls the exact same helper the real reset/invite flows use — a REAL token, REALLY
// emailed via SES (confirmed via the real MessageId SES hands back) — just returned directly
// instead of requiring a real inbox to retrieve it.
//
// What it does, through the actual UI wherever the flow itself is UI-facing:
//   1. Forgot Password: requests a reset for a real (dedicated, suite-owned) QA account via
//      the real /forgot-password screen, confirms the generic message, obtains a real token
//      via auth.e2eRequestToken (confirming SES really sent an email — a real MessageId comes
//      back), completes the real /reset-password screen, and confirms the new password
//      actually logs in.
//   2. Confirms an expired token (a deliberately short-lived one, requested via
//      auth.e2eRequestToken's test-only ttlSeconds override) is rejected.
//   3. Confirms a token is single-use: redeeming the same token twice rejects the second try.
//   4. Confirms requesting a reset for a non-existent email returns the exact same generic
//      message as a real account — no information leak either way.
//   5. New User Invitation: creates a user via Team Management's "Send invitation email"
//      path (the new default), confirms a real invite email is sent (real SES MessageId),
//      completes the same /reset-password screen, and confirms the invited user can log in.
//   6. Confirms the original "Set initial password directly" path (now a secondary choice on
//      the same form) still creates an immediately-usable account with no token involved at
//      all — the path every other suite's fixture-user setup depends on.
//
// Idempotent by design: every fixture account has a fixed, suite-owned email and is created
// only if missing; the reset/invite round trips always request a fresh token and don't care
// what a previous run last set the password to, since each run sets and then immediately
// verifies its own new one.
//
// Env: BASE_URL + API_URL + E2E_TEST_SECRET (all required), ADMIN_EMAIL/ADMIN_PASSWORD
// (default: the seeded demo user), CHROMIUM_PATH (optional executable override; CI uses
// Playwright's own install), OUT_DIR (screenshots, default ./e2e-artifacts).

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
const E2E_TEST_SECRET = process.env.E2E_TEST_SECRET;
if (!BASE || !API || !E2E_TEST_SECRET) {
  console.error("BASE_URL, API_URL, and E2E_TEST_SECRET are all required");
  process.exit(2);
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "demo@aeonsynergies.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const RESET_EMAIL = "qa-password-reset-test@aeonqa.internal";
const RESET_NAME = "QA Password Reset Test";
const INVITE_EMAIL = "qa-invited-user@aeonqa.internal";
const INVITE_NAME = "QA Invited User";
const DIRECT_EMAIL = "qa-direct-password-test@aeonqa.internal";
const DIRECT_NAME = "QA Direct Password Test";
const DIRECT_PASSWORD = "AeonQaDirect123!";

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

// Real token + real SES send for a reserved @aeonqa.internal account, via the test-support
// endpoint — see file header for why this exists instead of a real inbox integration.
async function e2eRequestToken(email, purpose, ttlSeconds) {
  return callTrpc("mutation", "auth.e2eRequestToken", null, { email, secret: E2E_TEST_SECRET, purpose, ttlSeconds });
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

// Diagnostics: every tRPC call's real status code and wall-clock time, and any request
// that fails at the network level (DNS, TLS, connection reset, CORS) rather than getting
// an HTTP response at all — the .auth-success waits below only say "didn't appear in
// time," not why, so this is what actually shows whether a request completed, errored, or
// never got a response.
const pendingSince = new Map();
page.on("request", (req) => {
  if (req.url().includes("/api/trpc/")) pendingSince.set(req, Date.now());
});
page.on("requestfinished", async (req) => {
  if (!req.url().includes("/api/trpc/")) return;
  const started = pendingSince.get(req);
  pendingSince.delete(req);
  const res = await req.response().catch(() => null);
  const elapsed = started ? Date.now() - started : null;
  let bodySnippet = "";
  try {
    bodySnippet = ((await res?.text()) ?? "").slice(0, 300);
  } catch {
    // response body already consumed or unavailable — status/timing below still stands
  }
  console.log(`NET: ${req.method()} ${req.url()} -> ${res ? res.status() : "?"} in ${elapsed}ms — ${bodySnippet}`);
});
page.on("requestfailed", (req) => {
  if (!req.url().includes("/api/trpc/")) return;
  pendingSince.delete(req);
  console.log(`NET FAILED: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

// /login redirects away immediately if a valid session cookie is already present (see
// login.tsx), so every path that needs to actually land on /login — including
// /forgot-password's own "Forgot password?" link starting there — has to make sure no
// session is active first, not just navigate there directly.
async function ensureSignedOut() {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const signOutBtn = page.locator(".app-header button", { hasText: "Sign out" });
  if (await signOutBtn.count()) {
    await Promise.all([page.waitForURL("**/login"), signOutBtn.click()]);
  } else {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  }
}

async function uiLogin(email, password) {
  await ensureSignedOut();
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid", { timeout: 15000 });
}

async function tryUiLogin(email, password) {
  await ensureSignedOut();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForSelector(".deck-grid", { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

async function rosterRows() {
  return page.$$eval(".team-table tbody tr", (trs) =>
    trs
      .filter((tr) => tr.querySelectorAll("td").length >= 3)
      .map((tr) => ({ email: tr.querySelectorAll("td")[1].textContent.trim() }))
  );
}

async function ensureUserViaTeamManagement({ email, name, mode, password }) {
  await page.goto(`${BASE}/team`, { waitUntil: "networkidle" });
  await page.waitForSelector(".team-table");
  const roster = await rosterRows();
  if (roster.some((r) => r.email === email)) {
    console.log(`"${name}" already exists (created on a previous run) — skipping creation.`);
    return;
  }
  await page.click(".new-deck-btn"); // "+ New User" reuses this class
  await page.waitForSelector("form.builder-subcard");
  if (mode === "direct") {
    await page.click('form.builder-subcard label:has-text("Set initial password directly")');
  }
  await page.fill('form.builder-subcard input[type="text"]', name);
  await page.fill('form.builder-subcard input[type="email"]', email);
  if (mode === "direct") {
    await page.fill('form.builder-subcard input[placeholder="At least 8 characters"]', password);
  }
  await Promise.all([page.waitForResponse((r) => r.url().includes("user.create")), page.click('form.builder-subcard button[type="submit"]')]);
  await page.waitForTimeout(300);
}

// Completes the shared "set your password" screen for a real token, through the real UI.
async function completeSetPasswordScreen(token, newPassword) {
  await page.goto(`${BASE}/reset-password?token=${token}`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="password"]');
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill(newPassword);
  await passwordInputs.nth(1).fill(newPassword);
  await page.click('button[type="submit"]');
  await waitForAuthSuccess();
}

// Same wait as every other .auth-success check, but on failure dumps enough of the live
// page state (URL, submit button's current text, any .auth-error text, full body length)
// to tell a slow-but-real request apart from a request that errored quietly or a selector
// that no longer matches what the page renders — the NET: log lines above show the
// request/response side of that same question.
async function waitForAuthSuccess(timeoutMs = 15000) {
  try {
    await page.waitForSelector(".auth-success", { timeout: timeoutMs });
  } catch (err) {
    const url = page.url();
    const submitText = await page.locator('button[type="submit"]').textContent().catch(() => "<no submit button found>");
    const errorText = await page.locator(".auth-error").textContent().catch(() => null);
    const bodyText = await page.locator("body").innerText().catch(() => "<could not read body>");
    console.log(`DIAG: .auth-success never appeared within ${timeoutMs}ms — url=${url} submitButtonText="${submitText}" authError=${errorText === null ? "<none>" : `"${errorText}"`}`);
    console.log(`DIAG: page body text at failure:\n${bodyText.slice(0, 1000)}`);
    throw err;
  }
}

console.log("\n=== Setup: Admin creates the reset-flow fixture account (direct password) ===");
await uiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
await ensureUserViaTeamManagement({ email: RESET_EMAIL, name: RESET_NAME, mode: "direct", password: "AeonQaResetInit123!" });
check("setup: reset-flow fixture account exists in the roster", (await rosterRows()).some((r) => r.email === RESET_EMAIL));

console.log("\n=== Forgot Password: request via the real UI ===");
await ensureSignedOut();
// waitForURL (not just waitForSelector('input[type="email"]')) matters here specifically:
// /login has its own email input, so immediately after clicking a client-side route
// transition, that selector can still resolve against the old /login page for a brief
// window before the new route's JS chunk finishes loading and swaps it in — filling that
// stale, about-to-be-unmounted field and clicking submit on the real (but still-empty,
// required) field on the new page silently fails browser-native validation with no
// request ever sent. Waiting for the URL to actually become /forgot-password first closes
// that window.
await Promise.all([page.waitForURL("**/forgot-password"), page.click("text=Forgot password?")]);
await page.waitForSelector('input[type="email"]');
await page.fill('input[type="email"]', RESET_EMAIL);
// Direct evidence, not another guess: does the field actually hold what we just typed,
// and does the button's onClick even run (visible as an immediate "Sending…" flip, since
// TanStack Query sets isPending synchronously when mutate starts — well before the
// network request settles) — rather than inferring both from a downstream 15s timeout.
const emailValueBeforeSubmit = await page.inputValue('input[type="email"]');
console.log(`DIAG: input[type="email"] value right before submit click: "${emailValueBeforeSubmit}" (expected "${RESET_EMAIL}")`);
await page.click('button[type="submit"]');
// The value read above proved fill() landed at that moment — but if a re-render (e.g. a
// late remount from the lazy-loaded route chunk still settling) resets this controlled
// input's React state after that read and before the click lands, the DOM value could be
// wiped back to "" right as the click fires: HTML5 required-field validation would then
// silently block the actual form submission with no visible error and no request, which
// looks exactly like everything observed so far. Re-reading the value plus the input's own
// validity state immediately after the click either confirms or rules this out directly.
const emailValueRightAfterClick = await page.inputValue('input[type="email"]').catch(() => "<read failed>");
const emailValidity = await page
  .locator('input[type="email"]')
  .evaluate((el) => ({ valid: el.validity.valid, message: el.validationMessage }))
  .catch(() => ({ valid: "<eval failed>", message: "" }));
console.log(
  `DIAG: input[type="email"] value right after click: "${emailValueRightAfterClick}" — validity.valid=${emailValidity.valid} validationMessage="${emailValidity.message}"`
);
await page.waitForTimeout(250);
const submitTextJustAfterClick = await page.locator('button[type="submit"]').textContent().catch(() => "<button not found>");
console.log(`DIAG: submit button text 250ms after click: "${submitTextJustAfterClick}"`);
await waitForAuthSuccess();
const realEmailMessage = (await page.locator(".auth-success").textContent()).trim();
check("forgot password: generic confirmation shown for a real account", realEmailMessage.length > 0, realEmailMessage);

console.log("\n=== Forgot Password: non-existent email returns the identical message (no leak) ===");
await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', `qa-nonexistent-${Date.now()}@aeonqa.internal`);
await page.click('button[type="submit"]');
await waitForAuthSuccess();
const fakeEmailMessage = (await page.locator(".auth-success").textContent()).trim();
check("forgot password: non-existent email gets the exact same message as a real one", fakeEmailMessage === realEmailMessage, `real="${realEmailMessage}" fake="${fakeEmailMessage}"`);

console.log("\n=== Forgot Password: real token, real SES send, real reset, real login ===");
const resetTokenResult = await e2eRequestToken(RESET_EMAIL, "RESET");
check("reset: e2eRequestToken succeeds", resetTokenResult.ok, resetTokenResult.message);
check("reset: a real email was actually sent via SES (non-null MessageId)", !!resetTokenResult.data?.messageId, JSON.stringify(resetTokenResult.data));
const newResetPassword = `AeonQaReset${Date.now()}!`;
await completeSetPasswordScreen(resetTokenResult.data.token, newResetPassword);
const resetLoginOk = await tryUiLogin(RESET_EMAIL, newResetPassword);
check("reset: the new password actually logs in", resetLoginOk);

console.log("\n=== Confirm an expired token is rejected ===");
const shortLivedTokenResult = await e2eRequestToken(RESET_EMAIL, "RESET", 2);
check("expiry: short-lived token issued", shortLivedTokenResult.ok && !!shortLivedTokenResult.data?.token, shortLivedTokenResult.message);
await new Promise((resolve) => setTimeout(resolve, 3000));
const expiredAttempt = await callTrpc("mutation", "auth.setPasswordWithToken", null, {
  token: shortLivedTokenResult.data.token,
  newPassword: "AeonQaShouldNotWork123!",
});
check("expiry: expired token is rejected", !expiredAttempt.ok && expiredAttempt.trpcCode === "BAD_REQUEST", expiredAttempt.message);

console.log("\n=== Confirm an already-used token is rejected on a second attempt ===");
const reuseTokenResult = await e2eRequestToken(RESET_EMAIL, "RESET");
const firstUse = await callTrpc("mutation", "auth.setPasswordWithToken", null, {
  token: reuseTokenResult.data.token,
  newPassword: "AeonQaReuseTest123!",
});
check("reuse: first redemption succeeds", firstUse.ok, firstUse.message);
const secondUse = await callTrpc("mutation", "auth.setPasswordWithToken", null, {
  token: reuseTokenResult.data.token,
  newPassword: "AeonQaReuseTestAgain123!",
});
check("reuse: the same token rejected on a second attempt", !secondUse.ok && secondUse.trpcCode === "BAD_REQUEST", secondUse.message);

console.log("\n=== New User Invitation: create via Team Management's default \"Send invitation email\" path ===");
await uiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
await ensureUserViaTeamManagement({ email: INVITE_EMAIL, name: INVITE_NAME, mode: "invite" });
check("invite: invited user appears in the roster", (await rosterRows()).some((r) => r.email === INVITE_EMAIL));

console.log("\n=== New User Invitation: real SES send, real setup, real login ===");
const inviteTokenResult = await e2eRequestToken(INVITE_EMAIL, "INVITE");
check("invite: e2eRequestToken succeeds", inviteTokenResult.ok, inviteTokenResult.message);
check("invite: a real invitation email was actually sent via SES (non-null MessageId)", !!inviteTokenResult.data?.messageId, JSON.stringify(inviteTokenResult.data));
const newInvitePassword = `AeonQaInvite${Date.now()}!`;
await completeSetPasswordScreen(inviteTokenResult.data.token, newInvitePassword);
const inviteLoginOk = await tryUiLogin(INVITE_EMAIL, newInvitePassword);
check("invite: the invited user can log in after completing setup", inviteLoginOk);

console.log("\n=== Confirm the direct-password path (secondary choice) still works unchanged ===");
await uiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
await ensureUserViaTeamManagement({ email: DIRECT_EMAIL, name: DIRECT_NAME, mode: "direct", password: DIRECT_PASSWORD });
check("direct: fixture account appears in the roster", (await rosterRows()).some((r) => r.email === DIRECT_EMAIL));
const directLoginOk = await tryUiLogin(DIRECT_EMAIL, DIRECT_PASSWORD);
check("direct: an account created with a direct initial password logs in immediately, no token involved", directLoginOk);

await page.screenshot({ path: `${OUT}/password-reset-final.png`, fullPage: true });

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length ? 1 : 0);
