# Làm việc trong repo này

Repo có **hai runtime dùng chung một bộ đặc tả**, và gần như mọi việc hiện nay thuộc runtime thứ hai:

1. **Workspace Claude Code** (thiết kế của bản fork gốc): người dùng gõ `/apply`, `/rank`, `/upskill`… và Claude ghi CV LaTeX vào `cv/`, `cover_letters/`. Runtime này **hiện không chạy được** vì hồ sơ ứng viên chưa được điền — xem `docs/adr/0015-khong-co-ho-so-ung-vien.md`.
2. **Backend NestJS trong `server/`** — đây là sản phẩm đang phát triển: đa người dùng, HTTP, Postgres. Nó nạp chính các file `.claude/skills/*.md` lúc chạy và nhồi khung đặc tả vào prompt.

Lộ trình phát triển: `../LO-TRINH.md`. Mô tả đề tài và phần bổ sung: `../bo-sung-mo-ta-de-tai.md`. Chi tiết kiến trúc backend: `server/README.md`.

## Trước khi coi một thay đổi là xong

```bash
cd server
pnpm lint && pnpm test && pnpm test:e2e
```

**Tự rà diff trước khi báo xong**, theo ba câu hỏi, sửa ngay những gì vướng rồi mới báo, và báo kèm kết quả rà:

1. **Có over-engineer không?** Đối chiếu mục "Sửa ĐỦ DÙNG": tham số/option không có chỗ gọi truyền giá trị khác mặc định, hai cơ chế cho một vấn đề, test trùng hành vi, code thêm nhiều hơn phần thật sự cần.
2. **Có vi phạm quy tắc thiết kế hay kỹ thuật nào trong file này không?** Controller mỏng, khoá theo `userId`, giành chỗ có điều kiện, bồi hoàn khi đẩy hàng đợi, cấu hình mặc định chỉ ở `configuration.ts`, comment, cấu trúc thư mục module, import.
3. **Logic có thẳng và đơn giản không?** Đối chiếu mục "Logic thẳng, đọc từ trên xuống": không ternary lồng, không mẹo chuỗi, chỉ tách hàm khi có lý do, không export/khai báo thừa.

