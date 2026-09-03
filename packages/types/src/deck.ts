// Deck config schema — mirrors the prototype's (Presentation_Platform.html) in-memory
// deck object shape exactly, so migrating existing/future deck data is a data copy,
// not a redesign. See Aeon_Platform_Requirements_Spec.md Section 5.

// srcLight/srcDark/src are URLs (e.g. "/brand/aeon-synergies-light-bg.svg"), not the
// prototype's window.__ASSETS__ base64-registry keys — that indirection existed only to
// work around the prototype having no backend/static hosting.
export type LogoConfig =
  | { type: "imagePair"; srcLight: string; srcDark: string }
  | { type: "image"; src: string }
  | { type: "text"; wordmark: string; sub?: string };

export type WatermarkConfig = { type: "image"; src: string };

/** Per-deck palette override. Five-color accent system (Section 4 / CLAUDE.md design system).
 * Only amber/teal are required — a deck (e.g. Meridian) may omit the rest and inherit them
 * from PLATFORM_DEFAULT_COLORS below, exactly like the prototype's PLATFORM_THEME_DEFAULTS
 * fallback in bootDeckPlayer(). This is what keeps per-deck design isolation real: a global
 * default change cascades to any deck that didn't override it, without touching that deck's
 * data, and vice versa. */
export interface DeckColors {
  amber: string; // primary accent
  teal: string; // secondary accent
  ink?: string; // page background
  panel?: string; // card background
  panel2?: string; // secondary panel background
  fog?: string; // muted text
  paper?: string; // primary text / dark ink
  success?: string;
  danger?: string;
  gold?: string; // tertiary accent
}

/** Ported verbatim from Presentation_Platform.html's PLATFORM_THEME_DEFAULTS. */
export const PLATFORM_DEFAULT_COLORS = {
  amber: "#16A6CE",
  teal: "#0C7B82",
  ink: "#F3F6F7",
  panel: "#FFFFFF",
  panel2: "#EAF0F1",
  fog: "#5C6E73",
  paper: "#15282D",
} as const;

/** A named pricing driver in a deck's model library. Every service is priced against
 * exactly one of these (DeckService.pricingModelId). Exactly one model per deck is
 * "primary" — that's purely which one drives the deck's own narrative copy (cover slide,
 * lede text); it has no effect on pricing itself. */
export interface PricingModel {
  id: string;
  label: string; // e.g. "Routes per day"
  unit: string; // e.g. "routes"
  questionText: string; // e.g. "How many routes do you run per day?"
  isPrimary: boolean;
}

export interface PriceBand {
  upTo: number | null; // null = top/uncapped band
  price: number | null; // null = "Custom Quote"
}

export interface ServiceSurcharge {
  questionId: string; // id of the linked toggle-type DiscoveryQuestion
  amount: number; // flat $/mo added when the toggle is on
}

// Three reusable report-sample templates (Phase 6), replacing the old free-form
// chart/metrics/table/image card grid. Each real client-facing report a service can show
// maps onto exactly one of these — chosen by data shape, not by service:
//   A "bar-highlights"    — a category/count breakdown (e.g. incident types) as a
//                           horizontal bar chart, a "Top N" sidebar of the leading values,
//                           and a one-line footer summary. Two color variants exist in the
//                           reference designs (teal/amber) — always the DECK's own two
//                           accent colors (colors.teal/colors.amber), never hardcoded hex.
//   B "particulars-table" — a particulars/amount table (optionally with Suggested %/Actual %
//                           columns too, for a budget-vs-actual view), ending in a bold
//                           bottom-line figure. Every colorable row/bottom-line's color is
//                           an explicit authored field (positive/negative/neutral), never
//                           auto-inferred from the number's sign or from comparing percents
//                           — the same shape of number means different things in different
//                           reports (a positive "Dispute Value" is a win in one report and
//                           an unresolved shortfall in another), so only the content author
//                           can know which it is.
//   C "operational-table" — a wide, dense, spreadsheet-style table (many columns) — for
//                           recruitment pipeline tracking and dispatch/route operations
//                           specifically, per the reference designs; not a catch-all for any
//                           table-shaped report.
export interface ReportBarChartItem {
  label: string;
  count: number;
}

