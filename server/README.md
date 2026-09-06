# Backend — AI Job Search

NestJS API. Thi hành các skill trong `../.claude/skills/` bằng model của OpenCode Zen.

## Chạy lần đầu

```bash
pnpm install
cp .env.example .env          # rồi sinh JWT_SECRET thật
pnpm run db:up                # Postgres qua Docker
pnpm run db:migrate
pnpm run start:dev
```

`docker-compose.yml` ghim `name: ai-job-search`. Không được bỏ dòng đó: Compose lấy
tên thư mục làm tên project, nên bỏ đi sẽ thành project "server" và tạo một volume
mới rỗng thay vì dùng `ai-job-search_postgres_data` đang có dữ liệu.

API ở `http://localhost:4000/api`.

## Kiến trúc

Hai đường tách biệt, đây là quyết định thiết kế quan trọng nhất:

- **Đường GHI** (chậm, có AI, chạy nền): job vào hàng đợi `match.evaluate` -> `MatchingProcessor` -> `MatchingService.evaluate()` -> lưu vào bảng `job_matches`.
- **Đường ĐỌC** (nhanh, không AI): `GET /api/dashboard`, `GET /api/matches` chỉ truy vấn DB. Không bao giờ gọi model.

Màn hình danh sách không được gọi AI lúc render: 24 công việc sẽ thành 24 lần gọi model, và điểm số sẽ nhảy mỗi lần tải lại trang. `promptHash` trên `job_matches` quyết định khi nào cần chấm lại - hash gồm nội dung skill, hồ sơ và mô tả công việc.

### Cấu trúc thư mục

```
src/
├─ common/        thứ cắt ngang mọi module - KHÔNG import gì từ modules/
│  ├─ guards/       JwtAuthGuard (toàn cục), RolesGuard
│  ├─ decorators/   @CurrentUser, @Roles, @Public
│  ├─ filters/      PrismaExceptionFilter
│  ├─ middleware/   RequestLogMiddleware
│  ├─ types/        AuthUser
│  └─ common.module.ts
├─ config/        đọc .env, đổi đường dẫn tương đối thành tuyệt đối
├─ prisma/        PrismaService và tiện ích quanh lỗi Prisma
├─ modules/       mỗi tính năng một thư mục: controller, service, dto, logic thuần
└─ generated/     Prisma sinh ra, không sửa tay
```

Quy tắc giữ cho cấu trúc này không rối: **`common/` không được import gì từ
`modules/`**. Nó là tầng đáy - mọi module dựa vào nó, còn nó không biết module
nào tồn tại. Kiểm nhanh bằng `grep -rn "from '.*modules/" src/common` (phải
không ra kết quả nào).

Đó cũng là lý do `AuthUser` nằm ở `common/types/` chứ không nằm trong
`jwt.strategy.ts`: type này là **hợp đồng** giữa nơi tạo ra nó (`JwtStrategy`
trong `modules/auth/`, biết về Prisma và cookie) và nơi tiêu thụ (guard,
`@CurrentUser`, và 10 controller). Để nó ở phía tạo thì phía tiêu thụ phải với
ngược vào ruột của AuthModule chỉ để lấy một cái type.

Phần *cài đặt* của xác thực vẫn ở `modules/auth/`: `JwtStrategy` là provider do
AuthModule đăng ký, `auth.cookie.ts` biết tên và cờ của cookie. `common/` chỉ
giữ phần giao diện chung.

## Skill nào đang được dùng ở đâu

| Route | File skill được nạp |
|---|---|
| `POST /api/matches/evaluate` | `04-job-evaluation.md` |
| `POST /api/interview/prep` | `07-interview-prep.md` + `02-behavioral-profile.md` |
| `POST /api/upskill/generate` | `upskill/SKILL.md` (Step 3-6) |
| `POST /api/documents/cv` | `05-cv-templates.md` + `03-writing-style.md` |
| `POST /api/documents/cover-letter` | `06-cover-letter-templates.md` + `03-writing-style.md` |
| `POST /api/documents/form-answer` | `08-application-forms.md` |
| `POST /api/scrape` | CLI trong `.agents/skills/*/cli/` (không dùng `job-scraper/SKILL.md`) |
| `POST /api/profile-drafts/cv` | không nạp skill nào — xem mục "Đọc CV" bên dưới |

`POST /api/scrape` không nạp `job-scraper/SKILL.md`. File đó là kịch bản cho agent
chat (kiểm tra sức khoẻ portal, trình bày kết quả, hỏi lại người dùng); năng lực
quét thì bóc ra thành một pipeline tất định. `search-queries.md` cũng không dùng -
nó là template `site:` cho WebSearch fallback, và chính file đó ghi rõ các portal
có CLI không cần đến nó.

Upskill không đọc `job_search_tracker.csv` như skill gốc. Bảng `job_matches`
đóng vai trò đó, và cột `overallScore` chính là `fit_rating`; công thức trọng số
`(100 - fit) / 100` giữ nguyên từ Step 3 của SKILL.md.

## Đọc CV thành hồ sơ (Agent 1)

`modules/profile-sources/`. Người dùng nộp CV PDF, model đọc thành **đề xuất**, người
dùng chọn nhận từng trường.

Không nạp file skill nào: `.claude/skills/` không có khung nào cho việc đọc CV — chúng
là khung để *viết* CV. Prompt nằm ngay trong `profile-synthesizer.service.ts`.

### Ranh giới quan trọng nhất: AI đề xuất, người dùng chốt

Model ghi vào `ProfileDraft.proposal`. **Không gì chạm vào bảng `Profile` cho tới khi
người dùng bấm áp dụng**, và khi áp dụng thì chỉ chép đúng những trường họ đã tích.

Đó là lý do có bảng riêng thay vì ghi thẳng: một lần đọc sai sẽ xoá mất dữ liệu người
dùng đã gõ tay, mà lại không có đường lùi. Bảng `ProfileDraft` biến quy tắc đó thành
cấu trúc dữ liệu chứ không để nó là ý định trong tài liệu.

`APPLICABLE_FIELDS` là **danh sách trắng**. `fields` đến từ HTTP request, nên danh
sách đen sẽ tự động cho qua mọi trường thêm vào sau này.

### Những trường model bị CẤM đề xuất

Đây là quyết định thiết kế, không phải thiếu sót — lý do đầy đủ trong docblock của
`profile-proposal.schema.ts`:

| Trường | Vì sao không được đoán |
|---|---|
| `careerGoals`, `energizingTasks`, `drainingTasks`, `targetSectors`, `dealBreakers` | **Sở thích.** CV không nói việc gì làm bạn kiệt sức. Suy từ chức danh cũ là bịa, và bịa vào đúng chiều chiếm 30% điểm phù hợp |
| `citizenship`, `workPermit`, `workPermitNote` | **Tình trạng pháp lý.** Đoán sai làm sai Eligibility Gate — bộ lọc CỨNG, loại thẳng ứng viên khỏi việc họ đủ điều kiện làm. "Sinh ở Hà Nội" không chứng minh được quốc tịch |
| `commuteConstraint`, `willingToRelocate`, `remotePreference` | Sở thích. `willingToRelocate` là boolean nên mặc định sai sẽ im lặng hoàn toàn |
| `lackingSkills` | Suy ra từ ĐỐI CHIẾU hồ sơ với tin tuyển dụng (việc của `upskill`), không đọc từ CV |

Đổi lại, schema có trường **`missing` bắt buộc**: model phải liệt kê những gì nó không
tìm thấy. Không có nó, một CV thiếu học vấn chỉ cho ra `educations: []` — trông y như
một lỗi đọc.

### Lớp text trước, vision sau

Đa số CV đều có lớp text (mọi bản xuất từ Word, LaTeX, Canva, hay in từ trình duyệt),
nên đường này xử lý phần lớn trường hợp **không tốn một lượt gọi model nào** — quan
trọng hơn bình thường vì hạn mức gateway free cạn trong một buổi.

`hasTextLayer` tính theo **ký tự trên mỗi trang** (ngưỡng 120), không theo tổng: một CV
3 trang scan kèm một trang bìa có text sẽ vượt mọi ngưỡng tính theo tổng rồi đi tiếp
với 1/3 nội dung mà không ai biết.

PDF scan ném `ScannedPdfError` và bị từ chối **ngay tại request** kèm câu hướng dẫn cụ
thể, chứ không tạo ra một bản nháp FAILED mà người dùng phải mở màn khác mới hiểu.

**Đường vision cho PDF scan CHƯA LÀM.** Đã đo là gateway có 5 model free nhận ảnh, nên
việc này khả thi; nó là adapter riêng (`CV_PDF_VISION`) chứ không phải một nhánh `if`
trong `CvPdfSource` — hai đường có chi phí, độ trễ và cách hỏng khác nhau hoàn toàn.

## Quét tin tuyển dụng

`PortalCliService` **quét động** `../.agents/skills/*/` lúc khởi động: thư mục nào
có `SKILL.md` và `cli/src/cli.ts` thì thành một portal. Tên portal bỏ hậu tố quy
ước (`itviec-search` → `itviec`). Thêm portal = thêm thư mục, không sửa code.
Tắt một portal = đặt `enabled: false` trong `SKILL.md` của nó rồi gọi
`POST /api/scrape/portals/reload`, không cần build lại.

