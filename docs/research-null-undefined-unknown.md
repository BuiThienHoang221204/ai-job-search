# `| null`, `?:`, `undefined`, `unknown` — senior có viết không?

Nghiên cứu ngày 2026-10-16. Không sửa code. Mọi trang dẫn dưới đây đã được mở để kiểm, trừ chỗ ghi rõ.

**Trả lời ngắn:** Có, và viết thường xuyên. Với `strictNullChecks` bật (repo này bật trong `server/tsconfig.json`), `null`/`undefined` là kiểu riêng; không ghi ra thì compiler không cho gán. Cái senior *tránh* là `any`, và việc ghi `| null` hay `?:` ở chỗ giá trị đó không bao giờ xảy ra. Ví dụ `withFailureKind` trong câu hỏi đúng một nửa: `| null` ở đầu ra là cần, còn `?:` ở đầu vào thì thừa (xem mục 5).

## 1. `null` và `undefined` — các nguồn chính thức nói gì

- **strictNullChecks:** khi bật, "`null` and `undefined` have their own distinct types and you'll get a type error if you try to use them where a concrete value is expected"; khi tắt thì chúng "effectively ignored by the language" và gây lỗi lúc chạy. — https://www.typescriptlang.org/tsconfig/strictNullChecks.html
- **`?:` và `exactOptionalPropertyTypes`:** mặc định `x?: T` nhận cả `T`, `undefined` lẫn việc vắng trường. Bật cờ này thì `?:` chỉ còn nghĩa "vắng"; muốn nhận `undefined` tường minh thì phải tự ghi `| undefined`. — https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html (repo chưa bật cờ này.)
- **Google TypeScript Style Guide:** "TypeScript code can use either `undefined` or `null` to denote absence of a value" — không cấm cái nào. Hai quy tắc đáng mượn: "Use optional fields … rather than a `|undefined` type", và "Type aliases *must not* include `|null` or `|undefined` in a union type … only add `|null` or `|undefined` when the alias is actually used." — https://google.github.io/styleguide/tsguide.html
- **Coding guidelines của repo microsoft/TypeScript:** vẫn ghi "Use `undefined`. Do not use null.", nhưng ngay đầu trang nói rõ đây "*NOT* a prescriptive guideline for the TypeScript community", chỉ dành cho "contributors to the TypeScript project's codebase". — https://github.com/microsoft/TypeScript/wiki/Coding-guidelines. Câu "senior không dùng null" thường bắt nguồn từ trang này, nhưng người viết đã ghi rõ nó không áp dụng ra ngoài repo đó.
- **typescript-eslint `no-unnecessary-condition`** (bộ `strict-type-checked`): báo `?.` hay `if (x)` trên giá trị mà kiểu khẳng định không bao giờ nullish — "arg can never be nullish, so ?. is unnecessary". Như vậy công cụ bắt chỗ *thừa* null, chứ không cấm dùng null. — https://typescript-eslint.io/rules/no-unnecessary-condition/. Repo dùng `recommendedTypeChecked` (`server/eslint.config.mjs:53`), bộ này không có rule đó.

## 2. `unknown` và `any`

- TS 3.0: "`unknown` is the type-safe counterpart of `any`… no operations are permitted on an `unknown` without first asserting or narrowing." — https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html
- Google style guide: "`any` is dangerous - it can mask severe programming errors… Use the built-in type `unknown`… narrow the type using a type guard." — https://google.github.io/styleguide/tsguide.html
- typescript-eslint `no-explicit-any` (có trong `recommended`): "If you don't know the data shape of a value, the `unknown` type is safer than `any`." — https://typescript-eslint.io/rules/no-explicit-any/. Repo đang **tắt** rule này (`eslint.config.mjs:70`), nhưng đo được 0 chỗ `any` trong `src`.
- Biến trong `catch`: `useUnknownInCatchVariables` đổi kiểu biến catch từ `any` sang `unknown` — https://www.typescriptlang.org/tsconfig/useUnknownInCatchVariables.html. Trang này không nói cờ nằm trong `strict` hay không. Theo hiểu biết chung, cờ được bật theo `strict` từ TS 4.4, nhưng mục này chưa kiểm được bằng nguồn đã mở. Repo không bật `strict`, nên ghi `error: unknown` thủ công là đúng.
- **Khi nào dùng `unknown`:** ở biên, nơi kiểu thật sự chưa biết: lỗi bắt được, `JSON.parse`, body/JSON từ dịch vụ ngoài, payload hàng đợi, cột `Json` của Prisma. Qua biên thì thu hẹp ngay bằng type guard hoặc zod. **Không dùng** khi kiểu đã biết từ Prisma, DTO hay schema: lúc đó `unknown` cộng `as` chỉ là `any` đội lốt.

