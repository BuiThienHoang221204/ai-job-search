export type TokenType = 'access' | 'refresh';

export type JwtPayload = {
  sub: string;
  email: string;
  typ: TokenType;
  ver: number;
};

const hasShape = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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
