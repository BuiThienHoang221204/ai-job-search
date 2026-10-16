# ADR 0002: CV in bằng HTML/Chromium, kho mẫu CV và thiết kế (font, cỡ chữ)

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa đường in CV, `pdf-service`, kho mẫu (`templates/themes.ts`, `typography.ts`) hoặc đổi mẫu
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### CV đi đường HTML, thư xin việc vẫn đi đường LaTeX

**Hai bộ máy sinh PDF, không phải một.** `latex-service/` in `.tex`, `pdf-service/` in HTML bằng Chromium. Chọn bằng `LATEX_SERVICE_URL` và `PDF_SERVICE_URL`, mỗi cái có bản `docker run` dự phòng cho máy phát triển.

Lý do có đường thứ hai: **CV cần xem trước**, mà LaTeX chỉ ra PDF sau vài giây nên không có cách nào cho người dùng thấy mẫu trước khi tải. Bản HTML thì chính nó vừa là bản in vừa là bản nhúng vào iframe, nên xem trước là miễn phí và luôn khớp file tải về. Đây là nền cho kho mẫu CV (chọn mẫu, đổi màu) — thứ TopCV và ITviec đều có.

**Đổi mẫu KHÔNG tốn lượt gọi model.** `Document.content` là nguồn sự thật, mẫu chỉ là hàm trình bày chạy trên nó. `DocumentRenderer.toHtml` sinh lại trong vài mili giây.

Build ảnh trước khi chạy:

```bash
docker build -t aijob-pdf -f pdf-service/Dockerfile pdf-service
```

Đo ngày 2026-08-22, cùng một CV tiếng Việt 1 trang: **aijob-latex 3,27GB / 3,59 giây** so với **aijob-pdf 1,20GB / 0,61–0,70 giây**.

**Đối chiếu hai bản PDF bằng `GET /api/documents/:id/pdf?engine=html`.** Tham số `engine` là tạm thời, có mặt để đặt hai bản cạnh nhau trong lúc chuyển đổi; mặc định vẫn là `latex`. Kết quả đối chiếu trên CV thật: 284 từ (LaTeX) so với 282 (HTML), **không mất mục nào**. Toàn bộ khác biệt là tiêu đề mục viết hoa, và **12 token rác chỉ có ở bản LaTeX**: `MOBILE-ANDROID-ALT`, `🖂`, tám ký tự bullet `🟤`. Đó chính là thứ ATS đọc phải — bản HTML sạch hơn ở đúng chỗ quan trọng nhất.

**`python3-minimal` KHÔNG có thư viện chuẩn.** Đã làm build đỏ: `import json` báo `ModuleNotFoundError: No module named 'json'`, và `http.server` cũng vắng. Phải là `python3`.

**Bước tự kiểm lúc build là bắt buộc, đừng gỡ.** Nó hỏi `fc-list :lang=vi` (có font nào phủ tiếng Việt không) rồi `pdftotext` bản in thử (PDF có tầng chữ không). Cả hai làm build ĐỎ. Đây là bản HTML của bài học `fontawesome6`/`needspace` ở `latex-service`: thiếu font thì CV in ra đầy ô vuông mà **không có lỗi nào báo**, và chỉ lộ ra khi người dùng bấm tải.

**Chromium chạy với mọi tên miền bị chặn phân giải** (`--host-resolver-rules=MAP * ~NOTFOUND`) và `--no-sandbox`. Hai cờ này mất đi thì bản in **vẫn ra bình thường** — không có gì báo — nên có test đơn vị canh chúng trong bản chép ở `SandboxPdfRenderer`. Hệ quả cho người viết mẫu: **template phải tự chứa hoàn toàn**, một `<link>` hay webfont trỏ ra ngoài sẽ âm thầm rơi về font thay thế.

#### Kho mẫu CV

**Sáu mẫu, khác nhau HOÀN TOÀN bằng CSS.** `templates/body.ts` dựng markup dùng chung, `templates/themes.ts` giữ sáu bộ CSS, `templates/registry.ts` là chỗ duy nhất biết `templateId` là chuỗi gì. **Thêm mẫu = thêm một mục trong `themes.ts`**, không sửa controller, service hay migration.

**Font, cỡ chữ, khoảng cách dòng (tab "Thiết kế") nằm trong `templateOptions`** cạnh `accent`, và `typographyCss` (`templates/typography.ts`) nối một khối CSS đè vào sau CSS của mẫu — CHỈ khi người dùng có chọn, nên CV chưa chỉnh gì in ra y như cũ và giá trị mặc định ("Theo mẫu", nấc "Vừa") không được ghi xuống. Cỡ chữ là NẤC (Nhỏ/Vừa/Lớn) nhân trên `fontPt` của mẫu, không phải số tuỳ ý; khoảng cách dòng giới hạn 1.2–1.8. Font chỉ chọn trong danh sách có sẵn trong ảnh `aijob-pdf` (Noto, Liberation) — Chromium chặn font tải ngoài. **Thêm mẫu thì phải khai `fontPt` khớp `font-size` trong CSS của nó** — `typography.spec.ts` đối chiếu từng mẫu, lệch là đỏ.

Dùng chung một bộ markup là để **đổi mẫu không đổi thứ tự chữ mà ATS đọc** — có test đơn vị so tầng chữ của cả sáu mẫu phải giống hệt nhau. Cả sáu đều một cột: đo trên các hệ ATS 2026, một cột parse 100/100 còn hai cột tụt xuống 85/100.

**`Document.templateId` và `templateOptions` là CỘT RIÊNG, không nhét vào `content`.** `content` là output của model đã qua zod, còn mẫu là lựa chọn của người dùng — trộn chung thì mỗi lần sinh lại CV sẽ xoá mất mẫu họ đã chọn.

**Đổi mẫu và xem trước đều KHÔNG gọi model.** `POST :id/preview` kèm `templateId` render thử mà không ghi database (đó là cách kho mẫu bấm thử được; bản `GET` đã gỡ 2026-10-14 vì giao diện không gọi); `PUT :id/template` mới lưu.

**`@Get('cv-templates')` phải đứng TRƯỚC `@Get(':id')`.** Đã hỏng thật: khai sau thì Nest khớp "cv-templates" vào `:id` và trả 404 *"Không tìm thấy tài liệu: cv-templates"*. Typecheck và unit test đều không bắt được vì lỗi nằm ở THỨ TỰ khai báo. Có test e2e ghim.

**Hai lỗi CSS chỉ lộ ra khi dựng ảnh trang giấy, số đo toạ độ chữ vẫn đúng:**

- `position: fixed; left: 0` neo vào mép **vùng nội dung**, không phải mép giấy. Mẫu `thanh-mau` để lề trái 22mm thì dải màu đè lên đầu mỗi dòng — "Kế toán tổng hợp" in ra thành "oán tổng hợp". Bù bằng `left: -22mm` cũng không được: Chromium cắt phần fixed nằm ngoài vùng nội dung. Cách chạy được: lề trái bằng 0, chữ tự thụt vào bằng padding trên **từng khối** (padding của body chỉ có tác dụng ở trang đầu và trang cuối).
- Mẫu `modern` bỏ lề trên cho MỌI trang thì dòng đầu trang 2 dí sát mép giấy. `@page :first { margin-top: 0 }` tách hai chuyện đó ra — Chromium có hỗ trợ, đã đo.
