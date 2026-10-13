---
name: 123job-search
version: 1.0.0
description: >
  Use this skill to search job listings in Vietnam from 123job's public job
  board by keyword. Multi-sector: accounting, sales, administration,
  manufacturing, logistics, IT and more across Ha Noi, Ho Chi Minh City and
  other provinces, including many small employers not listed on other portals.
  Trigger phrases: tim viec 123job, viec lam 123job, tuyen dung 123job.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
delayMs: 8000  # nhịp riêng: mỗi tin mới tốn thêm một request detail
allowed-tools: Bash(bun run .agents/skills/123job-search/cli/src/cli.ts *)
---

# 123job Search Skill

Tìm việc làm tại Việt Nam trên 123job **theo từ khoá thật**. Không cần đăng
nhập, không cần API key, không cần `curl` (`fetch` của bun nhận 200 từ máy chủ
Oracle; trang chạy nginx, không đứng sau Cloudflare — đo 2026-10-13).

## Phạm vi được phép

`robots.txt` của 123job.vn (đọc 2026-10-13) với `User-agent: *` chỉ chặn
`/ajax` và `/apply`; `/tuyen-dung` và `/viec-lam/` được phép.

**Điều khoản** (`/help/policy`) cấm *"Thu thập, khai thác hoặc sử dụng dữ liệu
từ hệ thống trái phép"* và ghi dữ liệu thuộc quyền sở hữu của 123job. Portal được
thêm theo quyết định giữ cách làm hiện tại trong giai đoạn đồ án — xem bảng
điều khoản ở mục "Nguồn tin" trong `CLAUDE.md` trước khi dùng cho mục đích
thương mại.

## Đặc điểm cần biết

- **Tìm theo từ khoá THẬT**: `/tuyen-dung?q=<từ khoá>&page=N`, 30 tin mỗi
  trang. Đo 2026-10-13: "kế toán" 5.300+ tin; trang 1 và trang 2 không trùng
  tin nào.
- **Nhiều tin không có ở các portal khác**: đối chiếu 30 tin kế toán trang 1
  với database, phần lớn công ty có tên riêng (SJIT Vina, Fastech, Dreamtech...)
  chưa từng xuất hiện.
- **Mã tin là `data-id` SỐ của thẻ** (`5613141`). Trang còn nhiều `data-id`
  nhỏ (1, 2, 3...) ở các phần tử khác — chỉ đọc trong `js-item-job`.
- **Thẻ tìm kiếm chỉ có đoạn mô tả bị cắt** ("…/..."), nên CLI KHÔNG trả
  `description` ở thẻ: backend gọi `detail` cho mọi tin mới.
- **Mô tả lấy từ HTML trang chi tiết** (`content-group__title` "Mô tả công việc"
  + "Yêu cầu công việc"), JSON-LD chỉ là đường lùi: JSON-LD có lúc THIẾU hẳn
  phần yêu cầu (tin "Kế toán thuế").
- **HTML nén bỏ ngoặc thuộc tính**: `<script type=application/ld+json>` —
  regex phải chấp nhận cả hai dạng, nếu không JSON-LD "biến mất" trong im lặng.
- **Nhãn ngành = `industry` của JSON-LD** ("Kế toán - Kiểm toán"), do nhà
  tuyển dụng chọn, đi vào `categories`. Có lúc lệch nghề ("Phát triển thị
  trường" cho một tin Business Analyst) — backend để tiêu đề rõ nghề thắng nhãn.
- **Lương**: phần lớn thẻ ghi "Đang cập nhật" → `null`.
- **`postedAt`** là `data-time` của thẻ (yyyy-mm-dd), khớp mốc "Đăng N giờ
  trước"; `detail` trả `datePosted` của JSON-LD.
- **Chặn**: 403 là `BLOCKED` ngay, không thử lại; trang thử thách mã 200 chỉ bị
  coi là chặn khi KHÔNG có thẻ tin hay JSON-LD. KHÔNG tìm cách vượt.

## Lệnh

```bash
bun run .agents/skills/123job-search/cli/src/cli.ts search --query "kế toán" --location "Ha Noi"
bun run .agents/skills/123job-search/cli/src/cli.ts detail ke-toan-thue-3q27l5wpDM
```

Kiểm tra: `cd .agents/skills/123job-search/cli && bun test && bunx tsc --noEmit`.
