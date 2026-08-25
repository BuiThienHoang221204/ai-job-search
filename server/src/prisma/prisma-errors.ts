import { Prisma } from '../generated/prisma/client.js';

/** Mã lỗi Prisma mà tầng HTTP cần phân biệt. */
export const PRISMA_ERROR = {
  /** Vi phạm ràng buộc unique. */
  UNIQUE_VIOLATION: 'P2002',
  /** Khoá ngoại trỏ tới bản ghi không tồn tại. */
  FOREIGN_KEY_VIOLATION: 'P2003',
  /** update/delete trên bản ghi không còn ở đó. */
  RECORD_NOT_FOUND: 'P2025',
} as const;

/** Lỗi này có phải do vi phạm ràng buộc unique hay không. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_ERROR.UNIQUE_VIOLATION
  );
}
