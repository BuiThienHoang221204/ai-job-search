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

`POST /api/scrape` không nạp `job-scraper/SKILL.md`. File đó là kịch bản cho agent
chat (kiểm tra sức khoẻ portal, trình bày kết quả, hỏi lại người dùng); năng lực
quét thì bóc ra thành một pipeline tất định. `search-queries.md` cũng không dùng -
nó là template `site:` cho WebSearch fallback, và chính file đó ghi rõ các portal
có CLI không cần đến nó.

Upskill không đọc `job_search_tracker.csv` như skill gốc. Bảng `job_matches`
đóng vai trò đó, và cột `overallScore` chính là `fit_rating`; công thức trọng số
`(100 - fit) / 100` giữ nguyên từ Step 3 của SKILL.md.

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

## Phân quyền

`User.role` là `USER` hoặc `ADMIN`. Route quản trị dùng `@UseGuards(JwtAuthGuard,
RolesGuard)` kèm `@Roles('ADMIN')` - **đúng thứ tự này**, vì `RolesGuard` đọc
`request.user` mà `JwtAuthGuard` gắn vào.

Vai trò được đọc từ DB mỗi request qua `JwtStrategy.validate()`, **không** nằm trong
claim của token. Ghi vai trò vào token nghĩa là một tài khoản bị hạ quyền vẫn giữ
nguyên quyền cũ cho đến khi token hết hạn. Đã kiểm chứng: cùng một token, sau khi
`update users set role='ADMIN'` thì route đổi từ 403 sang 200 mà không cần đăng nhập lại.

Nâng quyền cho một tài khoản:

```sql
update users set role = 'ADMIN' where email = 'ban@example.com';
```

## Test

```bash
pnpm test          # 153 test, ~1.6 giây, không cần mạng hay database
pnpm test:watch
```

Toàn bộ test đều nhắm vào **hàm thuần** - không gọi AI, không chạm Postgres, không
ra mạng. Đó là cố ý: chúng phải chạy đủ nhanh để bạn gõ xong là chạy ngay, và phải
xanh/đỏ vì logic chứ không vì gateway free hôm nay có rảnh hay không.

| File | Bảo vệ điều gì |
|---|---|
| `matching/evaluation.schema.spec.ts` | Trọng số 30/25/15/30 và ngưỡng verdict 75/60/45/30 đúng như `04-job-evaluation.md`. Schema chặn điểm âm, điểm vượt 100, điểm thập phân |
| `documents/latex.spec.ts` | `escapeLatex` vô hiệu `\input`, `\write18`, bom `\def\x{\x\x}`. Dấu cách và tiếng Việt không bị biến dạng. Lời chào lặp bị cắt |
| `skills/prompt-builder.service.spec.ts` | `keepSections` BỎ được mục `## Output Format`. Placeholder không có ánh xạ vẫn bị thay, không để lại nguyên văn trong prompt |
| `storage/local.storage.spec.ts` | Chặn path traversal 6 dạng. Khoá của người dùng này không đọc được workspace của người khác |
| `dashboard/suggestions.spec.ts` | Ngưỡng hiện từng thẻ gợi ý, và không bao giờ trả quá 4 thẻ |
| `dashboard/skill-gaps.spec.ts` | ReactJS/React được coi là một; JavaScript KHÔNG bị nhầm thành Java |
| `profile/completion.spec.ts` | Mảng rỗng và chuỗi trắng tính là chưa điền; thứ tự ưu tiên nhắc điền |
| `ai/failure-kind.spec.ts` | SCHEMA được ưu tiên hơn TIMEOUT; bóc được RetryError để lấy nguyên nhân thật |
| `admin/ai-health.spec.ts` | p50/p95 không bị một lần 517 giây kéo lệch như trung bình |

Các CLI trong `.agents/skills/*/cli/` có bộ test riêng chạy bằng `bun test`.
CI duyệt qua mọi thư mục CLI thay vì liệt kê từng cái, nên portal thêm sau sẽ tự
được kiểm tra.

## Đánh giá chất lượng model

```bash
pnpm run bench                       # tất cả model free mặc định
pnpm run bench -- deepseek-v4-flash-free glm-5
```

Script chấm điểm thử một cặp hồ sơ/tin tuyển dụng đã biết trước đáp án và báo các lỗi ngữ nghĩa mà schema không bắt được (sai thang điểm, eligibility sai, gaps rỗng).
