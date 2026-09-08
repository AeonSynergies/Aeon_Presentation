import { prisma } from "@aeon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendEmail } from "../lib/email.js";
import { requireCollaborator } from "../lib/session-access.js";
import { protectedProcedure, router } from "../trpc.js";

// Real, permissioned multi-user access to a live Discovery Notes session — replaces the
// old "anyone who knows the meetingId can open it" model. Every procedure below re-derives
// "is the caller even in this session" the same way, via requireCollaborator
// (lib/session-access.ts): the SessionCollaborator table is the single source of truth for
// who can see/act on a given Meeting's live session, not the Meeting's own createdById
// (kept purely as historical/audit metadata from here on).
//
// Ownership: exactly one collaborator per meeting has isOwner: true (enforced at the DB
// level by a partial unique index — see the schema.prisma migration). Two paths change who
// owns a session:
//   - transferOwnership: only the CURRENT owner can explicitly hand ownership to another
//     collaborator (e.g. so they can then be removed, or are about to leave).
//   - leave / removeCollaborator: removing or leaving AS the owner always promotes someone
//     else first, in the same transaction, so a session can never end up ownerless. A lone
//     owner (no other collaborators) has nothing to hand off to — leave refuses in that
//     case rather than deleting the only remaining door into the session; this is normal,
//     expected solo use, not an error state to work around.

const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";

interface CollaboratorDTO {
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
}

function toCollaboratorDTO(c: { userId: string; isOwner: boolean; user: { name: string; email: string } }): CollaboratorDTO {
  return { userId: c.userId, name: c.user.name, email: c.user.email, isOwner: c.isOwner };
}

