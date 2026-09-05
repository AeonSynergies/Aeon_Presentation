// Live discovery-call session state — mirrors the prototype's `state` object
// (freshState()/initStateForDeck() in Presentation_Platform.html) so the pricing
// engine and Discovery Notes visibility rules translate directly.

export interface ManualDiscount {
  // The presenter's own "additional discount" control in Discovery Notes — always
  // additive on top of any active bundle tier and any checked category discounts (see
  // computeDiscountBreakdown/discountItemsForService, pricing.ts). Never auto-populated
  // and never overwritten by a rule; it's a plain, independent layer the presenter
  // controls directly, on top of whatever else is active.
  enabled: boolean;
  scope: "all" | "multiple" | "single";
  services: string[];
  type: "percent" | "flat";
  value: number;
}

export interface DiscountState {
  manual: ManualDiscount;
  // Category discount ids (DeckConfig.discountRules.categoryDiscounts) the presenter has
  // explicitly checked as applicable to this client. Any number can be checked at once —
  // each contributes its own value independently (see discountItemsForService, pricing.ts)
  // — and nothing here is ever auto-selected: checking one category has no effect on any
  // other, and none of this is ever auto-selected.
  appliedCategoryDiscounts: string[];
  // Whether the presenter has checked "apply the bundle tier discount" — same
  // presenter-opt-in mechanism as appliedCategoryDiscounts, never auto-checked just because
  // the live selected-service count happens to qualify for a tier. Only one tier can ever
  // be active at a time (the highest threshold the current count meets — see
  // activeBundleTier, pricing.ts), so a single boolean is enough: which specific tier's
  // percentage applies is still resolved live from the count while this stays checked, and
  // it auto-unchecks the moment the count drops below every configured threshold (see the
  // effect in DiscoveryNotesPanel).
  bundleTierEnabled: boolean;
}

export function freshDiscountState(): DiscountState {
  return {
    manual: { enabled: false, scope: "all", services: [], type: "percent", value: 0 },
    appliedCategoryDiscounts: [],
    bundleTierEnabled: false,
  };
}

// Upgrades a persisted discount blob into the current DiscountState shape. A Meeting row
// saved before the additive discount stack existed has the old single-scalar shape
// (`{enabled, scope, services, type, value, auto, appliedCategoryDiscounts}` at the top
// level — no `manual` object) — this is a QA/demo app with no historic discount value
// precious enough to hand-migrate, so those simply start fresh, keeping only
// `appliedCategoryDiscounts` since that key's shape and meaning are unchanged. A row saved
// after the additive stack shipped but before the bundle tier became presenter-selected has
// a `manual` object but no `bundleTierEnabled` — those default to false (unchecked), matching
// "never auto-checked."
export function normalizeDiscountState(raw: unknown): DiscountState {
  const r = raw as (Partial<DiscountState> & Record<string, unknown>) | null | undefined;
  if (r && typeof r === "object" && r.manual && typeof r.manual === "object") {
    return { ...r, bundleTierEnabled: typeof r.bundleTierEnabled === "boolean" ? r.bundleTierEnabled : false } as DiscountState;
  }
  const appliedCategoryDiscounts = Array.isArray(r?.appliedCategoryDiscounts) ? (r.appliedCategoryDiscounts as string[]) : [];
  return { ...freshDiscountState(), appliedCategoryDiscounts };
}

export interface MeetingOutcome {
  followUp: boolean;
  followUpDate: string;
  followUpTime: string;
  deckRequested: boolean;
  status: string;
  otherStatus: string;
  additionalNotes?: string;
}

export interface DiscoveryAnswers {
  // string[] backs "multiselect" answers only — every other answer type stores a scalar.
  [questionId: string]: string | number | boolean | string[] | undefined;
}

export interface DiscoveryToggles {
  [questionId: string]: boolean;
}

export interface SessionState {
  selected: string[]; // opted-in service ids
  toggles: DiscoveryToggles;
  answers: DiscoveryAnswers;
  discount: DiscountState;
  meetingOutcome?: MeetingOutcome;
}

export function freshSessionState(): SessionState {
  return {
    selected: [],
    toggles: {},
    answers: {},
    discount: freshDiscountState(),
  };
}

// Ported from Presentation_Platform.html's initStateForDeck(): every service starts
// opted-in. Shared between the client (DeckPlayer's very first render, before any backend
// round trip) and the server (meeting.create, so a freshly-created Meeting row reflects
// this deck's actual starting state immediately — never a gap where the row only has bare
// column defaults that a later client save has to catch up on).
//
// The discount itself always starts fresh here — every category discount starts unchecked
// and the bundle tier starts unchecked too, regardless of whether the starting selection
// already qualifies for one (see discountItemsForService, pricing.ts) — never stored up
// front, so there's nothing to seed from discountRules at creation time.
export function initialSessionStateForDeck(deck: {
  services: { id: string }[];
  discoveryQuestions: { id: string; type: string }[];
}): SessionState {
  const allServiceIds = deck.services.map((s) => s.id);
  const toggles: DiscoveryToggles = {};
  for (const q of deck.discoveryQuestions) {
    if (q.type === "toggle") toggles[q.id] = false;
  }
  return {
    selected: allServiceIds,
    toggles,
    answers: {},
    discount: freshDiscountState(),
  };
}