Vì danh sách portal chỉ biết được lúc chạy, DTO **không** dùng `@IsIn` với danh
sách cứng - decorator chạy lúc nạp class nên không thể biết trước. Kiểm tra nằm
trong thân hàm của controller.

### Bốn portal, ba cách lấy dữ liệu khác nhau

| Portal | Nguồn | Đặc thù |
|---|---|---|
| `itviec` | HTML, `fetch` | Không lọc thành phố phía server |
| `linkedin` | HTML, `fetch` | **Vi phạm ToS nếu dùng thương mại** - xem cuối mục |
| `topcv` | HTML, **qua `curl`** | Cloudflare chặn vân tay TLS của `bun` |
| `vietnamworks` | **API JSON** | Trang web không có dữ liệu trong HTML |

Ba điều rút ra khi dựng hai portal sau, đều đã đo chứ không phải phỏng đoán:

**TopCV cần `curl` trên máy chủ.** Cloudflare nhận dạng client qua vân tay TLS
(JA3) chứ không chỉ qua header. Đo xen kẽ ba lượt, cùng URL cùng `User-Agent`:
`curl` trả 200 cả ba lần, `fetch` của bun trả 403 cả ba lần. Đổi header không
cứu được vì vấn đề nằm dưới tầng HTTP. Không có `curl` thì TopCV không quét
được.

**VietnamWorks không parse HTML được.** Trang `/viec-lam` là Next.js render
phía trình duyệt: từ khoá tìm kiếm chỉ xuất hiện 2 lần trong 237KB và không có
tin nào. Phải gọi API JSON nội bộ. Bù lại API trả kèm `jobDescription` +
`jobRequirement` ngay trong kết quả tìm kiếm.

**`PortalJobCard.description` là tối ưu thật, không phải chi tiết vụn.** Portal
nào trả sẵn mô tả thì `ScraperService` bỏ hẳn request `detail`. Đo được: quét
VietnamWorks mất **13 giây**, quét TopCV cùng số truy vấn mất **34 giây**.

### Một tin hỏng không được làm đổ cả lượt quét

Bước lấy mô tả và ghi DB nằm trong `try/catch` theo TỪNG tin. Đây là lỗi đã gặp
thật: quét VietnamWorks lưu xong 6 tin rồi tin thứ 7 tra chi tiết không thấy,
thế là cả lượt bị đánh `FAILED` và 6 tin kia không được xếp hàng chấm điểm.

```
Trước khi sửa   FAILED   41 giây   0 lượt chấm được xếp hàng
Sau khi sửa     DONE     13 giây   2 lượt
```

Tin bị gỡ giữa lúc quét là chuyện thường ở portal nào cũng có, nên đây là
đường chạy bình thường chứ không phải ngoại lệ hiếm. Số tin bị bỏ qua được ghi
ra log, không cắt im lặng.

### Hai loại lần quét

| `ScrapeRun.userId` | Ai chạy | Từ khoá | Chấm điểm cho ai |
|---|---|---|---|
| `null` | Cron hằng đêm | Gộp kỹ năng của mọi hồ sơ, **không gọi AI** | Mọi hồ sơ đủ dữ liệu |
| có giá trị | Người dùng bấm | Hồ sơ người đó, AI tinh chỉnh | Chỉ người đó |

Quét của hệ thống dùng chung là bắt buộc chứ không phải tối ưu: bảng `jobs` vốn
toàn cục, nên quét theo từng người nghĩa là với 50 tài khoản thì mỗi đêm đánh vào
portal 50 lần để lấy về gần như cùng một bộ tin - vừa phí, vừa là cách nhanh nhất
để bị chặn IP.

### Trần tin, cửa sổ 7 ngày và phân trang

Một lượt quét lấy tối đa `SCRAPER_MAX_JOBS_PER_PORTAL` tin (mặc định 50) cho MỘT
portal, gom qua nhiều trang. Phân trang là bắt buộc chứ không phải tối ưu:
LinkedIn trả đúng **10 tin một trang**, nên không lật trang thì một truy vấn
không bao giờ đạt tới trần.

Vòng lật trang dừng khi **trang vừa lấy không thêm được tin nào mới**, không phải
khi gặp trang toàn tin quá hạn: ba portal Việt Nam không cam kết sắp theo ngày
đăng, nên một trang toàn tin cũ KHÔNG bảo đảm trang sau cũng vậy.

`SCRAPER_MAX_AGE_DAYS` (mặc định 7) lọc theo ngày đăng ở **hai tầng**: portal nào
khai `jobAge: true` trong SKILL.md thì nhận cờ `--jobage` và tự lọc (chỉ LinkedIn),
còn lại lọc ở phía máy chủ bằng `withinDays` **ngay sau `search`, trước `detail`** -
lọc sau `detail` thì đã trả tiền cho đúng phần đắt nhất rồi mới biết tin cũ.

Tin không đọc được ngày đăng thì **giữ**: ITviec và TopCV thỉnh thoảng không in
nhãn ngày, loại sạch là mất tin thật. Đổi bằng `SCRAPER_REQUIRE_POSTED_AT=true`.

### Chống trùng: ba tầng, tầng thứ ba mới là tầng đắt

| Tầng | Cơ chế |
|---|---|
| Trong một lượt quét | `Map` theo `card.id`, gộp trùng giữa các truy vấn và các trang |
| Giữa các đêm, cùng portal | `@@unique([source, externalId])`; tin đã có chỉ làm mới dữ liệu thẻ |
| **Giữa các portal** | `Job.dedupeKey` - vân tay `công ty | chức danh | tỉnh` |

Cùng một tin đăng trên TopCV, VietnamWorks và LinkedIn có ba `externalId` khác
nhau nên hai tầng đầu không thấy gì. Không gộp thì mỗi bản sao tốn **một lượt gọi
model** để rút yêu cầu và chiếm **một suất trong `PER_USER_LIMIT`** của người dùng -
tức là ba bản sao của cùng một việc ăn hết 3/5 suất chấm điểm trong đêm đó.

Hai quyết định dễ làm sai ở tầng này:

- **`dedupeKey` KHÔNG được đặt `@@unique`.** Hai tin thật sự khác nhau vẫn có thể
  đụng khoá, và lúc đó `upsert` sẽ ghi đè mất một tin. Kiểm tra bằng truy vấn lúc
  ghi, trong cửa sổ 30 ngày gần nhất.
- **Bản sao vẫn được LƯU**, chỉ gắn `duplicateOfId` rồi không xếp hàng gọi model.
  Bỏ qua không lưu thì tập "đã biết" (nhận diện theo `source` + `externalId`) đêm
  sau lại tưởng là tin mới và lại tốn một request `detail` - mỗi đêm một lần, mãi
  mãi. Danh sách tin lọc `duplicateOfId: null` nên người dùng không thấy bản sao.

Tin ẩn tên công ty ("Không rõ", "Confidential") có `dedupeKey = null` và không bao
giờ bị gộp: gộp mọi tin ẩn danh cùng tỉnh vào một là sai nặng.

Thêm một trường dẫn xuất mới thì phải chạy `POST /api/admin/jobs/backfill-taxonomy?all=true`
(hoặc `node scripts/backfill-dedupe.mjs` khi chưa muốn dựng máy chủ). Chế độ tăng
dần chỉ nhặt tin thiếu `searchText`.

### Fan-out là chỗ số lượt gọi model bùng lên

Sau khi lưu tin, `planFanOut` quyết định chấm những cặp (người dùng, công việc)
nào. Số lượt là **tích** chứ không phải tổng: 11 tin mới × 13 hồ sơ = 143 lượt,
đã đo được trong một lần chạy thật. Vì vậy có hai chặn trên, và cả hai đều được
**ghi ra log khi cắt** - im lặng cắt thì nhìn `jobsQueued` sẽ tưởng quét được ít
tin:

- `MIN_COMPLETION_TO_SCORE` - hồ sơ dưới ngưỡng thì bỏ qua, vì chấm một hồ sơ
  trống chỉ tốn tiền để nhận về "không đủ dữ liệu".
- `MAX_EVALUATIONS_PER_RUN` - trần cho một lần quét. Vòng lặp đi **ngoài theo
  công việc, trong theo người dùng**, nên khi chạm trần thì mọi người đều được
  chấm vài tin đầu, thay vì vài người được chấm hết còn người xếp sau không có gì.

### Cron

```bash
SCRAPE_CRON_ENABLED=true
SCRAPE_CRON_SCHEDULE=0 23 * * *
CRON_TIMEZONE=Asia/Ho_Chi_Minh     # BẮT BUỘC khai
```

`CRON_TIMEZONE` không được bỏ trống: máy chủ thường chạy UTC, và `0 23 * * *`
theo UTC là **6 giờ sáng hôm sau** ở Việt Nam.

Lịch đăng ký qua `SchedulerRegistry` chứ không qua decorator `@Cron`: decorator
đọc giá trị lúc nạp class nên biểu thức lịch sẽ bị đóng băng thành hằng số, không
đọc được từ cấu hình.

Cron quét **lần lượt từng portal**, không song song. Song song thì nhanh hơn
nhưng đồng thời đánh vào mọi trang từ cùng một IP - đó đúng là dấu hiệu của bot.
Quét đêm không có ai ngồi chờ nên chậm không phải vấn đề.

