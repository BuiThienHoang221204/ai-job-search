import {
  classifyFailure,
  isModelRetired,
  isRateLimited,
  schemaIssues,
  truncateError,
} from 'src/modules/ai/failure-kind.js';

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

describe('isModelRetired', () => {
  /*
   * Do that ngay 2026-08-21: gateway VAN liet ke deepseek-v4-flash-free trong
   * GET /models nen assertServed cho qua, nhung goi that thi tra 401 kem cau
   * duoi day. No la mat xich DAU TIEN cua MODEL_FALLBACK_IDS, nen khong nhan ra
   * thi chuoi du phong dung lai o dung mat xich da chet.
   */
  test('nhan dang model bi rut khuyen mai', () => {
    const error = Object.assign(
      new Error(
        'Free promotion has ended for DeepSeek V4 Flash Free. You can continue using the model by subscribing to OpenCode Go - https://opencode.ai/go',
      ),
      { name: 'AI_APICallError', statusCode: 401 },
    );

    expect(isModelRetired(error)).toBe(true);
    expect(isRateLimited(error)).toBe(false);
    expect(classifyFailure(error)).toBe('UPSTREAM');
  });

  test('nhan dang qua RetryError da boc', () => {
    const wrapper = Object.assign(new Error('Failed after 3 attempts'), {
      name: 'AI_RetryError',
      lastError: new Error('This model is no longer available'),
    });

    expect(isModelRetired(wrapper)).toBe(true);
  });

  test('KHONG nham loi khac thanh model bi rut', () => {
    expect(isModelRetired(new Error('response did not match schema'))).toBe(
      false,
    );
    expect(isModelRetired(new Error('Rate limit exceeded'))).toBe(false);
  });
});

describe('isRateLimited', () => {
  test('nhan dang theo type FreeUsageLimitError cua gateway', () => {
    // Nguyen van gateway tra ve khi mot model free can han muc.
    const error = new Error(
      'Error from provider (Console): Rate limit exceeded. Please try again later.',
    );
    error.name = 'AI_APICallError';
    expect(isRateLimited(error)).toBe(true);
  });

  test('nhan dang theo ma 429', () => {
    const error = Object.assign(new Error('too busy'), { statusCode: 429 });
    expect(isRateLimited(error)).toBe(true);
  });

  test('nhan dang qua RetryError da boc', () => {
    // AI SDK boc loi that trong RetryError sau khi het luot thu lai.
    const inner = new Error('FreeUsageLimitError: Rate limit exceeded');
    const wrapper = Object.assign(new Error('Failed after 3 attempts'), {
      name: 'AI_RetryError',
      lastError: inner,
    });
    expect(isRateLimited(wrapper)).toBe(true);
  });

  test('KHONG nham loi khac thanh het han muc', () => {
    /*
     * Day la phep khang dinh quan trong nhat: doi model chi duoc xay ra khi that su
     * het han muc. Nham mot loi schema thanh het han muc se lang le chuyen ca he
     * thong sang model khac va che mat tin hieu "model nay qua yeu cho tac vu".
     */
    expect(isRateLimited(new Error('did not match schema'))).toBe(false);
    expect(
      isRateLimited(new Error('The operation was aborted due to timeout')),
    ).toBe(false);
    expect(isRateLimited(new Error('Model xyz is not supported'))).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
    expect(isRateLimited('chuoi la')).toBe(false);
  });
});

describe('hai ham phan loai khong duoc bat dong', () => {
  /*
   * `isRateLimited` va `classifyFailure` doc CUNG mot loi. Neu cai truoc noi "het
   * han muc" ma cai sau xep OTHER thi nguoi dung nhan cau "hay thu lai; neu van loi
   * thi bao lai" thay cho cau dung la "da dat gioi han luot goi, thu lai sau vai
   * phut" — hai loi khuyen khac nhau cho cung mot su viec.
   *
   * Da tim ra dung truong hop nay khi viet test cho AiService: mot loi mang ma 429
   * o `statusCode` nhung KHONG mang ten `AI_APICallError` thi `isRateLimited` nhan
   * ra, con `classifyFailure` khong — vi no chi do chu "429" trong thong bao.
   */
  const cases: unknown[] = [
    Object.assign(new Error('too busy'), { statusCode: 429 }),
    new Error('FreeUsageLimitError cho deepseek-v4-flash-free'),
    Object.assign(new Error('Failed after 3 attempts'), {
      name: 'AI_RetryError',
      lastError: Object.assign(new Error('het cho'), { statusCode: 429 }),
    }),
  ];

  test.each(cases.map((error, index) => [index, error]))(
    'loi %i: het han muc thi phai la UPSTREAM',
    (_index, error) => {
      expect(isRateLimited(error)).toBe(true);
      expect(classifyFailure(error)).toBe('UPSTREAM');
    },
  );

  test('loi schema van la SCHEMA cho du co ma 429 dinh kem', () => {
    // Thu tu xet quan trong: SCHEMA duoc xet TRUOC han muc. Mot model tra JSON sai
    // cau truc la tin hieu "model nay qua yeu", va no khong duoc bi che lap boi mot
    // ma trang thai.
    const error = Object.assign(new Error('response did not match schema'), {
      statusCode: 429,
    });
    expect(classifyFailure(error)).toBe('SCHEMA');
  });
});

describe('schemaIssues', () => {
  /// Hình dạng thật đã đo trên ai@7.0.58: NoObjectGeneratedError bọc
  /// AI_TypeValidationError, và ZodError nằm thêm một tầng nữa bên dưới.
  const noObjectGenerated = (issues: unknown): Error =>
    Object.assign(aiError('AI_NoObjectGeneratedError'), {
      cause: Object.assign(aiError('AI_TypeValidationError'), {
        cause: { issues },
      }),
    });

  test('bóc được path, code và message của từng chỗ lệch', () => {
    const error = noObjectGenerated([
      {
        path: ['starAnswers', 0, 'result'],
        code: 'too_big',
        message: 'Too big: expected string to have <=400 characters',
      },
      {
        path: ['likelyProbes'],
        code: 'invalid_type',
        message: 'Invalid input: expected array, received undefined',
      },
    ]);

    expect(schemaIssues(error)).toEqual([
      {
        path: 'starAnswers.0.result',
        code: 'too_big',
        message: 'Too big: expected string to have <=400 characters',
      },
      {
        path: 'likelyProbes',
        code: 'invalid_type',
        message: 'Invalid input: expected array, received undefined',
      },
    ]);
  });

  test('lệch ở gốc thì path rỗng, phải nói ra chứ không để trống', () => {
    const error = noObjectGenerated([
      { path: [], code: 'invalid_type', message: 'expected object' },
    ]);
    expect(schemaIssues(error)[0]?.path).toBe('(gốc)');
  });

  test('bóc được cả khi lỗi bị RetryError bọc ngoài', () => {
    const error = Object.assign(aiError('AI_RetryError'), {
      lastError: noObjectGenerated([
        { path: ['a'], code: 'too_small', message: 'quá ngắn' },
      ]),
    });
    expect(schemaIssues(error)).toEqual([
      { path: 'a', code: 'too_small', message: 'quá ngắn' },
    ]);
  });

  test('JSON hỏng hẳn thì không có issues, trả mảng rỗng thay vì ném', () => {
    expect(schemaIssues(aiError('AI_NoObjectGeneratedError'))).toEqual([]);
    expect(schemaIssues(new Error('lỗi thường'))).toEqual([]);
    expect(schemaIssues(undefined)).toEqual([]);
  });
});
