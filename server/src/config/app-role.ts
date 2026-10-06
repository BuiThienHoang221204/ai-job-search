export type AppRole = 'api' | 'worker' | 'all';

const ROLES: readonly AppRole[] = ['api', 'worker', 'all'];

const DEFAULT_ROLE: AppRole = 'all';

/** Vai của tiến trình từ APP_ROLE; giá trị lạ thì ném lỗi thay vì đoán. */
export function appRole(env: NodeJS.ProcessEnv = process.env): AppRole {
  const raw = env.APP_ROLE?.trim();
  if (!raw) return DEFAULT_ROLE;

  const role = raw.toLowerCase() as AppRole;
  if (!ROLES.includes(role)) {
    throw new Error(
      `APP_ROLE không hợp lệ: "${raw}". Chọn một trong: ${ROLES.join(', ')}.`,
    );
  }
  return role;
}

export function runsBackgroundWork(role: AppRole = appRole()): boolean {
  return role !== 'api';
}
