import { z } from "zod";

// Runtime validation for a DeckConfig arriving from the Deck Builder wizard. This is the
// server-side gate for the first deck-creation path that isn't the seed script, so it
// can't trust the client: beyond field shapes it enforces the cross-field invariants the
// pricing engine and Discovery Notes tiers rely on (surcharge question pairing,
// pricingModelId references, unique ids) — invariants the seeded decks satisfy by
// construction but a hand-built config could violate in ways that would only surface as
// wrong prices or invisible questions at presentation time.
//
// Deliberately validated inside the mutation handler (deckConfigSchema.parse) rather
// than as the tRPC .input() schema: this type is deep and recursive-ish, and inferring
// it through tRPC + react-query generics is exactly what blew up TS instantiation depth
// (TS2589) with Prisma's JsonValue earlier. Runtime checking is identical either way.

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #16A6CE");

const logoSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("imagePair"), srcLight: z.string().min(1), srcDark: z.string().min(1) }),
  z.object({ type: z.literal("image"), src: z.string().min(1) }),
  z.object({ type: z.literal("text"), wordmark: z.string().min(1), sub: z.string().optional() }),
]);

const watermarkSchema = z.object({ type: z.literal("image"), src: z.string().min(1) });

const colorsSchema = z.object({
  amber: hexColor,
  teal: hexColor,
  ink: hexColor.optional(),
  panel: hexColor.optional(),
  panel2: hexColor.optional(),
  fog: hexColor.optional(),
  paper: hexColor.optional(),
  success: hexColor.optional(),
  danger: hexColor.optional(),
  gold: hexColor.optional(),
});

const priceBandSchema = z.object({
  upTo: z.number().positive().nullable(),
  price: z.number().min(0).nullable(),
});

const reportTableRowSchema = z.object({
  label: z.string().min(1),
  value: z.string().optional(),
  isCurrency: z.boolean().optional(),
  suggestedPct: z.string().optional(),
  actualPct: z.string().optional(),
  bold: z.boolean().optional(),
  highlight: z.enum(["positive", "negative", "neutral"]).optional(),
  sectionHeader: z.boolean().optional(),
});

// Exported so ai.ts's draftReport mutation can validate an AI-generated custom-html
// report against the exact same per-kind gate a human-authored one goes through here.
export const reportTemplateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bar-highlights"),
    chartTitle: z.string().min(1),
    items: z.array(z.object({ label: z.string().min(1), count: z.number() })).min(1),
    sidebarLabel: z.string().min(1),
    sidebarCount: z.number().positive().optional(),
    summary: z.string().min(1),
    colorVariant: z.enum(["amber", "teal"]),
  }),
  z.object({
    kind: z.literal("particulars-table"),
    showPctColumns: z.boolean().optional(),
    valueColumnLabel: z.string().optional(),
    rows: z.array(reportTableRowSchema).min(1),
    extraList: z
      .object({
        heading: z.string().min(1),
        items: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).min(1),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal("operational-table"),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())).min(1),
    summary: z
      .object({
        label: z.string().min(1),
        items: z
          .array(z.object({ label: z.string().min(1), value: z.string().min(1), highlight: z.enum(["positive", "negative", "neutral"]).optional() }))
          .min(1),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal("uploaded-image"),
    src: z.string().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    alt: z.string().optional(),
  }),
  z.object({
    kind: z.literal("custom-html"),
    html: z.string().min(1).max(20_000),
    sizeHint: z.enum(["compact", "wide"]),
  }),
]);

const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

const pricingModelSchema = z.object({
  id: z.string().regex(idPattern, "Pricing model ids must start with a letter and use only letters, digits, - or _"),
  label: z.string().min(1, "Pricing model label is required"),
  unit: z.string().min(1, "Pricing model unit is required"),
  questionText: z.string().min(1, "Pricing model question text is required"),
  isPrimary: z.boolean(),
});

