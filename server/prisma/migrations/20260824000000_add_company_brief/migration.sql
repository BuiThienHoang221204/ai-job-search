-- CreateEnum
CREATE TYPE "BriefConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CompanyVerdict" AS ENUM ('POSITIVE', 'MIXED', 'NEGATIVE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "company_briefs" (
    "id" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verdict" "CompanyVerdict" NOT NULL,
    "summary" TEXT NOT NULL,
    "pros" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" "BriefConfidence" NOT NULL,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "sources" JSONB NOT NULL,
    "modelId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_briefs_nameKey_key" ON "company_briefs"("nameKey");

