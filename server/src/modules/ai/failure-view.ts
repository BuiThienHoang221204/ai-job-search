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
