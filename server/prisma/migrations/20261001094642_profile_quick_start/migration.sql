-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "experienceLevel" "JobSeniority" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "subOccupationCode" TEXT;
