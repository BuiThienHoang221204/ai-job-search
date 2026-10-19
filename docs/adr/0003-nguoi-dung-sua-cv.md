# ADR 0003: Người dùng sửa CV: content/layout tách cột, sửa thẳng trên trang, iframe sandbox

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `PUT /documents/:id/cv`, `POST :id/preview`, chế độ `editing`, phần đầu CV, tên mục, hoặc khung xem trước iframe
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

#### Người dùng sửa CV

**`content` giữ chữ, `layout` giữ bố cục, và hai thứ đó là hai cột riêng.** `Document.layout` là `{ order: string[], hidden: string[] }` chứa khoá mục (`profile`, `competencies`, `experience`, `education`, `skills`). `resolveLayout` kiểm lại lúc đọc và **nối khoá còn thiếu vào cuối**, nên thêm mục thứ sáu ở bản sau không làm CV cũ mất mục.

**Mục ẩn KHÔNG được vẽ rồi giấu bằng `display: none`.** ATS đọc tầng chữ chứ không đọc CSS, nên giấu bằng CSS vẫn để nội dung lọt vào bản máy đọc. `buildCvSections` không vẽ mục ẩn ra ngay từ đầu; có test đơn vị ghim.

**Dòng RỖNG là trạng thái hợp lệ, đừng đặt `min(1)` cho chức danh hay bằng cấp.** Bấm "Thêm kinh nghiệm" sinh ra `{ position: '', company: '', ... }` và bản xem trước gọi ngay sau đó — đặt sàn thì vừa bấm Thêm là preview đứng im kèm 400 *"Too small: expected string to have >=1 characters"*, người dùng phải gõ xong mới thấy lại CV. Dòng rỗng được **lưu** (để quay lại còn thấy) nhưng **không được vẽ**: `cvContent` trong `document-renderer.service.ts` lọc chúng đi, và lọc ở đó vì cả đường HTML lẫn LaTeX đều đi qua hàm này.

**`cvEditSchema` tách khỏi `cvSchema`, và đừng gộp lại.** `cvSchema` ép MODEL viết đủ (tối thiểu 3 năng lực, mỗi kinh nghiệm ít nhất 1 gạch đầu dòng); `cvEditSchema` cho NGƯỜI DÙNG xoá tới rỗng. Dùng chung một schema thì thao tác xoá dòng cuối cùng bị từ chối mà người dùng không hiểu vì sao. Trần độ dài thì giữ nguyên ở cả hai — chữ này đi thẳng vào PDF và database.

*(Hết hiệu lực 2026-10-19: không còn file `.tex`; PDF in thẳng từ `content` qua HTML nên luôn khớp chữ đang lưu.)* **Sửa `content` xong PHẢI render lại `.tex`.** Không thì file đã lưu thành cũ, trong khi nút "Xem mã .tex" và đường PDF LaTeX vẫn đọc đúng file đó — người dùng thấy chữ cũ trong bản tải về dù màn hình đã hiện chữ mới. `updateCv` gọi `renderer.render()`; không tốn lượt gọi model nào.

**Sinh lại KHÔNG bao giờ đè lên bản đã sửa.** `POST /documents/cv` tạo một `Document` MỚI mỗi lần bấm, nên công sửa tay nằm nguyên ở bản cũ. Đừng "tối ưu" thành cập nhật tại chỗ.

`POST :id/preview` xem trước bản nháp CHƯA lưu — đây là thứ cho phép vừa gõ vừa thấy kết quả mà không ghi database sau mỗi phím. Nó khai `@HttpCode(200)` vì mặc định 201 của Nest sai nghĩa: route này không tạo ra gì.

**Lỗi zod phải đổi thành 400.** Để `parse` ném thẳng thì Nest trả 500 — một lỗi nhập liệu bình thường bị báo như sự cố máy chủ, và giao diện không có gì hiện cho người dùng sửa. Xem `parseCvEdit`.

#### Sửa thẳng trên trang CV — bỏ form từ 2026-10-14

