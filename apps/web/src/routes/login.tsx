import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useAuth } from "~/hooks/useAuth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (status === "authed") navigate({ to: "/" });
  }, [status, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="home-wordmark" style={{ marginBottom: 26 }}>
          <span className="dot" />
          Aeon
        </div>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Sign in</h1>
        <p style={{ color: "var(--fog)", fontSize: 12.5, margin: "0 0 22px", lineHeight: 1.5 }}>
          Sign in to view and present your decks.
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="q-block">
            <span className="field-label" style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--fog)" }}>
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
          <div className="q-block">
            <span className="field-label" style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--fog)" }}>
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
