import { can } from "@aeon/types";
import { createFileRoute } from "@tanstack/react-router";
import { DeckWizard } from "~/components/builder/DeckWizard";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useAuth } from "~/hooks/useAuth";

// Static /decks/new wins over the dynamic /decks/$slug route in TanStack Router's
// ranking, so "new" is never treated as a deck slug — and deck.create reserves "new"
// (RESERVED_SLUGS) so a deck can never be created at the slug this route shadows.
export const Route = createFileRoute("/decks/new")({
  component: NewDeckPage,
});

function NewDeckPage() {
  return (
    <RequireAuth>
      <NewDeckGate />
    </RequireAuth>
  );
}

// UI-layer gate — the real enforcement is deck.create's requirePermission("createDeck")
// on the server. This just avoids walking someone without the permission through the
// whole wizard only to have the very last step reject them.
function NewDeckGate() {
  const { user } = useAuth();
  if (!user) return null;
  if (!can(user.role, "createDeck")) {
    return (
      <div className="auth-shell">
        <span style={{ color: "var(--danger)", fontFamily: "var(--mono)", fontSize: "12px" }}>
          Your role doesn't include creating decks.
        </span>
      </div>
    );
  }
  return <DeckWizard />;
}
