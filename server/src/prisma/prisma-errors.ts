import { Prisma } from '../generated/prisma/client.js';

/// Mã lỗi Prisma mà tầng HTTP cần phân biệt.
///
/// Giữ một bản duy nhất ở đây thay vì rải chuỗi 'P2002' khắp nơi: khi cần biết
/// "còn chỗ nào đang bắt mã này nữa không", có đúng một câu trả lời.
/// Danh sách đầy đủ: https://www.prisma.io/docs/orm/reference/error-reference
export const PRISMA_ERROR = {
  /// Vi phạm ràng buộc unique.
  UNIQUE_VIOLATION: 'P2002',
  /// Khoá ngoại trỏ tới bản ghi không tồn tại.
  FOREIGN_KEY_VIOLATION: 'P2003',
  /// update/delete trên bản ghi không còn ở đó.
  RECORD_NOT_FOUND: 'P2025',
} as const;

/// Lỗi này có phải do vi phạm ràng buộc unique hay không.
///
/// Dùng để thay mẫu kiểm-tra-rồi-tạo: `findUnique` xem bản ghi đã tồn tại chưa,
/// thấy chưa thì `create`. Mẫu đó có khe race - hai request đồng thời đều đọc
/// thấy "chưa tồn tại", cùng ghi, rồi một cái vỡ ở ràng buộc DB và bật ra lỗi
/// 500 thay vì 409. Dữ liệu vẫn đúng vì ràng buộc giữ, nhưng người dùng nhận
/// sai thông báo và log bị nhiễu.
///
/// Cách đúng là để `create` chạy rồi bắt lỗi ở đây: chỉ ràng buộc DB mới phân
/// xử được ai thắng trong race, và bỏ luôn được một round-trip đọc.
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_ERROR.UNIQUE_VIOLATION
  );
}
