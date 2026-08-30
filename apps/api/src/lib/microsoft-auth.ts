import crypto from "node:crypto";
import { prisma } from "@aeon/database";
import { ConfidentialClientApplication, type AuthenticationResult } from "@azure/msal-node";

// "Sign in with Microsoft" (Phase 4a Part 1) — Azure AD OAuth/OIDC, authorization-code
// flow via the official @azure/msal-node client rather than hand-rolled JWKS/ID-token
// validation. Deliberately requests only openid/profile/email (no Microsoft Graph scope):
// this only needs to know who the person is, never to call Graph on their behalf, which
// also means no admin-consent-for-Graph-permissions step is needed on the Azure AD side.
//
// Auto-provisioning is deliberately NOT implemented: a successful Microsoft sign-in maps
// to an EXISTING row in the users table (matched by email) exactly like the task asked —
// it does not create one. This mirrors the exact "no public self-registration" stance
// routers/auth.ts already documents for password accounts: every account, regardless of
// which method someone eventually uses to sign into it, still starts with an Admin
// creating it via Team Management (user.create). Microsoft sign-in is an alternate
// authentication method for an account that already exists, not a second signup path.
const SCOPES = ["openid", "profile", "email"];

function requiredEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function isMicrosoftAuthConfigured(): boolean {
  return !!(requiredEnv("AZURE_AD_CLIENT_ID") && requiredEnv("AZURE_AD_TENANT_ID") && requiredEnv("AZURE_AD_CLIENT_SECRET"));
}

/** The API's own public origin — needed to build the redirect_uri Azure AD sends the
 * browser back to. Distinct from WEB_ORIGIN (the web app's origin, used for CORS/the
 * post-login redirect target); this is the api service's own URL. */
function apiOrigin(): string {
  const origin = requiredEnv("API_ORIGIN");
  if (!origin) throw new Error("Missing required env var: API_ORIGIN");
  return origin;
}

export function microsoftRedirectUri(): string {
  return `${apiOrigin()}/api/auth/microsoft/callback`;
}

let cachedClient: ConfidentialClientApplication | null = null;

function msalClient(): ConfidentialClientApplication {
  if (cachedClient) return cachedClient;
  const clientId = requiredEnv("AZURE_AD_CLIENT_ID");
  const tenantId = requiredEnv("AZURE_AD_TENANT_ID");
  const clientSecret = requiredEnv("AZURE_AD_CLIENT_SECRET");
  if (!clientId || !tenantId || !clientSecret) {
    throw new Error("Microsoft sign-in isn't configured (AZURE_AD_CLIENT_ID/TENANT_ID/CLIENT_SECRET)");
  }
  cachedClient = new ConfidentialClientApplication({
    auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` },
  });
  return cachedClient;
}

/** A random, unguessable value the caller stores in a short-lived cookie and compares
 * against what Azure AD echoes back in the callback — standard CSRF protection for a
 * redirect-based OAuth flow that has no server-side session of its own between the two
 * legs. */
export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function getMicrosoftAuthCodeUrl(state: string): Promise<string> {
  return msalClient().getAuthCodeUrl({ scopes: SCOPES, redirectUri: microsoftRedirectUri(), state });
}

export interface MicrosoftIdentity {
  email: string;
  name: string;
}

/** Exchanges the authorization code for tokens (msal-node validates the ID token's
 * signature/issuer/audience/expiry against Azure AD's own JWKS internally — this file
 * never touches raw JWT verification) and extracts the two claims this app cares about. */
export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftIdentity> {
  const result: AuthenticationResult = await msalClient().acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: microsoftRedirectUri(),
  });
  const claims = result.idTokenClaims as { email?: string; preferred_username?: string; name?: string } | undefined;
  const email = claims?.email ?? claims?.preferred_username ?? result.account?.username;
  const name = claims?.name ?? result.account?.name ?? email;
  if (!email) throw new Error("Microsoft did not return an email claim for this account");
  return { email: email.toLowerCase(), name: name ?? email };
}

export type MicrosoftSignInResult =
  | { ok: true; user: { id: string; email: string; name: string; role: string } }
  | { ok: false; reason: "no_account"; email: string };

/** The one piece of this flow that's genuinely testable without a real Azure AD tenant:
 * given a (real-or-simulated) verified Microsoft identity, map it to an existing user row.
 * Kept separate from exchangeMicrosoftCode so local verification can call this directly
 * with fixture claims, exercising the exact same lookup + role-mapping logic a real token
 * exchange feeds into, without needing live Azure AD credentials to do so. */
export async function resolveMicrosoftUser(identity: MicrosoftIdentity): Promise<MicrosoftSignInResult> {
  const user = await prisma.user.findUnique({ where: { email: identity.email } });
  if (!user) return { ok: false, reason: "no_account", email: identity.email };
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}
