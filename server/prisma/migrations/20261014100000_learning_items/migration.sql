-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('LEARNING', 'SKIPPED', 'DONE');

-- CreateTable
CREATE TABLE "learning_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "status" "LearningStatus" NOT NULL,
    "steps" BOOLEAN[] DEFAULT ARRAY[false, false, false]::BOOLEAN[],
    "days" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_items_userId_skillKey_key" ON "learning_items"("userId", "skillKey");

-- AddForeignKey
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

