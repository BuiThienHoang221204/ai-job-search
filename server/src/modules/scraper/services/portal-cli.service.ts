import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import matter from 'gray-matter';
import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { normalizeCards, normalizeDetail } from '../utils/normalize.js';
import type {
  PortalEntry,
  PortalJobCard,
  PortalJobDetail,
  SearchArgs,
} from '../types.js';

const run = promisify(execFile);

/** Nghỉ sau khi một lượt CLI XONG, chồng lên nhịp giữa hai lần gọi — lượt chạy lâu vẫn phải nghỉ chứ không đi tiếp ngay. */
const REST_AFTER_CALL_MS = 1_200;

/** Suy khoá portal từ tên thư mục skill. */
export function portalKeyFrom(directory: string): string {
  return directory.replace(/-(search|jobs|portal)$/, '');
}

/** Một thư mục skill có đủ điều kiện làm portal hay không. Thiếu `enabled` là BẬT, vì portal cũ không khai trường này. */
export function evaluateCandidate(input: {
  directory: string;
  hasSkillFile: boolean;
  hasCli: boolean;
  frontmatter: { enabled?: unknown; jobAge?: unknown; description?: unknown };
}): { entry: PortalEntry } | { skip: string } {
  if (!input.hasSkillFile) return { skip: 'không có SKILL.md' };
  if (!input.hasCli) return { skip: 'không có cli/src/cli.ts' };

  const raw = input.frontmatter.enabled;
  const enabled = raw === undefined || raw === null ? true : raw !== false;

  return {
    entry: {
      key: portalKeyFrom(input.directory),
      directory: input.directory,
      cliPath: `.agents/skills/${input.directory}/cli/src/cli.ts`,
      enabled,
      supportsJobAge: input.frontmatter.jobAge === true,
      description:
        typeof input.frontmatter.description === 'string'
          ? input.frontmatter.description
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 200)
          : '',
    },
  };
}

/** Lấy tin BẰNG CÁCH NÀO: adapter duy nhất của SEAM 5 — chạy CLI trong `.agents/skills/` và giữ nhịp chống chặn IP. */
@Injectable()
export class PortalCliService implements OnModuleInit {
  private readonly logger = new Logger(PortalCliService.name);
  private readonly repoRoot: string;
  private readonly portalsDir: string;
  private readonly timeoutMs: number;
  private readonly delayMs: number;
  private portals = new Map<string, PortalEntry>();

  /** Nhịp theo TỪNG portal chứ không phải một mốc chung: chờ ITviec không có lý do gì để hoãn LinkedIn. */
  private lastCallAt = new Map<string, number>();

  /** Mốc KẾT THÚC, tách khỏi mốc bắt đầu — hai mốc cho ra hai ràng buộc khác nhau, xem `pace`. */
  private lastDoneAt = new Map<string, number>();

