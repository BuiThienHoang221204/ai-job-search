-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_codes" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "email_codes_sentAt_idx" ON "email_codes"("sentAt");

-- Google đã xác minh email của tài khoản đăng nhập bằng Google.
UPDATE "users" SET "emailVerifiedAt" = "createdAt" WHERE "googleId" IS NOT NULL;

-- Tài khoản mật khẩu chưa xác minh: thu hồi phiên đang mở để lần đăng nhập tới phải nhập mã.
UPDATE "users" SET "tokenVersion" = "tokenVersion" + 1 WHERE "emailVerifiedAt" IS NULL;
