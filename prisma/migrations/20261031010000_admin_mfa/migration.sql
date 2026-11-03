ALTER TABLE "User"
    ADD COLUMN "mfaSecretEncrypted" TEXT,
    ADD COLUMN "mfaEnabledAt" TIMESTAMP(3),
    ADD COLUMN "totpRecoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Session"
    ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
