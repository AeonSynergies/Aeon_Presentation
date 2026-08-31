import { prisma } from "@aeon/database";
import { requirePermission, router } from "../trpc.js";

// Archived Files (Admin-only, same manageUsers gate as Team Management) — the read side
// of the archive system. Restore/permanent-delete live on deck.ts/meeting.ts alongside the
// rest of each model's mutations; this router only aggregates what's currently archived,
// across every user, not just the caller's own decks/meetings the way most other queries
// in this app are scoped.
export const archiveRouter = router({
  listDecks: requirePermission("manageUsers").query(async () => {
    const decks = await prisma.deck.findMany({
      where: { archivedAt: { not: null } },
      select: { id: true, slug: true, companyName: true, industry: true, archivedAt: true },
      orderBy: { archivedAt: "desc" },
    });
    return decks;
  }),

  listMeetings: requirePermission("manageUsers").query(async () => {
    const meetings = await prisma.meeting.findMany({
      where: { archivedAt: { not: null }, completedAt: { not: null } },
      include: { deck: true, createdBy: true },
      orderBy: { archivedAt: "desc" },
    });
    return meetings.map((m) => ({
      id: m.id,
      clientName: m.clientName,
      deckCompanyName: m.deck.companyName,
      createdByName: m.createdBy.name,
      completedAt: m.completedAt,
      archivedAt: m.archivedAt,
    }));
  }),
});
