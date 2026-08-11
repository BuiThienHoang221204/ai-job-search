-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "EligibilityVerdict" AS ENUM ('PASS', 'FAIL', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "FitVerdict" AS ENUM ('STRONG', 'GOOD', 'MODERATE', 'WEAK', 'POOR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "location" TEXT,
    "country" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employmentStatus" TEXT,
    "summary" TEXT,
    "citizenship" TEXT,
    "workPermit" TEXT,
    "workPermitNote" TEXT,
    "primarySkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondarySkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lackingSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "directExperienceDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adjacentExperience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "careerGoals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "energizingTasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "drainingTasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetSectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dealBreakers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commuteConstraint" TEXT,
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "remotePreference" TEXT,
    "behavioralTraits" JSONB,
    "experiences" JSONB,
    "educations" JSONB,
    "certificates" JSONB,
    "projects" JSONB,
    "completion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyLogo" TEXT,
    "location" TEXT,
    "workMode" TEXT,
    "salaryRaw" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_matches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "eligibility" "EligibilityVerdict",
    "eligibilityQuote" TEXT,
    "eligibilityNote" TEXT,
    "technicalScore" INTEGER,
    "technicalNote" TEXT,
    "experienceScore" INTEGER,
    "experienceNote" TEXT,
    "behavioralScore" INTEGER,
    "behavioralNote" TEXT,
    "careerScore" INTEGER,
    "careerNote" TEXT,
    "locationPass" BOOLEAN,
    "locationNote" TEXT,
    "overallScore" INTEGER,
    "verdict" "FitVerdict",
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendation" TEXT,
    "modelId" TEXT,
    "promptHash" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE INDEX "jobs_postedAt_idx" ON "jobs"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_source_externalId_key" ON "jobs"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_userId_jobId_key" ON "saved_jobs"("userId", "jobId");

-- CreateIndex
CREATE INDEX "job_matches_userId_overallScore_idx" ON "job_matches"("userId", "overallScore" DESC);

-- CreateIndex
CREATE INDEX "job_matches_userId_status_idx" ON "job_matches"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_matches_userId_jobId_key" ON "job_matches"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
