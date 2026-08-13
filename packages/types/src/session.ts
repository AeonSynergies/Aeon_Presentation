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
  driverValue: number | string | null;
  selected: string[]; // opted-in service ids
  toggles: DiscoveryToggles;
  answers: DiscoveryAnswers;
  discount: DiscountConfig;
  meetingOutcome?: MeetingOutcome;
}

export function freshSessionState(): SessionState {
  return {
    driverValue: null,
    selected: [],
    toggles: {},
    answers: {},
    discount: { enabled: false, scope: "all", services: [], type: "percent", value: 0 },
  };
}
