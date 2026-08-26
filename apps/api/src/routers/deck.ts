import { prisma } from "@aeon/database";
import type { DeckConfig } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
});
