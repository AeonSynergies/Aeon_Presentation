import type { DeckConfig, SessionState } from "@aeon/types";
import { initialSessionStateForDeck } from "@aeon/types";
import * as React from "react";
import { trpc } from "~/lib/trpc";

const SAVE_DEBOUNCE_MS = 800;
// Present mode pops Discovery Notes out into its own window (see DeckPlayer +
// decks.$slug_.notes.tsx) rather than rendering it here — this window has to poll the
// backend to notice edits made over there, since there's no other channel between them.
const REMOTE_POLL_MS = 1500;
// Guards against a stale/in-flight poll response clobbering an edit this window just made
// a moment ago (covers the save debounce above plus round-trip time). In practice this
// window never edits state locally while presenting (the panel that would is unmounted),
// so this mostly matters right at the moment Present starts.
const LOCAL_EDIT_GUARD_MS = 2500;

export function useDeckSession(deck: DeckConfig, dbId: string, isPresenting: boolean) {
  const [state, setStateRaw] = React.useState<SessionState>(() => initialSessionStateForDeck(deck));
  const [meetingId, setMeetingId] = React.useState<string | null>(null);
  const [clientName, setClientNameRaw] = React.useState<string>("");
  const [dirty, setDirty] = React.useState(false);
  const lastLocalEditAt = React.useRef(0);
  const lastAppliedUpdatedAt = React.useRef<string | null>(null);

  // The only setters ever handed out to callers (the Discovery Notes panel, when it's
  // mounted) — every call stamps "a real person just edited this here", which both queues
  // a save and tells the poll-merge effect below not to immediately overwrite it.
  const setState = React.useCallback<React.Dispatch<React.SetStateAction<SessionState>>>((updater) => {
    lastLocalEditAt.current = Date.now();
    setDirty(true);
    setStateRaw(updater);
  }, []);
  const setClientName = React.useCallback((v: string) => {
    lastLocalEditAt.current = Date.now();
    setDirty(true);
    setClientNameRaw(v);
  }, []);

  const createMeeting = trpc.meeting.create.useMutation();
  const updateState = trpc.meeting.updateState.useMutation();

  const createdRef = React.useRef(false);
  React.useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    // meeting.create seeds the row with this deck's real initial state server-side (see
    // apps/api/src/routers/meeting.ts) — this window doesn't need to (and must not) push
    // an initial save just to correct bare column defaults; Present mode's poll below can
    // safely start reading this row the moment it exists.
    createMeeting.mutateAsync({ deckId: dbId }).then((meeting) => setMeetingId(meeting.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbId]);

  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!meetingId || !dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateState
        .mutateAsync({
          id: meetingId,
          patch: {
            selected: state.selected,
            toggles: state.toggles,
            answers: state.answers as Record<string, string | number | boolean | null>,
            discount: state.discount,
            clientName: clientName || null,
          },
        })
        .then(() => setDirty(false));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, state, clientName, dirty]);

  const pollActive = isPresenting;
  const remoteQuery = trpc.meeting.get.useQuery(
    { id: meetingId ?? "" },
    { enabled: !!meetingId && pollActive, refetchInterval: pollActive ? REMOTE_POLL_MS : false },
  );
  React.useEffect(() => {
    const m = remoteQuery.data;
    if (!m) return;
    const stamp = String(m.updatedAt);
    if (stamp === lastAppliedUpdatedAt.current) return;
    if (Date.now() - lastLocalEditAt.current < LOCAL_EDIT_GUARD_MS) return;
    lastAppliedUpdatedAt.current = stamp;
    setStateRaw({ selected: m.selected, toggles: m.toggles, answers: m.answers as SessionState["answers"], discount: m.discount });
    setClientNameRaw(m.clientName ?? "");
  }, [remoteQuery.data]);

  return { state, setState, clientName, setClientName, meetingId };
}
