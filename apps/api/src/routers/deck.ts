import { prisma } from "@aeon/database";
import type { DeckConfig } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deckConfigSchema, slugifyCompanyName } from "../lib/deck-config-schema.js";
import { protectedProcedure, requirePermission, router } from "../trpc.js";

// Shared by create (new slug from scratch) and duplicate (new slug from a copied deck's
// new name) — "new" stays reserved either way since /decks/new is the Deck Builder route.
const RESERVED_SLUGS = new Set(["new"]);
async function findFreeSlug(companyName: string): Promise<string> {
  const base = slugifyCompanyName(companyName);
  let slug = base;
  for (let n = 2; RESERVED_SLUGS.has(slug) || (await prisma.deck.findUnique({ where: { slug } })); n++) {
    if (n > 50) throw new TRPCError({ code: "CONFLICT", message: "Could not find a free slug for this deck name" });
    slug = `${base}-${n}`;
  }
  return slug;
}

export const deckRouter = router({
  // Archived decks (Home's "Remove") are excluded here — Archived Files (Admin-only) is
  // the only other place they're still visible, via archive.listDecks below.
  list: protectedProcedure.query(async () => {
    const decks = await prisma.deck.findMany({
      where: { archivedAt: null },
      select: { id: true, slug: true, companyName: true, industry: true, config: true },
      orderBy: { createdAt: "asc" },
    });
    return decks.map(
      (d: { id: string; slug: string; companyName: string; industry: string; config: unknown }) => {
        const config = d.config as unknown as DeckConfig;
        return {
          id: d.id,
          slug: d.slug,
          companyName: d.companyName,
          industry: d.industry,
          tagline: config.tagline,
          // Home shows every deck's card at once, so each needs its own accent colors
          // here rather than the global --amber/--teal CSS vars (which only reflect
          // whichever deck was last opened, or the platform default).
          colors: { amber: config.colors.amber, teal: config.colors.teal },
        };
      },
    );
  }),

  // Archived decks 404 here too, same as list — a "removed" deck can't still be opened,
  // presented, or edited by URL just because someone has it bookmarked. Existing Meeting
  // Records referencing it are unaffected: those read the deck's name/industry through
  // their own Meeting.deck relation, never through this procedure.
  getBySlug: protectedProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const deck = await prisma.deck.findUnique({ where: { slug: input.slug } });
    if (!deck || deck.archivedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });
    // dbId is the Prisma row id (needed to create a Meeting FK) — distinct from
    // DeckConfig.id, which is the prototype's own slug-like identifier.
    return { dbId: deck.id, config: deck.config as unknown as DeckConfig };
  }),

  // First deck-creation path that isn't the seed script (Deck Builder wizard).
  // Input is z.unknown() and parsed inside the handler on purpose: inferring the full
  // DeckConfig schema through tRPC + react-query generics is the same recursive-type
  // trap that hit TS2589 with Prisma's JsonValue — runtime validation is identical,
  // and the failure mode of a stale/hand-crafted client is a clean BAD_REQUEST with
  // zod's issue list instead of a silently-mistyped deck in the database.
  // Server-side enforcement, independent of the frontend: requirePermission runs before
  // the handler, so a direct call from a role without "createDeck" (Operations Manager)
  // never reaches parsing/DB work at all — it gets a clean FORBIDDEN.
  create: requirePermission("createDeck").input(z.object({ config: z.unknown() })).mutation(async ({ input }) => {
    const parsed = deckConfigSchema.safeParse(input.config);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((iss) => (iss.path.length ? `${iss.path.join(".")}: ${iss.message}` : iss.message))
        .join("; ");
      throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid deck config — ${details}` });
    }
    const config = parsed.data;

    // Slug (and config.id, kept equal to it like every seeded deck) comes from the
    // company name, uniquified with a numeric suffix on collision.
    const slug = await findFreeSlug(config.companyName);
    config.id = slug;

    const deck = await prisma.deck.create({
      data: {
        slug,
        companyName: config.companyName,
        industry: config.industry,
        config: config as object,
      },
    });
    return { slug: deck.slug, dbId: deck.id };
  }),

  // Edit Deck: same validation as create, but against an existing row and keeping its
  // slug/id fixed — editing a deck must not change its URL out from under anyone who has
  // it open or bookmarked.
  update: requirePermission("editDeck")
    .input(z.object({ slug: z.string(), config: z.unknown() }))
    .mutation(async ({ input }) => {
      const existing = await prisma.deck.findUnique({ where: { slug: input.slug } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });

      const parsed = deckConfigSchema.safeParse(input.config);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((iss) => (iss.path.length ? `${iss.path.join(".")}: ${iss.message}` : iss.message))
          .join("; ");
        throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid deck config — ${details}` });
      }
      const config = parsed.data;
      config.id = existing.slug;

      const deck = await prisma.deck.update({
        where: { id: existing.id },
        data: { companyName: config.companyName, industry: config.industry, config: config as object },
      });
      return { slug: deck.slug, dbId: deck.id };
    }),

  // Distinct from the live-deck-cloning deliberately removed from Create Deck's start
  // screen in Phase 5c: that was about not using a real client's deck as a starting point
  // for a different client's proposal. This is a user copying their OWN deck for a
  // legitimate variant — same permission as create (a duplicate is a new deck), and the
  // result is immediately, independently editable — pricing/team/content changes here
  // never touch the source deck.
  duplicate: requirePermission("createDeck")
    .input(z.object({ slug: z.string(), newName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const source = await prisma.deck.findUnique({ where: { slug: input.slug } });
      if (!source || source.archivedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });

      const config = { ...(source.config as unknown as DeckConfig) };
      const slug = await findFreeSlug(input.newName);
      config.id = slug;
      config.companyName = input.newName;

      const deck = await prisma.deck.create({
        data: { slug, companyName: input.newName, industry: source.industry, config: config as object },
      });
      return { slug: deck.slug, dbId: deck.id };
    }),

  // Home's "Remove" — same permission Edit Deck already has (Sales Executive, BD Manager,
  // Admin). Soft-delete only: the row (and its Meeting history) stays intact, just hidden
  // from list/getBySlug above, until Archived Files restores or permanently deletes it.
  archive: requirePermission("editDeck").input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const deck = await prisma.deck.findUnique({ where: { id: input.id } });
    if (!deck) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });
    await prisma.deck.update({ where: { id: input.id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }),

  // Archived Files (Admin-only, same manageUsers gate as Team Management) — restore and
  // permanent-delete are not scoped to any particular user's decks, unlike archive above:
  // an Admin manages the whole org's archive, not just their own actions.
  restore: requirePermission("manageUsers").input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const deck = await prisma.deck.findUnique({ where: { id: input.id } });
    if (!deck) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });
    await prisma.deck.update({ where: { id: input.id }, data: { archivedAt: null } });
    return { ok: true };
  }),

  // The only place a Deck row is ever actually destroyed — cascades to every Meeting
  // referencing it (Meeting.deck has onDelete: Cascade), archived or not. That's the
  // correct, expected behavior for a genuine permanent delete, not a bug to guard against.
  deletePermanent: requirePermission("manageUsers").input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const deck = await prisma.deck.findUnique({ where: { id: input.id } });
    if (!deck) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });
    await prisma.deck.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
