-- AlterTable
ALTER TABLE "Task" ADD COLUMN "lastGithubLinkedUserId" UUID;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_lastGithubLinkedUserId_fkey" FOREIGN KEY ("lastGithubLinkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
