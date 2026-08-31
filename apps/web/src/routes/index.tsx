import { can } from "@aeon/types";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { DuplicateDeckDialog } from "~/components/deck/DuplicateDeckDialog";
import { Header } from "~/components/layout/Header";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useAuth } from "~/hooks/useAuth";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <RequireAuth>
      <Header />
      <HomePortal />
    </RequireAuth>
  );
}

type DeckCard = { id: string; slug: string; companyName: string; industry: string; tagline: string; colors: { amber: string; teal: string } };

function HomePortal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: decks, isLoading } = trpc.deck.list.useQuery();
  const utils = trpc.useUtils();
  const archiveDeck = trpc.deck.archive.useMutation();
  const canCreate = !!user && can(user.role, "createDeck");
  const canEdit = !!user && can(user.role, "editDeck");
  const canDuplicate = !!user && can(user.role, "createDeck");

  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = React.useState<DeckCard | null>(null);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!openMenuId) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenuId]);

  async function onRemove(deck: DeckCard) {
    setOpenMenuId(null);
    setRemoveError(null);
    try {
      await archiveDeck.mutateAsync({ id: deck.id });
      await utils.deck.list.invalidate();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Couldn't remove that deck.");
    }
  }

  return (
    <div className="home-view">
      <div className="home-wordmark">
        <span className="dot" />
        Aeon
      </div>
      <div className="home-controls">
        <h1 className="home-title" style={{ margin: 0 }}>
          Your decks
        </h1>
        {canCreate && (
          <Link to="/decks/new" className="new-deck-btn">
            ＋ New Deck
          </Link>
        )}
      </div>
      <p className="home-sub">Pick a deck to present, capture Discovery Notes, and quote live.</p>
      {removeError && <div className="auth-error">{removeError}</div>}

      {isLoading && <div className="empty-state">Loading decks…</div>}
      {!isLoading && decks?.length === 0 && <div className="empty-state">No decks yet.</div>}

      <div className="deck-grid">
        {decks?.map((deck: DeckCard) => (
          <div key={deck.id} className="deck-card" onClick={() => navigate({ to: "/decks/$slug", params: { slug: deck.slug } })}>
            {(canEdit || canDuplicate) && (
              <div className="deck-card-menu" ref={openMenuId === deck.id ? menuRef : undefined} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="deck-card-menu-btn"
                  aria-label={`Actions for ${deck.companyName}`}
                  onClick={() => setOpenMenuId((cur) => (cur === deck.id ? null : deck.id))}
                >
                  ⋮
                </button>
                {openMenuId === deck.id && (
                  <div className="deck-card-menu-dropdown">
                    {canEdit && (
                      <Link
                        to="/decks/$slug/edit"
                        params={{ slug: deck.slug }}
                        className="deck-card-menu-item"
                        onClick={() => setOpenMenuId(null)}
                      >
                        Edit
                      </Link>
                    )}
                    {canDuplicate && (
                      <button
                        type="button"
                        className="deck-card-menu-item"
                        onClick={() => {
                          setOpenMenuId(null);
                          setDuplicateTarget(deck);
                        }}
                      >
                        Duplicate
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" className="deck-card-menu-item deck-card-menu-item-danger" onClick={() => onRemove(deck)}>
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="dc-badge" style={{ background: `linear-gradient(135deg, ${deck.colors.teal}, ${deck.colors.amber})` }}>
              {deck.companyName
                .split(" ")
                .map((w: string) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <div className="dc-industry">{deck.industry}</div>
              <div className="dc-name">{deck.companyName}</div>
            </div>
            <div className="dc-tagline">{deck.tagline}</div>
            <div className="dc-meta">{deck.industry}</div>
          </div>
        ))}
      </div>

      {duplicateTarget && (
        <DuplicateDeckDialog
          slug={duplicateTarget.slug}
          sourceName={duplicateTarget.companyName}
          onClose={() => setDuplicateTarget(null)}
          onDuplicated={(newSlug) => {
            setDuplicateTarget(null);
            utils.deck.list.invalidate();
            navigate({ to: "/decks/$slug/edit", params: { slug: newSlug } });
          }}
        />
      )}
    </div>
  );
}
