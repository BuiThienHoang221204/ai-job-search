# Bên trong một module NestJS: tách file, viết từng tầng, chống IDOR

Nghiên cứu ngày 2026-10-16 cho `server/src/modules/*` (NestJS 11, Prisma 7, 24 module).

Đọc cùng `docs/research-backend-best-practices.md`. File đó đã bàn kiến trúc tổng (feature module, không repository, dependency-cruiser), OWASP Top 10 ở mức hệ thống, hiệu năng, lỗi, quan sát. File này **chỉ bàn bên trong một module**: cây thư mục, controller, service, utils, DTO, schema, kiểm sở hữu. Chỗ nào trùng thì trỏ sang, không chép lại.

Quy ước đánh dấu:
- **[nguồn]**: khẳng định có link ngay sau.
- **[quan điểm]**: ý của một tác giả, không phải chuẩn.
- **[quy ước tự chọn]**: con số hoặc luật do repo tự đặt, không có nguồn ngoài nào đòi.

Mọi đề xuất đều phải khớp CLAUDE.md hiện tại: service chỉ giữ phần chạm DB, DTO ở file riêng, mặc định không comment, sửa đủ dùng, một cơ chế cho một vấn đề. Không có đề xuất nào đi ngược. Chỗ nào đề xuất **làm rõ thêm** một luật cũ thì có ghi.

---

## Phần 1 — Khuyến nghị từ nguồn gốc, đối chiếu với repo

### 1. Cây thư mục bên trong module

**(a) Nguồn nói gì**

- `nest g resource` là khuôn mặc định của Nest. Nó sinh "an entity class, DTO classes, and the test (`.spec`) files" — https://docs.nestjs.com/recipes/crud-generator. Mẫu trên trang đó ra `users.module.ts`, `users.service.ts`, `dto/create-user.input.ts`, `dto/update-user.input.ts`, `entities/user.entity.ts`. Tức là **module phẳng, chỉ `dto/` và `entities/` là thư mục con**.
- Nest **không** quy định thư mục con nào khác. Mỗi dự án lớn tự chọn:
  - **Immich** chia theo **tầng ở cấp toàn server**, không theo module: `server/src/{controllers,services,repositories,dtos,utils,...}` — https://github.com/immich-app/immich/tree/main/server/src
  - **Twenty** chia theo module, trong module có `services/`, `dtos/`, `utils/`, `controllers/`, `exceptions/`, `constants/`, `types/` — ví dụ https://github.com/twentyhq/twenty/tree/main/packages/twenty-server/src/engine/core-modules/api-key
  - **Novu** chia mỗi use case một thư mục: `apps/api/src/app/subscribers/usecases/get-subscriber/{get-subscriber.usecase.ts, .command.ts, .spec.ts}` — https://github.com/novuhq/novu/tree/next/apps/api/src/app/subscribers
- **Không có ngưỡng số dòng nào có nguồn chuẩn.** ESLint `max-lines` mặc định `300`, nhưng đó chỉ là giá trị mặc định có thể chỉnh, "to aid in maintainability" — https://eslint.org/docs/latest/rules/max-lines
- **[quan điểm]** Ousterhout: module tốt là module "sâu", giao diện đơn giản hơn nhiều so với phần cài đặt. Ông cũng cảnh báo "classitis": quá nhiều lớp nhỏ làm hệ thống phức tạp hơn — tóm tắt thứ cấp: https://danlebrero.com/2021/02/24/philosophy-of-software-design-summary/. Hệ quả cho repo này: tách file vì có **khái niệm** mới, không vì file dài.

**(b) Repo đang làm gì**

- Ba kiểu cùng tồn tại (bảng đầy đủ ở Phần 2):
  - **phẳng**: `applications/`, `auth/`, `dashboard/`, `question-bank/`, `queue/`
  - **phẳng + `utils/`**: `profile/`, `interview/`, `upskill/`, `salary/`
  - **có `services/`**: `admin/`, `ai/`, `documents/`, `scraper/`, `profile-sources/`, `skills/`, `reconcile/`, `matching/ai/`, `matching/rules/`
- Lệch tên: `companies/service/` và `mock-interview/service/` viết **số ít**, 9 module còn lại viết `services/`.
- Chỗ ráp logic thuần lẫn lộn:
  - có module dùng thư mục `utils/`
  - có module dùng file phẳng `dashboard/dashboard.utils.ts`, `question-bank/question-bank.utils.ts`
  - có module để hàm thuần ngay gốc: `applications/transitions.ts`, `matching/rules/{match-write,requirement-match,staleness}.ts`
- Schema zod nằm ở bốn kiểu chỗ:
  - `documents/schemas/`, `matching/ai/schemas/` (thư mục)
  - `interview/interview.schema.ts`, `upskill/upskill.schema.ts` (file phẳng)
  - `profile-sources/profile-proposal.schema.ts` (file phẳng, tên khác module)
  - `scraper/planning/search-plan.schema.ts` (thư mục riêng)
- `server/README.md:413-421` mô tả `mock-interview/` là "5 file phẳng, không thư mục con". Thực tế nay đã có `service/` và `utils/`, tức tài liệu đã cũ.

**(c) Quy tắc đề xuất**

- **Mặc định phẳng**, theo khuôn `nest g resource`:
  - các file `x.module.ts`, `x.controller.ts`, `x.service.ts`, `x.dto.ts`
  - CLAUDE.md đã chốt một file DTO cho mỗi module, nên không dùng `dto/`
