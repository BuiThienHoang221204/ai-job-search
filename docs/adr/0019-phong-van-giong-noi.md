# ADR 0019: Phỏng vấn thử bằng giọng nói qua Gemini Live

- **Trạng thái:** Đã chấp nhận
- **Đọc khi:** sửa `VoiceSessionService`, `LiveTokenService`, `utils/voice-interview.ts`, route `POST /mock-interviews/voice` hoặc `:id/voice-turns`, biến `MOCK_INTERVIEW_VOICE_*`, hoặc làm giao diện thoại ở FE
- **Ngày:** 2026-10-24

## Bối cảnh

Chủ dự án muốn luyện phỏng vấn kiểu "nói chuyện với người thật": AI nói, ứng viên nói, được ngắt lời nhau. Đã xét ba mức: chỉ đọc câu hỏi (TTS), TTS + ghi giọng thành chữ, và giọng nói thời gian thực. Chọn mức thứ ba.

Đã so (2026-10-24): Gemini Live (`gemini-3.8-live`, docs ghi hỗ trợ `vi`, có bậc miễn phí, trả phí khoảng $0,005/phút âm thanh vào và $0,018/phút âm thanh ra), OpenAI `gpt-realtime-mini` (không có bậc miễn phí, chưa xác minh tiếng Việt), Vapi/ElevenLabs Agents ($0,08–0,30/phút), LiveKit/Pipecat (cho tổng đài, quá nặng). Repo đã có `GOOGLE_GEMINI_API_KEY`.

Bản thử P0 (thư mục nháp, không vào repo) chạy 4 buổi thật bằng micro và các bài mô phỏng bằng giọng tổng hợp:

| Đo | Kết quả |
|---|---|
| Độ trễ ngừng nói → AI cất tiếng | 465–750 ms với VAD mặc định; 0,9–1,3 s sau khi chờ im lặng 800 ms |
| Ghi chữ tiếng Việt | gần nguyên văn, thuật ngữ đúng ("NestJS, PostgreSQL, GitHub Actions, E2E, Docker, Azure DevOps, YAML", "1,5 giây xuống khoảng 80 mili giây") |
| Chi phí theo giá trả phí | 6 phút / 13 lượt khoảng $0,17; buổi 15 phút sạch nhiễu ước $0,3–0,4. Mỗi lượt tính lại TOÀN BỘ ngữ cảnh (lượt 2 `promptTokenCount` 3.159 gồm cả âm thanh câu trả lời trước), âm thanh vào khoảng 25 token/giây |
| Khoá cấu hình | client gửi `systemInstruction` "Bạn là đầu bếp…" khi kết nối bằng token đã khoá → bị bỏ qua, AI vẫn phỏng vấn |

## Quyết định

**Trình duyệt nối thẳng tới Gemini Live bằng token ngắn hạn; server cấp token, lưu bản ghi chữ, và tổng kết bằng đường `finish` sẵn có.**

- `POST /mock-interviews/voice` gọi REST `v1alpha/auth_tokens` với `uses: 1`, `newSessionExpireTime` 1 phút, `expireTime` = số phút cấp, và `bidiGenerateContentSetup` chứa TOÀN BỘ cấu hình (không gửi `fieldMask` → khoá mọi trường đã đặt). Gửi `lockAdditionalFields: []` qua SDK sinh `fieldMask` sai và Google trả `field_mask is invalid for BidiGenerateContentSetup`.
- Không thêm SDK `@google/genai` vào server: chỉ cần một lời gọi REST. Định dạng body lấy từ request SDK thật (2026-10-24).
- Âm thanh không đi qua server: không tốn băng thông, độ trễ thấp. Đổi lại, bản ghi chữ do trình duyệt gửi lên (rủi ro R8 trong `mock-interview.md`) — chấp nhận vì đây là dữ liệu luyện tập của chính người dùng.
- Mỗi lượt giọng nói lưu y hệt lượt chữ (`ask_user`, `messages` có `TIẾP`/`@@HOI@@`), nên `POST :id/finish`, màn xem lại, danh sách và `closing` dùng chung, không có code tổng kết thứ hai. Hồ sơ mở đầu kèm ghi chú "bản ghi tự động, có thể lẫn tạp âm" để model tổng kết bỏ qua đoạn nhiễu.
- Hạn mức tính trên `AgentRun` sẵn có (`input.mode = 'voice'`, `input.minutes`), cửa sổ 24 giờ trượt, không cần bảng mới và không cần múi giờ. Buổi còn mở tính tới bây giờ để buổi bỏ dở (không gửi lượt nào) không lách được hạn mức.
- `LiveTokenService` là provider riêng chỉ để e2e thay bằng `FakeLiveTokens` (như `GoogleAuthService`), không phải seam có nhiều adapter.

## Hệ quả

Bẫy đã sập ở P0 và cách đã chặn (phần prompt nằm trong `voiceSetup`):

