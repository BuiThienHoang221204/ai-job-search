-- Đổi khoá sắp xếp mặc định của danh sách việc làm từ `postedAt` sang
-- `scrapedAt`, và đưa `id` vào index làm khoá phụ.
--
-- Lý do: `postedAt` nullable nên phải sắp `DESC NULLS LAST`, mà thứ tự đó không
-- khớp với bất kỳ index nào Prisma khai được - đo trên 50.000 tin thì mỗi lần
-- mở danh sách là một lần quét toàn bảng. `id` đi kèm để hai tin cùng mốc thời
-- gian luôn ra cùng một thứ tự, nếu không thì lật trang sẽ vừa lặp vừa bỏ sót.
--
-- `postedAt` giữ index riêng vì bộ lọc "đăng trong vòng N ngày" vẫn dùng nó.
--
-- CỐ Ý KHÔNG có `DROP INDEX "job_embeddings_embedding_idx"`. Xem migration
-- `job_filters` để biết vì sao Prisma cứ sinh ra dòng đó và vì sao không được
-- chạy nó.

-- DropIndex
DROP INDEX "jobs_occupationCode_postedAt_idx";

-- DropIndex
DROP INDEX "jobs_postedAt_idx";

-- DropIndex
DROP INDEX "jobs_provinceCode_postedAt_idx";

-- CreateIndex
CREATE INDEX "jobs_scrapedAt_id_idx" ON "jobs"("scrapedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "jobs_provinceCode_scrapedAt_id_idx" ON "jobs"("provinceCode", "scrapedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "jobs_occupationCode_scrapedAt_id_idx" ON "jobs"("occupationCode", "scrapedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "jobs_postedAt_idx" ON "jobs"("postedAt");
