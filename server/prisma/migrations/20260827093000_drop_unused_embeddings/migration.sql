-- DropForeignKey
ALTER TABLE "job_embeddings" DROP CONSTRAINT "job_embeddings_jobId_fkey";

-- DropForeignKey
ALTER TABLE "profile_embeddings" DROP CONSTRAINT "profile_embeddings_profileId_fkey";

-- DropTable
DROP TABLE "job_embeddings";

-- DropTable
DROP TABLE "profile_embeddings";

