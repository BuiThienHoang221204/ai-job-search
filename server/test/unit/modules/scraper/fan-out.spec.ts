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

/**
 * Mọi tin khớp ĐÚNG một từ khoá, để tách tính chất hạn ngạch khỏi tính chất
 * xếp hạng. Phải khớp ít nhất một, nếu không `MIN_KEYWORD_OVERLAP` loại sạch.
 */
const jobs = (...ids: string[]) =>
  ids.map((id) => ({ id, text: 'tuyển DevOps cho dự án mới' }));

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

  /*
   * Hai ca này là lý do hàm được viết lại. Khớp chuỗi con từng cho `Excel` dính
   * vào "technical excellence" và `SAP` dính vào tên toà nhà "Sapphire" - mà
   * mọi tin IT tiếng Anh đều có chữ "excellence", nên MỌI hồ sơ phi-IT có khai
   * Excel đều bị ghép với chúng rồi tốn một lượt gọi model cho từng cặp.
   */
  test('không khớp khi từ khoá chỉ là một phần của từ khác', () => {
    expect(keywordOverlap('technical excellence and impact', ['Excel'])).toBe(
      0,
    );
    expect(keywordOverlap('- Excellent problem-solving', ['Excel'])).toBe(0);
    expect(keywordOverlap('Podium Floor, Sapphire 2 tower', ['SAP'])).toBe(0);
  });

  test('vẫn khớp khi từ khoá đứng thành một từ trọn vẹn', () => {
    expect(keywordOverlap('Thành thạo Excel, MISA', ['Excel'])).toBe(1);
    expect(keywordOverlap('Kinh nghiệm SAP B1', ['SAP'])).toBe(1);
    expect(keywordOverlap('báo cáo trên excel.', ['Excel'])).toBe(1);
  });

  test('không cắt nhầm từ khoá có ký tự đặc biệt', () => {
    // `\b` của JS đặt biên sai ở những từ khoá này, nên biên phải tự dựng.
    expect(keywordOverlap('Backend C++ và C#', ['C++', 'C#'])).toBe(2);
    expect(keywordOverlap('Xây dựng ASP.NET Core', ['.NET'])).toBe(1);
    expect(keywordOverlap('Node.js + React.js', ['Node.js'])).toBe(1);
  });

  test('khớp được tiếng Việt có dấu', () => {
    const text = 'Tuyển Kế toán tổng hợp, làm báo cáo thuế hàng quý';
    expect(keywordOverlap(text, ['Kế toán tổng hợp', 'Báo cáo thuế'])).toBe(2);
    expect(keywordOverlap(text, ['Kế toán trưởng'])).toBe(0);
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
});
