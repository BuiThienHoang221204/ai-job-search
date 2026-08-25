-- DropForeignKey
ALTER TABLE "scrape_runs" DROP CONSTRAINT "scrape_runs_userId_fkey";

-- AlterTable
ALTER TABLE "scrape_runs" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
