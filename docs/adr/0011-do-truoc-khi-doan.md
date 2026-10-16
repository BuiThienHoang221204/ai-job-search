# ADR 0011: Đo trước khi đoán: độ trễ gateway, thứ tự timeout, upskill hai lời gọi

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Đổi timeout, `AI_CHAIN_BUDGET_MS`, thiết kế tác vụ AI dài, hoặc chuẩn bị demo
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Đo trước khi đoán

Gateway free đã đo trên 215 lượt `match.evaluate`: **95,3% thành công, p50 33 giây, p95 82 giây**. Nó đáng tin nhưng chậm — mọi thiết kế UI và mọi kịch bản demo phải xuất phát từ hai con số đó. Số liệu sống nằm ở bảng `ai_calls` và màn hình `GET /api/admin/ai-health`.

**`match.evaluate` là tác vụ NHẸ NHẤT, đừng lấy p50 của nó làm mức chung.** Đo tiếp ngày 2026-08-12, chỉ tính lượt thành công: `document.coverLetter` 54–61s, `document.cv` 39–84s, `interview.prep` ~50s, còn `upskill.report` chế độ AGGREGATE thì **luôn vượt mốc 90 giây** nên chưa từng tạo nổi một bản. Lý do: chấm điểm trả về vài con số, các tác vụ kia sinh ra cả một tài liệu — độ trễ đi theo **token đầu ra**.

Nên `document.*` đã đổi sang timeout 180s. Thứ tự ba mốc này phải giữ, đừng nới một cái mà không xem hai cái còn lại: **timeout MỘT lời gọi model < `AI_CHAIN_BUDGET_MS` 4 phút < `server.setTimeout` 5 phút (`main.ts`) < `STUCK_AFTER_MS` 10 phút (reconcile)**

Mốc `AI_CHAIN_BUDGET_MS` thêm 2026-09-17 và nó bịt một lỗ mà ba mốc cũ không
thấy: bất biến "timeout MỘT lời gọi" chỉ đúng cho MỘT lời gọi, còn `ModelChain`
cấp cho **mỗi mắt xích một `AbortSignal.timeout` MỚI**. Chuỗi 6 mắt xích × 90s
là **540 giây cho một tác vụ** — vượt `server.setTimeout` và sát
`STUCK_AFTER_MS`, tức là request treo rồi reconcile xếp lại rồi treo tiếp.

`ModelChain.run` nay xét ngân sách **giữa các mắt xích**; mắt xích đầu luôn được
chạy trọn hạn của nó, vì cắt nó đi thì tác vụ không bao giờ có cơ hội nào. Đường
agent nhận ngân sách riêng (`AGENT_TIMEOUT_MS + AI_CHAIN_BUDGET_MS`) vì nó là
việc trong hàng đợi, không bị `server.setTimeout` chặn..

**Báo cáo upskill là tác vụ duy nhất dùng HAI lời gọi model, và nới timeout đã được thử rồi bỏ.** Bản một-lời-gọi ở mức 240s vẫn hỏng: `deepseek-v4-flash-free` hết giờ đúng mốc 240s, còn `mimo-v2.5-free` viết xong sau 28,3s với `finishReason=stop` nhưng thiếu một dấu `{` nên cả JSON không parse được. Chẩn đoán: **một lời gọi đang đòi quá nhiều**, không phải timeout ngắn cũng không phải chọn nhầm model.

Nay `UpskillService.generate` chạy `upskill.gaps` (180s, mang tới 30 mô tả công việc) rồi `upskill.plan` (120s, chỉ mang lại danh sách khoảng trống).

**Đã chạy thật ngày 2026-08-15 và RA ĐƯỢC một bản** — lần đầu tiên. Số từ `ai_calls`, 30 công việc, cả hai lời gọi rơi vào `hy3-free`: `upskill.gaps` **158 giây / 13.071 token ra**, `upskill.plan` **96 giây / 8.594 token ra**. Cộng lại **21.665 token đầu ra** — đó chính là thứ bản một-lời-gọi đòi model sinh trong MỘT phản hồi, và là lý do nó chưa bao giờ xong.

**Biên an toàn mỏng: 158 giây trên hạn 180, tức 88% ngân sách.** Nếu nó bắt đầu hỏng vì hết giờ thì nới **lời gọi 1** lên 240s, đừng nới cả hai — lời gọi 2 chỉ dùng 80% của 120s.

Ba điều đừng làm hỏng:

- **Lời gọi 2 KHÔNG được mang mô tả công việc.** Thêm lại `jobLines` vào prompt thứ hai là quay về đúng bản đã hỏng. Có test đơn vị ghim điều này.
- **Hai purpose riêng trong `ai_calls`**, không gộp lại thành `upskill.report`: gộp thì mất khả năng biết lời gọi nào mới là cái chậm.
- **Khung phân tích chia đôi theo trường**: `keepSections` lấy Step 3–5 cho lời gọi 1, Step 6–7 cho lời gọi 2. Đổi tên tiêu đề trong `.claude/skills/upskill/SKILL.md` thì `keepSections` trả về chuỗi **rỗng** — không lỗi, không log, chỉ là một báo cáo tệ đi mà không ai biết. Test đơn vị đọc file SKILL.md thật chính vì lý do đó.

**Hạn mức gateway free cạn trong một buổi:** sau khoảng 30 lượt gọi, mọi request nhận `Rate limit exceeded` và hỏng sau ~7 giây, kéo dài hơn một giờ. Khi thấy `failureKind = UPSTREAM` mà `durationMs` chỉ vài nghìn, đó là hạn mức chứ không phải lỗi code — đừng đi sửa gì, hãy đợi. Và **đừng gọi model trực tiếp trong lúc demo**, chuẩn bị dữ liệu trước.

Gateway **không có model embedding nào**, nên vector search ở Pha 4 sẽ cần một nhà cung cấp khác chỉ cho embedding.