- **Mở thư mục con khi có ≥ 3 file cùng vai** **[quy ước tự chọn]**. Hai file cùng vai thì vẫn để phẳng: `interview/interview-answers.service.ts` cạnh `interview.service.ts` là đúng liều.
- **Tên thư mục cố định, luôn số nhiều**: `services/`, `controllers/`, `utils/`, `schemas/`. Không thêm tên mới (`service/`, `planning/`, `prompt/`) nếu một trong bốn tên trên đã chứa được.
- **Tách file khi** có ít nhất một lý do sau. Đây là CLAUDE.md "chỉ tách hàm khi việc tách có lý do", áp vào cấp file:
  - **(i)** có một khái niệm đặt tên được, ví dụ `transitions.ts`, `job-card.select.ts`
  - **(ii)** được ≥ 2 file khác import
  - **(iii)** file vượt ~300 dòng **và** chứa ≥ 2 trách nhiệm tách được. Mốc 300 lấy theo mặc định ESLint, là **[quy ước tự chọn]**. Một file 485 dòng mà chỉ một trách nhiệm (`ai/services/ai.service.ts`) **không** cần tách.

### 2. Controller

**(a) Nguồn nói gì**

- Controller "responsible for handling incoming requests and sending responses back" — https://docs.nestjs.com/controllers
- Controller "should handle HTTP requests and delegate more complex tasks to providers" — https://docs.nestjs.com/providers
- **Danh tính lấy từ `request.user`** bằng param decorator tự viết, kiểu `@User()` — https://docs.nestjs.com/custom-decorators
- OWASP API1: phải kiểm quyền với bản ghi "in every function that uses an input from the client to access a record" — https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization
- Tham số đường dẫn kiểm bằng pipe, ví dụ `@Param('uuid', new ParseUUIDPipe())` — https://docs.nestjs.com/pipes

**(b) Repo đang làm gì**

- **Tốt:**
  - Mọi route của người dùng lấy `user.id` từ `@CurrentUser()` (`common/decorators/current-user.decorator.ts`). **Không** route nào nhận `userId` từ body.
  - Chỉ một chỗ nhận `userId` từ query: `POST /matches/shortlist/dispatch` (`matching/matching.controller.ts:111-121`). Route này `@Roles('ADMIN')`, nên hợp lệ.
- **ID là `cuid()`, không phải uuid** (23 bảng `@default(cuid())`, 0 bảng `uuid()`), nên `ParseUUIDPipe` **không áp được**. Hiện mọi `@Param('id') id: string` đi thẳng vào Prisma mà không kiểm hình dạng. Không nguy hiểm, vì truy vấn được tham số hoá và id sai thì trả 404. Ngoại lệ tốt là route dùng DTO cho param: `@Param() params: AnswerParamsDto` (`interview/interview.controller.ts:72`) và `LearningKeyDto` (`upskill/learning.controller.ts:27`).
- **Tham số query rời, không qua DTO** (bỏ qua `forbidNonWhitelisted` và mọi validator):
  - `@Query('force') force: string` ở `matching.controller.ts:98,133` và `companies/company.controller.ts:71`
  - `@Query('stream')` ở `profile-sources/profile-draft.controller.ts:69`
  - `@Query('userId')` ở `matching.controller.ts:120`
- **Controller có logic điều phối** (gọi ≥ 2 service, hoặc rẽ nhánh nghiệp vụ):
  - `matching.controller.ts:64-81`: tìm điểm đã có → `markPending` → `queue.send`
  - `upskill/upskill.controller.ts:53-87`: `create` + `queue.send`
  - `companies/company.controller.ts:53-91`: `planRefresh` + rẽ nhánh + `queue.send`
  - `scraper/scraper.controller.ts:36-58`: kiểm portal hợp lệ + `create` + `queue.send`
  - `documents/documents.controller.ts:173-218`: `handOff`, đổi `'en'→'EN'`
  - `profile-draft.controller.ts:63-104`: kiểm mimetype, đổi lỗi PDF
  - `mock-interview/mock-interview.controller.ts:61-124`: hai khối ~25 dòng tự đặt header stream, gần giống nhau
- Sáu controller import `QueueService` trực tiếp: `documents`, `matching`, `upskill`, `companies`, `scraper` (và `health` để đọc số liệu).

**(c) Quy tắc đề xuất**

- **`userId` chỉ đến từ `@CurrentUser()`.** Route admin muốn nhận `userId` của người khác thì phải có `@Roles('ADMIN')`. Đây là luật đang đúng 100%, chỉ cần ghi ra.
- **Mỗi `@Param`/`@Query` đi qua một DTO** (theo mẫu `AnswerParamsDto`), không dùng `@Query('x') x: string`.
  - Cờ boolean dạng chuỗi đổi bằng `@Transform(({ value }) => value === 'true') @IsBoolean()`.
  - Id thì `@IsString() @Length(1, 64)` là đủ. Đừng viết pipe riêng cho cuid khi 404 đã chặn được.
- **Controller không gọi `queue.send`.** "Tạo bản ghi rồi xếp hàng" là MỘT thao tác của service: một method `enqueue(userId, …)` gói cả hai, như `InterviewService.enqueue` (`interview/interview.service.ts:84`) đang làm. Lý do cụ thể: hai đường `generate` và `generate-stream` của upskill hiện mỗi đường tự ráp `create` + `send` theo cách riêng.
- Ống nước stream lặp lại (`mock-interview.controller.ts`) đưa vào `common/` cạnh `streamNdjson` **chỉ khi** có nơi thứ hai dùng luồng chữ thô. Hiện mới có một, nên giữ nguyên.

### 3. Service

**(a) Nguồn nói gì**

- **[quan điểm]** Fowler, Service Layer: "establishes a set of available operations and coordinates the application's response in each operation" — https://martinfowler.com/eaaCatalog/serviceLayer.html
- **[quan điểm]** Fowler, Transaction Script: "Organizes business logic by procedures where each procedure handles a single request" — https://martinfowler.com/eaaCatalog/transactionScript.html. Service của repo này về bản chất là transaction script có kiểu, và thế là đúng liều cho CRUD + gọi AI.
- Mẫu chống IDOR "bắt buộc mang danh tính vào service":
  - Immich: mọi method service nhận `auth` và gọi `await this.requireAccess({ auth, permission: Permission.AlbumRead, ids: [id] })` trước khi làm gì khác — `server/src/services/album.service.ts:77`, https://github.com/immich-app/immich/blob/main/server/src/services/album.service.ts
  - `requireAccess` ném **một** lỗi chung "Not found or no … access" cho cả hai trường hợp — `server/src/utils/access.ts`

