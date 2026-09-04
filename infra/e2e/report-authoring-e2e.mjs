// Live end-to-end test of custom report authoring (Deck Builder wizard, Services step —
// "Report & Sample slides"), run against a real deployment (post-deploy job in
// .github/workflows/deploy-aws.yml). Needs real AWS credentials (S3) and a configured
// ANTHROPIC_API_KEY to mean anything — the api service returns a graceful "not configured"
// error for both otherwise, which is what a local run without those secrets will see.
//
// What it does, through the actual UI + real API calls:
//   1. Creates a fresh fixture deck with two services: one starting with zero report
//      slides (for the live upload/AI-generate flows below), one pre-seeded with 5 compact
//      reports via a raw deck.create call (for the pagination/overflow check, which needs
//      no wizard interaction — it's pure layout).
//   2. In the wizard: uploads a real small PNG straight to S3 via a presigned URL, confirms
//      it lands in the report list; generates a real custom report from a plain-English
//      description via ai.draftReport, confirms it lands in the list too. Saves the deck.
//   3. On the live deck player: confirms the uploaded image renders as a real <img> at a
//      capped, non-cropped size; confirms the AI report renders inside a sandboxed
//      <iframe> (not any of Templates A/B/C's own markup) with real, non-empty generated
//      content — the direct "not template-constrained" check.
//   4. Confirms the overflow service's 5 reports produced two paginated "Sample: X (n/2)"
//      slides, and that neither page's content exceeds the slide's own box (the literal
//      "never crop" requirement — see paginateReports in packages/types/src/deck.ts).
//   5. Removes one of the two newly-added reports in the wizard, saves again, confirms it's
//      actually gone from the live deck — Remove still works exactly as before.
//
// Env: BASE_URL + API_URL (required), DEMO_EMAIL/DEMO_PASSWORD (default: the seeded demo
// user), CHROMIUM_PATH (optional executable override; CI uses Playwright's own install),
// OUT_DIR (screenshots, default ./e2e-artifacts/report-authoring).

import { mkdirSync } from "node:fs";
import zlib from "node:zlib";
import { chromium } from "playwright";