**Đổi hành vi thì cập nhật `docs/business-flows/` trong cùng thay đổi.** Hành vi gồm: endpoint, quyền, quy tắc, validation, thông điệp lỗi, trạng thái, bảng/cột, hàng đợi/cron, tích hợp. Sửa file module ứng với vùng code đó (`docs/business-flows/modules/<module>.md`; dòng `Phạm vi` đầu mỗi file ghi nó phủ thư mục nào). Sau đó chạy `python docs/business-flows/_gen.py --write`. Thứ tự cập nhật, cách đánh dấu ngày, cách chuyển rủi ro sang `✅ Đã sửa` và những file hệ thống cần sửa tay: [`docs/business-flows/README.md` §7](docs/business-flows/README.md#7-bảo-trì-tài-liệu). Refactor giữ nguyên hành vi thì không cần.

`pnpm test:e2e` **cần Postgres đang chạy** (`pnpm db:up`) và biến `TEST_DATABASE_URL` trỏ tới database có tên kết thúc bằng `_test`. Nó tự tạo database đó và tự chạy migration.

### Tài khoản dùng cho bộ test

**Mọi tài khoản do `pnpm db:seed` tạo ra đều dùng chung một mật khẩu: `Demo@12345`.** Cặp đăng nhập hay cần nhất là **`admin@aijob.local` / `Demo@12345`**.

| Tài khoản | Vai trò |
|---|---|
| `admin@aijob.local` | **ADMIN**. Sáu spec Playwright đăng nhập bằng tài khoản này, và `admin-refetch.spec.ts` cần nó để vào `/admin` |
| `demo@aijob.local` | Hồ sơ backend developer, có sẵn tin, điểm phù hợp và đơn ứng tuyển |
| `ketoan@`, `dieuduong@`, `giaovien@`, `kinhdoanh@`, `xuatnhapkhau@`, `cokhi@`, `mkt-fresher@` | Bảy hồ sơ NGOÀI ngành IT. Xem `scripts/demo-personas.mjs`, mỗi hồ sơ có trường `chamVao` ghi rõ nó kiểm nhánh nào |

**Chỉ dành cho database DEV trên máy cá nhân.** Đây không phải bí mật — mật khẩu vốn đã nằm cứng trong 6 spec Playwright của `ui-ai-job-search/test/visual/`. Ghi lại ở đây vì khi database dev bị seed lại hoặc tài khoản lệch đi thì **toàn bộ 6 spec Playwright hỏng ngay ở bước đăng nhập** — một triệu chứng trông y hệt như giao diện bị vỡ, mất khá lâu mới lần ra. Đã xảy ra thật: `admin@aijob.local` có lúc **không tồn tại** trong database dev, và không tài khoản nào mang role ADMIN.

Lệch thì chạy lại `pnpm db:seed` — nó `ON CONFLICT DO UPDATE` nên đặt lại mật khẩu và ép `role = 'ADMIN'` cho tài khoản admin, chạy bao nhiêu lần cũng được. Không cần sửa tay bằng psql nữa. (bcrypt cost **12**, khớp `BCRYPT_ROUNDS` trong `auth.service.ts`.)

**Bộ e2e KHÔNG dùng những tài khoản này.** Nó tự đăng ký user với email sinh theo bộ đếm trên database `_test` riêng, và mật khẩu `MatKhauTest123!` trong `test/support/app-harness.ts` là hằng số nội bộ của nó — đổi mật khẩu seed không ảnh hưởng gì tới e2e, và ngược lại.

**Đừng dùng lại mật khẩu này ở bất kỳ đâu có dữ liệu thật.**

## Ràng buộc cứng — đừng "sửa" chúng

- **Node >= 24.9 (khuyến nghị v24.22.0 LTS; tối thiểu runtime >= 22.12).** `ai` và `@ai-sdk/openai-compatible` là ESM thuần không có bản CommonJS, còn `nest build` xuất CommonJS; chạy được là nhờ Node cho phép `require()` một module ESM. Bộ test đơn vị chạy Jest 30 với `--experimental-vm-modules` đòi hỏi Node >= 24.9 cho các API VM module đồng bộ (`SourceTextModule.prototype.hasAsyncGraph`). Gặp lỗi ESM thì **đừng** hạ cấp package hay đổi `module` trong tsconfig chính.
- **e2e chạy qua `node test/run-e2e.mjs`**, không phải `jest --config` trực tiếp: nó cần cờ Node `--experimental-vm-modules` vì Prisma 7 nạp WASM query compiler bằng `import()` động. `test/tsconfig.e2e.json` dùng `module: node16` để `import()` không bị hạ cấp thành `require()`.
- **Thứ tự tắt: hàng đợi dừng ở `beforeApplicationShutdown`, Prisma ngắt ở `onApplicationShutdown`.** Nest gọi `onModuleDestroy` TRƯỚC khi đóng HTTP và trước mọi hook tắt khác; ngắt database ở đó thì request và job đang chạy mất kết nối giữa chừng rồi nằm `RUNNING`.
- **Test nằm ở `test/unit/**` phản chiếu cây `src/**`**, không đặt cạnh source. e2e là `test/*.e2e-spec.ts`. Trong test dùng alias `src/...` thay cho đường dẫn tương đối.
- **`ai` và `@ai-sdk/*` bị stub trong e2e** (`test/support/stubs/ai-sdk.ts`), và stub **ném lỗi** nếu bị gọi thật — nhờ vậy một `overrideProvider` bị bỏ sót lộ ra ngay thay vì âm thầm gọi model.
- **Test đơn vị thì nạp SDK thật, và chặn bằng `jest.mock(..., factory)` chứ KHÔNG `jest.spyOn`.** Export của module ESM không cấu hình lại được: `jest.spyOn(ai, 'generateObject')` ném `Cannot redefine property`. Mẫu đang dùng ở `test/unit/modules/ai/ai.service.spec.ts` — factory chặn `generateObject`, nhưng lấy `NoObjectGeneratedError` từ `jest.requireActual('ai')` để nhánh phân loại lỗi được kiểm bằng lớp lỗi thật thay vì bằng giả định của test. Khai kiểu cho mock theo thứ tự `jest.fn<TrảVề, [ThamSố]>()`; truyền một kiểu hàm thì `mock.calls` thành `any` và eslint chặn.

## Quy tắc dễ vi phạm nhất

- **Route mới phải có kiểm tra quyền sở hữu VÀ test cho chính nó.** `JwtAuthGuard` là guard toàn cục theo chiều mặc-định-đóng; mở một route bằng `@Public()`. Đừng gắn lại `@UseGuards(JwtAuthGuard)` ở controller — làm vậy khiến người đọc tưởng những controller không gắn là công khai. `RolesGuard` cũng toàn cục: route admin chỉ cần `@Roles('ADMIN')`, không `@UseGuards(RolesGuard)`.
- **Route `@Public()` (khách gọi không cần token) có ba thứ đi kèm:** `@Throttle` riêng (mẫu 60 lượt/phút ở `PublicJobsController`, `SalaryController` — khách bị đếm theo IP), `select` theo danh sách trắng trường (`PUBLIC_JOB_FIELDS`) để trường mới thêm vào bảng không tự lọt ra ngoài, và DTO query dạng `PickType` để bộ lọc gắn với tài khoản nhận 400. Kèm một e2e gọi không token. Route gọi model không bao giờ mở công khai.
- **Truy vấn dữ liệu người dùng luôn khoá theo `userId`**, và tốt nhất để `userId` thành tham số **bắt buộc** trong chữ ký hàm service (xem `DocumentsService.generate`) để caller thêm sau không thể quên. Lệnh GHI theo id cũng mang `userId` trong `where` (`update({ where: { id, userId } })`) dù đã kiểm sở hữu trước đó; route stream truyền `userId` xuống để service tự khoá, như `DocumentGenerator.streamGenerate`.
- **Đường ĐỌC không bao giờ gọi AI.** Dashboard, danh sách match, chi tiết job chỉ truy vấn SQL; kết quả chấm điểm cache theo `promptHash`. Trong `modules/matching/` ranh giới này nằm ngay trên cây thư mục: **`ai/` là mọi thứ tốn một lượt gọi model** (`match.evaluate`, `job.requirements`, `skill.canonicalize` + schema output của chúng), **`rules/` thì không chạm `AiService` dòng nào** — đối chiếu kỹ năng bằng code và chọn suất cho AI. Thêm một lời gọi model vào `rules/` là phá bất biến; `utils/` giữ phần dùng chung hai bên.
- **Không tự xếp lại việc ở trạng thái `FAILED`.** Đó là trạng thái cuối người dùng bấm lại được; tự động thử lại khi chưa có bộ đếm số lần thử sẽ thành vòng lặp tốn tiền.
- **Bảng nào có `status: MatchStatus` thì PHẢI có mặt trong `ReconcileService`.** Một bản ghi chỉ chuyển sang `FAILED` từ trong khối `catch` của chính worker; tiến trình chết giữa chừng — deploy, restart — thì không `catch` nào chạy và bản ghi nằm `RUNNING` vĩnh viễn (đã xảy ra với `ProfileDraft`, `UpskillReport`, `ScrapeRun`). Hàng nào không có `updatedAt` thì tính mốc kẹt theo `createdAt`/`startedAt`. `test/unit/modules/reconcile/reconcile.service.spec.ts` ghim danh sách sáu bảng, thêm bảng mới mà quên là đỏ; nhớ cộng trường mới vào `admin/utils/reconcile-note.ts`.
- **Chuyển trạng thái việc bằng GIÀNH CHỖ có điều kiện:** `updateMany({ where: { id, userId?, status: <trạng thái được phép> }, data: { status: 'RUNNING' } })`, `count === 0` thì người thua dừng (route trả 409/400, worker bỏ qua, không gọi model). Đọc-rồi-`update({ where: { id } })` để hai request hoặc hai worker cùng chạy một việc, và kết quả DONE bị ghi đè. Mẫu: `MatchingService.claim`, `DocumentGenerator.claim`, `InterviewTurnService.stream`. Trường hợp lỗi giữa chừng thì trả lại trạng thái cũ hoặc ghi `FAILED`.
- **Route stream không xếp lại việc khi trình duyệt ngắt:** server vẫn chạy generator tới cuối và tự ghi DONE/FAILED, nên một lượt xếp hàng thêm là chạy hai lần (đã gỡ `onAbandon` 2026-10-16). Lỗi trước sự kiện đầu tiên đi ra dạng sự kiện `error` kèm `statusCode` (`common/ndjson.ts`).
- **Trọng số điểm tổng thuộc về code**, không hỏi model (`computeOverall`). Model rất hay tự làm tròn điểm tổng cho khớp cảm nhận của nó.
- **Thay mẫu kiểm-tra-rồi-tạo bằng `isUniqueViolation`** (`src/prisma/prisma-errors.ts`): để `create` chạy rồi bắt `P2002`. Nested write của Prisma vốn đã nguyên tử nên phần lớn chỗ **không cần** `$transaction`.
- **Tự vệ độc lập ở tầng Service (Defensive Service Layer):** Không ỷ lại duy nhất vào DTO Controller (`@ArrayMaxSize`, validation pipe) vì Service có thể được gọi từ cronjob, CLI hoặc method nội bộ khác. Mọi hàm service nhận mảng danh sách ID phải luôn:
  1. Khử trùng ID ngay đầu vào: `Array.from(new Set(ids))`.
  2. Tự đặt giới hạn trần an toàn (`MAX_*_SIZE`) và ném `BadRequestException` để ngăn cạn kiệt bộ nhớ hoặc vượt ngưỡng tham số SQL (Postgres max 65,535 params).
  3. Gom batch truy vấn bằng `{ in: ids }` và chỉ chọn cột tối thiểu (`select: { id: true }`) thay vì `SELECT *`.
- **Tuyệt đối không trả về HTTP 200 giả danh kết quả cho lỗi nghiệp vụ:** Khi đầu vào rỗng, không tìm thấy thực thể hoặc vi phạm điều kiện tiền quyết, PHẢI ném đúng Exception chuẩn (`BadRequestException`, `NotFoundException`) để `AllExceptionsFilter` format chuẩn hoá mã lỗi HTTP cho client. Không trả về `{ queued: 0, message: '...' }` với HTTP 200.
- **Thông điệp lỗi viết cho người dùng cuối:** nói việc gì chưa xong hoặc đang chạy và họ làm gì tiếp ("Tài liệu chưa tạo xong nên chưa sửa được.", "Câu trả lời trước … đang được xử lý, đợi một chút rồi gửi tiếp."). Tên trạng thái nội bộ (`DONE`, `RUNNING`…), tên enum, mã HTTP và chi tiết kỹ thuật chỉ vào log. FE hiện nguyên văn `message` của mọi lỗi 4xx; lỗi 5xx thì `AllExceptionsFilter` đã thay bằng câu chung kèm `requestId`. Đã sập 2026-10-24: chín câu dạng "đang ở trạng thái `${status}`" lộ `DONE` ra màn hình phỏng vấn thử. Một trạng thái cần lời khuyên khác thì tách nhánh riêng (mẫu: `InterviewTurnService.stream` tách `RUNNING` khỏi các trạng thái đã đóng).
- **Phòng chống Race Condition khi ghi hàng loạt:** Khi dùng `createMany`, luôn khai báo `skipDuplicates: true` (sinh ra `ON CONFLICT DO NOTHING` trên Postgres) để tránh ném lỗi vi phạm khóa chính/unique constraint `P2002` khi có 2 request đồng thời.
- **Giao dịch bồi hoàn (Compensating Action) khi gọi Hàng đợi sau DB (chống Dual-Write):** Khi một thao tác cập nhật DB sang `PENDING`/`RUNNING` rồi đẩy việc vào hàng đợi (`queue.send`/`sendMany`), PHẢI bọc lệnh queue trong `try/catch`. Nếu đẩy queue thất bại, khối `catch` phải lập tức cập nhật lại trạng thái bản ghi thành `FAILED` kèm lý do lỗi, tuyệt đối không để bản ghi kẹt vĩnh viễn ở trạng thái "đang chờ" ảo mà không có worker nào xử lý.
- **Thin Controller, Fat Service — Không điều phối nghiệp vụ hay gọi Queue trực tiếp từ Controller:** Controller chỉ đóng vai trò tiếp nhận HTTP request (`@CurrentUser`, `@Body`, `@Param`, `@Query`), uỷ quyền trực tiếp xuống Service và trả về kết quả. Mọi luồng phối hợp (orchestration) như kiểm tra cache hit, cập nhật PENDING/RUNNING, đẩy hàng đợi (`queue.send`), và bắt lỗi bồi hoàn (`markFailed`) PHẢI được đóng gói hoàn toàn bên trong tầng Service (như `InterviewService.enqueue`, `MatchingService.enqueue`, `UpskillService.enqueue`, `DocumentsService.enqueue`, `ScraperService.start`). Tuyệt đối không inject `QueueService` vào Controller, không viết luồng try/catch hàng đợi hay điều phối trạng thái DB nhiều bước tại Controller.

## Cách viết code trong `server/src`

**Mặc định KHÔNG comment.** Chỉ hàm nào vừa có NHIỀU logic vừa được gọi từ NHIỀU nơi (thường là hàm trong `utils/` và method của service) mới được một dòng `/** ... */` ngắn ngay trên khai báo. Không comment cho hằng, kiểu, trường, class, import; không `//` trong thân hàm; không docblock nhiều dòng. Ngoại lệ duy nhất là chỉ thị cho công cụ (`eslint-disable`, `@ts-expect-error`). Lý do dài (đo được gì, vì sao chọn cách này, bẫy đã sập) thì viết vào chính file này hoặc `server/README.md` — chỗ đó người ta còn đọc, còn comment nằm giữa code thì mục nát khi code đổi. Chốt 2026-10-06, thay quy ước "comment một dòng" trước đó.

**Sửa ĐỦ DÙNG — chặn đúng lỗi đang có, không làm cho quy mô chưa tới.** Chốt 2026-10-16 sau một đợt sửa phải rút gọn lại 150 dòng code và 420 dòng test:

- **Một cơ chế cho một vấn đề.** Throttle đã chặn được thì không thêm hàng chờ; giành chỗ có điều kiện đã đủ thì không thêm khoá, cờ hay hàng đợi phụ.
- **Tối ưu cho quy mô khi số đo đã gần ngưỡng**, ghi số đo vào ADR. Kho ~3.500 tin thì chưa chia lô cho ngưỡng 30.000 tin; ghi "làm khi gần tới" vào file khảo sát là đủ.
- **Giữ phạm vi đúng mục được giao.** Thấy lỗi khác thì báo, đừng sửa kèm.
- **Một test cho một hành vi, ở tầng chứng minh được nó:** race/ownership/HTTP → e2e trên DB thật; logic thuần → unit. Đừng kiểm lại cùng hành vi bằng unit giả lập Prisma chỉ để soi hình dạng câu `where`.
- **Báo số dòng thêm/xoá của code chạy thật trước khi coi là xong** (`git diff --numstat -- server/src`). Tăng nhiều hơn phần thật sự chặn lỗi thì rút lại trước.
- **Giao việc cho agent: nói rõ phạm vi tối thiểu** và yêu cầu báo số dòng; nhiều agent song song sẽ mỗi agent tự làm "trọn vẹn" phần mình.

**Logic thẳng, đọc từ trên xuống — đừng viết "khéo".** Chốt 2026-10-14 sau một đợt rà thấy code chạy đúng nhưng khó đọc hơn mức cần:

- **Chỉ tách hàm khi việc tách có lý do**: được gọi từ ≥ 2 nơi, HOẶC gói một khái niệm có tên rõ nghĩa (`closingOf`, `requireQuestion`). Không tách chỉ để thân hàm ngắn đi, không lồng hàm trong hàm (closure khai trong thân hàm khác) trừ callback một dòng.
- **Không generic, không `...rest` chỉ để tiện cho một chỗ gọi.** Đã sửa: `withClosing<T extends {...}>({ steps, ...run })` → hàm thường `closingOf(status, steps)` trả chuỗi, còn việc ghép trường viết thẳng ở chỗ gọi.
- **Lọc rồi map thì viết `filter` + `map` hoặc vòng `for` có `continue`.** Không dùng `flatMap` trả `[]` hoặc `[x]` để vừa lọc vừa map (`readinessOf`).
- **Không mẹo chuỗi**: bỏ phần rỗng TRƯỚC rồi mới ghép. Đã sửa: ghép `"Nhãn: giá trị"` rồi lọc dòng `endsWith(': ')`.
- **Không ternary lồng** — dùng `if`.

**Service chỉ giữ phần chạm DATABASE.** Truy vấn Prisma, transaction, phân trang, kiểm quyền sở hữu — ở lại service. Mọi thứ khác (thuần hàm, định dạng chuỗi, dựng prompt, suy ra nhãn, ánh xạ dữ liệu) tách sang `utils/` cùng module. Kiểm nhanh: hàm không đụng `this.prisma` thì nó không thuộc về service.

**DTO nằm ở file riêng**, không khai trong controller. Một `<tên>.dto.ts` cho mỗi module.

**Bên trong một module** (khảo sát và lý do: `docs/research-backend-module-structure.md`, `docs/plan-backend-cleanup-2026-10-16.md`):

- Bố cục phẳng là mặc định (`x.controller.ts`, `x.service.ts`, `x.dto.ts`). Có từ 3 file cùng vai thì mở thư mục con, tên số nhiều: `services/`, `utils/`, `schemas/`.
- Chuỗi trong DTO có `@MaxLength`, mảng có `@ArrayMaxSize`. Service nhận kiểu DTO hoặc `Prisma.XInput`; cần `as unknown as` giữa hai kiểu là dấu hiệu DTO khai sai kiểu.
- Mặc định cấu hình chỉ nằm ở `config/configuration.ts`; service đọc `config.get<T>(key)!`. Đã có lúc `SCRAPER_SYSTEM_QUERY_LIMIT` mang ba giá trị ở ba nơi.
- Thêm tham số hay option khi có chỗ gọi truyền giá trị khác mặc định. Gỡ tính năng thì grep tên hàm, kiểu, tham số của nó trên `src` và `test` rồi gỡ tới gốc: đợt dọn 2026-10-16 xoá ~380 dòng đồ sót.
- `| null` cho giá trị từ cột nullable hoặc trả ra API; `?:` cho trường có thể vắng; chỉ ghi cả hai khi cả hai trạng thái xảy ra thật. `unknown` ở biên (biến `catch`, `JSON.parse`, cột `Json`, payload hàng đợi) rồi thu hẹp ngay. Nguồn: `docs/research-null-undefined-unknown.md`.
- ESLint cảnh báo `complexity` > 20 và `max-depth` > 4. Hàm vượt ngưỡng thì đọc lại theo 18 dấu hiệu ở `docs/research-backend-simplicity.md`; tắt từng dòng chỉ khi đó là phức tạp vốn có của bài toán (4 chỗ hiện có).

**Hàm phụ mà NHIỀU module dùng thì lên `src/common/`**, không để một module import xuyên sang module khác. Đang có: `common/ai/` (`failure-kind`, `failure-view`, `token-estimate` — `AiService`/`ModelChain` vẫn ở `modules/ai`), `common/pagination.ts`, `common/model-output.ts`, `common/duration.ts` (`DAY_MS`, `daysAgo` — đừng viết tay `24 * 60 * 60 * 1000`), `common/error-message.ts` (`messageOf`), `common/fingerprint.ts`, `common/text/`, `common/web/`. Ngược lại, thứ chỉ một module dùng thì **đừng** đẩy lên `common/` — `common/` là hạ tầng, không phải kho từ vựng nghiệp vụ (đó là lý do `jobs/taxonomy/*` ở nguyên chỗ cũ dù 5 module đọc nó). `common/` không import `modules/` — `eslint.config.mjs` chặn.

**Import trong `src/` viết KHÔNG đuôi `.js`**: xa dùng alias `@/common/fingerprint`, gần dùng `./x` hoặc `../x`. Package là CommonJS nên Node tự thêm đuôi; chuyển sang ESM thì phải thêm lại. Với alias thì đuôi còn là lỗi thật: `tsc` không viết lại alias — hook `tsconfig-paths` của `nest build`/`nest start` mới viết lại, và hook đó dò `<đường dẫn>.ts`, nên `@/x.js` bị bỏ qua trong im lặng: build xanh, typecheck xanh, unit test xanh (jest tự map), app sập lúc khởi động với `Cannot find module`. `eslint.config.mjs` chặn đuôi `.js` lẫn `../../`. Test thì vẫn dùng `src/...js` (jest map). Kiểm chắc nhất sau khi build: `grep -r 'require("@/' dist` phải rỗng.

## Các seam và bản giả

| Seam | Dùng cho | Bản giả trong test |
|---|---|---|
| `Ai` — `modules/ai/ai.service.ts` | mọi lời gọi model; **không** gọi SDK trực tiếp | `src/testing/fake-ai.ts` |
| `Queue` — `modules/queue/queue.service.ts` | mọi việc nền | `test/support/fake-queue.ts` |
| `Storage` — `modules/storage/` | ghi file của người dùng (R2) | `src/testing/fake-storage.ts` — e2e override `STORAGE`, không bao giờ ghi lên R2 thật |
| `SkillRegistry` — `modules/skills/` | nạp khung prompt từ `.claude/skills` | — |
| `ProfileSource` — `modules/profile-sources/` | đọc hồ sơ từ nguồn ngoài | PDF thật ở `test/fixtures/` |
| `SandboxRunner` — `modules/sandbox/` | chạy việc nặng trong container cách ly | `src/testing/fake-sandbox.ts` |

`FakeAi` chạy `schema.parse` trên dữ liệu xếp sẵn, nên **không thể** xếp một object gần đúng: hình dạng nào model thật không trả được thì test cũng không nhận. Hết dữ liệu xếp sẵn thì nó ném lỗi thay vì trả giá trị mặc định.

**Đừng tạo seam mới khi chỉ có một adapter**, trừ khi adapter thứ hai đã nằm trong lộ trình.

## Bất biến xuyên chủ đề

- **Thứ tự timeout:** timeout MỘT lời gọi model < `AI_CHAIN_BUDGET_MS` 4 phút < `server.setTimeout` 5 phút (`main.ts`) < `STUCK_AFTER_MS` 10 phút (reconcile). Nới một mốc thì xem lại ba mốc kia — lý do ở ADR 0011.
- **Schema output của model CẮT chứ không từ chối:** trần độ dài/số lượng là `.transform()` qua `common/model-output.ts`; giữ nghiêm ngặt cho thứ cắt bừa sẽ sai nghĩa (điểm số, enum Eligibility). Schema nhận input NGƯỜI DÙNG thì vẫn `.max()` trả 400 — ADR 0017.
- **Chuỗi dự phòng đi tiếp khi gặp 429/401/403/5xx/model đã rút/timeout/sai schema**; riêng "prompt vượt trần token" không cộng cầu dao — ADR 0012 (schema và timeout thêm từ 2026-10-05).
- **Không gọi model trực tiếp trong lúc demo** — hạn mức gateway free cạn sau khoảng 30 lượt; chuẩn bị dữ liệu trước.

## Quyết định theo chủ đề — `docs/adr/`

Mỗi ADR giữ nguyên văn số đo, lý do và bẫy đã sập của một chủ đề. **Mở đúng ADR trước khi sửa vùng code tương ứng**; đổi một quyết định thì sửa ADR đó (hoặc thêm ADR mới thay thế) trong cùng thay đổi. Mẫu viết ADR mới: `docs/adr/README.md`.

- **Sửa luồng đọc CV, `ProfileDraft`, `profile-proposal.schema.ts` hoặc `PUT /profile-drafts/:id/apply`** → `docs/adr/0001-doc-cv-agent-1.md` (Đọc CV (Agent 1): ProfileDraft, trường cấm đề xuất, trường mô tả cho phép rỗng)
- **Sửa đường in PDF (CV và thư xin việc), `pdf-service`, kho mẫu (`templates/themes.ts`, `typography.ts`, `letter.ts`) hoặc đổi mẫu** → `docs/adr/0002-cv-html-va-kho-mau.md` (Mọi tài liệu in bằng HTML/Chromium, kho mẫu CV và thiết kế (font, cỡ chữ), thư mượn mẫu của CV)
- **Sửa `PUT /documents/:id/cv`, `POST :id/preview`, chế độ `editing`, phần đầu CV, tên mục, hoặc khung xem trước iframe** → `docs/adr/0003-nguoi-dung-sua-cv.md` (Người dùng sửa CV: content/layout tách cột, sửa thẳng trên trang, iframe sandbox)
- **Muốn đưa LaTeX trở lại** → `docs/adr/0004-xuat-pdf-latex.md` (Đã thay thế 2026-10-19: LaTeX đã gỡ; giữ lại các bài học về TeX Live, moderncv và font tiếng Việt)
- **Sửa scraper, thêm/bỏ portal, xử lý `BLOCKED`, nhịp quét hoặc mô tả tin** → `docs/adr/0005-nguon-tin-portal.md` (Nguồn tin (SEAM 5): portal CLI, thêm portal, chặn IP, mô tả bị cắt)
- **Thêm portal mới, hiển thị nội dung tin ra ngoài, hoặc bàn thương mại hoá** → `docs/adr/0006-dieu-khoan-portal.md` (Điều khoản sử dụng của các portal và quyết định giai đoạn đồ án)
- **Sửa `QueryPlanner`, `job.requirements`, cụm nghề, `occupationGate` hoặc trang "Việc làm phù hợp"** → `docs/adr/0007-quet-tin-da-nganh.md` (Quét tin đa ngành: từ khoá theo ngành, gộp lô job.requirements, cụm nghề, việc làm phù hợp)
- **Mở route cho khách, sửa `PublicJobsController`, hoặc hiển thị tin cho người chưa đăng nhập** → `docs/adr/0008-trang-viec-lam-cong-khai.md` (Trang việc làm công khai cho khách chưa đăng nhập)
- **Sửa `interview_answers`, nhận xét câu trả lời hoặc ngày phỏng vấn** → `docs/adr/0009-tu-tra-loi-phong-van.md` (Tự trả lời câu hỏi phỏng vấn: khoá theo chữ câu hỏi)
- **Thêm hàng đợi, đổi policy, concurrency hoặc khoá `singletonKey`** → `docs/adr/0010-hang-doi.md` (Hàng đợi pg-boss: tách file, khoá chặn trùng, batchSize)
- **Đổi timeout, `AI_CHAIN_BUDGET_MS`, thiết kế tác vụ AI dài, hoặc chuẩn bị demo** → `docs/adr/0011-do-truoc-khi-doan.md` (Đo trước khi đoán: độ trễ gateway, thứ tự timeout, upskill hai lời gọi)
- **Thêm/đổi lõi model, `ModelChain`, `MODEL_FALLBACK_IDS`, `AI_FAST_MODEL_ID`, OmniRoute hoặc opencode-service** → `docs/adr/0012-loi-model-va-chuoi-du-phong.md` (Nhiều lõi model, chuỗi dự phòng, OmniRoute và Groq)
- **Sửa `structuredOutputs`, `honorsResponseFormat`, `streamsJson`, `extractJson` hoặc chọn model theo catalog** → `docs/adr/0013-ep-dinh-dang-dau-ra.md` (Ép định dạng đầu ra của model và catalog model)
- **Tối ưu prompt, đọc `inputTokens`/`cachedTokens`, hoặc sửa `renderShared`** → `docs/adr/0014-token-va-cache-prompt.md` (Token đã trả tiền và cache prompt)
- **Muốn hồi sinh runtime Claude Code (`/setup`, `/apply`)** → `docs/adr/0015-khong-co-ho-so-ung-vien.md` (Vì sao CLAUDE.md không chứa hồ sơ ứng viên)
- **Sửa `modules/companies`, Serper, nguồn trích hoặc `confidence`** → `docs/adr/0016-tim-hieu-cong-ty.md` (Tìm hiểu công ty: luồng cố định, chỉ lưu bản phân tích)
- **Thêm/sửa schema zod cho output model, `common/model-output.ts`** → `docs/adr/0017-cat-chuoi-model-output.md` (Schema output của model: CẮT thay vì từ chối)
- **Sửa nhắc học, `modules/push`, `StudyReminderService`, `User.studyTime` hoặc thêm kênh thông báo** → `docs/adr/0018-nhac-hoc-web-push.md` (Nhắc học bằng Web Push, giờ học do người dùng chọn)

## Ranh giới không được xê dịch

`tools/`, `scripts/`, `.agents/skills/*/`, `.claude/skills/*/SKILL.md` bị CI khoá vị trí (`lint_skills.py`, `security_guards.py`, `check_framework_version.py`). Sửa `AGENTS.md` thì **bắt buộc** bump `framework_version` trong frontmatter, nếu không CI đỏ.
