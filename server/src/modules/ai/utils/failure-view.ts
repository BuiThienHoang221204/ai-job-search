import { HttpException } from '@nestjs/common';
import { classifyFailure, type FailureKind } from './failure-kind.js';

/** Đổi chuỗi lỗi THÔ thành phân loại, trước khi trả cho người dùng cuối. */
export function withFailureKind<
  T extends { error?: string | null; status?: unknown },
>(row: T): Omit<T, 'error'> & { failureKind: FailureKind | null } {
  const { error, ...rest } = row;
  return {
    ...rest,
    failureKind: error ? classifyFailure(error) : null,
  };
}

/** Dạng danh sách của `withFailureKind`. */
export function withFailureKinds<
  T extends { error?: string | null; status?: unknown },
>(rows: T[]): Array<Omit<T, 'error'> & { failureKind: FailureKind | null }> {
  return rows.map(withFailureKind);
}

/** Sự kiện lỗi của luồng NDJSON gửi cho người dùng cuối. */
// HttpException là câu ta cố ý nói với người dùng nên giữ nguyên; còn lại chỉ gửi phân loại, lỗi thô (tên model, gateway) nằm lại trong log và DB.
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
