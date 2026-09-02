// Live end-to-end test of AI-assisted deck drafting (Phase 3a), run against a real
// deployment (post-deploy job in .github/workflows/deploy-aws.yml, skipped automatically
// when ANTHROPIC_API_KEY hasn't been configured yet) or a local dev server.
//
// What it verifies, through the actual UI and the real Anthropic API — no stubbing:
//   1. A real draftDeck call from the Deck Builder's "Draft with AI" card loads a full,
//      editable draft into the exact same wizard the manual/clone flows use — not a
//      separate preview screen.
//   2. Nothing is persisted by drafting alone: deck.list's count is unchanged after
//      generating a draft, and only changes once deck.create (an explicit Save) runs.
//   3. Every network request the browser makes while drafting stays same-origin (the web
//      app's own origin or the API's) — the Anthropic API key never reaches the browser,
//      and the browser never talks to Anthropic directly.
//   4. The abuse guardrail actually trips: a dedicated QA user run past the per-user rate
//      limit gets a real TOO_MANY_REQUESTS rejection from the live server, not just code
//      that claims to reject it.
//
// The QA rate-limit user is separate from the demo account specifically so this doesn't
// exhaust the demo user's own drafting budget on every deploy. Idempotent: the QA user is
// created once (skip-if-exists) and no deck is ever saved by this script, so re-running it
// on every redeploy leaves no state behind to clean up.
//
// Env: BASE_URL, API_URL (both required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded
// demo user), CHROMIUM_PATH (optional), OUT_DIR (screenshots, default ./e2e-artifacts).

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
const E2E_TEST_SECRET = process.env.E2E_TEST_SECRET;
if (!BASE || !API || !E2E_TEST_SECRET) {
  console.error("BASE_URL, API_URL, and E2E_TEST_SECRET are all required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const QA_LIMIT_EMAIL = "qa-ai-draft-limit@aeonqa.internal";
const QA_LIMIT_PASSWORD = "AeonQaTest123!";
const RATE_LIMIT_MAX = 5; // must match apps/api/src/routers/ai.ts MAX_REQUESTS_PER_WINDOW
const ALLOWED_HOSTS = new Set([new URL(BASE).host, new URL(API).host]);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push("PAGE ERROR: " + e.message));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  // Callers sometimes pass a raw object (e.g. the full tRPC result) rather than a
  // pre-stringified string — string-concatenating that yields the useless "[object
  // Object]" instead of the actual diagnostic content a failure needs.
  const detailText = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detailText ? " — " + detailText : ""}`);
}

async function callTrpc(kind, path, token, input) {
  const isQuery = kind === "query";
  const url = isQuery
    ? `${API}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ "0": input }))}&batch=1`
    : `${API}/api/trpc/${path}?batch=1`;
  const res = await fetch(url, {
    method: isQuery ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: isQuery ? undefined : JSON.stringify({ "0": input }),
  });
  const body = await res.json();
  const first = Array.isArray(body) ? body[0] : body;
  if (first.error) return { ok: false, status: res.status, code: first.error.data?.code, message: first.error.message };
  return { ok: true, status: res.status, data: first.result.data };
}

async function uiLogin(email, password) {
  await page.goto(`${BASE}/`);
  // The redirect to /login (when logged out) happens client-side after an async auth
  // check, and "Sign out" only renders once already authenticated — race both instead of
  // checking either one immediately, which was flaky before this fix.
  await Promise.race([
    page.waitForURL(/\/login/, { timeout: 10_000 }).catch(() => {}),
    page.waitForSelector('button:has-text("Sign out")', { timeout: 10_000 }).catch(() => {}),
  ]);
  if (!page.url().includes("/login")) {
    await page.locator("button", { hasText: "Sign out" }).first().click();
    await page.waitForURL(/\/login/);
  }
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  const [loginResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("auth.login")),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForSelector(".deck-grid");
  const body = await loginResp.json();
  const first = Array.isArray(body) ? body[0] : body;
  return first.result.data.accessToken;
}

async function main() {
  // ---------- 0. Ensure the dedicated rate-limit QA user exists (idempotent) ----------
  const adminToken = await uiLogin(EMAIL, PASSWORD);
  check("demo admin login succeeds", !!adminToken);

  const existingUsers = await callTrpc("query", "user.list", adminToken, {});
  if (!existingUsers.data.some((u) => u.email === QA_LIMIT_EMAIL)) {
    const created = await callTrpc("mutation", "user.create", adminToken, {
      email: QA_LIMIT_EMAIL,
      password: QA_LIMIT_PASSWORD,
      name: "QA AI Draft Limit",
      role: "SALES_EXECUTIVE",
    });
    check("created the dedicated rate-limit QA user", created.ok, created);
  } else {
    check("rate-limit QA user already exists (idempotent re-run)", true);
  }

  // ---------- 1-3. Draft through the real UI: loads into the wizard, doesn't persist, same-origin only ----------
  const decksBefore = await callTrpc("query", "deck.list", adminToken, {});

  await page.goto(`${BASE}/decks/new`);
  await page.waitForSelector(".builder-ai-card");
  await page.click(".builder-ai-card");
  await page.waitForSelector(".builder-ai-prompt");
  await page.fill(
    ".builder-ai-prompt",
    "A regional last-mile parcel carrier running contracted delivery routes for a national e-commerce client.",
  );

  const seenHosts = new Set();
  const onRequest = (req) => seenHosts.add(new URL(req.url()).host);
  page.on("request", onRequest);

  const [draftResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("ai.draftDeck"), { timeout: 60_000 }),
    page.locator("button", { hasText: "Generate draft" }).click(),
  ]);
  page.off("request", onRequest);

  // Check response status BEFORE waiting on the DOM: if the server rejected the request,
  // .builder-form-pane never appears and a blind selector wait just burns 15s producing a
  // useless timeout instead of the real, actionable error — log the actual response body
  // (tRPC's error JSON, including our own wrapped Anthropic SDK error message) so a
  // failure here is diagnosable straight from the job log, no screenshot needed.
  const draftBodyText = await draftResp.text();
  if (!draftResp.ok()) {
    console.error(`ai.draftDeck response was ${draftResp.status()}: ${draftBodyText}`);
  }
  check("ai.draftDeck request succeeded (2xx)", draftResp.ok(), draftResp.ok() ? "" : draftBodyText);

  const offSiteHosts = [...seenHosts].filter((h) => !ALLOWED_HOSTS.has(h));
  check(
    "every network request during drafting stayed same-origin (no direct Anthropic call from the browser)",
    offSiteHosts.length === 0,
    offSiteHosts.join(", "),
  );

  // Belt-and-suspenders on top of the same-origin proof above: the response body our own
  // API sent back never contains anything that looks like an Anthropic key.
  check("the draftDeck response body never contains an Anthropic-shaped API key", !/sk-ant-/.test(draftBodyText));

  if (!draftResp.ok()) {
    // Nothing further to check through the UI if drafting itself failed server-side — the
    // error was already logged and recorded as a failed check above; stop here rather than
    // burn 15s on a selector wait that can never succeed.
    await page.screenshot({ path: `${OUT}/ai-draft-e2e-failure.png`, fullPage: true }).catch(() => {});
    throw new Error("ai.draftDeck failed server-side — see the logged response body above.");
  }

  await page.waitForSelector(".builder-form-pane", { timeout: 15_000 });

  const companyNameValue = await page
    .locator(".q-block", { hasText: "Company / deck name" })
    .first()
    .locator('input[type="text"]')
    .first()
    .inputValue();
  check("draft populated the company name field, and it's editable", companyNameValue.trim().length > 0, companyNameValue);

  await page.locator(".builder-step-chip", { hasText: "Services" }).click();
  await page.waitForSelector(".builder-svc-card");
  const badgeCount = await page.locator(".ai-badge").count();
  check("at least one AI-suggested badge is visible on the Services step", badgeCount > 0, `count=${badgeCount}`);

  const decksAfterDraft = await callTrpc("query", "deck.list", adminToken, {});
  check("deck count unchanged after drafting — nothing persisted without an explicit Save", decksAfterDraft.data.length === decksBefore.data.length, {
    before: decksBefore.data.length,
    after: decksAfterDraft.data.length,
  });

  // Discard rather than save — this script never needs a saved deck to prove its point,
  // and not saving keeps every re-run idempotent with zero cleanup.
  await page.locator("button", { hasText: "✕ Discard" }).click();
  await page.waitForSelector(".deck-grid");

  // ---------- 4. Rate limit actually trips, via the dedicated QA user ----------
  // Reset this account's rate-limit ledger first: without this, whether "the first N
  // succeed" and "the N+1th is rejected" hold depends on how recently (and how many times)
  // this suite last ran within the same rolling 60-minute window — deploys in quick
  // succession would otherwise leave this account's quota already partially or fully
  // consumed before the loop below even starts. Same secret/domain gate as
  // auth.e2eRequestToken.
  const resetResult = await callTrpc("mutation", "ai.e2eResetRateLimit", null, {
    email: QA_LIMIT_EMAIL,
    secret: E2E_TEST_SECRET,
  });
  check("rate-limit QA user's quota reset before the probe (deterministic regardless of prior runs)", resetResult.ok, resetResult);

  const qaToken = await uiLogin(QA_LIMIT_EMAIL, QA_LIMIT_PASSWORD);
  check("rate-limit QA user login succeeds", !!qaToken);

  let lastResult = null;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    lastResult = await callTrpc("mutation", "ai.draftDeck", qaToken, {
      prompt: `Rate-limit probe request number ${i} for the dedicated QA account, industry description text here.`,
    });
    if (!lastResult.ok) break;
  }
  check(`QA user's first ${RATE_LIMIT_MAX} drafts in the window succeed (quota was just reset above)`, !!lastResult?.ok, lastResult);

  const overLimit = await callTrpc("mutation", "ai.draftDeck", qaToken, {
    prompt: "One more request that should now be rejected by the rate limit guardrail on the live server.",
  });
  check("a request past the rate limit is genuinely rejected (TOO_MANY_REQUESTS) by the live server", !overLimit.ok && overLimit.code === "TOO_MANY_REQUESTS", overLimit);

  check("no page errors during this script's session", pageErrors.length === 0, pageErrors.join(" | "));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    await page.screenshot({ path: `${OUT}/ai-draft-e2e-failure.png`, fullPage: true }).catch(() => {});
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser.close();
  });
