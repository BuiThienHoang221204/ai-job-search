import { profileProposalSchema } from 'src/modules/profile-sources/profile-proposal.schema.js';

/**
 * Schema này là chỗ một lượt đọc CV sống hay chết.
 *
 * Nó chạy TRÊN output của model, và một trường không khớp làm hỏng cả bản đọc —
 * người dùng mất 19 giây chờ cùng một lượt gọi model, để nhận về một lỗi. Nên
 * ranh giới "trường nào bắt buộc" phải được ghim, không để ai siết thêm mà không
 * nghĩ tới cái giá đó.
 */

/** Bản đề xuất tối thiểu, hợp lệ. Từng test chỉ đổi đúng phần nó xét. */
const base = {
  languages: [],
  primarySkills: [],
  secondarySkills: [],
  directExperienceDomains: [],
  adjacentExperience: [],
  experiences: [],
  educations: [],
  certificates: [],
  projects: [],
  missing: [],
  notes: [],
};

describe('profileProposalSchema', () => {
  /**
   * Lỗi đã xảy ra thật ngày 2026-08-23.
   *
   * CV ghi "Industrial University of Ho Chi Minh City (IUH), Software
   * Engineering, GPA 3.31/4.0" nhưng KHÔNG ghi bậc bằng. Model trả `degree: ""`
   * cho đúng sự thật, `.min(1)` chặn lại, và cả lượt đọc CV mất trắng.
   */
  it('nhận học vấn không ghi bậc bằng', () => {
    const result = profileProposalSchema.safeParse({
      ...base,
      educations: [
        {
          school: 'Industrial University of Ho Chi Minh City (IUH)',
          degree: '',
          field: 'Software Engineering',
          gpa: '3.31 / 4.0',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  /// CV một trang hoặc CV làm tự do hay bỏ mốc thời gian của từng vị trí.
  it('nhận kinh nghiệm không ghi mốc thời gian', () => {
    const result = profileProposalSchema.safeParse({
      ...base,
      experiences: [
        {
          company: 'ATOM Solution',
          position: 'Full Stack Developer',
          period: '',
          highlights: ['Xây dựng frontend bằng ReactJS và NextJS.'],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  /// Trường vắng hẳn cũng phải qua, và đọc ra chuỗi rỗng chứ không phải
  /// `undefined` — kiểu ở frontend khai `degree: string`.
  it('trường mô tả vắng hẳn thì mặc định là chuỗi rỗng', () => {
    const result = profileProposalSchema.parse({
      ...base,
      educations: [{ school: 'Đại học Bách Khoa' }],
    });

    expect(result.educations[0]).toMatchObject({ degree: '', field: '' });
  });

  /**
   * Chiều ngược lại của cùng một ranh giới.
   *
   * Nới `degree` KHÔNG có nghĩa là nới tất cả: thiếu tên trường thì cả mục học
   * vấn vô nghĩa, và từ chối mới là đúng. Test này tồn tại để lần nới tiếp theo
   * phải là một quyết định, không phải một cú trượt tay.
   */
  it('vẫn từ chối khi thiếu thứ làm nên danh tính của mục', () => {
    const noSchool = profileProposalSchema.safeParse({
      ...base,
      educations: [{ school: '', degree: 'Cử nhân' }],
    });
    const noCompany = profileProposalSchema.safeParse({
      ...base,
      experiences: [
        { company: '', position: 'Kế toán tổng hợp', highlights: [] },
      ],
    });

    expect(noSchool.success).toBe(false);
    expect(noCompany.success).toBe(false);
  });
});