export const collaborationRouter = router({
  listCollaborators: protectedProcedure
    .input(z.object({ meetingId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireCollaborator(input.meetingId, ctx.user.id);
      const rows = await prisma.sessionCollaborator.findMany({
        where: { meetingId: input.meetingId },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toCollaboratorDTO);
    }),

  // Invites a real Team member (picked by id, never an arbitrary email — see
  // user.listTeamPickable) into this session. Any current collaborator can invite further
  // people, not just the session's original owner. Idempotent: inviting someone already in
  // the session is a silent no-op (returns their existing row) rather than re-notifying/
  // re-emailing them. Access is granted the moment this runs — the notification and email
  // below are just two delivery channels for the same link into a session the invitee can
  // already open; there is no separate pending/"accept" state to redeem.
  invite: protectedProcedure
    .input(z.object({ meetingId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireCollaborator(input.meetingId, ctx.user.id);

      const existing = await prisma.sessionCollaborator.findUnique({
        where: { meetingId_userId: { meetingId: input.meetingId, userId: input.userId } },
        include: { user: { select: { name: true, email: true } } },
      });
      if (existing) return { ...toCollaboratorDTO(existing), emailMessageId: null, emailError: null };

      const target = await prisma.user.findUnique({ where: { id: input.userId } });
      if (!target || target.deactivatedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That person can't be invited to this session." });
      }
      const meeting = await prisma.meeting.findUnique({
        where: { id: input.meetingId },
        include: { deck: { select: { slug: true } } },
      });
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      const inviter = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { name: true } });

      const created = await prisma.sessionCollaborator.create({
        data: { meetingId: input.meetingId, userId: input.userId, invitedById: ctx.user.id },
      });

      const link = `${WEB_ORIGIN}/decks/${meeting.deck.slug}/notes?meetingId=${input.meetingId}`;
      const title = "You've been invited to a live Discovery Notes session";
      const clientPart = meeting.clientName ? ` for ${meeting.clientName}` : "";
      const body = `${inviter?.name ?? "A teammate"} invited you to collaborate on a Discovery Notes session${clientPart}.`;

      // Two independent delivery channels, either one a valid path in — the in-app
      // notification is a plain DB write (never expected to fail); a failed email never
      // fails the invite itself (the collaborator row above is already committed real
      // access), matching lib/password-tokens.ts's same never-throw-on-send-failure
      // pattern. Awaited (not fire-and-forget) so the caller — and the live E2E suite — can
      // see a genuine SES messageId proving the send actually happened, the same bar
      // meeting.sendMinutes already holds itself to.
      await prisma.notification.create({ data: { userId: input.userId, title, body, linkUrl: link } });
      let emailMessageId: string | null = null;
      let emailError: string | null = null;
      try {
        const result = await sendEmail({
          to: target.email,
          subject: title,
          text: [`Hi ${target.name},`, "", body, "", "Open the session:", link].join("\n"),
          html: [`<p>Hi ${target.name},</p>`, `<p>${body}</p>`, `<p><a href="${link}">${link}</a></p>`].join("\n"),
        });
        emailMessageId = result.messageId;
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err);
        console.error("collaboration.invite: failed to send invite email:", err);
      }

      return { ...toCollaboratorDTO({ ...created, user: { name: target.name, email: target.email } }), emailMessageId, emailError };
    }),

  // Any collaborator can remove any OTHER collaborator. Removing the current owner directly
  // (rather than via an explicit transferOwnership first) makes whoever performed the
  // removal the new owner, in the same transaction — a session can never end up ownerless.
  removeCollaborator: protectedProcedure
    .input(z.object({ meetingId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: 'Use "Leave session" to remove yourself.' });
      }
      const actor = await requireCollaborator(input.meetingId, ctx.user.id);
      const target = await prisma.sessionCollaborator.findUnique({
        where: { meetingId_userId: { meetingId: input.meetingId, userId: input.userId } },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "That person isn't in this session." });

      if (target.isOwner) {
        // Delete the owner's row BEFORE promoting the actor, not after: the partial unique
        // index enforcing "at most one owner per meeting" is checked per-statement, not
        // deferred to the transaction's end, so promoting the actor first would briefly
        // leave two isOwner: true rows for the same meeting and fail the constraint.
        await prisma.$transaction([
          prisma.sessionCollaborator.delete({ where: { id: target.id } }),
          prisma.sessionCollaborator.update({ where: { id: actor.id }, data: { isOwner: true } }),
        ]);
      } else {
        await prisma.sessionCollaborator.delete({ where: { id: target.id } });
      }
      return { ok: true };
    }),

  // Explicit ownership transfer — only the current owner can call this (they're choosing to
  // hand off, typically so they can then be removed or can themselves leave).
  transferOwnership: protectedProcedure
    .input(z.object({ meetingId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const actor = await requireCollaborator(input.meetingId, ctx.user.id);
      if (!actor.isOwner) throw new TRPCError({ code: "FORBIDDEN", message: "Only the current owner can transfer ownership." });
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You already own this session." });

      const target = await prisma.sessionCollaborator.findUnique({
        where: { meetingId_userId: { meetingId: input.meetingId, userId: input.userId } },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "That person isn't in this session." });

      await prisma.$transaction([
        prisma.sessionCollaborator.update({ where: { id: actor.id }, data: { isOwner: false } }),
        prisma.sessionCollaborator.update({ where: { id: target.id }, data: { isOwner: true } }),
      ]);
      return { ok: true };
    }),

  // Leaving as the owner while others remain hands ownership to whoever has been in the
  // session longest, in the same transaction, before removing the leaver's own row — same
  // "never ownerless" invariant as removeCollaborator. Leaving as the sole collaborator is
  // refused: per the product's own stated default, a lone owner isn't required (or able) to
  // transfer to no one — that's just normal single-user use, not a real "leave" action.
  leave: protectedProcedure.input(z.object({ meetingId: z.string() })).mutation(async ({ input, ctx }) => {
    const actor = await requireCollaborator(input.meetingId, ctx.user.id);

    if (actor.isOwner) {
      const others = await prisma.sessionCollaborator.findMany({
        where: { meetingId: input.meetingId, userId: { not: ctx.user.id } },
        orderBy: { createdAt: "asc" },
      });
      const successor = others[0];
      if (!successor) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You're the only person in this session — there's no one to leave it to." });
      }
      // Same per-statement (not deferred) partial-unique-index ordering constraint as
      // removeCollaborator above: delete the leaving owner's row first, promote second.
      await prisma.$transaction([
        prisma.sessionCollaborator.delete({ where: { id: actor.id } }),
        prisma.sessionCollaborator.update({ where: { id: successor.id }, data: { isOwner: true } }),
      ]);
    } else {
      await prisma.sessionCollaborator.delete({ where: { id: actor.id } });
    }
    return { ok: true };
  }),
});
