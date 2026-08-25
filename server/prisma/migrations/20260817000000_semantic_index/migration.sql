-- Pha 4: lọc sơ bộ bằng ngữ nghĩa (SEAM 4 · SemanticIndex).
--
-- Extension `vector` KHÔNG có trong ảnh `postgres:17-alpine`. docker-compose đã
-- đổi sang `pgvector/pgvector:pg17`; nếu câu lệnh dưới đây báo
-- "extension vector is not available" thì database đang chạy sai ảnh.
CREATE EXTENSION IF NOT EXISTS vector;

-- 768 chiều thay vì 3072: gemini-embedding-2 cắt chiều theo kiểu Matryoshka nên
-- chất lượng gần như không đổi, còn index nhỏ đi 4 lần.
CREATE TABLE "job_embeddings" (
    "jobId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_embeddings_pkey" PRIMARY KEY ("jobId")
);

CREATE TABLE "profile_embeddings" (
    "profileId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "embedding" vector(768) NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_embeddings_pkey" PRIMARY KEY ("profileId")
);

CREATE INDEX "job_embeddings_model_idx" ON "job_embeddings"("model");

-- HNSW với `vector_cosine_ops`: độ tương đồng cosine là thước đo đúng cho
-- embedding văn bản (quan tâm HƯỚNG của vector, không quan tâm độ dài). Dùng
-- sai lớp toán tử ở đây thì truy vấn vẫn chạy, chỉ trả về thứ tự sai.
CREATE INDEX "job_embeddings_embedding_idx"
    ON "job_embeddings" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "job_embeddings" ADD CONSTRAINT "job_embeddings_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "profile_embeddings" ADD CONSTRAINT "profile_embeddings_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
