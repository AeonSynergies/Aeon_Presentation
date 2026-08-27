import { can } from "@aeon/types";
import { createFileRoute } from "@tanstack/react-router";
import { DeckWizard } from "~/components/builder/DeckWizard";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useAuth } from "~/hooks/useAuth";
import { trpc } from "~/lib/trpc";

export const Route = createFileRoute("/decks/$slug_/edit")({
  component: EditDeckPage,
});

function EditDeckPage() {
  const { slug } = Route.useParams();
  return (
    <RequireAuth>
      <EditDeckGate slug={slug} />
    </RequireAuth>
  );
}

function EditDeckGate({ slug }: { slug: string }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!can(user.role, "editDeck")) {
    return (
      <div className="auth-shell">
        <span style={{ color: "var(--danger)", fontFamily: "var(--mono)", fontSize: "12px" }}>
          Your role doesn't include editing decks.
        </span>
      </div>
    );
  }
  return <EditDeckLoader slug={slug} />;
}

// Waits for the existing deck to load before mounting DeckWizard, rather than passing an
// initialDraft prop that arrives after mount — the wizard's draft state is seeded once
// from that prop (useState's lazy-init pattern), so mounting only after data is ready is
// what actually gets it in, not a later re-render with a filled-in prop.
function EditDeckLoader({ slug }: { slug: string }) {
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
  return <DeckWizard key={slug} editingSlug={slug} initialDraft={data.config} />;
}
