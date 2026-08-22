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

- **Node >= 22.12.** `ai` và `@ai-sdk/openai-compatible` là ESM thuần không có bản CommonJS, còn `nest build` xuất CommonJS; chạy được là nhờ Node cho phép `require()` một module ESM. Gặp lỗi ESM thì **đừng** hạ cấp package hay đổi `module` trong tsconfig chính.
- **e2e chạy qua `node test/run-e2e.mjs`**, không phải `jest --config` trực tiếp: nó cần cờ Node `--experimental-vm-modules` vì Prisma 7 nạp WASM query compiler bằng `import()` động. `test/tsconfig.e2e.json` dùng `module: node16` để `import()` không bị hạ cấp thành `require()`.
- **Test nằm ở `test/unit/**` phản chiếu cây `src/**`**, không đặt cạnh source. e2e là `test/*.e2e-spec.ts`. Trong test dùng alias `src/...` thay cho đường dẫn tương đối.
- **`ai` và `@ai-sdk/*` bị stub trong e2e** (`test/support/stubs/ai-sdk.ts`), và stub **ném lỗi** nếu bị gọi thật — nhờ vậy một `overrideProvider` bị bỏ sót lộ ra ngay thay vì âm thầm gọi model.
- **Test đơn vị thì nạp SDK thật, và chặn bằng `jest.mock(..., factory)` chứ KHÔNG `jest.spyOn`.** Export của module ESM không cấu hình lại được: `jest.spyOn(ai, 'generateObject')` ném `Cannot redefine property`. Mẫu đang dùng ở `test/unit/modules/ai/ai.service.spec.ts` — factory chặn `generateObject`, nhưng lấy `NoObjectGeneratedError` từ `jest.requireActual('ai')` để nhánh phân loại lỗi được kiểm bằng lớp lỗi thật thay vì bằng giả định của test. Khai kiểu cho mock theo thứ tự `jest.fn<TrảVề, [ThamSố]>()`; truyền một kiểu hàm thì `mock.calls` thành `any` và eslint chặn.

## Quy tắc dễ vi phạm nhất

- **Phiên đăng nhập chết thì phải gọi `AuthService.revokeAllSessions`.** Token là JWT stateless, nên chữ ký hợp lệ KHÔNG chứng minh token chưa bị rút lại — `users.tokenVersion` là chỗ duy nhất thu hồi được. Thêm route đổi mật khẩu hoặc khoá tài khoản mà quên gọi nó thì người đổi mật khẩu vì nghi bị lộ vẫn để kẻ kia dùng tiếp 7 ngày, và không có gì báo. Chi tiết ba cookie và claim `typ` ở `server/README.md`.
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

**`ai.service.spec.ts` đòi Node ≥ 24.9 và sẽ không nạp được trên bản thấp hơn.** Nó gọi `jest.requireActual('ai')` trên một package ESM thuần, mà `require(ESM)` đồng bộ của jest 30 cần API vm mới. Trên Node 22 nó báo *"Jest's require(ESM) requires Node v24.9+"* và cả suite đỏ dù code không sai. Chạy cả bộ 460 test thì dùng Node ≥ 24.9; các suite còn lại chạy được từ Node 22.12.

## Xuất PDF (Pha 3) — ba điều đã trả giá để biết

**Hai đường, chọn bằng `LATEX_SERVICE_URL`.** Có giá trị → `HttpLatexCompiler` gọi dịch vụ riêng (production). Bỏ trống → `SandboxLatexCompiler` gọi `docker run` qua SEAM 2 (máy phát triển, app chạy trực tiếp trên host). App ghi ra log lúc khởi động nó đang dùng đường nào.

**Production KHÔNG dùng được đường Docker**, và lý do thứ hai mới là lý do quyết định:

1. App trong container không có socket Docker; mount vào là cho app quyền tương đương root trên host.
2. Kể cả mount socket thì `-v <thư mục tạm>:/work` **vẫn vỡ** — daemon nằm trên host nên nó giải đường dẫn đó trên filesystem của host, nơi thư mục tạm bên trong container app không tồn tại. Container LaTeX khởi động với `/work` rỗng và ta nhận về một lỗi LaTeX vô nghĩa.

