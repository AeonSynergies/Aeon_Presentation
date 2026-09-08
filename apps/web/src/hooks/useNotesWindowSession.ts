import type { FieldLock, SessionState } from "@aeon/types";
import { freshDiscountState } from "@aeon/types";
import * as React from "react";
import { trpc } from "~/lib/trpc";

const SAVE_DEBOUNCE_MS = 800;
// Mirrors useDeckSession.ts's poll cadence and edit guard — see that file for why. This
// window is the flip side of the same sync: it hydrates from whatever the main presenting
// window (or a previous notes session) already saved, then keeps polling so it also picks
// up anything changed elsewhere (e.g. someone editing in-page before Present was entered).
const REMOTE_POLL_MS = 1500;
const LOCAL_EDIT_GUARD_MS = 2500;
// How often a held field lock renews itself while the field stays focused — comfortably
// inside the server's FIELD_LOCK_IDLE_MS (packages/types/src/session.ts) so a normal
// network hiccup between renewals doesn't let the lock expire out from under an active
// editor, but frequent enough that a closed tab's lock still clears for everyone else soon
// after FIELD_LOCK_IDLE_MS elapses.
const FIELD_LOCK_HEARTBEAT_MS = 8000;

const EMPTY_FIELD_LOCKS: Record<string, FieldLock> = {};

const EMPTY_STATE: SessionState = {
  selected: [],
  toggles: {},
  answers: {},
  discount: freshDiscountState(),
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

  // Per-field editing locks (session-collaboration feature) — see FieldLock, @aeon/types,
  // and meeting.lockField/unlockField. lockField is called once on a field's focus, then
  // again on a heartbeat while it stays focused, so the lock keeps renewing for as long as
  // the user is actually there; unlockField on blur clears it immediately rather than
  // waiting for the idle timeout. A lock rejected because someone else already holds the
  // field (or a heartbeat that loses a race after an expired lock got reassigned) simply
  // stops renewing — the next poll's fieldLocks already reflects the real current holder,
  // so there's nothing else to reconcile locally.
  const lockFieldMutation = trpc.meeting.lockField.useMutation();
  const unlockFieldMutation = trpc.meeting.unlockField.useMutation();
  const heartbeats = React.useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const lockField = React.useCallback(
    (fieldKey: string) => {
      const attempt = () => lockFieldMutation.mutate({ id: meetingId, fieldKey }, { onError: () => stopHeartbeat(fieldKey) });
      const stopHeartbeat = (key: string) => {
        clearInterval(heartbeats.current[key]);
        delete heartbeats.current[key];
      };
      stopHeartbeat(fieldKey);
      attempt();
      heartbeats.current[fieldKey] = setInterval(attempt, FIELD_LOCK_HEARTBEAT_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meetingId]
  );

  const unlockField = React.useCallback(
    (fieldKey: string) => {
      clearInterval(heartbeats.current[fieldKey]);
      delete heartbeats.current[fieldKey];
      unlockFieldMutation.mutate({ id: meetingId, fieldKey });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meetingId]
  );

  // Best-effort: stop renewing any held locks if this window closes/navigates away. The
  // server-side idle timeout is what actually guarantees a lock never gets stuck forever
  // regardless of whether this cleanup ever runs (a crashed tab never runs it at all).
  React.useEffect(() => {
    return () => {
      Object.values(heartbeats.current).forEach(clearInterval);
    };
  }, []);

  return {
    state,
    setState,
    clientName,
    setClientName,
    hydrated,
    notFound: query.isError,
    fieldLocks: query.data?.fieldLocks ?? EMPTY_FIELD_LOCKS,
    lockField,
    unlockField,
  };
}
