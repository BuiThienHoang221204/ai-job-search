-- Mời bạn bè: mã mời, người mời, mốc thưởng và phút giọng nói được thưởng.
ALTER TABLE "users" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "users" ADD COLUMN "referredById" TEXT;
ALTER TABLE "users" ADD COLUMN "referralRewardedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "bonusVoiceMinutes" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");
ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
