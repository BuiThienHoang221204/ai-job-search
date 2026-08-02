# AI Job Search

Workspace quản lý toàn bộ quy trình tìm việc bằng AI: tìm kiếm việc làm tự động, đánh giá mức độ phù hợp, viết CV / cover letter (LaTeX), chuẩn bị phỏng vấn và lên kế hoạch học tập.

## Yêu cầu môi trường

| Công cụ | Phiên bản | Mục đích | Bắt buộc |
|---|---|---|---|
| Node.js | >= 18 | Chạy script setup (`npm run ...`) | Có |
| git | bất kỳ | Quản lý phiên bản | Có |
| Python | >= 3.10 | Tool tra cứu lương (`salary_lookup.py`) | Có |
| Bun | bất kỳ | Chạy các CLI tìm việc (LinkedIn, job boards) | Có |
| LaTeX (MiKTeX / MacTeX / texlive) | bất kỳ | Biên dịch CV (`lualatex`) và cover letter (`xelatex`) | Có |
| Claude Code | bất kỳ | Trợ lý AI chạy quy trình `/setup`, `/apply`, ... | Tùy chọn (khuyến nghị) |
| poppler (`pdftotext`) | bất kỳ | Kiểm tra ATS khi `/apply` | Tùy chọn |

## Cài đặt nhanh

```bash
npm run setup
```

Lệnh này sẽ:

1. **Kiểm tra môi trường** — báo trạng thái từng công cụ (OK / MISSING).
2. **Cài phần thiếu** — tự động cài theo hệ điều hành (Windows dùng winget/choco, macOS dùng Homebrew, Linux dùng apt/dnf).
3. **Cài dependencies cho CLI tìm việc** — `bun install` trong từng thư mục `.agents/skills/*/cli`.

> Trên Windows, nếu PowerShell báo lỗi Execution Policy khi gõ `npm`, hãy dùng `npm.cmd run setup` hoặc chạy một lần:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

## Các lệnh npm

| Lệnh | Chức năng |
|---|---|
| `npm run check` | Kiểm tra môi trường, không thay đổi gì |
| `npm run setup` | Kiểm tra + cài phần thiếu + cài deps CLI (khuyến nghị) |
| `npm run install:env` | Cài các công cụ còn thiếu |
| `npm run install:python` | Cài Python 3.10+ |
| `npm run install:bun` | Cài Bun |
| `npm run install:claude` | Cài Claude Code (cần npm) |
| `npm run install:latex` | Cài LaTeX (MiKTeX / MacTeX / texlive-full) |
| `npm run install:poppler` | Cài `pdftotext` cho kiểm tra ATS |
| `npm run install:tools` | `bun install` cho các CLI tìm việc |
| `npm run test` | Chạy unit test của các CLI tìm việc |
| `npm run smoke` | Biên dịch thử CV và cover letter mẫu để xác nhận LaTeX hoạt động |

## Quy trình sử dụng

Toàn bộ quy trình chạy trong Claude Code:

```bash
claude
```

### 1. Khởi tạo hồ sơ cá nhân

```text
/setup
```

Nhập thông tin CV, kinh nghiệm, kỹ năng, mục tiêu tìm việc. Kết quả được ghi vào `CLAUDE.md` và các file profile trong `.claude/skills/job-application-assistant/`. Có thể cập nhật từng phần sau:

```text
/setup --section skills
/setup --section experience
/setup --section search
```

### 2. Tìm kiếm việc làm

```text
/scrape
```

Quét các job board (LinkedIn + các portal Đan Mạch) theo cấu hình tìm kiếm, ghi vào job tracker và loại bỏ trùng lặp giữa các lần chạy.

### 3. Đánh giá và nộp hồ sơ

```text
/apply https://jobindex.dk/job/1234567
```

Hoặc dán trực tiếp nội dung tin tuyển dụng vào sau `/apply`. Claude sẽ đánh giá mức độ phù hợp, hỏi xác nhận, soạn CV và cover letter, nhờ reviewer góp ý rồi chỉnh sửa trước khi xuất ra file LaTeX.

### 4. Biên dịch CV và cover letter

```bash
npm run smoke                          # biên dịch thử file mẫu
```

Biên dịch file thật sau khi `/apply` tạo:

```bash
# Windows PowerShell
Set-Location cv; lualatex main_<company>_<role>.tex; Set-Location ..
Set-Location cover_letters; xelatex cover_<company>_<role>.tex; Set-Location ..
```

```bash
# Bash / zsh / Git Bash
cd cv && lualatex main_<company>_<role>.tex && cd ..
cd cover_letters && xelatex cover_<company>_<role>.tex && cd ..
```

> CV biên dịch bằng `lualatex` (pdflatex thường lỗi font trên MiKTeX mới), cover letter bằng `xelatex` (cần `fontspec` cho font Lato/Raleway).

### 5. Các lệnh khác

| Lệnh | Chức năng |
|---|---|
| `/upskill` | So sánh hồ sơ với yêu cầu công việc, lập kế hoạch học tập |
| `/rank` | Xếp hạng các tin tuyển dụng theo mức độ phù hợp |
| `/interview` | Luyện phỏng vấn |
| `/outcome` | Ghi nhận kết quả ứng tuyển |
| `/add-portal` | Tạo CLI tìm việc cho một job board khác |
| `/add-template` | Đăng ký template LaTeX riêng cho CV/cover letter |
| `/gmail-sync`, `/notion-sync`, `/html-report` | Đồng bộ / báo cáo (tùy chọn) |

## Cấu trúc thư mục

```
├── .agents/skills/          # CLI tìm việc (LinkedIn, job boards)
├── .claude/                 # Skill + command định nghĩa quy trình
├── CLAUDE.md                # Hồ sơ ứng viên (điền qua /setup)
├── cv/                      # Template CV LaTeX + CV đã soạn
├── cover_letters/           # Template cover letter + đã soạn
├── documents/               # CV gốc, bằng cấp, tài liệu tham khảo
├── scripts/setup.mjs        # Script setup (check + install)
├── tools/                   # Tool Python (tra cứu lương, kiểm tra PDF...)
└── package.json             # npm scripts
```

## Khắc phục sự cố

**LaTeX lỗi font / package:**
- MiKTeX bản Basic: bật tự cài package khi biên dịch (chạy 1 lần):
  ```powershell
  initexmf --admin --set-config-value=[MPM]AutoInstall=1
  initexmf --set-config-value=[MPM]AutoInstall=1
  ```

**`/apply` không chạy kiểm tra ATS:** do thiếu `pdftotext` — chạy `npm run install:poppler`, hoặc chấp nhận bỏ qua (vẫn hoạt động bình thường).

**`npm run` báo Execution Policy (Windows):** dùng `npm.cmd` hoặc `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

**Thiếu `salary_data.json`:** bình thường nếu chưa thiết lập dữ liệu lương — `/apply` tự bỏ qua bước này.

## Cập nhật từ upstream

```bash
git fetch upstream --tags
git merge v1.0.0        # hoặc nhánh bạn muốn
python tools/check_upstream_updates.py   # xem file nào thay đổi trước khi merge
```

Xem thêm hướng dẫn chi tiết tại [SETUP.md](SETUP.md).