## 3. Prisma: vì sao gần như bắt buộc có `| null`

- Cột `String?` trong `schema.prisma` sinh ra trường kiểu `string | null` (không phải `?:`). Bản ghi luôn có trường đó, chỉ là giá trị có thể NULL. Đây là hành vi sinh kiểu của Prisma Client. Câu này mình chưa trích được nguyên văn từ docs, nhưng kiểm được trong `src/generated` của repo.
- Prisma phân biệt hai giá trị: "`null` is a **value**", "`undefined` means **do nothing**". Trong `data`, `null` ghi NULL còn `undefined` bỏ qua trường. Trong `where`, `null` lọc bản ghi rỗng còn `undefined` bỏ qua điều kiện. Docs cảnh báo `undefined` "can lead to unexpected results and data loss": `OR` có phần tử `undefined` trả về rỗng, còn `AND`/`NOT` trả về tất cả. Preview `strictUndefinedChecks` biến việc truyền `undefined` tường minh thành lỗi lúc chạy, và dùng `Prisma.skip` thay thế. — https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/null-and-undefined (URL cũ `/special-fields-and-operations/...` trả 404.)
- **Hệ quả:** mọi hàm nhận hàng Prisma hoặc trả dữ liệu ra API từ cột nullable đều *phải* mang `| null`. Ép `null` thành `undefined` để "cho đẹp" là sai nghĩa khi ghi ngược lại DB: thành "không cập nhật" thay vì "xoá giá trị". Repo này có hơn 8 cột `error String?` (`prisma/schema.prisma:285, 488, 529…`), nên `error: string | null` là kiểu đúng.

## 4. Repo lớn viết thế nào

- **immich** (NestJS): `server/src/repositories/user.repository.ts` có `quotaSizeInBytes: number | null;` (dòng 27) cạnh `withDeleted?: boolean;` (dòng 16). `server/src/utils/misc.ts:27` có `export const isStartUpError = (error: unknown): error is ImmichStartupError => …`. — https://github.com/immich-app/immich/blob/main/server/src/utils/misc.ts
- **nestjs/nest**: `packages/common/utils/shared.utils.ts` có `isObject = (fn: unknown): fn is object`, `isString = (val: unknown): val is string`, `normalizePath = (path?: string)`. — https://github.com/nestjs/nest/blob/master/packages/common/utils/shared.utils.ts
- **vercel/ai**: `packages/ai/src/util/retry-with-exponential-backoff.ts` dùng `?:` cho tuỳ chọn (`maxRetries?: number;`, `abortSignal?: AbortSignal;`). — https://github.com/vercel/ai/blob/main/packages/ai/src/util/retry-with-exponential-backoff.ts
- **Mẫu chung:** `| null` cho dữ liệu từ DB, `?:` cho tuỳ chọn/tham số có thể vắng, `unknown` + type guard `x is T` ở hàm kiểm tra đầu vào. (Các file trên được đọc qua raw.githubusercontent.com ngày 2026-10-16; số dòng có thể lệch khi repo đổi.)

## 5. Đo trong `server/src` (bỏ `src/generated`)

| Mẫu | Số lần |
|---|---|
| `\| null` | 340 |
| `?: ` (trường/tham số tuỳ chọn) | 311 |
| `unknown` | 198 (21 trong `common/ai/failure-kind.ts`) |
| `undefined` | 111 |
| `any` (kiểu) | 0 |
| `?:` và `\| null` cùng một dòng | 14 |

Cách đếm là grep thô (`grep -o`), nên đây là con số ước lượng chứ không phải số khai báo chính xác.

