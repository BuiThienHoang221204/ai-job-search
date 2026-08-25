-- Agent nhiều bước: lưu lượt chạy và TỪNG bước của nó.
--
-- Vì sao cần bảng bước chứ không chỉ bảng kết quả: tác vụ một-lượt hỏng thì chỉ
-- cần prompt vào và kết quả ra là đủ để lần lại, còn agent thì gần như luôn hỏng
-- ở GIỮA - gọi nhầm tool, nhận về rác rồi vẫn viết tiếp như thật. Không lưu bước
-- thì không có cách nào biết nó chệch ở đâu.
--
-- `WAITING_USER` không phải một giá trị thừa so với MatchStatus: agent được phép
-- dừng giữa chừng để hỏi rồi chạy tiếp ở một request khác, có thể vài giờ sau.
--
-- CỐ Ý KHÔNG có `DROP INDEX "job_embeddings_embedding_idx"`. Prisma sinh ra dòng
-- đó vì index HNSW của pgvector được tạo bằng SQL viết tay ở migration
-- `semantic_index` nên nó không có trong schema.prisma và bị coi là dư thừa.
-- Chạy dòng đó là xoá mất index của tìm kiếm ngữ nghĩa mà không có gì báo lỗi.

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_USER', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "result" JSONB,
    "question" TEXT,
    "answer" TEXT,
    "messages" JSONB,
    "modelId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_steps" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "toolCalls" JSONB NOT NULL,
    "toolResults" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_userId_createdAt_idx" ON "agent_runs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_steps_runId_index_key" ON "agent_steps"("runId", "index");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