**(b) Repo đang làm gì**

- **Tốt:** gần như mọi method đọc/ghi dữ liệu người dùng nhận `userId` làm tham số đầu tiên và đặt nó vào `where`. Danh sách đầy đủ ở Phần 2.
- **Lệch:**
  - `JobsService.list(query, userId)` và `get(id, userId)` (`jobs/jobs.service.ts:75,200`) đặt `userId` ở **cuối**, ngược mọi service khác.
  - `QuestionBankService.ensureAnswer(id, userId)` cũng ngược.
- **Service trả nguyên entity.** `DocumentsService.get` (`documents/services/documents.service.ts:191-199`) trả cả `storageKey`, `modelId`, `error`. Cột `error` được gỡ ở **controller** bằng `withFailureKind`. Nhưng ở `upskill.service.ts:307,315`, `interview.service.ts:316,391` thì việc gỡ nằm ở **service**. Cùng một ranh giới bảo mật (API3) mà nằm ở hai tầng khác nhau.
- **Service to:**
  - `ai.service.ts` 485 dòng
  - `interview.service.ts` 393
  - `documents.service.ts` 355
  - `admin.service.ts` 346
  - `interview-turn.service.ts` 336
  - `matching.service.ts` 334
  - `upskill.service.ts` 317
  - `applications.service.ts` 307

  Đã rà bằng script: method nào **không dùng `this.` dòng nào** thì gần như chỉ còn ở `skills/services/prompt-builder.service.ts` (vốn là seam dựng prompt), `document-renderer.service.ts:106 toHtml`, `profile-synthesizer.service.ts:108 synthesisCall`, `query-planner.service.ts:35`, `interview-turn.service.ts:231 pump`. Tức luật "service chỉ giữ phần chạm DB" đang được giữ khá tốt. Các method `buildPrompt` còn lại dùng `this.prompts`/`this.skills` đã tiêm, nên ở lại service là hợp lý.
- **Code chết:** `ApplicationsService.get` (`applications/applications.service.ts:202`) không có caller nào trong `src/` hay `test/`.

**(c) Quy tắc đề xuất**

- **`userId` luôn là tham số ĐẦU TIÊN** của mọi method service chạm dữ liệu người dùng. Đặt cố định vị trí để người review thấy ngay khi nó thiếu.
- **Làm rõ luật CLAUDE.md "hàm không đụng `this.prisma` thì không thuộc về service":** đọc thành "không đụng **dependency đã tiêm** (`this.prisma`, `this.ai`, `this.queue`, `this.storage`, `this.prompts`…)". 12 service hợp lệ có 0 dòng `this.prisma` vì chúng chạm I/O khác, ví dụ `AiService`, `QueueService`, `PortalCliService`.
- **Method đọc trả "view", không trả entity.** Gỡ `error` và chọn trường xảy ra trong service. Lý do: route mới hoặc sự kiện stream `done` gọi cùng method sẽ không thể quên bước gỡ (xem mục 5).
- **Khi nào tách service thứ hai trong module:** có một nhóm method dùng dependency **khác hẳn**. Ví dụ `DocumentGenerator` cần `AiService` còn `DocumentsService` thì không, và `InterviewAnswersService` tách khỏi `InterviewService`. Không tách theo CRUD (`XReadService`/`XWriteService`). Không thêm tầng repository: Prisma đã là data mapper có kiểu, xem file nghiên cứu cũ mục 1.

### 4. utils

**(a) Nguồn nói gì**

- Logic thuần đặt ngoài tầng chạm I/O để unit test không cần DB — https://martinfowler.com/articles/practical-test-pyramid.html. File nghiên cứu cũ mục 1 đã dẫn.
- Twenty và Immich đều có `utils/` riêng. Ở Immich, `utils/access.ts` chứa hàm nhận repository qua **tham số** chứ không tự tiêm — `requireAccess(access: AccessRepository, request)`.

**(b) Repo đang làm gì**

- Đúng như CLAUDE.md: `utils/` cùng module, `common/` cho hạ tầng dùng chung, eslint chặn `common/` import `modules/`.
- Lệch tên: `dashboard.utils.ts`, `question-bank.utils.ts` (file phẳng), `applications/transitions.ts`, `matching/rules/*.ts` (gốc thư mục).
- Không có `utils/` nào import service. Đã kiểm.

**(c) Quy tắc đề xuất**

- File trong `utils/` **không import `@nestjs/*` trừ exception HTTP, không import `PrismaService`, không import service**. Kiểu Prisma (`import type { Job }`) thì được.
- Đặt tên file theo **khái niệm** (`experience-years.ts`, `skill-gaps.ts`), không theo `x.utils.ts`. File `.prompt.ts` (dựng prompt) cũng nằm trong `utils/`, đúng mẫu mà phần lớn module đang dùng.
- Lên `common/` theo đúng luật CLAUDE.md: ≥ 2 module dùng **và** là hạ tầng, không phải từ vựng nghiệp vụ.

### 5. DTO — đầu vào và đầu ra

**(a) Nguồn nói gì**

- Ba cờ của `ValidationPipe`:
  - `whitelist`: "properties without any decorator in the validation class are removed"
  - `forbidNonWhitelisted`: "will throw an exception"
  - `transform`: bật tự đổi kiểu

  Nguồn: https://docs.nestjs.com/techniques/validation
- Mapped types:
  - `PartialType` làm mọi trường thành tuỳ chọn
  - `PickType` "picking a set of properties"
  - `OmitType` bỏ bớt

  Nguồn: https://docs.nestjs.com/openapi/mapped-types
