// Manual, one-off ops tool for cleaning up test/QA data accumulated on the real deployed
// app — NOT a permanent regression suite, and deliberately not wired into deploy-aws.yml's
// live-e2e job (it must never run automatically on a push/deploy). Invoked only via the
// "Admin Cleanup (manual)" workflow_dispatch in .github/workflows/admin-cleanup.yml.
//
// Two modes, selected via MODE env var:
//   - "audit" (default, read-only): logs in as the admin account and dumps every active
//     deck, archived deck, user account, the admin's own active meeting records, and every
//     archived meeting record (any owner) as plain JSON to stdout, for a human to read from
//     the job log and classify before anything is touched.
//   - "execute": takes ACTIONS_JSON (an array of {type, id, label} — id is always the
//     Prisma DB id, label is just for readable logging) and applies each action via the
//     matching tRPC mutation (type is "<router>.<method>", e.g. "deck.archive",
//     "deck.deletePermanent", "user.remove", "user.deactivate", "user.reactivate"). Every
//     action is checked against a hardcoded protected-slug/protected-email list (re-fetched
//     live at the top of this same run, not trusted from the caller) before it's allowed to
//     run, as a hard safety net independent of whatever ACTIONS_JSON happens to contain.
//     Prefer "user.deactivate" over "user.remove" for any QA account that has recorded
//     meetings — remove refuses to run in that case anyway (see routers/user.ts), and
//     deactivate is the real answer: the account can't log in again but its history stays
//     intact, exactly like archiving a deck rather than deleting it.
//
// Env: BASE_URL + API_URL (required — the current live app; see admin-cleanup.yml, which
// resolves these itself via `aws apprunner describe-service` rather than hardcoding them).
// ADMIN_EMAIL/ADMIN_PASSWORD default to the seeded demo admin, same convention every other
// suite in this directory already uses.

