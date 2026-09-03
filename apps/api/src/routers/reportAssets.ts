import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createReportImageUploadUrl, isS3Configured, isUploadableImageType } from "../lib/s3.js";
import { requirePermission, router } from "../trpc.js";

// Uploaded report images (Deck Builder wizard, Services step). The api service never
// receives the image bytes itself — this only ever mints a short-lived presigned S3 PUT
// URL; the browser uploads the file directly to S3 (see StepServices.tsx), which is why
// this needs no file-size handling or multipart parsing on this side at all.
export const reportAssetsRouter = router({
  getUploadUrl: requirePermission("createDeck")
    .input(z.object({ contentType: z.string() }))
    .mutation(async ({ input }) => {
      if (!isS3Configured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Report image uploads aren't configured on this server yet." });
      }
      if (!isUploadableImageType(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only PNG, JPEG, or WebP images are supported." });
      }
      return createReportImageUploadUrl(input.contentType);
    }),
});
