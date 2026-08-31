import { ROLE_LABELS, can, type Role } from "@aeon/types";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Header } from "~/components/layout/Header";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useAuth } from "~/hooks/useAuth";
import { trpc } from "~/lib/trpc";

// Meeting Records (Phase 5a) — genuinely missing from the web rebuild until now (it
// existed in the original HTML prototype). Spans every deck (not a per-deck screen): a
// history of Discovery Notes sessions this account has explicitly saved via "Save Meeting
// Record" in the deck player, gated on meetingRecords (Sales Executive/BD Manager/Admin —
// deliberately narrower than discoveryNotes, which every role has).
export const Route = createFileRoute("/meeting-records")({
  component: MeetingRecordsPage,
});

function MeetingRecordsPage() {
  return (
    <RequireAuth>
      <Header />
      <MeetingRecordsGate />
    </RequireAuth>
  );
}

function MeetingRecordsGate() {
  const { user } = useAuth();
  if (!user) return null;
  if (!can(user.role, "meetingRecords")) {
    return (
      <div className="home-view">
        <div className="empty-state">
          Meeting Records is only available to Sales Executive, BD Manager, and Admin accounts. Your role (
          {ROLE_LABELS[user.role as Role] ?? user.role}) doesn't include it.
        </div>
      </div>
    );
  }
  return <MeetingRecordsList />;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadBase64(filename: string, base64: string, mime: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function MeetingRecordsList() {
  const [deckId, setDeckId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const { data: decks } = trpc.deck.list.useQuery();
  const { data: records, isLoading, error } = trpc.meeting.listRecords.useQuery({
    deckId: deckId || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    search: search || undefined,
  });
  const utils = trpc.useUtils();
  const archiveMeeting = trpc.meeting.archive.useMutation();

  async function onDelete(id: string) {
    setRowError(null);
    setPendingId(id);
    try {
      await archiveMeeting.mutateAsync({ id });
      await utils.meeting.listRecords.invalidate();
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't delete that record." });
    } finally {
      setPendingId(null);
    }
  }

  async function onExportText(id: string) {
    setRowError(null);
    setPendingId(id);
    try {
      const res = await utils.meeting.exportRecordText.fetch({ id });
      downloadText(res.filename, res.text);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't export that record." });
    } finally {
      setPendingId(null);
    }
  }

  async function onRegeneratePdf(id: string) {
    setRowError(null);
    setPendingId(id);
    try {
      const res = await utils.meeting.generateQuotePdf.fetch({ id });
      downloadBase64(res.filename, res.base64, "application/pdf");
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't regenerate the PDF." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="home-view">
      <h1 className="home-title" style={{ margin: 0 }}>
        Meeting Records
      </h1>
      <p className="home-sub">Every Discovery Notes session you've saved as a record, across every deck.</p>

      <div className="builder-subcard" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <div className="q-block" style={{ flex: "1 1 200px", marginBottom: 0 }}>
          <div className="q-label">Deck</div>
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            <option value="">All decks</option>
            {decks?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.companyName}
              </option>
            ))}
          </select>
        </div>
        <div className="q-block" style={{ flex: "1 1 140px", marginBottom: 0 }}>
          <div className="q-label">From</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="q-block" style={{ flex: "1 1 140px", marginBottom: 0 }}>
          <div className="q-label">To</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="q-block" style={{ flex: "2 1 240px", marginBottom: 0 }}>
          <div className="q-label">Search</div>
          <input type="text" placeholder="Client or deck name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading && <div className="empty-state">Loading meeting records…</div>}
      {error && <div className="auth-error">{error.message}</div>}
      {records && records.length === 0 && <div className="empty-state">No meeting records match these filters.</div>}

      {records && records.length > 0 && (
        <div className="builder-subcard" style={{ padding: 0, overflow: "hidden" }}>
          <table className="team-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Deck</th>
                <th>Saved</th>
                <th>Outcome</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td>{r.clientName || "(no client name)"}</td>
                    <td>{r.deckCompanyName}</td>
                    <td>{r.completedAt ? new Date(r.completedAt).toLocaleString("en-US") : ""}</td>
                    <td>{r.meetingOutcome?.status ?? ""}</td>
                    <td>{r.totalLabel ?? ""}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="mini-btn" onClick={() => onExportText(r.id)} disabled={pendingId === r.id}>
                        ⬇ Text
                      </button>
                      <button type="button" className="mini-btn" onClick={() => onRegeneratePdf(r.id)} disabled={pendingId === r.id}>
                        ⬇ PDF
                      </button>
                      <button type="button" className="mini-btn mini-btn-danger" onClick={() => onDelete(r.id)} disabled={pendingId === r.id}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {rowError?.id === r.id && (
                    <tr>
                      <td colSpan={6} className="team-row-error">
                        {rowError.message}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
