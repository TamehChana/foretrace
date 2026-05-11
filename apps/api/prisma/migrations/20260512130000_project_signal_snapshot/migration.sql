-- CreateTable
CREATE TABLE "ProjectSignalSnapshot" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "windowHours" INTEGER NOT NULL DEFAULT 24,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSignalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSignalSnapshot_projectId_key" ON "ProjectSignalSnapshot"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSignalSnapshot_organizationId_idx" ON "ProjectSignalSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "ProjectSignalSnapshot_computedAt_idx" ON "ProjectSignalSnapshot"("computedAt" DESC);

-- AddForeignKey
ALTER TABLE "ProjectSignalSnapshot" ADD CONSTRAINT "ProjectSignalSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSignalSnapshot" ADD CONSTRAINT "ProjectSignalSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
