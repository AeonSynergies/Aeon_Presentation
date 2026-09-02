import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";

// Shared gate for every test-support-only tRPC procedure (auth.e2eRequestToken,
// ai.e2eResetRateLimit, ...): a server-only shared secret (process.env.E2E_TEST_SECRET,
// generated once by infra/aws/deploy.sh) AND restriction to @aeonqa.internal addresses, so
// even a leaked secret can only ever touch QA fixture accounts. Throws NOT_FOUND (not
// FORBIDDEN) on any gate failure so it reveals nothing about why.
export function assertE2eTestAccess(email: string, secret: string): void {
  const expected = process.env.E2E_TEST_SECRET;
  const provided = Buffer.from(secret);
  const expectedBuf = Buffer.from(expected ?? "");
  const secretMatches = !!expected && provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
  if (!secretMatches || !email.toLowerCase().endsWith("@aeonqa.internal")) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}