- Object lồng nhau phải là instance của class thì `@ValidateNested` mới chạy, nên cần class-transformer (`@Type(() => X)`) — https://github.com/typestack/class-validator#validating-nested-objects
- OWASP Input Validation: "Length limits and the characters or structure required by the field" — https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- OWASP Mass Assignment: "Prefer dedicated input objects, such as DTOs, containing only fields the caller may edit" — https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html
- **Đầu ra (API3):**
  - OWASP: "Avoid using generic methods such as `to_json()`… cherry-pick specific object properties"
  - "Keep returned data structures to the bare minimum"
  - "schema-based response validation" là lớp phụ

  Nguồn: https://api-security.owasp.org/editions/2023/en/0xa3-broken-object-property-level-authorization
- `ClassSerializerInterceptor` + `@Exclude` chỉ chạy khi handler "return an instance of the class" — https://docs.nestjs.com/techniques/serialization. Immich đi đường khác: hàm `mapAsset(entity): AssetResponseDto` tường minh — `server/src/dtos/asset-response.dto.ts`.

**(b) Repo đang làm gì**

- **Tốt:**
  - `bootstrap.ts:46-53` bật đủ ba cờ.
  - `ApplyDraftDto = PickType(UpdateProfileDto, …)`.
  - `UpdateProfileDto` có `@MaxLength` cho mọi chuỗi và `@ArrayMaxSize` + `{ each: true }` cho mọi mảng (`profile/profile.dto.ts`).
  - JSON tự do được giới hạn kích thước bằng `@IsBoundedJson` (`profile.dto.ts:131-135`). JSON CV dùng `@IsObject()` ở DTO rồi `parseCvEdit` (zod) ở service (`documents.service.ts:262`). Cách lai này hợp lý: class-validator lo vỏ HTTP, zod lo hình dạng sâu.
- **Đầu ra:**
  - Không dùng `ClassSerializerInterceptor`/`@Exclude` ở đâu cả.
  - Thay vào đó là hằng `select` (`PUBLIC_JOB_FIELDS`, `APPLICATION_JOB`, `APPLICATION_DOCUMENT`) và `omit: WITHOUT_EVIDENCE`.
  - Cách này tốt hơn serializer vì không kéo cột thừa từ DB. Nó đúng tinh thần "cherry-pick" của OWASP.
- **Lỗ nhỏ ở đầu vào:**
  - `jobId` chỉ có `@IsString()`, không giới hạn độ dài: `documents.dto.ts:32,104,110,141`, `matching/matching.dto.ts` (`EvaluateJobDto`). Body vẫn bị chặn ở 100kb (file nghiên cứu cũ mục 4), nên đây là vệ sinh chứ không phải lỗ.
  - `StartScrapeDto.portal` không có `@MaxLength` (`scraper/scraper.dto.ts`).
- **Ép kiểu che DTO:** `profile.controller.ts:54` viết `dto as unknown as UpdateProfileDto` cho `QuickStartProfileDto`, mà DTO này có `occupationCode`, một trường **không có** trong `UpdateProfileDto`. Chỗ nhận là `ProfileService.save(userId, data: Record<string, unknown>)` rồi trải thẳng vào `prisma.profile.upsert`. Hôm nay an toàn vì `forbidNonWhitelisted` đã lọc ở mép. Nhưng kiểu dữ liệu không còn bảo vệ gì nữa: thêm một trường vào DTO là trường đó vào thẳng bảng.
- **Đầu ra trả nguyên entity:**
  - `JobsService.get` dùng `include` (không `select`) → trả mọi cột của `Job`, kể cả `searchText`, `dedupeKey`, `duplicateOfId` (`jobs/jobs.service.ts:202-205`).
  - `DocumentsService.get` trả `storageKey` (dạng `<userId>/cv/…`).
  - Cả hai chỉ lộ dữ liệu của chính người dùng hoặc dữ liệu công khai. Mức độ thấp.

**(c) Quy tắc đề xuất**

- **Mọi `@IsString()` đi kèm `@MaxLength`/`@Length`; mọi `@IsArray()` đi kèm `@ArrayMaxSize`.** Mảng object thì thêm `@ValidateNested({ each: true }) @Type(() => X)`, hoặc nhận `unknown` + zod ở service như `parseCvEdit`. Đã chọn kiểu nào thì nói rõ.
- **DTO cập nhật suy từ DTO gốc** (`PartialType`/`PickType`), không ép kiểu bằng `as unknown as`.
- **Hàm ghi nhận kiểu Prisma** (`Prisma.ProfileUpdateInput`), không nhận `Record<string, unknown>`. Như vậy trường lạ sẽ đỏ lúc compile chứ không lọt vào bảng.
- **Đầu ra = hằng `select` đặt tên** (`X_FIELDS`), không dùng `include` trần cho bảng chính. Không thêm `ClassSerializerInterceptor`, vì đó là cơ chế thứ hai cho cùng vấn đề mà `select` đã chặn.

### 6. Schema zod và schema Prisma

**(a) Nguồn nói gì**

- Zod là "TypeScript-first schema validation with static type inference" — https://zod.dev/. `.transform()` là biến đổi một chiều — https://zod.dev/api
- Nest có `StandardSchemaValidationPipe`, chạy "with Zod, Valibot, ArkType…" — https://docs.nestjs.com/pipes. Immich đã chuyển DTO sang `createZodDto` (`server/src/dtos/asset-response.dto.ts`). Tức dùng zod cho HTTP là một lựa chọn hợp lệ, **không** phải lỗi.
- Prisma:
  - `where` của `findUnique`/`update`/`delete` "exposes all fields on the model, not just unique fields", miễn có ít nhất một trường unique — https://www.prisma.io/docs/orm/reference/prisma-client-reference
  - Tính năng này GA từ 5.0 (`extendedWhereUnique`) — https://github.com/prisma/prisma/releases/tag/5.0.0
  - `updateMany` trả `{ count }`, cùng trang reference

**(b) Repo đang làm gì**

- class-validator cho HTTP, zod cho output model (ADR 0017) và cho JSON sâu người dùng gửi (`parseCvEdit`). Ranh giới rõ, không cần đổi.
- Vị trí file schema đang có bốn kiểu (mục 1).

