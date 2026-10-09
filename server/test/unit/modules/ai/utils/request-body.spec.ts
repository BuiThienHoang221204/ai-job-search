import { rewriteRequestBody } from 'src/modules/ai/utils/request-body.js';

const body = (value: Record<string, unknown>) => JSON.stringify(value);
const parse = (value: string) => JSON.parse(value) as Record<string, unknown>;
const none = { explicitStreamFlag: false, dropJsonMode: false };

describe('rewriteRequestBody', () => {
  it('bỏ JSON mode cho lõi tự kiểm JSON (Groq): để app tự bóc JSON thay vì nhận 400', () => {
    const out = parse(
      rewriteRequestBody(
        body({ model: 'm', response_format: { type: 'json_object' } }),
        { ...none, dropJsonMode: true },
      ),
    );
    expect(out).not.toHaveProperty('response_format');
    expect(out.model).toBe('m');
  });

  it('giữ nguyên json_schema: chỉ bỏ json_object', () => {
    const format = { type: 'json_schema', json_schema: { name: 'x' } };
    const out = parse(
      rewriteRequestBody(body({ response_format: format }), {
        ...none,
        dropJsonMode: true,
      }),
    );
    expect(out.response_format).toEqual(format);
  });

  it('lõi không bật cờ thì gửi nguyên văn', () => {
    const original = body({ response_format: { type: 'json_object' } });
    expect(rewriteRequestBody(original, none)).toBe(original);
  });

  it('thêm stream: false khi chưa có, không ghi đè khi đã có', () => {
    const flag = { ...none, explicitStreamFlag: true };
    expect(parse(rewriteRequestBody(body({}), flag)).stream).toBe(false);
    expect(parse(rewriteRequestBody(body({ stream: true }), flag)).stream).toBe(
      true,
    );
  });

  it('thân không phải JSON thì gửi nguyên văn', () => {
    expect(
      rewriteRequestBody('không-phải-json', {
        explicitStreamFlag: true,
        dropJsonMode: true,
      }),
    ).toBe('không-phải-json');
  });
});
