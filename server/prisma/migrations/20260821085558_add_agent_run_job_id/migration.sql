-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "jobId" TEXT;

-- CreateIndex
CREATE INDEX "agent_runs_userId_jobId_createdAt_idx" ON "agent_runs"("userId", "jobId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
