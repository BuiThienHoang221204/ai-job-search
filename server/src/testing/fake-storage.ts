import type { Storage } from '@/modules/storage/storage.interface';

export class FakeStorage implements Storage {
  readonly files = new Map<string, Buffer>();

  read(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (!file) return Promise.reject(new Error(`Không có file: ${key}`));
    return Promise.resolve(file);
  }

  write(key: string, data: Buffer | string): Promise<void> {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    this.files.set(key, buffer);
    return Promise.resolve();
  }
}
