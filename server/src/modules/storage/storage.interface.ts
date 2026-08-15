export const STORAGE = Symbol('STORAGE');

export type StoredFile = {
  key: string;
  size: number;
  updatedAt: Date;
};

/** Trừu tượng hóa nơi lưu trữ file của người dùng. */
export interface Storage {
  read(key: string): Promise<Buffer>;
  readText(key: string): Promise<string>;
  write(key: string, data: Buffer | string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<StoredFile[]>;
  delete(key: string): Promise<void>;
}

/** Ghép đường dẫn trong workspace của một người dùng. */
export const userKey = (userId: string, ...segments: string[]): string =>
  [userId, ...segments].join('/');
