-- CreateEnum
CREATE TYPE "InsightFeedbackKind" AS ENUM ('RISK_SUMMARY', 'PROJECT_IMPACT_ANALYSIS');

-- CreateTable
CREATE TABLE "InsightFeedback" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "InsightFeedbackKind" NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "comment" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightFeedback_organizationId_createdAt_idx" ON "InsightFeedback"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InsightFeedback_projectId_kind_createdAt_idx" ON "InsightFeedback"("projectId", "kind", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "InsightFeedback" ADD CONSTRAINT "InsightFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightFeedback" ADD CONSTRAINT "InsightFeedback_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightFeedback" ADD CONSTRAINT "InsightFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
