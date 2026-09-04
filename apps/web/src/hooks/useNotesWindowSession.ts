import type { SessionState } from "@aeon/types";
import * as React from "react";
import { trpc } from "~/lib/trpc";

const SAVE_DEBOUNCE_MS = 800;
// Mirrors useDeckSession.ts's poll cadence and edit guard — see that file for why. This
// window is the flip side of the same sync: it hydrates from whatever the main presenting
// window (or a previous notes session) already saved, then keeps polling so it also picks
// up anything changed elsewhere (e.g. someone editing in-page before Present was entered).
const REMOTE_POLL_MS = 1500;
const LOCAL_EDIT_GUARD_MS = 2500;

const EMPTY_STATE: SessionState = {
  selected: [],
  toggles: {},
  answers: {},
  discount: { enabled: false, scope: "all", services: [], type: "percent", value: 0, auto: true, appliedCategoryDiscounts: [] },
};

/** The popped-out Discovery Notes window's session (see DeckPlayer's Present-mode
 * "Discovery Notes" control and decks.$slug_.notes.tsx). Unlike useDeckSession, this never
 * creates a Meeting — it only ever attaches to one the main window already created — and
 * it has no local defaults of its own to fall back on, so nothing here is considered real
 * until the first successful fetch ("hydrated"). */
export function useNotesWindowSession(meetingId: string) {
  const [state, setStateRaw] = React.useState<SessionState>(EMPTY_STATE);
  const [clientName, setClientNameRaw] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const lastLocalEditAt = React.useRef(0);
  const lastAppliedUpdatedAt = React.useRef<string | null>(null);

  const updateState = trpc.meeting.updateState.useMutation();
  const query = trpc.meeting.get.useQuery({ id: meetingId }, { enabled: !!meetingId, refetchInterval: REMOTE_POLL_MS });

  React.useEffect(() => {
    const m = query.data;
    if (!m) return;
    const stamp = String(m.updatedAt);
    if (stamp === lastAppliedUpdatedAt.current) return;
    if (hydrated && Date.now() - lastLocalEditAt.current < LOCAL_EDIT_GUARD_MS) return;
    lastAppliedUpdatedAt.current = stamp;
    setStateRaw({ selected: m.selected, toggles: m.toggles, answers: m.answers as SessionState["answers"], discount: m.discount });
    setClientNameRaw(m.clientName ?? "");
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

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

  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!hydrated || !dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateState
        .mutateAsync({
          id: meetingId,
          patch: {
            selected: state.selected,
            toggles: state.toggles,
            answers: state.answers as Record<string, string | number | boolean | string[] | null>,
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
  }, [state, clientName, hydrated, dirty]);

  return { state, setState, clientName, setClientName, hydrated, notFound: query.isError };
}
