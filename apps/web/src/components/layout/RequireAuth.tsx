import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useAuth } from "~/hooks/useAuth";

/** Client-side login gate. No protected data is fetched (and nothing renders) until the
 * silent-refresh check resolves, so a logged-out visitor never sees deck content — see
 * CLAUDE.md Phase 1 requirement: "logged in or not is the only check that matters." */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (status === "anonymous") {
      navigate({ to: "/login" });
    }
  }, [status, navigate]);

  if (status !== "authed") {
    return (
      <div className="auth-shell">
        <span style={{ color: "var(--fog)", fontFamily: "var(--mono)", fontSize: "12px" }}>Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
