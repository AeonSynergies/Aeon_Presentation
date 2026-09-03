import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@aeon/database";
import { findDeckTemplate, type DeckConfig } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import { inspect } from "node:util";
import { z } from "zod";
import { deckConfigSchema, reportTemplateSchema } from "../lib/deck-config-schema.js";
import { AI_DRAFT_SYSTEM_PROMPT, AI_DRAFT_TOOL_SCHEMA, aiDraftInputSchema, buildTemplateGroundingBlock, normalizeDraft } from "../lib/ai-draft.js";
import { AI_REPORT_DRAFT_SYSTEM_PROMPT, AI_REPORT_DRAFT_TOOL_SCHEMA, aiReportDraftInputSchema } from "../lib/ai-report-draft.js";
import { assertE2eTestAccess } from "../lib/e2e-test-guard.js";
import { publicProcedure, requirePermission, router } from "../trpc.js";

// A "Connection error." from the Anthropic SDK is APIConnectionError wrapping Node's
// `TypeError: fetch failed`, which itself wraps the real network error (ECONNREFUSED,
// ETIMEDOUT, ENOTFOUND, etc. — each a different root cause: security group, routing/
// timeout, or DNS, respectively). Walking .cause chains by hand here rather than trusting
// console.error(err)'s default formatting to survive CloudWatch's line/byte capture intact.
function deepestErrnoCode(err: unknown): string | undefined {
  let current = err;
  let code: string | undefined;
  for (let i = 0; i < 10 && current instanceof Error; i++) {
    const maybeCode = (current as NodeJS.ErrnoException).code;
    if (maybeCode) code = maybeCode;
    current = current.cause;
  }
  return code;
}

// AI-assisted deck drafting (Phase 3a). This mutation NEVER writes to the decks table —
// it only ever returns a DeckConfig-shaped draft for the client to load into the exact
// same wizard state Phase 2b's manual/clone flows use. The only way a draft becomes a
// real deck is the human clicking Save in the wizard, which calls deck.create — same
// mutation, same server-side deckConfigSchema validation, same requirePermission gate, as
// every other deck-creation path. There is no code path here that persists anything.

const MAX_REQUESTS_PER_WINDOW = 5;
const WINDOW_MINUTES = 60;
const PROMPT_MIN_LEN = 10;
const PROMPT_MAX_LEN = 800;

// Shared by draftDeck and draftReport below — one combined budget across both kinds of AI
// request, checked BEFORE calling Anthropic so a capped user's request never reaches (and
// never costs) the real API call, and recorded before the call so a failed/garbled
// generation still counts against the limit instead of being a free retry. A shared
// Postgres ledger, not an in-memory counter, so the limit holds across server restarts and
// — in production — across every App Runner instance, not just whichever one handled this
// request.
async function checkAndRecordAiRateLimit(userId: string, buildManuallyLabel: string): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const recentCount = await prisma.aiDraftRequest.count({ where: { userId, createdAt: { gte: windowStart } } });
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `You've hit the AI drafting limit (${MAX_REQUESTS_PER_WINDOW} per ${WINDOW_MINUTES} minutes). Try again later, or ${buildManuallyLabel}.`,
    });
  }
  await prisma.aiDraftRequest.create({ data: { userId } });
}

const REFERENCE_IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const REPORT_DESCRIPTION_MIN_LEN = 10;
const REPORT_DESCRIPTION_MAX_LEN = 800;
// ~5MB of raw image bytes, base64-encoded (base64 runs ~4/3 the size of the original) —
// comfortably under Anthropic's own per-image size guidance.
const REFERENCE_IMAGE_MAX_BASE64_LEN = 7_000_000;

