import * as React from "react";
import { tokenStore } from "~/lib/token-store";
import { trpc } from "~/lib/trpc";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authed" | "anonymous";
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<Pick<AuthUser, "name" | "email">>) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [status, setStatus] = React.useState<"loading" | "authed" | "anonymous">("loading");

  const loginMutation = trpc.auth.login.useMutation();
  const refreshMutation = trpc.auth.refresh.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  React.useEffect(() => {
    // On first load, try to silently exchange the httpOnly refresh cookie (if any) for a
    // fresh access token, so a page reload doesn't force a re-login.
    refreshMutation
      .mutateAsync()
      .then((res) => {
        tokenStore.set(res.accessToken);
        setUser(res.user);
        setStatus("authed");
      })
      .catch(() => {
        tokenStore.set(null);
        setUser(null);
        setStatus("anonymous");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const res = await loginMutation.mutateAsync({ email, password });
      tokenStore.set(res.accessToken);
      setUser(res.user);
      setStatus("authed");
    },
    [loginMutation]
  );

  const logout = React.useCallback(async () => {
    await logoutMutation.mutateAsync().catch(() => undefined);
    tokenStore.set(null);
    setUser(null);
    setStatus("anonymous");
  }, [logoutMutation]);

  // Patches the locally-cached user after Profile & Settings saves a change, so the
  // Header/other screens reflect it immediately without forcing a full refresh-token
  // round trip (the JWT itself still carries the old email/name until the next refresh —
  // fine for display purposes, and it's re-signed with the new values then anyway).
  const updateUser = React.useCallback((patch: Partial<Pick<AuthUser, "name" | "email">>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = React.useMemo(() => ({ user, status, login, logout, updateUser }), [user, status, login, logout, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
