-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LegalTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "visibility" TEXT NOT NULL DEFAULT 'ORG',
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT,
    "sourceFileName" TEXT,
    "indexed" BOOLEAN NOT NULL DEFAULT false,
    "indexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LegalTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LegalDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LegalDraft_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LegalTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "workspace_case_party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "caseKey" TEXT NOT NULL,
    "draftId" TEXT,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workspace_case_party_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_case_party_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LegalDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawyerStyleProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "aiDisclosureAcknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawyerStyleProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCategory" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DECIMAL,
    "costSource" TEXT,
    "durationMs" INTEGER NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rateLimitLimit" INTEGER,
    "rateLimitRemaining" INTEGER,
    "rateLimitResetAt" TEXT,
    "rateLimitSource" TEXT
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "strategy" TEXT,
    "fallbackRank" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCost" DECIMAL,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "route" TEXT,
    "mode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiProviderHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastErrorCode" TEXT,
    "disabledUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LegalTemplate_organizationId_updatedAt_idx" ON "LegalTemplate"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "LegalTemplate_createdBy_idx" ON "LegalTemplate"("createdBy");

-- CreateIndex
CREATE INDEX "LegalTemplate_category_idx" ON "LegalTemplate"("category");

-- CreateIndex
CREATE INDEX "LegalTemplate_contentHash_idx" ON "LegalTemplate"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "LegalTemplate_organizationId_slug_key" ON "LegalTemplate"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "LegalDraft_organizationId_status_idx" ON "LegalDraft"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LegalDraft_userId_status_idx" ON "LegalDraft"("userId", "status");

-- CreateIndex
CREATE INDEX "LegalDraft_organizationId_updatedAt_idx" ON "LegalDraft"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDraft_organizationId_userId_idempotencyKey_key" ON "LegalDraft"("organizationId", "userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GenerationJob_organizationId_userId_status_idx" ON "GenerationJob"("organizationId", "userId", "status");

-- CreateIndex
CREATE INDEX "GenerationJob_organizationId_userId_updatedAt_idx" ON "GenerationJob"("organizationId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "GenerationJob_fingerprint_idx" ON "GenerationJob"("fingerprint");

-- CreateIndex
CREATE INDEX "GenerationJob_idempotencyKey_idx" ON "GenerationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "workspace_case_party_organizationId_caseKey_idx" ON "workspace_case_party"("organizationId", "caseKey");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_case_party_organizationId_caseKey_role_key" ON "workspace_case_party"("organizationId", "caseKey", "role");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerStyleProfile_organizationId_key" ON "LawyerStyleProfile"("organizationId");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_provider_createdAt_idx" ON "AiUsageLog"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_operation_createdAt_idx" ON "AiUsageLog"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_requestId_idx" ON "AiUsageLog"("requestId");

-- CreateIndex
CREATE INDEX "AiUsageEvent_provider_createdAt_idx" ON "AiUsageEvent"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_requestId_idx" ON "AiUsageEvent"("requestId");

-- CreateIndex
CREATE INDEX "AiUsageEvent_mode_createdAt_idx" ON "AiUsageEvent"("mode", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderHealth_provider_key" ON "AiProviderHealth"("provider");

