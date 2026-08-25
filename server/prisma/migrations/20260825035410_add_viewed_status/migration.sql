-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'VIEWED';

-- DropIndex
DROP INDEX "job_embeddings_embedding_idx";
