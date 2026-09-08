-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "agentRunId" TEXT;
-- CreateIndex
CREATE INDEX "documents_agentRunId_idx" ON "documents"("agentRunId");
-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
