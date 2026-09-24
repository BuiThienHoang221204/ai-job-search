import { roleChangeBlocker } from 'src/modules/admin/utils/role-change.js';

const base = {
  actorId: 'admin-1',
  targetId: 'user-2',
  currentRole: 'ADMIN' as const,
  nextRole: 'USER' as const,
  adminCount: 2,
};

describe('roleChangeBlocker', () => {
  test('hạ quyền một admin khác khi còn admin khác thì được', () => {
    expect(roleChangeBlocker(base)).toBeNull();
  });

  test('không cho tự hạ quyền chính mình', () => {
    expect(roleChangeBlocker({ ...base, targetId: 'admin-1' })).toMatch(
      /chính mình/,
    );
  });

  test('không cho hạ quyền admin cuối cùng', () => {
    expect(roleChangeBlocker({ ...base, adminCount: 1 })).toMatch(/cuối cùng/);
  });

  test('nâng quyền luôn được, kể cả tự nâng', () => {
    expect(
      roleChangeBlocker({
        ...base,
        targetId: 'admin-1',
        currentRole: 'USER',
        nextRole: 'ADMIN',
        adminCount: 1,
      }),
    ).toBeNull();
  });

  test('không đổi gì thì không chặn', () => {
    expect(
      roleChangeBlocker({ ...base, targetId: 'admin-1', nextRole: 'ADMIN' }),
    ).toBeNull();
  });
});
