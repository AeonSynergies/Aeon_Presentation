import type { DeckConfig, SessionState } from "@aeon/types";
import * as React from "react";
import { trpc } from "~/lib/trpc";

// Ported from Presentation_Platform.html's initStateForDeck(): every service starts
// opted-in, and the discount's service list mirrors that until an internal discount is
// configured — see packages/types/src/session.ts for the shared SessionState shape.
function initialStateForDeck(deck: DeckConfig): SessionState {
  const allServiceIds = deck.services.map((s) => s.id);
  const toggles: Record<string, boolean> = {};
  for (const q of deck.discoveryQuestions) {
    if (q.type === "toggle") toggles[q.id] = false;
  }
  return {
    driverValue: null,
    selected: allServiceIds,
    toggles,
    answers: {},
    discount: { enabled: false, scope: "all", services: allServiceIds, type: "percent", value: 0 },
  };
}

const SAVE_DEBOUNCE_MS = 800;

export function useDeckSession(deck: DeckConfig, dbId: string) {
  const [state, setState] = React.useState<SessionState>(() => initialStateForDeck(deck));
  const [meetingId, setMeetingId] = React.useState<string | null>(null);
  const [clientName, setClientName] = React.useState<string>("");

  const createMeeting = trpc.meeting.create.useMutation();
  const updateState = trpc.meeting.updateState.useMutation();

  const createdRef = React.useRef(false);
  React.useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    createMeeting.mutateAsync({ deckId: dbId }).then((meeting) => setMeetingId(meeting.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbId]);

  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!meetingId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateState.mutateAsync({
        id: meetingId,
        patch: {
          driverValue: state.driverValue,
          selected: state.selected,
          toggles: state.toggles,
          answers: state.answers as Record<string, string | number | boolean | null>,
          discount: state.discount,
          clientName: clientName || null,
        },
      });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, state, clientName]);

  return { state, setState, clientName, setClientName, meetingId };
}
