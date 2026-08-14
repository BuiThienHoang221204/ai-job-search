# Làm việc trong repo này

Repo có **hai runtime dùng chung một bộ đặc tả**, và gần như mọi việc hiện nay thuộc runtime thứ hai:

1. **Workspace Claude Code** (thiết kế của bản fork gốc): người dùng gõ `/apply`, `/rank`, `/upskill`… và Claude ghi CV LaTeX vào `cv/`, `cover_letters/`. Runtime này **hiện không chạy được** vì hồ sơ ứng viên chưa được điền — xem mục cuối file.
2. **Backend NestJS trong `server/`** — đây là sản phẩm đang phát triển: đa người dùng, HTTP, Postgres. Nó nạp chính các file `.claude/skills/*.md` lúc chạy và nhồi khung đặc tả vào prompt.

Lộ trình phát triển: `../LO-TRINH.md`. Mô tả đề tài và phần bổ sung: `../bo-sung-mo-ta-de-tai.md`. Chi tiết kiến trúc backend: `server/README.md`.

## Trước khi coi một thay đổi là xong

```bash
cd server
pnpm lint && pnpm test && pnpm test:e2e
```

`pnpm test:e2e` **cần Postgres đang chạy** (`pnpm db:up`) và biến `TEST_DATABASE_URL` trỏ tới database có tên kết thúc bằng `_test`. Nó tự tạo database đó và tự chạy migration.

## Ràng buộc cứng — đừng "sửa" chúng

- **Node >= 22.12.** `ai` và `@ai-sdk/openai-compatible` là ESM thuần không có bản CommonJS, còn `nest build` xuất CommonJS; chạy được là nhờ Node cho phép `require()` một module ESM. Gặp lỗi ESM thì **đừng** hạ cấp package hay đổi `module` trong tsconfig chính.
- **e2e chạy qua `node test/run-e2e.mjs`**, không phải `jest --config` trực tiếp: nó cần cờ Node `--experimental-vm-modules` vì Prisma 7 nạp WASM query compiler bằng `import()` động. `test/tsconfig.e2e.json` dùng `module: node16` để `import()` không bị hạ cấp thành `require()`.
- **Test nằm ở `test/unit/**` phản chiếu cây `src/**`**, không đặt cạnh source. e2e là `test/*.e2e-spec.ts`. Trong test dùng alias `src/...` thay cho đường dẫn tương đối.
- **`ai` và `@ai-sdk/*` bị stub trong e2e** (`test/support/stubs/ai-sdk.ts`), và stub **ném lỗi** nếu bị gọi thật — nhờ vậy một `overrideProvider` bị bỏ sót lộ ra ngay thay vì âm thầm gọi model.
- **Test đơn vị thì nạp SDK thật, và chặn bằng `jest.mock(..., factory)` chứ KHÔNG `jest.spyOn`.** Export của module ESM không cấu hình lại được: `jest.spyOn(ai, 'generateObject')` ném `Cannot redefine property`. Mẫu đang dùng ở `test/unit/modules/ai/ai.service.spec.ts` — factory chặn `generateObject`, nhưng lấy `NoObjectGeneratedError` từ `jest.requireActual('ai')` để nhánh phân loại lỗi được kiểm bằng lớp lỗi thật thay vì bằng giả định của test. Khai kiểu cho mock theo thứ tự `jest.fn<TrảVề, [ThamSố]>()`; truyền một kiểu hàm thì `mock.calls` thành `any` và eslint chặn.

## Quy tắc dễ vi phạm nhất

- **Route mới phải có kiểm tra quyền sở hữu VÀ test cho chính nó.** `JwtAuthGuard` là guard toàn cục theo chiều mặc-định-đóng; mở một route bằng `@Public()`. Đừng gắn lại `@UseGuards(JwtAuthGuard)` ở controller — làm vậy khiến người đọc tưởng những controller không gắn là công khai.
- **Truy vấn dữ liệu người dùng luôn khoá theo `userId`**, và tốt nhất để `userId` thành tham số **bắt buộc** trong chữ ký hàm service (xem `DocumentsService.generate`) để caller thêm sau không thể quên.
- **Đường ĐỌC không bao giờ gọi AI.** Dashboard, danh sách match, chi tiết job chỉ truy vấn SQL; kết quả chấm điểm cache theo `promptHash`.
- **Không tự xếp lại việc ở trạng thái `FAILED`.** Đó là trạng thái cuối người dùng bấm lại được; tự động thử lại khi chưa có bộ đếm số lần thử sẽ thành vòng lặp tốn tiền.
- **Trọng số điểm tổng thuộc về code**, không hỏi model (`computeOverall`). Model rất hay tự làm tròn điểm tổng cho khớp cảm nhận của nó.
- **Thay mẫu kiểm-tra-rồi-tạo bằng `isUniqueViolation`** (`src/prisma/prisma-errors.ts`): để `create` chạy rồi bắt `P2002`. Nested write của Prisma vốn đã nguyên tử nên phần lớn chỗ **không cần** `$transaction`.

