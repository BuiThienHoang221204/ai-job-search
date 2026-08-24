-- CreateEnum
CREATE TYPE "AliasSource" AS ENUM ('EXACT', 'LLM', 'MANUAL');

-- Prisma tự chèn `DROP INDEX "job_embeddings_embedding_idx"` ở đây vì nó không
-- hiểu kiểu vector của pgvector. Đã gỡ bằng tay.

-- CreateTable
CREATE TABLE "canonical_skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_aliases" (
    "key" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "source" "AliasSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_aliases_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "canonical_skills_model_idx" ON "canonical_skills"("model");

-- CreateIndex
CREATE INDEX "skill_aliases_skillId_idx" ON "skill_aliases"("skillId");

-- AddForeignKey
ALTER TABLE "skill_aliases" ADD CONSTRAINT "skill_aliases_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "canonical_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
