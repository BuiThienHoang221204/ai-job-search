# Kế hoạch dọn backend: cấu trúc module, bảo mật, rút gọn logic

Ngày 2026-10-16. Gộp ba nguồn:

- `docs/research-backend-module-structure.md`: cách tổ chức bên trong module, rà IDOR (gọi tắt **[MS]**).
- `docs/research-backend-simplicity.md`: 18 dấu hiệu over-engineering, cách đo (gọi tắt **[SI]**).
- Bốn bản khảo sát over-engineering theo nhóm module (A: ai/matching/skills/queue/…, B: documents/profile/applications/auth/companies, C: admin/interview/mock-interview/question-bank/upskill/dashboard, D: jobs/salary/scraper). Mọi khẳng định "không ai gọi" trong đó đã được grep trên `server/src`, `server/test` và hai repo giao diện.

Chưa sửa dòng code nào. Kế hoạch chờ chủ dự án duyệt.

## Trả lời câu hỏi "sao logic cứ dài và phức tạp"

**Phần lớn KHÔNG phải over-engineering.** Đo bằng ESLint `complexity` (ngưỡng mặc định 20), cả repo chỉ 3 hàm vượt, và cả ba là phức tạp vốn có của bài toán:

| Hàm | Độ phức tạp | Vì sao |
|---|---:|---|
| `config/configuration.ts` | 44 | Mỗi biến môi trường một nhánh mặc định |
| `salary/utils/negotiation.ts` `negotiationRange` | 36 | Công thức lương, đo trên 804 tin |
| `matching/rules/requirement-match.ts` `matchRequirements` | 23 | Luật đối chiếu yêu cầu |

Đoạn dài nhất trong service là các cơ chế chặn lỗi đã từng xảy ra thật và có ADR ghi số đo, nên **giữ**:
- `ModelChain`, ép định dạng đầu ra, thứ tự timeout (ADR 0011–0013);
- giành chỗ có điều kiện, `ReconcileService`, khoá chống trùng hàng đợi;
- nhịp gọi portal, cách gom tin (ADR 0005, 0007).

Phần thừa thật sự tổng cộng khoảng **~650 dòng code chạy** trên khoảng 18.000 dòng service + utils (~4%), cộng **~450 dòng test** chỉ còn kiểm code chết. Nó rơi vào bốn loại:

1. **Code chết sót lại sau khi gỡ tính năng.** Ví dụ: bộ dựng văn bản embedding, liệt kê model, ba method của `Storage`, `ApplicationsService.get`, `trimToolOutput` của module `agent/` cũ.
2. **Tham số hoặc mặc định không ai dùng**, hoặc khai 2–3 nơi. Có chỗ còn lệch nhau: `systemQueryLimit` mang ba giá trị.
3. **Hàm bọc một dòng hoặc khung hai đường** còn lại sau khi một đường đã bỏ (`InterviewService`, `DocumentComposer`, `job-view.ts`).
4. **Gom, đếm, sắp xếp bằng JS** khi Prisma làm được trong một câu.

## Nguyên tắc chạy kế hoạch

- **Mỗi đợt một nhóm commit nhỏ.** Commit cấu trúc (xoá, inline) tách khỏi commit đổi hành vi, theo Beck, *Tidy First?* ([SI] §4).
- **Trước khi sửa:** `pnpm lint && pnpm test && pnpm test:e2e` phải xanh.
- **Sau mỗi đợt:**
  - `git diff --numstat -- server/src server/test` phải **âm** ở đợt 2–3.
  - Ở đợt 1, nếu tăng thì chỉ tăng đúng phần chặn lỗi cộng test cho chính lỗi đó.
- **Không thêm** tầng repository, CQRS, `ClassSerializerInterceptor`, zod cho DTO HTTP, hay tách `ai.service.ts` ([MS] §3.2).
- **Ước lượng số dòng là của người khảo sát.** Số thật báo sau từng đợt.

---

## Đợt 0 — Chủ dự án cần quyết trước (không code)

**Đã chốt 2026-10-16:** Q1 chỉ ADMIN · Q2 dùng **30** (sửa `.env.example` và ADR 0007 theo) · Q3 chấp nhận cần restart · Q4 giữ router · Q5 kiểm DB rồi quyết · Q6 bỏ cache.

