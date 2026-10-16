# Over-engineering trong service/utils: dấu hiệu, cách đo, cách rút gọn

Nghiên cứu ngày 2026-10-16 cho `server/` (NestJS 11 + Prisma 7.9). Chỉ **bổ sung** cho CLAUDE.md ("Sửa ĐỦ DÙNG", "Logic thẳng, đọc từ trên xuống", "Service chỉ giữ phần chạm DATABASE") và hai file `docs/research-backend-module-structure.md`, `docs/research-backend-best-practices.md`. Những gì đã có ở đó (không tầng repository, strangler fig, characterization test, `max-lines` 300, Transaction Script) không nhắc lại.

Nhãn **[quan điểm]** = ý kiến cá nhân của tác giả, không phải chuẩn. Các trích dẫn đã mở trang gốc để kiểm, trừ chỗ ghi rõ là chưa kiểm được.

---

## 0. Trả lời ngắn câu hỏi "sao logic cứ dài và phức tạp"

Có hai loại phức tạp, và chỉ một loại là lỗi:

- **Phức tạp vốn có của bài toán.** Ví dụ: tính khoảng lương đàm phán, đối chiếu yêu cầu với kỹ năng, bóc JSON từ output model. Senior không làm nó biến mất. Họ **gom nó vào một chỗ sâu**, tức một hàm có giao diện nhỏ và nhiều logic bên trong.
- **Phức tạp do tay mình thêm vào.** Ví dụ: tầng chuyển tiếp, tham số không ai truyền, generic cho một chỗ gọi, nhánh cho dữ liệu chưa từng có. Đây là over-engineering, và đây là thứ nên cắt.

