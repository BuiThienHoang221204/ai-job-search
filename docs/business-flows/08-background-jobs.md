# 08 — Việc nền: cron, hàng đợi, worker

> **Phạm vi:** `server/src/modules/queue/**`, `reconcile/**`, các `*.processor.ts`, các `CronJob`.
> **Nguyên tắc:** tài liệu mô tả hệ thống **as-is**. Code là nguồn sự thật duy nhất. Cơ chế hàng đợi đầy đủ ở [platform-operations.md](./modules/platform-operations.md); bước nghiệp vụ của từng worker ở module sở hữu.

## 1. Tổng quan

- **Hàng đợi:** pg-boss trên cùng Postgres (schema `pgboss`), 11 hàng đợi cố định tạo lúc khởi động với policy `exclusive` — mỗi `(queue, singletonKey)` có tối đa một việc chưa xong; gửi trùng bị bỏ im lặng (`send` trả `null`). `batchSize` 1, poll 2 s. `singletonKey` do code suy ra từ payload, không để người gọi tự đặt ([queue-key.ts](../../server/src/modules/queue/queue-key.ts)).
- **Song song:** đọc từ bảng `queue_configs` (admin sửa ở `/queues`) **lúc đăng ký worker** — đổi xong phải khởi động lại worker (ADR [0010](../adr/0010-hang-doi.md)).
- **Cron:** dựng bằng `new CronJob(..., timeZone = CRON_TIMEZONE)`; không dùng `@Cron`. Mặc định `Asia/Ho_Chi_Minh`.
- **Vai tiến trình:** worker và cron chỉ chạy khi `APP_ROLE` là `worker` hoặc `all` — trừ `ai.healthcheck` chạy ở mọi vai.
- **Không tự thử lại `FAILED`.** Worker bắt lỗi và ghi `FAILED`; người dùng bấm lại. Reconcile chỉ đụng `PENDING`/`RUNNING`.

## 2. Cron

| Tên | Lịch mặc định | Timezone | Bật/tắt | Vai | Ý nghĩa nghiệp vụ | Module |
|---|---|---|---|---|---|---|
| `scrape.nightly` | `0 23 * * *` (`SCRAPE_CRON_SCHEDULE`) | `CRON_TIMEZONE` | `SCRAPE_CRON_ENABLED` | worker/all | Mỗi đêm tạo một `ScrapeRun` hệ thống (`userId = null`) cho từng portal và xếp `scrape.run` | [job-scraping.md](./modules/job-scraping.md) |
| `reconcile.stuck-work` | `*/10 * * * *` (`RECONCILE_CRON_SCHEDULE`) | `CRON_TIMEZONE` | `RECONCILE_CRON_ENABLED` | worker/all | Nhặt việc `PENDING`/`RUNNING` quá 10 phút: xếp lại hoặc đánh `FAILED` | [platform-operations.md](./modules/platform-operations.md) |
| `ai.healthcheck` *(2026-10-19, chưa commit)* | `35 23 * * *` (`AI_HEALTHCHECK_SCHEDULE`) + lúc khởi động | `CRON_TIMEZONE` | `AI_HEALTHCHECK_ENABLED` | **mọi vai** | Probe model các lõi, dựng lại bể main/fast | [ai-platform.md](./modules/ai-platform.md) |

Cả ba bỏ lượt nếu lượt trước của **cùng tiến trình** chưa xong (cờ trong bộ nhớ).

### 2.1 `scrape.nightly` — từng bước

1. Nạp danh sách portal đang bật.
2. Với mỗi portal: tạo `ScrapeRun` `PENDING` không chủ, gửi `scrape.run {runId}`; một portal lỗi không chặn portal khác.
3. Worker `ScraperProcessor` (tuần tự, concurrency 1): giành chỗ `PENDING → RUNNING`; lập kế hoạch truy vấn theo **cụm nghề** của mọi hồ sơ (≤ 30 cụm, xoay vòng theo `occupation_crawls`); gọi CLI portal, lọc tin > 7 ngày, gọi `detail` cho tin mới; ghi `jobs` (nhận diện bản sao qua `dedupeKey`); xếp `job.requirements` theo lô 5 tin; ghi `DONE`/`FAILED`.
4. Chuỗi tiếp theo chạy nền: `job.requirements` → `skill.canonicalize` → `match.requirements` → (nếu `MATCH_AI_AUTO`) `match.shortlist` → `match.evaluate`.

