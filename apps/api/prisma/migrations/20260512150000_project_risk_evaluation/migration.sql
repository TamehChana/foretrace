-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "ProjectRiskEvaluation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRiskEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRiskEvaluation_projectId_key" ON "ProjectRiskEvaluation"("projectId");

-- CreateIndex
CREATE INDEX "ProjectRiskEvaluation_organizationId_idx" ON "ProjectRiskEvaluation"("organizationId");

-- CreateIndex
CREATE INDEX "ProjectRiskEvaluation_evaluatedAt_idx" ON "ProjectRiskEvaluation"("evaluatedAt" DESC);

-- AddForeignKey
ALTER TABLE "ProjectRiskEvaluation" ADD CONSTRAINT "ProjectRiskEvaluation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRiskEvaluation" ADD CONSTRAINT "ProjectRiskEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