// A real, valid PNG at a real, non-trivial size (built by hand, no image-library
// dependency) — a 1x1 stub would technically satisfy "has a rendered size > 0" without
// actually exercising the sizing/capping behavior this suite is meant to check.
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed) >>> 0, 0);
  return Buffer.concat([len, typed, crc]);
}
function makeSolidPng(width, height, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
if (!BASE || !API) {
  console.error("BASE_URL and API_URL are required");
  process.exit(2);
}
const EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const PASSWORD = process.env.DEMO_PASSWORD || "AeonDemo123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts/report-authoring";
mkdirSync(OUT, { recursive: true });

const RUN_TAG = Date.now().toString(36);

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

function compactReport(i) {
  return { title: `Report ${i}`, illustrative: true, template: { kind: "particulars-table", rows: [{ label: `Row ${i}`, value: "100", bold: true }] } };
}

function fixtureConfig() {
  return {
    industry: "QA",
    companyName: `QA Report Authoring ${RUN_TAG}`,
    tagline: "Throwaway fixture for the live report-authoring E2E suite.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Units", unit: "units", questionText: "How many units?", isPrimary: true }],
    services: [
      {
        id: "qaAuthoringService",
        name: "QA Authoring Service",
        team: "QA Team",
        category: "major",
        pricingModelId: "primary",
        bandLabel: "Flat",
        handle: ["Seed bullet for the report-authoring E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [{ upTo: null, price: 100 }],
      },
      {
        id: "qaOverflowService",
        name: "QA Overflow Service",
        team: "QA Team",
        category: "major",
        pricingModelId: "primary",
        bandLabel: "Flat",
        handle: ["Seed bullet for the report-authoring E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [{ upTo: null, price: 100 }],
        reportSlides: [1, 2, 3, 4, 5].map(compactReport),
      },
    ],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Report Authoring", sub: "" },
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

// The presigned S3 upload is a cross-origin PUT the browser can reject entirely (a CORS
// preflight failure, a blocked mixed-content request, ...) without ever producing an HTTP
// status code — fetch() surfaces that as a bare "Failed to fetch" with no other detail. A
// plain thrown-error message from a timed-out waitForSelector doesn't distinguish that from
// any other kind of failure, so capture the browser's own console/network signal directly
// (see "wizard: upload a real image straight to S3" below) rather than guessing from a
// wrapped exception.
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
const failedRequests = [];
page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText ?? "unknown"}`));

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid");
}

async function clickLabel(label) {
  await page.$$eval(".routebar .stop", (els, target) => els.find((e) => e.getAttribute("aria-label") === target)?.click(), label);
  await page.waitForTimeout(300);
}

// ========== Setup ==========
console.log("\n=== Setup ===");
const loginRes = await callTrpc("mutation", "auth.login", null, { email: EMAIL, password: PASSWORD });
check("setup: admin API login succeeds", loginRes.ok);
const token = loginRes.data?.accessToken;

const created = await callTrpc("mutation", "deck.create", token, { config: fixtureConfig() });
check("setup: fixture deck created", created.ok, created.message);
const deckSlug = created.data?.slug;

// ========== Wizard: upload an image + generate an AI report ==========
console.log("\n=== Wizard: Upload image + Create with AI ===");
await section("wizard setup", login);

await section("wizard: open Services step, expand QA Authoring Service", async () => {
  await page.goto(`${BASE}/decks/${deckSlug}/edit`, { waitUntil: "networkidle" });
  const form = page.locator(".builder-form-pane");
  await form.locator(".builder-step-chip", { hasText: "Services" }).click();
  const svcCard = form.locator(".builder-svc-card", { hasText: "QA Authoring Service" });
  if (!(await svcCard.locator(".builder-svc-body").count())) {
    await svcCard.locator(".builder-svc-head").click();
  }
  await page.waitForTimeout(300);
  check("wizard: QA Authoring Service starts with zero reports listed", (await svcCard.locator(".builder-report-note").count()) === 0);
});

const form = () => page.locator(".builder-form-pane");
const svcCard = () => form().locator(".builder-svc-card", { hasText: "QA Authoring Service" });

// A real, solid-teal 300x150 PNG (landscape, matching a real report screenshot's rough
// proportions) — see makeSolidPng above.
const TEST_PNG = makeSolidPng(300, 150, [12, 123, 130]);

await section("wizard: upload a real image straight to S3", async () => {
  const consoleBefore = consoleErrors.length;
  const failedBefore = failedRequests.length;
  const fileInput = svcCard().locator('input[type="file"][accept*="image/png"]').first();
  await fileInput.setInputFiles({ name: "qa-report.png", mimeType: "image/png", buffer: TEST_PNG });
  try {
    await page.waitForSelector('.builder-report-note:has-text("uploaded-image")', { timeout: 20000 });
  } catch {
    // Surface what the browser itself saw for the S3 request (a CORS preflight rejection,
    // a blocked mixed-content request, ...) instead of just "waitForSelector timed out" —
    // see the console/requestfailed listeners set up above.
    const diagnostics = [...failedRequests.slice(failedBefore), ...consoleErrors.slice(consoleBefore)].filter((m) => /amazonaws\.com|cors/i.test(m));
    const errText = await svcCard().locator(".builder-ai-error").innerText().catch(() => "");
    throw new Error(diagnostics.length ? diagnostics.join(" | ") : errText || "upload never completed and no diagnostic was captured");
  }
  check("wizard: uploaded image appears in the report list", (await svcCard().locator(".builder-report-note", { hasText: "uploaded-image" }).count()) === 1);
  const errText = await svcCard().locator(".builder-ai-error").innerText().catch(() => "");
  check("wizard: upload produced no error banner", errText === "", errText);
});

await section("wizard: generate a real custom report from a description", async () => {
  await svcCard().locator(".mini-btn", { hasText: "Create with AI" }).click();
  await svcCard().locator('input[type="text"]').last().fill("QA Custom KPI Card");
  await svcCard().locator("textarea").fill("A simple KPI summary card with three example metrics, each a bold number and a short label underneath, in a clean row.");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("ai.draftReport"), { timeout: 60000 }),
    svcCard().locator(".new-deck-btn", { hasText: "Generate report" }).click(),
  ]);
  await page.waitForSelector('.builder-report-note:has-text("custom-html")', { timeout: 5000 });
  check("wizard: AI-generated report appears in the report list", (await svcCard().locator(".builder-report-note", { hasText: "custom-html" }).count()) === 1);
  // Scoped to the AI panel specifically (.builder-subcard) — the upload button above has its
  // own, unrelated .builder-ai-error banner (uploadError vs aiError, StepServices.tsx), and a
  // leftover upload failure from the check above must not get misattributed to AI generation.
  const errText = await svcCard().locator(".builder-subcard .builder-ai-error").innerText().catch(() => "");
  check("wizard: AI generation produced no error banner", errText === "", errText);
});

await section("wizard: save the deck", async () => {
  await form().locator(".builder-step-chip", { hasText: "Review" }).click();
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.update")), page.locator(".btn-primary", { hasText: "Save changes" }).click()]);
});

// ========== Live deck: confirm both new reports render correctly ==========
console.log("\n=== Live deck: uploaded image + AI report render correctly ===");
await section("live deck: open QA Authoring Service's Sample slide", async () => {
  await page.goto(`${BASE}/decks/${deckSlug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".routebar .stop", { timeout: 15000 });
  const labels = await page.$$eval(".routebar .stop", (els) => els.map((el) => el.getAttribute("aria-label")));
  const label = labels.find((l) => l && l.startsWith("Sample: QA Authoring"));
  check("live deck: a Sample slide exists for QA Authoring Service", !!label, JSON.stringify(labels));
  await clickLabel(label);

  const scrollInfo = await page.locator(".slide").evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  check("live deck: the slide doesn't overflow its own box (nothing cropped)", scrollInfo.scrollHeight <= scrollInfo.clientHeight + 2, JSON.stringify(scrollInfo));

  const img = page.locator(".report-uploaded-image img");
  check("live deck: uploaded image rendered as a real <img>", (await img.count()) === 1);
  const imgBox = await img.boundingBox();
  // The source is a real 300x150 (2:1) PNG — object-fit: contain must preserve that aspect
  // ratio (never stretched/squished) while staying under the CSS height cap (never cropped).
  const aspectRatio = imgBox ? imgBox.width / imgBox.height : 0;
  check(
    "live deck: uploaded image renders at its real aspect ratio (2:1), not stretched or cropped",
    !!imgBox && imgBox.height > 0 && imgBox.height <= 260 && Math.abs(aspectRatio - 2) < 0.2,
    JSON.stringify({ imgBox, aspectRatio }),
  );
  const naturalWidth = await img.evaluate((el) => el.naturalWidth);
  check("live deck: uploaded image actually loaded (decoded) from S3, not a broken link", naturalWidth === 300, String(naturalWidth));

  const iframe = page.locator("iframe.report-custom-html");
  check("live deck: AI-generated report rendered as a sandboxed iframe", (await iframe.count()) === 1);
  const sandboxAttr = await iframe.getAttribute("sandbox");
  check("live deck: iframe has NO allow-scripts (defense against injected script)", sandboxAttr !== null && !sandboxAttr.includes("allow-scripts"), String(sandboxAttr));
  const iframeHtmlLength = await iframe.evaluate((el) => el.contentDocument?.body?.innerHTML?.length ?? 0);
  check("live deck: iframe actually contains real generated markup (not empty)", iframeHtmlLength > 40, String(iframeHtmlLength));
  // The direct "not template-constrained" check: none of Templates A/B/C's own markup
  // appears anywhere on this slide outside the sandboxed iframe — the AI report is
  // genuinely its own thing, not a relabeled bar-highlights/particulars/operational table.
  const templateMarkupOutsideIframe = await page.locator(".slide .report-bar-highlights, .slide .report-particulars, .slide .report-operational-table").count();
  check("live deck: AI report is NOT built from any of Templates A/B/C's own markup", templateMarkupOutsideIframe === 0, String(templateMarkupOutsideIframe));

  await page.locator(".slide").screenshot({ path: `${OUT}/report-authoring-upload-and-ai.png` });
  console.log("Saved report-authoring-upload-and-ai.png");
});

