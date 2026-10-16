# ADR 0007: Quét tin đa ngành: từ khoá theo ngành, gộp lô job.requirements, cụm nghề, việc làm phù hợp

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `QueryPlanner`, `job.requirements`, cụm nghề, `occupationGate` hoặc trang "Việc làm phù hợp"
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Quét tin — đây là trợ lý tìm việc ĐA NGÀNH

Không có chỗ nào trong đề tài giới hạn phạm vi ở ngành CNTT. Việc hệ thống từng chỉ mang về tin IT là hệ quả tình cờ của việc người dùng thử đầu tiên là dân IT, và nó đã được sửa ngày 2026-08-15. Đừng "sửa" ngược lại.

**Ngôn ngữ từ khoá đi theo ngành, và đây là chỗ dễ làm hỏng nhất.** Chức danh IT/kỹ thuật ở Việt Nam đăng bằng tiếng Anh (`frontend developer`); mọi ngành còn lại đăng bằng tiếng Việt có dấu (`kế toán tổng hợp`, `nhân viên kinh doanh`). Chọn sai ngôn ngữ **không** trả về tin sai — nó trả về **không gì cả**, một triệu chứng trông y hệt portal hỏng. Quy tắc này nằm ở hai nơi và phải giữ khớp nhau: `SEARCH_PLAN_SYSTEM` trong `planning/search-plan.prompt.ts` và `.describe()` của trường `query` trong `planning/search-plan.schema.ts`. Mô tả zod đi thẳng vào JSON schema gửi cho model, nên nó là mệnh lệnh sống chứ không phải chú thích.

**Truy vấn xếp theo CHỨC DANH trước, kỹ năng sau** (`query-plan.ts`). Với hồ sơ IT thì kỹ năng cũng là tên tin tuyển dụng nên xếp kiểu nào cũng chạy; với mọi ngành khác thì không — kỹ năng chính của một kế toán là `Excel`, `Misa`, `giao tiếp`. Lĩnh vực mục tiêu được **ghép** với chức danh, không bao giờ đứng một mình: `Ngân hàng` trả về mọi vị trí trong ngành từ giao dịch viên tới bảo vệ.

**Không có từ khoá mặc định nào.** Hồ sơ trống thì lần quét FAILED kèm lời nhắc đi điền hồ sơ, và **không gọi model**. Trước đây chỗ này lùi về `'developer'` và gọi đó là "quét rộng" — `developer` không rộng, nó là một nghề. Đừng thêm lại một giá trị mặc định: không có từ khoá trung lập nào tồn tại, `việc làm` trả về vài chục nghìn tin ngẫu nhiên.

#### `job.requirements` gộp LÔ 5 tin — khoản chi lớn nhất hệ thống

Đo trên `ai_calls` ngày 2026-08-28: **`job.requirements` chiếm 633/1.311 lượt gọi model của cả hệ thống — 48%**, và một đêm cao điểm (26/08) đã chạm **261 lượt**. Nó là khoản chi lớn nhất, lớn hơn cả `match.evaluate` (271) lẫn `skill.canonicalize` (248) cộng lại thì gần bằng.

Nó tốn nhiều vì **nhân tuyến tính 1:1 với số tin MỚI và không có phanh nào**: đầu vào từ crawl là `savedJobIds`, toàn tin chưa có bản ghi nên nhánh `sourceHash` không bao giờ ăn. Khác hẳn `skill.canonicalize` — cửa lọc "đã có trong danh bạ chưa" khiến nó tự tắt dần khi danh bạ bão hoà.

Nay `scraper.service` xếp hàng theo **lô 5 tin** (`REQUIREMENTS_BATCH`) và `extractMany` hỏi model **một lượt cho cả lô**: một đêm 200 tin đi từ 200 lượt xuống **40**.

**Ba đường lùi, và cả ba đều bắt buộc — gộp lô không được phép tệ hơn không gộp:**

1. **Tin dài hơn 6.000 ký tự đi đường lẻ.** Đo trên 563 tin: p50 2.556, p95 5.993, dài nhất 20.265. Mức này giữ ~95% số tin ở đường gộp mà không để một tin khổng lồ thổi phồng prompt.
2. **Lô hỏng thì rút lại từng tin.** `job.requirements` vốn đã đứng đầu bảng lỗi SCHEMA, gộp lô làm bán kính thiệt hại rộng ra 5 lần — nên `catch` phải chạy lại đường lẻ, không được để cả lô mất trắng.
3. **Lô thiếu phần tử thì riêng tin đó rút lẻ.** Model bỏ sót một tin trong lô là chuyện có thật; ánh xạ theo `index` phát hiện được và chỉ tin đó phải trả giá.

