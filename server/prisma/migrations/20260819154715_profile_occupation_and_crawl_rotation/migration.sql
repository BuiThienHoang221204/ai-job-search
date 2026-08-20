-- Gom từ khoá quét đêm theo NGÀNH thay vì theo từng hồ sơ.
--
-- `profiles.occupationCode` cho phép gộp hồ sơ cùng ngành thành một cụm, nên số
-- truy vấn mỗi đêm bị chặn bởi số ngành (19) chứ không tăng theo số người dùng.
-- `occupation_crawls` ghi lần quét gần nhất của mỗi ngành trên mỗi portal, để
-- khi số ngành vượt trần truy vấn thì chọn theo độ cũ thay vì luôn chọn cùng
-- một nhóm đứng đầu bảng chữ cái.
--
-- CỐ Ý KHÔNG có `DROP INDEX "job_embeddings_embedding_idx"`. Prisma sinh ra
-- dòng đó vì index HNSW của pgvector được tạo bằng SQL viết tay ở migration
-- `semantic_index` nên nó không có trong schema.prisma và bị coi là dư thừa.
-- Chạy dòng đó là xoá mất index của tìm kiếm ngữ nghĩa mà không có gì báo lỗi.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "occupationCode" TEXT;

-- CreateTable
CREATE TABLE "occupation_crawls" (
    "portal" TEXT NOT NULL,
    "occupationCode" TEXT NOT NULL,
    "lastCrawledAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occupation_crawls_pkey" PRIMARY KEY ("portal","occupationCode")
);
