import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type LoadedCommand = {
  /** Tên file không đuôi, ví dụ "apply" cho `apply.md`. */
  name: string;
  /** Toàn bộ nội dung kịch bản, đưa thẳng vào system prompt. */
  body: string;
  contentHash: string;
};

/**
 * Nạp kịch bản nhiều bước từ `.claude/commands/`.
 *
 * Đây là **cùng bộ file mà Claude Code chạy khi người dùng gõ `/apply`**, và đó
 * là chủ đích: sửa quy trình một chỗ thì cả hai runtime đổi theo. Trước đây chỉ
 * `.claude/skills/` được nạp (tri thức), còn quy trình thì backend viết lại
 * bằng TypeScript - và hai bản đã bắt đầu trôi khỏi nhau.
 *
 * Chép gần như nguyên `SkillRegistryService`, KHÔNG gộp chung: skill là tri
 * thức nhồi vào prompt của một lượt gọi, còn command là kịch bản điều khiển cả
 * một vòng lặp. Chúng có vòng đời và cách dùng khác nhau, gộp lại chỉ để tiết
 * kiệm ba chục dòng thì sau này mỗi lần sửa một bên phải đọc cả hai.
 */
@Injectable()
export class CommandRegistryService {
  private readonly logger = new Logger(CommandRegistryService.name);
  private readonly commands = new Map<string, LoadedCommand>();
  private readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('agent.commandsDir')!;
  }

  /**
   * Nạp theo yêu cầu chứ không nạp lúc khởi động, và cache lại sau lần đầu.
   *
   * Khác skill ở chỗ này vì lý do thực tế: skill được nhồi vào MỌI lượt gọi nên
   * phải sẵn trong bộ nhớ, còn command chỉ đọc khi có người chạy agent - mà
   * phần lớn lượt chạy của app không phải agent.
   */
  async get(name: string): Promise<LoadedCommand> {
    const cached = this.commands.get(name);
    if (cached) return cached;

    // Chặn đi ra ngoài thư mục: tên kịch bản đến từ HTTP request.
    if (!/^[a-z0-9-]{1,60}$/i.test(name)) {
      throw new NotFoundException(`Tên kịch bản không hợp lệ: ${name}`);
    }

    let body: string;
    try {
      body = await readFile(join(this.dir, `${name}.md`), 'utf8');
    } catch {
      throw new NotFoundException(
        `Không tìm thấy kịch bản "${name}" trong ${this.dir}`,
      );
    }

    const command: LoadedCommand = {
      name,
      body,
      contentHash: createHash('sha256').update(body).digest('hex').slice(0, 12),
    };
    this.commands.set(name, command);
    this.logger.log(
      `Nạp kịch bản ${name} (${body.length} ký tự, hash ${command.contentHash})`,
    );
    return command;
  }

  /** Tên các kịch bản đang có, cho giao diện dựng danh sách. */
  async list(): Promise<string[]> {
    try {
      const entries = await readdir(this.dir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name.replace(/\.md$/, ''))
        .sort();
    } catch {
      this.logger.error(`Không đọc được thư mục kịch bản: ${this.dir}`);
      return [];
    }
  }

  /** Xoá cache. Dùng khi sửa kịch bản mà không muốn khởi động lại app. */
  reload(): void {
    this.commands.clear();
  }
}