const BASE = process.env.BASE_URL;
const API = process.env.API_URL;
if (!BASE || !API) {
  console.error("BASE_URL and API_URL are required");
  process.exit(2);
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "demo@aeonsynergies.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AeonDemo123!";
const MODE = process.env.MODE || "audit";
const ACTIONS = MODE === "execute" ? JSON.parse(process.env.ACTIONS_JSON || "[]") : [];

// Never touched by this tool, regardless of what ACTIONS_JSON says — checked by slug/email
// against data fetched fresh in THIS run, not trusted from the caller.
const PROTECTED_DECK_SLUGS = new Set(["aeon-logistics", "fedex-pd", "meridian-property"]);
const PROTECTED_USER_EMAILS = new Set(["demo@aeonsynergies.com", "test.admin@aeonsynergies.com"]);

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

const loginRes = await callTrpc("mutation", "auth.login", null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (!loginRes.ok) {
  console.error(`FATAL: admin login failed — ${loginRes.message}`);
  process.exit(1);
}
console.log(`Logged in as ${ADMIN_EMAIL} (role ${loginRes.data?.user?.role})`);
const token = loginRes.data.accessToken;

// Fetched unconditionally in both modes: audit mode prints it, execute mode uses it as the
// live source of truth for the protected-slug/email safety check below.
const [activeDecks, archivedDecks, users, ownActiveMeetings, archivedMeetings] = await Promise.all([
  callTrpc("query", "deck.list", token, {}),
  callTrpc("query", "archive.listDecks", token, {}),
  callTrpc("query", "user.list", token, {}),
  callTrpc("query", "meeting.listRecords", token, {}),
  callTrpc("query", "archive.listMeetings", token, {}),
]);

for (const [label, res] of [
  ["deck.list (active decks)", activeDecks],
  ["archive.listDecks (archived decks)", archivedDecks],
  ["user.list (all accounts)", users],
  ["meeting.listRecords (admin's own active completed records)", ownActiveMeetings],
  ["archive.listMeetings (all archived completed records, any owner)", archivedMeetings],
]) {
  if (!res.ok) console.error(`FATAL: ${label} failed — ${res.message}`);
}
if ([activeDecks, archivedDecks, users, ownActiveMeetings, archivedMeetings].some((r) => !r.ok)) process.exit(1);

const deckSlugById = new Map([...activeDecks.data, ...archivedDecks.data].map((d) => [d.id, d.slug]));
const userEmailById = new Map(users.data.map((u) => [u.id, u.email]));

// Meeting DTOs carry the full live SessionState (selected/toggles/answers/discount) — bloat
// irrelevant to classifying test data and, at real accumulated volume, big enough to blow
// past this tool's own job-log size limits. Audit mode only needs enough to decide
// keep/archive/delete, so print a slim projection instead of the raw objects.
function slimMeeting(m) {
  return { id: m.id, deckId: m.deckId, deckCompanyName: m.deckCompanyName, clientName: m.clientName, completedAt: m.completedAt };
}
function slimArchivedMeeting(m) {
  return { id: m.id, clientName: m.clientName, deckCompanyName: m.deckCompanyName, createdByName: m.createdByName, completedAt: m.completedAt, archivedAt: m.archivedAt };
}

if (MODE === "audit") {
  console.log("\n=== ACTIVE DECKS (deck.list) ===");
  console.log(JSON.stringify(activeDecks.data.map((d) => ({ id: d.id, slug: d.slug, companyName: d.companyName })), null, 2));
  console.log("\n=== ARCHIVED DECKS (archive.listDecks) ===");
  console.log(JSON.stringify(archivedDecks.data, null, 2));
  console.log("\n=== USER ACCOUNTS (user.list) ===");
  console.log(JSON.stringify(users.data.map((u) => ({ id: u.id, email: u.email, role: u.role, deactivatedAt: u.deactivatedAt })), null, 2));
  console.log("\n=== ADMIN'S OWN ACTIVE COMPLETED MEETING RECORDS (meeting.listRecords) — slim projection ===");
  console.log(JSON.stringify(ownActiveMeetings.data.map(slimMeeting), null, 2));
  console.log("\n=== ALL ARCHIVED COMPLETED MEETING RECORDS, ANY OWNER (archive.listMeetings) — slim projection ===");
  console.log(JSON.stringify(archivedMeetings.data.map(slimArchivedMeeting), null, 2));
  process.exit(0);
}

// ---------- execute mode ----------
console.log(`\n=== EXECUTE: ${ACTIONS.length} action(s) ===`);
const results = [];
for (const action of ACTIONS) {
  const { type, id, label } = action;
  let guard = null;
  if (type.startsWith("deck.") && PROTECTED_DECK_SLUGS.has(deckSlugById.get(id))) {
    guard = `refused: id ${id} resolves to a protected deck slug (${deckSlugById.get(id)})`;
  } else if (
    (type === "user.remove" || type === "user.deactivate") &&
    PROTECTED_USER_EMAILS.has(userEmailById.get(id))
  ) {
    guard = `refused: id ${id} resolves to a protected user email (${userEmailById.get(id)})`;
  }
  if (guard) {
    console.log(`SKIP: ${type} ${label ?? id} — ${guard}`);
    results.push({ type, id, label, ok: false, message: guard });
    continue;
  }
  const [router, method] = type.split(".");
  const res = await callTrpc("mutation", `${router}.${method}`, token, { id });
  console.log(`${res.ok ? "OK" : "FAIL"}: ${type} ${label ?? id}${res.ok ? "" : ` — ${res.message}`}`);
  results.push({ type, id, label, ok: res.ok, message: res.message });
}

console.log("\n=== EXECUTE SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} actions succeeded`);
if (failed.length) {
  console.log("Failed/skipped:");
  for (const f of failed) console.log(` - ${f.type} ${f.label ?? f.id}: ${f.message}`);
}
process.exit(failed.length ? 1 : 0);