export interface ReportBarHighlights {
  kind: "bar-highlights";
  chartTitle: string; // e.g. "Incidents"
  items: ReportBarChartItem[]; // rendered in the given order — sort before authoring
  sidebarLabel: string; // e.g. "Top 3" or "Top Fields"
  sidebarCount?: number; // how many leading items the sidebar highlights (default 3)
  summary: string; // footer line, e.g. "69 total incidents across 46 drivers this week"
  colorVariant: "amber" | "teal"; // which of the deck's own two accent colors to render in
}

export interface ReportTableRow {
  label: string;
  value?: string; // plain formatted value, no currency symbol embedded — e.g. "148,150.73",
  // "06/27/2025", "10.00" — the "$" prefix (when isCurrency) is rendered by the template.
  // Omit `value` entirely for a section-header row (see `sectionHeader`).
  isCurrency?: boolean; // true = render a "$" prefix before `value`; default true
  suggestedPct?: string; // e.g. "50" — only meaningful when the table's showPctColumns is set
  actualPct?: string; // e.g. "93.52"
  bold?: boolean; // true for a subtotal row or the final bottom-line row
  highlight?: "positive" | "negative" | "neutral"; // colors `value`/`actualPct`; omit = plain
  sectionHeader?: boolean; // true = a bold, label-only divider row (no value/pct columns)
}

export interface ReportParticularsTable {
  kind: "particulars-table";
  showPctColumns?: boolean; // true = render the Suggested %/Actual % columns too
  valueColumnLabel?: string; // header for the value column — default "Amount ($)"; e.g. "Nos"
  // for a report whose rows are plain counts, not dollar amounts (isCurrency: false throughout)
  rows: ReportTableRow[]; // by convention the last row is the bold bottom-line summary
  // An optional secondary compact name/value list rendered below the main table (e.g. a
  // "List of Overtime Employees" name → hours breakdown) — not every particulars-table
  // report needs one.
  extraList?: { heading: string; items: { label: string; value: string }[] };
}

export interface ReportSummaryItem {
  label: string;
  value: string;
  highlight?: "positive" | "negative" | "neutral"; // same explicit, author-set convention as
  // ReportTableRow.highlight — never inferred from the value itself.
}

export interface ReportOperationalTable {
  kind: "operational-table";
  columns: string[];
  rows: string[][];
  // Optional highlighted roll-up below the dense table — e.g. a "Planned vs. Executed" line
  // for a dispatch/route report. Not every operational-table report needs one.
  summary?: { label: string; items: ReportSummaryItem[] };
}

// D "uploaded-image" — a real report screenshot/export the user attached directly (S3-
//   backed, see apps/api/src/routers/reportAssets.ts). width/height are the image's own
//   natural pixel dimensions, captured client-side at upload time — used to render it at
//   its real aspect ratio (object-fit: contain, never stretched) and to classify it via
//   reportSizeHint below (a wide/landscape screenshot packs differently than a narrow one).
export interface ReportUploadedImage {
  kind: "uploaded-image";
  src: string; // public S3 URL
  width: number;
  height: number;
  alt?: string;
}

// E "custom-html" — a genuinely custom report layout the AI generated from a free-text
//   description (and optionally a reference image), NOT constrained to Templates A/B/C's
//   shapes (see apps/api/src/lib/ai-report-draft.ts). Rendered inside a sandboxed iframe
//   with no allow-scripts (ReportTemplate.tsx) — real HTML/CSS rendering, same rendering
//   model as everything else in this app, just isolated so arbitrary model-generated
//   markup can never execute script in the app's own context. sizeHint is the model's own
//   judgment of the layout's natural footprint (see reportSizeHint below); the HTML itself
//   is written to fill its container responsively (100% width/height), so the same markup
//   still looks right whether it lands in a grid cell or as a lone full-slide report.
export interface ReportCustomHtml {
  kind: "custom-html";
  html: string;
  sizeHint: "compact" | "wide";
}

export type ReportTemplate =
  | ReportBarHighlights
  | ReportParticularsTable
  | ReportOperationalTable
  | ReportUploadedImage
  | ReportCustomHtml;

