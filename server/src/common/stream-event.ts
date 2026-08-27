export type ModelStreamEvent<T> =
  | { type: 'partial'; data: unknown }
  | { type: 'done'; result: T }
  | { type: 'error'; message: string };
