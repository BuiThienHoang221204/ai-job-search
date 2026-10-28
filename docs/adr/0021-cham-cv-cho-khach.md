# ADR 0021: Chấm CV cho khách — route công khai được gọi model khi có trần

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa `modules/cv-check`, bảng `usage_counters`, mở thêm một route công khai có gọi model, hoặc đổi `CV_CHECK_AI_*`
- **Ngày:** 2026-10-27

## Bối cảnh

Khách chưa đăng nhập do dự đăng ký vì chưa thấy lợi ích. Tính năng "Roast My CV" gốc muốn AI chấm CV cho khách. Ba vướng mắc:

1. `CLAUDE.md` cấm route gọi model mở công khai — chống lạm dụng, gateway free cạn sau khoảng 30 lượt.
2. Model chấm điểm không ổn định: cùng một CV chấm hai lần ra hai số (cùng lý do với `computeOverall`), mà điểm sẽ nằm trên thẻ chia sẻ.
3. Chấm hoàn toàn bằng code thì tách dòng sai với CV hai cột, tiêu đề mục lạ.

Ngày 2026-10-27: 24 giờ trước đó có 5.611 lượt gọi model, chỉ 509 lượt thành công; gateway free đã hết lượt trong ngày.

## Quyết định

**AI tách và nhận xét, code chấm.** Một lượt model trả danh sách mục, các gạch đầu dòng chép NGUYÊN VĂN và phần nhận xét toàn CV — schema không có trường điểm. Code giữ lại dòng có thật trong chữ của CV (`keepVerbatim`, so sau khi gộp khoảng trắng) rồi đếm số liệu, động từ, độ dài trên đó (`scoreCv`). Model "viết thêm" một dòng có số liệu thì dòng đó bị bỏ, không làm đẹp điểm.

**Ngoại lệ cho quy tắc route công khai:** `POST /api/cv-check` là route `@Public()` duy nhất được gọi model, vì có đủ hai trần:

- mỗi khách 4 lượt AI/ngày (`CV_CHECK_AI_PER_GUEST_PER_DAY`), khách nhận ra bằng HMAC-SHA256 của IP với `GUEST_KEY_SECRET` (rỗng thì dùng `JWT_SECRET`) — không lưu IP gốc;
- toàn bộ khách 50 lượt/ngày (`CV_CHECK_AI_PER_DAY`).

Ngày tính theo giờ Việt Nam. Hết lượt hoặc model lỗi thì vẫn trả điểm, do code tự tách dòng theo ký hiệu đầu dòng (`segmentByLayout`); lỗi model trả lại lượt đã giữ.

**Đếm bằng bảng `usage_counters (scope, key, day, count)`, không đếm trên `ai_calls`.** Giữ lượt bằng một câu:

```sql
INSERT … ON CONFLICT (scope, key, day) DO UPDATE SET count = count + 1
WHERE usage_counters.count < $trần RETURNING count
```

Không dòng nào trả về = hết lượt. Đã cân nhắc và bỏ:

- **Đếm `ai_calls`:** `userId` là khoá ngoại tới `users` nên không chứa được HMAC; quan trọng hơn, log chỉ được ghi SAU khi model trả lời (10–30 giây), nên 10 request song song cùng đếm ra 0 và cùng lọt.
- **`@Throttle` trong RAM:** đếm riêng mỗi instance, mất khi deploy.

**Thứ tự giữ lượt:** trần tổng trước, trần của khách sau (hết thì trả lại lượt tổng). Nhờ vậy khi trần tổng đã hết, request không tạo thêm dòng nào: số dòng mỗi ngày ≤ trần tổng + 1, không phụ thuộc lượng truy cập hay số IP kẻ spam xoay vòng.

**File không rời trình duyệt.** pdf.js đọc chữ (tối đa 10 trang) ở trình duyệt, chỉ chữ (≤ 40.000 ký tự) được gửi lên. Máy chủ không lưu chữ; lượt model của khách ghi `ai_calls` với `redactResponse` nên không lưu `responseText`.

