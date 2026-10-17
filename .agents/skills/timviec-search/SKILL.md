---
name: timviec-search
version: 1.0.0
description: >
  Use this skill to search job listings in Vietnam from timviec.ai, the job
  board of Fiza on Zalo, by keyword. Strong in blue-collar, sales, driving,
  security, accounting, nursing and other non-IT roles across provinces; few
  IT jobs. Trigger phrases: tim viec timviec.ai, viec lam Zalo, tuyen dung
  Fiza, timviec.ai jobs.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
allowed-tools: Bash(bun run .agents/skills/timviec-search/cli/src/cli.ts *)
---

# timviec.ai Search Skill

Tìm việc làm tại Việt Nam trên timviec.ai (Công ty CP Fiza, kênh tìm việc trên
Zalo) **theo từ khoá thật**. Gọi API JSON công khai, không cần đăng nhập, không
cần API key. Đo 2026-10-17: máy chủ Oracle gọi được (200, dưới 0,5 giây).

## Phạm vi được phép

`robots.txt` không tồn tại (trả trang 404 HTML), nên không có đường nào bị
chặn. **Điều khoản sử dụng cho ứng viên** (`Fiza_TC_ver_2.3_0825.pdf`, mục 5.2)
không nhắc đích danh bot hay thu thập tự động, nhưng cấm *"xuất bản, phân phối,
truyền đi, phát, bán, cấp phép hoặc khai thác Nội Dung Fiza"*. Portal được thêm
theo quyết định giữ cách làm hiện tại trong giai đoạn đồ án — xem
`docs/adr/0006-dieu-khoan-portal.md` trước khi dùng cho mục đích thương mại.

## Đặc điểm cần biết

- **API**: `https://timviec.ai/api/candidates/jobs/filter-job-post?searchTerm=<từ khoá>&offset=&limit=`
  và `/jobs/detail/<id>`. Tham số tìm kiếm là **`searchTerm`**: `keyword`, `q`
  bị bỏ qua mà vẫn trả 200 với danh sách chung. Đo 2026-10-17: "kế toán" 186
  tin, "điều dưỡng" 6, "lập trình" 6; tổng cả trang khoảng 3.158 tin.
- **Không quét trang "mọi việc làm"**: không có `--query` thì không gọi.
- **API xếp theo độ liên quan, KHÔNG theo ngày.** Đo 2026-10-17: 14/186 tin
  "kế toán" đăng hoặc làm mới trong 7 ngày, rải khắp 10 trang (trang 6 nhiều
  nhất), mà backend chỉ đi 5 trang và chỉ giữ tin ≤ 7 ngày. Nên `search` trang 1
  tự đi hết kết quả (tối đa 10 trang × 20 tin, cách nhau 1 giây, mỗi trang ~8KB)
  rồi xếp tin mới nhất lên đầu; `--page` ≥ 2 trả rỗng để backend không gọi lặp.
  Một từ khoá mất khoảng 12 giây, dưới `SCRAPER_TIMEOUT_MS`.
- **Mô tả có sẵn trong kết quả tìm kiếm**: `job_description`, `job_requirement`,
  `job_benefit` (mỗi phần 250–750 ký tự). CLI gộp ba phần nên backend không
  phải gọi `detail`.
- **`published_at`/`last_published_at` là CHUỖI mili-giây** (`"1786419673000"`);
  `new Date(chuỗi)` ra ngày không hợp lệ, phải `Number()` trước. `postedAt` lấy
  `last_published_at` (lần đăng hoặc làm mới gần nhất: tin làm mới là vẫn đang
  tuyển), thiếu thì `published_at`. `expired_at` luôn null.
- **Logo** `company_logo_url` có ở 44/50 tin, ảnh JPEG trên `stc-fin.zdn.vn`,
  nhúng được từ domain khác (không chặn theo Referer) nhưng nặng (~880KB).
- **URL tin** là `/candidate/jobs/<id>`: trang này tự chuyển (308 + meta
  refresh) sang dạng có slug, nên không cần dựng slug. API không trả slug.
- **Lương** lấy nguyên chuỗi ("12 - 20 triệu / tháng"); "Thỏa thuận" là `null`.
- **Địa điểm** là địa chỉ đầy đủ tới phường, kết thúc bằng tỉnh; `--location`
  lọc phía client vì API lọc tỉnh bằng mã `cityId` không công bố bảng tra.
- **Chất lượng tin không đều**: có tin CTV "thu nhập 40–50tr/tháng làm tại nhà",
  và tin đăng từ năm trước vẫn còn trong danh sách — backend lọc theo ngày đăng.
- **Chặn**: 403 là `BLOCKED` ngay, không thử lại; phản hồi chỉ bị coi là chặn
  khi có dấu hiệu thử thách VÀ không có JSON thật hay JSON-LD `JobPosting`.
  KHÔNG tìm cách vượt.

## Lệnh

```bash
bun run .agents/skills/timviec-search/cli/src/cli.ts search --query "kế toán" --location "Ho Chi Minh"
bun run .agents/skills/timviec-search/cli/src/cli.ts detail 1557707155379847168
```

Kiểm tra: `cd .agents/skills/timviec-search/cli && bun test && bunx tsc --noEmit`.
