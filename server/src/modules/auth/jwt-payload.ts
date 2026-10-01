export type TokenType = 'access' | 'refresh';

export type JwtPayload = {
  sub: string;
  email: string;
  /** Access/refresh ký cùng bí mật, nên đây là trường DUY NHẤT phân biệt hai loại - phải kiểm ở cả hai đầu. */
  typ: TokenType;
  /** Ảnh chụp `users.tokenVersion` lúc phát token. Lệch nghĩa là đã bị thu hồi. */
  ver: number;
};

const hasShape = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Thu hẹp kiểu từng bước thay vì ép kiểu: `jwt.verify` trả `any`, ép kiểu thì `payload.ver` thiếu sẽ thành `undefined` và so sánh với `tokenVersion` lặng lẽ sai. */
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
