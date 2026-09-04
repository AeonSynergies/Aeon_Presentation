import type { BundleDiscountTier, CategoryDiscountRule, DeckConfig, DeckService, DiscoveryQuestion, PricingModel } from "@aeon/types";

// Blank-slate template for the Deck Builder. Field defaults mirror the prototype's
// newBuilderDraft() (colors #E3A147/#3FBFB0, "The Expert Team Behind" cover, the
// Understanding/Implementation/Optimization how-steps) so a blank start lands in the
// same place the prototype's builder did — but the wizard itself is a new, stepped UX,
// deliberately not a port of the prototype's single long form.
export function blankDeck(): DeckConfig {
  return {
    id: "",
    industry: "",
    companyName: "",
    tagline: "",
    logo: { type: "text", wordmark: "New Deck", sub: "" },
    colors: { amber: "#E3A147", teal: "#3FBFB0" },
    pricingModels: [blankPricingModel("primary", true)],
    services: [blankService("Service 1", "service1", "primary")],
    team: [{ initials: "", name: "", title: "", email: "", phone: "" }],
    staticContent: {
      cover: { title1: "The Expert Team Behind", title2: "Your Business", sub: "" },
      about: { title1: "One partner.", title2: "One expert team.", body: "", bullets: [] },
      how: {
        steps: [
          { t: "Understanding", d: "" },
          { t: "Implementation", d: "" },
          { t: "Optimization", d: "" },
        ],
      },
      challenges: { items: [] },
      benefits: { items: [] },
      qa: { title: "Questions?", sub: "", email: "", phone: "", web: "", address: "" },
    },
    discoveryQuestions: [],
  };
}

export function blankService(name: string, id: string, pricingModelId: string): DeckService {
  return {
    id,
    name,
    team: "",
    tagline: "",
    category: "major",
    bandLabel: "",
    pricingModelId,
    handle: [""],
    stats: [
      { v: "", l: "" },
      { v: "", l: "" },
    ],
    dashboards: [],
    priceBands: [{ upTo: null, price: null }],
  };
}

export function blankPricingModel(id: string, isPrimary: boolean): PricingModel {
  return { id, label: "", unit: "", questionText: "", isPrimary };
}

const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/** camelCase-ish id from a display name, uniquified against ids already in use —
 * matches the flavor of the seeded ids (payroll, recruitAssist, emergencyLine). */
export function idFromName(name: string, taken: Iterable<string>, fallback: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  let id = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("");
  if (!ID_PATTERN.test(id)) id = fallback;
  const inUse = new Set(taken);
  if (!inUse.has(id)) return id;
  for (let n = 2; ; n++) {
    if (!inUse.has(`${id}${n}`)) return `${id}${n}`;
  }
}

export function allIdsInUse(deck: DeckConfig): string[] {
  // Pricing model ids share the same flat SessionState.answers map as discovery question
  // ids (a model's driver value and a question's answer are both keyed there), so a new
  // id must never collide with either.
  return [...deck.services.map((s) => s.id), ...deck.discoveryQuestions.map((q) => q.id), ...deck.pricingModels.map((m) => m.id)];
}

export function blankQuestion(id: string): DiscoveryQuestion {
  return { id, section: "general", label: "", type: "text" };
}

export function blankCategoryDiscount(id: string): CategoryDiscountRule {
  return { id, label: "", type: "percent", value: 10 };
}

export function blankBundleTier(): BundleDiscountTier {
  return { minServices: 2, type: "percent", value: 5 };
}

/** Client-side mirror of the server's key deck.create checks, so the Review step can
 * point at problems before the round trip. The server re-validates regardless. */