**Khoá dedup của hàng đợi nay là VÂN TAY của cả lô** (sha256 của danh sách id đã sắp xếp, cắt 32 ký tự) — nối chuỗi năm cuid sẽ dài hơn cột `singleton_key` của pg-boss. Hai lô khác nhau chứa chung một tin thì không dedup được, và đó là chấp nhận được: `extractMany` so `sourceHash` trước khi gọi model nên tin đã rút xong chỉ tốn một lượt đọc database.

**`matching.controller` vẫn dùng `extract()` đường lẻ** — rút lại một tin theo yêu cầu người dùng thì không có lô nào để gộp.

**Tin rác đắt gấp N lần bạn tưởng.** `planFanOut` chấm mỗi tin mới với MỌI người dùng đủ điều kiện, nên một tin lạc ngành tốn `số người dùng` lượt gọi model chứ không phải một. Đó là lý do độ chính xác của truy vấn quan trọng hơn số lượng truy vấn.

**Lượt quét đêm có ba trần, đừng chỉnh một cái mà quên hai cái kia:** `SCRAPER_MAX_JOBS_PER_PORTAL` (50 tin/portal, gom qua nhiều trang), `SCRAPER_MAX_AGE_DAYS` (7 ngày, lọc **trước** `detail` chứ không phải sau) và `SCRAPER_MAX_PAGES`. Nâng trần tin mà quên cửa sổ ngày thì database đầy tin đã đóng; lọc ngày sau khi gọi `detail` thì đã trả tiền đúng phần đắt nhất rồi.

**Bản sao giữa các portal được LƯU kèm `duplicateOfId`, không bị bỏ qua.** Bỏ qua thì tập "đã biết" (theo `source` + `externalId`) đêm sau lại tưởng là tin mới và lại tốn một request `detail` — mỗi đêm một lần, mãi mãi. Và `dedupeKey` **không được** đặt `@@unique`: hai tin khác nhau đụng khoá thì `upsert` ghi đè mất một tin. Chi tiết ở `server/README.md`, mục "Chống trùng".

**ITviec chỉ có IT — sửa 2026-09-30, không còn "cố ý gọi cho mọi người" nữa.** SKILL.md của một portal có thể khai `occupations: [IT, DATA_AI]` (mã NHÓM ngành, không phải mã nghề con); trường vắng mặt = phục vụ mọi ngành, giữ nguyên hành vi cũ cho các portal khác. `PortalCliService.evaluateCandidate` đọc nó vào `PortalEntry.occupations`.

Hai chỗ dùng nó, và cả hai đều LỌC TRƯỚC khi xoay vòng/gọi model, không lọc sau:

- **Lượt hệ thống** (`QueryPlanner.forSystem(portal, occupations)`): lọc `clusters` (cả hồ sơ thật lẫn sàn phủ taxonomy) theo `occupationGroupOf(clusterCode)` **trước** khi sắp theo `crawledAt`. Lọc SAU xoay vòng sẽ để nghề portal không phục vụ chiếm suất mãi mãi — nó không bao giờ được `markCrawled` nên `crawledAt` luôn là 0, luôn thắng tie-break "cũ nhất trước", và đè luôn nghề portal thật sự phục vụ ra khỏi `systemQueryLimit` slot sau đêm đầu tiên.
- **Lượt người dùng** (`ScraperService.run`): so `Profile.occupationCode` với `occupations` của portal **trước khi gọi `forUser`** — khớp cổng `occupationGate` đã có ở đường đọc: hồ sơ chưa rõ ngành (`occupationCode: null`) thì không bị chặn, vì không có căn cứ để biết "ngành của họ". Không khớp thì trả `DONE` ngay với `jobsFound: 0` và `error` giải thích rõ, **không gọi portal, không tốn lượt AI tinh chỉnh truy vấn** — đây chính là "0 tin vì portal không phục vụ ngành này" tách khỏi "0 tin vì hỏng" mà đoạn trước còn nợ.

`occupationGroupOf` (`query-plan.ts`) suy nhóm cha từ `SUB_OCCUPATION_PARENT`; mã đã là mã nhóm (nhánh lùi) thì trả về chính nó.