## Các seam và bản giả

| Seam | Dùng cho | Bản giả trong test |
|---|---|---|
| `Ai` — `modules/ai/ai.service.ts` | mọi lời gọi model; **không** gọi SDK trực tiếp | `src/testing/fake-ai.ts` |
| `Queue` — `modules/queue/queue.service.ts` | mọi việc nền | `test/support/fake-queue.ts` |
| `Storage` — `modules/storage/` | ghi file của người dùng | `LocalStorage` (S3 chưa có) |
| `SkillRegistry` — `modules/skills/` | nạp khung prompt từ `.claude/skills` | — |
| `ProfileSource` — `modules/profile-sources/` | đọc hồ sơ từ nguồn ngoài | PDF thật ở `test/fixtures/` |
| `SandboxRunner` — `modules/sandbox/` | chạy việc nặng trong container cách ly | `src/testing/fake-sandbox.ts` |

`FakeAi` chạy `schema.parse` trên dữ liệu xếp sẵn, nên **không thể** xếp một object gần đúng: hình dạng nào model thật không trả được thì test cũng không nhận. Hết dữ liệu xếp sẵn thì nó ném lỗi thay vì trả giá trị mặc định.

**Đừng tạo seam mới khi chỉ có một adapter**, trừ khi adapter thứ hai đã nằm trong lộ trình.

## Đọc CV (Agent 1) — hai điều dễ làm sai

**1. Không có gì được ghi vào bảng `Profile` cho tới khi người dùng bấm áp dụng.** Model ghi vào `ProfileDraft.proposal`; `apply()` mới chép sang `Profile`, và chỉ chép đúng những trường người dùng tích. Danh sách được phép chép là **danh sách trắng** (`APPLICABLE_FIELDS`) chứ không phải danh sách đen — `fields` đến từ HTTP request, nên danh sách đen sẽ tự động cho qua mọi trường mới thêm sau này.

**2. Có những trường model bị CẤM đề xuất**, và lý do nằm trong docblock của `profile-proposal.schema.ts`: `careerGoals`/`energizingTasks`/`drainingTasks`/`targetSectors`/`dealBreakers` là **sở thích** (CV không nói việc gì làm bạn kiệt sức, mà chúng chiếm 30% điểm phù hợp); `citizenship`/`workPermit` là **tình trạng pháp lý** (đoán sai làm sai Eligibility Gate — bộ lọc CỨNG); `lackingSkills` suy ra từ việc đối chiếu với tin tuyển dụng, không đọc từ CV.

Bộ test đơn vị chạy qua **`test/run-unit.mjs`**, không phải `jest` trực tiếp: `pdf-parse` nạp worker pdfjs bằng `import()` động nên jest cần `--experimental-vm-modules`. Docblock của file đó ghi những cách đã thử mà không tránh được — đừng thử lại.

## Xuất PDF (Pha 3) — ba điều đã trả giá để biết

**Hai đường, chọn bằng `LATEX_SERVICE_URL`.** Có giá trị → `HttpLatexCompiler` gọi dịch vụ riêng (production). Bỏ trống → `SandboxLatexCompiler` gọi `docker run` qua SEAM 2 (máy phát triển, app chạy trực tiếp trên host). App ghi ra log lúc khởi động nó đang dùng đường nào.

**Production KHÔNG dùng được đường Docker**, và lý do thứ hai mới là lý do quyết định:

1. App trong container không có socket Docker; mount vào là cho app quyền tương đương root trên host.
2. Kể cả mount socket thì `-v <thư mục tạm>:/work` **vẫn vỡ** — daemon nằm trên host nên nó giải đường dẫn đó trên filesystem của host, nơi thư mục tạm bên trong container app không tồn tại. Container LaTeX khởi động với `/work` rỗng và ta nhận về một lỗi LaTeX vô nghĩa.