Dịch vụ ở `latex-service/`: Python stdlib trong image TeX Live, nhận `.tex` qua POST, trả PDF. Chạy bằng `docker compose up -d latex` sau khi build. Đo được **nhanh hơn** `docker run`: 2,0–3,1 giây so với 5,1 giây, vì không khởi container mỗi lần.

Máy chủ cần ảnh **`aijob-latex` build sẵn** cho cả hai đường (`DockerSandbox` đặt `--pull never`, nên thiếu ảnh là một lỗi nói rõ chứ không phải một lượt tải vài GB giữa request của người dùng):

```bash
docker build -t aijob-latex -f latex-service/Dockerfile latex-service
```

**Ảnh nền là `texlive/texlive:latest-medium`, KHÔNG phải `latest`.** Đo trên Docker Hub 2026-08-21: bản đầy đủ 2,70GB nén / 8,92GB trên ổ, bản medium 0,94GB nén / khoảng 2,5-3GB trên ổ. Bản đầy đủ mang theo mọi ngôn ngữ, ConTeXt và toàn bộ kho font mà hai template của dự án không chạm tới. Lý do đầy đủ nằm trong `latex-service/Dockerfile`.

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

## Nguồn tin: SEAM 5, hai adapter

`ScraperService` KHÔNG biết một nguồn là CLI hay HTTP — nó hỏi `JobSourceRouter`. Hai adapter:

- `PortalCliService` — chạy CLI skill trong `.agents/skills/`, phải giữ nhịp chống chặn IP. Bốn portal Việt nằm ở đây.
- `AtsSourceService` — gọi **API job board công khai** của Greenhouse/Lever/Ashby, khai bằng `ATS_BOARDS=greenhouse:gitlab,ashby:ramp`.

**Vì sao có nguồn ATS: tin của chúng lấy được qua API công bố, có tài liệu, không cần key — đọc chúng không phải scrape.** Đây cũng là món trả nợ ToS mà lộ trình ghi ở mục 4: pha thương mại hoá bắt buộc thay LinkedIn scraper bằng nguồn có giấy phép. Đã đo trên board GitLab: 201 tin có mô tả → 42 khớp "DevOps" → 12 lưu.

Ba điều dễ làm sai ở adapter ATS:

1. **Lever trả MẢNG ở tầng ngoài**, Greenhouse và Ashby bọc trong `{ jobs: [...] }`. Đọc sai chỗ này thì luôn ra 0 tin và lượt quét vẫn được ghi là "thành công".
2. **Greenhouse cần `?content=true`**, thiếu nó thì `content` vắng và phải gọi thêm một request cho từng tin. Cả ba đều trả mô tả sẵn, nên `AtsSourceService.detail()` cố ý **ném lỗi** — nó không bao giờ được gọi tới.
3. **Giải entity HTML TRƯỚC khi bỏ thẻ, và `&amp;` giải CUỐI.** Làm sai thứ tự thì `&lt;p&gt;` thành `<p>` rồi bị xoá mất cả chữ bên trong, hoặc `&amp;lt;` bị giải hai lần thành thẻ.

### "Thẻ đã có mô tả" KHÔNG có nghĩa là mô tả đầy đủ

API tìm kiếm của VietnamWorks **cắt** `jobDescription` và `jobRequirement` rồi thêm dấu ba chấm. Scraper cũ chỉ gọi `detail` khi thẻ **không** có mô tả, nên bản cụt được lưu thẳng: 16/16 tin VietnamWorks trong database có mô tả trung bình 771 ký tự, trong khi mọi nguồn khác là 2.600–11.000. Bản cụt vẫn dài hơn ngưỡng 80 nên không nhánh nào chặn được, và giao diện hiện đúng cái đã lưu — trông y như lỗi hiển thị.

Nay `scraper.service.ts` gọi `detail` khi mô tả **trống HOẶC kết thúc bằng dấu ba chấm** (`looksTruncated`), và lỗi ở bước đó bị nuốt để tin vẫn được lưu với bản cụt thay vì mất hẳn. Sửa lại dữ liệu cũ bằng `node scripts/backfill-truncated-description.mjs`.

Hai điều riêng của VietnamWorks:

