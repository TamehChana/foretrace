-- Optional link to GitHub issue (per project repo) + last activity from webhooks
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "githubIssueNumber" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastGithubActivityAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastGithubActorLogin" TEXT;

CREATE INDEX IF NOT EXISTS "Task_projectId_githubIssueNumber_idx" ON "Task"("projectId", "githubIssueNumber");
