import { prisma } from "@aeon/database";
import type { DiscountConfig } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

// Prisma's Json columns type as the recursive `JsonValue` union. Left as-is, that
// recursive type combined with react-query/zod's own generics blows up TS's type
// instantiation depth on the client (TS2589). Re-shaping into concrete fields here keeps
// the wire contract explicit and keeps the client-side inference shallow.
interface MeetingDTO {
  id: string;
  deckId: string;
  clientName: string | null;
  driverValue: string | null;
  selected: string[];
  toggles: Record<string, boolean>;
  answers: Record<string, string | number | boolean | null>;
  discount: DiscountConfig;
  createdAt: Date;
  updatedAt: Date;
}

function toMeetingDTO(m: {
  id: string;
  deckId: string;
  clientName: string | null;
  driverValue: string | null;
  selected: unknown;
  toggles: unknown;
  answers: unknown;
  discount: unknown;
  createdAt: Date;
  updatedAt: Date;
}): MeetingDTO {
  return {
    id: m.id,
    deckId: m.deckId,
    clientName: m.clientName,
    driverValue: m.driverValue,
    selected: m.selected as string[],
    toggles: m.toggles as Record<string, boolean>,
    answers: m.answers as Record<string, string | number | boolean | null>,
    discount: m.discount as DiscountConfig,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

const discountSchema = z.object({
  enabled: z.boolean(),
  scope: z.enum(["all", "multiple", "single"]),
  services: z.array(z.string()),
  type: z.enum(["percent", "flat"]),
  value: z.number(),
});

const stateInput = z.object({
  driverValue: z.union([z.string(), z.number(), z.null()]).optional(),
  selected: z.array(z.string()).optional(),
  toggles: z.record(z.string(), z.boolean()).optional(),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable()).optional(),
  discount: discountSchema.optional(),
  clientName: z.string().nullable().optional(),
});

export const meetingRouter = router({
  create: protectedProcedure
    .input(z.object({ deckId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const deck = await prisma.deck.findUnique({ where: { id: input.deckId } });
      if (!deck) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });
      const meeting = await prisma.meeting.create({
        data: { deckId: deck.id, createdById: ctx.user.id },
      });
      return toMeetingDTO(meeting);
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const meeting = await prisma.meeting.findFirst({
      where: { id: input.id, createdById: ctx.user.id },
    });
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
    return toMeetingDTO(meeting);
  }),

  updateState: protectedProcedure
    .input(z.object({ id: z.string(), patch: stateInput }))
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.meeting.findFirst({
        where: { id: input.id, createdById: ctx.user.id },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

      const data: Record<string, unknown> = {};
      if (input.patch.driverValue !== undefined) data.driverValue = String(input.patch.driverValue ?? "");
      if (input.patch.selected !== undefined) data.selected = input.patch.selected;
      if (input.patch.toggles !== undefined) data.toggles = input.patch.toggles;
      if (input.patch.answers !== undefined) data.answers = input.patch.answers;
      if (input.patch.discount !== undefined) data.discount = input.patch.discount;
      if (input.patch.clientName !== undefined) data.clientName = input.patch.clientName;

      const meeting = await prisma.meeting.update({ where: { id: existing.id }, data });
      return toMeetingDTO(meeting);
    }),
});
