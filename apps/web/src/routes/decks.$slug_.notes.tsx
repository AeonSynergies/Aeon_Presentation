import type { DeckConfig } from "@aeon/types";
import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryNotesPanel } from "~/components/discovery/DiscoveryNotesPanel";
import { deckColorVars } from "~/components/deck/deckColors";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useNotesWindowSession } from "~/hooks/useNotesWindowSession";
import { trpc } from "~/lib/trpc";

// Present mode's popped-out Discovery Notes window (see DeckPlayer.tsx). Opened via
// window.open, never as a normal in-app navigation — so this route intentionally renders
// none of the app's usual chrome (no Home link, no other deck actions), just the notes
// panel itself, full page. Filename uses the same trailing-underscore trick as
// decks.$slug_.edit.tsx to escape TanStack Router's auto-nesting under /decks/$slug.
export const Route = createFileRoute("/decks/$slug_/notes")({
  validateSearch: (search: Record<string, unknown>) => ({
    meetingId: typeof search.meetingId === "string" ? search.meetingId : "",
  }),
  component: NotesWindowPage,
});

function NotesWindowPage() {
  const { slug } = Route.useParams();
  const { meetingId } = Route.useSearch();
  return (
    <RequireAuth>
      <NotesWindowLoader slug={slug} meetingId={meetingId} />
    </RequireAuth>
  );
}

function NotesWindowLoader({ slug, meetingId }: { slug: string; meetingId: string }) {
  const { data, isLoading, error } = trpc.deck.getBySlug.useQuery({ slug });

  if (!meetingId) {
    return <NotesWindowMessage text="No meeting to sync with — open this from the Discovery Notes control in Present mode." isError />;
  }
  if (isLoading) return <NotesWindowMessage text="Loading…" />;
  if (error || !data) return <NotesWindowMessage text="Deck not found." isError />;

  return <NotesWindowContent deck={data.config} meetingId={meetingId} />;
}

function NotesWindowContent({ deck, meetingId }: { deck: DeckConfig; meetingId: string }) {
  const { state, setState, clientName, setClientName, hydrated, notFound } = useNotesWindowSession(meetingId);

  if (notFound) return <NotesWindowMessage text="This meeting session could not be found." isError />;
  if (!hydrated) return <NotesWindowMessage text="Loading…" />;

  return (
    <div style={{ ...deckColorVars(deck.colors), minHeight: "100vh" }}>
      <div className="topbar" style={{ position: "static" }}>
        <div className="wordmark">
          <span className="sub">DISCOVERY NOTES · {deck.companyName.toUpperCase()}</span>
        </div>
      </div>
      <DiscoveryNotesPanel deck={deck} state={state} setState={setState} clientName={clientName} setClientName={setClientName} />
    </div>
  );
}

function NotesWindowMessage({ text, isError }: { text: string; isError?: boolean }) {
  return (
    <div className="auth-shell">
      <span style={{ color: isError ? "var(--danger)" : "var(--fog)", fontFamily: "var(--mono)", fontSize: "12px" }}>{text}</span>
    </div>
  );
}
