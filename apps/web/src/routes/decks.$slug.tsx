import { createFileRoute } from "@tanstack/react-router";
import { DeckPlayer } from "~/components/deck/DeckPlayer";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/decks/$slug")({
  component: DeckPage,
});

function DeckPage() {
  const { slug } = Route.useParams();
  return (
    <RequireAuth>
      <DeckLoader slug={slug} />
    </RequireAuth>
  );
}

function DeckLoader({ slug }: { slug: string }) {
  const { data, isLoading, error } = trpc.deck.getBySlug.useQuery({ slug });

  if (isLoading) {
    return (
      <div className="auth-shell">
        <span style={{ color: "var(--fog)", fontFamily: "var(--mono)", fontSize: "12px" }}>Loading deck…</span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="auth-shell">
        <span style={{ color: "var(--danger)", fontFamily: "var(--mono)", fontSize: "12px" }}>Deck not found.</span>
      </div>
    );
  }
  return <DeckPlayer deck={data.config} dbId={data.dbId} />;
}
