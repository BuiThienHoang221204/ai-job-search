import {
  SandboxError,
  type SandboxErrorKind,
  type SandboxResult,
  type SandboxRunner,
  type SandboxSpec,
} from '../modules/sandbox/sandbox.interface';

export class FakeSandbox implements SandboxRunner {
  readonly calls: SandboxSpec[] = [];

  private results: SandboxResult[] = [];
  private failure: SandboxError | null = null;

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
  }
}
