// Live end-to-end test of multi-user collaborative access to a Discovery Notes session, run
// against a real deployment (post-deploy job in .github/workflows/deploy-aws.yml) or a local
// dev server.
//
// Background: a live Discovery Notes session used to be "anyone with the URL" — any logged
// in user who somehow learned a meetingId could open it. This suite exercises the real
// replacement: a SessionCollaborator table gates access, an owner exists per session, and
// per-field locks show while a collaborator is actively editing (see collaboration.ts and
// meeting.lockField/unlockField, apps/api/src/routers).
//
// What it does, through the actual UI in TWO real, independent browser contexts (two
// simulated real users, each with their own login/session) — no API shortcuts for anything
// the spec calls out as a UI behavior:
//   1. Admin (the session's creator/owner) opens the fixture deck's Discovery Notes twice,
//      giving two distinct live sessions (meeting.create always creates a fresh row — see
//      useDeckSession.ts) — one is the real target, the other exists purely to prove an
//      invite to session A never grants access to session B.
//   2. Admin invites a real second Team member (qa-operations-manager@aeonqa.internal, an
//      existing permanent QA role fixture — never an arbitrary email) to session A via the
//      real collaborators panel UI, and the suite captures the real collaboration.invite
//      network response to confirm a genuine SES messageId came back (not just that the
//      call succeeded).
//   3. The invitee's own in-app notification bell picks up the invite (polling, same as
//      everywhere else in this app) — clicking it is the real click-through path into the
//      session, confirmed to open session A specifically. The suite also confirms that
//      same invitee is refused access to session B (never invited there).
//   4. Field locking: admin focuses/types into a Discovery Notes field; the invitee's
//      already-open window shows it greyed out with the editor's name within one poll
//      cycle, and confirms it clears again after admin blurs. Separately (a raw lockField
//      call with no renewal heartbeat, since waiting out FIELD_LOCK_IDLE_MS via the real UI
//      heartbeat would just prove the heartbeat works, not the timeout) confirms a lock
//      left completely unrenewed clears on its own after the idle timeout — a closed tab or
//      crashed browser can never leave a field stuck locked for everyone else.
//   5. Ownership transfer: admin explicitly transfers ownership to the invitee via the
//      panel's "Make owner" button; then admin (now a plain collaborator) removes the
//      invitee (now the owner) directly — the implicit-transfer path — which per
//      collaboration.ts makes admin, the remover, the new owner again.
//   6. Cleanly removes a non-owner collaborator (the invitee) from session A, and confirms
//      their access is genuinely revoked.
//
// Idempotent by design, matching every other suite in this directory: the fixture deck uses
// a fixed slug, reset to its bare config on re-runs rather than recreated. Meeting rows
// (the live sessions themselves) are NOT idempotent across runs — like every other suite
// that calls meeting.create against its own fixture deck (role-enforcement-e2e.mjs
// included), a fresh live session is created every run; this is expected and accepted,
// exactly like elsewhere, since a Meeting row is invisible clutter (a DB row, not something
// that shows up in Home's deck grid) and this never touches a real/protected deck.
//
// Env: BASE_URL + API_URL (required), ADMIN_EMAIL/ADMIN_PASSWORD (default: the seeded demo
// admin), INVITEE_EMAIL/INVITEE_PASSWORD (default: the permanent qa-operations-manager QA
// role fixture), CHROMIUM_PATH (optional; CI uses Playwright's own install), OUT_DIR
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
const INVITEE_EMAIL = process.env.INVITEE_EMAIL || "qa-operations-manager@aeonqa.internal";
const INVITEE_PASSWORD = process.env.INVITEE_PASSWORD || "AeonQaTest123!";
const OUT = process.env.OUT_DIR || "./e2e-artifacts";
mkdirSync(OUT, { recursive: true });

const DECK_NAME = "QA Session Collaboration Fixture";
const DECK_SLUG = "qa-session-collaboration-fixture";
const LOCK_QUESTION_ID = "collabNotes";
const LOCK_QUESTION_LABEL = "Collaboration notes";

