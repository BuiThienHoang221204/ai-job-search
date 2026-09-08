-- Rút ApplicationStatus từ 11 giá trị xuống 3: VIEWED, APPLIED, WITHDRAWN.
--
-- Postgres không xoá được nhãn khỏi một enum đang dùng, nên phải dựng kiểu mới
-- rồi chuyển cột sang. Ánh xạ tám nhãn bị bỏ theo NGHĨA, không đổ hết về một chỗ:
-- những trạng thái nghĩa là "đơn còn sống sau khi đã nộp" về APPLIED, những
-- trạng thái nghĩa là "đơn đã khép lại" về WITHDRAWN, còn RANKED (đã chọn nhưng
-- chưa nộp) về VIEWED.

ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";

CREATE TYPE "ApplicationStatus" AS ENUM ('VIEWED', 'APPLIED', 'WITHDRAWN');

ALTER TABLE "applications" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "applications"
  ALTER COLUMN "status" TYPE "ApplicationStatus"
  USING (
    CASE "status"::text
      WHEN 'RANKED' THEN 'VIEWED'
      WHEN 'INTERVIEW' THEN 'APPLIED'
      WHEN 'OFFER' THEN 'APPLIED'
      WHEN 'HIRED' THEN 'APPLIED'
      WHEN 'REJECTED' THEN 'WITHDRAWN'
      WHEN 'NO_RESPONSE' THEN 'WITHDRAWN'
      WHEN 'OFFER_DECLINED' THEN 'WITHDRAWN'
      WHEN 'EXPIRED' THEN 'WITHDRAWN'
      ELSE "status"::text
    END
  )::"ApplicationStatus";

ALTER TABLE "applications" ALTER COLUMN "status" SET DEFAULT 'VIEWED';

ALTER TABLE "application_events"
  ALTER COLUMN "fromStatus" TYPE "ApplicationStatus"
  USING (
    CASE "fromStatus"::text
      WHEN 'RANKED' THEN 'VIEWED'
      WHEN 'INTERVIEW' THEN 'APPLIED'
      WHEN 'OFFER' THEN 'APPLIED'
      WHEN 'HIRED' THEN 'APPLIED'
      WHEN 'REJECTED' THEN 'WITHDRAWN'
      WHEN 'NO_RESPONSE' THEN 'WITHDRAWN'
      WHEN 'OFFER_DECLINED' THEN 'WITHDRAWN'
      WHEN 'EXPIRED' THEN 'WITHDRAWN'
      ELSE "fromStatus"::text
    END
  )::"ApplicationStatus";

ALTER TABLE "application_events"
  ALTER COLUMN "toStatus" TYPE "ApplicationStatus"
  USING (
    CASE "toStatus"::text
      WHEN 'RANKED' THEN 'VIEWED'
      WHEN 'INTERVIEW' THEN 'APPLIED'
      WHEN 'OFFER' THEN 'APPLIED'
      WHEN 'HIRED' THEN 'APPLIED'
      WHEN 'REJECTED' THEN 'WITHDRAWN'
      WHEN 'NO_RESPONSE' THEN 'WITHDRAWN'
      WHEN 'OFFER_DECLINED' THEN 'WITHDRAWN'
      WHEN 'EXPIRED' THEN 'WITHDRAWN'
      ELSE "toStatus"::text
    END
  )::"ApplicationStatus";

DROP TYPE "ApplicationStatus_old";
