import { Link, createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { trpc } from "~/lib/trpc";

// Forgot Password — request step. Always shows the same confirmation regardless of
// whether the email matched a real account (auth.requestPasswordReset never reveals
// that either) — the point is that this screen can't leak who has an account.
export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const requestReset = trpc.auth.requestPasswordReset.useMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await requestReset.mutateAsync({ email });
    setSubmitted(true);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="home-wordmark" style={{ marginBottom: 26 }}>
          <span className="dot" />
          Aeon
        </div>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Reset your password</h1>
        <p style={{ color: "var(--fog)", fontSize: 12.5, margin: "0 0 22px", lineHeight: 1.5 }}>
          Enter the email on your account and we'll send you a link to set a new password.
        </p>

        {submitted ? (
          <div className="auth-success">If that email exists, we've sent a reset link — check your inbox.</div>
        ) : (
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
            <button className="btn-primary" type="submit" disabled={requestReset.isPending}>
              {requestReset.isPending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link to="/login" style={{ fontSize: 12.5, color: "var(--fog)" }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