// ========== Overflow / pagination ==========
console.log("\n=== Overflow: 5 reports paginate instead of cropping ===");
await section("overflow: QA Overflow Service produces two paginated slides", async () => {
  const labels = await page.$$eval(".routebar .stop", (els) => els.map((el) => el.getAttribute("aria-label")));
  const sampleLabels = labels.filter((l) => l && l.startsWith("Sample: QA Overflow"));
  check("overflow: exactly 2 paginated slides for 5 compact reports", sampleLabels.length === 2, JSON.stringify(sampleLabels));
  check("overflow: labels are ordered (1/2) then (2/2)", sampleLabels[0]?.includes("(1/2)") && sampleLabels[1]?.includes("(2/2)"), JSON.stringify(sampleLabels));

  await clickLabel(sampleLabels[0]);
  let titles = await page.locator(".report-card-title").allInnerTexts();
  check("overflow: page 1 has 4 reports (2 rows of 2)", titles.length === 4, JSON.stringify(titles));
  let scrollInfo = await page.locator(".slide").evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  check("overflow: page 1 doesn't overflow the slide box", scrollInfo.scrollHeight <= scrollInfo.clientHeight + 2, JSON.stringify(scrollInfo));
  await page.locator(".slide").screenshot({ path: `${OUT}/report-authoring-overflow-page1.png` });

  await clickLabel(sampleLabels[1]);
  const page2Text = await page.locator(".slide").innerText();
  check("overflow: page 2 has the 5th report", page2Text.includes("Report 5"), page2Text.slice(0, 60));
  scrollInfo = await page.locator(".slide").evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  check("overflow: page 2 doesn't overflow the slide box either", scrollInfo.scrollHeight <= scrollInfo.clientHeight + 2, JSON.stringify(scrollInfo));
  await page.locator(".slide").screenshot({ path: `${OUT}/report-authoring-overflow-page2.png` });
  console.log("Saved report-authoring-overflow-page1.png, report-authoring-overflow-page2.png");
});

