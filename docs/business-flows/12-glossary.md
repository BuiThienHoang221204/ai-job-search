# 12 — Thuật ngữ

> **Phạm vi:** thuật ngữ nghiệp vụ, kỹ thuật, nhãn giao diện và giá trị enum xuất hiện trong code và trong bộ tài liệu này.
> **Nguyên tắc:** tài liệu mô tả hệ thống **as-is**. Code là nguồn sự thật duy nhất. Nhãn UI lấy từ hai frontend; khi nhãn khác giữa các màn, ghi nhãn phổ biến nhất.

## 1. Thuật ngữ nghiệp vụ

| Thuật ngữ | Nghĩa | Module |
|---|---|---|
| Careelot | Tên thương hiệu của app người dùng (`ui-ai-job-search`) | — |
| Hồ sơ ứng viên | Bảng `profiles`: danh tính, kỹ năng, kinh nghiệm, định hướng, lương. Thay cho các placeholder `[YOUR_*]` trong khung prompt | [profile](./modules/profile.md) |
| Chọn nhanh (Quick start) | Bước bắt buộc chọn **ngành**, **nghề**, **cấp bậc** khi hồ sơ chưa có ngành | [profile](./modules/profile.md) |
| Mức hoàn thiện hồ sơ | `completion`, % của 13 trường; \< 30 thì không được đối chiếu/chấm tự động | [profile](./modules/profile.md) |
| Ngành / Nhóm ngành | `occupationCode` (19 nhóm, vd `IT`) — suy từ chức danh + kỹ năng hoặc chọn nhanh | [jobs](./modules/jobs.md) |
| Nghề | `subOccupationCode` (vd `IT_BACKEND`); `<NHÓM>_OTHER` là "Khác" | [jobs](./modules/jobs.md) |
| Cấp bậc | `JobSeniority` | [jobs](./modules/jobs.md) |
| Đọc CV / Agent 1 | Nộp PDF → model đề xuất bản nháp hồ sơ → người dùng duyệt rồi áp dụng. "AI đề xuất, người dùng chốt" | [cv-import](./modules/cv-import.md) |
| Bản nháp hồ sơ / Đề xuất / Bằng chứng | `ProfileDraft` / `proposal` / `evidence` (đoạn text trích từ CV) | [cv-import](./modules/cv-import.md) |
| Lượt quét | `ScrapeRun`: một lần quét một portal; lượt hệ thống (cron) có `userId = null` | [job-scraping](./modules/job-scraping.md) |
| Cụm nghề | Nhóm từ khoá quét chung cho mọi hồ sơ cùng nghề, để số truy vấn không tăng theo số người | [job-scraping](./modules/job-scraping.md) |
| Bản sao tin | Tin cùng công ty + chức danh + tỉnh trên portal khác; `duplicateOfId` trỏ về bản gốc, bị ẩn khỏi danh sách | [jobs](./modules/jobs.md) |
| Yêu cầu tin | `JobRequirement`: kỹ năng bắt buộc/ưu tiên, số năm, cấp bậc, quốc tịch, giấy phép, địa điểm — rút **một lần** mỗi tin bằng model | [matching](./modules/matching.md) |
| Danh bạ kỹ năng | `CanonicalSkill` + `SkillAlias`: mọi cách viết của một kỹ năng trỏ về một kỹ năng chuẩn | [matching](./modules/matching.md) |
| Đối chiếu / Khớp x/y | `JobRequirementMatch`: so hồ sơ với yêu cầu tin **bằng code**; `met/total`, `percent`, `rank` | [matching](./modules/matching.md) |
| Việc làm phù hợp | `GET /api/jobs?scored=1`: tin cùng ngành, cấp bậc ±1, có đối chiếu | [jobs](./modules/jobs.md) |
| Chấm điểm AI / Điểm AI Match | `JobMatch`: model chấm 4 chiều + Eligibility Gate; điểm tổng do code tính | [matching](./modules/matching.md) |
| Eligibility Gate | Bộ lọc cứng về quốc tịch/giấy phép lao động chạy trước chấm điểm; `FAIL` → điểm 0 | [matching](./modules/matching.md) |
| Phát suất chấm AI (shortlist) | Tự xếp chấm AI cho top-N tin mỗi hồ sơ (mặc định tắt, `MATCH_AI_AUTO`) | [matching](./modules/matching.md) |
| Đơn ứng tuyển | `Application` (một mỗi người–tin), màn "Lịch sử ứng tuyển" | [applications](./modules/applications.md) |
| Tối ưu CV / Thư xin việc / Mail ứng tuyển | `Document` kind `CV` / `COVER_LETTER` / `APPLICATION_EMAIL` | [documents](./modules/documents.md) |
| JD dán tay | Mô tả công việc người dùng dán (kèm công ty, vị trí) thay cho tin trong kho; không tạo `Job` | [documents](./modules/documents.md) |
| CV tổng quát | CV không gắn tin nào | [documents](./modules/documents.md) |
| Mẫu CV / Thiết kế / Bố cục / Phần đầu CV | `templateId` / `templateOptions` / `layout` / `identity` của `Document` | [documents](./modules/documents.md) |
| Bộ đề / Chuẩn bị phỏng vấn | `InterviewPrep`: câu STAR, câu khó, câu nên hỏi lại, ý chính, điểm yếu dễ bị đào | [interview-prep](./modules/interview-prep.md) |
| Tự trả lời / Mức sẵn sàng | `InterviewAnswer`; `practiced/total` | [interview-prep](./modules/interview-prep.md) |
| Ngân hàng câu hỏi | `InterviewQuestion` — kho câu hỏi tĩnh, đáp án sinh lười và cache | [question-bank](./modules/question-bank.md) |
| Phỏng vấn thử / Buổi luyện / Lượt | `AgentRun` (workflow `interview`) / `AgentStep` | [mock-interview](./modules/mock-interview.md) |
| Lộ trình học | `/learning`: kỹ năng nên học (tính bằng code) + kế hoạch tối đa 3 kỹ năng đang học | [upskill](./modules/upskill.md) |
| Báo cáo upskill | `UpskillReport`: phân tích khoảng trống bằng model (2 lượt gọi) | [upskill](./modules/upskill.md) |
| Tìm hiểu công ty / Review công ty | `CompanyBrief` dùng chung cho mọi tin của một công ty, hạn 60 ngày | [company-research](./modules/company-research.md) |
| Tra cứu lương / Khung lương đàm phán | `SalaryReference` / `salaryGuide` (`floor`, `target`, `ceiling`) | [salary](./modules/salary.md) |
| Tổng quan | `/dashboard`: điểm hôm nay, việc đang chờ, chuỗi ngày, mục tiêu tuần | [dashboard](./modules/dashboard.md) |
| Nhặt việc rơi | Reconcile: xử lý việc `PENDING`/`RUNNING` kẹt quá 10 phút | [platform-operations](./modules/platform-operations.md) |

