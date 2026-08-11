export const STORAGE = Symbol('STORAGE');

export type StoredFile = {
  key: string;
  size: number;
  updatedAt: Date;
};

/// Trừu tượng hóa nơi lưu trữ file của người dùng.
///
/// Mọi `key` đều bắt đầu bằng userId, ví dụ "clx123/cv/main_google_swe.tex".
/// LocalStorage ánh xạ key thành workspaces/<key>; S3Storage sau này dùng chính
/// key đó làm object key. Nhờ vậy chuyển từ ổ đĩa lên cloud chỉ là đổi driver,
/// không sửa một dòng logic nghiệp vụ nào.
export interface Storage {
  read(key: string): Promise<Buffer>;
  readText(key: string): Promise<string>;
  write(key: string, data: Buffer | string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<StoredFile[]>;
  delete(key: string): Promise<void>;
}

/// Ghép đường dẫn trong workspace của một người dùng.
export const userKey = (userId: string, ...segments: string[]): string =>
  [userId, ...segments].join('/');
