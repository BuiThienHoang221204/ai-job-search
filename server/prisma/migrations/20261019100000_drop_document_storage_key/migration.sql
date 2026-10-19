-- File .tex không còn được sinh: PDF của mọi tài liệu in từ HTML (ADR 0004 đã thay thế).
ALTER TABLE "documents" DROP COLUMN "storageKey";
