-- CreateEnum
CREATE TYPE "UpskillMode" AS ENUM ('AGGREGATE', 'TARGETED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CV', 'COVER_LETTER', 'FORM_ANSWER');

-- CreateTable
CREATE TABLE "interview_preps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "starAnswers" JSONB,
    "toughQuestions" JSONB,
    "questionsToAsk" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "talkingPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likelyProbes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelId" TEXT,
    "promptHash" TEXT,
    "generatedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_preps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upskill_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "UpskillMode" NOT NULL DEFAULT 'AGGREGATE',
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "jobId" TEXT,
    "jobsAnalysed" INTEGER NOT NULL DEFAULT 0,
    "hardGaps" JSONB,
    "synthesisedGaps" JSONB,
    "learningPlan" JSONB,
    "summary" TEXT,
    "modelId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upskill_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "content" JSONB,
    "storageKey" TEXT,
    "modelId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_preps_userId_jobId_key" ON "interview_preps"("userId", "jobId");

-- CreateIndex
CREATE INDEX "upskill_reports_userId_createdAt_idx" ON "upskill_reports"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "documents_userId_kind_createdAt_idx" ON "documents"("userId", "kind", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "interview_preps" ADD CONSTRAINT "interview_preps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_preps" ADD CONSTRAINT "interview_preps_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upskill_reports" ADD CONSTRAINT "upskill_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