Người dùng gõ thẳng lên trang CV trong khung xem trước; form "Sửa nội dung" ở cột phải đã bỏ. Trên điện thoại trang CV chỉ để xem (`max-md:pointer-events-none`), vì gõ trên trang A4 thu nhỏ trong iframe không dùng nổi.

**Iframe VẪN không bật `allow-scripts`.** Mọi xử lý chạy từ trang cha (`hooks/use-cv-inline-edit.ts` phía FE): bật `contenteditable="plaintext-only"` lên từng ô, nghe `input`/`keydown` trên document của iframe, ghi chữ vào bản nháp theo địa chỉ ô. Làm được nhờ `allow-same-origin` — xem mục dưới. Đừng mở `allow-scripts` để làm WYSIWYG: đó là tháo đúng lớp chặn XSS.

**Địa chỉ ô chỉ có ở chế độ sửa.** `POST :id/preview` nhận `editing: true` thì `buildCvSections` gắn `data-field="experiences.0.bullets.2"` (đúng đường dẫn trong `cvEditSchema`), `data-entry` cho từng mục, `data-placeholder` cho chữ gợi ý, và vẽ cả ô/mục/phần còn trống. Bản in (PDF, `GET :id/preview`) KHÔNG bao giờ bật cờ này — đã so từng byte HTML bản in trước và sau khi thêm chế độ sửa, và `test/unit/modules/documents/cv-editing.spec.ts` canh rằng bản in không mang `data-field`.

**Ở chế độ sửa, nội dung KHÔNG đi qua bộ lọc dòng rỗng `cvContent`.** Lọc thì một kinh nghiệm trống ở giữa biến mất và mọi chỉ số sau nó lệch khỏi bản nháp — gõ vào ô này lại ghi sang mục khác, không có gì báo.

**Phần đầu CV (tên, chức danh, liên hệ) sửa riêng cho TỪNG CV**, lưu ở cột `Document.identity` — KHÔNG ghi ngược về hồ sơ hay email đăng nhập. `mergeIdentity` gộp nó lên tài khoản/hồ sơ tại đúng một chỗ, `generator.context`, nên mọi đường in (HTML, LaTeX, xem trước) dùng chung. Khoá vắng mặt = theo hồ sơ (kể cả khi hồ sơ đổi sau này); chuỗi rỗng = CỐ Ý ẩn dòng đó, đừng "sửa" thành lùi về hồ sơ. `PUT /cv` không gửi `identity` thì giữ nguyên phần đầu đã sửa.

**Tên mục riêng nằm trong `layout.titles`**, không trong `content`: nó là lựa chọn trình bày như thứ tự mục. Tên rỗng bị `resolveLayout` bỏ để mục quay về nhãn theo ngôn ngữ (không ẩn tiêu đề — mục không tiêu đề thì ATS khó nhận). Tên quá `SECTION_TITLE_MAX` ký tự nhận 400 ở `PUT /cv`. Đường LaTeX vốn bỏ qua `layout` (cả thứ tự lẫn mục ẩn), nên tên riêng cũng chỉ có ở đường HTML — đường mà nút Tải PDF dùng. Phía FE, tên mục KHÔNG nằm trong khoá của `useCvPreview` — có thì mỗi phím gõ vào tiêu đề dựng lại trang và mất con trỏ.

**FE bỏ dòng trống của mọi danh sách chữ trước mỗi lần gửi lên** (`withoutEmptyLines`, `lib/cv-fields.ts`): phần tử của `bullets`/`coreCompetencies`/`items`/`tools` có `.min(1)`, gửi dòng rỗng là 400. `Enter` thêm dòng và `Backspace` xoá dòng sửa thẳng DOM rồi đánh lại chỉ số (`renumberLines`), không dựng lại trang.

**Gõ chữ KHÔNG dựng lại trang.** Dựng lại iframe làm mất con trỏ, nên `useCvPreview` chỉ hỏi lại máy chủ khi cấu trúc đổi (`previewRev` — thêm/xoá mục, thêm từ khoá), hoặc bố cục/mẫu/màu đổi; chữ đang gõ vốn đã nằm trên trang.

