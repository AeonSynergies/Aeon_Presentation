import { createFileRoute } from "@tanstack/react-router";
import { DeckWizard } from "~/components/builder/DeckWizard";
import { RequireAuth } from "~/components/layout/RequireAuth";

// Static /decks/new wins over the dynamic /decks/$slug route in TanStack Router's
// ranking, so "new" is never treated as a deck slug — and deck.create reserves "new"
// (RESERVED_SLUGS) so a deck can never be created at the slug this route shadows.
export const Route = createFileRoute("/decks/new")({
  component: NewDeckPage,
});

function NewDeckPage() {
  return (
    <RequireAuth>
      <DeckWizard />
    </RequireAuth>
  );
}
