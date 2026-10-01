---
name: joboko-search
version: 1.0.0
description: >
  Use this skill to browse job listings in Vietnam from JobOKO's public job
  board by curated keyword page or by industry. Multi-sector: accounting,
  finance, sales, healthcare, education, manufacturing, logistics and IT.
  Free-text keyword search is not available within robots.txt. Trigger
  phrases: tim viec JobOKO, viec lam JobOKO, tuyen dung JobOKO.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
delayMs: 8000  # nhịp riêng, đặt thận trọng từ đầu sau bài học hCaptcha của careerlink
allowed-tools: Bash(bun run .agents/skills/joboko-search/cli/src/cli.ts *)
---

# JobOKO Search Skill

Duyệt việc làm tại Việt Nam trên JobOKO. Không cần đăng nhập, không cần API
key, không cần `curl`.

## Vì sao không tìm theo từ khoá tự do

`robots.txt` của vn.joboko.com (đọc 2026-09-29) **chặn `/jobs?*` và
`/viec-lam-theo-khoa?*`** - chính là hai đường tìm kiếm. Trang cũng không có
sitemap (`/sitemap.xml` trả 404), nên không dựng được chỉ mục từ khoá như
Vieclam24h. Còn lại hai đường được phép, đo 2026-09-30:

1. **Trang từ khoá biên tập sẵn** `/tim-viec-lam-<cụm>` - CHỈ tồn tại với một số
   cụm. "kế toán tổng hợp" 20/20 tin đúng; "kế toán" và "frontend developer"
   404; cụm vô nghĩa 404. Trang có tồn tại vẫn có thể lẫn tin lạc đề ("điều
   dưỡng" chỉ 9/20). CLI thử **tối đa hai cụm** (cả cụm, rồi hai từ đầu), vì
   mỗi lần hụt là một request.
2. **Trang ngành** `/viec-lam-nganh-<slug>-xni<id>` (111 ngành, bảng `INDUSTRIES`
   chọn ngành HẸP khi có). 10 tin/trang, phân trang `?p=N` chạy thật (trang 2
   trùng 0/10). Trang "Kế toán" 9/10 tin đúng.

Tin từ cả hai đường đều được **lọc** (`relevantTo`: chức danh phải chứa cụm
của từ khoá hay của ngành) rồi **xếp lại** (`rankByQuery`). Không đường nào khớp
thì trả `[]` và báo `NO_CATEGORY` - **không có ngành mặc định**.

## Đặc điểm cần biết

- **Thẻ tìm kiếm KHÔNG có ngày đăng.** Ngày trên thẻ là **hạn nộp** (ở tương
  lai); lấy nó làm ngày đăng là sai. CLI trả `postedAt: null` - backend giữ tin
  thiếu ngày (`SCRAPER_REQUIRE_POSTED_AT=false`). `detail` trả `datePosted` thật.
- **Widget reCAPTCHA có trên MỌI trang** (form "Góp ý", "Báo cáo tin"). Dò chữ
  `g-recaptcha` để phát hiện trang chặn sẽ báo nhầm `BLOCKED` ở mọi lượt và
  backend tạm ngừng portal mãi mãi - đã suýt lọt, test bắt được. Nay trang chặn
  = có dấu hiệu thử thách **VÀ** không có thẻ tin hay JSON-LD nào.
- **Mô tả lấy từ `description` của JSON-LD**, vốn là HTML có sẵn tiêu đề `<h3>`;
  giữ "Mô tả công việc" + "Yêu cầu", bỏ quyền lợi / thông tin chung / nơi làm
  việc. Lương trong JSON-LD là CHUỖI ("14 - 18 triệu VND"), không phải số.

## Cách dùng

```bash
bun run .agents/skills/joboko-search/cli/src/cli.ts search --query "kế toán tổng hợp" --limit 10
bun run .agents/skills/joboko-search/cli/src/cli.ts detail "viec-lam-ky-su-thiet-ke-xvi6738903"
```

## Kiểm thử

```bash
cd .agents/skills/joboko-search/cli && bun test
```

Fixture là trang thật đã bỏ `<script>`/`<svg>`/`<style>` (giữ JSON-LD).
