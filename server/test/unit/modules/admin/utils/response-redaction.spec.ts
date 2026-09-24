import {
  isPersonalPurpose,
  visibleResponse,
} from 'src/modules/admin/utils/response-redaction.js';

describe('visibleResponse', () => {
  test('che mọi lời gọi gắn với người dùng, kể cả match.evaluate', () => {
    expect(
      visibleResponse(
        { purpose: 'match.evaluate', userId: 'u1' },
        '{"note":"Ứng viên từng làm ở BVBank"}',
      ),
    ).toEqual({ responseText: null, responseRedacted: true });
  });

  test.each([
    'document.cv',
    'profile.synthesize',
    'interview.turn',
    'question.answer',
  ])('che %s kể cả khi không còn userId (tài khoản đã xoá)', (purpose) => {
    expect(visibleResponse({ purpose, userId: null }, '{"x":1}')).toEqual({
      responseText: null,
      responseRedacted: true,
    });
  });

  test.each(['skill.canonicalize', 'job.requirements', 'company.brief'])(
    'giữ nguyên phản hồi của %s vì không thuộc về ai',
    (purpose) => {
      expect(
        visibleResponse({ purpose, userId: null }, '{"decisions":[]}'),
      ).toEqual({ responseText: '{"decisions":[]}', responseRedacted: false });
    },
  );

  test('không có phản hồi thì không báo là đã che', () => {
    expect(
      visibleResponse({ purpose: 'document.cv', userId: 'u1' }, null),
    ).toEqual({ responseText: null, responseRedacted: false });
  });

  test('so theo tiền tố có dấu chấm, không bắt nhầm tên na ná', () => {
    expect(isPersonalPurpose('documents-export')).toBe(false);
  });
});
