-- CreateTable
CREATE TABLE "queue_configs" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "serial" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "queue_configs_queueName_key" ON "queue_configs"("queueName");

