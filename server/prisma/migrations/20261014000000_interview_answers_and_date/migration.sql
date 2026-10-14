-- CreateEnum
CREATE TYPE "InterviewQuestionKind" AS ENUM ('STAR', 'TOUGH');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "interviewAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "kind" "InterviewQuestionKind" NOT NULL,
    "question" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "feedback" JSONB,
    "feedbackKey" TEXT,
    "modelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_answers_jobId_idx" ON "interview_answers"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_userId_jobId_questionKey_key" ON "interview_answers"("userId", "jobId", "questionKey");

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

