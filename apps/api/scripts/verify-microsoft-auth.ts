// Local verification for "Sign in with Microsoft" (Phase 4a Part 1) — NOT a live-e2e
// suite wired into deploy-aws.yml, and NOT run against the deployed app: it can't be
// either of those yet, since there's no real Azure AD tenant to actually authenticate
// against (the Microsoft 365 Developer Program sandbox isn't available; a plain Azure
// Free Account is being set up separately). Once that exists and AZURE_CLIENT_ID/
// TENANT_ID/CLIENT_SECRET are wired in (see the root README's Azure AD setup steps), THIS
// is the point to replace with a real browser-driven suite (Playwright signing into a
// real test Microsoft account) mirroring wizard-e2e.mjs/role-enforcement-e2e.mjs's
// pattern, wired into deploy-aws.yml gated on an `azure_configured` output exactly like
// ai-draft-e2e.mjs is gated on `ai_configured`.
//
// What THIS verifies, against a real local Postgres and a real running local api server —
// everything on this app's side of the boundary, with the one part that genuinely
// requires live Azure AD (validating that a signed ID token really came from Microsoft
// and really names this person) simulated as a plain {email, name} object:
//   1. resolveMicrosoftUser() — the exact function the real OAuth callback
//      (apps/api/src/routes/microsoft-auth-routes.ts) calls after exchanging a real code —
//      maps a known email to the correct EXISTING user row and role, and correctly
//      REJECTS an email with no matching account (no auto-provisioning).
//   2. A JWT signed via the exact same signAccessToken() function issueSession() (used by
//      both password login and Microsoft sign-in) uses, carrying that resolved role,
//      grants/denies real requirePermission()-gated API calls IDENTICALLY to how
//      role-enforcement-e2e.mjs already proved a password-obtained token does — because
//      it's the same signing function and the same trpc.ts context/requirePermission
//      code downstream, a Microsoft-mapped session's role enforcement cannot differ from
//      a password session's.
//
// Run with a local api dev server + Postgres already up (see the root README's local dev
// steps): `pnpm --filter @aeon/api exec tsx scripts/verify-microsoft-auth.ts`
// Env: API_URL (default http://localhost:4000), DATABASE_URL/JWT_ACCESS_SECRET (read from
// apps/api/.env via dotenv, same as the running server).

import "dotenv/config";
import { prisma } from "@aeon/database";
import bcrypt from "bcryptjs";
import { signAccessToken } from "../src/lib/auth.js";
import { resolveMicrosoftUser } from "../src/lib/microsoft-auth.js";

