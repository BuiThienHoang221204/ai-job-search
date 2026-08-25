export const SANDBOX = Symbol('SANDBOX');

/** Một lượt chạy trong môi trường cách ly. */
export type SandboxSpec = {
  /** Ảnh chứa công cụ cần dùng. */
  image: string;

  /** File ghi vào thư mục làm việc TRƯỚC khi chạy. Khoá là đường dẫn tương đối. */
  files: Record<string, string | Buffer>;

  /**
   * Lệnh và tham số. Là mảng chứ không phải chuỗi: một chuỗi sẽ phải đi qua shell
   * để tách, và tên file do người dùng đặt là đầu vào không tin cậy.
   */
  command: string[];

  timeoutMs: number;

  /**
   * Đường dẫn tương đối của những file cần lấy ra sau khi chạy. Thiếu file nào
   * thì file đó vắng trong kết quả, không phải lỗi — caller quyết định.
   */
  artifacts: string[];

  /** Có cho lượt chạy ra mạng hay không. **Mặc định là KHÔNG.** */
  network?: 'none' | 'egress';

  limits?: {
    memoryMb?: number;
    cpus?: number;
  };
};

export type SandboxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Chỉ chứa những artifact thực sự tồn tại sau khi chạy. */
  artifacts: Record<string, Buffer>;
};

export type SandboxErrorKind =
  /** Vượt `timeoutMs`. Container đã bị xoá. */
  | 'TIMEOUT'
  /** Không gọi được runtime: chưa cài Docker, daemon chưa chạy, không có quyền. */
  | 'RUNTIME_UNAVAILABLE'
  /** Không tải được ảnh. */
  | 'IMAGE_MISSING'
  | 'OTHER';

export class SandboxError extends Error {
  constructor(
    readonly kind: SandboxErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

/** SEAM 2 — chạy việc nặng, do dữ liệu ngoài điều khiển, trong môi trường cách ly. */
export interface SandboxRunner {
  run(spec: SandboxSpec): Promise<SandboxResult>;

  /**
   * Runtime có dùng được hay không. Dùng cho `/ready` và để giao diện nói trước
   * "máy chủ chưa cấu hình được PDF" thay vì để người dùng bấm rồi mới hỏng.
   */
  available(): Promise<boolean>;
}
