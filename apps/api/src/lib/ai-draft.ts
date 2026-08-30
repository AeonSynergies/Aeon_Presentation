import type { DeckConfig, DeckTemplate, DiscoveryQuestionType } from "@aeon/types";
import { z } from "zod";

// AI-assisted deck drafting (Phase 3a). The model never sees or assigns real deck/service
// ids, and never touches surcharge pairing, alternate pricing drivers, or report slides —
// those are cross-referencing / structural decisions the wizard's own Services and
// Discovery steps already handle well, and asking the model to invent ids it must also
// reference correctly (surchargeFor, relatedService, dependsOn) is exactly the kind of
// thing an LLM gets subtly wrong in ways that only surface as broken pricing later. So the
// model produces names and content; this file derives ids the same deterministic way the
// wizard's own draft.ts does, and the result is normal, unprivileged draft.ts territory
// from that point on — deckConfigSchema (the same gate deck.create/update use) is the
// final word on whether it's a valid DeckConfig.

const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/** Mirrors apps/web's draft.ts idFromName exactly (camelCase-ish, uniquified) — kept as a
 * separate copy since draft.ts is wizard/UI code and this runs server-side before the
 * wizard ever sees the draft. */
function deriveId(name: string, taken: Set<string>, fallback: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  let id = words.map((w, i) => (i === 0 ? w.toLowerCase() : (w[0] ?? "").toUpperCase() + w.slice(1).toLowerCase())).join("");
  if (!idPattern.test(id)) id = fallback;
  if (!taken.has(id)) {
    taken.add(id);
    return id;
  }
  for (let n = 2; ; n++) {
    const next = `${id}${n}`;
    if (!taken.has(next)) {
      taken.add(next);
      return next;
    }
  }
}

