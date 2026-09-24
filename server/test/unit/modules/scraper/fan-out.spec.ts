import {
  MAX_EVALUATIONS_PER_RUN,
  PER_USER_LIMIT,
  planFanOut,
} from 'src/modules/scraper/utils/fan-out.js';
import {
  MIN_COMPLETION_TO_SCORE,
  pairKey,
} from 'src/modules/matching/rules/match-write.js';

const users = (...completions: number[]) =>
  completions.map((completion, index) => ({
    id: `u${index + 1}`,
    completion,
    skills: ['devops'],
  }));

/**
 * Mọi tin khớp ĐÚNG một từ khoá, để tách tính chất hạn ngạch khỏi tính chất
 * xếp hạng. Phải khớp ít nhất một, nếu không `MIN_KEYWORD_OVERLAP` loại sạch.
 */
const jobs = (...ids: string[]) =>
  ids.map((id) => ({ id, text: 'tuyển DevOps cho dự án mới' }));

describe('planFanOut', () => {
  test('mỗi người chỉ được tối đa PER_USER_LIMIT tin', () => {
    const result = planFanOut({
      jobs: jobs('j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'),
      users: users(100),
      alreadyScored: [],
    });

    expect(result.targets).toHaveLength(PER_USER_LIMIT);
    expect(result.dropped).toBe(0);
  });

  test('hạn ngạch nhân theo NGƯỜI, không nhân theo tin', () => {
    // Đây là tính chất chặn chi phí: 20 tin × 3 người từng là 60 lượt.
    const result = planFanOut({
      jobs: jobs(...Array.from({ length: 20 }, (_, i) => `j${i}`)),
      users: users(100, 100, 100),
      alreadyScored: [],
    });

    expect(result.targets).toHaveLength(3 * PER_USER_LIMIT);
  });

  test('xếp tin khớp nhiều từ khoá lên trước', () => {
    const result = planFanOut({
      jobs: [
        { id: 'khong-khop', text: 'Tuyển kế toán tổng hợp' },
        { id: 'khop-mot', text: 'Tuyển DevOps Engineer' },
        { id: 'khop-hai', text: 'DevOps Engineer biết Kubernetes' },
      ],
      users: [{ id: 'u1', completion: 100, skills: ['DevOps', 'Kubernetes'] }],
      alreadyScored: [],
      perUserLimit: 2,
    });

    expect(result.targets.map((t) => t.jobId)).toEqual([
      'khop-hai',
      'khop-mot',
    ]);
  });

  test('bỏ qua hồ sơ quá sơ sài', () => {
    const result = planFanOut({
      jobs: jobs('j1'),
      users: users(100, MIN_COMPLETION_TO_SCORE - 1, 0),
      alreadyScored: [],
    });

    expect(result.targets).toEqual([{ userId: 'u1', jobId: 'j1' }]);
    expect(result.skippedThinProfiles).toBe(2);
  });

  test('đúng ngưỡng thì vẫn được chấm', () => {
    const result = planFanOut({
      jobs: jobs('j1'),
      users: users(MIN_COMPLETION_TO_SCORE),
      alreadyScored: [],
    });

    expect(result.targets).toHaveLength(1);
  });

  test('không chấm lại cặp đã có kết quả', () => {
    const result = planFanOut({
      jobs: jobs('j1', 'j2'),
      users: users(100, 100),
      alreadyScored: [pairKey('u1', 'j1'), pairKey('u2', 'j2')],
    });

    expect(result.targets).toEqual(
      expect.arrayContaining([
        { userId: 'u1', jobId: 'j2' },
        { userId: 'u2', jobId: 'j1' },
      ]),
    );
    expect(result.targets).toHaveLength(2);
  });

  test('không có tin mới thì không sinh lượt nào', () => {
    const result = planFanOut({
      jobs: [],
      users: users(100, 100),
      alreadyScored: [],
    });

    expect(result.targets).toEqual([]);
  });

  test('không chấm tin không dính lấy một kỹ năng nào, và BÁO số bị bỏ', () => {
    // Đây là ca của tài khoản kế toán: 3 tin IT, không tin nào chạm tới hồ sơ.
    const result = planFanOut({
      jobs: [
        { id: 'it-1', text: 'Senior Fullstack Engineer, technical excellence' },
        { id: 'it-2', text: 'Junior Software Engineer (.NET)' },
        { id: 'ke-toan', text: 'Tuyển Kế toán tổng hợp, thành thạo MISA' },
      ],
      users: [
        {
          id: 'u1',
          completion: 85,
          skills: ['Kế toán tổng hợp', 'MISA', 'Excel'],
        },
      ],
      alreadyScored: [],
    });

    expect(result.targets).toEqual([{ userId: 'u1', jobId: 'ke-toan' }]);
    expect(result.skippedNoOverlap).toBe(2);
  });

  test('không có người dùng nào đủ điều kiện thì không sinh lượt nào', () => {
    const result = planFanOut({
      jobs: jobs('j1'),
      users: users(0, 10),
      alreadyScored: [],
    });

    expect(result.targets).toEqual([]);
  });

  test('chạm trần chung thì cắt và BÁO số bị cắt', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `u${i}`,
      completion: 100,
      skills: ['devops'],
    }));

    const result = planFanOut({
      jobs: jobs(...Array.from({ length: 20 }, (_, i) => `j${i}`)),
      users: many,
      alreadyScored: [],
    });

    expect(result.targets).toHaveLength(MAX_EVALUATIONS_PER_RUN);
    expect(result.dropped).toBe(120 * PER_USER_LIMIT - MAX_EVALUATIONS_PER_RUN);
  });

  test('khi chạm trần chung, MỌI người vẫn được chấm ít nhất một tin', () => {
    // Phát theo vòng thay vì lặp hết người này tới người kia: lặp tuần tự sẽ
    // khiến những người xếp sau không có gì cả.
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `u${i}`,
      completion: 100,
      skills: ['devops'],
    }));

    const result = planFanOut({
      jobs: jobs(...Array.from({ length: 20 }, (_, i) => `j${i}`)),
      users: many,
      alreadyScored: [],
    });

    const served = new Set(result.targets.map((t) => t.userId));
    expect(served.size).toBe(120);
  });

  const overCap = () =>
    Array.from({ length: MAX_EVALUATIONS_PER_RUN + 200 }, (_, i) => ({
      id: `u${String(i).padStart(4, '0')}`,
      completion: 100,
      skills: ['devops'],
    }));

  test('vượt trần chung thì mỗi người nhiều nhất MỘT tin, dù PER_USER_LIMIT là 5', () => {
    const result = planFanOut({
      jobs: jobs(...Array.from({ length: 20 }, (_, i) => `j${i}`)),
      users: overCap(),
      alreadyScored: [],
    });

    const perUser = new Map<string, number>();
    for (const target of result.targets) {
      perUser.set(target.userId, (perUser.get(target.userId) ?? 0) + 1);
    }

    expect(Math.max(...perUser.values())).toBe(1);
    expect(PER_USER_LIMIT).toBeGreaterThan(1);
  });

  test('vượt trần chung thì đúng những người ĐỨNG ĐẦU danh sách được phục vụ', () => {
    const ordered = overCap();

    const result = planFanOut({
      jobs: jobs(...Array.from({ length: 20 }, (_, i) => `j${i}`)),
      users: ordered,
      alreadyScored: [],
    });

    const served = new Set(result.targets.map((t) => t.userId));
    const expected = ordered
      .slice(0, MAX_EVALUATIONS_PER_RUN)
      .map((user) => user.id);

    expect(served.size).toBe(MAX_EVALUATIONS_PER_RUN);
    expect([...served].sort()).toEqual(expected.sort());
  });

  test('đảo thứ tự đầu vào thì đảo luôn người được phục vụ', () => {
    const ordered = overCap();
    const reversed = [...ordered].reverse();
    const args = {
      jobs: jobs(...Array.from({ length: 20 }, (_, i) => `j${i}`)),
      alreadyScored: [],
    };

    const first = new Set(
      planFanOut({ ...args, users: ordered }).targets.map((t) => t.userId),
    );
    const second = new Set(
      planFanOut({ ...args, users: reversed }).targets.map((t) => t.userId),
    );

    const overlap = [...first].filter((id) => second.has(id));
    expect(overlap).toHaveLength(2 * MAX_EVALUATIONS_PER_RUN - ordered.length);
  });
});
