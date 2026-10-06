import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import matter from 'gray-matter';
import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { normalizeCards, normalizeDetail } from '../utils/normalize';
import type {
  PortalEntry,
  PortalJobCard,
  PortalJobDetail,
  SearchArgs,
} from '../types';
import { messageOf } from '@/common/error-message';

const run = promisify(execFile);

const REST_AFTER_CALL_MS = 1_200;

export const BLOCKED_COOLDOWN_MS = 30 * 60_000;

const delayFrom = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null;

const occupationsFrom = (raw: unknown): string[] | null =>
  Array.isArray(raw) &&
  raw.length > 0 &&
  raw.every((item) => typeof item === 'string' && item.trim().length > 0)
    ? raw
    : null;

export function portalKeyFrom(directory: string): string {
  return directory.replace(/-(search|jobs|portal)$/, '');
}

export function evaluateCandidate(input: {
  directory: string;
  hasSkillFile: boolean;
  hasCli: boolean;
  frontmatter: {
    enabled?: unknown;
    jobAge?: unknown;
    delayMs?: unknown;
    occupations?: unknown;
    description?: unknown;
  };
}): { entry: PortalEntry } | { skip: string } {
  if (!input.hasSkillFile) return { skip: 'không có SKILL.md' };
  if (!input.hasCli) return { skip: 'không có cli/src/cli.ts' };

  const enabled = input.frontmatter.enabled !== false;

  return {
    entry: {
      key: portalKeyFrom(input.directory),
      directory: input.directory,
      cliPath: `.agents/skills/${input.directory}/cli/src/cli.ts`,
      enabled,
      supportsJobAge: input.frontmatter.jobAge === true,
      delayMs: delayFrom(input.frontmatter.delayMs),
      occupations: occupationsFrom(input.frontmatter.occupations),
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

@Injectable()
export class PortalCliService implements OnModuleInit {
  private readonly logger = new Logger(PortalCliService.name);
  private readonly repoRoot: string;
  private readonly portalsDir: string;
  private readonly timeoutMs: number;
  private readonly delayMs: number;
  private portals = new Map<string, PortalEntry>();

  private lastCallAt = new Map<string, number>();

  private lastDoneAt = new Map<string, number>();

  private blockedUntil = new Map<string, number>();

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

  private async pace(portal: string): Promise<void> {
    const now = Date.now();
    const started = this.lastCallAt.get(portal);
    const finished = this.lastDoneAt.get(portal);

    const delayMs = this.portals.get(portal)?.delayMs ?? this.delayMs;
    const wait = Math.max(
      started === undefined ? 0 : delayMs - (now - started),
      finished === undefined ? 0 : REST_AFTER_CALL_MS - (now - finished),
    );
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));

    this.lastCallAt.set(portal, Date.now());
  }

  /** Chốt DUY NHẤT chạm portal — mọi `search`/`detail` đi qua đây nên luôn được giữ nhịp. */
  private async invoke<T>(portal: string, args: string[]): Promise<T> {
    const config = this.portals.get(portal);
    if (!config) {
      const available = this.listPortals().join(', ') || 'không có portal nào';
      throw new Error(
        `Portal chưa được đăng ký: ${portal}. Đang có: ${available}`,
      );
    }

    const blockedUntil = this.blockedUntil.get(portal) ?? 0;
    if (blockedUntil > Date.now()) {
      throw new Error(
        `${portal}: đang tạm ngừng tới ${new Date(blockedUntil).toISOString()} vì portal trả trang chống bot (BLOCKED)`,
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
      const message = messageOf(error);
      const stderr = (error as { stderr?: string }).stderr ?? '';
      const parsed = stderr.trim().startsWith('{')
        ? (JSON.parse(stderr.trim()) as { error?: string; code?: string })
        : null;
      if (parsed?.code === 'BLOCKED') {
        this.blockedUntil.set(portal, Date.now() + BLOCKED_COOLDOWN_MS);
        this.logger.warn(
          `${portal} trả trang chống bot; tạm ngừng gọi ${BLOCKED_COOLDOWN_MS / 60_000} phút`,
        );
      }
      throw new Error(
        parsed
          ? `${portal}: ${parsed.error} (${parsed.code})`
          : `${portal}: ${message}`,
      );
    } finally {
      this.lastDoneAt.set(portal, Date.now());
    }
  }

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
