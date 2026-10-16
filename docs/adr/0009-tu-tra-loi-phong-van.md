# ADR 0009: Tự trả lời câu hỏi phỏng vấn: khoá theo chữ câu hỏi

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `interview_answers`, nhận xét câu trả lời hoặc ngày phỏng vấn
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Tự trả lời câu hỏi phỏng vấn — thêm 2026-10-14

**`interview_answers` khoá theo vân tay CHỮ câu hỏi (`questionKey`), không theo vị trí.** Bấm "Soạn lại" thì bộ đề mới có thể đặt một câu khác vào đúng chỗ cũ; khoá theo vị trí sẽ gắn câu trả lời cũ sang câu mới mà không có gì báo. Khoá theo chữ thì câu đã đổi tự rơi khỏi mức sẵn sàng (`readinessOf`), còn câu giữ nguyên chữ vẫn giữ câu trả lời.

**Route vẫn định vị câu bằng `:kind/:index` — và đó là số thứ tự trong mảng GỐC.** Giao diện bỏ phần tử hỏng khi hiển thị (`parseStarAnswers`); đánh số lại sau khi lọc thì câu trả lời được ghi vào nhầm câu. FE dùng `indexedStarAnswers`/`indexedToughQuestions` giữ số gốc, và `test/visual/interview-practice.spec.ts` ghim điều này bằng một bộ đề mở đầu bằng phần tử hỏng (đã thử đánh số lại: spec đỏ, nhận `star/0` thay vì `star/1`).

**`POST .../feedback` lưu chữ TRƯỚC rồi mới gọi model**, nên model hỏng thì người dùng mất lượt nhận xét chứ không mất câu trả lời. `feedbackKey` là vân tay bản đã được nhận xét; sửa chữ sau đó thì `feedbackStale: true` thay vì xoá nhận xét.

**Ngày phỏng vấn nằm ở `Application.interviewAt`, không ràng buộc với trạng thái đơn** — không có trạng thái "Phỏng vấn" nào (chỉ `VIEWED`/`APPLIED`/`WITHDRAWN`). Bộ đề soạn từ tin đã lưu thì chưa có đơn nên không ghi được ngày.

**Soạn đề từ mô tả dán tay CHƯA làm.** `InterviewPrep.jobId` lẫn buổi phỏng vấn thử đều bắt buộc có tin; hướng gọn nhất đã bàn là tạo một `Job` riêng của người dùng từ đoạn dán, nhưng phải chặn nó khỏi danh sách tin và khỏi chấm điểm cho người khác.
