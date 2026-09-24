/** Token DI. Tiêm bằng `@Inject(SANDBOX)` chứ không bằng lớp — chỗ này có hai adapter trong lộ trình. */
export const SANDBOX = Symbol('SANDBOX');

/** Một lượt chạy trong môi trường cách ly. */
export type SandboxSpec = {
  /** Ảnh chứa công cụ cần dùng. */
  image: string;

  /** File ghi vào thư mục làm việc TRƯỚC khi chạy. Khoá là đường dẫn tương đối. */
  files: Record<string, string | Buffer>;

  /** MẢNG chứ không phải chuỗi: chuỗi phải đi qua shell để tách, mà tên file thì do người dùng đặt. */
  command: string[];

  timeoutMs: number;

  /** File cần lấy ra sau khi chạy. Thiếu file nào thì file đó vắng trong kết quả, không phải lỗi — caller quyết định. */
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

/** `kind` là thứ caller đọc để chọn câu báo cho người dùng — xem `sandboxReason`. */
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
  /** Ném `SandboxError` khi không chạy được; lượt chạy XONG mà công cụ báo lỗi thì trả `exitCode` khác 0. */
  run(spec: SandboxSpec): Promise<SandboxResult>;

  /** Cho `/ready` và để giao diện nói trước "máy chủ chưa cấu hình được PDF" thay vì để người dùng bấm rồi mới hỏng. */
  available(): Promise<boolean>;
}
