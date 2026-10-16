# ADR 0016: Tìm hiểu công ty: luồng cố định, chỉ lưu bản phân tích

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `modules/companies`, Serper, nguồn trích hoặc `confidence`
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Tìm hiểu công ty — thay thao tác tự đi Google, không xây kho review

Người dùng trước đây phải: nộp đơn xong → mở Google → gõ "review công ty X" → mở từng link → tự tổng hợp → đóng tab, mất sạch. `modules/companies/` tự động hoá đúng chuỗi đó.

**Luồng cố định nên code thường điều khiển, không để model điều khiển.** Ở đây code chạy tìm kiếm và tải trang, rồi gọi `generateObject` **đúng một lần** — `ai_calls.purpose = 'company.brief'`. Đường ngược lại (vòng lặp agent tự quyết gọi tool nào) tốn 5–8 lượt gọi model mỗi lần và không có schema đảm bảo; nó từng tồn tại ở `/apply` và đã bị gỡ, xem `server/README.md`.

**Chỉ lưu bản phân tích của mình, không lưu nguyên văn đánh giá của người khác.** Điều khoản ITviec (mục 2.2) cấm sao chép nội dung, và ITviec còn làm mờ thân đánh giá bằng CSS để bắt đăng nhập — lấy phần đó là vượt rào kiểm soát truy cập. `sources` trong `CompanyBrief` dẫn link về bài gốc, và đó là phần thay thế đúng danh sách link Google từng đưa.

**Model khai nguồn bằng SỐ THỨ TỰ, không bằng URL.** Nguồn được đánh số trong prompt; `resolveSources` ánh xạ ngược và bỏ số ngoài khoảng. Cho model tự viết URL là mở đường cho nó bịa ra một đường dẫn trông hợp lý.

**`confidence` do code suy ra** từ số nguồn đọc được và có nguồn nào là trang đánh giá chuyên không (`brief-confidence.ts`) — cùng lý do với `computeOverall`: hỏi model thì nó chấm theo giọng văn của chính nó.

**Khoá hàng đợi là `nameKey`, KHÔNG có `userId`.** Bản tìm hiểu dùng chung cho mọi người, nên hai người mở cùng một tin phải gộp làm một lượt. `companyKeyOf` bỏ loại hình pháp nhân nhưng **giữ tên quốc gia**: "Samsung Vietnam" và "Samsung" là hai nơi làm việc khác nhau. Và cố ý không có `co` đứng một mình trong danh sách — "Công ty Cơ khí Hà Nội" sẽ bị cắt thành "khi ha noi".

**Biến môi trường tìm kiếm là `SERPER_*`, không phải `WEB_SEARCH_*`.** `configuration.ts` từng đọc `WEB_SEARCH_API_KEY` trong khi `.env` và `.env.example` đều khai `SERPER_API_KEY`, nên `searchApiKey` luôn rỗng và `searchUrl` mặc định trỏ sang Tavily trong khi `parseSerper` đọc định dạng Serper — tool `web_search` của agent chưa từng chạy. Sửa 2026-08-24.

#### Bốn điều đã đo được từ lượt chạy thật đầu tiên (2026-08-24)

Chạy trên "Công ty TNHH Smartbooks" — công ty nhỏ, và đó là ca đáng học chứ không phải ca hỏng.

**Trang review CÓ tồn tại không có nghĩa là CÓ review.** `itviec.com/nha-tuyen-dung/<slug>/danh-gia` trả về `Đánh giá chung 0.0` và một lời mời viết đánh giá. Google vẫn xếp nó hạng nhất vì tiêu đề trang khớp truy vấn. Vì vậy verdict `NO_REVIEWS_YET` **tách riêng khỏi** `UNKNOWN`: cái đầu là dữ kiện có ích (công ty nhỏ, bạn có thể là người đầu tiên), cái sau là không tra ra gì.

**Luôn lưu MỌI nguồn đã kiểm, không chỉ nguồn model dùng.** `BriefSource.usedFor` là `null` cho nguồn đã đọc mà không rút ra được gì. Giấu chúng đi thì khi kết luận là "không có đánh giá", thẻ trở thành ngõ cụt và người dùng lại đi Google đúng những chỗ vừa tra — tệ hơn tình trạng ban đầu.

**Nguồn không tải được vẫn có đoạn trích, và đã trả tiền cho Serper rồi.** Bài Facebook *"Có ai đã phỏng vấn ở công ty smartbooks chưa ạ?"* là tín hiệu người-thật DUY NHẤT tồn tại về công ty này, mà tường đăng nhập chặn `fetchPage`. `pickSnippetSources` giữ chúng lại, prompt ghi rõ "chỉ là đoạn trích ngắn" để model không tin quá mức.

**Chọn đoạn theo MẬT ĐỘ từ khoá, không theo thứ tự trang.** Đã thử chặn theo từ khoá (`stripChrome`) trước và **không đủ**: trên trang TopCV nó chỉ cắt 415/9.267 ký tự, vì chuỗi giao diện là một tập vô hạn ("Lưu tin thành công", "Chat Zalo", "Gửi góp ý thành công") không danh sách đen nào phủ hết. Nguyên nhân thật là từ khoá gợi ý quá chung: `đồng nghiệp` nằm ngay trong khẩu hiệu đầu trang TopCV, nên cửa sổ bị kéo về đó và chiếm ngân sách trước khi tới nội dung. `trimToReviewText` nay xếp cửa sổ theo số từ khoá rơi vào rồi mới cắt, và in ra theo thứ tự trang. `stripChrome` vẫn giữ vì rẻ, nhưng nó là phần phụ chứ không phải cơ chế chính.