function initialsFrom(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (letters || "NA").slice(0, 3);
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #16A6CE");

const priceBandDraftSchema = z.object({
  upTo: z.number().positive().nullable(),
  price: z.number().min(0),
});

const serviceDraftSchema = z.object({
  name: z.string().min(1).max(80),
  team: z.string().min(1).max(80),
  category: z.enum(["major", "strategic"]),
  bandLabel: z.string().min(1).max(80),
  handle: z.array(z.string().min(1).max(140)).min(2).max(6),
  stats: z.array(z.object({ v: z.string().min(1).max(20), l: z.string().min(1).max(140) })).min(2).max(4),
  dashboards: z.array(z.string().min(1).max(80)).min(1).max(5),
  priceBands: z.array(priceBandDraftSchema).min(2).max(5),
  promoNote: z.string().max(80).optional(),
});

const teamMemberDraftSchema = z.object({
  name: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  email: z.string().max(100),
  phone: z.string().max(40),
});

const discoveryQuestionDraftSchema = z.object({
  label: z.string().min(1).max(160),
  type: z.enum(["text", "number", "textarea", "select", "toggle", "time"]),
  options: z.array(z.string().min(1).max(60)).optional(),
  placeholder: z.string().max(100).optional(),
  hint: z.string().max(200).optional(),
});

/** What we ask the model to produce. Deliberately a subset of DeckConfig — no ids, no
 * logo, no colors' optional half, no surcharge/pricingDriverField/reportSlide/dependsOn.
 * normalizeDraft() below expands this into a full DeckConfig with the same defaults
 * blankDeck() uses for everything the model doesn't touch. */
export const aiDraftInputSchema = z.object({
  industry: z.string().min(1).max(80),
  companyName: z.string().min(1).max(80),
  tagline: z.string().max(160),
  colors: z.object({ amber: hexColor, teal: hexColor }),
  pricingDriver: z.object({
    label: z.string().min(1).max(60),
    unit: z.string().min(1).max(30),
    questionText: z.string().min(1).max(160),
  }),
  services: z.array(serviceDraftSchema).min(3).max(7),
  team: z.array(teamMemberDraftSchema).min(1).max(4),
  staticContent: z.object({
    cover: z.object({ title1: z.string().min(1).max(60), title2: z.string().min(1).max(60), sub: z.string().max(160) }),
    about: z.object({
      title1: z.string().min(1).max(60),
      title2: z.string().min(1).max(60),
      body: z.string().max(600),
      bullets: z.array(z.string().min(1).max(140)).min(2).max(5),
    }),
    how: z.object({ steps: z.array(z.object({ t: z.string().min(1).max(40), d: z.string().max(200) })).length(3) }),
    challenges: z.object({ items: z.array(z.string().min(1).max(160)).min(2).max(5) }),
    benefits: z.object({ items: z.array(z.string().min(1).max(160)).min(2).max(5) }),
    qa: z.object({
      title: z.string().min(1).max(40),
      sub: z.string().max(160),
      email: z.string().max(100),
      phone: z.string().max(40),
      web: z.string().max(100),
      address: z.string().max(160),
    }),
  }),
  discoveryQuestions: z.array(discoveryQuestionDraftSchema).max(8),
});

export type AiDraftInput = z.infer<typeof aiDraftInputSchema>;

// Hand-written JSON Schema for the Anthropic tool call — kept in exact field-for-field
// correspondence with aiDraftInputSchema above (zod validates what actually comes back;
// this only shapes what the model is asked to produce).
export const AI_DRAFT_TOOL_SCHEMA = {
  type: "object",
  properties: {
    industry: { type: "string", description: "The client's industry, e.g. 'Regional trucking & last-mile delivery'." },
    companyName: { type: "string", description: "A plausible prospective client company name." },
    tagline: { type: "string" },
    colors: {
      type: "object",
      properties: {
        amber: { type: "string", description: "Primary accent hex color, e.g. #16A6CE" },
        teal: { type: "string", description: "Secondary accent hex color, e.g. #0C7B82" },
      },
      required: ["amber", "teal"],
    },
    pricingDriver: {
      type: "object",
      properties: {
        label: { type: "string", description: "e.g. 'Routes per day'" },
        unit: { type: "string", description: "e.g. 'routes'" },
        questionText: { type: "string", description: "e.g. 'How many routes do you run per day?'" },
      },
      required: ["label", "unit", "questionText"],
    },
    services: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          team: { type: "string", description: "The delivering team's name, e.g. 'Payroll & Compliance Team'." },
          category: { type: "string", enum: ["major", "strategic"] },
          bandLabel: { type: "string", description: "Short label shown on the services overview, e.g. 'Route-based · 5 bands'." },
          handle: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6, description: "'What we handle' bullets." },
          stats: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              properties: { v: { type: "string", description: "Headline value, e.g. '↓ 80%'" }, l: { type: "string" } },
              required: ["v", "l"],
            },
          },
          dashboards: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
          priceBands: {
            type: "array",
            minItems: 2,
            maxItems: 5,
            description:
              "Monthly $ price bands, strictly increasing 'upTo'. Only the LAST band may have upTo=null (uncapped). Every band must have a real numeric price — never null.",
            items: {
              type: "object",
              properties: {
                upTo: { type: ["number", "null"], description: "Upper bound of the driver unit for this band, or null only on the last band." },
                price: { type: "number", minimum: 0 },
              },
              required: ["upTo", "price"],
            },
          },
          promoNote: { type: "string", description: "Optional short promo, e.g. 'Free Trial: 30 Days'." },
        },
        required: ["name", "team", "category", "bandLabel", "handle", "stats", "dashboards", "priceBands"],
      },
    },
    team: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
        required: ["name", "title", "email", "phone"],
      },
    },
    staticContent: {
      type: "object",
      properties: {
        cover: {
          type: "object",
          properties: { title1: { type: "string" }, title2: { type: "string" }, sub: { type: "string" } },
          required: ["title1", "title2", "sub"],
        },
        about: {
          type: "object",
          properties: {
            title1: { type: "string" },
            title2: { type: "string" },
            body: { type: "string" },
            bullets: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          },
          required: ["title1", "title2", "body", "bullets"],
        },
        how: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: { type: "object", properties: { t: { type: "string" }, d: { type: "string" } }, required: ["t", "d"] },
            },
          },
          required: ["steps"],
        },
        challenges: { type: "object", properties: { items: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 } }, required: ["items"] },
        benefits: { type: "object", properties: { items: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 } }, required: ["items"] },
        qa: {
          type: "object",
          properties: {
            title: { type: "string" },
            sub: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            web: { type: "string" },
            address: { type: "string" },
          },
          required: ["title", "sub", "email", "phone", "web", "address"],
        },
      },
      required: ["cover", "about", "how", "challenges", "benefits", "qa"],
    },
    discoveryQuestions: {
      type: "array",
      maxItems: 8,
      description: "General (non service-specific) discovery questions only.",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          type: { type: "string", enum: ["text", "number", "textarea", "select", "toggle", "time"] },
          options: { type: "array", items: { type: "string" }, description: "Required (exactly 2) for toggle, at least 1 for select." },
          placeholder: { type: "string" },
          hint: { type: "string" },
        },
        required: ["label", "type"],
      },
    },
  },
  required: ["industry", "companyName", "tagline", "colors", "pricingDriver", "services", "team", "staticContent", "discoveryQuestions"],
} as const;

