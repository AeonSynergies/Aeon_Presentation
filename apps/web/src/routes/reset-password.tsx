import { Link, createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { trpc } from "~/lib/trpc";

// The redemption screen for BOTH flows that hand someone a token via email — Forgot
// Password's reset link and a new user's invitation link both land here, since they're
// the exact same single-use token mechanism server-side (auth.setPasswordWithToken).
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const setPassword = trpc.auth.setPasswordWithToken.useMutation();

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-error">This link is missing its token. Request a new password reset or invitation.</div>
          <Link to="/login" style={{ fontSize: 12.5, color: "var(--fog)" }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    try {
      await setPassword.mutateAsync({ token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This link is invalid or has expired.");
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="home-wordmark" style={{ marginBottom: 26 }}>
          <span className="dot" />
          Aeon
        </div>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Set your password</h1>
        <p style={{ color: "var(--fog)", fontSize: 12.5, margin: "0 0 22px", lineHeight: 1.5 }}>
          Choose a password to finish signing in.
        </p>

        {done ? (
          <>
            <div className="auth-success">Password set — you can sign in with it now.</div>
            <Link className="btn-primary" to="/login" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            {error && <div className="auth-error">{error}</div>}
            <div className="q-block">
              <span className="field-label" style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--fog)" }}>
                New password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ marginTop: 6 }}
              />
            </div>
            <div className="q-block">
              <span className="field-label" style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--fog)" }}>
                Confirm password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ marginTop: 6 }}
              />
            </div>
            <button className="btn-primary" type="submit" disabled={setPassword.isPending}>
              {setPassword.isPending ? "Setting password…" : "Set password"}
            </button>
          </form>
        )}

        {!done && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <Link to="/login" style={{ fontSize: 12.5, color: "var(--fog)" }}>
              ← Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
