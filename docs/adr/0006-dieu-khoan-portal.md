# ADR 0006: Điều khoản sử dụng của các portal và quyết định giai đoạn đồ án

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Thêm portal mới, hiển thị nội dung tin ra ngoài, hoặc bàn thương mại hoá
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

#### Điều khoản sử dụng của các portal — rà 2026-10-13

**Quyết định của chủ dự án: giữ nguyên cách làm hiện tại trong giai đoạn ĐỒ ÁN (phi thương mại); cân nhắc lại TRƯỚC khi thương mại hoá.** Bảng dưới là để quyết định lúc đó, đừng xoá. Không phải ý kiến pháp lý — trước khi thu tiền người dùng cần luật sư SHTT/công nghệ xem.

Điều khoản cấm theo HAI tầng, và hệ thống hiện chạm cả hai: (1) **lấy** bằng bot, (2) **sao chép / hiển thị / khai thác thương mại / tạo sản phẩm phái sinh**. Trang không nhắc đích danh bot KHÔNG có nghĩa là được phép — tầng 2 vẫn áp dụng, và lưu toàn văn vào database rồi hiển thị lại là tầng 2.

| Portal | Cấm bot / lấy tin | Cấm sao chép, hiển thị, thương mại | Trích nguyên văn |
|---|---|---|---|
| `linkedin` | **Có, đích danh** | Có | User Agreement 8.2: *"use software, devices, scripts, robots… (such as crawlers…) to scrape or copy the Services"*, *"Copy, use, display or distribute any information… obtained from the Services"*. Bên hay kiện (hiQ Labs thua ở phần vi phạm điều khoản) |
| `joboko` | **Có, đích danh** | Có | *"dùng bot/crawler/scrape"*; *"không được sao chép, sửa đổi, phân phối, khai thác thương mại… nếu không có chấp thuận bằng văn bản"* |
| `itviec` | Có (*"retrieved… downloaded"*) | Có | Terms 2.2: *"Other than… reasonable personal use… its content may not be retrieved, displayed, modified, copied… downloaded… without our prior written consent"* |
| `vietnamworks` | — | Có | Cấm *"sao chép… hiển thị… khai thác nhằm mục đích thương mại"*, VÀ cấm riêng việc vận hành dịch vụ tuyển dụng tương tự / *"cung cấp sản phẩm… cạnh tranh với VietnamWorks"*. CLI gọi API nội bộ `ms.vietnamworks.com` |
| `careerviet` | — (robots.txt chặn GPTBot/ClaudeBot/CCBot) | Có | *"Cách dùng nội dung trang web này trên bất cứ trang web nào khác… vì bất cứ mục đích nào đều bị ngăn cấm"* |
| `topcv` | — | Có | *"không được sao chép… chuẩn bị các sản phẩm phái sinh… hiển thị, xuất bản, phân phối… hoặc khai thác Nội dung TopCV"* |
| `careerlink` | — | Có (thương mại) | *"Nghiêm cấm sao chép, sửa đổi, phân phối, khai thác thương mại khi chưa có sự đồng ý bằng văn bản"* |
| `vieclam24h` | — | Không thấy | Điều 6 chỉ nói nội dung người dùng + nhãn hiệu. Chưa đọc được trọn văn (trang chặn WebFetch) |
| `123job` | Có (*"Thu thập, khai thác hoặc sử dụng dữ liệu từ hệ thống trái phép"*) | Có (dữ liệu *"thuộc quyền sở hữu của 123job"*) | Không nhắc đích danh bot; robots.txt chỉ chặn `/ajax`, `/apply`. Thêm 2026-10-13 theo cùng quyết định giai đoạn đồ án |
| `topdev` | — (robots.txt cho phép) | Có | *"không được quyền thay đổi, sao chép, mô phỏng, truyền, phân phối, công bố, tạo ra các sản phẩm phái sinh, hiển thị hoặc chuyển giao, hoặc khai thác nhằm mục đích thương mại"*. Thêm 2026-10-13 theo cùng quyết định giai đoạn đồ án |
| `timviec` (timviec.ai, Công ty CP Fiza trên Zalo) | — (không có `robots.txt`) | Có | Điều khoản ứng viên `Fiza_TC_ver_2.3_0825.pdf` mục 5.2: *"không được sửa chữa, cắt xén, chỉnh sửa, cập nhật, nâng cấp xuất bản, phân phối, truyền đi, phát, bán, cấp phép hoặc khai thác Nội Dung Fiza"*. Gọi API JSON công khai `/api/candidates`. Thêm 2026-10-17 theo cùng quyết định giai đoạn đồ án |

**Đã xét và KHÔNG thêm:** `x-interview.com` (cấm đích danh *"trích xuất… tin tuyển dụng bằng công cụ tự động (crawler, bot, scraping)"*, và là đối thủ trực tiếp — nền tảng tìm việc + luyện phỏng vấn AI), `jobsgo` (Cloudflare). Glints, Việc Làm Tốt, Indeed VN, JobStreet, MyWork, Timviec365 trả 403 cho IP máy chủ. **Muốn thêm portal mới: đọc Điều khoản TRƯỚC khi viết CLI** — robots.txt cho phép không đủ.

**Khi thương mại hoá, các bước giảm rủi ro đã bàn (theo thứ tự):** (1) dừng `linkedin` + `joboko` (cấm bot đích danh; ~40% tin mỗi đêm); (2) User-Agent tên bot thật kèm liên hệ thay vì giả Chrome, hiện "Nguồn: <portal>" trên mỗi tin; (3) trang chi tiết KHÔNG hiển thị toàn văn mô tả — chỉ phần hệ thống rút ra + nút "Đọc tin đầy đủ trên <portal>" (`JobDescriptionCard` hiện ghi *"Nội dung nguyên văn từ tin tuyển dụng gốc"*); (4) xoá toàn văn sau khi rút yêu cầu (tối thiểu hoá dữ liệu — cần đo chất lượng tối ưu CV/phỏng vấn khi chỉ còn `JobRequirement`); (5) nguồn hợp lệ: xin phép portal, nhà tuyển dụng đăng trực tiếp, Sàn giao dịch việc làm quốc gia `vieclam.gov.vn` (từ 01/01/2026, NĐ 318/2025; máy chủ Oracle không kết nối được), API có giấy phép (Jooble, Careerjet `careerjet.com.vn`). (1)–(4) chỉ HẠ rủi ro; chỉ (5) đưa nó về không. Nút "Ứng tuyển" dẫn về tin gốc (đang làm) là lập luận tốt nhất hiện có, nhưng không xử lý được việc lấy bằng bot và lưu bản sao.

**Giải entity HTML TRƯỚC khi bỏ thẻ, và `&amp;` giải CUỐI.** Làm sai thứ tự thì `&lt;p&gt;` thành `<p>` rồi bị xoá mất cả chữ bên trong, hoặc `&amp;lt;` bị giải hai lần thành thẻ. Bài học này nay sống ở `common/web/html-text.ts`.