**`systemQueries()` tự khuếch đại thiên lệch của tập hồ sơ hiện có** — DB toàn IT thì cron mang về tin IT thì người ngành khác bỏ đi thì DB vẫn toàn IT. **Sửa 2026-09-30**: `QueryPlanner.forSystem` nay gộp thêm `taxonomyBaseline()` (`query-plan.ts`) — một cụm `size: 0` cho MỌI nghề trong `SUB_OCCUPATIONS` chưa có hồ sơ nào, đi thẳng vào cơ chế xoay vòng `crawledAt` đã có sẵn nên không cần ngân sách riêng; cụm có hồ sơ thật luôn thắng khi tie-break. Chưa chạy đêm nào trên production tính tới lúc viết dòng này — vòng phủ đầu cần khoảng bốn đêm (77 nghề / `SCRAPER_SYSTEM_QUERY_LIMIT` 20 lúc đó) để chạm hết, nên đừng kỳ vọng số liệu đổi ngay lập tức.

**Audit từ khoá taxonomy 2026-09-30 — hai bẫy đã sập trước khi `taxonomyBaseline()` kịp chạy đêm nào.** Rà toàn bộ `SUB_OCCUPATIONS` (đúng thứ mà nghi ngờ đầu tiên hay đổ cho "chưa có hồ sơ" thay vì kiểm từ khoá trước):

- **Tên nghề gộp hai khái niệm bằng `"/"` không được cắt lấy NỬA ĐẦU vô điều kiện.** `HR_CB` khai `name: "C&B / Nhân sự tổng hợp"` — nửa đầu `"C&B"` là biệt ngữ lương-thưởng, không phải cụm từ ai đăng tin tuyển dụng bằng nó. `pickNamePart` (`query-plan.ts`) nay ưu tiên nửa có DẤU tiếng Việt trước (đúng convention "ngành ngoài IT phải tiếng Việt có dấu"), hai nửa cùng có/không có dấu thì lấy nửa DÀI hơn. **Cố ý KHÔNG lấy nửa dài hơn vô điều kiện** — thử nghiệm lộ ra `MKT_CONTENT` (`"Nội dung / Copywriting"`) sẽ lật từ `"Nội dung"` sang `"Copywriting"` nếu chỉ so độ dài, đúng cái bẫy sai-ngôn-ngữ-theo-ngành đã ghi ở trên.
- **Nhóm tiếng Anh (IT/DATA_AI) không tự động nghĩa là `keywords[0]` là tiếng Anh.** `IT_EMBEDDED` khai `keywords: ['nhung', 'embedded', ...]` — `'nhung'` là `"nhúng"` bỏ dấu, không tiếng Anh cũng không tiếng Việt có dấu, nên trước khi sửa nó trả về 0 kết quả y hệt triệu chứng "portal hỏng". Đã đổi thứ tự để `'embedded'` đứng đầu; thứ tự không ảnh hưởng `resolveSubOccupation` (dùng `.some()`, không quan tâm vị trí).

`test/unit/modules/scraper/query-plan.spec.ts` ghim cả ba ca (`HR_CB`, `MKT_CONTENT` không bị lật ngôn ngữ, `IT_EMBEDDED`). Không tìm thấy vấn đề tương tự ở các nhóm còn lại trong ảnh chụp gốc (`HOSPITALITY`, `AGRICULTURE`, `MANUAL`, `RETAIL`, `DATA_AI`) — từ khoá của chúng đã đúng convention từ trước, 0 tin ở các nhóm đó thuần tuý là hệ quả của bug "chưa có hồ sơ" mà P0 vừa sửa.

**`GET /admin/scrape/occupation-coverage` đã gỡ 2026-10-14** — giao diện admin chưa từng gọi nó. Muốn dựng lại (đếm tin theo ngành, tách "chưa tới lượt quét" khỏi "quét rồi vẫn 0 tin") thì đọc lại commit gỡ.

#### Lượt quét hệ thống gom cụm theo NGHỀ, không theo nhóm ngành

`clusterProfiles` gom hồ sơ theo `subOccupationCode` (**danh mục 77 nghề**), lùi về `occupationCode` khi không suy ra được nghề cụ thể. Đây là cùng một bài học đã có ở `Job.subOccupationCode`: **tầng nhóm một mình không thu hẹp được** — đo 2026-08-24, riêng `IT` ôm 235/386 tin. Bên lọc đã sửa từ hồi đó, bên quét thì tới 2026-08-28 mới sửa.

Gom theo 19 nhóm thì cả `IT_QA`, `IT_DEVOPS` và `IT_SECURITY` chung một từ khoá duy nhất (`mostCommon` của headline trong cụm), và hai nghề thua cuộc **không bao giờ được quét**. Đó là chỗ 100 hồ sơ bị nén xuống 19 truy vấn, chứ không phải ở số IP hay nơi chạy code.

