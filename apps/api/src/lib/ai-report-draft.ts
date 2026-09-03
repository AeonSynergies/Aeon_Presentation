import { z } from "zod";

// AI-generated custom report layouts (Deck Builder wizard, Services step — "Create with
// AI"). Unlike ai-draft.ts's whole-deck drafting, this asks the model for genuinely
// freeform HTML/CSS rather than a fixed schema of fields — the whole point is a report
// shape that isn't constrained to Templates A/B/C. What comes back is rendered inside a
// sandboxed iframe with no allow-scripts (apps/web/src/components/deck/ReportTemplate.tsx),
// so it's still just real markup rendering the same way everything else in this app does,
// never literal raster image generation — but isolated, since the markup is untrusted
// model output.

export const aiReportDraftInputSchema = z.object({
  html: z.string().min(1).max(20_000),
  sizeHint: z.enum(["compact", "wide"]),
});
export type AiReportDraftInput = z.infer<typeof aiReportDraftInputSchema>;

export const AI_REPORT_DRAFT_TOOL_SCHEMA = {
  type: "object",
  properties: {
    html: {
      type: "string",
      description:
        "A complete, self-contained HTML fragment (a wrapping <div> plus an inline <style> block) — no <html>/<head>/<body>, no external stylesheets/fonts/scripts/images, no <script> tags or inline event handlers. It must fill its container RESPONSIVELY: the root element and everything in it should size with %, flex, or grid — never fixed pixel width/height — because the same markup may render inside a smaller grid cell or as a large lone report. Design it to look like a real, professional client-facing report or dashboard card matching the description (and reference image, if one was given).",
    },
    sizeHint: {
      type: "string",
      enum: ["compact", "wide"],
      description:
        "Your own judgment of this layout's natural footprint: \"compact\" for a small/simple card (a handful of KPIs, a short list, a small chart) that reads fine paired side-by-side with another report; \"wide\" for something inherently wide or dense (a multi-column table, a wide timeline/chart) that needs a full-width row to itself.",
    },
  },
  required: ["html", "sizeHint"],
} as const;

export const AI_REPORT_DRAFT_SYSTEM_PROMPT = `You help sales teams at a business-services consultancy create a custom sample report slide for a client pitch deck, from a short description (and sometimes a reference image of a real report). You must call the submit_report_draft tool exactly once with real, well-designed HTML/CSS — a genuinely custom layout, not a generic placeholder. Never invent or copy real people's names, real company names, or real confidential-looking data as if it were fact — this is illustrative sample content a human will review before presenting, exactly like the deck's other sample reports.`;
