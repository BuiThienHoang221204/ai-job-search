-- CreateTable
CREATE TABLE "scrape_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "portal" TEXT NOT NULL,
    "queries" JSONB,
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "jobsQueued" INTEGER NOT NULL DEFAULT 0,
    "modelId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrape_runs_userId_createdAt_idx" ON "scrape_runs"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
