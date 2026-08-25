import { yearsOfExperience } from 'src/modules/profile/experience-years.js';

/** Mốc "hôm nay" cố định, để test không đổi kết quả theo ngày chạy. */
const NOW = new Date('2026-08-24T00:00:00Z');

describe('yearsOfExperience', () => {
  test('đọc được dạng tiếng Anh "Dec 2024 – Present"', () => {
    expect(
      yearsOfExperience([{ period: 'Dec 2024 – Present' }], NOW),
    ).toBeCloseTo(1.7, 1);
  });

  test('đọc được dạng tiếng Việt "12/2024 – nay"', () => {
    expect(yearsOfExperience([{ period: '12/2024 – nay' }], NOW)).toBeCloseTo(
      1.7,
      1,
    );
  });

  test('hai mốc đóng thì tính đúng khoảng giữa', () => {
    expect(yearsOfExperience([{ period: '01/2020 - 01/2023' }], NOW)).toBe(3);
  });

  test('chỉ có năm cũng đọc được', () => {
    expect(yearsOfExperience([{ period: '2018 - 2021' }], NOW)).toBe(3);
  });

  test('KHÔNG cộng hai lần quãng làm song song', () => {
    // Fulltime 2020-2023 kèm freelance 2021-2022 vẫn là 3 năm, không phải 4.
    expect(
      yearsOfExperience(
        [{ period: '01/2020 - 01/2023' }, { period: '01/2021 - 01/2022' }],
        NOW,
      ),
    ).toBe(3);
  });

  test('cộng dồn hai quãng rời nhau', () => {
    expect(
      yearsOfExperience(
        [{ period: '01/2018 - 01/2020' }, { period: '01/2022 - 01/2024' }],
        NOW,
      ),
    ).toBe(4);
  });

  test('một mục không đọc được thì trả null, KHÔNG trả số thiếu', () => {
    expect(
      yearsOfExperience(
        [{ period: '01/2020 - 01/2023' }, { period: 'khoảng 3 năm' }],
        NOW,
      ),
    ).toBeNull();
  });

  test('hồ sơ chưa có kinh nghiệm nào thì null', () => {
    expect(yearsOfExperience([], NOW)).toBeNull();
    expect(yearsOfExperience(null, NOW)).toBeNull();
  });

  test('tháng ngoài 1-12 là dữ liệu hỏng, trả null', () => {
    expect(
      yearsOfExperience([{ period: '13/2020 - 01/2023' }], NOW),
    ).toBeNull();
  });
});
