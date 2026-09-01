import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useAuth } from "~/hooks/useAuth";
import { apiUrl, trpc } from "~/lib/trpc";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

// Query-param errors the Microsoft OAuth callback (apps/api/src/routes/microsoft-auth-routes.ts)
// redirects back with on failure — read directly off the URL rather than a TanStack Router
// search schema, since this is the one place in the app that needs it and only on load.
function microsoftErrorMessage(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) return null;
  if (error === "no_account") {
    const email = params.get("email");
    return `No account found for ${email ?? "that Microsoft email"} — ask an Admin to create one in Team Management first.`;
  }
  if (error === "microsoft_not_configured") return "Sign in with Microsoft isn't set up on this server yet.";
  return "Sign in with Microsoft didn't work — please try again, or sign in with email and password.";
}

function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const { data: authConfig } = trpc.auth.config.useQuery();

  React.useEffect(() => {
    const msg = microsoftErrorMessage();
    if (msg) setError(msg);
  }, []);

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
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link to="/forgot-password" style={{ fontSize: 12.5, color: "var(--fog)" }}>
            Forgot password?
          </Link>
        </div>
        {authConfig?.microsoftEnabled && (
          <>
            <div className="auth-divider" style={{ margin: "18px 0", textAlign: "center", color: "var(--fog)", fontSize: 11.5 }}>
              or
            </div>
            <a className="btn-secondary" href={`${apiUrl}/api/auth/microsoft/start`} style={{ display: "block", textAlign: "center" }}>
              Sign in with Microsoft
            </a>
          </>
        )}
      </div>
    </div>
  );
}