**(c) Quy tắc đề xuất**

- **Không chuyển DTO HTTP sang zod.** Hai thư viện cho hai việc là quyết định đã có. Đổi chỉ để thống nhất là chi phí không chặn lỗi nào.
- Schema zod của output model đặt ở `schemas/<khái niệm>.schema.ts` khi module có ≥ 2 schema. Có một schema thì để phẳng `<module>.schema.ts`. Đặt tên biến `<khái niệm>Schema`, kiểu `type X = z.infer<typeof xSchema>`.
- Prisma schema một file duy nhất (`prisma/schema.prisma`), giữ nguyên.

### 7. Security / IDOR bên trong module

**(a) Nguồn nói gì**

- **Kiểm ở mọi hàm, không chỉ ở route**:
  - "check if the logged-in user has access to perform the requested action on the record" — https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization
  - "Permission should be validated correctly on every request"; mặc định từ chối — https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- **ID khó đoán không phải phòng thủ.** OWASP khuyên dùng id ngẫu nhiên, nhưng đặt nó **cạnh** việc kiểm quyền chứ không thay thế (cùng trang API1). Cheat sheet có hẳn mục "Ensure Lookup IDs are Not Accessible Even When Guessed".
- **Không lộ sự tồn tại.**
  - Google AIP-211 trả `PERMISSION_DENIED` cho mọi trường hợp chưa qua kiểm quyền, kể cả khi bản ghi không tồn tại — https://google.aip.dev/211
  - Immich trả **một** lỗi 400 "Not found or no … access" (`server/src/utils/access.ts`)
  - Cách nào cũng được, miễn **hai trường hợp ra cùng một phản hồi**
- **Khoá trong `where`**: đưa `userId` vào chính truy vấn. Với Prisma ≥ 5, có thể viết `update({ where: { id, userId } })` (nguồn ở mục 6). Lỗi không thấy là `P2025`, mà repo đã đổi thành 404.
- **Tài nguyên lồng**: kiểm ở gốc sở hữu, rồi đi xuống bằng khoá đó. Ví dụ `interviewPrep` theo `userId_jobId`, không theo id riêng.
- Rate limit cho route đắt, admin bằng role guard: file nghiên cứu cũ mục 4 đã bàn.

**(b) Repo đang làm gì** — chi tiết từng route ở Phần 2.

- Mọi route có `:id` của dữ liệu người dùng đều khoá theo `userId` trong service. Không thấy route nào để lộ dữ liệu người khác.
- Phản hồi cho "không có" và "không phải của bạn" đều là **404 cùng câu**. Ví dụ `documents.service.ts:191-199` dùng `findFirst({ where: { id, userId } })`.
- Có e2e "người khác → 404" cho: documents (`security.e2e-spec.ts:133-140`, `documents-cv-edit.e2e-spec.ts:337`, `documents-cv-template.e2e-spec.ts:242,253`), applications (`applications.e2e-spec.ts:175,225`), profile drafts (`profile-draft.e2e-spec.ts:387`), upskill (`upskill.e2e-spec.ts:97`), mock interview (`mock-interview-turn.e2e-spec.ts:178`), interview answers, learning.
- **Mẫu "đọc kiểm sở hữu, rồi `update({ where: { id } })`"** xuất hiện ở `documents.service.ts:232,277`, `profile-draft.service.ts:131,166`. Hôm nay an toàn vì `userId` của bản ghi không bao giờ đổi. Nhưng nó là hai bước, và bước sau không mang khoá.

**(c) Quy tắc đề xuất**

- **Ghi theo id thì `where` mang `userId`**: `update({ where: { id, userId } })`. Prisma ≥ 5 cho phép, và `P2025` đã thành 404. Bước đọc trước đó chỉ còn để kiểm trạng thái, không còn gánh việc kiểm quyền.
- **Method service mà HTTP gọi tới với một id thì PHẢI nhận `userId`**, kể cả khi controller đã kiểm trước. Ca cụ thể: `synthesize-stream` ở Phần 2.
- **Mỗi route mới có `:id` thì có một e2e "người khác → 404"** và assert `harness.ai.calls` rỗng nếu route gọi model (mẫu `security.e2e-spec.ts:142-157`). CLAUDE.md đã đòi test cho route mới; đây chỉ nói rõ test đó phải kiểm cái gì.
- **Không coi cuid là phòng thủ.** Không đổi sang uuid chỉ để dùng `ParseUUIDPipe`.

### 8. Test cho từng tầng

CLAUDE.md đã đủ luật: "một test cho một hành vi, ở tầng chứng minh được nó". Tóm lại theo tầng:

- **controller + service + quyền sở hữu** → e2e trên Postgres thật
- **utils** → unit
- **schema zod** → unit qua `FakeAi`

Chỉ thêm hai điểm:

- **Thư mục test phản chiếu `src/` theo đúng tên.** `test/unit/modules/mock-interview/mock-interview.utils.spec.ts` đang trỏ tới file nay là `utils/mock-interview.ts`. `test/unit/modules/companies/service/` sẽ phải đổi cùng lúc nếu đổi tên `service/` → `services/`.
- Đừng unit-test controller để soi nó truyền `user.id`. Một e2e "người khác → 404" chứng minh điều đó ở đúng tầng.

---

## Phần 2 — Khảo sát 24 module

### 2.1 Bố cục

