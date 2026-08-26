import { can } from "@aeon/types";
import type { DeckConfig } from "@aeon/types";
import { Link } from "@tanstack/react-router";
import * as React from "react";
import { DiscoveryNotesPanel } from "~/components/discovery/DiscoveryNotesPanel";
import { useAuth } from "~/hooks/useAuth";
import { useDeckSession } from "~/hooks/useDeckSession";
import { trpc } from "~/lib/trpc";
import { DeckLogo } from "./Logo";
import { SendToClientDialog } from "./SendToClientDialog";
import { deckColorVars } from "./deckColors";
import { getSlides } from "./getSlides";

export function DeckPlayer({ deck, dbId }: { deck: DeckConfig; dbId: string }) {
  const { user } = useAuth();
  const { state, setState, clientName, setClientName, meetingId } = useDeckSession(deck, dbId);
  const [idx, setIdx] = React.useState(0);
  const [notesOpen, setNotesOpen] = React.useState(true);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const slideContentRef = React.useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const role = user?.role ?? "";

  // Export runs on demand (not a live query) — pull the CSV, hand it to the browser as a
  // download. requirePermission("export") is what actually stops a role without it; this
  // is just the client-side trigger + file hand-off.
  async function onExport() {
    if (!meetingId) return;
    setExportError(null);
    setExporting(true);
    try {
      const res = await utils.meeting.export.fetch({ id: meetingId });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const slides = React.useMemo(() => getSlides(deck, state), [deck, state]);
  const clampedIdx = Math.min(idx, slides.length - 1);

  React.useEffect(() => {
    if (idx > slides.length - 1) setIdx(Math.max(0, slides.length - 1));
  }, [idx, slides.length]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  function isFullscreen() {
    return !!document.fullscreenElement;
  }

  function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (!isFullscreen()) {
      el.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }

  function onViewportClick(e: React.MouseEvent) {
    if (!isFullscreen()) return;
    const target = e.target as HTMLElement;
    if (target.closest('[contenteditable="true"]') || target.closest("a")) return;
    setIdx((i) => Math.min(i + 1, slides.length - 1));
  }

  return (
    <div style={{ ...deckColorVars(deck.colors), display: "flex", minHeight: "100vh" }}>
      <div className="stage" ref={stageRef} style={{ flex: 1 }}>
        <div className="topbar">
          <div className="wordmark">
            <DeckLogo logo={deck.logo} colors={deck.colors} />
            <span className="sub">PARTNER DECK · {deck.industry.toUpperCase()}</span>
          </div>
          <div className="topbar-actions">
            <Link to="/" className="back-home-btn chrome-hide-present">
              ← Home
            </Link>
            <button className="icon-btn chrome-hide-present" onClick={() => setNotesOpen((v) => !v)}>
              {notesOpen ? "Hide" : "Show"} Discovery Notes
            </button>
            {can(role, "editDeck") && (
              <Link to="/decks/$slug/edit" params={{ slug: deck.id }} className="icon-btn chrome-hide-present">
                ✎ Edit Deck
              </Link>
            )}
            {can(role, "export") && (
              <button className="icon-btn chrome-hide-present" onClick={() => void onExport()} disabled={exporting || !meetingId}>
                {exporting ? "Exporting…" : "⬇ Export Rate Card"}
              </button>
            )}
            {can(role, "sendToClient") && (
              <button className="icon-btn chrome-hide-present" onClick={() => setSendDialogOpen(true)} disabled={!meetingId}>
                ✉ Send to Client
              </button>
            )}
            <button className="icon-btn" id="presentBtn" onClick={toggleFullscreen}>
              ⛶ PRESENT
            </button>
          </div>
        </div>
        {exportError && (
          <div className="chrome-hide-present" style={{ padding: "8px 24px" }}>
            <div className="auth-error">{exportError}</div>
          </div>
        )}

        <div className="viewport" onClick={onViewportClick}>
          <button className="nav-arrow prev chrome-hide-present" disabled={clampedIdx === 0} onClick={() => setIdx((i) => Math.max(i - 1, 0))}>
            ‹
          </button>
          <div className="slide" ref={slideContentRef} key={slides[clampedIdx]?.id}>
            {slides[clampedIdx]?.render()}
          </div>
          <button
            className="nav-arrow next chrome-hide-present"
            disabled={clampedIdx === slides.length - 1}
            onClick={() => setIdx((i) => Math.min(i + 1, slides.length - 1))}
          >
            ›
          </button>
        </div>

        <div className="routebar-wrap chrome-hide-present">
          <div className="routebar">
            <div className="track" />
            {slides.map((s, i) => (
              <button
                key={s.id}
                className={`stop ${i === clampedIdx ? "active" : ""} ${i < clampedIdx ? "done" : ""}`}
                aria-label={s.label}
                onClick={() => setIdx(i)}
              >
                <span className="beacon" />
                <span className="label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {notesOpen && (
        <div className="chrome-hide-present" style={{ width: 480, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--panel)" }}>
          <DiscoveryNotesPanel deck={deck} state={state} setState={setState} clientName={clientName} setClientName={setClientName} />
        </div>
      )}

      {sendDialogOpen && meetingId && (
        <SendToClientDialog
          meetingId={meetingId}
          defaultSubject={`${deck.companyName} Proposal — ${clientName || "your organization"}`}
          onClose={() => setSendDialogOpen(false)}
        />
      )}
    </div>
  );
}