| # | Câu hỏi | Đề xuất | Ảnh hưởng |
|---|---|---|---|
| Q1 | `POST /scrape`: mọi user đăng nhập đang được quét portal thật (3 lượt/giờ), dễ làm IP server bị chặn (ADR 0005). Giữ hay chỉ ADMIN? | Chỉ ADMIN | Việc 1.5 |
| Q2 | `SCRAPER_SYSTEM_QUERY_LIMIT` đang là **30** (`configuration.ts:110`), **20** (`.env.example:265`, ADR 0007), **10** (vế `??` ở `scraper.service.ts:51`, không bao giờ chạy). Chọn số nào? | 20, đúng như ADR viết | Việc 1.7 |
| Q3 | Concurrency hàng đợi đổi qua admin **không có tác dụng tới khi khởi động lại**: `localConcurrency` chỉ đọc một lần lúc `boss.work` (`queue.service.ts:159-165`). Màn `/queues` lại hiện số mới. Chấp nhận "cần restart" hay làm cho đổi được thật? | Chấp nhận, sửa ADR 0010 + ghi chú trên màn admin | Việc 1.8 |
| Q4 | `JobSourceRouter`: seam chỉ một adapter. ADR 0005 cố ý giữ làm chỗ cắm nguồn mới. Bỏ hẳn được thêm ~55 dòng nhưng phải sửa ADR | Giữ, chỉ bỏ cảnh báo khoá trùng (việc 2.9) | — |
| Q5 | Mock-interview: bỏ cột lọc `workflow` (luôn là `'interview'`)? Cần chạy `select workflow, count(*) from agent_runs group by 1` trên DB thật trước | Ép cứng `workflow: 'interview'` trong `where` nếu còn run cũ, bỏ hẳn nếu không | Việc 3.9 |
| Q6 | Giữ cache 10 phút ở `SalaryService.positionIndex`? Chưa có số đo nào, và cache không bị xoá sau khi crawl lại | Bỏ | Việc 3.12 |

---

## Đợt 1 — Lỗi thật và bảo mật (làm trước, mỗi việc kèm test)

Đợt này được phép **tăng** dòng, nhưng chỉ đúng phần chặn lỗi.

| # | Việc | Loại | File / test | Ước lượng |
|---|---|---|---|---|
| 1.1 | **`trimToolOutput` cắt câu trả lời của người dùng.** `GET /mock-interviews/:id` trả câu trả lời (tối đa 4.000 ký tự) bị cắt còn 500, kèm "[cắt N ký tự]". FE đọc đúng trường đó (`ui-ai-job-search/lib/interview-transcript.ts:32`). Hàm là đồ sót của module `agent/` đã xoá. **Đã kiểm lại:** `mock-interview.service.ts:69` + `TEXT_LIMIT = 500` | Lỗi | Bỏ `trimToolOutput`, `TEXT_LIMIT`. e2e: trả lời 1.000 ký tự, `GET` trả đủ | −17 src, −40 test unit, +~10 e2e |
| 1.2 | **`synthesize-stream` chỉ kiểm sở hữu ở controller.** `streamSynthesize(id)` không nhận `userId`, `updateMany({ where: { id } })`. Xoá dòng `drafts.get` ở `profile-draft.controller.ts:150` là ai cũng chạy được model trên CV người khác. **Đã kiểm lại** | Bảo mật (dễ vỡ) | `profile-synthesizer.service.ts`, controller, processor. e2e user khác → 404, `ai.calls` rỗng | ~+5 src, +~15 e2e |
| 1.3 | **`ProfileDraftService.retry` đọc rồi `update({ where: { id } })`**, nên hai lần bấm cùng lúc đều xếp việc. Đổi sang `updateMany({ id, userId, status: 'FAILED' })`, `count === 0` → 400/404. Code **ngắn đi** | Đúng đắn | `profile-draft.service.ts:112-139`. e2e hai request song song | ~−5 src, +~15 e2e |
| 1.4 | **Khoá hàng đợi `COMPANY_BRIEF` tách theo `force`/`cache`** (`queue-key.ts:73-77`), trong khi `CompanyProcessor` bỏ qua `force` (`company.processor.ts:23`). Hai lượt cho cùng công ty chạy song song, tốn gấp đôi Serper và model. Khoá chỉ còn `nameKey`. **Đã kiểm lại.** Xem ADR 0010 | Chi phí | `queue-key.ts`, `queue-key.spec.ts` | ~−2 src |
| 1.5 | (Theo Q1) `@Roles('ADMIN')` cho `POST /scrape` | Bảo mật (API5) | controller + e2e | ~+1 src |
| 1.6 | **Ghi theo id phải mang `userId`:** `documents.service.ts:232,277`, `profile-draft.service.ts:131,166` → `update({ where: { id, userId } })` (Prisma ≥ 5). Kèm e2e "người khác → 404" cho `GET /profile-drafts/:id/file` (file CV gốc, PII nặng nhất) | Bảo mật (chiều sâu) | 2 file src + 1 e2e | ~0 src |
| 1.7 | (Theo Q2) Mặc định cấu hình chỉ khai ở `configuration.ts`. Bỏ vế `?? x` ở `scraper.service.ts:38-53`, `portal-cli.service.ts:161-163`, `admin-scrape.service.ts:47`, `ai-shortlist.service.ts`. Sửa `.env.example` và ADR 0007 cho khớp | Nhất quán | 4–5 src + `.env.example` | ~−10 src |
| 1.8 | (Theo Q3) Bỏ timer 30 giây và nhánh đọc env `<QUEUE>_CONCURRENCY` (code chết, vì DB luôn được seed đủ). Sửa ADR 0010. Bỏ `QUEUE_CONCURRENCY` khỏi `.env.example` | Hiển thị sai | `queue.service.ts`, `queue.defaults.ts`, `concurrency.spec.ts` | −20 src, −20 test |
| 1.9 | `quickStart`: bỏ `as unknown as UpdateProfileDto` (`profile.controller.ts:54`); `ProfileService.save` nhận `Prisma.ProfileUncheckedUpdateInput` thay vì `Record<string, unknown>` | Mass assignment (kiểu) | 2–3 | ~0 |
| 1.10 | `@MaxLength` cho `jobId` (5 DTO) và `portal`; 5 chỗ `@Query('x')` rời chuyển vào DTO | Vệ sinh input | 4 DTO + 4 controller | ~+15 |

