# Xây và nuôi lớn một backend NestJS + Prisma mà vẫn đơn giản, đúng và dễ bảo trì

Nghiên cứu ngày 2026-10-16 cho `server/` (NestJS **11.1.28**, `@nestjs/config` **4.0.4**, Prisma **7.9**, `@prisma/adapter-pg`, pg-boss **12**, PostgreSQL). Nguồn sơ cấp đặt trước; nguồn "senior" (Fowler, Google AIP, Microsoft, Stripe, Brandur) chỉ dùng ở chỗ tài liệu gốc im lặng.

**Lưu ý phiên bản, quan trọng:** tài liệu đang hiển thị mặc định trên `prisma.io/docs` nay là **Prisma ORM 8**; tài liệu v7 đã dời sang `https://www.prisma.io/docs/orm/v7/...`. Mọi trích dẫn Prisma dưới đây lấy từ nhánh v7 trừ khi ghi rõ. Prisma 8 đổi khá nhiều thứ mà repo đang dựa vào (mã lỗi `P2002`/`P2025` → `error.sqlState`/`RUNTIME.NO_ROWS`; bỏ `isolationLevel`/`timeout`/`maxWait`; bỏ `relationLoadStrategy`) — https://www.prisma.io/docs/orm/coming-from-prisma-orm-7. Tương tự, `docs.nestjs.com` đã nhắc tới v12; repo vẫn ở 11.

Mỗi mục gồm (a) khuyến nghị có nguồn, (b) **Áp dụng cho repo này**: cái đã tốt, cái KHÔNG được đổi (vì CLAUDE.md đã chốt), và gợi ý xếp theo ưu tiên. Những chỗ tôi đề xuất khác CLAUDE.md đều ghi rõ là "khác CLAUDE.md" kèm lý do — thực tế không có chỗ nào cần đi ngược.

---

## 1. Kiến trúc khi hệ thống lớn dần

### (a) Khuyến nghị

- **Chia theo nghiệp vụ (feature module), không chia theo tầng kỹ thuật.** Nest: feature module "organizes the code for a specific feature, which keeps boundaries clear" — https://docs.nestjs.com/modules. Node Best Practices 1.1 "Structure your solution by business components" và 1.2 "Layer your components with 3-tiers, keep the web layer within its boundaries" — https://github.com/goldbergyoni/nodebestpractices#-11-structure-your-solution-by-business-components
- **Chia sẻ provider bằng `exports`, đừng biến mọi thứ thành global.** "Making everything global is not a recommended design practice" — https://docs.nestjs.com/modules. Đăng ký cùng một service ở nhiều module tạo nhiều instance, "Multiple instances increase memory usage and can cause unexpected behavior" — cùng trang.
- **Vòng phụ thuộc là mùi thiết kế, `forwardRef` chỉ là cứu cánh.** "Avoid circular dependencies where possible"; thay thế là refactor hoặc `ModuleRef`; và "The order of instantiation is indeterminate" — https://docs.nestjs.com/fundamentals/circular-dependency
- **Có cần tầng repository bọc Prisma không?** Repository "mediates between the domain and data mapping layers using a collection-like interface"; nó đáng giá khi domain phức tạp hoặc truy vấn lặp lại nhiều — https://martinfowler.com/eaaCatalog/repository.html. Prisma Client tự nó đã là một data mapper có kiểu; bọc thêm một lớp chỉ để "đúng pattern" là thêm một seam có đúng một adapter.
- **Logic thuần nằm ngoài tầng chạm I/O** để test nhanh, không cần DB (unit test "avoid hitting databases… by stubbing those parts") — https://martinfowler.com/articles/practical-test-pyramid.html
- **Cấu hình qua `ConfigModule`, kiểm lúc boot.** `validate()` ném lỗi thì "the application doesn't bootstrap" — https://docs.nestjs.com/techniques/configuration ; Node BP 1.4 "Use environment aware, secure and hierarchical config" — https://github.com/goldbergyoni/nodebestpractices#-14-use-environment-aware-secure-and-hierarchical-config
- **Tách tiến trình khi việc nền làm nghẽn đường phục vụ request.** "The Event Loop should orchestrate client requests, not fulfill them itself" — https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop. Hàng đợi trên Postgres dựa vào `SKIP LOCKED`, "a feature built specifically for message queues" — https://github.com/timgit/pg-boss
- **Hướng phụ thuộc một chiều**: hạ tầng dùng chung (`common/`) không import nghiệp vụ; nghiệp vụ không import ruột của nghiệp vụ khác, chỉ import cái module kia `exports`. Khoá bằng công cụ — dependency-cruiser "validates them against (your own) rules", có sẵn rule `no-circular` — https://github.com/sverweij/dependency-cruiser

### (b) Áp dụng cho repo này

**Đã tốt — giữ nguyên:**
- 23 feature module trong `server/src/modules/`, `common/` chỉ chứa hạ tầng (`guards/`, `filters/`, `pagination.ts`, `web/`, `text/`…). Quy tắc "thứ chỉ một module dùng thì đừng đẩy lên `common/`" (CLAUDE.md) đúng tinh thần Nest docs về không global hoá.
- **Không có `forwardRef` nào** trong `src/` (đã grep). Đây là tài sản đáng canh.
- **Không có tầng repository** — đúng. CLAUDE.md "Service chỉ giữ phần chạm DATABASE" + "Đừng tạo seam mới khi chỉ có một adapter" đã biến service thành repository thực tế. Fowler chỉ khuyên repository khi truy vấn lặp nhiều; ở đây cách gom truy vấn lặp là các hằng `select` dùng chung (`jobs/job-card.select.ts`) — đúng liều.
- Logic thuần ở `utils/` cùng module; ranh giới `matching/ai/` vs `matching/rules/` nằm ngay trên cây thư mục.
- Vai `api` / `worker` / `all` (`src/config/app-role.ts`) với `runsBackgroundWork()`, và `QueueService.work` là chỗ duy nhất thoát sớm cho vai `api` — đúng "một seam mà mọi processor đi qua".
- `PrismaModule` là `@Global()` — ngoại lệ hợp lý (hạ tầng mọi module cần), không phải "everything global".

