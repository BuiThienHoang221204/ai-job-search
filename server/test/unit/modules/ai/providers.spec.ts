import configuration from 'src/config/configuration.js';
import {
  PROVIDERS,
  findProvider,
  providerIds,
} from 'src/modules/ai/providers/index.js';
import { kilo } from 'src/modules/ai/providers/kilo.js';
import { opencode } from 'src/modules/ai/providers/opencode.js';
import { openrouter } from 'src/modules/ai/providers/openrouter.js';

/*
 * Mỗi lõi một file, và thêm lõi mới là thêm một file rồi một dòng trong
 * `index.ts`. Rẻ như vậy thì cũng dễ quên: file mới mà không khai key trong
 * `configuration.ts` sẽ tạo ra một lõi KHÔNG BAO GIỜ chạy được, và nó hỏng một
 * cách im lặng — chuỗi dự phòng chỉ ghi một dòng warn rồi đi tiếp.
 *
 * Test cuối file đóng đúng khe đó.
 */

describe('Sổ đăng ký lõi', () => {
  test('id không trùng nhau', () => {
    expect(new Set(providerIds()).size).toBe(PROVIDERS.length);
  });

  test('tra cứu được theo id, id lạ thì trả undefined', () => {
    expect(findProvider('openrouter')).toBe(openrouter);
    expect(findProvider('khong-ton-tai')).toBeUndefined();
  });

  test('MỌI lõi đã khai đều có key tương ứng trong configuration', () => {
    // Thiếu một dòng ở đây nghĩa là lõi đó luôn bị bỏ qua với lý do "chưa có
    // API key", kể cả khi người dùng đã đặt biến môi trường đúng tên.
    const apiKeys = configuration().ai.apiKeys;
    for (const provider of PROVIDERS) {
      expect(Object.keys(apiKeys)).toContain(provider.id);
    }
  });

  test('lõi nào cũng nói được tên biến môi trường chứa key của nó', () => {
    for (const provider of PROVIDERS) {
      expect(provider.apiKeyEnv).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});

describe('Lõi openrouter — đọc capability từ gateway', () => {
  const entry = (params: string[]) => ({ supported_parameters: params });

  test('khai structured_outputs thì nhận', () => {
    expect(
      openrouter.declaresStructuredOutput!(
        entry(['response_format', 'structured_outputs', 'tools']),
      ),
    ).toBe(true);
  });

  test('có response_format nhưng KHÔNG có structured_outputs thì từ chối', () => {
    // Đây đúng là hình dạng của `google/gemma-4-31b-it:free`, và phân biệt được
    // hai trường này mới là điểm mấu chốt: nhiều model nhận response_format
    // nhưng không giữ nổi schema.
    expect(
      openrouter.declaresStructuredOutput!(entry(['response_format', 'tools'])),
    ).toBe(false);
  });

  test('gateway không trả supported_parameters thì coi như từ chối', () => {
    expect(openrouter.declaresStructuredOutput!({})).toBe(false);
    expect(
      openrouter.declaresStructuredOutput!({ supported_parameters: null }),
    ).toBe(false);
  });
});

describe('Lõi kilo — có lời khai nhưng KHÔNG tin', () => {
  test('cố ý không đọc capability, dù /models của kilo có trả supported_parameters', () => {
    /*
     * Đây là chỗ khác OpenRouter, và khác vì một phép đo chứ không vì quên.
     *
     * `tencent/hy3:free` khai `structured_outputs: false` nhưng vẫn trả JSON
     * hợp lệ trên prompt thật, và nó cho kết quả tiếng Việt SẠCH NHẤT trong tất
     * cả model đã thử. Bật bộ lọc theo lời khai ở lõi này là tự loại đúng model
     * tốt nhất. Ai định "cho nhất quán với openrouter" thì đọc lại dòng này.
     */
    expect(kilo.declaresStructuredOutput).toBeUndefined();
  });

  test('chỉ chặn những model đã ĐO là hỏng', () => {
    expect(kilo.knownNoStructuredOutput).toContain(
      'stepfun/step-3.7-flash:free',
    );
    expect(kilo.knownNoStructuredOutput).not.toContain('tencent/hy3:free');
  });
});

describe('Lõi opencode — mù về capability', () => {
  test('KHÔNG có hàm đọc capability, và đó là sự thật về gateway chứ không phải thiếu sót', () => {
    // `GET /zen/v1/models` chỉ trả id, object, created, owned_by. Ngày nào
    // gateway khai thêm thì thêm hàm vào đây; tới lúc đó test này đỏ và đó là
    // lời nhắc đúng chỗ.
    expect(opencode.declaresStructuredOutput).toBeUndefined();
  });

  test('giữ danh sách model đã ĐO là không giữ nổi structured output', () => {
    expect(opencode.knownNoStructuredOutput).toContain('laguna-s-2.1-free');
    expect(opencode.knownNoStructuredOutput).toContain('ling-3.0-tiny-free');
  });

  test('danh sách đó là danh sách CHẶN, không phải danh sách cho phép', () => {
    // Model chính vẫn phải chạy được. Nếu ai đó biến chỗ này thành danh sách
    // cho phép thì mọi model chưa kịp đo sẽ bị khoá ra ngoài.
    expect(opencode.knownNoStructuredOutput).not.toContain(
      'deepseek-v4-flash-free',
    );
  });
});
