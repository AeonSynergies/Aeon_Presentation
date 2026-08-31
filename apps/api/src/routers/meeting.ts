import { Prisma, prisma } from "@aeon/database";
import {
  computePricingSummary,
  finalPriceFor,
  fmtMoney,
  initialSessionStateForDeck,
  type DeckConfig,
  type DiscountConfig,
  type MeetingOutcome,
  type SessionState,
} from "@aeon/types";
import { TRPCError } from "@trpc/server";
import PDFDocument from "pdfkit";
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
  meetingOutcome: MeetingOutcome | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// MeetingOutcome (packages/types/src/session.ts) is the prototype's own outcome shape,
// ported verbatim in Phase 1 alongside SessionState — this is the "status, follow-up,
// notes" the prototype tracked when a Discovery Notes session ended, not a new shape
// invented for Phase 5a.
const meetingOutcomeSchema = z.object({
  followUp: z.boolean(),
  followUpDate: z.string(),
  followUpTime: z.string(),
  deckRequested: z.boolean(),
  status: z.string().min(1),
  otherStatus: z.string(),
  additionalNotes: z.string().max(2000).optional(),
});

function toMeetingDTO(m: {
  id: string;
  deckId: string;
  clientName: string | null;
  driverValue: string | null;
  selected: unknown;
  toggles: unknown;
  answers: unknown;
  discount: unknown;
  meetingOutcome: unknown;
  completedAt: Date | null;
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
    meetingOutcome: (m.meetingOutcome as MeetingOutcome | null) ?? null,
    completedAt: m.completedAt,
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
// same reshaping toMeetingDTO does for the client, needed here so export/complete can run
// the identical @aeon/types pricing math the live Present-mode pricing slide uses, rather
// than recomputing anything independently.
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

interface QuoteSnapshotRow {
  service: string;
  team: string;
  driverVal: string;
  base: string;
  surcharge: boolean;
  final: string;
  discounted: boolean;
}

// The quoted-deck data behind every downstream artifact: the live CSV export, a saved
// Meeting Record's frozen pricingSnapshot, its text summary, and its regenerated PDF all
// build from THIS one shape, computed with the exact same @aeon/types pricing engine the
// live Pricing slide uses. Built once here rather than four times independently, so those
// four surfaces can never silently disagree with each other about a given deck+state.
interface QuoteSnapshot {
  companyName: string;
  industry: string;
  clientName: string | null;
  driverLabel: string;
  driverValue: string | null;
  rows: QuoteSnapshotRow[];
  totalLabel: string;
  computedAt: string;
}

function buildQuoteSnapshot(config: DeckConfig, state: SessionState, clientName: string | null): QuoteSnapshot {
  const chosen = config.services.filter((s) => state.selected.includes(s.id));
  const rows: QuoteSnapshotRow[] = chosen.map((svc) => {
    const driverVal = svc.pricingDriverField ? state.answers[svc.pricingDriverField] : state.driverValue;
    const { base, final, discounted } = finalPriceFor(svc, state);
    const surchargeActive = !!(svc.surcharge && state.toggles[svc.surcharge.questionId]);
    return {
      service: svc.name,
      team: svc.team,
      driverVal: driverVal === null || driverVal === undefined ? "" : String(driverVal),
      base: fmtMoney(base),
      surcharge: surchargeActive,
      final: discounted ? `${fmtMoney(final)} (discounted from ${fmtMoney(base)})` : fmtMoney(final),
      discounted,
    };
  });
  const summary = computePricingSummary(config.services, state);
  const totalLabel = fmtMoney(summary.total) + (summary.hasCustom || summary.hasPending ? " +" : "");
  return {
    companyName: config.companyName,
    industry: config.industry,
    clientName,
    driverLabel: config.pricingDriver.label,
    driverValue: state.driverValue === null ? null : String(state.driverValue),
    rows,
    totalLabel,
    computedAt: new Date().toISOString(),
  };
}

function snapshotToCsv(snapshot: QuoteSnapshot, driverLabel: string): string {
  const rows: string[][] = [["Service", "Team", `${driverLabel} / driver`, "Base Price", "Surcharge Applied", "Final Price"]];
  for (const r of snapshot.rows) {
    rows.push([r.service, r.team, r.driverVal, r.base, r.surcharge ? "Yes" : "No", r.final]);
  }
  rows.push([]);
  rows.push(["", "", "", "", "Estimated Total / Month", snapshot.totalLabel]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function snapshotToText(snapshot: QuoteSnapshot): string {
  const lines: string[] = [];
  lines.push(`${snapshot.companyName} — ${snapshot.industry}`);
  lines.push(`Client: ${snapshot.clientName ?? "(not recorded)"}`);
  lines.push(`${snapshot.driverLabel}: ${snapshot.driverValue ?? "(not recorded)"}`);
  lines.push(`Snapshot taken: ${new Date(snapshot.computedAt).toLocaleString("en-US")}`);
  lines.push("");
  for (const r of snapshot.rows) {
    lines.push(`- ${r.service} (${r.team}): ${r.final}${r.surcharge ? " [surcharge applied]" : ""}`);
  }
  lines.push("");
  lines.push(`Estimated Total / Month: ${snapshot.totalLabel}`);
  return lines.join("\n");
}

function safeFilenamePart(v: string): string {
  return v.replace(/[^a-zA-Z0-9-]+/g, "_");
}

function buildQuotePdfBuffer(snapshot: QuoteSnapshot): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(snapshot.companyName, { continued: false });
    doc.fontSize(11).fillColor("#555").text(snapshot.industry);
    doc.moveDown(1);
    doc.fillColor("#000").fontSize(12).text(`Client: ${snapshot.clientName ?? "(not recorded)"}`);
    doc.text(`${snapshot.driverLabel}: ${snapshot.driverValue ?? "(not recorded)"}`);
    doc.fontSize(9).fillColor("#555").text(`Quote snapshot taken ${new Date(snapshot.computedAt).toLocaleString("en-US")}`);
    doc.moveDown(1);

    doc.fillColor("#000").fontSize(13).text("Services", { underline: true });
    doc.moveDown(0.5);
    for (const r of snapshot.rows) {
      doc.fontSize(11).text(`${r.service} — ${r.team}`, { continued: false });
      doc.fontSize(10).fillColor("#333").text(`${r.final}${r.surcharge ? "  (surcharge applied)" : ""}`);
      doc.fillColor("#000");
      doc.moveDown(0.4);
    }

    doc.moveDown(0.5);
    doc.fontSize(14).text(`Estimated Total / Month: ${snapshot.totalLabel}`, { align: "right" });

    doc.end();
  });
}

export const meetingRouter = router({
  create: protectedProcedure
    .input(z.object({ deckId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const deck = await prisma.deck.findUnique({ where: { id: input.deckId } });
      if (!deck) throw new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });
      // Seeded with this deck's real starting state (every service opted in, etc.) up
      // front, rather than bare column defaults (selected: [] and so on) — Present mode's
      // Discovery Notes window (decks.$slug_.notes.tsx) can read this row back the moment
      // it exists, and a row that only ever had defaults briefly, before the client's own
      // debounced save caught up, would be a real race for whoever reads it first.
      const initial = initialSessionStateForDeck(deck.config as unknown as DeckConfig);
      const meeting = await prisma.meeting.create({
        data: {
          deckId: deck.id,
          createdById: ctx.user.id,
          selected: initial.selected,
          toggles: initial.toggles as Prisma.InputJsonValue,
          discount: initial.discount as unknown as Prisma.InputJsonValue,
        },
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
    const snapshot = buildQuoteSnapshot(config, state, meeting.clientName);
    const csv = snapshotToCsv(snapshot, config.pricingDriver.label);
    const clientPart = meeting.clientName ? `-${meeting.clientName}` : "";
    const filename = safeFilenamePart(`${config.companyName}${clientPart}-rate-card`) + ".csv";
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

  // Send to Client's PDF download — same permission and same content scope as sendToClient
  // above (the client-facing deck as CURRENTLY configured), built from the live session state
  // exactly like sendToClient/export already do, never from the frozen pricingSnapshot (that's
  // generateQuotePdf's job, for a saved Meeting Record). Reuses the exact buildQuoteSnapshot/
  // buildQuotePdfBuffer pair Meeting Records already built rather than a second PDF pipeline.
  generateLiveQuotePdf: requirePermission("sendToClient").input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const meeting = await prisma.meeting.findFirst({
      where: { id: input.id, createdById: ctx.user.id },
      include: { deck: true },
    });
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

    const config = meeting.deck.config as unknown as DeckConfig;
    const state = meetingToSessionState(meeting);
    const snapshot = buildQuoteSnapshot(config, state, meeting.clientName);
    const buffer = await buildQuotePdfBuffer(snapshot);
    const clientPart = meeting.clientName ? `-${meeting.clientName}` : "";
    const filename = safeFilenamePart(`${config.companyName}${clientPart}-proposal`) + ".pdf";
    return { filename, base64: buffer.toString("base64") };
  }),

  // Meeting Records (Phase 5a) — saves the current live session as a permanent record:
  // freezes today's pricing into pricingSnapshot and stores the outcome. Gated on
  // "meetingRecords", a permission distinct from discoveryNotes: every role can run a live
  // session, but only Sales Executive/BD Manager/Admin can turn one into a lasting record.
  complete: requirePermission("meetingRecords")
    .input(z.object({ id: z.string(), outcome: meetingOutcomeSchema }))
    .mutation(async ({ input, ctx }) => {
      const meeting = await prisma.meeting.findFirst({
        where: { id: input.id, createdById: ctx.user.id },
        include: { deck: true },
      });
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

      const config = meeting.deck.config as unknown as DeckConfig;
      const state = meetingToSessionState(meeting);
      const snapshot = buildQuoteSnapshot(config, state, meeting.clientName);

      const updated = await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          meetingOutcome: input.outcome,
          pricingSnapshot: snapshot as unknown as object,
          completedAt: new Date(),
        },
      });
      return toMeetingDTO(updated);
    }),

  // Lists only meetings explicitly saved via complete() above (completedAt set) — every
  // deck open creates a Meeting row for live-session sync, but a session someone merely
  // opened and never saved as a record shouldn't clutter this screen. Spans every deck
  // (not a per-deck view), scoped to the caller's own meetings — consistent with get/
  // export/sendToClient above, all of which already scope by createdById.
  listRecords: requirePermission("meetingRecords")
    .input(
      z.object({
        deckId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: Record<string, unknown> = { createdById: ctx.user.id, completedAt: { not: null }, archivedAt: null };
      if (input.deckId) where.deckId = input.deckId;
      if (input.from || input.to) {
        const range: Record<string, Date> = {};
        if (input.from) range.gte = new Date(input.from);
        if (input.to) range.lte = new Date(input.to);
        where.completedAt = { ...(where.completedAt as object), ...range };
      }

      const meetings = await prisma.meeting.findMany({
        where,
        include: { deck: true },
        orderBy: { completedAt: "desc" },
      });

      const search = input.search?.trim().toLowerCase();
      const filtered = search
        ? meetings.filter(
            (m) => (m.clientName ?? "").toLowerCase().includes(search) || m.deck.companyName.toLowerCase().includes(search)
          )
        : meetings;

      return filtered.map((m) => ({
        ...toMeetingDTO(m),
        deckCompanyName: m.deck.companyName,
        deckIndustry: m.deck.industry,
        totalLabel: (m.pricingSnapshot as unknown as QuoteSnapshot | null)?.totalLabel ?? null,
      }));
    }),

  // Plain-text summary of a saved record's frozen pricingSnapshot — never recomputed from
  // the deck's current config, so an Edit Deck change made after this meeting was saved
  // can never alter what this download says was quoted.
  exportRecordText: requirePermission("meetingRecords").input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const meeting = await prisma.meeting.findFirst({ where: { id: input.id, createdById: ctx.user.id } });
    if (!meeting || !meeting.completedAt || !meeting.pricingSnapshot) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Meeting record not found" });
    }
    const snapshot = meeting.pricingSnapshot as unknown as QuoteSnapshot;
    const clientPart = meeting.clientName ? `-${meeting.clientName}` : "";
    const filename = safeFilenamePart(`${snapshot.companyName}${clientPart}-meeting-summary`) + ".txt";
    return { filename, text: snapshotToText(snapshot) };
  }),

  // Regenerates the actual quoted deck as a PDF from a saved record's frozen
  // pricingSnapshot (never the deck's current live config/state) — a base64 string since
  // this API has no superjson/binary transformer wired up; the client decodes it into a
  // Blob for download.
  generateQuotePdf: requirePermission("meetingRecords").input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const meeting = await prisma.meeting.findFirst({ where: { id: input.id, createdById: ctx.user.id } });
    if (!meeting || !meeting.completedAt || !meeting.pricingSnapshot) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Meeting record not found" });
    }
    const snapshot = meeting.pricingSnapshot as unknown as QuoteSnapshot;
    const buffer = await buildQuotePdfBuffer(snapshot);
    const clientPart = meeting.clientName ? `-${meeting.clientName}` : "";
    const filename = safeFilenamePart(`${snapshot.companyName}${clientPart}-quote`) + ".pdf";
    return { filename, base64: buffer.toString("base64") };
  }),

  // Meeting Records' "Delete" — same permission and caller-scoping as listRecords above
  // (a Sales Executive can only archive their own records). Soft-delete only: the row
  // stays intact, just hidden from listRecords, until Archived Files restores or
  // permanently deletes it.
  archive: requirePermission("meetingRecords").input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const meeting = await prisma.meeting.findFirst({ where: { id: input.id, createdById: ctx.user.id } });
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting record not found" });
    await prisma.meeting.update({ where: { id: meeting.id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }),

  // Archived Files (Admin-only, same manageUsers gate as Team Management) — not scoped to
  // the caller's own records, unlike archive above: an Admin manages the whole org's
  // archive, not just their own.
  restore: requirePermission("manageUsers").input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const meeting = await prisma.meeting.findUnique({ where: { id: input.id } });
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting record not found" });
    await prisma.meeting.update({ where: { id: input.id }, data: { archivedAt: null } });
    return { ok: true };
  }),

  // The only place a Meeting row is ever actually destroyed.
  deletePermanent: requirePermission("manageUsers").input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const meeting = await prisma.meeting.findUnique({ where: { id: input.id } });
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting record not found" });
    await prisma.meeting.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
