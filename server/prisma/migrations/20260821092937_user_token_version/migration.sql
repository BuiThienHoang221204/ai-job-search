-- Dựng lại thư mục migration đã chạy trên database nhưng thiếu ở kho mã.
-- Không có nó, `prisma migrate dev` coi database là lệch và đòi RESET toàn bộ.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
