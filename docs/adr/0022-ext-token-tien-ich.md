# ADR 0022: Token riêng cho tiện ích (ext token) và cô lập tin nguồn extension

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `modules/ext`, `ExtAuthGuard`, `AuthService.extLogin`/`issueExtToken`, luồng `/connect-extension`, hoặc lọc `source='extension'` ở `whereFrom`/matching/alert
- **Ngày:** 2026-11-01

## Bối cảnh

Tiện ích Chrome cần đăng nhập Careelot và gọi `/api/ext/*`. Hai ràng buộc:

1. Web đăng nhập bằng **cookie httpOnly** gắn với domain Careelot. Tiện ích chạy ở origin `chrome-extension://` — **không đọc/gửi được cookie đó** (khác domain, httpOnly). Nên tiện ích phải cầm được một token trong body để gắn `Bearer`.
2. Không muốn cấp cho tiện ích một **phiên web đầy đủ** (access + refresh): token của tiện ích sống lâu trên máy người dùng, phạm vi nên hẹp.

Dán token tay (bản v0.1) bị loại vì người dùng không biết lấy token ở đâu.

## Quyết định

**Token loại riêng `typ='ext'`, không phải `access`/`refresh`.** Hạn 30 ngày (`JWT_EXT_EXPIRES_IN`), trả trong body (không cookie), mang `ver = User.tokenVersion`. `ExtAuthGuard` nhận `Bearer` + `resolveAuthUser` (đối chiếu `tokenVersion`) và chỉ gác `/api/ext/*`. `JwtStrategy` của web từ chối `typ='ext'` (và ngược lại) nên ext token KHÔNG mở được route web, access token KHÔNG mở được route ext. Thu hồi dùng chung cơ chế web: đăng xuất/đổi mật khẩu tăng `tokenVersion` → mọi ext token cũ chết.

**Google qua `launchWebAuthFlow` → trang `/connect-extension`.** Tiện ích không tự dựng OAuth client: mở trang web (đã có email/pass + Google), trang đã đăng nhập gọi `POST /api/ext/auth/token` lấy ext token rồi redirect về `*.chromiumapp.org`. Tái dùng TOÀN BỘ auth web; tiện ích không bao giờ chạm mật khẩu/Google credential. `/connect-extension` chỉ redirect về đúng `*.chromiumapp.org` (chống open-redirect rò token).

**Tin lưu từ tiện ích là `Job source='extension'`, nhưng bị cô lập.** `SavedJob` cần một `Job`, nên lưu tin tạo Job thật; nhưng `title/company/description` do người dùng nhập, nếu lọt vào bảng chung sẽ thành **chèn dữ liệu vào feed/match của mọi người**. Giải: `whereFrom` loại `source='extension'` ở MỌI bề mặt chung (feed, "phù hợp", public, chọn job matching, nhắc tin) **trừ** view đã lưu/đã ứng tuyển của chủ — một chỗ phủ gần hết; thêm lọc ở `requirement-match` (chấm), `job-alert` (nhắc theo công ty), `publicGet` (khách theo id). "Soi kỹ" luôn lưu tin về tài khoản người gọi trước khi chấm nên chỉ chấm tin của chủ.

## Hệ quả

- Ext token 30 ngày là đánh đổi tiện lợi (đỡ đăng nhập lại) lấy thời gian sống dài; chấp nhận vì thu hồi được qua `tokenVersion` và phạm vi chỉ `/api/ext/*`.
- Logic tra user + `tokenVersion` gom vào `resolveAuthUser`, dùng chung `JwtStrategy` (access) và `ExtAuthGuard` (ext).
- Lọc `source` tập trung ở `whereFrom`; `ai-shortlist` cũng gọi `whereFrom` nên tin extension không bị trích requirements (không tốn AI) và không được auto-match.
- **Rủi ro còn lại (🟢):** `GET /api/matches/:id`, `GET /api/jobs/:id` (route web) không chặn `source='extension'` theo id. Id tin extension không xuất hiện ở bất kỳ danh sách nào (đã lọc) nên người ngoài không đoán được cuid; đóng bằng lọc list đã đủ, chặn theo id là phòng thủ chiều sâu, làm khi cần.
- Chưa dùng vector/không ghim model: không liên quan. Luồng chấm tái dùng nguyên `MatchingService` (ADR 0011, 0020).