- **Trang chi tiết parse được, trang tìm kiếm thì không.** Trang `/viec-lam` render phía trình duyệt nên HTML rỗng, nhưng trang `/<slug>` nhúng payload RSC trong `self.__next_f`. Trong đó `jobRequirement` nằm thẳng dạng JSON còn `jobDescription` là tham chiếu `"$26"` trỏ sang một đoạn rời — **sửa đúng một dạng thì nửa còn lại vẫn cụt**. Độ dài đoạn rời đếm bằng **byte**, không phải ký tự.
- **Phải khớp phần đầu với bản cắt trước khi nhận một đoạn**, đừng lấy chuỗi dài nhất: trang còn chứa mô tả của các tin gợi ý, và lấy nhầm thì tin này mang mô tả của tin kia mà không có gì báo.

`detail` tìm lại tin bằng từ khoá trong alias, và **tin đăng lâu thì không tìm ra nữa** (6/16 tin ở lần backfill đầu). Nên có đường dự phòng `jobFromDetailHtml` dựng tin thẳng từ HTML; đường này thiếu `tags` vì chúng nằm ở các dòng tham chiếu lồng nhau chưa giải.

## Quét tin — đây là trợ lý tìm việc ĐA NGÀNH

Không có chỗ nào trong đề tài giới hạn phạm vi ở ngành CNTT. Việc hệ thống từng chỉ mang về tin IT là hệ quả tình cờ của việc người dùng thử đầu tiên là dân IT, và nó đã được sửa ngày 2026-08-15. Đừng "sửa" ngược lại.

**Ngôn ngữ từ khoá đi theo ngành, và đây là chỗ dễ làm hỏng nhất.** Chức danh IT/kỹ thuật ở Việt Nam đăng bằng tiếng Anh (`frontend developer`); mọi ngành còn lại đăng bằng tiếng Việt có dấu (`kế toán tổng hợp`, `nhân viên kinh doanh`). Chọn sai ngôn ngữ **không** trả về tin sai — nó trả về **không gì cả**, một triệu chứng trông y hệt portal hỏng. Quy tắc này nằm ở hai nơi và phải giữ khớp nhau: prompt trong `planning/query-planner.ts` và `.describe()` của trường `query` trong `planning/search-plan.schema.ts`. Mô tả zod đi thẳng vào JSON schema gửi cho model, nên nó là mệnh lệnh sống chứ không phải chú thích.

**Truy vấn xếp theo CHỨC DANH trước, kỹ năng sau** (`query-plan.ts`). Với hồ sơ IT thì kỹ năng cũng là tên tin tuyển dụng nên xếp kiểu nào cũng chạy; với mọi ngành khác thì không — kỹ năng chính của một kế toán là `Excel`, `Misa`, `giao tiếp`. Lĩnh vực mục tiêu được **ghép** với chức danh, không bao giờ đứng một mình: `Ngân hàng` trả về mọi vị trí trong ngành từ giao dịch viên tới bảo vệ.

**Không có từ khoá mặc định nào.** Hồ sơ trống thì lần quét FAILED kèm lời nhắc đi điền hồ sơ, và **không gọi model**. Trước đây chỗ này lùi về `'developer'` và gọi đó là "quét rộng" — `developer` không rộng, nó là một nghề. Đừng thêm lại một giá trị mặc định: không có từ khoá trung lập nào tồn tại, `việc làm` trả về vài chục nghìn tin ngẫu nhiên.

**Tin rác đắt gấp N lần bạn tưởng.** `planFanOut` chấm mỗi tin mới với MỌI người dùng đủ điều kiện, nên một tin lạc ngành tốn `số người dùng` lượt gọi model chứ không phải một. Đó là lý do độ chính xác của truy vấn quan trọng hơn số lượng truy vấn.

**Lượt quét đêm có ba trần, đừng chỉnh một cái mà quên hai cái kia:** `SCRAPER_MAX_JOBS_PER_PORTAL` (50 tin/portal, gom qua nhiều trang), `SCRAPER_MAX_AGE_DAYS` (7 ngày, lọc **trước** `detail` chứ không phải sau) và `SCRAPER_MAX_PAGES`. Nâng trần tin mà quên cửa sổ ngày thì database đầy tin đã đóng; lọc ngày sau khi gọi `detail` thì đã trả tiền đúng phần đắt nhất rồi.

