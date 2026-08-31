import * as React from "react";
import { downloadBase64 } from "~/lib/download";
import { trpc } from "~/lib/trpc";

// Mirrors the prototype's actual Send to Client mechanism: the server (gated by
// requirePermission("sendToClient")) composes the subject/body from real pricing data and
// hands back a mailto: URL; the browser's own mail client sends it — there's no SMTP
// service wired up for this phase, matching the "no email-invite infrastructure yet"
// scoping already applied to Team Management's add-user flow.
//
// Download PDF is a second, independent action in the same dialog: same permission
// (sendToClient) and same content scope as the email draft — the client-facing deck as
// currently configured — generated live via meeting.generateLiveQuotePdf, which reuses the
// same buildQuoteSnapshot/buildQuotePdfBuffer Meeting Records already built. It doesn't
// depend on the client-email field, so it isn't gated by the form's validation.
export function SendToClientDialog({ meetingId, defaultSubject, onClose }: { meetingId: string; defaultSubject: string; onClose: () => void }) {
  const [email, setEmail] = React.useState("");
  const [subject, setSubject] = React.useState(defaultSubject);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const sendToClient = trpc.meeting.sendToClient.useMutation();
  const utils = trpc.useUtils();

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await sendToClient.mutateAsync({ id: meetingId, clientEmail: email, subject, note: note || undefined });
      window.location.href = res.mailto;
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't prepare that email.");
    }
  }

  async function onDownloadPdf() {
    setPdfError(null);
    setDownloadingPdf(true);
    try {
      const res = await utils.meeting.generateLiveQuotePdf.fetch({ id: meetingId });
      downloadBase64(res.filename, res.base64, "application/pdf");
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Couldn't generate that PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Send to Client</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={onSend}>
          <div className="q-block">
            <div className="q-label">Client email</div>
            <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
          </div>
          <div className="q-block">
            <div className="q-label">Subject</div>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="q-block">
            <div className="q-label">Note (optional)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line or two before the proposal summary." />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn-primary" disabled={sendToClient.isPending}>
              {sendToClient.isPending ? "Preparing…" : "Open email draft"}
            </button>
            <button type="button" className="btn-secondary" onClick={onDownloadPdf} disabled={downloadingPdf}>
              {downloadingPdf ? "Generating…" : "Download PDF"}
            </button>
          </div>
          {pdfError && <div className="auth-error">{pdfError}</div>}
          <div className="q-hint" style={{ marginTop: 8 }}>
            Opens a draft in your email app, addressed to the client, with the current pricing summary. Nothing sends automatically. Download PDF
            saves the same client-facing proposal, as currently configured, without sending anything.
          </div>
        </form>
      </div>
    </div>
  );
}
