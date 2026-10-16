# ADR 0008: Trang việc làm công khai cho khách chưa đăng nhập

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Mở route cho khách, sửa `PublicJobsController`, hoặc hiển thị tin cho người chưa đăng nhập
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Trang việc làm công khai — thêm 2026-10-15

Khách chưa đăng nhập xem được "Tất cả việc làm" và chi tiết tin, giống TopCV/ITviec — để link tin gửi cho người khác mở được. **Cùng một trang, cùng URL, cùng bộ component** với người đã đăng nhập (`/dashboard/jobs`, `/dashboard/jobs?job=<id>`, `/dashboard/jobs/<id>`); khách chỉ thấy bớt phần riêng của tài khoản, và mọi nút cần tài khoản đưa sang `/login?next=...`. Đã thử làm trang `/viec-lam` riêng rồi bỏ: hai trang chi tiết song song là hai chỗ phải sửa mỗi lần đổi giao diện.

**Phía FE: thêm điều kiện, không thêm component.** `SessionProvider` cho khách ở lại trên `isGuestPath` (`lib/public-job.ts` — việc làm và `/dashboard/salary`, vốn chỉ đọc API lương công khai) với `user = null`, mọi trang khác vẫn đẩy về đăng nhập (kể cả khi khách bấm sang từ thanh bên). Từng component đọc `useSession()` rồi tự ẩn phần của mình: lương (`JobRow`, `JobDetailHeader`), nút lưu, bộ lọc lương/đã lưu/đã ứng tuyển, ô sắp xếp, các con số "x/y có trong hồ sơ" (`SystemMatchCard`, `JobSectionNav`). `useJobDetail` đọc `GET /public/jobs/:id` khi chưa đăng nhập, với KHOÁ CACHE RIÊNG (`keys.publicJob`) — dùng chung khoá thì đăng nhập xong vẫn thấy bản khách vì cache sống qua điều hướng phía client.

**Phía backend: route riêng, không mở `GET /jobs/:id`.** `PublicJobsController` (`GET /public/jobs`, `GET /public/jobs/:id`, `@Public()`, 60 lượt/phút) chỉ chọn `PUBLIC_JOB_FIELDS`, nên trường mới thêm vào `Job` không tự lọt ra ngoài; bộ lọc là danh sách trắng (`PublicJobsQueryDto` = `PickType`, gửi `saved`/`salaryMin`/`sort` nhận 400). Chi tiết trả cùng HÌNH DẠNG với route riêng để FE dùng chung component: `systemMatch` dựng bằng `withSystemMatch` với hồ sơ rỗng (`GUEST_PROFILE`) nên đủ danh sách yêu cầu, không kỹ năng nào "đáp ứng". `GET /jobs/filters` và `GET /companies/brief/by-job/:id` (chỉ đọc database, bản tìm hiểu vốn dùng chung) cũng mở; hai route POST tìm hiểu công ty vẫn cần đăng nhập.

**Ẩn lương và chỉ trả ĐOẠN TRÍCH mô tả** (`excerptOf`, 300 ký tự) kèm link "Đọc tin đầy đủ trên <portal>" — quyết định của chủ dự án. Lý do là ADR 0006 (điều khoản portal): tin là nội dung quét từ portal khác, hiển thị toàn văn cho người ngoài là tầng 2. Cùng lý do, trang việc làm đặt `noindex, nofollow` (`lib/job-metadata.ts`, cũng là chỗ sinh `og:title` để dán link vào Zalo/Facebook hiện tên tin). Không nút nào của khách gọi model — chấm điểm, tìm hiểu công ty đều chặn ở FE và route POST vẫn đóng.