/** Which packing lane a report belongs in when a service has several (see
 * paginateReports below): "compact" reports pair up two-per-row; "wide" ones always take
 * a full row alone (a dense operational table or a wide screenshot/custom layout would
 * crop or look cramped squeezed into half a row — see the Recruitment Tracking System
 * bug this replaced). The three original templates keep their existing, already-shipped
 * classification (operational-table alone was "wide" — the old `stacked` flag); the two
 * asset-backed kinds classify themselves explicitly (an uploaded image by its own aspect
 * ratio, a custom-html report by the model's own sizeHint). */
export function reportSizeHint(t: ReportTemplate): "compact" | "wide" {
  if (t.kind === "operational-table") return "wide";
  if (t.kind === "uploaded-image") return t.width / t.height >= 1.5 ? "wide" : "compact";
  if (t.kind === "custom-html") return t.sizeHint;
  return "compact";
}

/** Groups reports into display rows in array order: a "wide" report always gets a row to
 * itself; "compact" reports pair up two per row (a lone trailing compact report gets a
 * row of one, which renders full-width rather than half-width-with-a-gap — see
 * ServiceReportSlide.tsx). Pure and order-preserving, so calling it again on any
 * contiguous slice of an already-grouped list (e.g. one page's worth, from
 * paginateReports below) reproduces the exact same rows. */
export function groupIntoRows(reports: ReportSlide[]): ReportSlide[][] {
  const rows: ReportSlide[][] = [];
  let row: ReportSlide[] = [];
  const closeRow = () => {
    if (row.length > 0) rows.push(row);
    row = [];
  };
  for (const report of reports) {
    if (reportSizeHint(report.template) === "wide") {
      closeRow();
      rows.push([report]);
    } else {
      row.push(report);
      if (row.length === 2) closeRow();
    }
  }
  closeRow();
  return rows;
}

/** Packs a service's reports into pages, never more than MAX_ROWS_PER_PAGE display rows
 * (per groupIntoRows above) each. A report that would push a page past that row budget
 * starts a new page instead, which the caller (getSlides.tsx) renders as an additional
 * "Sample: X (n/m)" slide — the whole point being that nothing is ever cropped or shrunk
 * to illegibility to force a fit. Deliberately a fixed, deterministic heuristic rather
 * than real DOM measurement: getSlides has to know the slide (and so nav-dot) count
 * synchronously, before anything renders. Returns each page as a flat, still-ordered
 * report array — re-derive its rows with groupIntoRows when rendering it. */
export function paginateReports(reports: ReportSlide[]): ReportSlide[][] {
  const MAX_ROWS_PER_PAGE = 2;
  const pages: ReportSlide[][] = [];
  let pageRows: ReportSlide[][] = [];
  let row: ReportSlide[] = [];

  const closeRow = () => {
    if (row.length > 0) pageRows.push(row);
    row = [];
  };
  const closePage = () => {
    closeRow();
    if (pageRows.length > 0) pages.push(pageRows.flat());
    pageRows = [];
  };

  for (const report of reports) {
    const hint = reportSizeHint(report.template);
    if (hint === "wide") {
      closeRow();
      if (pageRows.length >= MAX_ROWS_PER_PAGE) closePage();
      pageRows.push([report]);
    } else {
      if (row.length === 0 && pageRows.length >= MAX_ROWS_PER_PAGE) closePage();
      row.push(report);
      if (row.length === 2) closeRow();
    }
  }
  closePage();

  return pages;
}

export interface ReportSlide {
  title: string; // full on-slide heading, e.g. "Worker Comp Validation, Week 25 (06/15/2025 to 06/21/2025)"
  illustrative?: boolean; // marks sample/placeholder data rather than a real client export
  template: ReportTemplate;
}

export interface ServiceStat {
  v: string; // headline value, e.g. "↓ 80%"
  l: string; // supporting label
}

export type ServiceCategory = "major" | "strategic";

export interface DeckService {
  id: string;
  name: string;
  team: string; // delivering team
  /** Short benefit phrase (3-5 words, e.g. "Accurate, audit-ready records") shown instead
   * of `team` on the Services overview slide only — every other use of `team` (the wizard's
   * "Delivering team" field, per-service slide eyebrows, the CSV export column, the PDF
   * proposal) is untouched. Optional so an already-persisted deck without one still renders
   * (that slide falls back to `team`). */
  tagline?: string;
  category: ServiceCategory;
  bandLabel: string; // e.g. "Route-based · 5 bands"
  handle: string[]; // "what we handle" bullets
  stats: ServiceStat[];
  dashboards: string[];
  priceBands: PriceBand[];
  /** Which pricing model in the deck's library this service is priced against — every
   * service is explicitly assigned, none implicitly falls back to a deck default. */
  pricingModelId: string;
  surcharge?: ServiceSurcharge;
  promoNote?: string;
  /** Zero or more "Sample: X" report slides shown right after this service's own slide —
   * one nav slide per entry, in order. Optional/omittable, and a service can have several
   * (e.g. Route Performance Management showing both a CDF and a DSB incident breakdown). */
  reportSlides?: ReportSlide[];
}

