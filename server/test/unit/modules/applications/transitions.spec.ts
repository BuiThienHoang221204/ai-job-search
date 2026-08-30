import {
  ALL_STATUSES,
  FINAL_STATUSES,
  OPEN_STATUSES,
  checkTransition,
  groupOf,
  isFinal,
  statusesOfGroup,
  timestampsFor,
  type StatusGroup,
  type TransitionRequest,
} from 'src/modules/applications/transitions.js';

const move = (
  overrides: Partial<TransitionRequest> &
    Pick<TransitionRequest, 'from' | 'to'>,
): TransitionRequest => ({
  actor: 'user',
  ...overrides,
});

describe('isFinal / groupOf', () => {
  test('hai trạng thái mở không phải trạng thái cuối', () => {
    for (const status of OPEN_STATUSES) expect(isFinal(status)).toBe(false);
  });

  test('trạng thái đã huỷ là trạng thái cuối', () => {
    for (const status of FINAL_STATUSES) expect(isFinal(status)).toBe(true);
  });

  test('hai danh sách không chồng nhau và phủ hết enum', () => {
    const all = [...OPEN_STATUSES, ...FINAL_STATUSES];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(3);
  });

  test('xem và nộp cùng nhóm mở, huỷ thuộc nhóm đóng', () => {
    expect(groupOf('VIEWED')).toBe('open');
    expect(groupOf('APPLIED')).toBe('open');
    expect(groupOf('WITHDRAWN')).toBe('closed');
  });
});

describe('checkTransition', () => {
  test('mọi đường đi giữa ba trạng thái đều hợp lệ với người dùng', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (from === to) continue;
        expect(checkTransition(move({ from, to })).ok).toBe(true);
      }
    }
  });

  test('chuyển sang chính trạng thái đang có thì bị chặn', () => {
    expect(checkTransition(move({ from: 'APPLIED', to: 'APPLIED' })).ok).toBe(
      false,
    );
  });

  test('worker không mở lại được đơn đã huỷ', () => {
    expect(
      checkTransition(
        move({ from: 'WITHDRAWN', to: 'APPLIED', actor: 'system' }),
      ).ok,
    ).toBe(false);
  });

  test('người dùng thì mở lại được', () => {
    // Huỷ nhầm rồi nộp lại là chuyện thường; chặn ở đây chỉ đẩy người dùng sang
    // việc tạo đơn thứ hai cho cùng một tin, mà ràng buộc trùng đơn sẽ chặn.
    expect(
      checkTransition(move({ from: 'WITHDRAWN', to: 'APPLIED', actor: 'user' }))
        .ok,
    ).toBe(true);
  });

  test('hệ thống vẫn được đánh dấu huỷ một đơn còn mở', () => {
    expect(
      checkTransition(
        move({ from: 'APPLIED', to: 'WITHDRAWN', actor: 'system' }),
      ).ok,
    ).toBe(true);
  });
});

describe('timestampsFor', () => {
  const now = new Date('2026-08-09T10:00:00Z');
  const earlier = new Date('2026-08-01T10:00:00Z');

  test('đặt appliedAt ở lần chuyển sang APPLIED đầu tiên', () => {
    const result = timestampsFor(
      'APPLIED',
      { appliedAt: null, closedAt: null },
      now,
    );
    expect(result.appliedAt).toBe(now);
  });

  test('KHÔNG ghi đè appliedAt đã có', () => {
    // Ngày nộp gốc là mốc đếm "im lặng bao nhiêu ngày"; ghi đè là mất mốc đó.
    const result = timestampsFor(
      'APPLIED',
      { appliedAt: earlier, closedAt: null },
      now,
    );
    expect(result.appliedAt).toBe(earlier);
  });

  test('đặt closedAt khi chuyển sang trạng thái cuối', () => {
    for (const status of FINAL_STATUSES) {
      expect(
        timestampsFor(status, { appliedAt: earlier, closedAt: null }, now)
          .closedAt,
      ).toBe(now);
    }
  });

  test('xóa closedAt khi mở lại đơn', () => {
    const result = timestampsFor(
      'APPLIED',
      { appliedAt: earlier, closedAt: earlier },
      now,
    );
    expect(result.closedAt).toBeNull();
    expect(result.appliedAt).toBe(earlier);
  });
});

/// `statusesOfGroup` là đường lọc ở tầng SQL của màn Lịch sử ứng tuyển, còn
/// `groupOf` là đường đếm. Hai đường phải nói cùng một điều: trước đây danh
/// sách được lọc trong bộ nhớ bằng chính `groupOf` nên không thể lệch, giờ thì
/// có thể.
describe('statusesOfGroup', () => {
  const GROUPS: StatusGroup[] = ['open', 'closed'];

  test('mỗi nhóm chỉ chứa trạng thái mà groupOf xếp vào đúng nhóm đó', () => {
    for (const group of GROUPS) {
      for (const status of statusesOfGroup(group)) {
        expect(groupOf(status)).toBe(group);
      }
    }
  });

  test('hai nhóm cộng lại phủ hết enum, không sót không trùng', () => {
    const collected = GROUPS.flatMap(statusesOfGroup);

    expect(collected.sort()).toEqual([...ALL_STATUSES].sort());
  });

  test('không nhóm nào rỗng - nhóm rỗng nghĩa là một tab luôn trắng', () => {
    for (const group of GROUPS) {
      expect(statusesOfGroup(group).length).toBeGreaterThan(0);
    }
  });
});
