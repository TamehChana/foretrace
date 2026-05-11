-- CreateEnum
CREATE TYPE "TerminalIncidentCategory" AS ENUM ('BUILD', 'TEST', 'RUNTIME', 'DEPENDENCY', 'DB', 'API', 'DOCKER', 'UNKNOWN');

-- CreateTable
CREATE TABLE "CliIngestToken" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "secretDigest" TEXT NOT NULL,
    "name" TEXT,
    "createdById" UUID NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CliIngestToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalIngestBatch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "cliTokenId" UUID NOT NULL,
    "taskId" UUID,
    "lineCount" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminalIngestBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalIncident" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "taskId" UUID,
    "batchId" UUID,
    "category" "TerminalIncidentCategory" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TerminalIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CliIngestToken_secretDigest_key" ON "CliIngestToken"("secretDigest");

-- CreateIndex
CREATE INDEX "CliIngestToken_projectId_idx" ON "CliIngestToken"("projectId");

-- CreateIndex
CREATE INDEX "CliIngestToken_organizationId_idx" ON "CliIngestToken"("organizationId");

-- CreateIndex
CREATE INDEX "TerminalIngestBatch_projectId_createdAt_idx" ON "TerminalIngestBatch"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TerminalIncident_projectId_lastSeenAt_idx" ON "TerminalIncident"("projectId", "lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TerminalIncident_projectId_fingerprint_key" ON "TerminalIncident"("projectId", "fingerprint");

-- AddForeignKey
ALTER TABLE "CliIngestToken" ADD CONSTRAINT "CliIngestToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CliIngestToken" ADD CONSTRAINT "CliIngestToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CliIngestToken" ADD CONSTRAINT "CliIngestToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIngestBatch" ADD CONSTRAINT "TerminalIngestBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIngestBatch" ADD CONSTRAINT "TerminalIngestBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIngestBatch" ADD CONSTRAINT "TerminalIngestBatch_cliTokenId_fkey" FOREIGN KEY ("cliTokenId") REFERENCES "CliIngestToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIngestBatch" ADD CONSTRAINT "TerminalIngestBatch_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIncident" ADD CONSTRAINT "TerminalIncident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIncident" ADD CONSTRAINT "TerminalIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIncident" ADD CONSTRAINT "TerminalIncident_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalIncident" ADD CONSTRAINT "TerminalIncident_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TerminalIngestBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
