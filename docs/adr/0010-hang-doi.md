# ADR 0010: Hàng đợi pg-boss: tách file, khoá chặn trùng, batchSize

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Thêm hàng đợi, đổi policy, concurrency hoặc khoá `singletonKey`
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Hàng đợi

Bảy file, mỗi file một việc. `queue.service.ts` **re-export** `QUEUE` và mọi type, nên 37 file gọi tới vẫn chỉ import một đường và không cần biết bên trong chia thế nào:

| File | Giữ gì |
|---|---|
| `queue.constants.ts` | `QUEUE` + `QUEUE_POLICY`. **KHÔNG import gì** — đó là điều kiện để `queue-key.ts` dùng được mà không tạo phụ thuộc vòng |
| `queue.types.ts` | 11 payload + `Queue`/`QueueStatus`/`QueueStats`/`QueueConfigItem` |
| `queue.defaults.ts` | Bảng concurrency MẶC ĐỊNH, chỉ dùng khi database chưa có dòng |
| `queue-config.service.ts` | Concurrency đọc từ database. Admin đổi ở `/queues`, nhưng **worker chỉ nhận số mới sau khi khởi động lại**: pg-boss chốt `localConcurrency` lúc `boss.work()` đăng ký. Chốt 2026-10-16: chấp nhận restart; đã gỡ timer làm mới cache 30 giây và nhánh đọc biến môi trường `<QUEUE>_CONCURRENCY` (code chết vì database luôn được seed đủ) |
| `queue-key.ts` | `singletonKeyFor` |
| `queue.service.ts` | Chỉ còn class |

Tới 2026-09-23 `queue-key.ts` **chép lại 11 tên hàng đợi** dưới dạng chuỗi, kèm một test đối chiếu hai danh sách, vì `QUEUE` nằm chung file với class nên import ngược sẽ thành vòng. Tách `QUEUE` ra file riêng là vòng biến mất; **đừng dựng lại danh sách thứ hai đó**.

- Khoá chặn trùng được **suy ra từ payload** trong `queue-key.ts`, không do người gọi truyền vào. Thêm hàng đợi mới thì phải thêm một nhánh khoá — `queue-key.spec.ts` gọi `singletonKeyFor(<mọi queue>, {})` và bắt lỗi nếu rơi vào nhánh `default`, nên quên là đỏ ngay kèm tên hàng đợi bị quên.
- Policy là `exclusive`. `singletonKey` một mình **không** chặn trùng trên policy `standard`.
- **`batchSize` giữ nguyên 1, song song lấy từ `localConcurrency`, không phải ngược lại.** pg-boss áp kết quả handler cho CẢ lô (*"throwing from the handler still fails the whole batch"*), nên gom lô khiến một việc hỏng kéo đổ những việc lành cùng lô. `localConcurrency` sinh nhiều worker poll độc lập, mỗi worker một việc, lỗi không lây.
- **Vai `api` thoát ngay trong `QueueService.work`**, không để từng processor tự kiểm: đây là seam duy nhất cả 7 processor đều đi qua, nên processor thêm sau này tự thừa hưởng.
- Đổi policy trên database đã chạy cần `QUEUE_POLICY_MIGRATE=true` một lần, và việc đang chờ sẽ mất. Nếu hàng đợi khởi tạo thất bại thì **app không lên** — đó là chủ đích, không phải lỗi.
- Dùng `sendMany` cho lô lớn. `insert` của pg-boss cần `{ returnId: true }` mới trả về số đã xếp; thiếu nó thì luôn trả `null` và log báo 0.
