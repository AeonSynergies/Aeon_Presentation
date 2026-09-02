import crypto from "node:crypto";
import { prisma } from "@aeon/database";
import { ROLES } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requestPasswordSetToken } from "../lib/password-tokens.js";
import { protectedProcedure, requirePermission, router } from "../trpc.js";

// Team Management — Admin-only (manageUsers permission), enforced at requirePermission,
// not by anything the frontend hides. This is the ONLY way accounts get created now that
// auth.register is gone: an Admin either sends a real invitation email (the default —
// reuses the exact same single-use token + "set your password" screen as Forgot Password,
// see lib/password-tokens.ts) or sets an initial password directly (the original,
// still-supported path every QA/E2E fixture-user setup relies on).

const roleSchema = z.enum(ROLES);

function toUserDTO(u: { id: string; email: string; name: string; title: string | null; role: string; createdAt: Date }) {
  return { id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, createdAt: u.createdAt };
}

export const userRouter = router({
  list: requirePermission("manageUsers").query(async () => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    return users.map(toUserDTO);
  }),

  create: requirePermission("manageUsers")
    .input(
      z
        .object({
          email: z.email(),
          name: z.string().min(1),
          role: roleSchema,
          password: z.string().min(8).optional(),
          sendInvitation: z.boolean().optional(),
        })
        .refine((v) => v.sendInvitation || !!v.password, {
          message: "Set an initial password, or send an invitation email instead.",
          path: ["password"],
        })
    )
    .mutation(async ({ input }) => {
      const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists" });
      // An invited user's real password is whatever they set via the invitation link —
      // this placeholder is a random value nobody ever sees or types, purely so
      // passwordHash (NOT NULL) has something to hold until then.
      const passwordHash = await bcrypt.hash(input.sendInvitation ? crypto.randomBytes(32).toString("hex") : input.password!, 10);
      const user = await prisma.user.create({
        data: { email: input.email.toLowerCase(), passwordHash, name: input.name, role: input.role },
      });
      if (input.sendInvitation) await requestPasswordSetToken(user, "INVITE");
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

  // Profile & Settings (Phase 5a) — self-service, every logged-in role, own account only.
  // Distinct from the manageUsers-gated mutations above: no role is editable here, and
  // there's no target-user id in the input — ctx.user.id is the only account this can
  // ever touch.
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        email: z.email().optional(),
        // Job title — shown only in a Minutes of Meeting email's signature
        // (meeting.sendMinutes). "" clears it; undefined leaves it untouched.
        title: z.string().max(120).optional(),
        currentPassword: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

      const data: { name?: string; email?: string; title?: string | null } = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.title !== undefined) data.title = input.title.trim() || null;

      const newEmail = input.email?.toLowerCase();
      if (newEmail !== undefined && newEmail !== user.email) {
        // Changing the login email is a sensitive change — require the current password,
        // same bar as changePassword below, rather than trusting a live session alone.
        if (!input.currentPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Enter your current password to change your email." });
        }
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
        const existing = await prisma.user.findUnique({ where: { email: newEmail } });
        if (existing && existing.id !== user.id) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists" });
        }
        data.email = newEmail;
      }

      if (Object.keys(data).length === 0) return toUserDTO(user);
      const updated = await prisma.user.update({ where: { id: user.id }, data });
      return toUserDTO(updated);
    }),

  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      return { ok: true };
    }),
});
