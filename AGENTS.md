---
framework_version: 1.1.0
---

# Agent Guidelines: AI Job Search

Repo này chứa **hai runtime dùng chung một bộ đặc tả**. Xác định mình đang làm việc nào trước khi đọc tiếp — hai runtime có nguồn sự thật khác nhau, và nhầm chỗ là nguyên nhân phổ biến nhất khiến agent sửa sai file.

| Bạn đang làm gì | Đọc gì |
|---|---|
| **Viết code backend** (NestJS trong `server/`) — gần như mọi việc hiện nay | [CLAUDE.md](CLAUDE.md) rồi [server/README.md](server/README.md) |
| **Chạy quy trình tìm việc cá nhân** (`/apply`, `/rank`, `/scrape`…) | [.claude/](.claude/) là nguồn sự thật |

## Thiết kế thin-pointer (một nguồn sự thật)

Để không trùng lặp và không lệch cấu hình giữa các framework agent khác nhau (Claude Code, Google Antigravity, Codex, Cursor, Gemini CLI…), mọi runtime nạp đặc tả từ đúng những chỗ dưới đây thay vì tự khai lại:

1. **Đặc tả quy trình (nguồn sự thật cho CẢ HAI runtime):**
   - Các bước và điều kiện kích hoạt của từng tác vụ (setup, scrape, rank, apply, upskill, interview) nằm trong [.claude/](.claude/) — cụ thể là `.claude/skills/` và `.claude/commands/`.
   - Backend **nạp chính các file này lúc chạy** (`SkillRegistryService`) và nhồi khung đặc tả vào prompt, nên sửa một file `.md` ở đó là đổi hành vi của máy chủ đang chạy. Đừng sao chép nội dung sang code.

2. **Hồ sơ ứng viên:**
   - Với backend: bảng `Profile` trong Postgres. `PromptBuilderService` điền các token `[YOUR_*]` trong khung đặc tả từ đó lúc chạy.
   - Với runtime Claude Code: `CLAUDE.md` — nhưng phần hồ sơ ở đó **đã được bỏ** và không nên khôi phục; lý do ghi trong chính file đó.

3. **Portal search CLI:**
   - Nằm dưới [.agents/skills/](.agents/skills/) theo định dạng Agent Skills chuẩn (mỗi portal một `SKILL.md`). Codex và Antigravity tự phát hiện; quy trình `/scrape` trong [.claude/skills/job-scraper/](.claude/skills/job-scraper/) điều phối chúng.
   - Backend gọi các CLI này bằng `bun` qua `PortalCliService`. Thêm portal = thêm một thư mục, không sửa code.

## Ràng buộc CI cần biết trước khi sửa

- Sửa **file này** thì bắt buộc bump `framework_version` ở frontmatter, nếu không `tools/check_framework_version.py` làm đỏ CI.
- `tools/`, `scripts/`, `.agents/skills/*/`, `.claude/skills/*/SKILL.md` bị khoá vị trí bởi `lint_skills.py` và `security_guards.py`. Di chuyển chúng làm đỏ CI.
- `security_guards.py` ghim danh sách quyền trong `.claude/settings.json` và các quy tắc dữ liệu cá nhân trong `.gitignore`. Nới quyền hoặc bỏ quy tắc đó là đỏ CI — đấy là chủ đích.
