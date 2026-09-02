import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, prisma } from "@aeon/database";
import {
  computePricingSummary,
  finalPriceFor,
  fmtMoney,
  groupQuestionsByService,
  initialSessionStateForDeck,
  visibleGeneralQuestions,
  visibleServiceQuestions,
  type DeckConfig,
  type DiscountConfig,
  type DiscoveryQuestion,
  type LogoConfig,
  type MeetingOutcome,
  type SessionState,
} from "@aeon/types";
import { Resvg } from "@resvg/resvg-js";
import { TRPCError } from "@trpc/server";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { sendEmailWithAttachment } from "../lib/email.js";
import { protectedProcedure, requirePermission, router } from "../trpc.js";

// Prisma's Json columns type as the recursive `JsonValue` union. Left as-is, that
// recursive type combined with react-query/zod's own generics blows up TS's type
// instantiation depth on the client (TS2589). Re-shaping into concrete fields here keeps
// the wire contract explicit and keeps the client-side inference shallow.
interface MeetingDTO {
  id: string;
  deckId: string;
  clientName: string | null;
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
  selected: unknown;
  toggles: unknown;
  answers: unknown;
  discount: unknown;
}): SessionState {
  return {
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
  selected: z.array(z.string()).optional(),
  toggles: z.record(z.string(), z.boolean()).optional(),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable()).optional(),
  discount: discountSchema.optional(),
  clientName: z.string().nullable().optional(),
});

interface QuoteSnapshotRow {
  service: string;
  team: string;
  driverLabel: string;
  driverVal: string;
  base: string;
  surcharge: boolean;
  final: string;
  discounted: boolean;
  handle: string[];
  promoNote: string | null;
}

// The quoted-deck data behind every downstream artifact: the live CSV export, a saved
// Meeting Record's frozen pricingSnapshot, its text summary, and its regenerated PDF all
// build from THIS one shape, computed with the exact same @aeon/types pricing engine the
// live Pricing slide uses. Built once here rather than four times independently, so those
// four surfaces can never silently disagree with each other about a given deck+state.
//
// logo/watermarkSrc are frozen from the deck's config here (not read live at PDF-render
// time) purely so generateQuotePdf's regeneration can stay self-sufficient from the frozen
// JSON blob alone, matching how it already avoids re-joining the deck for pricing fidelity
// — unlike the deck's own qa contact info, these are just small, rarely-changing config
// references (a URL string), never a reason to bloat this JSON with actual image bytes.
interface QuoteSnapshot {
  companyName: string;
  industry: string;
  clientName: string | null;
  rows: QuoteSnapshotRow[];
  totalLabel: string;
  computedAt: string;
  logo: LogoConfig | null;
  watermarkSrc: string | null;
}

function buildQuoteSnapshot(config: DeckConfig, state: SessionState, clientName: string | null): QuoteSnapshot {
  const chosen = config.services.filter((s) => state.selected.includes(s.id));
  const rows: QuoteSnapshotRow[] = chosen.map((svc) => {
    const model = config.pricingModels.find((m) => m.id === svc.pricingModelId);
    const driverVal = state.answers[svc.pricingModelId];
    const { base, final, discounted } = finalPriceFor(svc, state);
    const surchargeActive = !!(svc.surcharge && state.toggles[svc.surcharge.questionId]);
    return {
      service: svc.name,
      team: svc.team,
      driverLabel: model?.label ?? "",
      driverVal: driverVal === null || driverVal === undefined ? "" : String(driverVal),
      base: fmtMoney(base),
      surcharge: surchargeActive,
      final: discounted ? `${fmtMoney(final)} (discounted from ${fmtMoney(base)})` : fmtMoney(final),
      discounted,
      handle: svc.handle,
      promoNote: svc.promoNote ?? null,
    };
  });
  const summary = computePricingSummary(config.services, state);
  const totalLabel = fmtMoney(summary.total) + (summary.hasCustom || summary.hasPending ? " +" : "");
  return {
    companyName: config.companyName,
    industry: config.industry,
    clientName,
    rows,
    totalLabel,
    computedAt: new Date().toISOString(),
    logo: config.logo ?? null,
    watermarkSrc: config.watermark?.type === "image" ? config.watermark.src : null,
  };
}