Chi tiết: [job-scraping.md §4](./modules/job-scraping.md#4-business-flow).

### 2.2 `reconcile.stuck-work` — từng bước

| Bảng | Điều kiện kẹt | Hành động |
|---|---|---|
| `documents` | `PENDING`/`RUNNING`, `updatedAt` > 10 phút | Xếp lại `document.generate` (cũ nhất trước, ≤ 100/lượt) |
| `job_matches` | như trên | Xếp lại `match.evaluate` (≤ 100/lượt) |
| `agent_runs` | `PENDING`/`RUNNING` > 10 phút (`WAITING_USER` không đụng) | `FAILED` |
| `interview_preps`, `profile_drafts`, `job_requirements` | > 10 phút theo `updatedAt` | `FAILED` |
| `upskill_reports` | > 10 phút theo `createdAt` (bảng không có `updatedAt`) | `FAILED` |
| `scrape_runs` | `RUNNING` > 4 giờ (theo `startedAt`) hoặc `PENDING` > 12 giờ | `FAILED` |

Admin chạy ngay: `POST /api/admin/reconcile/run-now` (202). Test ghim danh sách bảng: [reconcile.service.spec.ts](../../server/test/unit/modules/reconcile/reconcile.service.spec.ts).

## 3. Hàng đợi

| Hàng đợi | Producer | Worker | Concurrency mặc định | `singletonKey` | Bảng trạng thái | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|---|---|
| `match.evaluate` | `POST /api/matches/evaluate`, `match.shortlist`, scraper fan-out (`SCRAPER_AUTO_SCORE`), reconcile | `MatchingProcessor` | 10 | `userId:jobId:force` / `:cache` | `job_matches` | Chấm điểm AI một (người, tin) |
| `interview.prep` | `POST /api/interview/prep` | `InterviewProcessor` | 5 | `userId:jobId` | `interview_preps` | Soạn bộ câu hỏi phỏng vấn |
| `upskill.report` | `POST /api/upskill/generate` (và FE dự phòng khi stream hỏng) | `UpskillProcessor` | 5 | `reportId` | `upskill_reports` | Báo cáo khoảng trống kỹ năng (2 lượt gọi model) |
| `document.generate` | `POST /api/documents/*` (không stream), `POST /api/applications`, reconcile | `DocumentsProcessor` | 8 | `documentId` | `documents` | Sinh CV/thư/mail |
| `scrape.run` | cron, `POST /api/scrape`, `POST /api/admin/scrape/run-now` | `ScraperProcessor` | 1, **serial** | `runId` | `scrape_runs` | Quét một portal |
| `profile.synthesize` | `POST /api/profile-drafts/cv` (không stream), `POST …/:id/retry` | `ProfileDraftProcessor` | 3 | `draftId` | `profile_drafts` | Đọc CV thành bản nháp hồ sơ |
| `job.requirements` | scraper (lô 5 tin) | `MatchingProcessor` | 2 | vân tay danh sách `jobIds` | `job_requirements` | Rút yêu cầu tin (một lần mỗi tin) |
| `company.brief` | `POST /api/companies/brief/by-job/:jobId` (và FE dự phòng) | `CompanyProcessor` | 3 | `nameKey` | `company_briefs` (không có status) | Tìm hiểu công ty |
| `match.requirements` | sau `skill.canonicalize`, `POST /api/admin/skills/rematch` | `MatchingProcessor` | 15 | `sweep` / `job:` / `user:` / `all` | `job_requirement_matches` | Đối chiếu hồ sơ × tin bằng code |
| `skill.canonicalize` | sau `job.requirements` DONE, `PUT /api/profile`, `POST /api/matches/dictionary/rebuild` | `MatchingProcessor` | 10 | `sweep` / `job:` / `user:` / `all` | `canonical_skills`, `skill_aliases` | Đưa cách viết kỹ năng mới vào danh bạ |
| `match.shortlist` | sau `match.requirements`, `startAfter` 60 s | `MatchingProcessor` | 1, **serial** | `user:<id>` / `all` | `profiles.lastFanOutAt` | Phát suất chấm AI cho top-N (chỉ khi `MATCH_AI_AUTO=true`) |

Thứ tự timeout bắt buộc: một lượt gọi model (90/120/180 s) \< `AI_CHAIN_BUDGET_MS` 240 s \< `server.setTimeout` 300 s \< `STUCK_AFTER_MS` 600 s — [ADR 0011](../adr/0011-do-truoc-khi-doan.md). Bất biến này **có thể bị phá** trong trường hợp xấu nhất ([platform-operations.md#R4](./modules/platform-operations.md)).

## 4. Rủi ro khi chạy nhiều instance

| Thành phần | An toàn khi nhân bản? | Lý do / rủi ro |
|---|---|---|
| Worker hàng đợi | ✅ | pg-boss tự chia việc; policy `exclusive` + giành chỗ có điều kiện chống chạy trùng |
| `scrape.nightly` | ❌ | Cờ "đang chạy" trong bộ nhớ: mỗi bản tạo một bộ `ScrapeRun` → quét trùng mọi portal, tăng nguy cơ bị chặn IP. Phải tắt `SCRAPE_CRON_ENABLED` ở mọi bản trừ một ([.env.example](../../server/.env.example), [platform-operations.md#R8](./modules/platform-operations.md)) |
| `reconcile.stuck-work` | ⚠️ | Hành động idempotent nhờ `singletonKey` và điều kiện trạng thái, nhưng vẫn nên chạy một bản |
| `ai.healthcheck` | ⚠️ | Chạy ở mọi tiến trình (kể cả `api`), nhân số lượt probe lên gateway free ([platform-operations.md#R6](./modules/platform-operations.md)); bể model vốn nằm riêng trong RAM từng tiến trình |
| Nhịp portal, cầu dao `BLOCKED` | ❌ | Trong RAM; hai worker không thấy nhau ([job-scraping.md#R3](./modules/job-scraping.md)) |
| Concurrency `queue_configs` | ⚠️ | Chỉ áp lúc khởi động; tiến trình `api` hiện số mới dù worker chạy số cũ ([admin-console.md#R1](./modules/admin-console.md)) |

## 5. Giám sát

| Công cụ | Nội dung |
|---|---|
| `GET /api/queue/stats` (ADMIN) | Số việc chờ / đang chạy / tổng và concurrency của 11 hàng đợi |
| `GET /api/admin/overview` | Cảnh báo: tổng việc chờ > 50, portal có lượt gần nhất `FAILED`, portal > 26 giờ chưa quét, tỉ lệ AI thành công \< 80% |
| `GET /api/admin/scrape/batches`, `/portals` | Lịch sử quét gom theo lượt, sức khoẻ 14 lượt gần nhất từng portal, cờ "chạm trần" |
| `GET /api/admin/ai-health`, `/ai-failures`, `/ai-usage` | p50/p95, tỉ lệ lỗi theo `failureKind`, token |
| Log | `RequestLogMiddleware` (≥ 500 error, ≥ 1 s warn "(chậm)"); logger JSON khi production |
| `GET /api/health` | Chỉ liveness (status + uptime), không kiểm DB/pg-boss |

## Source References

**Backend:** [queue.service.ts](../../server/src/modules/queue/queue.service.ts) · [queue.constants.ts](../../server/src/modules/queue/queue.constants.ts) · [queue.defaults.ts](../../server/src/modules/queue/queue.defaults.ts) · [queue-key.ts](../../server/src/modules/queue/queue-key.ts) · [queue-config.service.ts](../../server/src/modules/queue/queue-config.service.ts) · [reconcile.service.ts](../../server/src/modules/reconcile/services/reconcile.service.ts) · [reconcile-cron.service.ts](../../server/src/modules/reconcile/services/reconcile-cron.service.ts) · [scrape-cron.service.ts](../../server/src/modules/scraper/services/scrape-cron.service.ts) · [model-health.service.ts](../../server/src/modules/ai/services/model-health.service.ts) · [matching.processor.ts](../../server/src/modules/matching/matching.processor.ts) · [documents.processor.ts](../../server/src/modules/documents/documents.processor.ts) · [interview.processor.ts](../../server/src/modules/interview/interview.processor.ts) · [upskill.processor.ts](../../server/src/modules/upskill/upskill.processor.ts) · [scraper.processor.ts](../../server/src/modules/scraper/scraper.processor.ts) · [profile-draft.processor.ts](../../server/src/modules/profile-sources/profile-draft.processor.ts) · [company.processor.ts](../../server/src/modules/companies/company.processor.ts) · [app-role.ts](../../server/src/config/app-role.ts) · [health.controller.ts](../../server/src/modules/health/health.controller.ts)

**Frontend admin:** [queues/page.tsx](../../../ui-admin-job-search/app/%28console%29/queues/page.tsx) · [maintenance/page.tsx](../../../ui-admin-job-search/app/%28console%29/maintenance/page.tsx)
