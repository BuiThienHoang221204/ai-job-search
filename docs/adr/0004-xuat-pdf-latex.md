# ADR 0004: Xuất PDF bằng LaTeX: dịch vụ riêng, thư xin việc dùng moderncv

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `latex-service`, `LatexCompiler`, template `.tex` hoặc thư xin việc
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Xuất PDF (Pha 3) — ba điều đã trả giá để biết

**Hai đường, chọn bằng `LATEX_SERVICE_URL`.** Có giá trị → `HttpLatexCompiler` gọi dịch vụ riêng (production). Bỏ trống → `SandboxLatexCompiler` gọi `docker run` qua SEAM 2 (máy phát triển, app chạy trực tiếp trên host). App ghi ra log lúc khởi động nó đang dùng đường nào.

**Production KHÔNG dùng được đường Docker**, và lý do thứ hai mới là lý do quyết định:

1. App trong container không có socket Docker; mount vào là cho app quyền tương đương root trên host.
2. Kể cả mount socket thì `-v <thư mục tạm>:/work` **vẫn vỡ** — daemon nằm trên host nên nó giải đường dẫn đó trên filesystem của host, nơi thư mục tạm bên trong container app không tồn tại. Container LaTeX khởi động với `/work` rỗng và ta nhận về một lỗi LaTeX vô nghĩa.

Dịch vụ ở `latex-service/`: Python stdlib trong image TeX Live, nhận `.tex` qua POST, trả PDF. Chạy bằng `docker compose up -d latex` sau khi build. Đo được **nhanh hơn** `docker run`: 2,0–3,1 giây so với 5,1 giây, vì không khởi container mỗi lần.

Máy chủ cần ảnh **`aijob-latex` build sẵn** cho cả hai đường (`DockerSandbox` đặt `--pull never`, nên thiếu ảnh là một lỗi nói rõ chứ không phải một lượt tải vài GB giữa request của người dùng):

```bash
docker build -t aijob-latex -f latex-service/Dockerfile latex-service
```

**Ảnh nền là `texlive/texlive:latest-medium`, KHÔNG phải `latest`.** Đo trên Docker Hub 2026-08-21: bản đầy đủ 2,70GB nén / 8,92GB trên ổ, bản medium 0,94GB nén / khoảng 2,5-3GB trên ổ. Bản đầy đủ mang theo mọi ngôn ngữ, ConTeXt và toàn bộ kho font mà hai template của dự án không chạm tới. Lý do đầy đủ nằm trong `latex-service/Dockerfile`.

Mất PDF thì người dùng vẫn chấm điểm, xem việc, soạn CV và ứng tuyển được — nên không probe sức khoẻ nào được phụ thuộc vào dịch vụ LaTeX/PDF (`/ready` từng kiểm chúng nhưng không tính vào `ready`; route đó đã gỡ 2026-10-14).

**Giá trị header HTTP phải là ISO-8859-1.** Dịch vụ gửi các dòng `Missing character` (chứa chữ tiếng Việt) qua header nên phải **base64**. Gửi thẳng thì `fetch` của Node từ chối cả phản hồi và app báo "không nối được tới dịch vụ" — một lỗi sai hoàn toàn hướng.

**1. Exit code 0 KHÔNG có nghĩa là compile thành công.** `-interaction=nonstopmode` khiến lualatex bỏ qua nhiều lỗi rồi vẫn thoát 0 dù PDF thiếu. Điều kiện thành công là **có file PDF khác rỗng**. Chiều ngược lại cũng đúng: nó có thể thoát khác 0 vì một cảnh báo mà PDF vẫn dùng được.

**2. `Missing character` trong log là cách chữ bị âm thầm mất khỏi PDF**, và với tiếng Việt đó là rủi ro chính. `LatexCompiler` gom chúng thành `warnings` và service ghi log — đừng bỏ đi. Trên bản đo thật: 0 ký tự thiếu với moderncv + TeX Gyre Pagella.

**3. Route trả file KHÔNG được trả `Buffer` trực tiếp.** Nest đem Buffer qua bộ serialize JSON, cho ra `{"type":"Buffer","data":[...]}` với HTTP 200 và content-type đúng — một file hỏng trông y như file tốt. Dùng `StreamableFile`.

Đừng bỏ macro liên hệ rỗng vào template LaTeX: `\phone[mobile]{}` vẫn vẽ icon và tên icon lọt vào lớp text mà ATS đọc. Xem `contactMacro` trong `latex.ts`.

**Thư xin việc KHÔNG dùng `cover.cls` của bản fork nữa, và lý do là tiếng Việt.**

Font Lato/Raleway đi kèm `cover_letters/` thiếu **21 mã ký tự riêng của tiếng Việt** (`ạ` U+1EA1, `ơ` U+01A1, `ư` U+01B0, `ế`, `ệ`, `ậ`…). Bản fork viết cho tiếng Đan Mạch, nơi Lato phủ `æøå` thừa sức. Hậu quả đo được trên bản compile thật: chữ Việt **biến mất khỏi trang giấy**, không chỉ khỏi lớp text — "ứng tuyển" ra thành "ng tuyn", "quản trị hệ thống" thành "qun tr h thng". PDF vẫn ra 1 trang, exit code vẫn 0, và chỉ nhìn ảnh trang giấy mới thấy.

Nay cả hai template đều dùng **`moderncv` + lualatex**: 0 glyph thiếu, lớp text đọc lại sạch, và thư xin việc trông cùng một bộ với CV. Việc đổi này xoá luôn engine thứ hai, 1,7MB font nhúng, một script bọc, và một ngoại lệ trong `.dockerignore`.

Muốn dựng lại `cover.cls` (ví dụ sau khi đổi font của nó sang font có tiếng Việt) thì cần đủ bốn thứ: COPY `cover_letters/cover.cls` + `OpenFonts/` vào image, bỏ `cover_letters` khỏi `.dockerignore`, symlink hai tài sản đó vào thư mục làm việc mỗi request (đường dẫn font trong `cover.cls` là **tương đối**), và cho app khai engine `xelatex` — `cover.cls` nạp `xltxtra`/`xunicode`, chỉ chạy trên XeTeX.

Ngày tháng trong thư dùng chuỗi tiếng Việt tự dựng, KHÔNG dùng `\today`: `\today` theo ngôn ngữ document class, và moderncv mặc định tiếng Anh — đã thấy dòng "August 13, 2026" trong một thư tiếng Việt.