**Nhận xét toàn CV (sửa 2026-10-27).** Ban đầu model chỉ viết 3 nhận xét ngắn bằng bể fast. Người dùng muốn nhận xét kỹ từng mục theo quy tắc ATS, nên cùng lượt gọi đó giờ trả thêm `summary`, `targetRole`, `level`, `review` (từng mục CV: ok/fix/missing, mỗi lỗi có câu trích và câu viết mẫu) và `ats` (5 điểm cố định: thứ tự chữ đọc ra, tên mục, ngày tháng, chức danh, chính tả). Vẫn MỘT lượt cho mỗi lần phân tích, nên trần lượt không đổi. Đổi kèm:

- Vẫn chạy bể fast, timeout mỗi model 60 giây, trần token đầu ra 6.000 (`CV_CHECK_MAX_OUTPUT_TOKENS`, truyền qua `maxOutputTokens` của `AiService`). Không đặt trần thì nhà cung cấp tự cắt ở 2.048–3.072 token; từ khi có thêm điểm mạnh/cần cải thiện và câu hỏi phỏng vấn, câu trả lời dài 2.700–3.800 token nên JSON bị cắt cụt, cả chuỗi lần lượt hỏng và một request mất 114 giây (đo 2026-10-27). Prompt kèm ngày hôm nay vì model tưởng mốc năm 2026 trong CV là ở tương lai. Đã thử chuỗi model mặc định cho "model mạnh" và bỏ: trên máy dev nó thử lần lượt 161 model free (hết lượt, sai token) và mất 213 giây mới tới một model trả lời, trong khi bể fast chọn sẵn model còn hạn mức và trả lời trong 3–6 giây. Proxy `/api` của Next (`next.config.ts`) mặc định ngắt sau khoảng 30 giây, nên đã đặt `experimental.proxyTimeout` bằng 5 phút cho khớp `server.setTimeout`.
- Cùng lượt gọi đó tách thêm các trường máy lọc đọc ra (`name`, `jobs`, `education`, `skills`) cho thẻ "ATS đọc ra gì" *(2026-10-28)*: câu trả lời dài thêm vài trăm token, vẫn dưới trần 6.000. Mọi trường chỉ giữ khi có nguyên văn trong CV; email, số điện thoại đọc bằng regex của code. Bố cục nhiều cột thì FE đo từ toạ độ chữ của pdf.js thay vì hỏi model.
- Chống bịa bằng code (`verifyReview`): ý nào có câu trích không có thật trong chữ CV thì bỏ cả ý; câu viết mẫu chỉ được giữ số có trong đoạn trích, số khác thành `[__]` (`holeUnknownNumbers`, dùng chung với Gợi ý viết lại ở `common/text/number-holes.ts`).
- Không có ô dán tin tuyển dụng: người dùng chọn chỉ phân tích CV, nên không so từ khoá với tin. Không có "một chuẩn ATS" chung; nhận xét bám các lỗi mà hầu hết ATS cùng vấp.

## Hệ quả

- Thêm route công khai gọi model khác thì phải có đủ hai trần như trên và ghi vào ADR này hoặc ADR mới.
- Trần 50/ngày dùng chung bể model với người đăng nhập; mở rộng thì cần model trả phí hoặc key riêng cho khách — bảng đếm không phải nút thắt.
- Không có cron dọn `usage_counters`: ≤ 51 dòng/ngày ở trần hiện tại. Làm khi trần tổng tăng lên hàng nghìn.
- Giới hạn theo IP chặn được người dùng bình thường bấm nhiều, không chặn được kẻ đổi IP — trần tổng là lớp giữ ngân sách. Lượng truy cập lớn thì thêm Cloudflare Turnstile/rate limit ở CDN.
- Test ghim: `test/cv-check.e2e-spec.ts` (song song chỉ một request lọt khi còn một lượt; hết trần tổng không tạo dòng khách; AI lỗi trả lại lượt), `test/unit/modules/cv-check/cv-score.spec.ts`.
