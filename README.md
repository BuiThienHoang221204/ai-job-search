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

## Hai runtime dùng chung một repo

Repo này phục vụ **hai môi trường thi hành khác nhau** trên cùng một bộ skill. Biết
thư mục nào thuộc bên nào sẽ tránh được nhầm lẫn khi đọc mã.

| | Claude Code | Backend `server/` |
|---|---|---|
| Dùng để | Soạn và debug skill, tự tìm việc cho bản thân | Phục vụ nhiều người dùng qua HTTP |
| Đọc skill từ | `.claude/skills/` | `.claude/skills/` (**cùng một nguồn**) |
| Hồ sơ ứng viên | `CLAUDE.md` | Bảng `Profile` trong Postgres |
| CV / thư sinh ra | `cv/main_*.tex`, `cover_letters/cover_*.tex` | `workspaces/<userId>/...` |
| Việc đã xem | `job_scraper/seen_jobs.json` | Ràng buộc unique `(source, externalId)` |
| Lịch sử ứng tuyển | `job_search_tracker.csv` | Bảng `JobMatch` |
| Báo cáo upskill | `upskill/*.md` | Bảng `UpskillReport` |

Các thư mục `documents/`, `templates/`, `upskill/`, `job_scraper/` đã được **xoá** vì
backend thay thế hoàn toàn vai trò của chúng. Nếu bạn muốn chạy lại các lệnh Claude Code
cần đến chúng (`/setup`, `/add-template`), khôi phục bằng:

```bash
git checkout <commit-truoc-khi-xoa> -- documents templates upskill job_scraper
```

Điểm mấu chốt: **file `SKILL.md` là chung cho cả hai.** Sửa một lần, cả hai nơi cùng
đổi. Backend gọi `POST /api/skills/reload` là nạp lại ngay, không cần khởi động lại.

## Cấu trúc thư mục

```
├── .agents/skills/          # CLI tìm việc, mỗi portal một thư mục
│   ├── itviec-search/       #   ITviec (Việt Nam) - backend đang dùng
│   └── linkedin-search/     #   LinkedIn (toàn cầu)
├── .claude/                 # Skill + command - NGUỒN SỰ THẬT DUY NHẤT
├── server/                  # Backend NestJS + Prisma + pg-boss  ← nơi bạn làm việc
│   ├── docker-compose.yml   #   Postgres
│   └── docs/routes.html     #   Tài liệu cơ chế 35 route
├── workspaces/              # Dữ liệu người dùng của backend (gitignored)
├── CLAUDE.md                # Hồ sơ ứng viên cho Claude Code
├── cv/                      # THƯ VIỆN template CV LaTeX (main_example.tex)
├── cover_letters/           # cover.cls + font Lato/Raleway - CẦN để compile
├── scripts/setup.mjs        # Script setup (check + install)
├── tools/                   # Tool Python (lint skill, kiểm tra PDF, tra lương)
└── package.json             # npm scripts
```

**Đừng xoá `cover_letters/cover.cls` và `cover_letters/OpenFonts/`.** Backend sinh ra
file `.tex` khai `\documentclass{cover}` — chính là class đó. Mất chúng là không
biên dịch được thư xin việc nào.

Ba đường dẫn ở gốc bị **CI khoá cứng**, đừng di chuyển: `tools/` (CI gọi trực tiếp),
`scripts/` (11 npm script trỏ vào), `.agents/` (`security_guards.py` glob và báo lỗi
nếu cây thư mục đổi chỗ). `security_guards.py` cũng ép `.gitignore` phải chứa nguyên
văn các mẫu `cv/main_*.*`, `cover_letters/cover_*.*` — giữ nguyên các dòng đó kể cả
khi thư mục tương ứng đã bị xoá.

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