Không portal nào khai `Crawl-delay` trong robots.txt, nên nhịp do ta tự đặt bằng
`SCRAPER_PORTAL_DELAY_MS`, tính riêng cho **từng** portal.

### LinkedIn

`SKILL.md` của skill này ghi rõ truy cập tự động là vi phạm Điều khoản dịch vụ
của LinkedIn và **không dùng cho mục đích thương mại hay thu thập dữ liệu hàng
loạt**. Ba portal Việt Nam không có ràng buộc này. Tắt LinkedIn khỏi cron bằng
`enabled: false` trong `.agents/skills/linkedin-search/SKILL.md`.

## Skill

`SkillRegistryService` đọc `../.claude/skills/*/SKILL.md` lúc khởi động. Thêm skill = thêm thư mục, không phải sửa code. `POST /api/skills/reload` nạp lại mà không cần khởi động lại server.

`PromptBuilderService` làm hai việc:
- `render()` thay `[YOUR_PRIMARY_SKILLS]`, `[YOUR_CAREER_GOAL_1]`... bằng dữ liệu hồ sơ từ DB. File skill gốc không bị sửa, nên vẫn sync được với upstream.
- `keepSections()` chỉ lấy các mục `##` cần thiết. **Không được nhồi cả file vào prompt**: file skill có mục `## Output Format` ra lệnh in bảng markdown, lệnh đó đánh nhau với JSON schema và làm model trả về sai định dạng.

## Agent chạy kịch bản: hai chỗ đã cắt để bớt token và bớt chờ

Đo trên `ai_calls` + `agent_steps` ngày 2026-08-29, kịch bản `/apply`, `MODEL_ID=oc/mimo-v2.5-free`:

| purpose | lượt | trung bình | lâu nhất | token vào | token ra | ăn cache |
|---|---|---|---|---|---|---|
| `agent.apply` | 21 | 90,1s | 312,5s | 112.510 | 3.918 | **18,9%** |
| `agent.reviewer` | 5 | 57,6s | 96,0s | 11.569 | 2.618 | 15,3% |

Token đầu vào của MỘT lượt chạy leo **20.877 → 59.429 → 331.274 → 454.770 → 473.877** qua năm bước, và bốn lượt hoàn tất mất 237s / 488s / 1.067s / 1.576s.

### 1. Nén lịch sử sau khi lưu file — `compact-history.ts`

Vòng lặp agent gửi lại TOÀN BỘ hội thoại ở mỗi bước, mà hội thoại chứa nguyên văn file `.tex` model vừa gõ ra. Đó là nguồn gốc của cả đường leo token lẫn tỉ lệ ăn cache 18,9% — phần đổi liên tục lấn hết phần hằng.

`AiService.runTools` nay nhận tuỳ chọn `compact`, cắm vào `prepareStep` của AI SDK. `AgentRunnerService` truyền `compactHistory` vào: tham số `content` của những lần `save_artifact` ĐÃ QUA (từ 2.000 ký tự trở lên) bị thay bằng một dòng ghi chú.

**File không mất, và ghi chú phải nói rõ điều đó.** `save_artifact` đã ghi xuống Storage rồi; nếu ghi chú không chỉ đường đọc lại thì model tưởng nó chưa viết gì và **gõ lại từ đầu** — đắt gấp đôi thay vì rẻ đi. Đó là lý do tool `read_artifact` được thêm cùng lúc: kịch bản `/apply` có hai bước sửa lại file đã viết.

Chỉ nén tham số của `save_artifact`, không nén tool khác: kết quả `fetch_url` cũng dài nhưng không có đường đọc lại nào.

Bản lưu xuống `AgentRun.messages` vẫn là bản ĐẦY ĐỦ — nén chỉ xảy ra lúc gửi request, nên lượt chạy tiếp vẫn khôi phục được nguyên văn rồi nén lại.

### 2. Nạp sẵn khung đặc tả vào system prompt — `PRELOADED_REFERENCES`

Cùng lượt chạy đó tốn hai bước (7,5s + 6,9s) cho sáu lượt `read_skill_reference`, chỉ để lấy về những file KHÔNG bao giờ đổi. `buildSystemPrompt` nay nhồi thẳng chúng vào prompt:

| kịch bản | file nạp sẵn |
|---|---|
| `apply` | `03-writing-style.md`, `04-job-evaluation.md`, `05-cv-templates.md`, `06-cover-letter-templates.md` |
| `interview` | `02-behavioral-profile.md`, `07-interview-prep.md` |

Cái giá là ~43.000 ký tự hằng cộng vào system prompt. Nó đáng vì **system prompt là phần hằng đứng đầu nên ăn cache tiền tố** (đo được 97,6% ở mục "Token" của `CLAUDE.md`), trong khi cùng nội dung đó nằm giữa hội thoại thì mỗi lượt chạy trả tiền lại từ đầu.

Ba ràng buộc:

- **`01-candidate-profile.md` KHÔNG được nạp sẵn** — `read_profile` đọc hồ sơ thật từ database, file kia chỉ là khung placeholder.
- **`08-application-forms.md` cũng không** — chỉ dùng khi tin tuyển dụng có biểu mẫu, nạp sẵn là trả tiền cho việc phần lớn lượt chạy không làm.
- **Sổ `seen` được gieo sẵn tên các file đã nạp**, nên agent gọi lại `read_skill_reference` cho chúng chỉ nhận một câu nhắc chứ không nhận lại vài nghìn token.

`test/unit/modules/agent/system-prompt-references.spec.ts` đối chiếu danh sách với file THẬT trên đĩa: đổi tên một file trong `.claude/skills/` mà quên sửa danh sách thì nó đỏ, thay vì âm thầm nạp thiếu.

### 3. Hiện file ngay khi agent lưu xong

Bổ 114 bước `/apply` thật ra theo tool cho thấy đồng hồ nằm ở đâu:

| tool | số bước | tổng | trung bình | % |
|---|---|---|---|---|
| `save_artifact` | 31 | 2.572s | 83s | **51,2%** |
| `spawn_reviewer` | 7 | 991s | 142s | **19,7%** |
| `compile_pdf` | 20 | 470s | 23s | 9,4% |
| chỉ viết chữ | 9 | 422s | 47s | 8,4% |
| `ask_user` | 14 | 268s | 19s | 5,3% |
| toàn bộ các bước đọc + `fetch_url` | 33 | 294s | 9s | 5,9% |

Tách `save_artifact` theo tài liệu: **CV 25 lần / 1.475 giây**, **thư xin việc 17 lần / 1.024 giây**.

Nghĩa là CV soạn xong ở khoảng phút thứ tư, nhưng người dùng phải đợi thêm thư xin việc, phản biện và compile PDF mới nhìn thấy dòng đầu tiên. `recordStep` nay ghi luôn `result.artifacts` sau MỖI bước thay vì đợi lượt chạy kết thúc, và `AgentFilesCard` đọc nó ở mọi trạng thái.

`GET /agent-runs/:id/artifact?name=cv/main.tex` trả nội dung file. **Khoá Storage lấy từ bản ghi trong database, không ghép từ tên người dùng gửi lên** — tên chỉ dùng để dò trong danh sách artifact của đúng lượt chạy đó, mà lượt chạy đã lọc theo `userId`. Ghép thẳng vào đường dẫn thì `../../<id người khác>/cv/main.tex` là một lượt đọc trộm; có test đơn vị ghim đúng ca đó.

Tên file đi qua **query** chứ không qua path vì nó chứa dấu gạch chéo (`cv/main.tex`) và Nest sẽ cắt nó thành hai đoạn route.

### 4. Phản biện chạy NỀN, sau khi đã trả kết quả

`spawn_reviewer` từng là một tool trong vòng lặp agent: nó sinh một agent con đóng vai nhà tuyển dụng, và agent chính **đứng đợi** nó xong. Đo được 142 giây mỗi lần, **19,7%** quãng chờ - trong khi CV thì đã lưu xong từ trước đó.

Nay nó là một hàng đợi riêng, `QUEUE.AGENT_REVIEW`:

1. Lượt chạy kết thúc `DONE` → `AgentProcessor` đánh dấu `review = { status: 'PENDING' }` rồi xếp việc.
2. `AgentReviewService` đọc lại artifact từ Storage, gọi model, ghi `review` vào chính bản ghi lượt chạy.
3. Giao diện hỏi trạng thái tiếp chừng nào `review.status === 'PENDING'`, rồi hiện thẻ góp ý.

**`review` là cột riêng, không nhét vào `result`.** `recordStep` ghi đè `result` sau mỗi bước; một lượt chạy tiếp sẽ xoá mất lời phản biện của lượt trước.

**Ba trạng thái, không phải hai.** `null` = kịch bản này không có phản biện; `PENDING` = có và đang tới; `FAILED` = đã thử và hỏng. Gộp `null` với `PENDING` thì màn hình kết luận "không có góp ý nào" trong lúc góp ý đang chạy.

**`draft()` chỉ đọc artifact có khoá bắt đầu bằng `<userId>/`.** Vòng phản biện chạy trong worker, không có request nào để mà kiểm quyền - nên phép lọc đó là chốt chặn duy nhất. Có test đơn vị ghim.

