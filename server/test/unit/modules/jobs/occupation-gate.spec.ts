import {
  nearbySeniorities,
  seniorityFromYears,
} from 'src/modules/jobs/taxonomy/seniority.js';
import {
  needsOccupation,
  occupationGate,
  profileFit,
} from 'src/modules/jobs/utils/occupation-gate.js';

describe('nearbySeniorities', () => {
  test('lệch tối đa một bậc', () => {
    expect(nearbySeniorities('JUNIOR')).toEqual([
      'FRESHER',
      'JUNIOR',
      'MIDDLE',
    ]);
  });

  test('ở hai đầu thang thì không vượt ra ngoài', () => {
    expect(nearbySeniorities('INTERN')).toEqual(['INTERN', 'FRESHER']);
    expect(nearbySeniorities('LEAD')).toEqual(['SENIOR', 'LEAD']);
  });

  test('chưa rõ kinh nghiệm thì không lọc', () => {
    expect(nearbySeniorities('UNKNOWN')).toBeNull();
    expect(nearbySeniorities(null)).toBeNull();
  });
});

describe('occupationGate', () => {
  const scored = { scored: true };

  test('chỉ đúng một nhóm ngành, không kèm OTHER hay nhóm liền kề', () => {
    expect(
      occupationGate(scored, {
        occupationCode: 'IT',
        subOccupationCodes: [],
        preferredProvinces: [],
        experienceLevel: null,
      }),
    ).toEqual({ occupationCode: 'IT' });
  });

  test('có kinh nghiệm thì lọc cấp bậc ±1, tin chưa rõ cấp bậc vẫn qua', () => {
    expect(
      occupationGate(scored, {
        occupationCode: 'FINANCE',
        subOccupationCodes: [],
        preferredProvinces: [],
        experienceLevel: 'JUNIOR',
      }),
    ).toEqual({
      AND: [
        { occupationCode: 'FINANCE' },
        {
          OR: [
            { requirements: { is: null } },
            {
              requirements: {
                is: {
                  seniority: { in: ['FRESHER', 'JUNIOR', 'MIDDLE', 'UNKNOWN'] },
                },
              },
            },
          ],
        },
      ],
    });
  });

  test('hồ sơ chưa chọn ngành hoặc ngành OTHER thì không khớp tin nào', () => {
    const none = { id: { in: [] } };
    expect(occupationGate(scored, null)).toEqual(none);
    expect(
      occupationGate(scored, {
        occupationCode: 'OTHER',
        subOccupationCodes: [],
        preferredProvinces: [],
        experienceLevel: null,
      }),
    ).toEqual(none);
    expect(
      needsOccupation({
        occupationCode: null,
        subOccupationCodes: [],
        preferredProvinces: [],
        experienceLevel: null,
      }),
    ).toBe(true);
  });

  test('không phải trang việc làm phù hợp thì không có cổng', () => {
    expect(
      occupationGate(
        {},
        {
          occupationCode: 'IT',
          subOccupationCodes: [],
          preferredProvinces: [],
          experienceLevel: 'JUNIOR',
        },
      ),
    ).toBeNull();
  });
});

describe('seniorityFromYears', () => {
  test('cùng mốc với bước chọn nhanh', () => {
    expect(seniorityFromYears(0.5)).toBe('FRESHER');
    expect(seniorityFromYears(2)).toBe('JUNIOR');
    expect(seniorityFromYears(4)).toBe('MIDDLE');
    expect(seniorityFromYears(6)).toBe('SENIOR');
    expect(seniorityFromYears(10)).toBe('LEAD');
    expect(seniorityFromYears(null)).toBeNull();
  });
});

describe('profileFit', () => {
  test('cấp bậc người dùng tự chọn được ưu tiên', () => {
    expect(
      profileFit({
        occupationCode: 'IT',
        subOccupationCodes: ['IT_BACKEND'],
        preferredProvinces: [],
        experienceLevel: 'SENIOR',
        experiences: [],
      }),
    ).toEqual({
      occupationCode: 'IT',
      subOccupationCodes: ['IT_BACKEND'],
      preferredProvinces: [],
      experienceLevel: 'SENIOR',
    });
  });

  test('chưa chọn cấp bậc thì suy từ kinh nghiệm trong CV', () => {
    const experiences = [{ period: 'Jan 2020 - Jan 2022' }];
    expect(
      profileFit({
        occupationCode: 'IT',
        subOccupationCodes: [],
        preferredProvinces: [],
        experienceLevel: 'UNKNOWN',
        experiences,
      })?.experienceLevel,
    ).toBe('JUNIOR');
  });
});
