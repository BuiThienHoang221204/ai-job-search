-- Nhãn ngành nghề do portal gắn; tin cũ để rỗng và rơi về cách đoán từ tiêu đề như trước.
ALTER TABLE "jobs" ADD COLUMN "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
