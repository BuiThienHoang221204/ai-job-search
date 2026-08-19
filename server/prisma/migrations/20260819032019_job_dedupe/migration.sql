-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "duplicateOfId" TEXT;

-- CreateIndex
CREATE INDEX "jobs_dedupeKey_idx" ON "jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "jobs_duplicateOfId_idx" ON "jobs"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
