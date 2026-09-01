import crypto from "node:crypto";
import { prisma } from "@aeon/database";
import { sendEmail } from "./email.js";

// The single primitive behind both "Forgot password" and "New user invitation" — a
// single-use, expiring token whose raw value is only ever emailed, never persisted (only
// its SHA-256 hash is stored, same pattern as RefreshToken). `purpose` only changes which
// email copy is sent; the token itself is redeemed identically by auth.setPasswordWithToken
// regardless of why it was issued.

const DEFAULT_TTL_MS = 45 * 60 * 1000; // 45 minutes

const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";

export function hashPasswordSetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function emailCopyFor(purpose: "RESET" | "INVITE", name: string, link: string): { subject: string; text: string; html: string } {
  if (purpose === "INVITE") {
    return {
      subject: "You've been invited to Aeon",
      text: [
        `Hi ${name},`,
        "",
        "An Aeon Admin has created an account for you. Set your password to finish signing up:",
        link,
        "",
        "Already sign in to your company Microsoft account with this same email address? You can skip password setup entirely — just use \"Sign in with Microsoft\" on the login page instead.",
        "",
        "This link expires in 45 minutes and can only be used once.",
      ].join("\n"),
      html: [
        `<p>Hi ${name},</p>`,
        `<p>An Aeon Admin has created an account for you. Set your password to finish signing up:</p>`,
        `<p><a href="${link}">${link}</a></p>`,
        `<p>Already sign in to your company Microsoft account with this same email address? You can skip password setup entirely — just use <strong>"Sign in with Microsoft"</strong> on the login page instead.</p>`,
        `<p>This link expires in 45 minutes and can only be used once.</p>`,
      ].join("\n"),
    };
  }
  return {
    subject: "Reset your Aeon password",
    text: [
      `Hi ${name},`,
      "",
      "We received a request to reset your Aeon password. Set a new one here:",
      link,
      "",
      "If you didn't request this, you can safely ignore this email — your password won't change.",
      "",
      "This link expires in 45 minutes and can only be used once.",
    ].join("\n"),
    html: [
      `<p>Hi ${name},</p>`,
      `<p>We received a request to reset your Aeon password. Set a new one here:</p>`,
      `<p><a href="${link}">${link}</a></p>`,
      `<p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      `<p>This link expires in 45 minutes and can only be used once.</p>`,
    ].join("\n"),
  };
}

/** The fast half: generates a token and persists only its hash — a single local DB write,
 * safe to await from a user-facing mutation without coupling its response time to SES. */
async function createPasswordSetToken(
  user: { id: string },
  purpose: "RESET" | "INVITE",
  ttlMs: number
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashPasswordSetToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.passwordSetToken.create({ data: { tokenHash, userId: user.id, purpose, expiresAt } });
  return token;
}

/** The slow half: emails the real link for a token already created by
 * createPasswordSetToken. Never throws on failure — the token is already valid and
 * stored, so a transient SES issue shouldn't be treated as this call failing; it's
 * reported back in the result instead. */
async function sendPasswordSetEmail(
  user: { email: string; name: string },
  purpose: "RESET" | "INVITE",
  token: string
): Promise<{ messageId: string | null; emailError: string | null }> {
  const link = `${WEB_ORIGIN}/reset-password?token=${token}`;
  const { subject, text, html } = emailCopyFor(purpose, user.name, link);
  try {
    const result = await sendEmail({ to: user.email, subject, text, html });
    return { messageId: result.messageId, emailError: null };
  } catch (err) {
    const emailError = err instanceof Error ? err.message : String(err);
    console.error(`Failed to send ${purpose.toLowerCase()} email to ${user.email}:`, err);
    return { messageId: null, emailError };
  }
}

/** Generates a token, persists only its hash, emails the real link, and reports what
 * happened — the caller decides how much of that to surface (the public reset/invite
 * paths discard it entirely to avoid leaking anything; the E2E test-support endpoint
 * returns it directly). Awaits the send, so only call this where the caller actually
 * needs messageId/emailError — otherwise use requestPasswordSetToken below, which doesn't
 * make a user-facing response wait on a network call to SES it doesn't need the result of. */
export async function createAndSendPasswordSetToken(
  user: { id: string; email: string; name: string },
  purpose: "RESET" | "INVITE",
  ttlMs: number = DEFAULT_TTL_MS
): Promise<{ token: string; messageId: string | null; emailError: string | null }> {
  const token = await createPasswordSetToken(user, purpose, ttlMs);
  const { messageId, emailError } = await sendPasswordSetEmail(user, purpose, token);
  return { token, messageId, emailError };
}

/** Same token + email as createAndSendPasswordSetToken, but for callers (the public
 * reset/invite paths) that discard the result anyway: persists the token and returns as
 * soon as that DB write completes, firing the SES send in the background instead of
 * making the mutation's response wait on it. */
export async function requestPasswordSetToken(
  user: { id: string; email: string; name: string },
  purpose: "RESET" | "INVITE",
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  const token = await createPasswordSetToken(user, purpose, ttlMs);
  void sendPasswordSetEmail(user, purpose, token);
}
