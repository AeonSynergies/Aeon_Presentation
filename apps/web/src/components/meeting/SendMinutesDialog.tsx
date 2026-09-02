import * as React from "react";
import { trpc } from "~/lib/trpc";

// Send Minutes of Meeting — distinct from the "⬇ PDF" button next to it (kept exactly as
// it was: downloading and attaching manually from a salesperson's own inbox is a real,
// ongoing need for continuing an existing email thread, which a no-reply@ address can't
// do). This is a genuinely different action: a real email, sent server-side via SES with
// the Client Share Deck PDF actually attached — mailto: can't carry an attachment, which is
// why this can't just be a second draft link. Opening this dialog and clicking Send is the
// confirmation step; nothing sends before that.
export function SendMinutesDialog({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const sendMinutes = trpc.meeting.sendMinutes.useMutation();

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await sendMinutes.mutateAsync({ id: meetingId, clientEmail: email });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the Minutes of Meeting email.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Send Minutes of Meeting</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {sent ? (
          <div>
            <div className="q-hint" style={{ marginBottom: 16 }}>
              Sent to {email} — the Client Share Deck PDF was attached, and replies will reach your own inbox, not no-reply@.
            </div>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSend}>
            <div className="q-block">
              <div className="q-label">Client email</div>
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn-primary" disabled={sendMinutes.isPending}>
              {sendMinutes.isPending ? "Sending…" : "Send Minutes of Meeting"}
            </button>
            <div className="q-hint" style={{ marginTop: 8 }}>
              Sends a real email with the Client Share Deck PDF attached. Replies go to your own email, not no-reply@aeonsynergies.com.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
