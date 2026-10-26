import { salaryProfileOf } from 'src/modules/salary/utils/candidate.js';

const base = {
  sameOccupationYears: 1.8,
  totalYears: 1.8,
  profileOccupation: 'IT',
  jobOccupation: 'IT',
  currentSalary: 14_000_000,
  expectedSalary: 18_000_000,
};

describe('salaryProfileOf', () => {
  test('tin cùng ngành thì dùng số năm và lương hiện tại như hồ sơ', () => {
    expect(salaryProfileOf(base)).toEqual({
      candidateYears: 1.8,
      otherOccupationYears: null,
      currentSalary: 14_000_000,
      currentSalaryIgnored: false,
      expectedSalary: 18_000_000,
    });
  });

  test('tin khác ngành: không có năm cùng ngành thì để tin quyết mốc, lương hiện tại không nâng sàn', () => {
    expect(
      salaryProfileOf({
        ...base,
        sameOccupationYears: 0,
        jobOccupation: 'LOGISTICS',
      }),
    ).toEqual({
      candidateYears: null,
      otherOccupationYears: 1.8,
      currentSalary: null,
      currentSalaryIgnored: true,
      expectedSalary: 18_000_000,
    });
  });

  test('người chưa đi làm vẫn là 0 năm, không bị coi là khác ngành', () => {
    expect(
      salaryProfileOf({ ...base, sameOccupationYears: 0, totalYears: 0 })
        .candidateYears,
    ).toBe(0);
  });
});
