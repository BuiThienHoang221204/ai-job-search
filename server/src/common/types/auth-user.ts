import type { UserRole } from '../../generated/prisma/enums.js';

/// Người dùng đã xác thực, gắn vào `request.user` cho toàn bộ vòng đời request.
///
/// Đặt ở `common/` chứ không ở trong `jwt.strategy.ts` vì đây là HỢP ĐỒNG giữa
/// hai phía: `JwtStrategy` (trong `modules/auth/`) là nơi dựng ra nó, còn guard,
/// decorator `@CurrentUser` và mọi controller là nơi tiêu thụ. Để type nằm cùng
/// nhà với một trong hai phía thì phía kia phải import ngược lên - đó chính là
/// lý do trước đây 10 controller phải đi xuyên qua `modules/auth/jwt.strategy.js`
/// chỉ để lấy một cái type.
///
/// `role` được TÍNH từ DB mỗi request, không lấy từ claim trong token. Ghi vai
/// trò vào token nghĩa là một tài khoản bị hạ quyền vẫn giữ quyền cũ cho đến khi
/// token hết hạn - xem `JwtStrategy.validate()`.
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
