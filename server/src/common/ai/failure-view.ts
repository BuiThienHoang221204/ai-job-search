import { HttpException } from '@nestjs/common';
import { classifyFailure, type FailureKind } from './failure-kind';

export function withFailureKind<T extends { error: string | null }>(
  row: T,
): Omit<T, 'error'> & { failureKind: FailureKind | null } {
  const { error, ...rest } = row;
  return {
    ...rest,
    failureKind: error ? classifyFailure(error) : null,
  };
}

/** HttpException giữ nguyên câu; lỗi khác chỉ gửi phân loại, lỗi thô nằm lại trong log và DB. */
export function streamFailureEvent(error: unknown): {
  type: 'error';
  message: string;
  failureKind?: FailureKind;
} {
  if (error instanceof HttpException) {
    return { type: 'error', message: error.message };
  }
  return {
    type: 'error',
    message: 'Không hoàn thành được tác vụ.',
    failureKind: classifyFailure(error),
  };
}
