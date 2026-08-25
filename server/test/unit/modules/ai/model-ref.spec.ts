import { formatModelRef, parseModelRef } from 'src/modules/ai/model-ref.js';

/*
 * Cách mã hoá `lõi/model` chỉ an toàn nhờ MỘT sự thật đã đo: model id của
 * OpenCode không cái nào chứa dấu `/` (91/91), còn model id của OpenRouter thì
 * cái nào cũng chứa (351/351). Vì thế phải tách ở dấu `/` ĐẦU TIÊN, và tiền tố
 * chỉ được coi là tên lõi khi nó thật sự là một lõi đã khai.
 *
 * Chỗ dễ hỏng nhất nằm ở test "tiền tố lạ": dán `nvidia/nemotron-3.5-lightning:free`
 * vào .env mà quên tiền tố lõi thì hệ thống KHÔNG được hiểu "nvidia" là một lõi.
 */

const KNOWN = ['opencode', 'openrouter'];
const parse = (raw: string) => parseModelRef(raw, KNOWN, 'opencode');

describe('parseModelRef', () => {
  test('không có tiền tố thì thuộc lõi mặc định — .env kiểu cũ vẫn chạy', () => {
    expect(parse('deepseek-v4-flash-free')).toEqual({
      providerId: 'opencode',
      modelId: 'deepseek-v4-flash-free',
    });
  });

  test('tách ở dấu / ĐẦU TIÊN, phần còn lại giữ nguyên dấu / của model id', () => {
    expect(parse('openrouter/openai/gpt-oss-20b:free')).toEqual({
      providerId: 'openrouter',
      modelId: 'openai/gpt-oss-20b:free',
    });
  });

  test('tiền tố KHÔNG phải tên lõi thì cả chuỗi là model id', () => {
    // Đây là ca hỏng thật sự: id của OpenRouter luôn có dạng `hãng/model`, nên
    // nếu "nvidia" bị nhận nhầm là lõi thì lỗi báo ra sẽ là "không biết lõi
    // nvidia" — trỏ sai hoàn toàn chỗ cần sửa.
    expect(parse('nvidia/nemotron-3.5-lightning:free')).toEqual({
      providerId: 'opencode',
      modelId: 'nvidia/nemotron-3.5-lightning:free',
    });
  });

  test('tên lõi nhưng không có model đi kèm thì không nhận là lõi', () => {
    expect(parse('openrouter/')).toEqual({
      providerId: 'opencode',
      modelId: 'openrouter/',
    });
  });

  test('bỏ khoảng trắng thừa — .env hay có dấu cách sau dấu phẩy', () => {
    expect(parse('  openrouter/openai/gpt-oss-20b:free  ').modelId).toBe(
      'openai/gpt-oss-20b:free',
    );
  });
});

describe('formatModelRef', () => {
  test('đi vòng lại ra đúng chuỗi ban đầu', () => {
    const raw = 'openrouter/openai/gpt-oss-20b:free';
    expect(formatModelRef(parse(raw))).toBe(raw);
  });

  test('hai cách viết cùng một model cho ra CÙNG dạng đầy đủ', () => {
    // `AiService.modelChain` dựa vào đúng tính chất này để không thử lại model
    // vừa hết hạn mức ngay ở mắt xích kế tiếp.
    expect(formatModelRef(parse('deepseek-v4-flash-free'))).toBe(
      formatModelRef(parse('opencode/deepseek-v4-flash-free')),
    );
  });
});