**Tiến độ 2026-10-16:**
- **Xong:** 1.1, 1.2, 1.3, 1.4, 1.6, 1.7 (`SCRAPER_SYSTEM_QUERY_LIMIT` = 30, sửa `.env.example` + ADR 0007), 1.8 (sửa ADR 0010 + `.env.example`), 1.9 (kiểu chặt hơn bắt được `experienceLevel: string` và các cột JSON khai `unknown` trong DTO).
- **1.10 một phần:** `@MaxLength` cho 10 trường `jobId` và `portal`. Không tách DTO cho 5 query rời: chúng là cờ so với `'true'` hoặc nằm trên route admin, thêm DTO không chặn được lỗi nào.
- **1.5 xong** sau khi chủ dự án xác nhận lại (test cũ ghim route mở cho người dùng thường đã được thay bằng test 403; không FE nào gọi route này). Kèm sửa `pnpm db:up` thành `docker compose up -d postgres`: bản cũ dựng mọi service, kể cả `app` chiếm cổng 3000.
- Số dòng đợt 1: `src` +75 −107 (ròng −32), `test` +99 −97 (+2). Unit 1578/1578, e2e 368/368, build sạch.

**Ngoài phạm vi, chỉ ghi lại:**
- Mock-interview gọi `AI_FAST_MODEL_ID` trực tiếp, không qua `fastModelChain`, nên không có chuỗi dự phòng (ADR 0012).
- `QuestionBankService.ensureAnswer` không giành chỗ, nên hai request cùng lúc gọi model hai lần.

Cả hai là **thiếu** cơ chế, không phải thừa. Làm thì mở việc riêng.

---

## Đợt 2 — Xoá code chết (không đổi hành vi, an toàn nhất)

Mỗi mục đã grep: không có chỗ gọi nào ngoài chính nó và test của nó.