export const aiRouter = router({
  draftDeck: requirePermission("createDeck")
    .input(
      z.object({
        prompt: z.string().trim().min(PROMPT_MIN_LEN, "Tell us a bit more about the client.").max(PROMPT_MAX_LEN, `Keep the description under ${PROMPT_MAX_LEN} characters.`),
        // Phase 5c: optional structural grounding — a DECK_TEMPLATES key the user picked
        // in the wizard's "Draft with AI" card. Silently ignored if unknown (e.g. a stale
        // client build after a template is renamed/removed) rather than rejecting the
        // whole request over a cosmetic mismatch.
        templateKey: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // The Anthropic API key never leaves this process — it's read from an env var
      // (SSM SecureString in production, see infra/aws/deploy.sh) and only ever used
      // server-side to call api.anthropic.com. The browser never sees it and never talks
      // to Anthropic directly; it only ever calls this tRPC mutation.
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI drafting isn't configured on this server yet." });
      }

      await checkAndRecordAiRateLimit(ctx.user.id, "build this deck manually");

      // TEMPORARY DIAGNOSTIC (Phase 3a "Connection error" investigation): the SDK's own
      // default (10 min, and 2 retries) already dwarfs any plausible latency the VPC
      // connector's Hyperplane ENI path adds — but that default governs the overall
      // request's abort timer, not the OS-level TCP connect() that actually produced the
      // ETIMEDOUT seen in production. An explicit, generous timeout here can't fix a
      // connect()-level timeout (that's kernel-governed, below any application timeout's
      // reach), but it's a cheap, safe way to confirm or rule that reasoning out directly
      // rather than by theory. Revert to new Anthropic() once this either fails identically
      // (theory confirmed — connect()-level issue, look elsewhere) or succeeds (theory
      // wrong — this was genuinely a timeout tuning problem).
      const template = input.templateKey ? findDeckTemplate(input.templateKey) : undefined;
      const userMessage = template ? `${buildTemplateGroundingBlock(template)}\n\nNew client to draft for:\n${input.prompt}` : input.prompt;

      const anthropic = new Anthropic({ timeout: 90_000 });
      let response: Anthropic.Message;
      try {
        response = await anthropic.messages.create({
          model: "claude-sonnet-5",
          // A full draft (up to 7 services plus all static content) can run several
          // thousand output tokens; 4096 was cutting it close enough to risk a truncated
          // tool call that never resolves to a usable submit_deck_draft input.
          max_tokens: 8000,
          system: AI_DRAFT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
          tools: [
            {
              name: "submit_deck_draft",
              description: "Submit the complete drafted deck.",
              input_schema: AI_DRAFT_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: "submit_deck_draft" },
        });
      } catch (err) {
        // err.message alone (e.g. the Anthropic SDK's generic "Connection error.") hides
        // the actual cause — DNS/TCP/TLS failures all produce that same message. The errno
        // code goes out as its own dedicated line FIRST — guaranteed short, so it survives
        // even if CloudWatch's capture cuts off the fuller dump that follows.
        console.error(`ai.draftDeck: Anthropic call failed [network error code: ${deepestErrnoCode(err) ?? "none found"}]`);
        console.error("ai.draftDeck: full error detail:", inspect(err, { depth: null }));

        // TEMPORARY DIAGNOSTIC: a plain request to a different external host, through this
        // exact same egress path (same container, same NAT Gateway, same VPC connector),
        // right after the Anthropic call just failed. If THIS succeeds, the problem is
        // specific to reaching Anthropic's IPs (possibly an MTU/PMTU blackhole on that
        // route, or something else Anthropic-specific) rather than a general egress block —
        // every generic AWS networking control was already confirmed open/correct.
        try {
          const start = Date.now();
          const res = await fetch("https://api.github.com", { signal: AbortSignal.timeout(15_000) });
          console.error(`ai.draftDeck: comparison request to api.github.com succeeded — status ${res.status}, ${Date.now() - start}ms`);
        } catch (compareErr) {
          console.error(
            `ai.draftDeck: comparison request to api.github.com FAILED [network error code: ${deepestErrnoCode(compareErr) ?? "none found"}]`,
            inspect(compareErr, { depth: null }),
          );
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? `AI drafting request failed: ${err.message}` : "AI drafting request failed.",
        });
      }

      const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      if (!toolUse) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI didn't return a draft — please try again." });
      }

      const parsedInput = aiDraftInputSchema.safeParse(toolUse.input);
      if (!parsedInput.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI produced an incomplete draft — please try again." });
      }

      const { config, aiSuggestedFields } = normalizeDraft(parsedInput.data);

      // Final gate: the exact same schema deck.create/deck.update trust for a human-built
      // draft. A draft that fails this never reaches the wizard as if it were valid.
      const validated = deckConfigSchema.safeParse(config);
      if (!validated.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI produced a draft that didn't pass validation — please try again." });
      }

      return { config: validated.data as DeckConfig, aiSuggestedFields };
    }),

  // AI-generated custom report layout (Services step — "Create with AI"). See
  // ai-report-draft.ts for why this returns freeform HTML/CSS rather than a fixed schema
  // of fields like draftDeck above — the whole point is a report shape that isn't
  // constrained to Templates A/B/C. Shares draftDeck's rate-limit ledger (one combined
  // budget across both kinds of AI request) and the same "never persists anything" model:
  // this only ever returns a template for the wizard's own draft state, exactly like
  // draftDeck's config — the only way it becomes part of a real deck is the human clicking
  // Save, which validates it again server-side via deckConfigSchema either way.
  draftReport: requirePermission("createDeck")
    .input(
      z.object({
        description: z
          .string()
          .trim()
          .min(REPORT_DESCRIPTION_MIN_LEN, "Tell us a bit more about the report.")
          .max(REPORT_DESCRIPTION_MAX_LEN, `Keep the description under ${REPORT_DESCRIPTION_MAX_LEN} characters.`),
        referenceImageBase64: z.string().max(REFERENCE_IMAGE_MAX_BASE64_LEN, "That reference image is too large.").optional(),
        referenceImageMediaType: z.enum(REFERENCE_IMAGE_MEDIA_TYPES).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI drafting isn't configured on this server yet." });
      }

      await checkAndRecordAiRateLimit(ctx.user.id, "add this report manually");

      const messageContent: (Anthropic.ImageBlockParam | Anthropic.TextBlockParam)[] = [];
      if (input.referenceImageBase64 && input.referenceImageMediaType) {
        messageContent.push({ type: "image", source: { type: "base64", media_type: input.referenceImageMediaType, data: input.referenceImageBase64 } });
      }
      messageContent.push({ type: "text", text: input.description });

      const anthropic = new Anthropic({ timeout: 90_000 });
      let response: Anthropic.Message;
      try {
        response = await anthropic.messages.create({
          model: "claude-sonnet-5",
          max_tokens: 4000,
          system: AI_REPORT_DRAFT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: messageContent }],
          tools: [
            {
              name: "submit_report_draft",
              description: "Submit the custom report layout.",
              input_schema: AI_REPORT_DRAFT_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: "submit_report_draft" },
        });
      } catch (err) {
        console.error("ai.draftReport: Anthropic call failed:", inspect(err, { depth: null }));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? `AI report generation failed: ${err.message}` : "AI report generation failed.",
        });
      }

      const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      if (!toolUse) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI didn't return a report — please try again." });
      }

      const parsed = aiReportDraftInputSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI produced an incomplete report — please try again." });
      }

      // Final gate: the exact same per-kind schema deck.create/deck.update trust for a
      // human-authored reportSlide.
      const validated = reportTemplateSchema.safeParse({ kind: "custom-html", ...parsed.data });
      if (!validated.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI produced a report that didn't pass validation — please try again." });
      }

      return parsed.data;
    }),

  // Test-support only — lets the live E2E suite zero out a QA fixture account's rate-limit
  // ledger before probing it, so "the first N requests succeed, the N+1th is rejected" is
  // deterministic regardless of how recently (or how many times) this suite last ran within
  // the same rolling window. Same secret/domain gate as auth.e2eRequestToken; deletes rows
  // from the exact table draftDeck's rate check reads, nothing else.
  e2eResetRateLimit: publicProcedure
    .input(z.object({ email: z.email(), secret: z.string() }))
    .mutation(async ({ input }) => {
      assertE2eTestAccess(input.email, input.secret);
      const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      await prisma.aiDraftRequest.deleteMany({ where: { userId: user.id } });
      return { ok: true };
    }),
});
