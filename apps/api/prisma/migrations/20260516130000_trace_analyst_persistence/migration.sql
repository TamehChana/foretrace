-- Persist Trace Analyst impact reads and snapshot payloads on risk runs for ML / audit.
CREATE TABLE "ProjectImpactAnalysisRun" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "analysis" TEXT NOT NULL,
    "usedOpenAi" BOOLEAN NOT NULL,
    "snapshotComputedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectImpactAnalysisRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectImpactAnalysisRun_projectId_createdAt_idx" ON "ProjectImpactAnalysisRun"("projectId", "createdAt" DESC);

CREATE INDEX "ProjectImpactAnalysisRun_organizationId_createdAt_idx" ON "ProjectImpactAnalysisRun"("organizationId", "createdAt" DESC);

ALTER TABLE "ProjectImpactAnalysisRun" ADD CONSTRAINT "ProjectImpactAnalysisRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectImpactAnalysisRun" ADD CONSTRAINT "ProjectImpactAnalysisRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RiskEvaluationRun" ADD COLUMN "signalPayload" JSONB;