**Bản sao giữa các portal được LƯU kèm `duplicateOfId`, không bị bỏ qua.** Bỏ qua thì tập "đã biết" (theo `source` + `externalId`) đêm sau lại tưởng là tin mới và lại tốn một request `detail` — mỗi đêm một lần, mãi mãi. Và `dedupeKey` **không được** đặt `@@unique`: hai tin khác nhau đụng khoá thì `upsert` ghi đè mất một tin. Chi tiết ở `server/README.md`, mục "Chống trùng".

**ITviec chỉ có IT, và vẫn cố ý được gọi cho mọi người.** Chọn portal theo ngành cần một khái niệm "ngành của hồ sơ" mà `Profile` chưa có. Trong lúc đó, người dùng ngoài IT chịu một lượt quét rỗng — **giao diện phải phân biệt "0 tin vì portal không phục vụ ngành này" với "0 tin vì hỏng"**, không thì họ tưởng app lỗi.

**`systemQueries()` tự khuếch đại thiên lệch của tập hồ sơ hiện có** — DB toàn IT thì cron mang về tin IT thì người ngành khác bỏ đi thì DB vẫn toàn IT. Đã biết, cố ý chưa sửa, lý do ghi trong docblock của `planForSystem`.

`.claude/skills/job-scraper/search-queries.md` **được nạp vào `skill.references` nhưng không prompt nào đọc** — `refineQueries` tự dựng prompt riêng. Sửa file đó chỉ đổi hành vi runtime Claude Code, không đổi gì ở backend. Chỉ các file của `job-application-assistant` mới thật sự được nhồi vào prompt.

## Hàng đợi

- Khoá chặn trùng được **suy ra từ payload** trong `queue-key.ts`, không do người gọi truyền vào. Thêm hàng đợi mới thì phải thêm một nhánh khoá — có test đối chiếu `QUEUE` với danh sách khoá nên quên là đỏ ngay.
- Policy là `exclusive`. `singletonKey` một mình **không** chặn trùng trên policy `standard`.
- Đổi policy trên database đã chạy cần `QUEUE_POLICY_MIGRATE=true` một lần, và việc đang chờ sẽ mất. Nếu hàng đợi khởi tạo thất bại thì **app không lên** — đó là chủ đích, không phải lỗi.
- Dùng `sendMany` cho lô lớn. `insert` của pg-boss cần `{ returnId: true }` mới trả về số đã xếp; thiếu nó thì luôn trả `null` và log báo 0.

## Đo trước khi đoán

Gateway free đã đo trên 215 lượt `match.evaluate`: **95,3% thành công, p50 33 giây, p95 82 giây**. Nó đáng tin nhưng chậm — mọi thiết kế UI và mọi kịch bản demo phải xuất phát từ hai con số đó. Số liệu sống nằm ở bảng `ai_calls` và màn hình `GET /api/admin/ai-health`.

**`match.evaluate` là tác vụ NHẸ NHẤT, đừng lấy p50 của nó làm mức chung.** Đo tiếp ngày 2026-08-12, chỉ tính lượt thành công: `document.coverLetter` 54–61s, `document.cv` 39–84s, `interview.prep` ~50s, còn `upskill.report` chế độ AGGREGATE thì **luôn vượt mốc 90 giây** nên chưa từng tạo nổi một bản. Lý do: chấm điểm trả về vài con số, các tác vụ kia sinh ra cả một tài liệu — độ trễ đi theo **token đầu ra**.

Nên `document.*` đã đổi sang timeout 180s. Thứ tự ba mốc này phải giữ, đừng nới một cái mà không xem hai cái còn lại: **timeout MỘT lời gọi model < `server.setTimeout` 5 phút (`main.ts`) < `STUCK_AFTER_MS` 10 phút (reconcile)**.

**Báo cáo upskill là tác vụ duy nhất dùng HAI lời gọi model, và nới timeout đã được thử rồi bỏ.** Bản một-lời-gọi ở mức 240s vẫn hỏng: `deepseek-v4-flash-free` hết giờ đúng mốc 240s, còn `mimo-v2.5-free` viết xong sau 28,3s với `finishReason=stop` nhưng thiếu một dấu `{` nên cả JSON không parse được. Chẩn đoán: **một lời gọi đang đòi quá nhiều**, không phải timeout ngắn cũng không phải chọn nhầm model.

