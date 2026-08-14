import {
  SandboxError,
  type SandboxErrorKind,
  type SandboxResult,
  type SandboxRunner,
  type SandboxSpec,
} from '../modules/sandbox/sandbox.interface.js';

/**
 * Bản giả của SEAM 2.
 *
 * Đây là lý do seam tồn tại: `LatexCompiler` kiểm được **không cần Docker**, không
 * cần ảnh TeX Live 8,92GB, và không mất 5 giây mỗi lần chạy test. Những nhánh đáng
 * kiểm nhất của nó cũng là những nhánh khó dựng bằng đồ thật — "exit 0 nhưng không
 * có PDF", "hết giờ", "chưa cài Docker".
 *
 * Cùng khuôn với `FakeAi`: hết dữ liệu xếp sẵn thì NÉM LỖI thay vì trả giá trị mặc
 * định, để một test quên xếp dữ liệu hỏng ngay thay vì âm thầm đi qua.
 */
export class FakeSandbox implements SandboxRunner {
  /// Mọi spec đã nhận, theo thứ tự. Dùng để khẳng định cả những thứ caller phải
  /// truyền đúng — cắt mạng, tắt shell escape, timeout.
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
    // Nhường một microtask để thứ tự bất đồng bộ giống bản thật.
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
