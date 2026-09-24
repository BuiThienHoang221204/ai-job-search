/*
 * Test đơn vị cho `AiService` — phần duy nhất trong chuỗi gọi model từ trước tới
 * nay chỉ được kiểm gián tiếp qua e2e, mà e2e thì thay hẳn nó bằng `FakeAi`.
 *
 * VỀ CÁCH MOCK: `jest.mock('ai', ...)` với factory, chứ không `jest.spyOn`. Các
 * export của một module ESM không cấu hình lại được, nên `jest.spyOn(ai, ...)`
 * ném "Cannot redefine property: generateObject" — đã thử để chắc, chứ không suy
 * từ tài liệu. Factory thì chặn từ trước khi module được nạp.
 *
 * `NoObjectGeneratedError` lấy từ `jest.requireActual('ai')` — dùng lớp lỗi THẬT.
 * Nếu tự dựng một object có `isInstance` thì nhánh ghi log "model trả về gì" sẽ
 * được kiểm bằng chính giả định của test, tức là không kiểm gì cả.
 */
const actualAi = jest.requireActual<typeof import('ai')>('ai');

/// Khai kiểu tham số thay vì `jest.fn()` trần: `mock.calls[i][0]` của một mock
/// không kiểu là `any`, và đọc `.model.id` trên đó vừa mất kiểm tra kiểu vừa bị
/// eslint chặn (`no-unsafe-member-access`).
type GenerateObjectArgs = {
  model: { id: string };
  system: string;
  maxRetries: number;
  abortSignal?: AbortSignal;
};

/// Thứ tự tham số kiểu là `<TrảVề, ThamSố[]>`, KHÔNG phải một kiểu hàm:
/// `jest.fn<(a) => b>()` biên dịch được nhưng để `Y` mặc định là `any[]`, và khi
/// đó `mock.calls[i][0]` là `any` — eslint đỏ, còn kiểm tra kiểu thì mất.
const generateObjectMock = jest.fn<Promise<unknown>, [GenerateObjectArgs]>();

type StreamObjectArgs = {
  model: { id: string };
  system: string;
};

type FakeStream = {
  partialObjectStream: AsyncIterable<unknown>;
  object: Promise<unknown>;
};

const streamObjectMock = jest.fn<FakeStream, [StreamObjectArgs]>();

jest.mock('ai', () => ({
  generateObject: (args: GenerateObjectArgs) => generateObjectMock(args),
  streamText: jest.fn(),
  streamObject: (args: StreamObjectArgs) => streamObjectMock(args),
  NoObjectGeneratedError: actualAi.NoObjectGeneratedError,
}));

/// Ghi lại `supportsStructuredOutputs` của mỗi lần dựng provider: đó là thứ
/// quyết định gateway có nhận `response_format` hay không.
const providerCalls: Array<{ supportsStructuredOutputs?: boolean }> = [];

jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: (options: {
    supportsStructuredOutputs?: boolean;
  }) => {
    providerCalls.push(options);
    return (id: string) => ({ id });
  },
}));

import { z } from 'zod';
import { AiService } from 'src/modules/ai/services/ai.service.js';
import type { ModelCatalogService } from 'src/modules/ai/services/model-catalog.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';

const SCHEMA = z.object({ diem: z.number() });
const CONTEXT = { purpose: 'match.evaluate', userId: 'u1' };

const call = (modelId?: string) => ({
  schema: SCHEMA,
  system: 'Bạn là người đánh giá.',
  prompt: 'Chấm điểm tin này.',
  context: CONTEXT,
  modelId,
});

/// Lỗi hết hạn mức đúng như gateway free trả về.
const rateLimit = (model: string) =>
  Object.assign(new Error(`FreeUsageLimitError cho ${model}`), {
    statusCode: 429,
  });

const formatUnsupported = () =>
  new Error('This response_format type is unavailable now');

