-- CreateEnum
CREATE TYPE "DocumentLanguage" AS ENUM ('VI', 'EN');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "language" "DocumentLanguage" NOT NULL DEFAULT 'VI';