Dịch vụ ở `latex-service/`: Python stdlib trong image TeX Live, nhận `.tex` qua POST, trả PDF. Chạy bằng `docker compose up -d latex` sau khi build. Đo được **nhanh hơn** `docker run`: 2,0–3,1 giây so với 5,1 giây, vì không khởi container mỗi lần.

Máy chủ cần ảnh **`texlive/texlive` 8,92GB tải trước** cho cả hai đường (`DockerSandbox` đặt `--pull never`, nên thiếu ảnh là một lỗi nói rõ chứ không phải một lượt tải 8,92GB giữa request của người dùng).

`/ready` báo `checks.latex` nhưng **cố ý không tính nó vào `ready`**: mất PDF thì người dùng vẫn chấm điểm, xem việc, soạn CV và ứng tuyển được, nên đừng để orchestrator khởi động lại cả app vì một tính năng phụ. Có test e2e ghim đúng điều đó.

**Giá trị header HTTP phải là ISO-8859-1.** Dịch vụ gửi các dòng `Missing character` (chứa chữ tiếng Việt) qua header nên phải **base64**. Gửi thẳng thì `fetch` của Node từ chối cả phản hồi và app báo "không nối được tới dịch vụ" — một lỗi sai hoàn toàn hướng.

**1. Exit code 0 KHÔNG có nghĩa là compile thành công.** `-interaction=nonstopmode` khiến lualatex bỏ qua nhiều lỗi rồi vẫn thoát 0 dù PDF thiếu. Điều kiện thành công là **có file PDF khác rỗng**. Chiều ngược lại cũng đúng: nó có thể thoát khác 0 vì một cảnh báo mà PDF vẫn dùng được.

**2. `Missing character` trong log là cách chữ bị âm thầm mất khỏi PDF**, và với tiếng Việt đó là rủi ro chính. `LatexCompiler` gom chúng thành `warnings` và service ghi log — đừng bỏ đi. Trên bản đo thật: 0 ký tự thiếu với moderncv + TeX Gyre Pagella.

**3. Route trả file KHÔNG được trả `Buffer` trực tiếp.** Nest đem Buffer qua bộ serialize JSON, cho ra `{"type":"Buffer","data":[...]}` với HTTP 200 và content-type đúng — một file hỏng trông y như file tốt. Dùng `StreamableFile`.

Đừng bỏ macro liên hệ rỗng vào template LaTeX: `\phone[mobile]{}` vẫn vẽ icon và tên icon lọt vào lớp text mà ATS đọc. Xem `contactMacro` trong `latex.ts`.

**Thư xin việc KHÔNG dùng `cover.cls` của bản fork nữa, và lý do là tiếng Việt.**

Font Lato/Raleway đi kèm `cover_letters/` thiếu **21 mã ký tự riêng của tiếng Việt** (`ạ` U+1EA1, `ơ` U+01A1, `ư` U+01B0, `ế`, `ệ`, `ậ`…). Bản fork viết cho tiếng Đan Mạch, nơi Lato phủ `æøå` thừa sức. Hậu quả đo được trên bản compile thật: chữ Việt **biến mất khỏi trang giấy**, không chỉ khỏi lớp text — "ứng tuyển" ra thành "ng tuyn", "quản trị hệ thống" thành "qun tr h thng". PDF vẫn ra 1 trang, exit code vẫn 0, và chỉ nhìn ảnh trang giấy mới thấy.

Nay cả hai template đều dùng **`moderncv` + lualatex**: 0 glyph thiếu, lớp text đọc lại sạch, và thư xin việc trông cùng một bộ với CV. Việc đổi này xoá luôn engine thứ hai, 1,7MB font nhúng, một script bọc, và một ngoại lệ trong `.dockerignore`.

Muốn dựng lại `cover.cls` (ví dụ sau khi đổi font của nó sang font có tiếng Việt) thì cần đủ bốn thứ: COPY `cover_letters/cover.cls` + `OpenFonts/` vào image, bỏ `cover_letters` khỏi `.dockerignore`, symlink hai tài sản đó vào thư mục làm việc mỗi request (đường dẫn font trong `cover.cls` là **tương đối**), và cho app khai engine `xelatex` — `cover.cls` nạp `xltxtra`/`xunicode`, chỉ chạy trên XeTeX.

Ngày tháng trong thư dùng chuỗi tiếng Việt tự dựng, KHÔNG dùng `\today`: `\today` theo ngôn ngữ document class, và moderncv mặc định tiếng Anh — đã thấy dòng "August 13, 2026" trong một thư tiếng Việt.