| Module | Bố cục | File lớn nhất (dòng) | Chỗ lệch |
|---|---|---|---|
| admin | `controllers/` `services/` `utils/`, `admin.dto.ts` | `services/admin.service.ts` 346 | Module duy nhất có `controllers/` (5 controller), hợp lý theo ngưỡng ≥ 3 |
| ai | `services/` `utils/` `providers/` | `services/ai.service.ts` 485 | Dài nhưng một trách nhiệm (seam `Ai`), không tách |
| applications | phẳng | `applications.service.ts` 307 | `transitions.ts` thuần ở gốc; `get()` :202 là code chết |
| auth | phẳng | `auth.service.ts` 160 | — |
| companies | `service/` `utils/` | `service/company.service.ts` 265 | **`service/` số ít**; controller tên `company.controller.ts` trong module `companies`; controller gọi `queue.send` |
| dashboard | phẳng | `dashboard.service.ts` 248 | `dashboard.utils.ts` phẳng thay vì `utils/` |
| documents | `services/` `schemas/` `templates/` `pdf/` `utils/` | `services/documents.service.ts` 355 | `withFailureKind` ở controller; `get` trả `storageKey` |
| health | phẳng | 33 | — |
| interview | phẳng + `utils/` | `interview.service.ts` 393 | Gần ngưỡng; `interview.schema.ts` phẳng (đúng, một schema) |
| jobs | phẳng + `utils/` `taxonomy/` | `taxonomy/sub-occupations.ts` 664 (dữ liệu) | `userId` đứng cuối chữ ký; `get` dùng `include` trần |
| matching | `ai/{services,schemas,utils,prompt}` `rules/{services}` | `ai/services/matching.service.ts` 334 | `prompt/` là tên lạ; `rules/*.ts` thuần ở gốc `rules/`; controller có logic + `@Query` rời |
| mock-interview | `service/` `utils/` | `service/interview-turn.service.ts` 336 | **`service/` số ít**; README:413 đã cũ; controller tự làm ống stream |
| profile | phẳng + `utils/` | `profile.dto.ts` 158 | `as unknown as UpdateProfileDto` :54; `save(data: Record<string, unknown>)` |
| profile-sources | `services/` `utils/` | `profile-draft.controller.ts` 183 | `synthesize-stream` kiểm quyền ở controller; `retry` đọc-rồi-update |
| question-bank | phẳng | `question-bank.service.ts` 162 | `question-bank.utils.ts`, `question-answer.prompt.ts` phẳng |
| queue | phẳng | `queue.service.ts` 176 | — (hạ tầng) |
| reconcile | `services/` | `services/reconcile.service.ts` 170 | Hai file mà có thư mục (dưới ngưỡng 3), vô hại |
| salary | phẳng + `utils/` | `utils/negotiation.ts` 220 | — |
| sandbox | phẳng | `docker.sandbox.ts` 179 | — (seam) |
| scraper | `services/` `utils/` `planning/` | `services/scraper.service.ts` 272 | `planning/` chứa prompt + schema; controller kiểm portal + `queue.send` |
| semantic | phẳng | 62 | — |
| skills | `services/` `utils/` | `services/prompt-builder.service.ts` 181 | — |
| storage | phẳng | `r2.storage.ts` 111 | — (seam) |
| upskill | phẳng (3 service, 2 controller) + `utils/` | `upskill.service.ts` 317 | Đủ ngưỡng `services/` nhưng chưa có; controller `create` + `queue.send` |

Không thấy DTO nào khai trong controller. Đã grep `class .*Dto` ngoài `*.dto.ts`: 0 kết quả.

### 2.2 Rà IDOR — mọi route nhận id

Ký hiệu: **OK** nghĩa là khoá theo `userId` ở đúng chỗ ghi. **Chung** nghĩa là dữ liệu dùng chung, không có chủ.

| Route | Khoá ở đâu | Kết luận |
|---|---|---|
| `GET /documents/:id`, `/:id/source`, `/:id/pdf` | `documents.service.ts:191-199` `findFirst({id,userId})`; `source`/`pdf`/`previewHtml` đều qua `get` | OK |
| `PUT /documents/:id/template`, `PUT /:id/cv`, `POST /:id/preview` | `get(userId,id)` rồi `update({where:{id}})` :232,:277 | OK (hai bước, xem 7c) |
| `POST /documents/:id/generate-stream` | `document-generator.service.ts:55-77` `updateMany({id,userId,…})` + `findFirst({id,userId})` | OK |
| `POST /documents/cv`, `/cover-letter`, `/application-email` (`jobId` trong body) | `Job` là bảng chung; document tạo với `userId` của token | Chung, OK |
| `PUT /applications/:id/status` | `applications.service.ts:234-255` `findFirst({id,userId})` + `updateMany({id,userId,status})` | OK |
| `PUT /applications/:id/interview-date` | `:281` `updateMany({id,userId})` + kiểm `count` | OK (mẫu tốt nhất) |
| `POST /applications` (`jobId`) | `:50` `jobMatch.findUnique({userId_jobId})` | OK |
| `GET /jobs/:id`, `POST/DELETE /jobs/:id/save` | Job chung; quan hệ lọc `where:{userId}` (`jobs.service.ts:62-66`); `savedJob` theo `userId_jobId` (:250,:258) | OK |
| `GET /public/jobs/:id` | `PUBLIC_JOB_DETAIL_SELECT` | Chung, OK |
| `GET /matches/:jobId`, `POST /matches/evaluate`, `POST /evaluate-stream/:jobId` | `matching.service.ts:237,302,313,320` khoá `userId`(+`jobId`) | OK |
| `POST /matches/requirements/:jobId`, `/shortlist/dispatch?userId=` | `@Roles('ADMIN')` | OK (admin) |
| `GET /mock-interviews/:id`, `POST /:id/turn` | `mock-interview.service.ts:46-60` `findFirst({id,userId})`; `interview-turn.service.ts:178` `updateMany({id,userId,status})` | OK |
| `POST /mock-interviews` (`jobId`) | job chung; dossier khoá `userId_jobId` (`mock-interview.service.ts:129`) | OK |
| `GET /profile-drafts/:id`, `/:id/file`, `PUT /:id/apply` | `profile-draft.service.ts:96-103` `findFirst({id,userId})` | OK |
| `POST /profile-drafts/:id/retry` | `:113` `findFirst({id,userId})` rồi `update({where:{id}})` :131 | OK về quyền; **lệch CLAUDE.md** "giành chỗ có điều kiện" (đọc-rồi-update, hai request cùng `FAILED` đều qua) |
| `POST /profile-drafts/:id/synthesize-stream` | Controller gọi `drafts.get(user.id,id)` (`profile-draft.controller.ts:150`) rồi `synthesizer.streamSynthesize(id)`. Service **không nhận `userId`**: `start` dùng `updateMany({where:{id}})` (`profile-synthesizer.service.ts:36,82-96`) | **NGHI NGỜ (dễ vỡ, chưa phải lỗ)**: quyền chỉ nằm ở một dòng trong controller. Xoá hoặc dời dòng đó là người khác chạy được model trên CV của người khác. Chưa có e2e người-khác cho route này |
| `GET /upskill/:id` | `upskill.service.ts:310-315` `findFirst({id,userId})` | OK |
| `POST /upskill/generate`, `/generate-stream` (`jobId`) | `create(userId,…)` rồi `streamGenerate(report.id)` (không `userId`); `collectJobs` khoá `userId_jobId` (:66) | OK (id vừa tạo cho chính user). Chữ ký thiếu `userId`, cùng loại với dòng trên nhưng không khai thác được qua HTTP |
| `GET /interview/:jobId`, `PUT|POST /interview/:jobId/answers/...` | `interview.service.ts:293`, `interview-answers.service.ts:34-35,52-54` khoá `userId_jobId` | OK |
| `POST /interview/prep` (`jobId`) | `interview.service.ts:95-106` khoá `userId_jobId` | OK |
| `PUT|DELETE /learning/:key` | `learning.service.ts:61-62,72-73` `userId_skillKey` / `deleteMany({userId,skillKey})` | OK |
| `POST /question-bank/:id/answer` | Câu hỏi và đáp án dùng chung; `userId` chỉ để ghi `ai_calls` | Chung, OK |
| `GET|POST /companies/brief/by-job/:jobId[/stream]` | Bản tóm tắt công ty dùng chung | Chung. **Ghi chú (API6, không phải IDOR):** `force` cho mọi tài khoản chạy lại model cho mọi công ty, trong hạn `@ThrottleAi()`; `planRefresh` không nhận `userId` nên `ai_calls` không quy được chi phí về ai |
| `POST /scrape` | Mọi người dùng đã đăng nhập; `@ThrottleScrape()` 3/giờ | **NGHI NGỜ (API5/API6, cần chủ dự án xác nhận ý định):** người dùng thường kích được lượt quét portal thật, có thể làm portal chặn IP (ADR 0005) |
| `/admin/**`, `/skills/**`, `GET /queue/stats` | `@Roles('ADMIN')` ở class | OK |
| `GET /salary/positions/:slug` | `@Public`, dữ liệu chung | OK |

