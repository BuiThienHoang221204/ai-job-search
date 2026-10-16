import type { FailureKind } from './ai/failure-kind';

export type ModelStreamEvent<T> =
  | { type: 'partial'; data: unknown }
  | { type: 'done'; result: T }
  | {
      type: 'error';
      message: string;
      failureKind?: FailureKind;
      statusCode?: number;
    };