export function validateDraft(deck: DeckConfig): string[] {
  const issues: string[] = [];
  if (!deck.companyName.trim()) issues.push("Basics: company name is required.");
  if (!deck.industry.trim()) issues.push("Basics: industry is required.");
  if (deck.logo.type === "text" && !deck.logo.wordmark.trim()) issues.push("Basics: the text logo needs a wordmark.");
  if (deck.pricingModels.length === 0) issues.push("Pricing Model: a deck needs at least one pricing model.");
  for (const m of deck.pricingModels) {
    if (!m.label.trim() || !m.unit.trim() || !m.questionText.trim())
      issues.push(`Pricing Model: "${m.label || m.id}" — label, unit, and question text are all required.`);
  }
  if (deck.pricingModels.filter((m) => m.isPrimary).length !== 1)
    issues.push("Pricing Model: exactly one model must be marked primary.");
  if (deck.services.length === 0) issues.push("Services: a deck needs at least one service.");
  for (const s of deck.services) {
    if (!deck.pricingModels.some((m) => m.id === s.pricingModelId))
      issues.push(`Services: "${s.name || s.id}" is priced by a model that no longer exists.`);
    const label = s.name.trim() || s.id;
    if (!s.name.trim()) issues.push(`Services: a service is missing its name.`);
    if (s.handle.filter((h) => h.trim()).length === 0) issues.push(`Services: "${label}" needs at least one "what we handle" bullet.`);
    if (s.priceBands.length === 0) issues.push(`Services: "${label}" needs at least one price band.`);
    let prev = 0;
    s.priceBands.forEach((b, bi) => {
      const isLast = bi === s.priceBands.length - 1;
      if (b.upTo === null && !isLast) issues.push(`Services: "${label}" — only the last price band may be uncapped.`);
      if (b.upTo !== null) {
        if (b.upTo <= prev) issues.push(`Services: "${label}" — price band limits must increase.`);
        prev = b.upTo;
      }
    });
    if (s.stats.some((st) => !st.v.trim() || !st.l.trim()))
      issues.push(`Services: "${label}" — every stat needs both a value and a label (or remove the empty stat).`);
  }
  if (!deck.team.some((m) => m.name.trim())) issues.push("Team: at least one team member with a name is required.");
  const sc = deck.staticContent;
  if (!sc.cover.title1.trim() || !sc.cover.title2.trim()) issues.push("Content: cover needs both title lines.");
  for (const q of deck.discoveryQuestions) {
    if (!q.label.trim()) issues.push("Discovery: a question is missing its label.");
    if (q.type === "toggle" && (q.options?.filter((o) => o.trim()).length ?? 0) < 2)
      issues.push(`Discovery: toggle "${q.label || q.id}" needs at least two options.`);
    if ((q.type === "select" || q.type === "multiselect") && (q.options?.filter((o) => o.trim()).length ?? 0) < 1)
      issues.push(`Discovery: ${q.type === "select" ? "select" : "multi-select"} "${q.label || q.id}" needs at least one option.`);
  }
  if (deck.discountRules) {
    const categoryIds = new Set<string>();
    for (const c of deck.discountRules.categoryDiscounts) {
      if (!c.label.trim()) issues.push("Discount rules: a category discount is missing its label.");
      if (categoryIds.has(c.id)) issues.push(`Discount rules: duplicate category discount id "${c.id}".`);
      categoryIds.add(c.id);
      if (c.type === "percent" && c.value > 100) issues.push(`Discount rules: category discount "${c.label || c.id}" can't exceed 100%.`);
      if (c.value <= 0) issues.push(`Discount rules: category discount "${c.label || c.id}" needs a value greater than 0.`);
    }
    const thresholds = new Set<number>();
    for (const t of deck.discountRules.bundleTiers) {
      if (thresholds.has(t.minServices)) issues.push(`Discount rules: duplicate bundle tier threshold (${t.minServices} services).`);
      thresholds.add(t.minServices);
      if (t.type === "percent" && t.value > 100) issues.push(`Discount rules: bundle tier at ${t.minServices} services can't exceed 100%.`);
      if (t.value <= 0) issues.push(`Discount rules: bundle tier at ${t.minServices} services needs a value greater than 0.`);
    }
  }
  return issues;
}

/** Deep-copies a template's DeckConfig to use as a wizard starting point (Phase 5c —
 * replaces cloning from a live deck, which let a real client's deck double as another
 * client's template). Strips id (re-derived from the new company name server-side); the
 * template itself already leaves identity fields (companyName/logo/team/contact) blank. */
export function templateAsDraft(source: DeckConfig): DeckConfig {
  const copy: DeckConfig = JSON.parse(JSON.stringify(source));
  copy.id = "";
  return copy;
}
