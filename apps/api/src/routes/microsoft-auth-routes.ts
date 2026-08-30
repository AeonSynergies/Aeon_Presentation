import { Router } from "express";
import { issueSession } from "../routers/auth.js";
import { exchangeMicrosoftCode, generateOAuthState, getMicrosoftAuthCodeUrl, isMicrosoftAuthConfigured, resolveMicrosoftUser } from "../lib/microsoft-auth.js";

// "Sign in with Microsoft" (Phase 4a Part 1) — plain Express routes, not tRPC, because
// this is a real browser redirect flow (the user's browser navigates to
// login.microsoftonline.com and back), not a fetch a tRPC client can drive. On success
// this sets the SAME refresh-token httpOnly cookie password login does (via the shared
// issueSession()), then redirects to the web app's root — the existing AuthProvider's
// mount-time silent refresh (apps/web/src/hooks/useAuth.tsx) picks that cookie up exactly
// like it already does after a page reload, so no new web-side callback route or tRPC
// mutation is needed to finish the sign-in.
const isProd = process.env.NODE_ENV === "production";
const STATE_COOKIE_NAME = "aeon_ms_oauth_state";
const STATE_COOKIE_PATH = "/api/auth/microsoft";
const STATE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

function webOrigin(): string {
  return process.env.WEB_ORIGIN || "http://localhost:3000";
}

function redirectToLoginError(res: import("express").Response, error: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ error, ...extra });
  res.redirect(`${webOrigin()}/login?${params.toString()}`);
}

export const microsoftAuthRouter = Router();

microsoftAuthRouter.get("/start", async (_req, res) => {
  if (!isMicrosoftAuthConfigured()) {
    redirectToLoginError(res, "microsoft_not_configured");
    return;
  }
  try {
    const state = generateOAuthState();
    res.cookie(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: STATE_COOKIE_MAX_AGE_MS,
      path: STATE_COOKIE_PATH,
    });
    const authCodeUrl = await getMicrosoftAuthCodeUrl(state);
    res.redirect(authCodeUrl);
  } catch (err) {
    console.error("microsoft auth /start failed:", err instanceof Error ? err.message : err);
    redirectToLoginError(res, "microsoft_failed");
  }
});

microsoftAuthRouter.get("/callback", async (req, res) => {
  res.clearCookie(STATE_COOKIE_NAME, { path: STATE_COOKIE_PATH });

  if (!isMicrosoftAuthConfigured()) {
    redirectToLoginError(res, "microsoft_not_configured");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const expectedState = req.cookies?.[STATE_COOKIE_NAME] as string | undefined;
  if (!code || !state || !expectedState || state !== expectedState) {
    redirectToLoginError(res, "microsoft_failed");
    return;
  }

  try {
    const identity = await exchangeMicrosoftCode(code);
    const result = await resolveMicrosoftUser(identity);
    if (!result.ok) {
      // Deliberately no auto-provisioning — see lib/microsoft-auth.ts. An Admin has to
      // create the account (Team Management) before this email can sign in via Microsoft,
      // exactly like it already has to before that email can sign in with a password.
      redirectToLoginError(res, "no_account", { email: result.email });
      return;
    }
    await issueSession(res, result.user);
    res.redirect(webOrigin());
  } catch (err) {
    console.error("microsoft auth /callback failed:", err instanceof Error ? err.message : err);
    redirectToLoginError(res, "microsoft_failed");
  }
});
