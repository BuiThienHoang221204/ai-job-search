import type { Storage } from '@/modules/storage/storage.interface';

export class FakeStorage implements Storage {
  readonly files = new Map<string, Buffer>();

  read(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (!file) return Promise.reject(new Error(`Không có file: ${key}`));
    return Promise.resolve(file);
  }

  size(key: string): Promise<number | null> {
    return Promise.resolve(this.files.get(key)?.length ?? null);
  }

  move(from: string, to: string): Promise<void> {
    const file = this.files.get(from);
    if (!file) return Promise.reject(new Error(`Không có file: ${from}`));
    this.files.set(to, file);
    this.files.delete(from);
    return Promise.resolve();
  }

  uploadUrl(key: string): Promise<string> {
    return Promise.resolve(`https://storage.test/upload/${key}`);
  }

  downloadUrl(key: string): Promise<string> {
    return Promise.resolve(`https://storage.test/download/${key}`);
  }

  deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) this.files.delete(key);
    }
    return Promise.resolve();
  }
}
