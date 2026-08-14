import type { Profile } from 'src/generated/prisma/client.js';
import {
  SCORED_FIELDS,
  completionPercent,
  missingFields,
} from 'src/modules/profile/completion.js';

/// Hồ sơ trống hoàn toàn: mọi trường tính điểm đều chưa điền.
const emptyProfile = (): Profile =>
  ({
    primarySkills: [],
    secondarySkills: [],
    directExperienceDomains: [],
    careerGoals: [],
    energizingTasks: [],
    targetSectors: [],
    headline: null,
    location: null,
    country: null,
    citizenship: null,
    summary: null,
    experiences: null,
    educations: null,
  }) as unknown as Profile;

const fullProfile = (): Profile =>
  ({
    primarySkills: ['React'],
    secondarySkills: ['Node.js'],
    directExperienceDomains: ['Fintech'],
    careerGoals: ['Tech Lead'],
    energizingTasks: ['Tối ưu hiệu năng'],
    targetSectors: ['Công nghệ'],
    headline: 'Senior Frontend Engineer',
    location: 'TP. Hồ Chí Minh',
    country: 'Việt Nam',
    citizenship: 'Việt Nam',
    summary: '5 năm kinh nghiệm.',
    experiences: [{ company: 'Tiki' }],
    educations: [{ school: 'BK' }],
  }) as unknown as Profile;

describe('completionPercent', () => {
  test('hồ sơ trống cho 0%', () => {
    expect(completionPercent(emptyProfile())).toBe(0);
  });

  test('hồ sơ đầy đủ cho 100%', () => {
    expect(completionPercent(fullProfile())).toBe(100);
  });

  test('hồ sơ null cho 0%', () => {
    expect(completionPercent(null)).toBe(0);
  });

  test('điền một nửa cho khoảng 50%', () => {
    const half = { ...fullProfile() } as Record<string, unknown>;
    for (const field of SCORED_FIELDS.slice(
      0,
      Math.floor(SCORED_FIELDS.length / 2),
    )) {
      half[field.key] = Array.isArray(half[field.key]) ? [] : null;
    }
    const percent = completionPercent(half as unknown as Profile);
    expect(percent).toBeGreaterThan(40);
    expect(percent).toBeLessThan(60);
  });
});

describe('mảng rỗng và chuỗi trắng tính là chưa điền', () => {
  test('mảng rỗng không tính là đã điền', () => {
    const profile = {
      ...fullProfile(),
      primarySkills: [],
    } as unknown as Profile;
    expect(missingFields(profile)).toContain('Kỹ năng chính');
  });

  test('chuỗi toàn khoảng trắng không tính là đã điền', () => {
    const profile = { ...fullProfile(), headline: '   ' } as unknown as Profile;
    expect(missingFields(profile)).toContain('Chức danh');
  });
});

describe('missingFields', () => {
  test('hồ sơ null trả về toàn bộ nhãn', () => {
    expect(missingFields(null)).toHaveLength(SCORED_FIELDS.length);
  });

  test('trả về nhãn tiếng Việt chứ không phải tên cột', () => {
    const labels = missingFields(emptyProfile());
    expect(labels).toContain('Kỹ năng chính');
    expect(labels).not.toContain('primarySkills');
  });

  test('giữ đúng thứ tự ưu tiên - kỹ năng chính đứng đầu', () => {
    // Thứ tự quyết định người dùng được nhắc điền gì trước, nên nó là hợp đồng
    // chứ không phải chi tiết triển khai.
    expect(missingFields(emptyProfile())[0]).toBe('Kỹ năng chính');
  });

  test('hồ sơ đầy đủ không thiếu gì', () => {
    expect(missingFields(fullProfile())).toEqual([]);
  });
});