Nay `UpskillService.generate` chạy `upskill.gaps` (180s, mang tới 30 mô tả công việc) rồi `upskill.plan` (120s, chỉ mang lại danh sách khoảng trống).

**Đã chạy thật ngày 2026-08-15 và RA ĐƯỢC một bản** — lần đầu tiên. Số từ `ai_calls`, 30 công việc, cả hai lời gọi rơi vào `hy3-free`: `upskill.gaps` **158 giây / 13.071 token ra**, `upskill.plan` **96 giây / 8.594 token ra**. Cộng lại **21.665 token đầu ra** — đó chính là thứ bản một-lời-gọi đòi model sinh trong MỘT phản hồi, và là lý do nó chưa bao giờ xong.

**Biên an toàn mỏng: 158 giây trên hạn 180, tức 88% ngân sách.** Nếu nó bắt đầu hỏng vì hết giờ thì nới **lời gọi 1** lên 240s, đừng nới cả hai — lời gọi 2 chỉ dùng 80% của 120s.

Ba điều đừng làm hỏng:

- **Lời gọi 2 KHÔNG được mang mô tả công việc.** Thêm lại `jobLines` vào prompt thứ hai là quay về đúng bản đã hỏng. Có test đơn vị ghim điều này.
- **Hai purpose riêng trong `ai_calls`**, không gộp lại thành `upskill.report`: gộp thì mất khả năng biết lời gọi nào mới là cái chậm.
- **Khung phân tích chia đôi theo trường**: `keepSections` lấy Step 3–5 cho lời gọi 1, Step 6–7 cho lời gọi 2. Đổi tên tiêu đề trong `.claude/skills/upskill/SKILL.md` thì `keepSections` trả về chuỗi **rỗng** — không lỗi, không log, chỉ là một báo cáo tệ đi mà không ai biết. Test đơn vị đọc file SKILL.md thật chính vì lý do đó.

**Hạn mức gateway free cạn trong một buổi:** sau khoảng 30 lượt gọi, mọi request nhận `Rate limit exceeded` và hỏng sau ~7 giây, kéo dài hơn một giờ. Khi thấy `failureKind = UPSTREAM` mà `durationMs` chỉ vài nghìn, đó là hạn mức chứ không phải lỗi code — đừng đi sửa gì, hãy đợi. Và **đừng gọi model trực tiếp trong lúc demo**, chuẩn bị dữ liệu trước.

Gateway **không có model embedding nào**, nên vector search ở Pha 4 sẽ cần một nhà cung cấp khác chỉ cho embedding.

### Nhiều lõi model — mỗi lõi MỘT FILE, không phải một thư mục

`src/modules/ai/providers/` có `opencode.ts` và `openrouter.ts`. **Thêm lõi = thêm một file + một dòng trong `index.ts`.** Đừng biến chúng thành class Nest: đã đếm, **146/185 provider trong catalog dùng chung đúng một adapter** `@ai-sdk/openai-compatible`, nên một class cho mỗi lõi sẽ là một class không có hàm nào — và làm việc thêm lõi **khó hơn**, đúng cái điều nó nhắm tới.

`AiService` và `failure-*.ts` **cố ý ở nguyên `modules/ai/`**, không xuống `core/`: 10 module import `AiService`, **0 module** import `ModelCatalogService`. Cấu trúc thư mục đang nói đúng ranh giới đó, đừng xoá nó đi.

Chuỗi dự phòng đi xuyên lõi qua chuỗi `lõi/model`, tách ở dấu `/` **đầu tiên** (91/91 model id của OpenCode không có `/`, 351/351 của OpenRouter thì có — nên không nhập nhằng). Không có tiền tố hợp lệ thì cả chuỗi là model id của lõi mặc định, nhờ vậy `.env` cũ vẫn chạy.