/// Model nói hết câu nhưng nói bằng văn xuôi — đúng hình dạng lỗi đã gặp thật
/// ngày 2026-09-22 khi OmniRoute định tuyến sang `ds-web`.
const proseInsteadOfJson = () =>
  new actualAi.NoObjectGeneratedError({
    message: 'No object generated: could not parse the response.',
    text: 'Dear FPT hiring team, I am writing to apply...',
    response: { id: 'r1', timestamp: new Date(0), modelId: 'a-free' },
    usage: {
      inputTokens: 10,
      outputTokens: 648,
      totalTokens: 658,
      inputTokenDetails: {
        noCacheTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokenDetails: { textTokens: 648, reasoningTokens: 0 },
    },
    finishReason: 'stop',
  });

const fakeStream = (
  partials: unknown[],
  object: Promise<unknown>,
): FakeStream => ({
  partialObjectStream: (async function* () {
    for (const partial of partials) yield await Promise.resolve(partial);
  })(),
  object,
});

const drain = async (partials: AsyncIterable<unknown>) => {
  const seen: unknown[] = [];
  for await (const partial of partials) seen.push(partial);
  return seen;
};

type Recorded = {
  modelId: string;
  ok: boolean;
  failureKind: string | null;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  purpose: string;
  userId: string | null;
};

function build(options?: {
  fallbackModelIds?: string[];
  structuredOutputs?: boolean;
  recordFails?: boolean;
  /// `false` = lõi chỉ ÁP DỤNG được một chế độ ép định dạng (omniroute).
  honorsResponseFormat?: boolean;
  /// `true` = model NÀY đã đo là stream ra JSON parse dần được.
  streamsJson?: boolean;
}) {
  const recorded: Recorded[] = [];

  const prisma = {
    aiCall: {
      create: ({ data }: { data: Recorded }) => {
        if (options?.recordFails) {
          return Promise.reject(new Error('bảng AiCall hỏng'));
        }
        recorded.push(data);
        return Promise.resolve(data);
      },
    },
  } as unknown as PrismaService;

  const catalog = {
    // Bản giả trả về CHÍNH id được yêu cầu, nên assert theo `recorded[i].modelId`
    // là đọc được thứ tự model đã thử.
    resolve: (modelId?: string) =>
      Promise.resolve({
        providerId: 'opencode',
        model: { id: modelId ?? 'model-mac-dinh', name: modelId ?? 'mặc định' },
        baseURL: 'https://gateway.test/v1',
        apiKey: 'public',
        // `languageModel` đọc `headers['User-Agent']`. Thiếu khoá này thì cả
        // suite đỏ với `Cannot read properties of undefined`, và bản thật của
        // `ModelCatalogService` luôn trả về ít nhất `{}`.
        headers: {},
        honorsResponseFormat: options?.honorsResponseFormat ?? true,
        streamsJson: options?.streamsJson ?? false,
      }),
  } as unknown as ModelCatalogService;

  const config = {
    get: (key: string) => {
      if (key === 'ai.structuredOutputs')
        return options?.structuredOutputs ?? true;
      if (key === 'ai.fallbackModelIds') return options?.fallbackModelIds ?? [];
      return undefined;
    },
  } as unknown as ConfigService;

  return { service: new AiService(catalog, prisma, config), recorded };
}

/// Tham số `generateObject` của lần gọi thứ n.
const argsOf = (index: number): GenerateObjectArgs =>
  generateObjectMock.mock.calls[index][0];

beforeEach(() => {
  generateObjectMock.mockReset();
  streamObjectMock.mockReset();
  providerCalls.length = 0;
});

describe('AiService.generateObject - chuỗi dự phòng khi hết hạn mức', () => {
  test('hết hạn mức thì ĐỔI MODEL theo đúng thứ tự và trả về kết quả của model chạy được', async () => {
    generateObjectMock
      .mockRejectedValueOnce(rateLimit('a-free'))
      .mockRejectedValueOnce(rateLimit('b-free'))
      .mockResolvedValueOnce({ object: { diem: 7 }, usage: {} });

    const { service } = build({ fallbackModelIds: ['b-free', 'c-free'] });

    const result = await service.generateObject(call('a-free'));

    expect(result).toEqual({ object: { diem: 7 }, modelId: 'c-free' });
    expect(
      generateObjectMock.mock.calls.map((_, i) => argsOf(i).model.id),
    ).toEqual(['a-free', 'b-free', 'c-free']);
  });

  test('KHÔNG thử lại chính model vừa hết hạn mức, dù nó nằm trong danh sách dự phòng', async () => {
    // Model mặc định thường cũng có trong danh sách dự phòng. Thử lại đúng nó chỉ
    // tốn thêm một round-trip vào một hạn mức đã biết là hết.
    generateObjectMock
      .mockRejectedValueOnce(rateLimit('a-free'))
      .mockResolvedValueOnce({ object: { diem: 1 }, usage: {} });

    const { service } = build({
      fallbackModelIds: ['a-free', 'b-free'],
    });

    await service.generateObject(call('a-free'));

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(argsOf(1).model.id).toBe('b-free');
  });

  test('lỗi KHÔNG phải hạn mức thì ném NGAY, không đổi model', async () => {
    /*
     * Nhánh quan trọng nhất của cả file.
     *
     * Đổi model vì một lỗi schema sẽ che mất tín hiệu "model này quá yếu cho tác
     * vụ", và lặng lẽ chuyển cả hệ thống sang model khác mà không ai quyết định.
     * Sau đó nhật ký chỉ còn cho thấy model cuối cùng hỏng.
     */
    const schemaError = new Error('response did not match schema');
    generateObjectMock.mockRejectedValue(schemaError);

    const { service } = build({ fallbackModelIds: ['b-free', 'c-free'] });

    await expect(service.generateObject(call('a-free'))).rejects.toBe(
      schemaError,
    );
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  test('hết hạn mức toàn chuỗi thì ném lỗi hạn mức CUỐI cùng', async () => {
    const cuoi = rateLimit('c-free');
    generateObjectMock
      .mockRejectedValueOnce(rateLimit('a-free'))
      .mockRejectedValueOnce(rateLimit('b-free'))
      // `mockRejectedValue` chứ không `...Once` cho lần cuối: hai assert dưới đây
      // gọi service hai lần, và một chuỗi chỉ toàn `Once` sẽ cạn ở lần thứ hai rồi
      // trả về `undefined` — test đỏ vì hết dữ liệu xếp sẵn, không vì code sai.
      .mockRejectedValue(cuoi);

    const { service } = build({ fallbackModelIds: ['b-free', 'c-free'] });

    // Nếu vòng lặp ném `undefined` thì `rejects.toBe` vẫn xanh với undefined,
    // nên kiểm cả kiểu lỗi.
    await expect(service.generateObject(call('a-free'))).rejects.toBe(cuoi);
    await expect(service.generateObject(call('a-free'))).rejects.toThrow(
      /FreeUsageLimitError/,
    );
  });

  test('không có model dự phòng nào thì chỉ thử một lần', async () => {
    const loi = rateLimit('a-free');
    generateObjectMock.mockRejectedValue(loi);

    const { service } = build({ fallbackModelIds: [] });

    await expect(service.generateObject(call('a-free'))).rejects.toBe(loi);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  test('mọi lần thử trong chuỗi đều được ghi nhật ký', async () => {
    // Nếu chỉ ghi lần cuối thì màn Admin không cho biết model nào đã hết hạn
    // mức, mà đó chính là thông tin để quyết định đổi model mặc định.
    generateObjectMock
      .mockRejectedValueOnce(rateLimit('a-free'))
      .mockResolvedValueOnce({ object: { diem: 3 }, usage: {} });

    const { service, recorded } = build({ fallbackModelIds: ['b-free'] });

    await service.generateObject(call('a-free'));

    expect(recorded.map((row) => [row.modelId, row.ok])).toEqual([
      ['a-free', false],
      ['b-free', true],
    ]);
    expect(recorded[0].failureKind).toBe('UPSTREAM');
  });
});

describe('AiService - lõi trả 5xx', () => {
  /*
   * Nhánh này sinh ra từ một lượt hỏng thật ngày 2026-08-22: `agent.reviewer`
   * nhận 500 hai lần liên tiếp và cả tác vụ hỏng, trong khi năm model dự phòng
   * KHÔNG cái nào được thử — vì 5xx không nằm trong danh sách lý do đổi mắt
   * xích. Nghịch lý là 5xx mới là loại hỏng nhất thời nhất trong cả nhóm.
   */
  const serverError = () =>
    Object.assign(
      new Error(
        'Failed after 2 attempts. Last error: AI_APICallError: Internal server error',
      ),
      {
        name: 'AI_RetryError',
        lastError: Object.assign(new Error('Internal server error'), {
          name: 'AI_APICallError',
          statusCode: 500,
        }),
      },
    );

  test('generateObject: 500 thì ĐỔI MODEL', () => {
    generateObjectMock
      .mockRejectedValueOnce(serverError())
      .mockResolvedValueOnce({ object: { diem: 8 }, usage: {} });

    const { service } = build({ fallbackModelIds: ['b-free'] });

    return service.generateObject(call('a-free')).then((result) => {
      expect(result).toEqual({ object: { diem: 8 }, modelId: 'b-free' });
    });
  });

  /// Cả hai lượt phải nằm trong nhật ký, nếu không màn Admin không cho biết
  /// model nào đang ốm.
  test('generateObject: 500 thì ghi CẢ lượt hỏng lẫn lượt xong', async () => {
    generateObjectMock
      .mockRejectedValueOnce(serverError())
      .mockResolvedValueOnce({ object: { diem: 8 }, usage: {} });

    const { service, recorded } = build({ fallbackModelIds: ['b-free'] });
    await service.generateObject(call('a-free'));

    expect(recorded.map((row) => [row.modelId, row.ok])).toEqual([
      ['a-free', false],
      ['b-free', true],
    ]);
    expect(recorded[0].failureKind).toBe('UPSTREAM');
  });

  test('lỗi KHÔNG phải 5xx thì ném NGAY, không đi hết chuỗi', async () => {
    // 400 thì model nào cũng từ chối; chạy hết chuỗi chỉ nhân số lần chờ lên.
    const loi = Object.assign(new Error('bad request'), { statusCode: 400 });
    generateObjectMock.mockRejectedValue(loi);

    const { service } = build({ fallbackModelIds: ['b-free', 'c-free'] });

    await expect(service.generateObject(call('a-free'))).rejects.toBe(loi);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});

describe('AiService - lõi chỉ có MỘT chế độ ép định dạng', () => {
  /// Hỏng thật 2026-09-23 trên `omniroute/auto/smart`: lượt 1 chạy đúng chế độ
  /// `false` (schema bơm vào system prompt) nhưng không ra object, rồi lượt thử
  /// lại ở `true` BỎ luôn phần schema trong prompt — mà omniroute chỉ chuyển
  /// tiếp `response_format` rồi mặc kệ. Model không còn lời nhắc nào về hình
  /// dạng, và lỗi người dùng thấy là "could not parse the response" của lượt
  /// THỨ HAI, che mất lỗi thật của lượt đầu.
  test('generateObject: KHÔNG thử lại ở chế độ kia, ném lỗi của lượt đầu', async () => {
    const loi = proseInsteadOfJson();
    generateObjectMock.mockRejectedValue(loi);

    const { service } = build({ honorsResponseFormat: false });

    await expect(service.generateObject(call('auto/smart'))).rejects.toBe(loi);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  /// Chế độ duy nhất chạy được với lõi này là `false`, và chỉ chế độ đó mới bơm
  /// JSON Schema vào system prompt.
  test('lượt DUY NHẤT đó vẫn mang JSON Schema trong system prompt', async () => {
    generateObjectMock.mockRejectedValue(proseInsteadOfJson());

    const { service } = build({ honorsResponseFormat: false });
    await expect(service.generateObject(call('auto/smart'))).rejects.toThrow();

    expect(argsOf(0).system).toContain('ĐỊNH DẠNG ĐẦU RA BẮT BUỘC');
  });

  /// Đường stream KHÔNG có lưới: phản hồi là `text/event-stream` nên `extractJson`
  /// không chạm tới được. Thử nó trước rồi mới rơi về là trả 28 giây và ~6.800
  /// token cho một hiệu ứng KHÔNG hiện ra — lúc stream hỏng thì giao diện cũng
  /// chỉ quay vòng rồi hiện kết quả một lần, y như đường không stream.
  test('streamObject: KHÔNG gọi stream lấy một lần', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { diem: 7 },
      usage: {},
    });

    const { service } = build({ honorsResponseFormat: false });
    const stream = await service.streamObject(call('auto/smart'));

    // Người gọi nhận đủ object; chỉ mất hiệu ứng chạy dần.
    expect(await drain(stream.partials)).toEqual([]);
    await expect(stream.object).resolves.toEqual({ diem: 7 });

    expect(streamObjectMock).not.toHaveBeenCalled();
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  /// Lượt gọi lại chỉ có nghĩa nếu nó MANG THEO lời nhắc schema — đó là thứ duy
  /// nhất còn giữ định dạng khi lõi bỏ qua `response_format`.
  test('lượt gọi lại vẫn mang JSON Schema trong system prompt', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { diem: 7 },
      usage: {},
    });

    const { service } = build({ honorsResponseFormat: false });
    await service.streamObject(call('auto/smart'));

    expect(argsOf(0).system).toContain('ĐỊNH DẠNG ĐẦU RA BẮT BUỘC');
  });

  test('lượt duy nhất đó hỏng thì ném ra thật, không thử thêm', async () => {
    const loi = proseInsteadOfJson();
    generateObjectMock.mockRejectedValue(loi);

    const { service } = build({ honorsResponseFormat: false });

    await expect(service.streamObject(call('auto/smart'))).rejects.toBe(loi);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  /// Quyết định stream là theo TỪNG MODEL, không theo lõi: cùng lõi omniroute,
  /// `kc/openrouter/free` stream ra JSON sạch còn model khác trả văn xuôi.
  test('model ĐÃ ĐO là stream được thì VẪN stream, dù lõi không ép được định dạng', async () => {
    streamObjectMock.mockReturnValueOnce(
      fakeStream([{ diem: 4 }, { diem: 9 }], Promise.resolve({ diem: 9 })),
    );

    const { service } = build({
      honorsResponseFormat: false,
      streamsJson: true,
    });
    const stream = await service.streamObject(call('kc/openrouter/free'));

    expect(await drain(stream.partials)).toEqual([{ diem: 4 }, { diem: 9 }]);
    expect(streamObjectMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  /// Có trong danh sách mà vẫn hỏng thì vẫn còn lưới, không để mất trắng.
  test('model trong danh sách mà stream hỏng thì rơi về KHÔNG stream', async () => {
    streamObjectMock.mockReturnValueOnce(
      fakeStream([], Promise.reject(proseInsteadOfJson())),
    );
    generateObjectMock.mockResolvedValueOnce({
      object: { diem: 7 },
      usage: {},
    });

    const { service } = build({
      honorsResponseFormat: false,
      streamsJson: true,
    });
    const stream = await service.streamObject(call('kc/openrouter/free'));

    await expect(stream.object).resolves.toEqual({ diem: 7 });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  test('lõi ÁP DỤNG được response_format thì vẫn thử lại như cũ', async () => {
    generateObjectMock
      .mockRejectedValueOnce(proseInsteadOfJson())
      .mockResolvedValueOnce({ object: { diem: 5 }, usage: {} });

    const { service } = build({ honorsResponseFormat: true });

    await service.generateObject(call('a-free'));
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});

describe('AiService.generateObject - chế độ ép định dạng', () => {
  test('gateway từ chối response_format thì đổi chế độ rồi gọi lại', async () => {
    generateObjectMock
      .mockRejectedValueOnce(formatUnsupported())
      .mockResolvedValueOnce({ object: { diem: 5 }, usage: {} });

    const { service } = build({ structuredOutputs: true });

    await service.generateObject(call('a-free'));

    expect(providerCalls.map((c) => c.supportsStructuredOutputs)).toEqual([
      true,
      false,
    ]);
  });

  test('NHỚ chế độ mới cho những lời gọi sau', async () => {
    // Không nhớ thì mỗi lời gọi phải trả giá bằng một lần hỏng — với model free
    // chậm, đó là hàng chục giây mỗi lần.
    generateObjectMock
      .mockRejectedValueOnce(formatUnsupported())
      .mockResolvedValue({ object: { diem: 5 }, usage: {} });

    const { service } = build({ structuredOutputs: true });

    await service.generateObject(call('a-free'));
    await service.generateObject(call('a-free'));

    expect(providerCalls.map((c) => c.supportsStructuredOutputs)).toEqual([
      true,
      false,
      // Lần gọi thứ hai bắt đầu luôn ở chế độ đã học được.
      false,
    ]);
  });

  test('chỉ đổi MỘT lần: chế độ kia cũng hỏng thì ném ra thật', async () => {
    const loi = formatUnsupported();
    generateObjectMock.mockRejectedValue(loi);

    const { service } = build({ structuredOutputs: true });

    await expect(service.generateObject(call('a-free'))).rejects.toBe(loi);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  test('ở chế độ json_object, JSON Schema được bơm vào CUỐI system prompt', async () => {
    /*
     * Bắt buộc chứ không phải cho chắc: ở chế độ đó API không ép cấu trúc, còn
     * system prompt của ta rất dài (cả khung đánh giá lấy từ file skill) nên model
     * bám theo tiêu đề mục trong đó thay vì theo schema. Đã quan sát model trả
     * `eligibility_gate` trong khi schema đòi `eligibility`.
     */
    generateObjectMock.mockResolvedValue({ object: { diem: 5 }, usage: {} });

    const { service } = build({ structuredOutputs: false });
    await service.generateObject(call('a-free'));

    const { system } = argsOf(0);
    expect(system).toContain('Bạn là người đánh giá.');
    expect(system).toContain('ĐỊNH DẠNG ĐẦU RA BẮT BUỘC');
    expect(system).toContain('"diem"');
    // Vị trí quan trọng: phần gần chỗ sinh chữ nhất có sức nặng lớn nhất.
    expect(system.indexOf('ĐỊNH DẠNG ĐẦU RA BẮT BUỘC')).toBeGreaterThan(
      system.indexOf('Bạn là người đánh giá.'),
    );
  });

  test('ở chế độ structured outputs, system prompt KHÔNG bị thêm gì', async () => {
    generateObjectMock.mockResolvedValue({ object: { diem: 5 }, usage: {} });

    const { service } = build({ structuredOutputs: true });
    await service.generateObject(call('a-free'));

    expect(argsOf(0).system).toBe('Bạn là người đánh giá.');
  });
});

describe('AiService.streamObject - lưới đổi chế độ ép định dạng', () => {
  test('chưa phát mảnh nào thì thử lại ở chế độ kia, và người gọi không thấy lần hỏng', async () => {
    streamObjectMock
      .mockReturnValueOnce(fakeStream([], Promise.reject(proseInsteadOfJson())))
      .mockReturnValueOnce(
        fakeStream([{ diem: 4 }, { diem: 9 }], Promise.resolve({ diem: 9 })),
      );

    const { service } = build({ structuredOutputs: true });
    const stream = await service.streamObject(call('a-free'));

    expect(await drain(stream.partials)).toEqual([{ diem: 4 }, { diem: 9 }]);
    await expect(stream.object).resolves.toEqual({ diem: 9 });
    expect(providerCalls.map((c) => c.supportsStructuredOutputs)).toEqual([
      true,
      false,
    ]);
  });

  test('lần thử lại mới bơm JSON Schema vào system prompt', async () => {
    streamObjectMock
      .mockReturnValueOnce(fakeStream([], Promise.reject(proseInsteadOfJson())))
      .mockReturnValueOnce(
        fakeStream([{ diem: 9 }], Promise.resolve({ diem: 9 })),
      );

    const { service } = build({ structuredOutputs: true });
    await service.streamObject(call('a-free'));

    expect(streamObjectMock.mock.calls[0][0].system).toBe(
      'Bạn là người đánh giá.',
    );
    expect(streamObjectMock.mock.calls[1][0].system).toContain(
      'ĐỊNH DẠNG ĐẦU RA BẮT BUỘC',
    );
  });

  test('đã phát một mảnh rồi thì KHÔNG thử lại: trình duyệt đã vẽ nửa câu', async () => {
    const loi = proseInsteadOfJson();
    streamObjectMock.mockReturnValueOnce(
      fakeStream([{ diem: 4 }], Promise.reject(loi)),
    );

    const { service } = build({ structuredOutputs: true });
    const stream = await service.streamObject(call('a-free'));

    expect(await drain(stream.partials)).toEqual([{ diem: 4 }]);
    await expect(stream.object).rejects.toBe(loi);
    expect(streamObjectMock).toHaveBeenCalledTimes(1);
  });

  test('lỗi KHÔNG phải schema thì ném thẳng, không đốt thêm một lượt', async () => {
    const loi = rateLimit('a-free');
    streamObjectMock.mockReturnValueOnce(fakeStream([], Promise.reject(loi)));

    const { service } = build({ structuredOutputs: true });

    await expect(service.streamObject(call('a-free'))).rejects.toBe(loi);
    expect(streamObjectMock).toHaveBeenCalledTimes(1);
  });

  test('chỉ đổi MỘT lần: chế độ kia cũng trả văn xuôi thì ném ra thật', async () => {
    streamObjectMock
      .mockReturnValueOnce(fakeStream([], Promise.reject(proseInsteadOfJson())))
      .mockReturnValueOnce(
        fakeStream([], Promise.reject(proseInsteadOfJson())),
      );

    const { service } = build({ structuredOutputs: true });

    await expect(service.streamObject(call('a-free'))).rejects.toThrow(
      'could not parse the response',
    );
    expect(streamObjectMock).toHaveBeenCalledTimes(2);
  });
});

describe('AiService.generateObject - nhật ký', () => {
  test('thành công thì ghi model thật, purpose, userId và số token', async () => {
    generateObjectMock.mockResolvedValue({
      object: { diem: 9 },
      usage: { inputTokens: 1200, outputTokens: 300 },
    });

    const { service, recorded } = build();
    await service.generateObject(call('a-free'));

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      modelId: 'a-free',
      ok: true,
      purpose: 'match.evaluate',
      userId: 'u1',
      inputTokens: 1200,
      outputTokens: 300,
    });
  });

  test('thiếu usage thì ghi null, không ghi 0', async () => {
    // 0 token là một con số sai chứ không phải "không biết", và nó làm lệch mọi
    // phép tính chi phí sau này.
    generateObjectMock.mockResolvedValue({ object: { diem: 9 } });

    const { service, recorded } = build();
    await service.generateObject(call('a-free'));

    expect(recorded[0].inputTokens).toBeNull();
    expect(recorded[0].outputTokens).toBeNull();
  });

  test('thất bại thì ghi failureKind và thông báo, rồi VẪN ném lỗi', async () => {
    generateObjectMock.mockRejectedValue(
      new Error('Operation was aborted due to timeout'),
    );

    const { service, recorded } = build();

    await expect(service.generateObject(call('a-free'))).rejects.toThrow();
    expect(recorded[0]).toMatchObject({ ok: false, failureKind: 'TIMEOUT' });
    expect(recorded[0].errorMessage).toContain('aborted');
  });

  test('thông báo lỗi dài bị cắt trước khi ghi xuống DB', async () => {
    // Thông báo của AI SDK nhét cả response thô vào, có thể dài vài chục nghìn ký tự.
    generateObjectMock.mockRejectedValue(new Error('x'.repeat(5000)));

    const { service, recorded } = build();

    await expect(service.generateObject(call('a-free'))).rejects.toThrow();
    expect(recorded[0].errorMessage!.length).toBeLessThan(1000);
  });

  test('GHI NHẬT KÝ HỎNG không được làm hỏng lời gọi', async () => {
    // Nhật ký là thứ yếu. Ném lỗi ở đó biến sự cố của một bảng phụ thành sự cố
    // của cả tính năng.
    generateObjectMock.mockResolvedValue({ object: { diem: 4 }, usage: {} });

    const { service } = build({ recordFails: true });

    await expect(service.generateObject(call('a-free'))).resolves.toEqual({
      object: { diem: 4 },
      modelId: 'a-free',
    });
  });

  test('lỗi NoObjectGeneratedError thật được phân loại là SCHEMA', async () => {
    // Dùng lớp lỗi thật của SDK: nếu tên lớp đổi ở bản sau, `classifyFailure`
    // nhận theo `name` sẽ lặng lẽ xếp mọi lỗi schema thành OTHER, và test này đỏ.
    generateObjectMock.mockRejectedValue(
      new actualAi.NoObjectGeneratedError({
        message: 'No object generated',
        text: '{"diem": "chín"}',
        response: { id: 'r1', timestamp: new Date(0), modelId: 'a-free' },
        // `LanguageModelUsage` của ai@7 đòi cả hai trường `*TokenDetails`. Bỏ
        // chúng thì `jest` vẫn xanh (ts-jest không bật diagnostics) nhưng `tsc`
        // đỏ — nên đừng "gọn hoá" lại.
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          inputTokenDetails: {
            noCacheTokens: 10,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 5, reasoningTokens: 0 },
        },
        finishReason: 'stop',
      }),
    );

    const { service, recorded } = build();

    await expect(service.generateObject(call('a-free'))).rejects.toThrow();
    expect(recorded[0].failureKind).toBe('SCHEMA');
  });
});

describe('AiService.generateObject - tham số truyền xuống SDK', () => {
  test('LUÔN có abortSignal', async () => {
    // Gateway free không trả 429 khi quá tải, nó chỉ chậm dần — đã đo một lần gọi
    // kéo dài 517 giây. Thiếu hạn này thì một job ôm chỗ worker suốt thời gian đó.
    generateObjectMock.mockResolvedValue({ object: { diem: 5 }, usage: {} });

    const { service } = build();
    await service.generateObject(call('a-free'));

    expect(argsOf(0).abortSignal).toBeInstanceOf(AbortSignal);
  });

  test('maxRetries mặc định là 2, và caller đổi được', async () => {
    generateObjectMock.mockResolvedValue({ object: { diem: 5 }, usage: {} });

    const { service } = build();
    await service.generateObject(call('a-free'));
    await service.generateObject({ ...call('a-free'), maxRetries: 0 });

    expect(argsOf(0).maxRetries).toBe(2);
    expect(argsOf(1).maxRetries).toBe(0);
  });

  test('timeout của caller được tôn trọng', async () => {
    /*
     * Dùng timeout THẬT nhưng cực ngắn, không dùng `jest.useFakeTimers`.
     *
     * Đã thử đồng hồ giả và nó không chạy: `AbortSignal.timeout` hẹn giờ bằng
     * timer nội bộ của Node chứ không qua `setTimeout` toàn cục mà jest thay
     * thế, nên `advanceTimersByTime` không làm signal abort — test đỏ vì cách đo
     * sai, không vì code sai.
     */
    let signal: AbortSignal | undefined;
    generateObjectMock.mockImplementation(
      (args: { abortSignal?: AbortSignal }) => {
        signal = args.abortSignal;
        return Promise.resolve({ object: { diem: 5 }, usage: {} });
      },
    );

    const { service } = build();
    await service.generateObject({ ...call('a-free'), timeoutMs: 5 });

    expect(signal!.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(signal!.aborted).toBe(true);
  });
});
