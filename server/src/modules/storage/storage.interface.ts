export const STORAGE = Symbol('STORAGE');

export interface Storage {
  read(key: string): Promise<Buffer>;
  size(key: string): Promise<number | null>;
  move(from: string, to: string): Promise<void>;
  uploadUrl(key: string, contentType: string): Promise<string>;
  downloadUrl(key: string, filename: string): Promise<string>;
}

export const userKey = (userId: string, ...segments: string[]): string =>
  [userId, ...segments].join('/');