**Đúng lý do**
1. `common/ai/failure-kind.ts` — `classifyFailure(input: unknown)`: lỗi từ SDK hoặc gateway có hình dạng không chắc chắn; hàm thu hẹp nó bên trong.
2. `common/error-message.ts` — `messageOf(error: unknown)`: dùng cho biến `catch`.
3. `common/web/serper.ts` — `parseSerper(body: unknown)` rồi lọc bằng `item is Record<string, unknown>`: JSON từ dịch vụ ngoài; mẫu giống `nest/shared.utils.ts`.
4. `failure-view.ts` — `failureKind: FailureKind | null` ở đầu ra: client phân biệt "không lỗi" bằng `null` tường minh, đúng với cột `error String?`.
5. `scraper/types.ts:5-14` — `company: string | null` … : portal có thể không trả trường, nhưng card luôn có khoá; ghi đúng nghĩa.

**Có thể thừa** — mục 1–4 đã sửa 2026-10-16 (bỏ `?`, kéo theo bỏ 4 dòng `?? null` ở `negotiation.ts` và ràng buộc `error?` trong `withMatchDetail`; `tsc` chỉ báo fixture test thiếu trường, không chỗ gọi thật nào); mục 5 để nguyên
1. `common/ai/failure-view.ts:4` — `T extends { error?: string | null }`: mọi nơi gọi (`documents.controller`, `matching.service.view(match: JobMatch)`, `interview.service`, `job-view`) truyền hàng Prisma có cột `error` nên trường luôn có mặt. `error: string | null` là đủ. Phần `Omit<T,'error'> & {…}` thì cần, vì nó giữ kiểu các trường còn lại.
2. `documents/content.types.ts:40-42` — `Identity.phone?/location?/title?: string | null`: `document-generator.service.ts:44-46` luôn gán `?? null`, tức trường không bao giờ vắng. Nếu đó là nơi tạo duy nhất thì bỏ `?`.
3. `matching/ai/utils/requirements.ts:39` — `toMatchProfile({ headline?: string | null })`: cả bốn nơi gọi đều truyền hàng Prisma có `select` hoặc đọc đủ `headline` (`jobs.service.ts:51`, `match-write.ts`). Có lẽ chỉ cần `string | null`.
4. `salary/salary.types.ts:57-60` — `postedMin?: number | null`… : `salary.service.ts:59` luôn gán từ `job.salaryMin` (nullable), và `negotiation.ts:183` lại phải viết `?? null` để gộp hai trạng thái. Bỏ `?` thì dòng `?? null` cũng biến mất.
5. `queue/queue-key.ts`, `documents/templates/cv-layout.ts` — `data as Record<string, unknown>` / `(raw: unknown)`: hợp lý nếu dữ liệu là cột `Json` hoặc payload pg-boss chưa kiểm. Nếu payload đã có kiểu theo tên job thì nên nhận kiểu đó thay cho `unknown` + `as`. Cần xem chỗ gọi rồi mới kết luận.

`scraper/types.ts:15` (`description?: string | null`) có thể là trường hợp *cả hai* thật sự xảy ra: card không có mô tả (vắng) còn detail có mô tả rỗng (null). Đó là ngoại lệ hợp lệ, nhưng nên kiểm chỗ tạo card trước.

## 6. Đề xuất thêm vào CLAUDE.md (mục "Cách viết code trong `server/src`")

```md
**`null`, `?:`, `unknown` — ghi đúng điều thật sự xảy ra.**
- `| null` cho giá trị đến từ cột nullable (`String?`) hoặc ra API; Prisma coi `null` = ghi NULL, `undefined` = bỏ qua trường, nên đừng đổi qua lại.
- `?:` cho trường/tham số có thể VẮNG (DTO tuỳ chọn, options). Không ghi cả `?:` lẫn `| null` trừ khi cả hai trạng thái thật sự xảy ra.
- `unknown` chỉ ở biên: biến `catch`, `JSON.parse`, body dịch vụ ngoài, cột `Json`, payload hàng đợi. Qua biên thì thu hẹp ngay (type guard/zod). Kiểu đã biết từ Prisma/DTO thì dùng kiểu đó, không `unknown` + `as`.
- Không `any`. Không đặt `| null` vào type alias dùng chung — thêm ở chỗ dùng.
```
