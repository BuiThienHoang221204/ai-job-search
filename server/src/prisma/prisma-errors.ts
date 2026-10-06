import { Prisma } from '../generated/prisma/client';

export const PRISMA_ERROR = {
  UNIQUE_VIOLATION: 'P2002',
  FOREIGN_KEY_VIOLATION: 'P2003',
  RECORD_NOT_FOUND: 'P2025',
} as const;

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_ERROR.UNIQUE_VIOLATION
  );
}
