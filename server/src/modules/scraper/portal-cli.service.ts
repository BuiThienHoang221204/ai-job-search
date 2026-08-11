import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import matter from 'gray-matter';
import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { normalizeCards, normalizeDetail } from './normalize.js';
import { evaluateCandidate, type PortalEntry } from './portal-registry.js';

const run = promisify(execFile);

export type PortalJobCard = {
  id: string;
  slug: string;
  title: string;
  company: string | null;
  companyUrl: string | null;
  /// Ảnh logo công ty. Chỉ topcv và vietnamworks có; itviec và linkedin không
  /// đưa logo ra trang danh sách, nên null là chuyện bình thường chứ không
  /// phải lỗi - giao diện tự lùi về ô chữ cái đầu.
  companyLogo: string | null;
  location: string | null;
  workMode: string | null;
  salary: string | null;
  postedAt: string | null;
  tags: string[];
  url: string;
  /// Có giá trị khi portal trả sẵn mô tả ngay trong kết quả tìm kiếm.
  ///
  /// VietnamWorks gọi API JSON nên có; ITviec và TopCV phải tải thêm trang chi
  /// tiết. Phía gọi thấy trường này khác null thì bỏ hẳn request `detail` -
  /// nhanh gấp đôi và bớt một chỗ có thể hỏng.
  description?: string | null;
};

export type PortalJobDetail = PortalJobCard & { description: string | null };

export type SearchArgs = {
  query?: string;
  location?: string;
  remote?: 'remote' | 'hybrid' | 'onsite';
  page?: number;
  limit?: number;
};

/// Chạy CLI tìm việc trong .agents/skills/.
///
/// Danh sách portal được QUÉT lúc khởi động chứ không khai cứng trong code:
/// thêm một portal = thêm một thư mục có SKILL.md và cli/src/cli.ts. Cách này
/// cũng tôn trọng cờ `enabled:` trong frontmatter, nên tắt một portal không
/// cần sửa code và không cần build lại.
///
/// AN TOÀN: dùng execFile với MẢNG tham số, không bao giờ nối chuỗi vào shell.
/// Từ khóa tìm kiếm do model sinh ra, nên một chuỗi kiểu `react"; rm -rf /` là
/// khả năng thật chứ không phải giả định. Với mảng tham số và shell mặc định
/// tắt, chuỗi đó chỉ là một từ khóa vô hại.
@Injectable()
export class PortalCliService implements OnModuleInit {
  private readonly logger = new Logger(PortalCliService.name);
  private readonly repoRoot: string;
  private readonly portalsDir: string;
  private readonly timeoutMs: number;
  private readonly delayMs: number;
  private portals = new Map<string, PortalEntry>();

  /// Thời điểm gọi portal gần nhất, dùng để giữ nhịp. Theo TỪNG portal chứ
  /// không phải một mốc chung: chờ ITviec không có lý do gì để hoãn LinkedIn.
  private lastCallAt = new Map<string, number>();

  constructor(config: ConfigService) {
    this.repoRoot = resolve(process.cwd(), '..');
    this.portalsDir = config.get<string>('scraper.portalsDir')!;
    this.timeoutMs = config.get<number>('scraper.timeoutMs') ?? 60_000;
    this.delayMs = config.get<number>('scraper.portalDelayMs') ?? 3_000;
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /// Quét lại thư mục portal. Gọi được lúc chạy để nhận portal mới mà không
  /// phải khởi động lại máy chủ.
  async reload(): Promise<PortalEntry[]> {
    const found = new Map<string, PortalEntry>();

    // Khai kiểu tường minh: readdir có nhiều overload và suy kiểu tự động sẽ
    // chọn nhánh trả về Buffer, khiến entry.name thành Buffer chứ không phải
    // chuỗi.
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

  /// Giữ nhịp giữa hai lần gọi cùng một portal.
  private async pace(portal: string): Promise<void> {
    const last = this.lastCallAt.get(portal);
    if (last !== undefined) {
      const wait = this.delayMs - (Date.now() - last);
      if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    }
    this.lastCallAt.set(portal, Date.now());
  }

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
        // Giới hạn output để một trang hỏng không làm phình bộ nhớ.
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      this.logger.debug(
        `${portal} ${args[0]} xong sau ${Date.now() - started}ms`,
      );
      return JSON.parse(stdout) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // CLI ghi lỗi ra stderr dưới dạng JSON; lấy ra cho dễ đọc.
      const stderr = (error as { stderr?: string }).stderr ?? '';
      const parsed = stderr.trim().startsWith('{')
        ? (JSON.parse(stderr.trim()) as { error?: string; code?: string })
        : null;
      throw new Error(
        parsed
          ? `${portal}: ${parsed.error} (${parsed.code})`
          : `${portal}: ${message}`,
      );
    }
  }

  /// Kết quả đi qua `normalizeCards` vì bốn CLI KHÔNG cùng hình dạng đầu ra:
  /// itviec/topcv/vietnamworks trả mảng trần, còn linkedin trả
  /// `{ meta, results }` và gọi `postedAt` là `date`. Xem normalize.ts.
  async search(portal: string, args: SearchArgs): Promise<PortalJobCard[]> {
    const argv = ['search', '--format', 'json'];
    if (args.query) argv.push('--query', args.query);
    if (args.location) argv.push('--location', args.location);
    if (args.remote) argv.push('--remote', args.remote);
    if (args.page) argv.push('--page', String(args.page));
    if (args.limit) argv.push('--limit', String(args.limit));
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
