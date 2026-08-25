import type { UserRole } from '../../generated/prisma/enums.js';

/** Người dùng đã xác thực, gắn vào `request.user` cho toàn bộ vòng đời request. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