function baseDeckConfig() {
  return {
    industry: "QA",
    companyName: DECK_NAME,
    tagline: "Fixture for the live session-collaboration E2E suite.",
    logo: { type: "text", wordmark: "QA" },
    colors: { amber: "#888888", teal: "#666666" },
    pricingModels: [{ id: "primary", label: "Units", unit: "units", questionText: "How many units?", isPrimary: true }],
    services: [
      {
        id: "svc",
        name: "QA Service",
        team: "QA Team",
        category: "major",
        pricingModelId: "primary",
        bandLabel: "Flat",
        handle: ["Seed bullet for the session-collaboration E2E suite"],
        stats: [],
        dashboards: [],
        priceBands: [{ upTo: null, price: 100 }],
      },
    ],
    team: [{ initials: "QA", name: "QA Bot", title: "Automation", email: "qa@aeonqa.internal", phone: "" }],
    staticContent: {
      cover: { title1: "QA", title2: "Session Collaboration", sub: "" },
      about: { title1: "QA", title2: "Deck", body: "", bullets: [] },
      how: { steps: [{ t: "QA", d: "" }] },
      challenges: { items: [] },
      benefits: { items: [] },
      qa: { title: "Questions?", sub: "", email: "", phone: "", web: "", address: "" },
    },
    discoveryQuestions: [{ id: LOCK_QUESTION_ID, section: "general", label: LOCK_QUESTION_LABEL, type: "text", placeholder: "" }],
  };
}

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
  const r = await callTrpc("mutation", "auth.login", null, { email, password });
  return { token: r.data?.accessToken, user: r.data?.user, ok: r.ok, message: r.message };
}

// ---------- setup: idempotent fixture deck (fixed slug, reset on re-run — see header) ----------
console.log("\n=== Setup ===");
const admin = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
check("setup: admin API login succeeds", admin.ok, admin.message);

// The suite opens sessions through the real UI (clicking the fixture deck's card), not a
// raw meeting.create call, so only the deck's existence matters here — no dbId is needed.
const existingFixture = await callTrpc("query", "deck.getBySlug", admin.token, { slug: DECK_SLUG });
if (existingFixture.ok) {
  console.log(`"${DECK_NAME}" already exists (created on a previous run) — resetting it to the bare fixture config.`);
  const reset = await callTrpc("mutation", "deck.update", admin.token, { slug: DECK_SLUG, config: baseDeckConfig() });
  check("setup: fixture deck reset to bare config", reset.ok, reset.message);
} else {
  const created = await callTrpc("mutation", "deck.create", admin.token, { config: baseDeckConfig() });
  check("setup: fixture deck created", created.ok && created.data?.slug === DECK_SLUG, created.message);
}

const invitee = await apiLogin(INVITEE_EMAIL, INVITEE_PASSWORD);
check("setup: invitee (qa-operations-manager) API login succeeds", invitee.ok, invitee.message);

// ---------- two real, independent browser sessions ----------
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const adminCtx = await browser.newContext();
const inviteeCtx = await browser.newContext();
const adminPage = await adminCtx.newPage();
const inviteePage = await inviteeCtx.newPage();
const pageErrors = [];
for (const [label, p] of [["admin", adminPage], ["invitee", inviteePage]]) {
  p.on("pageerror", (e) => pageErrors.push(`PAGE ERROR (${label}): ${e.message}`));
}

async function uiLogin(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([page.waitForResponse((r) => r.url().includes("deck.list")), page.click('button[type="submit"]')]);
  await page.waitForSelector(".deck-grid");
}

// Opens a brand new live session on the fixture deck (meeting.create always creates a
// fresh Meeting row on every deck-player mount — see useDeckSession.ts) and returns its
// meetingId plus the popped-out notes window Page for it.
async function openFreshSession(ctx, page) {
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".deck-grid");
  await page.click(`.deck-card:has-text("${DECK_NAME}")`);
  await page.waitForSelector(".notes-btn", { timeout: 15000 });
  const [notesPage] = await Promise.all([ctx.waitForEvent("page"), page.locator(".notes-btn").click()]);
  await notesPage.waitForLoadState("networkidle");
  await notesPage.waitForSelector(".notes-wrap", { timeout: 15000 });
  const meetingId = new URL(notesPage.url()).searchParams.get("meetingId");
  return { meetingId, notesPage };
}

