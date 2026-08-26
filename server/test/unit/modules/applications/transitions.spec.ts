import type { ApplicationStatus } from 'src/generated/prisma/enums.js';
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
  hadOffer: false,
  ...overrides,
});

describe('isFinal / groupOf', () => {
  test('bốn trạng thái mở không phải trạng thái cuối', () => {
    for (const status of OPEN_STATUSES) expect(isFinal(status)).toBe(false);
  });

  test('sáu trạng thái đóng đều là trạng thái cuối', () => {
    for (const status of FINAL_STATUSES) expect(isFinal(status)).toBe(true);
  });

  test('hai danh sách không chồng nhau và phủ hết enum', () => {
    const all = [...OPEN_STATUSES, ...FINAL_STATUSES];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(11);
  });

  test('mọi trạng thái đã đóng gộp chung một nhóm', () => {
    // Người dùng không cần 6 tab để xem những đơn đã hết chuyện.
    for (const status of FINAL_STATUSES) expect(groupOf(status)).toBe('closed');
  });

  test('phỏng vấn và offer tách riêng khỏi nhóm mở', () => {
    expect(groupOf('RANKED')).toBe('open');
    expect(groupOf('APPLIED')).toBe('open');
    expect(groupOf('INTERVIEW')).toBe('interview');
    expect(groupOf('OFFER')).toBe('offer');
  });
});

describe('checkTransition — quyết định của người dùng', () => {
  test('hệ thống KHÔNG được tự đặt HIRED', () => {
    const result = checkTransition(
      move({ from: 'OFFER', to: 'HIRED', actor: 'system', hadOffer: true }),
    );
    expect(result.ok).toBe(false);
  });

  test('hệ thống KHÔNG được tự đặt OFFER_DECLINED', () => {
    const result = checkTransition(
      move({
        from: 'OFFER',
        to: 'OFFER_DECLINED',
        actor: 'system',
        hadOffer: true,
      }),
    );
    expect(result.ok).toBe(false);
  });

  test('người dùng thì đặt được cả hai', () => {
    for (const to of ['HIRED', 'OFFER_DECLINED'] as ApplicationStatus[]) {
      expect(
        checkTransition(
          move({ from: 'OFFER', to, actor: 'user', hadOffer: true }),
        ).ok,
      ).toBe(true);
    }
  });

  test('hệ thống VẪN được đặt các trạng thái đóng khác', () => {
    // Từ chối và im lặng thì suy ra từ email được; nhận việc thì không.
    for (const to of [
      'REJECTED',
      'NO_RESPONSE',
      'EXPIRED',
    ] as ApplicationStatus[]) {
      expect(
        checkTransition(move({ from: 'APPLIED', to, actor: 'system' })).ok,
      ).toBe(true);
    }
  });
});

describe('checkTransition — không thể nhận lời mời chưa từng có', () => {
  test('chặn HIRED khi đơn chưa từng ở OFFER', () => {
    const result = checkTransition(
      move({ from: 'INTERVIEW', to: 'HIRED', hadOffer: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('OFFER');
  });

  test('chặn OFFER_DECLINED khi đơn chưa từng ở OFFER', () => {
    expect(
      checkTransition(move({ from: 'APPLIED', to: 'OFFER_DECLINED' })).ok,
    ).toBe(false);
  });

  test('cho phép khi đơn từng ở OFFER dù hiện không ở đó', () => {
    // OFFER -> INTERVIEW (thêm một vòng) -> HIRED là đường đi có thật, nên
    // không thể chỉ nhìn trạng thái hiện tại.
    expect(
      checkTransition(move({ from: 'INTERVIEW', to: 'HIRED', hadOffer: true }))
        .ok,
    ).toBe(true);
  });
});

describe('checkTransition — đơn đã đóng', () => {
  test('worker không mở lại được đơn đã đóng', () => {
    expect(
      checkTransition(
        move({ from: 'REJECTED', to: 'INTERVIEW', actor: 'system' }),
      ).ok,
    ).toBe(false);
  });

  test('người dùng thì mở lại được', () => {
    // Nhà tuyển dụng gọi lại sau khi đã từ chối là chuyện có thật.
    expect(
      checkTransition(
        move({ from: 'REJECTED', to: 'INTERVIEW', actor: 'user' }),
      ).ok,
    ).toBe(true);
  });

  test('chuyển sang chính trạng thái đang có thì bị chặn', () => {
    expect(checkTransition(move({ from: 'APPLIED', to: 'APPLIED' })).ok).toBe(
      false,
    );
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
      'INTERVIEW',
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
  const GROUPS: StatusGroup[] = ['open', 'interview', 'offer', 'closed'];

  test('mỗi nhóm chỉ chứa trạng thái mà groupOf xếp vào đúng nhóm đó', () => {
    for (const group of GROUPS) {
      for (const status of statusesOfGroup(group)) {
        expect(groupOf(status)).toBe(group);
      }
    }
  });

  test('bốn nhóm cộng lại phủ hết enum, không sót không trùng', () => {
    const collected = GROUPS.flatMap(statusesOfGroup);

    expect(collected.sort()).toEqual([...ALL_STATUSES].sort());
  });

  test('không nhóm nào rỗng - nhóm rỗng nghĩa là một tab luôn trắng', () => {
    for (const group of GROUPS) {
      expect(statusesOfGroup(group).length).toBeGreaterThan(0);
    }
  });
});
