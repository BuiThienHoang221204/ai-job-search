-- DropIndex
DROP INDEX "jobs_tags_idx";

-- CreateIndex
CREATE INDEX "job_requirement_matches_jobId_idx" ON "job_requirement_matches"("jobId");

-- CreateIndex
CREATE INDEX "saved_jobs_jobId_idx" ON "saved_jobs"("jobId");

-- CreateIndex
CREATE INDEX "job_matches_jobId_idx" ON "job_matches"("jobId");

-- CreateIndex
CREATE INDEX "interview_preps_jobId_idx" ON "interview_preps"("jobId");

-- CreateIndex
CREATE INDEX "documents_jobId_idx" ON "documents"("jobId");

-- CreateIndex
CREATE INDEX "ai_calls_userId_idx" ON "ai_calls"("userId");

-- CreateIndex
CREATE INDEX "applications_jobId_idx" ON "applications"("jobId");

-- CreateIndex
CREATE INDEX "agent_runs_jobId_idx" ON "agent_runs"("jobId");

