// Pricing engine — ported EXACTLY from Presentation_Platform.html (lines ~1253-1274,
// ~1609-1613). Do not "improve" or re-derive this logic; it already survived many rounds
// of bug fixes (tiered bands, alt pricing drivers, surcharges — see CLAUDE.md).
import type { DeckService, DiscountRules, PriceBand } from "./deck.js";
import type { DiscountConfig, SessionState } from "./session.js";

/**
 * undefined = driver value not yet answered (pending in Discovery Notes)
 * null      = value falls above every band and the service has no top band price (custom quote)
 * number    = a real price
 */
export function priceForBands(
  bands: PriceBand[],
  driverValue: number | string | null | undefined
): number | null | undefined {
  if (driverValue === null || driverValue === undefined || driverValue === "") return undefined;
  const v = Number(driverValue);
  for (const band of bands) {
    if (band.upTo === null || v <= band.upTo) return band.price;
  }
  return null;
}

export function basePriceFor(svc: DeckService, st: SessionState): number | null | undefined {
  const driverVal = st.answers[svc.pricingModelId];
  const p = priceForBands(svc.priceBands, driverVal as number | string | null | undefined);
  if (p === undefined || p === null) return p;
  if (svc.surcharge && st.toggles[svc.surcharge.questionId]) return p + svc.surcharge.amount;
  return p;
}

/** The discount a deck's pre-decided rules (DeckConfig.discountRules) produce for the
 * current service-selection state, with no manual customization. A category discount (an
 * explicit presenter action for this specific client) takes precedence over the passive,
 * selection-count-driven bundle tier; if several category discounts are marked applicable
 * at once, the first one configured (not first marked) wins, for a deterministic result.
 * Returns a disabled discount when no rule currently qualifies, including when the deck has
 * no discountRules at all. */
export function computeAutoDiscount(
  services: { id: string }[],
  discountRules: DiscountRules | undefined,
  selected: string[],
  appliedCategoryDiscounts: string[]
): DiscountConfig {
  const allServiceIds = services.map((s) => s.id);
  const shared = { auto: true as const, appliedCategoryDiscounts };
  if (discountRules) {
    const appliedCategory = discountRules.categoryDiscounts.find((c) => appliedCategoryDiscounts.includes(c.id));
    if (appliedCategory) {
      return { ...shared, enabled: true, scope: "all", services: allServiceIds, type: appliedCategory.type, value: appliedCategory.value };
    }
    const qualifying = [...discountRules.bundleTiers].sort((a, b) => b.minServices - a.minServices).find((t) => selected.length >= t.minServices);
    if (qualifying) {
      return { ...shared, enabled: true, scope: "all", services: allServiceIds, type: qualifying.type, value: qualifying.value };
    }
  }
  return { ...shared, enabled: false, scope: "all", services: [], type: "percent", value: 0 };
}

export function discountApplies(svcId: string, st: SessionState): boolean {
  if (!st.discount.enabled) return false;
  // scope "all" must apply regardless of what `services` holds — it's only meaningful for
  // "single"/"multiple", and a manually-enabled "all" discount (the default scope, so a
  // presenter who never touches the scope dropdown gets it) would otherwise sit on an empty
  // `services` list and silently discount nothing.
  if (st.discount.scope === "all") return true;
  return st.discount.services.includes(svcId);
}

export interface FinalPrice {
  base: number | null | undefined;
  final: number | null | undefined;
  discounted: boolean;
}

export function finalPriceFor(svc: DeckService, st: SessionState): FinalPrice {
  const base = basePriceFor(svc, st);
  if (base === undefined || base === null) return { base, final: base, discounted: false };
  if (!discountApplies(svc.id, st)) return { base, final: base, discounted: false };
  let final =
    st.discount.type === "percent" ? base * (1 - st.discount.value / 100) : base - st.discount.value;
  final = Math.max(0, Math.round(final));
  return { base, final, discounted: true };
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "Custom Quote";
  return "$" + Math.round(v).toLocaleString("en-US");
}

/** Human label for a price band's range, e.g. "1–15" or "51+". */
export function formatBandRange(bands: PriceBand[], idx: number): string {
  const band = bands[idx];
  if (!band) return "";
  const lower = idx === 0 ? 1 : (bands[idx - 1]?.upTo ?? 0) + 1;
  return band.upTo === null ? `${lower}+` : `${lower}–${band.upTo}`;
}

export interface PricingSummary {
  total: number;
  savedTotal: number;
  hasCustom: boolean;
  hasPending: boolean;
}

/** Aggregate total across every currently-selected service — mirrors slidePricing()'s
 * total/savedTotal/hasCustom/hasPending accumulation in the prototype. */
export function computePricingSummary(services: DeckService[], st: SessionState): PricingSummary {
  const chosen = services.filter((s) => st.selected.includes(s.id));
  let total = 0;
  let savedTotal = 0;
  let hasCustom = false;
  let hasPending = false;
  for (const s of chosen) {
    const { base, final, discounted } = finalPriceFor(s, st);
    if (final === undefined) {
      hasPending = true;
      continue;
    }
    if (final === null) {
      hasCustom = true;
      continue;
    }
    total += final;
    if (discounted && base !== null && base !== undefined) savedTotal += base - final;
  }
  return { total, savedTotal, hasCustom, hasPending };
}
