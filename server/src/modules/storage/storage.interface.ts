export const STORAGE = Symbol('STORAGE');

export interface Storage {
  read(key: string): Promise<Buffer>;
  write(key: string, data: Buffer | string): Promise<void>;
}

export const userKey = (userId: string, ...segments: string[]): string =>
  [userId, ...segments].join('/');
