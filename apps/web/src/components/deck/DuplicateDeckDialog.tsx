import * as React from "react";
import { trpc } from "~/lib/trpc";

// Duplicate (Home's 3-dot menu) — clones a deck's full structure (services, pricing,
// team, static content, discovery questions) into a new, separately-editable deck.
// Distinct from the live-deck-cloning removed from Create Deck in Phase 5c: that was about
// not using a real client's deck as a template for a different client. This is a user
// copying their own deck for a legitimate variant, so it only needs a new name up front —
// everything else can be adjusted afterward via Edit Deck.
export function DuplicateDeckDialog({
  slug,
  sourceName,
  onClose,
  onDuplicated,
}: {
  slug: string;
  sourceName: string;
  onClose: () => void;
  onDuplicated: (newSlug: string) => void;
}) {
  const [newName, setNewName] = React.useState(`${sourceName} (Copy)`);
  const [error, setError] = React.useState<string | null>(null);
  const duplicate = trpc.deck.duplicate.useMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await duplicate.mutateAsync({ slug, newName });
      onDuplicated(res.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't duplicate that deck.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Duplicate Deck</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="q-block">
            <div className="q-label">New deck name</div>
            <input type="text" required autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="q-hint">Copies every service, pricing band, team member, and question from "{sourceName}" into a new deck.</div>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={duplicate.isPending}>
            {duplicate.isPending ? "Duplicating…" : "Duplicate deck"}
          </button>
        </form>
      </div>
    </div>
  );
}
