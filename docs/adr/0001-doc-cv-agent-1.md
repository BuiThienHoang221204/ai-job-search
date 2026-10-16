# ADR 0001: Đọc CV (Agent 1): ProfileDraft, trường cấm đề xuất, trường mô tả cho phép rỗng

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** Sửa luồng đọc CV, `ProfileDraft`, `profile-proposal.schema.ts` hoặc `PUT /profile-drafts/:id/apply`
- **Nguồn:** tách nguyên văn từ `CLAUDE.md` ngày 2026-10-16; ngày đo và lý do ghi trong từng đoạn.

### Đọc CV (Agent 1) — ba điều dễ làm sai

**1. Không có gì được ghi vào bảng `Profile` cho tới khi người dùng bấm Lưu.** Model ghi vào `ProfileDraft.proposal`; giao diện dựng hồ sơ xem trước (gộp kỹ năng vào cái đang có, thêm mục mới, người dùng sửa/bỏ chỗ AI đọc sai — `lib/profile-draft-content.ts` phía FE) rồi gửi **giá trị cuối cùng** lên `PUT /profile-drafts/:id/apply`. Từ 2026-10-09 route này nhận giá trị chứ không nhận danh sách tên trường như trước, vì chỉ chép nguyên đề xuất thì không gộp được và không giữ được phần người dùng sửa. Trường nhận được là **danh sách trắng** (`ApplyDraftDto` = `PickType(UpdateProfileDto, APPLICABLE_FIELDS)`) chứ không phải danh sách đen: gửi `citizenship`/`careerGoals`… nhận 400 nhờ `forbidNonWhitelisted`, và trường mới thêm vào hồ sơ sau này không tự lọt qua.

**2. Có những trường model bị CẤM đề xuất**, và lý do là: `careerGoals`/`energizingTasks`/`drainingTasks`/`targetSectors`/`dealBreakers` là **sở thích** (CV không nói việc gì làm bạn kiệt sức, mà chúng chiếm 30% điểm phù hợp); `citizenship`/`workPermit` là **tình trạng pháp lý** (đoán sai làm sai Eligibility Gate — bộ lọc CỨNG); `lackingSkills` suy ra từ việc đối chiếu với tin tuyển dụng, không đọc từ CV.

**3. Trường MÔ TẢ mà CV có quyền không ghi thì dùng `.default('')`, KHÔNG dùng `.min(1)`.** Ép một thứ bằng chứng không có thì model chỉ còn hai đường: bịa ra, hoặc trả chuỗi rỗng rồi làm hỏng cả lượt đọc. Đã hỏng thật 2026-08-23 — một CV ghi *"Industrial University of Ho Chi Minh City (IUH), Software Engineering, GPA 3.31/4.0"* mà không ghi bậc bằng; model điền `degree: ""` cho đúng sự thật, zod chặn, và TOÀN BỘ bản đọc CV mất trắng sau 19 giây cùng một lượt gọi model — vì một trường phụ. Chỗ để nói "cái này CV không có" là mảng `missing`, không phải một lỗi schema.

**Ranh giới:** thứ làm nên DANH TÍNH của một mục (`school`, `company`, `position`, tên dự án) vẫn dùng `line()` bắt buộc — thiếu chúng thì cả mục vô nghĩa, và từ chối mới là đúng. Hai helper trong `profile-proposal.schema.ts` đặt tên theo đúng ranh giới đó: `line()` bắt buộc, `optionalText()` cho phép rỗng.

Bộ test đơn vị chạy qua **`test/run-unit.mjs`**, không phải `jest` trực tiếp: `pdf-parse` nạp worker pdfjs bằng `import()` động nên jest cần `--experimental-vm-modules`. Docblock của file đó ghi những cách đã thử mà không tránh được — đừng thử lại.

**`ai.service.spec.ts` đòi Node ≥ 24.9 và sẽ không nạp được trên bản thấp hơn.** Nó gọi `jest.requireActual('ai')` trên một package ESM thuần, mà `require(ESM)` đồng bộ của jest 30 cần API vm mới. Trên Node 22 nó báo *"Jest's require(ESM) requires Node v24.9+"* và cả suite đỏ dù code không sai. Chạy cả bộ 460 test thì dùng Node ≥ 24.9; các suite còn lại chạy được từ Node 22.12. Máy chưa có Node 24 thì không cần cài: `npx -y node@24.11.0 test/run-unit.mjs` (và `test/run-e2e.mjs`) chạy trọn bộ — đã dùng ngày 2026-09-28, 1.285/1.285 unit và 234/234 e2e.
