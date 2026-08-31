-- AlterTable
ALTER TABLE "decks" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "decks_archivedAt_idx" ON "decks"("archivedAt");

-- CreateIndex
CREATE INDEX "meetings_archivedAt_idx" ON "meetings"("archivedAt");
