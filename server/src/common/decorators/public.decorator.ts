import { SetMetadata } from '@nestjs/common';

/// Khoá metadata mà `@Public()` ghi vào và `JwtAuthGuard` đọc ra.
export const IS_PUBLIC_KEY = 'isPublic';

/// Mở một route cho người chưa đăng nhập.
///
/// `JwtAuthGuard` được đăng ký TOÀN CỤC trong `CommonModule`, nên mặc định mọi
/// route đều đòi token. Đó là chủ ý: thêm một controller mới mà quên gắn guard
/// thì route đó đóng, không phải mở. Chiều lỗi này quan trọng - quên bảo vệ
/// một route thì không ai báo cho biết, còn quên mở một route thì người dùng
/// nhận 401 và báo ngay.
///
/// Vì vậy danh sách route có `@Public()` cũng chính là danh sách đầy đủ những
/// gì lộ ra ngoài. Hiện chỉ có đăng ký, đăng nhập và đăng xuất.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