## 2. Thuật ngữ kỹ thuật

| Thuật ngữ | Nghĩa |
|---|---|
| Đường đọc / đường ghi | Đọc: chỉ SQL, không gọi model. Ghi: tạo bản ghi + xếp việc nền gọi model |
| Giành chỗ có điều kiện (claim) | `updateMany` kèm điều kiện trạng thái; `count = 0` nghĩa là người khác đã giành |
| `singletonKey` / khoá chặn trùng | Khoá pg-boss; policy `exclusive` cho phép tối đa một việc chưa xong mỗi khoá |
| Stream NDJSON | Phản hồi `application/x-ndjson`, mỗi dòng một sự kiện `partial`/`done`/`error`; nhịp tim 10 s |
| `promptHash` / `sourceHash` | Vân tay đầu vào prompt; trùng thì không gọi lại model |
| `failureKind` | Loại lỗi model: SCHEMA/TIMEOUT/UPSTREAM/OTHER — thứ duy nhất của lỗi đi ra API |
| Lõi model (provider) / mắt xích / chuỗi dự phòng | Một gateway OpenAI-compatible / một model trong chuỗi / `ModelChain` thử lần lượt |
| Bể main / bể fast | Danh sách model cho việc nền / cho tác vụ người dùng đang chờ |
| Cầu dao (circuit breaker) | Cách ly một model 15 phút sau 2 lỗi liên tiếp |
| Probe | Lời gọi thử `{ok, echo}` để kiểm model còn chạy |
| Khung prompt / skill | File `.claude/skills/**/*.md` nạp lúc chạy làm khung prompt |
| Seam | Ranh giới thay thế được bằng bản giả trong test (`Ai`, `Queue`, `Storage`…) |
| `APP_ROLE` | Vai tiến trình: `api` / `worker` / `all` |
| `STUCK_AFTER_MS` | 10 phút — ngưỡng coi việc là kẹt |
| `AI_CHAIN_BUDGET_MS` | 240 s — trần thời gian cả chuỗi dự phòng |
| Portal CLI | Chương trình Bun trong `.agents/skills/<portal>-search/cli` gọi portal tuyển dụng |
| `BLOCKED` | Portal trả trang chống bot → cầu dao portal 30 phút |
| Embedding | Vector 768 chiều (multilingual-e5-base) để tìm kỹ năng gần nghĩa |
| Fan-out | Xếp chấm điểm cho nhiều người sau lượt quét (`SCRAPER_AUTO_SCORE`, mặc định tắt) |

