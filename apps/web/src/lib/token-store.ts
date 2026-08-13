// In-memory-only access token holder. Deliberately not persisted to localStorage — the
// refresh token (httpOnly cookie, set by the API) is what survives a reload; this just
// lets the tRPC client's headers() callback read the current access token synchronously.
type Listener = (token: string | null) => void;

let currentToken: string | null = null;
const listeners = new Set<Listener>();

export const tokenStore = {
  get(): string | null {
    return currentToken;
  },
  set(token: string | null) {
    currentToken = token;
    listeners.forEach((l) => l(token));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
