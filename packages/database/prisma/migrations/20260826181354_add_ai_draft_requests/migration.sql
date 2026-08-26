-- CreateTable
CREATE TABLE "ai_draft_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_draft_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_draft_requests_userId_createdAt_idx" ON "ai_draft_requests"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_draft_requests" ADD CONSTRAINT "ai_draft_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
