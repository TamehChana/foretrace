-- AlterTable
ALTER TABLE "Membership" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "GitHubConnection" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "repositoryFullName" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "lastEventAt" TIMESTAMP(3),
    "lastPushAt" TIMESTAMP(3),
    "openPullRequestCount" INTEGER NOT NULL DEFAULT 0,
    "openIssueCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubWebhookEvent" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "githubDeliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "actorLogin" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubUserLink" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubUserLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_projectId_key" ON "GitHubConnection"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_repositoryFullName_key" ON "GitHubConnection"("repositoryFullName");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubWebhookEvent_githubDeliveryId_key" ON "GitHubWebhookEvent"("githubDeliveryId");

-- CreateIndex
CREATE INDEX "GitHubWebhookEvent_connectionId_createdAt_idx" ON "GitHubWebhookEvent"("connectionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GitHubUserLink_userId_idx" ON "GitHubUserLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubUserLink_connectionId_githubLogin_key" ON "GitHubUserLink"("connectionId", "githubLogin");

-- AddForeignKey
ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubWebhookEvent" ADD CONSTRAINT "GitHubWebhookEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GitHubConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubUserLink" ADD CONSTRAINT "GitHubUserLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GitHubConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubUserLink" ADD CONSTRAINT "GitHubUserLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
