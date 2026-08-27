-- Dựng lại index HNSW của pgvector đã bị xoá mất.
--
-- Index này KHÔNG tồn tại trong `schema.prisma` (Prisma không có kiểu `vector`),
-- nên mỗi lần diff với database nó lại bị coi là dư thừa và sinh ra một dòng
-- `DROP INDEX "job_embeddings_embedding_idx"`. Chín migration trước đã gỡ dòng
-- đó bằng tay; migration `20260825035410_add_viewed_status` để lọt, và index bị
-- xoá thật. Không có lỗi nào báo — truy vấn vẫn chạy, chỉ quét toàn bảng.
--
-- Cách né hẳn nằm ở `server/README.md`: dùng `migrate diff --from-schema`
-- giữa HAI FILE SCHEMA thay vì `migrate dev`, để database không tham gia.
CREATE INDEX IF NOT EXISTS "job_embeddings_embedding_idx"
    ON "job_embeddings" USING hnsw ("embedding" vector_cosine_ops);
