-- Nơi làm việc người dùng chọn; "Việc làm phù hợp" lọc theo các tỉnh này.
ALTER TABLE "profiles" ADD COLUMN "preferredProvinces" TEXT[] DEFAULT ARRAY[]::TEXT[];
