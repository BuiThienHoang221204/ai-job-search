# ADR 0020: Đối chiếu yêu cầu: nhóm lựa chọn, rút đủ yêu cầu, kỹ năng kéo theo

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** sửa prompt hoặc schema `job.requirements`, `skillGroups`, `findSkill`/`matchRequirements`, `skill.implies`, `CanonicalSkill.implies`, hoặc muốn dùng vector để quyết định kỹ năng "đạt"
- **Ngày:** 2026-10-26

## Bối cảnh

"Đối chiếu yêu cầu" là nền của điểm phù hợp, "Việc làm phù hợp", gợi ý kỹ năng thiếu và chọn tin cho AI chấm. Người dùng thấy chip sai: hồ sơ có React mà JavaScript, HTML, CSS bị tính thiếu.

Đo trên 35 tin thật của DB dev (2 tin mỗi ngành) với nhãn chuẩn viết tay: mỗi nhóm yêu cầu bắt buộc/ưu tiên, nhóm nào là "một trong các". Rút lại qua `POST /matches/requirements/:jobId?force=true` rồi chấm bằng script so chữ đã bỏ dấu. Bộ đo đã gỡ khỏi repo sau khi chốt prompt (2026-10-26); nội dung tin không bao giờ được commit vì điều khoản portal (ADR 0006). Muốn đo lại thì dựng bộ mới theo cách trên. Số đo:

| | Bản cũ | Prompt mới (gemini-3.1-flash-lite) |
|---|---|---|
| Phủ nhóm yêu cầu bắt buộc | 68% (106/156) | 94% (146/156) |
| Chứng chỉ bắt buộc | 2/5 | 5/5 |
| Đúng mức bắt buộc/ưu tiên | 98% | 99% |
| "A hoặc B" bị tách thành nhiều mục bắt buộc | 9 | 5 |
| Mục không có trong nhãn | 13 | 61 |

Nguyên nhân bản cũ: trần "tối đa 8 kỹ năng" và câu "thà ghi 4 kỹ năng đúng" (652/2.909 tin = 22% có đúng 8 mục bắt buộc), schema phẳng không biểu diễn được "A hoặc B", prompt cấm chứng chỉ, model bỏ kỹ năng nghề ngoài IT (giao tiếp, đàm phán). Xếp mức chưa bao giờ là vấn đề. Lô gộp từng chép kỹ năng tin này sang tin khác (Kỹ sư nông nghiệp nhận kỹ năng của Bác sĩ thú y cùng lô) — đo được 1 ca/2.909, chấp nhận, không thêm cơ chế.

Lần siết prompt đầu đẩy phủ lên 96% nhưng thừa 82 mục (làm việc nhóm, phương tiện cá nhân, đầu việc "giám sát", ngành học); siết thêm còn 61 thừa, phủ 94%. Phần thừa còn lại phần lớn là chỗ nhãn chặt ("Giao tiếp" khi JD có ghi, "TOEIC 930+" thay vì "Tiếng Anh"). Siết tiếp thì phủ bắt đầu tụt.

Bước so chữ cũ xét HAI chiều chứa nhau, nên hồ sơ "SQL" đạt yêu cầu "SQL Server", "React" đạt "React Native", "Kế toán" đạt "Kế toán thuế".

## Quyết định

1. **Schema rút yêu cầu là danh sách nhóm** `{ options[] }`, tối đa 25 nhóm × 6 lựa chọn; chuỗi trơn từ model được coi là nhóm một lựa chọn. Lưu `JobRequirement.skillGroups = { required, preferred }`; cột phẳng `requiredSkills`/`niceToHaveSkills` vẫn ghi (trải mọi lựa chọn) cho thống kê thị trường, danh bạ, upskill. Tin rút trước 2026-10-26 KHÔNG rút lại (chủ dự án chốt): `skillGroups = null` thì mỗi kỹ năng phẳng là một nhóm, kết quả y như cũ. Chỉ lượt quét từ đêm sau mới theo cách mới.
2. **Đối chiếu một chiều:** chữ kỹ năng hồ sơ chứa chữ yêu cầu ("AWS Lambda" đạt "AWS"), cùng kỹ năng chuẩn, hoặc kỹ năng chuẩn của hồ sơ có yêu cầu trong `implies`. Nhóm đạt khi một lựa chọn bất kỳ đạt. `FORMULA_VERSION` lên `v4`.
3. **Kỹ năng kéo theo (`skill.implies`)**: hỏi model theo từng kỹ năng chuẩn CÓ TRONG HỒ SƠ (primary + secondary, không gồm `headline`), lô 30, mỗi kỹ năng một lần cho cả hệ thống: "người có kỹ năng này chắc chắn đáp ứng thêm gì". Lưu khoá `foldTerm` vào `CanonicalSkill.implies`, tra qua danh bạ lúc `lookup()`. Chạy sau `ingest` khi ghi hồ sơ và cuối lượt quét toàn kho (`POST /matches/dictionary/rebuild`). Đường đọc chỉ tra bảng.

## Vì sao không dùng vector để quyết định "đạt"

Đo cosine bằng chính embedding của danh bạ (2026-10-26): Kế toán–Kiểm toán 0,941, Java–JavaScript 0,935 cao hơn Kế toán tổng hợp–Kế toán 0,929, React–JavaScript 0,918; Điều dưỡng–Y tá chỉ 0,773; Excel–Tin học văn phòng 0,801. Không ngưỡng nào tách được cặp đúng khỏi cặp sai, và cosine không có chiều.

Đã cân nhắc "vector đề cử cặp (kỹ năng hồ sơ → yêu cầu chưa đạt), model kiểm từng cặp". Đo trên 11 hồ sơ dev × 2.909 tin: ngưỡng 0,80 ra 19.147 cặp (~640 lượt), 0,85 ra 2.509 cặp; lấy một kỹ năng gần nhất mỗi yêu cầu ngưỡng 0,88 còn 436 cặp nhưng đa số là rác ("chăm sóc khách hàng → điều dưỡng" 0,882, "kế toán tổng hợp → nhân sự tổng hợp" 0,909), còn Excel → Tin học văn phòng (0,80) bị loại. Hỏi theo kỹ năng hồ sơ: dev có 111 cách viết kỹ năng hồ sơ, ~4 lượt, chỉ tăng khi có kỹ năng hồ sơ mới. Vector vẫn giữ việc đề cử ứng viên "cùng một kỹ năng" khi xây danh bạ.

## Hệ quả

- Model free sai được: lần chạy đầu trên dev trả "NestJS → Angular", "Docker → Linux, Shell", "backend engineering" (từ `headline`) → "Java, Python". Đã bỏ `headline` khỏi câu hỏi và đưa các ví dụ đó vào prompt. Admin chưa xem/gỡ được `implies` — rủi ro R11 trong `docs/business-flows/modules/matching.md`.
- Tên kỹ năng model trả mà danh bạ chưa có được `ingest` ngay sau khi hỏi; tên vẫn chưa tra được thì bị bỏ khi đối chiếu.
- Không suy bắc cầu (Next.js → React → JavaScript): prompt yêu cầu model liệt kê thẳng.
- Gợi ý "Còn thiếu" gom theo nhãn dòng kiểm tra, nên nhóm "Kafka / RabbitMQ" thành một mục thiếu riêng.
- Test ghim: `requirement-match.spec.ts` (nhóm lựa chọn, kéo theo có chiều, "SQL" không đạt "SQL Server"), `job-requirements.service.spec.ts` (ghi cột phẳng + `skillGroups`), `skill-dictionary.service.spec.ts` (`inferImplications`).
