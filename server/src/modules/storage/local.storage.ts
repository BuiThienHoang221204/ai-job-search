import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Dirent } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';
import type { Storage, StoredFile } from './storage.interface.js';

@Injectable()
export class LocalStorage implements Storage {
  private readonly logger = new Logger(LocalStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('storage.localRoot')!);
  }

  /**
   * Chặn path traversal. Key đến từ tên công ty / chức danh do LLM sinh ra,
   * nên một key dạng "../../server/.env" là khả năng thật chứ không phải giả
   * định.
   */
  private resolveKey(key: string): string {
    const normalised = key.replace(/\\/g, '/');
    if (normalised.startsWith('/') || /^[a-zA-Z]:/.test(normalised)) {
      throw new Error(`Storage key phải là đường dẫn tương đối: ${key}`);
    }

    const target = resolve(this.root, ...normalised.split('/').filter(Boolean));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error(`Storage key thoát ra ngoài workspace: ${key}`);
    }
    return target;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async readText(key: string): Promise<string> {
    return readFile(this.resolveKey(key), 'utf8');
  }

  async write(key: string, data: Buffer | string): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    this.logger.debug(`Ghi ${key}`);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<StoredFile[]> {
    const base = this.resolveKey(prefix);
    const results: StoredFile[] = [];

    const walk = async (dir: string, keyPrefix: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const childKey = posix.join(keyPrefix, entry.name);
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), childKey);
        } else {
          const info = await stat(join(dir, entry.name));
          results.push({
            key: childKey,
            size: info.size,
            updatedAt: info.mtime,
          });
        }
      }
    };

    await walk(base, prefix.replace(/\\/g, '/'));
    return results;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { recursive: true, force: true });
  }
}
