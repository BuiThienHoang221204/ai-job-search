-- Mẫu trình bày của CV, và tuỳ chọn của mẫu đó.
--
-- Hai cột RIÊNG chứ không nhét vào `content`: `content` là output của model đã qua
-- zod, còn đây là lựa chọn của người dùng. Trộn chung thì mỗi lần sinh lại CV sẽ ghi
-- đè và xoá mất mẫu họ đã chọn.
--
-- `DEFAULT 'classic'` phủ luôn mọi tài liệu đã có: chúng được sinh bằng đúng bố cục
-- đó, nên gán mặc định không làm bản CV nào đổi hình dạng.
ALTER TABLE "documents" ADD COLUMN "templateId" TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE "documents" ADD COLUMN "templateOptions" JSONB;
