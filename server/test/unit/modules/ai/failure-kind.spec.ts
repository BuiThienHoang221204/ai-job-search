import { classifyFailure, truncateError } from './failure-kind.js';

/// Dựng lại tên lỗi của AI SDK thay vì import package thật: `ai` v7 là ESM
/// thuần, jest chạy CommonJS nên không nạp được. Tên là hợp đồng ổn định -
/// đã kiểm chứng bằng cách đọc `error.name` từ SDK thật.
const aiError = (name: string, message = ''): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

describe('classifyFailure', () => {
  test('JSON sai schema -> SCHEMA', () => {
    expect(
      classifyFailure(
        aiError(
          'AI_NoObjectGeneratedError',
          'No object generated: response did not match schema.',
        ),
      ),
    ).toBe('SCHEMA');
  });

  test('nhận ra lỗi schema qua thông báo khi tên đã mất', () => {
    expect(classifyFailure(new Error('response did not match schema'))).toBe(
      'SCHEMA',
    );
  });

  test('AbortSignal.timeout -> TIMEOUT', () => {
    expect(
      classifyFailure(
        aiError('TimeoutError', 'The operation was aborted due to timeout'),
      ),
    ).toBe('TIMEOUT');
  });

  test('AbortError cũng là TIMEOUT', () => {
    expect(classifyFailure(aiError('AbortError', 'aborted'))).toBe('TIMEOUT');
  });

  test('nhận ra timeout qua thông báo khi tên đã mất', () => {
    expect(classifyFailure(new Error('Failed: operation was aborted'))).toBe(
      'TIMEOUT',
    );
  });

  test('lỗi gọi API -> UPSTREAM', () => {
    expect(
      classifyFailure(aiError('AI_APICallError', 'Service Unavailable')),
    ).toBe('UPSTREAM');
  });

  test('thông báo của gateway -> UPSTREAM', () => {
    // Đã gặp thật trong phiên chạy thử.
    expect(
      classifyFailure(new Error('Upstream request failed: [429] rate limit')),
    ).toBe('UPSTREAM');
  });

  test('SCHEMA được ưu tiên hơn TIMEOUT khi cả hai đều khớp', () => {
    // Nếu không ưu tiên, một lỗi schema có chữ "aborted" trong văn bản model
    // trả về sẽ bị xếp nhầm thành sự cố gateway - dẫn đến kết luận sai là đổi
    // nhà cung cấp, trong khi vấn đề thật là model quá yếu.
    expect(
      classifyFailure(
        aiError('AI_NoObjectGeneratedError', 'operation was aborted'),
      ),
    ).toBe('SCHEMA');
  });

  describe('bóc RetryError', () => {
    test('lấy lastError ra để phân loại', () => {
      const retry = aiError('AI_RetryError', 'Failed after 3 attempts');
      (retry as unknown as { lastError: Error }).lastError = aiError(
        'AI_APICallError',
        'Internal server error',
      );
      expect(classifyFailure(retry)).toBe('UPSTREAM');
    });

    test('không có lastError thì lấy lỗi cuối trong mảng errors', () => {
      const retry = aiError('AI_RetryError', 'Failed after 3 attempts');
      (retry as unknown as { errors: Error[] }).errors = [
        aiError('AI_APICallError'),
        aiError('AI_NoObjectGeneratedError'),
      ];
      expect(classifyFailure(retry)).toBe('SCHEMA');
    });

    test('RetryError rỗng không làm vỡ hàm', () => {
      expect(
        classifyFailure(aiError('AI_RetryError', 'Failed after 3 attempts')),
      ).toBe('OTHER');
    });
  });

  test('lỗi lạ -> OTHER', () => {
    expect(classifyFailure(new Error('không biết chuyện gì'))).toBe('OTHER');
  });

  test('giá trị không phải Error vẫn phân loại được', () => {
    expect(classifyFailure('chuỗi thuần')).toBe('OTHER');
    expect(classifyFailure(undefined)).toBe('OTHER');
    expect(classifyFailure(null)).toBe('OTHER');
  });
});

describe('truncateError', () => {
  test('cắt thông báo quá dài', () => {
    // Thông báo của AI SDK nhét cả response thô vào, có thể vài chục nghìn
    // ký tự.
    const output = truncateError(new Error('x'.repeat(5000)));
    expect(output.length).toBeLessThan(900);
    expect(output.endsWith('...')).toBe(true);
  });

  test('giữ nguyên thông báo ngắn', () => {
    expect(truncateError(new Error('ngắn gọn'))).toBe('ngắn gọn');
  });

  test('xử lý được giá trị không phải Error', () => {
    expect(truncateError(42)).toBe('42');
  });
});
