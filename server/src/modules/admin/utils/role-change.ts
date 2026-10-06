export type Role = 'USER' | 'ADMIN';

export function roleChangeBlocker(input: {
  actorId: string;
  targetId: string;
  currentRole: Role;
  nextRole: Role;
  adminCount: number;
}): string | null {
  if (input.currentRole === input.nextRole) return null;
  if (input.nextRole === 'ADMIN') return null;
  if (input.actorId === input.targetId) {
    return 'Không thể tự hạ quyền chính mình. Nhờ một quản trị viên khác làm việc này.';
  }
  if (input.adminCount <= 1) {
    return 'Đây là quản trị viên cuối cùng; hạ quyền sẽ không còn ai vào được trang quản trị.';
  }
  return null;
}
