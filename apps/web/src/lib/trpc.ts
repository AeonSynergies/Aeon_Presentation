import type { AppRouter } from "@aeon/api/src/routers/_app.js";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { tokenStore } from "./token-store";

export const trpc = createTRPCReact<AppRouter>();

// Different ports on localhost are still "same-site" for SameSite=Lax cookie purposes
// (the registrable domain is the same), so talking to the API directly — no dev proxy —
// works fine locally. Production sets VITE_API_URL to the deployed API's own origin,
// which is genuinely cross-site; see the sameSite:"none" cookie config in apps/api.
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${apiUrl}/api/trpc`,
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
        headers() {
          const token = tokenStore.get();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
