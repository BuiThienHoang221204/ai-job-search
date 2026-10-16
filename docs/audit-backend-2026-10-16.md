# Khảo sát backend `server/src` — 2026-10-16

Khảo sát chỉ đọc, đối chiếu với `CLAUDE.md` và `docs/research-backend-best-practices.md`. Mỗi phát hiện có vị trí, kịch bản hỏng và cách sửa. Cột **Trạng thái** cập nhật khi sửa xong. Đợt sửa 2026-10-16 (top 10): unit 1.574/1.574, e2e 351/351.

Kết luận chung: **không có lỗ IDOR** (mọi truy vấn dữ liệu người dùng khoá theo `userId`, route admin có `@Roles('ADMIN')`, không SQL raw ghép chuỗi, chặn SSRF chắc). Rủi ro thật nằm ở **race condition trên các route stream** và **tài nguyên không trần** (render PDF, `fetch` không timeout, quét cả kho).

## Top 10 cần sửa trước

| # | Vấn đề | Trạng thái |
|---|---|---|
| 1 | Bỏ/vá `onAbandon` của upskill và profile-draft; `start()` giành chỗ có điều kiện — hiện có thể ghi FAILED đè kết quả DONE | **Đã sửa 2026-10-16** — gỡ `onAbandon`; `start()`/synthesizer giành chỗ có điều kiện |
| 2 | `DocumentGenerator.claim` giành chỗ có điều kiện — `generate-stream` có thể đè CV người dùng đã sửa tay | **Đã sửa 2026-10-16** — `updateMany` có điều kiện, bản DONE trả 409 |
| 3 | Mock interview `turn`: giành chỗ `WAITING_USER → RUNNING`, kiểm trước `flushHeaders` | **Đã sửa 2026-10-16** — `stream()` giành `WAITING_USER → RUNNING`, `finally` trả lượt; controller chỉ gửi header ở mảnh đầu |
| 4 | `skill-dictionary.persist`: transaction + bắt P2002 — canonical mồ côi, lô đứt giữa chừng | **Đã sửa 2026-10-16** — `$transaction` + bỏ qua P2002, lô ghi tiếp |
| 5 | `GET /documents/:id/pdf`: throttle riêng + trần chạy song song | **Đã sửa 2026-10-16** — `ThrottlePdf` 10/phút. Hàng chờ giới hạn lượt in song song đã thử rồi bỏ khi rút gọn: chưa cần ở quy mô hiện tại |
| 6 | Timeout cho hai `fetch` trong `model-catalog.service.ts` | **Đã sửa 2026-10-16** — `AbortSignal.timeout(10_000)` |
| 7 | `ScrapeRun` vào `ReconcileService` + giành chỗ trong `ScraperService.run` | **Đã sửa 2026-10-16** — reconcile 6 bảng (RUNNING >2h theo `startedAt`, PENDING >12h theo `createdAt`) + giành chỗ trong `run()` |
| 8 | `streamNdjson` ghi sự kiện lỗi cho `HttpException`; filter toàn cục đổi lỗi AI đồng bộ thành 502/503/504 kèm `failureKind` | **Đã sửa 2026-10-16** — sự kiện `error` kèm `statusCode` (HTTP vẫn 201); `AllExceptionsFilter` đổi lỗi AI thành 502/503/504 kèm `failureKind` |
| 9 | `requirement-match.scoreUser`: `select`, lọc kho tin, chia lô — bom chậm theo kích thước kho | **Đã sửa 2026-10-16** (một phần) — bỏ tin trùng + `skipDuplicates`. Không chia lô: kho ~3.500 tin, còn xa ngưỡng ~30.000; làm khi gần tới |
| 10 | `express.json` limit khớp trần DTO. (`logout` tăng `tokenVersion`: **không làm** — chủ dự án quyết 2026-10-16, đăng xuất chỉ áp cho máy hiện tại) | **Đã sửa 2026-10-16** — `limit: 1mb` cho json/urlencoded, quá trần 413, JSON hỏng 400 |

## 1. IDOR/BOLA và quyền truy cập

