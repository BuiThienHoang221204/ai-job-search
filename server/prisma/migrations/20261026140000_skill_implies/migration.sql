-- AlterTable
ALTER TABLE "canonical_skills" ADD COLUMN     "implies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "impliesCheckedAt" TIMESTAMP(3);
