---
name: vietnamworks-search
version: 1.0.0
description: >
  Use this skill to search job listings in Vietnam from VietnamWorks' public
  job search API. Covers software engineering, finance, banking, sales,
  marketing and management roles across Ho Chi Minh City, Ha Noi, Da Nang and
  other provinces. Trigger phrases: tim viec VietnamWorks, viec lam
  VietnamWorks, tuyen dung VietnamWorks, tim viec lam Viet Nam, job search
  Vietnam, VietnamWorks jobs.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
allowed-tools: Bash(bun run .agents/skills/vietnamworks-search/cli/src/cli.ts *)
---

# VietnamWorks Search Skill

Tìm việc làm tại Việt Nam qua API tìm kiếm công khai của VietnamWorks. Không
cần đăng nhập, không cần API key, không phụ thuộc runtime nào ngoài `bun`.

## Gọi API, KHÔNG phân tích HTML

Đây là khác biệt lớn nhất so với `itviec-search` và `topcv-search`, và là điều
bắt buộc chứ không phải chọn cho gọn.

Trang `/viec-lam` của VietnamWorks là ứng dụng Next.js render hoàn toàn ở phía
trình duyệt. HTML trả về chỉ có `<div id="__next"></div>` rỗng: đã đo, từ khoá
tìm kiếm chỉ xuất hiện **2 lần trong 237KB** và không có một tin tuyển dụng
nào. Trang chi tiết cũng vậy, và cũng không nhúng `__NEXT_DATA__`. Phân tích
HTML ở đây sẽ luôn trả về rỗng.

```
POST https://ms.vietnamworks.com/job-search/v1.0/search
{ "query": "java", "page": 0, "hitsPerPage": 20, "filter": [], "userId": 0 }
```

Đổi lại thì dữ liệu có cấu trúc sẵn: không regex, không lo đổi markup.

**Đây là API nội bộ, không có tài liệu công khai.** Nó có thể đổi mà không báo
trước — đó là cái giá phải trả, và cũng là lý do mọi trường trong `helpers.ts`
đều đọc phòng thủ.

## Phạm vi được phép

`robots.txt` của vietnamworks.com chỉ chặn `/my-profile`, `/ho-so`,
`/apply-job-online`, các đường dẫn đăng nhập và vài endpoint nội bộ. Trang và
API tìm kiếm **không** bị chặn.

robots.txt **không khai `Crawl-delay`**, nên nhịp là do phía gọi tự đặt.

## `search` đã kèm sẵn mô tả

Khác hai portal kia: `jobDescription` và `jobRequirement` nằm ngay trong kết
quả tìm kiếm, nên **không cần thêm một request cho mỗi tin**. Một lần quét 20
tin ở đây tốn 1 request, còn ITviec tốn 21.

Lệnh `detail` vẫn có, dùng khi chỉ có trong tay một URL.

## Cách dùng

```bash
# Tìm theo từ khóa
bun run .agents/skills/vietnamworks-search/cli/src/cli.ts search \
  --query "java" --limit 20

# Lọc theo thành phố (lọc ở phía client)
bun run .agents/skills/vietnamworks-search/cli/src/cli.ts search \
  --query "backend" --location "Hồ Chí Minh" --limit 20

# Tra một tin theo slug hoặc URL
bun run .agents/skills/vietnamworks-search/cli/src/cli.ts detail \
  "cobol-senior-supervisor-smart-life-asia-2092118-jv"
```

## Những chỗ khác với các portal còn lại

| | Cách xử lý | Vì sao |
|---|---|---|
| Nguồn | API JSON | Trang web không có dữ liệu trong HTML |
| Mô tả | Có sẵn trong `search` | API trả kèm; tiết kiệm 1 request mỗi tin |
| `detail` | Tìm theo alias rồi đối chiếu `jobId` | Không có endpoint chi tiết: `/job/v1.0/<id>` trả 403, `/job-search/v1.0/jobs/<id>` trả 404, và `filter` theo jobId trả 400 |
| Phân trang | API đếm từ 0, CLI nhận từ 1 | Đồng bộ giao diện với các portal khác |
| Lương "Thương lượng" | Trả `null` | `isSalaryVisible: false` đi kèm `min/max = 0`; hiện "0 ₫" là một con số SAI |
| Địa điểm | Bỏ hậu tố ", Vietnam" | API luôn thêm; giữ lại thì bộ lọc phải xử lý thêm một biến thể vô nghĩa |
| `--remote` | Nhận cờ nhưng không lọc gì | API không phân biệt được hình thức làm việc ở mức dùng được |
| So khớp có dấu | Bỏ dấu trước rồi mới so | Cùng một chữ có thể ở dạng NFC hoặc NFD; liệt kê biến thể dấu bằng tay sẽ hỏng lặng lẽ |

## Chạy test

```bash
cd .agents/skills/vietnamworks-search/cli
bun test          # 35 test, chạy trên fixture JSON thật, không cần mạng
bun run typecheck
```