| Mức | Vị trí | Kịch bản | Sửa | Trạng thái |
|---|---|---|---|---|
| Thấp | `companies/company.controller.ts` (`GET brief/by-job/:jobId`, `@Public()`) + `company.service.ts:77-86` | Trả nguyên dòng `companyBrief` (kể cả `modelId` nội bộ) cho khách | `select` bỏ `modelId` hoặc view công khai riêng | **Đã sửa 2026-10-16** |

Đã kiểm, ổn: documents, applications, interview/answers, mock-interview, profile-drafts, upskill/learning, matching, jobs, dashboard đều `findFirst {id, userId}` hoặc khoá ghép có `userId` trước khi `update {id}`; 5 controller admin + `skills.controller` có `@Roles('ADMIN')` cấp class; các route `@Public()` không lộ dữ liệu người khác.

## 2. Race condition

Gốc chung của nhiều mục: `common/ndjson.ts:42-53` — client ngắt thì `onAbandon` xếp việc vào hàng đợi, nhưng vòng `for await` của stream **vẫn chạy tới cuối**, nên cùng một việc chạy hai lần. Mẫu chuẩn để chép: `MatchingService.claim`/`markPending` (`matching.service.ts:237-336`).

| Mức | Vị trí | Kịch bản | Sửa | Trạng thái |
|---|---|---|---|---|
| Cao | `upskill/upskill.controller.ts:87-91` + `upskill.service.ts:143-156` (`start()` update vô điều kiện) | Đóng tab → stream ghi DONE, worker chạy lại đè RUNNING, tốn 2 lượt model; lượt lại hỏng thì FAILED đè báo cáo tốt | Bỏ `onAbandon`, hoặc `start()` giành chỗ `updateMany where status in [PENDING, FAILED]` | **Đã sửa 2026-10-16** |
| Cao | `profile-sources/profile-draft.controller.ts:157` + `profile-draft.service.ts:99-110` (`requeue`) + `profile-synthesizer.service.ts:66-79` | `requeue` lật RUNNING → PENDING khi stream còn chạy; worker đè `proposal`, có thể FAILED đè DONE | Như trên; `requeue` không lật RUNNING | **Đã sửa 2026-10-16** |
| Cao | `documents/services/document-generator.service.ts:49-62` (`claim`) + `POST :id/generate-stream` | Gọi lại trên CV đã DONE và đã sửa tay → ghi đè `content`; bấm 2 lần → 2 lượt model song song | `updateMany where status in [PENDING, FAILED]` (+ RUNNING quá `STUCK_AFTER_MS`), `count===0` → 409 | **Đã sửa 2026-10-16** |
| Cao | `mock-interview/service/interview-turn.service.ts:145-160` + `:268-300` | Gửi câu trả lời 2 lần: cả hai qua kiểm, 2 lượt `streamText`; lượt sau dính P2002 trên `@@unique([runId,index])` | Giành chỗ `updateMany where status=WAITING_USER → RUNNING`, `catch` trả lại | **Đã sửa 2026-10-16** |
| Cao | `matching/ai/services/skill-dictionary.service.ts:112-125, 201-247` | Hai worker cùng tạo kỹ năng → `canonical_skills` mồ côi, `skillAlias.create` P2002 đứt lô | Gói `insertCanonical` + `skillAlias.create` vào `$transaction`, bắt `isUniqueViolation` → `continue` | **Đã sửa 2026-10-16** |
| TB | `reconcile/services/reconcile.service.ts:88-113` | `ScrapeRun` có `status MatchStatus` nhưng không có trong reconcile (trái CLAUDE.md) | Thêm `scrapeRun.updateMany` theo `createdAt` (~2 giờ), cập nhật spec | **Đã sửa 2026-10-16** |
| TB | `scraper/services/scraper.service.ts:63-72` | `run()` luôn ghi RUNNING và quét lại; job giao lại → quét trùng | Giành chỗ `updateMany where status=PENDING` | **Đã sửa 2026-10-16** |
| TB | `interview-turn.service.ts:41-68` (`openStream`) | `streamText` ném sau `create` → run RUNNING, chặn mở buổi mới 10 phút | try/catch ghi FAILED | **Đã sửa 2026-10-16** — `failRun` ghi FAILED |
| TB | `interview/interview.service.ts:81-93, 171-175` | Khoá dedup `cache`/`force` khác nhau → "Soạn lại" chạy song song | Khoá chỉ `userId:jobId` | **Đã sửa 2026-10-16** |
| Thấp | `companies/company.controller.ts:86-92` | `onAbandon` tốn gấp đôi Serper + model | Bỏ `onAbandon` | **Đã sửa 2026-10-16** — gỡ `onAbandon` |
| Thấp | `matching/rules/services/requirement-match.service.ts:110-115` | `deleteMany` + `createMany` song song → P2002, rollback cả lô | `skipDuplicates: true` | **Đã sửa 2026-10-16** |
| Thấp | `applications/applications.service.ts:217-250` | Đổi trạng thái đồng thời làm `fromStatus` sai | `updateMany where status cũ`, `count===0` → 409 | **Đã sửa 2026-10-16** |

