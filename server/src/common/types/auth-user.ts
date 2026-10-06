import type { UserRole } from '@/generated/prisma/enums';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
