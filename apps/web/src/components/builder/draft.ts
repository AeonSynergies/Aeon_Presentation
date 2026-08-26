import type { DeckConfig, DeckService, DiscoveryQuestion } from "@aeon/types";

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
    pricingDriver: { label: "", unit: "", questionText: "" },
    services: [blankService("Service 1", "service1")],
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

export function blankService(name: string, id: string): DeckService {
  return {
    id,
    name,
    team: "",
    category: "major",
    bandLabel: "",
    handle: [""],
    stats: [
      { v: "", l: "" },
      { v: "", l: "" },
    ],
    dashboards: [],
    priceBands: [{ upTo: null, price: null }],
  };
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
  return [...deck.services.map((s) => s.id), ...deck.discoveryQuestions.map((q) => q.id)];
}

export function blankQuestion(id: string): DiscoveryQuestion {
  return { id, section: "general", label: "", type: "text" };
}

/** Client-side mirror of the server's key deck.create checks, so the Review step can
 * point at problems before the round trip. The server re-validates regardless. */
export function validateDraft(deck: DeckConfig): string[] {
  const issues: string[] = [];
  if (!deck.companyName.trim()) issues.push("Basics: company name is required.");
  if (!deck.industry.trim()) issues.push("Basics: industry is required.");
  if (deck.logo.type === "text" && !deck.logo.wordmark.trim()) issues.push("Basics: the text logo needs a wordmark.");
  if (!deck.pricingDriver.label.trim() || !deck.pricingDriver.unit.trim() || !deck.pricingDriver.questionText.trim())
    issues.push("Pricing Model: driver label, unit, and question text are all required.");
  if (deck.services.length === 0) issues.push("Services: a deck needs at least one service.");
  for (const s of deck.services) {
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
    if (q.type === "toggle" && (q.options?.filter((o) => o.trim()).length ?? 0) !== 2)
      issues.push(`Discovery: toggle "${q.label || q.id}" needs exactly two options.`);
    if (q.type === "select" && (q.options?.filter((o) => o.trim()).length ?? 0) < 1)
      issues.push(`Discovery: select "${q.label || q.id}" needs at least one option.`);
  }
  return issues;
}

/** Deep-copies a deck to use as a wizard starting point. Strips the source's identity
 * (id/slug is re-derived from the new company name server-side) but keeps everything
 * else, including report slides and question wiring. */
export function cloneDeckAsDraft(source: DeckConfig): DeckConfig {
  const copy: DeckConfig = JSON.parse(JSON.stringify(source));
  copy.id = "";
  return copy;
}
