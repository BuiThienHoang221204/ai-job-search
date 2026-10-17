# ADR 0005: Nguồn tin (SEAM 5): portal CLI, thêm portal, chặn IP, mô tả bị cắt

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa scraper, thêm/bỏ portal, xử lý `BLOCKED`, nhịp quét hoặc mô tả tin
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Nguồn tin: SEAM 5

**Sáu class trong `scraper/services/`, mỗi cái trả lời MỘT câu hỏi khác nhau.** Đọc theo thứ tự này là ra luồng một lượt quét:

| Class | Câu hỏi nó trả lời | Ghi chú |
|---|---|---|
| `ScrapeCronService` | **khi nào** quét | Mỗi đêm xếp một `ScrapeRun` cho từng portal rồi thôi |
| `ScraperProcessor` | — | Nhận `SCRAPE_RUN` khỏi hàng đợi; đây là chỗ lượt quét thật sự chạy |
| `ScraperService` | **điều phối** | Nối bốn cái dưới lại; không tự chạm portal dòng nào |
| `QueryPlanner` | quét **cái gì** | Sinh từ khoá: từ hồ sơ (lượt người dùng) hoặc cụm nghề (lượt cron) |
| `JobSourceRouter` | lấy **ở đâu** | Chọn adapter theo khoá portal — SEAM 5 phía người gọi |
| `PortalCliService` | lấy **bằng cách nào** | Adapter duy nhất: chạy CLI + giữ nhịp chống chặn IP |
| `JobWriter` | **lưu** thế nào | Tách tin mới, lấy mô tả đầy đủ, nhận ra bản sao giữa portal |

`QueryPlanner` và `JobWriter` **không phải provider Nest** — `ScraperService` tự `new` chúng trong constructor. Đó là lý do chúng không xuất hiện trong `scraper.module.ts` và không inject được ở nơi khác.

`ScraperService` KHÔNG biết một nguồn được lấy bằng cách nào — nó hỏi `JobSourceRouter`. Hiện chỉ có một adapter:

- `PortalCliService` — chạy CLI skill trong `.agents/skills/`, phải giữ nhịp chống chặn IP. Bảy portal Việt (ITviec, TopCV, VietnamWorks, CareerLink, Vieclam24h, CareerViet, JobOKO) cùng LinkedIn nằm ở đây; sau đó thêm 123job, TopDev (2026-10-13) và timviec.ai (2026-10-17, mạnh ở việc ngoài IT, đặc điểm API ở `SKILL.md` của nó).

Router giữ nguyên dù chỉ còn một adapter: nó là chỗ cắm nguồn mới mà `ScraperService` không phải biết.

#### Thêm portal — khảo sát 2026-09-29 và hai lỗ hổng nó làm lộ ra

**Thêm portal = thêm một thư mục `.agents/skills/<p>-search/`** (`SKILL.md` + `cli/src/cli.ts` in JSON theo hợp đồng của `scraper/utils/normalize.ts`). Backend, UI, Dockerfile và CI không khai cứng tên portal nào; `POST /api/scrape/portals/reload` nạp portal mới không cần khởi động lại.

