-- CreateEnum
CREATE TYPE "SalaryRefVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

-- CreateTable
CREATE TABLE "salary_references" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "visibility" "SalaryRefVisibility" NOT NULL DEFAULT 'INTERNAL',
    "industrySlug" TEXT NOT NULL,
    "positionSlug" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "occupationCode" TEXT,
    "avgMonthly" INTEGER,
    "rangeMin" INTEGER,
    "rangeMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'VND',

    CONSTRAINT "salary_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_reference_bands" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "experienceLabel" TEXT NOT NULL,
    "minAmount" INTEGER,
    "avgAmount" INTEGER,
    "maxAmount" INTEGER,

    CONSTRAINT "salary_reference_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_references_occupationCode_visibility_idx" ON "salary_references"("occupationCode", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "salary_references_source_positionSlug_key" ON "salary_references"("source", "positionSlug");

-- CreateIndex
CREATE UNIQUE INDEX "salary_reference_bands_referenceId_experienceLabel_key" ON "salary_reference_bands"("referenceId", "experienceLabel");

-- AddForeignKey
ALTER TABLE "salary_reference_bands" ADD CONSTRAINT "salary_reference_bands_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "salary_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
