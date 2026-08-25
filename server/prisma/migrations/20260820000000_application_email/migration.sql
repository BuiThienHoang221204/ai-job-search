-- Mail ứng tuyển: loại tài liệu thứ tư.
--
-- Người dùng thường không đính kèm thư xin việc PDF mà gõ thẳng một cái mail cho
-- HR. Đó là một thể loại khác chứ không phải cùng một thứ đem đi trình bày khác:
-- nó có TIÊU ĐỀ MAIL, ngắn hơn nhiều, và không bao giờ đi qua LaTeX.
--
-- `BEFORE 'FORM_ANSWER'` để thứ tự trong database khớp với thứ tự khai trong
-- `schema.prisma`; không có gì sắp xếp theo cột này, đây chỉ là chống lệch.
--
-- CỐ Ý KHÔNG có `DROP INDEX "job_embeddings_embedding_idx"`. Prisma sinh ra dòng
-- đó vì index HNSW của pgvector được tạo bằng SQL viết tay ở migration
-- `semantic_index` nên nó không có trong schema.prisma và bị coi là dư thừa.
-- Chạy dòng đó là xoá mất index của tìm kiếm ngữ nghĩa mà không có gì báo lỗi.

-- AlterEnum
ALTER TYPE "DocumentKind" ADD VALUE 'APPLICATION_EMAIL' BEFORE 'FORM_ANSWER';