| Portal | Trạng thái | Ghi chú |
|---|---|---|
| `careerlink` | **ĐÃ THÊM** | HTML thường, `?keyword=`; JSON-LD `JobPosting` ở trang chi tiết; tên công ty trả NFD; hCaptcha → `delayMs: 10000` |
| `vieclam24h` | **ĐÃ THÊM** | KHÔNG tìm theo từ khoá tự do được: tham số thật `q` bị robots.txt chặn, còn `?keyword=` bị trang BỎ QUA (0/30 tin liên quan — ghi nhầm trong bản khảo sát đầu). Đi qua trang **ngành con** tra từ sitemap (~29.000 trang, đệm đĩa 24h), lùi về ngành cha. `?page=` không đổi nội dung phía server → `page > 1` trả `[]`. `delayMs: 8000` |
| `careerviet` | **ĐÃ THÊM** | Tìm theo từ khoá THẬT `/viec-lam/<slug>-k-vi.html`, trang N `-k-trang-N-vi.html` (50 tin/trang). JSON-LD đặt NGƯỢC chuẩn: `addressRegion` là QUẬN, `addressLocality` mới là tỉnh. Trang ~1,5MB → `delayMs: 8000`. robots.txt chặn GPTBot/ClaudeBot/CCBot |
| `joboko` | **ĐÃ THÊM** | robots.txt chặn `/jobs?*` và `/viec-lam-theo-khoa?*`, không có sitemap → KHÔNG tìm theo từ khoá tự do. Thử trang từ khoá biên tập sẵn `/tim-viec-lam-<cụm>` (tối đa 2 lần, hụt là 404), lùi về 111 trang ngành `?p=N`. Thẻ tin KHÔNG có ngày đăng (ngày trên thẻ là HẠN NỘP) → `postedAt: null`. `delayMs: 8000` |
| `topdev` | **ĐÃ THÊM** 2026-10-13 | Từ khoá THẬT `/jobs/search?keyword=&page=N`, 15 tin/trang; KHÔNG chỉ IT (137 tin "Kế toán") nên không khai `occupations`. Dữ liệu trong payload RSC — kết quả là mảng ngay trước `"meta":{"total"`, vì trang nhúng 25 đối tượng tin cho 15 kết quả. Mô tả giải được từ trang tìm kiếm (tham chiếu `$xx`, độ dài BYTE) nên không tốn request `detail`. JSON-LD chi tiết THIẾU nội dung mô tả và `industry` luôn là "Information Technology" → không dùng làm nhãn. Nhãn lấy từ `job_category_id` (bảng tự dựng bằng đo đạc, chỉ 4 mã rõ nghĩa; mã 14 và 33 gộp nhiều ngành nên bỏ). Cloudflare → `delayMs: 8000` |
| `123job` | **ĐÃ THÊM** 2026-10-13 | Từ khoá THẬT `/tuyen-dung?q=&page=N`, 30 tin/trang, đa ngành; phần lớn tin không có ở portal khác. Thẻ chỉ có mô tả bị cắt → mọi tin mới tốn một `detail`. Mô tả đọc từ HTML (JSON-LD có lúc THIẾU phần yêu cầu). HTML nén bỏ ngoặc thuộc tính (`type=application/ld+json`). `industry` là nhãn thật do nhà tuyển dụng chọn → `categories`. nginx, không Cloudflare; `delayMs: 8000` |
| `jobsgo` | **KHÔNG làm** | Cloudflare bắt giải thử thách JS cho MỌI URL, kể cả `robots.txt`. Giải nó là vượt rào kiểm soát truy cập |

**Trang chặn trả HTTP 200 — CLI phải kiểm NỘI DUNG, không chỉ mã.** Lượt quét CareerLink đầu tiên ở nhịp 3 giây bị hCaptcha sau ~28 trang chi tiết; trang captcha là 200 nên CLI cũ coi là "0 kết quả" và 22/50 tin mới bị bỏ mà lượt quét vẫn báo `DONE`. Nay CLI nhận ra trang chặn thì báo mã **`BLOCKED`** trên stderr.

**Nhưng dò CHỮ thử thách một mình là bẫy ngược chiều.** JobOKO gắn widget `g-recaptcha` vào form "Góp ý"/"Báo cáo tin" trên MỌI trang; CLI đầu tiên dò chữ đó nên báo `BLOCKED` cả trang thật — cầu dao bên dưới sẽ tạm ngừng portal mãi mãi mà không ai hiểu vì sao. Test bắt được trước khi lọt. Quy tắc nay: **trang chặn = có dấu hiệu thử thách VÀ không có nội dung thật** (thẻ tin, JSON-LD `JobPosting`, hay `__NEXT_DATA__`). Portal mới phải có một test đưa trang thật kèm widget reCAPTCHA vào `isBlockedPage` và chờ `false`.

**Cầu dao `BLOCKED` nằm trong `PortalCliService.invoke`** (áp cho MỌI portal): gặp mã đó thì ngừng gọi portal ấy `BLOCKED_COOLDOWN_MS` (30 phút) và ném ngay không chạy CLI. Trước đó `JobWriter` vẫn gọi `detail` cho từng tin còn lại — mỗi lần một request vào đúng trang đang chặn mình, kéo dài lượt chặn. Portal mới nào có trang chặn riêng thì CLI của nó phải báo `BLOCKED`; `test/unit/modules/scraper/portal-blocked.spec.ts` canh cầu dao.