**Gợi ý (ưu tiên giảm dần):**
1. **Khoá bằng máy các bất biến kiến trúc mà CLAUDE.md đang giữ bằng lời** (dependency-cruiser hoặc `no-restricted-imports` theo `files`):
   - `src/modules/matching/rules/**` KHÔNG được import `@/modules/ai/**` — chính bất biến "Thêm một lời gọi model vào `rules/` là phá bất biến".
   - `src/common/**` KHÔNG được import `src/modules/**`.
   - Cấm vòng (`no-circular`) để giữ con số 0 `forwardRef`.
   - Module A chỉ được import từ module B những file B thật sự export (`*.service.ts`, `*.types.ts`, `*.constants.ts`), không chui vào `utils/` của B. Đếm nhanh hiện có ~24 import `../ai/`, 17 `../queue/`, 8 `../jobs/` — phần lớn là service đã export, hợp lệ; rule sẽ cho biết chỗ nào chui vào ruột (ví dụ `jobs/taxonomy/*` là ngoại lệ CLAUDE.md đã chấp nhận — đưa vào allowlist).
2. **Kiểm cấu hình lúc boot** — xem mục 7.
3. Không cần tách thêm tiến trình: `api`/`worker` đã đủ; tách tiếp chỉ khi đo thấy một loại job (ví dụ quét portal) làm trễ loại khác — lúc đó dùng `localConcurrency` theo hàng đợi trước khi nghĩ tới tiến trình thứ ba.

---

## 2. Quy ước viết code

### (a) Khuyến nghị

- **Validate ở mép, theo danh sách trắng.** `whitelist` loại trường không có decorator; `forbidNonWhitelisted` "instead of stripping… will throw an exception"; `transform` biến payload thành instance DTO và chuyển kiểu nguyên thuỷ — https://docs.nestjs.com/techniques/validation. Không dùng `import type` cho DTO vì kiểu bị xoá lúc chạy — cùng trang.
- **Mass assignment:** "Explicitly allow-list fields", "Prefer dedicated input objects, such as DTOs", "Do not rely on a block-list as the sole protection" — https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html
- **Kim tự tháp test:** nhiều unit test nhỏ nhanh; ít integration test hơn và chạy với phụ thuộc thật vì "going with an in-memory database is risky business"; rất ít end-to-end; "Don't reflect your internal code structure within your unit tests" — https://martinfowler.com/articles/practical-test-pyramid.html. Node BP 4.1 "At the very least, write API (component) testing" — https://github.com/goldbergyoni/nodebestpractices#-41-at-the-very-least-write-api-component-testing
- **Test theo Arrange–Act–Assert, dữ liệu dựng bằng builder** để test chỉ nói điều nó quan tâm (Fowler, cùng bài).
- Hàm nhỏ, tên rõ, comment ít: không có nguồn sơ cấp "chuẩn"; quy ước nội bộ là thứ quyết định — và repo đã có quy ước rõ hơn bất kỳ guideline chung nào.

### (b) Áp dụng cho repo này

**Đã tốt — KHÔNG đổi:**
- `bootstrap.ts`: `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, exceptionFactory: vietnameseValidationError })` — đúng cả ba cờ.
- `ApplyDraftDto = PickType(UpdateProfileDto, APPLICABLE_FIELDS)` — danh sách trắng đúng nghĩa OWASP.
- `PaginationQueryDto` có `@Max(MAX_PAGE_SIZE)` (100).
- Quy ước "mặc định KHÔNG comment", "logic thẳng, không generic/`flatMap` khéo", "DTO ở file riêng", "service chỉ giữ phần chạm DB" (CLAUDE.md 2026-10-06 / 10-14) — chặt hơn mọi guideline công khai tôi tìm được; giữ nguyên.
- Kim tự tháp: unit ở `test/unit/**` phản chiếu `src/**`, e2e trên Postgres thật (`_test`), seam giả (`FakeAi` chạy `schema.parse` thật, `FakeQueue`), stub SDK ném lỗi nếu bị gọi. Đây chính là khuyến nghị "integration test với phụ thuộc thật, cô lập phụ thuộc đắt" của Fowler.

**Gợi ý:**
1. **Test data builder cho e2e.** `test/support/app-harness.ts` đã tự đăng ký user; khi số spec e2e (~30) tăng, một bộ `build.job({...})`, `build.profile({...})` với giá trị mặc định hợp lệ giúp mỗi test chỉ ghi trường nó quan tâm. Chỉ làm khi thấy ≥3 spec tự dựng cùng một kiểu bản ghi (quy tắc "tách khi gọi từ ≥2 nơi" của CLAUDE.md).
2. **Rule lint nhỏ khoá quy ước đang giữ bằng lời**: cấm `$queryRawUnsafe`/`$executeRawUnsafe` ngoài allowlist (mục 4), cấm `@UseGuards(JwtAuthGuard|RolesGuard)` trong controller (CLAUDE.md đã nói "đừng gắn lại") — `no-restricted-syntax` làm được cả hai.

---

## 3. Đúng khi chạy đồng thời

### (a) Khuyến nghị

