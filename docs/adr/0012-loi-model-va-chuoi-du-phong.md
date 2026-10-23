# ADR 0012: Nhiều lõi model, chuỗi dự phòng, OmniRoute và Groq

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Thêm/đổi lõi model, `ModelChain`, `MODEL_FALLBACK_IDS`, `AI_FAST_MODEL_ID`, OmniRoute hoặc opencode-service
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

#### Nhiều lõi model — mỗi lõi MỘT FILE, không phải một thư mục

`src/modules/ai/providers/` có `opencode.ts`, `openrouter.ts`, `omniroute.ts`, `kilo.ts` và `groq.ts`. **Thêm lõi = thêm một file + một dòng trong `index.ts`.** Đừng biến chúng thành class Nest: đã đếm, **146/185 provider trong catalog dùng chung đúng một adapter** `@ai-sdk/openai-compatible`, nên một class cho mỗi lõi sẽ là một class không có hàm nào — và làm việc thêm lõi **khó hơn**, đúng cái điều nó nhắm tới.

**Lõi `groq` — thêm 2026-09-30, dùng cho tác vụ NGƯỜI DÙNG ĐANG CHỜ, không phải lõi mặc định.** SDK riêng `groq-sdk` KHÔNG được dùng — Groq có endpoint OpenAI-compatible công khai (`https://api.groq.com/openai/v1`), nên nó đi đúng khuôn `createOpenAICompatible` như mọi lõi khác; khai `baseURLEnv: 'GROQ_BASE_URL'` vì Groq không nằm trong catalog `models.opencode.ai`, giống lý do `omniroute`/`opencode` khai trường đó.

**`honorsResponseFormat: false` — đo thật 2026-09-30 bằng đúng prompt production (`scripts/probe-prompt-cache.mjs --model groq/openai/gpt-oss-120b`), không phải đoán.** Lượt đầu để trống (coi như ép được `response_format`) và Groq trả 400 NGAY từ request, chưa tới lượt model chạy:

```
invalid JSON schema for response_format: 'response': /properties/eligibility/required:
`required` is required to be supplied and to be an array including every key in properties.
```

Groq áp chế độ "strict" của OpenAI — đòi MỌI field có mặt trong `required`, kể cả field optional (phải chuyển thành nullable thay vì lược bỏ). Schema của app dùng `.optional()`/`.default()` tự do theo đúng convention "nới cho chữ tự do, nghiêm ngặt cho thứ cắt bừa sẽ sai nghĩa" đã ghi trong file này — không sửa lại toàn bộ schema để chiều một lõi. Đổi `honorsResponseFormat: false` (đường bơm schema vào prompt) thì cùng lượt gọi, cùng schema, cùng prompt **thành công cả 3/3 lần thử** (đo `cũ-1`, `cũ-2`, `mới` trong `probe-prompt-cache.mjs`) — bài học y hệt `omniroute` đã ghi phía dưới: lời khai hỗ trợ không có nghĩa là dùng được trên schema thật của app.

**`streamsJson` để trống (mặc định = không model nào stream)** — chưa đo model nào của Groq stream ra JSON parse dần được trên prompt thật; `streamEvaluate`/`streamBuild` vẫn chạy đúng (rơi về đường không-stream, trả nguyên object một lần), chỉ chưa có hiệu ứng chữ chạy dần. Đo bằng đúng prompt production trước khi bật `streamsJson`, đừng lặp bẫy đã ghi ở mục OmniRoute (đo bằng prompt rút gọn cho kết quả sai hoàn toàn).

`knownNoStructuredOutput`/`declaresStructuredOutput` vẫn để trống — chưa đo từng model riêng lẻ của Groq (`gpt-oss-20b`, `gpt-oss-safeguard-20b`, `qwen/qwen3.8-27b` — ba model đang nằm trong `AI_FAST_FALLBACK_IDS`).

**Chọn model theo TỪNG lời gọi, không phải một cờ toàn cục:** `generateObject`/`streamObject`/`streamText` đều nhận `options.modelId` tuỳ chọn — bỏ trống thì `ModelChain` dùng `defaultModelId` từ `.env`; có giá trị thì nó thành mắt xích ĐẦU của chuỗi, còn `MODEL_FALLBACK_IDS` vẫn nguyên phía sau làm lưới an toàn. Đây là hạ tầng CÓ SẴN từ trước (interview đã dùng cơ chế này trước Groq), không phải thứ mới dựng riêng.

**Một biến DUY NHẤT — `AI_FAST_MODEL_ID` — cho MỌI tác vụ "người dùng đứng chờ trực diện".** Từng tách hai biến (`AI_INTERVIEW_MODEL_ID` riêng cho phỏng vấn), gộp lại 2026-09-30 theo đúng yêu cầu: một chỗ cấu hình cho cả nhóm, không phải nhớ nhiều tên biến cho cùng một ý định. Sáu điểm gọi đọc nó:

- `interview.open`, `interview.turn` (`mock-interview/services/interview-turn.service.ts`), đi qua `streamText`. **Không có chuỗi dự phòng** ở đây theo chủ đích cũ của `streamText` (token đã rời đi thì không còn đường lùi) — Groq hỏng giữa buổi phỏng vấn thì lượt đó lỗi thẳng. Đây cũng là chỗ DUY NHẤT trong app người dùng ngồi đếm từng giây (đo 9,7s trước chữ đầu tiên).
- `MatchingService.streamEvaluate` (không phải `evaluate` — route đó ghi rõ "dùng để thử nghiệm", không phải luồng người dùng), `CompanyService.streamBuild` và `build` (hàng đợi `COMPANY_BRIEF` chỉ nhận việc do người dùng bấm hoặc rời trang giữa lượt stream, không có cron nào đẩy vào, nên mỗi việc vẫn là một người đang chờ — sửa 2026-10-07 sau khi stream hỏng rơi sang `build` toàn model opencode), `JobFromUrlService.extract`, `QuestionBankService.ensureAnswer`, `InterviewAnswersService.feedback` (`interview.feedback`), `DocumentComposer.coverLetter`/`streamCoverLetter` (`document.coverLetter`) và `applicationEmail` (`document.applicationEmail`) — hàng đợi `GENERATE_DOCUMENT` chỉ nhận tài liệu do người dùng tạo. Các chỗ này đi qua `ModelChain` nên vẫn có lưới `MODEL_FALLBACK_IDS` nếu Groq hỏng.