const serviceSchema = z.object({
  id: z.string().regex(idPattern, "Service ids must start with a letter and use only letters, digits, - or _"),
  name: z.string().min(1),
  team: z.string(),
  tagline: z.string().optional(),
  category: z.enum(["major", "strategic"]),
  bandLabel: z.string(),
  handle: z.array(z.string().min(1)).min(1, "Each service needs at least one 'what we handle' bullet"),
  stats: z.array(z.object({ v: z.string().min(1), l: z.string().min(1) })),
  dashboards: z.array(z.string().min(1)),
  priceBands: z.array(priceBandSchema).min(1, "Each service needs at least one price band"),
  pricingModelId: z.string().min(1, "Every service must be assigned a pricing model"),
  surcharge: z.object({ questionId: z.string().min(1), amount: z.number().positive() }).optional(),
  promoNote: z.string().optional(),
  reportSlides: z
    .array(
      z.object({
        title: z.string().min(1),
        illustrative: z.boolean().optional(),
        template: reportTemplateSchema,
      }),
    )
    .optional(),
});

const teamMemberSchema = z.object({
  initials: z.string().min(1).max(3),
  name: z.string().min(1),
  title: z.string(),
  email: z.string(),
  phone: z.string(),
});

const focusAreaSchema = z.object({ primary: z.string().min(1), secondary: z.string().optional() });

// A plain string is an already-persisted deck's old shape (before this became a
// title+description pair) — accepted so existing data never fails validation on
// re-save; GridSlide renders it as a description-only tile.
const gridItemSchema = z.union([z.string().min(1), z.object({ title: z.string().min(1), description: z.string().min(1) })]);

const staticContentSchema = z.object({
  cover: z.object({ title1: z.string().min(1), title2: z.string().min(1), sub: z.string() }),
  about: z.object({
    eyebrow: z.string().optional(),
    title1: z.string().min(1),
    title2: z.string().min(1),
    body: z.string(),
    bullets: z.array(z.string().min(1)),
    focusLabel: z.string().optional(),
    focusAreas: z.array(focusAreaSchema).optional(),
  }),
  how: z.object({ steps: z.array(z.object({ t: z.string().min(1), d: z.string() })).min(1) }),
  challenges: z.object({ items: z.array(gridItemSchema) }),
  benefits: z.object({ items: z.array(gridItemSchema) }),
  qa: z.object({
    title: z.string().min(1),
    sub: z.string(),
    email: z.string(),
    phone: z.string(),
    web: z.string(),
    address: z.string(),
  }),
});

const discoveryQuestionSchema = z.object({
  id: z.string().regex(idPattern, "Question ids must start with a letter and use only letters, digits, - or _"),
  section: z.enum(["general", "surcharge"]),
  relatedService: z.string().optional(),
  label: z.string().min(1),
  type: z.enum(["text", "number", "textarea", "select", "multiselect", "toggle", "date", "email", "phone", "time"]),
  options: z.array(z.string().min(1)).optional(),
  placeholder: z.string().optional(),
  surchargeFor: z.string().optional(),
  hint: z.string().optional(),
  dependsOn: z.object({ questionId: z.string().min(1), value: z.union([z.boolean(), z.string()]) }).optional(),
});

// Pre-decided discounts (Pricing Model step) — a bundle tier applies automatically based on
// the live selected-service count, and a category discount is checked by the presenter;
// both add into the live additive discount stack alongside any manual override (see
// discountItemsForService/computeDiscountBreakdown, @aeon/types) rather than replacing one
// another. Cross-field checks (duplicate ids, bad thresholds) live in the top-level
// superRefine below, alongside every other id/reference check.
const categoryDiscountRuleSchema = z.object({
  id: z.string().regex(idPattern, "Category discount ids must start with a letter and use only letters, digits, - or _"),
  label: z.string().min(1),
  type: z.enum(["percent", "flat"]),
  value: z.number().positive(),
});

const bundleDiscountTierSchema = z.object({
  minServices: z.number().int().positive(),
  type: z.enum(["percent", "flat"]),
  value: z.number().positive(),
});

const discountRulesSchema = z.object({
  categoryDiscounts: z.array(categoryDiscountRuleSchema),
  bundleTiers: z.array(bundleDiscountTierSchema),
});

