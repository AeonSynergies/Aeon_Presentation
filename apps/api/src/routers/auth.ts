import { prisma } from "@aeon/database";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_NAME,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../lib/auth.js";
import { assertE2eTestAccess } from "../lib/e2e-test-guard.js";
import { isMicrosoftAuthConfigured } from "../lib/microsoft-auth.js";
import { createAndSendPasswordSetToken, hashPasswordSetToken, requestPasswordSetToken } from "../lib/password-tokens.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

// Production serves web and api from different origins, so the refresh cookie must be
// SameSite=None (requires Secure) to survive a cross-origin fetch; local dev proxies /api
// through the Vite dev server (see apps/web/vite.config.ts) so it's same-origin there and
// plain Lax/non-secure works over http://localhost.
const isProd = process.env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  path: "/",
};

// Exported (not just used locally below) so the plain-Express Microsoft OAuth callback
// route (apps/api/src/index.ts — a redirect flow, not a tRPC call, so it can't go through
// this router directly) issues sessions the exact same way password login does: same JWT
// claims, same refresh-cookie mechanics, same everything downstream of "who is this".
export async function issueSession(res: import("express").Response, user: { id: string; email: string; role: string }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const { token, hash, expiresAt } = generateRefreshToken();
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt } });
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions);
  return accessToken;
}

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      const accessToken = await issueSession(ctx.res, user);
      return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    }),

  // No public self-registration: accounts are created by an Admin via Team Management
  // (user.create), which is how role assignment stays meaningful. A public signup
  // endpoint would let anyone hand themselves an account regardless of the role
  // enforcement the rest of this phase builds — see routers/user.ts.

  refresh: publicProcedure.mutation(async ({ ctx }) => {
    const token = ctx.req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "No refresh token" });
    const hash = hashRefreshToken(token);
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired refresh token" });
    }
    // Rotate: revoke the used token and issue a fresh pair.
    await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    const accessToken = await issueSession(ctx.res, record.user);
    return {
      accessToken,
      user: { id: record.user.id, email: record.user.email, name: record.user.name, role: record.user.role },
    };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const token = ctx.req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) {
      const hash = hashRefreshToken(token);
      await prisma.refreshToken.updateMany({ where: { tokenHash: hash }, data: { revokedAt: new Date() } });
    }
    ctx.res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
    return { ok: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }),

  // Lets the login page know whether to show "Sign in with Microsoft" at all — a plain
  // feature-detection query, not an auth decision (the real gate is isMicrosoftAuthConfigured()
  // being checked again server-side by the /api/auth/microsoft/* routes themselves).
  config: publicProcedure.query(() => ({ microsoftEnabled: isMicrosoftAuthConfigured() })),

  // Forgot Password — request step. Deliberately returns the exact same response whether
  // or not the email matches a real account: leaking that would let anyone enumerate who
  // has an Aeon login. The actual reset email (if any) is a side effect the response never
  // reflects.
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.email() }))
    .mutation(async ({ input }) => {
      const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (user) await requestPasswordSetToken(user, "RESET");
      return { message: "If that email exists, we've sent a password reset link." };
    }),

  // The redemption step for BOTH flows that hand someone a "set your password" link —
  // Forgot Password's reset link and a new user's invitation link are the exact same
  // token type (see packages/database PasswordSetToken), so there's one mutation here, not
  // two. Single-use: the token is marked used in the same transaction as the password
  // update, so a second attempt with the same link always fails.
  setPasswordWithToken: publicProcedure
    .input(z.object({ token: z.string().min(1), newPassword: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const tokenHash = hashPasswordSetToken(input.token);
      const record = await prisma.passwordSetToken.findUnique({ where: { tokenHash } });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This link is invalid or has expired. Request a new one." });
      }
      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await prisma.$transaction([
        prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
        prisma.passwordSetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      ]);
      return { ok: true };
    }),

  // Test-support only — lets the live E2E suite obtain a real, valid token (and confirm SES
  // genuinely sent it) for a reserved QA fixture account, since there's no real inbox to
  // read production email from in CI. Gated on a server-only shared secret
  // (process.env.E2E_TEST_SECRET, generated once by infra/aws/deploy.sh and never set
  // outside this project's own deploy) AND restricted to @aeonqa.internal addresses, so
  // even a leaked secret can only touch QA fixture accounts, never a real one. This calls
  // the exact same helper the real reset/invite flows use — a real token, really emailed —
  // just handed back directly instead of requiring a real inbox to retrieve it. Returns
  // NOT_FOUND (not FORBIDDEN) on any gate failure so it reveals nothing about why.
  e2eRequestToken: publicProcedure
    .input(
      z.object({
        email: z.email(),
        secret: z.string(),
        purpose: z.enum(["RESET", "INVITE"]),
        ttlSeconds: z.number().int().positive().max(3600).optional(),
      })
    )
    .mutation(async ({ input }) => {
      assertE2eTestAccess(input.email, input.secret);
      const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return createAndSendPasswordSetToken(user, input.purpose, input.ttlSeconds ? input.ttlSeconds * 1000 : undefined);
    }),
});

// Re-exported for callers that only need to validate a bearer token outside tRPC context
// (e.g. static asset gating), without importing the whole router.
export { verifyAccessToken };