- **Check-then-act là race.** Thay bằng ràng buộc unique + bắt lỗi trùng. Ngay PostgreSQL cũng cảnh báo: vi phạm unique vẫn có thể xảy ra sau một lần kiểm tồn tại tường minh — https://www.postgresql.org/docs/current/transaction-iso.html. Prisma: `P2002` "Unique constraint failed" — https://www.prisma.io/docs/orm/v7/reference/error-reference
- **Optimistic locking bằng update có điều kiện**: thêm cột `version`, `updateMany` với `id` + version đã đọc, `count === 0` nghĩa là người khác đã đổi → báo xung đột — https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions. Điều kiện trạng thái (`where: { status: 'PENDING' }`) là cùng kỹ thuật.
- **Vì sao `updateMany where status=…` an toàn ở Read Committed:** khi dòng bị transaction khác sửa và commit, "the search condition of the command (the WHERE clause) is re-evaluated" — https://www.postgresql.org/docs/current/transaction-iso.html. Tức là hai worker cùng "claim" thì chỉ một cái được `count = 1`.
- **Repeatable Read / Serializable phải sẵn sàng thử lại** khi gặp SQLSTATE `40001`: "Applications using this level must be prepared to retry transactions" — cùng trang. Prisma v7 báo thành `P2034` và khuyên bọc vòng thử lại — https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
- **Interactive transaction phải ngắn**: mặc định v7 `maxWait` 2000ms, `timeout` 5000ms; "Keep transactions short. Long-running transactions hurt performance and can cause deadlocks"; tránh "network requests and executing slow queries" bên trong — cùng trang. Nested write vốn nguyên tử.
- **Khoá dòng bi quan khi cần:** `SELECT … FOR UPDATE`; `SKIP LOCKED` "can be used to avoid lock contention with multiple consumers accessing a queue-like table" nhưng "not suitable for general purpose work" — https://www.postgresql.org/docs/current/sql-select.html. Prisma không có API cho nó → `$queryRaw` trong transaction.
- **Idempotency key cho POST tốn kém**: client gửi `Idempotency-Key`; server lưu mã + thân phản hồi lần đầu, lần lặp trả lại y như cũ; so tham số và báo lỗi nếu khác; xoá key sau ≥24h; không gửi cho GET/DELETE — https://docs.stripe.com/api/idempotent_requests. Thiết kế chi tiết: bảng `idempotency_keys` unique theo `(user_id, key)`, `locked_at`, request trùng đang chạy nhận **409**, gọi bên ngoài (không rollback được) nằm ngoài transaction cục bộ — https://brandur.org/idempotency-keys. Microsoft: "all service operations (including POST) must be idempotent" — https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md
- **Hàng đợi là at-least-once, không phải exactly-once.** pg-boss có "automatic retries with exponential backoff" và chỉ hứa "guaranteed atomic commits" cho phần trong Postgres, không hứa exactly-once — https://github.com/timgit/pg-boss. Hệ quả: handler phải idempotent. Chính sách `exclusive`: "Only allows 1 job to be queued or active. Can be extended with `singletonKey`" — https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md
- **Outbox chỉ khi phải ghi DB VÀ phát thông điệp ra hệ ngoài một cách nguyên tử**; relay có thể phát trùng nên consumer phải idempotent — https://microservices.io/patterns/data/transactional-outbox.html. Khi hàng đợi nằm CHUNG database, có thể gửi job trong cùng transaction với dữ liệu nghiệp vụ và không cần outbox.

### (b) Áp dụng cho repo này

**Đã tốt — đây là phần mạnh nhất của repo, KHÔNG đổi:**
- `MatchingService.claim` (`modules/matching/ai/services/matching.service.ts`): `updateMany` có điều kiện `status ≠ RUNNING OR updatedAt < stale` rồi rơi sang `create` + `isUniqueViolation` → đúng sách giáo khoa (update có điều kiện + unique làm trọng tài).
- `isUniqueViolation` (`src/prisma/prisma-errors.ts`) thay check-then-create — CLAUDE.md đã chốt.
- `ApplicationsService.setInterviewDate`: `updateMany({ where: { id, userId } })` + kiểm `count` — vừa khoá sở hữu vừa nguyên tử.
- Chỉ 2 chỗ `$transaction(async tx => …)` (admin skills) — CLAUDE.md: "Nested write vốn đã nguyên tử nên phần lớn chỗ không cần `$transaction`". Đúng với Prisma docs.
- Hàng đợi: `exclusive` + `singletonKeyFor` suy từ payload, `batchSize: 1`, không tự xếp lại `FAILED`, `ReconcileService` quét bản ghi `RUNNING` mồ côi. Đây đúng là cách sống chung với at-least-once: khoá dedup + trạng thái trong DB + quét mồ côi.

**Gợi ý:**
1. **Idempotency cho các POST gọi AI — ở mức nhẹ.** `POST /documents/cv`, `/cover-letter`, `/application-email`, `/job-from-url` có `@ThrottleAi()` nhưng không chống bấm-đúp/thử-lại-mạng; khoá hàng đợi `GENERATE_DOCUMENT` là `documentId` nên mỗi request sinh một `Document` mới và một lượt model mới.
   - **Không đi ngược CLAUDE.md**: "`POST /documents/cv` tạo một `Document` MỚI mỗi lần bấm" vẫn giữ. Idempotency key chỉ gộp các lần **gửi lại của CÙNG một lần bấm** (FE sinh UUID khi người dùng bấm, giữ nguyên khi retry), không gộp hai lần bấm.
   - Bản tối giản: bảng `idempotency_keys(userId, key, requestHash, responseRef, createdAt)` unique `(userId, key)`; `create` trước rồi bắt `P2002` (đúng mẫu `isUniqueViolation`); trùng mà bản cũ còn chạy → 409; xong → trả lại `documentId` cũ; dọn sau 24h. Không cần `SERIALIZABLE` vì đây chỉ là bản ghi chặn cửa, việc đắt nằm trong hàng đợi.
   - Rẻ hơn nữa và có thể đủ: FE khoá nút trong lúc chờ. Đo bảng `ai_calls` xem có cặp `document.*` cùng user cách nhau < 5 giây không trước khi xây.
2. **Nếu sau này cần version cho bản sửa CV đồng thời** (hai tab cùng `PUT /documents/:id/cv`): thêm `version Int` + `updateMany({ where: { id, userId, version } })` → 409. Chưa cần cho tới khi có báo lỗi "mất chữ".
3. **Không cần outbox**: pg-boss nằm cùng Postgres; nếu có chỗ "ghi bản ghi rồi `queue.send`" mà bước send hỏng thì bản ghi kẹt `PENDING` — `ReconcileService` đã là lưới cho `RUNNING`; kiểm xem `PENDING` bỏ quên có được quét không (nếu không, đó là một "ngõ cụt" giống ca `ProfileDraft` CLAUDE.md đã ghi).

---

## 4. Bảo mật — OWASP API Security Top 10 (2023) ánh xạ sang Nest

Danh sách 2023: API1 BOLA, API2 Broken Authentication, API3 Broken Object Property Level Authorization, API4 Unrestricted Resource Consumption, API5 BFLA, API6 Unrestricted Access to Sensitive Business Flows, API7 SSRF, API8 Security Misconfiguration, API9 Improper Inventory Management, API10 Unsafe Consumption of APIs — https://api-security.owasp.org/editions/2023/en/0x11-t10

### (a) Khuyến nghị

