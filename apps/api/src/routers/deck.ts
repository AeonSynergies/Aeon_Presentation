import { prisma } from "@aeon/database";
import type { DeckConfig } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deckConfigSchema, slugifyCompanyName } from "../lib/deck-config-schema.js";
import { protectedProcedure, router } from "../trpc.js";

export const deckRouter = router({
  list: protectedProcedure.query(async () => {
    const decks = await prisma.deck.findMany({
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

  getBySlug: protectedProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const deck = await prisma.deck.findUnique({ where: { slug: input.slug } });
    if (!deck) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });
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
  create: protectedProcedure.input(z.object({ config: z.unknown() })).mutation(async ({ input }) => {
    const parsed = deckConfigSchema.safeParse(input.config);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((iss) => (iss.path.length ? `${iss.path.join(".")}: ${iss.message}` : iss.message))
        .join("; ");
      throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid deck config — ${details}` });
    }
    const config = parsed.data;

    // Slug (and config.id, kept equal to it like every seeded deck) comes from the
    // company name, uniquified with a numeric suffix on collision. "new" is reserved:
    // the web app's /decks/new route (the Deck Builder itself) would shadow a deck at
    // that slug.
    const RESERVED_SLUGS = new Set(["new"]);
    const base = slugifyCompanyName(config.companyName);
    let slug = base;
    for (let n = 2; RESERVED_SLUGS.has(slug) || (await prisma.deck.findUnique({ where: { slug } })); n++) {
      if (n > 50) throw new TRPCError({ code: "CONFLICT", message: "Could not find a free slug for this deck name" });
      slug = `${base}-${n}`;
    }
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
});
