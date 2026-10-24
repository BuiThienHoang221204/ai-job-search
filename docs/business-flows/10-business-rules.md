# 10 — Danh mục Business Rules và rủi ro

> **Phạm vi:** toàn hệ thống. Đây là danh mục **tập trung**: mỗi BR có một dòng tóm tắt; nội dung đầy đủ và link tới dòng code nằm ở §7 (BR) và §17 (rủi ro) của file module.
> **Nguyên tắc:** tài liệu mô tả hệ thống **as-is**. Code là nguồn sự thật duy nhất.
> **Ký hiệu mức:** 🔒 Cứng (ràng buộc DB) · ✅ Mềm (service/guard/DTO) · ⚠️ Chỉ frontend. **Nơi thực thi:** DB · SV · DTO · GD · FE.

Các mục §1 và §4 viết tay; §2 và §3 được sinh tự động từ file module bằng script ở [README §7](./README.md#7-bảo-trì-tài-liệu) — sửa ở file module rồi chạy lại script, đừng sửa tay giữa hai marker `GEN`.

## 1. Quy tắc xuyên suốt (BR-SYS)

| Mã | Quy tắc | Nơi thực thi | Mức | Nguồn |
|---|---|---|---|---|
| BR-SYS-01 | Mọi route cần đăng nhập trừ khi gắn `@Public()` (`JwtAuthGuard` toàn cục, mặc-định-đóng). Không gắn lại `@UseGuards(JwtAuthGuard)` ở controller | GD | ✅ | [jwt-auth.guard.ts](../../server/src/common/guards/jwt-auth.guard.ts), [common.module.ts](../../server/src/common/common.module.ts) |
| BR-SYS-02 | Route quản trị chỉ cần `@Roles('ADMIN')`; `RolesGuard` toàn cục đọc vai trò **tươi từ DB** mỗi request, không đọc claim JWT | GD | ✅ | [roles.guard.ts](../../server/src/common/guards/roles.guard.ts), [jwt.strategy.ts](../../server/src/modules/auth/jwt.strategy.ts) |
| BR-SYS-03 | Rate limit toàn cục 120 lượt / 60 s, đếm theo `user:<id>` khi đã đăng nhập, theo IP khi chưa; trần riêng: AI 10/phút, auth 10/phút, PDF 10/phút, quét 3/giờ, route công khai 60/phút | GD | ✅ | [user-throttler.guard.ts](../../server/src/common/guards/user-throttler.guard.ts), [throttle.ts](../../server/src/common/throttle.ts) |
| BR-SYS-04 | Body/query đi qua `ValidationPipe` `whitelist + forbidNonWhitelisted + transform`; trường lạ → 400; thông điệp dịch sang tiếng Việt | GD, DTO | ✅ | [bootstrap.ts](../../server/src/bootstrap.ts), [validation-message.ts](../../server/src/common/validation-message.ts) |
| BR-SYS-05 | Body JSON/urlencoded tối đa 1 MB (413); JSON hỏng → 400 | GD | ✅ | [bootstrap.ts](../../server/src/bootstrap.ts) |
| BR-SYS-06 | Mọi truy vấn dữ liệu người dùng khoá theo `userId` lấy từ token; lệnh ghi theo id cũng mang `userId` trong `where`; tài nguyên của người khác trả 404 | SV | ✅ | [CLAUDE.md](../../CLAUDE.md), §16 mọi module |
| BR-SYS-07 | Route `@Public` phải có `@Throttle` riêng, `select` theo danh sách trắng trường và DTO dạng `PickType`; route gọi model không bao giờ công khai | GD, SV, DTO | ✅ | [public-jobs.controller.ts](../../server/src/modules/jobs/public-jobs.controller.ts), [ADR 0008](../adr/0008-trang-viec-lam-cong-khai.md) |
| BR-SYS-08 | Đường đọc (dashboard, danh sách, chi tiết) không bao giờ gọi model; kết quả AI cache theo `promptHash`/`sourceHash` | SV | ✅ | [server/README.md](../../server/README.md) |
| BR-SYS-09 | Chuyển trạng thái việc bằng **giành chỗ có điều kiện** `updateMany({ where: { id, userId?, status: <được phép> } })`; `count = 0` thì bên thua dừng, không gọi model | SV | ✅ | `MatchingService.claim`, `DocumentGenerator.claim`, `InterviewTurnService.stream` |
| BR-SYS-10 | `FAILED` là trạng thái cuối người dùng bấm lại được; hệ thống không tự xếp lại | SV | ✅ | [reconcile.service.ts](../../server/src/modules/reconcile/services/reconcile.service.ts) |
| BR-SYS-11 | Mọi bảng có `status: MatchStatus` phải có trong `ReconcileService`; việc `PENDING`/`RUNNING` quá 10 phút được xếp lại (`documents`, `job_matches`) hoặc đánh `FAILED` (bảng còn lại, kèm `agent_runs`) | SV | ✅ | [reconcile.service.ts](../../server/src/modules/reconcile/services/reconcile.service.ts), BR-OPS-16…21 |
| BR-SYS-12 | Route stream NDJSON: trình duyệt ngắt thì server vẫn chạy tới cuối và tự ghi `DONE`/`FAILED`, không xếp thêm việc; lỗi trước sự kiện đầu đi ra dạng sự kiện `error` kèm `statusCode`; nhịp tim 10 s *(2026-10-16: gỡ `onAbandon`)* | SV | ✅ | [ndjson.ts](../../server/src/common/ndjson.ts) |
| BR-SYS-13 | Lỗi thô của model/hạ tầng không trả ra API; chỉ trả `failureKind` (SCHEMA → 502, TIMEOUT → 504, UPSTREAM → 503, khác → 500 thông điệp chung kèm `requestId`) | SV, GD | ✅ | [all-exceptions.filter.ts](../../server/src/common/filters/all-exceptions.filter.ts), [failure-view.ts](../../server/src/common/ai/failure-view.ts) |
| BR-SYS-14 | Mọi lời gọi model đi qua `AiService` (không gọi SDK trực tiếp) và ghi một dòng `ai_calls` | SV | ✅ | [ai.service.ts](../../server/src/modules/ai/services/ai.service.ts) |
| BR-SYS-15 | Schema output của model **cắt** khi vượt trần (`common/model-output.ts`), giữ nghiêm ngặt cho điểm số và enum; schema nhận input người dùng thì **từ chối** 400 | SV, DTO | ✅ | [model-output.ts](../../server/src/common/model-output.ts), [ADR 0017](../adr/0017-cat-chuoi-model-output.md) |
| BR-SYS-16 | Thứ tự timeout: một lượt gọi model \< `AI_CHAIN_BUDGET_MS` 240 s \< `server.setTimeout` 300 s \< `STUCK_AFTER_MS` 600 s | SV | ✅ | [ADR 0011](../adr/0011-do-truoc-khi-doan.md), [main.ts](../../server/src/main.ts) |
| BR-SYS-17 | Mọi việc nền đi qua `QueueService`; hàng đợi policy `exclusive`, `singletonKey` do code suy từ payload | SV, DB | 🔒 | [queue-key.ts](../../server/src/modules/queue/queue-key.ts), [ADR 0010](../adr/0010-hang-doi.md) |
| BR-SYS-18 | Phân trang chung: `limit` 1–100 (mặc định 20), `offset` 0–100.000 (riêng tin công khai/danh sách tin: `offset` ≤ 2.000) | DTO | ✅ | [pagination.dto.ts](../../server/src/common/dto/pagination.dto.ts), BR-JOB-23 |
| BR-SYS-19 | Lỗi Prisma: P2002 → 409 `Dữ liệu đã tồn tại`, P2025 → 404 `Không tìm thấy dữ liệu`, P2003 → 400 `Dữ liệu tham chiếu không hợp lệ`, mã khác → 500 | GD | ✅ | [prisma-exception.filter.ts](../../server/src/common/filters/prisma-exception.filter.ts) |
| BR-SYS-20 | Chống trùng bằng tạo rồi bắt `P2002` (`isUniqueViolation`) thay cho kiểm-rồi-tạo | SV, DB | 🔒 | [prisma-errors.ts](../../server/src/prisma/prisma-errors.ts) |
| BR-SYS-21 | Mỗi response mang `x-request-id` (giữ của client nếu khớp `^[\w-]{1,64}$`, không thì UUID); body lỗi 5xx kèm `requestId` | GD | ✅ | [bootstrap.ts](../../server/src/bootstrap.ts) |
| BR-SYS-22 | Dữ liệu bên thứ ba nạp vào ở trạng thái **ẩn** (`SalaryRefVisibility.INTERNAL`, `InterviewQuestionStatus.RAW`) và giữ cột `source` để gỡ cả nguồn | DB | 🔒 | [schema.prisma](../../server/prisma/schema.prisma#L1190), BR-SAL-02, BR-QB-02 |
| BR-SYS-23 | Cột chứa dữ liệu cá nhân (`AiCall.responseText`) chỉ ra API qua `select` liệt kê tường minh và hàm che theo `purpose` | SV | ✅ | [schema.prisma](../../server/prisma/schema.prisma#L924), BR-ADM-08 |
| BR-SYS-24 | Lịch cron và phép tính theo ngày/tuần dùng múi giờ `CRON_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`) | SV | ✅ | [configuration.ts](../../server/src/config/configuration.ts), BR-DSH-07 |
| BR-SYS-25 | `APP_ROLE=api` không chạy worker và cron (trừ `ai.healthcheck`); giá trị lạ thì tiến trình không khởi động | SV | ✅ | [app-role.ts](../../server/src/config/app-role.ts) |
| BR-SYS-26 | Trọng số điểm tổng do code tính, không hỏi model | SV | ✅ | BR-MAT-11 |

## 2. Business Rules theo module

[//]: # (GEN:BR)


### Auth — Xác thực, phiên đăng nhập và phân quyền — [modules/auth.md](./modules/auth.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-AUTH-01 | Email được `trim()` + `toLowerCase()` trước khi kiểm định dạng và lưu/tra cứu (register, login, Google) | DTO, SV | ✅ Mềm |
| BR-AUTH-02 | Mỗi email chỉ một tài khoản; đăng ký trùng trả 409 `Email đã được đăng ký` (bắt `P2002`, đúng cả khi hai request đồng thời) | DB, SV | 🔒 Cứng |
| BR-AUTH-03 | Mật khẩu đăng ký 8–72 ký tự; tên 1–200 ký tự | DTO | ✅ Mềm |
| BR-AUTH-04 | Mật khẩu chỉ lưu dạng bcrypt cost 12 | SV | ✅ Mềm |
| BR-AUTH-05 | Tạo tài khoản (mật khẩu hoặc Google) luôn tạo kèm một `Profile` rỗng trong cùng nested write | SV | ✅ Mềm |
| BR-AUTH-06 | Tài khoản mới luôn có vai trò `USER`; không có đường tự nâng quyền | DB | 🔒 Cứng |
| BR-AUTH-07 | Đăng nhập sai email hay sai mật khẩu trả cùng một thông điệp 401 và luôn chạy bcrypt (hash đệm) để không lộ email tồn tại | SV | ✅ Mềm |
| BR-AUTH-08 | Tài khoản không có `passwordHash` (chỉ Google) không đăng nhập được bằng mật khẩu | SV | ✅ Mềm |
| BR-AUTH-09 | ID token Google chỉ được chấp nhận khi đúng audience `GOOGLE_CLIENT_ID`, có `sub`, `email` và `email_verified = true` | SV | ✅ Mềm |
| BR-AUTH-10 | Google: nhận diện user theo `googleId` trước, email sau; `googleId` là duy nhất | DB, SV | 🔒 Cứng |
| BR-AUTH-11 | Email đã gắn một Google khác thì không bị liên kết đè (409) | SV | ✅ Mềm |
| BR-AUTH-12 | Liên kết Google vào tài khoản mật khẩu cùng email: xoá mật khẩu và tăng `tokenVersion` để tước mọi phiên/mật khẩu do người đăng ký trước đặt | SV | ✅ Mềm |
| BR-AUTH-13 | Phát cặp JWT cùng bí mật: access (`typ=access`, mặc định `15m`) và refresh (`typ=refresh`, mặc định `7d`), payload `{sub, email, typ, ver}` | SV | ✅ Mềm |
| BR-AUTH-14 | Token chỉ đi qua cookie httpOnly (`aijob_token` path `/` 15 phút; `aijob_refresh` path `/api/auth/refresh` 7 ngày; `sameSite=lax`; `secure` khi production; `domain = COOKIE_DOMAIN`); body chỉ trả `{ user }` | SV | ✅ Mềm |
| BR-AUTH-15 | Token được rút từ cookie `aijob_token` trước, header Bearer sau | GD | ✅ Mềm |
| BR-AUTH-16 | Access token không đổi được token mới; refresh token không dùng làm Bearer (claim `typ`) | SV, GD | ✅ Mềm |
| BR-AUTH-17 | Thu hồi phiên bằng `tokenVersion`: lệch `ver` thì cả access đang còn hạn lẫn refresh đều bị từ chối ngay | SV, GD | ✅ Mềm |
| BR-AUTH-18 | Refresh thành công phát lại CẢ HAI token; refresh token cũ vẫn hợp lệ tới hết hạn (không xoay vòng/không phát hiện tái sử dụng) | SV | ✅ Mềm |
| BR-AUTH-19 | Đăng xuất chỉ xoá cookie của trình duyệt gọi, không tăng `tokenVersion`; route `@Public` | SV | ✅ Mềm |
| BR-AUTH-20 | Vai trò và tên trả về `/auth/me` (và trong `request.user`) luôn đọc tươi từ DB, không lấy từ claim | GD | ✅ Mềm |
| BR-AUTH-21 | `register`, `login`, `google`, `refresh` giới hạn 10 lượt/phút, đếm theo IP | GD | ✅ Mềm |
| BR-AUTH-22 | Ứng dụng từ chối khởi động khi `JWT_SECRET` rỗng hoặc còn giá trị mẫu bắt đầu bằng `thay-bang` | SV (bootstrap) | ✅ Mềm |
| BR-AUTH-23 | Sau đăng nhập/đăng ký chỉ chuyển tới `next` nếu là đường dẫn nội bộ an toàn; mặc định `/dashboard` (FE người dùng), `/` (FE admin) | FE | ⚠️ Chỉ FE |
| BR-AUTH-24 | Đăng ký trên FE yêu cầu nhập lại mật khẩu khớp | FE | ⚠️ Chỉ FE |
| BR-AUTH-25 | FE tự refresh một lần khi gặp 401 (gộp các request song song), không áp cho `/auth/refresh`, `/auth/login`, `/auth/register` | FE | ⚠️ Chỉ FE |
| BR-AUTH-26 | Khu `/dashboard` không render khi chưa xác định đã đăng nhập; khách chỉ xem được trang việc làm và tra cứu lương | FE | ⚠️ Chỉ FE |
| BR-AUTH-27 | Console admin chỉ hiển thị nội dung khi `role = ADMIN`; tài khoản USER đăng nhập admin không bị đăng xuất khỏi app người dùng | FE | ⚠️ Chỉ FE |

### Profile — Hồ sơ ứng viên — [modules/profile.md](./modules/profile.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-PRF-01 | Mỗi người dùng có tối đa một hồ sơ; xoá user thì xoá hồ sơ | DB | 🔒 Cứng |
| BR-PRF-02 | Đọc hồ sơ tự tạo hồ sơ rỗng nếu chưa có; phản hồi không được cache | SV | ✅ Mềm |
| BR-PRF-03 | Mọi thao tác hồ sơ chỉ trên hồ sơ của user trong token (khoá `userId`, không nhận id từ client) | SV | ✅ Mềm |
| BR-PRF-04 | `PUT /profile` là cập nhật một phần; chỉ nhận các trường trong `UpdateProfileDto`, trường lạ (gồm `occupationCode`) bị 400 | DTO | ✅ Mềm |
| BR-PRF-05 | Giới hạn độ dài: trường ngắn ≤ 200 ký tự, `phone` ≤ 40, `summary`/`workPermitNote`/`commuteConstraint` ≤ 4.000; mỗi danh sách ≤ 60 mục, mỗi mục ≤ 200 ký tự | DTO | ✅ Mềm |
| BR-PRF-06 | `currentSalary`/`expectedSalary` là số nguyên 0 – 2.000.000.000 (mức lương tháng) | DTO | ✅ Mềm |
| BR-PRF-07 | Khối `experiences`, `educations`, `certificates`, `projects`, `behavioralTraits` phải là mảng/đối tượng JSON, ≤ 64KB, mảng ≤ 100 phần tử, lồng ≤ 6 tầng; không kiểm hình dạng phần tử | DTO | ✅ Mềm |
| BR-PRF-08 | `completion` = round(số trường đã điền / 13 × 100); 13 trường: kỹ năng chính, kinh nghiệm, chức danh, địa điểm, quốc tịch, mục tiêu nghề nghiệp, giới thiệu, học vấn, kỹ năng phụ, lĩnh vực đã làm, quốc gia, công việc tạo hứng thú, ngành mục tiêu; chuỗi chỉ khoảng trắng và mảng rỗng tính là trống | SV | ✅ Mềm |
| BR-PRF-09 | `completion` được tính lại sau MỌI lần ghi qua `save` | SV | ✅ Mềm |
| BR-PRF-10 | `occupationCode` chỉ suy lại khi lần lưu có `headline` hoặc `primarySkills`; suy từ phần chức danh của headline + kỹ năng chính; ra `OTHER` hoặc thiếu dữ liệu thì giữ ngành cũ | SV | ✅ Mềm |
| BR-PRF-11 | `occupationCode` chỉ được ghi tường minh qua quick-start và phải thuộc danh mục nhóm ngành (`OCCUPATION_CODES`); lựa chọn đó giữ tới khi một lần lưu headline/kỹ năng suy ra ngành thật khác | DTO, SV | ✅ Mềm |
| BR-PRF-12 | `occupationCode = null` nghĩa là chưa đủ dữ liệu; cố ý không quy về `OTHER` | DB, SV | ✅ Mềm |
| BR-PRF-13 | Quick-start: `occupationCode` bắt buộc; `subOccupationCodes` mảng ≤ 20 mã trong danh mục nghề con, mỗi mã phải thuộc `occupationCode` (khác → 400), trùng thì giữ một; `preferredProvinces` mảng mã tỉnh trong danh mục; hai mảng đều bắt buộc *(2026-10-23)*; `experienceLevel` ∈ INTERN/FRESHER/JUNIOR/MIDDLE/SENIOR/LEAD (không nhận `UNKNOWN`) | DTO | ✅ Mềm |
| BR-PRF-14a | Lưu `location` khi `preferredProvinces` còn rỗng thì tự điền một tỉnh suy từ nơi ở (`resolveProvince`, bỏ qua `REMOTE`); đã có tỉnh thì không đè *(2026-10-23)* | SV | ✅ Mềm |
| BR-PRF-14 | `experienceLevel` mặc định `UNKNOWN` (chưa chọn) | DB | 🔒 Cứng |
| BR-PRF-15 | Mỗi lần ghi qua `save` xếp một việc `skill.canonicalize { userId }` (khoá chặn trùng `user:<id>`) | SV | ✅ Mềm |
| BR-PRF-16 | Thêm kỹ năng: 1–80 ký tự; trùng (so không dấu, không phân biệt hoa thường) với kỹ năng chính hoặc phụ thì bỏ qua; mới thì thêm vào cuối kỹ năng phụ (đã trim) | DTO, SV | ✅ Mềm |
| BR-PRF-17 | Hồ sơ có `completion` \< 30 không được chấm điểm tự động và không góp từ khoá cho lượt quét tin (quy tắc của module khác, ngưỡng đọc từ cột của module này) | SV | ✅ Mềm |
| BR-PRF-18 | Dashboard bắt người dùng chọn ngành + cấp bậc trước khi xem nội dung khi `occupationCode` là `null` hoặc `OTHER` | FE | ⚠️ Chỉ FE |
| BR-PRF-19 | Không có API đổi tên/email tài khoản; trang Cài đặt chỉ hiển thị | FE, SV | ✅ Mềm |

### CV Import — Đọc CV PDF thành đề xuất hồ sơ (Agent 1) — [modules/cv-import.md](./modules/cv-import.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-CVI-01 | Chỉ nhận đúng một file ở trường `file`, khai `application/pdf`, tối đa 10MB | GD (multer), SV | ✅ Mềm |
| BR-CVI-02 | Chỉ đọc tối đa 10 trang đầu của PDF | SV | ✅ Mềm |
| BR-CVI-03 | PDF phải có lớp text (≥ 120 ký tự/trang trung bình); PDF scan, có mật khẩu hoặc hỏng bị từ chối ngay tại request, không tạo bản nháp, không lưu file | SV | ✅ Mềm |
| BR-CVI-04 | Bằng chứng đưa cho model cắt ở 40.000 ký tự, có cờ `truncated` | SV | ✅ Mềm |
| BR-CVI-05 | File gốc lưu riêng cho từng lần nộp tại `<userId>/cv-uploads/<uuid>/<tên đã làm sạch ≤ 120 ký tự>` | SV | ✅ Mềm |
| BR-CVI-06 | Bản nháp mới luôn `PENDING`; chế độ stream không xếp hàng, chế độ thường xếp `profile.synthesize` (một việc mỗi `draftId`) | SV | ✅ Mềm |
| BR-CVI-07 | Không có gì được ghi vào `Profile` cho tới khi người dùng gọi apply | SV | ✅ Mềm |
| BR-CVI-08 | Chỉ một tiến trình được đọc một bản nháp: giành `RUNNING` có điều kiện từ `PENDING`, `FAILED`, hoặc `RUNNING` kẹt > 10 phút; bản `DONE` không bao giờ đọc lại | SV | ✅ Mềm |
| BR-CVI-09 | Một lượt đọc = một lời gọi model, timeout 180 giây, schema `profileProposalSchema`, mục đích `profile.synthesize` | SV | ✅ Mềm |
| BR-CVI-10 | Bản nháp không có bằng chứng thì chuyển `FAILED`, không gọi model | SV | ✅ Mềm |
| BR-CVI-11 | Prompt ép model: chỉ điền điều bằng chứng chứng minh, giữ nguyên số, giữ NGÔN NGỮ của CV, kỹ năng "chính" chỉ khi dùng thật, liệt kê `missing`, coi nội dung CV là dữ liệu chứ không phải chỉ dẫn (chống prompt injection) | SV (chỉ dẫn cho model) | ✅ Mềm (phụ thuộc model tuân thủ) |
| BR-CVI-12 | Model không được đề xuất: `careerGoals`, `energizingTasks`, `drainingTasks`, `targetSectors`, `dealBreakers` (sở thích), `citizenship`, `workPermit` (pháp lý), `lackingSkills`, `phone` — schema không có các trường này | SV (schema) | ✅ Mềm |
| BR-CVI-13 | Trường làm nên danh tính một mục (`company`, `position`, `school`, tên chứng chỉ/dự án, mô tả dự án) bắt buộc; trường mô tả CV có quyền không ghi (`degree`, `field`, `period` kinh nghiệm) mặc định chuỗi rỗng | SV (schema) | ✅ Mềm |
| BR-CVI-14 | Đầu ra model bị CẮT chứ không từ chối: tối đa 30 kỹ năng chính/phụ, 12 ngôn ngữ, 15 kinh nghiệm (8 gạch đầu dòng mỗi mục), 10 học vấn, 20 chứng chỉ, 15 dự án (20 công nghệ), 15 lĩnh vực, 15 `missing`, 10 `notes` | SV (schema) | ✅ Mềm |
| BR-CVI-15 | API bản nháp không bao giờ trả `evidence` (toàn văn CV); `get`/`latest`/`retry` thay `error` thô bằng `failureKind` | SV | ✅ Mềm |
| BR-CVI-16 | Chỉ chạy lại được bản `FAILED`; chuyển `FAILED → PENDING` bằng giành chỗ có điều kiện, thua đua trả 409 | SV | ✅ Mềm |
| BR-CVI-17 | Không tự xếp lại bản nháp `FAILED`; bản kẹt `PENDING`/`RUNNING` > 10 phút bị reconcile đánh `FAILED` | SV | ✅ Mềm |
| BR-CVI-18 | Chỉ áp dụng bản nháp `DONE`; nhận GIÁ TRỊ cuối (không phải tên trường) trong danh sách trắng 13 trường, kiểm như `UpdateProfileDto`; body rỗng bị 400 | DTO, SV | ✅ Mềm |
| BR-CVI-19 | Áp dụng ghi qua `ProfileService.save` (tính lại `completion`, `occupationCode`, xếp `skill.canonicalize`) rồi đặt `appliedAt` | SV | ✅ Mềm |
| BR-CVI-20 | Mọi thao tác khoá theo `userId`; bản nháp người khác trả 404 và không tốn lượt model | SV | ✅ Mềm |
| BR-CVI-21 | Nộp CV, đọc stream và chạy lại giới hạn 10 lượt/phút mỗi tài khoản | GD | ✅ Mềm |
| BR-CVI-22 | "Bản nháp mới nhất" là bản tạo sau cùng, bất kể trạng thái | SV | ✅ Mềm |
| BR-CVI-23 | Màn duyệt: trường chữ mặc định lấy CV chỉ khi hồ sơ trống; danh sách và mục chỉ THÊM phần mới vào cái đang có (không thay thế); trùng so không phân biệt hoa thường | FE | ⚠️ Chỉ FE |
| BR-CVI-24 | FE luôn nộp ở chế độ stream; "Thử đọc lại" dùng hàng đợi và hỏi lại mỗi 2 giây, tối đa 105 lần | FE | ⚠️ Chỉ FE |

### Jobs — Kho tin tuyển dụng, lọc, xem chi tiết, lưu tin — [modules/jobs.md](./modules/jobs.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-JOB-01 | Mọi danh sách và bộ đếm bộ lọc loại tin bản sao (`duplicateOfId IS NULL`). | SV | ✅ |
| BR-JOB-02 | Tìm kiếm chạy trên `searchText` đã hạ thường + bỏ dấu, nên gõ có dấu hay không dấu đều khớp, khớp cả tên công ty và thẻ; chuỗi chỉ toàn dấu câu không thành bộ lọc. | SV | ✅ |
| BR-JOB-03 | Nhiều giá trị trong cùng một bộ lọc là HOẶC; các bộ lọc khác nhau là VÀ. | SV | ✅ |
| BR-JOB-04 | Nghề "Khác" `<NHÓM>_OTHER` = tin thuộc nhóm nhưng chưa phân được nghề con (`subOccupationCode IS NULL`). Mục "Khác" chỉ hiện trong danh mục khi nhóm có nghề con và còn tin chưa phân nghề. | SV | ✅ |
| BR-JOB-05 | Lọc lương tối thiểu: giữ tin có `salaryMax ≥ salaryMin`, hoặc tin chỉ ghi mức dưới (`salaryMax` null) có `salaryMin ≥ salaryMin` *(2026-10-19)*; tin không đọc được lương bị loại. | SV | ✅ |
| BR-JOB-06 | "Mới nhất" xếp theo ngày ĐĂNG `postedAt DESC NULLS LAST`, rồi `scrapedAt DESC`, `id DESC`; "Lương" xếp `salaryMax DESC NULLS LAST`. *(2026-10-16)* | SV | ✅ |
| BR-JOB-07 | `sort=match` chỉ trả tin đã có cặp `JobRequirementMatch` của chính người dùng, xếp theo `rank`, `met`. | SV | ✅ |
| BR-JOB-08 | "Việc làm phù hợp" (`scored=true`): đúng MỘT nhóm ngành của hồ sơ; hồ sơ đã chọn nghề thì tin phải thuộc một trong các nghề đó hoặc chưa rõ nghề; hồ sơ đã chọn nơi làm việc thì tin phải ở một trong các tỉnh đó, làm từ xa, hoặc chưa rõ địa điểm *(2026-10-23)*; cấp bậc tin trong khoảng ±1 bậc của hồ sơ hoặc tin chưa rút yêu cầu / `seniority = UNKNOWN`. *(2026-10-08)* | SV | ✅ |
| BR-JOB-09 | Cấp bậc hồ sơ = `experienceLevel` người dùng chọn; nếu `UNKNOWN` thì suy từ số năm (\<1 FRESHER, \<3 JUNIOR, \<5 MIDDLE, \<8 SENIOR, ≥8 LEAD); không suy được thì không lọc cấp bậc. | SV | ✅ |
| BR-JOB-10 | Hồ sơ chưa có ngành hoặc ngành `OTHER` thì "Việc làm phù hợp" trả rỗng kèm `needsOccupation: true`. | SV | ✅ |
| BR-JOB-11 | Cổng không có lối thoát: bộ lọc ngành được giao với cổng; `sort` bị bỏ qua (luôn mới đăng trước) khi `scored=true`. | SV, DTO | ✅ |
| BR-JOB-12 | Danh sách không trả `description` và không trả từng dòng đối chiếu `checks`; trang chi tiết thì có. | SV | ✅ |
| BR-JOB-13 | Khi tin chưa có `JobRequirement` DONE, mức khớp hệ thống rơi về đếm từ khoá (`kind: 'KEYWORDS'`, `score: 0`, `eligibility: 'UNVERIFIED'`) để giao diện không hiện như điểm thật. | SV | ✅ |
| BR-JOB-14 | Kết quả chấm AI trong chi tiết bị đánh dấu `stale` khi `evaluatedAt < Profile.updatedAt`; lỗi thô được thay bằng `failureKind`. | SV | ✅ |
| BR-JOB-15 | Chi tiết chỉ trả đơn ứng tuyển, lượt lưu và kết quả chấm của CHÍNH người dùng (`where: { userId }` trên quan hệ). | SV | ✅ |
| BR-JOB-16 | Mỗi người lưu một tin tối đa một lần; lưu lặp là idempotent. | DB, SV | 🔒 |
| BR-JOB-17 | Lưu tin không tồn tại → 404; bỏ lưu luôn thành công (idempotent, không 404). | SV | ✅ |
| BR-JOB-18 | Khách chỉ nhận các trường trong danh sách trắng `PUBLIC_JOB_FIELDS` — không lương, không `externalId`, không `currency`; trường mới thêm vào `Job` không tự lọt ra. | SV | ✅ |
| BR-JOB-19 | Khách chỉ được lọc theo `limit, offset, q, province, occupation, subOccupation, workMode, postedWithin`; bộ lọc gắn tài khoản/lương/sort → 400. | DTO | ✅ |
| BR-JOB-20 | Danh sách cho khách luôn xếp mới đăng trước và không đối chiếu hồ sơ. | SV | ✅ |
| BR-JOB-21 | Khách chỉ thấy đoạn trích mô tả ≤ 300 ký tự, cắt ở ranh giới từ, kết thúc bằng `…`; yêu cầu tin hiện đủ nhưng đối chiếu với hồ sơ rỗng. | SV | ✅ |
| BR-JOB-22 | Route khách và danh mục bộ lọc giới hạn 60 lượt/phút (đếm theo IP khi chưa đăng nhập). | GD | ✅ |
| BR-JOB-23 | Phân trang danh sách tin: `limit` 1–100 (mặc định 20), `offset` 0–2.000 (trần riêng của tin, chặt hơn trần chung 100.000). | DTO | ✅ |
| BR-JOB-24 | Danh mục bộ lọc luôn liệt kê đủ 34 tỉnh/thành và 19 nhóm ngành kể cả khi `count = 0`, kèm mục "Làm việc từ xa" (`REMOTE`). | SV | ✅ |
| BR-JOB-25 | Tỉnh suy từ `location` bằng alias dài nhất trước; không suy được thì `null` và tin không xuất hiện khi lọc theo tỉnh (cố ý không đoán). | SV | ✅ |
| BR-JOB-26 | Ngành suy theo thứ tự: từ khoá chính tiêu đề → nhãn portal → từ khoá dự phòng tiêu đề → thẻ → `OTHER`; "thương mại điện tử" đổi thành `ecommerce` trước khi so. | SV | ✅ |
| BR-JOB-27 | Nghề con suy từ tiêu đề trước, rồi nhãn + thẻ; không đủ căn cứ thì `null`. | SV | ✅ |
| BR-JOB-28 | Vân tay chống trùng = công ty chuẩn hoá + chức danh bỏ nhiễu + tỉnh; công ty ẩn danh/trống → `null` (tin coi như duy nhất). `dedupeKey` KHÔNG unique ở DB. | SV | ✅ |
| BR-JOB-29b | `derivedFields` đọc `salaryRaw` thành `salaryMin`/`salaryMax`/`currency = VND` (lương VND theo tháng: khoảng, "tới/lên đến" → chỉ trần, "từ/trên" → chỉ sàn); USD, lương tuần/giờ, chữ không đọc được → cả ba `null`. Đo trên DB dev: 1.869/1.980 chuỗi đọc được *(2026-10-19)*. | SV | ✅ |
| BR-JOB-29 | Mọi đường ghi tin phải lấy trọn bộ cột dẫn xuất từ `derivedFields`. | SV | ✅ |
| BR-JOB-30 | Backfill mặc định chỉ xử lý tin `searchText IS NULL`; `all=true` tính lại toàn bộ, lô 500, tuần tự. | SV | ✅ |
| BR-JOB-31 | Một tin là duy nhất theo `(source, externalId)`. | DB | 🔒 |
| BR-JOB-32 | Khách bấm "Việc làm phù hợp" bị chặn ở FE với lời mời đăng nhập; mọi nút, mục sidebar và thẻ hành động cần tài khoản mở modal đăng nhập/đăng ký ngay trên trang (không chuyển sang `/login`), đăng nhập xong nạp lại đúng trang hoặc tới mục đã bấm. *(2026-10-23)* | FE | ⚠️ |

### Job Scraping — Quét tin tuyển dụng từ portal — [modules/job-scraping.md](./modules/job-scraping.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-SCR-01 | Cron quét chạy theo `SCRAPE_CRON_SCHEDULE` (mặc định `0 23 * * *`) ở múi giờ `CRON_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`). | SV | ✅ |
| BR-SCR-02 | Cron chỉ đăng ký ở tiến trình `APP_ROLE` ≠ `api` và khi `SCRAPE_CRON_ENABLED` ≠ `false`. | SV | ✅ |
| BR-SCR-03 | Mỗi lượt cron tạo một `ScrapeRun` không chủ (`userId = null`) cho MỖI portal đang bật; lỗi một portal không chặn portal khác. | SV | ✅ |
| BR-SCR-04 | Hai lần gọi `runAllPortals` chồng nhau trong CÙNG tiến trình thì lần sau bị bỏ (cờ bộ nhớ, chỉ phủ khoảng thời gian xếp hàng). | SV | ✅ |
| BR-SCR-05 | Quét theo yêu cầu và nạp lại portal chỉ dành cho ADMIN. | GD | ✅ |
| BR-SCR-06 | `POST /api/scrape` giới hạn 3 lượt/giờ mỗi tài khoản. | GD | ✅ |
| BR-SCR-07 | Không chỉ định portal thì quét portal đầu tiên đã nạp; portal không có trong danh sách → 400. | SV | ✅ |
| BR-SCR-08 | Portal hợp lệ = thư mục có `SKILL.md` + `cli/src/cli.ts` và frontmatter không `enabled: false`; khoá portal = tên thư mục bỏ `-search/-jobs/-portal`. | SV | ✅ |
| BR-SCR-09 | Frontmatter `delayMs`, `maxJobs` chỉ nhận số nguyên dương, `occupations` chỉ nhận mảng chuỗi không rỗng; sai kiểu thì dùng giá trị chung. | SV | ✅ |
| BR-SCR-10 | Hàng đợi `scrape.run` buộc tuần tự (concurrency 1, `serial: true`), khoá chặn trùng = `runId`. | SV | ✅ |
| BR-SCR-11 | Lượt quét chỉ chạy khi giành được chỗ `PENDING → RUNNING`; worker thua thì bỏ qua, không gọi portal/AI. | SV | ✅ |
| BR-SCR-12 | Lỗi bất kỳ trong lượt → `FAILED` + `error` + `finishedAt`; `FAILED` không tự xếp lại. | SV | ✅ |
| BR-SCR-13 | `ScrapeRun` kẹt `RUNNING` > 4 giờ hoặc `PENDING` > 12 giờ được reconcile đánh `FAILED`. | SV | ✅ |
| BR-SCR-14 | Lượt người dùng: portal khai `occupations` mà ngành hồ sơ không thuộc → `DONE`, 0 tin, `error` giải thích, không gọi portal/AI; hồ sơ chưa có ngành thì không chặn. | SV | ✅ |
| BR-SCR-15 | Không có từ khoá mặc định: kế hoạch rỗng → `FAILED` với lời nhắc điền hồ sơ, không gọi model. | SV | ✅ |
| BR-SCR-16 | Từ khoá lượt người dùng: chức danh trước, chức danh + lĩnh vực mục tiêu, rồi ≤ 4 kỹ năng chính, lùi về nghề "Chọn nhanh"; tối đa 5 truy vấn, ≤ 60 ký tự. | SV | ✅ |
| BR-SCR-17 | AI chỉ TINH CHỈNH từ khoá lượt người dùng (timeout 30s, không thử lại); lỗi → dùng bản tất định. | SV | ✅ |
| BR-SCR-18 | Output model: 2–6 truy vấn (thừa thì cắt), `query` ≥ 2 ký tự cắt 60, `location` cắt 40, `rationale` cắt 200; ngành IT/kỹ thuật từ khoá tiếng Anh, ngành khác tiếng Việt có dấu. | SV | ✅ |
| BR-SCR-19 | Lượt hệ thống: cụm theo NGHỀ con (lùi về nhóm) của hồ sơ đủ dữ liệu + sàn phủ mọi nghề; lọc theo `occupations` của portal TRƯỚC khi xoay vòng; chọn ≤ `SCRAPER_SYSTEM_QUERY_LIMIT` (30) cụm quét lâu nhất, hoà thì cụm đông trước; quét cả nước. | SV | ✅ |
| BR-SCR-20 | Chỉ nghề đã thật sự gửi được request mới được đóng dấu `OccupationCrawl.lastCrawledAt`. | SV | ✅ |
| BR-SCR-21 | Trần tin mỗi portal mỗi lượt = `maxJobs` của portal hoặc `SCRAPER_MAX_JOBS_PER_PORTAL` (100); hạn ngạch mỗi truy vấn `floor(trần / số truy vấn)`, vòng hai lấp chỗ trống. *(2026-10-16 nâng 50 → 100)* | SV | ✅ |
| BR-SCR-22 | Mỗi truy vấn tối đa `SCRAPER_MAX_PAGES` (5) trang × 25 tin/trang. | SV | ✅ |
| BR-SCR-23 | Tin đăng quá `SCRAPER_MAX_AGE_DAYS` (7) ngày bị loại TRƯỚC khi gọi `detail`; tin không rõ ngày được giữ trừ khi `SCRAPER_REQUIRE_POSTED_AT=true`; ngày đăng ở tương lai quá 1 ngày coi như không rõ. | SV | ✅ |
| BR-SCR-24 | Một truy vấn lỗi không kéo đổ cả lượt; `BLOCKED` dừng mọi truy vấn còn lại nhưng giữ tin đã gom; không gom được tin nào thì lượt thất bại với lỗi đầu tiên. | SV | ✅ |
| BR-SCR-25 | Mọi lần gọi portal đi qua `invoke`: giãn cách ≥ `delayMs` (portal) hoặc `SCRAPER_PORTAL_DELAY_MS` (3.000ms) từ lần gọi trước VÀ ≥ 1.200ms từ lần xong trước. | SV | ✅ |
| BR-SCR-26 | Portal trả `BLOCKED` → ngừng gọi portal đó 30 phút (cầu dao trong bộ nhớ), ném lỗi ngay không chạy CLI. | SV | ✅ |
| BR-SCR-27 | Một lần gọi CLI tối đa `SCRAPER_TIMEOUT_MS` (60s), stdout ≤ 8MB. | SV | ✅ |
| BR-SCR-28 | `--jobage` chỉ truyền cho portal khai `jobAge: true` (LinkedIn). | SV | ✅ |
| BR-SCR-29 | Thẻ thiếu `id`, `slug`, `title` hoặc `url` bị bỏ khi chuẩn hoá. | SV | ✅ |
| BR-SCR-30 | Tin đã biết (cùng `source` + `externalId`) không gọi `detail` lại; chỉ làm mới trường thẻ có giá trị (logo, ngày đăng, lương thô, địa điểm/tỉnh/dedupeKey, nhãn/ngành). | SV | ✅ |
| BR-SCR-31 | Tin mới có mô tả trống hoặc kết thúc bằng dấu ba chấm thì gọi `detail`; lỗi `detail` bị nuốt và giữ bản cụt. | SV | ✅ |
| BR-SCR-32 | Tin có mô tả \< 80 ký tự (hoặc trống) không được lưu. | SV | ✅ |
| BR-SCR-33 | Tin cùng `dedupeKey` với một tin gốc quét trong 30 ngày được LƯU kèm `duplicateOfId` (gốc = tin cũ nhất), không bỏ qua; bản sao không được rút yêu cầu hay chấm. | SV | ✅ |
| BR-SCR-34 | Tin là duy nhất theo `(source, externalId)`; ghi bằng `upsert` nên hai lượt đua không tạo trùng. | DB | 🔒 |
| BR-SCR-35 | Tin mới lưu được xếp hàng `job.requirements` theo lô 5 tin. | SV | ✅ |
| BR-SCR-36 | Tự chấm điểm sau quét chỉ khi `SCRAPER_AUTO_SCORE=true` (mặc định tắt). | SV | ✅ |
| BR-SCR-37 | Fan-out hệ thống: mỗi hồ sơ (completion ≥ ngưỡng) ≤ 5 tin chưa chấm có ≥ 1 kỹ năng khớp; tối đa 500 lượt mỗi lần quét; người lâu chưa được phục vụ đi trước. | SV | ✅ |
| BR-SCR-38 | Lần nhắc một nghề trên một portal là duy nhất `(portal, occupationCode)`. | DB | 🔒 |
| BR-SCR-39 | Xoá tài khoản không xoá lịch sử quét (`ScrapeRun.userId` → `SetNull`). | DB | 🔒 |

### Matching — Chấm độ phù hợp hồ sơ ↔ tin tuyển dụng — [modules/matching.md](./modules/matching.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-MAT-01 | Đường đọc (`GET /matches`, `GET /matches/:jobId`) chỉ truy vấn SQL, không bao giờ gọi model. | SV | ✅ |
| BR-MAT-02 | Danh sách chỉ gồm `JobMatch` `status = DONE` của chính người dùng. | SV | ✅ |
| BR-MAT-03 | Sắp xếp `newest` (mặc định) = `evaluatedAt DESC NULLS LAST, updatedAt DESC, id DESC`; `score_desc`/`score_asc` theo `overallScore` NULLS LAST, hoà điểm thì lượt chấm mới hơn trước. Giá trị khác → 400. | DTO, SV | ✅ |
| BR-MAT-04 | Kết quả là "cũ" (`stale = true`) khi `evaluatedAt < Profile.updatedAt`. | SV | ✅ |
| BR-MAT-05 | API không trả `error` thô của lượt chấm; chỉ trả `failureKind` đã phân loại. Chi tiết không kèm nguyên tin, `promptHash`. | SV | ✅ |
| BR-MAT-06 | Cache theo `promptHash = fingerprint(system, prompt)`; prompt gồm khung đánh giá + tóm tắt hồ sơ + tin (chức danh, công ty, địa điểm, hình thức, lương, từ khoá, mô tả). Không `force`, DONE và hash trùng → trả bản cũ, không gọi model. | SV | ✅ |
| BR-MAT-07 | `POST /matches/evaluate` không `force`: cặp đã DONE → trả `alreadyScored: true` kèm điểm, không xếp hàng (không so hash). | SV | ✅ |
| BR-MAT-08 | `markPending`: FAILED → PENDING (xoá `error`); chưa có bản ghi → tạo PENDING; trạng thái khác giữ nguyên. Chỉ người dùng bấm mới đưa FAILED về PENDING — hệ thống không tự xếp lại FAILED. | SV | ✅ |
| BR-MAT-09 | Khoá chặn trùng `match.evaluate` = `userId:jobId:force | cache` trên policy `exclusive`: cùng cặp, cùng chế độ chỉ một việc chờ/chạy. | DB (pg-boss) |
| BR-MAT-10 | Giành chỗ có điều kiện: chỉ chuyển sang RUNNING khi trạng thái ≠ RUNNING hoặc RUNNING đã quá 5 phút; không có hàng thì `create`, trùng khoá (P2002) = thua; người thua không gọi model. | SV, DB | 🔒 |
| BR-MAT-11 | Điểm tổng do code tính, không hỏi model: `round(0,30·technical + 0,25·experience + 0,15·behavioral + 0,30·career)`. Prompt dặn model "KHÔNG tính điểm tổng". | SV | ✅ |
| BR-MAT-12 | Eligibility `FAIL` → `overallScore = 0`, `verdict = POOR` bất kể điểm chiều. | SV | ✅ |
| BR-MAT-13 | Nhãn phù hợp: ≥75 STRONG, ≥60 GOOD, ≥45 MODERATE, ≥30 WEAK, còn lại POOR. | SV | ✅ |
| BR-MAT-14 | Địa điểm là PASS/FAIL (`locationPass`), không tính vào điểm trọng số; giá trị không hợp lệ từ model → `false`. | SV | ✅ |
| BR-MAT-15 | Output chấm điểm: điểm chiều nghiêm ngặt (số nguyên 0–100, sai là lỗi SCHEMA), `verdict` eligibility nghiêm ngặt `PASS | FAIL | UNVERIFIED`; chữ tự do bị CẮT (ghi chú 600, quote 600, strengths ≥1 và ≤6 mục × 300, gaps ≤6 × 300, recommendation 800). |
| BR-MAT-16 | Lỗi khi chấm → `FAILED` + `error` = thông điệp lỗi; worker không ném ra ngoài. | SV | ✅ |
| BR-MAT-17 | Stream: lỗi `HttpException` trước sự kiện đầu → sự kiện `error` kèm `statusCode`; lỗi model → `FAILED` rồi sự kiện `error` "Không hoàn thành được tác vụ." + `failureKind`; trình duyệt ngắt không làm xếp lại việc *(gỡ `onAbandon` 2026-10-16)*. | SV | ✅ |
| BR-MAT-18 | Stream dùng chuỗi model nhanh (`fastModelChain` theo ước lượng token); đường hàng đợi dùng chuỗi mặc định. Cả hai chia chung cache `promptHash`. | SV | ✅ |
| BR-MAT-19 | `evaluate`, `evaluate-stream`, `requirements/:jobId` giới hạn 10 lượt/phút (`ThrottleAi`). | GD | ✅ |
| BR-MAT-20 | Rút yêu cầu bỏ qua khi bản DONE có `sourceHash` (title, description, location, workMode) trùng, trừ `force`. | SV | ✅ |
| BR-MAT-21 | Bản rút 0 kỹ năng (bắt buộc + ưu tiên = 0) là FAILED với thông điệp "Không rút được kỹ năng nào từ tin này, nên không có căn cứ để đối chiếu hồ sơ."; chỉ có kỹ năng ưu tiên vẫn hợp lệ. | SV | ✅ |
| BR-MAT-22 | Gộp lô `job.requirements`: tin > 6.000 ký tự đi lẻ; lô timeout 120 giây; phần tử thiếu hoặc 0 kỹ năng → rút lẻ tin đó; lô hỏng TIMEOUT/SCHEMA → FAILED cả lô; lỗi khác → rút lẻ từng tin. | SV | ✅ |
| BR-MAT-23 | Output rút yêu cầu: tối đa 10 kỹ năng mỗi loại × 80 ký tự (cắt), `seniority`/`remotePolicy` lạ → `UNKNOWN`, `workPermitRequired` lỗi → `false`, lô tối đa 50 phần tử. | SV | ✅ |
| BR-MAT-24 | Chỉ tin rút DONE mới được xếp `skill.canonicalize`. | SV | ✅ |
| BR-MAT-25 | Khoá danh bạ = `foldTerm(raw)` (bỏ dấu, chữ thường); key \< 2 ký tự bị bỏ; key đã có thì không gọi model. Một key chỉ trỏ một kỹ năng chuẩn. | SV, DB | 🔒 |
| BR-MAT-26 | Ứng viên gộp: cosine ≥ 0,72, kỹ năng chuẩn còn \< 6 cách viết, tối đa 5 ứng viên; không có ứng viên → tạo kỹ năng chuẩn mới (`EXACT`) không gọi model. | SV | ✅ |
| BR-MAT-27 | Model phải trả lời đủ mọi dòng đã hỏi; thiếu dòng hoặc lỗi → bỏ cả lô (không ghi gì). Chọn 0 hoặc ngoài phạm vi → tạo kỹ năng chuẩn mới. | SV | ✅ |
| BR-MAT-28 | Cách viết đã có (kể cả `MANUAL` do admin sửa) không bao giờ bị máy ghi đè. | SV, DB | 🔒 |
| BR-MAT-29 | Chỉ so với kỹ năng chuẩn sinh bởi cùng model embedding (`CanonicalSkill.model`). | SV | ✅ |
| BR-MAT-30 | Mỗi lượt `ingest` theo tin/hồ sơ xử lý tối đa 20 cách viết mới; quét toàn kho đi theo vòng, sang vòng sau khi còn chuỗi **và** vòng trước thêm được; xong thì đối chiếu lại toàn kho. | SV | ✅ |
| BR-MAT-31 | Bảng tra danh bạ cache 60 giây trong bộ nhớ từng tiến trình; xoá sau mỗi `ingest`. | SV | ✅ |
| BR-MAT-32 | Đối chiếu bằng luật không gọi model: kỹ năng khớp khi chứa nhau (hai chiều, `containsTerm`) hoặc cùng kỹ năng chuẩn qua danh bạ. | SV | ✅ |
| BR-MAT-33 | `percent = round(metWeight/totalWeight·100)` với bắt buộc 1, ưu tiên 0,5, YEARS 1; dòng `met = null` không vào mẫu; ELIGIBILITY/LOCATION không tính điểm; eligibility FAIL hoặc không có dòng kỹ năng → `percent = rank = 0`; `rank = metWeight/(totalWeight+2)`. | SV | ✅ |
| BR-MAT-34 | Eligibility luật: tin không đòi gì → PASS; đòi quốc tịch: hồ sơ trống → UNVERIFIED, chuỗi quốc tịch hồ sơ chứa chuỗi yêu cầu → PASS, ngược lại FAIL; chỉ đòi giấy phép: có `workPermit` → PASS, không → UNVERIFIED. | SV | ✅ |
| BR-MAT-35 | Địa điểm luật: REMOTE → khớp; thiếu thành phố/địa điểm → không xét; so mã tỉnh; khác tỉnh nhưng hồ sơ `willingToRelocate` → coi là khớp kèm ghi chú. | SV | ✅ |
| BR-MAT-36 | Chỉ lưu cặp đối chiếu khi `skillMet ≥ 1`; cặp đã lưu mà không còn khớp kỹ năng → xoá. | SV | ✅ |
| BR-MAT-37 | Bỏ qua tính lại cặp khi hash `v3:<sourceHash>:<profile.updatedAt>:d<số alias>` trùng; đổi công thức phải bump `FORMULA_VERSION`. | SV | ✅ |
| BR-MAT-38 | Đối chiếu toàn kho/theo tin chỉ dùng hồ sơ `completion ≥ 30` và tin rút DONE không phải bản sao. | SV | ✅ |
| BR-MAT-39 | Ghi đối chiếu nguyên tử: `deleteMany` + `createMany skipDuplicates` trong một `$transaction`; khoá chính `(userId, jobId)`. | DB | 🔒 |
| BR-MAT-40 | Phát suất AI chỉ chạy khi `MATCH_AI_AUTO=true` (mặc định tắt). | SV | ✅ |
| BR-MAT-41 | Cặp được phát suất phải: `percent ≥ MATCH_MIN_PERCENT`, `rank > 0`, eligibility ≠ FAIL, chưa có `JobMatch`, tin không phải bản sao, hồ sơ `completion ≥ 30`, qua cooldown `MATCH_AI_COOLDOWN_HOURS`, tin quét sau `lastFanOutAt`, đúng nhóm ngành của hồ sơ (hồ sơ chưa có ngành hoặc `OTHER` thì không lọc). Không lọc cấp bậc. | SV | ✅ |
| BR-MAT-42 | Mỗi hồ sơ tối đa `MATCH_AI_TOP_N` suất; phát theo vòng vị trí, hồ sơ lâu chưa được phát trước; trần `MATCH_AI_MAX_PER_RUN` mỗi lượt; hồ sơ được phục vụ ghi `lastFanOutAt = now`. | SV | ✅ |
| BR-MAT-43 | Bàn giao `match.shortlist` trễ 60 giây với khoá `all`/`user:<id>` để gộp một loạt đối chiếu thành một lượt phát. | SV, DB (pg-boss) | 🔒 |
| BR-MAT-44 | Khoá chặn trùng: `job.requirements` = vân tay danh sách id; `skill.canonicalize`/`match.requirements` = `sweep:<round>` / `job:<id>` / `user:<id>` / `all`. | DB (pg-boss) | 🔒 |
| BR-MAT-45 | `requirements/:jobId`, `dictionary/rebuild`, `shortlist/dispatch` chỉ dành cho ADMIN. | GD | ✅ |
| BR-MAT-46 | Embedding: `Xenova/multilingual-e5-base` q8, tiền tố `query: `, cắt về 768 chiều và chuẩn hoá; ít hơn 768 chiều là lỗi. | SV | ✅ |
| BR-MAT-47 | Mỗi cặp (user, job) có tối đa một `JobMatch`; mỗi tin tối đa một `JobRequirement`. | DB | 🔒 |

### Applications — Đơn ứng tuyển (Lịch sử ứng tuyển) — [modules/applications.md](./modules/applications.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-APP-01 | Mỗi người dùng có tối đa một đơn cho một tin; tạo trùng trả 409 "Bạn đã có đơn ứng tuyển cho công việc này". | DB + SV | 🔒 Cứng |
| BR-APP-02 | Đơn mới luôn bắt đầu ở `VIEWED` và kèm một sự kiện nhật ký `fromStatus = null`. | SV | ✅ Mềm |
| BR-APP-03 | Khi tạo đơn mà không bỏ qua tài liệu, tin phải đã được chấm điểm (`JobMatch` tồn tại) với `status = DONE`. | SV | ✅ Mềm |
| BR-APP-04 | Khi tạo đơn mà không bỏ qua tài liệu, tin có `eligibility = FAIL` bị từ chối kèm lý do `eligibilityNote`. | SV | ✅ Mềm |
| BR-APP-05 | `skipDocuments: true` bỏ qua cả ba kiểm tra chấm điểm và không sinh tài liệu — đơn chỉ là dấu "đã xem tin". | SV | ✅ Mềm |
| BR-APP-06 | Tạo đơn không bỏ qua tài liệu sinh đồng thời 1 CV ("CV - \{title\}") và 1 Thư xin việc ("Thư xin việc - \{company\}") qua hàng đợi `document.generate`. | SV | ✅ Mềm |
| BR-APP-07 | `POST /applications` chịu throttle như route gọi model: 10 lượt/phút/người dùng. | GD | ✅ Mềm |
| BR-APP-08 | Tập trạng thái hợp lệ là `VIEWED`, `APPLIED` (mở) và `WITHDRAWN` (cuối); giá trị khác bị DTO từ chối. | DTO | ✅ Mềm |
| BR-APP-09 | Không được đổi sang chính trạng thái đang có (400 "Đơn đã ở trạng thái …"); mọi chuyển đổi khác giữa ba trạng thái đều được phép, kể cả mở lại đơn đã hủy. | SV | ✅ Mềm |
| BR-APP-10 | `appliedAt` chỉ được ghi ở lần **đầu tiên** chuyển sang `APPLIED` và không bị xoá khi lùi trạng thái. | SV | ✅ Mềm |
| BR-APP-11 | `closedAt` = thời điểm chuyển sang trạng thái cuối (`WITHDRAWN`); chuyển sang trạng thái mở thì `closedAt` về `null`. | SV | ✅ Mềm |
| BR-APP-12 | Đổi trạng thái là giành chỗ có điều kiện theo trạng thái vừa đọc; thua tranh chấp trả 409, không ghi sự kiện thứ hai. | SV | ✅ Mềm |
| BR-APP-13 | Mỗi lần đổi trạng thái thành công ghi đúng một `ApplicationEvent` (from, to, note) trong cùng transaction. | SV | ✅ Mềm |
| BR-APP-14 | Ngày phỏng vấn độc lập với trạng thái đơn, nhận ISO 8601 hoặc `null` (xoá), không ghi nhật ký. | DTO + SV | ✅ Mềm |
| BR-APP-15 | "Đơn đang mở" (Dashboard) = đơn không ở trạng thái cuối, tức `VIEWED` + `APPLIED`. | SV | ✅ Mềm |
| BR-APP-16 | Danh sách đơn kèm CV của chính người dùng cho tin đó (CV của người khác cùng tin không lộ), sắp theo trạng thái rồi mới nhất. | SV | ✅ Mềm |
| BR-APP-17 | Danh sách đơn và danh sách tin sắp theo `updatedAt` giảm dần (đơn vừa đổi lên đầu). | SV | ✅ Mềm |
| BR-APP-18 | Bước tiếp theo hiển thị trong dropdown: VIEWED→\{APPLIED, WITHDRAWN\}, APPLIED→\{WITHDRAWN, VIEWED\}, WITHDRAWN→\{APPLIED, VIEWED\}. | FE | ⚠️ Chỉ frontend |
| BR-APP-19 | Xoá tin hoặc xoá người dùng thì xoá theo (Cascade) các đơn và nhật ký của chúng. | DB | 🔒 Cứng |

### Documents — Tài liệu ứng tuyển (CV, Thư xin việc, Mail ứng tuyển) — [modules/documents.md](./modules/documents.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-DOC-01 | Mỗi lần tạo tài liệu là một bản ghi `Document` mới ở `PENDING`; không có route cập nhật nội dung do model sinh tại chỗ. | SV | ✅ Mềm |
| BR-DOC-02 | CV có ba nguồn đích: tin có sẵn (`jobId`), JD dán tay (đủ cả mô tả 50–60.000 ký tự, công ty, vị trí), hoặc CV tổng quát khi không gửi trường nào. | DTO + SV | ✅ Mềm |
| BR-DOC-03 | Gửi một phần JD dán tay (thiếu mô tả, công ty hoặc vị trí) bị từ chối 400. | SV | ✅ Mềm |
| BR-DOC-04 | Thư xin việc bắt buộc gắn với một tin có sẵn (`jobId` bắt buộc); không nhận JD dán tay. | DTO + SV | ✅ Mềm |
| BR-DOC-05 | Mail ứng tuyển cần tin có sẵn hoặc JD dán tay đầy đủ; JD dán tay không tạo `Job` mới. | DTO + SV | ✅ Mềm |
| BR-DOC-06 | Tiêu đề: CV tạo qua `/documents/cv` là chuỗi rỗng; Thư xin việc là "Thư xin việc"; Mail là "Mail ứng tuyển: \{vị trí\} - \{công ty\}" cắt 160 ký tự. | SV | ✅ Mềm |
| BR-DOC-07 | Ngôn ngữ (VI/EN) chỉ chọn được cho CV; Thư và Mail luôn viết tiếng Việt. | SV | ✅ Mềm |
| BR-DOC-08 | `stream: true` thì route tạo chỉ trả `documentId`, client phải gọi `generate-stream`; ngược lại việc được xếp vào hàng đợi `document.generate`. Mail ứng tuyển luôn đi hàng đợi. | SV | ✅ Mềm |
| BR-DOC-09 | Chỉ được sinh khi giành được chỗ: tài liệu đang `PENDING`, `FAILED`, hoặc `RUNNING` đã kẹt quá `STUCK_AFTER_MS`; bản `DONE` không bao giờ bị sinh đè (409 qua stream, bỏ qua ở worker). | SV | ✅ Mềm |
| BR-DOC-10 | Lỗi khi sinh ghi `FAILED` kèm thông điệp lỗi; hệ thống không tự thử lại `FAILED` — người dùng tạo tài liệu mới hoặc gọi lại `generate-stream`. | SV | ✅ Mềm |
| BR-DOC-11 | Trình duyệt ngắt stream không huỷ việc: server chạy tới cuối và tự ghi DONE/FAILED. | SV | ✅ Mềm |
| BR-DOC-12 | Tài liệu `PENDING`/`RUNNING` quá 10 phút được cron reconcile xếp lại hàng đợi (tối đa 100 bản/lượt), không đánh FAILED. | SV (cron) | ✅ Mềm |
| BR-DOC-13 | Một tài liệu chỉ có tối đa một việc sinh đang chờ trong hàng đợi (`singletonKey = documentId`, policy `exclusive`). | SV (queue) | ✅ Mềm |
| BR-DOC-14 | Nội dung CV/thư chỉ được lấy từ thông tin có thật trong hồ sơ; không thêm công ty, chức danh, con số, kỹ năng; dự án phải ở mục `projects` (3–4 dự án bám tin). | SV (prompt) | ✅ Mềm |
| BR-DOC-15 | Output model bị CẮT chứ không từ chối ở trần độ dài/số lượng (CV: ≤8 năng lực, ≤5 bullet/kinh nghiệm, ≤4 dự án, ≤4 học vấn, ≤6 nhóm kỹ năng; thư ≤3 đoạn thân; mail ≤3 đoạn), nhưng giữ sàn tối thiểu (≥3 năng lực, ≥1 bullet, ≥1 đoạn thân, ≥2 đoạn mail). | SV (zod) | ✅ Mềm |
| BR-DOC-16 | Thư xin việc và mail được gợi ý thế mạnh/khoảng trống từ kết quả chấm điểm (`JobMatch`) của đúng tin đó; JD dán tay không có gợi ý. | SV | ✅ Mềm |
| BR-DOC-17 | Chữ ký mail (tên, email, điện thoại, chức danh), công ty và vị trí do code ghép từ hồ sơ/tin, không do model viết. | SV | ✅ Mềm |
| BR-DOC-18 | Phần đầu CV = tài khoản/hồ sơ đè bởi `Document.identity`: khoá vắng → lấy theo hồ sơ; chuỗi rỗng → cố ý ẩn dòng; không ghi ngược về hồ sơ. | SV | ✅ Mềm |
| BR-DOC-19 | Chỉ CV ở trạng thái `DONE` mới sửa được nội dung (`PUT :id/cv`); thư/mail chưa sửa được. | SV | ✅ Mềm |
| BR-DOC-20 | Người dùng được xoá nội dung CV tới rỗng (`cvEditSchema` không có sàn) nhưng vẫn chịu trần độ dài; dòng rỗng được lưu nhưng không được vẽ ra PDF/HTML in. | SV (zod) | ✅ Mềm |
| BR-DOC-21 | ĐÃ XÁC MINH KHÔNG CÒN TRONG CODE (2026-10-19): lưu CV render lại `.tex` (`writeSource`) để bản LaTeX khớp chữ mới. Nay `updateCv` chỉ ghi các cột. | SV | ✅ Mềm |
| BR-DOC-22 | Bố cục CV gồm 6 mục cố định; khoá thiếu được nối cuối, khoá lạ bị bỏ, tên mục rỗng quay về nhãn mặc định theo ngôn ngữ, tên mục > 60 ký tự bị từ chối 400 khi lưu. | SV | ✅ Mềm |
| BR-DOC-23 | Mục bị ẩn không được vẽ ra HTML (không giấu bằng CSS) để ATS không đọc thấy. | SV | ✅ Mềm |
| BR-DOC-24 | Mẫu CV chỉ đổi được cho `kind = CV` (thư xin việc cũng 422) và phải là một trong 6 id có sẵn; mẫu không dùng màu nhấn bị ép về màu của mẫu; id lạ trong dữ liệu cũ rơi về `classic`. | SV | ✅ Mềm |
| BR-DOC-25 | Thiết kế CV: font ∈ \{noto-sans, noto-serif, arial, times\}, cỡ chữ ∈ \{small, medium, large\} (nấc nhân với cỡ gốc của mẫu, `medium` không được lưu), khoảng cách dòng 1.2–1.8, màu nhấn `#rrggbb`. | DTO + SV | ✅ Mềm |
| BR-DOC-26 | Xem trước bản nháp không ghi database; mẫu, bố cục, phần đầu và nội dung override chỉ tồn tại trong request. | SV | ✅ Mềm |
| BR-DOC-27 | Chỉ tài liệu `DONE` có nội dung mới xem trước/in được; CV và thư xin việc có mẫu HTML, mail ứng tuyển thì không (422) *(2026-10-19)*. | SV | ✅ Mềm |
| BR-DOC-28 | Địa chỉ ô (`data-field`) chỉ có ở chế độ sửa (`editing: true` kèm `content`); bản in không bao giờ mang chúng và chế độ sửa không lọc dòng rỗng. | SV | ✅ Mềm |
| BR-DOC-29 | ĐÃ XÁC MINH KHÔNG CÒN TRONG CODE (2026-10-19): chọn bộ máy in qua `engine` (CV mặc định `html`, loại khác LaTeX; LaTeX bỏ qua mọi tuỳ chọn trình bày). | SV | ✅ Mềm |
| BR-DOC-29b | Mọi PDF in từ chính HTML xem trước của bản đã lưu (`previewHtml` → `htmlToPdf`), nên PDF giữ mẫu, màu, typography, thứ tự, mục ẩn, tên mục riêng *(2026-10-19)*. | SV | ✅ Mềm |
| BR-DOC-29c | Thư xin việc không có mẫu riêng để đổi: nó mượn `templateId`/`templateOptions` của CV `DONE` có `updatedAt` mới nhất cùng `userId` + `jobId`; không có CV nào thì dùng mẫu `classic`; không bao giờ mượn CV của người khác *(2026-10-19)*. | SV | ✅ Mềm |
| BR-DOC-29d | Bố cục thư: phần đầu, CSS mẫu và typography dùng chung với CV; tên công ty + ngày "Ngày d tháng m năm y"; dòng "Về việc: Ứng tuyển vị trí \<vị trí\>"; lời chào; các đoạn (mở đầu bỏ lời chào lặp ở dòng đầu, thân, động lực, kết; bỏ đoạn rỗng); "Trân trọng," + tên. Mọi chữ qua `escapeHtml` *(2026-10-19)*. | SV | ✅ Mềm |
| BR-DOC-29e | Thư mà tin đã bị xoá (`jobId = null`) không xem trước/in được: 404 `Thư xin việc bắt buộc phải gắn với một công việc` *(2026-10-19)*. | SV | ✅ Mềm |
| BR-DOC-30 | Mail ứng tuyển không có bản trình bày: xem trước và PDF trả 422 `Tài liệu loại APPLICATION_EMAIL chưa có mẫu HTML để xem trước.` *(2026-10-19)*. | SV | ✅ Mềm |
| BR-DOC-31 | ĐÃ XÁC MINH KHÔNG CÒN TRONG CODE (2026-10-19): file `.tex` của CV/thư lưu trên Storage theo khoá có `documentId`; cột `Document.storageKey` đã bị drop. | DB | ✅ Mềm |
| BR-DOC-32 | PDF > 2 trang chỉ được ghi cảnh báo log, không chặn *(2026-10-19: bỏ phần log ký tự font thiếu của LaTeX)*. | SV | ✅ Mềm |
| BR-DOC-33 | Bóc tin từ URL chỉ tải địa chỉ công khai (kiểm ở từng chặng chuyển hướng), từ chối trang bị chặn (401/403/429), không 2xx, hoặc có \< 800 ký tự chữ; chỉ gửi model 20.000 ký tự đầu; không tạo bản ghi. | SV | ✅ Mềm |
| BR-DOC-34 | Các route sinh/bóc (tạo CV, thư, mail, generate-stream, job-from-url) giới hạn 10 lượt/phút/người dùng; tải PDF giới hạn riêng 10 lượt/phút. | GD | ✅ Mềm |
| BR-DOC-35 | API không bao giờ trả cột `error` thô; thay bằng `failureKind` phân loại. | SV | ✅ Mềm |
| BR-DOC-36 | Danh sách tài liệu không trả `content` (chỉ trường để vẽ thẻ). | SV | ✅ Mềm |
| BR-DOC-37 | Xoá người dùng xoá theo tài liệu (Cascade); xoá tin chỉ gỡ liên kết (`jobId = null`, SetNull). | DB | 🔒 Cứng |
| BR-DOC-38 | ĐÃ XÁC MINH KHÔNG CÒN TRONG CODE (2026-10-19): trình sửa CV truyền `engine=html`, khối "Bản LaTeX" truyền `engine=latex`. Nay mọi nút gọi `documentsService.pdf(id)` không tham số. | FE | ⚠️ Chỉ frontend |
| BR-DOC-39 | FE yêu cầu JD dán tay ≥ 50 ký tự và đủ công ty, vị trí trước khi bật nút tạo; giữ ba ô qua đổi tab/tải lại (sessionStorage). | FE | ⚠️ Chỉ frontend |

### Interview Preparation — Chuẩn bị phỏng vấn theo tin tuyển dụng — [modules/interview-prep.md](./modules/interview-prep.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-INT-01 | Mỗi người dùng có tối đa MỘT bộ chuẩn bị phỏng vấn cho một tin. | DB | 🔒 |
| BR-INT-02 | Chỉ soạn bộ đề cho tin đang tồn tại trong bảng `Job`; không có thì 404. | SV | ✅ |
| BR-INT-03 | Bộ đề đã `DONE` không bị soạn lại nếu không có `force: true`; yêu cầu trả về như đã xếp nhưng `queueJobId: null`. | SV | ✅ |
| BR-INT-04 | Bộ đề đang `PENDING`/`RUNNING` không bị đặt lại trạng thái khi người dùng bấm thêm. | SV | ✅ |
| BR-INT-05 | Mỗi cặp (userId, jobId) chỉ có một việc `interview.prep` trong hàng đợi (singletonKey `userId:jobId`, policy `exclusive`). | SV (pg-boss) | ✅ |
| BR-INT-06 | Xếp hàng thất bại thì bộ đề vừa đặt `PENDING` chuyển `FAILED` với lý do "Không xếp được vào hàng đợi". | SV | ✅ |
| BR-INT-07 | Worker chỉ gọi model sau khi giành được chỗ `RUNNING` có điều kiện; người thua bỏ qua. | SV | ✅ |
| BR-INT-08 | Bộ đề `DONE` có `promptHash` trùng (khung skill + hồ sơ + mô tả tin + gaps) và không `force` thì không gọi lại model. | SV | ✅ |
| BR-INT-09 | Bộ đề phải có ≥2 câu STAR (giữ tối đa 5), ≥2 câu khó (tối đa 6), ≥3 câu hỏi lại (tối đa 8), ≥2 ý chính (tối đa 6), tối đa 6 điểm yếu; độ dài từng trường bị CẮT theo trần. | SV (zod) | ✅ |
| BR-INT-10 | Prompt cấm bịa dự án/con số/công ty; năng lực thiếu dữ liệu phải đưa vào `likelyProbes`. | SV (prompt) | ✅ |
| BR-INT-11 | Khoảng trống (`JobMatch.gaps`) từ lượt chấm điểm được đưa vào prompt soạn đề. | SV | ✅ |
| BR-INT-12 | Lỗi model khi soạn đề ghi `FAILED` + `error`; không tự thử lại. | SV | ✅ |
| BR-INT-13 | Bộ đề kẹt `PENDING`/`RUNNING` quá 10 phút (theo `updatedAt`) bị reconcile đánh `FAILED`. | SV (cron) | ✅ |
| BR-INT-14 | Chỉ lưu/nhận xét câu trả lời khi bộ đề của chính người dùng đang `DONE`. | SV | ✅ |
| BR-INT-15 | Câu hỏi được định vị bằng `kind` + số thứ tự trong mảng GỐC (`star`/`tough`, 0–50); câu có chữ rỗng bị bỏ khỏi danh sách luyện nhưng không đánh số lại. | SV + DTO | ✅ |
| BR-INT-16 | Câu trả lời khoá theo vân tay chữ câu hỏi (`questionKey`); mỗi (user, job, câu) một câu trả lời. | DB | 🔒 |
| BR-INT-17 | Soạn lại bộ đề làm câu trả lời của câu đã đổi chữ rơi khỏi mức sẵn sàng (không gắn sang câu mới cùng vị trí); dữ liệu cũ không bị xoá. | SV | ✅ |
| BR-INT-18 | Lưu câu trả lời rỗng (sau `trim`) là xoá câu trả lời. | SV | ✅ |
| BR-INT-19 | Nhận xét AI chỉ cho câu trả lời 20–4000 ký tự; lưu tự do cho phép 0–4000. | DTO | ✅ |
| BR-INT-20 | Nhận xét lưu chữ câu trả lời TRƯỚC khi gọi model: model hỏng thì mất lượt nhận xét chứ không mất câu trả lời. | SV | ✅ |
| BR-INT-21 | Nhận xét được giữ khi người dùng sửa câu trả lời, nhưng bị đánh dấu `feedbackStale` khi vân tay chữ hiện tại khác `feedbackKey`. | SV | ✅ |
| BR-INT-22 | Nhận xét không chấm điểm; tối đa 4 chỗ cần sửa; chỉ gợi ý dữ liệu có trong hồ sơ. | SV (prompt + zod) | ✅ |
| BR-INT-23 | Danh sách bộ đề KHÔNG trả nội dung câu hỏi, chỉ trạng thái, tin, `practiced/total`, đơn ứng tuyển và số buổi phỏng vấn thử (`AgentRun` workflow `interview`). | SV | ✅ |
| BR-INT-24 | Lỗi thô của lượt soạn không trả ra API; chỉ trả `failureKind`. | SV | ✅ |
| BR-INT-25 | Ngày phỏng vấn đọc từ `Application.interviewAt`, không có trạng thái "Phỏng vấn" riêng; bộ đề từ tin chỉ lưu (chưa có đơn) không có ngày. | SV | ✅ |

### Question Bank — Ngân hàng câu hỏi phỏng vấn — [modules/question-bank.md](./modules/question-bank.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-QB-01 | API chỉ trả câu hỏi ở trạng thái `READY`; câu `RAW`/`REJECTED` không lộ ra web. | SV | ✅ |
| BR-QB-02 | Câu mới nhập luôn ở `RAW` (mặc định cột và script nhập). | DB + script | 🔒 |
| BR-QB-03 | Mỗi câu nguồn chỉ nhập một lần theo `(source, sourceId)`; nhập lại không ghi đè công dịch đã làm. | DB + script | 🔒 |
| BR-QB-04 | Danh sách và bộ lọc mở cho khách, giới hạn 60 lượt/phút. | GD | ✅ |
| BR-QB-05 | Route công khai chỉ trả các trường trong danh sách trắng `LIST_FIELDS` (không có đáp án, không có `sourceText`). | SV | ✅ |
| BR-QB-06 | Xem/sinh đáp án cần đăng nhập và giới hạn 10 lượt/phút. | GD | ✅ |
| BR-QB-07 | Đáp án sinh một lần rồi dùng chung vĩnh viễn cho mọi người dùng; đã có `answeredAt` thì không gọi model. | SV | ✅ |
| BR-QB-08 | Câu loại `HANH_VI` (hành vi) và `DONG_CO` (động cơ) KHÔNG có đáp án mẫu — ép `null` ở tầng mã dù model trả gì. | SV + script | ✅ |
| BR-QB-09 | Đáp án do model sinh luôn mang `verified = false`; giao diện phải cảnh báo chưa có người rà. | SV + FE | ✅ |
| BR-QB-10 | Đáp án gồm `why` ≤400, 3–5 `keyPoints` (tối đa 5, mỗi ý ≤220), `answerGuide` ≤900 (cắt theo trần); `sampleAnswer` ≤2000 hoặc `null`. | SV (zod) | ✅ |
| BR-QB-11 | Danh sách sắp theo số lượt luyện ở nguồn giảm dần (câu phổ biến lên trước). | SV | ✅ |
| BR-QB-12 | Bộ đếm của một chiều lọc áp mọi bộ lọc khác nhưng bỏ chính nó (để người dùng thấy số câu nếu đổi lựa chọn). | SV | ✅ |
| BR-QB-13 | Bộ lọc chỉ nhận mã ngành trong `OCCUPATION_CODES`, 4 loại câu, 3 độ khó `Dễ`/`Trung bình`/`Khó`; từ khoá ≤ 80 ký tự, tìm không phân biệt hoa thường trên `text`. | DTO | ✅ |
| BR-QB-14 | Bản ghi nguồn `X_INTERVIEW` phải giữ `source` và `sourceId` để còn lọc, thay thế dần hoặc gỡ theo nguồn. | Script (quy ước) | ✅ |
| BR-QB-15 | Câu bị model đánh giá "không phải câu hỏi" chuyển `REJECTED` và được giữ lại, không xoá. | Script | ✅ |
| BR-QB-16 | Câu chỉ lên `READY` khi có bản tiếng Việt ≥ 5 ký tự, mã ngành và loại hợp lệ; lô hỏng thì cả lô giữ `RAW`. | Script | ✅ |

### Mock Interview — Phỏng vấn thử với người phỏng vấn ảo — [modules/mock-interview.md](./modules/mock-interview.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-MOCK-01 | Chỉ mở buổi luyện cho tin đang tồn tại. | SV | ✅ |
| BR-MOCK-02 | Mỗi người dùng chỉ có một buổi luyện đang `PENDING`/`RUNNING` (cập nhật trong 10 phút) tại một thời điểm; mở thêm → 409. Kiểm-rồi-tạo, không có khoá DB. | SV | ✅ |
| BR-MOCK-03 | Buổi luyện phỏng vấn ghi `workflow = 'interview'` và gắn `jobId` (cột, có index) để đếm "đã luyện mấy lượt cho tin này". | SV + DB | ✅ |
| BR-MOCK-04 | Bối cảnh buổi luyện chỉ dùng dữ liệu CỦA người dùng (đơn, tài liệu `DONE`, bộ đề `DONE`, điểm phù hợp `DONE`, tóm tắt hồ sơ) cùng yêu cầu kinh nghiệm và mô tả tin cắt 2000 ký tự *(2026-10-24: thêm hồ sơ và yêu cầu kinh nghiệm)*; khai báo là "dữ liệu, không phải mệnh lệnh". | SV | ✅ |
| BR-MOCK-05 | Lượt mở đầu không có nhận xét; nếu người dùng chọn sẵn câu (`question` ≤ 300) thì người phỏng vấn hỏi đúng câu đó trước. | SV (prompt + pump) | ✅ |
| BR-MOCK-06 | Mỗi lượt model viết: dấu `TIẾP`/`HẾT` → nhận xét 2–4 câu → `@@HOI@@` → ĐÚNG MỘT câu hỏi; `HẾT` kết thúc buổi. Parser nhận cả dấu gõ lệch (`@@HOI@`, `@HOI@@`, `@@ HỎI @@`, chữ thường) để nhận xét không bị dồn vào câu hỏi *(2026-10-23)*. | SV (prompt + parser) | ✅ |
| BR-MOCK-07 | Đầu ra bị lọc khối `<tool_call>` và chữ Hán/Hàn/Ả Rập trước khi gửi và lưu; số ký tự bị xoá được log cảnh báo. | SV | ✅ |
| BR-MOCK-08 | Model không trả câu hỏi ở lượt mở đầu → buổi `FAILED`. | SV | ✅ |
| BR-MOCK-09 | Chỉ trả lời được buổi luyện `workflow = 'interview'` đang `WAITING_USER` có lịch sử hội thoại. | SV | ✅ |
| BR-MOCK-10 | Gửi câu trả lời dùng giành chỗ có điều kiện `WAITING_USER → RUNNING` kèm `userId`; hai lượt gửi cùng lúc chỉ một lượt gọi model. | SV | ✅ |
| BR-MOCK-11 | Lượt trả lời hỏng trả buổi về `WAITING_USER`, không thêm bước, không `FAILED`. | SV | ✅ |
| BR-MOCK-12 | Mỗi lượt thành công ghi nguyên tử: câu trả lời gắn vào bước trước, bước mới, trạng thái và lịch sử hội thoại. | SV + DB | ✅ |
| BR-MOCK-13 | Thứ tự bước trong một buổi là duy nhất. | DB | 🔒 |
| BR-MOCK-14 | Lịch sử hội thoại (`messages`) là trạng thái máy, không trả ra API chi tiết; `steps` là bản cho người đọc. | SV | ✅ |
| BR-MOCK-15 | Lời tổng kết của buổi chỉ có khi `DONE`, nằm ở `result.text` (phần sau `@@HOI@@` của lượt đánh `HẾT`; bước cuối không mang `ask_user`), cắt 400 ký tự. *(2026-10-24, trước đó lấy chữ bước cuối)* | SV | ✅ |
| BR-MOCK-16 | Buổi kẹt `PENDING`/`RUNNING` quá 10 phút bị reconcile đánh `FAILED` + `finishedAt`; buổi `WAITING_USER` không bị đụng. | SV (cron) | ✅ |
| BR-MOCK-17 | Xoá tin tuyển dụng không xoá buổi luyện (`jobId` → `NULL`); xoá người dùng xoá buổi luyện và các bước. | DB | 🔒 |
| BR-MOCK-19 | Kết thúc sớm (`POST :id/finish`) đi chung đường giành chỗ với lượt trả lời; gửi model yêu cầu tổng kết thay cho câu trả lời, buộc `DONE`, câu đang hỏi dở không được gắn câu trả lời. *(2026-10-24)* | SV | ✅ |
| BR-MOCK-20 | Trần an toàn `MOCK_INTERVIEW_MAX_QUESTIONS` (mặc định 20) câu: khi buổi đã có đủ số bước đó, lượt trả lời kế tiếp dặn model tổng kết và buộc `DONE` dù model ghi `TIẾP`. Số câu bình thường vẫn do model tự quyết. *(2026-10-24)* | SV | ✅ |
| BR-MOCK-21 | Lượt chưa `HẾT` mà thiếu vạch `@@HOI@@` (model bị ngắt giữa chừng) là lượt hỏng: không ghi bước, trả buổi về `WAITING_USER`, người dùng gửi lại. Đo 2026-10-24: một lượt dừng ở "…tiêu chuẩn như ISO 2" từng bị lưu thành câu hỏi. *(2026-10-24)* | SV | ✅ |
| BR-MOCK-22 | Prompt người phỏng vấn: nhận xét chỉ dựa trên chữ ứng viên viết; mỗi chủ đề tối đa hai câu rồi chuyển yêu cầu chưa hỏi, chỉ hỏi công nghệ có trong tin hoặc hồ sơ; tin yêu cầu tiếng Anh thì có ít nhất một câu tiếng Anh; không lặp góp ý; buổi thường 8-12 câu; lời tổng kết là của người hướng dẫn (điểm mạnh, điểm cần sửa, chủ đề luyện tiếp). Rút ra từ buổi luyện 2026-10-24: 20 câu, 4 câu về OWASP ZAP không có trong tin, 7 lần cùng góp ý "thiếu số liệu", một lần khuyên "tưởng tượng" ví dụ. *(2026-10-24)* | Prompt | ✅ |
| BR-MOCK-18 | Trình duyệt ngắt kết nối không làm server dừng hay xếp lại lượt; generator chạy tới cuối và tự ghi kết quả. | SV | ✅ |

### Upskill — Lộ trình học & báo cáo nâng cấp kỹ năng — [modules/upskill.md](./modules/upskill.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-UPS-01 | Báo cáo có `jobId` là `TARGETED`, không có là `AGGREGATE` | SV | ✅ Mềm |
| BR-UPS-02 | AGGREGATE lấy tối đa 30 `JobMatch` `DONE` của người dùng, điểm tổng thấp nhất trước | SV | ✅ Mềm |
| BR-UPS-03 | AGGREGATE cần ít nhất 3 tin đã chấm; không có tin nào thì báo nạp tin trước | SV | ✅ Mềm |
| BR-UPS-04 | TARGETED chỉ chạy trên `JobMatch(userId, jobId)` của chính người gọi; không có thì lỗi "chưa được chấm điểm" | SV | ✅ Mềm |
| BR-UPS-05 | Chạy báo cáo bằng giành chỗ có điều kiện: chỉ từ `PENDING`, `FAILED`, hoặc `RUNNING` có `createdAt` quá 10 phút; báo cáo `DONE` không bao giờ chạy lại | SV | ✅ Mềm |
| BR-UPS-06 | Báo cáo gồm hai lời gọi model riêng: `upskill.gaps` (180s) rồi `upskill.plan` (120s); lời gọi 2 không mang mô tả công việc | SV | ✅ Mềm |
| BR-UPS-07 | Khoảng trống của lời gọi 1 được lưu ngay trước lời gọi 2 | SV | ✅ Mềm |
| BR-UPS-08 | Trong prompt, tin điểm thấp nặng ký hơn: trọng số khoảng trống = `(100 − điểm)/100`; tin có yêu cầu đã rút thì đưa danh sách kỹ năng, chưa có thì đưa 600 ký tự đầu mô tả | SV | ✅ Mềm |
| BR-UPS-09 | Output model bị CẮT: tối đa 12 `hardGaps`, 8 `synthesisedGaps`, 8 mục `learningPlan`, 4 nguồn học/mục; `priority` 0–100 và `estimatedWeeks` 1–52 giữ nghiêm | SV (zod) | ✅ Mềm |
| BR-UPS-10 | Lỗi trong lúc tạo báo cáo → `FAILED` + `error`; khi đọc chỉ trả `failureKind`, không trả lỗi thô | SV | ✅ Mềm |
| BR-UPS-11 | "Báo cáo mới nhất" chỉ tính bản `DONE` | SV | ✅ Mềm |
| BR-UPS-12 | "Lượt đang chạy" là `PENDING/RUNNING` tạo trong 10 phút gần nhất; lượt cũ hơn coi như kẹt | SV | ✅ Mềm |
| BR-UPS-13 | Tạo báo cáo (cả hai route) giới hạn 10 lượt/phút mỗi người | GD | ✅ Mềm |
| BR-UPS-14 | Việc `upskill.report` chặn trùng theo `reportId` | SV (queue) | ✅ Mềm |
| BR-UPS-15 | Báo cáo `PENDING/RUNNING` quá 10 phút (theo `createdAt`) bị reconcile đánh `FAILED`, không xếp lại | SV (cron) | ✅ Mềm |
| BR-UPS-16 | Kỹ năng thiếu tính bằng code: tin đúng ngành, nghề (và nghề gần), cấp bậc ±1 (kèm tin chưa rõ cấp bậc), không phải bản sao, quét trong 30 ngày, tối đa 400 tin | SV | ✅ Mềm |
| BR-UPS-17 | Hồ sơ chưa có ngành hoặc ngành `OTHER` → không tính khoảng trống, báo `needsOccupation` | SV | ✅ Mềm |
| BR-UPS-18 | Một kỹ năng chỉ được liệt kê khi ≥ 2 tin yêu cầu mà hồ sơ chưa đáp ứng; mỗi tin đếm một kỹ năng một lần | SV | ✅ Mềm |
| BR-UPS-19 | Tin "gần đạt" = đã khớp ≥ 50% kỹ năng bắt buộc; mỗi kỹ năng hiện tối đa 5 tin, ưu tiên tin gần đạt | SV | ✅ Mềm |
| BR-UPS-20 | Khoá gộp kỹ năng = id kỹ năng chuẩn trong từ điển, hoặc tên đã gấp dấu nếu chưa có trong từ điển | SV | ✅ Mềm |
| BR-UPS-21 | Tối đa 3 kỹ năng ở trạng thái `LEARNING` mỗi người; `SKIPPED` và `DONE` không tính | SV | ✅ Mềm |
| BR-UPS-22 | Mỗi người có tối đa một mục cho mỗi `skillKey` | DB | 🔒 Cứng |
| BR-UPS-23 | Gửi `LEARNING` với đủ 3 mốc đều `true` → mục thành `DONE` và kỹ năng được thêm vào `secondarySkills` của hồ sơ (nếu chưa có) | SV | ✅ Mềm |
| BR-UPS-24 | Xoá mục kế hoạch không gỡ kỹ năng đã thêm vào hồ sơ | SV | ✅ Mềm |
| BR-UPS-25 | Đọc/ghi báo cáo và kế hoạch học luôn khoá theo `userId` của JWT | SV | ✅ Mềm |
| BR-UPS-26 | Giờ học `User.studyTime` mặc định `20:00`, chỉ nhận 06:00–23:00 bước 30 phút, một giờ cho mọi kỹ năng *(2026-10-23)* | DTO, DB | ✅ Mềm |
| BR-UPS-27 | Nhắc học gửi trước giờ học 15 phút, chỉ vào ngày học của ít nhất một kỹ năng `LEARNING`, chỉ tới người đã bật nhắc trên ít nhất một thiết bị; một thông báo gộp mọi kỹ năng hôm đó *(2026-10-23)* | SV | ✅ Mềm |
| BR-UPS-28 | Thiết bị nhận thông báo khoá theo `endpoint` (duy nhất); đăng ký lại từ tài khoản khác thì thiết bị chuyển chủ; chỉ huỷ / gửi thử được thiết bị của chính mình *(2026-10-23)* | SV, DB | ✅ Mềm |
| BR-UPS-29 | Dịch vụ push trả 404/410 thì xoá thiết bị; chưa đặt khoá VAPID thì không phát khoá công khai (503) và không chạy cron nhắc học *(2026-10-23)* | SV | ✅ Mềm |

### Company Research — Tìm hiểu công ty — [modules/company-research.md](./modules/company-research.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-CMP-01 | Một bản tìm hiểu cho mỗi công ty đã chuẩn hoá: `nameKey` là khoá duy nhất, dùng chung cho mọi tin và mọi người dùng | DB | 🔒 |
| BR-CMP-02 | `companyKeyOf`: chuẩn hoá chữ (bỏ dấu), bỏ các cụm loại hình pháp nhân (dài trước), **giữ tên quốc gia**; tên rỗng/ẩn danh hoặc chỉ còn loại hình → `null` (không tìm hiểu được) | SV | ✅ |
| BR-CMP-03 | Đường đọc không gọi AI; chỉ trả các trường danh sách trắng (`verdict, summary, pros, cons, confidence, rating, reviewCount, sources, updatedAt`) — `modelId`, `name`, `nameKey` không lộ ra | SV | ✅ |
| BR-CMP-04 | Bản hết hạn khi `expiresAt <= now` (`stale`); bản hết hạn vẫn hiển thị và **không tự chạy lại** | SV | ✅ |
| BR-CMP-05 | Hạn của một bản là 60 ngày kể từ lần lưu (kể cả bản rỗng) | SV | ✅ |
| BR-CMP-06 | Chỉ tìm hiểu được tin ghi rõ công ty; ngược lại 400 | SV | ✅ |
| BR-CMP-07 | Bản còn hạn và không cưỡng bức → không xếp việc, không gọi model | SV | ✅ |
| BR-CMP-08 | Làm mới cưỡng bức bị chặn (409) nếu bản được cập nhật chưa đủ 1 giờ | SV | ✅ |
| BR-CMP-09 | Hàng đợi `company.brief` chặn trùng theo `nameKey` (không có `userId`), policy `exclusive`; concurrency mặc định 3 | SV (pg-boss) | ✅ |
| BR-CMP-10 | Luồng cố định: 3 truy vấn Serper (`gl=vn`, `hl=vi`), rồi **đúng một** lượt gọi model cho mỗi lần dựng (chưa tính mắt xích dự phòng) | SV | ✅ |
| BR-CMP-11 | Chọn tối đa 5 trang: loại mạng xã hội, loại đường dẫn tin tuyển dụng, ưu tiên 10 trang review theo thứ tự cố định, mỗi tên miền một trang | SV | ✅ |
| BR-CMP-12 | Giữ tối đa 2 đoạn trích Serper (≥ 60 ký tự) từ facebook/threads làm nguồn phụ, prompt ghi rõ "chỉ là đoạn trích" | SV | ✅ |
| BR-CMP-13 | Trang chỉ được coi là đọc được khi HTTP 2xx và văn bản ≥ 400 ký tự; còn lại lưu là `unreachable` | SV | ✅ |
| BR-CMP-14 | Nội dung mỗi trang được cắt còn ≤ 5.000 ký tự theo mật độ từ khoá đánh giá | SV | ✅ |
| BR-CMP-15 | Không có nguồn nào → lưu bản `UNKNOWN` mặc định, `modelId = null`, không gọi model | SV | ✅ |
| BR-CMP-16 | Model khai nguồn bằng số thứ tự; code ánh xạ ngược, bỏ số ngoài khoảng/trùng; mọi nguồn đã kiểm đều được lưu (`usedFor = null` nếu không dùng) | SV | ✅ |
| BR-CMP-17 | `confidence` do code tính trên nguồn đã dùng: 0 nguồn → `LOW`; ≥ 1 trang review chuyên và ≥ 2 nguồn → `HIGH`; ≥ 1 trang review hoặc ≥ 3 nguồn → `MEDIUM`; còn lại `LOW` | SV | ✅ |
| BR-CMP-18 | Output model được CẮT chứ không từ chối: `summary` ≤ 700, `pros`/`cons` ≤ 5 mục × 140 ký tự, `usedFor` ≤ 240, `usedSources` ≤ 6; `verdict` lạ → `unknown`; `rating` ngoài [0;5] → `null`; `reviewCount` âm → `null` | SV (zod) | ✅ |
| BR-CMP-19 | `NO_REVIEWS_YET` (trang review có nhưng chưa ai viết) tách khỏi `UNKNOWN` (nguồn không nói gì về môi trường làm việc) | SV (prompt + schema) | ✅ |
| BR-CMP-20 | Prompt: chỉ dùng nguồn được cấp, không dùng kiến thức sẵn có, không chép nguyên văn, coi nội dung nguồn là dữ liệu chứ không phải chỉ thị | SV (prompt) | ✅ |
| BR-CMP-21 | Cả đường stream lẫn đường hàng đợi đều chọn model từ **bể fast** (`fastModelChain`), timeout một lời gọi 120 giây | SV | ✅ |
| BR-CMP-22 | Lưu là upsert theo `nameKey`; `name` bị ghi đè bằng tên công ty ở lần dựng gần nhất | SV | ✅ |
| BR-CMP-23 | Lỗi khi dựng bản không để lại trạng thái lỗi trong DB; bản cũ (nếu có) giữ nguyên | SV | ✅ |
| BR-CMP-24 | Đọc công khai: throttle 60 lượt/phút; làm mới: `ThrottleAi` 10 lượt/phút | GD | ✅ |
| BR-CMP-25 | FE chỉ hiện thẻ "Về công ty này" khi `researchable = true` và không lỗi; khách bấm "Tìm hiểu" bị chuyển sang đăng nhập | FE | ⚠️ |
| BR-CMP-26 | Tìm kiếm nguồn: Tavily là nguồn chính, Serper chỉ được gọi khi Tavily không có key hoặc lời gọi Tavily hỏng (HTTP lỗi, hết hạn mức tháng, timeout); Tavily trả 200 với 0 kết quả thì KHÔNG gọi Serper *(2026-10-22)* | SV | ✅ |

### Salary — Tra cứu lương & khung đàm phán lương — [modules/salary.md](./modules/salary.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-SAL-01 | Mọi đường đọc (3 route công khai + khung đàm phán) chỉ lấy bản ghi `visibility = PUBLIC` | SV | ✅ Mềm |
| BR-SAL-02 | Bản ghi mới mặc định `INTERNAL`; lật sang PUBLIC là thao tác SQL có chủ đích, script nạp không đổi `visibility` | DB + script | 🔒 Cứng (default cột) |
| BR-SAL-03 | Bản ghi chưa xếp được ngành (`occupationCode = null`) không bao giờ được trả ra ở danh mục/danh sách | SV | ✅ Mềm |
| BR-SAL-04 | Mỗi nguồn có tối đa một bản ghi cho mỗi `positionSlug` | DB | 🔒 Cứng |
| BR-SAL-05 | Mỗi vị trí có tối đa một mốc cho mỗi nhãn kinh nghiệm; nhãn giữ nguyên chữ nguồn | DB | 🔒 Cứng |
| BR-SAL-06 | Xoá vị trí thì xoá luôn các mốc | DB | 🔒 Cứng |
| BR-SAL-07 | Ba route `/salary/*` mở cho khách và giới hạn 60 lượt/phút | GD | ✅ Mềm |
| BR-SAL-08 | Danh sách vị trí trả tối đa 1.000 dòng, chỉ các trường trong danh sách trắng, sắp lương TB giảm rồi tên | SV | ✅ Mềm |
| BR-SAL-09 | Danh mục ngành sắp theo số vị trí có dữ liệu giảm dần | SV | ✅ Mềm |
| BR-SAL-10 | Chi tiết luôn ghi nguồn (`provider`, `providerUrl`, `updatedAt = fetchedAt`) và `sampleSize = null` (không bịa cỡ mẫu) | SV | ✅ Mềm |
| BR-SAL-11 | Mốc kinh nghiệm hiển thị theo thứ tự thời gian (Dưới 1 năm, 1–3, 3–5, Trên 5), nhãn lạ xuống cuối | SV | ✅ Mềm |
| BR-SAL-12 | Bảng cùng ngành: top 6 theo lương TB, hạng tính trên toàn ngành; vị trí đang xem luôn có mặt | SV | ✅ Mềm |
| BR-SAL-13 | Ghép tin với vị trí lương: cùng ngành, tỉ lệ token khớp ≥ 0,8 và ≥ 2 token; hoà điểm thì chọn tên vị trí cụ thể hơn | SV | ✅ Mềm |
| BR-SAL-14 | Không khớp tiêu đề thì dùng nhóm vị trí ánh xạ sẵn theo nghề con | SV | ✅ Mềm |
| BR-SAL-15 | Mốc kinh nghiệm ưu tiên số năm của ứng viên, không có thì theo tin (`minYears`, rồi quy từ cấp bậc) | SV | ✅ Mềm |
| BR-SAL-16 | Gộp nhiều vị trí bằng TRUNG VỊ; bỏ `null` và 0 | SV | ✅ Mềm |
| BR-SAL-17 | Không có mốc kinh nghiệm thì khung = lương TB ± 25%, kẹp trong khoảng phổ biến | SV | ✅ Mềm |
| BR-SAL-18 | Độ phù hợp kéo mục tiêu: ≥ 75 nới trần +15%, ≤ 40 hạ sàn −15%; không có điểm thì coi là 50 | SV | ✅ Mềm |
| BR-SAL-19 | Sàn không thấp hơn lương hiện tại × 1,1 | SV | ✅ Mềm |
| BR-SAL-20 | Lương tối đa của tin chặn trần; lương tối thiểu của tin nâng sàn | SV | ✅ Mềm |
| BR-SAL-21 | Khung làm tròn bội số 500.000 VND, tối thiểu 500.000; mục tiêu luôn nằm trong [sàn, trần] | SV | ✅ Mềm |
| BR-SAL-22 | Ánh xạ ngành cho dữ liệu nguồn: ưu tiên theo vị trí (vd. `data-analyst → DATA_AI`), rồi theo ngành nguồn (vd. `it-software → IT`); không có thì `null` | Script | ✅ Mềm |
| BR-SAL-23 | Script crawl chỉ bỏ dữ liệu khi trang thiếu CẢ lương TB lẫn khoảng lương | Script | ✅ Mềm |

### Dashboard — Trang Tổng quan — [modules/dashboard.md](./modules/dashboard.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-DSH-01 | "Việc phù hợp" = `JobMatch` của người dùng có `status = DONE` và `eligibility ≠ FAIL` | SV | ✅ Mềm |
| BR-DSH-02 | "Mới tuần này" đếm `JobMatch` phù hợp có `createdAt` trong 7 ngày (ngày tạo bản chấm, không phải ngày đăng tin) | SV | ✅ Mềm |
| BR-DSH-03 | "Việc đang chờ" = tối đa 4 việc phù hợp chưa có đơn ở trạng thái `APPLIED`, xếp theo lần chấm mới nhất (không theo điểm) | SV | ✅ Mềm |
| BR-DSH-04 | Thẻ việc đang chờ chỉ trả trường thẻ tin (`JOB_CARD_FIELDS`) + `strengths`, không kèm ghi chú chấm điểm | SV | ✅ Mềm |
| BR-DSH-05 | "Điểm hôm nay" = trung bình làm tròn từng trục điểm của 5 lần chấm phù hợp mới nhất; trục không có số thì `null` | SV | ✅ Mềm |
| BR-DSH-06 | Thị trường: chỉ khi hồ sơ có ngành khác `OTHER`; tính tin không phải bản sao, quét trong 7 ngày; top 5 tỉnh/nghề, bỏ mã không có tên | SV | ✅ Mềm |
| BR-DSH-07 | Mục tiêu tuần cố định: 2 tài liệu, 2 đơn nộp, 1 phiên phỏng vấn thử; tuần thứ Hai–Chủ nhật theo giờ Việt Nam | SV | ✅ Mềm |
| BR-DSH-08 | Chuỗi ngày hoạt động: ngày có tạo tài liệu, có `appliedAt`, hoặc mở phiên phỏng vấn thử; hôm nay chưa có hoạt động thì đếm từ hôm qua; chỉ xét 30 ngày gần nhất | SV | ✅ Mềm |
| BR-DSH-09 | Hành trình: `cvs` = số `Document` kind `CV`; `applied` = số đơn đang `APPLIED`; `interviews` = số `AgentRun` workflow `interview` | SV | ✅ Mềm |
| BR-DSH-10 | "Việc đang dở" = việc phù hợp mới chấm nhất chưa có CV của người dùng và chưa nộp đơn | SV | ✅ Mềm |
| BR-DSH-11 | Khoảng trống kỹ năng trên Tổng quan = 6 kỹ năng đầu của `SkillGapService.forUser` (cùng cách tính trang Lộ trình học) | SV | ✅ Mềm |
| BR-DSH-12 | Gợi ý: tối đa 4, theo thứ tự hồ sơ chưa đủ → kỹ năng thiếu (≥ 2 tin) → việc "tuyển gấp" (điểm ≥ 85, tin ≤ 7 ngày) → nhiều việc không đủ điều kiện (≥ 2 và ≥ 1/3) → "quét việc" khi chưa chấm gì | SV | ✅ Mềm |
| BR-DSH-13 | Phản hồi dashboard không được cache (`Cache-Control: no-store, no-cache, must-revalidate`) | SV (header) | ✅ Mềm |
| BR-DSH-14 | Mọi số liệu khoá theo `userId` của JWT; số liệu thị trường là dữ liệu chung theo ngành | SV | ✅ Mềm |
| BR-DSH-15 | Hồ sơ chưa có ngành / ngành `OTHER` → FE hiện màn hình chọn ngành thay vì tổng quan | FE | ⚠️ Chỉ frontend |

### Admin Console — Bảng điều khiển quản trị — [modules/admin-console.md](./modules/admin-console.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-ADM-01 | Mọi route `/api/admin/**` của module chỉ dành cho `role = ADMIN`, khai bằng `@Roles('ADMIN')` mức class, không `@UseGuards` | GD | ✅ |
| BR-ADM-02 | Vai trò được đọc tươi từ DB mỗi request; đổi vai trò có hiệu lực ngay request kế, không cần thu hồi token | GD | ✅ |
| BR-ADM-03 | Nâng lên ADMIN luôn được phép (kể cả với chính mình); giữ nguyên vai trò không bị chặn | SV | ✅ |
| BR-ADM-04 | Admin không được tự hạ quyền chính mình | SV | ✅ |
| BR-ADM-05 | Không được hạ quyền khi hệ thống chỉ còn ≤ 1 ADMIN | SV | ✅ (không nguyên tử, xem R2) |
| BR-ADM-06 | Chỉ có hai vai trò `USER`, `ADMIN` | DTO + DB | 🔒 |
| BR-ADM-07 | API admin về người dùng không bao giờ trả `passwordHash`, `googleId`, `tokenVersion` — `select` liệt kê trường | SV | ✅ |
| BR-ADM-08 | `responseText` của một lời gọi AI bị che (`null`, `responseRedacted: true`) khi lời gọi gắn với một người dùng HOẶC `purpose` bắt đầu bằng `document.`/`profile.`/`interview.`/`question.` | SV | ✅ |
| BR-ADM-09 | Danh sách lỗi AI và chi tiết user không bao giờ trả `responseText` (select tường minh) | SV | ✅ |
| BR-ADM-10 | Lọc lỗi AI theo `failureKind = OTHER` gồm cả bản ghi `failureKind = null`; thống kê sức khoẻ cũng quy null về `OTHER` | SV | ✅ |
| BR-ADM-11 | Lọc `model` ở nhật ký lỗi khớp chuỗi con trên `modelId` hoặc `provider`; `purpose` khớp chính xác | SV | ✅ |
| BR-ADM-12 | Khoảng thời gian `from` bao gồm, `to` loại trừ (`gte`/`lt`) | SV | ✅ |
| BR-ADM-13 | Cửa sổ thống kê ≤ 1 ngày chia theo giờ (24 ô), > 1 ngày chia theo ngày; ô tính theo giờ Việt Nam và ô rỗng điền 0 | SV | ✅ |
| BR-ADM-14 | `totalTokens = inputTokens + outputTokens`; `cachedTokens` báo riêng, không cộng thêm; lời gọi `inputTokens = null` đếm là `untrackedCalls` | SV | ✅ |
| BR-ADM-15 | Top người dùng tốn token giới hạn 10, sắp theo tổng token rồi số lời gọi | SV | ✅ |
| BR-ADM-16 | `ai-health` chỉ tính trên tối đa 5.000 lời gọi mới nhất của cửa sổ; percentile theo hạng trần | SV | ✅ |
| BR-ADM-17 | Tổng quan so kỳ hiện tại với kỳ liền trước cùng độ dài | SV | ✅ |
| BR-ADM-18 | Tỉ lệ thành công kỳ trước chỉ được so khi kỳ đó có ≥ 20 lời gọi | SV | ✅ |
| BR-ADM-19 | Nhóm lỗi trên tổng quan gom theo `purpose` × `failureKind`, lấy 8 nhóm nhiều nhất, kèm số kỳ trước và một thông điệp mẫu mới nhất | SV | ✅ |
| BR-ADM-20 | Cảnh báo `danger` "AI chỉ thành công X%" khi kỳ có ≥ 20 lời gọi và tỉ lệ \< 80%, nêu loại lỗi chiếm nhiều nhất | SV | ✅ |
| BR-ADM-21 | Cảnh báo `warning` khi tổng việc chờ trong mọi hàng đợi > 50 | SV | ✅ |
| BR-ADM-22 | Cảnh báo `warning` cho mỗi portal (còn đăng ký) có lượt quét gần nhất FAILED | SV | ✅ |
| BR-ADM-23 | Cảnh báo `warning` khi chưa từng quét hoặc lượt quét gần nhất (của portal còn đăng ký) cũ hơn 26 giờ | SV | ✅ |
| BR-ADM-24 | Thống kê và lịch sử quét chỉ tính portal còn đăng ký; run của portal đã gỡ bị loại | SV | ✅ |
| BR-ADM-25 | Gom run thành một lượt khi cách run đầu nhóm ≤ 5 phút, mỗi portal một run/lượt, không trộn run manual (có `userId`) với run hệ thống | SV | ✅ |
| BR-ADM-26 | Sức khoẻ portal xét 14 lượt gần nhất; "chạm trần" khi lượt DONE gần nhất có `jobsFound ≥ scraper.maxJobsPerPortal` | SV | ✅ |
| BR-ADM-27 | Màn quét chỉ đọc tối đa 2.000 run mới nhất trong khoảng | SV | ✅ |
| BR-ADM-28 | "Quét ngay" dùng chung hàm cron: quét tuần tự mọi portal, tạo run `userId = null`; đang có lượt chạy trong cùng tiến trình thì không xếp thêm | SV | ✅ |
| BR-ADM-29 | Tính lại taxonomy mặc định chỉ xử lý tin `searchText = null`; `all=true` (đúng chuỗi `"true"`) tính lại toàn kho | SV | ✅ |
| BR-ADM-30 | PUT cấu hình hàng đợi ghi đè cả ba trường; trường vắng về mặc định `concurrency = 1`, `serial = false`, `note = null` | SV | ✅ |
| BR-ADM-31 | `concurrency` hàng đợi là số nguyên 1–50 | DTO | ✅ |
| BR-ADM-32 | `serial = true` ép concurrency hiệu lực về 1 | SV | ✅ |
| BR-ADM-33 | Concurrency mới chỉ có hiệu lực với worker sau khi khởi động lại tiến trình (chốt 2026-10-16) | SV | ✅ |
| BR-ADM-34 | Mỗi `queueName` có tối đa một dòng cấu hình | DB | 🔒 |
| BR-ADM-35 | Chuyển hay gộp alias đều đánh `source = MANUAL`; alias MANUAL không bị máy ghi đè vì luồng nạp danh bạ bỏ qua key đã có | SV | ✅ |
| BR-ADM-36 | Không chuyển alias sang kỹ năng nó đang thuộc | SV | ✅ |
| BR-ADM-37 | Chuyển alias cuối cùng đi thì kỹ năng nguồn bị xoá luôn (trong cùng transaction) | SV | ✅ |
| BR-ADM-38 | Không gộp một kỹ năng vào chính nó | SV | ✅ |
| BR-ADM-39 | Gộp kỹ năng: dồn mọi alias sang đích rồi xoá kỹ năng nguồn, nguyên tử trong một transaction; tên đích giữ nguyên | SV | ✅ |
| BR-ADM-40 | Một `key` (đã bỏ dấu, hạ chữ thường) chỉ thuộc đúng một kỹ năng chuẩn; xoá kỹ năng thì alias xoá theo (cascade) | DB | 🔒 |
| BR-ADM-41 | Tên kỹ năng chuẩn được trim, không rỗng, ≤ 200 ký tự; không yêu cầu duy nhất | DTO | ✅ |
| BR-ADM-42 | Kỹ năng láng giềng: 8 kỹ năng gần nhất theo cosine embedding, chỉ so trong cùng `model` embedding | SV | ✅ |
| BR-ADM-43 | Tìm kỹ năng khớp tên, nguyên văn alias (không phân biệt hoa thường) hoặc key đã bỏ dấu | SV | ✅ |
| BR-ADM-44 | Sửa danh bạ không tự đối chiếu lại; "đối chiếu lại toàn kho" là thao tác riêng: xoá dấu `hash` của mọi cặp rồi xếp `match.requirements` với `singletonKey 'all'` *(2026-10-19)*. | SV | ✅ |
| BR-ADM-45 | Lọc tin `requirement=NONE` nghĩa là tin chưa có bản ghi `JobRequirement`; `canonicalOnly` chỉ lấy tin gốc (`duplicateOfId = null`) | SV | ✅ |
| BR-ADM-46 | Chi tiết tin hiển thị tối đa 20 tin trùng mới nhất | SV | ✅ |
| BR-ADM-47 | Phân trang: `limit` 1–100 (mặc định 20), `offset` 0–100.000 | DTO | ✅ |
| BR-ADM-48 | Module admin không gọi model ở bất kỳ endpoint nào (đường đọc thuần SQL) | SV | ✅ |
| BR-ADM-49 | Chỉ tài khoản ADMIN được vào app quản trị; tài khoản USER đăng nhập được nhưng bị chặn ở màn hình, không bị đăng xuất | FE | ⚠️ |
| BR-ADM-50 | Nút "Hạ quyền" bị vô hiệu với chính mình trên giao diện | FE | ⚠️ (backend vẫn chặn bằng BR-ADM-04) |
| BR-ADM-51 | Mọi thao tác ghi trên màn Bảo trì, Danh bạ, Người dùng đều qua hộp xác nhận | FE | ⚠️ |
| BR-ADM-52 | Rút lại yêu cầu hàng loạt không đụng dòng `JobRequirement` đang `RUNNING`; dòng khác về `PENDING` và mất `sourceHash` *(2026-10-21)* | SV | ✅ |

### AI Platform — Nền tảng gọi model AI và khung prompt — [modules/ai-platform.md](./modules/ai-platform.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-AI-01 | Mọi lời gọi model đi qua `AiService` (seam `Ai`); module nghiệp vụ không gọi SDK trực tiếp | SV | ✅ |
| BR-AI-02 | Không bao giờ tự thay model khác khi model được chỉ định không tồn tại/không phục vụ — ném `ModelUnavailableError` | SV | ✅ |
| BR-AI-03 | Chuỗi: mắt đầu = model yêu cầu ?? đầu bể main ?? `MODEL_ID`; dự phòng = `fallbackModelIds` của caller (thay hẳn) ?? bể main ?? `MODEL_FALLBACK_IDS`; khử trùng theo `lõi/model` | SV | ✅ |
| BR-AI-04 | Đi tiếp mắt sau khi lỗi là: model không khả dụng, model bị rút, 429/hết hạn mức, 413/prompt quá lớn, 401/403, 5xx, **timeout**, **sai schema**; lỗi khác ném ngay | SV | ✅ |
| BR-AI-05 | Ngân sách cả chuỗi `AI_CHAIN_BUDGET_MS` (240 s): quá ngân sách thì không mở mắt mới (mắt đang chạy không bị ngắt) | SV | ✅ |
| BR-AI-06 | Timeout mặc định một lượt gọi 90 s; `maxRetries` SDK mặc định 2 (trong cùng một lượt) | SV | ✅ |
| BR-AI-07 | Chế độ ép định dạng theo **lõi**: lõi `honorsResponseFormat:false` (opencode, omniroute, groq, unorouter) chỉ dùng chế độ bơm JSON Schema vào prompt; lõi khác dùng `response_format` khi `AI_STRUCTURED_OUTPUTS=true` | SV | ✅ |
| BR-AI-08 | Lõi từ chối `response_format` → ghi nhớ chế độ ngược lại cho cả lõi (tới khi khởi động lại) | SV | ✅ |
| BR-AI-09 | Không ra object và lõi có hai chế độ → thử lại **đúng một lần** ở chế độ kia; lõi một chế độ không lật | SV | ✅ |
| BR-AI-10 | Bóc JSON khỏi văn xuôi/hàng rào: phản hồi JSON đi qua `extractJson` (cân bằng ngoặc, chỉ theo `{` đầu tiên); stream SSE chỉ giữ object JSON đầu tiên | SV | ✅ |
| BR-AI-11 | `streamObject` chỉ stream khi lõi/model nằm trong danh sách cho phép (`streamsJson`) hoặc lõi tôn trọng `response_format`; ngoài ra gọi đường không-stream | SV | ✅ |
| BR-AI-12 | `streamObject` giữ lại tới mảnh đầu tiên; hỏng sau mảnh đầu thì hỏng hẳn, không đổi model | SV | ✅ |
| BR-AI-13 | `streamText` không có chuỗi dự phòng và không cộng vào cầu dao | SV | ✅ |
| BR-AI-14 | Mỗi lượt gọi mạng ghi một dòng `ai_calls` (kể cả hỏng, kể cả probe); lỗi ghi nhật ký không bao giờ làm hỏng lượt gọi | SV | ✅ |
| BR-AI-15 | Lượt hỏng lưu `failureKind`, `errorMessage` ≤ 800 ký tự (+ chi tiết lệch schema), `finishReason`, `responseText` cắt GIỮA còn 2 000 ký tự; log ứng dụng không in nội dung phản hồi | SV | ✅ |
| BR-AI-16 | Phân loại lỗi: `SCHEMA` (NoObjectGenerated/không khớp schema), `TIMEOUT` (Timeout/Abort), `UPSTREAM` (APICallError, 429, rút model, 5xx), `OTHER`; bóc `RetryError` trước khi phân loại | SV | ✅ |
| BR-AI-17 | Người dùng cuối chỉ thấy phân loại lỗi (`Không hoàn thành được tác vụ.` + `failureKind`), lỗi thô nằm lại trong log/DB; `HttpException` giữ nguyên câu | SV | ✅ |
| BR-AI-18 | Cổng song song theo lõi: chỉ lõi `opencode` có trần, `OPENCODE_APP_CONCURRENCY` (mặc định 2), theo tiến trình | SV | ✅ |
| BR-AI-19 | Bể fast: chọn mắt đầu là model đầu tiên còn hạn mức theo `rateLimitFor` của lõi (Groq 8 000 token/phút, 200 000 token/ngày, 1 000 lượt/ngày — model Groq quét được mà chưa có trong bảng dùng đúng mức này thay vì coi là vô hạn *(2026-10-24)*; Gemini theo nhóm model; UnoRouter 1 lượt/phút), đếm trong RAM 25 giờ | SV | ✅ |
| BR-AI-20 | Ước token = ⌈ký tự/3,5⌉ + 1 200 (cố ý ước cao) | SV | ✅ |
| BR-AI-21 | Lõi thiếu API key bị coi là không khả dụng (ném lỗi, chuỗi đi tiếp); opencode/omniroute/kilo mặc định key `public` | SV | ✅ |
| BR-AI-22 | Model phải có trong catalog/`/models`, adapter được hỗ trợ (`@ai-sdk/openai-compatible`, `@openrouter/ai-sdk-provider`), không nằm trong danh sách đã đo là hỏng structured output; OpenRouter phải khai `structured_outputs` | SV | ✅ |
| BR-AI-23 | Catalog và `/models` sống cache 5 phút, timeout tải 10 s | SV | ✅ |
| BR-AI-24 | *(2026-10-19, chưa commit)* Không ghim model nào mặc định: `MODEL_ID`, `MODEL_FALLBACK_IDS`, `AI_FAST_MODEL_ID`, `AI_FAST_FALLBACK_IDS` mặc định rỗng; model ghim xếp trước model quét được nhưng vẫn qua probe và cầu dao | SV | ✅ |
| BR-AI-25 | *(2026-10-19, chưa commit)* Bể rỗng và không chỉ định model → lỗi "Bể model đang trống…" thay vì đoán model | SV | ✅ |
| BR-AI-26 | *(2026-10-19, chưa commit)* Lời gọi không chỉ định model đợi lượt kiểm tra model đầu tiên sau khi khởi động | SV | ✅ |
| BR-AI-27 | *(2026-10-19, chưa commit)* Quét toàn bộ model mới của từng lõi (bỏ trần 5 model); bỏ model không phải chat; bỏ router alias (`…/openrouter/free`, `…/openrouter/auto`); lõi trả phí (openrouter, unorouter, kilo, opencode) chỉ lấy model có chữ `free`; opencode/opencode-direct bỏ model thử nghiệm (`preview`, `alpha`, `beta`, `test`, `exp`); unorouter lọc bỏ checkpoint vẽ ảnh; omniroute lọc lúc quét theo `filterModel` (chặn kênh hỏng `auto/`, `oc/`, `dva/`, `aug/`, `zc/`, `cxa/`, `tllm/`, `cl/`, `cline/`, `antigravity/gemini-3.7`, `antigravity/gemini-pro-agent`, `antigravity/gemini-3.1-pro`, router alias, `claude-haiku`; nhận `ddgw/`, `cfp/`, `antigravity/` và mọi model có chữ `free`; model ghim không bị chặn bởi `filterModel`) *(2026-10-20)* | SV | ✅ |
| BR-AI-28 | *(2026-10-19, chưa commit)* Probe: một lượt `generateObject` `{ok, echo}` không dự phòng, không thử lại, timeout 6 s; khoẻ khi `ok=true` và `echo=123`; probe tuần tự | SV | ✅ |
| BR-AI-29 | *(2026-10-19, chưa commit)* Xếp hạng bể: trượt probe xuống cuối → ghim trước quét → thứ tự lõi trong `*_TASK_PROVIDERS` → độ trễ probe tăng dần | SV | ✅ |
| BR-AI-30 | *(2026-10-19, chưa commit)* Cầu dao: lỗi thuộc `skipReason` (trừ prompt quá lớn) cộng bộ đếm; đủ 2 lần liên tiếp thì cách ly 15 phút, kể cả khi caller chỉ định model đó; cả chuỗi cách ly thì giữ nguyên chuỗi; thành công (kể cả probe) mở lại | SV | ✅ |
| BR-AI-31 | *(2026-10-19, chưa commit)* Kiểm tra model chạy lúc khởi động và theo lịch `AI_HEALTHCHECK_SCHEDULE` ở **mọi** tiến trình; chỉ một lượt chạy cùng lúc trong một tiến trình | SV | ✅ |
| BR-AI-32 | Route quản trị model và skill chỉ dành cho `ADMIN` (`@Roles('ADMIN')` cấp controller) | GD | ✅ |
| BR-AI-33 | Skill = thư mục con có `SKILL.md` trong `SKILLS_DIR`; file `.md` khác cùng thư mục là tham chiếu; `contentHash` 16 ký tự gộp thân + tham chiếu | SV | ✅ |
| BR-AI-34 | Tra skill không có → 404 `Không tìm thấy skill: <name>` | SV | ✅ |
| BR-AI-35 | Placeholder hồ sơ không có giá trị/không ánh xạ → `(hồ sơ chưa cung cấp thông tin này)`; tóm tắt hồ sơ trong prompt tối đa 4 000 ký tự | SV | ✅ |
| BR-AI-36 | Prompt dùng chung giữa người dùng thay placeholder bằng câu trỏ cố định để phần đầu prompt giống hệt từng byte (cache prompt) | SV | ✅ |
| BR-AI-37 | Schema output của model CẮT chứ không từ chối: chuỗi trim + cắt độ dài, mảng bỏ rỗng + cắt số lượng, enum lạ → giá trị dự phòng, số nguyên kẹp trong khoảng, số năm ngoài khoảng → null; chỉ `requiredCappedText*` từ chối chuỗi rỗng | SV (zod) | ✅ |
| BR-AI-38 | Sửa thân request theo lõi: omniroute thêm `stream:false` nếu thiếu; groq bỏ `response_format: json_object`; omniroute gửi header tắt nén/tắt bộ nhớ | SV | ✅ |
| BR-AI-39 | Cảnh báo SDK về `responseFormat` (đã xử lý chủ ý) bị lọc khỏi log; cảnh báo khác ghi `warn` | SV | ✅ |
| BR-AI-40 | Quét model mới của **mọi lõi** chỉ nhận model mà catalog `models.opencode.ai` khai `structured_output: true`; model hoặc lõi catalog không biết thì giữ (`omniroute`, `opencode-direct`), model ghim trong `.env` không bị lọc. Lõi mang tên khác trong catalog khai `catalogId`/`catalogModelId` (`gemini` → `google`, bỏ tiền tố `models/`). Đo 7 ngày tới 2026-10-20: model không khai — `mimo-v2.6-flash-free`, `nemotron-3.5-super-vl-free`, `nemotron-3-ultra-free` — là nhóm hỏng SCHEMA/TIMEOUT nhiều nhất *(2026-10-20)* | SV | ✅ |

### Platform Operations — Vận hành nền tảng (hàng đợi, nhặt việc rơi, sức khoẻ, sandbox, lưu trữ, xử lý lỗi) — [modules/platform-operations.md](./modules/platform-operations.md#7-business-rules)

| Mã | Quy tắc | Nơi thực thi | Mức |
|---|---|---|---|
| BR-OPS-01 | Hệ thống có đúng 11 hàng đợi cố định (`QUEUE`); tất cả được tạo lúc khởi động với policy `exclusive`. | SV | ✅ |
| BR-OPS-02 | Hàng đợi có sẵn với policy khác → ứng dụng từ chối khởi động; chỉ khi `QUEUE_POLICY_MIGRATE=true` mới xoá-tạo lại (mất việc đang chờ). | SV | ✅ |
| BR-OPS-03 | Khoá chặn trùng do code suy ra từ payload, ghi đè khoá người gọi truyền; payload thiếu trường khoá hoặc hàng đợi chưa khai khoá → ném lỗi, không xếp. | SV | ✅ |
| BR-OPS-04 | Với policy `exclusive`, mỗi `(queue, singletonKey)` chỉ có tối đa một job chưa xong (created/retry/active); gửi trùng bị bỏ (`send` trả `null`). | DB | 🔒 |
| BR-OPS-05 | `match.evaluate` có lượt `force=true` tách khoá với lượt thường (`userId:jobId:force` vs `:cache`) nên lượt ép chấm lại không bị gộp vào lượt thường đang chờ. | SV | ✅ |
| BR-OPS-06 | `job.requirements` khoá theo dấu vân tay của danh sách `jobIds` đã sắp xếp — cùng một lô tin không xếp hai lần. | SV | ✅ |
| BR-OPS-07 | `skill.canonicalize`/`match.requirements` khoá theo phạm vi: `sweep:<round>` > `job:<id>` > `user:<id>` > `all`; `match.shortlist` khoá `user:<id>` hoặc `all`. | SV | ✅ |
| BR-OPS-08 | Worker nhận từng job một (`batchSize: 1`), song song bằng `localConcurrency`, poll mỗi 2 giây — một job hỏng không kéo đổ job khác. | SV | ✅ |
| BR-OPS-09 | Tiến trình vai `api` không đăng ký worker nào và không chạy cron reconcile/quét tin; `APP_ROLE` trống = `all`, giá trị lạ → không khởi động. | SV | ✅ |
| BR-OPS-10 | Concurrency hiệu lực = dòng `QueueConfig` (`serial` → 1, tối thiểu 1); thiếu dòng → bảng mặc định trong code. | SV | ✅ |
| BR-OPS-11 | Khởi động seed `QueueConfig` từ mặc định với `skipDuplicates` — không ghi đè cấu hình admin đã sửa. | SV + DB | ✅ |
| BR-OPS-12 | Concurrency chỉ áp vào worker lúc đăng ký; đổi `QueueConfig` cần khởi động lại worker mới có hiệu lực. | SV | ✅ |
| BR-OPS-13 | `PUT` cấu hình hàng đợi là thay thế toàn phần: trường vắng → `concurrency 1`, `serial false`, `note null`; `concurrency` phải là số nguyên 1–50. | SV + DTO | ✅ |
| BR-OPS-14 | `queueName` trong `QueueConfig` là duy nhất. | DB | 🔒 |
| BR-OPS-15 | Khi tắt: dừng pg-boss (graceful) ở `beforeApplicationShutdown` TRƯỚC, ngắt Prisma ở `onApplicationShutdown` SAU. | SV | ✅ |
| BR-OPS-16 | Một việc nền bị coi là kẹt khi ở `PENDING`/`RUNNING` lâu hơn `STUCK_AFTER_MS` = max(5 phút, 10 phút) = 10 phút tính từ `updatedAt`. | SV | ✅ |
| BR-OPS-17 | `Document` và `JobMatch` kẹt được **xếp lại** vào hàng đợi (cũ nhất trước, tối đa 100 mỗi loại mỗi lượt, phần dư báo `deferred`). | SV | ✅ |
| BR-OPS-18 | `AgentRun`, `InterviewPrep`, `ProfileDraft`, `JobRequirement` kẹt bị **đánh hỏng** (`FAILED` + thông điệp cố định); `AgentRun` thêm `finishedAt`; `WAITING_USER` không bị đụng. | SV | ✅ |
| BR-OPS-19 | `UpskillReport` tính kẹt theo `createdAt` (bảng không có `updatedAt`). | SV | ✅ |
| BR-OPS-20 | `ScrapeRun` bị đánh hỏng khi `RUNNING` quá 4 giờ (theo `startedAt`) hoặc `PENDING` quá 12 giờ (theo `createdAt`). | SV | ✅ |
| BR-OPS-21 | Reconcile không bao giờ đụng bản ghi `FAILED` hay `DONE` — việc hỏng do người dùng bấm chạy lại. | SV | ✅ |
| BR-OPS-22 | Cron reconcile mặc định `*/10 * * * *` theo `CRON_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`), tắt được bằng `RECONCILE_CRON_ENABLED=false`; lượt mới bị bỏ nếu lượt trước chưa xong (trong cùng tiến trình); lỗi chỉ log. | SV | ✅ |
| BR-OPS-23 | Admin chạy reconcile ngay trả HTTP 202 kèm số liệu và câu tóm tắt tiếng Việt. | SV | ✅ |
| BR-OPS-24 | `GET /api/health` công khai, không throttle, chỉ báo tiến trình sống + uptime. | GD | ✅ |
| BR-OPS-25 | `GET /api/queue/stats` chỉ dành cho ADMIN. | GD | ✅ |
| BR-OPS-26 | Thứ tự timeout: một lời gọi model (90s mặc định; tài liệu/đọc CV/upskill.gaps 180s) \< `AI_CHAIN_BUDGET_MS` 240s \< `server.setTimeout` 300s \< `STUCK_AFTER_MS` 600s. | SV | ✅ |
| BR-OPS-27 | Thân request JSON/urlencoded tối đa 1MB; vượt → 413 `Nội dung gửi lên quá lớn (tối đa 1MB).`; JSON hỏng → 400. | GD | ✅ |
| BR-OPS-28 | Mỗi phản hồi mang `x-request-id`: giữ id client nếu khớp `^[\w-]{1,64}$`, không thì sinh UUID; id có trong body lỗi 5xx/AI. | GD | ✅ |
| BR-OPS-29 | Lỗi gọi dịch vụ ngoài ánh xạ cố định: SCHEMA → 502, TIMEOUT → 504, UPSTREAM → 503 (kèm `failureKind`); lỗi không xác định → 500 với thông điệp chung, không lộ stack. | GD | ✅ |
| BR-OPS-30 | Lỗi Prisma biết mã: P2002 → 409, P2025 → 404, P2003 → 400, khác → 500. | GD | ✅ |
| BR-OPS-31 | Kiểm-tra-rồi-tạo được thay bằng `create` rồi bắt `P2002` qua `isUniqueViolation`. | SV | ✅ |
| BR-OPS-32 | Stream NDJSON: nhịp tim 10s; `HttpException` trước sự kiện đầu → sự kiện `error` có `statusCode`; hỏng giữa chừng → cắt kết nối; trình duyệt ngắt không xếp lại việc *(2026-10-16)*. | SV | ✅ |
| BR-OPS-33 | Sandbox chạy container không mạng, RAM mặc định 512MB, 1 CPU, không tự kéo image, xoá container + thư mục tạm dù thành công hay hỏng; quá hạn → `SIGKILL`. | SV | ✅ |
| BR-OPS-34 | File người dùng trên R2 đặt dưới tiền tố `<userId>/`. | SV | ✅ |
| BR-OPS-35 | Log request: ≥ 500 → error, ≥ 1000ms → warn "(chậm)", ≥ 400 → warn. | GD | ✅ |
| BR-OPS-36 | Kết nối Postgres của Prisma hết hạn sau 10 giây nếu không lập được. | SV | ✅ |
| BR-OPS-37 | Xếp việc do người dùng/admin bấm đi qua method `enqueue`/`start` của service, không từ controller. Ghi bản ghi `PENDING` rồi `queue.send` ném lỗi → bản ghi thành `FAILED` (`Không thể đưa vào hàng đợi: …` hoặc lỗi gốc) và lỗi đi tiếp ra request; không còn bản ghi `PENDING` không có việc. `send` trả `null` vì trùng `singletonKey` không phải lỗi. *(2026-10-21)* | SV | ✅ |

[//]: # (/GEN:BR)

## 3. Danh mục sai lệch và rủi ro

Mức do agent viết module đề xuất sau khi đọc tận dòng code, đã rà lại khi tổng hợp. Không có rủi ro 🔴 Khẩn cấp: không phát hiện lỗ hổng làm lộ dữ liệu người dùng này cho người dùng khác hay mất dữ liệu đã lưu.

[//]: # (GEN:RISKS)


### 🔴 Khẩn cấp (0)

Không có rủi ro nào được xếp mức này.


### 🟠 Cao (2)

| Mã | Module | Rủi ro |
|---|---|---|
| [question-bank#R2](./modules/question-bank.md) | question-bank | Rủi ro pháp lý của dữ liệu nguồn `X_INTERVIEW` |
| [salary#R1](./modules/salary.md) | salary | Dữ liệu lương của bên thứ ba được hiển thị công khai và mời Google index |

### 🟡 Trung bình (37)

| Mã | Module | Rủi ro |
|---|---|---|
| [auth#R1](./modules/auth.md) | auth | Đăng xuất không thu hồi được token; không có "đăng xuất mọi thiết bị" |
| [auth#R2](./modules/auth.md) | auth | Refresh token không xoay vòng |
| [auth#R3](./modules/auth.md) | auth | Không xác thực email, không quên/đổi mật khẩu |
| [auth#R6](./modules/auth.md) | auth | Throttle auth theo IP phụ thuộc `TRUST_PROXY`; không khoá theo tài khoản |
| [auth#R8](./modules/auth.md) | auth | FE người dùng treo spinner khi `/auth/me` lỗi khác 401 |
| [cv-import#R1](./modules/cv-import.md) | cv-import | Trang upload treo ở "Đang đọc" khi bản nháp mới nhất đang PENDING/RUNNING |
| [cv-import#R2](./modules/cv-import.md) | cv-import | Không có chính sách lưu trữ/xoá CV |
| [jobs#R2](./modules/jobs.md) | jobs | Tin không bao giờ hết hạn |
| [job-scraping#R2](./modules/job-scraping.md) | job-scraping | "Quét ngay" không có giới hạn và cờ chống chồng chỉ phủ vài mili giây |
| [job-scraping#R3](./modules/job-scraping.md) | job-scraping | Nhịp gọi, cầu dao `BLOCKED` và danh sách portal nằm trong bộ nhớ từng tiến trình |
| [matching#R2](./modules/matching.md) | matching | `POST /matches/evaluate` (không force) trả điểm cũ dù hồ sơ/tin đã đổi |
| [matching#R3](./modules/matching.md) | matching | Chấm lại có `force` qua hàng đợi: FE có thể đọc ngay kết quả DONE cũ và dừng poll |
| [matching#R4](./modules/matching.md) | matching | `job.requirements` không giành chỗ có điều kiện |
| [matching#R5](./modules/matching.md) | matching | Luật quốc tịch so chuỗi con không bỏ dấu |
| [matching#R6](./modules/matching.md) | matching | Hồ sơ có hơn 20 kỹ năng mới: phần dư không bao giờ vào danh bạ tự động |
| [applications#R3](./modules/applications.md) | applications | Tạo đơn và chuẩn bị tài liệu không nguyên tử; tài liệu luôn tạo mới |
| [documents#R3](./modules/documents.md) | documents | CV tạo qua `/documents/cv` có tiêu đề rỗng |
| [documents#R4](./modules/documents.md) | documents | Tài liệu tạo với `stream: true` mà không bao giờ stream vẫn bị sinh tự động sau 10 phút |
| [question-bank#R3](./modules/question-bank.md) | question-bank | `sampleAnswer` dài hơn 2000 ký tự bị bỏ hẳn (thành `null`) thay vì bị cắt |
| [question-bank#R4](./modules/question-bank.md) | question-bank | Không có đường sinh lại hay rà duyệt đáp án |
| [mock-interview#R1](./modules/mock-interview.md) | mock-interview | Chặn "một buổi đang chạy" là kiểm-rồi-tạo, hai request mở buổi cùng lúc đều lọt |
| [mock-interview#R2](./modules/mock-interview.md) | mock-interview | Stream lượt mở đầu đứt giữa chừng thì buổi nằm `RUNNING` và khoá người dùng mở buổi mới tới 10 phút |
| [upskill#R2](./modules/upskill.md) | upskill | Kết quả lời gọi 2 (`learningPlan`, `summary`) không được hiển thị ở đâu |
| [upskill#R3](./modules/upskill.md) | upskill | Lỗi tiền điều kiện chỉ lộ ra sau khi đã tạo báo cáo và xếp hàng |
| [company-research#R2](./modules/company-research.md) | company-research | Hai lượt stream cùng công ty không được gộp |
| [company-research#R3](./modules/company-research.md) | company-research | Bản rỗng khi Serper tắt bị "đóng băng" 60 ngày |
| [salary#R2](./modules/salary.md) | salary | Route công khai chưa có e2e gọi không token |
| [admin-console#R2](./modules/admin-console.md) | admin-console | Chốt "admin cuối cùng" không nguyên tử; hai admin hạ quyền nhau đồng thời có thể để hệ thống còn 0 ADMIN |
| [admin-console#R4](./modules/admin-console.md) | admin-console | `PUT /admin/queue/config/:queueName` nhận tên hàng đợi bất kỳ và ghi đè trường vắng về mặc định |
| [ai-platform#R2](./modules/ai-platform.md) | ai-platform | Chuỗi có thể vượt `server.setTimeout` 300 s |
| [ai-platform#R3](./modules/ai-platform.md) | ai-platform | Lượt kiểm tra model đầu tiên không có trần chờ |
| [ai-platform#R4](./modules/ai-platform.md) | ai-platform | Bể model và cầu dao sống trong RAM từng tiến trình |
| [ai-platform#R5](./modules/ai-platform.md) | ai-platform | `ai_calls` không có cơ chế dọn và giữ dữ liệu cá nhân vô thời hạn |
| [platform-operations#R2](./modules/platform-operations.md) | platform-operations | `PUT /api/admin/queue/config/:queueName` nhận tên hàng đợi tuỳ ý, `serial` không kiểm kiểu, body thiếu trường bị đặt lại mặc định |
| [platform-operations#R3](./modules/platform-operations.md) | platform-operations | Việc còn |
| [platform-operations#R4](./modules/platform-operations.md) | platform-operations | Trường hợp xấu nhất của chuỗi dự phòng vượt qua `server.setTimeout` và `STUCK_AFTER_MS` |
| [platform-operations#R6](./modules/platform-operations.md) | platform-operations | Cron `ai.healthcheck` chạy ở mọi tiến trình, kể cả vai `api` |

### 🟢 Thấp (61)

| Mã | Module | Rủi ro |
|---|---|---|
| [auth#R4](./modules/auth.md) | auth | Giới hạn 72 tính theo ký tự, bcrypt cắt theo 72 byte |
| [auth#R5](./modules/auth.md) | auth | Thời hạn cookie cố định, không theo biến môi trường JWT |
| [auth#R7](./modules/auth.md) | auth | Hai lượt đăng nhập Google đầu tiên đồng thời có thể trả 409 chung |
| [auth#R9](./modules/auth.md) | auth | Thông điệp validation tuỳ biến bị lặp nhãn trường |
| [auth#R10](./modules/auth.md) | auth | Logout FE người dùng không xoá cache React Query |
| [auth#R11](./modules/auth.md) | auth | FE nuốt lý do lỗi Google |
| [profile#R2](./modules/profile.md) | profile | `save` gồm hai lệnh ghi rời, không transaction |
| [profile#R3](./modules/profile.md) | profile | Khối JSON không kiểm hình dạng |
| [profile#R4](./modules/profile.md) | profile | Lưu bất kỳ trường nào cũng xếp đối chiếu kỹ năng |
| [cv-import#R3](./modules/cv-import.md) | cv-import | Ghi Storage trước khi tạo bản ghi DB |
| [cv-import#R4](./modules/cv-import.md) | cv-import | `finish`/`fail` ghi theo `id` không điều kiện |
| [cv-import#R5](./modules/cv-import.md) | cv-import | Gộp danh sách ở FE có thể vượt trần 60 mục của DTO |
| [cv-import#R6](./modules/cv-import.md) | cv-import | Phản hồi `apply` không đồng dạng với các route khác |
| [jobs#R3](./modules/jobs.md) | jobs | Nhãn sắp xếp "Điểm AI Match" không phải điểm AI |
| [jobs#R4](./modules/jobs.md) | jobs | Tên portal "timviec" chưa có trong bảng tên hiển thị FE |
| [jobs#R5](./modules/jobs.md) | jobs | Backfill taxonomy chạy đồng bộ trong một HTTP request, không transaction |
| [job-scraping#R4](./modules/job-scraping.md) | job-scraping | Ghi kết quả cuối lượt không có điều kiện trạng thái |
| [job-scraping#R5](./modules/job-scraping.md) | job-scraping | Thông điệp "Quét ngay" trỏ tới endpoint không tồn tại; phụ đề FE cứng giờ cron |
| [job-scraping#R6](./modules/job-scraping.md) | job-scraping | `jobsNew` đếm cả tin sau đó bị bỏ hoặc gộp |
| [matching#R7](./modules/matching.md) | matching | Stream thua giành chỗ trả `done` với bản ghi RUNNING |
| [matching#R8](./modules/matching.md) | matching | FE admin diễn giải sai `deferred` |
| [matching#R9](./modules/matching.md) | matching | Giá trị mặc định cấu hình bị lặp trong `AiShortlistService` |
| [matching#R10](./modules/matching.md) | matching | Thiếu e2e cho route quản trị và tin không tồn tại |
| [matching#R11](./modules/matching.md) | matching | Schema `skill.canonicalize` chưa theo khuôn "cắt" của ADR 0017 |
| [applications#R1](./modules/applications.md) | applications | `skipDocuments` không có validator kiểu |
| [applications#R2](./modules/applications.md) | applications | `transitions.ts` không ràng buộc chuyển trạng thái; comment schema lệch với enum |
| [applications#R4](./modules/applications.md) | applications | Nhật ký `ApplicationEvent` chỉ ghi, không có đường đọc |
| [applications#R5](./modules/applications.md) | applications | `appliedAt` không bị xoá khi lùi trạng thái |
| [documents#R5](./modules/documents.md) | documents | Stream của Mail ứng tuyển trả bản ghi FAILED kèm `error` thô |
| [documents#R7](./modules/documents.md) | documents | Mã HTTP không nhất quán giữa ba route tạo khi tin không tồn tại; lỗi hạ tầng PDF trả 422 |
| [documents#R8](./modules/documents.md) | documents | Di sản trong schema: `FORM_ANSWER`, `agentRunId` |
| [interview-prep#R1](./modules/interview-prep.md) | interview-prep | Trong lúc soạn lại (hoặc sau khi soạn lại hỏng), người dùng không luyện được bộ đề cũ dù nội dung vẫn hiển thị |
| [interview-prep#R2](./modules/interview-prep.md) | interview-prep | Cache `promptHash` gần như không bao giờ được dùng |
| [interview-prep#R3](./modules/interview-prep.md) | interview-prep | Backend cho soạn bộ đề cho BẤT KỲ tin nào, không riêng tin người dùng đã lưu/ứng tuyển |
| [question-bank#R1](./modules/question-bank.md) | question-bank | Hai người mở cùng một câu chưa có đáp án cùng lúc thì model bị gọi hai lần |
| [question-bank#R5](./modules/question-bank.md) | question-bank | Xem lại đáp án đã cache vẫn phải đi qua `POST` có throttle AI |
| [mock-interview#R3](./modules/mock-interview.md) | mock-interview | `finishedAt` và `modelId` của buổi luyện không bao giờ được ghi trên luồng thường |
| [mock-interview#R6](./modules/mock-interview.md) | mock-interview | Cột/quan hệ không dùng tới trên `AgentRun` |
| [upskill#R4](./modules/upskill.md) | upskill | Không chặn hai lượt phân tích song song của cùng người dùng |
| [upskill#R5](./modules/upskill.md) | upskill | Giới hạn 3 kỹ năng đang học là đếm-rồi-ghi, không nguyên tử |
| [upskill#R6](./modules/upskill.md) | upskill | Reconcile và giành chỗ tính kẹt theo `createdAt` |
| [upskill#R7](./modules/upskill.md) | upskill | Sự kiện `done` của stream trả hình dạng khác `GET /upskill/:id` |
| [company-research#R4](./modules/company-research.md) | company-research | Lệch giữa chú thích schema/tài liệu và code |
| [company-research#R5](./modules/company-research.md) | company-research | Sự kiện `done` của route stream có hai hình dạng |
| [company-research#R6](./modules/company-research.md) | company-research | Thông báo lỗi FE che mất câu 409 của server |
| [company-research#R7](./modules/company-research.md) | company-research | Không ghi người kích hoạt vào `ai_calls` |
| [salary#R3](./modules/salary.md) | salary | Nguồn bị ghi cứng, chi tiết đọc theo slug không kèm nguồn |
| [salary#R4](./modules/salary.md) | salary | Khung đàm phán đọc toàn bộ bảng lương mỗi lần mở chi tiết tin |
| [salary#R5](./modules/salary.md) | salary | Nạp dữ liệu không nguyên tử và không có công cụ vận hành |
| [dashboard#R1](./modules/dashboard.md) | dashboard | Một phần lớn payload không có màn hình nào dùng |
| [dashboard#R2](./modules/dashboard.md) | dashboard | Mỗi lần mở Tổng quan chạy lại toàn bộ phép tính khoảng trống kỹ năng |
| [dashboard#R3](./modules/dashboard.md) | dashboard | Hai danh sách "mới nhất" xử lý `evaluatedAt = null` khác nhau |
| [admin-console#R3](./modules/admin-console.md) | admin-console | Ghi chú của "Quét ngay" trỏ tới route không tồn tại, và lượt quét do admin bấm bị xếp chung nhóm với lượt cron |
| [admin-console#R5](./modules/admin-console.md) | admin-console | DTO thiếu ràng buộc theo quy ước dự án |
| [admin-console#R6](./modules/admin-console.md) | admin-console | Thống kê bị cắt ngầm khi vượt trần dòng |
| [ai-platform#R6](./modules/ai-platform.md) | ai-platform | Cấu hình model đọc `process.env` ngoài `configuration.ts` |
| [ai-platform#R7](./modules/ai-platform.md) | ai-platform | Nạp lại skill chỉ tác động tiến trình nhận request, và có khoảng trống giữa chừng |
| [ai-platform#R8](./modules/ai-platform.md) | ai-platform | Lệch tài liệu `.env.example` về ánh xạ biến/hàng đợi |
| [platform-operations#R5](./modules/platform-operations.md) | platform-operations | `/api/health` không kiểm database hay hàng đợi |
| [platform-operations#R7](./modules/platform-operations.md) | platform-operations | Thử lại của pg-boss dựa hoàn toàn vào mặc định thư viện |
| [platform-operations#R8](./modules/platform-operations.md) | platform-operations | Cờ "lượt trước còn chạy" của cron chỉ nằm trong bộ nhớ một tiến trình |

### ✅ Đã sửa (16)

| Mã | Module | Rủi ro |
|---|---|---|
| [profile#R1](./modules/profile.md) | profile | `subOccupationCode` không được kiểm và có thể lệch với `occupationCode` |
| [jobs#R1](./modules/jobs.md) | jobs | Bộ lọc "lương tối thiểu" và sắp xếp "Lương cao nhất" không có dữ liệu để chạy |
| [job-scraping#R1](./modules/job-scraping.md) | job-scraping | Không có lương dạng số từ bất kỳ portal nào |
| [matching#R1](./modules/matching.md) | matching | "Đối chiếu lại" sau khi admin sửa tay danh bạ không tính lại các cặp đã lưu |
| [applications#R6](./modules/applications.md) | applications | Nút CV ở Lịch sử ứng tuyển hiện tiêu đề rỗng và in PDF bằng LaTeX |
| [documents#R1](./modules/documents.md) | documents | Khoá Storage `.tex` không gắn với tài liệu: nhiều tài liệu dùng chung một file |
| [documents#R2](./modules/documents.md) | documents | PDF LaTeX (mặc định) bỏ qua mẫu, bố cục, mục ẩn; một số màn vẫn dùng LaTeX cho CV |
| [documents#R6](./modules/documents.md) | documents | Lưu CV và lưu mẫu không nguyên tử |
| [mock-interview#R4](./modules/mock-interview.md) | mock-interview | Không có trần số lượt; mỗi lượt gửi lại TOÀN BỘ lịch sử |
| [mock-interview#R5](./modules/mock-interview.md) | mock-interview | FE bỏ mất thông điệp lỗi tiếng Việt của server trên route stream |
| [mock-interview#R7](./modules/mock-interview.md) | mock-interview | Model gửi lời tổng kết qua `ask_user`, buổi `DONE` mà `result.text` rỗng |
| [upskill#R1](./modules/upskill.md) | upskill | Stream hỏng thì FE tự tạo báo cáo thứ hai và chạy AI lần nữa |
| [company-research#R1](./modules/company-research.md) | company-research | FE tự xếp thêm một lượt dựng mỗi khi stream lỗi |
| [admin-console#R1](./modules/admin-console.md) | admin-console | Giao diện báo "Worker nhận giá trị mới trong vòng 30 giây" nhưng worker chỉ nhận sau khi khởi động lại |
| [ai-platform#R1](./modules/ai-platform.md) | ai-platform | Lỗi sai schema đi tiếp chuỗi dự phòng, trái với bất biến đã ghi |
| [platform-operations#R1](./modules/platform-operations.md) | platform-operations | FE báo "Worker nhận giá trị mới trong vòng 30 giây" nhưng backend chỉ áp concurrency khi khởi động lại |

[//]: # (/GEN:RISKS)

## 4. Thứ tự ưu tiên khắc phục đề xuất

| Ưu tiên | Rủi ro | Lý do xếp trước |
|---|---|---|
| 1 | [salary#R1](./modules/salary.md), [question-bank#R2](./modules/question-bank.md) — dữ liệu x-interview | Đã làm phương án (a) *(2026-10-19)*; còn API `@Public` và HTML server-render. Cần khoá hẳn hoặc rút về `INTERNAL` trước khi thương mại hoá ([ADR 0006](../adr/0006-dieu-khoan-portal.md)) |
| 2 | Nhóm 🟡 bảo mật phiên: [auth#R1, R2, R3, R6](./modules/auth.md) | Cần trước khi có người dùng thật ngoài demo |
| 3 | Nhóm 🟡 race kiểm-rồi-tạo: [mock-interview#R1](./modules/mock-interview.md), [admin-console#R2](./modules/admin-console.md), [upskill#R5](./modules/upskill.md) | Đổi sang giành chỗ có điều kiện theo mẫu BR-SYS-09 |

Các mục 🟢 còn lại là nợ kỹ thuật nhỏ, xử lý khi chạm vào vùng code tương ứng.

*(2026-10-19)* Đã sửa 8 vấn đề gốc mức 🟠 (10 mục rủi ro, gồm `company-research#R1` 🟡 cùng gốc với `upskill#R1`): xem bảng "✅ Đã sửa" ở §3.

## Source References

Mọi file trong [modules/](./modules/) (§7, §17) · [CLAUDE.md](../../CLAUDE.md) · [common/](../../server/src/common) · [docs/adr/](../adr/README.md)