export const AI_DRAFT_SYSTEM_PROMPT = `You help sales teams at a business-services consultancy draft a first-pass client pitch deck from a short description of a prospective client's industry. You must call the submit_deck_draft tool exactly once with a complete, plausible draft — realistic service names, sensible monthly price bands in USD (increasing with usage/scale), concrete "what we handle" bullets, and short benefit-style stats. Never invent real people, real company names that could be mistaken for an actual known company, or real contact details — use clearly generic/placeholder names, emails, and phone numbers for the team and Q&A sections. This is a first draft a human will review and edit before anything is saved or shown to a client.`;

function formatBandPattern(bands: DeckConfig["services"][number]["priceBands"]): string {
  return bands
    .map((b) => `up to ${b.upTo ?? "∞"} → ${b.price === null ? "custom quote" : `$${b.price}`}`)
    .join(", ");
}

// Phase 5c: when a user picks a template as structural grounding, this turns that
// template's DeckConfig into a compact reference block prepended to the user's own
// prompt — enough for the model to mirror the STRUCTURE (how many services, their
// category mix, price-band shape, question style) without copying the template's actual
// wording, since the instruction below is explicit that the model must adapt, not copy.
// Deliberately omits anything the model isn't asked to produce anyway (ids, surcharge/
// alternate-driver wiring, tier-3 discovery questions, report slides) — those stay
// wizard/human territory exactly as they already are for a template-free draft.
export function buildTemplateGroundingBlock(template: DeckTemplate): string {
  const c = template.config;
  const serviceLines = c.services
    .map(
      (s) =>
        `  - "${s.name}" (${s.category}, ${s.team}) — ${s.bandLabel}; ${s.priceBands.length} price band${s.priceBands.length === 1 ? "" : "s"}: ${formatBandPattern(s.priceBands)}`,
    )
    .join("\n");
  const generalQuestions = c.discoveryQuestions.filter((q) => !q.relatedService && q.section === "general");
  const questionLines = generalQuestions.map((q) => `  - (${q.type}) ${q.label}`).join("\n") || "  (none)";

  return [
    `Structural reference — a template called "${template.label}" (${c.industry}). Adapt its SHAPE (how many services, the mix of major/strategic categories, how price bands scale, the tone of the general discovery questions) to the industry described below. Do NOT reuse its exact service names, wording, or price figures verbatim, and do NOT mention this reference template or its industry by name in the draft — treat it only as a structural pattern to follow for a genuinely different client.`,
    `Reference pricing driver: "${c.pricingDriver.label}" (${c.pricingDriver.unit}).`,
    `Reference services (${c.services.length}):`,
    serviceLines,
    `Reference general discovery questions:`,
    questionLines,
  ].join("\n");
}

/** Expands the model's (validated) draft into a full DeckConfig — same shape and same
 * defaults-for-what-the-model-didn't-touch that apps/web's draft.ts blankDeck() uses, so
 * the result is exactly what the wizard already knows how to render and edit. Also
 * returns which price-band fields were AI-populated, keyed "<serviceId>:<bandIndex>" —
 * the wizard clears an entry once a human edits that band. */
export function normalizeDraft(input: AiDraftInput): { config: DeckConfig; aiSuggestedFields: string[] } {
  const usedIds = new Set<string>();
  const aiSuggestedFields: string[] = [];

  const services = input.services.map((s, si) => {
    const id = deriveId(s.name, usedIds, `service${si + 1}`);
    s.priceBands.forEach((_, bi) => aiSuggestedFields.push(`${id}:${bi}`));
    return {
      id,
      name: s.name,
      team: s.team,
      category: s.category,
      bandLabel: s.bandLabel,
      handle: s.handle,
      stats: s.stats,
      dashboards: s.dashboards,
      priceBands: s.priceBands,
      ...(s.promoNote ? { promoNote: s.promoNote } : {}),
    };
  });

  const discoveryQuestions = input.discoveryQuestions.map((q, qi) => ({
    id: deriveId(q.label, usedIds, `question${qi + 1}`),
    section: "general" as const,
    label: q.label,
    type: q.type as DiscoveryQuestionType,
    ...(q.options ? { options: q.options } : {}),
    ...(q.placeholder ? { placeholder: q.placeholder } : {}),
    ...(q.hint ? { hint: q.hint } : {}),
  }));

  const config: DeckConfig = {
    id: "",
    industry: input.industry,
    companyName: input.companyName,
    tagline: input.tagline,
    logo: { type: "text", wordmark: input.companyName, sub: input.industry },
    colors: input.colors,
    pricingDriver: input.pricingDriver,
    services,
    team: input.team.map((m) => ({ initials: initialsFrom(m.name), name: m.name, title: m.title, email: m.email, phone: m.phone })),
    staticContent: input.staticContent,
    discoveryQuestions,
  };

  return { config, aiSuggestedFields };
}
