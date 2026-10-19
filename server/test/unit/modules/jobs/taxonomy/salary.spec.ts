import { parseSalary } from 'src/modules/jobs/taxonomy/salary.js';

const M = 1_000_000;

describe('parseSalary', () => {
  test.each([
    ['10 triệu - 15 triệu', 10 * M, 15 * M],
    ['10 - 15 Triệu VND', 10 * M, 15 * M],
    ['15tr-20tr ₫/tháng', 15 * M, 20 * M],
    ['10.000.000 VND to 15.000.000 VND', 10 * M, 15 * M],
    ['8 - 12 triệu / tháng', 8 * M, 12 * M],
    ['15-20m VND/month, depending on experience', 15 * M, 20 * M],
    ['12tr5-15tr', 12 * M, 15 * M],
    ['8.000.000đ - 10.000.000đ/tháng', 8 * M, 10 * M],
    ['Từ 8 triệu đến 12 triệu VND', 8 * M, 12 * M],
    ['30 triệu', 30 * M, 30 * M],
  ])('đọc khoảng lương "%s"', (raw, min, max) => {
    expect(parseSalary(raw)).toEqual({
      salaryMin: min,
      salaryMax: max,
      currency: 'VND',
    });
  });

  test.each([
    ['Tới 30tr ₫/tháng', null, 30 * M],
    ['Lên đến 25 triệu VND', null, 25 * M],
    ['Up to 40.000.000 VND', null, 40 * M],
    ['Trên 20 triệu', 20 * M, null],
    ['Từ 15tr ₫/tháng', 15 * M, null],
    ['From 12.000.000 VND', 12 * M, null],
  ])('chỉ có một đầu "%s"', (raw, min, max) => {
    expect(parseSalary(raw)).toEqual({
      salaryMin: min,
      salaryMax: max,
      currency: 'VND',
    });
  });

  test.each([
    [null],
    ['Thoả thuận'],
    ['$ 500-1,000 /tháng'],
    ['1000 USD'],
    ['200 - 300 nghìn/tuần'],
    ['5 triệu/tuần'],
    ['10 - 15'],
  ])('bỏ trống khi không phải lương VND theo tháng: %s', (raw) => {
    expect(parseSalary(raw)).toEqual({
      salaryMin: null,
      salaryMax: null,
      currency: null,
    });
  });
});
