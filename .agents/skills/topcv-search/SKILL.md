---
name: topcv-search
version: 1.0.0
description: >
  Use this skill to search job listings in Vietnam from TopCV's public job
  board. Covers software engineering, data, business, sales, marketing and
  operations roles across Ha Noi, Ho Chi Minh City, Da Nang and other
  provinces. Trigger phrases: tim viec TopCV, viec lam TopCV, tuyen dung
  TopCV, tim viec lam Viet Nam, job search Vietnam, TopCV jobs.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
allowed-tools: Bash(bun run .agents/skills/topcv-search/cli/src/cli.ts *)
---

# TopCV Search Skill

Tìm việc làm tại Việt Nam từ trang danh sách công khai của TopCV. Không cần
đăng nhập, không cần API key.

## Phạm vi được phép

`robots.txt` của topcv.vn chỉ chặn các đường dẫn liên quan tới CV cá nhân
(`/cv/`, `/xem-cv/`, `/sua-cv/`, `/cv-ung-vien/`, `/private/`). Các trang
`/tim-viec-lam-*` và `/viec-lam/*` **không** bị chặn.

robots.txt **không khai `Crawl-delay`**, nên nhịp là do phía gọi tự đặt. Giữ
tần suất thấp.

## Cần có `curl`

Đây là khác biệt lớn nhất so với `itviec-search`, và là thứ cần biết trước khi
triển khai lên máy chủ.

TopCV đứng sau Cloudflare, mà Cloudflare nhận dạng client qua **vân tay TLS**
(JA3) chứ không chỉ qua HTTP header. Bắt tay TLS của `bun` bị xếp là bot. Đã đo
xen kẽ ba lượt, cùng URL cùng `User-Agent`:

```
curl → 200   200   200
bun  → 403   403   403
```

Đổi header không cứu được vì vấn đề nằm dưới tầng HTTP. Vì vậy CLI này gọi
`curl` để tải trang. Máy chủ không có `curl` thì TopCV không quét được — CLI sẽ
báo lỗi rõ ràng chứ không im lặng trả về rỗng.

`curl` có sẵn trên Windows 10 trở lên, macOS, và hầu hết bản phân phối Linux
kèm ảnh Docker phổ biến.

## Cách dùng

```bash
# Tìm theo từ khóa
bun run .agents/skills/topcv-search/cli/src/cli.ts search \
  --query "reactjs" --limit 20

# Lọc theo thành phố (lọc ở phía client, xem ghi chú bên dưới)
bun run .agents/skills/topcv-search/cli/src/cli.ts search \
  --query "backend java" --location "Hồ Chí Minh" --limit 20

# Lấy mô tả đầy đủ của một tin
bun run .agents/skills/topcv-search/cli/src/cli.ts detail \
  "fullstack-web-developer-reactjs-nodejs/2254460"
```

## Những chỗ khác với các portal còn lại

| | Cách xử lý | Vì sao |
|---|---|---|
| Tải trang | Qua `curl`, không dùng `fetch` | Cloudflare chặn vân tay TLS của bun |
| Lọc thành phố | Ở phía client sau khi parse | TopCV lọc bằng `cityIds[]` với mã số không công bố |
| `--remote` | Nhận cờ nhưng không lọc gì | TopCV không ghi hình thức làm việc trên thẻ tìm kiếm |
| Tiêu đề ở trang chi tiết | Bóc từ thẻ `<title>` | Trang chi tiết không có `<h1>` và không có `og:title` |
| Lương "Thoả thuận" | Trả `null` | Không phải một mức lương |
| `slug` | Dạng `<ten-tin>/<id>` | Đủ để dựng lại URL chi tiết |
| `externalId` | `data-job-id`, số nguyên | Ổn định khi tin được sửa tiêu đề, khác với slug |

## Chạy test

```bash
cd .agents/skills/topcv-search/cli
bun test          # 33 test, chạy trên fixture HTML thật, không cần mạng
bun run typecheck
```
