-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "lastFanOutAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "profiles_lastFanOutAt_idx" ON "profiles"("lastFanOutAt");

