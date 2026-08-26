import { prisma } from "@aeon/database";
import { ROLES } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requirePermission, router } from "../trpc.js";

// Team Management — Admin-only (manageUsers permission), enforced at requirePermission,
// not by anything the frontend hides. This is the ONLY way accounts get created now that
// auth.register is gone: an Admin sets an initial email + password directly. No
// email-invite flow yet — a reasonable future enhancement, not required for role
// enforcement to be real.

const roleSchema = z.enum(ROLES);

function toUserDTO(u: { id: string; email: string; name: string; role: string; createdAt: Date }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt };
}

export const userRouter = router({
  list: requirePermission("manageUsers").query(async () => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    return users.map(toUserDTO);
  }),

  create: requirePermission("manageUsers")
    .input(z.object({ email: z.email(), password: z.string().min(8), name: z.string().min(1), role: roleSchema }))
    .mutation(async ({ input }) => {
      const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists" });
      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await prisma.user.create({
        data: { email: input.email.toLowerCase(), passwordHash, name: input.name, role: input.role },
      });
      return toUserDTO(user);
    }),

  updateRole: requirePermission("manageUsers")
    .input(z.object({ id: z.string(), role: roleSchema }))
    .mutation(async ({ input, ctx }) => {
      const target = await prisma.user.findUnique({ where: { id: input.id } });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      if (target.id === ctx.user.id && target.role === "ADMIN" && input.role !== "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You're the last Admin — promote another account to Admin before stepping down from this one.",
          });
        }
      }

      const user = await prisma.user.update({ where: { id: input.id }, data: { role: input.role } });
      return toUserDTO(user);
    }),

  remove: requirePermission("manageUsers").input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    if (input.id === ctx.user.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove your own account while signed in as it." });
    }
    const target = await prisma.user.findUnique({ where: { id: input.id } });
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can't remove the last remaining Admin." });
      }
    }
    // Meeting.createdById has no cascade — a user who's run live Discovery sessions is
    // referenced by that history, so removal fails at the DB rather than orphaning rows.
    const meetingCount = await prisma.meeting.count({ where: { createdById: input.id } });
    if (meetingCount > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Can't remove this user — they have ${meetingCount} recorded meeting${meetingCount === 1 ? "" : "s"}. Change their role instead if they should lose access.`,
      });
    }
    await prisma.user.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
