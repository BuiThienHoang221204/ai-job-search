---
name: vieclam24h-search
version: 1.0.0
description: >
  Use this skill to browse job listings in Vietnam from Vieclam24h's public job
  board by occupation. Multi-sector: accounting, sales, logistics, manufacturing,
  healthcare, education and IT. The query is mapped to one Vieclam24h occupation
  category; free-text keyword search is not available within robots.txt.
  Trigger phrases: tim viec Vieclam24h, viec lam 24h, tuyen dung Vieclam24h.
context: fork
enabled: true  # đặt false để giữ portal nhưng cho /scrape bỏ qua
delayMs: 8000  # nhịp riêng, đặt thận trọng từ đầu sau bài học hCaptcha của careerlink
allowed-tools: Bash(bun run .agents/skills/vieclam24h-search/cli/src/cli.ts *)
---

# Vieclam24h Search Skill

Duyệt việc làm tại Việt Nam trên Vieclam24h **theo ngành nghề**. Không cần đăng
nhập, không cần API key, không cần `curl`.

## Vì sao theo ngành chứ không theo từ khoá

Đo 2026-09-29:

- Tham số tìm kiếm thật của trang là `q`, và **`robots.txt` chặn `/*?q`**. CLI
  không dùng nó.
- `?keyword=` thì trang **bỏ qua**: "kế toán" trả 0/30 tin liên quan, toàn tin
  trả phí của ngành khác.
- Trang ngành `/viec-lam-<nganh>-o<id>.html` được phép và đúng ngành: trang "Kế
  toán" 16/20 tin là kế toán.

Nên `--query` đi qua HAI tầng, và **không có ngành mặc định**:

1. **Trang NGÀNH CON** khớp nhất (`sub-occupations.ts`). Sitemap
   `sub-occupation-*.xml` của chính trang liệt kê ~30.000 trang dạng
   `/viec-lam-ke-toan/ke-toan-tong-hop.html` - thực chất là một chỉ mục từ
   khoá. Thử cụm dài nhất rồi rút dần ("kế toán trưởng sản xuất" -> "kế toán
   trưởng"). Đo 2026-09-29: trang "Kế toán tổng hợp" trả 20 tin đúng chức danh
   100%, **0 tin trùng** trang ngành cha. Chỉ mục được **đệm trên đĩa 24 giờ**
   (thư mục tạm của hệ điều hành) - tốn ~7 request mỗi ngày tới CDN tĩnh, sau
   đó tra tại chỗ. Sitemap lỗi thì lùi xuống tầng 2, không làm hỏng lượt tìm.
2. **Trang NGÀNH CHA** `/viec-lam-<nganh>-o<id>.html` (`occupationFor`, bảng 53
   ngành + bí danh chức danh; cụm đứng trước thắng, so theo ranh giới từ). Tin
   được **lọc** (`relevantTo` - trang "IT Phần mềm" lẫn cả "Giáo viên Tin học",
   mỗi tin lạc đề tốn một lượt rút yêu cầu) rồi **xếp lại** (`rankByQuery`).

Không tầng nào khớp thì trả `[]` và báo `NO_CATEGORY` trên stderr.

**Phân trang KHÔNG có tác dụng phía server**: `?page=2` trả `current: 2` nhưng
19/20 tin trùng trang 1 (toàn tin trả phí được ghim) - phân trang thật chạy ở
trình duyệt. Nên `--page > 1` trả `[]` thay vì trả lại tin trùng. Mỗi truy
vấn vì vậy với tới tối đa ~20 tin; độ phủ đến từ việc mỗi ngành con là một tập
20 tin riêng.

## Đặc điểm cần biết

- **Dữ liệu nằm trong `__NEXT_DATA__`** (JSON nhúng của Next.js), không bóc HTML.
  Có lương dạng số, ngày duyệt, mã tỉnh, `smart_tags`.
- **`postedAt` = `approved_at`**, không phải `refresh_at` - mốc "làm mới" trả phí
  đổi hằng giờ và sẽ làm mọi tin trả phí trông như vừa đăng.
- **Tỉnh ghi "TP.HCM"** trong khi hồ sơ gửi "Ho Chi Minh"; `matchesLocation`
  quy các cách viết về một dạng. Thiếu bước này thì lọc sạch mọi tin ở TP.HCM.
- URL chi tiết dựng từ ngành chính + tỉnh + id: đã đối chiếu khớp 20/20 link
  trên trang thật.
- Thiếu `__NEXT_DATA__` hoặc gặp captcha/Cloudflare thì CLI báo `BLOCKED`, và
  backend tạm ngừng gọi portal này 30 phút.

## Cách dùng

```bash
bun run .agents/skills/vieclam24h-search/cli/src/cli.ts search --query "kế toán tổng hợp" --location "Ho Chi Minh" --limit 10
bun run .agents/skills/vieclam24h-search/cli/src/cli.ts detail "ke-toan/ke-toan-tong-hop-c17p122id200000000"
```

## Kiểm thử

```bash
cd .agents/skills/vieclam24h-search/cli && bun test
```

Fixture là dữ liệu thật rút gọn còn đúng phần `__NEXT_DATA__` mà CLI đọc.
