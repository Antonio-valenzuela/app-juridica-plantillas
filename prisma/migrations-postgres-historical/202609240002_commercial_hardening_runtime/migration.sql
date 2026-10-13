-- Incremental, additive repair for an existing APP-plantillas database.
-- The historical database already contains the baseline application tables,
-- but it predates the privacy acknowledgement column and durable generation jobs.
-- Do not replace this migration with the full baseline.

ALTER TABLE "LawyerStyleProfile"
  ADD COLUMN IF NOT EXISTS "aiDisclosureAcknowledgedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "GenerationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "fingerprint" TEXT,
    "idempotencyKey" TEXT,
    "phase" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "terminalStatus" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GenerationJob_organizationId_userId_status_idx"
  ON "GenerationJob"("organizationId", "userId", "status");
CREATE INDEX IF NOT EXISTS "GenerationJob_organizationId_userId_updatedAt_idx"
  ON "GenerationJob"("organizationId", "userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "GenerationJob_fingerprint_idx"
  ON "GenerationJob"("fingerprint");
CREATE INDEX IF NOT EXISTS "GenerationJob_idempotencyKey_idx"
  ON "GenerationJob"("idempotencyKey");