| Rủi ro | Cách làm trong Nest/Prisma | Nguồn |
|---|---|---|
| API1 BOLA/IDOR | Đưa `userId` vào chính `where` của truy vấn, không đọc rồi so | https://api-security.owasp.org/editions/2023/en/0x11-t10 ; Google: kiểm quyền trước khi kiểm tồn tại, người không có quyền không được phân biệt "có/không tồn tại" — https://google.aip.dev/193 |
| API3 mass assignment + lộ dữ liệu | DTO danh sách trắng; trả về bằng `select` tường minh hoặc response DTO. `ClassSerializerInterceptor` chỉ áp được cho instance class, "A plain JavaScript object… is not serialized correctly" | https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html ; https://docs.nestjs.com/techniques/serialization |
| API4 tiêu thụ tài nguyên | Trần kích thước mọi tham số/payload, rate limit theo thao tác, trần số bản ghi mỗi trang, "Configure spending limits for all service providers" | https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption |
| API5 BFLA | Guard vai trò toàn cục, mặc định đóng | https://docs.nestjs.com/security/rate-limiting (mô hình guard toàn cục); OWASP Top 10 trên |
| API6 luồng nghiệp vụ nhạy cảm | Xác định luồng nào bị lạm dụng thì gây hại, rồi đặt hạn mức riêng | https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows |
| API7 SSRF | Allowlist khi được; kiểm IP SAU khi phân giải DNS; nối thẳng tới IP đã kiểm để chặn DNS rebinding; tắt tự đi theo redirect | https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html |
| Injection | `$queryRaw` tagged template "sends all queries as prepared statements"; các hàm `*Unsafe` "significantly increase the risk"; tham số không thay được tên bảng/cột; đừng bọc input vào `Prisma.raw` | https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries |
| Rate limit | Nhiều throttler có tên; override `getTracker`; sau proxy phải `trust proxy`; storage mặc định trong bộ nhớ, nhiều instance cần storage chung | https://docs.nestjs.com/security/rate-limiting |
| Thân request | `express.json` mặc định `limit: '100kb'`; `strict: true` chỉ nhận object/array | https://expressjs.com/en/resources/middleware/body-parser.html ; Node BP 6.14 https://github.com/goldbergyoni/nodebestpractices#-614-limit-payload-size-using-a-reverse-proxy-or-a-middleware |
| CSRF với cookie httpOnly | SameSite "is useful as a defense-in-depth control but it does not replace a proper CSRF defense"; với API: custom header, Fetch Metadata (`Sec-Fetch-Site`) kèm kiểm `Origin`; "Missing headers and `Origin: null` are not evidence of a same-origin request" | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html |
| Log không PII | Không ghi token, mật khẩu, session id, chuỗi kết nối DB, dữ liệu cá nhân nhạy cảm; email/tên/điện thoại cần xử lý đặc biệt | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html |

### (b) Áp dụng cho repo này

**Đã tốt — KHÔNG đổi:**
- `JwtAuthGuard` + `RolesGuard` + `UserThrottlerGuard` đăng ký `APP_GUARD` trong `common/common.module.ts`; `@Public()` để mở. Mặc định đóng = cách tốt nhất chống BFLA.
- BOLA: quy tắc "truy vấn khoá theo `userId`, để `userId` là tham số bắt buộc" (CLAUDE.md, ví dụ `DocumentsService.generate(userId, documentId)`), controller luôn truyền `user.id` (`applications.controller.ts`).
- Mass assignment: `forbidNonWhitelisted` + `PickType` danh sách trắng.
- Lộ dữ liệu: hằng `select` tường minh (`jobs/job-card.select.ts`, `APPLICATION_JOB`) thay vì trả nguyên entity — tốt hơn `ClassSerializerInterceptor` vì không phụ thuộc instance class và không kéo cột thừa từ DB.
- SSRF: `common/web/public-url.ts` chặn dải riêng/nội bộ IPv4+IPv6 bằng `BlockList`, phân giải trước rồi **ghim địa chỉ** (chặn rebinding) — đúng ba điểm của OWASP.
- Upload: `FileInterceptor` với `limits: { fileSize, files: 1 }` + kiểm `mimetype` (`profile-sources/profile-draft.controller.ts`).
- `helmet`, cookie `httpOnly` + `sameSite: 'lax'` + `secure` ở production (`auth/auth.cookie.ts`), refresh cookie khoá `path` vào `/api/auth/refresh`.
- `express.json({ strict: false })` không đặt `limit` → mặc định 100kb (đủ cho JSON; PDF đi multer riêng).
- `@ThrottleAi()` (10/phút/người), `@ThrottleScrape()` (3/giờ), tracker theo `user:<id>` trước rồi mới IP.
- Iframe CV: `sandbox="allow-same-origin"` không `allow-scripts` + CSP `script-src 'none'` — CLAUDE.md đã lập luận kỹ, giữ nguyên.

**Gợi ý (ưu tiên giảm dần):**
1. **Kiểm `Origin`/`Sec-Fetch-Site` cho method không an toàn (POST/PUT/PATCH/DELETE)** — middleware ~15 dòng trong `common/middleware/`: có `Sec-Fetch-Site` thì chỉ nhận `same-origin`/`same-site`/`none`; không có thì `Origin` phải khớp `corsOrigin`. Lý do cụ thể: `bootstrap.ts` bật `express.urlencoded`, nên một form HTML từ nơi khác gửi được request "đơn giản" không qua preflight CORS; `SameSite=Lax` chặn cookie khi khác *site* nhưng KHÔNG chặn khi cùng site (subdomain khác, ví dụ nếu FE/API nằm chung eTLD+1 với một subdomain kém tin cậy). Đồng thời xem có route nào thật sự cần `urlencoded` không — không thì gỡ.
2. **Cấm `$queryRawUnsafe` trừ allowlist.** Ba chỗ hiện có (`skill-dictionary.service.ts` ×2, `ai-shortlist.service.ts`) đều dùng `$1…$n` nên **an toàn hôm nay**, nhưng hàm `*Unsafe` mở cửa cho người sửa sau nối chuỗi. Chuyển sang `` $queryRaw`…${x}` `` / `Prisma.sql` (cast `::vector` vẫn viết được trong template) rồi thêm rule lint.
3. **Ngân sách AI theo ngày cho mỗi người dùng (API4 "spending limits", API6).** `@ThrottleAi()` 10/phút vẫn cho ~14.400 lượt/ngày một tài khoản. Một trần đếm từ `ai_calls` theo `userId` trong 24h (ví dụ 200 lượt) chặn được tài khoản bị lạm dụng mà không ảnh hưởng người dùng thật. Cần chủ dự án chốt con số.
4. **Throttler storage**: trong bộ nhớ là đúng khi chỉ có MỘT tiến trình `api`. Khi chạy ≥2 bản `api` thì mỗi bản đếm riêng → hạn mức thực nhân lên. Ghi điều kiện này vào CLAUDE.md thay vì làm Redis ngay.
5. **PII trong log**: `RequestLogMiddleware` chỉ ghi `method path status ms` (bỏ query string) — tốt. `PrismaExceptionFilter` ghi `error.meta` (tên ràng buộc/trường, không phải giá trị) — chấp nhận được. Khi thêm log truy vấn chậm (mục 5) thì **không ghi `params`**.

