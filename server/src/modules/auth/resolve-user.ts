import type { AuthUser } from '@/common/types/auth-user';
import type { PrismaService } from '@/prisma/prisma.service';

/** Tra người dùng từ `sub` của token và đối chiếu `tokenVersion` (thu hồi phiên); không khớp thì null. Dùng chung cho `JwtStrategy` (access, cookie/Bearer) và `ExtAuthGuard` (ext token). */
export async function resolveAuthUser(
  prisma: PrismaService,
  sub: string,
  ver: number,
): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tokenVersion: true,
    },
  });
  if (!user || user.tokenVersion !== ver) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