Phản biện hỏng **không** làm hỏng lượt chạy: hồ sơ đã có, mất vòng đọc lại thì tệ hơn một chút chứ không phải mất trắng. Đây là luật cũ của `spawn_reviewer`, giữ nguyên.

### `compile_pdf` thì ĐỪNG dời đi - nó là chốt chặn, không phải khâu giao hàng

Nhìn tên dễ tưởng nó sinh file PDF cho người dùng tải. Không phải: nó compile rồi trả về **số đo** - mấy trang, ký tự nào font không vẽ được. Bản gốc `/apply` bắt Claude mở ảnh trang giấy ra nhìn; ở đây không có mắt nên thứ thay thế được là con số.

Đo trên 28 lượt gọi thật:

| | số lần |
|---|---|
| compile HỎNG | **6** |
| thiếu glyph | 0 |
| quá 2 trang | 0 |
| bước NGAY SAU đó có sửa file | **14** |

**6/28 lần bản `.tex` model gõ ra không compile nổi**, và một nửa số lượt gọi dẫn tới một lần sửa ngay sau đó. Dời nó ra sau khi đã trả kết quả là gửi cho người dùng một file hỏng rồi mới báo. 9,4% quãng chờ này là bảo hiểm rẻ nhất trong cả luồng - giữ nguyên.

Con số 6 lần hỏng đó cũng chính là lý lẽ mạnh nhất cho hướng A: không bắt model gõ tay LaTeX thì không có gì để mà hỏng.

### Thư xin việc là TUỲ CHỌN, và ô chọn nằm ở form khởi động

Tách `save_artifact` theo tài liệu cho thấy riêng việc gõ thư xin việc mất **1.024 giây / 17 lần lưu** - khoảng một phần tư quãng chờ, cho một tài liệu mà phần lớn tin trên TopCV, ITviec hay VietnamWorks không đòi.

`StartAgentDto.coverLetter` mặc định **false**, và `buildOpeningPrompt` dặn thẳng "BỎ HẲN bước soạn thư" khi không được tích.

**Đừng chuyển câu hỏi này vào `ask_user`.** Tool đó khai `stopOnTool`: nó CẮT ĐỨT lượt chạy, và khi người dùng trả lời thì backend gọi model lại từ đầu với toàn bộ hội thoại cũ - đó là lý do một lượt `/apply` có 3-4 lời gọi model chứ không phải một, và token vào leo tới 618k. Đo được 17 lần `ask_user` trên 12 lượt chạy. Hỏi giữa lượt còn bắt người dùng ngồi chờ chính họ, đúng cái đang muốn tránh.

Cờ này nằm trong `AgentRun.input` (cột Json), **không cần migration**.

### Hai chốt chặn chống lặp trong bộ tool của agent

Cả hai đều nằm trong CLOSURE của tool, tức sống đúng một lượt gọi `runTools`. Nhắc bằng system prompt đã thử và không ăn thua - dòng "soạn xong một tài liệu thì lưu MỘT lần" có từ trước, mà 12 lượt chạy vẫn lưu 31 lần.

**`save_artifact`: trần 3 lần cho mỗi tên file, cộng chặn nội dung y hệt.**

Lưu lại đúng nội dung cũ thì trả về `unchanged` mà không ghi. Quá 3 lần thì từ chối, kèm câu nói rõ bản đang có vẫn được giao - nếu không model sẽ tưởng mất file và gõ lại lần nữa.

Ba chứ không phải một: bản `.tex` model gõ ra **hỏng compile 6/28 lần**, nên một lượt sửa sau khi `compile_pdf` báo lỗi là chính đáng. Ba cho phép bản đầu cộng hai lần sửa.

Trần đếm theo TỪNG tên file, không dùng chung: CV và thư xin việc là hai tài liệu riêng.

**`compile_pdf`: nhớ kết quả theo sha256 của nội dung `.tex`.**

28 lượt compile cho 12 lượt chạy, mỗi lượt 23 giây. File không đổi thì trả kết quả cũ kèm câu nhắc "sửa file rồi hãy compile lại". Nhớ **cả kết quả HỎNG** - hỏi lại một bản đã biết là hỏng thì càng không đáng tốn 23 giây nữa.

Lưu ý cho người sửa sau: cả hai closure nằm trong `buildToolSet`, mà `buildToolSet` được gọi lại mỗi lần lượt chạy tiếp tục sau `WAITING_USER`. Nghĩa là bộ đếm **reset** ở mỗi đoạn chạy. Đó là chấp nhận được: mỗi đoạn là một lời gọi model riêng, và người dùng vừa trả lời xong thì một lần lưu lại thường là chính đáng.

### Agent KHÔNG viết LaTeX nữa — `save_cv` thay `save_artifact`

Đây là chỗ đắt nhất của cả luồng: `save_artifact` chiếm **51,2%** quãng chờ, trung bình 83 giây mỗi lần và đỉnh 247 giây. Nó chậm không phải vì ghi file mà vì model phải gõ ra **20.000 token LaTeX** trước khi gọi tool - preamble, macro, `section`, khoảng cách, màu, rồi mới tới nội dung.

Nay agent chỉ đưa **nội dung có cấu trúc**; code dựng bản trình bày, đúng như đường `document.cv` vẫn làm.

| | trước | sau |
|---|---|---|
| tool | `save_artifact("cv/main.tex", <LaTeX>)` | `save_cv(<JSON theo cvSchema>)` |
| token model sinh | ~20.000 | ~1.000 |
| ép định dạng | không có | zod |
| kết quả | file rời trong Storage | một `Document` |
| compile hỏng | 6/28 lần | không còn LaTeX để hỏng |

**Vì sao khuôn cố định chứ không để agent tự chọn bố cục.** Kho mẫu CV đã có sáu mẫu, `Document.layout` cho người dùng đổi thứ tự và ẩn mục, đổi mẫu không tốn lượt gọi model nào. Cho agent tự chế bố cục là chốt một thứ mà người dùng **không đổi được nữa nếu không gọi model lần nữa** - đi ngược đúng ranh giới mà `templateId` là cột riêng đang bảo vệ. Agent giữ nguyên quyền quyết định phần thật sự làm nên một CV may đo: chọn kinh nghiệm nào, viết gạch đầu dòng thế nào.

**`DocumentsService.saveFromAgent()` KHÔNG gọi model**, khác `generate()` ở đúng chỗ đó. Agent vừa đọc tin tuyển dụng và hồ sơ xong nên nội dung đã có; gọi `generate()` từ agent là trả tiền hai lần cho cùng một việc.

**`Document.agentRunId` là cột thật, `SetNull`.** Nhờ nó màn Ứng tuyển tự động trỏ thẳng sang trình sửa CV. Dọn nhật ký một lượt chạy cũ không được phép xoá cái CV người dùng đang dùng để đi nộp.

**Ba tool đã GỠ khỏi bộ của agent:** `spawn_reviewer` (chuyển sang hàng đợi nền), `read_template` và `compile_pdf` (không còn `.tex` nào để đọc mẫu hay để kiểm). File của chúng đã xoá - một tool còn nằm trong bộ là một tool sẽ bị gọi, đó là bài học từ chính `spawn_reviewer`.

**`05-cv-templates.md` nạp sẵn theo MỤC, không nạp cả file.** Nửa file là cơ chế LaTeX - "Template: LaTeX moderncv", "Document Structure", "Compile-and-Inspect Loop (MANDATORY)" - và sau thay đổi này chúng không chỉ thừa mà còn **sai**: chúng bảo model làm thứ nó không còn tool để làm. `REFERENCE_SECTIONS` giữ lại bốn mục hướng dẫn nội dung, cắt hơn 30% số chữ.

Còn sót ba chỗ nhắc thoáng qua tới LaTeX bên trong các mục được giữ (`enlargethispage` ở mục cắt bớt nội dung, hai câu ở mục ATS). Có test đếm số lệnh LaTeX còn lại và ghim mức ≤3 - thêm lại một mục cơ chế là đỏ ngay. `workflowNotes.apply` cũng nói thẳng "mọi hướng dẫn về LaTeX trong khung đặc tả đều KHÔNG áp dụng".

**`save_cv` trần 2 lần mỗi loại**, thấp hơn `save_artifact`: không còn vòng compile-sửa-compile nên không có lý do chính đáng nào để lưu tới lần thứ ba.

## Các điểm dễ vấp

| Vấn đề | Nguyên nhân |
|---|---|
| `response did not match schema` | Thiếu `supportsStructuredOutputs: true` khi tạo provider. Mặc định false, SDK không gửi JSON schema lên API |
| Model chấm theo thang 0-5 | Thiếu `.describe()` nêu rõ thang 0-100 trên trường schema |
| `exports is not defined` | Prisma generator thiếu `moduleFormat = "cjs"` |
| Build ra `dist/src/main.js` | Có file nằm ngoài `src/` lọt vào build (xem `tsconfig.build.json`) |
| pg-boss `UnsupportedNativeDataType` | Dùng adapter `fromPrisma`. Phải dùng connection string riêng |
| Request treo gần 9 phút | Gateway free chậm dần khi bị gọi nhiều, không trả 429. Đã đo được 517 giây một lần gọi. `AiService` đặt `AbortSignal.timeout` 90 giây |
| Thư xin việc có hai lời chào | Model chép lại salutation vào đầu `opening`. `renderCoverLetter` cắt dòng đầu nếu nó là lời chào |

