import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  SandboxError,
  type SandboxErrorKind,
  type SandboxResult,
  type SandboxRunner,
  type SandboxSpec,
} from './sandbox.interface.js';

/// Bao lâu thì bỏ cuộc chờ `docker version`. Kiểm tra sẵn sàng phải nhanh, vì nó
/// nằm trên đường `/ready` — probe treo còn tệ hơn probe báo hỏng.
const AVAILABILITY_TIMEOUT_MS = 5_000;

/// Mức mặc định, đo trên một lượt compile CV thật: 512MB và 1 CPU là đủ, lượt chạy
/// mất khoảng 5 giây.
const DEFAULT_MEMORY_MB = 512;
const DEFAULT_CPUS = 1;

type Spawned = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

@Injectable()
export class DockerSandbox implements SandboxRunner {
  private readonly logger = new Logger(DockerSandbox.name);

  async available(): Promise<boolean> {
    try {
      const result = await this.spawn(
        ['version', '--format', '{{.Server.Version}}'],
        AVAILABILITY_TIMEOUT_MS,
      );
      return result.code === 0;
    } catch {
      return false;
    }
  }

  async run(spec: SandboxSpec): Promise<SandboxResult> {
    const work = await mkdtemp(join(tmpdir(), 'aijob-sandbox-'));

    /*
     * Tên container đặt tường minh thay vì để Docker tự sinh.
     *
     * `docker run --rm` chỉ xoá container khi tiến trình client kết thúc BÌNH
     * THƯỜNG. Khi hết giờ và ta giết client, container vẫn chạy tiếp và vẫn giữ
     * 512MB — một lượt compile treo trở thành một container bị bỏ rơi. Có tên thì
     * mới `docker rm -f` được nó.
     */
    const name = `aijob-${randomUUID()}`;

    try {
      for (const [path, content] of Object.entries(spec.files)) {
        const target = join(work, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }

      const result = await this.spawn(
        this.dockerArgs(name, work, spec),
        spec.timeoutMs,
      );

      if (result.timedOut) {
        await this.forceRemove(name);
        throw new SandboxError(
          'TIMEOUT',
          `Lượt chạy vượt ${spec.timeoutMs}ms và đã bị huỷ`,
        );
      }

      return {
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        artifacts: await this.collect(work, spec.artifacts),
      };
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      throw new SandboxError(classify(error), messageOf(error));
    } finally {
      // Dọn thư mục tạm dù thành công hay không. `force` để không nổ khi thư mục đã
      // biến mất, `maxRetries` vì Windows đôi khi còn giữ handle một nhịp.
      await rm(work, { recursive: true, force: true, maxRetries: 3 }).catch(
        (error: unknown) =>
          this.logger.warn(`Không dọn được ${work}: ${messageOf(error)}`),
      );
    }
  }

  /**
   * Tham số của `docker run`.
   *
   * Bốn thứ ở đây là **bảo mật**, không phải tối ưu:
   *
   * - `--network none`: LaTeX và trình duyệt trong sandbox không được ra mạng. Đây
   *   là lớp chặn cuối nếu một ngày nào đó `escapeLatex` bị lọt — không có mạng thì
   *   không thể gửi dữ liệu hồ sơ ra ngoài.
   * - `--memory`, `--cpus`: một tài liệu độc hại có thể bơm bộ nhớ hoặc quay vô hạn
   *   (`\def\x{\x\x}\x`). Không có trần thì nó lấy hết máy chủ.
   * - `--rm`: xoá container khi xong. Xem ghi chú về `name` ở trên cho trường hợp
   *   hết giờ.
   * - `--pull never`: KHÔNG tự tải ảnh. Ảnh TeX Live nặng 8,92GB; tải nó ngay giữa
   *   một request của người dùng là treo vài phút rồi hết giờ. Thiếu ảnh phải là
   *   một lỗi nói rõ ràng, và là việc của người vận hành.
   */
  private dockerArgs(name: string, work: string, spec: SandboxSpec): string[] {
    const memory = spec.limits?.memoryMb ?? DEFAULT_MEMORY_MB;
    const cpus = spec.limits?.cpus ?? DEFAULT_CPUS;

    return [
      'run',
      '--rm',
      '--name',
      name,
      '--network',
      'none',
      '--memory',
      `${memory}m`,
      '--cpus',
      String(cpus),
      '--pull',
      'never',
      '-v',
      `${work}:/work`,
      '-w',
      '/work',
      spec.image,
      ...spec.command,
    ];
  }

  private async collect(
    work: string,
    paths: string[],
  ): Promise<Record<string, Buffer>> {
    const artifacts: Record<string, Buffer> = {};

    for (const path of paths) {
      try {
        artifacts[path] = await readFile(join(work, path));
      } catch {
        // Vắng mặt là chuyện bình thường: compile hỏng thì không có PDF. Caller
        // đọc `exitCode` và quyết định, chứ ở đây không đoán thay.
      }
    }

    return artifacts;
  }

  private async forceRemove(name: string): Promise<void> {
    await this.spawn(['rm', '-f', name], AVAILABILITY_TIMEOUT_MS).catch(
      (error: unknown) =>
        this.logger.error(
          `Không xoá được container ${name}: ${messageOf(error)}`,
        ),
    );
  }

  /**
   * Gọi `docker` và thu stdout/stderr, có hạn thời gian.
   *
   * `spawn` với mảng tham số, KHÔNG dùng shell: tên file đi vào lệnh có nguồn từ
   * người dùng, và một shell ở giữa biến dấu `;` hay backtick trong tên file thành
   * lệnh chạy được.
   */
  private spawn(args: string[], timeoutMs: number): Promise<Spawned> {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', args, { shell: false });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr, timedOut });
      });
    });
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/// Phân loại theo dấu hiệu của tiến trình con, vì `docker` báo lỗi qua stderr và
/// mã thoát chứ không qua lớp lỗi.
function classify(error: unknown): SandboxErrorKind {
  const message = messageOf(error);

  // `spawn docker ENOENT` = chưa cài Docker. Thông báo về daemon = đã cài nhưng
  // chưa chạy. Hai chuyện khác nhau với người vận hành nhưng cùng một hành động
  // với người dùng, nên gộp làm một phân loại.
  if (/ENOENT/.test(message)) return 'RUNTIME_UNAVAILABLE';
  if (/daemon|pipe\/docker|cannot connect/i.test(message)) {
    return 'RUNTIME_UNAVAILABLE';
  }
  if (/no such image|manifest unknown|pull access denied/i.test(message)) {
    return 'IMAGE_MISSING';
  }
  return 'OTHER';
}
