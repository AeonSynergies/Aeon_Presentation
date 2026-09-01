-- Password reset + new-user invitation: one shared single-use, expiring token type.
CREATE TYPE "PasswordSetTokenPurpose" AS ENUM ('RESET', 'INVITE');

CREATE TABLE "password_set_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "PasswordSetTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_set_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_set_tokens_tokenHash_key" ON "password_set_tokens"("tokenHash");

CREATE INDEX "password_set_tokens_userId_idx" ON "password_set_tokens"("userId");

ALTER TABLE "password_set_tokens" ADD CONSTRAINT "password_set_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
