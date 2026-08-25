-- Prisma tự chèn `DROP INDEX "job_embeddings_embedding_idx"` ở đây vì nó không
-- hiểu kiểu vector của pgvector. Đã gỡ bằng tay: xoá index đó làm mọi truy vấn
-- vector search sau này phải quét toàn bảng.

-- CreateTable
CREATE TABLE "job_requirement_matches" (
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "met" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "percent" INTEGER NOT NULL,
    "eligibility" "EligibilityVerdict",
    "locationPass" BOOLEAN,
    "hash" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_requirement_matches_pkey" PRIMARY KEY ("userId","jobId")
);

-- CreateIndex
CREATE INDEX "job_requirement_matches_userId_percent_idx" ON "job_requirement_matches"("userId", "percent" DESC);

-- AddForeignKey
ALTER TABLE "job_requirement_matches" ADD CONSTRAINT "job_requirement_matches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requirement_matches" ADD CONSTRAINT "job_requirement_matches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