**Kết luận:** chưa thấy lỗ IDOR khai thác được. Có hai chỗ **dễ vỡ** (`synthesize-stream`, `retry`) và một chỗ cần quyết định về quyền chức năng (`POST /scrape`).

### 2.3 DTO và phản hồi

- **Thiếu giới hạn độ dài:** `jobId` ở 5 DTO (`documents.dto.ts:32,104,110,141`, `matching.dto.ts` `EvaluateJobDto`), `StartScrapeDto.portal`.
- **`@Query`/`@Param` rời không qua DTO:** 5 chỗ (mục 2b). Mọi `@Param('id')`: 20 route.
- **`@IsBoundedJson` cho `experiences`/`educations`/…** chỉ chặn kích thước, không chặn hình dạng. Hình dạng sai thì vào thẳng `profile` rồi đi vào prompt. Chấp nhận được nếu FE là client duy nhất. Ghi ra để chủ dự án quyết.
- **Trả nguyên entity:** `JobsService.get` (`include` trần), `DocumentsService.get`/`setTemplate`/`updateCv` (cả bản ghi `Document` trừ `error`). Không có trường nào của người khác. `passwordHash` không lọt ra đâu cả: `AuthService.sign` dựng `user` tay (`auth.service.ts:142-147`), admin users dùng `select`.

---

## Phần 3 — Quy tắc đề xuất cho CLAUDE.md và việc sửa

### 3.1 Đoạn đề xuất thêm vào "Cách viết code trong `server/src`" (~15 dòng)

> **Bên trong một module.** Mặc định phẳng: `x.module.ts`, `x.controller.ts`, `x.service.ts`, `x.dto.ts`, `x.schema.ts`. Mở thư mục con khi có từ 3 file cùng vai, và chỉ dùng bốn tên số nhiều: `services/`, `controllers/`, `utils/`, `schemas/`. File `.prompt.ts` nằm trong `utils/`. Tách file khi có khái niệm đặt tên được, hoặc ≥ 2 nơi import, hoặc file quá ~300 dòng mà có ≥ 2 trách nhiệm. Dài mà một trách nhiệm thì để yên.
>
> **Controller chỉ map HTTP ↔ một lời gọi service.** Không `queue.send`, không rẽ nhánh nghiệp vụ. "Tạo rồi xếp hàng" là một method `enqueue(userId, …)` của service. Mọi `@Param`/`@Query` đi qua DTO; không viết `@Query('force') force: string`.
>
> **`userId` chỉ đến từ `@CurrentUser()` và luôn là tham số ĐẦU TIÊN của method service.** Method nào HTTP gọi tới kèm một id thì nhận `userId`, kể cả khi controller đã kiểm trước. Ghi theo id thì `where` mang `userId`: `update({ where: { id, userId } })` (Prisma ≥ 5 cho phép, `P2025` thành 404). "Không có" và "không phải của bạn" ra cùng một 404.
>
> **Service trả view, không trả entity:** `select` theo hằng `X_FIELDS`, gỡ `error` bằng `withFailureKind` ngay trong service. Không dùng `include` trần cho bảng chính, không thêm `ClassSerializerInterceptor`. "Không đụng `this.prisma`" ở trên nghĩa là không đụng dependency đã tiêm nào (prisma, ai, queue, storage, prompts).
>
> **DTO:** mọi `@IsString()` kèm `@MaxLength`, mọi `@IsArray()` kèm `@ArrayMaxSize`. DTO con suy bằng `PickType`/`PartialType`, không `as unknown as`. Hàm ghi nhận kiểu `Prisma.XUpdateInput`, không nhận `Record<string, unknown>`.

