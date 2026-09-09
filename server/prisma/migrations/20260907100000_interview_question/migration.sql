-- CreateEnum
CREATE TYPE "InterviewQuestionSource" AS ENUM ('X_INTERVIEW', 'GENERATED', 'USER');

-- CreateEnum
CREATE TYPE "InterviewQuestionType" AS ENUM ('KIEN_THUC', 'QUY_TRINH', 'HANH_VI', 'DONG_CO');

-- CreateEnum
CREATE TYPE "InterviewQuestionStatus" AS ENUM ('RAW', 'READY', 'REJECTED');

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" TEXT NOT NULL,
    "source" "InterviewQuestionSource" NOT NULL,
    "sourceId" TEXT,
    "sourceText" TEXT NOT NULL,
    "status" "InterviewQuestionStatus" NOT NULL DEFAULT 'RAW',
    "text" TEXT,
    "industry" TEXT,
    "type" "InterviewQuestionType",
    "difficulty" TEXT,
    "sourcePracticeCount" INTEGER NOT NULL DEFAULT 0,
    "why" TEXT,
    "keyPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answerGuide" TEXT,
    "sampleAnswer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "modelId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_questions_status_industry_idx" ON "interview_questions"("status", "industry");

-- CreateIndex
CREATE INDEX "interview_questions_status_type_idx" ON "interview_questions"("status", "type");

-- CreateIndex
CREATE INDEX "interview_questions_status_sourcePracticeCount_idx" ON "interview_questions"("status", "sourcePracticeCount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "interview_questions_source_sourceId_key" ON "interview_questions"("source", "sourceId");

