import { z } from 'zod';
import type { GenerateObjectOptions } from 'src/modules/ai/services/ai.types.js';
import { FAKE_MODEL_ID, FakeAi } from 'src/testing/fake-ai.js';

const schema = z.object({ score: z.number(), note: z.string() });

const call = (
  purpose = 'test.purpose',
): GenerateObjectOptions<z.infer<typeof schema>> => ({
  schema,
  system: 'system prompt',
  prompt: 'user prompt',
  context: { purpose, userId: 'u1' },
});

describe('FakeAi', () => {
  test('trả về object đã xếp sẵn kèm modelId giả', async () => {
    const ai = new FakeAi().willReturn({ score: 80, note: 'ổn' });

    await expect(ai.generateObject(call())).resolves.toEqual({
      object: { score: 80, note: 'ổn' },
      modelId: FAKE_MODEL_ID,
    });
  });

  test('ghi lại tác vụ và prompt của từng lần gọi', async () => {
    const ai = new FakeAi().willReturn(
      { score: 1, note: 'a' },
      { score: 2, note: 'b' },
    );

    await ai.generateObject(call('match.evaluate'));
    await ai.generateObject(call('document.generate'));

    expect(ai.calls.map((entry) => entry.purpose)).toEqual([
      'match.evaluate',
      'document.generate',
    ]);
    expect(ai.calls[0]).toMatchObject({ userId: 'u1', prompt: 'user prompt' });
  });

  test('trả kết quả theo đúng thứ tự đã xếp', async () => {
    const ai = new FakeAi().willReturn(
      { score: 1, note: 'a' },
      { score: 2, note: 'b' },
    );

    const first = await ai.generateObject(call());
    const second = await ai.generateObject(call());

    expect(first.object.score).toBe(1);
    expect(second.object.score).toBe(2);
    expect(ai.pending).toBe(0);
  });

  /// Đây là tính chất quan trọng nhất của bản giả này. Nếu nó chỉ cast thay vì
  /// parse, một test có thể xếp hình dạng mà model thật không bao giờ trả được
  /// rồi vẫn xanh - trong khi production đỏ.
  test('từ chối object không khớp schema', async () => {
    const ai = new FakeAi().willReturn({ score: 'tám mươi' });

    await expect(ai.generateObject(call())).rejects.toThrow();
  });

  test('ném lỗi khi không còn kết quả xếp sẵn, không trả giá trị mặc định', async () => {
    const ai = new FakeAi();

    await expect(ai.generateObject(call('match.evaluate'))).rejects.toThrow(
      /không có kết quả xếp sẵn/,
    );
  });

  test('willFail cho phép thử nhánh thất bại', async () => {
    const boom = new Error('gateway timeout');
    const ai = new FakeAi().willFail(boom);

    await expect(ai.generateObject(call())).rejects.toBe(boom);
    // Lần gọi thất bại vẫn phải được ghi lại: nhánh lỗi cũng cần khẳng định
    // rằng nó đã thực sự gọi model.
    expect(ai.calls).toHaveLength(1);
  });
});
