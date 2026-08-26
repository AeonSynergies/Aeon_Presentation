import { prisma } from "@aeon/database";
import { computePricingSummary, finalPriceFor, fmtMoney, type DeckConfig, type DiscountConfig, type SessionState } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requirePermission, router } from "../trpc.js";

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

// Rebuilds the pricing engine's SessionState shape from a persisted Meeting row — the
// same reshaping toMeetingDTO does for the client, needed here so export/sendToClient
// can run the identical @aeon/types pricing math the live Present-mode pricing slide
// uses, rather than recomputing anything independently.
function meetingToSessionState(m: {
  driverValue: string | null;
  selected: unknown;
  toggles: unknown;
  answers: unknown;
  discount: unknown;
}): SessionState {
  return {
    driverValue: m.driverValue,
    selected: m.selected as string[],
    toggles: m.toggles as Record<string, boolean>,
    answers: m.answers as SessionState["answers"],
    discount: m.discount as DiscountConfig,
  };
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

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

  // Export — Sales Executive and Operations Manager don't have this permission (the
  // requirePermission("export") gate below is the actual enforcement; nothing about this
  // being a query vs. mutation changes that). Returns a CSV rate card for the meeting's
  // currently-selected services, computed with the same pricing engine the live Pricing
  // slide uses. A query, not a mutation, since it only reads/derives — it changes nothing.
  export: requirePermission("export").input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const meeting = await prisma.meeting.findFirst({
      where: { id: input.id, createdById: ctx.user.id },
      include: { deck: true },
    });
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

    const config = meeting.deck.config as unknown as DeckConfig;
    const state = meetingToSessionState(meeting);
    const chosen = config.services.filter((s) => state.selected.includes(s.id));

    const rows: string[][] = [["Service", "Team", `${config.pricingDriver.label} / driver`, "Base Price", "Surcharge Applied", "Final Price"]];
    for (const svc of chosen) {
      const driverVal = svc.pricingDriverField ? state.answers[svc.pricingDriverField] : state.driverValue;
      const { base, final, discounted } = finalPriceFor(svc, state);
      const surchargeActive = !!(svc.surcharge && state.toggles[svc.surcharge.questionId]);
      rows.push([
        svc.name,
        svc.team,
        driverVal === null || driverVal === undefined ? "" : String(driverVal),
        fmtMoney(base),
        surchargeActive ? "Yes" : "No",
        discounted ? `${fmtMoney(final)} (discounted from ${fmtMoney(base)})` : fmtMoney(final),
      ]);
    }
    const summary = computePricingSummary(config.services, state);
    rows.push([]);
    rows.push(["", "", "", "", "Estimated Total / Month", fmtMoney(summary.total) + (summary.hasCustom || summary.hasPending ? " +" : "")]);

    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const clientPart = meeting.clientName ? `-${meeting.clientName}` : "";
    const filename = `${config.companyName}${clientPart}-rate-card`.replace(/[^a-zA-Z0-9-]+/g, "_") + ".csv";
    return { filename, csv };
  }),

  // Send to Client — Operations Manager doesn't have this permission. Mirrors the
  // prototype's actual mechanism: composes a subject/body from real pricing data and
  // hands back a mailto: URL for the browser to open, addressed to the client email the
  // caller supplies (the account sending it, not the app, delivers the message — there's
  // no SMTP/email-sending infrastructure configured for this phase).
  sendToClient: requirePermission("sendToClient")
    .input(z.object({ id: z.string(), clientEmail: z.email(), subject: z.string().optional(), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const meeting = await prisma.meeting.findFirst({
        where: { id: input.id, createdById: ctx.user.id },
        include: { deck: true },
      });
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

      const config = meeting.deck.config as unknown as DeckConfig;
      const state = meetingToSessionState(meeting);
      const summary = computePricingSummary(config.services, state);
      const clientLabel = meeting.clientName || "your organization";

      const subject = input.subject?.trim() || `${config.companyName} Proposal — ${clientLabel}`;
      const totalLine = `Estimated monthly investment: ${fmtMoney(summary.total)}${summary.hasCustom || summary.hasPending ? "+" : ""}`;
      const body =
        (input.note?.trim() ? input.note.trim() + "\n\n" : "") +
        `Please find our proposal for ${clientLabel} below.\n\n${totalLine}\n\nLooking forward to working together.`;

      const mailto = `mailto:${encodeURIComponent(input.clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return { mailto, subject, body };
    }),
});
