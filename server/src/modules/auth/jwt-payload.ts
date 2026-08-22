export type TokenType = 'access' | 'refresh';

export type JwtPayload = {
  sub: string;
  email: string;
  /**
   * Access và refresh token ký bằng CÙNG một bí mật, nên nếu không có trường
   * này thì hai loại hoàn toàn thay thế cho nhau: refresh token dùng làm
   * Bearer để gọi mọi API, access token đem đổi lấy token mới mãi mãi. Trường
   * này là thứ duy nhất tách chúng ra, nên nó phải được kiểm ở CẢ HAI đầu.
   */
  typ: TokenType;
  /** Ảnh chụp `users.tokenVersion` lúc phát token. Lệch nghĩa là đã bị thu hồi. */
  ver: number;
};

const hasShape = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Thu hẹp kiểu từng bước thay vì ép kiểu, vì `jwt.verify` trả `any`: payload
 * đến từ bên ngoài, và một token cũ phát trước khi có `typ`/`ver` sẽ thiếu hẳn
 * hai trường đó. Ép kiểu thì `payload.ver` là `undefined` và phép so sánh với
 * `tokenVersion` lặng lẽ cho qua sai.
 */
const isPayloadOfType = (value: unknown, typ: TokenType): value is JwtPayload =>
  hasShape(value) &&
  typeof value.sub === 'string' &&
  typeof value.email === 'string' &&
  typeof value.ver === 'number' &&
  value.typ === typ;

export const isAccessPayload = (value: unknown): value is JwtPayload =>
  isPayloadOfType(value, 'access');

export const isRefreshPayload = (value: unknown): value is JwtPayload =>
  isPayloadOfType(value, 'refresh');