**`escapeHtml` là ranh giới an toàn, gắt hơn `escapeLatex` một bậc.** Bản HTML không chỉ đi vào PDF mà còn được nhúng vào iframe trong phiên đăng nhập của người dùng, trong khi nội dung do model sinh từ mô tả công việc người lạ đăng lên. Route `/preview` gửi kèm `Content-Security-Policy: sandbox` làm lớp chặn thứ hai.

#### Bấm vào bản xem trước — vì sao `allow-same-origin` được bật còn `allow-scripts` thì không

`CvPreview` khai `sandbox="allow-same-origin"`. Đây là một nới lỏng CÓ CHỦ Ý so với `sandbox=""` trước đây, và ranh giới thật sự vẫn nguyên vì hai cờ này làm hai việc khác nhau:

| Cờ | Cho phép | Trạng thái |
|---|---|---|
| `allow-scripts` | script BÊN TRONG iframe chạy được | **TẮT** — đây mới là lớp chặn XSS |
| `allow-same-origin` | trang CHA đọc được DOM của iframe | BẬT |

Không có `allow-scripts` thì `<script>` và `onerror=` trong nội dung do model sinh đều chết cứng. `allow-same-origin` chỉ cho code của chính app đọc và sửa DOM từ bên ngoài — thứ cần để bật chế độ sửa tại chỗ, đặt thanh công cụ của mục và cuộn tới đúng mục.

**Bật CẢ HAI cùng lúc mới là tổ hợp nguy hiểm**: lúc đó trang bên trong tự gỡ được sandbox của chính nó. Đừng thêm `allow-scripts` vào đây.

Chốt chặn thứ hai nằm trong `templates/html.ts`: tài liệu tự mang `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`, nên kể cả có ai thêm `allow-scripts` ở bản sau thì script vẫn không chạy. Có test đơn vị ghim cả hai điều này.

**Mỗi mục mang `data-section="<khoá>"`** (`templates/body.ts`). Rê chuột hay đặt con trỏ trong trang thì `closest('[data-section]')` cho ra mục để hiện thanh công cụ; bấm một việc ở tab "Hoàn thiện" thì `offsetTop` của mục đó nhân với `scale` cho ra chỗ phải cuộn tới. Mục bị ẩn không được vẽ nên cũng không có mỏ neo — đúng với quy tắc "mục ẩn không lọt vào tầng chữ".

**KHÔNG cần backend tính toạ độ.** Đã từng định đi hướng đó và nó sai: server không hề dàn trang, chiều cao một mục phụ thuộc font và ngắt dòng nên chỉ trình duyệt dựng xong mới biết. Ai muốn "đồng bộ bản xem trước" thì dùng `data-section`, đừng thêm API trả vị trí.

**Hai cái bẫy đã sập khi nối trang cha với iframe, cả hai đều IM LẶNG — không lỗi, không log, tính năng chỉ đơn giản là không chạy:**

1. **`instanceof` không đi qua được ranh giới realm.** `event.target` của một click trong iframe là phần tử thuộc `window` CỦA IFRAME, nên `target instanceof Element` so với `Element` của trang cha và luôn trả `false`. Bản đầu của `CvPreview` có đúng phép kiểm đó và cả tính năng chết câm. Dò theo hình dạng (`typeof node.closest === 'function'`) mới đi xuyên được. Cùng lý do này áp cho mọi `instanceof` khác nếu sau này có code chạm vào DOM của iframe.

2. **Đếm số lần nạp, đừng dùng cờ boolean.** `srcDoc` đổi sau mỗi lần gõ phím (qua debounce), và mỗi lần đổi là một DOCUMENT MỚI — listener gắn vào document cũ đi theo nó vào sọt rác. Với `const [ready, setReady] = useState(false)` thì `setReady(true)` lần thứ hai là no-op nên effect không chạy lại, và từ lần xem trước thứ hai trở đi bấm vào bản CV không còn ăn. `CvPreview` đếm `loads` và mọi effect phụ thuộc vào con số đó.

Cả hai lỗi đều lọt qua typecheck, lint, unit test và build. `test/visual/cv-editor.spec.ts` canh chỗ này: các spec gõ thẳng lên trang và `Enter` thêm dòng sẽ đỏ nếu listener không gắn được vào document mới của iframe.
