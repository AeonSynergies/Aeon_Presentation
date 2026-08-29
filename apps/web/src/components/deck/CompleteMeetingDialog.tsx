import * as React from "react";
import { trpc } from "~/lib/trpc";

const STATUS_OPTIONS = ["Proposal Sent", "Won", "Lost", "Follow-Up Needed", "No Decision Yet", "Other"];

// Saves the current live Discovery Notes session as a permanent Meeting Record
// (meeting.complete, Phase 5a) — freezes today's pricing into the record and stores the
// call's outcome. MeetingOutcome's fields (packages/types/src/session.ts) are the
// prototype's own outcome shape, not new fields invented for this dialog.
export function CompleteMeetingDialog({ meetingId, onClose, onSaved }: { meetingId: string; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = React.useState(STATUS_OPTIONS[0]!);
  const [otherStatus, setOtherStatus] = React.useState("");
  const [followUp, setFollowUp] = React.useState(false);
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [followUpTime, setFollowUpTime] = React.useState("");
  const [deckRequested, setDeckRequested] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const complete = trpc.meeting.complete.useMutation();

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await complete.mutateAsync({
        id: meetingId,
        outcome: {
          status,
          otherStatus: status === "Other" ? otherStatus : "",
          followUp,
          followUpDate: followUp ? followUpDate : "",
          followUpTime: followUp ? followUpTime : "",
          deckRequested,
          additionalNotes: notes || undefined,
        },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this meeting record.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Save Meeting Record</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={onSave}>
          <div className="q-block">
            <div className="q-label">Outcome</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {status === "Other" && (
            <div className="q-block">
              <div className="q-label">Describe the outcome</div>
              <input type="text" value={otherStatus} onChange={(e) => setOtherStatus(e.target.value)} />
            </div>
          )}
          <div className="q-block">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={deckRequested} onChange={(e) => setDeckRequested(e.target.checked)} />
              Client requested the deck
            </label>
          </div>
          <div className="q-block">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
              Needs follow-up
            </label>
          </div>
          {followUp && (
            <div className="q-block" style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="q-label">Follow-up date</div>
                <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="q-label">Follow-up time</div>
                <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
              </div>
            </div>
          )}
          <div className="q-block">
            <div className="q-label">Notes (optional)</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this call." />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={complete.isPending}>
            {complete.isPending ? "Saving…" : "Save record"}
          </button>
          <div className="q-hint" style={{ marginTop: 8 }}>
            Freezes today's pricing into this record — later edits to this deck won't change it.
          </div>
        </form>
      </div>
    </div>
  );
}