## Hai thứ KHÔNG gọi AI dù giao diện gọi là "AI"

**Gợi ý trên màn hình Tổng quan** (`suggestions` trong `GET /api/dashboard`) được suy
ra bằng SQL, không gọi model: hồ sơ thiếu gì, kỹ năng nào lặp lại ở nhiều tin, việc
nào đang điểm cao và còn mới, tỷ lệ tin bị loại vì điều kiện. Gọi model ở đây sẽ đợi
vài chục giây và phụ thuộc gateway, để đổi lấy đúng những kết luận một câu truy vấn
đã trả lời được. Dữ liệu dùng để suy ra thì vẫn do AI chấm điểm sinh ra.

**So khớp kỹ năng** (`skill-gaps.ts`) phải cắt đuôi "js" trước khi so sánh. Hồ sơ ghi
"ReactJS" còn tag của tin ghi "React"; chỉ hạ chữ thường rồi so bằng nhau thì hệ thống
sẽ khuyên một lập trình viên React đi học React. Đã gặp đúng lỗi này khi chạy thử.
Không dùng so khớp chuỗi con - `"JavaScript".includes("Java")` là đúng, và khi đó hệ
thống sẽ im lặng về việc ứng viên thiếu Java.

## Đo sức khoẻ gateway

Mỗi lần gọi model đều được ghi vào bảng `ai_calls`, **kể cả lần hỏng**. Trước đó
`modelId` nằm rải rác ở 5 bảng kết quả, nhưng những lần thất bại không để lại dấu vết
ở đâu - nên không trả lời được câu hỏi cơ bản nhất: gateway đang hỏng bao nhiêu phần
trăm, và chậm thế nào.

```bash
GET /api/admin/ai-health?days=7    # tỷ lệ, p50/p95, nguyên nhân, tách theo tác vụ và model
GET /api/admin/ai-failures?limit=20
```

**Phân loại nguyên nhân là thông tin giá trị nhất trong bảng này.** `SCHEMA` nghĩa là
model quá yếu cho tác vụ - siết schema, sửa mô tả, hoặc đổi model mạnh hơn.
`TIMEOUT`/`UPSTREAM` nghĩa là gateway có vấn đề - đổi nhà cung cấp hoặc giảm tải.
Hai kết luận đối lập nhau và dẫn tới hai hành động khác hẳn; gộp chung thành "lỗi"
thì mất hết.

Báo cáo dùng **p50/p95 chứ không dùng trung bình**: độ trễ gọi model có đuôi rất dài,
một lần 517 giây sẽ kéo trung bình lên và che mất thực tế là phần lớn lần gọi đều
nhanh. Trung bình ở đây nói dối một cách có hệ thống.

Ghi nhật ký không bao giờ được làm hỏng lần gọi thật: nếu ghi thất bại thì chỉ log
cảnh báo rồi đi tiếp.

## Xác thực: mặc định là ĐÓNG

`JwtAuthGuard` đăng ký toàn cục bằng `APP_GUARD` trong `CommonModule`, nên **mọi
route đều đòi token trừ khi có `@Public()`**. Controller mới không cần gắn guard,
và quan trọng hơn: quên nghĩ tới xác thực thì route đó đóng chứ không mở.

Chiều lỗi này mới là điều đáng giá. Quên bảo vệ một route thì không ai báo cho
biết - nó cứ chạy đúng cho tới ngày có người tìm ra. Quên mở một route thì người
dùng nhận 401 và báo trong vòng một phút.

Toàn bộ bề mặt công khai của máy chủ là ba route, tìm bằng `grep -rn "@Public()" src`:

| Route | Vì sao công khai |
|---|---|
| `POST /api/auth/register` | chưa có tài khoản |
| `POST /api/auth/login` | chưa có token |
| `POST /api/auth/logout` | phải xoá được cookie kể cả khi token đã hết hạn, nếu không người dùng mắc kẹt với cookie chết |

Đã kiểm trên máy chủ chạy thật: 12 route của 12 controller đều trả 401 khi không
có token, ba route trên vẫn đi qua.

## Phân quyền

`User.role` là `USER` hoặc `ADMIN`. Route quản trị chỉ cần khai
`@UseGuards(RolesGuard)` kèm `@Roles('ADMIN')` - không khai lại `JwtAuthGuard`,
vì guard toàn cục luôn chạy TRƯỚC guard của controller nên `request.user` chắc
chắn đã có khi `RolesGuard` đọc tới.

Vai trò được đọc từ DB mỗi request qua `JwtStrategy.validate()`, **không** nằm trong
claim của token. Ghi vai trò vào token nghĩa là một tài khoản bị hạ quyền vẫn giữ
nguyên quyền cũ cho đến khi token hết hạn. Đã kiểm chứng: cùng một token, sau khi
`update users set role='ADMIN'` thì route đổi từ 403 sang 200 mà không cần đăng nhập lại.

Nâng quyền cho một tài khoản:

```sql
update users set role = 'ADMIN' where email = 'ban@example.com';
```

## Log request và lỗi Prisma

`RequestLogMiddleware` ghi một dòng cho mỗi request: `GET /api/jobs 401 5ms`.
2xx là `log`, 4xx là `warn`, 5xx là `error`, quá 1 giây thì kèm `(chậm)`.

Nó là **middleware chứ không phải interceptor**, và đây là lý do: guard chạy
trước interceptor, nên một interceptor không bao giờ nhìn thấy request bị
`JwtAuthGuard` chặn. Đã đo trực tiếp - bản dùng interceptor trả 401 cho
`GET /api/jobs` mà không để lại dòng log nào, trong khi 401 hàng loạt lại đúng
là thứ đầu tiên cần thấy khi có người dò mật khẩu. Middleware nằm ngoài cùng nên
bắt được cả 401 của guard lẫn 404 của đường dẫn không tồn tại.

Một lưu ý đã đo: `setGlobalPrefix('api')` áp lên cả middleware, nên đường dẫn
ngoài `/api` (ví dụ máy quét dò `/wp-admin`) KHÔNG được ghi. Mọi thứ chạm tới
API đều được ghi.

Log cố ý không chứa body, header hay query string: body có mật khẩu lúc đăng
nhập, header có cookie mang token, query string là nơi token hay bị nhét vào ở
các luồng thêm sau.

`PrismaExceptionFilter` là lưới an toàn cho lỗi Prisma lọt tới tầng HTTP:

| Mã Prisma | HTTP | Nghĩa |
|---|---|---|
| P2025 | 404 | update/delete trên bản ghi không còn ở đó |
| P2002 | 409 | vi phạm ràng buộc unique |
| P2003 | 400 | khoá ngoại trỏ tới bản ghi không tồn tại |
| còn lại | 500 | |

Nơi nào biết lỗi đó nghĩa là gì trong nghiệp vụ thì vẫn bắt tại chỗ với thông
báo cụ thể (`auth.service.ts` cho email trùng, `applications.service.ts` cho đơn
trùng). Filter chỉ lo phần còn lại. Thông báo trả ra cố tình chung chung vì
`error.meta` của Prisma chứa tên bảng và tên cột - chi tiết đó chỉ vào log.

## Test

```bash
pnpm test          # 293 test, ~12 giây, không cần mạng hay database
pnpm test:watch
```

Test đơn vị **không gọi AI, không chạm Postgres, không ra mạng**. Đó là cố ý: chúng
phải chạy đủ nhanh để bạn gõ xong là chạy ngay, và phải xanh/đỏ vì logic chứ không
vì gateway free hôm nay có rảnh hay không.

Gần như tất cả nhắm vào **hàm thuần**. Ngoại lệ duy nhất là `profile-sources`: nó
đọc **PDF thật** từ `test/fixtures/`. Ở đó một bản giả sẽ vô nghĩa — điều duy nhất
đáng kiểm là dấu tiếng Việt có sống qua vòng trích xuất hay không, mà bản giả thì
trả lại đúng chuỗi ta tự nhập vào.

Vì cùng lý do đó, `pnpm test` gọi **`node test/run-unit.mjs`** chứ không gọi `jest`
trực tiếp: `pdf-parse` nạp worker pdfjs bằng `import()` động nên jest cần cờ
`--experimental-vm-modules`. Docblock của file đó ghi lại những cách đã thử mà
không tránh được cờ này — đừng thử lại.

### Test nằm ở đâu

Unit test **không** nằm cạnh module mà ở `test/unit/**`, phản chiếu đúng cây
`src/**`: `src/modules/scraper/sources/normalize.ts` được kiểm bởi
`test/unit/modules/scraper/normalize.spec.ts`. Nhờ vậy `src/` chỉ còn mã chạy
thật, và `tsconfig.build.json` không phải lọc file test ra khỏi bản build.

Jest chỉ quét `test/unit` (`roots` trong `package.json`), nên một file `.spec.ts`
đặt lạc vào `src/` sẽ **không được chạy** - đặt đúng chỗ thì mới được tính.