// ========== Remove still works ==========
console.log("\n=== Remove sample slide still works ===");
await section("remove: deleting one of the newly-added reports actually removes it", async () => {
  await page.goto(`${BASE}/decks/${deckSlug}/edit`, { waitUntil: "networkidle" });
  await form().locator(".builder-step-chip", { hasText: "Services" }).click();
  const card = svcCard();
  if (!(await card.locator(".builder-svc-body").count())) {
    await card.locator(".builder-svc-head").click();
  }
  await page.waitForTimeout(300);
  const beforeCount = await card.locator(".builder-report-note").count();
  await card.locator(".builder-list-row", { hasText: "custom-html" }).locator(".mini-btn-danger").click();
  const afterCount = await card.locator(".builder-report-note").count();
  check("remove: report list shrinks by exactly one", afterCount === beforeCount - 1, `${beforeCount} -> ${afterCount}`);

  await form().locator(".builder-step-chip", { hasText: "Review" }).click();
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.update")), page.locator(".btn-primary", { hasText: "Save changes" }).click()]);

  await page.goto(`${BASE}/decks/${deckSlug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".routebar .stop", { timeout: 15000 });
  const labels = await page.$$eval(".routebar .stop", (els) => els.map((el) => el.getAttribute("aria-label")));
  const label = labels.find((l) => l && l.startsWith("Sample: QA Authoring"));
  await clickLabel(label);
  check("remove: the removed AI report no longer renders live", (await page.locator("iframe.report-custom-html").count()) === 0);
  check("remove: the kept uploaded image still renders live", (await page.locator(".report-uploaded-image img").count()) === 1);
});

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
if (failed.length > 0) process.exit(1);
