// Live discovery-call session state — mirrors the prototype's `state` object
// (freshState()/initStateForDeck() in Presentation_Platform.html) so the pricing
// engine and Discovery Notes visibility rules translate directly.
import type { DiscountRules } from "./deck.js";
import { computeAutoDiscount } from "./pricing.js";

export interface DiscountConfig {
  enabled: boolean;
  scope: "all" | "multiple" | "single";
  services: string[];
  type: "percent" | "flat";
  value: number;
  // DeckConfig.discountRules (deck-build-time pre-decided discounts) only ever
  // suggest/pre-populate these fields — auto marks that they still reflect an untouched
  // suggestion (a bundle tier the live selected-service count qualifies for, or a category
  // discount the presenter marked applicable) rather than a manual edit, and
  // appliedCategoryDiscounts remembers which category rules are currently marked so the
  // suggestion recomputes correctly as selection changes (see computeAutoDiscount,
  // pricing.ts). A manual edit in Discovery Notes always takes precedence: it sets
  // auto=false, and nothing here touches the discount again until the presenter marks a
  // category discount applicable or explicitly asks to use the recommendation again.
  auto: boolean;
  appliedCategoryDiscounts: string[];
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
  discount: DiscountConfig;
  meetingOutcome?: MeetingOutcome;
}

export function freshSessionState(): SessionState {
  return {
    selected: [],
    toggles: {},
    answers: {},
    discount: { enabled: false, scope: "all", services: [], type: "percent", value: 0, auto: true, appliedCategoryDiscounts: [] },
  };
}

// Ported from Presentation_Platform.html's initStateForDeck(): every service starts
// opted-in, and the discount's service list mirrors that until an internal discount is
// configured. Shared between the client (DeckPlayer's very first render, before any
// backend round trip) and the server (meeting.create, so a freshly-created Meeting row
// reflects this deck's actual starting state immediately — never a gap where the row only
// has bare column defaults that a later client save has to catch up on).
//
// Also seeds the discount itself from discountRules if the deck has any — every service
// starts opted-in, so a bundle tier can already qualify before a presenter touches
// anything.
export function initialSessionStateForDeck(deck: {
  services: { id: string }[];
  discoveryQuestions: { id: string; type: string }[];
  discountRules?: DiscountRules;
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
    discount: computeAutoDiscount(deck.services, deck.discountRules, allServiceIds, []),
  };
}
