-- Bộ lọc việc làm: chuẩn hoá tỉnh/thành và ngành nghề, cộng các index để lọc,
-- sắp xếp và tìm kiếm chạy được ở SQL thay vì trong bộ nhớ.
--
-- CỐ Ý KHÔNG có `DROP INDEX "job_embeddings_embedding_idx"`. Prisma sinh ra
-- dòng đó vì index HNSW của pgvector được tạo bằng SQL viết tay ở migration
-- `semantic_index` nên nó không có trong schema.prisma và bị coi là dư thừa.
-- Chạy dòng đó là xoá mất index của tìm kiếm ngữ nghĩa mà không có gì báo lỗi.

-- Trigram cho ô tìm kiếm. `LIKE '%tu khoa%'` không dùng được index btree; GIN
-- trigram là thứ duy nhất đỡ được truy vấn có ký tự đại diện ở ĐẦU chuỗi.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropIndex
DROP INDEX "jobs_postedAt_idx";

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "occupationCode" TEXT,
ADD COLUMN     "provinceCode" TEXT,
ADD COLUMN     "searchText" TEXT;

-- CreateIndex
CREATE INDEX "jobs_postedAt_idx" ON "jobs"("postedAt" DESC);

-- CreateIndex
CREATE INDEX "jobs_provinceCode_postedAt_idx" ON "jobs"("provinceCode", "postedAt" DESC);

-- CreateIndex
CREATE INDEX "jobs_occupationCode_postedAt_idx" ON "jobs"("occupationCode", "postedAt" DESC);

-- CreateIndex
CREATE INDEX "jobs_salaryMax_idx" ON "jobs"("salaryMax" DESC);

-- CreateIndex
CREATE INDEX "jobs_tags_idx" ON "jobs" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "jobs_searchText_idx" ON "jobs" USING GIN ("searchText" gin_trgm_ops);