| # | Việc | Vị trí | Giảm src / test |
|---|---|---|---|
| 2.1 | Xoá `semantic/embed-text.ts` cả file (embedding cho tin/hồ sơ đã bỏ; chỉ còn embed kỹ năng) | `semantic/embed-text.ts` + spec | −59 / −114 |
| 2.2 | Xoá `ModelCatalogService.listModels`, `toListing`, `ModelListing`, `CatalogModel.tool_call`; bỏ `ModelCatalogService` khỏi `exports` (route đã gỡ ở `77a6753`) | `model-catalog.service.ts:257-280`, `catalog.ts:63-91`, `ai.types.ts` | −60 / −10 |
| 2.3 | `Storage` chỉ giữ `read` và `write`. Xoá `exists`, `list`, `delete`; `readText` viết thẳng ở chỗ gọi duy nhất | `r2.storage.ts`, `storage.interface.ts`, `fake-storage.ts` | −50 / 0 |
| 2.4 | Xoá cờ provider không lõi nào dùng: `staticModels`, `defaultMaxOutputTokens`, `maxConcurrencyEnv` | `providers/types.ts`, `model-catalog.service.ts:97-115`, `ai.service.ts` (2 spread) | −28 / −70 |
| 2.5 | Xoá `ApplicationsService.get` | `applications.service.ts:202-225` | −25 / 0 |
| 2.6 | Bỏ `actor` và `checkTransition`. Chỗ gọi duy nhất luôn truyền `'user'`, nên chỉ còn `if (status === to) throw` | `transitions.ts`, `applications.service.ts:227-245` | −32 / −40 |
| 2.7 | `SkillRegistryService.reference()` không ai gọi; `PromptBuilderService.renderShared` chỉ chuyển tiếp | `skill-registry.service.ts:127-136`, `prompt-builder.service.ts:87-89` | −13 / ~0 |
| 2.8 | `ExtractRequirementsPayload.force` không bao giờ được gửi | `queue.types.ts`, `queue-key.ts:79-83`, `job-requirements.service.ts` | −6 / ~−5 |
| 2.9 | Cảnh báo "khoá nguồn khai hai lần" không thể xảy ra (một adapter, đã gom `Map`) | `job-source.router.ts:21-38` | −12 / 0 |
| 2.10 | `SandboxSpec.network` và `limits.cpus` không ai đặt; nhánh `egress → bridge` là cửa mở mạng chưa ai cần | `sandbox.interface.ts`, `docker.sandbox.ts` | −4 / ~−5 |
| 2.11 | Tham số chỉ test dùng: `requirementBatches(size)`, `perUserLimit`, `guideForJob(profile = null)`, `generate(force = false)`, `ingest(maxNew = Infinity)` | `requirement-batches.ts`, `fan-out.ts`, `salary.service.ts`, `interview.service.ts`, `skill-dictionary.service.ts` | −8 / ~0 |
| 2.12 | Lặt vặt: re-export `JwtPayload`, `export type { SearchHit }`, `exports: [LATEX_COMPILER, PDF_RENDERER]`, `@Injectable()` trên class được `new` tay, `?? null` sau hàm đã trả `null` | auth, companies, documents, question-bank | −8 / 0 |

**Tổng đợt 2:** khoảng **−305 src, −250 test.**

