# Architecture Decision Records

Mỗi file ghi MỘT quyết định đã chốt của backend: bối cảnh, quyết định, số đo, bẫy đã sập. `CLAUDE.md` chỉ giữ quy tắc dùng ở mọi lượt làm việc và một dòng trỏ tới từng ADR.

## Khi nào thêm hoặc sửa ADR

- Chốt một quyết định có lý do không nhìn ra từ code (đo được gì, vì sao chọn cách này, bẫy đã gặp) → thêm ADR mới, số tiếp theo.
- Quyết định cũ đổi → sửa ADR đó, hoặc thêm ADR mới và ghi `Thay thế bởi ADR NNNN` ở ADR cũ. Đừng xoá ADR cũ: lý do cũ là lịch sử cần giữ.
- Thêm một dòng vào mục "Quyết định theo chủ đề" trong `CLAUDE.md`, mở đầu bằng điều kiện đọc ("Sửa …", "Thêm …").

## Mẫu

```markdown
# ADR NNNN: <tên quyết định>

- **Trạng thái:** Đã chấp nhận | Thay thế bởi ADR NNNN
- **Đọc khi:** <việc cụ thể khiến agent cần mở file này>
- **Ngày:** YYYY-MM-DD

## Bối cảnh
<vấn đề, số đo>

## Quyết định
<chọn gì>

## Hệ quả
<điều phải giữ, bẫy đã sập, test ghim>
```