export interface TeamMember {
  initials: string;
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface StaticContentCover {
  title1: string;
  title2: string;
  sub: string;
}

/** One tile in the About slide's right-panel grid, e.g. {primary: "Amazon DSPs", secondary:
 * "& AFPs"} rendered as bold ink text followed by bold accent-colored text. `secondary` is
 * optional for a tile that's just a single short phrase. */
export interface AboutFocusArea {
  primary: string;
  secondary?: string;
}

export interface StaticContentAbout {
  /** Small label above the heading, e.g. "WHO WE ARE" — optional, defaults to "ABOUT US". */
  eyebrow?: string;
  title1: string;
  title2: string;
  /** Supports light inline markup for key terms: **bold** for bold ink text, __bold__ for
   * bold accent-colored text (double underscore) — parsed by AboutSlide, not raw HTML. */
  body: string;
  /** Superseded by focusAreas below (the About slide no longer renders a bullet list) —
   * kept only so an already-persisted deck's data isn't silently dropped; write new decks
   * with focusAreas instead. */
  bullets: string[];
  /** Right-panel label, e.g. "INDUSTRIES WE SERVE" — optional, defaults to "FOCUS AREAS". */
  focusLabel?: string;
  /** Right-panel grid tiles (a "2x2, or as many as needed" grid). The panel is omitted
   * entirely when this is empty/unset, so an already-persisted deck without it still
   * renders (just without the right panel). */
  focusAreas?: AboutFocusArea[];
}

export interface StaticContentHowStep {
  t: string;
  d: string;
}

export interface StaticContentHow {
  steps: StaticContentHowStep[];
}

/** One tile in the Challenges/Benefits numbered grid: a short bold title plus a one-to-two
 * sentence explanation. A plain `string` is also accepted (an already-persisted deck's old
 * shape, from before this became a title+description pair) — GridSlide renders it as a
 * description-only tile with no title, so old data never breaks, it just isn't as rich. */
export type StaticContentGridItem = { title: string; description: string } | string;

export interface StaticContentChallenges {
  items: StaticContentGridItem[];
}

export interface StaticContentBenefits {
  items: StaticContentGridItem[];
}

export interface StaticContentQA {
  title: string;
  sub: string;
  email: string;
  phone: string;
  web: string;
  address: string;
}

export interface StaticContent {
  cover: StaticContentCover;
  about: StaticContentAbout;
  how: StaticContentHow;
  challenges: StaticContentChallenges;
  benefits: StaticContentBenefits;
  qa: StaticContentQA;
}

export type DiscoveryQuestionType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "toggle"
  | "time";

export type DiscoveryQuestionSection = "general" | "surcharge";

export interface DiscoveryQuestionDependsOn {
  questionId: string;
  value: boolean | string;
}

export interface DiscoveryQuestion {
  id: string;
  section: DiscoveryQuestionSection;
  /** Tier-3 (service-mapped) marker — question only shown when this service is opted in. */
  relatedService?: string;
  label: string;
  type: DiscoveryQuestionType;
  options?: string[];
  placeholder?: string;
  /** Present on surcharge-linked toggle questions — id of the service it surcharges. */
  surchargeFor?: string;
  hint?: string;
  dependsOn?: DiscoveryQuestionDependsOn;
}

export interface DeckConfig {
  id: string;
  industry: string;
  companyName: string;
  tagline: string;
  logo: LogoConfig;
  secondaryLogo?: LogoConfig;
  watermark?: WatermarkConfig;
  colors: DeckColors;
  pricingModels: PricingModel[];
  services: DeckService[];
  team: TeamMember[];
  staticContent: StaticContent;
  discoveryQuestions: DiscoveryQuestion[];
}
