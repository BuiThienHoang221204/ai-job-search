-- Báo tin mới mỗi sáng qua Web Push, người dùng tự bật.
ALTER TABLE "users" ADD COLUMN "jobNotifications" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "jobAlertSentAt" TIMESTAMP(3);