function snapshotToCsv(snapshot: QuoteSnapshot): string {
  const rows: string[][] = [["Service", "Team", "Pricing Driver", "Driver Value", "Base Price", "Surcharge Applied", "Final Price"]];
  for (const r of snapshot.rows) {
    rows.push([r.service, r.team, r.driverLabel, r.driverVal, r.base, r.surcharge ? "Yes" : "No", r.final]);
  }
  rows.push([]);
  rows.push(["", "", "", "", "Estimated Total / Month", snapshot.totalLabel]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function safeFilenamePart(v: string): string {
  return v.replace(/[^a-zA-Z0-9-]+/g, "_");
}

// "{Meeting ID}_{Org Name}" naming convention for Meeting Records' Word/PDF exports —
// meeting.id (a cuid) is the only stable identifier a saved record has; there's no more
// presentable one. "Org Name" is the client/org captured on the record (clientName), the
// same field every other export already keys off, falling back to the deck's own company
// name for a record no client name was ever entered on.
function meetingExportFilename(meetingId: string, clientName: string | null, companyName: string, ext: string): string {
  const org = clientName?.trim() || companyName;
  return safeFilenamePart(`${meetingId}_${org}`) + "." + ext;
}

interface DiscoverySnapshotQA {
  id: string;
  label: string;
  answerText: string;
}

interface DiscoverySnapshotGroup {
  serviceId: string | null;
  serviceName: string | null;
  questions: DiscoverySnapshotQA[];
}

// The frozen Discovery Notes content behind a saved Meeting Record's Word export — same
// principle as QuoteSnapshot above: computed once at meeting.complete() time from that
// moment's visible questions/answers, so it can never drift from a live session's later
// edits or a since-changed deck's discovery questions.
interface DiscoverySnapshot {
  companyName: string;
  clientName: string | null;
  general: DiscoverySnapshotQA[];
  serviceGroups: DiscoverySnapshotGroup[];
  computedAt: string;
}

function formatAnswerText(q: DiscoveryQuestion, state: SessionState): string {
  if (q.type === "toggle") {
    const value = !!state.toggles[q.id];
    return q.options?.[value ? 1 : 0] ?? (value ? "Yes" : "No");
  }
  const raw = state.answers[q.id];
  return raw === undefined || raw === null || raw === "" ? "(not answered)" : String(raw);
}

function buildDiscoverySnapshot(config: DeckConfig, state: SessionState, clientName: string | null): DiscoverySnapshot {
  const questions = config.discoveryQuestions;
  const general = visibleGeneralQuestions(questions, state).map((q) => ({ id: q.id, label: q.label, answerText: formatAnswerText(q, state) }));
  const serviceGroups = groupQuestionsByService(visibleServiceQuestions(questions, state)).map((g) => ({
    serviceId: g.serviceId,
    serviceName: g.serviceId ? (config.services.find((s) => s.id === g.serviceId)?.name ?? g.serviceId) : null,
    questions: g.questions.map((q) => ({ id: q.id, label: q.label, answerText: formatAnswerText(q, state) })),
  }));
  return {
    companyName: config.companyName,
    clientName,
    general,
    serviceGroups,
    computedAt: new Date().toISOString(),
  };
}

function buildDiscoveryDocxBuffer(snapshot: DiscoverySnapshot): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: snapshot.companyName, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Client: ${snapshot.clientName ?? "(not recorded)"}` }),
    new Paragraph({ text: `Discovery notes captured ${new Date(snapshot.computedAt).toLocaleString("en-US")}`, spacing: { after: 200 } }),
    new Paragraph({ text: "General Questions", heading: HeadingLevel.HEADING_1 }),
  ];

  const addQA = (qa: DiscoverySnapshotQA) => {
    children.push(new Paragraph({ children: [new TextRun({ text: qa.label, bold: true })] }));
    children.push(new Paragraph({ text: qa.answerText, spacing: { after: 160 } }));
  };

  if (snapshot.general.length === 0) children.push(new Paragraph({ text: "(none)" }));
  snapshot.general.forEach(addQA);

  for (const group of snapshot.serviceGroups) {
    children.push(new Paragraph({ text: group.serviceName ?? "General", heading: HeadingLevel.HEADING_1 }));
    group.questions.forEach(addQA);
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// Aeon's own brand palette — the exact values apps/web/src/styles/app.css sets on :root
// (what the login page, Home page, and every deck's own default colors already render
// with; PLATFORM_DEFAULT_COLORS in @aeon/types mirrors the same two), reused verbatim
// rather than approximated from a reference image so a generated PDF's branding actually
// matches what's live.
const BRAND_TEAL = "#0C7B82";
const BRAND_AMBER = "#16A6CE";
const BRAND_INK = "#15282D";

// Aeon's own real contact identity for a generated proposal's letterhead footer —
// hardcoded rather than read from a deck's staticContent.qa. That field is the deck's own
// in-presentation Q&A slide content (about the service being pitched, e.g.
// "info@amazondsp.com"), not "who sent this document" — conflating the two was the bug.
const AEON_CONTACT = {
  name: "Aeon Synergies LLC",
  email: "info@aeonsynergies.com",
  website: "https://www.aeonsynergies.com/",
  phone: "+1 (302) 498-9899",
  address: "800 N King St, Suite 304 #3725, Wilmington, DE 19801",
  tagline: "Aeon Miles — expert solutions for Amazon DSPs / AFPs and FedEx ISPs",
} as const;

// Brand image assets (the deck's own logo/watermark, e.g. "/brand/aeon-synergies-light-bg.svg")
// are served as static files by apps/web — but PDF generation runs in this separate
// service, so a copy lives here too rather than fetching them over the network on every
// PDF (this is a handful of small, effectively-static files, not live business data).
const BRAND_ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../assets/brand");

function brandAssetPath(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/brand/")) return null;
  const resolved = path.join(BRAND_ASSETS_DIR, url.slice("/brand/".length));
  return resolved.startsWith(BRAND_ASSETS_DIR) ? resolved : null; // guard against path traversal
}

// SVG isn't a format pdfkit can embed directly, so a real SVG logo is rasterized to PNG
// first; a plain raster asset (the watermark, always a PNG today) is returned as-is.
function loadRasterImage(url: string | null | undefined): Buffer | null {
  const filePath = brandAssetPath(url);
  if (!filePath) return null;
  try {
    const raw = readFileSync(filePath);
    if (filePath.endsWith(".svg")) return new Resvg(raw, { fitTo: { mode: "width", value: 800 } }).render().asPng();
    return raw;
  } catch {
    return null;
  }
}

// The deck's own logo, on a light PDF background — always the "light-bg" variant
// regardless of the deck's own cover-slide theme (isLightBg elsewhere picks per the DECK's
// background; this document's background is always white). A "text"-type logo (no image
// asset configured) falls back to a wordmark drawn to match, in buildQuotePdfBuffer below.
function loadLogoImage(logo: LogoConfig | null): Buffer | null {
  if (!logo) return null;
  if (logo.type === "imagePair") return loadRasterImage(logo.srcLight);
  if (logo.type === "image") return loadRasterImage(logo.src);
  return null;
}

// Draws one row of the pricing table at fixed column x-positions rather than relying on
// pdfkit's normal single-column text flow — the only way to lay out service/price/note
// side by side. Computes the row's height from the tallest cell first (a wrapped note can
// need more than one line) so cells never overlap the next row, and forces a page break
// before drawing if the row wouldn't fit, since explicit x/y positioning bypasses pdfkit's
// own automatic pagination.
function drawPricingTableRow(
  doc: PDFKit.PDFDocument,
  cols: { serviceX: number; serviceW: number; priceX: number; priceW: number; noteX: number; noteW: number },
  cells: { service: string; price: string; note: string },
  opts: { bold?: boolean } = {}
): void {
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(opts.bold ? BRAND_INK : "#333");
  const rowHeight =
    Math.max(
      doc.heightOfString(cells.service, { width: cols.serviceW }),
      doc.heightOfString(cells.price, { width: cols.priceW }),
      doc.heightOfString(cells.note, { width: cols.noteW })
    ) + 8;
  if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const y = doc.y;
  doc.text(cells.service, cols.serviceX, y, { width: cols.serviceW });
  doc.text(cells.price, cols.priceX, y, { width: cols.priceW });
  doc.text(cells.note, cols.noteX, y, { width: cols.noteW });
  doc.y = y + rowHeight;
  doc.x = doc.page.margins.left; // explicit-position .text() above leaves doc.x at noteX — without
  // resetting it here, every normal-flow .text() call after the table (the total, the closing
  // line, the footer) inherits that narrow leftover width and wraps as if squeezed into the
  // note column, which is exactly the wrapping this PDF used to render silently wrong.
}

// A real proposal document, not an itemized price list: a client-facing opening headed by
// the deck's own real logo and the actual client's name, each selected service explained
// in the deck's own words (its "what we handle" bullets — no copy invented here), a
// pricing breakdown table with promo notes called out where the deck carries one, a
// generic closing line, a subtle brand watermark, and an Aeon-letterhead-style footer with
// Aeon's own real contact details (never the deck's). Shared by Send to Client (fed a
// live-session snapshot) and Meeting Records' PDF re-download (fed the frozen snapshot
// from when the record was completed) — this function only shapes what the PDF says, never
// which snapshot it's handed.
function buildQuotePdfBuffer(snapshot: QuoteSnapshot): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Subtle background watermark on every page — drawn first (bottom of the z-order) and
    // re-drawn on each later page via pdfkit's own pageAdded event, since the first page
    // never fires that event itself.
    const watermarkBuffer = loadRasterImage(snapshot.watermarkSrc);
    const drawWatermark = () => {
      if (!watermarkBuffer) return;
      const savedY = doc.y;
      const size = 320;
      doc.save();
      doc.opacity(0.06);
      doc.image(watermarkBuffer, (doc.page.width - size) / 2, (doc.page.height - size) / 2, { width: size });
      doc.opacity(1);
      doc.restore();
      doc.y = savedY;
    };
    drawWatermark();
    doc.on("pageAdded", drawWatermark);

    // Header — the deck's real logo (rasterized from its own SVG asset), or a text
    // wordmark fallback matching the login page's own "Aeon" treatment when a deck has no
    // image logo configured, then a brand-teal rule.
    const logoBuffer = loadLogoImage(snapshot.logo);
    if (logoBuffer) {
      doc.image(logoBuffer, doc.page.margins.left, doc.y, { width: 150 });
      doc.y = Math.max(doc.y, doc.page.margins.top + 55);
    } else {
      const dotY = doc.y + 8;
      doc.save().fillColor(BRAND_AMBER).circle(doc.page.margins.left + 4, dotY, 4).fill().restore();
      doc.font("Helvetica-Bold").fontSize(16).fillColor(BRAND_INK).text("Aeon", doc.page.margins.left + 16, doc.y);
      doc.y = doc.page.margins.top + 30;
    }
    doc.x = doc.page.margins.left;
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor(BRAND_TEAL)
      .lineWidth(2)
      .stroke();
    doc.moveDown(1);

    // Opening — the actual client captured on this meeting, never the deck's own
    // companyName (that's the specific brand/program being presented, e.g. "Amazon DSP";
    // this is who the document is FOR), falling back to the same generic framing as before
    // when no client name was captured.
    doc.x = doc.page.margins.left;
    doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND_INK).text(`Proposal for ${snapshot.clientName ?? "Your Organization"}`);
    doc.font("Helvetica").fontSize(11).fillColor("#555").text(snapshot.industry);
    doc.fontSize(9).fillColor("#777").text(`Prepared ${new Date(snapshot.computedAt).toLocaleDateString("en-US")}`);
    doc.moveDown(0.6);
    doc
      .fontSize(11)
      .fillColor("#333")
      .text("Thank you for the opportunity to share this proposal. Below is an overview of the services we recommend for your operation, followed by a full pricing breakdown.");
    doc.moveDown(1);

    const drawSectionHeading = (title: string) => {
      doc.x = doc.page.margins.left;
      doc.font("Helvetica-Bold").fontSize(14).fillColor(BRAND_TEAL).text(title);
      doc.moveTo(doc.page.margins.left, doc.y + 2).lineTo(doc.page.margins.left + 60, doc.y + 2).strokeColor(BRAND_AMBER).lineWidth(2).stroke();
      doc.moveDown(0.6);
    };

    // Per-service sections — heading + the deck's own "what we handle" bullets, reused
    // verbatim rather than summarized, so this never drifts from what the live deck shows.
    drawSectionHeading("Services");
    for (const r of snapshot.rows) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND_INK).text(r.service);
      doc.font("Helvetica").fontSize(9).fillColor("#777").text(r.team);
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#333");
      for (const bullet of r.handle) {
        doc.text(`•  ${bullet}`, { indent: 10 });
      }
      doc.moveDown(0.7);
    }

    // Pricing breakdown table
    if (doc.y > doc.page.height - doc.page.margins.bottom - 150) doc.addPage();
    drawSectionHeading("Pricing");

    const gutter = 12;
    const serviceW = Math.round(contentWidth * 0.42);
    const priceW = Math.round(contentWidth * 0.2);
    const noteW = contentWidth - serviceW - priceW - gutter * 2;
    const cols = {
      serviceX: doc.page.margins.left,
      serviceW,
      priceX: doc.page.margins.left + serviceW + gutter,
      priceW,
      noteX: doc.page.margins.left + serviceW + priceW + gutter * 2,
      noteW,
    };

    drawPricingTableRow(doc, cols, { service: "Service", price: "Price / Month", note: "Note" }, { bold: true });
    doc.moveDown(0.3);
    for (const r of snapshot.rows) {
      drawPricingTableRow(doc, cols, {
        service: r.service,
        price: r.final + (r.surcharge ? " (surcharge applied)" : ""),
        note: r.promoNote ?? "",
      });
    }

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(BRAND_INK).text(`Estimated Total / Month: ${snapshot.totalLabel}`, { align: "right" });
    doc.moveDown(1.2);

    // Closing — deliberately generic, not personalized per client.
    doc.x = doc.page.margins.left;
    doc.font("Helvetica").fontSize(11).fillColor("#333").text("Let us know if you have any questions.");
    doc.moveDown(1.5);

    // Aeon-letterhead-style footer — Aeon's own real, hardcoded contact details (never the
    // deck's staticContent.qa, which is about the service being pitched, not the sender).
    doc.x = doc.page.margins.left;
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor(BRAND_TEAL)
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND_TEAL).text(AEON_CONTACT.name, { align: "center" });
    doc.font("Helvetica").fontSize(8).fillColor("#777").text(AEON_CONTACT.tagline, { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#555").text(`${AEON_CONTACT.email}  ·  ${AEON_CONTACT.phone}`, { align: "center" });
    doc.text(AEON_CONTACT.website, { align: "center" });
    doc.text(AEON_CONTACT.address, { align: "center" });

    doc.end();
  });
}

// Minutes of Meeting email content — built entirely from the meeting's own frozen data
// (pricingSnapshot's totalLabel/clientName, meetingOutcome), the same "never recompute
// independently" principle as the PDF/CSV/Word artifacts above, so this can never disagree
// with what the saved record actually shows. `sender` is the salesperson sending it (never
// the client), used only for the closing signature.
function formatFollowUp(outcome: MeetingOutcome): string | null {
  if (!outcome.followUp) return null;
  const parts = [outcome.followUpDate, outcome.followUpTime].filter((p) => p?.trim()).join(" at ");
  return parts || null;
}

function buildMinutesEmailContent(
  snapshot: QuoteSnapshot,
  outcome: MeetingOutcome | null,
  sender: { name: string; title: string | null; email: string }
): { subject: string; text: string; html: string } {
  const clientLabel = snapshot.clientName || "your organization";
  const subject = `Minutes of Meeting — ${clientLabel}`;
  const signatureLines = [sender.name, sender.title, "Aeon Synergies LLC", sender.email].filter((l): l is string => !!l?.trim());

  const outcomeLines: string[] = [];
  if (outcome) {
    outcomeLines.push(`Status: ${outcome.status}${outcome.status === "Other" && outcome.otherStatus ? ` (${outcome.otherStatus})` : ""}`);
    const followUp = formatFollowUp(outcome);
    if (followUp) outcomeLines.push(`Follow-up scheduled: ${followUp}`);
    if (outcome.additionalNotes?.trim()) outcomeLines.push(`Notes: ${outcome.additionalNotes.trim()}`);
  }

  const text = [
    `Hi ${clientLabel},`,
    ``,
    `Thank you for the time today. Here's a quick recap of our meeting, along with the proposal we discussed, attached as a PDF.`,
    ...(outcomeLines.length ? ["", ...outcomeLines] : []),
    ``,
    `Estimated monthly investment: ${snapshot.totalLabel}`,
    ``,
    `Let us know if you have any questions.`,
    ``,
    signatureLines.join("\n"),
  ].join("\n");

  const html = [
    `<p>Hi ${clientLabel},</p>`,
    `<p>Thank you for the time today. Here's a quick recap of our meeting, along with the proposal we discussed, attached as a PDF.</p>`,
    outcomeLines.length ? `<ul>${outcomeLines.map((l) => `<li>${l}</li>`).join("")}</ul>` : "",
    `<p>Estimated monthly investment: ${snapshot.totalLabel}</p>`,
    `<p>Let us know if you have any questions.</p>`,
    `<p>${signatureLines.join("<br>")}</p>`,
  ].join("\n");

  return { subject, text, html };
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
    const csv = snapshotToCsv(snapshot);
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
      const discoverySnapshot = buildDiscoverySnapshot(config, state, meeting.clientName);

      const updated = await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          meetingOutcome: input.outcome,
          pricingSnapshot: snapshot as unknown as object,
          discoverySnapshot: discoverySnapshot as unknown as object,
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
    const filename = meetingExportFilename(meeting.id, meeting.clientName, snapshot.companyName, "pdf");
    return { filename, base64: buffer.toString("base64") };
  }),

  // Send Minutes of Meeting — a real email (SES SendRawEmailCommand, via
  // sendEmailWithAttachment) with the Client Share Deck PDF genuinely attached. Distinct
  // from sendToClient/generateLiveQuotePdf above: this is a real send (continuing an
  // existing thread from the salesperson's own inbox needs mailto:'s attachment-free draft,
  // which is why that path stays untouched), it only applies to a saved Meeting Record
  // (built from the frozen pricingSnapshot/meetingOutcome, never live state), and it Reply-
  // To's the sending user's own email — a client reply should reach the salesperson, never
  // the no-reply@ address SES actually sends from.
  sendMinutes: requirePermission("meetingRecords")
    .input(z.object({ id: z.string(), clientEmail: z.email() }))
    .mutation(async ({ input, ctx }) => {
      const meeting = await prisma.meeting.findFirst({ where: { id: input.id, createdById: ctx.user.id } });
      if (!meeting || !meeting.completedAt || !meeting.pricingSnapshot) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting record not found" });
      }
      const sender = await prisma.user.findUnique({ where: { id: ctx.user.id } });
      if (!sender) throw new TRPCError({ code: "UNAUTHORIZED" });

      const snapshot = meeting.pricingSnapshot as unknown as QuoteSnapshot;
      const outcome = (meeting.meetingOutcome as unknown as MeetingOutcome | null) ?? null;
      const buffer = await buildQuotePdfBuffer(snapshot);
      const filename = meetingExportFilename(meeting.id, meeting.clientName, snapshot.companyName, "pdf");
      const { subject, text, html } = buildMinutesEmailContent(snapshot, outcome, { name: sender.name, title: sender.title, email: sender.email });

      let messageId: string | null;
      let rawMessage: Buffer;
      try {
        ({ messageId, rawMessage } = await sendEmailWithAttachment({
          to: input.clientEmail,
          replyTo: sender.email,
          subject,
          text,
          html,
          attachment: { filename, contentType: "application/pdf", content: buffer },
        }));
      } catch (err) {
        console.error("meeting.sendMinutes: SES send failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't send the Minutes of Meeting email — please try again." });
      }

      // Test-support only: a QA fixture recipient gets the exact raw MIME message back too,
      // so the live E2E suite can parse the real multipart attachment directly rather than
      // needing a real inbox to read it from — same reasoning as auth.e2eRequestToken
      // returning a real token directly instead of requiring an inbox. Never included for a
      // real client address; this is the caller's own meeting/PDF either way, so nothing
      // new is exposed by handing it back.
      const rawMessageBase64 = input.clientEmail.toLowerCase().endsWith("@aeonqa.internal") ? rawMessage.toString("base64") : undefined;

      return { ok: true, messageId, rawMessageBase64 };
    }),

  // The Word export of a saved record's frozen discoverySnapshot (never live/current
  // answers or a since-edited deck's discovery questions) — the Discovery Notes Q&A only,
  // in the same 3-tier general/service-mapped structure the live panel uses. Distinct
  // content from generateQuotePdf above: that's the quoted pricing/services, this is the
  // discovery call's actual questions and answers.
  generateDiscoveryDocx: requirePermission("meetingRecords").input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const meeting = await prisma.meeting.findFirst({ where: { id: input.id, createdById: ctx.user.id } });
    if (!meeting || !meeting.completedAt || !meeting.discoverySnapshot) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Meeting record not found" });
    }
    const snapshot = meeting.discoverySnapshot as unknown as DiscoverySnapshot;
    const buffer = await buildDiscoveryDocxBuffer(snapshot);
    const filename = meetingExportFilename(meeting.id, meeting.clientName, snapshot.companyName, "docx");
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