export const deckConfigSchema = z
  .object({
    // id is assigned server-side from the generated slug; anything the client sends here
    // is ignored, so it's accepted but not validated beyond being a string.
    id: z.string().optional(),
    industry: z.string().min(1, "Industry is required"),
    companyName: z.string().min(1, "Company name is required"),
    tagline: z.string(),
    logo: logoSchema,
    secondaryLogo: logoSchema.nullish(),
    watermark: watermarkSchema.nullish(),
    colors: colorsSchema,
    pricingModels: z.array(pricingModelSchema).min(1, "A deck needs at least one pricing model"),
    services: z.array(serviceSchema).min(1, "A deck needs at least one service"),
    team: z.array(teamMemberSchema).min(1, "A deck needs at least one team member"),
    staticContent: staticContentSchema,
    discoveryQuestions: z.array(discoveryQuestionSchema),
    discountRules: discountRulesSchema.optional(),
  })
  .superRefine((deck, ctx) => {
    const modelIds = new Set<string>();
    let primaryCount = 0;
    for (const [mi, m] of deck.pricingModels.entries()) {
      if (modelIds.has(m.id)) {
        ctx.addIssue({ code: "custom", message: `Duplicate pricing model id "${m.id}"`, path: ["pricingModels", mi] });
      }
      modelIds.add(m.id);
      if (m.isPrimary) primaryCount++;
    }
    if (primaryCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: `Exactly one pricing model must be marked primary (found ${primaryCount})`,
        path: ["pricingModels"],
      });
    }

    const svcIds = new Set<string>();
    for (const s of deck.services) {
      if (svcIds.has(s.id)) {
        ctx.addIssue({ code: "custom", message: `Duplicate service id "${s.id}"`, path: ["services"] });
      }
      svcIds.add(s.id);
    }

    const qById = new Map<string, (typeof deck.discoveryQuestions)[number]>();
    for (const q of deck.discoveryQuestions) {
      if (qById.has(q.id)) {
        ctx.addIssue({ code: "custom", message: `Duplicate question id "${q.id}"`, path: ["discoveryQuestions"] });
      }
      // Pricing-driver values (keyed by pricing model id) and discovery answers (keyed by
      // question id) share the same flat SessionState.answers map, so a model id and a
      // question id can never collide — they'd silently overwrite each other's value.
      if (modelIds.has(q.id)) {
        ctx.addIssue({ code: "custom", message: `Question id "${q.id}" collides with a pricing model id — answers and driver values share the same map`, path: ["discoveryQuestions"] });
      }
      qById.set(q.id, q);
    }

    for (const [i, s] of deck.services.entries()) {
      // Bands must resolve deterministically: numeric upTo strictly increasing, and a
      // null upTo (the uncapped band) only ever last — an earlier null would shadow
      // every band after it in priceForBands' first-match loop.
      let prevUpTo = 0;
      for (const [bi, band] of s.priceBands.entries()) {
        const isLast = bi === s.priceBands.length - 1;
        if (band.upTo === null && !isLast) {
          ctx.addIssue({
            code: "custom",
            message: `Service "${s.name}": only the last price band may be uncapped`,
            path: ["services", i, "priceBands", bi],
          });
        }
        if (band.upTo !== null) {
          if (band.upTo <= prevUpTo) {
            ctx.addIssue({
              code: "custom",
              message: `Service "${s.name}": price band limits must be strictly increasing`,
              path: ["services", i, "priceBands", bi],
            });
          }
          prevUpTo = band.upTo;
        }
      }

      if (s.surcharge) {
        const q = qById.get(s.surcharge.questionId);
        if (!q) {
          ctx.addIssue({
            code: "custom",
            message: `Service "${s.name}": surcharge references question "${s.surcharge.questionId}" which doesn't exist`,
            path: ["services", i, "surcharge"],
          });
        } else {
          if (q.type !== "toggle") {
            ctx.addIssue({
              code: "custom",
              message: `Service "${s.name}": surcharge question "${q.id}" must be a toggle`,
              path: ["services", i, "surcharge"],
            });
          }
          if (q.surchargeFor !== s.id) {
            ctx.addIssue({
              code: "custom",
              message: `Service "${s.name}": surcharge question "${q.id}" must have surchargeFor="${s.id}"`,
              path: ["services", i, "surcharge"],
            });
          }
        }
      }

      if (!modelIds.has(s.pricingModelId)) {
        ctx.addIssue({
          code: "custom",
          message: `Service "${s.name}": pricingModelId references pricing model "${s.pricingModelId}" which doesn't exist`,
          path: ["services", i, "pricingModelId"],
        });
      }
    }

    for (const [i, q] of deck.discoveryQuestions.entries()) {
      if (q.type === "toggle" && (!q.options || q.options.length < 2)) {
        ctx.addIssue({
          code: "custom",
          message: `Question "${q.label}": toggles need at least two options`,
          path: ["discoveryQuestions", i, "options"],
        });
      }
      if ((q.type === "select" || q.type === "multiselect") && (!q.options || q.options.length < 1)) {
        ctx.addIssue({
          code: "custom",
          message: `Question "${q.label}": ${q.type === "select" ? "selects" : "multi-selects"} need at least one option`,
          path: ["discoveryQuestions", i, "options"],
        });
      }
      if (q.relatedService && !svcIds.has(q.relatedService)) {
        ctx.addIssue({
          code: "custom",
          message: `Question "${q.label}": relatedService "${q.relatedService}" doesn't exist`,
          path: ["discoveryQuestions", i, "relatedService"],
        });
      }
      if (q.surchargeFor) {
        const svc = deck.services.find((s) => s.id === q.surchargeFor);
        if (!svc) {
          ctx.addIssue({
            code: "custom",
            message: `Question "${q.label}": surchargeFor "${q.surchargeFor}" doesn't exist`,
            path: ["discoveryQuestions", i, "surchargeFor"],
          });
        } else if (svc.surcharge?.questionId !== q.id) {
          ctx.addIssue({
            code: "custom",
            message: `Question "${q.label}": marked as the surcharge for "${svc.name}" but that service's surcharge doesn't point back at it`,
            path: ["discoveryQuestions", i, "surchargeFor"],
          });
        }
      }
      if (q.dependsOn && !qById.has(q.dependsOn.questionId)) {
        ctx.addIssue({
          code: "custom",
          message: `Question "${q.label}": dependsOn references question "${q.dependsOn.questionId}" which doesn't exist`,
          path: ["discoveryQuestions", i, "dependsOn"],
        });
      }
    }

    if (deck.discountRules) {
      const categoryIds = new Set<string>();
      for (const [i, c] of deck.discountRules.categoryDiscounts.entries()) {
        if (categoryIds.has(c.id)) {
          ctx.addIssue({ code: "custom", message: `Duplicate category discount id "${c.id}"`, path: ["discountRules", "categoryDiscounts", i] });
        }
        categoryIds.add(c.id);
        if (c.type === "percent" && c.value > 100) {
          ctx.addIssue({
            code: "custom",
            message: `Category discount "${c.label}": a percent discount can't exceed 100`,
            path: ["discountRules", "categoryDiscounts", i, "value"],
          });
        }
      }
      const seenThresholds = new Set<number>();
      for (const [i, t] of deck.discountRules.bundleTiers.entries()) {
        if (seenThresholds.has(t.minServices)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate bundle tier threshold "${t.minServices} services"`,
            path: ["discountRules", "bundleTiers", i],
          });
        }
        seenThresholds.add(t.minServices);
        if (t.type === "percent" && t.value > 100) {
          ctx.addIssue({
            code: "custom",
            message: `Bundle tier at ${t.minServices} services: a percent discount can't exceed 100`,
            path: ["discountRules", "bundleTiers", i, "value"],
          });
        }
      }
    }
  });

export type ValidatedDeckConfig = z.infer<typeof deckConfigSchema>;

export function slugifyCompanyName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "deck";
}
