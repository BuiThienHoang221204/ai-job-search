-- Xoá toàn bộ lịch sử ứng tuyển để test lại
-- Chạy: docker exec -i aijob-postgres psql -U aijob -d aijob < scripts/clear-applications.sql

DELETE FROM application_events;
DELETE FROM applications;

-- Verify
SELECT COUNT(*) AS remaining_applications FROM applications;
SELECT COUNT(*) AS remaining_events FROM application_events;
