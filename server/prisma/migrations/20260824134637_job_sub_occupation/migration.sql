-- Prisma tự chèn `DROP INDEX "job_embeddings_embedding_idx"` ở đây vì nó không
-- hiểu kiểu vector của pgvector. Đã gỡ bằng tay.

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "subOccupationCode" TEXT;

-- CreateIndex
CREATE INDEX "jobs_subOccupationCode_scrapedAt_id_idx" ON "jobs"("subOccupationCode", "scrapedAt" DESC, "id" DESC);
