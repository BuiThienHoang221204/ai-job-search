# ADR 0013: Ép định dạng đầu ra của model và catalog model

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `structuredOutputs`, `honorsResponseFormat`, `streamsJson`, `extractJson` hoặc chọn model theo catalog
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

#### Ép định dạng đầu ra: chế độ theo LÕI, không phải một cờ toàn cục

Có đúng hai đường bắt model trả JSON đúng schema, và **đường nào chạy được là tuỳ lõi**:

| Đường | `structuredOutputs` | Cách làm |
|---|---|---|
| `response_format` | `true` | SDK gửi `json_schema` trong thân request, system prompt giữ nguyên |
| Bơm schema vào prompt | `false` | `withSchemaInstruction` nối JSON Schema vào cuối system prompt, `unwrapFencedJson` bóc hàng rào ```` ```json ```` khi model trả về |

**OmniRoute không ép được đường thứ nhất.** Đo 2026-09-22: gửi `response_format: {type: json_schema, strict: true}` cho `auto/smart`, gateway định tuyến sang `ds-web` (header `x-omniroute-decision: strategy=auto; provider=ds-web`) và trả về **văn xuôi**, `finishReason=stop`, 648 token. Gateway chỉ CHUYỂN TIẾP trường đó rồi mặc kệ; chỉ họ `cl/*` (cline) thật sự áp dụng, mà cline thì đang 402 `Insufficient balance`.

Vì vậy descriptor có `honorsResponseFormat`. Bỏ trống = lõi ép được (mặc định của `openrouter`, `kilo`, `opencode`); `omniroute` khai `false`. `LanguageModelFactory.structuredOutputModeFor` gộp nó với `AI_STRUCTURED_OUTPUTS` để ra chế độ thật cho từng lời gọi.

**Đừng quay lại một cờ toàn cục tự lật.** Bản cũ giữ `this.structuredOutputs` rồi đổi nó cho CẢ tiến trình khi gateway từ chối — với một chuỗi dự phòng trộn nhiều lõi thì giá trị nào cũng sai với một nửa chuỗi, và đó chính là lý do hai kết luận trái ngược nhau cùng đúng ("bật `true` mới chạy" cho lõi gọi thẳng, "phải `false`" cho omniroute). Phần học được vẫn giữ, nhưng **khoá theo `providerId`**: lõi nào từ chối `response_format` thì chỉ lõi đó chuyển chế độ.

**Lõi khai `honorsResponseFormat: false` chỉ có MỘT chế độ dùng được — đừng lật sang chế độ kia.** Hỏng thật 2026-09-23 trên `omniroute/auto/smart`: lượt đầu chạy đúng chế độ `false` nhưng không ra object, rồi lượt thử lại ở `true` **bỏ luôn JSON Schema khỏi system prompt** và tắt bộ bóc JSON, trong khi omniroute vẫn mặc kệ `response_format`. Model không còn lời nhắc nào về hình dạng, và lỗi người dùng thấy (`could not parse the response`) là của lượt HAI, che mất lỗi thật của lượt đầu. Nay `switchable` chặn nhánh đó ở cả `generateObject` lẫn `streamObject`.

**Quyết định có stream hay không là theo TỪNG MODEL, không theo lõi** — `ProviderDescriptor.streamsJson` là danh sách CHO PHÉP (ngược với `knownNoStructuredOutput` là danh sách chặn). Lý do đảo chiều: đoán sai về structured output tốn đúng một lượt gọi, còn đoán sai về stream tốn **thêm cả một lượt nữa** cho lượt rơi về. Ngoài danh sách thì `streamObject` gọi thẳng đường không-stream; model trong danh sách mà stream vẫn hỏng thì vẫn còn lưới rơi về.

**Với model ngoài danh sách, `streamObject` KHÔNG thử stream lấy một lần** — nó gọi thẳng đường không-stream. Lý do: `extractJson` chỉ chạm được phản hồi `application/json`, còn stream là `text/event-stream`, nên **đường stream không có lưới nào**. Đo trên `omniroute/auto/smart` ngày 2026-09-23: stream 0/2, không-stream 2/2, và một lượt stream hỏng tốn **27,9 giây + 6.773 token vào**. Quan trọng hơn: lượt hỏng đó **không cho người dùng thấy gì** — thẻ "Đang chấm điểm" 4 dòng vẫn quay hết rồi kết quả hiện một lần, y như đường không-stream. Tức là trả gấp đôi cho một hiệu ứng không xuất hiện.

Bật lại streaming cho lõi nào = gỡ `honorsResponseFormat: false` của lõi đó. `streamEvaluate` vốn đã xử lý được `partials` rỗng nên không nơi gọi nào phải sửa theo.

**`extractJson` bóc JSON khỏi thứ model THẬT SỰ viết**, không chỉ hàng rào bao trọn phản hồi như bản cũ: hàng rào nằm sau câu dẫn, JSON trần lẫn trong văn xuôi, mảng ở gốc. Nó quét **cân bằng ngoặc có biết chuỗi và ký tự thoát** — cách "từ `{` đầu tới `}` cuối" vỡ ngay khi model viết thêm một câu có dấu ngoặc phía sau. Bóc không được thì trả nguyên văn để câu lỗi vẫn in đúng thứ model đã viết.

**Và nó chỉ bóc theo dấu mở ĐẦU TIÊN của cả chuỗi — đừng thử lần lượt `{` rồi `[`.** Bản đầu làm vậy và hỏng ngay ngày 2026-09-23: model viết object đầy đủ (`outputTokens=3.077`) nhưng **bị cắt cụt**, nên `{` không bao giờ đóng, rồi nhánh `[` **moi đúng mảng `strengths` ở giữa ruột** ra và đưa lên như thể đó là toàn bộ câu trả lời. Zod báo *"expected object, received array"* — một thông báo lạc hướng hoàn toàn so với nguyên nhân thật là cắt cụt, và nó biến một lỗi rõ ràng thành một lỗi sai sự thật. `json-text.spec.ts` có hai test ghim đúng ca này.

**`streamObject` có lưới y như `generateObject`.** Cả hai thử lại ĐÚNG MỘT lần ở chế độ còn lại, khi lõi có hai chế độ. Với stream, thử lại trong suốt được là nhờ `beginStream` giữ lại tới khi có mảnh ĐẦU TIÊN mới trao cho người gọi: model trả văn xuôi thì `partialObjectStream` không phát mảnh nào, nên lúc đó chưa có byte nào rời máy chủ. Hỏng SAU mảnh đầu thì hỏng hẳn — trình duyệt đã vẽ nửa câu, không còn đường lùi, đúng nguyên tắc của `streamText`.

Đo trên tác vụ thật (viết thư xin việc, qua đúng `AiService` → OmniRoute → ds-web) ngày 2026-09-22: chế độ đúng ngay từ đầu **9,3 giây / 198 mảnh**; ép chạy nhánh dự phòng thì **18,2 giây / 203 mảnh** và người gọi vẫn nhận đủ object, chỉ có thêm một dòng `WARN`.

#### Catalog KHÔNG phải danh sách model dùng được

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

#### Cập nhật 2026-10-20 — lọc model quét mới theo `structured_output` của catalog

**Vấn đề đo được:** Catalog `models.opencode.ai/api.json` có trường boolean `structured_output`. Trong 7 ngày đo đạc tới 2026-10-20, các model không khai `structured_output: true` (hoặc khai `false`) — điển hình như `mimo-v2.6-flash-free`, `nemotron-3.5-super-vl-free`, `nemotron-3-ultra-free` — là nhóm chiếm tỷ lệ lỗi `SCHEMA` và `TIMEOUT` cao nhất khi chạy tác vụ có cấu trúc của app.

**Giải pháp lọc ở khâu quét model (`ModelCatalogService.declaringStructuredOutput`):**
1. Khi `ModelCatalogService` quét model động (`discoverModelsFor`), nó đối chiếu danh sách id với catalog `models.opencode.ai`.
2. Model nào có mặt trong catalog nhưng không khai `structured_output: true` sẽ bị loại ngay từ khâu quét, không đưa vào danh sách ứng viên probe.
3. Nếu lõi hoặc model không có trong catalog (như `omniroute`, hoặc model mới chưa kịp lên catalog), hoặc khi việc tải catalog thất bại, hệ thống giữ nguyên danh sách (không loại bừa).
4. Các lõi có định danh hoặc id model khác với catalog khai báo `catalogId` và `catalogModelId` trong descriptor:
   - `gemini`: khai `catalogId: 'google'` và `catalogModelId: (id) => id.replace(/^models\//, '')`.
   - `opencode-direct`: khai `catalogId: 'opencode'`.
5. Model được ghim trực tiếp trong biến môi trường (`MODEL_ID`, `MODEL_FALLBACK_IDS`...) không bị bộ lọc này chặn — người dùng ghim model nào thì hệ thống tôn trọng model đó.
