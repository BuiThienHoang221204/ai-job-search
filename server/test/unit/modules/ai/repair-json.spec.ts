import { z } from 'zod';
import { repairJsonText, topLevelKeys } from 'src/modules/ai/repair-json.js';
import { evaluationSchema } from 'src/modules/matching/schemas/evaluation.schema.js';

/// Nguyên văn `mimo-v2.5-free` trả về cho `match.evaluate` ngày 2026-08-19: đủ
/// và đúng tên mọi trường, chỉ lồng nhầm tầng rồi đóng 5 dấu ngoặc ở cuối.
const NESTED_EVALUATION = `{"eligibility":{"verdict":"PASS","quote":"","note":"Ứng viên là công dân Việt Nam và vị trí tuyển dụng đặt tại Việt Nam."},"technical":{"score":40,"note":"Vị trí yêu cầu Java và Spring Boot, ứng viên chủ yếu dùng Node.js.","experience":{"score":50,"note":"Ứng viên có 4 năm kinh nghiệm Backend nhưng không phải trên Java.","behavioral":{"score":75,"note":"Ứng viên có kinh nghiệm Docker, phù hợp môi trường Agile.","career":{"score":60,"note":"Vị trí Senior tại ngân hàng lớn có thể là một bước tiến.","location":{"pass":true,"note":"Ứng viên ở TP.HCM và sẵn sàng chuyển nơi ở."},"strengths":["Ứng viên có 4 năm kinh nghiệm phát triển Backend với API và microservices."],"gaps":["Vị trí đòi kinh nghiệm Java và Spring Boot mà hồ sơ chưa có."],"recommendation":"Nên cân nhắc kỹ vì khác biệt lớn về công nghệ chính."} } } } }`;

const evaluationKeys = topLevelKeys(evaluationSchema);

describe('topLevelKeys', () => {
  test('đọc tên trường tầng ngoài cùng của schema object', () => {
    expect(evaluationKeys).toContain('technical');
    expect(evaluationKeys).toContain('recommendation');
    expect(evaluationKeys).not.toContain('score');
  });

  test('schema không phải object thì không có trường nào', () => {
    expect(topLevelKeys(z.string())).toEqual([]);
  });
});

describe('repairJsonText', () => {
  test('kéo các trường bị lồng nhầm tầng ra ngoài cùng', () => {
    const repaired = repairJsonText(NESTED_EVALUATION, evaluationKeys);
    expect(repaired).not.toBeNull();

    const parsed = evaluationSchema.parse(JSON.parse(repaired!));
    expect(parsed.technical.score).toBe(40);
    expect(parsed.experience.score).toBe(50);
    expect(parsed.behavioral.score).toBe(75);
    expect(parsed.career.score).toBe(60);
    expect(parsed.location.pass).toBe(true);
    expect(parsed.strengths).toHaveLength(1);
  });

  test('trường bị kéo ra không còn sót lại ở tầng trong', () => {
    const repaired = repairJsonText(NESTED_EVALUATION, evaluationKeys)!;
    const technical = (JSON.parse(repaired) as Record<string, unknown>)
      .technical as Record<string, unknown>;

    expect(Object.keys(technical).sort()).toEqual(['note', 'score']);
  });

  test('bóc rào ```json và lời dẫn quanh object', () => {
    const text = 'Đây là kết quả:\n```json\n{"a":1}\n```\nHy vọng giúp ích.';
    expect(repairJsonText(text, ['a'])).toBe('{"a":1}');
  });

  test('đóng nốt ngoặc cho phản hồi bị cắt giữa chừng', () => {
    const text = '{"a":{"b":[1,2';
    expect(repairJsonText(text, ['a'])).toBe('{"a":{"b":[1,2]}}');
  });

  test('đóng nốt cả dấu nháy khi bị cắt giữa một chuỗi', () => {
    const text = '{"a":"chưa viết xong';
    expect(repairJsonText(text, ['a'])).toBe('{"a":"chưa viết xong"}');
  });

  test('gỡ một tầng bọc thừa', () => {
    const text = '{"result":{"a":1,"b":2}}';
    expect(repairJsonText(text, ['a', 'b'])).toBe('{"a":1,"b":2}');
  });

  test('không gỡ bọc khi tên trường đó là trường thật của schema', () => {
    const text = '{"result":{"a":1}}';
    expect(repairJsonText(text, ['result'])).toBeNull();
  });

  test('JSON đã đúng thì không sửa gì', () => {
    expect(repairJsonText('{"a":1}', ['a'])).toBeNull();
  });

  test('không có object nào thì chịu thua', () => {
    expect(repairJsonText('Xin lỗi, tôi không thể trả lời.', ['a'])).toBeNull();
  });

  test('JSON hỏng thật thì chịu thua thay vì đoán', () => {
    expect(repairJsonText('{"a": , }', ['a'])).toBeNull();
  });
});
