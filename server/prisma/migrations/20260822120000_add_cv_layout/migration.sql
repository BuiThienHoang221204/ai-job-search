-- Thứ tự và mục bị ẩn của CV.
--
-- Cột RIÊNG chứ không nhét vào `content`: content giữ chữ, cột này giữ bố cục.
-- NULL nghĩa là "chưa đụng tới", và `resolveLayout` đưa về thứ tự mặc định - nên
-- mọi CV đã có vẫn hiện đúng như cũ mà không cần backfill.
ALTER TABLE "documents" ADD COLUMN "layout" JSONB;
