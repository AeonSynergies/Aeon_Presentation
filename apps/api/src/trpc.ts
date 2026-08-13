import { TRPCError, initTRPC } from "@trpc/server";
import type * as trpcExpress from "@trpc/server/adapters/express";
import { verifyAccessToken } from "./lib/auth.js";

export interface AuthedUser {
  id: string;
  email: string;
  role: string;
}

export function createContext({ req, res }: trpcExpress.CreateExpressContextOptions) {
  let user: AuthedUser | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const payload = verifyAccessToken(token);
      user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      user = null;
    }
  }
  return { req, res, user };
}

export type Context = ReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Phase 1 gate: logged in or not is the only check that matters (CLAUDE.md Build Order #4).
 * Role-based permission enforcement is a later phase. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
