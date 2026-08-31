import { ROLE_LABELS, can, type Role } from "@aeon/types";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Header } from "~/components/layout/Header";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useAuth } from "~/hooks/useAuth";
import { trpc } from "~/lib/trpc";

// Archived Files — Admin-only (manageUsers permission, same gate as Team Management),
// enforced server-side (archive.listDecks/listMeetings and deck/meeting restore +
// deletePermanent all run through requirePermission("manageUsers")), not just hidden here.
// Lists everything soft-deleted from Home (decks) and Meeting Records (meeting records)
// across every user — Restore clears archivedAt so the item reappears in its normal list;
// Delete Permanently is the only real hard-delete path in the whole app.
export const Route = createFileRoute("/archived")({
  component: ArchivedPage,
});

function ArchivedPage() {
  return (
    <RequireAuth>
      <Header />
      <ArchivedGate />
    </RequireAuth>
  );
}

function ArchivedGate() {
  const { user } = useAuth();
  if (!user) return null;
  if (!can(user.role, "manageUsers")) {
    return (
      <div className="home-view">
        <div className="empty-state">
          Archived Files is only available to Admin accounts. Your role ({ROLE_LABELS[user.role as Role] ?? user.role}) doesn't include it.
        </div>
      </div>
    );
  }
  return <ArchivedManager />;
}

type Tab = "decks" | "meetings";

function ArchivedManager() {
  const [tab, setTab] = React.useState<Tab>("decks");
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);
  const utils = trpc.useUtils();

  const { data: decks, isLoading: decksLoading, error: decksError } = trpc.archive.listDecks.useQuery();
  const { data: meetings, isLoading: meetingsLoading, error: meetingsError } = trpc.archive.listMeetings.useQuery();

  const restoreDeck = trpc.deck.restore.useMutation();
  const deleteDeckPermanent = trpc.deck.deletePermanent.useMutation();
  const restoreMeeting = trpc.meeting.restore.useMutation();
  const deleteMeetingPermanent = trpc.meeting.deletePermanent.useMutation();

  async function onRestoreDeck(id: string) {
    setRowError(null);
    try {
      await restoreDeck.mutateAsync({ id });
      await Promise.all([utils.archive.listDecks.invalidate(), utils.deck.list.invalidate()]);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't restore that deck." });
    }
  }

  async function onDeleteDeckPermanent(id: string, name: string) {
    setRowError(null);
    if (!window.confirm(`Permanently delete "${name}"? This also deletes every meeting record for it. This can't be undone.`)) return;
    try {
      await deleteDeckPermanent.mutateAsync({ id });
      await Promise.all([utils.archive.listDecks.invalidate(), utils.archive.listMeetings.invalidate()]);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't permanently delete that deck." });
    }
  }

  async function onRestoreMeeting(id: string) {
    setRowError(null);
    try {
      await restoreMeeting.mutateAsync({ id });
      await Promise.all([utils.archive.listMeetings.invalidate(), utils.meeting.listRecords.invalidate()]);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't restore that meeting record." });
    }
  }

  async function onDeleteMeetingPermanent(id: string) {
    setRowError(null);
    if (!window.confirm("Permanently delete this meeting record? This can't be undone.")) return;
    try {
      await deleteMeetingPermanent.mutateAsync({ id });
      await utils.archive.listMeetings.invalidate();
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't permanently delete that meeting record." });
    }
  }

  return (
    <div className="home-view">
      <h1 className="home-title" style={{ margin: 0 }}>
        Archived Files
      </h1>
      <p className="home-sub">Decks and meeting records removed from their normal lists — restore them, or delete them for good.</p>

      <div className="builder-steps" style={{ marginBottom: 20 }}>
        <button type="button" className={`builder-step-chip${tab === "decks" ? " active" : ""}`} onClick={() => setTab("decks")}>
          Archived Decks {decks ? `(${decks.length})` : ""}
        </button>
        <button type="button" className={`builder-step-chip${tab === "meetings" ? " active" : ""}`} onClick={() => setTab("meetings")}>
          Archived Meeting Records {meetings ? `(${meetings.length})` : ""}
        </button>
      </div>

      {tab === "decks" && (
        <>
          {decksLoading && <div className="empty-state">Loading archived decks…</div>}
          {decksError && <div className="auth-error">{decksError.message}</div>}
          {decks && decks.length === 0 && <div className="empty-state">No archived decks.</div>}
          {decks && decks.length > 0 && (
            <div className="builder-subcard" style={{ padding: 0, overflow: "hidden" }}>
              <table className="team-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Archived</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {decks.map((d) => (
                    <React.Fragment key={d.id}>
                      <tr>
                        <td>{d.companyName}</td>
                        <td>{d.industry}</td>
                        <td>{d.archivedAt ? new Date(d.archivedAt).toLocaleString("en-US") : ""}</td>
                        <td style={{ display: "flex", gap: 8 }}>
                          <button type="button" className="mini-btn" onClick={() => onRestoreDeck(d.id)}>
                            Restore
                          </button>
                          <button type="button" className="mini-btn mini-btn-danger" onClick={() => onDeleteDeckPermanent(d.id, d.companyName)}>
                            Delete Permanently
                          </button>
                        </td>
                      </tr>
                      {rowError?.id === d.id && (
                        <tr>
                          <td colSpan={4} className="team-row-error">
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
        </>
      )}

      {tab === "meetings" && (
        <>
          {meetingsLoading && <div className="empty-state">Loading archived meeting records…</div>}
          {meetingsError && <div className="auth-error">{meetingsError.message}</div>}
          {meetings && meetings.length === 0 && <div className="empty-state">No archived meeting records.</div>}
          {meetings && meetings.length > 0 && (
            <div className="builder-subcard" style={{ padding: 0, overflow: "hidden" }}>
              <table className="team-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Deck</th>
                    <th>Saved by</th>
                    <th>Archived</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => (
                    <React.Fragment key={m.id}>
                      <tr>
                        <td>{m.clientName || "(no client name)"}</td>
                        <td>{m.deckCompanyName}</td>
                        <td>{m.createdByName}</td>
                        <td>{m.archivedAt ? new Date(m.archivedAt).toLocaleString("en-US") : ""}</td>
                        <td style={{ display: "flex", gap: 8 }}>
                          <button type="button" className="mini-btn" onClick={() => onRestoreMeeting(m.id)}>
                            Restore
                          </button>
                          <button type="button" className="mini-btn mini-btn-danger" onClick={() => onDeleteMeetingPermanent(m.id)}>
                            Delete Permanently
                          </button>
                        </td>
                      </tr>
                      {rowError?.id === m.id && (
                        <tr>
                          <td colSpan={5} className="team-row-error">
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
        </>
      )}
    </div>
  );
}
