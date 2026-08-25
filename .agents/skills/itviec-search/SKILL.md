---
name: itviec-search
version: 1.0.0
description: >
  Use this skill to search IT job listings in Vietnam from ITviec's public job
  board. Covers software engineering, data, DevOps, QA, design and product roles
  across Ho Chi Minh City, Ha Noi, Da Nang and remote. Trigger phrases: tim viec
  IT, viec lam lap trinh, tuyen dung IT Viet Nam, ITviec, find IT jobs in
  Vietnam, job search Ho Chi Minh, job search Ha Noi.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
allowed-tools: Bash(bun run .agents/skills/itviec-search/cli/src/cli.ts *)
---

# ITviec Search Skill

Tìm việc làm CNTT tại Việt Nam từ trang danh sách công khai của ITviec. Không
cần đăng nhập, không cần API key, không phụ thuộc runtime nào ngoài `bun`.

## Phạm vi được phép

`robots.txt` của itviec.com khai `Allow: /` cho mọi bot và chỉ chặn
`/subscriptions/new`, nên các trang `/it-jobs/*` nằm trong phạm vi được phép
truy cập. Vẫn nên **giữ tần suất thấp** và không thu thập hàng loạt.

## Cách dùng

```bash
# Tìm theo từ khóa và thành phố
bun run .agents/skills/itviec-search/cli/src/cli.ts search \
  --query "reactjs" --location "Ho Chi Minh" --limit 20

# Lọc theo hình thức làm việc
bun run .agents/skills/itviec-search/cli/src/cli.ts search \
  --query "backend java" --location "Ha Noi" --remote hybrid

# Lấy mô tả đầy đủ của một tin
bun run .agents/skills/itviec-search/cli/src/cli.ts detail \
  senior-full-stack-engineer-reactjs-golang-nab-innovation-centre-vietnam-2510
```

## Lệnh

| Lệnh | Mục đích |
|------|----------|
| `search` | Trả về danh sách thẻ việc làm. Không có mô tả đầy đủ. |
| `detail <slug\|url>` | Trả về một tin kèm mô tả đầy đủ. |

### Cờ search

| Cờ | Ý nghĩa |
|----|---------|
| `--query`, `-q` | Từ khóa: chức danh hoặc kỹ năng. VD `reactjs`, `backend java`. |
| `--location`, `-l` | Thành phố. VD `Ho Chi Minh`, `Ha Noi`, `Da Nang`. |
| `--remote` | `remote` \| `hybrid` \| `onsite`. |
| `--page` | Trang, tính từ 1. |
| `--limit`, `-n` | Giới hạn số kết quả. |
| `--format` | `json` (mặc định) \| `table` \| `plain`. |

## Ba điều cần biết trước khi dùng

**1. `search` không trả về mô tả công việc.** Thẻ tìm kiếm chỉ có chức danh,
công ty, địa điểm, hình thức và tags. Muốn đánh giá độ phù hợp thì bắt buộc
phải gọi `detail` cho từng tin — mỗi tin là một request nữa.

**2. ITviec không lọc thành phố phía server.** Đã kiểm chứng: `?city_names[]=`
trả về kết quả y hệt khi không lọc. CLI này làm việc đó ở phía client sau khi
phân tích. Vì vậy `--limit` áp dụng SAU khi lọc, và một trang có thể chỉ còn
vài kết quả.

**3. Phần lớn tin ẩn mức lương sau đăng nhập.** Khi đó trường `salary` là
`null`. Đừng xem đó là "lương thấp"; đó là không có dữ liệu.

## Định dạng trả về

`search` trả về mảng các đối tượng:

```json
{
  "id": "5195fb81-cdb4-4d14-b898-abcd2fac491a",
  "slug": "full-stack-reactjs-nodejs-developer-fpt-software-0018",
  "title": "Full-Stack ReactJS/ NodeJS Developer",
  "company": "FPT Software",
  "companyUrl": "https://itviec.com/companies/fpt-software",
  "location": "Ha Noi",
  "workMode": "At office",
  "salary": null,
  "postedAt": "1 day ago",
  "tags": ["Fullstack", "PostgreSql", "MongoDB", "NodeJS", "ReactJS"],
  "url": "https://itviec.com/it-jobs/full-stack-reactjs-nodejs-developer-fpt-software-0018"
}
```

`detail` trả về cùng cấu trúc, thêm trường `description`.

Trường `id` là `data-job-key` — một UUID **ổn định giữa các lần chạy**, nên
dùng nó làm khóa chống trùng. Đừng dùng `slug`: slug đổi khi tin được sửa tiêu
đề.

## Mã lỗi

Lỗi ghi ra stderr dưới dạng JSON `{ "error": "...", "code": "..." }`.

| Mã | Ý nghĩa |
|----|---------|
| `INVALID_FLAG` | Cờ sai định dạng. Thoát 2. |
| `MISSING_ARG` | Thiếu tham số bắt buộc. Thoát 2. |
| `NOT_FOUND` | Không tìm thấy tin. Thoát 1. |
| `FETCH_FAILED` | Lỗi mạng hoặc ITviec từ chối. Thoát 1. |
