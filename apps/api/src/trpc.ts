import { TRPCError, initTRPC } from "@trpc/server";
import type * as trpcExpress from "@trpc/server/adapters/express";
import { ROLE_LABELS, can, type Permission, type Role } from "@aeon/types";
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

/** Login-gate only — every role can reach these. Matches the spec's "Present" /
 * "Discovery Notes" columns, which are Yes for all four roles. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * The real enforcement layer (Team & Role Management). Rejects with FORBIDDEN before the
 * handler ever runs when the caller's role lacks `permission` — independent of whatever
 * the frontend happens to show or hide, so a direct API call from a role that shouldn't
 * have this action gets refused here, every time, not just a hidden button. `can()` is
 * imported from @aeon/types so this reads the exact same table the frontend uses to
 * decide what to render; there's one matrix, not two that could drift.
 */
export function requirePermission(permission: Permission) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!can(ctx.user.role, permission)) {
      const label = ROLE_LABELS[ctx.user.role as Role] ?? ctx.user.role;
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `${label} accounts don't have permission to do this.`,
      });
    }
    return next({ ctx });
  });
}
