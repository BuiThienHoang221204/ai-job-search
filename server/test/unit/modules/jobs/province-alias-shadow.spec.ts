import { PROVINCES } from 'src/modules/jobs/taxonomy/provinces.js';
import {
  normalizeText,
  resolveProvince,
} from 'src/modules/jobs/taxonomy/resolve.js';

/**
 * Canh một tỉnh không nuốt mất tỉnh khác vì alias ngắn hơn.
 *
 * Đã hỏng thật: `Nghệ An` khai alias `vinh` (thành phố Vinh), và chuỗi
 * `' vinh phuc '` thì CHỨA `' vinh '`. Bản cũ duyệt `PROVINCES` theo thứ tự khai
 * báo nên Nghệ An thắng, và nuốt mất BA tỉnh: Vĩnh Phúc, Trà Vinh, Vĩnh Long.
 *
 * Lỗi này im lặng: tin bị gán sai tỉnh vẫn hiện ra, chỉ hiện cho nhầm người.
 */
describe('alias tỉnh không che nhau', () => {
  it.each([
    ['Vĩnh Phúc', 'PT'],
    ['Vinh Phuc', 'PT'],
    ['Tân Phú, Vinh Phuc', 'PT'],
    ['Trà Vinh', 'VL'],
    ['Tra Vinh', 'VL'],
    ['Vĩnh Long', 'VL'],
    ['Thành phố Vinh, Nghệ An', 'NA'],
    ['Nghệ An', 'NA'],
  ])('%s → %s', (input, expected) => {
    expect({ input, code: resolveProvince(input) }).toEqual({
      input,
      code: expected,
    });
  });

  /**
   * Mọi cách viết của cùng một thành phố phải ra cùng mã.
   *
   * Đây là thứ phép so chuỗi cũ không làm được: `checkLocation` khớp 0/520 tin
   * với 8 trong 12 hồ sơ có địa chỉ, vì hồ sơ ghi kèm quận còn tin thì mỗi
   * portal viết một kiểu.
   */
  it.each([
    [
      'HCM',
      [
        'Hồ Chí Minh',
        'Ho Chi Minh',
        'Ho Chi Minh City',
        'TP.HCM',
        'Ho Chi Minh City Metropolitan Area',
        'Quận Tân Bình, Hồ Chí Minh',
        'Bình Thạnh, Thành phố Hồ Chí Minh',
      ],
    ],
    ['HN', ['Hà Nội', 'Hanoi', 'Ha Noi', 'Cầu Giấy, Hà Nội']],
    ['DN', ['Đà Nẵng', 'Da Nang', 'Quận Hải Châu, Đà Nẵng']],
  ])('mọi cách viết của %s cùng ra một mã', (code, spellings) => {
    expect(spellings.map((value) => resolveProvince(value))).toEqual(
      spellings.map(() => code),
    );
  });

  /**
   * Chốt chặn chung: KHÔNG alias nào được là tiền tố theo TỪ của alias khác
   * thuộc tỉnh khác, trừ khi bản dài hơn vẫn thắng.
   *
   * Kiểm bằng chính `resolveProvince` chứ không đọc mảng: đó là thứ code thật
   * gọi, và nó mới là chỗ thứ tự có ý nghĩa.
   */
  it('alias dài luôn thắng alias ngắn hơn của tỉnh khác', () => {
    const sai: string[] = [];

    for (const province of PROVINCES) {
      for (const alias of [normalizeText(province.name), ...province.aliases]) {
        const got = resolveProvince(alias);
        if (got !== province.code) {
          sai.push(`"${alias}" (${province.code}) → ${got}`);
        }
      }
    }

    expect(sai).toEqual([]);
  });
});
