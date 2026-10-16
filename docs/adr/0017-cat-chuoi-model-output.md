# ADR 0017: Schema output của model: CẮT thay vì từ chối

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Thêm/sửa schema zod cho output model, `common/model-output.ts`
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

#### `.max()` trên chuỗi model sinh là bẫy — CẮT, đừng từ chối

Hỏng thật 2026-08-24 trên "ZIGExN VeNtura": model trả về bản tóm tắt **dùng được hoàn toàn** (verdict, 5 pros, 3 cons, rating 4.5, 59 lượt), nhưng một `usedFor` dài 250 ký tự trên trần 160. Zod từ chối, và vì **lỗi schema cố ý không đi tiếp chuỗi dự phòng**, cả 518 token đầu ra bị vứt. Người dùng mất trắng một lượt chạy vì 90 ký tự thừa.

**Đổi sang model "có structured output" KHÔNG chữa được chỗ này.** Structured output ép **hình dạng** JSON, gần như không ép `maxLength` — `muse-spark-1.2` cũng viết dài y hệt. Đã tra catalog: trường tên là `structured_output` (số ít); `muse-spark-1.2` khai `true` nhưng **trả tiền** ($1.25/$4.25 mỗi triệu token); `mimo-v2.5-free` **không khai trường này** — đúng model mà lượt hỏng rơi vào.

Cách làm nay: `.describe()` mang trần vào prompt để model biết viết ngắn, còn `.transform()` cắt lúc parse. Nhãn enum lạ dùng `.catch('unknown')`, số ngoài thang thành `null`, mảng thừa mục thì cắt và bỏ mục rỗng. Giữ nghiêm ngặt cho thứ mà cắt bừa sẽ sai nghĩa; nới cho chữ tự do.

**Từ 2026-08-26 khuôn này dùng chung cho MỌI schema, ở `src/common/model-output.ts`.** Trước đó chỉ `company-brief` được chữa, còn tám file kia vẫn có tổng cộng **93 `.max()`, 31 `.min(1)`, 0 `.catch`, 0 `.transform`** — mỗi cái là một cơ hội mất trắng lượt gọi.

Số liệu từ `ai_calls` lúc dọn (70 lượt `failureKind='SCHEMA'`):

| purpose | SCHEMA | Trường đã xác định |
|---|---|---|
| `job.requirements` | 34 | `requiredSkills` >10 mục; ba trường về `undefined` |
| `match.evaluate` | 14 | `eligibility.quote` >600; `recommendation` `undefined` |
| `skill.canonicalize` | 10 | `decisions` `undefined` |
| `document.cv` | 3 | `profileStatement` >600; `coreCompetencies.0` >160 |
| `company.brief` | 3 | `usedFor` >160; `cons.0` >140 (đều TRƯỚC bản chữa) |
| `profile.synthesize` | 1 | `educations.0.degree` rỗng (đã chữa từ trước) |

**Ranh giới phải giữ, đã suýt vượt một lần:**

- **Chỉ nới schema của MODEL, không nới schema nhận input NGƯỜI DÙNG.** `document.schema.ts` chứa cả hai: `vn()` (model) nay cắt, còn `cvEditSchema` (người dùng, qua HTTP) giữ nguyên `.max()` từ chối — người dùng gõ quá dài phải nhận 400 để sửa, cắt lén là làm mất chữ của họ.
- **Nghiêm ngặt cho thứ mà cắt bừa sẽ SAI NGHĨA.** Đã thử nới ba chỗ này và bộ test chặn lại đúng: `score` giữ `.int().min(0).max(100)` (kẹp 150 về 100 là bịa ra một điểm số), `eligibility.verdict` giữ `z.enum` cứng (nó lái Eligibility Gate — bộ lọc CỨNG), `strengths` giữ `.min(1)`.
- **Trường bắt buộc thiếu hẳn thì VẪN để hỏng.** `requiredSkills` cố ý không có `.default([])`: một bản ghi 0 kỹ năng mà đánh dấu `DONE` sẽ hiện lên giao diện thành "Khớp 0/0 bắt buộc" như thể đã phân tích xong. Hỏng to hơn im lặng sai.

**Bẫy này có HAI mặt, và đợt dọn đầu chỉ bịt được một.** `.max()` trên CHUỖI đã chuyển sang cắt từ 2026-08-26, nhưng `.max()` trên MẢNG thì còn nguyên tới 2026-08-27 — model liệt kê thừa một mục là mất trắng cả lượt gọi. Lộ ra khi thêm stream cho thư xin việc: `bodyParagraphs` có `.min(1).max(3)`, model viết 4 đoạn là hỏng cả lá thư dù ba đoạn đầu dùng được.

Nay mọi trần SỐ LƯỢNG trên schema của model đều là `.transform((items) => items.slice(0, n))`, còn `.min(n)` giữ nguyên vì đó là **sàn chất lượng cố ý** (CV phải có ≥3 năng lực, phỏng vấn phải có ≥2 câu chuyện STAR). Đã đo trên payload thật:

```
interview   star 9→5,  tough 12→6,  hỏi 20→8,  ý 15→6,  probe 14→6
upskill     hard 30→12, synth 20→8
profile     primarySkills 60→30, missing 30→15
search-plan 10 truy vấn→6, query 200 ký tự→60
thư         bodyParagraphs 9→3
```

**`test/unit/modules/ai/schema-array-caps.spec.ts` là máy canh, đừng gỡ.** Nó SOI CẤU TRÚC zod lúc chạy (`_zod.def.type === 'array'` có check `max_length`) chứ không đọc chữ trong file — `.transform()` bọc mảng lại thành `pipe` nên regex trên mã nguồn báo sai cả hai chiều. Bản quét bằng regex đã bỏ sót đúng ba chỗ mà test này bắt được ngay: `applicationEmailSchema.paragraphs`, `formAnswerSchema.answers`, và `profileProposalSchema.projects.technologies` (lồng hai tầng, regex không thể thấy). Đã thử thêm lại một `.max()` để chắc là nó biết đỏ.

**`cvEditSchema` cố ý KHÔNG cắt**
 — nó nhận input NGƯỜI DÙNG qua HTTP, và ở đó `too_big` phải thành 400 để họ biết mà sửa. Cắt lén chữ người dùng gõ là làm mất dữ liệu của họ. Đã kiểm: 40 kinh nghiệm vẫn bị chặn đúng.

**Kèm theo đó là một cái bẫy thứ hai, và nó im lặng:**

 `z.toJSONSchema(schema)` **ném** `Transforms cannot be represented in JSON Schema`, mà `withSchemaInstruction` lại bắt lỗi rồi trả về system prompt gốc — model sẽ mất sạch phần nhắc schema và không có gì báo. Nên nó gọi `z.toJSONSchema(schema, { io: 'input' })`: bản đầu vào cũng đúng là thứ cần mô tả cho model, vì model sinh ra bản TRƯỚC transform. Có test đơn vị ghim điều này.
