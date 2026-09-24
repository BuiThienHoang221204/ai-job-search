-- AlterTable
ALTER TABLE "job_requirement_matches" ADD COLUMN     "rank" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "job_requirement_matches_userId_rank_idx" ON "job_requirement_matches"("userId", "rank" DESC);

