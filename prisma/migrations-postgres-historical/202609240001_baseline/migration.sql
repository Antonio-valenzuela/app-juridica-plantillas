-- Baseline no destructivo generado desde prisma/schema.prisma.
-- En una base existente ya creada, marcar esta migración como aplicada:
-- npx prisma migrate resolve --applied 202609240001_baseline
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "TemplateVisibility" AS ENUM ('PRIVATE', 'ORG', 'PUBLIC');

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "jurisdiction" TEXT NOT NULL DEFAULT 'federal',
    "practiceArea" TEXT,
    "documentType" TEXT NOT NULL DEFAULT 'machote',
    "description" TEXT,
    "content" TEXT,
    "originalText" TEXT,
    "legalBasis" TEXT,
    "variables" JSONB,
    "structureJson" JSONB,
    "applicableLaws" JSONB,
    "warnings" JSONB,
    "disclaimer" TEXT,
    "exportFormats" JSONB,
    "aiInstructions" TEXT,
    "systemPrompt" TEXT,
    "contentHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "visibility" "TemplateVisibility" NOT NULL DEFAULT 'ORG',
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT,
    "sourceFileName" TEXT,
    "indexed" BOOLEAN NOT NULL DEFAULT false,
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LegalTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'machote',
    "matter" TEXT,
    "jurisdiction" TEXT DEFAULT 'federal',
    "formData" JSONB,
    "renderedText" TEXT,
    "pendingMarkers" JSONB,
    "structuredDoc" JSONB,
    "pipelineState" JSONB,
    "sourceDocuments" JSONB,
    "validationResults" JSONB,
    "generationMetadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LegalDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationJob" (
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

CREATE TABLE "workspace_case_party" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseKey" TEXT NOT NULL,
    "draftId" TEXT,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspace_case_party_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LawyerStyleProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lawyerName" TEXT,
    "firmName" TEXT,
    "preferredTone" TEXT,
    "preferredStructure" JSONB,
    "preferredSectionOrdering" JSONB,
    "recurringFormulas" JSONB,
    "openingPatterns" JSONB,
    "closingPatterns" JSONB,
    "argumentPatterns" JSONB,
    "citationStyle" TEXT,
    "legalTerminology" JSONB,
    "preferredDefenses" JSONB,
    "preferredWayToContestFacts" JSONB,
    "preferredWayToContestBenefits" JSONB,
    "preferredWayToAttackEvidence" JSONB,
    "preferredWayToDevelopConstitutionalArguments" JSONB,
    "preferredWayToWritePetition" JSONB,
    "averageSectionLength" TEXT,
    "preferredDocumentLength" TEXT,
    "aiDisclosureAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LawyerStyleProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCategory" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6),
    "costSource" TEXT,
    "durationMs" INTEGER NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rateLimitLimit" INTEGER,
    "rateLimitRemaining" INTEGER,
    "rateLimitResetAt" TEXT,
    "rateLimitSource" TEXT,
    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "strategy" TEXT,
    "fallbackRank" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCost" DECIMAL(12,6),
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "route" TEXT,
    "mode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiProviderHealth" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "disabledUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiProviderHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "LegalTemplate_organizationId_updatedAt_idx" ON "LegalTemplate"("organizationId", "updatedAt");
CREATE INDEX "LegalTemplate_createdBy_idx" ON "LegalTemplate"("createdBy");
CREATE INDEX "LegalTemplate_category_idx" ON "LegalTemplate"("category");
CREATE INDEX "LegalTemplate_contentHash_idx" ON "LegalTemplate"("contentHash");
CREATE UNIQUE INDEX "LegalTemplate_organizationId_slug_key" ON "LegalTemplate"("organizationId", "slug");
CREATE INDEX "LegalDraft_organizationId_status_idx" ON "LegalDraft"("organizationId", "status");
CREATE INDEX "LegalDraft_userId_status_idx" ON "LegalDraft"("userId", "status");
CREATE INDEX "LegalDraft_organizationId_updatedAt_idx" ON "LegalDraft"("organizationId", "updatedAt");
CREATE INDEX "GenerationJob_organizationId_userId_status_idx" ON "GenerationJob"("organizationId", "userId", "status");
CREATE INDEX "GenerationJob_organizationId_userId_updatedAt_idx" ON "GenerationJob"("organizationId", "userId", "updatedAt");
CREATE INDEX "GenerationJob_fingerprint_idx" ON "GenerationJob"("fingerprint");
CREATE INDEX "GenerationJob_idempotencyKey_idx" ON "GenerationJob"("idempotencyKey");
CREATE INDEX "workspace_case_party_organizationId_caseKey_idx" ON "workspace_case_party"("organizationId", "caseKey");
CREATE UNIQUE INDEX "LawyerStyleProfile_organizationId_key" ON "LawyerStyleProfile"("organizationId");
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
CREATE INDEX "AiUsageLog_provider_createdAt_idx" ON "AiUsageLog"("provider", "createdAt");
CREATE INDEX "AiUsageLog_operation_createdAt_idx" ON "AiUsageLog"("operation", "createdAt");
CREATE INDEX "AiUsageLog_requestId_idx" ON "AiUsageLog"("requestId");
CREATE INDEX "AiUsageEvent_provider_createdAt_idx" ON "AiUsageEvent"("provider", "createdAt");
CREATE INDEX "AiUsageEvent_requestId_idx" ON "AiUsageEvent"("requestId");
CREATE INDEX "AiUsageEvent_mode_createdAt_idx" ON "AiUsageEvent"("mode", "createdAt");
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");
CREATE UNIQUE INDEX "AiProviderHealth_provider_key" ON "AiProviderHealth"("provider");

ALTER TABLE "LegalTemplate" ADD CONSTRAINT "LegalTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalDraft" ADD CONSTRAINT "LegalDraft_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LegalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workspace_case_party" ADD CONSTRAINT "workspace_case_party_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_case_party" ADD CONSTRAINT "workspace_case_party_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LegalDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LawyerStyleProfile" ADD CONSTRAINT "LawyerStyleProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
