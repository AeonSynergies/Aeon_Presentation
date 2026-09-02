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

export type ReportCardType = "chart" | "metrics" | "table" | "image";

export interface ChartSegment {
  label: string;
  pct: number;
  color: string;
}

export interface MetricsRow {
  label: string;
  value: string;
}

export interface ReportCardChart {
  type: "chart";
  title: string;
  segments: ChartSegment[];
}

export interface ReportCardMetrics {
  type: "metrics";
  title: string;
  meta?: string;
  rows: MetricsRow[];
  highlight?: MetricsRow;
}

export interface ReportCardTable {
  type: "table";
  title: string;
  wide?: boolean;
  stats?: MetricsRow[];
  columns: string[];
  rows: string[][];
}

export interface ReportCardImage {
  type: "image";
  title: string;
  src: string;
  caption?: string;
}

export type ReportCard =
  | ReportCardChart
  | ReportCardMetrics
  | ReportCardTable
  | ReportCardImage;

export interface ReportSlide {
  title: string;
  illustrative?: boolean; // marks sample/placeholder data rather than a real client export
  cards: ReportCard[];
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
  reportSlide?: ReportSlide;
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