const API = process.env.API_URL || "http://localhost:4000";

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function callTrpc(kind: "query" | "mutation", path: string, token: string | null, input?: unknown) {
  const url =
    kind === "query"
      ? `${API}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: input ?? {} }))}`
      : `${API}/api/trpc/${path}?batch=1`;
  const res = await fetch(url, {
    method: kind === "query" ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: kind === "query" ? undefined : JSON.stringify({ 0: input ?? {} }),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  const entry = Array.isArray(body) ? body[0] : body;
  const parsed = entry as { error?: { message?: string }; result?: { data?: unknown } } | null;
  return { ok: !parsed?.error, data: parsed?.result?.data, message: parsed?.error?.message };
}

// The Admin case deliberately reuses the seeded demo account rather than creating a new
// ADMIN fixture — user.updateRole's "can't demote the last Admin" guard (routers/user.ts)
// checks the live admin count in the DB, so a throwaway second ADMIN row here would
// permanently break that invariant for role-enforcement-e2e.mjs (and any other suite) on
// every later run, not just this one.
const DEMO_ADMIN_EMAIL = process.env.DEMO_EMAIL || "demo@aeonsynergies.com";
const FIXTURES = {
  sales: { email: "qa-msauth-sales@aeonqa.internal", name: "QA MS Sales", role: "SALES_EXECUTIVE" as const },
  ops: { email: "qa-msauth-ops@aeonqa.internal", name: "QA MS Ops", role: "OPERATIONS_MANAGER" as const },
};

async function ensureFixtureUser(f: (typeof FIXTURES)[keyof typeof FIXTURES]) {
  const passwordHash = await bcrypt.hash("unused-fixture-password", 10);
  await prisma.user.upsert({
    where: { email: f.email },
    update: { name: f.name, role: f.role },
    create: { email: f.email, name: f.name, role: f.role, passwordHash },
  });
}

async function main() {
  console.log("\n=== Setup: ensure fixture users exist (created directly, not via Microsoft — mirrors an Admin using Team Management) ===");
  for (const f of Object.values(FIXTURES)) {
    await ensureFixtureUser(f);
  }
  const demoAdmin = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });
  if (!demoAdmin) throw new Error(`Seeded demo admin (${DEMO_ADMIN_EMAIL}) not found — run the seed script first.`);
  check("setup: fixture users (Sales Executive/Operations Manager) exist, demo Admin found", true);

  console.log("\n=== resolveMicrosoftUser(): maps a Microsoft identity to the correct EXISTING user + role ===");
  const adminResolve = await resolveMicrosoftUser({ email: demoAdmin.email, name: demoAdmin.name });
  check("resolveMicrosoftUser: ADMIN maps to the correct existing row", adminResolve.ok && adminResolve.user.role === "ADMIN", JSON.stringify(adminResolve));
  for (const f of Object.values(FIXTURES)) {
    const result = await resolveMicrosoftUser({ email: f.email, name: f.name });
    check(`resolveMicrosoftUser: ${f.role} maps to the correct existing row`, result.ok && result.user.role === f.role, JSON.stringify(result));
  }

  const unknownEmail = `qa-msauth-nobody-${Date.now()}@aeonqa.internal`;
  const unknownResult = await resolveMicrosoftUser({ email: unknownEmail, name: "Nobody Registered" });
  check(
    "resolveMicrosoftUser: an email with no matching account is REJECTED, not auto-provisioned",
    !unknownResult.ok && unknownResult.reason === "no_account",
    JSON.stringify(unknownResult),
  );

  console.log("\n=== Role enforcement: a Microsoft-mapped session's JWT is checked identically to a password session's ===");
  // The exact same signAccessToken() call issueSession() makes for a password login — this
  // IS the "session issued for a Microsoft-authenticated identity" the task asks to confirm
  // role enforcement for, minus the refresh-cookie half (which needs a real Express
  // response object and doesn't affect what requirePermission() checks: that reads only
  // the JWT's role claim, set identically either way).
  const tokens: Record<string, string> = {
    admin: signAccessToken({ sub: demoAdmin.id, email: demoAdmin.email, role: demoAdmin.role }),
  };
  for (const [key, f] of Object.entries(FIXTURES)) {
    const resolved = await resolveMicrosoftUser({ email: f.email, name: f.name });
    if (!resolved.ok) throw new Error(`fixture ${f.email} unexpectedly has no account`);
    tokens[key] = signAccessToken({ sub: resolved.user.id, email: resolved.user.email, role: resolved.user.role });
  }

  const adminList = await callTrpc("query", "user.list", tokens.admin);
  check("Admin (Microsoft-mapped): user.list succeeds", adminList.ok, adminList.message);

  const salesCreate = await callTrpc("query", "deck.list", tokens.sales);
  check("Sales Executive (Microsoft-mapped): deck.list (any logged-in role) succeeds", salesCreate.ok, salesCreate.message);
  const salesUserList = await callTrpc("query", "user.list", tokens.sales);
  check("Sales Executive (Microsoft-mapped): user.list REJECTED (manageUsers)", !salesUserList.ok, salesUserList.message);

  const opsUserList = await callTrpc("query", "user.list", tokens.ops);
  check("Operations Manager (Microsoft-mapped): user.list REJECTED (manageUsers)", !opsUserList.ok, opsUserList.message);
  const opsMeetingCreate = await callTrpc("query", "deck.list", tokens.ops);
  check("Operations Manager (Microsoft-mapped): deck.list (any logged-in role) succeeds", opsMeetingCreate.ok, opsMeetingCreate.message);

  const noToken = await callTrpc("query", "user.list", null);
  check("No token: rejected as UNAUTHORIZED", !noToken.ok, noToken.message);

  console.log("\n=== SUMMARY ===");
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `${failed.length} CHECK(S) FAILED:\n` + failed.map((f) => " - " + f.name).join("\n") : `ALL ${results.length} CHECKS PASSED`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
