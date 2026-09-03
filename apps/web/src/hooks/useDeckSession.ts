import type { DeckConfig, SessionState } from "@aeon/types";
import { initialSessionStateForDeck } from "@aeon/types";
import * as React from "react";
import { trpc } from "~/lib/trpc";

// Discovery Notes always lives in its own popped-out window (see DeckPlayer +
// decks.$slug_.notes.tsx), in every mode — editing and saving happens there, via
// useNotesWindowSession. This window never renders the panel itself and never edits state
// locally, so it's a pure reader: it creates the meeting row, then polls it continuously to
// pick up edits made in the notes window, since there's no other channel between the two.
const REMOTE_POLL_MS = 1500;

export function useDeckSession(deck: DeckConfig, dbId: string) {
  const [state, setState] = React.useState<SessionState>(() => initialSessionStateForDeck(deck));
  const [meetingId, setMeetingId] = React.useState<string | null>(null);
  const [clientName, setClientName] = React.useState<string>("");
  const lastAppliedUpdatedAt = React.useRef<string | null>(null);

  const createMeeting = trpc.meeting.create.useMutation();
  const createdRef = React.useRef(false);
  React.useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    // meeting.create seeds the row with this deck's real initial state server-side (see
    // apps/api/src/routers/meeting.ts) — the poll below can safely start reading this row
    // the moment it exists.
    createMeeting.mutateAsync({ deckId: dbId }).then((meeting) => setMeetingId(meeting.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbId]);

  const remoteQuery = trpc.meeting.get.useQuery({ id: meetingId ?? "" }, { enabled: !!meetingId, refetchInterval: REMOTE_POLL_MS });
  React.useEffect(() => {
    const m = remoteQuery.data;
    if (!m) return;
    const stamp = String(m.updatedAt);
    if (stamp === lastAppliedUpdatedAt.current) return;
    lastAppliedUpdatedAt.current = stamp;
    setState({ selected: m.selected, toggles: m.toggles, answers: m.answers as SessionState["answers"], discount: m.discount });
    setClientName(m.clientName ?? "");
  }, [remoteQuery.data]);

  return { state, clientName, meetingId };
}
