# 07 — Tích hợp hệ thống ngoài

> **Phạm vi:** mọi chỗ backend gọi ra ngoài tiến trình Node: gateway model, portal tuyển dụng, Serper, web công khai, Google, R2, pdf-service, Docker, mô hình embedding, nguồn dữ liệu của script.
> **Nguyên tắc:** tài liệu mô tả hệ thống **as-is**. Code là nguồn sự thật duy nhất. Chi tiết từng tích hợp nằm ở §15 của module sở hữu.

## 1. Danh mục

| # | Dịch vụ | Mục đích nghiệp vụ | Chiều | Module | Cấu hình |
|---|---|---|---|---|---|
| 1 | Gateway model (7 lõi OpenAI-compatible) | Mọi tác vụ AI: chấm điểm, rút yêu cầu, viết tài liệu, đọc CV, phỏng vấn, upskill, tìm hiểu công ty, phân loại kỹ năng | Đi | [ai-platform](./modules/ai-platform.md#15-integrations) | `MODEL_*`, `AI_*`, khoá từng lõi |
| 2 | 10 portal tuyển dụng (qua CLI Bun) | Nguồn tin tuyển dụng | Đi | [job-scraping](./modules/job-scraping.md#15-integrations) | `PORTALS_DIR`, `SCRAPER_*` |
| 3 | Serper (Google Search API) | Tìm trang review công ty | Đi | [company-research](./modules/company-research.md#15-integrations) | `SERPER_API_KEY`, `SERPER_URL`, `SERPER_MAX_RESULTS` |
| 4 | Web công khai (fetch HTML) | Đọc trang review công ty; bóc tin từ URL người dùng dán | Đi | [company-research](./modules/company-research.md), [documents](./modules/documents.md#15-integrations) | `AGENT_FETCH_TIMEOUT_MS`, `AGENT_FETCH_MAX_BYTES` |
| 5 | Google Identity | Đăng nhập Google (kiểm ID token) | Đi | [auth](./modules/auth.md#15-integrations) | `GOOGLE_CLIENT_ID` (+ `NEXT_PUBLIC_GOOGLE_CLIENT_ID` ở FE) |
| 6 | Cloudflare R2 (S3 API) | Lưu CV PDF gốc người dùng nộp | Đi | [platform-operations](./modules/platform-operations.md#15-integrations), [cv-import](./modules/cv-import.md) | `R2_*` |
| 7 | `pdf-service` (Chromium) | In CV và thư xin việc từ HTML ra PDF | Đi | [documents](./modules/documents.md#15-integrations) | `PDF_SERVICE_URL` |
| 8 | ~~`latex-service` (TeX Live)~~ | ĐÃ XÁC MINH KHÔNG CÒN TRONG CODE (2026-10-19) — ADR 0004 | — | — | — |
| 9 | Docker CLI (sandbox) | Dự phòng cho 7 khi không đặt URL (máy dev) | Đi | [platform-operations](./modules/platform-operations.md#15-integrations) | `PDF_IMAGE` |
| 10 | Hugging Face (`Xenova/multilingual-e5-base`, chạy cục bộ) | Embedding 768 chiều cho danh bạ kỹ năng | Tải model lần đầu, sau đó cục bộ | [matching](./modules/matching.md#15-integrations) | — |
| 11 | PostgreSQL + pgvector + pg-boss | Lưu trữ, hàng đợi, tìm láng giềng kỹ năng | Đi | [platform-operations](./modules/platform-operations.md) | `DATABASE_URL` |
| 12 | x-interview.com | Nguồn ngân hàng câu hỏi (06/09/2026) và bảng lương tham chiếu | Đi, **chỉ qua script chạy tay** | [question-bank](./modules/question-bank.md#15-integrations), [salary](./modules/salary.md#15-integrations) | `DATABASE_URL`, `OMNIROUTE_*`, `MODEL_ID` (script) |
| 13 | Web Push (dịch vụ push của trình duyệt) | Nhắc học trước giờ học 15 phút *(2026-10-23)* | Đi | [upskill](./modules/upskill.md#15-integrations) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

**Chiều về (webhook): không có.** Không route nào nhận callback từ hệ thống ngoài (grep `webhook` trên `server/src` không có kết quả).

## 2. Đặc tả tóm tắt

### 2.1 Gateway model

| Lõi | Endpoint mặc định | Khoá | Vai trò |
|---|---|---|---|
| `omniroute` | `http://localhost:20128/v1` (container `omniroute-service`) | `OMNIROUTE_API_KEY` (mặc định `public`) | Lõi mặc định (`MODEL_PROVIDER`), gom nhiều nhà cung cấp |
| `opencode` | `OPENCODE_SERVICE_URL` (container `opencode-service` bọc `opencode run`) | `AI_API_KEY` | Bể main; cổng song song phía app `OPENCODE_APP_CONCURRENCY` (mặc định 2) |
| `openrouter` | openrouter.ai | `OPENROUTER_API_KEY` (rỗng = bỏ qua lõi) | Bể main |
| `groq` | `GROQ_BASE_URL` | `GROQ_API_KEY` | Bể fast (tác vụ người dùng đang chờ) |
| `gemini` | `GOOGLE_GEMINI_BASE_URL` | `GOOGLE_GEMINI_API_KEY` | Bể fast |
| `unorouter` | `UNOROUTER_BASE_URL` | `UNOROUTER_API_KEY` | Bể fast |
| `kilo` | kilo gateway | `KILO_API_KEY` (không bắt buộc) | Cuối chuỗi — mọi model free tự khai có thể huấn luyện trên prompt |

Cơ chế: `ModelChain` thử lần lượt các mắt xích trong ngân sách `AI_CHAIN_BUDGET_MS` (240 s); mỗi lượt 90–180 s tuỳ tác vụ; cầu dao cách ly model 15 phút sau 2 lỗi liên tiếp; bể model dựng bằng probe lúc khởi động và 23:35 *(2026-10-19, chưa commit)*. Mọi lượt gọi ghi một dòng `ai_calls`. Chi tiết: [ai-platform.md](./modules/ai-platform.md), ADR [0011](../adr/0011-do-truoc-khi-doan.md), [0012](../adr/0012-loi-model-va-chuoi-du-phong.md), [0013](../adr/0013-ep-dinh-dang-dau-ra.md), [0014](../adr/0014-token-va-cache-prompt.md).

### 2.2 Portal tuyển dụng

10 portal, mỗi portal là thư mục `.agents/skills/<key>-search/` có `SKILL.md` + `cli/src/cli.ts`, quét động lúc khởi động: `123job`, `careerviet`, `itviec`, `joboko`, `linkedin`, `timviec`, `topcv`, `topdev`, `vieclam24h`, `vietnamworks`. Gọi bằng `bun run … search|detail`, timeout 60 s, stdout ≤ 8 MB; nhịp ≥ 3 s giữa hai lần gọi cùng portal; portal trả `BLOCKED` bị tạm dừng 30 phút. Tắt portal bằng `enabled: false` trong `SKILL.md`. Điều khoản sử dụng: [ADR 0006](../adr/0006-dieu-khoan-portal.md). Chi tiết: [job-scraping.md](./modules/job-scraping.md).

### 2.3 Serper và web công khai

3 truy vấn Serper (`gl=vn`, `hl=vi`) mỗi lần tìm hiểu công ty; đọc tối đa 5 trang, trang chỉ tính khi HTTP 2xx và ≥ 400 ký tự; chỉ địa chỉ công khai. Bóc tin từ URL (`POST /api/documents/job-from-url`) chặn 401/403/429/non-2xx, nội dung \< 800 ký tự, cắt 20.000 ký tự, không lưu. Chi tiết: [company-research.md](./modules/company-research.md), BR-DOC-33.

### 2.4 In PDF

| Đường | Khi nào | Timeout app |
|---|---|---|
| `pdf-service` `/render` | Mọi PDF (CV và thư) | 30 s |
| `docker run` sandbox | Khi `PDF_SERVICE_URL` rỗng; không mạng, 1 GB, 1 CPU | 45 s |

## 3. Xử lý lỗi

| Tích hợp | Lỗi | Hành vi hệ thống |
|---|---|---|
| Gateway model | 429/401/403/413/5xx, model bị rút, timeout, sai schema (hai lỗi sau thêm từ 2026-10-05, ADR 0012) | Đi tiếp mắt xích kế; hết chuỗi → bản ghi `FAILED` + `failureKind`; HTTP đồng bộ trả 503/504/502 ([11-error-handling.md](./11-error-handling.md)) |
| Gateway model | Bể model rỗng | `ModelUnavailableError` → 503 `Nhà cung cấp AI đang quá tải hoặc đã hết lượt gọi…` |
| Portal | Một truy vấn lỗi | Bỏ truy vấn đó, chạy tiếp |
| Portal | `BLOCKED` | Dừng các truy vấn còn lại của portal, giữ tin đã lấy, cách ly 30 phút |
| Portal | Toàn lượt lỗi | `ScrapeRun.status = FAILED` + `error`; không tự chạy lại |
| Serper | Không key / lỗi | Không có nguồn → lưu bản `UNKNOWN`, hạn 60 ngày ([company-research.md#R3](./modules/company-research.md)) |
| Google | ID token sai | 401 `Token Google không hợp lệ` |
| R2 | Lỗi ghi | Request đọc CV hỏng (500); có thể để file mồ côi ([cv-import.md#R3](./modules/cv-import.md)) |
| pdf-service | Lỗi dịch vụ | 422 khi xuất PDF ([documents.md#R7](./modules/documents.md)) |

## 4. Bảng suy giảm khi dịch vụ chết

| Dịch vụ chết | Tính năng còn chạy | Tính năng hỏng | Người dùng thấy |
|---|---|---|---|
| Toàn bộ gateway model | Đăng nhập, hồ sơ (nhập tay), danh sách/chi tiết tin, "Khớp x/y", đơn ứng tuyển, sửa CV đã có, xuất PDF, lương, ngân hàng câu hỏi đã có đáp án, dashboard | Chấm điểm AI, sinh tài liệu, đọc CV, bộ đề phỏng vấn, phỏng vấn thử, upskill, tìm hiểu công ty, rút yêu cầu tin mới (tin mới không có "Khớp x/y") | Thông báo 503/504 hoặc thẻ "FAILED" kèm câu theo `failureKind`, nút thử lại |
| Một lõi model | Hầu hết — chuỗi dự phòng đi tiếp | Phỏng vấn thử nếu đúng model đang dùng (`streamText` không có dự phòng) | Chậm hơn |
| Portal | Mọi thứ trừ tin mới từ portal đó | Không có tin mới | Admin thấy cảnh báo ở `/api/admin/overview` (lượt FAILED, > 26 giờ chưa quét) |
| Serper | Mọi thứ khác | Tìm hiểu công ty ra `UNKNOWN` | "Chưa đủ dữ liệu" |
| R2 | Mọi thứ trừ file | Nộp CV PDF | Lỗi khi tải lên |
| pdf-service | Mọi thứ trừ xuất PDF | Tải PDF | Lỗi 422 |
| Google | Đăng nhập mật khẩu | Đăng nhập Google | "Đăng nhập bằng Google không thành công" |
| Postgres | Không gì | Toàn bộ | `/api/health` vẫn 200 vì không kiểm DB ([platform-operations.md#R5](./modules/platform-operations.md)) |

## 5. Rủi ro tích hợp

| Rủi ro | Mức | Chi tiết |
|---|---|---|
| Dữ liệu lương và câu hỏi của x-interview: đã ẩn khỏi Google và khách *(2026-10-19)*, API vẫn công khai; điều khoản của họ cấm trích xuất tự động | 🟠 | [salary.md#R1](./modules/salary.md), [question-bank.md#R2](./modules/question-bank.md) |
| Chuỗi model có thể vượt `server.setTimeout` 300 s | 🟡 | [ai-platform.md#R2](./modules/ai-platform.md), [platform-operations.md#R4](./modules/platform-operations.md) |
| Bể model, cầu dao, nhịp quét, cầu dao `BLOCKED` nằm trong RAM từng tiến trình | 🟡 | [ai-platform.md#R4](./modules/ai-platform.md), [job-scraping.md#R3](./modules/job-scraping.md) |
| Model free của kilo có thể huấn luyện trên prompt (chứa CV người thật) | Possible Business Rule | [.env.example](../../server/.env.example) — đã đặt cuối chuỗi |

## Source References

**Backend:** [providers/](../../server/src/modules/ai/providers/index.ts) · [ai.service.ts](../../server/src/modules/ai/services/ai.service.ts) · [model-chain.ts](../../server/src/modules/ai/services/model-chain.ts) · [portal-cli.service.ts](../../server/src/modules/scraper/services/portal-cli.service.ts) · [job-source.router.ts](../../server/src/modules/scraper/services/job-source.router.ts) · [review-research.service.ts](../../server/src/modules/companies/services/review-research.service.ts) · [common/web](../../server/src/common/web) · [google-auth.service.ts](../../server/src/modules/auth/google-auth.service.ts) · [r2.storage.ts](../../server/src/modules/storage/r2.storage.ts) · [pdf/http.ts](../../server/src/modules/documents/pdf/http.ts) · [pdf/sandbox.ts](../../server/src/modules/documents/pdf/sandbox.ts) · [docker.sandbox.ts](../../server/src/modules/sandbox/docker.sandbox.ts) · [local.embedder.ts](../../server/src/modules/semantic/local.embedder.ts) · [crawl-salary-reference.mjs](../../server/scripts/crawl-salary-reference.mjs) · [import-interview-questions.mjs](../../server/scripts/import-interview-questions.mjs) · [.env.example](../../server/.env.example) · [docker-compose.yml](../../server/docker-compose.yml)

**Dịch vụ phụ:** [pdf-service/](../../pdf-service) · [omniroute-service/](../../omniroute-service) · [opencode-service/](../../opencode-service) · [.agents/skills/](../../.agents/skills)
