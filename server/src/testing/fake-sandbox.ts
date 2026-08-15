import {
  SandboxError,
  type SandboxErrorKind,
  type SandboxResult,
  type SandboxRunner,
  type SandboxSpec,
} from '../modules/sandbox/sandbox.interface.js';

/** Bản giả của SEAM 2. */
export class FakeSandbox implements SandboxRunner {
  /**
   * Mọi spec đã nhận, theo thứ tự. Dùng để khẳng định cả những thứ caller phải
   * truyền đúng — cắt mạng, tắt shell escape, timeout.
   */
  readonly calls: SandboxSpec[] = [];

  private results: SandboxResult[] = [];
  private failure: SandboxError | null = null;
  private isAvailable = true;

  willReturn(result: Partial<SandboxResult>): this {
    this.results.push({
      exitCode: 0,
      stdout: '',
      stderr: '',
      artifacts: {},
      ...result,
    });
    return this;
  }

  willFail(kind: SandboxErrorKind, message = 'lỗi dựng sẵn'): this {
    this.failure = new SandboxError(kind, message);
    return this;
  }

  setAvailable(value: boolean): this {
    this.isAvailable = value;
    return this;
  }

  available(): Promise<boolean> {
    return Promise.resolve(this.isAvailable);
  }

  async run(spec: SandboxSpec): Promise<SandboxResult> {
    this.calls.push(spec);
    await Promise.resolve();

    if (this.failure) throw this.failure;

    const next = this.results.shift();
    if (!next) {
      throw new Error(
        `FakeSandbox: chưa xếp kết quả nào cho lượt chạy thứ ${this.calls.length} (image ${spec.image}).`,
      );
    }
    return next;
  }

  reset(): void {
    this.calls.length = 0;
    this.results = [];
    this.failure = null;
    this.isAvailable = true;
  }
}