## Assisted Apply (Pha 5) — bốn điều đã đo, không đoán

**Máy KHÔNG bấm nút nộp.** Đây là quyết định thiết kế, không phải việc còn thiếu — lý do đầy đủ trong docblock của `BrowserApplyService`. Đừng "làm cho xong" bằng cách thêm một lần `click()`.

**Form ứng tuyển của cả 4 portal Việt nằm sau tường đăng nhập.** Đo bằng chính HTML của TopCV: nút "Ứng tuyển ngay" là `href="javascript:showLoginPopup('...?apply-form=1', ...)"`. VietnamWorks không có form nào trên trang công khai. Nên `LOGIN_WALL` là một **kết luận hợp lệ**, không phải lỗi cần sửa; nơi luồng tự động chạy thật là form công khai kiểu Greenhouse/Lever/Ashby.

**Chính sách ở TypeScript, cơ chế ở trong trang.** `field-plan.ts` sinh bảng luật và phân loại kết quả (có test đơn vị); `apply-script.ts` chỉ dò chuỗi và gán giá trị. Đừng chuyển quyết định nào vào script: nó là một template string, không được eslint/tsc kiểm.

**Khớp trên MỌI thuộc tính nhận dạng, không chỉ một nhãn.** Đo trên form Greenhouse: hai ô file có `id="resume"` và `id="cover_letter"`, còn nhãn của cả hai — và của cả 5 tầng ancestor — đều là "Attach", vì form ẩn `input[type=file]` thật rồi vẽ một nút riêng. Chỉ khớp theo nhãn thì **CV bị đính vào cả ô thư xin việc**, và đó là lỗi người đọc hồ sơ thấy ngay. Cũng vì thế luật file KHÔNG có nhánh dự phòng lỏng (`attach|upload|file`): ô không đọc được thì để `unmatched` cho người dùng tự đính — thà thiếu còn hơn đính sai tài liệu.

**`--network` mặc định là `none`**, chỉ Assisted Apply khai `'egress'`. Có test bảo mật riêng ở `test/unit/modules/sandbox/docker-args.spec.ts`, gồm cả nhánh "một giá trị lạ KHÔNG mở được mạng" — spec có thể đến từ JSON trong hàng đợi, nên so sánh phải là danh sách trắng. Vì lượt chạy này vừa có hồ sơ vừa có Internet, nó chỉ nhận `ApplyIdentity` (4 trường), không nhận nội dung do model sinh.

Ảnh `aijob-browser:1.62.1` phải build trước (`browser-service/Dockerfile`) — 3,54GB. Ảnh chính thức của Playwright chỉ có trình duyệt, KHÔNG có package npm `playwright`.

## Nguồn tin: SEAM 5, hai adapter

`ScraperService` KHÔNG biết một nguồn là CLI hay HTTP — nó hỏi `JobSourceRouter`. Hai adapter:

- `PortalCliService` — chạy CLI skill trong `.agents/skills/`, phải giữ nhịp chống chặn IP. Bốn portal Việt nằm ở đây.
- `AtsSourceService` — gọi **API job board công khai** của Greenhouse/Lever/Ashby, khai bằng `ATS_BOARDS=greenhouse:gitlab,ashby:ramp`.

**Vì sao có nguồn ATS, và lý do KHÔNG phải "thêm tin": form ứng tuyển của chúng công khai.** Bốn portal Việt đặt form sau tường đăng nhập nên Assisted Apply với chúng chỉ trả `LOGIN_WALL`. Đã đo trên board GitLab: 201 tin có mô tả → 42 khớp "DevOps" → 12 lưu, rồi Assisted Apply điền được 6 trường thật trên một tin trong số đó.

Ba điều dễ làm sai ở adapter ATS:

1. **Lever trả MẢNG ở tầng ngoài**, Greenhouse và Ashby bọc trong `{ jobs: [...] }`. Đọc sai chỗ này thì luôn ra 0 tin và lượt quét vẫn được ghi là "thành công".
2. **Greenhouse cần `?content=true`**, thiếu nó thì `content` vắng và phải gọi thêm một request cho từng tin. Cả ba đều trả mô tả sẵn, nên `AtsSourceService.detail()` cố ý **ném lỗi** — nó không bao giờ được gọi tới.
3. **Giải entity HTML TRƯỚC khi bỏ thẻ, và `&amp;` giải CUỐI.** Làm sai thứ tự thì `&lt;p&gt;` thành `<p>` rồi bị xoá mất cả chữ bên trong, hoặc `&amp;lt;` bị giải hai lần thành thẻ.

