import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Ba mức chặt hơn trần chung, gom một chỗ để các con số có lý do đi kèm thay vì
 * rải rác trong từng controller.
 *
 * Trần chung (`configuration.ts`) là lưới chặn kẻ quét. Ba mức dưới đây dành cho
 * những route mà MỘT request tốn hơn hẳn một request bình thường — tiền, thời
 * gian worker, hoặc uy tín IP của máy chủ.
 */

/**
 * Route gọi model.
 *
 * Mỗi lần bấm là một lượt gọi gateway: đo được p50 33 giây, p95 82 giây, và
 * chiếm một chỗ worker suốt thời gian đó vì hàng đợi chạy tuần tự. 10 lần mỗi
 * phút đã rộng hơn nhiều so với thao tác tay của một người thật.
 */
export const ThrottleAi = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE } });

/**
 * Đăng nhập và đăng ký.
 *
 * Chặn dò mật khẩu và spam tạo tài khoản. Đáng giá hơn bình thường ở đây vì mỗi
 * lần thử đều tốn một lượt băm bcrypt 12 vòng — tức là kẻ tấn công bắt máy chủ
 * làm việc nặng bằng những request rất rẻ với họ.
 */
export const ThrottleAuth = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE } });

/**
 * Quét portal.
 *
 * Chặt hơn hẳn vì cái phải bảo vệ không phải máy chủ của mình mà là **uy tín IP
 * của nó ở phía portal**. Bị ITviec hay TopCV chặn IP là mất luôn nguồn dữ liệu,
 * và đó là thứ không mua lại được bằng cách nâng cấp máy chủ. Một lượt quét vốn
 * đã mất vài phút nên 3 lượt mỗi giờ không cản trở việc dùng thật.
 */
export const ThrottleScrape = () =>
  Throttle({ default: { limit: 3, ttl: HOUR } });
