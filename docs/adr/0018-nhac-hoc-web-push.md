# ADR 0018: Nhắc học bằng Web Push, giờ học do người dùng chọn

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa nhắc học, `modules/push`, `StudyReminderService`, `User.studyTime`, `public/sw.js` (phần `push`), hoặc định thêm kênh thông báo khác (email, Zalo…)
- **Ngày:** 2026-10-23

## Bối cảnh

Lộ trình học cho chọn ngày học trong tuần (`LearningItem.days`) và từng có nút tạo sự kiện lặp hằng tuần lúc 20:00 cố định qua link Google Calendar / file `.ics`. Người dùng phải tự bấm thêm vào lịch, và lịch không biết khi kỹ năng đã học xong. Cần một kênh nhắc do hệ thống chủ động gửi.

Đã cân nhắc hai kênh:

- **Email qua Gmail SMTP:** giới hạn khoảng 500 thư/ngày, gửi tự động số lượng lớn dễ bị khoá tài khoản, thư nhắc hằng ngày dễ rơi vào Spam/Quảng cáo. Làm nghiêm túc phải dùng Resend/Brevo, kèm mẫu thư và link huỷ.
- **Web Push:** miễn phí, không dịch vụ ngoài, app đã là PWA có service worker. Hạn chế: iPhone chỉ nhận khi đã thêm app ra màn hình chính (iOS 16.4+), và người dùng phải cho phép thông báo.

## Quyết định

- **Web Push** cho nhắc từng buổi học. Thư viện `web-push`, khoá VAPID trong `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); thiếu khoá thì route trả 503 và cron không chạy.
- **Giờ học do người dùng chọn** (`User.studyTime`, mặc định `20:00`, 06:00–23:00 bước 30 phút), một giờ cho mọi kỹ năng. Thông báo gửi **trước 15 phút**; giao diện hiện cả giờ học lẫn giờ nhắc.
- **Cron `*/15 * * * *`** (`StudyReminderService`, chỉ ở tiến trình chạy việc nền): mỗi lượt tính giờ học = lúc chạy + 15 phút theo giờ Việt Nam, rồi nhắc người có giờ học đó, hôm đó là ngày học của ít nhất một kỹ năng `LEARNING`, và đã bật nhắc trên ít nhất một thiết bị. Một thông báo gộp mọi kỹ năng học hôm đó, kèm mốc kế tiếp của kỹ năng đầu tiên. Lịch cron cố định trong code, không đọc từ `.env`: đổi nhịp mà không đổi bước giờ học thì có giờ học không bao giờ được nhắc.
- **Một dòng `push_subscriptions` cho mỗi thiết bị**, khoá theo `endpoint` (dịch vụ push của trình duyệt cấp, không đoán được). Cùng trình duyệt đăng nhập tài khoản khác thì dòng chuyển sang tài khoản đó, để thông báo không tới nhầm người. Dịch vụ push trả 404/410 thì xoá dòng đó.
- **Gỡ nút Google Calendar / `.ics`** (chủ dự án chốt 2026-10-23): Web Push là kênh nhắc duy nhất. iPhone chưa thêm app ra màn hình chính thì không nhận được nhắc; giao diện hướng dẫn thêm app.

## Hệ quả

- Email chỉ đáng làm cho **bản tóm tắt hằng tuần** (kéo người đã bỏ app quay lại), không cho nhắc từng buổi.
- `test/push.e2e-spec.ts` ghim quyền sở hữu thiết bị, chuyển chủ khi đổi tài khoản, kiểm giờ học, và điều kiện chọn người nhắc (giờ học, ngày học, kỹ năng chưa xong, có thiết bị). Phần gửi thật qua `web-push` không có test — e2e thay `PushService.send` bằng `jest.spyOn`.
- **Kênh thứ hai trên cùng thiết bị: thông báo tìm việc** *(2026-10-25)* — báo tin mới mỗi sáng 07:30 (`JobAlertService`). Thiết bị được đăng ký với lời hứa "nhắc học", nên kênh này có công tắc riêng `User.jobNotifications`, **mặc định TẮT**. Chống gửi trùng bằng giành chỗ có điều kiện trên `User.jobAlertSentAt`, không cần bảng hàng đợi riêng. Báo tin mới sống 12 giờ (điện thoại tắt mạng lúc 07:30 vẫn nhận khi bật lại), còn nhắc học giữ 30 phút vì trễ là vô nghĩa — lý do `PushService.send` có tham số `ttlSeconds`. Ước tính ~13 tin mới mỗi sáng cho một hồ sơ IT Fullstack/HCM (349 tin mới đêm 2026-10-24 × 199/5.451 tin qua cổng của hồ sơ đó).
- **Công ty theo dõi đi chung thông báo 07:30** *(2026-10-26)*: không mở kênh hay cron thứ ba — `JobAlertService` cộng thêm một dòng "Công ty bạn theo dõi: N tin mới từ …" (gom theo `Job.companyKey`, không qua cổng ngành), dùng chung mốc `jobAlertSentAt` và công tắc `jobNotifications`. Chỉ có tin của công ty theo dõi thì link mở `?followed=1&since=…`.
- **Đã gỡ nhắc trước ngày phỏng vấn** (chủ dự án chốt 2026-10-25, trước khi phát hành): hệ thống chỉ biết lịch phỏng vấn khi người dùng tự ghi ngày ở trang Chuẩn bị phỏng vấn — ô đó chỉ có NGÀY, FE tự gán 09:00, nên lời nhắc "Mai 09:00 phỏng vấn…" sai giờ; chỗ ghi lại khó tìm nên lời nhắc gần như không bao giờ chạy. Muốn làm lại thì cần ô chọn giờ và một chỗ ghi lịch dễ thấy trước.
- **Thiết bị và loại thông báo tách hai tầng** *(2026-10-25)* — trước đó công tắc "Nhắc học" ở Lộ trình học thực chất huỷ đăng ký thiết bị, nên tắt nó là thông báo tìm việc cũng im lặng tắt theo. Nay thiết bị (`push_subscriptions`) bật/tắt ở một dòng riêng trong Tài khoản → Thông báo; nhắc học có cờ `User.studyReminders` **mặc định BẬT** (migration để người đang nhận nhắc học vẫn nhận như cũ), thông báo tìm việc giữ `jobNotifications`. `PATCH /push/preferences` nhận từng trường riêng, trường vắng giữ nguyên. Lộ trình học chỉ còn chọn giờ học và liên kết sang Tài khoản.
- Service worker chỉ tự đăng ký ở bản build; nút "Bật nhắc học" tự đăng ký `/sw.js` nên thử được cả khi `pnpm dev`.