**TopCV: 403 là `BLOCKED` NGAY, không thử lại** (`fetchVerdict` trong `topcv-search/cli/src/helpers.ts`). Hai lượt hỏng 28/09 và 30/09 nhận 403 đủ 5/5 lần trong 30s lùi dần — thử lại chưa cứu được lượt nào, chỉ gửi thêm 4 request đúng lúc đang bị chặn. Trước đó CLI báo `FETCH_FAILED` nên cầu dao không bật. Hồi 08–09/2026 Cloudflare của TopCV chặn THEO ĐỢT (chạy lại vài giờ sau vẫn ra tin), nhưng **từ 2026-09-09 IP máy chủ Oracle bị chặn LIÊN TỤC** — xem đoạn dưới.

**Ba portal chặn THEO IP máy chủ, không phải lỗi code — đo 2026-10-13.** Cùng URL, cùng User-Agent: từ máy cá nhân trả 200 kèm tin, từ máy chủ Oracle (168.107.87.28, Singapore) thì:

| Portal | Từ máy chủ | Lớp chặn | Hỏng từ |
|---|---|---|---|
| `topcv` | 403 | Cloudflare | 2026-09-09, mọi đêm |
| `vieclam24h` | 403, kể cả `robots.txt` | tường lửa AWS (`server: awselb/2.0`) | lượt đầu tiên 2026-09-30 — CHƯA TỪNG chạy được trên production |
| `careerlink` | 200 nhưng là **Cloudflare Turnstile** ở trang tìm kiếm (trang chủ vẫn 200 có tin) | Cloudflare | lượt đầu tiên 2026-09-30 — CHƯA TỪNG chạy được |

**KHÔNG vượt các lớp chặn này** — không proxy dân cư, không đổi IP để né, không giải thử thách, không đi vòng qua trang chưa bị chặn để lấy cùng dữ liệu. Đó là vượt rào kiểm soát truy cập, cùng lý do đã bỏ `jobsgo`. Đường hợp lệ là xin phép/API đối tác — chính là món nợ ToS của pha thương mại hoá. Portal vẫn để BẬT: mỗi đêm chỉ tốn 1 request rồi cầu dao `BLOCKED` ngắt, và hết bị chặn thì tự chạy lại. Máy chủ ARM mới trên Oracle nhiều khả năng bị đối xử y hệt (vẫn là IP datacenter).

**Lỗi im lặng đã sửa cùng đợt:** CareerLink chỉ dò hCaptcha/reCAPTCHA nên coi trang Turnstile là "0 kết quả" — **14 đêm liền `DONE` với `jobsFound: 0`** mà không cảnh báo nào. Nay `isBlockedPage` dò cả `challenges.cloudflare.com/turnstile`, kèm điều kiện "không có thẻ tin, không có JSON-LD" (trang thật KHÔNG nhúng Turnstile, đã kiểm). Vieclam24h thì thử lại 403 bốn lần rồi báo `FETCH_FAILED` nên cầu dao không bật — nay 403 là `BLOCKED` ngay (`errorForStatus`), và `loadSubPages` ném tiếp `BlockedError` thay vì nuốt rồi gọi tiếp vào portal đang chặn. **Một lượt quét `DONE` với 0 tin nhiều đêm liền là dấu hiệu bị chặn, không phải portal hết tin** — kiểm `scrape_runs` theo portal khi thấy vậy.

**Một truy vấn lỗi KHÔNG còn kéo đổ cả lượt quét** (`collectCards`). Trước đó `deps.search` ném thẳng ra ngoài: truy vấn đầu 403 là cả lượt `FAILED` với `jobsFound: 0`, tin đã gom từ truy vấn trước cũng mất. Nay: lỗi thường thì bỏ truy vấn đó, đi tiếp; `BLOCKED` thì dừng mọi truy vấn còn lại nhưng GIỮ tin đã gom; không gom được tin nào thì vẫn ném lỗi đầu tiên để lượt hỏng đúng lý do. `requested` chỉ bật SAU khi request thành công — đóng dấu nghề chưa quét được là đúng lỗi tự nuôi của vòng xoay đã ghi ở mục cụm nghề.

**Nhịp riêng từng portal: `delayMs` trong frontmatter `SKILL.md`** (số nguyên dương, mili giây), thay cho `SCRAPER_PORTAL_DELAY_MS` chung. Khai sai kiểu thì bị bỏ qua và portal chạy nhịp chung. Nâng nhịp khi thấy `BLOCKED` lặp lại, đừng hạ.

