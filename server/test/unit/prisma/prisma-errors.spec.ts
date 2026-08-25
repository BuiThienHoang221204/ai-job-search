import { Prisma } from 'src/generated/prisma/client.js';
import { isUniqueViolation } from 'src/prisma/prisma-errors.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('lỗi giả lập', {
    code,
    clientVersion: 'test',
  });

describe('isUniqueViolation', () => {
  test('nhận ra P2002', () => {
    expect(isUniqueViolation(prismaError('P2002'))).toBe(true);
  });

  /// Quan trọng: KHÔNG được nhận nhầm mã khác thành trùng khoá. P2025 là "không
  /// tìm thấy bản ghi" - trả 409 cho nó thì người dùng được bảo là "đã tồn tại"
  /// trong khi thực tế là không có gì cả.
  test('bỏ qua các mã lỗi Prisma khác', () => {
    for (const code of ['P2025', 'P2003', 'P1001']) {
      expect(isUniqueViolation(prismaError(code))).toBe(false);
    }
  });

  test('bỏ qua lỗi thường và giá trị không phải lỗi', () => {
    expect(isUniqueViolation(new Error('P2002'))).toBe(false);
    expect(isUniqueViolation({ code: 'P2002' })).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
