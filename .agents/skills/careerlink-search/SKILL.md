---
name: careerlink-search
version: 1.0.0
description: >
  Use this skill to search job listings in Vietnam from CareerLink's public job
  board. Multi-sector: accounting, sales, manufacturing, logistics, admin and
  some IT roles across Ha Noi, Ho Chi Minh City and other provinces. Trigger
  phrases: tim viec CareerLink, viec lam CareerLink, tuyen dung CareerLink,
  CareerLink jobs.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
delayMs: 10000  # nhịp riêng: ở 3 giây CareerLink bật hCaptcha sau ~28 trang chi tiết
allowed-tools: Bash(bun run .agents/skills/careerlink-search/cli/src/cli.ts *)
---

# CareerLink Search Skill

Tìm việc làm tại Việt Nam từ trang tìm kiếm công khai của CareerLink. Không cần
đăng nhập, không cần API key, không cần `curl`.

## Phạm vi được phép

`robots.txt` của careerlink.vn (đọc 2026-09-29) cho phép
`/vieclam/tim-kiem-viec-lam` và `/tim-viec-lam/*`; chỉ chặn khu vực tài khoản
người tìm việc, nhà tuyển dụng và các URL `_rsc=`. Không khai `Crawl-delay`.

Cùng file đó **chặn hẳn `GPTBot` và `ClaudeBot`**. CLI này không mang tên hai
bot đó, nhưng backend gửi mô tả tin vào model để rút yêu cầu - xem mục "Nguồn
tin" trong `CLAUDE.md` trước khi dùng cho mục đích thương mại.

## Chống bot: hCaptcha, và nhịp 10 giây

Đo 2026-09-29: lượt quét đầu tiên (5 trang tìm kiếm + 50 trang chi tiết, nhịp
chung 3 giây) bị **hCaptcha** chặn sau khoảng 28 trang chi tiết; 22/50 tin mới
bị bỏ vì không lấy được mô tả. Trang captcha trả **HTTP 200**, nên CLI kiểm
nội dung (`isBlockedPage`) và báo mã `BLOCKED` thay vì "0 kết quả".

- `delayMs: 10000` trong frontmatter là nhịp riêng của portal này (`PortalCliService`
  đọc nó; portal khác vẫn dùng `SCRAPER_PORTAL_DELAY_MS`). 10 giây là ƯỚC LƯỢNG
  an toàn - ngưỡng thật của CareerLink chưa đo được. Thấy `BLOCKED` lặp lại thì
  nâng tiếp, đừng hạ.
- Gặp `BLOCKED`, backend **tạm ngừng gọi portal này 30 phút**
  (`BLOCKED_COOLDOWN_MS`); các tin còn lại của lượt đó bị bỏ và sẽ được lấy
  lại ở lượt sau vì chưa có trong database.
- **Không tìm cách giải captcha.** Đó là lớp kiểm soát truy cập của trang.

## Đặc điểm cần biết

- **Đa ngành, mỏng mảng IT.** Đo 2026-09-29: "kế toán" 1.227 tin, "developer"
  33, "reactjs" 1.
- **Khớp NGUYÊN CỤM.** "frontend developer" ra 0 tin trong khi "frontend" ra 24.
  Ra 0 tin không có nghĩa là portal hỏng.
- **Mỗi trang 50 tin**, lật trang bằng `--page`.
- **`postedAt` trên thẻ tìm kiếm là mốc CẬP NHẬT** (`data-datetime`), không phải
  ngày đăng - tin được làm mới trông mới hơn thật. `detail` trả ngày đăng thật
  từ `datePosted` của JSON-LD.
- **Tên công ty trả về ở dạng Unicode NFD** trong khi chức danh là NFC. CLI
  chuẩn hoá mọi chữ về NFC; bỏ bước đó thì chống trùng giữa portal hỏng mà
  không có gì báo. Có test canh.
- Trang chi tiết có JSON-LD `JobPosting` (ngày đăng, lương dạng số, địa điểm,
  ngành). Mô tả vẫn bóc từ HTML để giữ tiêu đề "Mô tả công việc" / "Kinh
  nghiệm / Kỹ năng chi tiết"; JSON-LD chỉ là đường lùi.

## Cách dùng

```bash
bun run .agents/skills/careerlink-search/cli/src/cli.ts search --query "kế toán" --location "Hà Nội" --limit 10
bun run .agents/skills/careerlink-search/cli/src/cli.ts detail "ke-toan-kho/3636130"
```

Đầu ra JSON theo hợp đồng chung của các portal (`id`, `slug`, `title`, `url`,
`company`, `location`, `salary`, `postedAt`, `tags`; `detail` thêm
`description`). Lỗi ghi ra stderr dạng `{"error": "...", "code": "..."}`.

## Kiểm thử

```bash
cd .agents/skills/careerlink-search/cli && bun test
```

Test chạy trên hai trang thật đã lưu ở `tests/fixtures/`, không cần mạng.
