/// Stub cho `ai` và `@ai-sdk/openai-compatible` trong test tích hợp.
///
/// LÝ DO TỒN TẠI: cả hai package là ESM thuần - `"type": "module"`, không có
/// nhánh `require` trong `exports`, không có bản CommonJS. Production nạp được
/// vì Node >= 22.12 cho phép `require()` một module ESM; jest thì cài đặt
/// `require` của riêng nó và KHÔNG có khả năng đó, nên chỉ cần `app.module.ts`
/// kéo tới `ai.service.ts` là cả bộ e2e vỡ với "Cannot use import statement
/// outside a module".
///
/// Cách khác là bắt jest biên dịch cả SDK qua `transformIgnorePatterns`, nhưng
/// nó chậm và phải khai đường dẫn nội bộ của pnpm - thứ đổi theo mỗi lần cài
/// lại. Stub gọn hơn và hợp với sự thật: e2e ĐÃ thay `AiService` bằng `FakeAi`,
/// nên không lời gọi model thật nào được phép xảy ra. Đường code thật của
/// `AiService` (dò structuredOutputs, timeout, telemetry) thuộc phạm vi test
/// đơn vị của chính nó: `test/unit/modules/ai/ai.service.spec.ts`, nơi nạp được
/// SDK thật - bộ đơn vị chạy với `--experimental-vm-modules` nên `require` của
/// jest nạp được ESM, và test đó dùng đúng lớp `NoObjectGeneratedError` thật.
///
/// Một stub file phục vụ cả hai package vì các tên xuất không đụng nhau.

const unreachable = (name: string) => (): never => {
  throw new Error(
    `${name}() của ai SDK bị gọi trong test tích hợp. Lẽ ra AiService đã được ` +
      'thay bằng FakeAi - kiểm tra overrideProvider trong test/support/app-harness.ts.',
  );
};

export const generateObject = unreachable('generateObject');
export const generateText = unreachable('generateText');
export const streamText = unreachable('streamText');
export const createOpenAICompatible = unreachable('createOpenAICompatible');

/// `tool()` của SDK thật chỉ là hàm ĐỒNG NHẤT có kiểu: nó trả về đúng object
/// định nghĩa được truyền vào. Bản giả cũng phải làm vậy chứ KHÔNG được ném:
/// `FakeAi.runTools` gọi thẳng `execute` của từng tool, nên đây là đường code
/// thật đang được kiểm - phần duy nhất không được chạy là lời gọi model.
export const tool = <T>(definition: T): T => definition;

/// Hai điều kiện dừng chỉ có nghĩa bên trong vòng lặp của SDK thật. Bản giả trả
/// về một hàm luôn `false` để nơi gọi vẫn dựng được tham số mà không cần biết
/// vòng lặp có chạy hay không.
export const stepCountIs = () => (): boolean => false;
export const hasToolCall = () => (): boolean => false;

export const NoObjectGeneratedError = {
  /// Trả `false` thay vì ném lỗi, khác với các hàm trên. Hàm này chỉ được gọi
  /// BÊN TRONG khối catch của `AiService.attempt`, và ném ở đó sẽ che mất lỗi
  /// gốc - đúng thứ mà người đọc test đang cần thấy.
  isInstance: (): boolean => false,
};