---

## 5. Hiệu năng

### (a) Khuyến nghị

- **N+1:** lấy quan hệ bằng `include`/`select` lồng hoặc `findMany({ where: { id: { in: ids } } })` thay vì truy vấn trong vòng lặp. `relationLoadStrategy: 'join'` (LATERAL JOIN, một truy vấn) vs `'query'` (một truy vấn mỗi bảng) — ở v7 vẫn là **Preview** (`relationJoins`) — https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries. **Prisma 8 bỏ hẳn tuỳ chọn này** — https://www.prisma.io/docs/orm/coming-from-prisma-orm-7
- **Phân trang:** offset "becomes more expensive as the offset grows"; cursor cho tập lớn, cần cột unique + `orderBy` ổn định — https://www.prisma.io/docs/orm/v7/prisma-client/queries/pagination. Google AIP-158: có phân trang ngay từ đầu, `page_size` vượt trần thì ép về trần, token phải opaque và không thay cho kiểm quyền — https://google.aip.dev/158
- **Pool kết nối ở Prisma 7 do driver quyết định:** với `@prisma/adapter-pg`, `max` mặc định **10**, `connectionTimeoutMillis` mặc định **0 (chờ vô hạn)**, `idleTimeoutMillis` **10s** (v6 là 300s) — https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool. Hết pool báo `P2024` — https://www.prisma.io/docs/orm/v7/reference/error-reference
- **Đo truy vấn:** `log: [{ emit: 'event', level: 'query' }]` + `$on('query', e => e.duration)`; chi tiết hơn thì tracing OpenTelemetry — https://www.prisma.io/docs/orm/v7/prisma-client/observability-and-logging/logging. Index: đọc `EXPLAIN (ANALYZE, BUFFERS)` trước khi thêm — https://www.postgresql.org/docs/current/using-explain.html
- **Đừng chặn event loop:** giới hạn kích thước input, cẩn thận `JSON.parse`/regex lồng lượng từ (ReDoS), tránh API đồng bộ (`*Sync`), việc CPU nặng thì chia nhỏ hoặc đẩy ra worker — https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
- **Việc dài → hàng đợi + 202 + tài nguyên trạng thái** (Microsoft LRO: "Return 202-Accepted… return a status monitor", có `retry-after`) — https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md
- **Cache:** chỉ khi đã đo, và luôn kèm khoá vô hiệu hoá rõ ràng (nội dung + phiên bản công thức).

### (b) Áp dụng cho repo này

**Đã tốt — KHÔNG đổi:**
- "Đường ĐỌC không bao giờ gọi AI", cache chấm điểm theo `promptHash`, `FORMULA_VERSION` cho `job_requirement_matches` — đây là cache có khoá vô hiệu hoá đúng nghĩa.
- `select` tường minh ở thẻ tin; `pageArgs` có trần 100.
- Việc AI đi hàng đợi; stream NDJSON cho chỗ người dùng chờ; trần `job.requirements` gộp lô 5 (CLAUDE.md đã đo).
- `ai-shortlist.service.ts` làm phần xếp hạng bằng một truy vấn `row_number() over (partition by …)` thay vì kéo về Node — đúng "đẩy việc tập hợp xuống DB".
- 41 `@@index` trong `schema.prisma`.

**Gợi ý (ưu tiên giảm dần):**
1. **Đặt tham số pool tường minh trong `src/prisma/prisma.service.ts`** — hiện `new PrismaPg({ connectionString })` nhận mặc định v7: chờ kết nối **vô hạn**. Khi pool cạn (một đêm quét + chấm điểm), request HTTP treo tới `server.setTimeout` 5 phút thay vì hỏng nhanh. Đề xuất: `connectionTimeoutMillis: 10_000`, `max` đọc từ env và đặt **khác nhau theo vai** (`api` nhỏ, `worker` theo tổng `localConcurrency`), và cộng cả pool riêng của pg-boss khi so với `max_connections` của Postgres. Thêm `P2024` vào `PrismaExceptionFilter` → 503.
2. **Log truy vấn chậm**: `$on('query')`, chỉ `warn` khi `duration ≥ 500ms`, ghi `e.query` cắt ngắn, **không** ghi `e.params`. Bật bằng env. Đây là "đo trước khi đoán" của CLAUDE.md áp cho SQL.
3. **Đừng bật `relationJoins` preview** — Prisma 8 bỏ nó; nếu gặp N+1 thì sửa bằng `include`/`in` thường.
4. **Phân trang:** giữ offset (`Page<T>` có `total`) cho danh sách theo người dùng (vài trăm bản ghi). Chỉ "Tất cả việc làm" và trang admin là ứng viên keyset khi bảng `jobs` lớn — đo `EXPLAIN ANALYZE` câu `count(*)` + `offset` lớn trước. Nếu đổi, dùng cursor `(scrapedAt, id)` vì đã là thứ tự `newest`.
5. **Event loop:** `pdf-parse`, `JSON.parse` phản hồi model, regex trên mô tả tin là những chỗ CPU; hiện việc nặng (LaTeX, Chromium) đã ở container riêng. Nếu thấy `RequestLogMiddleware` báo `(chậm)` hàng loạt khi worker chạy cùng tiến trình (`APP_ROLE=all`), đó là tín hiệu tách `api`/`worker` trên production chứ không phải tối ưu từng hàm.

---

## 6. Xử lý lỗi và thiết kế phản hồi API

### (a) Khuyến nghị

