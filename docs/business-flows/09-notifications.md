# 09 — Thông báo

> **Phạm vi:** toàn bộ backend và hai frontend.
> **Nguyên tắc:** tài liệu mô tả hệ thống **as-is**. Code là nguồn sự thật duy nhất.

## 1. Kết luận

**Không tồn tại kênh thông báo đẩy (push) nào trong code.** Hệ thống không gửi email, SMS, push notification, tin nhắn chat, không có WebSocket/SSE theo kênh người dùng, không có webhook đi ra.

Bằng chứng đã tìm (2026-10-19):

| Tìm gì | Ở đâu | Kết quả |
|---|---|---|
| `nodemailer`, `smtp`, `sendgrid`, `resend`, `mail` gửi đi | `server/src`, `server/package.json` | Không có. `mail` chỉ xuất hiện ở "Mail ứng tuyển" — văn bản người dùng **tự sao chép** ([documents.md](./modules/documents.md)) và `mailto:` phía FE ([mail-link.ts](../../../ui-ai-job-search/lib/mail-link.ts)) |
| `websocket`, `socket.io`, `@nestjs/websockets`, `EventEmitter2` | `server/src`, hai FE | Không có |
| `webhook`, `firebase`, `push` | `server/src`, hai FE | Không có |
| §14 Notifications của 18 file module | [modules/](./modules/) | Tất cả ghi "Không có" |

Trường `ApplicationEvent` là nhật ký nội bộ, không phát thông báo; hiện cũng không route nào đọc nó ([applications.md#R4](./modules/applications.md)).

## 2. Cơ chế phản hồi thay thế (kéo, không đẩy)

| Kênh | Khi nào | Người nhận | Nội dung | Nguồn |
|---|---|---|---|---|
| Phản hồi HTTP đồng bộ | Mọi thao tác | Người gọi | JSON kết quả hoặc lỗi tiếng Việt | [11-error-handling.md](./11-error-handling.md) |
| Stream NDJSON | Tác vụ AI người dùng đang chờ | Người gọi | `partial` → `done` / `error` | [ndjson.ts](../../server/src/common/ndjson.ts) |
| Poll của FE | Việc nền (chấm điểm, tài liệu, bộ đề, đọc CV, upskill) | Người tạo việc | Trạng thái `PENDING/RUNNING/DONE/FAILED` + `failureKind` | Hook `use-*.ts` của FE, chu kỳ 2–5 s, bỏ cuộc sau ~180–210 s |
| Toast | Sau thao tác thành công/thất bại | Người đang mở trang | Câu tiếng Việt cố định | [toast-provider.tsx](../../../ui-ai-job-search/providers/toast-provider.tsx) |
| Thẻ cảnh báo console | Admin mở `/` của app admin | ADMIN | `attention[]` từ `GET /api/admin/overview`: hàng đợi > 50 việc, portal lỗi/quá 26 giờ, AI \< 80% thành công | [admin-console.md](./modules/admin-console.md) |
| Nhãn "đã cũ" | Mở lại kết quả AI | Chủ dữ liệu | `stale` (điểm cũ hơn hồ sơ), `feedbackStale`, bản tìm hiểu công ty quá hạn | [matching.md](./modules/matching.md), [interview-prep.md](./modules/interview-prep.md), [company-research.md](./modules/company-research.md) |

## 3. Bảng tổng hợp trigger

Vì không có kênh đẩy, bảng dưới liệt kê **sự kiện nghiệp vụ mà người dùng có thể muốn được báo nhưng hiện phải tự mở trang để thấy**:

| Sự kiện | Người cần biết | Kênh hiện có | Ghi chú |
|---|---|---|---|
| Có tin mới phù hợp sau lượt quét đêm | USER | Không — tự mở "Việc làm phù hợp" / Dashboard | Dashboard có "Việc mới hợp với bạn" ([dashboard.md](./modules/dashboard.md)) |
| Chấm điểm / tài liệu / bộ đề / đọc CV xong | USER | Poll khi đang mở trang; rời trang thì không biết | |
| Việc nền `FAILED` (kể cả do reconcile) | USER | Thấy khi mở lại trang | |
| Ngày phỏng vấn sắp tới (`Application.interviewAt`) | USER | Hiển thị ở màn Phỏng vấn, không nhắc | |
| Bị đổi vai trò | USER bị đổi | Không | Không có audit log ([admin-console.md](./modules/admin-console.md)) |
| Portal bị chặn / lượt quét hỏng | ADMIN | Thẻ cảnh báo khi mở console | |
| Gateway model hỏng nhiều | ADMIN | Thẻ cảnh báo, `/ai-health` | |

> **Possible Business Rule:** việc không có thông báo là có chủ đích ở phạm vi đồ án (không có hạ tầng gửi mail). Cần chủ dự án xác nhận trước khi đưa nhắc lịch phỏng vấn hay báo tin mới vào lộ trình.

## 4. Suy giảm êm

Không áp dụng (không có kênh nào để hỏng). Poll của FE có trần thời gian: hết hạn thì tắt spinner và hiện câu hướng dẫn thử lại thay vì quay vô tận — xem §10 của từng module.

## 5. Checklist QA

- [ ] Xác nhận không có email/thông báo nào được gửi khi đăng ký, đổi vai trò, nộp đơn (đúng với as-is).
- [ ] Với mỗi việc nền: đóng tab khi đang `RUNNING`, mở lại sau khi xong → thấy kết quả `DONE`.
- [ ] Ép lỗi model (tắt gateway): FE hiển thị câu theo `failureKind`, không hiện lỗi thô.
- [ ] Admin overview hiện cảnh báo khi một portal có lượt gần nhất `FAILED`.

## Source References

**Backend:** [ndjson.ts](../../server/src/common/ndjson.ts) · [overview.ts](../../server/src/modules/admin/utils/overview.ts) · [server/package.json](../../server/package.json)

**Frontend:** [toast-provider.tsx](../../../ui-ai-job-search/providers/toast-provider.tsx) · [mail-link.ts](../../../ui-ai-job-search/lib/mail-link.ts) · [failure-message.ts](../../../ui-ai-job-search/lib/failure-message.ts)