## 3. Giới hạn tần suất và tài nguyên

| Mức | Vị trí | Kịch bản | Sửa | Trạng thái |
|---|---|---|---|---|
| Cao | `documents/documents.controller.ts:138` `GET :id/pdf` | Mỗi request compile lại LaTeX/Chromium, không cache, không throttle riêng; vài chục request song song làm hết RAM | `@Throttle` 10/phút + trần chạy song song 2–3 | **Đã sửa 2026-10-16** (chỉ throttle) |
| TB | `ai/services/model-catalog.service.ts:135, 161` | `fetch` không `signal` → treo ~300s, phá thứ tự timeout | `AbortSignal.timeout(10_000)` | **Đã sửa 2026-10-16** |
| TB | `companies/company.controller.ts:48-93` (`force=true`) | Bỏ qua TTL trên bản dùng chung | Từ chối `force` khi `updatedAt` < ~60 phút | **Đã sửa 2026-10-16** |
| TB | `applications/applications.controller.ts:42` | Xếp 2 việc `GENERATE_DOCUMENT` nhưng không `@ThrottleAi()` | Gắn `@ThrottleAi()` | **Đã sửa 2026-10-16** |
| Thấp | `common/throttle.ts:6` | `ThrottleAi` chỉ cửa sổ 1 phút | Thêm throttler theo giờ | **Không làm** — đã có 10 lượt/phút; thêm tầng theo giờ khi thấy lạm dụng thật |
| Thấp | `bootstrap.ts:19` `express.json` | Trần 100kb thấp hơn trần DTO → 413 trước `ValidationPipe` | `limit: '512kb'` + e2e | **Đã sửa 2026-10-16** |
| Thấp | `salary/salary.service.ts:104-121`, `common/dto/pagination.dto.ts:17-21` | `findMany` không `take`; `offset` không `@Max` | `take`, `@Max` | **Đã sửa 2026-10-16** |

## 4. N+1 và hiệu năng