Spec import mã nguồn qua alias `src/...` (khai báo ở `paths` của `tsconfig.json`
và `moduleNameMapper` của Jest), giữ nguyên đường dẫn thật của module thay vì
chuỗi `../../../`:

```ts
import { normalizeJob } from 'src/modules/scraper/sources/normalize.js';
```

Test e2e vẫn ở `test/*.e2e-spec.ts`, chạy riêng bằng `pnpm test:e2e`.

| File (trong `test/unit/`) | Bảo vệ điều gì |
|---|---|
| `modules/matching/evaluation.schema.spec.ts` | Trọng số 30/25/15/30 và ngưỡng verdict 75/60/45/30 đúng như `04-job-evaluation.md`. Schema chặn điểm âm, điểm vượt 100, điểm thập phân |
| `modules/documents/latex.spec.ts` | `escapeLatex` vô hiệu `\input`, `\write18`, bom `\def\x{\x\x}`. Dấu cách và tiếng Việt không bị biến dạng. Lời chào lặp bị cắt |
| `modules/skills/prompt-builder.service.spec.ts` | `keepSections` BỎ được mục `## Output Format`. Placeholder không có ánh xạ vẫn bị thay, không để lại nguyên văn trong prompt |
| `modules/storage/local.storage.spec.ts` | Chặn path traversal 6 dạng. Khoá của người dùng này không đọc được workspace của người khác |
| `modules/dashboard/suggestions.spec.ts` | Ngưỡng hiện từng thẻ gợi ý, và không bao giờ trả quá 4 thẻ |
| `modules/dashboard/skill-gaps.spec.ts` | ReactJS/React được coi là một; JavaScript KHÔNG bị nhầm thành Java |
| `modules/profile/completion.spec.ts` | Mảng rỗng và chuỗi trắng tính là chưa điền; thứ tự ưu tiên nhắc điền |
| `modules/ai/failure-kind.spec.ts` | SCHEMA được ưu tiên hơn TIMEOUT; bóc được RetryError để lấy nguyên nhân thật |
| `modules/admin/ai-health.spec.ts` | p50/p95 không bị một lần 517 giây kéo lệch như trung bình |
| `common/guards/jwt-auth.guard.spec.ts` | `@Public()` đi thẳng không đụng passport; route thường vẫn phải qua. Metadata đọc bằng `getAllAndOverride` nên mở được một route lẻ trong controller đã đóng |
| `common/filters/prisma-exception.filter.spec.ts` | P2025 ra 404, P2002 ra 409, P2003 ra 400, mã lạ ra 500. Tên bảng và tên cột trong `error.meta` không rò ra phản hồi |
| `common/middleware/request-log.middleware.spec.ts` | Query string không lọt vào log. Request bị guard chặn và đường dẫn không tồn tại vẫn được ghi - kiểm bằng một app Nest thật, không đụng database |
| `modules/profile-sources/pdf-text.spec.ts` | Dấu tiếng Việt sống qua vòng trích xuất PDF — kiểm trên **PDF thật**. File quá lớn bị chặn TRƯỚC khi parse; PDF hỏng, rỗng, cắt dở đều ra lỗi đã phân loại chứ không sập |
| `modules/profile-sources/cv-pdf.source.spec.ts` | PDF scan ném `ScannedPdfError` chứ KHÔNG trả bằng chứng rỗng. Câu lỗi cho người dùng không lộ tên lớp lỗi; lỗi lạ trả `null` để không bị nhận vơ là lỗi PDF |

Các CLI trong `.agents/skills/*/cli/` có bộ test riêng chạy bằng `bun test`.
CI duyệt qua mọi thư mục CLI thay vì liệt kê từng cái, nên portal thêm sau sẽ tự
được kiểm tra.

## Nhiều lõi model (SEAM: `modules/ai/providers/`)

Một "lõi" là một gateway phục vụ model. Hiện có ba: `opencode`, `openrouter` và `kilo`, mỗi cái **một file** trong `src/modules/ai/providers/`.

**Thêm lõi mới = thêm một file rồi thêm một dòng trong `providers/index.ts`.** Không có class nào phải viết, không đăng ký gì với Nest. Lý do cố ý là dữ liệu chứ không phải class: trong 185 provider của catalog, **146 cái dùng chung đúng một adapter** (`@ai-sdk/openai-compatible`), nên giữa chúng chỉ khác nhau baseURL, tên biến chứa key, và cách biết một model làm được gì.

Chuỗi dự phòng đi **xuyên lõi**. Mỗi mắt xích trong `MODEL_FALLBACK_IDS` viết `lõi/model`, hoặc chỉ `model` cho lõi mặc định:

```
MODEL_FALLBACK_IDS=deepseek-v4-flash-free,openrouter/openai/gpt-oss-20b:free
```

Tách ở dấu `/` **đầu tiên**. Cách mã hoá này không nhập nhằng nhờ một sự thật đã đo: 91/91 model id của OpenCode không có dấu `/`, 351/351 của OpenRouter thì có.

**Khác biệt thật giữa hai lõi chỉ có một**, và nó là lý do `providers/` tồn tại:

| | OpenCode `/models` | OpenRouter `/models` |
|---|---|---|
| Trường trả về | `id`, `object`, `created`, `owned_by` | + `supported_parameters`, `pricing`, `context_length` |
| Biết model làm được structured output? | **Không** — chỉ đo mới biết | **Có, khai sẵn** |

Nên `openrouter.ts` có hàm `declaresStructuredOutput`, `opencode.ts` không có — và **việc nó không có chính là tài liệu** cho biết lõi đó mù. Bù lại, `opencode.ts` giữ `knownNoStructuredOutput`: danh sách model đã đo là hỏng. Đó là danh sách **chặn**, cố ý không phải danh sách cho phép — model chưa đo vẫn được thử.

**`kilo` là ca thứ ba, và nó phá vỡ quy tắc trên có chủ đích.** `/models` của kilo CÓ trả `supported_parameters` (272/361 model khai `structured_outputs`), nhưng lõi này **cố ý không đọc** — vì lời khai đó đã đo là sai: `tencent/hy3:free` khai `false` mà vẫn trả JSON hợp lệ trên prompt thật, và nó cho tiếng Việt sạch nhất trong mọi model đã thử. Đừng "sửa cho nhất quán với openrouter"; có test ghim điều này.

`kilo` **nhận request không cần API key** (đã đo: không header vẫn 200), nên nó là mắt xích cứu hộ khi hai lõi kia cạn hạn mức. Nhưng nó là **mắt xích CUỐI, không phải lõi chính**: cả 14 model free của nó đều tự khai `mayTrainOnYourPrompts: true`, mà app thì gửi đi CV người thật.

Ràng buộc về tiền, đừng nới:

- **`resolve()` KHÔNG bao giờ tự thay thế model khác.** Bản cũ không tìm thấy model được yêu cầu thì lấy `models[0]`. Với OpenCode toàn free thì vô hại; OpenRouter có 413 model gồm cả loại đắt, nên gõ sai một ký tự trong `.env` sẽ thành một hoá đơn chạy theo cron.

## Đánh giá chất lượng model

```bash
pnpm run bench                       # model free của lõi mặc định
pnpm run bench -- openrouter/openai/gpt-oss-20b:free deepseek-v4-flash-free
```

Script chấm điểm thử một cặp hồ sơ/tin tuyển dụng đã biết trước đáp án và báo các lỗi ngữ nghĩa mà schema không bắt được (sai thang điểm, eligibility sai, gaps rỗng).

**Nó dùng KHUNG ĐÁNH GIÁ THẬT, đọc từ chính file `04-job-evaluation.md` mà `MatchingService` nạp lúc chạy** — và đây là bản sửa một bẫy đo đã sập một lần. Bản cũ dùng system prompt ba dòng tự chế, nên `nemotron-3.5-lightning` xong trong 12,4 giây và bị kết luận là "dùng được"; prompt thật của app mang cả khung này và nó hết giờ ở mốc 90 giây. **Đo bằng prompt nhỏ là đo một tác vụ khác.**

## Chạy bằng Docker

`Dockerfile` nằm ở **gốc repo**, không phải trong `server/`, và build context cũng phải là gốc repo: image cần cả `server/` lẫn `.claude/skills` và `.agents/skills` — hai thư mục sau nằm ngoài `server/` nhưng được đọc lúc khởi động.

```bash
# từ gốc repo
docker build -t ai-job-server -f Dockerfile .
```

Chạy migration là **bước riêng**, không nhúng vào lệnh khởi động: nhúng vào thì khi scale ra nhiều instance, mọi bản sẽ cùng chạy migration một lúc.

```bash
docker run --rm --network <mạng-có-postgres> \
  -e DATABASE_URL="postgresql://..." \
  ai-job-server pnpm prisma migrate deploy

docker run -d --name ai-job-server --network <mạng-có-postgres> \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="<khoá thật>" \
  -e CORS_ORIGIN="https://app.example.com" \
  -v ai-job-workspaces:/app/workspaces \
  -p 4000:4000 ai-job-server
```

### Vài điều trong image không hiển nhiên