Đường chạy NỀN cùng tên `purpose` (`job.requirements`, `skill.canonicalize`, `upskill.*`, `profile.synthesize`, `scrape.plan`, `document.cv`) **không đọc biến này** — chúng dùng model mặc định của hệ thống, cố ý không đổi.

**`AI_FAST_FALLBACK_IDS` — chuỗi dự phòng RIÊNG cho các điểm gọi qua `ModelChain` ở trên, thêm 2026-09-30.** Mặc định (để trống) chúng rơi về `MODEL_FALLBACK_IDS` chung — an toàn nhưng có thể dính lại model chậm của tác vụ nền nếu Groq hỏng. Đặt biến này thì **THAY HẲN**, không cộng dồn: `AI_FAST_MODEL_ID` hỏng sẽ thử tiếp đúng những model trong danh sách này, không bao giờ rơi xuống chuỗi chậm.

Cơ chế: `ModelChain.links()`/`run()` nhận thêm tham số `fallbackOverride?: string[]`, và `GenerateObjectOptions`/`StreamObjectOptions` có thêm `fallbackModelIds?: string[]`. Các call site đọc qua `fastModelChain(...)` (`modules/ai/utils/model-env.ts`).

**Bẫy đã bắt trước khi kịp lên production: `modelIdsFrom` KHÔNG được trả mảng RỖNG khi biến chưa đặt.** Bản đầu trả `[]` cho input rỗng/undefined — và `fallbackOverride ?? this.options.fallbackModelIds` không coi `[]` là nullish, nên mọi lượt gọi trong 4 chỗ trên (dù `AI_FAST_FALLBACK_IDS` chưa hề đặt) đều âm thầm XOÁ MẤT `MODEL_FALLBACK_IDS` mặc định — Groq hỏng là hỏng thẳng, không còn lưới nào, và không có gì báo lỗi cả. Nay hàm trả `undefined` khi danh sách rỗng, để `??` hoạt động đúng. `test/unit/modules/ai/utils/model-env.spec.ts` ghim rõ phân biệt này.

`interview.open`/`interview.turn` **không dùng được** `AI_FAST_FALLBACK_IDS` — chúng đi qua `streamText`, không qua `ModelChain`, và đó là chủ đích ("token đã rời đi thì không còn đường lùi"). Muốn thêm fallback cho đường này thì phải dựng cơ chế đệm mảnh-đầu-tiên riêng (giống `beginStream` của `streamObject`) — chưa làm, vì đó là một thay đổi kiến trúc lớn hơn hẳn việc thêm một tham số ghi đè.

Cả hai biến để TRỐNG mặc định trong `.env.example` (chỉ ghi chú, không bật) — bật lên trước khi có `GROQ_API_KEY` thật và đã đo qua `bench-models.mjs`/`probe-skill-merge.mjs` là lặp lại đúng bẫy OmniRoute: tin lời khai mà không đo là tự hại chất lượng chấm điểm.

`AiService` **cố ý ở nguyên `modules/ai/`** (từ 2026-10-16 `failure-kind`/`failure-view` đã lên `common/ai/` vì 8 module dùng), không xuống `core/`: 10 module import `AiService`, **0 module** import `ModelCatalogService`. Cấu trúc thư mục đang nói đúng ranh giới đó, đừng xoá nó đi.

Chuỗi dự phòng đi xuyên lõi qua chuỗi `lõi/model`, tách ở dấu `/` **đầu tiên** (91/91 model id của OpenCode không có `/`, 351/351 của OpenRouter thì có — nên không nhập nhằng). Không có tiền tố hợp lệ thì cả chuỗi là model id của lõi mặc định, nhờ vậy `.env` cũ vẫn chạy.

**Chuỗi đi tiếp trong đúng NĂM trường hợp**: hết hạn mức, `ModelUnavailableError` (thiếu key, lõi không phục vụ, bị chặn vì trả tiền, đã đo là hỏng schema), gateway đã rút model (`isModelRetired`), **lõi từ chối khoá hoặc model** (`isAccessDenied` — 401/403), hoặc **lõi trả 5xx** (`isTransientUpstream`).

> **Đã thay bởi quyết định 2026-10-05 (commit `c1a2613`):** thêm **TIMEOUT** và **SCHEMA** vào danh sách đi tiếp, thành bảy trường hợp, cộng "prompt vượt trần token" (`isTooLargeForModel`). Đo 6 giờ `job.requirements`: 126 lượt hỏng / 23 lượt xong, 100% lỗi dồn vào một model (mimo) vì không mắt xích nào khác trong chuỗi 9 model được thử. TIMEOUT chỉ nói mắt xích đang chậm, không mang tín hiệu "model yếu". SCHEMA thì có mang tín hiệu đó, nhưng lỗi thật quan sát được (trả mảng thay cho object) là đọc sai hẳn chứ không phải trường hợp sát nút; từ 2026-10-19 cầu dao cách ly model sai schema 2 lần liên tiếp nên tín hiệu không bị giấu — model đó rơi khỏi chuỗi và hiện ở trang sức khoẻ AI.