**Trần tin riêng từng portal: `maxJobs` trong frontmatter `SKILL.md`**, cùng cách đọc với `delayMs`; vắng thì dùng `SCRAPER_MAX_JOBS_PER_PORTAL`. Thêm 2026-10-16 khi nâng trần chung 50 → 100: đo trên production, mọi lượt quét đêm chạm đúng 50 tin, chia cho 20 truy vấn là 2 tin mỗi nghề mỗi portal, nên số tin của một ngành đi theo số lần nó được hỏi chứ không theo thị trường (IT 1.122 tin, Nông nghiệp 11). ITviec giữ `maxJobs: 50` vì chỉ phục vụ IT/DATA_AI — nâng nó chỉ làm lệch thêm. TopDev KHÔNG giữ 50: trong 138 tin của nó chỉ 17 tin IT. Trần mỗi truy vấn là `floor(trần / số truy vấn)`, nên nâng `SCRAPER_SYSTEM_QUERY_LIMIT` lại chia mỏng tin mỗi nghề — chỉnh hai biến cùng nhau.

**Nhãn ngành của portal đi vào `Job.categories`, KHÔNG vào `tags`** (thêm 2026-10-13). `tags` của VietnamWorks là kỹ năng; trộn hai thứ thì không biết chữ nào là nghề. Nguồn nhãn: VietnamWorks `jobFunction` (nghề con trước, nhóm cha sau — có ngay trong API tìm kiếm, và trong HTML chi tiết thì là tham chiếu lồng `$39` → `children: "$3a"` → `["$3b"]`, giải bằng `resolveFlightRefs`), CareerViet/JobOKO/CareerLink JSON-LD `industry`, ITviec "Job Expertise" (KHÔNG lấy "Job Domain" — đó là lĩnh vực công ty). LinkedIn không có: trang khách chỉ còn "Industries" của CÔNG TY. Nhãn chỉ lấy từ trang đã mở sẵn để đọc mô tả — **không mở trang chi tiết chỉ vì nhãn**.

**Thứ tự xếp ngành: từ khoá CHÍNH trong tiêu đề → nhãn portal → từ khoá DỰ PHÒNG → thẻ.** Nhãn KHÔNG đứng đầu, vì đo trên CareerViet nhà tuyển dụng hay chọn kèm ngành của công ty: "Marketing Officer" ở công ty thẩm mỹ mang nhãn "Y tế / Chăm sóc sức khỏe". Nhãn thắng ở chỗ tiêu đề mơ hồ ("Chuyên viên cao cấp") hoặc chỉ có từ dự phòng ("Kỹ sư quản lý chất lượng" + nhãn "Xây Dựng"). `fallbackKeywords` (`ai`, `it`, `cntt`, `chat luong`, `brand`, `f b`…) là chữ hay chỉ ngành của công ty hơn là nghề — đừng chuyển chúng lên `keywords`. "thương mại điện tử" được đổi thành `ecommerce` trước khi so (`occupationHaystack`): từ khoá `dien tu` của Sản xuất từng khớp ngay bên trong cụm đó, và 8 tin vận hành sàn TMĐT trên production nằm ở Sản xuất. Nhãn đổi sang mã ngành qua `portal-categories.ts` (dựng từ từ vựng THẬT: 30 nhóm/150 nghề VietnamWorks), nhãn lạ thì chạy bộ từ khoá trên chính nhãn; giá trị `null` = nhãn không mang thông tin ngành ("Quản Lý Cấp Cao", "Khác"), xét tiếp nhãn sau. Tin cũ: `node scripts/backfill-portal-categories.mjs` (mặc định chỉ tin `OTHER`, `--all`, `--limit`, `--dry-run`); tin VietnamWorks đã biết còn tự gắn nhãn dần qua `refreshKnownCards` khi lượt quét gặp lại.

**Lương dạng số (`salaryMin/Max`) đang TRỐNG ở mọi portal quét**, không riêng portal nào (đếm 2026-09-29: 0 tin ở cả 5 nguồn) — chỉ có `salaryRaw`. Khoảng trống sẵn có của pipeline, chưa sửa.

