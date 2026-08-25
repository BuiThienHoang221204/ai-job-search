-- CreateTable
CREATE TABLE "profile_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB,
    "proposal" JSONB,
    "storageKey" TEXT,
    "filename" TEXT,
    "modelId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_drafts_userId_createdAt_idx" ON "profile_drafts"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "profile_drafts" ADD CONSTRAINT "profile_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
