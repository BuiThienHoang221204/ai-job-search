/**
 * Kết luận của MỘT lượt Assisted Apply.
 *
 * KHÔNG có giá trị nào nghĩa là "đã nộp". Máy không bấm nút nộp — xem
 * `browser-apply.service.ts` để biết vì sao đó là quyết định thiết kế chứ không
 * phải một việc còn thiếu.
 */
export type ApplyOutcome =
  /// Tìm thấy form, đã điền được ít nhất một trường. Người dùng xem ảnh rồi tự nộp.
  | 'FILLED'
  /// Trang đòi đăng nhập. Đây là kết luận HAY GẶP NHẤT với 4 portal Việt, và nó
  /// không phải lỗi — không có cách nào tự động qua nó mà không giữ mật khẩu của
  /// người dùng.
  | 'LOGIN_WALL'
  /// Tải được trang nhưng không thấy form ứng tuyển nào.
  | 'NO_FORM'
  /// Không tải được trang: link chết, hết giờ, site chặn.
  | 'UNREACHABLE';

/// Một trường đã điền, để hiện lại cho người dùng đối chiếu.
export interface FilledField {
  /// Nhãn người dùng thấy trên trang, hoặc name/placeholder nếu không có nhãn.
  label: string;
  /// Giá trị đã điền. Với file thì là tên file, không phải nội dung.
  value: string;
}

/**
 * Một luật điền, do TypeScript sinh ra và script trong trang chỉ ÁP DỤNG.
 *
 * Tách như vậy để phần đáng kiểm nằm ở nơi kiểm được: `buildFillRules` là hàm
 * thuần có test đơn vị, còn script trong trang thì máy móc — dò chuỗi, gán giá
 * trị. Nếu để script tự suy từ `Profile` thì logic quan trọng nhất của tính năng
 * này sẽ nằm trong một template string không ai kiểm được.
 */
export interface FillRule {
  /// Nguồn của regex (không phải RegExp: nó phải đi qua JSON vào trong trang).
  match: string;
  value: string;
  /// `file` thì giá trị là đường dẫn trong container, không phải chữ để gõ.
  kind: 'text' | 'file';
}

/// Những gì script quan sát được. Chỉ dữ liệu thô — mọi kết luận rút ra ở TS.
export interface PageReport {
  reachable: boolean;
  status: number | null;
  /// Số ô nhập ĐANG HIỆN (bỏ ô ẩn: form đăng nhập ẩn, honeypot, widget khác).
  visibleInputs: number;
  /// Có ô upload file hiện ra hay không — dấu hiệu mạnh nhất của form ứng tuyển.
  hasFileInput: boolean;
  /// Trang có dấu hiệu đòi đăng nhập.
  loginHints: string[];
  filled: FilledField[];
  /// Ô nhìn thấy mà không luật nào khớp; để biết cần bổ sung luật gì.
  unmatched: string[];
  error: string | null;
}

export interface ApplyResult {
  outcome: ApplyOutcome;
  /// Câu để hiện cho người dùng, nói rõ bước tiếp theo.
  message: string;
  filled: FilledField[];
  unmatched: string[];
  /// PNG. Vắng khi ngay cả việc tải trang cũng không xong.
  screenshot?: Buffer;
}
