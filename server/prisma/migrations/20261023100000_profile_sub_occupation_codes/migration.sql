-- Hồ sơ chọn được nhiều nghề trong một nhóm ngành; "Việc làm phù hợp" lọc theo các nghề này.
ALTER TABLE "profiles" ADD COLUMN "subOccupationCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "profiles" SET "subOccupationCodes" = ARRAY["subOccupationCode"] WHERE "subOccupationCode" IS NOT NULL;
ALTER TABLE "profiles" DROP COLUMN "subOccupationCode";
