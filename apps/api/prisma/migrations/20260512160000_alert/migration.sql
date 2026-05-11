-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('RISK_EVALUATION');

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "AlertKind" NOT NULL DEFAULT 'RISK_EVALUATION',
    "summary" VARCHAR(500) NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_organizationId_createdAt_idx" ON "Alert"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_organizationId_readAt_createdAt_idx" ON "Alert"("organizationId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_projectId_createdAt_idx" ON "Alert"("projectId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