**Nhịp chống chặn IP nằm TRỌN trong `PortalCliService.pace()`, đừng thêm `sleep` ở phía người gọi.** Tới 2026-09-23 nó nằm ở hai chỗ: `pace()` giữ 3.000ms giữa hai lần GỌI, còn `collect-cards.ts` và `job-writer.service.ts` mỗi nơi tự `sleep(1.200ms)` sau khi gọi xong. Hai phanh chồng nhau cho khoảng cách thật là `max(3000, T + 1200)` với `T` là thời gian một lượt CLI — tức 1.200ms kia **chỉ có tác dụng khi một lượt chạy quá 1,8 giây**, và muốn đổi nhịp thì phải nhớ hai nơi, một ở `.env` một nằm cứng trong code. Nay `pace()` giữ cả hai ràng buộc (mốc GỌI và mốc XONG, hai `Map` riêng) nên hành vi không đổi mà chỉ còn một chỗ sửa. Quan trọng hơn: `invoke()` là chốt bắt buộc — code mới gọi `portals.search()` vẫn được giữ nhịp dù tác giả không biết gì về nó, còn một `sleep` ở phía người gọi thì quên là mất. `test/unit/modules/scraper/portal-pace.spec.ts` ghim cả hai ràng buộc, vì hỏng chỗ này **không có gì báo** — chỉ là portal bắt đầu chặn IP sau vài đêm.

Từng có adapter thứ hai gọi API job board công khai của Greenhouse/Lever/Ashby (`AtsSourceService`, khai bằng `ATS_BOARDS`). **Đã gỡ 2026-08-27** cùng toàn bộ dữ liệu của hai board từng bật — `ashby:ramp` và `greenhouse:gitlab`. Đừng dựng lại theo trí nhớ: hãy đọc lại commit đó.

Món nợ ToS mà lộ trình ghi ở mục 4 vẫn còn nguyên, và nó RỘNG hơn ghi chú cũ ("thay LinkedIn scraper"). Việc gỡ ATS KHÔNG trả món nợ đó, chỉ bỏ một hướng đã thử.


#### "Thẻ đã có mô tả" KHÔNG có nghĩa là mô tả đầy đủ

API tìm kiếm của VietnamWorks **cắt** `jobDescription` và `jobRequirement` rồi thêm dấu ba chấm. Scraper cũ chỉ gọi `detail` khi thẻ **không** có mô tả, nên bản cụt được lưu thẳng: 16/16 tin VietnamWorks trong database có mô tả trung bình 771 ký tự, trong khi mọi nguồn khác là 2.600–11.000. Bản cụt vẫn dài hơn ngưỡng 80 nên không nhánh nào chặn được, và giao diện hiện đúng cái đã lưu — trông y như lỗi hiển thị.

Nay `services/job-writer.service.ts` gọi `detail` khi mô tả **trống HOẶC kết thúc bằng dấu ba chấm** (`looksTruncated`), và lỗi ở bước đó bị nuốt để tin vẫn được lưu với bản cụt thay vì mất hẳn. Sửa lại dữ liệu cũ bằng `node scripts/backfill-truncated-description.mjs`.

Hai điều riêng của VietnamWorks:

- **Trang chi tiết parse được, trang tìm kiếm thì không.** Trang `/viec-lam` render phía trình duyệt nên HTML rỗng, nhưng trang `/<slug>` nhúng payload RSC trong `self.__next_f`. Trong đó `jobRequirement` nằm thẳng dạng JSON còn `jobDescription` là tham chiếu `"$26"` trỏ sang một đoạn rời — **sửa đúng một dạng thì nửa còn lại vẫn cụt**. Độ dài đoạn rời đếm bằng **byte**, không phải ký tự.
- **Phải khớp phần đầu với bản cắt trước khi nhận một đoạn**, đừng lấy chuỗi dài nhất: trang còn chứa mô tả của các tin gợi ý, và lấy nhầm thì tin này mang mô tả của tin kia mà không có gì báo.

`detail` tìm lại tin bằng từ khoá trong alias, và **tin đăng lâu thì không tìm ra nữa** (6/16 tin ở lần backfill đầu). Nên có đường dự phòng `jobFromDetailHtml` dựng tin thẳng từ HTML; đường này thiếu `tags` vì chúng nằm ở các dòng tham chiếu lồng nhau chưa giải.
