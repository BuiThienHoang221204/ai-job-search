---
name: topdev-search
version: 1.0.0
description: >
  Use this skill to search job listings in Vietnam from TopDev's public job
  board by keyword. Strong in IT and in jobs at Korean and Japanese employers,
  but also lists accounting, sales, interpreting and other roles across Ha Noi,
  Ho Chi Minh City and other provinces. Trigger phrases: tim viec TopDev,
  viec lam TopDev, tuyen dung TopDev, TopDev jobs.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
delayMs: 8000  # nhịp riêng: mỗi trang tìm kiếm ~1,4MB, và trang đứng sau Cloudflare
allowed-tools: Bash(bun run .agents/skills/topdev-search/cli/src/cli.ts *)
---

# TopDev Search Skill

Tìm việc làm tại Việt Nam trên TopDev **theo từ khoá thật**. Không cần đăng
nhập, không cần API key, không cần `curl` (`fetch` của bun nhận 200 từ máy chủ
Oracle, đo 2026-10-13).

## Phạm vi được phép

`robots.txt` của topdev.vn (đọc 2026-10-13) với `User-agent: *` cho phép `/` và
chỉ chặn `/job-seeker/login`, `/employers/search`, `/partners/`, `/job/getApply`,
`/affiliate/`, `/challenge/`, `/topdemy/`, `/socket.io`. Đường dùng ở đây là
`/jobs/search` và `/viec-lam/<slug>`, đều được phép.

**Điều khoản sử dụng** (`/term-of-services`) cấm *"sao chép, mô phỏng, truyền,
phân phối, công bố, tạo ra các sản phẩm phái sinh, hiển thị hoặc chuyển giao,
hoặc khai thác nhằm mục đích thương mại bất kỳ phần nào của nội dung"*, chỉ cho
phép bản sao để xem và dùng nội bộ. Portal được thêm theo quyết định giữ cách
làm hiện tại trong giai đoạn đồ án — xem bảng điều khoản ở mục "Nguồn tin" trong
`CLAUDE.md` trước khi dùng cho mục đích thương mại.

## Đặc điểm cần biết

- **Tìm theo từ khoá THẬT**: `/jobs/search?keyword=<từ khoá>&page=N`, 15 tin
  mỗi trang. Đo 2026-10-13: "Kế toán" 137 tin / 10 trang, trang 2 là tin
  16–30; "nhân viên kinh doanh" 73; "java developer" 19. Dạng đường dẫn
  `/viec-lam/tim-kiem/<slug>--` trả **404**, còn `/viec-lam/tim-kiem?keyword=`
  bỏ qua từ khoá (`total: 0`).
- **Không chỉ IT** dù tên là TopDev — nên SKILL.md này KHÔNG khai `occupations`.
- **Dữ liệu nằm trong payload RSC** (`self.__next_f.push`), không trong HTML.
  Thẻ script mang `type` lạ do Cloudflare Rocket Loader chèn vào, nên đừng khớp
  cứng `<script>`.
- **Trang nhúng 25 đối tượng tin cho 15 kết quả** — 10 cái còn lại là khối
  "việc làm hot". Kết quả thật là mảng nằm ngay trước `"meta":{"total":...}`
  (`resultJobs`). Lấy mọi đối tượng có `id` + `title` là lấy nhầm tin lạc ngành.
- **Mô tả có sẵn trên trang tìm kiếm**: `responsibilities_original` +
  `requirements_original`, có khi là chuỗi thẳng, có khi là tham chiếu `$xx`
  sang một đoạn rời `xx:T<độ dài hex>,` mà độ dài tính bằng BYTE. Giải được cả
  15/15 tin nên backend không phải gọi `detail` — đỡ 15 request mỗi trang.
- **JSON-LD của trang chi tiết THIẾU nội dung mô tả** — chỉ có tiêu đề các mục
  ("Your role & responsibilities"...). `detail` đọc payload RSC trước, JSON-LD
  chỉ là đường lùi. JSON-LD còn mã hoá chữ có dấu thành `&iacute;`, `&acirc;`.
- **`industry` của JSON-LD luôn là "Information Technology"**, kể cả tin kế
  toán — KHÔNG dùng làm nhãn ngành.
- **Nhãn ngành từ `job_category_id`**, mã TopDev không công bố bảng tên. Bảng
  `CATEGORY_LABELS` dựng từ 18 từ khoá đa ngành (đo 2026-10-13): `1` IT,
  `27` hành chính/nhân sự/phiên dịch, `50` giáo dục, `61` thiết kế/game art.
  Mã `14` (kế toán + marketing + chăm sóc khách hàng + ngân hàng) và `33` (cơ
  khí + xuất nhập khẩu + xây dựng) QUÁ RỘNG nên cố ý không thành nhãn — tiêu đề
  quyết định. Thấy mã mới thì đo lại bằng cách tìm vài từ khoá rồi đếm mã.
- **Lương** lấy nguyên chuỗi của trang ("15.000.000 VND to 23.000.000 VND",
  "Up to 45.000.000 VND"); "Negotiable"/"Thương lượng" là `null`.
- **`postedAt`** là ngày ĐĂNG (`published.date`, dd-mm-yyyy), không phải mốc
  làm mới.
- **Chặn**: trang đứng sau Cloudflare. 403 là `BLOCKED` ngay, không thử lại;
  trang thử thách mã 200 chỉ bị coi là chặn khi KHÔNG có payload hay JSON-LD.
  KHÔNG tìm cách vượt.

## Lệnh

```bash
bun run .agents/skills/topdev-search/cli/src/cli.ts search --query "kế toán" --location "Ho Chi Minh"
bun run .agents/skills/topdev-search/cli/src/cli.ts detail nhan-vien-ke-toan-tong-hop-cong-ty-co-phan-ad-tek-2135256
```

Kiểm tra: `cd .agents/skills/topdev-search/cli && bun test && bunx tsc --noEmit`.
