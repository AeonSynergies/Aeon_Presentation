import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@aeon/database";
import type { DeckConfig } from "@aeon/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deckConfigSchema } from "../lib/deck-config-schema.js";
import { AI_DRAFT_SYSTEM_PROMPT, AI_DRAFT_TOOL_SCHEMA, aiDraftInputSchema, normalizeDraft } from "../lib/ai-draft.js";
import { requirePermission, router } from "../trpc.js";

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

export const aiRouter = router({
  draftDeck: requirePermission("createDeck")
    .input(z.object({ prompt: z.string().trim().min(PROMPT_MIN_LEN, "Tell us a bit more about the client.").max(PROMPT_MAX_LEN, `Keep the description under ${PROMPT_MAX_LEN} characters.`) }))
    .mutation(async ({ input, ctx }) => {
      // The Anthropic API key never leaves this process — it's read from an env var
      // (SSM SecureString in production, see infra/aws/deploy.sh) and only ever used
      // server-side to call api.anthropic.com. The browser never sees it and never talks
      // to Anthropic directly; it only ever calls this tRPC mutation.
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI drafting isn't configured on this server yet." });
      }

      // Rate limit, checked BEFORE calling Anthropic so a capped user's request never
      // reaches (and never costs) the real API call. A shared Postgres ledger, not an
      // in-memory counter, so the limit holds across server restarts and — in production
      // — across every App Runner instance, not just whichever one handled this request.
      const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000);
      const recentCount = await prisma.aiDraftRequest.count({
        where: { userId: ctx.user.id, createdAt: { gte: windowStart } },
      });
      if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `You've hit the AI drafting limit (${MAX_REQUESTS_PER_WINDOW} per ${WINDOW_MINUTES} minutes). Try again later, or build this deck manually.`,
        });
      }

      // Recorded before the Anthropic call, not after a success — so a failed/garbled
      // generation still counts against the limit instead of being a free retry.
      await prisma.aiDraftRequest.create({ data: { userId: ctx.user.id } });

      const anthropic = new Anthropic();
      let response: Anthropic.Message;
      try {
        response = await anthropic.messages.create({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: AI_DRAFT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: input.prompt }],
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
});
