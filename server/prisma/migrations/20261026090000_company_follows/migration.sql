-- Theo dõi công ty: khoá công ty chuẩn hoá trên tin và bảng công ty người dùng theo dõi.
ALTER TABLE "jobs" ADD COLUMN "companyKey" TEXT;
CREATE INDEX "jobs_companyKey_idx" ON "jobs"("companyKey");

CREATE TABLE "company_follows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_follows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_follows_userId_companyKey_key" ON "company_follows"("userId", "companyKey");

ALTER TABLE "company_follows" ADD CONSTRAINT "company_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
