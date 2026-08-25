-- Gỡ Assisted Apply (Agent 7) khỏi phạm vi hệ thống.
--
-- Quyết định của chủ đầu tư ngày 2026-08-17, sau khi được nêu rõ rằng Agent 7
-- nằm trong mục "YÊU CẦU ĐẦU RA" của DE-TAI.md. Lựa chọn kèm theo: sửa mô tả
-- đề tài để bỏ Agent 7.
--
-- Bảng này giữ 13 bản ghi thật, gồm cả lượt FILLED đã đo (6 trường, 8,1 giây).
-- Toàn bộ mã nguồn và dữ liệu vẫn lấy lại được từ git (nhánh feat/vn-portals,
-- commit trước lượt xoá này).
DROP TABLE IF EXISTS "apply_attempts";
DROP TYPE IF EXISTS "ApplyOutcome";
