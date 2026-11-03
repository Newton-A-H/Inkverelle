ALTER TYPE "UserRole" ADD VALUE 'READER';

ALTER TABLE "User"
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyVersion" TEXT;

CREATE TABLE "Favorite" (
  "userId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId", "slug")
);

CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt" DESC);

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;