| Mức | Vị trí | Kịch bản | Sửa | Trạng thái |
|---|---|---|---|---|
| TB | `matching/rules/services/requirement-match.service.ts:33-37, 56-62, 87-95` | `scoreUser` nạp toàn bộ `JobRequirement` DONE, không `select`, không lọc → chạm trần 65.535 bind param khi kho ~30k tin | `select` gọn, lọc `duplicateOfId: null` + tuổi tin, chia lô | **Đã sửa 2026-10-16** (một phần, xem top 10 #9) |
| Thấp | `dashboard/dashboard.service.ts:202, 220` | Chờ tuần tự sau `Promise.all` | Gộp vào `Promise.all` | **Đã sửa 2026-10-16** |
| Thấp | `applications.service.ts:40-43, 205-208, 271-280` | Kéo `description`/`content` thừa, đếm trong JS | `select` gọn, `groupBy` | **Đã sửa 2026-10-16** |
| Thấp | `interview/interview.service.ts:303-306`, `jobs/jobs.service.ts:70-75` | Kéo cột Text lớn trong danh sách | `select` | **Đã sửa 2026-10-16** (một phần) — interview chỉ lấy `questionKey`; `jobs.service` giữ nguyên vì `withSystemMatch` cần đủ `JobRequirement` |
| Thấp | `admin/services/admin.service.ts:295` | `findFirst` mỗi nhóm lỗi | Gộp một truy vấn | **Đã sửa 2026-10-16** |
| Thấp | `schema.prisma` `ScrapeRun` | Thiếu index `[portal, createdAt]` | Thêm index | **Đã sửa 2026-10-16** — migration `20261016100000_scrape_run_portal_index` |

## 5. Xử lý lỗi và hình dạng phản hồi

Hiện trạng: chỉ có `PrismaExceptionFilter` (P2002 → 409, P2025 → 404, P2003 → 400). `Error` thường thành 500 tiếng Anh, không lộ stack.

| Mức | Vị trí | Kịch bản | Sửa | Trạng thái |
|---|---|---|---|---|
| TB | `mock-interview/mock-interview.controller.ts:106-118` (`turn`) | `flushHeaders()` trước khi kiểm 404/400 → client nhận 200 rồi bị `destroy()` | Chép mẫu `open()`: `if (!response.headersSent) throw error` | **Đã sửa 2026-10-16** |
| TB | `common/ndjson.ts:30-33` + generator ném `HttpException` trước `try` | 404/400 thành 200 rồi `destroy()` | `catch` của `streamNdjson`: `HttpException` → ghi `streamFailureEvent` rồi `end()` | **Đã sửa 2026-10-16** |
| TB | `interview-answers.service.ts:117`, `question-bank.service.ts:138`, `job-from-url.service.ts:41` | `generateObject` đồng bộ không `catch` → 500 tiếng Anh | Filter toàn cục: `classifyFailure` → 503/504/502 kèm `{message, failureKind}` | **Đã sửa 2026-10-16** — `AllExceptionsFilter` |
| Thấp | `app.module.ts:35-44`, `jwt-auth.guard.ts`, `prisma-exception.filter.ts:41` | Thông báo 429/401 tiếng Anh | `errorMessage` cho throttler, override `handleRequest` | **Đã sửa 2026-10-16** — 429/401 tiếng Việt; `prisma-exception.filter.ts:41` chưa đổi |
| Thấp | `common/web/http-get.ts:98` → `job-from-url.service.ts:66-68` | Lộ nguyên văn lỗi curl (có IP) cho client | Câu chung, chi tiết vào log | **Đã sửa 2026-10-16** |
| Thấp | `documents.controller.ts:79`, `skills.controller.ts:19`, `salary` | Hình dạng danh sách không đồng nhất | Thống nhất `{items}`/`pageOf` | **Để lại** — đổi hình dạng phản hồi làm vỡ FE đang đọc; làm cùng lúc với FE khi thống nhất `Page<T>` |

## 6. Bảo mật khác

| Mức | Vị trí | Kịch bản | Sửa | Trạng thái |
|---|---|---|---|---|
| TB | `auth/auth.controller.ts:82-88` (`logout`) | Chỉ xoá cookie; refresh token lộ vẫn dùng được 7 ngày | Không tăng `tokenVersion` (sẽ đăng xuất mọi máy). Muốn thu hồi đúng một máy thì cần bảng phiên/refresh token theo thiết bị — để sau | **Không làm** — chủ dự án quyết 2026-10-16: đăng xuất chỉ áp cho máy hiện tại |
| Thấp | `profile/profile.dto.ts` (`QuickStartProfileDto`) | `occupationCode` chỉ `@IsString` | `@IsIn` mã taxonomy | **Đã sửa 2026-10-16** |
| Thấp | `profile-draft.service.ts:46` | Hai lần tải `CV.pdf` ghi đè cùng khoá storage | Thêm `draft.id` vào khoá | **Đã sửa 2026-10-16** |
| Thấp | `ai/services/ai.service.ts` (`logSchemaFailure`) | In phản hồi model (có thể chứa PII từ CV) ra stdout | Che PII hoặc chỉ log `issues` | **Đã sửa 2026-10-16** |
| Thấp | `auth.controller.ts` (`issue`) | Access token vừa trong cookie vừa trong body | Bỏ khỏi body nếu FE không dùng | **Đã sửa 2026-10-16** — body chỉ còn `user`; e2e lấy token từ cookie |

Đã kiểm, ổn: raw SQL tham số hoá; SSRF ghim DNS bằng `--resolve`; `escapeLatex` + `-no-shell-escape`; `escapeHtml` + CSP sandbox; `ValidationPipe` whitelist + `forbidNonWhitelisted`; cookie httpOnly/lax/secure; CORS một origin; helmet; Swagger tắt ở production.

## 7. Cấu trúc

| Mức | Vị trí | Vấn đề | Sửa | Trạng thái |
|---|---|---|---|---|
| TB | `common/model-env.ts:1`, `common/stream-event.ts:1` | `common/` import ngược `modules/ai` | Đưa lên `common/`, thêm luật lint | **Đã sửa 2026-10-16** |
| TB | `modules/ai/utils/failure-view` (8 module), `fast-model-scheduler` (6 module) | Hàm dùng chung nằm trong module khác | Chuyển lên `common/` | **Đã sửa 2026-10-16** — `failure-kind`, `failure-view`, `estimateTokens` lên `common/ai/`; `pickStart` ở lại `modules/ai` vì đọc bảng provider |
| Thấp | `question-bank.utils.ts`, `salary/utils/salary-view.ts`, hai DTO | Hai bản `OCCUPATION_NAMES`/`OCCUPATION_CODES` | Export một bản từ `jobs/taxonomy/occupations.ts` | **Đã sửa 2026-10-16** |
| Thấp | `admin/utils/overview.ts:119`, `matching/rules/requirement-match.ts:128`, `matching.processor.ts:~74-78` | Ternary lồng | `if`/bảng tra | **Đã sửa 2026-10-16** |
| Thấp | `dashboard.service.ts:106`, `scraper/utils/collect-cards.ts:76-78` | `flatMap` lọc-map | `filter` + `map` | **Đã sửa 2026-10-16** |
| Thấp | `interview.service.ts:120`, `skills/services/prompt-builder.service.ts`, `ai.service.ts:436-446` | Hàm nhiều dòng lồng trong hàm | Đưa lên cấp module | **Đã sửa 2026-10-16** |
| Thấp | `auth/auth.service.ts:120`, `sandbox/docker.sandbox.ts:135` | Comment `//` trong thân hàm | Xoá | **Đã sửa 2026-10-16** |
| Thấp | `admin.service.ts:224-375` | `overview` ~150 dòng làm cả định dạng | Tách `buildOverview` sang utils | **Đã sửa 2026-10-16** |

## Phát sinh trong lúc sửa

| Mức | Vị trí | Vấn đề | Trạng thái |
|---|---|---|---|
| TB | `test/support/app-harness.ts`, `modules/storage` | e2e ghi file thật lên R2 (bản giả `LocalStorage` ghi trong CLAUDE.md không còn tồn tại) | **Đã sửa 2026-10-16** — `src/testing/fake-storage.ts`, harness override `STORAGE` |

## Bước 4 — hạ tầng chung (2026-10-16)

| Việc | Trạng thái |
|---|---|
| Thứ tự tắt: Prisma ngắt sau khi HTTP đóng, hàng đợi dừng trước | **Đã sửa** — `PrismaService.onApplicationShutdown`, `QueueService.beforeApplicationShutdown` |
| Pool kết nối chờ vô hạn | **Đã sửa** — `connectionTimeoutMillis: 10_000` trong `prisma.service.ts` |
| Biến môi trường số sai thành `NaN` im lặng | **Đã sửa** — `int()` trong `configuration.ts` ném lỗi, app không khởi động |
| Request id + log JSON | **Đã sửa** — header `x-request-id` (giữ id hợp lệ của client), có trong log và thân lỗi 5xx; production dùng `ConsoleLogger({ json: true })` |
| Kiểm `Origin` trên request ghi (chống CSRF) | **Không làm** — cookie `SameSite=Lax` đã chặn request khác site; admin đi qua rewrite gửi `Origin` của domain admin, bật kiểm mà thiếu cấu hình là admin mất quyền ghi. Làm khi có subdomain không tin cậy |
| Kiểm biến môi trường bằng zod, ràng buộc thứ tự timeout | **Không làm** — `int()` ném lỗi đã chặn đúng lỗi thật (NaN); thêm khi có biến khác gây sự cố |