## 3. Đối chiếu tên UI ↔ backend

| Nhãn UI (FE) | Backend |
|---|---|
| "Tất cả việc làm" | `GET /api/jobs` |
| "Việc làm phù hợp" | `GET /api/jobs?scored=1` |
| "Khớp x/y" | `JobRequirementMatch.met/total` (`systemMatch`) |
| "Điểm AI Match" (tuỳ chọn sắp xếp) | `sort=match` — thực chất xếp theo `JobRequirementMatch.rank`, **không** phải điểm AI ([jobs.md#R3](./modules/jobs.md)) |
| "Đã chấm bằng AI" | `GET /api/matches` (`JobMatch` DONE) |
| "Mới chấm nhất / Điểm cao → thấp / Điểm thấp → cao" | `sort=newest / score_desc / score_asc` |
| Kỹ năng chuyên môn / Kinh nghiệm / Hành vi & văn hoá / Định hướng nghề | `technicalScore` / `experienceScore` / `behavioralScore` / `careerScore` |
| "Lương tối thiểu", "Lương cao nhất" | `salaryMin` filter / `sort=salary` trên `salaryMin/salaryMax` đọc từ `salaryRaw` *(2026-10-19)* |
| "Lịch sử ứng tuyển" | `Application` |
| "Tôi đã nộp đơn" | `PUT /api/applications/:id/status {APPLIED}` |
| "Tối ưu CV" | `Document kind=CV` |
| "Bản LaTeX" / "Xem mã .tex" | ĐÃ XÁC MINH KHÔNG CÒN TRONG CODE (2026-10-19) — LaTeX đã gỡ, mọi PDF in từ HTML |
| "AI đang viết" | `generate-stream` (sự kiện `partial`) |
| "Soạn lại" | `force: true` |
| "Nhận xét cũ" | `feedbackStale` |
| "Chưa có người rà" | `InterviewQuestion.verified = false` |
| "Kỹ năng nên học" / "Đã biết" | `SkillGap` / `POST /api/profile/skills` |
| "Phân tích bằng AI" | `POST /api/upskill/generate-stream` |
| "Khoảng trống khác" | `synthesisedGaps` |
| "Việc đang chờ" | `pendingMatches` |
| "Điểm hôm nay" / "Chuỗi ngày" / "Mục tiêu tuần" | `todayScore` / `streak` / `weekly` |
| "Thông tin đã cũ" (công ty) | `stale` (`expiresAt <= now`) |
| Admin: "Danh bạ / Từ điển kỹ năng", "Cách viết", "Gộp" | `CanonicalSkill`, `SkillAlias`, merge |
| Admin: "Đối chiếu lại toàn kho" | `POST /api/admin/skills/rematch` → `match.requirements` |
| Admin: "Quét ngay" | `POST /api/admin/scrape/run-now` |
| Admin: "Nạp lại portal" | `POST /api/scrape/portals/reload` |
| Admin: "Chạm trần" | `jobsFound ≥ maxJobsPerPortal` (`hitCap`) |
| Admin: "Cần xử lý" | `attention[]` của overview |
| Admin: "Tính lại phân loại tin" | `POST /api/admin/jobs/backfill-taxonomy` |
| Admin: "Sức khoẻ AI" / "Bể model & cầu dao" / "Kiểm tra ngay" | `/ai-health`, `GET/POST /api/admin/ai/models/health(-check)` |
| Admin: "Hàng đợi" / "Bảo trì dữ liệu" | `/queues` / `/maintenance` |

## 4. Đối chiếu enum ↔ nghĩa tiếng Việt

| Enum | Giá trị → nghĩa |
|---|---|
| `UserRole` | USER → Người dùng · ADMIN → Quản trị viên |
| `MatchStatus` | PENDING → Đang chờ · RUNNING → Đang chạy · DONE → Xong · FAILED → Hỏng (bấm lại được) |
| `AgentRunStatus` | PENDING → Chờ (code hiện không tạo) · RUNNING → Model đang viết · WAITING_USER → Chờ người dùng trả lời · DONE → Kết thúc · FAILED → Hỏng |
| `ApplicationStatus` | VIEWED → Đã xem · APPLIED → Đã nộp · WITHDRAWN → Đã hủy |
| `EligibilityVerdict` | PASS → Đủ điều kiện · FAIL → Không đủ điều kiện (quốc tịch/giấy phép) · UNVERIFIED → Chưa xác minh |
| `FitVerdict` | STRONG → Rất phù hợp (≥ 75) · GOOD → Phù hợp (≥ 60) · MODERATE → Phù hợp vừa (≥ 45) · WEAK → Ít phù hợp (≥ 30) · POOR → Không phù hợp |
| `JobSeniority` | INTERN → Thực tập · FRESHER → Mới ra trường · JUNIOR · MIDDLE · SENIOR · LEAD · UNKNOWN → Chưa rõ/chưa chọn |
| `RemotePolicy` | ONSITE → Làm tại văn phòng · HYBRID → Kết hợp · REMOTE → Làm từ xa · UNKNOWN → Chưa rõ (nghĩa suy từ tên; FE không hiển thị giá trị này) |
| `AliasSource` | EXACT → Trùng chữ (không tốn model) · LLM → Model chọn · MANUAL → Admin sửa tay (máy không ghi đè) |
| `DocumentKind` | CV · COVER_LETTER → Thư xin việc · APPLICATION_EMAIL → Mail ứng tuyển · FORM_ANSWER → (đồ sót, không còn sinh) |
| `DocumentLanguage` | VI → Tiếng Việt · EN → Tiếng Anh |
| `InterviewQuestionKind` | STAR → Câu chuyện STAR · TOUGH → Câu hỏi khó |
| `InterviewQuestionSource` | X_INTERVIEW → Thu từ x-interview.com · GENERATED → Tự sinh (chưa có code) · USER → Người dùng nhập (chưa có code) |
| `InterviewQuestionType` | KIEN_THUC → Kiến thức · QUY_TRINH → Quy trình · HANH_VI → Hành vi (không có đáp án mẫu) · DONG_CO → Động cơ (không có đáp án mẫu) |
| `InterviewQuestionStatus` | RAW → Mới nhập · READY → Hiển thị được · REJECTED → Không phải câu hỏi (giữ lại) |
| `LearningStatus` | LEARNING → Đang học · SKIPPED → Bỏ qua · DONE → Hoàn thành 3 bước (giá trị ảo `OPEN` trong API: chưa chọn) |
| `UpskillMode` | AGGREGATE → Tổng hợp mọi tin đã chấm · TARGETED → Một tin cụ thể |
| `AiFailureKind` | SCHEMA → Sai định dạng · TIMEOUT → Quá giờ · UPSTREAM → Gateway quá tải/hết lượt/5xx · OTHER → Khác |
| `BriefConfidence` | HIGH → Cao · MEDIUM → Vừa · LOW → Thấp |
| `CompanyVerdict` | POSITIVE → Đánh giá tích cực · MIXED → Ý kiến trái chiều · NEGATIVE → Nhiều phàn nàn · NO_REVIEWS_YET → Chưa ai đánh giá · UNKNOWN → Chưa đủ dữ liệu |
| `SalaryRefVisibility` | INTERNAL → Đã nạp, chưa hiển thị · PUBLIC → Hiển thị trên web |

## 5. Viết tắt

| Viết tắt | Nghĩa |
|---|---|
| BR | Business Rule |
| JD | Job Description — mô tả công việc |
| CV | Curriculum Vitae — sơ yếu lý lịch |
| STAR | Situation – Task – Action – Result |
| ADR | Architecture Decision Record (`docs/adr/`) |
| NDJSON | Newline-delimited JSON |
| R2 | Cloudflare R2 (lưu trữ tương thích S3) |
| FE / BE | Frontend / Backend |
| SV / GD / DTO / DB | Service / Guard / Data Transfer Object / Database — cột "Nơi thực thi" |
| p50 / p95 | Trung vị / phân vị 95 của độ trễ |
| PV | Phỏng vấn |

## Source References

**Backend:** [schema.prisma](../../server/prisma/schema.prisma) · [occupations.ts](../../server/src/modules/jobs/taxonomy/occupations.ts) · [validation-message.ts](../../server/src/common/validation-message.ts)

**Frontend:** [match-labels.ts](../../../ui-ai-job-search/lib/match-labels.ts) · [application-status.ts](../../../ui-ai-job-search/lib/application-status.ts) · [company-brief.ts](../../../ui-ai-job-search/lib/company-brief.ts) · [sidebar.ts](../../../ui-ai-job-search/lib/sidebar.ts) · [ui-admin-job-search/lib/sidebar.ts](../../../ui-admin-job-search/lib/sidebar.ts)

**Module:** mục §10 và §12 của mọi file trong [modules/](./modules/).
