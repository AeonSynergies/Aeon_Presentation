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

async function issueSession(res: import("express").Response, user: { id: string; email: string; role: string }) {
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

  register: publicProcedure
    .input(z.object({ email: z.email(), password: z.string().min(8), name: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists" });
      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await prisma.user.create({
        data: { email: input.email.toLowerCase(), passwordHash, name: input.name },
      });
      const accessToken = await issueSession(ctx.res, user);
      return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    }),

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
});

// Re-exported for callers that only need to validate a bearer token outside tRPC context
// (e.g. static asset gating), without importing the whole router.
export { verifyAccessToken };
