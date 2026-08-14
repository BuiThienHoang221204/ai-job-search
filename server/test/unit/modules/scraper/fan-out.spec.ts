import {
  MAX_EVALUATIONS_PER_RUN,
  MIN_COMPLETION_TO_SCORE,
  pairKey,
  planFanOut,
} from 'src/modules/scraper/fan-out.js';

const users = (...completions: number[]) =>
  completions.map((completion, index) => ({
    id: `u${index + 1}`,
    completion,
  }));

describe('planFanOut', () => {
  test('nhân mọi tin mới với mọi người dùng đủ điều kiện', () => {
    const result = planFanOut({
      newJobIds: ['j1', 'j2'],
      users: users(100, 80),
      alreadyScored: [],
    });
    expect(result.targets).toHaveLength(4);
    expect(result.dropped).toBe(0);
  });

  test('bỏ qua hồ sơ quá sơ sài', () => {
    // Chấm một hồ sơ trống chỉ tốn tiền để nhận về "không đủ dữ liệu".
    const result = planFanOut({
      newJobIds: ['j1'],
      users: users(100, MIN_COMPLETION_TO_SCORE - 1, 0),
      alreadyScored: [],
    });
    expect(result.targets).toEqual([{ userId: 'u1', jobId: 'j1' }]);
    expect(result.skippedThinProfiles).toBe(2);
  });

  test('đúng ngưỡng thì vẫn được chấm', () => {
    const result = planFanOut({
      newJobIds: ['j1'],
      users: users(MIN_COMPLETION_TO_SCORE),
      alreadyScored: [],
    });
    expect(result.targets).toHaveLength(1);
  });

  test('không chấm lại cặp đã có kết quả', () => {
    const result = planFanOut({
      newJobIds: ['j1', 'j2'],
      users: users(100, 100),
      alreadyScored: [pairKey('u1', 'j1'), pairKey('u2', 'j2')],
    });
    expect(result.targets).toEqual([
      { userId: 'u2', jobId: 'j1' },
      { userId: 'u1', jobId: 'j2' },
    ]);
  });

  test('không có tin mới thì không sinh lượt nào', () => {
    const result = planFanOut({
      newJobIds: [],
      users: users(100, 100),
      alreadyScored: [],
    });
    expect(result.targets).toEqual([]);
  });

  test('không có người dùng nào đủ điều kiện thì không sinh lượt nào', () => {
    const result = planFanOut({
      newJobIds: ['j1'],
      users: users(0, 10),
      alreadyScored: [],
    });
    expect(result.targets).toEqual([]);
  });

  test('chạm trần thì cắt và BÁO số bị cắt', () => {
    const many = Array.from({ length: 60 }, (_, i) => `u${i}`).map((id) => ({
      id,
      completion: 100,
    }));
    const jobs = Array.from({ length: 20 }, (_, i) => `j${i}`);

    const result = planFanOut({
      newJobIds: jobs,
      users: many,
      alreadyScored: [],
    });

    expect(result.targets).toHaveLength(MAX_EVALUATIONS_PER_RUN);
    expect(result.dropped).toBe(60 * 20 - MAX_EVALUATIONS_PER_RUN);
  });

  test('khi chạm trần, mọi người đều được chấm vài tin đầu', () => {
    // Lặp ngoài theo công việc là có chủ đích: nếu lặp ngoài theo người dùng
    // thì vài người đầu được chấm hết còn người xếp sau không có gì cả.
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `u${i}`,
      completion: 100,
    }));
    const result = planFanOut({
      newJobIds: Array.from({ length: 20 }, (_, i) => `j${i}`),
      users: many,
      alreadyScored: [],
    });

    const servedUsers = new Set(result.targets.map((t) => t.userId));
    expect(servedUsers.size).toBe(60);
  });
});
