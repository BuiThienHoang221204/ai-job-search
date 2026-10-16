import { estimateTokens } from 'src/common/ai/token-estimate.js';

describe('estimateTokens', () => {
  test('3,5 ký tự/token cộng 1.200 token cho JSON Schema bơm vào prompt', () => {
    expect(estimateTokens('a'.repeat(350), 'b'.repeat(350))).toBe(1400);
  });

  test.each([
    ['tin tiếng Việt (Kế toán thuế)', 9285, 3607],
    ['tin tiếng Anh (Senior Backend)', 16746, 4975],
  ])(
    'không ước THẤP hơn số token Groq đếm thật: %s',
    (_label, chars, groqTokens) => {
      expect(estimateTokens('x'.repeat(chars), '')).toBeGreaterThanOrEqual(
        groqTokens,
      );
    },
  );

  test('prompt dài cỡ một lượt tìm hiểu công ty (~30.000 ký tự) bị ước vượt trần 8.000 TPM của Groq', () => {
    expect(estimateTokens('x'.repeat(30_000), '')).toBeGreaterThan(8000);
  });
});
