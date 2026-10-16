# ADR 0014: Token đã trả tiền và cache prompt

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Tối ưu prompt, đọc `inputTokens`/`cachedTokens`, hoặc sửa `renderShared`
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Token: `inputTokens` KHÔNG phải số token đã trả tiền

Nhà cung cấp **tự cache phần đầu prompt**, và `inputTokens` **đã gộp cả phần cache đó**. Đo 2026-08-26 qua đúng đường app đi (`LanguageModelFactory` → OmniRoute → OpenCode, `@ai-sdk/openai-compatible`), ba lượt gọi cùng một system prompt:

```
lần 1: inputTokens=1377  cacheRead=0      noCache=1377
lần 2: inputTokens=1377  cacheRead=1344   noCache=33     ← 97,6% là cache
lần 3: inputTokens=1377  cacheRead=1344   noCache=33
```

Nên **mọi con số "token đã tiêu" đọc từ `inputTokens` đều thổi phồng**, và mọi quyết định cắt prompt dựa trên nó đều dựa trên một cái giá không có thật. Cột `ai_calls.cachedTokens` có mặt để tách hai thứ đó ra; số đáng tối ưu là `inputTokens - cachedTokens`.

**Điều kiện để cache ăn: phần hằng phải đứng ĐẦU và giống hệt từng byte.** Hệ quả cho người viết prompt: đừng chèn dữ liệu người dùng vào GIỮA khung đặc tả. Khung `04-job-evaluation.md` có 12 token `[YOUR_*]` được điền hồ sơ vào giữa thân, nên tiền tố khác nhau theo từng hồ sơ và cache chỉ ăn trong phạm vi một người dùng. Tách khung thuần lên trước, hồ sơ xuống sau, thì cache ăn xuyên mọi người dùng — nhưng phải đo lại chất lượng bằng `bench-models.mjs` trước khi chốt.

**Đã làm cho CHẤM ĐIỂM ngày 2026-09-28** (`renderShared` trong `skills/utils/shared-placeholders.ts`): mỗi `[YOUR_*]` thành câu trỏ cố định `(xem «Kỹ năng chính»)` tới dòng cùng nhãn trong `profileSummary`, cộng MỘT câu ghi chú "không có dòng đó nghĩa là chưa cung cấp". Mất gì cũng không: cả 12 giá trị vốn đã có trong `profileSummary` — hồ sơ từng được gửi HAI lần. Test ghim hai điều: mọi nhãn trỏ tới đều có dòng thật trong `profileSummary` (đổi nhãn một bên mà quên bên kia thì câu trỏ chỉ vào hư không, không lỗi nào báo), và hai hồ sơ khác nhau cho ra `system` giống hệt.

Đo bằng `node scripts/probe-prompt-cache.mjs` (qua đúng `AiService`, không ghi `job_matches`, purpose `match.evaluate.probe`), 7 cặp chạy đủ, mỗi cặp prompt cũ HAI lần + mới một lần:

| | Kết quả |
|---|---|
| Dao động tự nhiên — cùng prompt cũ gửi hai lần | 7,1 điểm |
| Chênh lệch mới ↔ trung bình cũ | 5,9 điểm |
| Verdict mới khác CẢ HAI lượt cũ / eligibility khác | 0/7 / 0/7 |
| Cache lần đầu thấy prompt, `ling` | cũ 1.920 token (5/5, chỉ phần CLI) → mới 64–89% (2/3) |
| Cache lần đầu thấy prompt, `space-bunny` | cũ trung bình 49% → mới 78% (3/3) |

Ba điều rút ra, đừng đo sai lại: **so `cũ-1` với `mới`, đừng tính `cũ-2`** — nó gửi lại y hệt nên luôn cache 100% và từng làm bản tóm tắt in ra "cũ 57,8%, mới 46,3%", ngược thực tế. **Cache KHÔNG làm nhanh hơn trên bể free** — lượt 100% cache có lúc chậm hơn lượt 0%; lợi ích chỉ thành tiền khi dùng model trả phí. Và **eligibility tự dao động**: cùng một prompt cũ từng cho `PASS` rồi `UNVERIFIED`, nên một lần lệch eligibility không đủ để kết tội prompt mới.

Câu trỏ phải NGẮN: bản đầu lặp câu giải thích trong từng câu trỏ, 16 lần, làm `system` dài HƠN bản cũ (8.228 so với ~7.200 ký tự) — tức tốn thêm token ở mọi lõi không cache. `--dry` của script bắt được điều này mà không tốn lượt gọi nào.

**Chấm điểm là prompt DUY NHẤT từng mang hồ sơ trong khung.** Đã kiểm mọi mục mà các module khác giữ lại (2026-09-28): `03`, `06`, `07`, `08` và hai nửa của `upskill/SKILL.md` không có token `[YOUR_*]` nào; `05-cv-templates.md` có 4 token (`YOUR_PRIMARY_ROLE_TYPE`, `YOUR_PROFILE_STATEMENT_TEMPLATE_1/2`, `YOUR_SECONDARY_ROLE_TYPE`) nhưng không token nào có trong bảng của `render()`, nên luôn thành cùng một câu "chưa cung cấp". Tức `system` của CV/thư/mail/form/phỏng vấn/upskill vốn đã giống nhau giữa mọi người dùng — đổi chúng sang `renderShared` ra đúng từng byte như cũ, không có gì để đo.

Cùng lượt kiểm đó: `BEHAVIOURAL_SECTIONS` của phỏng vấn **không khớp tiêu đề nào** của `02-behavioral-profile.md`, nên `keepSections` trả chuỗi rỗng. Đừng "sửa" cho khớp — file đó toàn khung trống của bản fork (`[DRIVE_1]`, `[BEHAVIOR_1]`…), khớp được thì model nhận một bảng đầy "chưa cung cấp". Dữ liệu hành vi thật tới model qua dòng `Đặc điểm hành vi (JSON)` của `profileSummary`.

**Đo trước khi cắt prompt.** Một lần đã suýt đi tối ưu `agent.apply` vì thấy `inputTokens` trung bình 116.761 — con số đó gồm cả cache, và phần thật sự trả tiền có thể nhỏ hơn nhiều.
