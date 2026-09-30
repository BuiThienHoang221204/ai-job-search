---
name: careerviet-search
version: 1.0.0
description: >
  Use this skill to search job listings in Vietnam from CareerViet's public job
  board by keyword. Multi-sector: accounting, finance, sales, engineering,
  manufacturing, logistics and IT across Ha Noi, Ho Chi Minh City and other
  provinces. Trigger phrases: tim viec CareerViet, viec lam CareerViet,
  tuyen dung CareerViet, CareerBuilder Vietnam jobs.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
delayMs: 8000  # nhịp riêng: mỗi trang ~1,5MB, và bài học hCaptcha của careerlink
allowed-tools: Bash(bun run .agents/skills/careerviet-search/cli/src/cli.ts *)
---

# CareerViet Search Skill

Tìm việc làm tại Việt Nam trên CareerViet **theo từ khoá thật**. Không cần đăng
nhập, không cần API key, không cần `curl` (`fetch` của bun nhận 200, đo
2026-09-30).

## Phạm vi được phép

`robots.txt` của careerviet.vn (đọc 2026-09-29) với `User-agent: *` chỉ chặn
`/qckiemviec/` và `/vi/jobseekers/jobs/save`; `/viec-lam/` và
`/vi/tim-viec-lam/` được phép.

Cùng file đó **chặn hẳn `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`** và
các bot AI khác - tức họ không muốn nội dung bị dùng cho AI. CLI này không mang
tên các bot đó, nhưng backend gửi mô tả tin vào model để rút yêu cầu. Xem mục
"Nguồn tin" trong `CLAUDE.md` trước khi dùng cho mục đích thương mại.

## Đặc điểm cần biết

- **Tìm theo từ khoá THẬT**, khác Vieclam24h và JobOKO: `/viec-lam/<slug>-k-vi.html`.
  Đo 2026-09-29: "kế toán" 952 tin, 50/50 tin trang 1 có chữ "kế toán".
- **Phân trang chạy**: `/viec-lam/<slug>-k-trang-N-vi.html`, 50 tin mỗi trang;
  trang 2 trùng 1/50 tin với trang 1. Nút phân trang trên trang là nút JS
  không có `href`, nên dạng URL này lấy từ quy ước cũ của trang và đã đo lại.
- **`postedAt` trên thẻ tìm kiếm là mốc "Cập nhật"** (dd-mm-yyyy), không phải
  ngày đăng. `detail` trả `datePosted` thật từ JSON-LD.
- **Trang chi tiết có JSON-LD `JobPosting`** với `skills` do portal tự gắn -
  CLI trả chúng làm `tags`. Mô tả vẫn bóc từ HTML ("Mô tả Công việc" + "Yêu Cầu
  Công Việc") để giữ tiêu đề từng phần; JSON-LD là đường lùi.
- Tên công ty trên thẻ và trong JSON-LD có thể khác nhau ("Homeflow" / "Home
  Flow") - backend chống trùng theo tên trên THẺ.
- Mỗi trang ~1,5MB (phần lớn là payload RSC), nên nhịp riêng `delayMs: 8000`.
  Chưa gặp trang chặn; CLI vẫn kiểm nội dung và báo `BLOCKED` nếu gặp.

## Cách dùng

```bash
bun run .agents/skills/careerviet-search/cli/src/cli.ts search --query "kế toán tổng hợp" --location "Ho Chi Minh" --limit 10
bun run .agents/skills/careerviet-search/cli/src/cli.ts detail "ke-toan.35C83573"
```

## Kiểm thử

```bash
cd .agents/skills/careerviet-search/cli && bun test
```

Fixture là trang thật đã bỏ `<script>`/`<svg>` - phần CLI không đọc.
