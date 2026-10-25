-- Nhắc học bật/tắt riêng trên máy chủ, tách khỏi việc thiết bị có nhận thông báo hay không.
ALTER TABLE "users" ADD COLUMN "studyReminders" BOOLEAN NOT NULL DEFAULT true;