## Assisted Apply: ô nào là CÂU HỎI thì không tự điền

Đã điền sai thật trên form GitLab: ô **"Are you Hispanic/Latino?"** nhận giá trị **"Hồ Chí Minh"**, vì luật địa điểm khớp trên `haystack` (nhãn + id + name) và id nội bộ của ô đó chứa từ khớp. Một câu trả lời nhân khẩu học sai đi vào hồ sơ gửi nhà tuyển dụng không phải chuyện nhỏ.

Quy tắc: **nhãn có dấu hỏi thì bỏ qua** (`QUESTION_MARKS`, gồm cả `？` toàn rộng). Nó làm mất vài ô lẽ ra điền được — "What's the name you'd prefer us to use?" cũng bị bỏ — và đó là đánh đổi có chủ đích: với hồ sơ xin việc, **thiếu tốt hơn sai**, và ô bị bỏ vẫn hiện trong danh sách "bạn cần tự điền".

## Hàng đợi

- Khoá chặn trùng được **suy ra từ payload** trong `queue-key.ts`, không do người gọi truyền vào. Thêm hàng đợi mới thì phải thêm một nhánh khoá — có test đối chiếu `QUEUE` với danh sách khoá nên quên là đỏ ngay.
- Policy là `exclusive`. `singletonKey` một mình **không** chặn trùng trên policy `standard`.
- Đổi policy trên database đã chạy cần `QUEUE_POLICY_MIGRATE=true` một lần, và việc đang chờ sẽ mất. Nếu hàng đợi khởi tạo thất bại thì **app không lên** — đó là chủ đích, không phải lỗi.
- Dùng `sendMany` cho lô lớn. `insert` của pg-boss cần `{ returnId: true }` mới trả về số đã xếp; thiếu nó thì luôn trả `null` và log báo 0.

## Đo trước khi đoán

Gateway free đã đo trên 215 lượt `match.evaluate`: **95,3% thành công, p50 33 giây, p95 82 giây**. Nó đáng tin nhưng chậm — mọi thiết kế UI và mọi kịch bản demo phải xuất phát từ hai con số đó. Số liệu sống nằm ở bảng `ai_calls` và màn hình `GET /api/admin/ai-health`.

**`match.evaluate` là tác vụ NHẸ NHẤT, đừng lấy p50 của nó làm mức chung.** Đo tiếp ngày 2026-08-12, chỉ tính lượt thành công: `document.coverLetter` 54–61s, `document.cv` 39–84s, `interview.prep` ~50s, còn `upskill.report` chế độ AGGREGATE thì **luôn vượt mốc 90 giây** nên chưa từng tạo nổi một bản. Lý do: chấm điểm trả về vài con số, các tác vụ kia sinh ra cả một tài liệu — độ trễ đi theo **token đầu ra**.

Nên `document.*` đã đổi sang timeout 180s và `upskill.report` AGGREGATE sang 240s. Thứ tự ba mốc này phải giữ, đừng nới một cái mà không xem hai cái còn lại: **timeout gọi model < `server.setTimeout` 5 phút (`main.ts`) < `STUCK_AFTER_MS` 10 phút (reconcile)**.

**Hạn mức gateway free cạn trong một buổi:** sau khoảng 30 lượt gọi, mọi request nhận `Rate limit exceeded` và hỏng sau ~7 giây, kéo dài hơn một giờ. Khi thấy `failureKind = UPSTREAM` mà `durationMs` chỉ vài nghìn, đó là hạn mức chứ không phải lỗi code — đừng đi sửa gì, hãy đợi. Và **đừng gọi model trực tiếp trong lúc demo**, chuẩn bị dữ liệu trước.

Gateway **không có model embedding nào**, nên vector search ở Pha 4 sẽ cần một nhà cung cấp khác chỉ cho embedding.

### Catalog KHÔNG phải danh sách model dùng được

`https://models.opencode.ai/api.json` liệt kê 89 model của provider `opencode`, trong đó 25 cái có chữ `-free`. **Gateway thật sự chỉ phục vụ 61 model, và chỉ 7 trong số đó là free.** Hỏi đúng nguồn:

```bash
curl -s https://opencode.ai/zen/v1/models -H "Authorization: Bearer $AI_API_KEY" | jq -r '.data[].id'
```

