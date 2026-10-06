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
} from './sandbox.interface';
import { messageOf } from '@/common/error-message';

const AVAILABILITY_TIMEOUT_MS = 5_000;

const DEFAULT_MEMORY_MB = 512;
const DEFAULT_CPUS = 1;

type Spawned = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

/** Phân loại lỗi theo stderr và mã thoát của `docker`, không theo lớp lỗi. */
function classify(error: unknown): SandboxErrorKind {
  const message = messageOf(error);

  if (/ENOENT/.test(message)) return 'RUNTIME_UNAVAILABLE';
  if (/daemon|pipe\/docker|cannot connect/i.test(message)) {
    return 'RUNTIME_UNAVAILABLE';
  }
  if (/no such image|manifest unknown|pull access denied/i.test(message)) {
    return 'IMAGE_MISSING';
  }
  return 'OTHER';
}

export function dockerArgs(
  name: string,
  work: string,
  spec: SandboxSpec,
): string[] {
  const memory = spec.limits?.memoryMb ?? DEFAULT_MEMORY_MB;
  const cpus = spec.limits?.cpus ?? DEFAULT_CPUS;

  return [
    'run',
    '--rm',
    '--name',
    name,
    '--network',
    spec.network === 'egress' ? 'bridge' : 'none',
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

@Injectable()
export class DockerSandbox implements SandboxRunner {
  private readonly logger = new Logger(DockerSandbox.name);

  /** Hỏi `docker version` để chạm tới daemon, không chỉ kiểm có file thực thi. */
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

  /** Ghi file vào thư mục tạm, chạy container, lấy artifact rồi dọn sạch dù hỏng hay không. */
  async run(spec: SandboxSpec): Promise<SandboxResult> {
    const work = await mkdtemp(join(tmpdir(), 'aijob-sandbox-'));
    const name = `aijob-${randomUUID()}`;

    try {
      for (const [path, content] of Object.entries(spec.files)) {
        const target = join(work, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }

      const result = await this.spawn(
        dockerArgs(name, work, spec),
        spec.timeoutMs,
      );

      if (result.timedOut) {
        await this.forceRemove(name);
        throw new SandboxError(
          'TIMEOUT',
          `Lượt chạy vượt ${spec.timeoutMs}ms và đã bị huỷ`,
        );
      }

      if (result.code !== 0 && !result.stdout && result.stderr) {
        const errorKind = classify(result.stderr);
        if (errorKind !== 'OTHER') {
          throw new SandboxError(errorKind, result.stderr.trim());
        }
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
      await rm(work, { recursive: true, force: true, maxRetries: 3 }).catch(
        (error: unknown) =>
          this.logger.warn(`Không dọn được ${work}: ${messageOf(error)}`),
      );
    }
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
        // Thiếu artifact là bình thường khi compile hỏng; caller quyết định.
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

  /** Gọi `docker` có hạn thời gian; `shell: false` để tham số không bị shell diễn giải lại. */
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
