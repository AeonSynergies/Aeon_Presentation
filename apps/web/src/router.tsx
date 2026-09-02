import { createRouter } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { routeTree } from "./routeTree.gen";

// Each route's component is its own lazily-loaded chunk (see routeTree.gen.ts) — on a
// client-side navigation, TanStack Router's default pendingMs (1000ms) leaves the
// PREVIOUS route's component mounted and fully interactive while the next one's chunk is
// still being fetched. A selector/user that can't tell the two pages apart (e.g. both
// /login and /forgot-password render an `input[type="email"]`) can then interact with
// that stale, about-to-be-unmounted page — a real network hiccup of well under a second
// is enough to hit this. Dropping pendingMs to 0 replaces the outgoing page with a
// neutral, non-interactive placeholder the instant a navigation starts, so there's never
// a window where the wrong page's inputs are the ones on screen.
function RoutePending() {
  return (
    <div className="auth-shell">
      <span style={{ color: "var(--fog)", fontFamily: "var(--mono)", fontSize: "12px" }}>Loading…</span>
    </div>
  );
}

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