- **RFC 9457 Problem Details** (thay RFC 7807): `type`, `title`, `status`, `detail`, `instance` + thành viên mở rộng; media type `application/problem+json`; `detail` "should help the client fix the problem", client không nên parse nó; tránh lộ "a stack dump" — https://www.rfc-editor.org/rfc/rfc9457.html
- **Mã lỗi máy đọc được, ổn định như hợp đồng:** Google `ErrorInfo.reason` UPPER_SNAKE_CASE, dữ liệu trong `metadata` để client không phải parse chữ — https://google.aip.dev/193 ; Microsoft: `code` "part of your API contract" — https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md
- **Filter toàn cục:** filter mặc định của Nest trả `{ statusCode, message }` cho `HttpException`, lỗi lạ thành 500 chung; filter bắt-tất-cả dùng `@Catch()` + `HttpAdapterHost`, đăng ký bằng `APP_FILTER` để có DI, và khai TRƯỚC các filter theo loại — https://docs.nestjs.com/exception-filters
- **Phân biệt lỗi vận hành và lỗi lập trình** — Node BP 2.3, xử lý tập trung — 2.4: https://github.com/goldbergyoni/nodebestpractices#-24-handle-errors-centrally-not-within-a-middleware
- **Ngữ nghĩa mã:** 400 cú pháp/validation; 401 chưa xác thực; 403 không có quyền; 404 không thấy (hoặc không được phép biết — AIP-193); 409 xung đột trạng thái/trùng; 422 "syntax… was correct, but it was unable to process the contained instructions" — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/422 ; 429 vượt hạn mức.
- **Phân trang trả token/next** và áp trần (AIP-158 ở trên). **Phiên bản API**: chỉ cần khi có client ngoài không cùng nhịp deploy.

### (b) Áp dụng cho repo này

**Đã tốt — KHÔNG đổi:**
- `PrismaExceptionFilter`: `P2002→409`, `P2025→404`, `P2003→400`, còn lại 500 chung, log mã + route + `meta` không lộ ra client.
- CLAUDE.md: "Lỗi zod phải đổi thành 400" (`parseCvEdit`), route preview `@HttpCode(200)`, route file dùng `StreamableFile`.
- Thông điệp tiếng Việt có nhãn trường (`common/validation-message.ts`).
- Không bọc phản hồi thành công trong envelope (`{ data: … }`) — không cần; `Page<T>` `{ items, total, limit, offset }` là hình dạng phân trang nhất quán.
- Không versioning: client duy nhất là FE cùng repo, deploy cùng nhịp — thêm `/v1` lúc này chỉ là chi phí.

**Gợi ý (ưu tiên giảm dần) — tất cả đều theo hướng THÊM trường, không phá FE đang đọc `message`:**
1. **Thêm một filter bắt-tất-cả** (`common/filters/http-exception.filter.ts`, `@Catch()`, khai trước `PrismaExceptionFilter`) để mọi lỗi có cùng khung:
   ```json
   { "statusCode": 409, "message": "Dữ liệu đã tồn tại", "code": "UNIQUE_VIOLATION", "requestId": "…" }
   ```
   `message` giữ nguyên kiểu hiện tại (chuỗi hoặc mảng chuỗi) để FE không vỡ. `code` là UPPER_SNAKE_CASE ổn định (AIP-193). Lỗi không phải `HttpException` → 500 `INTERNAL`, log đầy đủ stack phía server, client chỉ thấy `requestId`.
2. **Lỗi validation có đường dẫn trường**: `toVietnameseMessages` đã duyệt cây `ValidationError` với `path`; trả thêm `errors: [{ field: "experiences.0.position", message: "…" }]` cạnh `message` để FE tô đỏ đúng ô (đặc biệt form hồ sơ dài). Tận dụng địa chỉ `data-field` đã có ở trình sửa CV.
3. **Có nên chuyển sang `application/problem+json` (RFC 9457)?** Lợi: chuẩn, công cụ hiểu. Hại: đổi hợp đồng với FE, mất đối xứng với mặc định Nest. **Đề xuất: chưa** — làm bước 1 trước (thêm `code`); nếu sau này có client ngoài (mobile, đối tác — đúng hướng thương mại hoá) thì chuyển, vì lúc đó `type`/`code` mới có người đọc. Ghi thành quyết định trong CLAUDE.md.
4. Thêm `P2024` (hết pool) → 503 và `P2034` (xung đột ghi) → 409 vào `PrismaExceptionFilter`. **Khi lên Prisma 8**, mã `P20xx` biến mất (dùng `error.sqlState`, `23505` = unique) — giữ mọi chỗ nhận diện lỗi Prisma trong `src/prisma/prisma-errors.ts` để lúc đó chỉ sửa một file (hiện đã gần đúng: filter và `isUniqueViolation` cùng đọc `PRISMA_ERROR`).

---

## 7. Quan sát và vận hành

### (a) Khuyến nghị

- **Log có cấu trúc:** Nest `ConsoleLogger({ json: true })` cho mỗi dòng một bản ghi JSON (`level`, `pid`, `timestamp`, `message`, `context`); docs cho rằng logger có sẵn "already covers structured, centralized logging for most applications", chỉ cần Pino/Winston khi cần transport, **redact**, hay khối lượng rất lớn — https://docs.nestjs.com/techniques/logger. (Option `json` có trong `@nestjs/common` 11.1.28 đang cài — đã kiểm `console-logger.service.d.ts`.)
- **nestjs-pino** nếu cần request-scoped log: child logger mỗi request qua `AsyncLocalStorage` (không dùng REQUEST scope vì chậm), `genReqId` đọc `X-Request-ID`; v5 cần Nest ≥ 11.0.8 — https://github.com/iamolegga/nestjs-pino
- **Correlation id** trong mọi sự kiện log của một tương tác — https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- **Graceful shutdown:** `enableShutdownHooks()`; khi nhận tín hiệu Nest gọi `onModuleDestroy()` → `beforeApplicationShutdown()` → `onApplicationShutdown()` theo đúng thứ tự đó — https://docs.nestjs.com/fundamentals/lifecycle-events ; Node BP 8.6 https://github.com/goldbergyoni/nodebestpractices#-86-shutdown-smartly-and-gracefully
- **Kiểm cấu hình lúc boot**: `ConfigModule.forRoot({ validate })` — hàm ném lỗi thì app không lên — https://docs.nestjs.com/techniques/configuration

### (b) Áp dụng cho repo này

**Đã tốt — KHÔNG đổi:**
- `/api/health` liveness công khai, `@SkipThrottle()`; **`/ready` đã gỡ có chủ đích** (CLAUDE.md: mất PDF không được làm hỏng probe) — không đề xuất dựng lại.
- `RequestLogMiddleware`: một dòng mỗi request, 5xx→error, ≥1s→warn.
- `enableShutdownHooks()` + `boss.stop({ graceful: true })`.
- `appRole()` ném lỗi với giá trị lạ thay vì đoán; `main.ts` từ chối `JWT_SECRET` mặc định.
- Bảng `ai_calls` + `/api/admin/ai-health` là observability nghiệp vụ tốt hơn mọi APM chung cho chi phí model.