  constructor(config: ConfigService) {
    this.repoRoot = resolve(process.cwd(), '..');
    this.portalsDir = config.get<string>('scraper.portalsDir')!;
    this.timeoutMs = config.get<number>('scraper.timeoutMs') ?? 60_000;
    this.delayMs = config.get<number>('scraper.portalDelayMs') ?? 3_000;
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Quét lại thư mục portal lúc đang chạy, không cần khởi động lại máy chủ. */
  async reload(): Promise<PortalEntry[]> {
    const found = new Map<string, PortalEntry>();

    let entries: Dirent[];
    try {
      entries = await readdir(this.portalsDir, { withFileTypes: true });
    } catch {
      this.logger.error(`Không đọc được thư mục portal: ${this.portalsDir}`);
      this.portals = found;
      return [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dir = join(this.portalsDir, entry.name);
      const skillFile = join(dir, 'SKILL.md');
      const cliFile = join(dir, 'cli', 'src', 'cli.ts');

      const [raw, hasCli] = await Promise.all([
        readFile(skillFile, 'utf8').catch(() => null),
        stat(cliFile).then(
          () => true,
          () => false,
        ),
      ]);

      const result = evaluateCandidate({
        directory: entry.name,
        hasSkillFile: raw !== null,
        hasCli,
        frontmatter: raw ? matter(raw).data : {},
      });

      if ('skip' in result) {
        this.logger.debug(`Bỏ qua ${entry.name}: ${result.skip}`);
        continue;
      }
      if (!result.entry.enabled) {
        this.logger.log(`Portal ${result.entry.key} đang tắt (enabled: false)`);
        continue;
      }
      found.set(result.entry.key, result.entry);
    }

    this.portals = found;
    this.logger.log(
      found.size
        ? `Portal sẵn sàng: ${[...found.keys()].join(', ')}`
        : 'Không tìm thấy portal nào',
    );
    return [...found.values()];
  }

  listPortals(): string[] {
    return [...this.portals.keys()];
  }

  describePortals(): PortalEntry[] {
    return [...this.portals.values()];
  }

  has(portal: string): boolean {
    return this.portals.has(portal);
  }

  /** HAI ràng buộc chồng nhau: cách lần GỌI trước `delayMs`, và cách lần XONG trước `REST_AFTER_CALL_MS`. */
  private async pace(portal: string): Promise<void> {
    const now = Date.now();
    const started = this.lastCallAt.get(portal);
    const finished = this.lastDoneAt.get(portal);

    const wait = Math.max(
      started === undefined ? 0 : this.delayMs - (now - started),
      finished === undefined ? 0 : REST_AFTER_CALL_MS - (now - finished),
    );
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));

    this.lastCallAt.set(portal, Date.now());
  }

  /** Chốt chặn DUY NHẤT chạm portal — mọi `search` và `detail` đều qua đây, nên nhịp không phụ thuộc người gọi có nhớ hay không. */
  private async invoke<T>(portal: string, args: string[]): Promise<T> {
    const config = this.portals.get(portal);
    if (!config) {
      const available = this.listPortals().join(', ') || 'không có portal nào';
      throw new Error(
        `Portal chưa được đăng ký: ${portal}. Đang có: ${available}`,
      );
    }

    await this.pace(portal);
    const started = Date.now();
    try {
      const { stdout } = await run('bun', ['run', config.cliPath, ...args], {
        cwd: this.repoRoot,
        timeout: this.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      this.logger.debug(
        `${portal} ${args[0]} xong sau ${Date.now() - started}ms`,
      );
      return JSON.parse(stdout) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stderr = (error as { stderr?: string }).stderr ?? '';
      const parsed = stderr.trim().startsWith('{')
        ? (JSON.parse(stderr.trim()) as { error?: string; code?: string })
        : null;
      throw new Error(
        parsed
          ? `${portal}: ${parsed.error} (${parsed.code})`
          : `${portal}: ${message}`,
      );
    } finally {
      this.lastDoneAt.set(portal, Date.now());
    }
  }

  /** Bốn CLI KHÔNG cùng hình dạng đầu ra: ba cái trả mảng trần, linkedin trả `{ meta, results }` và gọi `postedAt` là `date`. */
  async search(portal: string, args: SearchArgs): Promise<PortalJobCard[]> {
    const argv = ['search', '--format', 'json'];
    if (args.query) argv.push('--query', args.query);
    if (args.location) argv.push('--location', args.location);
    if (args.remote) argv.push('--remote', args.remote);
    if (args.page) argv.push('--page', String(args.page));
    if (args.limit) argv.push('--limit', String(args.limit));
    if (args.postedWithinDays && this.portals.get(portal)?.supportsJobAge)
      argv.push('--jobage', String(args.postedWithinDays));
    return normalizeCards(await this.invoke<unknown>(portal, argv));
  }

  async detail(portal: string, slug: string): Promise<PortalJobDetail> {
    const payload = await this.invoke<unknown>(portal, [
      'detail',
      slug,
      '--format',
      'json',
    ]);
    const detail = normalizeDetail(payload);
    if (!detail) {
      throw new Error(`${portal}: dữ liệu chi tiết không hợp lệ cho ${slug}`);
    }
    return detail;
  }
}