**Tiến độ 2026-10-16 — xong đợt 2:** `src` +49 −428 (ròng **−379**), `test` +34 −300 (ròng **−266**). Unit 1559/1559, e2e 368/368, build sạch.
- Làm đủ 2.1–2.10 và 2.12. `ModelCatalogService` không còn được `AiModule` export; `Storage` chỉ còn `read`/`write`; sandbox luôn `--network none --cpus 1`, spec chỉ còn nới được bộ nhớ.
- 2.11 làm ba trên năm: bỏ `size` của `requirementBatches`, mặc định của `guideForJob(profile)` và `InterviewService.generate(force)`. **Giữ** `ingest(maxNew = Infinity)` và `perUserLimit` vì test dựa vào chúng để kiểm biên ([SI] #4, ngoại lệ hợp lệ).

---

## Đợt 3 — Rút gọn logic (inline, gộp, đẩy vào SQL)

Có đổi cấu trúc bên trong, **giữ nguyên hình dạng API**. Mỗi mục ghi test đang phủ.

### 3a. Gộp khung "hai đường" còn sót và hàm bọc một chỗ gọi

| # | Việc | Dấu hiệu [SI] | Test phủ | Giảm |
|---|---|---|---|---|
| 3.1 | `InterviewService`: gộp `prepare`, `fail`, `persist`, `prepCall` vào `generate`. Mỗi hàm một chỗ gọi; đường stream đã bỏ nên kiểu union `{cached?: never}` thừa. **Giữ `claim`** | #2, #3 | `generate-claim.spec.ts`, `enqueue.spec.ts`, `interview-list.e2e-spec.ts` | −35 |
| 3.2 | `DocumentComposer`: bỏ `cv()`/`coverLetter()` và hai kiểu `ComposeInput`/`ComposeResult`. Chúng chỉ đổi tên `object` thành `content` | #1, #17 | `cover-letter-fast-model.spec.ts`, `stream-claim.e2e-spec.ts` | −25 |
| 3.3 | `job-view.ts`: bỏ chuỗi `withApplication`/`withMatchState`/`withMatchDetail`/`withoutChecks` (4 tầng generic, mỗi hàm một chỗ gọi). Viết thẳng bằng destructure trong `toJobCard`/`toJobDetail`. Giữ `withSavedFlag`, `withSystemMatch` | #2, #5 | `jobs-filter.e2e-spec.ts`, `matches-sort.e2e-spec.ts`, `public-jobs.e2e-spec.ts` | −20 |
| 3.4 | `mock-interview`: dựng bối cảnh trước khi tạo run, 404 nếu không có job. Bỏ `findUnique` riêng, nhánh `failRun` không tới được, `buildContext` chuyển tiếp | #1, #7 | `interview-turn.spec.ts`, `mock-interview-turn.e2e-spec.ts` | −15 |
| 3.5 | `QueryPlanner`: viết thẳng `deterministicQueries` (bọc một object) và `refineQueries` (một chỗ gọi) vào `forUser` | #2 | `scraper.service.spec.ts`, `query-plan.spec.ts` | −12 |
| 3.6 | `RequirementMatchService.scoreJob`/`scoreAll`/`scoreUser` → một `score({ jobId?, userId? })` | #6 (nghịch) | `requirement-match.service.spec.ts` | −12 |
| 3.7 | Companies: `briefCall()` dùng chung cho `build`/`streamBuild` (options đang chép nguyên văn); `confidenceOf` trả thẳng chữ hoa, bỏ bảng `CONFIDENCES`; ba hằng trùng mặc định chỉ khai một nơi | #14, #18 (ngược: trùng thật cùng lý do đổi) | `company.service.spec.ts`, `review-sources.spec.ts` | −17 |
| 3.8 | `AiService`: `streamText` bỏ option `prompt` không ai dùng, `context` bắt buộc, bỏ `recordText`; bỏ `budgetOverrideMs`/`chainBudgetMs` (ngân sách đọc một nơi); `StreamObjectOptions = Omit<GenerateObjectOptions,'maxRetries'>`; `AiCallLog.record` bỏ mười `?? null` | #4, #14 | `ai.service.spec.ts`, `model-chain-budget.spec.ts`, `interview-turn.spec.ts` | −40 |
| 3.9 | (Theo Q5) Bỏ nhánh kiểm `run.workflow` và bộ lọc `workflow` | #8 | `mock-interview-turn.e2e-spec.ts` | −12 |

### 3b. Kiểm phòng thủ cho thứ DTO hoặc chính code đã bảo đảm

| # | Việc | Test phủ | Giảm | Rủi ro |
|---|---|---|---|---|
| 3.10 | `DocumentsService` dùng thẳng kiểu DTO (`PreviewBodyDto`, `SetTemplateDto`, `UpdateCvDto`, `CreateApplicationEmailDto`) thay vì khai lại inline. Tương tự `ListMockInterviewsQuery` → `ListMockInterviewsDto` | e2e documents | −26 | Thấp |
| 3.11 | `DocumentGenerator.fail` trả `Document` (bỏ `message` không ai đọc); `context()` bỏ `params`; `DocumentRenderer` bỏ nhánh `!target` không tới được; `MatchingService.fail` tương tự; `upskill.finish()` bỏ ghi lại 3 trường vừa ghi; `tally.near` | e2e documents, matching, upskill | −30 | Thấp |
| 3.12 | (Theo Q6) Bỏ cache `positionIndex` | `negotiation.spec.ts` | −12 | Thấp |
| 3.13 | `requirePastedJob` + biến `touched` lặp lại predicate của `CreateCvDto` | `documents-application-email.e2e-spec.ts` | −15 | Vừa: DTO thành cửa duy nhất |
| 3.14 | `parseEvidenceList` + hai lần kiểm "không có bằng chứng": chỗ ghi duy nhất luôn ghi một phần tử có chữ. Giữ **một** dòng `if (!evidence.length)` trong `synthesisCall` làm lưới | `profile-draft.e2e-spec.ts` | −20 | Vừa |

### 3c. Đẩy gom, đếm, sắp xếp vào database

| # | Việc | Test phủ | Giảm | Rủi ro |
|---|---|---|---|---|
| 3.15 | `AdminService.overview`: bỏ hai `count` trùng với `_count._all` trong `aggregate(TOKEN_SUMS)` cùng `where` | `admin-data.e2e-spec.ts:467` | −4, bớt 2 truy vấn | Thấp |
| 3.16 | `AiShortlistService`: lấy `p."lastFanOutAt"` ngay trong câu SQL đã join `profiles`, bỏ `findMany` + `Map` | `ai-shortlist.spec.ts`, `ai-shortlist.e2e-spec.ts` | −20 | Vừa (9 unit đổi input) |
| 3.17 | `ApplicationsService.list`: gom CV theo tin bằng `include` lồng qua `Job.documents` thay vì `Map`. **Bắt buộc** giữ `where: { userId }` ở tầng lồng, và thêm e2e "không thấy CV người khác cùng tin" | `applications.e2e-spec.ts` + e2e mới | −12 | Vừa |
| 3.18 | `topFailureKind` → `groupBy` + `orderBy` + `take: 1`; `question-bank` `byCount` → `orderBy _count`; bỏ `orderBy` thừa trong `JobsService.filters()` | `admin-data.e2e-spec.ts`, `question-bank.utils.spec.ts`, `jobs-filter.e2e-spec.ts` | −16 | Vừa-thấp (kiểm cú pháp `_count` với nhóm `null`) |

**Tổng đợt 3:** khoảng **−345 src**, test giảm nhẹ.

**Tiến độ 2026-10-16 — xong đợt 3:** `src` +199 −440 (ròng **−241**), `test` +45 −41 (+4, gồm một e2e mới). Unit 1557/1557, e2e 369/369, build sạch.
- **Làm:** 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8 (trừ `AiCallLog`), 3.10, 3.11 (generator, `MatchingService.fail`, `tally.near`), 3.12, 3.14, 3.15, phần `orderBy` của 3.18, 3.17 (kèm e2e "danh sách đơn chỉ kèm CV của chính mình" — trước đó route này chưa có e2e nào kiểm CV đính kèm).
- **Cố ý không làm, kèm lý do:**
  - 3.3 `job-view.ts`: generic ở đó để TypeScript suy ra kiểu kết quả `select` của Prisma ([SI] #5, ngoại lệ hợp lệ); gộp vẫn phải giữ generic, lợi ~8 dòng.
  - 3.9 `workflow`: DB dev còn 15 lượt `apply` của agent cũ, nên nhánh kiểm `run.workflow !== 'interview'` là cần.
  - 3.11 nhánh `!target` trong `DocumentRenderer`: bỏ thì thay một chốt tại chỗ bằng giả định ở file khác, lợi 3 dòng. Ghi lặp ở `upskill.finish()`: test "ghép vào một bản ghi DONE" ghim chính lệnh ghi đó.
  - 3.8 `AiCallLog` `?? null`: test cố ý ghim "thiếu usage thì ghi null, không ghi 0".
  - 3.13 `requirePastedJob`: nó còn thu hẹp kiểu `string | undefined` → `string` và có unit test gọi thẳng service.
  - 3.16 `AiShortlistService`: câu truy vấn thêm chạy mỗi lượt cron một lần, không sai; bỏ phải đổi đầu vào hàm thuần ở 8 chỗ test.
  - 3.18 `topFailureKind`, `byCount`: hàm thuần vài dòng sắp xếp ~6 phần tử; đẩy vào SQL thêm rủi ro cú pháp `orderBy` với nhóm `null`.

---

## Đợt 4 — Cấu trúc file và chữ ký ([MS] §3.2 #8–13)

Theo [MS], phần lớn việc ở đây **chỉ làm khi đang sửa module đó vì lý do khác**. Hai việc đầu nên làm luôn vì rẻ và gỡ được chỗ lệch quy ước dễ thấy.

| # | Việc | File chạm |
|---|---|---|
| 4.1 | Đổi `companies/service/` → `services/`, `mock-interview/service/` → `services/`. Sửa `server/README.md:413-421` (vẫn mô tả mock-interview cũ là 5 file phẳng) | ~8 + README |
| 4.2 | `withFailureKind` chạy trong service, không ở controller (documents, matching, mock-interview, profile-draft). Bỏ `withFailureKinds` (chỉ là `.map(withFailureKind)`). `JobsService.get` chuyển `include` → `select` hằng | ~8 |
| 4.3 | Dời `queue.send` khỏi 6 controller vào `service.enqueue(userId, …)` | 5 controller + 5 service |
| 4.4 | `userId` lên tham số đầu: `JobsService.list/get`, `QuestionBankService.ensureAnswer` | 3 + caller |
| 4.5 | (Khi đụng tới) `dashboard.utils.ts`, `question-bank.utils.ts` → `utils/<khái niệm>.ts`; `matching/ai/prompt/` → `utils/`; `PromptBuilderService` không chạm DB nên thuộc `utils/` (14 file inject, việc riêng) | mỗi việc 2–14 |
| 4.6 | Ternary lồng ở `negotiation.ts:107` (`experienceSource`) → `if` | 1 |

**Tiến độ 2026-10-16 — đợt 4:** unit 1557/1557, e2e 369/369, build sạch.
- **4.1 xong:** `companies/services/`, `mock-interview/services/`, cả cây test `companies/services/`. Sửa `server/README.md` (bố cục mock-interview và đoạn "cắt `toolResults` 500 ký tự" đã lỗi thời từ đợt 1) và ADR 0012.
- **4.2 một phần:** bỏ `withFailureKinds` (thay bằng `.map(withFailureKind)`) và ràng buộc `status?` không dùng. **Không** dời `withFailureKind` vào service: `DocumentsService.get`, `ProfileDraftService.get` còn được chính service gọi nội bộ và cần kiểu đầy đủ. Bất biến cần giữ là `error` không lọt ra ngoài; hiện mọi route đều bọc.
- **4.6 xong.** 4.3–4.5 để dành theo đúng ghi chú ở trên: dời `queue.send` cần tiêm `QueueService` vào 4 service và viết lại các spec dựng tay.

---

## Đợt 5 — Quy tắc và công cụ để không tái phát

1. **Thêm vào `CLAUDE.md`, mục "Cách viết code trong `server/src`":**
   - Đoạn khoảng 15 dòng ở [MS] §3.1: bố cục bên trong module, controller chỉ map HTTP ↔ một lời gọi service, `userId` là tham số đầu tiên và luôn có trong `where` khi ghi, service trả view, DTO có `@MaxLength`/`@ArrayMaxSize`.
   - Thêm 3 dòng từ [SI]:
     - **Gỡ tính năng thì gỡ đến tận gốc:** grep tên hàm, kiểu, tham số và option của nó trên `src` + `test`. Đợt 2 gần như toàn bộ là đồ sót.
     - **Mặc định cấu hình chỉ nằm ở `configuration.ts`.** Service đọc bằng `config.getOrThrow`, không viết `?? 50`.
     - **Đếm, nhóm, sắp xếp thì để database làm** (`groupBy`, `_count`, `orderBy`, `include` lồng), trừ luật nghiệp vụ phải chạy bằng code (`matching/rules/`).
2. **ESLint:** bật `complexity: ["warn", { max: 20, variant: "modified" }]` và `max-depth: ["warn", 4]` cho `src/**`. Ba hàm đang vượt thì tắt từng dòng (phức tạp vốn có). **Không** bật `max-params` (phạt constructor DI của Nest) và `max-lines-per-function` (ép tách hàm vụn) ([SI] §3).
3. **ADR:** sửa 0010 (concurrency cần restart, khoá `COMPANY_BRIEF`) và 0007 (`SCRAPER_SYSTEM_QUERY_LIMIT`). Nếu Q4 đổi thì sửa cả 0005.

**Tiến độ 2026-10-16 — xong đợt 5:**
- `CLAUDE.md`: mục "Bên trong một module" (6 ý, gồm quy tắc `| null` / `?:` / `unknown` từ `docs/research-null-undefined-unknown.md`) và một câu bổ sung cho quy tắc khoá theo `userId` (lệnh ghi theo id, route stream).
- `eslint.config.mjs`: `complexity` (20, `modified`) và `max-depth` (4) ở mức warn cho `src/**`; 4 chỗ phức tạp vốn có tắt từng dòng. Lint hiện không còn cảnh báo nào.
- ADR 0007 và 0010 đã sửa trong đợt 1.

---

## Tóm tắt số dòng dự kiến

| Đợt | `server/src` | `server/test` | Ghi chú |
|---|---:|---:|---|
| 1 — lỗi, bảo mật | khoảng −30 tới +20 | +~60 | Mỗi lỗi một test chứng minh |
| 2 — code chết | ~−305 | ~−250 | Không đổi hành vi |
| 3 — rút gọn logic | ~−345 | ~−50 | Giữ hình dạng API |
| 4 — cấu trúc | ~0 | ~0 | Đổi tên, dời chỗ |
| 5 — quy tắc | 0 | 0 | `CLAUDE.md`, ESLint, ADR |
| **Tổng** | **~−650** | **~−240** | |

## Những chỗ trông phức tạp nhưng phải giữ (để khỏi "rút gọn" nhầm)

| Chỗ | Lý do | Nguồn |
|---|---|---|
| `ModelChain`, `skipReason`, `withFormatFallback`, `json-text.ts`/`json-stream.ts`, `beginStream` giữ mảnh đầu | Mỗi nhánh ứng với một lõi model thật đã đo | ADR 0012, 0013 |
| Timeout 90s < 4' < 5' < 10' | Bất biến thứ tự | ADR 0011 |
| Mọi `claim` / `start` bằng `updateMany` có điều kiện, nhánh RUNNING kẹt | Giành chỗ; pg-boss tự thử lại khi tiến trình chết | CLAUDE.md |
| `ReconcileService` 6 bảng + trần 100 mỗi loại | Bỏ trần thì sau một lần sập lâu sẽ đốt hết hạn mức gateway | CLAUDE.md |
| Hai đường stream/hàng đợi ở documents, profile-sources, companies, upskill | Stream cho người đang chờ, hàng đợi cho chạy nền | CLAUDE.md |
| `pump` + scrubber của mock-interview | Marker bị cắt giữa hai mảnh không được lọt ra màn hình | 3 khối spec |
| `collectCards`, `QueryPlanner.forSystem`, nhịp portal, cầu dao `BLOCKED` | Chống thiên lệch ngành, chống chặn IP | ADR 0005, 0007 |
| `negotiation.ts`, `job-position.ts` | Mỗi quy tắc có số đo (804 tin; ngưỡng 0,6/0,8) | `server/README.md` |
| SQL raw theo giờ VN ở admin; p50/p95 bằng JS | Prisma không làm được; chưa gần trần 5.000 dòng | — |
| `timingPadHash` ở đăng nhập | Chống dò email theo thời gian phản hồi | — |
| Seam `ProfileSource`, hai adapter PDF | Adapter thứ hai đã có hoặc đã nằm trong lộ trình | `server/README.md`, ADR 0002/0004 |

## Sửa sau lượt rà toàn bộ diff (2026-10-16)

- **Khoá `INTERVIEW_PREP`:** `enqueue` không gửi việc khi bộ đề đã DONE mà không ép chạy lại. Lượt gửi vô ích đó từng chiếm khoá `userId:jobId` và nuốt mất lượt "Soạn lại" bấm ngay sau, để bản ghi nằm PENDING tới khi reconcile đánh FAILED.
- **Câu báo lỗi:** `AllExceptionsFilter` giữ nguyên mã HTTP và `failureKind`, nhưng câu "nhà cung cấp AI quá tải" chỉ dùng khi lỗi chắc chắn đến từ AI (tên `AI_*` hoặc `ModelUnavailableError`). Timeout và 5xx khác dùng câu trung tính, vì `TimeoutError` của `AbortSignal` không cho biết lời gọi nào hết giờ.
- **Reconcile `ScrapeRun`:** mốc RUNNING kẹt nâng từ 2 lên **4 giờ**. Trường hợp xấu nhất của một lượt quét hệ thống là 30 truy vấn × 5 trang × (60 giây timeout CLI + 3 giây nhịp) ≈ 2,6 giờ, nên mốc 2 giờ có thể đánh FAILED một lượt còn sống. Nâng `SCRAPER_SYSTEM_QUERY_LIMIT`, `SCRAPER_MAX_PAGES` hay `SCRAPER_TIMEOUT_MS` thì tính lại mốc này.
- **App admin:** `AuthResult` bỏ `accessToken`, khớp body `{ user }` của backend.
