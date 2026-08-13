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

/** Per-deck palette override. Five-color accent system (Section 4 / CLAUDE.md design system). */
export interface DeckColors {
  amber: string; // primary accent
  teal: string; // secondary accent
  ink: string; // page background
  panel: string; // card background
  panel2: string; // secondary panel background
  fog: string; // muted text
  paper: string; // primary text / dark ink
  success?: string;
  danger?: string;
  gold?: string; // tertiary accent
}

export interface PricingDriver {
  label: string; // e.g. "Routes per day"
  unit: string; // e.g. "routes"
  questionText: string; // e.g. "How many routes do you run per day?"
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
  category: ServiceCategory;
  bandLabel: string; // e.g. "Route-based · 5 bands"
  handle: string[]; // "what we handle" bullets
  stats: ServiceStat[];
  dashboards: string[];
  priceBands: PriceBand[];
  /** When set, this service is priced against a different driver than the deck's default
   * pricingDriver — the value comes from discoveryQuestions[pricingDriverField] instead of
   * state.driverValue (e.g. FedEx Driver Payroll Management priced by driver count). */
  pricingDriverField?: string;
  pricingDriverLabel?: string;
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

export interface StaticContentAbout {
  title1: string;
  title2: string;
  body: string;
  bullets: string[];
}

export interface StaticContentHowStep {
  t: string;
  d: string;
}

export interface StaticContentHow {
  steps: StaticContentHowStep[];
}

export interface StaticContentChallenges {
  items: string[];
}

export interface StaticContentBenefits {
  items: string[];
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
  pricingDriver: PricingDriver;
  services: DeckService[];
  team: TeamMember[];
  staticContent: StaticContent;
  discoveryQuestions: DiscoveryQuestion[];
}
