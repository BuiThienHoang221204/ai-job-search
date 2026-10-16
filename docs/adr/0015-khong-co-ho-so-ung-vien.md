# ADR 0015: Vì sao CLAUDE.md không chứa hồ sơ ứng viên

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Muốn hồi sinh runtime Claude Code (`/setup`, `/apply`)
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Vì sao không có hồ sơ ứng viên ở đây

File này **từng** chứa hồ sơ ứng viên theo thiết kế của bản fork gốc, toàn bộ ở dạng `[YOUR_NAME]`, `[YOUR_PRIMARY_SKILLS]`… Backend đã thay nó bằng bảng `Profile` trong database, còn `PromptBuilderService` là chỗ điền các token `[YOUR_*]` vào khung prompt lúc chạy.

**Đừng khôi phục phần hồ sơ đó.** Một hồ sơ để nguyên placeholder không giúp runtime nào cả, mà lại khiến agent tưởng đây là workspace tìm việc cá nhân thay vì một backend đa người dùng.

Hai điều cần biết nếu muốn hồi sinh runtime Claude Code: `/setup` sẽ **ghi đè `CLAUDE.md`**, nên hãy tách hồ sơ ra chỗ khác trước; và danh sách kiểm tra CV/PDF của bản gốc (đúng 2 trang, lualatex, kiểm tra lớp text cho ATS) vẫn nằm trong git history — lấy lại bằng `git show <commit trước>:CLAUDE.md`.
