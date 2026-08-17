import {
  MAX_EVALUATIONS_PER_RUN,
  MIN_COMPLETION_TO_SCORE,
  PER_USER_LIMIT,
  keywordOverlap,
  pairKey,
  planFanOut,
} from 'src/modules/scraper/fan-out.js';

const users = (...completions: number[]) =>
  completions.map((completion, index) => ({
    id: `u${index + 1}`,
    completion,
    skills: ['devops'],
  }));

/** Tin không chứa từ khoá nào, để tách tính chất hạn ngạch khỏi tính chất xếp hạng. */
const jobs = (...ids: string[]) =>
  ids.map((id) => ({ id, text: 'tin tuyển dụng' }));

describe('keywordOverlap', () => {
  test('đếm số kỹ năng KHÁC NHAU xuất hiện trong tin', () => {
    const text = 'Tuyển DevOps Engineer, dùng Kubernetes và Terraform';
    expect(keywordOverlap(text, ['DevOps', 'Kubernetes', 'Terraform'])).toBe(3);
    expect(keywordOverlap(text, ['DevOps', 'React'])).toBe(1);
  });

  test('không phân biệt hoa thường và không đếm trùng', () => {
    expect(keywordOverlap('kubernetes KUBERNETES', ['Kubernetes'])).toBe(1);
    expect(keywordOverlap('Kubernetes', ['kubernetes', 'KUBERNETES'])).toBe(1);
  });

  test('bỏ qua từ khoá quá ngắn', () => {
    // Một ký tự khớp gần như mọi tin, chỉ làm nhiễu thứ hạng.
    expect(keywordOverlap('DevOps Engineer', ['a', 'e'])).toBe(0);
  });
});

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
});
