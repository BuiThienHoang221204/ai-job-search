-- CreateTable
CREATE TABLE "usage_counters" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("scope","key","day")
);

-- CreateIndex
CREATE INDEX "usage_counters_day_idx" ON "usage_counters"("day");

