// Live discovery-call session state — mirrors the prototype's `state` object
// (freshState()/initStateForDeck() in Presentation_Platform.html) so the pricing
// engine and Discovery Notes visibility rules translate directly.

export interface DiscountConfig {
  enabled: boolean;
  scope: "all" | "multiple" | "single";
  services: string[];
  type: "percent" | "flat";
  value: number;
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
  [questionId: string]: string | number | boolean | undefined;
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
    discount: { enabled: false, scope: "all", services: [], type: "percent", value: 0 },
  };
}

// Ported from Presentation_Platform.html's initStateForDeck(): every service starts
// opted-in, and the discount's service list mirrors that until an internal discount is
// configured. Shared between the client (DeckPlayer's very first render, before any
// backend round trip) and the server (meeting.create, so a freshly-created Meeting row
// reflects this deck's actual starting state immediately — never a gap where the row only
// has bare column defaults that a later client save has to catch up on).
export function initialSessionStateForDeck(deck: { services: { id: string }[]; discoveryQuestions: { id: string; type: string }[] }): SessionState {
  const allServiceIds = deck.services.map((s) => s.id);
  const toggles: DiscoveryToggles = {};
  for (const q of deck.discoveryQuestions) {
    if (q.type === "toggle") toggles[q.id] = false;
  }
  return {
    selected: allServiceIds,
    toggles,
    answers: {},
    discount: { enabled: false, scope: "all", services: allServiceIds, type: "percent", value: 0 },
  };
}