- **Node >= 22.12 là yêu cầu cứng**, đã khai trong `engines`. `ai` và `@ai-sdk/openai-compatible` là ESM thuần không có bản CommonJS, còn `nest build` xuất ra CommonJS — ứng dụng chạy được nhờ Node cho phép `require()` một module ESM, tính năng chỉ có từ 22.12. Image cũ hơn chết lúc khởi động với thông báo không liên quan gì tới nguyên nhân.
- **bun và curl đều được cài** vì portal CLI cần chúng: cả bốn CLI chạy bằng bun, và TopCV chặn TLS fingerprint của bun nên CLI của nó gọi qua curl. Thiếu chúng thì việc quét hỏng *lúc chạy*, không phải lúc build.
- **Đường dẫn khai tường minh** bằng `SKILLS_DIR`, `PORTALS_DIR`, `STORAGE_LOCAL_ROOT`. Mặc định trong `configuration.ts` là tương đối theo `process.cwd()` — đúng khi chạy `pnpm start` từ `server/`, nhưng đó là giả định ngầm về vị trí tiến trình, và nếu sai thì scraper im lặng không tìm thấy portal nào.
- **`workspaces/` phải gắn volume.** Đó là nơi ghi file `.tex` của người dùng; không gắn thì dữ liệu mất theo container.
- **`dotenv` nằm ở `dependencies`, không phải `devDependencies`**, vì `main.ts` import nó lúc chạy và image cài bằng `pnpm install --prod`.

### Gateway `omniroute` — service riêng, KHÔNG cài vào `package.json`

Cùng khuôn với `latex` và `pdf`: một container riêng, app gọi qua HTTP, địa chỉ khai bằng biến. `OMNIROUTE_BASE_URL` là cùng loại với `LATEX_SERVICE_URL`.

**Đừng `pnpm add omniroute`.** Gói đó là một app Next.js đầy đủ — **792MB giải nén, 21.765 file, 74 dependency** — mà cài vào rồi nó **vẫn** phải chạy như tiến trình riêng nghe cổng riêng. Trả toàn bộ cái giá, không nhận lại gì. Ảnh Docker chính thức là 483MB nén.

- **Máy dev:** `npx -y omniroute@3.8.49`, rồi `OMNIROUTE_BASE_URL=http://localhost:20128/v1`.
- **VPS:** service `omniroute` trong `docker-compose.yml`, và `OMNIROUTE_BASE_URL=http://omniroute:20128/v1` — **tên service**, không phải `localhost`. Đặt `localhost` trong container app là trỏ vào chính nó.

**`expose`, tuyệt đối không `ports`.** Đã đo: `/v1/*` của gateway **không kiểm tra key** (không header, `Bearer public`, chuỗi bừa — đều 200), chỉ `/api/*` quản trị mới trả 401. Tức phần TIÊU hạn mức là phần không có cổng chặn. Mở ra internet là tặng cả thiên hạ một gateway model đứng tên mình.

**Healthcheck dùng `/v1/models`** vì đó là endpoint duy nhất trả 200 mà không cần đăng nhập — `/api/health` của nó trả 401.

**Cố ý KHÔNG có `depends_on` từ `app`**, cùng lý do với `latex` và `pdf`: gateway chết thì `catalogFor()` ném `ModelUnavailableError`, và đó đúng là một trong bốn lý do `ModelChain` bỏ qua mắt xích để đi tiếp. Nên miễn là chuỗi dự phòng còn giữ vài mắt xích `opencode/...` gọi thẳng, gateway sập **không** kéo app sập. Đừng buộc app chờ nó khoẻ mới khởi động.

Ba biến `OMNIROUTE_JWT_SECRET`, `OMNIROUTE_KEY_SECRET`, `OMNIROUTE_PASSWORD` **không đi vào container app**. Chúng là giá trị thay thế `${...}` lúc đọc `docker-compose.yml`, nên phải nằm trong file truyền qua `--env-file` (`.env.production`), không phải trong `.env` mà `env_file:` nạp. Sinh lại bằng `openssl rand -base64 48` và `openssl rand -hex 32`; `INITIAL_PASSWORD` mặc định của image là `CHANGEME`.

Ghim tag `3.8.49`, **đừng `:latest`** — repo đó push mỗi ngày.

### Kết quả chảy dần: năm đường stream, và điều kiện để thêm đường thứ sáu

| Route | Tác vụ | Chờ trước | Tới nội dung đầu |
|---|---|---|---|
| `POST /matches/evaluate-stream/:jobId` | chấm điểm | 13,2s | **6,2s** |
| `POST /documents/:id/generate-stream` | sinh CV | 11,7s | **3,3s** |
| `POST /profile-drafts/:id/synthesize-stream` | đọc CV | 21s | — |
| `POST /companies/brief/by-job/:jobId/stream` | tìm hiểu công ty | 10,1s | — |
| `POST /interview/prep-stream/:jobId` | soạn câu hỏi | 42s | — |

Tất cả trả **NDJSON**, mỗi dòng một `ModelStreamEvent` (`src/common/stream-event.ts`): `partial` / `done` / `error`. Bên giao diện có đúng MỘT bộ đọc dùng chung — `lib/model-stream.ts`.

**Điều kiện để một tác vụ đáng có đường stream: phải có NGƯỜI ĐANG CHỜ.** Đã suýt làm sai một lần: `interview.prep` chậm nhất (42s) nên bị xếp đầu bảng, nhưng nó được xếp việc từ `applications.service` **khi người dùng chuyển đơn sang trạng thái Phỏng vấn** — chạy nền, không ai nhìn. Đường stream của nó giờ chỉ phục vụ nút "thử lại". `job.requirements` và `skill.canonicalize` chạy trong cron nên KHÔNG có và không nên có.

**Ba cái bẫy đã sập khi triển khai:**

1. **Sinh hai lần.** `POST /documents/cv` và `POST /profile-drafts/cv` vừa tạo bản ghi **vừa xếp hàng đợi**. Gọi stream sau đó là hai lượt gọi model cho một lần bấm, và hai tiến trình cùng ghi một bản ghi. Cả hai nay nhận cờ `stream` để bỏ bước xếp hàng đợi.

2. **`ReconcileService` chỉ dọn `agentRun`.** Rời trang giữa lúc stream thì `profileDraft`/`document` kẹt ở `RUNNING` vĩnh viễn — không có gì gỡ, và màn hình treo ở "Đang đọc CV" mãi mãi. Vá bằng `response.on('close')` → xếp lại vào hàng đợi. `match.evaluate` không dính vì `claim()` đã có `STALE_RUNNING_MS`.

3. **Streaming KHÔNG có chuỗi model dự phòng.** Token đầu tiên rời đi là hết đường lùi. Nên mọi màn hình đều giữ đường hàng đợi làm lưới an toàn: stream hỏng thì rơi về `evaluate`/`refreshForJob` vốn CÓ chuỗi dự phòng. **Đừng gỡ nhánh đó.**

**`upskill` cố ý KHÔNG stream.** Nó có hai lời gọi nối tiếp, nên rẻ hơn nhiều là **ghi kết quả bước 1 xuống database ngay khi xong** (`hardGaps`, `synthesisedGaps` vốn đã là cột sẵn có, không cần migration) rồi để vòng hỏi 2 giây của giao diện đọc lên. Người dùng thấy "Bước 1/2 — đã tìm ra N khoảng trống" trong lúc bước 2 còn chạy.

### Chấm điểm theo kiểu chảy dần — thí điểm cho `match.evaluate`

`POST /api/matches/evaluate-stream/:jobId` đẩy về **NDJSON**, mỗi dòng một sự kiện: `partial` (bản object dang dở), `done` (bản ghi `JobMatch` đã lưu), `error`.

Đo trên một tin thật: **174 sự kiện, nội dung đầu tiên về sau 6,2 giây, xong ở 13,2 giây** — trong khi đường `generateObject` cũ để màn hình trống suốt 13,2 giây. Các chiều điểm hiện dần: `eligibility` (6,2s) → `technical` (7,7s) → `experience` (8,6s) → `behavioral` (9,4s) → `career` (10,2s) → `strengths` (11,0s).

**6,2 giây không rút ngắn được nữa** — đó là thời gian tới token đầu tiên của bể free, đã đo là ~4 giây chi phí cố định mỗi lượt gọi bất kể prompt dài ngắn.

**Cache vẫn đi trước:** trùng `promptHash` thì trả đúng một sự kiện `done` trong ~65ms, không gọi model.

**Streaming ĐÁNH ĐỔI chuỗi model dự phòng.** `AiService.streamObject` chọn mắt xích một lần rồi đi tới cùng - token đầu tiên rời đi là hết đường lùi, cùng lý do đã ghi cho `streamText`. Nên giao diện giữ đường cũ làm dự phòng: `streamMatchEvaluation` hỏng thì `job-detail-view` tự động rơi về `matchesService.evaluate` (hàng đợi, CÓ chuỗi dự phòng). Đừng gỡ nhánh đó đi.

**Chỉ nên nhân rộng cho tác vụ có người ngồi chờ.** `job.requirements` và `skill.canonicalize` chạy trong cron - stream ở đó chỉ thêm phức tạp mà không ai thấy. Danh sách đáng làm tiếp, theo thời gian chờ: `upskill` (47s), `interview.prep` (42s), `profile.synthesize` (21s), `document.cv`/`coverLetter` (11,7s), `company.brief` (10,1s).

### Địa điểm: so MÃ TỈNH, không so chuỗi

