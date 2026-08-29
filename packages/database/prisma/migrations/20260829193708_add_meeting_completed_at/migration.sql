-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "meetings_completedAt_idx" ON "meetings"("completedAt");