**Chuỗi đi tiếp trong đúng hai trường hợp**: hết hạn mức, hoặc `ModelUnavailableError` (thiếu key, lõi không phục vụ, bị chặn vì trả tiền, đã đo là hỏng schema). Lỗi schema vẫn ném ngay như cũ — đổi model khi model trả sai định dạng sẽ giấu mất tín hiệu "model này quá yếu cho tác vụ".

**Hai ràng buộc về tiền:** `resolve()` **không bao giờ tự thay model khác** (bản cũ lấy `models[0]`; OpenRouter có 413 model gồm loại đắt, và hàng đợi chấm điểm chạy theo cron), và `AI_ALLOW_PAID_MODELS` mặc định `false` với model **không khai giá bị coi là trả tiền**.

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

**`structured_outputs: true` KHÔNG có nghĩa là kết quả dùng được — đây là trục hỏng thứ hai, đo được ngày 2026-08-15.** Ba model free của OpenRouter qua được schema trên prompt thật đều trả về chữ hỏng: `nemotron-nano-9b-v2` lẫn chữ Ả Rập và chữ Hàn giữa câu tiếng Việt ("ph السياسة", "Đhettoawk"), `nemotron-3-super-120b` viết `strengths`/`gaps`/`recommendation` bằng **tiếng Anh** dù note thì tiếng Việt sạch. Và **không cái nào ổn định**: cùng model, hai lượt cách nhau vài phút, hai kiểu hỏng khác nhau.

Nên `bench-models.mjs` kiểm thêm hai thứ schema không bắt được: **chữ ngoài bảng Latin**, và **trường dài mà không có lấy một dấu tiếng Việt**. Đừng bỏ hai kiểm tra đó — thiếu chúng thì script chấm "tốt nhất" cho một model trả về chữ Ả Rập, và nó đã làm đúng như vậy một lần.

**Bẫy đo lường đã sập một lần, đừng sập lại:** `hy3-free` và `nemotron` là model **reasoning** — chúng tiêu 700–2300 token vào `reasoning_content` TRƯỚC khi sinh `content`. Thử với `max_tokens: 8` thì `content` ra rỗng và trông y như model không làm được việc; tôi đã kết luận sai đúng như vậy. `AiService` cố ý KHÔNG đặt `maxOutputTokens`.

**Chuỗi dự phòng KHÔNG cứu được tier free cho app này.** Đã chạy thật: chuỗi đổi model đúng cơ chế (deepseek → mimo → nemotron, ghi log và ghi `ai_calls` từng lượt), nhưng nemotron hết giờ trên cả `upskill.report` (240s) lẫn `match.evaluate` (90s) vì prompt thật mang theo cả khung đánh giá từ file skill. Chuỗi vẫn đáng giữ — nó đúng, rẻ, và sẽ có tác dụng khi một model nhanh còn hạn mức — nhưng **nó không thay thế được hạn mức**.

## Vì sao không có hồ sơ ứng viên ở đây

File này **từng** chứa hồ sơ ứng viên theo thiết kế của bản fork gốc, toàn bộ ở dạng `[YOUR_NAME]`, `[YOUR_PRIMARY_SKILLS]`… Backend đã thay nó bằng bảng `Profile` trong database, còn `PromptBuilderService` là chỗ điền các token `[YOUR_*]` vào khung prompt lúc chạy.

**Đừng khôi phục phần hồ sơ đó.** Một hồ sơ để nguyên placeholder không giúp runtime nào cả, mà lại khiến agent tưởng đây là workspace tìm việc cá nhân thay vì một backend đa người dùng.

Hai điều cần biết nếu muốn hồi sinh runtime Claude Code: `/setup` sẽ **ghi đè file này**, nên hãy tách hồ sơ ra chỗ khác trước; và danh sách kiểm tra CV/PDF của bản gốc (đúng 2 trang, lualatex, kiểm tra lớp text cho ATS) vẫn nằm trong git history — lấy lại bằng `git show <commit trước>:CLAUDE.md`.

## Ranh giới không được xê dịch

`tools/`, `scripts/`, `.agents/skills/*/`, `.claude/skills/*/SKILL.md` bị CI khoá vị trí (`lint_skills.py`, `security_guards.py`, `check_framework_version.py`). Sửa `AGENTS.md` thì **bắt buộc** bump `framework_version` trong frontmatter, nếu không CI đỏ.