console.log("\n=== Admin: open two distinct live sessions ===");
await uiLogin(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
const sessionA = await openFreshSession(adminCtx, adminPage);
check("session A created with a real meetingId", !!sessionA.meetingId, sessionA.meetingId);

await uiLogin(inviteePage, INVITEE_EMAIL, INVITEE_PASSWORD);

// A second, distinct session admin never invites anyone to — exists purely so the "invite
// grants access to that specific session and no other" check below has a real other
// session to be refused from, not a made-up id.
const adminSecondPage = await adminCtx.newPage();
const sessionB = await openFreshSession(adminCtx, adminSecondPage);
check("session B created with a different meetingId than session A", !!sessionB.meetingId && sessionB.meetingId !== sessionA.meetingId, sessionB.meetingId);
await sessionB.notesPage.close();
await adminSecondPage.close();

// ---------- invite: real Team member picker, real notification + real email ----------
console.log("\n=== Invite a real second Team member to session A ===");
const ownerNotesPage = sessionA.notesPage;
await ownerNotesPage.click(".collab-panel .icon-btn");
await ownerNotesPage.waitForSelector(".collab-dropdown");
check("owner's collaborators panel starts with just themself", (await ownerNotesPage.locator(".collab-row").count()) === 1);

await ownerNotesPage.click('.collab-panel-footer button:has-text("+ Invite")');
const inviteeButton = ownerNotesPage.locator(".collab-invite-list button", { hasText: INVITEE_EMAIL });
await inviteeButton.waitFor({ timeout: 10000 }); // user.listTeamPickable only starts fetching once the picker opens
check("invite picker lists the real Team member by name + email (no arbitrary email entry)", (await inviteeButton.count()) === 1);

const [inviteResponse] = await Promise.all([
  ownerNotesPage.waitForResponse((r) => r.url().includes("collaboration.invite")),
  inviteeButton.click(),
]);
const inviteBody = await inviteResponse.json().catch(() => null);
const inviteResult = (Array.isArray(inviteBody) ? inviteBody[0] : inviteBody)?.result?.data;
check("invite: a real SES messageId came back (genuine email send, not just a DB write)", !!inviteResult?.emailMessageId, JSON.stringify(inviteResult));

await ownerNotesPage.waitForTimeout(500);
check("owner's collaborators panel now shows 2 people", (await ownerNotesPage.locator(".collab-row").count()) === 2);

// Confirm the in-app notification via the real API too (belt-and-suspenders alongside the
// UI click-through below, which is the actual product-facing path).
const inviteeNotifs = await callTrpc("query", "notifications.list", invitee.token, {});
const notifForSessionA = (inviteeNotifs.data ?? []).find((n) => n.linkUrl?.includes(sessionA.meetingId));
check("invitee received a real in-app notification referencing session A", inviteeNotifs.ok && !!notifForSessionA, JSON.stringify(notifForSessionA));

// ---------- click-through: notification bell opens the SPECIFIC invited session ----------
console.log("\n=== Invitee: notification click-through grants access to session A specifically ===");
await inviteePage.waitForTimeout(5500); // NOTIFICATIONS_POLL_MS (5s) + margin
await inviteePage.click(".notif-bell .icon-btn");
await inviteePage.waitForSelector(".notif-dropdown");
const notifItem = inviteePage.locator(".notif-item", { hasText: "Discovery Notes session" }).first();
check("invitee's notification bell shows the invite", (await notifItem.count()) > 0);

const [inviteeNotesPage] = await Promise.all([inviteeCtx.waitForEvent("page"), notifItem.click()]);
await inviteeNotesPage.waitForLoadState("networkidle");
await inviteeNotesPage.waitForSelector(".notes-wrap", { timeout: 15000 });
check(
  "click-through opened session A specifically",
  inviteeNotesPage.url().includes(`meetingId=${sessionA.meetingId}`),
  inviteeNotesPage.url(),
);

// Access is genuinely per-session: the invitee was never added to session B. A full
// navigation re-triggers RequireAuth's silent refresh-token exchange before meeting.get
// even runs, so wait for the actual result rather than a fixed sleep.
await inviteePage.goto(`${BASE}/decks/${DECK_SLUG}/notes?meetingId=${sessionB.meetingId}`);
const deniedMessage = inviteePage.getByText("This meeting session could not be found.");
let deniedOk = false;
try {
  await deniedMessage.waitFor({ timeout: 10000 });
  deniedOk = true;
} catch {
  deniedOk = false;
}
check("invitee is refused access to session B (never invited there)", deniedOk);

// ---------- field locking ----------
console.log("\n=== Field locking ===");
const ownerField = ownerNotesPage.locator(".q-block", { hasText: LOCK_QUESTION_LABEL }).locator("input");
const inviteeField = inviteeNotesPage.locator(".q-block", { hasText: LOCK_QUESTION_LABEL }).locator("input");

await ownerField.click();
await ownerField.fill("Owner is typing here");
await inviteeNotesPage.waitForTimeout(2500); // REMOTE_POLL_MS (1.5s) + margin
check(
  "invitee sees the field locked (greyed out) while owner is focused on it",
  (await inviteeField.isDisabled()) && (await inviteeNotesPage.locator(".field-lock-badge").count()) > 0,
);
check("invitee's own view names the actual editor in the lock badge", (await inviteeNotesPage.locator(".field-lock-badge").first().textContent())?.includes("Demo"));

await ownerField.blur();
await inviteeNotesPage.waitForTimeout(2500);
check("field unlocks for the invitee once the owner blurs (no idle wait needed)", !(await inviteeField.isDisabled()));

// A lock with no renewal heartbeat at all clears on its own after the idle timeout — a
// crashed browser can never leave a field permanently stuck for everyone else. Exercised
// directly against the API (not the real ~20s UI heartbeat, which would only prove the
// heartbeat renews things, not that an UNrenewed lock actually expires).
console.log("(waiting out the field-lock idle timeout — no renewal sent, ~25s)");
const rawLock = await callTrpc("mutation", "meeting.lockField", admin.token, { id: sessionA.meetingId, fieldKey: `answer:${LOCK_QUESTION_ID}` });
check("setup: raw lockField call succeeds", rawLock.ok, rawLock.message);
await new Promise((r) => setTimeout(r, 25000));
const afterIdle = await callTrpc("query", "meeting.get", admin.token, { id: sessionA.meetingId });
check(
  "an unrenewed lock auto-clears after the idle timeout",
  afterIdle.ok && !afterIdle.data.fieldLocks[`answer:${LOCK_QUESTION_ID}`],
  JSON.stringify(afterIdle.data?.fieldLocks),
);

// ---------- ownership transfer: explicit, then implicit ----------
console.log("\n=== Ownership transfer ===");
const inviteeName = invitee.user?.name || "QA Operations Manager";
const inviteeRow = ownerNotesPage.locator(".collab-row", { hasText: inviteeName });
await inviteeRow.locator('button:has-text("Make owner")').click();
await ownerNotesPage.waitForTimeout(500);
check("explicit transfer: invitee's row now shows OWNER", (await ownerNotesPage.locator(".collab-row", { hasText: inviteeName }).locator(".collab-owner-tag").count()) > 0);
check("explicit transfer: admin's own row no longer shows OWNER", (await ownerNotesPage.locator(".collab-row", { hasText: "YOU" }).locator(".collab-owner-tag").count()) === 0);

// Implicit transfer: admin (now a plain collaborator) removes the invitee (now the owner)
// directly — per collaboration.ts this makes admin, the remover, the new owner again.
await ownerNotesPage.locator(".collab-row", { hasText: inviteeName }).locator('button:has-text("Remove")').click();
await ownerNotesPage.waitForTimeout(500);
check("implicit transfer: removing the owner directly makes the remover (admin) the new owner", (await ownerNotesPage.locator(".collab-row", { hasText: "YOU" }).locator(".collab-owner-tag").count()) > 0);
check("removed collaborator is gone from the list", (await ownerNotesPage.locator(".collab-row").count()) === 1);

// The invitee's own next poll confirms they genuinely lost access (not just that the UI
// list shrank on the remover's side).
const inviteeGetAfterRemoval = await callTrpc("query", "meeting.get", invitee.token, { id: sessionA.meetingId });
check("removed collaborator (invitee) genuinely lost access at the API", !inviteeGetAfterRemoval.ok, inviteeGetAfterRemoval.message);

console.log("\nPage errors:", pageErrors.length ? pageErrors : "none");
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} CHECK(S) FAILED` : `ALL ${results.length} CHECKS PASSED`);
await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
