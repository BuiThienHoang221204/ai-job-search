# ADR 0023: Bắt buộc xác minh email bằng mã 6 số khi đăng ký bằng mật khẩu

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** sửa `EmailCodeService`, `MailService`, bảng `email_codes`, `register`/`login`/`verify-code`/`resend-code`, nhánh liên kết trong `loginWithGoogle`, hoặc làm quên/đặt mật khẩu
- **Ngày:** 2026-11-10

## Bối cảnh

Đăng ký bằng mật khẩu không kiểm email: gõ sai hay dùng email người khác vẫn có tài khoản dùng được. Đó là kiểu *classic-federated merge* trong nghiên cứu pre-hijacking của Microsoft (2022, 35/75 dịch vụ lớn dính ít nhất một kiểu), và gốc rễ là "không xác minh email trước khi cho dùng tài khoản". Để chặn, nhánh liên kết Google luôn xoá mật khẩu — người dùng thật cũng mất mật khẩu.

Bản đầu tiên (cùng ngày, chưa deploy) làm mức **mềm**: tạo tài khoản ngay, gửi link xác minh, banner nhắc trong dashboard. Duyệt thực tế thấy sai: email gõ sai vẫn dùng được app, banner vàng chen vào onboarding. Đổi sang mức **cứng**.

Hai cách cứng đã so: Clerk tạo user **sau** khi nhập đúng mã (đăng ký là một bản "đang chờ"); Supabase tạo user nhưng chặn đăng nhập tới khi bấm link. Cách Supabase để lại tài khoản kẹt khi gõ sai email và phải xử lý "đăng ký lại cùng email thì đè" để kẻ xấu không chiếm trước email người khác; người dùng còn phải chuyển qua lại giữa thư và trang web.

## Quyết định

- **Kiểu Clerk, mã 6 số ngay trong modal.** `POST /auth/register` chỉ lưu đăng ký đang chờ (tên, mật khẩu đã băm, mã mời) vào `email_codes` và gửi mã, trả 202. `POST /auth/verify-code` nhập đúng mã mới tạo `User` (đã xác minh) và đặt cookie. Email gõ sai thì không có mã, bấm "Sửa" quay lại form; DB không có tài khoản rác.
- **Thông số mã** theo thông lệ: 6 số (`randomInt`), hạn **10 phút**, tối đa **5 lần sai** mỗi mã, gửi lại sau **60 giây** và tối đa 3 lượt/giờ/IP (`ThrottleMail`), gửi mã mới thì mã cũ chết (một hàng mỗi email). Trong 60 giây, `register`/`login` gọi lại thì không gửi thêm thư, chỉ cập nhật dữ liệu đăng ký.
- **Lưu HMAC-SHA256 (khoá `JWT_SECRET`, kèm email), không lưu số gốc.** 6 số chỉ có một triệu giá trị: băm trơn thì lộ DB là dò ngược được ngay.
- **Dùng mã bằng giành chỗ có điều kiện:** sai mã thì `updateMany ... attempts < 5` tăng lượt; đúng mã thì `deleteMany` theo email + `codeHash` + còn hạn + `attempts < 5`, `count === 0` thì 400. Lỗi hết hạn/hết lượt trả kèm `reason: 'CODE_EXPIRED'` để FE đổi giao diện mà không so chữ.
- **Tài khoản mật khẩu cũ chưa xác minh:** đăng nhập đúng mật khẩu thì gửi mã, trả 202, chưa có phiên; tiện ích trả 403. Migration tăng `tokenVersion` của các tài khoản này để thu hồi phiên đang mở. Đăng nhập Google đặt `emailVerifiedAt` (Google đã kiểm `email_verified`); migration backfill `createdAt` cho tài khoản có `googleId`.
- **Liên kết Google** giữ mật khẩu và phiên khi tài khoản đã xác minh; chưa xác minh (chỉ còn tài khoản cũ) thì như trước: xoá mật khẩu, `tokenVersion+1`.
- **Thư:** mẫu tối giản (thẻ trắng, ô mã lớn, hạn, cảnh báo không chia sẻ mã, dòng "không phải bạn thì bỏ qua"), mã nằm cả trong tiêu đề để đọc được từ thông báo điện thoại. Dựng bằng bảng + style nội dòng vì Gmail bỏ phần lớn CSS; logo PNG (`ui-ai-job-search/public/email/careelot-logo.png`) vì Gmail/Outlook không hiện SVG; `reply_to` là hộp thư hỗ trợ (`MAIL_REPLY_TO`) thay vì để người dùng trả lời vào `no-reply`.
- **Resend qua HTTP API** (`fetch`, không SDK), gửi đồng bộ trong request. Gửi lỗi thì đặt lại `sentAt` để gửi lại được ngay rồi ném lỗi (500). `RESEND_API_KEY` rỗng thì không gửi, ngoài production ghi nội dung thư ra log để dev lấy mã.
- **`MailService` là class thường trong `modules/auth/services`**, không dựng seam vì chỉ có một adapter; e2e `overrideProvider(MailService)` bằng `FakeMail`, `harness.signUp` đi qua `register` → mã trong thư giả → `verify-code`.
- Hàng `email_codes` không bao giờ được dùng bị `RetentionService` xoá sau 1 ngày (Chính sách bảo mật đã ghi thời hạn này).