**Trần độ phủ là TAXONOMY, không phải số người dùng.** `SCRAPER_SYSTEM_QUERY_LIMIT` (nay **30**, chốt 2026-10-16 khi phát hiện `configuration.ts`, `.env.example` và vế dự phòng trong service mang ba số khác nhau) quyết định chu kỳ phủ: 77 nghề / 30 mỗi đêm ≈ **ba đêm** cho một vòng, xoay theo thứ tự cũ-trước của `OccupationCrawl.lastCrawledAt`. Muốn phủ nhanh hơn thì nâng biến đó, đừng đi tăng số nguồn quét.

**Hạn ngạch trong `collectCards` làm tròn XUỐNG, và đó là một sửa lỗi chứ không phải sở thích.** `quota * số truy vấn` phải **≤** `SCRAPER_MAX_JOBS_PER_PORTAL`, nếu không lượt đầu đầy trần trước khi duyệt hết truy vấn và những truy vấn cuối bảng không gửi đi một request nào. Đo trên chính hàm đó:

| Truy vấn | Trần tin | quota | Thật sự gọi |
|---|---|---|---|
| 10 | 50 | 5 | 10/10 |
| 20 | 50 | **làm tròn LÊN → 3** | **17/20** |
| 20 | 50 | làm tròn xuống → 2 | 20/20 |
| 60 | 50 | 1 | 50/60 |

**Và `markCrawled` chỉ đóng dấu nghề THẬT SỰ được gọi** — `collectCards` trả về `askedIndices` cho đúng việc này. Đóng dấu một nghề chưa gọi là lỗi **tự nuôi**: nghề đó nhận mốc thời gian mới nhất, tụt xuống cuối hàng xoay vòng, rồi vòng sau lại rơi đúng vào chỗ bị cắt. Vì tie-break là `size DESC` nên nạn nhân luôn là **cụm nhỏ nhất** — tức người dùng ngành ngách, đúng nhóm mà đề tài đa ngành muốn phục vụ. Không phải ngẫu nhiên mà có hệ thống.

Ở 1.000 người dùng, số cụm vẫn ≤96 và **chi phí model không đổi** (nó tính theo số TIN, không theo số người). Thứ xấu đi theo quy mô là **độ đại diện của `mostCommon`**: cụm càng đông thì một chức danh đại diện càng ít người. Đó là giới hạn cố hữu của "một truy vấn cho một cụm", và cách gỡ là top-N chức danh mỗi cụm theo cỡ cụm — chưa làm.

**Không có migration nào.** Mã nghề tính trong bộ nhớ từ `headline` + `primarySkills` lúc lập kế hoạch, nên `Profile` không cần cột mới. Cột `occupation_crawls.occupation_code` giữ nguyên tên nhưng **nay chứa mã nghề** (`FIN_ACCOUNTING`), hoặc mã nhóm khi cụm rơi vào nhánh lùi. Bản ghi cũ mang mã nhóm không phải rác: chúng vẫn khớp đúng những cụm đi nhánh lùi.

`.claude/skills/job-scraper/search-queries.md` **được nạp vào `skill.references` nhưng không prompt nào đọc** — `refineQueries` tự dựng prompt riêng. Sửa file đó chỉ đổi hành vi runtime Claude Code, không đổi gì ở backend. Chỉ các file của `job-application-assistant` mới thật sự được nhồi vào prompt.

#### "Việc làm phù hợp" — lọc theo NGÀNH + KINH NGHIỆM, không theo % khớp kỹ năng

**Từ 2026-10-08, `scored=1` hiện MỌI tin đúng nhóm ngành của hồ sơ, cấp bậc lệch tối đa một bậc** (`occupationGate` trong `jobs/utils/occupation-gate.ts`, thang ở `jobs/taxonomy/seniority.ts`). Trước đó trang chỉ hiện tin khớp kỹ năng ≥ `MATCH_MIN_PERCENT`: đo trên production, hồ sơ Thiết kế UI/UX thấy **0 tin** dù kho có 28 tin Thiết kế, vì kỹ năng ghi trong hồ sơ không khớp chữ trong tin. % khớp kỹ năng nay chỉ còn hiện trên thẻ, không quyết định tin có xuất hiện hay không.