**Gợi ý (ưu tiên giảm dần):**
1. **Thứ tự tắt máy có lỗ — cần kiểm.** Đã đọc `node_modules/@nestjs/core/nest-application-context.js` (`close()`): `callDestroyHook()` → `callBeforeShutdownHook()` → `dispose()` (đóng HTTP server) → `callShutdownHook()`. Nghĩa là `PrismaService.onModuleDestroy()` (`$disconnect`) chạy **TRƯỚC** khi HTTP server ngừng nhận và **TRƯỚC** `QueueService.onApplicationShutdown()` chờ job đang chạy xong. Job đang dở (chấm điểm, sinh CV) và request đang phục vụ có thể mất kết nối DB giữa chừng → `catch` ghi `FAILED` cũng hỏng → bản ghi nằm `RUNNING` cho tới khi reconcile cứu sau 10 phút. Sửa nhỏ: chuyển `$disconnect` sang `onApplicationShutdown` và chuyển `boss.stop` sang `beforeApplicationShutdown` (hoặc gọi trong `onModuleDestroy` của `QueueService`). Viết một test e2e/unit đọc thứ tự hook trước khi sửa (chưa đo được Prisma 7 + adapter-pg có tự nối lại sau `$disconnect` hay không — có thể vấn đề chỉ là log lỗi, cũng có thể là mất ghi).
2. **Kiểm cấu hình bằng zod trong `ConfigModule.forRoot({ validate })`.** `config/configuration.ts` hiện dùng `parseInt(... ?? fallback)` — biến đặt sai (`PORT=abc`) thành `NaN` âm thầm; chỉ `JWT_SECRET` được kiểm (trong `main.ts`). `@nestjs/config` 4.0.4 có `validate` (zod đã là phụ thuộc). Kiểm số nguyên dương cho các trần/timeout, URL hợp lệ, và **bất biến thứ tự timeout của CLAUDE.md** (`timeout một lời gọi < AI_CHAIN_BUDGET_MS < server.setTimeout < STUCK_AFTER_MS`) — chính chỗ đó dễ bị nới lệch nhất.
3. **Request id**: middleware gán `req.id` (nhận `X-Request-ID` nếu hợp lệ, không thì `randomUUID()`), trả lại header, chèn vào dòng log của `RequestLogMiddleware` và vào thân lỗi (mục 6). Để log từ service cũng mang id cần `AsyncLocalStorage` — đó là lúc `nestjs-pino` đáng giá hơn tự viết.
4. **JSON log trên production**: `NestFactory.create(AppModule, { logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }) })` — một dòng, không thêm phụ thuộc. Pino chỉ khi cần `redact`.

---

## 8. Refactor tăng dần một codebase đang lớn

### (a) Khuyến nghị

- **Strangler fig:** thay dần, không viết lại một lượt; bắt đầu bằng "small additions… built on top of, yet separate to the legacy code base" — https://martinfowler.com/bliki/StranglerFigApplication.html
- **Characterization test trước, sửa sau**; test hành vi quan sát được để refactor không làm đỏ test — https://martinfowler.com/articles/practical-test-pyramid.html
- **Ghi quyết định thành ADR ngắn** (Title, Context, Decision "We will…", Status, Consequences); không xoá, chỉ đánh dấu *superseded* — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- **Khoá quy ước bằng công cụ** (dependency-cruiser, ESLint) để quy ước không trôi khi người mới vào — https://github.com/sverweij/dependency-cruiser

### (b) Áp dụng cho repo này

**Đã tốt — KHÔNG đổi:**
- Repo đã làm đúng kiểu này nhiều lần: gỡ `/apply`, `AtsSourceService`, `/ready`, `runTools` theo từng commit riêng, kèm ghi chú "đọc lại commit đó" trong CLAUDE.md.
- Các "máy canh" là characterization test đúng nghĩa: `schema-array-caps.spec.ts` soi cấu trúc zod, `reconcile.service.spec.ts` ghim danh sách bảng, `queue-key.spec.ts` bắt hàng đợi thiếu nhánh, `typography.spec.ts`, test đọc `SKILL.md` thật. Tiếp tục mẫu "mỗi bẫy đã sập → một test ghim".
- CLAUDE.md đang đóng vai sổ quyết định (lý do, số đo, ngày chốt) — chủ dự án đã chọn đặt lý do ở đó thay vì comment.

**Gợi ý:**
1. **Một module mỗi lượt, theo vòng**: (i) chạy `pnpm lint && pnpm test && pnpm test:e2e` xanh; (ii) thêm characterization test cho route của module nếu thiếu (e2e là đủ — CLAUDE.md đã có hạ tầng); (iii) tách hàm thuần sang `utils/` + unit test; (iv) PR riêng. Thứ tự gợi ý theo rủi ro/độ lớn: `admin` (nhiều `$queryRaw`, ít người dùng) → `jobs` → `documents`.
2. **Bật luật trước, sửa sau** cho dependency-cruiser: chạy ở chế độ báo cáo, chụp danh sách vi phạm hiện có làm baseline (`--ignore-known`), chặn vi phạm MỚI trong CI, rồi trả dần.
3. **ADR — câu hỏi mở cho chủ dự án** (không phải đề xuất đi ngược): CLAUDE.md đã rất dài; nếu nó tiếp tục lớn, có thể tách các quyết định đã ổn định (ví dụ "OmniRoute đo 2026-09-23") sang `docs/adr/NNNN-*.md` và để CLAUDE.md chỉ giữ quy tắc + đường dẫn. CLAUDE.md hiện nói lý do dài "viết vào chính file này hoặc `server/README.md`", nên đây cần chủ dự án quyết.

---

## Lộ trình ưu tiên