## Hệ quả

- Trước khi deploy phải kiểm tài khoản mật khẩu chưa xác minh trên production: tài khoản dùng email không có hộp thư thật (vd tài khoản admin nội bộ) sẽ không đăng nhập được nữa, cần đặt `emailVerifiedAt` bằng tay. `scripts/seed-demo.mjs` đặt sẵn `emailVerifiedAt` cho mọi tài khoản demo.
- `resend-code` công khai nên cho biết một email đang có phiên xác minh hay không; chấp nhận vì `register` vốn đã trả 409 khi email có tài khoản.
- Bảng không có cột mục đích. Làm quên mật khẩu thì thêm cột `purpose` (mã đăng ký không được dùng để đặt lại mật khẩu) lúc đó.
- Test ghim: `test/email-code.e2e-spec.ts`, ca liên kết Google trong `test/auth-google.e2e-spec.ts`, trần gửi lại trong `test/throttle.e2e-spec.ts`.

## Nguồn

- Pre-hijacking và cách chặn gốc bằng xác minh email: [MSRC 2022](https://msrc.microsoft.com/blog/2022/05/pre-hijacking-attacks).
- Tạo user sau khi xác minh: [Clerk sign-up email verification](https://clerk.com/docs/references/javascript/sign-up/email-verification); chặn đăng nhập tới khi xác nhận: [Supabase password auth](https://supabase.com/docs/guides/auth/passwords).
- Liên kết theo email: [Firebase](https://firebase.google.com/docs/auth/web/account-linking), [Auth0](https://auth0.com/docs/manage-users/user-accounts/user-account-linking/link-user-accounts), [Ory](https://www.ory.sh/blog/secure-account-linking-iam-sso-oidc-saml).
- Hạn, số lần thử, khoảng chờ gửi lại, lưu HMAC: [Open Government Products — email OTP](https://eng-curriculum.open.gov.sg/docs/authentication/guides/implementing-email-otp), [MojoAuth](https://mojoauth.com/blog/best-practices-otp-expiration-retry-policies), [Unkey](https://www.unkey.com/blog/ratelimiting-otp). Không có con số chuẩn của OWASP; 10 phút / 5 lần / 60 giây là chọn của dự án theo thông lệ.
- API và gói miễn phí (3.000 thư/tháng, 100/ngày, kiểm 2026-11-10): [Resend send-email](https://resend.com/docs/api-reference/emails/send-email), [Resend pricing](https://resend.com/pricing).
