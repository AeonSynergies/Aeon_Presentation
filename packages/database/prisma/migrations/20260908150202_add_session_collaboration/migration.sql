-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "fieldLocks" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "session_collaborators" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_collaborators_meetingId_idx" ON "session_collaborators"("meetingId");

-- CreateIndex
CREATE INDEX "session_collaborators_userId_idx" ON "session_collaborators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_collaborators_meetingId_userId_key" ON "session_collaborators"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "session_collaborators" ADD CONSTRAINT "session_collaborators_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_collaborators" ADD CONSTRAINT "session_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_collaborators" ADD CONSTRAINT "session_collaborators_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce "at most one owner per meeting" at the database level, not just trusted in
-- application code — Prisma's schema DSL has no partial-unique-index syntax, so this is
-- hand-written raw SQL rather than something the generated diff above could express.
CREATE UNIQUE INDEX "session_collaborators_one_owner_per_meeting" ON "session_collaborators"("meetingId") WHERE "isOwner" = true;
