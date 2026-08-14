-- CreateEnum
CREATE TYPE "ApplyOutcome" AS ENUM ('FILLED', 'LOGIN_WALL', 'NO_FORM', 'UNREACHABLE');

-- CreateTable
CREATE TABLE "apply_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "ApplyOutcome",
    "message" TEXT,
    "filled" JSONB,
    "unmatched" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "screenshotKey" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apply_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "apply_attempts_userId_createdAt_idx" ON "apply_attempts"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "apply_attempts_userId_jobId_createdAt_idx" ON "apply_attempts"("userId", "jobId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "apply_attempts" ADD CONSTRAINT "apply_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_attempts" ADD CONSTRAINT "apply_attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
