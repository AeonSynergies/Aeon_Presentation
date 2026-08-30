/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { AuthProvider } from "~/hooks/useAuth";
import { createTrpcClient, trpc } from "~/lib/trpc";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Aeon Presentation Platform" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  const [trpcClient] = React.useState(() => createTrpcClient());

  // Teams tab readiness (Phase 4a Part 1) — this app is otherwise unaware of Teams; when
  // it happens to be running inside a real Teams client (see infra/teams/manifest.json),
  // Teams withholds the tab's "loading" spinner until app.initialize() resolves, so a
  // Teams-hosted tab that never calls this would look stuck. Outside Teams (every browser
  // visit today) the SDK's handshake with a Teams host simply never completes, so this is
  // a harmless, silently-ignored no-op — nothing here has been exercised inside a real
  // Teams client yet (blocked on real Teams access, see the root README).
  React.useEffect(() => {
    import("@microsoft/teams-js")
      .then(({ app }) => app.initialize())
      .catch(() => undefined);
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <div className="app">{children}</div>
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
        <Scripts />
      </body>
    </html>
  );
}
