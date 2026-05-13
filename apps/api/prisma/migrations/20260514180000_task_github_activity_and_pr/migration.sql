-- AlterTable
ALTER TABLE "Task" ADD COLUMN "lastGithubPullRequestNumber" INTEGER;

-- CreateTable
CREATE TABLE "TaskGitHubActivity" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "githubDeliveryId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "actorLogin" TEXT,
    "linkedUserId" UUID,
    "pullRequestNumber" INTEGER,
    "summary" VARCHAR(500) NOT NULL,

    CONSTRAINT "TaskGitHubActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskGitHubActivity_taskId_githubDeliveryId_key" ON "TaskGitHubActivity"("taskId", "githubDeliveryId");

-- CreateIndex
CREATE INDEX "TaskGitHubActivity_taskId_occurredAt_idx" ON "TaskGitHubActivity"("taskId", "occurredAt" DESC);

-- AddForeignKey
ALTER TABLE "TaskGitHubActivity" ADD CONSTRAINT "TaskGitHubActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGitHubActivity" ADD CONSTRAINT "TaskGitHubActivity_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