| # | Việc | Tác động | Công sức | Rủi ro | Ghi chú |
|---|---|---|---|---|---|
| 1 | Sửa thứ tự tắt máy (Prisma disconnect sau, `boss.stop` trước) + test ghim | Cao — tránh job/request mất DB mỗi lần deploy | Thấp | Thấp | Kiểm trước bằng test; mục 7 |
| 2 | `PrismaPg`: `connectionTimeoutMillis`, `max` theo vai; `P2024→503` | Cao — hỏng nhanh thay vì treo 5 phút khi cạn pool | Thấp | Thấp | Mục 5 |
| 3 | Kiểm env bằng zod trong `ConfigModule.forRoot({ validate })`, gồm bất biến thứ tự timeout | Cao | Thấp–Vừa | Thấp | Mục 7 |
| 4 | dependency-cruiser: `rules/` ↛ `ai/`, `common/` ↛ `modules/`, `no-circular` | Cao (giữ bất biến lâu dài) | Thấp | Thấp | Baseline rồi chặn mới |
| 5 | Filter bắt-tất-cả thêm `code` + `requestId`; validation thêm `errors[{field,message}]` | Vừa | Vừa | Thấp (chỉ thêm trường) | Giữ `message` cho FE |
| 6 | Middleware kiểm `Origin`/`Sec-Fetch-Site` cho method ghi; xem lại `express.urlencoded` | Vừa (phòng thủ chiều sâu CSRF) | Thấp | Vừa — có thể chặn nhầm client hợp lệ, cần e2e | Mục 4 |
| 7 | `$queryRawUnsafe` → `$queryRaw`/`Prisma.sql` + rule lint | Vừa | Thấp | Thấp | 3 chỗ |
| 8 | Request id + `ConsoleLogger({ json })` ở production | Vừa | Thấp | Thấp | nestjs-pino khi cần ALS/redact |
| 9 | Log truy vấn chậm (không ghi params) | Vừa | Thấp | Thấp | Bật bằng env |
| 10 | Ngân sách AI theo ngày mỗi người dùng | Vừa–Cao khi mở công khai | Vừa | Vừa — cần con số | API4/API6 |
| 11 | Idempotency-Key cho POST sinh tài liệu | Thấp–Vừa | Vừa | Thấp | Đo `ai_calls` trước; FE khoá nút có thể đủ |
| 12 | Keyset pagination cho "Tất cả việc làm"/admin | Thấp hôm nay | Vừa | Vừa (đổi hợp đồng) | Chỉ khi `EXPLAIN` chỉ ra |
| 13 | Chuẩn bị Prisma 8: mọi nhận diện lỗi Prisma chỉ ở `prisma-errors.ts`; không dùng `relationJoins` | Vừa (lúc nâng cấp) | Thấp | Thấp | |

---

## Bản nháp quy tắc ngắn để thêm vào CLAUDE.md

> Đặt dưới "Quy tắc dễ vi phạm nhất" hoặc "Cách viết code trong `server/src`". Viết ở thể khẳng định, chỉ chứa thứ riêng của repo.

- **Mọi nhận diện lỗi Prisma đi qua `src/prisma/prisma-errors.ts`.** Không so `error.code === 'P2002'` ở chỗ khác — Prisma 8 đổi sang `error.sqlState`, và lúc đó chỉ sửa một file.
- **SQL thô viết bằng `` $queryRaw`…` `` hoặc `Prisma.sql`.** Hàm `*Unsafe` chỉ dùng khi phải ghép định danh, và định danh đó lấy từ hằng trong code, không từ input.
- **Pool Prisma đặt `connectionTimeoutMillis` tường minh.** Mặc định của adapter-pg ở v7 là chờ vô hạn; cạn pool thì request phải hỏng nhanh (503), không treo tới `server.setTimeout`.
- **Tài nguyên dùng chung giải phóng ở `onApplicationShutdown`, việc đang chạy dừng ở `beforeApplicationShutdown`.** Nest gọi `onModuleDestroy` của MỌI module trước khi đóng HTTP và trước `onApplicationShutdown`, nên ngắt DB ở `onModuleDestroy` là cắt chân job đang dở.
- **Biến môi trường được kiểm bằng zod lúc boot**, kể cả thứ tự timeout `một lời gọi < AI_CHAIN_BUDGET_MS < server.setTimeout < STUCK_AFTER_MS`. Thêm biến mới là thêm vào schema.
- **Thân lỗi luôn có `statusCode`, `message`, `code`, `requestId`.** `code` là UPPER_SNAKE_CASE và là hợp đồng — đổi chữ `message` thoải mái, đổi `code` thì phải sửa FE cùng lượt.
- **Route ghi (POST/PUT/PATCH/DELETE) chỉ nhận request cùng origin** (`Sec-Fetch-Site` hoặc `Origin`); không có route GET nào đổi trạng thái — `SameSite=Lax` không bảo vệ GET.
- **Ranh giới import được máy canh** (dependency-cruiser): `matching/rules/` không import `modules/ai/`; `common/` không import `modules/`; không vòng phụ thuộc. Cần ngoại lệ thì thêm vào allowlist kèm lý do.
- **Throttler đếm trong bộ nhớ là đúng khi chỉ có MỘT tiến trình `api`.** Chạy nhiều bản `api` thì phải chuyển storage chung trước, nếu không hạn mức thật nhân theo số bản.

---

## Câu hỏi mở cho chủ dự án

1. **Ngân sách AI mỗi người dùng mỗi ngày** nên là bao nhiêu lượt (hoặc token)? Áp cho mọi purpose hay chỉ tác vụ người dùng kích hoạt?
2. **Có kế hoạch chạy ≥2 bản `api`** (thương mại hoá) không? Nếu có thì throttler và mọi cache trong bộ nhớ (`ModelCatalogService`, `queueConfig` 30s) cần xem lại cùng lúc.
3. **FE có route nào cần `application/x-www-form-urlencoded`** không (Google OAuth callback?) — nếu không, gỡ `express.urlencoded` cùng lúc thêm kiểm `Origin`.
4. **FE và API có chung eTLD+1** trên production không (ảnh hưởng mức bảo vệ thật của `SameSite=Lax`)?
5. **Có định chuyển thân lỗi sang RFC 9457 `application/problem+json`** khi có client ngoài, hay giữ khung Nest + `code` lâu dài?
6. **Kế hoạch lên Prisma 8** — khi nào? Nó đổi `$transaction`, mã lỗi và bỏ `relationLoadStrategy`; nên chốt trước để không thêm code dựa vào API sắp mất.
7. **Có muốn tách quyết định ổn định ra `docs/adr/`** để CLAUDE.md ngắn lại, hay giữ một file duy nhất như hiện tại?
8. Bản ghi kẹt ở `PENDING` (đã tạo nhưng `queue.send` hỏng) có được `ReconcileService` quét không — hay đó là một ngõ cụt cùng loại với ca `ProfileDraft` đã ghi?
