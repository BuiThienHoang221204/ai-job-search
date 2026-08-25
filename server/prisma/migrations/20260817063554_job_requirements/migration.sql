-- CreateEnum
CREATE TYPE "JobSeniority" AS ENUM ('INTERN', 'FRESHER', 'JUNIOR', 'MIDDLE', 'SENIOR', 'LEAD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemotePolicy" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE', 'UNKNOWN');

-- ĐÃ GỠ BỎ MỘT CÂU LỆNH DO PRISMA SINH RA:
--   DROP INDEX "job_embeddings_embedding_idx";
--
-- Đó là index HNSW `vector_cosine_ops` tạo trong migration `semantic_index`.
-- Prisma không khai được index trên cột `Unsupported("vector")` nên mỗi lần
-- `migrate dev` nó lại coi index đó là drift và muốn xoá. Xoá thì truy vấn vector
-- vẫn chạy, chỉ tụt về quét tuần tự - một hồi quy hiệu năng không báo lỗi.
--
-- MỌI migration sau này phải kiểm và gỡ lại dòng đó.

-- CreateTable
CREATE TABLE "job_requirements" (
    "jobId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "niceToHaveSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minYears" INTEGER,
    "seniority" "JobSeniority" NOT NULL DEFAULT 'UNKNOWN',
    "citizenshipRequired" TEXT,
    "workPermitRequired" BOOLEAN NOT NULL DEFAULT false,
    "eligibilityQuote" TEXT,
    "city" TEXT,
    "remotePolicy" "RemotePolicy" NOT NULL DEFAULT 'UNKNOWN',
    "sourceHash" TEXT,
    "modelId" TEXT,
    "extractedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_requirements_pkey" PRIMARY KEY ("jobId")
);

-- CreateIndex
CREATE INDEX "job_requirements_status_idx" ON "job_requirements"("status");

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