`isAccessDenied` thêm ngày 2026-09-17 sau khi cả 30 lượt `match.evaluate` của một
lượt phát suất hỏng sạch mà **không mắt xích dự phòng nào được thử**. Hai hình
dạng lỗi trượt cả bốn điều kiện cũ: `[403] free tier can only be used from within
OpenCode` (403 nên không phải 429, không phải 5xx, chữ không khớp mẫu "free
promotion has ended") và `[401] Model hy3-free is not supported`. Cả hai đều có
nghĩa "lõi này không phục vụ ta nữa" — đúng thứ chuỗi dự phòng sinh ra để xử lý.

Nó **có mã trạng thái thì tin mã**, giống `isTransientUpstream`: 400 kèm chữ
"unauthorized" trong thân vẫn là lỗi request, không phải từ chối quyền. Và nó
chịu chung phanh `!progress.spent` với 5xx — bỏ mắt xích giữa chừng một lượt
agent là trả tiền lại cho những bước đã xong.

Đo sau khi sửa, một lượt `match.evaluate` thật: `oc/mimo-v2.5-free` (403, 4,2s)
→ `oc/hy3-free` (401, 0,8s) → `opencode/mimo-v2.5-free` (403, 0,4s) →
`opencode/hy3-free` (catalog) → `kilo/tencent/hy3:free` (thiếu key) →
**`openrouter/nvidia/nemotron-3-super-120b-a12b:free` XONG sau 19,1 giây**.
Tổng phí mắt xích chết khoảng 5,4 giây. Lỗi schema lúc đó vẫn ném ngay — đổi lại từ 2026-10-05, xem ghi chú ngay dưới danh sách năm trường hợp.

**Vì sao 5xx nằm trong danh sách đổi mắt xích:** lý do nằm ở một lượt hỏng thật ngày 2026-08-22: `agent.reviewer` nhận HTTP 500 hai lần liên tiếp (96 giây, payload chỉ 8,4KB) và cả tác vụ hỏng, trong khi **không một model dự phòng nào được thử** vì 5xx không nằm trong danh sách lý do đổi mắt xích.

`runTools` và cả phanh `ChainProgress` **đã bị xoá ngày 2026-09-23** — vòng lặp agent gỡ cùng `/apply` từ trước, nhưng code thì ở lại tới hôm đó, sống bằng chính test và bản giả của nó (~380 dòng). Gỡ `!progress.spent` là TRUNG TÍNH về hành vi: chỉ `attemptTools` đặt cờ đó, nên không còn nó thì điều kiện vốn đã luôn đúng. Cùng lúc gỡ `ModelCatalogService.resolve(ref, requireToolCall)` — không caller nào từng truyền `true`.

**Ba điều về từng lõi, gỡ khỏi docblock ngày 2026-09-23 để code còn một dòng:**

- **`kilo`** — nhận request **không cần API key** (cả không header lẫn `Bearer public` đều 200), nên nó cứu được lúc hai lõi kia cùng cạn. Ba lý do không làm lõi chính: không key nghĩa là không hợp đồng (y hệt bẫy chuỗi `"public"` bên OpenCode); **14/14 model free tự khai `mayTrainOnYourPrompts: true`**, mà app gửi đi CV người thật; và bể model của nó gần trùng khít OpenRouter nên thêm nó không mở rộng được tập model.
- **`openrouter`** — lời khai `supported_parameters` đã được đối chiếu với các phép đo tay trên OpenCode và **khớp**: `nemotron-3.5-lightning` và `laguna-s-2.1` đều bị khai là không hỗ trợ, đúng như đo được.

**Ràng buộc về tiền:** `resolve()` **không bao giờ tự thay model khác** (bản cũ lấy `models[0]`; OpenRouter có 413 model gồm loại đắt, và hàng đợi chấm điểm chạy theo cron). Từ 2026-08-26 đây là chốt DUY NHẤT: `AI_ALLOW_PAID_MODELS` và `isFree()` đã gỡ, nên model trả tiền ghi trong `.env` sẽ chạy thật.

#### Lõi `omniroute` — gateway tại chỗ, và những gì đã ĐO ngày 2026-08-26

`npx -y omniroute` mở `http://localhost:20128/v1`, OpenAI-compatible. Lõi này khác ba lõi kia ở một điểm cấu trúc: **nó không có trong catalog `models.opencode.ai`**, nên nó khai `baseURLEnv` và `ModelCatalogService.catalogFor()` dựng danh sách model từ chính `GET /v1/models` của nó. Đó là toàn bộ lý do `baseURLEnv` tồn tại — lõi nào khai biến này thì bỏ qua catalog ngoài.

**Hai cái bẫy đã sập, cả hai đều im lặng:**

1. **OmniRoute trả SSE cho request KHÔNG streaming.** AI SDK gọi `generateObject` mà không gửi trường `stream`, và gateway mặc định trả `text/event-stream` — SDK vỡ với `SyntaxError: Unexpected token 'd', "data: {"id"...`. Vá bằng `explicitStreamFlag` trong descriptor: `language-model.ts` chèn `stream: false` khi thân request **chưa có** trường đó. Điều kiện "chưa có" là bắt buộc — ghi đè vô điều kiện sẽ giết `streamText`.
2. **Gateway tự nhồi "memory + skills" vào prompt và tự nén token.** Cả hai bật sẵn. `extraHeaders` của descriptor tắt chúng: `x-omniroute-compression: off` và `x-omniroute-no-memory: true`. App gửi đi CV người thật, nên nén có mất mát và chèn ngữ cảnh lạ đều không chấp nhận được.

**Đo trên đúng 8 cặp của `probe-skill-merge`, cùng schema, cùng prompt, chỉ khác đường đi:**

| Đường | Model | Điểm | Thời gian |
|---|---|---|---|
| OpenCode trực tiếp | `hy3-free` | **8/8** | 14,2s |
| Qua OmniRoute | `oc/hy3-free` | **8/8** | 13,8–16,1s |

Chất lượng không đổi, độ trễ thêm khoảng 10%.

**Nhưng 115 model nó khai KHÔNG phải 115 model dùng được**, và đây là phần quan trọng nhất:

- `oc/*` (6 model) — chính là bể OpenCode đang dùng. **Cùng một bể hạn mức**: `oc/mimo-v2.5-free` trả 429 y như gọi thẳng.
- `aug/*` (28 model, gồm Opus 4.8, GPT-5.6, Gemini 3.1 Pro) — **không phải API**. Gateway shell ra CLI `auggie` trên máy: `502 'auggie' is not recognized`. Chỉ chạy nếu tự cài và tự đăng nhập bằng thuê bao của mình.
- `tllm/*` (26 model) — **403: "blocked by Vercel for this server egress IP. Configure a residential provider or global proxy"**. Muốn dùng phải đi proxy dân cư để né chặn.
- `felo/*`, `ddgw/*` — endpoint web scrape, trả 400.
- **OpenRouter và Kilo KHÔNG được nối sẵn.** Muốn gộp ba lõi làm một thì phải tự nhập key vào dashboard của OmniRoute.

**Ghim model thì KHÔNG có tự chuyển khi cạn hạn mức.** Đã đo: `oc/mimo-v2.5-free` gặp 429 và gateway trả thẳng 429 về. Header lượt đó **không có `x-omniroute-decision`** — nó không chạy bước định tuyến nào; lượt thành công thì header ghi `strategy=single`, tức "một mục tiêu, không có phương án hai".

**Tự chuyển chỉ có ở combo `auto/*`, và combo thì hên xui theo từng cái.** Đo 6 combo cùng một lúc:

| Combo | Kết quả |
|---|---|
| `auto/cheap`, `auto/coding:free`, `auto/fast`, `auto/best-chat`, `auto/smart` | 200 — cả năm cùng chọn `oc/hy3-free` |
| `auto/best-free` | 400 — thử 6 nhà cung cấp, hỏng cả 6 |

`auto/cheap` chạy đủ 8/8 trên bộ `probe-skill-merge` (18,9 giây). **Đừng suy từ một combo hỏng ra "đường auto không dùng được"** — đã mắc lỗi đó một lần.

**Cái giá của `auto/*` là mất quyền chọn nhà cung cấp.** Hôm nay nó chọn `oc/hy3-free`; không có gì hứa ngày mai nó không chọn `felo/*` hay `ddgw/*` — hai bể endpoint web scrape. App gửi đi CV người thật, nên nếu điều đó thành vấn đề thì phải quay lại ghim tên model và dựa vào `ModelChain`.

**Kết luận: `ModelChain` của repo vẫn là thứ làm việc dự phòng, OmniRoute không thay được nó.**

#### Đo lại toàn bộ catalog OmniRoute, 2026-09-23 — 667 model khai, **1** dùng được

Gateway nay khai **667 model** (so với 115 hồi 26-08). Con số thật sau khi lọc:

```
667  khai
-178  model sinh ẢNH (riêng họ aihorde 173 cái — toàn bộ là image)
 489  chat/text
-319  thuộc nhà cung cấp ĐÃ CHẾT
 170  chat + nhà cung cấp còn sống
- 22  trả tiền (kr/ và kiro/ là CÙNG một nguồn, nhân đôi bí danh)
 148  "miễn phí" — nhưng phần lớn vẫn đòi đăng nhập hoặc credit
```

Thăm dò một model đại diện cho **mỗi** nhà cung cấp: **5/20 còn trả lời** (`kc`, `cfp`, `gweb`, `auto`, `kr`). 15 họ chết, và lý do đáng ghi:

| Chết | Model | Lý do |
|---|---|---|
| `dva/` | 137 | `DEVIN_AGENTIC_HOME must be an absolute path inside the bridge sandbox` |
| `cl/` `cline/` | 36 | **`All 1 connection(s) credits exhausted`** — đây là họ DUY NHẤT từng ép được `response_format` |
| `ds-web/` | 28 | **`502 DeepSeek rejected token: Authorization`** — nơi `auto/smart` định tuyến tới |
| `aug/` | 28 | `Auggie CLI not found` |
| `tllm/` | 26 | `403 blocked by Vercel for this server egress IP` |
| `cxa/` | 26 | `503 Codex app-server transport is not configured` |
| `zc/` 13, `oc/` 8, `ddgw/` 6, `felo/` 5, `kimi-web/` 2 | | `spawn ENOENT` / 401 / 418 anti-abuse / 400 |

Rồi đo 5 họ còn sống trên **đúng tác vụ chấm điểm** (schema thật, prompt tiếng Việt thật, có chạy `extractJson` trước khi parse):

| Model | Kết quả |
|---|---|
| **`kc/openrouter/free`** | **ĐẠT 4/4** — 8,0 / 8,6 / 9,3 / 20,0 giây, không cần bóc lần nào |
| `cfp/*` (6 model đã thử) | văn xuôi hoặc 429. `glm-5.2`, `deepseek-v4-flash`, `kimi-k2.6`, `llama-3.3-70b` trả về **cùng một câu mở đầu y hệt**, còn `mistral-small` ra chữ nhân đôi hỏng — lõi này nhiều khả năng không thật sự định tuyến tới model được yêu cầu |
| `gweb/gemini-3.7-flash` | văn xuôi lạc đề, `out=0` |
| `kc/anthropic/*`, `kc/google/*`, `kc/deepseek/*` | `402 Add credits` hoặc `401 You need to sign in` |

**Họ `auto/*`: combo nào ra combo ấy, đừng gộp.** Lần đầu tôi đo `auto/smart` và `auto/glm`, thấy cả hai trả content RỖNG rồi kết luận `auto/*` không dùng được — **sai**, và đó đúng là cái bẫy đã ghi ở mục trên ("đừng suy từ một combo hỏng ra đường auto không dùng được"). Đo lại đủ:

| Combo | Đạt | Thời gian | Token vào | Stream ra JSON |
|---|---|---|---|---|
| `auto/fast` | **3/3** | 35,0–42,7s | 5.169–7.509 | CÓ, nhưng mảnh đầu về sau **13,7–75 giây** |
| `auto/best-chat` | 1/1 | 52,6s | 7.641 | chưa đo |
| `auto/cheap` | 1/1 | **84,4s** | 7.825 | chưa đo |
| `auto/smart`, `auto/glm` | 0/2 | content RỖNG sau 37s | 3.557 | — |

`auto/*` **có** ra JSON đúng schema, nhưng chậm gấp 4–10 lần và tốn token gấp 5 so với `kc/openrouter/free`. Nên chúng làm **mắt xích dự phòng**, không làm model chính.

**`auto/cheap` KHÔNG được đưa vào chuỗi**: 84,4 giây sát mốc `DEFAULT_TIMEOUT_MS` 90 giây, nó sẽ hết giờ thường xuyên. Một lượt stream `auto/fast` cũng đã chạm đúng 90.031ms — tức hết giờ thật.

**`auto/fast` KHÔNG vào `streamsJson`** dù nó stream ra JSON được: mảnh đầu về sau 13,7–75 giây thì hiệu ứng chạy dần gần như không xuất hiện, mà rủi ro hết giờ thì thật.

**`MODEL_ID` nay là `kc/openrouter/free`.**

**`streamsJson` của omniroute để RỖNG, và đây là bài học đắt nhất của đợt đo này: ĐO BẰNG PROMPT THẬT, không bằng prompt rút gọn.** Tôi đo `kc/openrouter/free` bằng một prompt JD/hồ sơ ngắn (`in=1.229 token`), thấy stream ra JSON sạch 2/2 lượt, nên đưa nó vào `streamsJson`. Chạy production thì hỏng ngay: prompt thật mang cả khung đánh giá từ file `.md` nên **`in=4.798 token`, gấp gần 4 lần**, và ở độ dài đó model đổi cách trả lời — nó mở đầu bằng hàng rào ` ```json `. Đường không-stream bóc được hàng rào đó, đường stream thì mảnh đầu tiên là `` ` `` chứ không phải `{` nên bỏ cuộc ngay.

Hậu quả đo được trên một lượt chấm điểm thật: **24,5 giây stream hỏng + 39,8 giây gọi lại = 64,3 giây mà trình duyệt không nhận được một byte nào.** `streamNdjson` gọi `flushHeaders()` rồi chờ sự kiện đầu tiên, mà cả phần rơi về nằm bên trong `await ai.streamObject(...)` nên không có sự kiện nào để gửi — cộng thêm client không có timeout, nên người dùng chỉ thấy spinner quay.

Muốn thêm model vào `streamsJson` thì phải đo bằng **đúng prompt production** (gọi qua `AiService`, không phải bằng script tự dựng prompt), và đo nhiều lượt.

**Ngoại lệ có chủ ý, 2026-09-28: lõi `opencode` khai `streamsJson: 'all'`** — bật stream cho mọi model của bể Zen mà CHƯA đo từng model, vì bể xoay vòng nên danh sách tên cứng lỗi thời trong vài ngày. Lưới còn đó: stream hỏng trước mảnh đầu thì `streamOnce` rơi về đường không-stream (tốn thêm một lượt gọi). Đi kèm là sửa `opencode-service`: SSE chỉ mở ở mảnh ĐẦU, vì mở trước khi chạy CLI thì 429/403 nằm trong thân stream, không thành mã HTTP, và `ModelChain` không nhận ra để đổi mắt xích. Thấy `WARN` rơi về không-stream xuất hiện thường xuyên trên một model thì gỡ `'all'` về danh sách tên đã đo.

**Hàng rào ` ```json ` nay được bóc NGAY TRÊN STREAM** (`utils/json-stream.ts`, chỉ bật cho `streamObject` — `streamText` giữ nguyên chữ). Lý do: lượt đầu tiên bật `'all'`, `ling-3.0-flash-fin-free` mở đầu đúng bằng ` ```json ` như bẫy đã ghi ở trên, stream hỏng rồi gọi lại — 24 + 26 giây cho một lượt chấm. Bộ lọc chỉ nhận `{` làm gốc (schema của `streamObject` luôn là object), nên `[` trong câu dẫn không bị nhận nhầm.

**Nhưng đi qua `opencode-service` thì stream KHÔNG hiện chữ dần**, và đó là giới hạn của CLI chứ không phải của app. Đo 2026-09-28: một phản hồi 4.506 ký tự về trong **đúng một mảnh** ở giây thứ 16,9 — `opencode run --format json` chỉ in phần chữ khi đã viết xong, và `run --help` không có cờ nào đổi điều đó. Muốn chữ chạy dần thì phải chuyển container sang `opencode serve` rồi đọc luồng sự kiện của nó. Bật `'all'` vẫn đáng giữ: sau khi có bộ lọc, đường stream tốn đúng một lượt gọi như đường không-stream.

**`opencode-service` giữ mọi model đã thấy trong 30 phút** (`OPENCODE_MODELS_SEEN_MS`), không chỉ bản chụp của lần hỏi cuối: `opencode models` gọi ba lần liền cho ra hai danh sách khác nhau, và `space-bunny-free` lúc có lúc không. Model thật sự đã bị rút thì lượt gọi hỏng 502 và `ModelChain` đi tiếp.

**`opencode-service` từng tự nghẽn vĩnh viễn — sửa 2026-09-30.** Từ 29/09 11:02 không lượt gọi opencode nào qua: `/health` báo `running: 2, queued: 21`, mọi lượt TIMEOUT đúng 90,0s. Ba lỗi chồng nhau:

1. **Service không biết app đã bỏ đi.** App hết giờ ở 90s, CLI được 180s (`OPENCODE_TIMEOUT_MS`), và request đang XẾP HÀNG vẫn được chạy CLI trọn vẹn khi tới lượt — mỗi request bị huỷ vẫn chiếm một chỗ, hàng đợi không bao giờ vơi. Nay `res.on('close')` gỡ request khỏi hàng và giết tiến trình đang chạy.
2. **Hàng đợi không có trần.** App đẩy tới 25 việc song song (5 `job.requirements` + 10 `skill.canonicalize` + 10 `match.evaluate`) vào 2 chỗ. Nay `OPENCODE_MAX_QUEUE` (mặc định 2) — đầy thì trả **429 ngay**, mà 429 nằm trong danh sách đổi mắt xích nên app chuyển sang model khác thay vì chờ đủ 90s. TIMEOUT thì KHÔNG nằm trong danh sách đó — chờ tới hết giờ là cách chắc chắn nhất để chuỗi dự phòng không bao giờ chạy.
3. **Model sập PHÍA NHÀ CUNG CẤP trông y như nghẽn.** `ling-3.0-flash-fin-free` trả `Upstream request failed: Endpoint is unavailable`; CLI tự thử lại 6 lần trong ~70s rồi mới thoát, nên mỗi lượt đốt gần trọn 90s. Chỉ thấy được bằng `opencode run ... --print-logs` chạy thẳng trong container — qua service thì stderr rỗng, chỉ còn "CLI thoát mã 1". Thử model thì chạy TỪNG CÁI MỘT: container 1 CPU/1GB, 5 CLI song song (~259MB mỗi cái) tranh tài nguyên và hỏng cả 5, kể cả model đang sống.

Kèm theo: **lô `job.requirements` hết giờ KHÔNG rút lẻ lại** nữa — rút lẻ nhân một lô hết giờ thành N request dồn vào đúng chỗ đang tắc; chỉ lỗi schema / lô thiếu tin mới rút lẻ.

**Đừng kỳ vọng cache.** Đo 2 lượt liên tiếp cùng prompt: `cached=0` cả hai. Ghim model KHÔNG cứu được cache ở đây vì `kc/openrouter/free` bản thân nó cũng là một tầng định tuyến, cộng omniroute là chặng nữa — prompt không ở yên với nhà cung cấp nào đủ lâu. Số liệu cả bảng: `match.evaluate` 376 lượt, chỉ 5 lượt có `cachedTokens > 0`.

**Tokenizer là lý do `auto/smart` đắt gấp đôi.** Cùng một prompt: `kc/openrouter/free` khai `in=1.309`, còn `cfp`/`gweb`/`auto` khai `in=3.557`. JSON Schema bơm vào prompt chỉ chiếm ~943 token, phần còn lại là tokenizer xử lý tiếng Việt.

**`SKILL_DICTIONARY_MODEL_ID` đã BỎ GHIM ngày 2026-09-24.** Nó vẫn trỏ `hy3-free` — một model **không còn tồn tại ở đâu**: bản trần không có trong catalog omniroute, `cl/tencent/hy3:free` hết credit, `oc/hy3-free` trả 401. Nên mỗi lượt `skill.canonicalize` đều tra hụt rồi rơi sang mắt xích dự phòng, tốn 43 giây để nhận về một câu vô nghĩa (*"Bạn ơi, có vẻ như bạn quên cung cấp danh sách…"*).

Chốt chặn thì **vẫn hoạt động đúng**: lô hỏng ghi 0, danh bạ không bị bẩn. Nhưng lý do ghim riêng đã hết: đo lại bằng `node scripts/probe-skill-merge.mjs`, model mặc định đúng **8/8 ba lượt liền**, kể cả ca bẫy `manual testing` mà `mimo-v2.5-free` từng gộp nhầm vào `QA`. Muốn ghim lại thì **phải đo bằng script đó trước** — một lần gộp sai ghi vào `canonical_skills` là vĩnh viễn.

**Chuỗi dự phòng đã đổi thành `auto/fast,auto/best-chat`.** Chuỗi cũ (`cl/openai/gpt-5.6-sol`, `ds-web/deepseek-v4-pro`, `kr/deepseek-3.2`, `openrouter/nex-agi/nex-n2.5-pro:free`) có hai mắt xích **đã chết** — cline hết credit, ds-web 502 — và một mắt xích **trả tiền**.

> **Cập nhật 2026-09-17 — đọc kỹ, phần dưới CHƯA đủ.** Bể free của OpenCode
> **vẫn mở** và khoá `public` **vẫn hợp lệ**: CLI `opencode` trên máy phát triển
> gọi `mimo-v2.5-free` thành công mà chưa hề đăng nhập (`opencode providers list`
> chỉ có credential Google). Nhưng **app thì 403**, và lý do không phải khoá.
>
> Bắt gói thật từ CLI (trỏ `OPENCODE_CONFIG_CONTENT` về một server ghi header)
> cho thấy nó gửi:
>
> ```
> authorization: Bearer public
> user-agent: opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14
> x-opencode-client: cli
> x-opencode-project: global
> x-opencode-session: ses_f520b15aaffejKKWBg0tZgCYSQ
> x-opencode-request: msg_...
> ```
>
> **Nhưng sửa hai chỗ đó vẫn KHÔNG đủ.** Thử nhiều session tự sinh cho kết quả
> không theo quy luật định dạng nào — có chuỗi qua, có chuỗi cùng độ dài bị
> chặn. OpenCode không kiểm định dạng mà kiểm thứ gắn với một phiên OpenCode
> THẬT. Câu báo lỗi nói đúng chủ ý: *free tier can only be used **from within
> OpenCode***.
>
> Riêng **`hy3-free` thì đã bị rút hẳn** khỏi OpenCode — `GET /zen/v1/models`
> không còn nó, gọi trả `[401] Model hy3-free is not supported`. Việc này làm
> hỏng `SKILL_DICTIONARY_MODEL_ID=hy3-free`.

**Từ 2026-09-22, lõi `omniroute` chỉ còn gửi ĐÚNG hai header `x-omniroute-compression: off` và `x-omniroute-no-memory: true`.** `userAgentEnv` và `x-opencode-session` đã bị gỡ khỏi `providers/omniroute.ts`, và biến `OMNIROUTE_USER_AGENT` đã bị xoá khỏi `.env`/`configuration.ts`.

Lý do gỡ: cả hai header đó tồn tại **chỉ để phục vụ các model `oc/*`** đi qua gateway, mà chuỗi dự phòng mặc định hiện nay (`cl/openai/gpt-5.6-sol`, `ds-web/deepseek-v4-pro`, `kr/deepseek-3.2`, `openrouter/nex-agi/nex-n2.5-pro:free`) **không còn mắt xích `oc/*` nào**. Đã đo lại ngày 2026-09-22, gửi và không gửi hai header, trên `auto/smart` (ra `ds-web`), `ds-web/deepseek-v4-pro` và `kr/deepseek-3.2`: **cả 6 lượt đều 200**, không khác gì nhau.

**Nạp lại một model `oc/*` thì phải trả lại CẢ HAI header** — phần đo bên dưới vẫn còn nguyên giá trị, đừng đọc nó như chuyện đã hết hiệu lực. Hạn mức free của OpenCode gắn với chuỗi `User-Agent: opencode`; OmniRoute là một CHẶNG RIÊNG, tự mở kết nối ra OpenCode, nên không đặt UA thì nó gửi UA của chính nó. Đo cùng model, cùng key `public`, cùng thời điểm (2026-08-26):

| User-Agent gửi lên | Kết quả |
|---|---|
| `opencode` | **200** |
| `omniroute/3.8.49` | 429 `FreeUsageLimitError` |
| `curl/8.0` | 429 |
| không gửi | 429 |

May là **OmniRoute CHUYỂN TIẾP User-Agent của client lên nhà cung cấp**, nên chỉ cần khai lại `userAgentEnv` trong descriptor là xong. Hậu quả lúc chưa khai, đo trên một lượt cron thật: `oc/mimo-v2.5-free` hỏng **30/30**, mỗi tin đốt ~29 giây rồi mới rơi xuống `oc/hy3-free` chậm gấp tám (35s so với 4,2s).

**Đừng kết luận "gateway trung tính về hạn mức" từ một mẫu.** Đã sai đúng như vậy: thấy cả hai đường cùng trả 200 một lần rồi kết luận chung bể. Thật ra nó tệ hơn hẳn cho tới khi UA được đặt đúng.

Cổng 20128: đường **`/v1/*` không kiểm tra key** ở bản chạy tại chỗ (không header, `Bearer public`, chuỗi bừa — đều 200), trong khi API quản trị `/api/*` thì trả 401. Nghĩa là phần TIÊU hạn mức là phần không có cổng chặn. Lên VPS thì để `expose`, đừng `ports`, nếu không là mở một gateway model công khai cho cả internet.

#### Cập nhật 2026-10-19 — bể model động, probe trước giờ crawl, cầu dao

**Vấn đề đo được:** tên model hardcode trong `.env` sống không quá một tuần (`hy3-free` bị rút → 401, cline cạn credit, `nex-n2.5-pro:free` bị rút). Khi 2–3 mắt xích đầu đã chết, mỗi request chờ timeout từng con mới tới model sống — 45–60 giây — và 29/09 đợt crawl đêm dồn ứ tới mức `opencode-service` treo (`running: 2, queued: 21`). Request sau vẫn đâm vào đúng model request trước vừa hỏng.

**Ba mảnh, mỗi mảnh một việc:**

1. **Cầu dao trong `ModelChain`** (`ModelPoolService` giữ trạng thái). Luật duy nhất: **lỗi nào làm chuỗi đi tiếp mắt xích sau (`skipReason`) thì cộng bộ đếm** — 429, 5xx, model đã rút, từ chối khoá, **timeout**, **sai schema**. Riêng "prompt vượt trần token" không cộng: đó là lỗi của prompt, model khác vẫn nhận. Đủ `AI_CIRCUIT_BREAKER_THRESHOLD` (2) lần liên tiếp thì `links()` bỏ model đó ra trong `AI_CIRCUIT_BREAKER_COOLDOWN_MS` (15 phút), **kể cả khi caller chỉ định nó làm mắt đầu**; cả chuỗi đều đang bị cách ly thì giữ nguyên chuỗi thay vì trả rỗng. Một lần gọi thành công (kể cả probe) đặt lại bộ đếm và mở cầu dao.
2. **`ModelHealthService`** — lúc boot và theo `AI_HEALTHCHECK_SCHEDULE` (23:35), ở **mọi** tiến trình (api lẫn worker đều cần bể để gọi model). Hỏi `/models` của từng lõi trong `MAIN_TASK_PROVIDERS` / `FAST_TASK_PROVIDERS`, lọc bằng `isProbeCandidate` (một danh sách từ chung: embed/whisper/tts/image/vision/diffusion/guard/beam…, lõi trả phí chỉ lấy bản `free`), lấy tối đa 5 model mới mỗi lõi, rồi probe tuần tự từng model bằng micro-prompt `{ok, echo}` **đi qua `AiService.generateObject`** với `fallbackModelIds: []`. Nhờ vậy probe dùng lại nguyên đường structured→prompt của ADR 0013, đi qua `ConcurrencyGate`, ghi `ai_calls` với `purpose = 'model.probe'`, và lỗi probe tự cộng vào cầu dao. Mỗi lượt khoảng 30–60 lời gọi.
3. **`rankModels`** (`utils/model-pool.ts`) xếp chuỗi theo bốn khoá: model trượt probe xuống cuối → model ghim trong `.env` trước model quét được → thứ tự lõi → độ trễ probe.

**Không ghim model nào là mặc định.** `MODEL_ID`, `MODEL_FALLBACK_IDS`, `AI_FAST_MODEL_ID`, `AI_FAST_FALLBACK_IDS` mặc định rỗng: nhà cung cấp đổi tên hoặc rút model bất cứ lúc nào, nên tên viết cứng ở `.env` hay ở `configuration.ts` đều là thứ hỏng tiếp theo. Biến vẫn đọc được để ghim tạm (vd. trước buổi demo); model ghim xếp trước model quét được nhưng vẫn qua probe và cầu dao.

**Rủi ro đã chấp nhận:** probe `{ok, echo}` chỉ chứng minh model trả được JSON ngắn, không chứng minh chất lượng. Không ghim thì model đứng đầu bể main là model nhanh nhất qua probe — có thể là model nhỏ — và nó chạy cả `match.evaluate`. Model kiểu `beam-free` (suy luận lan man rồi hết token) vẫn qua probe; nó chỉ bị cách ly sau 2 lần sai schema khi chạy thật.

**Lúc vừa boot bể còn trống:** `AiService` cho lời gọi không chỉ định model đợi lượt kiểm tra đầu tiên (`ModelPoolService.waitForModels`); probe luôn chỉ định model nên không tự chờ chính nó. Kiểm tra bị tắt hoặc không model nào qua thì `ModelCatalogService.resolve()` ném `ModelUnavailableError` "Bể model đang trống" thay vì đoán một model.

`AI_FAST_FALLBACK_IDS` giờ là model ghim của bể fast như `MODEL_FALLBACK_IDS` với bể main, không còn thay hẳn. Bể fast luôn có (từ `FAST_TASK_PROVIDERS`); bể mới có một model thì `fastModelChain` trả `fallbackModelIds: undefined` để `??` của `ModelChain` giữ lưới chung. `fastModelChain` đọc bể qua `setFastPoolResolver` mà `ModelPoolService` đăng ký lúc khởi động, nên 7 điểm gọi AI_FAST_* không phải tiêm thêm service.

Route admin: `GET /api/admin/ai/models/health`, `POST /api/admin/ai/models/health-check` (chạy nền, trả trạng thái ngay — proxy Next.js cắt request sau 30 giây).

**Giới hạn đã chấp nhận:**

- Trạng thái cầu dao và kết quả probe **nằm trong RAM của từng tiến trình**, mất khi restart. Tách `APP_ROLE=api`/`worker` thì mỗi tiến trình tự probe và giữ bể riêng (tốn gấp đôi lượt probe), còn route admin chỉ thấy bể của tiến trình api. Chạy một tiến trình `all` như hiện nay thì không vướng.
- Lịch 23:35 chỉ đúng "trước giờ crawl" khi `SCRAPE_CRON_SCHEDULE` sau đó; mặc định của `SCRAPE_CRON_SCHEDULE` trong code là `0 23 * * *`.
- Mỗi lần boot tốn một lượt probe ở mỗi tiến trình. Đặt `AI_HEALTHCHECK_ENABLED=false` thì phải ghim `MODEL_ID`, nếu không mọi lời gọi AI báo bể trống. e2e tắt sẵn trong `test/support/e2e-env.ts` (e2e thay `AiService` bằng bản giả nên không cần bể).
- `interview.open`/`interview.turn` đi `streamText`: lấy model đầu bể fast qua `fastModelChain`, nhưng vẫn không có chuỗi dự phòng và lỗi của nó không cộng vào cầu dao.

#### Cập nhật 2026-10-20 — lọc model OmniRoute theo mẫu, loại bỏ `auto/*` và router alias, opencode-direct

**1. Bẫy timeout họ `omniroute/auto/*` khi probe:**
- Khi chạy probe tự động lúc khởi động và định kỳ (`AI_PROBE_TIMEOUT_MS = 6000`), cả 5 combo `auto/*` của OmniRoute (`auto/fast`, `auto/best-chat`, `auto/cheap`, `auto/smart`, `auto/coding:free`) đều hết giờ (đo thực tế chúng mất từ 35s đến 84s hoặc treo luôn). Hậu quả: mọi lượt probe đều ghi nhận chúng trượt probe, kéo dài thời gian kiểm tra của hệ thống một cách vô ích.
- `isProbeCandidate` (`utils/model-pool.ts`) nay **chặn toàn bộ họ `auto/*`** (`omniroute/auto/` và `auto/`).
- `MODEL_FALLBACK_IDS` trong `.env.example` chuyển sang model thực tế ổn định, độ trễ thấp (< 2,5s): `omniroute/ddgw/mistral-small-2603,omniroute/ddgw/gpt-5.4-mini`.

**2. Lọc kênh hỏng của OmniRoute bằng bộ lọc mẫu (`filterModel`):**
- Gateway OmniRoute khai >660 model, nhưng phần lớn đi vào các kênh không dùng được trên máy chủ phát triển:
  - `oc/`: đòi header session giả lập của OpenCode cũ.
  - `dva/`: lỗi sandbox bridge Devin (`DEVIN_AGENTIC_HOME must be an absolute path inside the bridge sandbox`).
  - `aug/`: đòi CLI `auggie` cài ngoài.
  - `zc/`: `spawn ENOENT`.
  - `cxa/`: Codex app-server transport chưa cấu hình.
  - `tllm/`: 403 bị Vercel chặn IP máy chủ.
  - `cl/`, `cline/`: cạn credit kết nối (`All 1 connection(s) credits exhausted`).
  - `claude-haiku`: 401/402 đòi token Anthropic.
- Thay vì ghim cứng danh sách model, `providers/omniroute.ts` áp dụng hàm `filterModel` khi quét:
  - Loại bỏ các tiền tố hỏng trên (`auto/`, `oc/`, `dva/`, `aug/`, `zc/`, `cxa/`, `tllm/`, `cl/`, `cline/`, `antigravity/gemini-3.7`, `antigravity/gemini-pro-agent`, `antigravity/gemini-3.1-pro`), router alias (`…/openrouter/free`, `…/openrouter/auto`) và `claude-haiku`.
  - Chỉ giữ lại các model thuộc họ `ddgw/*` (DuckDuckGo Web: miễn phí 100%, phản hồi < 2,5s, probe đạt 100%), `cfp/*`, `antigravity/*` (kênh Antigravity tích hợp vào OmniRoute), hoặc bất kỳ model tương lai nào có chữ `free` trong tên (Phương án 2: tự động nhặt model free mới).
  - `filterModel` chỉ áp dụng ở bước phát hiện tự động (`discoverModelsFor`); hàm phân giải model (`resolve`) không lọc bằng `filterModel` để người quản trị có thể chủ động ghim bất kỳ model nào mà gateway đang phục vụ.
- Bỏ giới hạn trần 5 model mỗi lõi: Quét toàn bộ model hợp lệ của từng lõi. Các lõi áp dụng bộ lọc chuyên biệt:
  - `gemini`: Lấy toàn bộ 33 model chat (loại bỏ embedding, vision, audio).
  - `groq`: 3 model chat khai báo structured output (`gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`).
  - `unorouter`: Bộ lọc `filterModel` loại bỏ toàn bộ checkpoint vẽ ảnh Stable Diffusion/SDXL (`absolutereality`, `albedobase`, `pony`, `dreamshaper`...), chỉ giữ model chat thật sự.
  - `openrouter` & `kilo`: Lấy toàn bộ model `:free` (5 model mỗi lõi), loại bỏ router alias.
  - `opencode` & `opencode-direct`: Chỉ lấy các model `free` ổn định (8 model), loại bỏ model thử nghiệm (`preview`, `alpha`, `beta`, `test`, `exp`).

**3. Bẫy router alias (`…/openrouter/free`, `…/openrouter/auto`) trên tác vụ sinh văn bản dài:**
- Đo thực tế trên luồng sinh CV (tác vụ dài ~3.400 token): model `omniroute/kc/openrouter/free` treo 130 giây rồi trả về `responseText: "User Safety: safe"` (`SCHEMA` failure do không ra JSON). Luồng người dùng treo gần 3 phút trước khi chuỗi chuyển sang fallback model (`openrouter/dots-studio/dots-3-note-preview:free`, hoàn thành sau 48s).
- Nguyên nhân: Các router alias (`openrouter/free`, `openrouter/auto`, `…/openrouter/free`) định tuyến ngẫu nhiên tới các model backend không xác định; chúng có thể vượt qua micro-prompt `{ok, echo}` của probe (vốn chỉ vài token), nhưng lập tức sập hoặc vi phạm schema khi gặp prompt dài.
- Do đó, `isProbeCandidate` **loại bỏ các router alias** có đuôi `openrouter/free` và `openrouter/auto`.

**Thứ tự lõi bể main đổi 2026-10-23:** `omniroute → opencode-direct → opencode → openrouter` (trước đó `opencode-direct` đứng đầu), theo quyết định của chủ dự án. Đổi cả mặc định trong `configuration.ts` lẫn `MAIN_TASK_PROVIDERS` trong `.env`; thứ tự lõi là khoá xếp thứ ba của `rankModels`, sau model trượt probe và model ghim.

**4. Bổ sung lõi `opencode-direct`:**
- Thêm `providers/opencode-direct.ts` gọi trực tiếp OpenCode Zen API kèm giả lập vân tay CLI v2 (`x-opencode-client`, `x-opencode-project`, `x-opencode-session`), không cần qua container `opencode-service`. Khai báo `catalogId: 'opencode'` để liên kết và lọc theo catalog `models.opencode.ai`.
