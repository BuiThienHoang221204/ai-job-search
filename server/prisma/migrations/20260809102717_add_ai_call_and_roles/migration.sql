-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AiFailureKind" AS ENUM ('SCHEMA', 'TIMEOUT', 'UPSTREAM', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "ai_calls" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "failureKind" "AiFailureKind",
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_calls_createdAt_idx" ON "ai_calls"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_calls_purpose_ok_idx" ON "ai_calls"("purpose", "ok");

-- AddForeignKey
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
