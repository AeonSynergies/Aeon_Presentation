// Pricing engine — base pricing ported EXACTLY from Presentation_Platform.html (lines
// ~1253-1274, ~1609-1613). Do not "improve" or re-derive that logic; it already survived
// many rounds of bug fixes (tiered bands, alt pricing drivers, surcharges — see CLAUDE.md).
// Discount stacking (bundle tier + category discounts + manual override, all additive) is
// a newer addition — see computeDiscountBreakdown/discountItemsForService below.
import type { BundleDiscountTier, CategoryDiscountRule, DeckService, DiscountRules, PriceBand } from "./deck.js";
import type { ManualDiscount, SessionState } from "./session.js";

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

/** The highest bundle tier the current selected-service count QUALIFIES for — only one
 * ever qualifies at a time, the highest threshold met — or undefined if none does (including
 * when the deck has no discountRules at all). Purely a function of the live selection count,
 * never stored in session state, so it recomputes automatically as services are toggled.
 * Qualifying is not the same as applying — see appliedBundleTier below, which also gates on
 * the presenter having actually checked it; this is used for the UI (which tier's checkbox is
 * checkable right now) and for that gating. */
export function activeBundleTier(discountRules: DiscountRules | undefined, selectedCount: number): BundleDiscountTier | undefined {
  if (!discountRules) return undefined;
  return [...discountRules.bundleTiers].sort((a, b) => b.minServices - a.minServices).find((t) => selectedCount >= t.minServices);
}

/** The bundle tier actually contributing to the discount stack right now: the qualifying
 * tier (activeBundleTier above), but ONLY if the presenter has checked "apply the bundle
 * tier discount" (st.discount.bundleTierEnabled) — same presenter-opt-in mechanism as
 * appliedCategoryDiscounts, never auto-applied just because the count qualifies. */
export function appliedBundleTier(discountRules: DiscountRules | undefined, st: SessionState): BundleDiscountTier | undefined {
  if (!st.discount.bundleTierEnabled) return undefined;
  return activeBundleTier(discountRules, st.selected.length);
}

/** One contributing source in the additive discount stack. */
export interface DiscountBreakdownItem {
  source: "bundleTier" | "category" | "manual";
  label: string;
  type: "percent" | "flat";
  value: number;
}

function manualAppliesToService(svcId: string, manual: ManualDiscount): boolean {
  if (!manual.enabled) return false;
  if (manual.scope === "all") return true;
  return manual.services.includes(svcId);
}

/** Every discount source currently active for ONE specific service: the bundle tier (if
 * checked AND its threshold is met — applies to every selected service, not just this one),
 * every category discount the presenter has checked (any number, all independently additive
 * — see DiscoveryNotesPanel's category checkboxes), and the manual "additional discount"
 * override if it's enabled and its own scope covers this service. All three are
 * presenter-selected and none is ever auto-applied; all three stack — none replaces
 * another. */
export function discountItemsForService(svcId: string, discountRules: DiscountRules | undefined, st: SessionState): DiscountBreakdownItem[] {
  const items: DiscountBreakdownItem[] = [];
  const tier = appliedBundleTier(discountRules, st);
  if (tier) items.push({ source: "bundleTier", label: `Bundle tier (${tier.minServices}+ services)`, type: tier.type, value: tier.value });
  for (const cat of discountRules?.categoryDiscounts ?? []) {
    if (st.discount.appliedCategoryDiscounts.includes(cat.id)) {
      items.push({ source: "category", label: cat.label, type: cat.type, value: cat.value });
    }
  }
  if (manualAppliesToService(svcId, st.discount.manual)) {
    items.push({ source: "manual", label: "Additional discount", type: st.discount.manual.type, value: st.discount.manual.value });
  }
  return items;
}

/** Deck-wide summary of the additive discount stack, for the presenter's own breakdown
 * display (DiscoveryNotesPanel) — not tied to any one service, since the bundle tier and
 * every category discount apply uniformly to all selected services regardless (only the
 * manual override can be scoped narrower, e.g. to a single service). totalPercent/
 * totalFlat sum every active item's own value, matching how discountItemsForService/
 * finalPriceFor combine them per service. */
export interface DiscountBreakdown {
  bundleTier: BundleDiscountTier | undefined;
  categories: CategoryDiscountRule[];
  manual: ManualDiscount | null;
  totalPercent: number;
  totalFlat: number;
}

export function computeDiscountBreakdown(discountRules: DiscountRules | undefined, st: SessionState): DiscountBreakdown {
  const bundleTier = appliedBundleTier(discountRules, st);
  const categories = (discountRules?.categoryDiscounts ?? []).filter((c) => st.discount.appliedCategoryDiscounts.includes(c.id));
  const manual = st.discount.manual.enabled ? st.discount.manual : null;
  let totalPercent = 0;
  let totalFlat = 0;
  const add = (type: "percent" | "flat", value: number) => {
    if (type === "percent") totalPercent += value;
    else totalFlat += value;
  };
  if (bundleTier) add(bundleTier.type, bundleTier.value);
  for (const c of categories) add(c.type, c.value);
  if (manual) add(manual.type, manual.value);
  return { bundleTier, categories, manual, totalPercent, totalFlat };
}

export interface FinalPrice {
  base: number | null | undefined;
  final: number | null | undefined;
  discounted: boolean;
}

export function finalPriceFor(svc: DeckService, discountRules: DiscountRules | undefined, st: SessionState): FinalPrice {
  const base = basePriceFor(svc, st);
  if (base === undefined || base === null) return { base, final: base, discounted: false };
  const items = discountItemsForService(svc.id, discountRules, st);
  if (items.length === 0) return { base, final: base, discounted: false };
  const percentOff = items.filter((i) => i.type === "percent").reduce((sum, i) => sum + i.value, 0);
  const flatOff = items.filter((i) => i.type === "flat").reduce((sum, i) => sum + i.value, 0);
  let final = base * (1 - percentOff / 100) - flatOff;
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
export function computePricingSummary(services: DeckService[], discountRules: DiscountRules | undefined, st: SessionState): PricingSummary {
  const chosen = services.filter((s) => st.selected.includes(s.id));
  let total = 0;
  let savedTotal = 0;
  let hasCustom = false;
  let hasPending = false;
  for (const s of chosen) {
    const { base, final, discounted } = finalPriceFor(s, discountRules, st);
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
