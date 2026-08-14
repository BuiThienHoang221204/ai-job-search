export const SANDBOX = Symbol('SANDBOX');

/**
 * Một lượt chạy trong môi trường cách ly.
 *
 * Caller khai **cái gì cần chạy**, không khai **chạy bằng gì**: không có tham số
 * nào của Docker trong hình dạng này. Đó là điểm chính của seam — `latex-compile`
 * không được biết Docker tồn tại, nếu không thì đổi sang một cách chạy khác
 * (Firecracker, một dịch vụ ngoài, hay chạy trực tiếp trên máy trong môi trường
 * dev) sẽ phải sửa cả caller.
 */
export type SandboxSpec = {
  /// Ảnh chứa công cụ cần dùng.
  image: string;

  /// File ghi vào thư mục làm việc TRƯỚC khi chạy. Khoá là đường dẫn tương đối.
  files: Record<string, string | Buffer>;

  /// Lệnh và tham số. Là mảng chứ không phải chuỗi: một chuỗi sẽ phải đi qua shell
  /// để tách, và tên file do người dùng đặt là đầu vào không tin cậy.
  command: string[];

  timeoutMs: number;

  /// Đường dẫn tương đối của những file cần lấy ra sau khi chạy. Thiếu file nào
  /// thì file đó vắng trong kết quả, không phải lỗi — caller quyết định.
  artifacts: string[];

  limits?: {
    memoryMb?: number;
    cpus?: number;
  };
};

export type SandboxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  /// Chỉ chứa những artifact thực sự tồn tại sau khi chạy.
  artifacts: Record<string, Buffer>;
};

export type SandboxErrorKind =
  /// Vượt `timeoutMs`. Container đã bị xoá.
  | 'TIMEOUT'
  /// Không gọi được runtime: chưa cài Docker, daemon chưa chạy, không có quyền.
  | 'RUNTIME_UNAVAILABLE'
  /// Không tải được ảnh.
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

/**
 * SEAM 2 — chạy việc nặng, do dữ liệu ngoài điều khiển, trong môi trường cách ly.
 *
 * Hai adapter dùng seam này, và chúng cần **cùng một năng lực hệ thống** dù trông
 * không liên quan: compile LaTeX ra PDF, và Assisted Apply mở trình duyệt điền form.
 * Cả hai đều là "đưa file vào, chạy một lệnh có hạn thời gian, lấy artifact ra, dọn
 * sạch". Làm rời rạc thì có hai đoạn code chỉ dùng được một lần.
 *
 * Những gì seam này ẩn đi — và đây là phần đáng giá, không phải phần `run()`:
 * vòng đời container, giết khi quá hạn **kèm xoá container** (bỏ sót bước xoá là
 * để lại một container giữ 512MB), giới hạn CPU/RAM, **cắt mạng**, lấy artifact,
 * dọn thư mục tạm, thu log, và phân loại lỗi.
 */
export interface SandboxRunner {
  run(spec: SandboxSpec): Promise<SandboxResult>;

  /// Runtime có dùng được hay không. Dùng cho `/ready` và để giao diện nói trước
  /// "máy chủ chưa cấu hình được PDF" thay vì để người dùng bấm rồi mới hỏng.
  available(): Promise<boolean>;
}
