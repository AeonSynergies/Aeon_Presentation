import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Header } from "~/components/layout/Header";
import { RequireAuth } from "~/components/layout/RequireAuth";
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

function HomePortal() {
  const navigate = useNavigate();
  const { data: decks, isLoading } = trpc.deck.list.useQuery();

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
        <Link to="/decks/new" className="new-deck-btn">
          ＋ New Deck
        </Link>
      </div>
      <p className="home-sub">Pick a deck to present, capture Discovery Notes, and quote live.</p>

      {isLoading && <div className="empty-state">Loading decks…</div>}
      {!isLoading && decks?.length === 0 && <div className="empty-state">No decks yet.</div>}

      <div className="deck-grid">
        {decks?.map((deck: { id: string; slug: string; companyName: string; industry: string; tagline: string; colors: { amber: string; teal: string } }) => (
          <div key={deck.id} className="deck-card" onClick={() => navigate({ to: "/decks/$slug", params: { slug: deck.slug } })}>
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
    </div>
  );
}