- **Đúng MỘT nhóm ngành** — không `OTHER`, không tin chưa phân loại, không nhóm liền kề (cặp `IT ↔ DATA_AI` đã gỡ cùng `nearbyOccupations`).
- **Cấp bậc ±1** so với `JobRequirement.seniority`. Cấp bậc của hồ sơ là `Profile.experienceLevel` nếu người dùng đã chọn, chưa chọn thì **suy từ số năm kinh nghiệm trong CV** (`profileFit` → `seniorityFromYears`, cùng mốc với bước chọn nhanh). Không suy được số năm thì không lọc cấp bậc. Tin chưa rút yêu cầu hoặc `seniority = UNKNOWN` (~33% kho) vẫn qua — lọc chúng là mất một phần ba số tin.
- **Hồ sơ chưa có ngành (hoặc `OTHER`) không thấy tin nào**: API trả `needsOccupation: true`, giao diện nhắc đi chọn ngành. Ngành được **tự suy khi lưu hồ sơ** (`profileOccupation` trong `ProfileService`), nên người đã tải CV lên không bị hỏi. Bước chọn ngành + kinh nghiệm (`quick-start-onboarding.tsx`) chỉ hiện ở trang Tổng quan khi hệ thống CHƯA biết ngành — tức tài khoản mới chưa có CV — và không có nút "Bỏ qua". Đừng hiện nó khi chỉ thiếu `experienceLevel`: đã làm vậy một lần và mọi người đã tải CV đều bị hỏi lại, vì CV không bao giờ điền trường đó.
- Phát suất chấm AI (`AiShortlistService.topRows`) áp cùng điều kiện ngành (đúng một nhóm) nhưng **không** lọc cấp bậc — cố ý giữ SQL đơn giản.

Bảng `job_requirement_matches` vẫn còn nguyên giá trị: nó cho "Khớp x/y" trên thẻ và chọn suất cho AI. Tới 2026-09-28 một hồ sơ Full Stack thấy tin giáo viên tiếng Anh ở 100% và tin sale ở 67%: bước rút yêu cầu trả **0 kỹ năng** cho tin đó, chỉ còn `minYears=1`, và dòng YEARS khớp một mình thành "1/1". Không kỹ năng nào của hồ sơ khớp.

- **Tin không có dòng kỹ năng nào (SKILL/NICE) thì `score = rank = 0`**, và **chỉ lưu cặp khi `skillMet ≥ 1`** — `met` gộp cả YEARS nên đừng dùng nó làm cửa lưu. YEARS vẫn góp điểm, chỉ không tự mình làm nên "phù hợp". Đổi công thức nhớ bump `FORMULA_VERSION` (nay `v3`) rồi gọi `POST /admin/skills/rematch`; lượt đầu xoá 2.741 → 2.288 cặp.
- **Cổng KHÔNG có lối thoát** (chốt 2026-09-29): muốn xem ngành khác thì sang "Tất cả việc làm". Bộ lọc ngành trên thanh lọc **giao** với cổng chứ không thay nó — hồ sơ IT chọn "Tài chính" ở trang này ra rỗng. `anyOccupation` nhận 400 vì `forbidNonWhitelisted`. `test/jobs-filter.e2e-spec.ts` và `test/ai-shortlist.e2e-spec.ts` canh cổng.
- **"Việc làm phù hợp" LUÔN xếp theo ngày ĐĂNG mới nhất** (`listOrderFor` → `posted`: `postedAt DESC NULLS LAST`, rồi `scrapedAt`, `id`), và `sort` gửi lên bị BỎ QUA chứ không 400 để link cũ còn mở được; UI ẩn ô "Sắp xếp" ở trang này. Lý do: "Mới nhất" (`newest`) xếp theo `scrapedAt` — ngày QUÉT — trong khi thẻ tin hiện ngày ĐĂNG, nên danh sách trông lộn xộn (12 → 10 → 11 → 6 ngày). `posted` không index được, nhưng tập "phù hợp" chỉ vài trăm tin mỗi người. `newest` của "Tất cả việc làm" vẫn là `scrapedAt`.
- **Bản rút 0 kỹ năng là FAILED, không phải DONE** (`hasSkills` trong `ai/utils/requirements.ts`). Đo 2026-09-28: 29 tin DONE mà `requiredSkills` rỗng, dồn vào EDUCATION (9/54) và HEALTHCARE (4/30), phần lớn từ `auto/fast` và `mimo-v2.5-free`. Trong lô thì tin rỗng rút lẻ lại một lần (như tin bị lô bỏ sót); đường lẻ vẫn rỗng thì FAILED. Chỉ có kỹ năng ưu tiên vẫn là hợp lệ.
- **"Khớp x/y" trên thẻ tin chỉ đếm kỹ năng** (`systemMatch.skillMet/skillTotal`); `percent` thì vẫn tính cả số năm. Hiện "1/1" cho một tin mà cái khớp duy nhất là số năm chính là lỗi đã khiến người dùng tin tin giáo viên hợp với họ.
