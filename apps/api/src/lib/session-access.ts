import { prisma } from "@aeon/database";
import { TRPCError } from "@trpc/server";

// A live Discovery Notes session's Meeting row is only readable/writable by its current
// collaborators (see SessionCollaborator in schema.prisma) — the row's own createdById is
// kept purely as historical/audit metadata from here on and is never re-checked for
// access, so ownership of a session can genuinely move on from whoever first created it.
// meeting.create seeds the creator's own collaborator row (isOwner: true) in the same
// transaction that creates the Meeting, so this is always the single source of truth for
// access from the very first person onward — there is no separate "no collaborators yet"
// state to special-case here.
export function meetingAccessWhere(meetingId: string, userId: string) {
  return { id: meetingId, collaborators: { some: { userId } } };
}

export async function requireCollaborator(meetingId: string, userId: string) {
  const row = await prisma.sessionCollaborator.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "You don't have access to this session." });
  return row;
}