Google gọi loại thứ hai là over-engineering: "made the code more generic than it needs to be, or added functionality that isn't presently needed by the system". Tiêu chí của họ cho "quá phức tạp" là "can't be understood quickly by code readers" (https://google.github.io/eng-practices/review/reviewer/looking-for.html#complexity).

**Đo nhanh trên repo** (ESLint, ngưỡng thử, không bật thật):

- `complexity > 10`: 36 hàm. Chỉ 3 hàm vượt ngưỡng mặc định 20:
  - `config/configuration.ts:15` (44)
  - `salary/utils/negotiation.ts:96 negotiationRange` (36)
  - `matching/rules/requirement-match.ts:90 matchRequirements` (23)
- `max-depth > 4`: 1 chỗ (`scraper/utils/collect-cards.ts:54`).
- `max-params > 4`: 21 chỗ. Phần lớn là constructor tiêm phụ thuộc hoặc `persist(...)` có 5–6 tham số.

Phần lớn điểm nóng là phức tạp **vốn có** và nằm trong `utils/` thuần. Đó là đúng chỗ, nên không phải dấu hiệu over-engineering. Có một lệch quy ước nhìn thấy được: `negotiationRange` có ternary lồng (`experienceSource`), trái quy tắc "Không ternary lồng" của CLAUDE.md. Ghi lại để báo, không sửa trong lượt này.

---

## 1. Nguồn gốc — ý chính, mỗi ý một link

**Ousterhout, *A Philosophy of Software Design***

Trang sách: https://web.stanford.edu/~ouster/cgi-bin/aposd.php. Bài nói "Talks at Google": https://www.youtube.com/watch?v=bmSAYlu0NcY. Tranh luận bằng văn bản giữa Ousterhout và Robert Martin, do chính tác giả viết: https://github.com/johnousterhout/aposd-vs-clean-code.

- Method "sâu" là method có "a lot of functionality but have a very simple interface". Interface "shallow" thì "don't help much in terms of reducing what the programmer needs to know".
- "the more you split up a method, the shallower the resulting methods will be".
- "decomposition can be taken too far". Ông phê phán "teeny-tiny methods that suffer from both shallow interfaces and entanglement".
- Method bị "entangled" (hai hàm phải đọc cùng lúc mới hiểu) "can usually be improved by combining them so that all the code is in one place".
- "Pass-through method", "classitis" và "define errors out of existence" là thuật ngữ trong sách (chương 4, 7, 10). Bài nói ở trên trình bày "define errors out of existence". Trang của tác giả không có bản text riêng cho các thuật ngữ này, nên nguồn công khai gần nhất là sách và video.

**Kent Beck**

- 4 luật thiết kế đơn giản, theo bản Fowler ghi lại: "Passes the tests", "Reveals intention", "No duplication", "Fewest elements". Về luật 4: "anything that doesn't serve the three prior rules should be removed" (https://martinfowler.com/bliki/BeckDesignRules.html).
- *Tidy First?* (2023). Newsletter của tác giả: https://tidyfirst.substack.com/.
  - Các tidying gồm: Guard Clauses, Dead Code, Normalize Symmetries, New Interface Old Implementation, Reading Order, Cohesion Order, Move Declaration and Initialization Together, Explaining Variables, Explaining Constants, Explicit Parameters, Chunk Statements, Extract Helper, One Pile, Explaining Comments, Delete Redundant Comments.
  - Nguyên tắc: thay đổi cấu trúc và thay đổi hành vi "should be kept in separate PRs (or at least in separate commits)". Danh sách và trích dẫn theo bài review https://dev.to/henrikwarne/tidy-first-21hi, vì mục lục O'Reilly trả 403.
  - "One Pile" là tidying **ngược** với Extract Helper: gộp các mảnh vụn về một chỗ khi việc chia nhỏ cản trở việc hiểu.

**Martin Fowler**

- YAGNI:
  - Chỉ cấm "capabilities built into the software to support a presumptive feature". Nó "does not apply to effort to make the software easier to modify".
  - Ba loại chi phí: cost of build, cost of delay, cost of carry. Code thừa "adds some complexity to the software".
  - https://martinfowler.com/bliki/Yagni.html
- Catalog refactoring (https://refactoring.com/catalog/), các mục dùng ở dưới: [Inline Function](https://refactoring.com/catalog/inlineFunction.html), [Remove Middle Man](https://refactoring.com/catalog/removeMiddleMan.html), [Collapse Hierarchy](https://refactoring.com/catalog/collapseHierarchy.html), [Inline Class](https://refactoring.com/catalog/inlineClass.html), [Remove Dead Code](https://refactoring.com/catalog/removeDeadCode.html), [Replace Nested Conditional with Guard Clauses](https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html), [Inline Variable](https://refactoring.com/catalog/inlineVariable.html).
- Smell "Speculative Generality": "There's an unused class, method, field or parameter". Cách chữa là Collapse Hierarchy, Inline Class, Inline Method, Remove Parameter (https://refactoring.guru/smells/speculative-generality). Đây là nguồn thứ cấp diễn lại sách *Refactoring*.
- Bài "Is High Quality Software Worth the Cost?": cruft là "the difference between the current code and how it would ideally be". Code kém "significantly slows them down within a few weeks" (https://martinfowler.com/articles/is-quality-worth-cost.html).
- **Fowler và Ousterhout bất đồng về độ dài hàm.**
  - Fowler: "Any function more than half-a-dozen lines of code starts to smell". Ông coi trọng "separation between intention and implementation" (https://martinfowler.com/bliki/FunctionLength.html).
  - Ousterhout thì cảnh báo tách quá tay.
  - Quy tắc của CLAUDE.md đã đứng giữa hai bên: tách khi được gọi ≥ 2 nơi **hoặc** gói một khái niệm có tên. Đó là điều kiện "khoảng cách giữa ý định và cài đặt" của Fowler, ràng thêm bằng "đừng tạo hàm nông" của Ousterhout.

**Sandi Metz, "The Wrong Abstraction"** (https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)

- "duplication is far cheaper than the wrong abstraction".
- Một abstraction sai lớn dần theo chu kỳ: "Another additional parameter", rồi "Another new conditional".
- Cách lùi lại, theo bà, "the fastest way forward is back":
  1. Inline abstraction vào lại từng caller.
  2. Ở mỗi caller, giữ phần mà caller đó thực sự chạy.
  3. Xoá phần còn lại.

**[quan điểm] Các ý kiến khác**

- Dan Abramov, "Goodbye, Clean Code": bỏ trùng lặp đã làm thay đổi yêu cầu khó hơn. "Clean code is not a goal… Let clean code guide you. Then let it go." (https://overreacted.io/goodbye-clean-code/)
- Casey Muratori, "Semantic Compression": "make your code usable before you try to make it reusable". Viết cụ thể trước, chỉ nén lại thành hàm chung khi đã thấy lần thứ hai (https://caseymuratori.com/blog_0015).
- John Carmack, email năm 2007 về inline code: ủng hộ viết thẳng hàm chỉ gọi một lần vào chỗ gọi để thấy toàn bộ luồng trạng thái. Link http://number-none.com/blow/john_carmack_on_inlined_code.html **không mở được khi kiểm (lỗi SSL)**, nên chỉ ghi ý, không trích nguyên văn.

**Prisma 7: làm việc trong DB thay vì trong JS**

- n+1: "looping through query results and performing one additional query per result". Cách chữa là `include`, bộ lọc `in`, hoặc `relationLoadStrategy: "join"`. https://www.prisma.io/docs/orm/v7/prisma-client/queries/advanced/query-optimization-performance#solving-the-n1-problem
- `select` để kết quả "smaller, clearer, and more intentional": https://www.prisma.io/docs/orm/v7/prisma-client/queries/select-fields
- Gộp và đếm trong DB:
  - `groupBy`: https://www.prisma.io/docs/orm/v7/prisma-client/queries/aggregation-grouping-summarizing#group-by
  - `having`, "filter entire groups by an aggregate value": https://www.prisma.io/docs/orm/v7/prisma-client/queries/aggregation-grouping-summarizing#filter-groups-with-having
  - `_count` quan hệ: https://www.prisma.io/docs/orm/v7/prisma-client/queries/aggregation-grouping-summarizing#count-relations
- Nested write chạy "in a single transaction". "If any operation fails, Prisma Client rolls back the entire transaction". https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions#nested-writes

**NestJS**

- `ValidationPipe` (repo bật toàn cục ở `bootstrap.ts:47`) đã chặn input sai hình dạng trước khi vào controller: https://docs.nestjs.com/techniques/validation. Vì vậy service không cần kiểm lại kiểu hay độ dài của DTO.

---

## 2. Dấu hiệu over-engineering (18 dấu hiệu, kiểm được bằng mắt)

Mỗi dấu hiệu gồm: **Dấu hiệu**, **Nguồn**, **Sửa**, **KHÔNG sửa khi**.

1. **Hàm/method chỉ chuyển tiếp.**
   - **Dấu hiệu:** `foo(x) { return this.bar.foo(x); }`, hoặc service A chỉ gọi service B với cùng tham số.
   - **Nguồn:** Ousterhout, pass-through method; Fowler, Remove Middle Man.
   - **Sửa:** caller gọi thẳng B, rồi xoá A.
   - **KHÔNG sửa khi:** lớp giữa là seam có trong bảng seam của CLAUDE.md (`AiService`, `QueueService`…), hoặc nó thêm kiểm `userId`. Thêm kiểm quyền là thêm logic, không còn là chuyển tiếp.

2. **Hàm 2–5 dòng gọi đúng một lần, tên không nói thêm gì so với thân.**
   - **Nguồn:** Fowler, Inline Function; Beck, One Pile; Ousterhout, shallow method.
   - **Sửa:** viết thẳng vào chỗ gọi.
   - **KHÔNG sửa khi:** tên gói một khái niệm nghiệp vụ (`closingOf`, `requireQuestion`), hoặc hàm là hàm thuần cần unit test riêng vì logic có nhánh.

3. **Cặp hàm phải đọc cùng lúc mới hiểu** (entangled). Hàm A dựng state, hàm B ngầm giả định state đó, và cả hai chỉ đi cùng nhau.
   - **Nguồn:** Ousterhout ("combining them so that all the code is in one place").
   - **Sửa:** gộp lại thành một hàm.
   - **KHÔNG sửa khi:** sau khi gộp, hàm vượt khoảng 80 dòng với nhiều tầng lồng. Lúc đó nên tìm một đường cắt khác.

4. **Tham số hoặc option không bao giờ được truyền giá trị khác mặc định.** Kiểm bằng cách grep mọi chỗ gọi: không ai truyền, hoặc tất cả truyền cùng một hằng.
   - **Nguồn:** Speculative Generality → Remove Parameter; YAGNI (cost of carry).
   - **Sửa:** xoá tham số, cố định giá trị trong thân hàm.
   - **KHÔNG sửa khi:** test cần truyền giá trị khác để kiểm biên (ví dụ `now: Date` cho hàm thời gian). Đó là tham số có người dùng thật.

5. **Generic, overload hoặc `...rest` phục vụ đúng một chỗ gọi.**
   - **Nguồn:** Google ("more generic than it needs to be"); CLAUDE.md đã có ví dụ `withClosing`.
   - **Sửa:** dùng kiểu cụ thể.
   - **KHÔNG sửa khi:** kiểu generic giúp TypeScript suy ra kết quả `select` của Prisma. Lúc đó generic gánh việc giữ đúng kiểu, không phải để "tiện".

6. **Abstraction có cờ boolean hoặc `mode` phân nhánh theo caller.** Dạng `render(x, { forAdmin: true })` và bên trong có `if (forAdmin)` ở nhiều chỗ.
   - **Nguồn:** Metz, đúng chu kỳ "Another additional parameter / new conditional".
   - **Sửa:** inline vào từng caller, giữ phần caller đó chạy, rồi mới tách lại phần chung thật sự.
   - **KHÔNG sửa khi:** cờ chỉ đổi một giá trị (ví dụ nhãn), không đổi luồng.

7. **Kiểm phòng thủ cho trạng thái mà DB hoặc DTO đã chặn.** Ví dụ `if (!dto.id) throw` khi `ValidationPipe` đã bắt buộc trường đó; `?? []` cho cột Prisma `String[]` vốn không bao giờ null; kiểm trùng trước khi `create` dù đã có unique index.
   - **Nguồn:** Ousterhout, define errors out of existence; Nest ValidationPipe; CLAUDE.md `isUniqueViolation`.
   - **Sửa:** tin vào ràng buộc của schema và DTO, rồi xoá nhánh kiểm.
   - **KHÔNG sửa khi:** dữ liệu đến từ **model AI** hoặc portal. Đó là input không đáng tin, và schema zod CẮT là đúng (ADR 0017).

8. **Nhánh cho dữ liệu chưa bao giờ tồn tại.** Ví dụ `switch` có case cho enum không ai ghi; xử lý "định dạng cũ" sau khi đã migrate hết.
   - **Nguồn:** Remove Dead Code; YAGNI.
   - **Sửa:** xoá. Nếu còn lo thì kiểm DB bằng `SELECT DISTINCT`.
   - **KHÔNG sửa khi:** dữ liệu cũ vẫn còn trong bảng production, hoặc `switch` dùng nhánh `never` để TypeScript bắt enum mới thêm. Nhánh đó là máy canh, không phải code chết.

9. **Đọc nhiều bản ghi rồi lọc, nhóm hoặc đếm trong JS.** Dạng `findMany()` + `.filter()` / `.reduce()` / `new Map` để đếm.
   - **Nguồn:** Prisma `where` / `groupBy` / `_count` / `having`.
   - **Sửa:** đẩy điều kiện vào `where`, dùng `groupBy` hoặc `_count`.
   - **KHÔNG sửa khi:**
     - logic lọc là luật nghiệp vụ phải chạy bằng code (ví dụ `matching/rules/`, đối chiếu kỹ năng qua từ điển), hoặc
     - đã giới hạn bằng `take` nhỏ và SQL tương đương phải viết bằng `$queryRaw`, khó đọc hơn.

10. **Vòng lặp gọi DB một lần cho mỗi phần tử (n+1).**
    - **Nguồn:** tài liệu Prisma về n+1.
    - **Sửa:** dùng `include`, `findMany({ where: { id: { in } } })`, hoặc `createMany` / `updateMany`.
    - **KHÔNG sửa khi:** mỗi vòng là một lượt **giành chỗ có điều kiện** riêng. Gộp lại sẽ phá ngữ nghĩa giành chỗ của CLAUDE.md.

11. **`$transaction` bọc quanh một nested write, hoặc quanh một câu lệnh duy nhất.**
    - **Nguồn:** Prisma, "Nested writes" chạy trong một transaction.
    - **Sửa:** bỏ `$transaction`.
    - **KHÔNG sửa khi:** có hai ghi độc lập trên hai bảng không quan hệ. Lúc đó `$transaction([])` là đúng.

12. **Ánh xạ nhiều tầng.** Dạng entity → `toX()` → `toXView()` → `toXResponse()`, mỗi tầng chép gần nguyên các trường.
    - **Nguồn:** Beck, Fewest elements; Ousterhout, shallow module.
    - **Sửa:** dùng một `select` theo danh sách trắng, trả thẳng hoặc qua **một** hàm view.
    - **KHÔNG sửa khi:** tầng đó gỡ trường nhạy cảm (`error`, `storageKey`) hoặc dựng nhãn tính toán. Xem mục "view" trong `research-backend-module-structure.md`.

13. **Retry, fallback hoặc khoá chồng lên cơ chế đã có.** Ví dụ `try { … } catch { retry }` quanh lời gọi `AiService`, vốn đã có `ModelChain` dự phòng; thêm mutex quanh code đã giành chỗ bằng `updateMany`.
    - **Nguồn:** CLAUDE.md "Một cơ chế cho một vấn đề"; YAGNI.
    - **Sửa:** xoá lớp thêm.
    - **KHÔNG sửa khi:** lớp đó bắt một lỗi khác loại mà cơ chế dưới **không** xử lý, và đã có test chứng minh lỗi đó xảy ra.

14. **Hằng hoặc cấu hình mà không ai đổi, đọc qua `ConfigService` hoặc env.** Ví dụ `config.get('X_PAGE_SIZE') ?? 20`, trong khi biến đó không có trong `.env.example` hay ở môi trường nào.
    - **Nguồn:** YAGNI; Beck, Explaining Constants.
    - **Sửa:** dùng `const PAGE_SIZE = 20` trong module.
    - **KHÔNG sửa khi:** giá trị khác nhau giữa dev, test và prod (timeout, URL, khoá), hoặc thuộc chuỗi thứ tự timeout của ADR 0011.

15. **Interface, abstract class hoặc token DI chỉ có một implementation.**
    - **Nguồn:** Fowler, Collapse Hierarchy / Inline Class; Ousterhout, classitis; CLAUDE.md "Đừng tạo seam mới khi chỉ có một adapter".
    - **Sửa:** dùng thẳng class cụ thể.
    - **KHÔNG sửa khi:** bản giả trong test cần token đó (`STORAGE`, `SandboxRunner`), hoặc adapter thứ hai đã nằm trong lộ trình.

16. **Lồng `if` sâu thay cho guard clause.** Đường chính nằm ở tầng thụt thứ 3–4.
    - **Nguồn:** Beck, Guard Clauses; Fowler, Replace Nested Conditional with Guard Clauses.
    - **Sửa:** `if (!x) return …;` ở đầu hàm, đường chính viết phẳng.
    - **KHÔNG sửa khi:** các nhánh đối xứng và cùng quan trọng. Khi đó `if/else` hoặc `switch` đọc rõ hơn.

17. **Biến trung gian hoặc hàm chỉ để đổi tên, không giải thích gì.** Ví dụ `const result = await this.x(); return result;`. Ngược lại, biểu thức dài không có tên cũng là vấn đề.
    - **Nguồn:** Fowler, Inline Variable (chiều xoá), cân với Beck, Explaining Variables (chiều thêm).
    - **Sửa:** chỉ đặt tên khi tên nói thêm *ý nghĩa*.
    - **KHÔNG sửa khi:** biến được dùng để debug hoặc log, hoặc biểu thức có đơn vị hoặc ý nghĩa nghiệp vụ.

18. **Trùng lặp nhỏ bị gom thành helper "dùng chung" ở `common/` quá sớm.** Hai đoạn giống nhau về chữ nhưng khác nhau về lý do thay đổi.
    - **Nguồn:** Metz; Muratori ("usable before reusable"); Abramov.
    - **Sửa:** để trùng, và chỉ gom khi thấy lần thứ ba **cùng lý do đổi**.
    - **KHÔNG sửa khi:** trùng lặp đã gây bug thật vì sửa một nơi mà quên nơi kia (ví dụ danh sách bảng của `ReconcileService`). Lúc đó gom lại, hoặc ghim bằng test.

**Cách dùng khi review:** đọc từ trên xuống và chỉ hỏi một câu: "Xoá phần này thì test nào đỏ, người dùng mất gì?" Không có câu trả lời thì đó là ứng viên xoá. Đây chính là luật 4 của Beck ("Fewest elements").

---

## 3. Đo độ phức tạp: bật gì cho đủ dùng

| Luật ESLint | Mặc định | Docs |
|---|---|---|
| `complexity` (cyclomatic, có `variant: "modified"` để `switch` chỉ tính 1) | **20** | https://eslint.org/docs/latest/rules/complexity |
| `max-depth` | **4** | https://eslint.org/docs/latest/rules/max-depth |
| `max-params` (TS có `countThis`) | **3** | https://eslint.org/docs/latest/rules/max-params |
| `max-lines-per-function` (`skipBlankLines`, `skipComments` mặc định `false`) | **50** | https://eslint.org/docs/latest/rules/max-lines-per-function |

Chính docs `complexity` nói: "If you can't determine an appropriate complexity limit for your code, then it's best to disable this rule."

**Đề xuất cho repo (đủ dùng):**

- **Có: bật `complexity: ["warn", { max: 20, variant: "modified" }]` và `max-depth: ["warn", 4]` cho `src/**`.**
  - Hôm nay chỉ 3 hàm vượt `complexity` 20 và 1 chỗ vượt `max-depth` 4. Luật gần như im lặng, nên chi phí thấp.
  - Lợi ích: chặn được hàm *mới* phình quá mức.
  - Ba hàm đang vượt được tắt từng dòng bằng `eslint-disable-next-line`, đúng ngoại lệ "chỉ thị cho công cụ" của CLAUDE.md. Đó là phức tạp vốn có (cấu hình env, công thức lương, đối chiếu yêu cầu), không cần tách.
- **Không:**
  - `max-params`: 21 vi phạm, phần lớn là constructor DI của Nest. Luật này phạt đúng mẫu Nest khuyên dùng.
  - `max-lines-per-function`: 40 vi phạm ở ngưỡng 50. Bắt sửa sẽ đẩy repo về phía "teeny-tiny methods" mà Ousterhout cảnh báo, trái quy tắc "chỉ tách khi có lý do".
- **Không thêm plugin** (ví dụ `cognitive-complexity` của SonarJS). Thêm một công cụ cho cùng một vấn đề là trái "một cơ chế cho một vấn đề". Chỉ cân nhắc nếu `complexity` để lọt những ca rõ ràng khó đọc.
- **Số đo chỉ là cờ báo, không phải mục tiêu.** Hàm vượt ngưỡng thì người review đọc lại theo 18 dấu hiệu ở mục 2. Không tách hàm chỉ để hạ số.

Lệnh đo một lần, không sửa config:

```bash
cd server
npx eslint src -f json --rule '{"complexity":["warn",{"max":20,"variant":"modified"}],"max-depth":["warn",4]}' > /tmp/cx.json
```

---

## 4. Quy trình rút gọn an toàn

1. **Chọn một hàm, đúng một dấu hiệu ở mục 2.** Ghi dấu hiệu nào và lý do vào mô tả commit. Không sửa kèm thứ khác (CLAUDE.md "Giữ phạm vi").
2. **Có test chứng minh hành vi trước khi động vào code.**
   - Nếu chưa có: viết characterization test ở đúng tầng. Logic thuần thì unit; route, quyền hoặc race thì e2e.
   - Chạy `pnpm lint && pnpm test && pnpm test:e2e` xanh *trước* khi sửa.
3. **Commit cấu trúc tách khỏi commit hành vi** (Beck, *Tidy First?*). Một commit chỉ inline, xoá hoặc gộp, và **không đổi test**. Nếu test phải đổi thì đó là đổi hành vi, cần tách riêng.
4. **Từng bước nhỏ theo catalog**, mỗi bước chạy lại test:
   - Inline Function / Remove Middle Man → xoá tham số không dùng → Remove Dead Code → Guard Clauses.
   - Với abstraction sai, theo đúng thứ tự Metz: inline vào mọi caller → cắt phần caller không chạy → chỉ tách lại khi thấy phần chung thật sự.
5. **Đẩy lọc vào DB thì kiểm số câu truy vấn**, ví dụ bằng log query của Prisma ở dev. Kiểm thêm `EXPLAIN` nếu bảng lớn (`jobs`, khoảng 3.500 tin). Thay `filter` trong JS bằng `where` phải trả **đúng cùng tập** bản ghi, nên e2e trên DB thật là tầng chứng minh.
6. **Đo trước khi coi là xong**:

   ```bash
   git diff --numstat -- server/src
   git diff --numstat -- server/test
   ```

   - Một lượt rút gọn phải có tổng `server/src` **âm**.
   - Nếu test tăng nhiều hơn code giảm, xem lại có đang kiểm lại cùng một hành vi hai lần không.
7. **Dừng khi tiếp tục chỉ còn đổi gu, không giảm phần tử.** Theo Abramov: "Let clean code guide you. Then let it go."