### 3.2 Việc sửa, xếp ưu tiên

| # | Việc | Loại | File chạm (ước lượng) |
|---|---|---|---|
| 1 | `ProfileSynthesizerService.streamSynthesize/start` nhận `userId`, `updateMany` thêm `userId` vào `where`; bỏ dòng kiểm ở controller; thêm e2e "người khác → 404 và `ai.calls` rỗng" cho `synthesize-stream` | Bảo mật (dễ vỡ) | 3 (`profile-synthesizer.service.ts`, `profile-draft.controller.ts`, `profile-draft.processor.ts`) + 1 e2e |
| 2 | `ProfileDraftService.retry`: đổi đọc-rồi-update thành `updateMany({ id, userId, status: 'FAILED' })`, `count === 0` → 404/400 | Đúng đắn (CLAUDE.md "giành chỗ") | 1 + 1 e2e |
| 3 | Chủ dự án xác nhận `POST /scrape` có dành cho người dùng thường không; nếu không thì thêm `@Roles('ADMIN')` | Bảo mật (API5) | 1 + 1 e2e |
| 4 | e2e "người khác → 404" cho `GET /profile-drafts/:id/file` (file CV gốc, PII nặng nhất) và `/:id/retry` | Bảo mật (test) | 1 e2e |
| 5 | Ghi theo id mang `userId`: `documents.service.ts:232,277`, `profile-draft.service.ts:131,166` → `update({ where: { id, userId } })` | Bảo mật (chiều sâu) | 2 |
| 6 | `@MaxLength` cho `jobId` (5 DTO) và `portal`; thay 5 chỗ `@Query('x')` rời bằng DTO | Vệ sinh đầu vào | 4 DTO + 4 controller |
| 7 | `quickStart`: `QuickStartProfileDto` khai lại bằng `PickType`, hoặc `ProfileService.save` nhận `Prisma.ProfileUncheckedUpdateInput`; bỏ `as unknown as` | Mass assignment (kiểu) | 2–3 |
| 8 | Dời `queue.send` khỏi controller vào `service.enqueue` (upskill, matching, companies, scraper, documents `handOff`) | Cấu trúc | 5 controller + 5 service |
| 9 | `withFailureKind` dời hết vào service (documents, matching, mock-interview, profile-draft); `JobsService.get` chuyển `include` → `select` hằng | API3 | ~8 |
| 10 | `userId` lên đầu: `JobsService.list/get`, `QuestionBankService.ensureAnswer` | Đổi chữ ký | 3 + caller |
| 11 | Đổi `companies/service/` → `services/`, `mock-interview/service/` → `services/`; sửa `server/README.md:413-421` | Đổi tên | ~8 (5 src + 3 test) + README |
| 12 | Gỡ `ApplicationsService.get` (code chết) | Dọn | 1 |
| 13 | Tuỳ chọn, chỉ khi đụng tới module đó: `dashboard.utils.ts`, `question-bank.utils.ts` → `utils/<khái niệm>.ts`; upskill gom 3 service vào `services/`; `matching/ai/prompt/` → `utils/` | Đổi tên | mỗi việc 2–6 |

Việc 1–5 nên làm trước, mỗi việc một PR nhỏ kèm `git diff --numstat -- server/src` theo CLAUDE.md. Việc 8–13 chỉ làm **khi đang sửa module đó vì lý do khác**, theo nguyên tắc "giữ phạm vi đúng mục được giao".

**Cố ý KHÔNG đề xuất:**
- tầng repository
- CQRS hay use-case class kiểu Novu
- `ClassSerializerInterceptor`
- chuyển DTO sang zod
- pipe riêng cho cuid
- tách `ai.service.ts`

Không có số đo hay ca lỗi nào trong repo đòi những thứ đó. Mỗi thứ là cơ chế thứ hai cho một vấn đề đã có cơ chế chặn.

---

## Nguồn chính đã đọc

- NestJS:
  - https://docs.nestjs.com/recipes/crud-generator
  - https://docs.nestjs.com/controllers
  - https://docs.nestjs.com/providers
  - https://docs.nestjs.com/custom-decorators
  - https://docs.nestjs.com/pipes
  - https://docs.nestjs.com/guards
  - https://docs.nestjs.com/techniques/validation
  - https://docs.nestjs.com/openapi/mapped-types
  - https://docs.nestjs.com/techniques/serialization
- class-validator: https://github.com/typestack/class-validator#validating-nested-objects
- Immich:
  - `server/src/utils/access.ts`
  - `server/src/repositories/access.repository.ts`
  - `server/src/services/base.service.ts`
  - `server/src/services/album.service.ts`
  - `server/src/dtos/asset-response.dto.ts`

  Gốc: https://github.com/immich-app/immich/tree/main/server/src
- Twenty: https://github.com/twentyhq/twenty/tree/main/packages/twenty-server/src/engine/core-modules/api-key
- Novu: https://github.com/novuhq/novu/tree/next/apps/api/src/app/subscribers
- Prisma:
  - https://www.prisma.io/docs/orm/reference/prisma-client-reference
  - https://github.com/prisma/prisma/releases/tag/5.0.0
- OWASP:
  - https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization
  - https://api-security.owasp.org/editions/2023/en/0xa3-broken-object-property-level-authorization
  - https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html
  - https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
  - https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Google AIP-211: https://google.aip.dev/211
- Zod:
  - https://zod.dev/
  - https://zod.dev/api
- ESLint `max-lines`: https://eslint.org/docs/latest/rules/max-lines
- Fowler:
  - https://martinfowler.com/eaaCatalog/serviceLayer.html
  - https://martinfowler.com/eaaCatalog/transactionScript.html
- Ousterhout (tóm tắt thứ cấp): https://danlebrero.com/2021/02/24/philosophy-of-software-design-summary/