1. **Tivi/người bên cạnh làm AI tự ngắt lời 5 lần và nhảy sang tiếng Anh.** VAD của Gemini không phân biệt giọng ứng viên với giọng nền; bộ ghi chữ tự đoán ngôn ngữ ghi tiếng tivi thành "No, gracias", "ayudando", "老老"; model Live trả lời theo ngôn ngữ nó nghe. Chặn: độ nhạy VAD thấp + `prefixPaddingMs` 300 + `silenceDurationMs` 800; ghi chữ chỉ `vi-VN`/`en-US`; giọng khoá `vi-VN`; prompt coi câu lạc đề/khác ngôn ngữ là tạp âm. Mô phỏng tiếng nền -44 dBFS: chưa có cổng âm lượng ở client thì AI vẫn bị ngắt dù VAD đã độ nhạy thấp → **FE bắt buộc có cổng âm lượng** (chỉ gửi khung to hơn nền ≥ 12 dB; lúc AI đang nói cần thêm 6 dB và 0,4 s mới tính là ngắt lời; khung bị chặn gửi thành im lặng). Có cổng: 0 lần ngắt, bản ghi sạch. Người bên cạnh nói to ngang ứng viên vẫn lọt qua cổng: AI không đáp và không đổi ngôn ngữ, nhưng câu đó lẫn vào bản ghi → FE có chế độ "Giữ để nói", làm hoàn toàn ở client *(2026-10-24)*: chỉ gửi khung micro khi đang giữ Space/nút, còn lại gửi im lặng, VAD của server vẫn bật để tự chốt lượt khi thả. Nhờ vậy đổi chế độ được giữa buổi mà không cần token mới (cách `automaticActivityDetection.disabled` + `activityStart`/`activityEnd` khoá vào token, không đổi giữa chừng được).
2. **AI tự đóng buổi sau khoảng 5 câu** (`end_interview` với `questionsAsked: 8` — model đếm cả lượt hỏi lại do nhiễu). Chặn: không tin số model tự đếm. Trả lời công cụ là việc của FE: `reason = candidate_stop` luôn `ok` (lọc ý "xin dừng" bằng từ khoá đã hỏng với "Thôi, em nghĩ đã đủ rồi…"); `covered`/`cap` chỉ `ok` khi số câu đã lưu (`answered` trả từ `voice-turns`) ≥ 8, nếu không trả `{ ok: false, message }` — đã đo: model hỏi tiếp tự nhiên, không nhắc tới công cụ.
3. **Câu trả lời chung chung được khen** ("Rất ấn tượng…"). Prompt bắt hỏi lại tình huống cụ thể; đã đo đúng.
4. **Model đọc "ISO twenty seven thousand one".** Prompt bắt đọc mã từng chữ số.
5. Live cần một tin mở đầu từ client (`sendRealtimeInput({ text })`) mới bắt đầu nói. Bản ghi chữ của AI có thể tới SAU `turnComplete`: FE gom lượt theo lúc người dùng bắt đầu nói, không theo `turnComplete`.
6. Mỗi kết nối sống khoảng 10 phút (`goAway`); nối lại bằng `sessionResumption.handle`, dùng lại cùng token trong `expireTime`. Chưa đo thực tế qua mốc 10 phút.
7. Bậc miễn phí của Gemini có thể dùng hội thoại để cải thiện sản phẩm; người dùng thật thì bật thanh toán. Chi phí tăng theo bình phương số câu vì ngữ cảnh tính lại mỗi lượt — giữ `contextWindowCompression` và trần 20 phút/buổi.
8. **FE từng cấm micro trên toàn site:** `next.config.ts` đặt `Permissions-Policy: microphone=()` nên `getUserMedia` ném `NotAllowedError` dù người dùng đã cho phép — lộ ra khi chạy thử bằng Playwright 2026-10-24. Đã đổi thành `microphone=(self)`.
9. `gemini-3.8-live` gửi bản ghi chữ của ứng viên MỘT lần khi họ nói xong, không gửi dần trong lúc nói (đo 2026-10-24); phụ đề phía ứng viên hiện sau khi nói, thanh mức micro mới là tín hiệu "đang nghe".
Test ghim: `test/mock-interview-voice.e2e-spec.ts` (cấp token, hạn mức, lưu lượt + `finish`, gửi trùng, trần câu, sở hữu, buổi chữ), `test/unit/modules/mock-interview/voice-interview.spec.ts` (buổi bỏ dở vẫn bị tính phút).

**Phút thưởng mời bạn bè (2026-10-26).** Không đổi hạn mức 30 phút/24 giờ; phút thưởng chỉ bù khi phần ngày không đủ một buổi. Thay vì trừ số dư lúc mở buổi (dừng sớm sẽ mất phút), mỗi buổi ghi `input.bonus` = phần cấp vượt phần ngày, và số dư = `users.bonusVoiceMinutes` − phần thưởng các buổi đã tiêu thật (`voiceBonusUsed`). Một lúc chỉ có một buổi chạy (`assertNoRunInFlight`) nên không có hai buổi cùng tiêu một số dư.