`ModelCatalogService.resolve()` đã lọc theo danh sách sống này (`liveModelIds`), nên app không vấp — nhưng **người đọc catalog thì vấp**. `kimi-k2.5-free`, `minimax-m3-free`, `qwen3.6-plus-free`, `glm-5-free`, `mimo-v2-omni-free` đều có trong catalog và đều trả `ModelError: not supported` khi gọi thật.

**Hạn mức tính THEO TỪNG MODEL, không theo API key.** Đo cùng một thời điểm: `deepseek-v4-flash-free` và `mimo-v2.5-free` trả 429 `FreeUsageLimitError` trong khi `hy3-free`, `nemotron-3.5-lightning-free`, `laguna-s-2.1-free`, `ling-3.0-tiny-free` vẫn nhận request. Đó là lý do `AiService` có chuỗi dự phòng đổi model khi gặp hết hạn mức (`isRateLimited`).

Cả repo này lẫn OpenCode CLI khi chưa đăng nhập đều dùng chung key chuỗi `"public"` (xem `provider.ts` của opencode: không có auth thì `options: { apiKey: "public" }`), nên bể hạn mức là **dùng chung với người lạ** — số lượt của ta không phải yếu tố duy nhất quyết định khi nào cạn.

| Model | Structured output | Ghi chú đã đo |
|---|---|---|
| `deepseek-v4-flash-free` | được | 215 lượt: 95,3%, p50 33s. Model chính |
| `mimo-v2.5-free` | chưa đo | model free DUY NHẤT nhận ảnh → đường vision |
| `nemotron-3.5-lightning-free` | được | prompt nhỏ: 12,4s. Prompt thật của app: **hết giờ ở 90s** |
| `hy3-free` | được | model reasoning, ~1380 token suy luận cho một câu tầm thường |
| `laguna-s-2.1-free` | KHÔNG | content rỗng dù cho 1500 token |
| `ling-3.0-tiny-free` | KHÔNG | server_error |

**Bẫy đo lường đã sập một lần, đừng sập lại:** `hy3-free` và `nemotron` là model **reasoning** — chúng tiêu 700–2300 token vào `reasoning_content` TRƯỚC khi sinh `content`. Thử với `max_tokens: 8` thì `content` ra rỗng và trông y như model không làm được việc; tôi đã kết luận sai đúng như vậy. `AiService` cố ý KHÔNG đặt `maxOutputTokens`.

**Chuỗi dự phòng KHÔNG cứu được tier free cho app này.** Đã chạy thật: chuỗi đổi model đúng cơ chế (deepseek → mimo → nemotron, ghi log và ghi `ai_calls` từng lượt), nhưng nemotron hết giờ trên cả `upskill.report` (240s) lẫn `match.evaluate` (90s) vì prompt thật mang theo cả khung đánh giá từ file skill. Chuỗi vẫn đáng giữ — nó đúng, rẻ, và sẽ có tác dụng khi một model nhanh còn hạn mức — nhưng **nó không thay thế được hạn mức**.

## Vì sao không có hồ sơ ứng viên ở đây

File này **từng** chứa hồ sơ ứng viên theo thiết kế của bản fork gốc, toàn bộ ở dạng `[YOUR_NAME]`, `[YOUR_PRIMARY_SKILLS]`… Backend đã thay nó bằng bảng `Profile` trong database, còn `PromptBuilderService` là chỗ điền các token `[YOUR_*]` vào khung prompt lúc chạy.

**Đừng khôi phục phần hồ sơ đó.** Một hồ sơ để nguyên placeholder không giúp runtime nào cả, mà lại khiến agent tưởng đây là workspace tìm việc cá nhân thay vì một backend đa người dùng.

Hai điều cần biết nếu muốn hồi sinh runtime Claude Code: `/setup` sẽ **ghi đè file này**, nên hãy tách hồ sơ ra chỗ khác trước; và danh sách kiểm tra CV/PDF của bản gốc (đúng 2 trang, lualatex, kiểm tra lớp text cho ATS) vẫn nằm trong git history — lấy lại bằng `git show <commit trước>:CLAUDE.md`.

## Ranh giới không được xê dịch

`tools/`, `scripts/`, `.agents/skills/*/`, `.claude/skills/*/SKILL.md` bị CI khoá vị trí (`lint_skills.py`, `security_guards.py`, `check_framework_version.py`). Sửa `AGENTS.md` thì **bắt buộc** bump `framework_version` trong frontmatter, nếu không CI đỏ.