`checkLocation` trong `requirement-match.ts` dùng `resolveProvince`, không dùng `trim().toLowerCase()`. Lý do đo được: cùng một thành phố xuất hiện sáu cách viết trong dữ liệu thật (`Hà Nội` 94 tin, `Hanoi` 38, `Ha Noi` 26; `Ho Chi Minh City` 83, `Ho Chi Minh` 55, `Hồ Chí Minh` 52), còn hồ sơ thì ghi kèm quận (`Quận Tân Bình, Hồ Chí Minh`).

Phép so chuỗi cũ khớp **0/520 tin với 8 trong 12 hồ sơ** có địa chỉ. Sau khi đổi:

```
ketoan@   (Tân Bình, HCM)    0 → 254/520
demo@     (Hồ Chí Minh)     52 → 254/520
mkt-fresher@ (Hà Nội)       94 → 180/520
```

`resolveProvince` cũng biết các tỉnh **đã sáp nhập 1/7/2025**, nên `Bình Dương` và `TP.HCM` là một nơi — thứ so chuỗi không bao giờ thấy được.

**Một tỉnh từng NUỐT MẤT ba tỉnh khác.** `Nghệ An` khai alias `vinh` (thành phố Vinh), và `' vinh phuc '` thì chứa `' vinh '`. Bản cũ duyệt `PROVINCES` theo thứ tự khai báo nên Nghệ An thắng: **Vĩnh Phúc, Trà Vinh và Vĩnh Long đều rơi về Nghệ An**. Nay `resolveProvince` khớp alias DÀI trước, không phụ thuộc thứ tự mảng. `test/unit/modules/jobs/province-alias-shadow.spec.ts` canh điều này bằng một phép kiểm tổng quát: mọi alias của mọi tỉnh phải tự giải về đúng tỉnh của nó.

Lỗi đó ảnh hưởng **cả bộ lọc tỉnh/thành trên trang danh sách**, không riêng khối đối chiếu.

**`willingToRelocate` cho ĐẠT nhưng vẫn nói ra là khác tỉnh.** Bản cũ thoát sớm ngay trong `checkLocation`, nên người đánh dấu sẵn sàng chuyển chỗ thấy chấm xanh mà không biết công ty ở đâu — tin ở Cà Mau trông y hệt tin trong thành phố.

**`LOCATION` cố ý KHÔNG vào mẫu số** (`SCORED_KINDS` chỉ có `SKILL`, `NICE`, `YEARS`). Nhét vào thì người ở tỉnh khác thấy "khớp 60%" mà không biết 40% mất đi là do thiếu kỹ năng hay do ở xa. Hai câu hỏi khác nhau thì phải có hai câu trả lời riêng.

### Đường HTTP của agent: `detail()`, KHÔNG phải `get()`

`GET /api/agent/:id` bị giao diện hỏi lại **mỗi 2 giây suốt cả lượt chạy** (p90 của `agent.apply` là 229 giây). Nên nó dùng `AgentService.detail()` chứ không dùng `get()`:

- **bỏ hẳn cột `messages`** — hội thoại thô để chạy tiếp một lượt. `interview-turn` và `agent-runner` cần nó, giao diện thì chưa bao giờ đọc.
- **cắt mọi chuỗi dài trong `toolResults` còn 500 ký tự** (`trim-output.ts`). `lib/agent-steps.ts` bên giao diện chỉ đọc `error`, `ok`, `reason`, `saved`, `critique`, `asked`, `pages`, `file`, `path` và `results.length` — nó không bao giờ vẽ `content` hay `text`, mà đó đúng là hai trường nặng nhất (`read_skill_reference` ~8.000 ký tự, `fetch_url` tới 20.000).

Đo trên 5 lượt `apply` thật: **73.957 → 3.569 ký tự mỗi lần hỏi, giảm 95%**.

**`get()` phải giữ nguyên `messages`** — cắt ở đó là làm hỏng nhánh chạy tiếp của phỏng vấn, và lỗi sẽ hiện ra dưới dạng agent quên sạch bối cảnh chứ không phải một exception.

**Cắt độ dài chứ không lọc theo danh sách khoá.** Lọc khoá thì lần sau giao diện muốn thêm một trường sẽ im lặng không nhận được gì; cắt độ dài giữ nguyên hình dạng dữ liệu. `trimToolOutput` giữ nguyên độ dài mảng vì giao diện đọc `results.length`, và có test đơn vị ghim điều đó.

### Hai probe, trả lời hai câu hỏi khác nhau

| Route | Câu hỏi | Khi trả lỗi thì làm gì |
|---|---|---|
| `GET /api/health` | Tiến trình còn trả lời được không? | Khởi động lại container |
| `GET /api/ready` | Có nhận việc được không? | Rút khỏi load balancer, **đừng** khởi động lại |

`HEALTHCHECK` trong image cố ý dùng `/api/health` chứ không phải `/api/ready`: nếu healthcheck của container đọc readiness thì một lần database chập chờn sẽ khiến Docker khởi động lại một tiến trình hoàn toàn khoẻ mạnh — làm sự cố nặng thêm thay vì chỉ ngừng nhận request.

### Đổi `schema.prisma`: KHÔNG dùng `migrate dev`

> **Cập nhật 2026-08-27.** Bảng `job_embeddings` và `profile_embeddings` đã bị xoá (`20260827093000_drop_unused_embeddings`) vì không một dòng mã nào đọc chúng. Index HNSW duy nhất của database đi theo bảng, nên **hiện không còn đối tượng nào nằm ngoài `schema.prisma`**: `migrate diff --from-url` giữa database và schema trả về rỗng. Cái bẫy mô tả dưới đây tạm thời không nổ được — nhưng nó sẽ quay lại nguyên vẹn ngay khi có ai thêm lại một index vector, nên cách làm ở cuối mục vẫn là cách làm chuẩn.

Index HNSW của pgvector (`job_embeddings_embedding_idx`) được tạo bằng SQL viết tay, vì Prisma không có kiểu `vector`. Nên nó **không tồn tại trong `schema.prisma`**, và mọi lần `prisma migrate dev` so schema với DATABASE đều coi nó là dư thừa rồi sinh ra:

```sql
DROP INDEX "job_embeddings_embedding_idx";
```

Chín migration đầu gỡ dòng đó bằng tay. Migration thứ mười (`20260825035410_add_viewed_status`) để lọt, và **index bị xoá thật từ 2026-08-25 tới 2026-08-26**. Lỗi này im lặng hoàn toàn: truy vấn ngữ nghĩa vẫn trả đúng kết quả, chỉ quét toàn bảng thay vì dùng index. Không log, không exception, không có gì đỏ.

**Cách né hẳn — diff HAI FILE SCHEMA, không cho database tham gia:**

```bash
cp prisma/schema.prisma /tmp/schema-before.prisma
# sửa prisma/schema.prisma
mkdir -p prisma/migrations/2026MMDDHHMMSS_ten_migration
npx prisma migrate diff --from-schema /tmp/schema-before.prisma \
  --to-schema prisma/schema.prisma --script \
  > prisma/migrations/2026MMDDHHMMSS_ten_migration/migration.sql
npx prisma migrate deploy
```

Ba migration làm theo cách này đều `grep -c DROP` ra **0** mà không phải sửa tay dòng nào. Cờ là `--from-schema`; `--from-schema-datamodel` đã bị bỏ ở Prisma 7.

**`test/unit/prisma/vector-index.spec.ts` là máy canh, đừng gỡ.** Với mỗi index vector, nó đòi câu lệnh CUỐI CÙNG nhắc tới index đó (xét theo thứ tự tên thư mục migration) phải là `CREATE`. Một `DROP` đã áp rồi vẫn hợp lệ miễn là có migration sau dựng lại; một `DROP` mới thêm vào cuối lịch sử thì đỏ ngay. Đã thử làm nó đỏ để chắc là nó biết đỏ.

Từ 2026-08-27 nó canh một tập RỖNG: `DROP TABLE "job_embeddings"` không khớp mẫu `DROP INDEX` nên lịch sử của `job_embeddings_embedding_idx` vẫn kết thúc bằng `CREATE`, và test xanh một cách vô nghĩa. Giữ lại vì nó tự động canh lại ngay khi index vector đầu tiên xuất hiện trở lại — không phải vì nó đang bảo vệ thứ gì.

Kiểm nhanh trên database đang chạy:

```sql
select indexname, tablename from pg_indexes
where indexdef ilike '%hnsw%' or indexdef ilike '%ivfflat%';
```

Bảng `canonical_skills` có cột `vector(768)` nhưng **chưa có index** — khi thêm, nó thành nạn nhân thứ hai của cùng cái bẫy, và test trên sẽ tự canh luôn.

### Nâng cấp một database đã chạy từ trước

Hàng đợi tạo trước tháng 8/2026 dùng policy `standard`, còn cơ chế chặn trùng cần `exclusive`, mà pg-boss không cho đổi policy tại chỗ. Máy chủ sẽ **từ chối khởi động** kèm hướng dẫn. Chạy một lần với `QUEUE_POLICY_MIGRATE=true` rồi bỏ biến đó đi — việc đang chờ trong hàng đợi sẽ mất, nên chạy khi hàng đợi rỗng.
